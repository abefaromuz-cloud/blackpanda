const express = require('express');
const pool = require('../db/pool');
const { authenticate, requirePermission } = require('../middleware/auth');
const { logActivity } = require('../utils/activityLog');
const router = express.Router();

// Импорт клиентов. rows: [{ name, phone, telegram }]
router.post('/clients', authenticate, requirePermission('import', 'edit'), async (req, res) => {
  const { rows } = req.body;
  if (!Array.isArray(rows) || !rows.length) return res.status(400).json({ error: 'Нет строк для импорта' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let created = 0;
    for (const r of rows) {
      if (!r.name) continue;
      await client.query('INSERT INTO clients (name, phone, telegram) VALUES ($1,$2,$3)', [r.name, r.phone || null, r.telegram || null]);
      created++;
    }
    await client.query('COMMIT');
    await logActivity(req.user, 'Импорт клиентов', 'client', `${created} шт.`);
    res.status(201).json({ created });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  } finally { client.release(); }
});

// Импорт моделей ноутбуков. rows: [{ brand, series, cpu, ram, gpu, storage, cost_cny, price_sell_cny }]
router.post('/laptops', authenticate, requirePermission('import', 'edit'), async (req, res) => {
  const { rows } = req.body;
  if (!Array.isArray(rows) || !rows.length) return res.status(400).json({ error: 'Нет строк для импорта' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let created = 0;
    for (const r of rows) {
      if (!r.brand) continue;
      await client.query(
        `INSERT INTO laptops (brand,series,cpu,ram,gpu,storage,cost_cny,price_sell_cny) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [r.brand, r.series||null, r.cpu||null, r.ram||null, r.gpu||null, r.storage||null, r.cost_cny||0, r.price_sell_cny||0]
      );
      created++;
    }
    await client.query('COMMIT');
    await logActivity(req.user, 'Импорт моделей склада', 'laptop', `${created} шт.`);
    res.status(201).json({ created });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  } finally { client.release(); }
});

module.exports = router;
