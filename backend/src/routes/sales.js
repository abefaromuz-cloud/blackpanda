const express = require('express');
const pool = require('../db/pool');
const { authenticate, requirePermission } = require('../middleware/auth');
const { logActivity } = require('../utils/activityLog');
const router = express.Router();

router.get('/', authenticate, requirePermission('sales', 'view'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT s.*, c.name AS client_name,
        COALESCE(json_agg(si.*) FILTER (WHERE si.id IS NOT NULL), '[]') AS items
      FROM sales s JOIN clients c ON c.id=s.client_id
      LEFT JOIN sale_items si ON si.sale_id=s.id
      GROUP BY s.id, c.name
      ORDER BY s.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

// Прямая продажа (без предзаказа) — сканируем серийники сразу "на продажу"
router.post('/', authenticate, requirePermission('sales', 'edit'), async (req, res) => {
  const { client_id, serials: scannedSerials, payment_mode, note } = req.body;
  if (!client_id || !Array.isArray(scannedSerials) || !scannedSerials.length)
    return res.status(400).json({ error: 'Укажите клиента и серийники' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const settingsRes = await client.query('SELECT * FROM settings WHERE id=1');
    const settings = settingsRes.rows[0];

    const byLaptop = {};
    for (const sn of scannedSerials) {
      const serRes = await client.query(`SELECT s.*, l.price_sell_cny, l.cost_cny FROM serials s JOIN laptops l ON l.id=s.laptop_id WHERE s.serial=$1 AND s.status_id='s2'`, [sn]);
      const ser = serRes.rows[0];
      if (!ser) throw { status: 400, message: `Серийник ${sn} не найден на складе` };
      (byLaptop[ser.laptop_id] ||= []).push(ser);
    }

    let totalCny = 0, totalRub = 0;
    const sale = await client.query(
      `INSERT INTO sales (client_id, total_cny, total_rub, rate, payment_mode, note) VALUES ($1,0,0,$2,$3,$4) RETURNING *`,
      [client_id, settings.rate, payment_mode || 'full', note || null]
    );

    for (const lid in byLaptop) {
      const sers = byLaptop[lid];
      const qty = sers.length;
      const priceCny = Number(sers[0].price_sell_cny) * qty;
      const priceRub = priceCny * Number(settings.rate);
      totalCny += priceCny; totalRub += priceRub;
      await client.query(
        `INSERT INTO sale_items (sale_id, laptop_id, serial_ids, qty, price_sell_cny, price_sell_rub, price_cost_cny, total_cny)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [sale.rows[0].id, lid, sers.map(s => s.id), qty, sers[0].price_sell_cny, priceRub / qty, sers[0].cost_cny, priceCny]
      );
      for (const ser of sers) {
        await client.query(`UPDATE serials SET status_id='s3', sale_date=now(), sale_client_id=$1 WHERE id=$2`, [client_id, ser.id]);
        await client.query(`INSERT INTO serial_history (serial_id, status_id, note) VALUES ($1,'s3','Продан')`, [ser.id]);
      }
    }

    await client.query('UPDATE sales SET total_cny=$1, total_rub=$2 WHERE id=$3', [totalCny, totalRub, sale.rows[0].id]);

    if (payment_mode !== 'partial') {
      await client.query('UPDATE settings SET cash_balance_rub = cash_balance_rub + $1 WHERE id=1', [totalRub]);
      await client.query(`INSERT INTO cash_log (type, amount_rub, note, client_id) VALUES ('in',$1,$2,$3)`,
        [totalRub, note || 'Продажа', client_id]);
    } else {
      await client.query('UPDATE clients SET debt_rub = debt_rub + $1 WHERE id=$2', [totalRub, client_id]);
    }

    await client.query('COMMIT');
    await logActivity(req.user, 'Продажа', 'sale', Math.round(totalRub).toLocaleString('ru-RU') + ' ₽');
    res.status(201).json(sale.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  } finally { client.release(); }
});

module.exports = router;
