const express = require('express');
const pool = require('../db/pool');
const { authenticate, requirePermission } = require('../middleware/auth');
const { sendTelegramMessage } = require('../utils/telegram');
const { logActivity } = require('../utils/activityLog');
const router = express.Router();

// Наценка зависит от % предоплаты, который выбрал клиент при заказе:
// чем меньше платит сейчас — тем больше риск продавца — тем выше наценка.
function markupForPrepayment(pct) {
  if (Number(pct) >= 100) return 3;
  if (Number(pct) >= 50) return 6;
  return 9;
}

router.get('/', authenticate, requirePermission('preorders', 'view'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT p.*, c.name AS client_name,
        COALESCE(json_agg(pi.*) FILTER (WHERE pi.id IS NOT NULL), '[]') AS items
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
    const [p, items, settings] = await Promise.all([
      pool.query(`SELECT p.*, c.name AS client_name, c.telegram AS client_telegram FROM preorders p JOIN clients c ON c.id=p.client_id WHERE p.id=$1`, [req.params.id]),
      pool.query(`SELECT pi.*, l.brand, l.series FROM preorder_items pi JOIN laptops l ON l.id=pi.laptop_id WHERE pi.preorder_id=$1`, [req.params.id]),
      pool.query('SELECT rate FROM settings WHERE id=1'),
    ]);
    if (!p.rows[0]) return res.status(404).json({ error: 'Предзаказ не найден' });
    const po = p.rows[0];
    const rate = Number(settings.rows[0].rate);
    const remainingCny = Math.max(0, Number(po.total_cny) - Number(po.paid_cny));
    res.json({ ...po, items: items.rows, current_rate: rate, remaining_cny: remainingCny, remaining_rub_now: Math.round(remainingCny * rate) });
  } catch (err) { res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

// Создать предзаказ. items: [{ laptop_id, qty, cost_cny, logistics_cny }], prepayment_pct: 0|50|100
// Цена каждой позиции считается сама: (себестоимость + логистика) * (1 + наценка%)
router.post('/', authenticate, requirePermission('preorders', 'edit'), async (req, res) => {
  const { client_id, prepayment_pct, note, items } = req.body;
  if (!client_id || !Array.isArray(items) || !items.length)
    return res.status(400).json({ error: 'Укажите клиента и хотя бы одну позицию' });
  const markup = markupForPrepayment(prepayment_pct);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let totalCny = 0;
    const computedItems = items.map(it => {
      const cost = Number(it.cost_cny) || 0;
      const logistics = Number(it.logistics_cny) === 300 ? 300 : 200;
      const qty = Number(it.qty) || 1;
      const unitPriceCny = Math.round((cost + logistics) * (1 + markup / 100) * 100) / 100;
      totalCny += unitPriceCny * qty;
      return { ...it, cost, logistics, qty, unitPriceCny };
    });

    const po = await client.query(
      `INSERT INTO preorders (client_id, prepayment_pct, markup_pct, total_cny, note)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [client_id, prepayment_pct || 0, markup, totalCny, note || null]
    );
    for (const it of computedItems) {
      await client.query(
        `INSERT INTO preorder_items (preorder_id, laptop_id, qty, cost_cny, logistics_cny, price_sell_cny)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [po.rows[0].id, it.laptop_id, it.qty, it.cost, it.logistics, it.unitPriceCny]
      );
    }
    await client.query('COMMIT');
    await logActivity(req.user, 'Создан предзаказ', 'preorder', `¥${totalCny.toFixed(2)}, предоплата ${prepayment_pct || 0}%`);
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

// Внести оплату (предоплату при заказе или доплату позже) — сумма ВСЕГДА в юанях,
// рублёвый эквивалент считается по курсу НА МОМЕНТ ЭТОЙ ОПЛАТЫ, а не по курсу заказа.
router.post('/:id/pay', authenticate, requirePermission('finance', 'edit'), async (req, res) => {
  const { amount_cny, dest } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const poRes = await client.query('SELECT * FROM preorders WHERE id=$1 FOR UPDATE', [req.params.id]);
    const po = poRes.rows[0];
    if (!po) throw { status: 404, message: 'Предзаказ не найден' };
    const remainingCny = Math.max(0, Number(po.total_cny) - Number(po.paid_cny));
    const payCny = Math.min(Number(amount_cny) || remainingCny, remainingCny);
    if (payCny <= 0) throw { status: 400, message: 'Нечего оплачивать' };

    const settingsRes = await client.query('SELECT rate FROM settings WHERE id=1');
    const rate = Number(settingsRes.rows[0].rate);
    const payRub = Math.round(payCny * rate * 100) / 100;

    await client.query('UPDATE preorders SET paid_cny = paid_cny + $1 WHERE id=$2', [payCny, req.params.id]);

    const isCash = !dest || dest === 'cash';
    if (isCash) {
      await client.query('UPDATE settings SET cash_balance_rub = cash_balance_rub + $1 WHERE id=1', [payRub]);
    } else {
      await client.query('UPDATE bank_accounts SET balance_rub = balance_rub + $1 WHERE key=$2', [payRub, dest]);
    }
    await client.query(
      `INSERT INTO cash_log (type, amount_rub, note, client_id, category, bank_key)
       VALUES ('in',$1,$2,$3,'other',$4)`,
      [payRub, `Оплата по предзаказу No.${po.id.slice(-6)}: ¥${payCny} по курсу ${rate}`, po.client_id, isCash ? null : dest]
    );
    await client.query('COMMIT');
    await logActivity(req.user, 'Оплата предзаказа', 'preorder', `¥${payCny} (${payRub.toLocaleString('ru-RU')} ₽ по курсу ${rate})`);
    res.json({ paid_cny: payCny, paid_rub: payRub, rate });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  } finally { client.release(); }
});

// Отменить предзаказ
router.post('/:id/cancel', authenticate, requirePermission('preorders', 'edit'), async (req, res) => {
  await pool.query(`UPDATE preorders SET stage='cancelled' WHERE id=$1`, [req.params.id]);
  res.json({ success: true });
});

// Удалить предзаказ — разрешено только для уже отменённых, чтобы случайно не стереть
// реальную историю активных или выполненных заказов
router.delete('/:id', authenticate, requirePermission('preorders', 'edit'), async (req, res) => {
  const p = await pool.query('SELECT stage FROM preorders WHERE id=$1', [req.params.id]);
  if (!p.rows[0]) return res.status(404).json({ error: 'Предзаказ не найден' });
  if (p.rows[0].stage !== 'cancelled') return res.status(400).json({ error: 'Удалять можно только отменённые предзаказы' });
  await pool.query('DELETE FROM preorders WHERE id=$1', [req.params.id]); // preorder_items уйдут каскадом
  res.json({ success: true });
});

// Передача товара клиенту по предзаказу: списывает серийники со склада, создаёт продажу,
// закрывает остаток ДОЛГА В ЮАНЯХ по курсу на момент передачи (а не по курсу заказа),
// шлёт уведомление в Telegram
router.post('/:id/transfer', authenticate, requirePermission('preorders', 'edit'), async (req, res) => {
  const { serials: scannedSerials, payment_mode, pay_dest, split_cash, split_bank, bank_dest, due_date } = req.body;
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
    const rate = Number(settings.rate);

    let cl = null;
    if (po.client_id) {
      const clRes = await client.query('SELECT * FROM clients WHERE id=$1 FOR UPDATE', [po.client_id]);
      cl = clRes.rows[0];
    }

    const byLaptop = {};
    for (const sn of scannedSerials) {
      const serRes = await client.query(`SELECT * FROM serials WHERE serial=$1 AND status_id IN (SELECT label FROM lib_statuses WHERE counts_as IN ('instock','reserved'))`, [sn]);
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
      `INSERT INTO sales (client_id, preorder_id, total_cny, total_rub, rate, payment_mode, note, created_by)
       VALUES ($1,$2,0,0,$3,$4,$5,$6) RETURNING *`,
      [po.client_id, po.id, rate, payment_mode || 'full', 'No.' + po.id.slice(-6), req.user.id]
    );

    for (const lid in byLaptop) {
      const { poItem, serials } = byLaptop[lid];
      const qty = serials.length;
      const priceCny = Number(poItem.price_sell_cny) * qty;
      const priceRub = priceCny * rate;
      totalCny += priceCny; totalRub += priceRub;

      await client.query(
        `INSERT INTO sale_items (sale_id, laptop_id, serial_ids, qty, price_sell_cny, price_sell_rub, price_cost_cny, total_cny)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [sale.rows[0].id, lid, serials.map(s => s.id), qty, poItem.price_sell_cny, priceRub / qty, poItem.cost_cny + poItem.logistics_cny, priceCny]
      );
      for (const ser of serials) {
        await client.query(`UPDATE serials SET status_id='Продан', sale_date=now(), sale_client_id=$1 WHERE id=$2`, [po.client_id, ser.id]);
        await client.query(`UPDATE reservations SET active=false WHERE serial_id=$1 AND active=true`, [ser.id]);
        await client.query(
          `INSERT INTO serial_history (serial_id, status_id, note) VALUES ($1,'Продан',$2)`,
          [ser.id, 'Передан клиенту' + (cl ? ' ' + cl.name : '') + ' по предзаказу No.' + po.id.slice(-6)]
        );
      }
      if (qty >= poItem.qty) {
        await client.query(`UPDATE preorder_items SET item_status='transferred' WHERE id=$1`, [poItem.id]);
      }
    }
    await client.query('UPDATE sales SET total_cny=$1, total_rub=$2 WHERE id=$3', [totalCny, totalRub, sale.rows[0].id]);

    // Сколько ещё должен клиент по этому предзаказу В ЮАНЯХ (весь предзаказ, не только эта партия) —
    // именно эта сумма пересчитывается по курсу НА СЕГОДНЯ, а не по курсу заказа
    const remainingCny = Math.max(0, Number(po.total_cny) - Number(po.paid_cny));
    const remainingRubNow = remainingCny * rate;
    const mode = payment_mode || 'full';

    if (remainingCny > 0.01) {
      if (mode === 'balance') {
        if (!cl) throw { status: 400, message: 'У предзаказа нет клиента для оплаты с баланса' };
        const bal = Number(cl.balance_rub);
        const fromBalanceRub = Math.min(bal, remainingRubNow);
        const fromBalanceCny = rate > 0 ? fromBalanceRub / rate : 0;
        const newBalance = bal - fromBalanceRub;
        await client.query('UPDATE clients SET balance_rub=$1 WHERE id=$2', [newBalance, po.client_id]);
        await client.query('INSERT INTO balance_history (client_id, amount_rub, note, balance_after_rub) VALUES ($1,$2,$3,$4)',
          [po.client_id, -fromBalanceRub, 'Оплата остатка предзаказа с баланса', newBalance]);
        await client.query('UPDATE preorders SET paid_cny = paid_cny + $1 WHERE id=$2', [fromBalanceCny, po.id]);
        const stillOwedCny = remainingCny - fromBalanceCny;
        if (stillOwedCny > 0.01) {
          await client.query('INSERT INTO debts (client_id, sale_id, preorder_id, amount_rub, amount_cny, due_date) VALUES ($1,$2,$3,$4,$5,$6)',
            [po.client_id, sale.rows[0].id, po.id, stillOwedCny * rate, stillOwedCny, due_date || null]);
        }
      } else if (mode === 'partial') {
        // paid_now_rub интерпретируем как "оплачено сейчас в рублях по сегодняшнему курсу"
        const paidNowRub = Math.max(0, Math.min(remainingRubNow, Number(req.body.paid_now_rub) || 0));
        const paidNowCny = rate > 0 ? paidNowRub / rate : 0;
        if (paidNowRub > 0) {
          await client.query('UPDATE settings SET cash_balance_rub = cash_balance_rub + $1 WHERE id=1', [paidNowRub]);
          await client.query(`INSERT INTO cash_log (type, amount_rub, note, client_id, category) VALUES ('in',$1,'Частичная оплата остатка предзаказа',$2,'other')`, [paidNowRub, po.client_id]);
          await client.query('UPDATE preorders SET paid_cny = paid_cny + $1 WHERE id=$2', [paidNowCny, po.id]);
        }
        const stillOwedCny = remainingCny - paidNowCny;
        if (stillOwedCny > 0.01) {
          await client.query('INSERT INTO debts (client_id, sale_id, preorder_id, amount_rub, amount_cny, due_date) VALUES ($1,$2,$3,$4,$5,$6)',
            [po.client_id, sale.rows[0].id, po.id, stillOwedCny * rate, stillOwedCny, due_date || null]);
        }
      } else if (mode === 'split') {
        const cash = Math.max(0, Number(split_cash) || 0);
        const bank = Math.max(0, Number(split_bank) || 0);
        const bankKey = bank_dest || 'sber';
        if (cash > 0) {
          await client.query('UPDATE settings SET cash_balance_rub = cash_balance_rub + $1 WHERE id=1', [cash]);
          await client.query(`INSERT INTO cash_log (type, amount_rub, note, client_id, category) VALUES ('in',$1,'Остаток предзаказа (наличные)',$2,'other')`, [cash, po.client_id]);
        }
        if (bank > 0) {
          await client.query('UPDATE bank_accounts SET balance_rub = balance_rub + $1 WHERE key=$2', [bank, bankKey]);
          await client.query(`INSERT INTO cash_log (type, amount_rub, note, client_id, category, bank_key) VALUES ('in',$1,'Остаток предзаказа (перевод)',$2,'other',$3)`, [bank, po.client_id, bankKey]);
        }
        const paidCny = rate > 0 ? (cash + bank) / rate : 0;
        await client.query('UPDATE preorders SET paid_cny = paid_cny + $1 WHERE id=$2', [paidCny, po.id]);
      } else {
        // full — оплата остатка целиком, сейчас, по сегодняшнему курсу
        const dest = pay_dest || 'cash';
        if (dest === 'cash') {
          await client.query('UPDATE settings SET cash_balance_rub = cash_balance_rub + $1 WHERE id=1', [remainingRubNow]);
          await client.query(`INSERT INTO cash_log (type, amount_rub, note, client_id, category) VALUES ('in',$1,'Остаток предзаказа (наличные)',$2,'other')`, [remainingRubNow, po.client_id]);
        } else {
          await client.query('UPDATE bank_accounts SET balance_rub = balance_rub + $1 WHERE key=$2', [remainingRubNow, dest]);
          await client.query(`INSERT INTO cash_log (type, amount_rub, note, client_id, category, bank_key) VALUES ('in',$1,'Остаток предзаказа (перевод)',$2,'other',$3)`, [remainingRubNow, po.client_id, dest]);
        }
        await client.query('UPDATE preorders SET paid_cny = paid_cny + $1 WHERE id=$2', [remainingCny, po.id]);
      }
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

    if (cl?.telegram) {
      sendTelegramMessage(cl.telegram,
        `🐼 BlackPanda\n\nВы получили товар по предзаказу No.${po.id.slice(-6)}!` +
        (allDone ? '\n\nПредзаказ выполнен полностью!' : '\n\nЧасть позиций ещё ожидает поступления.')
      ).catch(() => {});
    }

    res.status(201).json({ sale: sale.rows[0], allDone, totalRub, totalCny });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  } finally { client.release(); }
});

module.exports = router;
