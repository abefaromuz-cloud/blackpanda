const express = require('express');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');
const { sendTelegramMessage } = require('../utils/telegram');
const { logActivity } = require('../utils/activityLog');
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
    const [c, sales, preorders, wishlist] = await Promise.all([
      pool.query('SELECT id, name, phone, debt_rub FROM clients WHERE id=$1', [req.user.client_id]),
      pool.query('SELECT * FROM sales WHERE client_id=$1 ORDER BY created_at DESC', [req.user.client_id]),
      pool.query('SELECT * FROM preorders WHERE client_id=$1 ORDER BY created_at DESC', [req.user.client_id]),
      pool.query(`
        SELECT w.id, w.note, w.notified, w.created_at, l.brand, l.series
        FROM wishlist w JOIN laptops l ON l.id = w.laptop_id
        WHERE w.client_id=$1 ORDER BY w.created_at DESC
      `, [req.user.client_id]),
    ]);
    res.json({ ...c.rows[0], sales: sales.rows, preorders: preorders.rows, requests: wishlist.rows });
  } catch (err) { res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

// Остаток на складе для клиента — сознательно отдаём только продажные поля (без себестоимости,
// поставщика и прочих внутренних данных): l.* тут НЕ используем нигде, каждое поле явно перечислено.
router.get('/stock', async (req, res) => {
  try {
    const rateRes = await pool.query('SELECT rate FROM settings WHERE id=1');
    const rate = Number(rateRes.rows[0]?.rate || 0);
    const result = await pool.query(`
      SELECT l.id, l.brand, l.series, l.cpu, l.gpu, l.ram, l.storage, l.color, l.screen, l.touch, l.image_url,
        l.price_sell_cny,
        COUNT(s.id) FILTER (WHERE s.status_id IN (SELECT label FROM lib_statuses WHERE counts_as='instock')) AS in_stock
      FROM laptops l LEFT JOIN serials s ON s.laptop_id = l.id
      WHERE l.is_archived = false
      GROUP BY l.id
      HAVING COUNT(s.id) FILTER (WHERE s.status_id IN (SELECT label FROM lib_statuses WHERE counts_as='instock')) > 0
      ORDER BY l.brand, l.series
    `);
    res.json({ rate, laptops: result.rows });
  } catch (err) { res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

module.exports = router;
