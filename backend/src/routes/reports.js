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

// Детальный реестр продаж для бухгалтерии — построчно по каждому серийному номеру,
// с реальным историческим курсом на момент именно этой продажи (не текущим),
// себестоимостью, прибылью, сотрудником и статусом оплаты
router.get('/sales-register', authenticate, requirePermission('reports', 'view'), async (req, res) => {
  const { from, to } = req.query;
  try {
    const result = await pool.query(`
      SELECT
        s.id AS sale_id, s.created_at, s.rate, s.payment_mode,
        c.name AS client_name,
        l.brand, l.series,
        ser.serial,
        si.price_cost_cny, si.price_sell_cny,
        u.full_name AS employee_name,
        COALESCE((SELECT SUM(d.amount_rub - d.amount_paid_rub) FROM debts d WHERE d.sale_id = s.id AND d.status='open'), 0)
          + COALESCE((SELECT SUM((d.amount_cny - d.amount_paid_cny) * s.rate) FROM debts d WHERE d.sale_id = s.id AND d.status='open' AND d.amount_cny IS NOT NULL), 0)
          AS open_debt_rub
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      JOIN clients c ON c.id = s.client_id
      JOIN laptops l ON l.id = si.laptop_id
      LEFT JOIN users u ON u.id = s.created_by
      CROSS JOIN LATERAL unnest(si.serial_ids) AS serial_id
      JOIN serials ser ON ser.id = serial_id
      WHERE ($1::timestamptz IS NULL OR s.created_at >= $1) AND ($2::timestamptz IS NULL OR s.created_at <= $2)
      ORDER BY s.created_at DESC
    `, [from || null, to || null]);

    const rows = result.rows.map(r => {
      const costRub = Number(r.price_cost_cny) * Number(r.rate);
      const sellRub = Number(r.price_sell_cny) * Number(r.rate);
      return {
        sale_id: r.sale_id, created_at: r.created_at, rate: Number(r.rate),
        client_name: r.client_name, brand: r.brand, series: r.series, serial: r.serial,
        cost_cny: Number(r.price_cost_cny), cost_rub: Math.round(costRub * 100) / 100,
        sell_cny: Number(r.price_sell_cny), sell_rub: Math.round(sellRub * 100) / 100,
        profit_rub: Math.round((sellRub - costRub) * 100) / 100,
        payment_mode: r.payment_mode, employee_name: r.employee_name || '—',
        open_debt_rub: Math.round(Number(r.open_debt_rub) * 100) / 100,
        payment_status: Number(r.open_debt_rub) > 0.5 ? 'Есть долг' : 'Оплачено',
      };
    });
    const totals = rows.reduce((acc, r) => ({
      cost_rub: acc.cost_rub + r.cost_rub, sell_rub: acc.sell_rub + r.sell_rub,
      profit_rub: acc.profit_rub + r.profit_rub, open_debt_rub: acc.open_debt_rub + r.open_debt_rub,
    }), { cost_rub: 0, sell_rub: 0, profit_rub: 0, open_debt_rub: 0 });
    res.json({ rows, totals });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

// Реестр прихода товара (закупки) — построчно по каждому серийнику: дата поступления,
// себестоимость (своя у партии, если задана, иначе цена модели), примечание к партии
router.get('/purchases-register', authenticate, requirePermission('reports', 'view'), async (req, res) => {
  const { from, to } = req.query;
  try {
    const result = await pool.query(`
      SELECT s.serial, s.arrival_date, s.arrival_note, l.brand, l.series,
        COALESCE(s.cost_cny, l.cost_cny) AS cost_cny
      FROM serials s JOIN laptops l ON l.id = s.laptop_id
      WHERE s.arrival_date IS NOT NULL
        AND ($1::timestamptz IS NULL OR s.arrival_date >= $1) AND ($2::timestamptz IS NULL OR s.arrival_date <= $2)
      ORDER BY s.arrival_date DESC
    `, [from || null, to || null]);
    const totalCny = result.rows.reduce((s, r) => s + Number(r.cost_cny), 0);
    res.json({ rows: result.rows, totals: { total_cny: totalCny, count: result.rows.length } });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

// Реестр движения денежных средств (касса + банки) за период
router.get('/cashflow-register', authenticate, requirePermission('reports', 'view'), async (req, res) => {
  const { from, to } = req.query;
  try {
    const result = await pool.query(`
      SELECT cl.created_at, cl.type, cl.amount_rub, cl.note, cl.category, cl.bank_key, cl.recipient, c.name AS client_name
      FROM cash_log cl LEFT JOIN clients c ON c.id = cl.client_id
      WHERE ($1::timestamptz IS NULL OR cl.created_at >= $1) AND ($2::timestamptz IS NULL OR cl.created_at <= $2)
      ORDER BY cl.created_at DESC
    `, [from || null, to || null]);
    const totalIn = result.rows.filter(r => r.type === 'in').reduce((s, r) => s + Number(r.amount_rub), 0);
    const totalOut = result.rows.filter(r => r.type === 'out').reduce((s, r) => s + Number(r.amount_rub), 0);
    res.json({ rows: result.rows, totals: { in: totalIn, out: totalOut, net: totalIn - totalOut } });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

module.exports = router;
