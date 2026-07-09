const express = require('express');
const pool = require('../db/pool');
const { authenticate, requirePermission } = require('../middleware/auth');
const router = express.Router();

const CATEGORIES = ['cpu', 'gpu', 'ram', 'storage', 'color', 'screen'];

router.get('/', authenticate, requirePermission('library', 'view'), async (req, res) => {
  try {
    const [brands, series, values] = await Promise.all([
      pool.query('SELECT * FROM lib_brands ORDER BY name'),
      pool.query('SELECT * FROM lib_series ORDER BY name'),
      pool.query('SELECT * FROM lib_values ORDER BY category, value'),
    ]);
    const brandsWithSeries = brands.rows.map(b => ({
      ...b, series: series.rows.filter(s => s.brand_id === b.id),
    }));
    const byCategory = {};
    CATEGORIES.forEach(c => { byCategory[c] = values.rows.filter(v => v.category === c); });
    res.json({ brands: brandsWithSeries, values: byCategory });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

router.post('/brands', authenticate, requirePermission('library', 'edit'), async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Укажите название бренда' });
  try {
    const result = await pool.query('INSERT INTO lib_brands (name) VALUES ($1) RETURNING *', [name.trim()]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Такой бренд уже есть' });
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

router.delete('/brands/:id', authenticate, requirePermission('library', 'edit'), async (req, res) => {
  await pool.query('DELETE FROM lib_brands WHERE id=$1', [req.params.id]);
  res.json({ success: true });
});

router.post('/brands/:id/series', authenticate, requirePermission('library', 'edit'), async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Укажите название серии' });
  try {
    const result = await pool.query('INSERT INTO lib_series (brand_id, name) VALUES ($1,$2) RETURNING *', [req.params.id, name.trim()]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Такая серия уже есть' });
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

router.delete('/series/:id', authenticate, requirePermission('library', 'edit'), async (req, res) => {
  await pool.query('DELETE FROM lib_series WHERE id=$1', [req.params.id]);
  res.json({ success: true });
});

// Универсальный CRUD для плоских списков (cpu/gpu/ram/storage/color/screen)
router.post('/values', authenticate, requirePermission('library', 'edit'), async (req, res) => {
  const { category, value } = req.body;
  if (!CATEGORIES.includes(category) || !value) return res.status(400).json({ error: 'Некорректные данные' });
  try {
    const result = await pool.query('INSERT INTO lib_values (category, value) VALUES ($1,$2) RETURNING *', [category, value.trim()]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Такое значение уже есть' });
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

router.delete('/values/:id', authenticate, requirePermission('library', 'edit'), async (req, res) => {
  await pool.query('DELETE FROM lib_values WHERE id=$1', [req.params.id]);
  res.json({ success: true });
});

// Быстрое автосохранение нового значения "на лету" при добавлении модели на складе,
// если введённого значения ещё нет в справочнике (чтобы не заставлять уходить в отдельный раздел)
router.post('/quick-add', authenticate, requirePermission('warehouse', 'edit'), async (req, res) => {
  const { category, value, brand_name, series_name } = req.body;
  try {
    if (category === 'brand_series' && brand_name) {
      let brand = await pool.query('SELECT * FROM lib_brands WHERE name=$1', [brand_name.trim()]);
      if (!brand.rows[0]) brand = await pool.query('INSERT INTO lib_brands (name) VALUES ($1) RETURNING *', [brand_name.trim()]);
      if (series_name) {
        await pool.query('INSERT INTO lib_series (brand_id, name) VALUES ($1,$2) ON CONFLICT DO NOTHING', [brand.rows[0].id, series_name.trim()]);
      }
    } else if (CATEGORIES.includes(category) && value) {
      await pool.query('INSERT INTO lib_values (category, value) VALUES ($1,$2) ON CONFLICT DO NOTHING', [category, value.trim()]);
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

module.exports = router;
