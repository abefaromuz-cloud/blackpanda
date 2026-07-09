const express = require('express');
const pool = require('../db/pool');
const { authenticate, requirePermission } = require('../middleware/auth');
const { sendTelegramMessage } = require('../utils/telegram');
const { logActivity } = require('../utils/activityLog');
const router = express.Router();

router.get('/', authenticate, requirePermission('preorders', 'view'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT p.*, c.name AS client_name,
        COALESCE(json_agg(pi.* ) FILTER (WHERE pi.id IS NOT NULL), '[]') AS items
      FROM preorders p
      JOIN clients c ON c.id = p.client_id
      LEFT JOIN preorder_items pi ON pi.preorder_id = p.id
      GROUP BY p.id, c.name
      ORDER BY p.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

router.get('/:id', authenticate, requirePermission('preorders', 'view'), async (req, res) => {
  try {
    const [p, items] = await Promise.all([
      pool.query(`SELECT p.*, c.name AS client_name, c.telegram AS client_telegram FROM preorders p JOIN clients c ON c.id=p.client_id WHERE p.id=$1`, [req.params.id]),
      pool.query(`SELECT pi.*, l.brand, l.series FROM preorder_items pi JOIN laptops l ON l.id=pi.laptop_id WHERE pi.preorder_id=$1`, [req.params.id]),
    ]);
    if (!p.rows[0]) return res.status(404).json({ error: 'Предзаказ не найден' });
    res.json({ ...p.rows[0], items: items.rows });
  } catch (err) { res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

// Создать предзаказ. items: [{ laptop_id, qty, cost_cny, price_sell_cny }]
router.post('/', authenticate, requirePermission('preorders', 'edit'), async (req, res) => {
  const { client_id, payment_type, note, items } = req.body;
  if (!client_id || !Array.isArray(items) || !items.length)
    return res.status(400).json({ error: 'Укажите клиента и хотя бы одну позицию' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const po = await client.query(
      'INSERT INTO preorders (client_id, payment_type, note) VALUES ($1,$2,$3) RETURNING *',
      [client_id, payment_type || 'full', note || null]
    );
    for (const it of items) {
      await client.query(
        `INSERT INTO preorder_items (preorder_id, laptop_id, qty, cost_cny, price_sell_cny)
         VALUES ($1,$2,$3,$4,$5)`,
        [po.rows[0].id, it.laptop_id, it.qty || 1, it.cost_cny || 0, it.price_sell_cny || 0]
      );
    }
    await client.query('COMMIT');
    res.status(201).json(po.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  } finally { client.release(); }
});

router.put('/:id', authenticate, requirePermission('preorders', 'edit'), async (req, res) => {
  const { stage, note } = req.body;
  try {
    const result = await pool.query(
      `UPDATE preorders SET stage=COALESCE($1,stage), note=COALESCE($2,note) WHERE id=$3 RETURNING *`,
      [stage||null, note||null, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Предзаказ не найден' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

// Передача товара клиенту по предзаказу: списывает серийники со склада, создаёт продажу,
// обновляет кассу/долг клиента и шлёт уведомление в Telegram (аналог confirmPoTransfer из старой версии)
router.post('/:id/transfer', authenticate, requirePermission('preorders', 'edit'), async (req, res) => {
  const { serials: scannedSerials, payment_mode } = req.body; // string[]
  if (!Array.isArray(scannedSerials) || !scannedSerials.length)
    return res.status(400).json({ error: 'Отсканируйте хотя бы один серийник' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const poRes = await client.query('SELECT * FROM preorders WHERE id=$1 FOR UPDATE', [req.params.id]);
    const po = poRes.rows[0];
    if (!po) throw { status: 404, message: 'Предзаказ не найден' };

    const itemsRes = await client.query('SELECT * FROM preorder_items WHERE preorder_id=$1', [po.id]);
    const poItems = itemsRes.rows;

    const settingsRes = await client.query('SELECT * FROM settings WHERE id=1');
    const settings = settingsRes.rows[0];

    // Проверяем и группируем серийники по модели
    const byLaptop = {};
    for (const sn of scannedSerials) {
      const serRes = await client.query(`SELECT * FROM serials WHERE serial=$1 AND status_id='s2'`, [sn]);
      const ser = serRes.rows[0];
      if (!ser) throw { status: 400, message: `Серийник ${sn} не найден на складе` };
      const poItem = poItems.find(it => it.laptop_id === ser.laptop_id && it.item_status !== 'transferred');
      if (!poItem) throw { status: 400, message: `Серийник ${sn}: эта модель не в предзаказе` };
      (byLaptop[ser.laptop_id] ||= { poItem, serials: [] }).serials.push(ser);
    }
    for (const lid in byLaptop) {
      if (byLaptop[lid].serials.length > byLaptop[lid].poItem.qty)
        throw { status: 400, message: 'Превышено количество по позиции предзаказа' };
    }

    let totalCny = 0, totalRub = 0;
    const sale = await client.query(
      `INSERT INTO sales (client_id, preorder_id, total_cny, total_rub, rate, payment_mode, note)
       VALUES ($1,$2,0,0,$3,$4,$5) RETURNING *`,
      [po.client_id, po.id, settings.rate, payment_mode || 'full', 'No.' + po.id.slice(-6)]
    );

    for (const lid in byLaptop) {
      const { poItem, serials } = byLaptop[lid];
      const qty = serials.length;
      const priceCny = Number(poItem.price_sell_cny) * qty;
      const priceRub = priceCny * Number(settings.rate);
      totalCny += priceCny; totalRub += priceRub;

      await client.query(
        `INSERT INTO sale_items (sale_id, laptop_id, serial_ids, qty, price_sell_cny, price_sell_rub, price_cost_cny, total_cny)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [sale.rows[0].id, lid, serials.map(s => s.id), qty, poItem.price_sell_cny, priceRub / qty, poItem.cost_cny, priceCny]
      );
      for (const ser of serials) {
        await client.query(`UPDATE serials SET status_id='s3', sale_date=now(), sale_client_id=$1 WHERE id=$2`, [po.client_id, ser.id]);
        await client.query(`INSERT INTO serial_history (serial_id, status_id, note) VALUES ($1,'s3','Передан клиенту')`, [ser.id]);
      }
      if (qty >= poItem.qty) {
        await client.query(`UPDATE preorder_items SET item_status='transferred' WHERE id=$1`, [poItem.id]);
      }
    }

    await client.query('UPDATE sales SET total_cny=$1, total_rub=$2 WHERE id=$3', [totalCny, totalRub, sale.rows[0].id]);

    if (payment_mode !== 'partial') {
      await client.query('UPDATE settings SET cash_balance_rub = cash_balance_rub + $1 WHERE id=1', [totalRub]);
      await client.query(
        `INSERT INTO cash_log (type, amount_rub, note, client_id) VALUES ('in',$1,$2,$3)`,
        [totalRub, 'No.' + po.id.slice(-6), po.client_id]
      );
    } else {
      await client.query('UPDATE clients SET debt_rub = debt_rub + $1 WHERE id=$2', [totalRub, po.client_id]);
    }

    const remainingRes = await client.query(
      `SELECT COUNT(*) FILTER (WHERE item_status <> 'transferred') AS pending FROM preorder_items WHERE preorder_id=$1`, [po.id]
    );
    const allDone = Number(remainingRes.rows[0].pending) === 0;
    if (allDone) {
      await client.query(`UPDATE preorders SET stage='done', completed_at=now() WHERE id=$1`, [po.id]);
    }

    await client.query('COMMIT');
    await logActivity(req.user, 'Передача товара по предзаказу', 'preorder', 'No.' + po.id.slice(-6));

    // Уведомление в Telegram — не блокирует ответ, если упадёт
    const clientRes = await pool.query('SELECT * FROM clients WHERE id=$1', [po.client_id]);
    const c = clientRes.rows[0];
    if (c?.telegram) {
      sendTelegramMessage(c.telegram,
        `BlackPanda\n\nВы получили товар:\nИтого: ${Math.round(totalRub).toLocaleString('ru-RU')} руб.` +
        (allDone ? '\n\nПредзаказ выполнен!' : '')
      ).catch(() => {});
    }

    res.status(201).json({ sale: sale.rows[0], allDone });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  } finally { client.release(); }
});

module.exports = router;
