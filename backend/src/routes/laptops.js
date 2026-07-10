const express = require('express');
const pool = require('../db/pool');
const { authenticate, requirePermission } = require('../middleware/auth');
const { logActivity } = require('../utils/activityLog');
const router = express.Router();

// Список моделей + агрегированные остатки по статусам
router.get('/', authenticate, requirePermission('warehouse', 'view'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT l.*,
        COUNT(s.id) FILTER (WHERE s.status_id IN (SELECT label FROM lib_statuses WHERE counts_as='instock'))    AS in_stock,
        COUNT(s.id) FILTER (WHERE s.status_id IN (SELECT label FROM lib_statuses WHERE counts_as='intransit'))  AS in_transit,
        COUNT(s.id) FILTER (WHERE s.status_id IN (SELECT label FROM lib_statuses WHERE counts_as='reserved'))   AS reserved,
        COUNT(s.id) FILTER (WHERE s.status_id IN (SELECT label FROM lib_statuses WHERE counts_as='sold'))       AS sold,
        COUNT(s.id) AS total
      FROM laptops l
      LEFT JOIN serials s ON s.laptop_id = l.id
      WHERE l.is_archived = false
      GROUP BY l.id
      ORDER BY l.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

router.get('/:id', authenticate, requirePermission('warehouse', 'view'), async (req, res) => {
  try {
    const [l, s] = await Promise.all([
      pool.query('SELECT * FROM laptops WHERE id=$1', [req.params.id]),
      pool.query('SELECT * FROM serials WHERE laptop_id=$1 ORDER BY created_at DESC', [req.params.id]),
    ]);
    if (!l.rows[0]) return res.status(404).json({ error: 'Модель не найдена' });
    res.json({ ...l.rows[0], serials: s.rows });
  } catch (err) { res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

router.post('/', authenticate, requirePermission('warehouse', 'edit'), async (req, res) => {
  const { brand, series, cpu, ram, gpu, storage, color, screen, touch, images, cost_cny, price_sell_cny, low_stock_threshold, is_hot } = req.body;
  if (!brand) return res.status(400).json({ error: 'Укажите бренд' });
  try {
    const imgArr = Array.isArray(images) ? images.filter(Boolean) : [];
    const result = await pool.query(
      `INSERT INTO laptops (brand,series,cpu,ram,gpu,storage,color,screen,touch,image_url,images,cost_cny,price_sell_cny,low_stock_threshold,is_hot)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [brand, series||null, cpu||null, ram||null, gpu||null, storage||null, color||null, screen||null,
       touch||'no', imgArr[0]||null, imgArr, cost_cny||0, price_sell_cny||0, low_stock_threshold||2, !!is_hot]
    );
    await logActivity(req.user, 'Добавлена модель', 'laptop', brand + ' ' + (series||''));
    res.status(201).json(result.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

router.put('/:id', authenticate, requirePermission('warehouse', 'edit'), async (req, res) => {
  const f = req.body;
  const imgArr = Array.isArray(f.images) ? f.images.filter(Boolean) : null;
  try {
    const result = await pool.query(
      `UPDATE laptops SET brand=COALESCE($1,brand), series=COALESCE($2,series), cpu=COALESCE($3,cpu),
        ram=COALESCE($4,ram), gpu=COALESCE($5,gpu), storage=COALESCE($6,storage), color=COALESCE($7,color),
        screen=COALESCE($8,screen), touch=COALESCE($9,touch),
        images=COALESCE($10,images), image_url=COALESCE($11,image_url),
        cost_cny=COALESCE($12,cost_cny), price_sell_cny=COALESCE($13,price_sell_cny),
        low_stock_threshold=COALESCE($14,low_stock_threshold), is_hot=COALESCE($15,is_hot)
       WHERE id=$16 RETURNING *`,
      [f.brand,f.series,f.cpu,f.ram,f.gpu,f.storage,f.color,f.screen,f.touch,
       imgArr, imgArr ? imgArr[0] : null, f.cost_cny,f.price_sell_cny,f.low_stock_threshold,
       f.is_hot !== undefined ? !!f.is_hot : null, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Модель не найдена' });
    res.json(result.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

router.delete('/:id', authenticate, requirePermission('warehouse', 'edit'), async (req, res) => {
  try {
    // Мягкое удаление — чтобы не потерять историю продаж по этой модели
    await pool.query('UPDATE laptops SET is_archived=true WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

module.exports = router;
