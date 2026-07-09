const express = require('express');
const pool = require('../db/pool');
const { authenticate, requirePermission } = require('../middleware/auth');
const router = express.Router();

// Поиск по серийнику (для сканера) — отдаёт статус и модель
router.get('/lookup/:serial', authenticate, requirePermission('warehouse', 'view'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT s.*, l.brand, l.series FROM serials s JOIN laptops l ON l.id=s.laptop_id WHERE s.serial=$1`,
      [req.params.serial]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Серийник не найден' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

// Добавить один серийник на склад (приход товара)
router.post('/', authenticate, requirePermission('warehouse', 'edit'), async (req, res) => {
  const { laptop_id, serial, status_id, warranty_months, notes } = req.body;
  if (!laptop_id || !serial) return res.status(400).json({ error: 'Укажите модель и серийный номер' });
  try {
    const result = await pool.query(
      `INSERT INTO serials (laptop_id, serial, status_id, arrival_date, warranty_months, notes)
       VALUES ($1,$2,$3, now(), $4,$5) RETURNING *`,
      [laptop_id, serial.trim(), status_id || 's2', warranty_months || 3, notes || null]
    );
    await pool.query(
      `INSERT INTO serial_history (serial_id, status_id, note) VALUES ($1,$2,$3)`,
      [result.rows[0].id, status_id || 's2', 'Добавлен на склад']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Такой серийник уже существует' });
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// Массовое добавление серийников (импорт списком)
router.post('/bulk', authenticate, requirePermission('warehouse', 'edit'), async (req, res) => {
  const { laptop_id, serials } = req.body; // serials: string[]
  if (!laptop_id || !Array.isArray(serials) || !serials.length) return res.status(400).json({ error: 'Нет данных для импорта' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const created = [];
    for (const sn of serials) {
      const s = sn.trim();
      if (!s) continue;
      const r = await client.query(
        `INSERT INTO serials (laptop_id, serial, status_id, arrival_date) VALUES ($1,$2,'s2', now())
         ON CONFLICT (serial) DO NOTHING RETURNING *`,
        [laptop_id, s]
      );
      if (r.rows[0]) created.push(r.rows[0]);
    }
    await client.query('COMMIT');
    res.status(201).json({ created: created.length, skipped: serials.length - created.length, items: created });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  } finally { client.release(); }
});

router.put('/:id', authenticate, requirePermission('warehouse', 'edit'), async (req, res) => {
  const { status_id, notes, warranty_months } = req.body;
  try {
    const result = await pool.query(
      `UPDATE serials SET status_id=COALESCE($1,status_id), notes=COALESCE($2,notes), warranty_months=COALESCE($3,warranty_months)
       WHERE id=$4 RETURNING *`,
      [status_id||null, notes ?? null, warranty_months||null, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Не найден' });
    if (status_id) {
      await pool.query('INSERT INTO serial_history (serial_id, status_id, note) VALUES ($1,$2,$3)',
        [req.params.id, status_id, 'Статус изменён вручную']);
    }
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

router.delete('/:id', authenticate, requirePermission('warehouse', 'edit'), async (req, res) => {
  try {
    await pool.query('DELETE FROM serials WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

module.exports = router;
