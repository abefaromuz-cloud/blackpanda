const express = require('express');
const pool = require('../db/pool');
const { authenticate, requirePermission } = require('../middleware/auth');
const { logActivity } = require('../utils/activityLog');
const router = express.Router();

router.get('/', authenticate, requirePermission('clients', 'view'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT c.*, COALESCE(SUM(s.total_rub),0) AS total_purchases_rub, COUNT(s.id) AS purchases_count
      FROM clients c LEFT JOIN sales s ON s.client_id=c.id
      GROUP BY c.id ORDER BY c.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

router.get('/:id', authenticate, requirePermission('clients', 'view'), async (req, res) => {
  try {
    const [c, sales, preorders] = await Promise.all([
      pool.query('SELECT * FROM clients WHERE id=$1', [req.params.id]),
      pool.query('SELECT * FROM sales WHERE client_id=$1 ORDER BY created_at DESC', [req.params.id]),
      pool.query(`SELECT * FROM preorders WHERE client_id=$1 ORDER BY created_at DESC`, [req.params.id]),
    ]);
    if (!c.rows[0]) return res.status(404).json({ error: 'Клиент не найден' });
    res.json({ ...c.rows[0], sales: sales.rows, preorders: preorders.rows });
  } catch (err) { res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

router.post('/', authenticate, requirePermission('clients', 'edit'), async (req, res) => {
  const { name, phone, telegram, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'Укажите имя клиента' });
  try {
    const result = await pool.query(
      'INSERT INTO clients (name, phone, telegram, notes) VALUES ($1,$2,$3,$4) RETURNING *',
      [name, phone||null, telegram||null, notes||null]
    );
    await logActivity(req.user, 'Добавлен клиент', 'client', name);
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

router.put('/:id', authenticate, requirePermission('clients', 'edit'), async (req, res) => {
  const { name, phone, telegram, debt_rub, notes } = req.body;
  try {
    const result = await pool.query(
      `UPDATE clients SET name=COALESCE($1,name), phone=COALESCE($2,phone), telegram=COALESCE($3,telegram),
       debt_rub=COALESCE($4,debt_rub), notes=COALESCE($5,notes) WHERE id=$6 RETURNING *`,
      [name||null, phone||null, telegram||null, debt_rub ?? null, notes||null, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Клиент не найден' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

router.delete('/:id', authenticate, requirePermission('clients', 'edit'), async (req, res) => {
  try {
    await pool.query('DELETE FROM clients WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

module.exports = router;
