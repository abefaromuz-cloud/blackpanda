const express = require('express');
const pool = require('../db/pool');
const { authenticate, requirePermission } = require('../middleware/auth');
const router = express.Router();

// Список вишлиста — с фильтром по клиенту, если передан
router.get('/', authenticate, requirePermission('clients', 'view'), async (req, res) => {
  const { client_id } = req.query;
  const params = [];
  let where = '';
  if (client_id) { params.push(client_id); where = 'WHERE w.client_id = $1'; }
  const result = await pool.query(`
    SELECT w.*, c.name AS client_name, l.brand, l.series, l.image_url,
      (SELECT COUNT(*) FROM serials s WHERE s.laptop_id = l.id AND s.status_id IN (SELECT label FROM lib_statuses WHERE counts_as='instock')) AS in_stock
    FROM wishlist w
    JOIN clients c ON c.id = w.client_id
    JOIN laptops l ON l.id = w.laptop_id
    ${where}
    ORDER BY w.notified ASC, w.created_at DESC
  `, params);
  res.json(result.rows);
});

// Добавить "отложенный интерес" — клиент ждёт эту модель, без предоплаты и обязательств
router.post('/', authenticate, requirePermission('clients', 'edit'), async (req, res) => {
  const { client_id, laptop_id, note } = req.body;
  if (!client_id || !laptop_id) return res.status(400).json({ error: 'Укажите клиента и модель' });
  try {
    const result = await pool.query(
      'INSERT INTO wishlist (client_id, laptop_id, note, created_by) VALUES ($1,$2,$3,$4) RETURNING *',
      [client_id, laptop_id, note || null, req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

router.delete('/:id', authenticate, requirePermission('clients', 'edit'), async (req, res) => {
  await pool.query('DELETE FROM wishlist WHERE id=$1', [req.params.id]);
  res.json({ success: true });
});

module.exports = router;
