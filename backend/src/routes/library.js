const express = require('express');
const pool = require('../db/pool');
const { authenticate, requirePermission } = require('../middleware/auth');
const { insertOrdered, renumber } = require('../utils/ordering');
const router = express.Router();

const CATEGORIES = ['cpu', 'gpu', 'ram', 'storage', 'color', 'screen'];
const STATUS_BUCKETS = ['instock', 'intransit', 'reserved', 'sold', 'other'];

router.get('/', authenticate, requirePermission('library', 'view'), async (req, res) => {
  try {
    const [brands, series, values, statuses] = await Promise.all([
      pool.query('SELECT * FROM lib_brands ORDER BY sort_order ASC'),
      pool.query('SELECT * FROM lib_series ORDER BY sort_order ASC'),
      pool.query('SELECT * FROM lib_values ORDER BY category, sort_order ASC'),
      pool.query('SELECT * FROM lib_statuses ORDER BY sort_order ASC'),
    ]);
    const brandsWithSeries = brands.rows.map(b => ({
      ...b, series: series.rows.filter(s => s.brand_id === b.id),
    }));
    const byCategory = {};
    CATEGORIES.forEach(c => { byCategory[c] = values.rows.filter(v => v.category === c); });
    res.json({ brands: brandsWithSeries, values: byCategory, statuses: statuses.rows });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

// Список статусов доступен также с правом просмотра склада — он нужен в выпадающих списках
// на страницах товара/серийника, куда заходят и без доступа к самому Справочнику
router.get('/statuses', authenticate, requirePermission('warehouse', 'view'), async (req, res) => {
  const result = await pool.query('SELECT * FROM lib_statuses ORDER BY sort_order ASC');
  res.json(result.rows);
});

router.post('/statuses', authenticate, requirePermission('library', 'edit'), async (req, res) => {
  const { label, label_zh, counts_as } = req.body;
  if (!label || !STATUS_BUCKETS.includes(counts_as)) return res.status(400).json({ error: 'Некорректные данные' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const sortOrder = await insertOrdered(client, 'lib_statuses', 'label', 'true', [], label.trim());
    const result = await client.query('INSERT INTO lib_statuses (label, label_zh, counts_as, sort_order) VALUES ($1,$2,$3,$4) RETURNING *', [label.trim(), label_zh || null, counts_as, sortOrder]);
    await client.query('COMMIT');
    res.status(201).json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') return res.status(409).json({ error: 'Такой статус уже есть' });
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  } finally { client.release(); }
});

router.put('/statuses/reorder', authenticate, requirePermission('library', 'edit'), async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids)) return res.status(400).json({ error: 'Некорректные данные' });
  for (let i = 0; i < ids.length; i++) {
    await pool.query('UPDATE lib_statuses SET sort_order=$1 WHERE id=$2', [(i + 1) * 100, ids[i]]);
  }
  res.json({ success: true });
});

router.put('/statuses/:id', authenticate, requirePermission('library', 'edit'), async (req, res) => {
  const { label, label_zh, counts_as } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query('SELECT label FROM lib_statuses WHERE id=$1', [req.params.id]);
    if (!current.rows[0]) throw { status: 404, message: 'Не найдено' };
    const oldLabel = current.rows[0].label;
    const newLabel = label?.trim() || oldLabel;

    const result = await client.query(
      'UPDATE lib_statuses SET label=$1, label_zh=COALESCE($2,label_zh), counts_as=COALESCE($3,counts_as) WHERE id=$4 RETURNING *',
      [newLabel, label_zh ?? null, counts_as || null, req.params.id]
    );
    // Если название поменялось — переносим статус у уже сохранённых серийников, чтобы не "осиротить" их
    if (newLabel !== oldLabel) {
      await client.query('UPDATE serials SET status_id=$1 WHERE status_id=$2', [newLabel, oldLabel]);
      await client.query('UPDATE serial_history SET status_id=$1 WHERE status_id=$2', [newLabel, oldLabel]);
    }
    await client.query('COMMIT');
    res.json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.status) return res.status(err.status).json({ error: err.message });
    if (err.code === '23505') return res.status(409).json({ error: 'Такой статус уже есть' });
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  } finally { client.release(); }
});

router.delete('/statuses/:id', authenticate, requirePermission('library', 'edit'), async (req, res) => {
  await pool.query('DELETE FROM lib_statuses WHERE id=$1', [req.params.id]);
  res.json({ success: true });
});

router.post('/brands', authenticate, requirePermission('library', 'edit'), async (req, res) => {
  const { name, name_zh } = req.body;
  if (!name) return res.status(400).json({ error: 'Укажите название бренда' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const sortOrder = await insertOrdered(client, 'lib_brands', 'name', 'true', [], name.trim());
    const result = await client.query('INSERT INTO lib_brands (name, name_zh, sort_order) VALUES ($1,$2,$3) RETURNING *', [name.trim(), name_zh || null, sortOrder]);
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

router.put('/brands/:id', authenticate, requirePermission('library', 'edit'), async (req, res) => {
  const { name, name_zh } = req.body;
  try {
    const result = await pool.query(
      'UPDATE lib_brands SET name=COALESCE($1,name), name_zh=COALESCE($2,name_zh) WHERE id=$3 RETURNING *',
      [name?.trim() || null, name_zh ?? null, req.params.id]
    );
    res.json(result.rows[0]);
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
  const { name, name_zh } = req.body;
  if (!name) return res.status(400).json({ error: 'Укажите название серии' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const sortOrder = await insertOrdered(client, 'lib_series', 'name', 'brand_id=$1', [req.params.id], name.trim());
    const result = await client.query('INSERT INTO lib_series (brand_id, name, name_zh, sort_order) VALUES ($1,$2,$3,$4) RETURNING *', [req.params.id, name.trim(), name_zh || null, sortOrder]);
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

router.put('/series/:id', authenticate, requirePermission('library', 'edit'), async (req, res) => {
  const { name, name_zh } = req.body;
  try {
    const result = await pool.query(
      'UPDATE lib_series SET name=COALESCE($1,name), name_zh=COALESCE($2,name_zh) WHERE id=$3 RETURNING *',
      [name?.trim() || null, name_zh ?? null, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Такая серия уже есть' });
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

router.delete('/series/:id', authenticate, requirePermission('library', 'edit'), async (req, res) => {
  await pool.query('DELETE FROM lib_series WHERE id=$1', [req.params.id]);
  res.json({ success: true });
});

router.post('/values', authenticate, requirePermission('library', 'edit'), async (req, res) => {
  const { category, value, value_zh } = req.body;
  if (!CATEGORIES.includes(category) || !value) return res.status(400).json({ error: 'Некорректные данные' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const sortOrder = await insertOrdered(client, 'lib_values', 'value', 'category=$1', [category], value.trim());
    const result = await client.query('INSERT INTO lib_values (category, value, value_zh, sort_order) VALUES ($1,$2,$3,$4) RETURNING *', [category, value.trim(), value_zh || null, sortOrder]);
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

router.put('/values/:id', authenticate, requirePermission('library', 'edit'), async (req, res) => {
  const { value, value_zh } = req.body;
  try {
    const result = await pool.query(
      'UPDATE lib_values SET value=COALESCE($1,value), value_zh=COALESCE($2,value_zh) WHERE id=$3 RETURNING *',
      [value?.trim() || null, value_zh ?? null, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Такое значение уже есть' });
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
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
