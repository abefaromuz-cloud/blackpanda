const express = require('express');
const pool = require('../db/pool');
const { authenticate, requirePermission } = require('../middleware/auth');
const router = express.Router();

// Отчёт по продажам за период
router.get('/sales', authenticate, requirePermission('reports', 'view'), async (req, res) => {
  const { from, to } = req.query;
  try {
    const result = await pool.query(
      `SELECT s.id, s.created_at, c.name AS client_name, s.total_cny, s.total_rub, s.payment_mode
       FROM sales s JOIN clients c ON c.id = s.client_id
       WHERE ($1::timestamptz IS NULL OR s.created_at >= $1) AND ($2::timestamptz IS NULL OR s.created_at <= $2)
       ORDER BY s.created_at DESC`,
      [from || null, to || null]
    );
    const totals = result.rows.reduce((acc, r) => ({
      total_cny: acc.total_cny + Number(r.total_cny),
      total_rub: acc.total_rub + Number(r.total_rub),
    }), { total_cny: 0, total_rub: 0 });
    res.json({ rows: result.rows, totals });
  } catch (err) { res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

// Отчёт по остаткам склада на текущий момент
router.get('/warehouse', authenticate, requirePermission('reports', 'view'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT l.brand, l.series, l.cost_cny, l.price_sell_cny,
        COUNT(s.id) FILTER (WHERE s.status_id IN (SELECT label FROM lib_statuses WHERE counts_as='instock')) AS in_stock
      FROM laptops l LEFT JOIN serials s ON s.laptop_id = l.id
      WHERE l.is_archived = false
      GROUP BY l.id ORDER BY l.brand, l.series
    `);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

// CSV-экспорт отчёта по продажам за период
router.get('/sales/export', authenticate, requirePermission('reports', 'view'), async (req, res) => {
  const { from, to } = req.query;
  try {
    const result = await pool.query(
      `SELECT s.created_at, c.name AS client_name, s.total_cny, s.total_rub, s.payment_mode
       FROM sales s JOIN clients c ON c.id = s.client_id
       WHERE ($1::timestamptz IS NULL OR s.created_at >= $1) AND ($2::timestamptz IS NULL OR s.created_at <= $2)
       ORDER BY s.created_at DESC`,
      [from || null, to || null]
    );
    const header = 'Дата,Клиент,Сумма CNY,Сумма RUB,Оплата\n';
    const body = result.rows.map(r =>
      `${new Date(r.created_at).toLocaleString('ru-RU')},"${r.client_name}",${r.total_cny},${r.total_rub},${r.payment_mode}`
    ).join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="sales-report.csv"');
    res.send('\uFEFF' + header + body);
  } catch (err) { res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

module.exports = router;
