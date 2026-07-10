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

// Универсальная кассовая операция: приход/расход, наличными или на/со счёта, включая сдачу обменнику
router.post('/', authenticate, requirePermission('finance', 'edit'), async (req, res) => {
  const { type, dest, amount_rub, note, client_id, category, recipient } = req.body;
  if (!['in', 'out'].includes(type) || !amount_rub) return res.status(400).json({ error: 'Укажите тип и сумму' });
  const isCash = !dest || dest === 'cash';
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const delta = type === 'in' ? Number(amount_rub) : -Number(amount_rub);
    if (isCash) {
      await client.query('UPDATE settings SET cash_balance_rub = cash_balance_rub + $1 WHERE id=1', [delta]);
    } else {
      await client.query('UPDATE bank_accounts SET balance_rub = balance_rub + $1 WHERE key=$2', [delta, dest]);
    }
    const entry = await client.query(
      `INSERT INTO cash_log (type, amount_rub, note, client_id, category, bank_key, recipient)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [type, amount_rub, note || null, client_id || null, category || 'other', isCash ? null : dest, recipient || null]
    );
    await client.query('COMMIT');
    const label = category === 'exchanger' ? `Сдача обменнику${recipient ? ' (' + recipient + ')' : ''}` : (type === 'in' ? 'Приход в кассу' : 'Расход из кассы');
    await logActivity(req.user, label, 'cash', Math.round(amount_rub).toLocaleString('ru-RU') + ' ₽');
    res.status(201).json(entry.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  } finally { client.release(); }
});

module.exports = router;
