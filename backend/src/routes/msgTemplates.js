const express = require('express');
const pool = require('../db/pool');
const { authenticate, requirePermission } = require('../middleware/auth');
const router = express.Router();

router.get('/', authenticate, requirePermission('broadcast', 'view'), async (req, res) => {
  const result = await pool.query('SELECT * FROM msg_templates ORDER BY created_at');
  res.json(result.rows);
});

router.post('/', authenticate, requirePermission('broadcast', 'edit'), async (req, res) => {
  const { name, text } = req.body;
  if (!name || !text) return res.status(400).json({ error: 'Укажите название и текст' });
  const result = await pool.query('INSERT INTO msg_templates (name, text) VALUES ($1,$2) RETURNING *', [name, text]);
  res.status(201).json(result.rows[0]);
});

router.put('/:id', authenticate, requirePermission('broadcast', 'edit'), async (req, res) => {
  const { name, text } = req.body;
  const result = await pool.query('UPDATE msg_templates SET name=COALESCE($1,name), text=COALESCE($2,text) WHERE id=$3 RETURNING *', [name||null, text||null, req.params.id]);
  res.json(result.rows[0]);
});

router.delete('/:id', authenticate, requirePermission('broadcast', 'edit'), async (req, res) => {
  await pool.query('DELETE FROM msg_templates WHERE id=$1', [req.params.id]);
  res.json({ success: true });
});

module.exports = router;
