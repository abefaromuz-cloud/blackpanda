const express = require('express');
const pool = require('../db/pool');
const { authenticate, requirePermission } = require('../middleware/auth');
const { logActivity } = require('../utils/activityLog');
const router = express.Router();

router.get('/', authenticate, requirePermission('employees', 'view'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT e.*, u.email AS user_email FROM employees e LEFT JOIN users u ON u.id = e.user_id
      ORDER BY e.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

router.post('/', authenticate, requirePermission('employees', 'edit'), async (req, res) => {
  const { full_name, position, phone, hire_date, salary_rub, user_id, notes } = req.body;
  if (!full_name) return res.status(400).json({ error: 'Укажите имя сотрудника' });
  try {
    const result = await pool.query(
      `INSERT INTO employees (full_name, position, phone, hire_date, salary_rub, user_id, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [full_name, position||null, phone||null, hire_date||null, salary_rub||0, user_id||null, notes||null]
    );
    await logActivity(req.user, 'Добавлен сотрудник', 'employee', full_name);
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

router.put('/:id', authenticate, requirePermission('employees', 'edit'), async (req, res) => {
  const { full_name, position, phone, hire_date, salary_rub, user_id, is_active, notes } = req.body;
  try {
    const result = await pool.query(
      `UPDATE employees SET full_name=COALESCE($1,full_name), position=COALESCE($2,position), phone=COALESCE($3,phone),
       hire_date=COALESCE($4,hire_date), salary_rub=COALESCE($5,salary_rub), user_id=$6,
       is_active=COALESCE($7,is_active), notes=COALESCE($8,notes) WHERE id=$9 RETURNING *`,
      [full_name||null, position||null, phone||null, hire_date||null, salary_rub||null, user_id||null, is_active ?? null, notes||null, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Сотрудник не найден' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

router.delete('/:id', authenticate, requirePermission('employees', 'edit'), async (req, res) => {
  try {
    await pool.query('DELETE FROM employees WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

module.exports = router;
