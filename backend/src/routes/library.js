const express = require('express');
const pool = require('../db/pool');
const { authenticate, requirePermission } = require('../middleware/auth');
const { insertOrdered, renumber } = require('../utils/ordering');
const router = express.Router();

const CATEGORIES = ['cpu', 'gpu', 'ram', 'storage', 'color', 'screen'];

router.get('/', authenticate, requirePermission('library', 'view'), async (req, res) => {
  try {
    const [brands, series, values] = await Promise.all([
      pool.query('SELECT * FROM lib_brands ORDER BY sort_order ASC'),
      pool.query('SELECT * FROM lib_series ORDER BY sort_order ASC'),
      pool.query('SELECT * FROM lib_values ORDER BY category, sort_order ASC'),
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
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const sortOrder = await insertOrdered(client, 'lib_brands', 'name', 'true', [], name.trim());
    const result = await client.query('INSERT INTO lib_brands (name, sort_order) VALUES ($1,$2) RETURNING *', [name.trim(), sortOrder]);
    await client.query('COMMIT');
    res.status(201).json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') return res.status(409).json({ error: 'Такой бренд уже есть' });
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  } finally { client.release(); }
});

router.put('/brands/reorder', authenticate, requirePermission('library', 'edit'), async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids)) return res.status(400).json({ error: 'Некорректные данные' });
  for (let i = 0; i < ids.length; i++) {
    await pool.query('UPDATE lib_brands SET sort_order=$1 WHERE id=$2', [(i + 1) * 100, ids[i]]);
  }
  res.json({ success: true });
});

router.delete('/brands/:id', authenticate, requirePermission('library', 'edit'), async (req, res) => {
  await pool.query('DELETE FROM lib_brands WHERE id=$1', [req.params.id]);
  res.json({ success: true });
});

router.post('/brands/:id/series', authenticate, requirePermission('library', 'edit'), async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Укажите название серии' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const sortOrder = await insertOrdered(client, 'lib_series', 'name', 'brand_id=$1', [req.params.id], name.trim());
    const result = await client.query('INSERT INTO lib_series (brand_id, name, sort_order) VALUES ($1,$2,$3) RETURNING *', [req.params.id, name.trim(), sortOrder]);
    await client.query('COMMIT');
    res.status(201).json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') return res.status(409).json({ error: 'Такая серия уже есть' });
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  } finally { client.release(); }
});

router.put('/series/reorder', authenticate, requirePermission('library', 'edit'), async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids)) return res.status(400).json({ error: 'Некорректные данные' });
  for (let i = 0; i < ids.length; i++) {
    await pool.query('UPDATE lib_series SET sort_order=$1 WHERE id=$2', [(i + 1) * 100, ids[i]]);
  }
  res.json({ success: true });
});

router.delete('/series/:id', authenticate, requirePermission('library', 'edit'), async (req, res) => {
  await pool.query('DELETE FROM lib_series WHERE id=$1', [req.params.id]);
  res.json({ success: true });
});

router.post('/values', authenticate, requirePermission('library', 'edit'), async (req, res) => {
  const { category, value } = req.body;
  if (!CATEGORIES.includes(category) || !value) return res.status(400).json({ error: 'Некорректные данные' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const sortOrder = await insertOrdered(client, 'lib_values', 'value', 'category=$1', [category], value.trim());
    const result = await client.query('INSERT INTO lib_values (category, value, sort_order) VALUES ($1,$2,$3) RETURNING *', [category, value.trim(), sortOrder]);
    await client.query('COMMIT');
    res.status(201).json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') return res.status(409).json({ error: 'Такое значение уже есть' });
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  } finally { client.release(); }
});

router.put('/values/reorder', authenticate, requirePermission('library', 'edit'), async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids)) return res.status(400).json({ error: 'Некорректные данные' });
  for (let i = 0; i < ids.length; i++) {
    await pool.query('UPDATE lib_values SET sort_order=$1 WHERE id=$2', [(i + 1) * 100, ids[i]]);
  }
  res.json({ success: true });
});

router.delete('/values/:id', authenticate, requirePermission('library', 'edit'), async (req, res) => {
  await pool.query('DELETE FROM lib_values WHERE id=$1', [req.params.id]);
  res.json({ success: true });
});

// Быстрое автосохранение нового значения "на лету" при добавлении модели на складе
router.post('/quick-add', authenticate, requirePermission('warehouse', 'edit'), async (req, res) => {
  const { category, value, brand_name, series_name } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (category === 'brand_series' && brand_name) {
      let brand = await client.query('SELECT * FROM lib_brands WHERE name=$1', [brand_name.trim()]);
      if (!brand.rows[0]) {
        const so = await insertOrdered(client, 'lib_brands', 'name', 'true', [], brand_name.trim());
        brand = await client.query('INSERT INTO lib_brands (name, sort_order) VALUES ($1,$2) RETURNING *', [brand_name.trim(), so]);
      }
      if (series_name) {
        const exists = await client.query('SELECT id FROM lib_series WHERE brand_id=$1 AND name=$2', [brand.rows[0].id, series_name.trim()]);
        if (!exists.rows[0]) {
          const so = await insertOrdered(client, 'lib_series', 'name', 'brand_id=$1', [brand.rows[0].id], series_name.trim());
          await client.query('INSERT INTO lib_series (brand_id, name, sort_order) VALUES ($1,$2,$3)', [brand.rows[0].id, series_name.trim(), so]);
        }
      }
    } else if (CATEGORIES.includes(category) && value) {
      const exists = await client.query('SELECT id FROM lib_values WHERE category=$1 AND value=$2', [category, value.trim()]);
      if (!exists.rows[0]) {
        const so = await insertOrdered(client, 'lib_values', 'value', 'category=$1', [category], value.trim());
        await client.query('INSERT INTO lib_values (category, value, sort_order) VALUES ($1,$2,$3)', [category, value.trim(), so]);
      }
    }
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  } finally { client.release(); }
});

module.exports = router;
