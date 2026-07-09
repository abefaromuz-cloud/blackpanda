const express = require('express');
const pool = require('../db/pool');
const { authenticate, requireRole } = require('../middleware/auth');
const router = express.Router();

// Доступно любому авторизованному — нужно, чтобы у каждого пользователя меню шло в едином порядке
router.get('/', authenticate, async (req, res) => {
  const result = await pool.query('SELECT page_key, sort_order FROM nav_order ORDER BY sort_order ASC');
  res.json(result.rows);
});

// Сохраняет новый порядок — только администратор
router.put('/', authenticate, requireRole('admin'), async (req, res) => {
  const { page_keys } = req.body;
  if (!Array.isArray(page_keys)) return res.status(400).json({ error: 'Некорректные данные' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (let i = 0; i < page_keys.length; i++) {
      await client.query(
        `INSERT INTO nav_order (page_key, sort_order) VALUES ($1,$2)
         ON CONFLICT (page_key) DO UPDATE SET sort_order=$2`,
        [page_keys[i], (i + 1) * 100]
      );
    }
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  } finally { client.release(); }
});

module.exports = router;
