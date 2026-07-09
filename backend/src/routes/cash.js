const express = require('express');
const pool = require('../db/pool');
const { authenticate, requirePermission } = require('../middleware/auth');
const { logActivity } = require('../utils/activityLog');
const router = express.Router();

router.get('/', authenticate, requirePermission('cash', 'view'), async (req, res) => {
  try {
    const [log, settings] = await Promise.all([
      pool.query(`SELECT cl.*, c.name AS client_name FROM cash_log cl LEFT JOIN clients c ON c.id=cl.client_id ORDER BY cl.created_at DESC LIMIT 200`),
      pool.query('SELECT cash_balance_rub FROM settings WHERE id=1'),
    ]);
    res.json({ balance_rub: Number(settings.rows[0].cash_balance_rub), log: log.rows });
  } catch (err) { res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

// Ручная операция (расход/приход, не связанный напрямую с продажей — например, закупка или личные нужды)
router.post('/', authenticate, requirePermission('cash', 'edit'), async (req, res) => {
  const { type, amount_rub, note, client_id, category } = req.body;
  if (!['in', 'out'].includes(type) || !amount_rub) return res.status(400).json({ error: 'Укажите тип и сумму' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const delta = type === 'in' ? Number(amount_rub) : -Number(amount_rub);
    await client.query('UPDATE settings SET cash_balance_rub = cash_balance_rub + $1 WHERE id=1', [delta]);
    const entry = await client.query(
      'INSERT INTO cash_log (type, amount_rub, note, client_id, category) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [type, amount_rub, note || null, client_id || null, category || 'other']
    );
    await client.query('COMMIT');
    await logActivity(req.user, type === 'in' ? 'Приход в кассу' : 'Расход из кассы', 'cash', Math.round(amount_rub).toLocaleString('ru-RU') + ' ₽');
    res.status(201).json(entry.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  } finally { client.release(); }
});

module.exports = router;
