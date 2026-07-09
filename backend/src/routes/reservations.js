const express = require('express');
const pool = require('../db/pool');
const { authenticate, requirePermission } = require('../middleware/auth');
const { logActivity } = require('../utils/activityLog');
const router = express.Router();

// Снимает резерв, если дедлайн истёк, и возвращает серийник на склад (вызывается перед чтением списков)
async function releaseExpired() {
  const expired = await pool.query(
    `SELECT r.id, r.serial_id FROM reservations r WHERE r.active=true AND r.deadline IS NOT NULL AND r.deadline < now()`
  );
  for (const row of expired.rows) {
    await pool.query('UPDATE reservations SET active=false WHERE id=$1', [row.id]);
    await pool.query(`UPDATE serials SET status_id='s2' WHERE id=$1 AND status_id='s15'`, [row.serial_id]);
  }
}

router.get('/', authenticate, requirePermission('warehouse', 'view'), async (req, res) => {
  await releaseExpired();
  const result = await pool.query(`
    SELECT r.*, s.serial, c.name AS client_name, l.brand, l.series
    FROM reservations r
    JOIN serials s ON s.id = r.serial_id
    JOIN laptops l ON l.id = s.laptop_id
    LEFT JOIN clients c ON c.id = r.client_id
    WHERE r.active = true
    ORDER BY r.deadline NULLS LAST
  `);
  res.json(result.rows);
});

// Зарезервировать список серийников (по строкам serial) за клиентом
router.post('/', authenticate, requirePermission('warehouse', 'edit'), async (req, res) => {
  const { serials, client_id, deadline, note, pay_type, pay_amount_rub } = req.body;
  if (!Array.isArray(serials) || !serials.length) return res.status(400).json({ error: 'Укажите серийники' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const created = [];
    for (const sn of serials) {
      const sr = await client.query(`SELECT * FROM serials WHERE serial=$1 AND status_id='s2'`, [sn]);
      if (!sr.rows[0]) throw { status: 400, message: `Серийник ${sn} не найден на складе` };
      await client.query(`UPDATE serials SET status_id='s15' WHERE id=$1`, [sr.rows[0].id]);
      const r = await client.query(
        `INSERT INTO reservations (serial_id, client_id, deadline, note, pay_type, pay_amount_rub)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [sr.rows[0].id, client_id || null, deadline || null, note || null, pay_type || 'none', pay_amount_rub || 0]
      );
      created.push(r.rows[0]);
    }
    if (pay_type && pay_type !== 'none' && pay_amount_rub > 0) {
      await client.query('UPDATE settings SET cash_balance_rub = cash_balance_rub + $1 WHERE id=1', [pay_amount_rub]);
      await client.query(`INSERT INTO cash_log (type, amount_rub, note, client_id, category) VALUES ('in',$1,$2,$3,'other')`,
        [pay_amount_rub, 'Аванс за резерв', client_id || null]);
    }
    await client.query('COMMIT');
    await logActivity(req.user, 'Резерв товара', 'reservation', serials.length + ' шт.');
    res.status(201).json(created);
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  } finally { client.release(); }
});

// Снять резерв вручную — серийник возвращается на склад
router.delete('/:id', authenticate, requirePermission('warehouse', 'edit'), async (req, res) => {
  const r = await pool.query('SELECT * FROM reservations WHERE id=$1', [req.params.id]);
  if (!r.rows[0]) return res.status(404).json({ error: 'Не найдено' });
  await pool.query('UPDATE reservations SET active=false WHERE id=$1', [req.params.id]);
  await pool.query(`UPDATE serials SET status_id='s2' WHERE id=$1 AND status_id='s15'`, [r.rows[0].serial_id]);
  res.json({ success: true });
});

module.exports = router;
