const express = require('express');
const pool = require('../db/pool');
const { authenticate, requirePermission } = require('../middleware/auth');
const { logActivity } = require('../utils/activityLog');
const router = express.Router();

router.get('/', authenticate, requirePermission('suppliers', 'view'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT s.*, COUNT(sr.id) AS items_supplied
      FROM suppliers s LEFT JOIN serials sr ON sr.supplier_id = s.id
      GROUP BY s.id ORDER BY s.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

router.post('/', authenticate, requirePermission('suppliers', 'edit'), async (req, res) => {
  const { name, contact_person, phone, wechat, country, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'Укажите название поставщика' });
  try {
    const result = await pool.query(
      `INSERT INTO suppliers (name, contact_person, phone, wechat, country, notes) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [name, contact_person||null, phone||null, wechat||null, country||'CN', notes||null]
    );
    await logActivity(req.user, 'Добавлен поставщик', 'supplier', name);
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

router.put('/:id', authenticate, requirePermission('suppliers', 'edit'), async (req, res) => {
  const { name, contact_person, phone, wechat, country, notes } = req.body;
  try {
    const result = await pool.query(
      `UPDATE suppliers SET name=COALESCE($1,name), contact_person=COALESCE($2,contact_person), phone=COALESCE($3,phone),
       wechat=COALESCE($4,wechat), country=COALESCE($5,country), notes=COALESCE($6,notes) WHERE id=$7 RETURNING *`,
      [name||null, contact_person||null, phone||null, wechat||null, country||null, notes||null, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Поставщик не найден' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

router.delete('/:id', authenticate, requirePermission('suppliers', 'edit'), async (req, res) => {
  try {
    await pool.query('DELETE FROM suppliers WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

module.exports = router;
