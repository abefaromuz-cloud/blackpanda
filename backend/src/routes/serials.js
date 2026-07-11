const express = require('express');
const pool = require('../db/pool');
const { authenticate, requirePermission } = require('../middleware/auth');
const router = express.Router();

// Поиск по ЧАСТИ серийного номера (для поисковой строки на складе) — важно: этот роут должен идти
// раньше /lookup/:serial и /detail/:id, иначе Express примет 'search' за параметр :serial
router.get('/search', authenticate, requirePermission('warehouse', 'view'), async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q || q.length < 2) return res.json([]);
  try {
    const result = await pool.query(
      `SELECT s.id, s.serial, s.status_id, l.id AS laptop_id, l.brand, l.series
       FROM serials s JOIN laptops l ON l.id = s.laptop_id
       WHERE s.serial ILIKE $1
       ORDER BY s.serial LIMIT 20`,
      [`%${q}%`]
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

// Поиск по серийнику (для сканера) — отдаёт статус и модель
router.get('/lookup/:serial', authenticate, requirePermission('warehouse', 'view'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT s.*, l.brand, l.series, st.counts_as AS bucket
       FROM serials s JOIN laptops l ON l.id=s.laptop_id
       LEFT JOIN lib_statuses st ON st.label = s.status_id
       WHERE s.serial=$1`,
      [req.params.serial]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Серийник не найден' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

// Полная карточка серийника: спецификации, история, последний связанный клиент
router.get('/detail/:id', authenticate, requirePermission('warehouse', 'view'), async (req, res) => {
  try {
    const [s, history] = await Promise.all([
      pool.query(`
        SELECT s.*, l.brand, l.series, l.cpu, l.ram, l.gpu, l.storage, l.color, l.screen, c.name AS client_name
        FROM serials s JOIN laptops l ON l.id = s.laptop_id
        LEFT JOIN clients c ON c.id = s.sale_client_id
        WHERE s.id=$1
      `, [req.params.id]),
      pool.query('SELECT * FROM serial_history WHERE serial_id=$1 ORDER BY created_at DESC', [req.params.id]),
    ]);
    if (!s.rows[0]) return res.status(404).json({ error: 'Серийник не найден' });
    res.json({ ...s.rows[0], history: history.rows });
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
      [laptop_id, serial.trim(), status_id || 'На складе', warranty_months || 3, notes || null]
    );
    await pool.query(
      `INSERT INTO serial_history (serial_id, status_id, note) VALUES ($1,$2,$3)`,
      [result.rows[0].id, status_id || 'На складе', 'Добавлен на склад']
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
        `INSERT INTO serials (laptop_id, serial, status_id, arrival_date) VALUES ($1,$2,'На складе', now())
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
  const { status_id, notes, warranty_months, warranty_notify, arrival_date, sale_date, history_note } = req.body;
  try {
    const result = await pool.query(
      `UPDATE serials SET status_id=COALESCE($1,status_id), notes=COALESCE($2,notes), warranty_months=COALESCE($3,warranty_months),
        warranty_notify=COALESCE($4,warranty_notify), arrival_date=COALESCE($5,arrival_date), sale_date=COALESCE($6,sale_date)
       WHERE id=$7 RETURNING *`,
      [status_id||null, notes ?? null, warranty_months||null, warranty_notify ?? null, arrival_date||null, sale_date||null, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Не найден' });
    if (status_id) {
      await pool.query('INSERT INTO serial_history (serial_id, status_id, note) VALUES ($1,$2,$3)',
        [req.params.id, status_id, history_note || 'Статус изменён вручную']);
    }
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

// Своя цена продажи для конкретной единицы (например, "Склад (восст.)" со скидкой) —
// отдельный эндпоинт, чтобы явно различать "не менять" и "сбросить обратно на цену модели"
router.put('/:id/price-override', authenticate, requirePermission('warehouse', 'edit'), async (req, res) => {
  const { price_override_cny } = req.body; // null или '' — сброс на цену модели
  const value = (price_override_cny === '' || price_override_cny === null || price_override_cny === undefined) ? null : price_override_cny;
  const result = await pool.query('UPDATE serials SET price_override_cny=$1 WHERE id=$2 RETURNING *', [value, req.params.id]);
  if (!result.rows[0]) return res.status(404).json({ error: 'Не найден' });
  res.json(result.rows[0]);
});

// Оформить возврат: фиксируется от какого клиента и по какой причине, новый статус выбирает сотрудник
// (например "Склад (восст.)", "Гарантия КНР", "На ремонте" — а не всегда просто обратно "На складе")
router.post('/:id/return', authenticate, requirePermission('warehouse', 'edit'), async (req, res) => {
  const { reason, new_status } = req.body;
  if (!new_status) return res.status(400).json({ error: 'Укажите новый статус после возврата' });
  try {
    const sr = await pool.query('SELECT s.*, c.name AS client_name FROM serials s LEFT JOIN clients c ON c.id=s.sale_client_id WHERE s.id=$1', [req.params.id]);
    if (!sr.rows[0]) return res.status(404).json({ error: 'Не найден' });
    await pool.query(`UPDATE serials SET status_id=$1 WHERE id=$2`, [new_status, req.params.id]);
    const note = `Возврат${sr.rows[0].client_name ? ' от клиента ' + sr.rows[0].client_name : ''}${reason ? ': ' + reason : ''} → новый статус: ${new_status}`;
    await pool.query('INSERT INTO serial_history (serial_id, status_id, note) VALUES ($1,$2,$3)', [req.params.id, new_status, note]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

router.delete('/:id', authenticate, requirePermission('warehouse', 'edit'), async (req, res) => {
  try {
    await pool.query('DELETE FROM serials WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

module.exports = router;
