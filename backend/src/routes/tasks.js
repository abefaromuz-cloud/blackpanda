const express = require('express');
const pool = require('../db/pool');
const { authenticate, requirePermission } = require('../middleware/auth');
const router = express.Router();

router.get('/', authenticate, requirePermission('dashboard', 'view'), async (req, res) => {
  const result = await pool.query(`
    SELECT t.*, c.name AS client_name FROM tasks t LEFT JOIN clients c ON c.id = t.client_id
    ORDER BY t.done, t.due_date NULLS LAST, t.created_at DESC
  `);
  res.json(result.rows);
});

router.post('/', authenticate, requirePermission('dashboard', 'view'), async (req, res) => {
  const { title, due_date, client_id } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: 'Укажите текст задачи' });
  const result = await pool.query(
    'INSERT INTO tasks (title, due_date, client_id, created_by) VALUES ($1,$2,$3,$4) RETURNING *',
    [title.trim(), due_date || null, client_id || null, req.user.id]
  );
  res.status(201).json(result.rows[0]);
});

router.put('/:id', authenticate, requirePermission('dashboard', 'view'), async (req, res) => {
  const { done, title, due_date } = req.body;
  const result = await pool.query(
    'UPDATE tasks SET done=COALESCE($1,done), title=COALESCE($2,title), due_date=COALESCE($3,due_date) WHERE id=$4 RETURNING *',
    [done ?? null, title || null, due_date || null, req.params.id]
  );
  res.json(result.rows[0]);
});

router.delete('/:id', authenticate, requirePermission('dashboard', 'view'), async (req, res) => {
  await pool.query('DELETE FROM tasks WHERE id=$1', [req.params.id]);
  res.json({ success: true });
});

module.exports = router;
