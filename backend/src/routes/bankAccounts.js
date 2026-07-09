const express = require('express');
const pool = require('../db/pool');
const { authenticate, requirePermission } = require('../middleware/auth');
const { logActivity } = require('../utils/activityLog');
const router = express.Router();

router.get('/', authenticate, requirePermission('cash', 'view'), async (req, res) => {
  const result = await pool.query('SELECT * FROM bank_accounts ORDER BY name');
  res.json(result.rows);
});

// Корректировка баланса счёта вручную (пишет разницу в кассовый лог с привязкой к банку)
router.put('/:key', authenticate, requirePermission('cash', 'edit'), async (req, res) => {
  const { new_balance_rub } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const cur = await client.query('SELECT * FROM bank_accounts WHERE key=$1 FOR UPDATE', [req.params.key]);
    if (!cur.rows[0]) throw { status: 404, message: 'Счёт не найден' };
    const diff = Number(new_balance_rub) - Number(cur.rows[0].balance_rub);
    await client.query('UPDATE bank_accounts SET balance_rub=$1 WHERE key=$2', [new_balance_rub, req.params.key]);
    await client.query(
      `INSERT INTO cash_log (type, amount_rub, note, category, bank_key) VALUES ($1,$2,$3,'other',$4)`,
      [diff >= 0 ? 'in' : 'out', Math.abs(diff), 'Корректировка баланса ' + cur.rows[0].name, req.params.key]
    );
    await client.query('COMMIT');
    await logActivity(req.user, 'Корректировка банк. счёта', 'bank_account', cur.rows[0].name);
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.status) return res.status(err.status).json({ error: err.message });
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  } finally { client.release(); }
});

module.exports = router;
