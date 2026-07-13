const express = require('express');
const pool = require('../db/pool');
const { authenticate, requirePermission } = require('../middleware/auth');
const { logActivity } = require('../utils/activityLog');
const { notifyIfPreorderWaiting } = require('../utils/preorderNotify');
const router = express.Router();

// Отчёт по приходам — группируется по дате и модели прямо из реальных данных склада,
// без отдельного лога: "числа такого-то пришло стольких-то штук той-то модели"
router.get('/', authenticate, requirePermission('arrivals', 'view'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT s.arrival_date::date AS date, l.id AS laptop_id, l.brand, l.series,
        COUNT(*) AS qty,
        COALESCE(SUM(COALESCE(s.cost_cny, l.cost_cny)),0) AS total_cost_cny,
        COALESCE(AVG(COALESCE(s.cost_cny, l.cost_cny)),0) AS avg_cost_cny
      FROM serials s JOIN laptops l ON l.id = s.laptop_id
      WHERE s.arrival_date IS NOT NULL
      GROUP BY s.arrival_date::date, l.id, l.brand, l.series
      ORDER BY date DESC, l.brand
    `);
    // Группируем построчный результат по датам для удобного вывода на фронте
    const byDate = {};
    for (const row of result.rows) {
      const key = row.date.toISOString().slice(0, 10);
      if (!byDate[key]) byDate[key] = { date: key, totalQty: 0, totalCostCny: 0, items: [] };
      byDate[key].totalQty += Number(row.qty);
      byDate[key].totalCostCny += Number(row.total_cost_cny);
      byDate[key].items.push({
        laptop_id: row.laptop_id, brand: row.brand, series: row.series,
        qty: Number(row.qty), total_cost_cny: Number(row.total_cost_cny), avg_cost_cny: Number(row.avg_cost_cny),
      });
    }
    res.json(Object.values(byDate));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

// Оформить приход партии: модель + список серийников + своя себестоимость на эту партию + дата
router.post('/', authenticate, requirePermission('arrivals', 'edit'), async (req, res) => {
  const { laptop_id, serials, cost_cny, arrival_date, note } = req.body;
  if (!laptop_id || !Array.isArray(serials) || !serials.length) return res.status(400).json({ error: 'Укажите модель и серийники' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const created = [];
    for (const sn of serials) {
      const s = sn.trim();
      if (!s) continue;
      const r = await client.query(
        `INSERT INTO serials (laptop_id, serial, status_id, arrival_date, cost_cny, arrival_note)
         VALUES ($1,$2,'На складе',COALESCE($3, now()),$4,$5)
         ON CONFLICT (serial) DO NOTHING RETURNING *`,
        [laptop_id, s, arrival_date || null, cost_cny || null, note || null]
      );
      if (r.rows[0]) {
        created.push(r.rows[0]);
        await client.query(`INSERT INTO serial_history (serial_id, status_id, note) VALUES ($1,'На складе',$2)`,
          [r.rows[0].id, 'Приход товара' + (note ? ': ' + note : '')]);
      }
    }
    await client.query('COMMIT');
    await logActivity(req.user, 'Приход товара', 'arrival', `${created.length} шт.`);

    if (created.length > 0) await notifyIfPreorderWaiting(laptop_id, req.user.id);

    res.status(201).json({ created: created.length, skipped: serials.length - created.length });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  } finally { client.release(); }
});

module.exports = router;
