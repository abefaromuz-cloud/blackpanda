const express = require('express');
const pool = require('../db/pool');
const { authenticate, requirePermission } = require('../middleware/auth');
const router = express.Router();

router.get('/', authenticate, requirePermission('activity_log', 'view'), async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM activity_log ORDER BY created_at DESC LIMIT 300');
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

module.exports = router;
