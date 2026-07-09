const express = require('express');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

// Доступ есть у любого авторизованного пользователя с ролью client — но только к своим данным.
// Права из role_permissions/user_permissions тут не нужны: изоляция идёт по client_id из токена,
// а не по странице, поэтому админ не может случайно открыть это чужому сотруднику через матрицу прав.
router.use(authenticate, (req, res, next) => {
  if (req.user.role !== 'client' || !req.user.client_id) return res.status(403).json({ error: 'Доступно только клиентам' });
  next();
});

router.get('/', async (req, res) => {
  try {
    const [c, sales, preorders] = await Promise.all([
      pool.query('SELECT id, name, phone, debt_rub FROM clients WHERE id=$1', [req.user.client_id]),
      pool.query('SELECT * FROM sales WHERE client_id=$1 ORDER BY created_at DESC', [req.user.client_id]),
      pool.query('SELECT * FROM preorders WHERE client_id=$1 ORDER BY created_at DESC', [req.user.client_id]),
    ]);
    res.json({ ...c.rows[0], sales: sales.rows, preorders: preorders.rows });
  } catch (err) { res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

module.exports = router;
