const express = require('express');
const pool = require('../db/pool');
const { authenticate, requirePermission } = require('../middleware/auth');
const router = express.Router();

router.get('/', authenticate, requirePermission('dashboard', 'view'), async (req, res) => {
  try {
    const [
      stock, sales30, settings, lowStock, debts, monthly, topModels,
      specialStatuses, yearlyProfit, byBrand, recentSales, recentActivity, tasks,
    ] = await Promise.all([
      pool.query(`SELECT
          COUNT(*) FILTER (WHERE s.status_id IN (SELECT label FROM lib_statuses WHERE counts_as='instock'))   AS in_stock,
          COUNT(*) FILTER (WHERE s.status_id IN (SELECT label FROM lib_statuses WHERE counts_as='intransit')) AS in_transit,
          COUNT(*) FILTER (WHERE s.status_id IN (SELECT label FROM lib_statuses WHERE counts_as='reserved'))  AS reserved,
          COUNT(*) FILTER (WHERE s.status_id IN (SELECT label FROM lib_statuses WHERE counts_as='sold'))      AS sold,
          COUNT(DISTINCT l.id) FILTER (WHERE s.status_id IN (SELECT label FROM lib_statuses WHERE counts_as='instock')) AS models_in_stock
        FROM serials s JOIN laptops l ON l.id = s.laptop_id
        WHERE l.is_archived = false`),
      pool.query(`SELECT COALESCE(SUM(total_rub),0) AS total_rub, COUNT(*) AS count
        FROM sales WHERE created_at > now() - interval '30 days'`),
      pool.query('SELECT rate, cash_balance_rub FROM settings WHERE id=1'),
      pool.query(`
        SELECT l.id, l.brand, l.series, COUNT(s.id) FILTER (WHERE s.status_id IN (SELECT label FROM lib_statuses WHERE counts_as='instock')) AS in_stock, l.low_stock_threshold
        FROM laptops l LEFT JOIN serials s ON s.laptop_id=l.id
        WHERE l.is_archived=false
        GROUP BY l.id
        HAVING COUNT(s.id) FILTER (WHERE s.status_id IN (SELECT label FROM lib_statuses WHERE counts_as='instock')) <= l.low_stock_threshold
        ORDER BY COUNT(s.id) FILTER (WHERE s.status_id IN (SELECT label FROM lib_statuses WHERE counts_as='instock')) ASC
        LIMIT 5
      `),
      // Должники — берём из реальной таблицы долгов, а не устаревшего поля clients.debt_rub.
      // Долг в юанях и долг в рублях у одного клиента — РАЗНЫЕ суммы, показываем отдельно
      // (клиент мог купить один товар в долг по юаневой цене, а другой — просто занять в рублях).
      pool.query(`
        SELECT c.id, c.name,
          COALESCE(SUM(d.amount_rub - d.amount_paid_rub) FILTER (WHERE d.amount_cny IS NULL), 0) AS debt_rub,
          COALESCE(SUM(d.amount_cny - d.amount_paid_cny) FILTER (WHERE d.amount_cny IS NOT NULL), 0) AS debt_cny
        FROM clients c JOIN debts d ON d.client_id = c.id AND d.status='open'
        GROUP BY c.id, c.name
        HAVING COALESCE(SUM(d.amount_rub - d.amount_paid_rub) FILTER (WHERE d.amount_cny IS NULL), 0) > 0
            OR COALESCE(SUM(d.amount_cny - d.amount_paid_cny) FILTER (WHERE d.amount_cny IS NOT NULL), 0) > 0
        ORDER BY (COALESCE(SUM(d.amount_rub - d.amount_paid_rub) FILTER (WHERE d.amount_cny IS NULL), 0)
          + COALESCE(SUM(d.amount_cny - d.amount_paid_cny) FILTER (WHERE d.amount_cny IS NOT NULL), 0) * (SELECT rate FROM settings WHERE id=1)) DESC
      `),
      pool.query(`
        SELECT to_char(date_trunc('month', s.created_at), 'YYYY-MM') AS month,
          COALESCE(SUM(s.total_rub),0) AS revenue_rub,
          COALESCE(SUM(si.total_cny * (SELECT rate FROM settings WHERE id=1)), 0)
            - COALESCE(SUM(si.price_cost_cny * si.qty * (SELECT rate FROM settings WHERE id=1)), 0) AS profit_rub
        FROM sales s LEFT JOIN sale_items si ON si.sale_id = s.id
        WHERE s.created_at > now() - interval '6 months'
        GROUP BY 1 ORDER BY 1
      `),
      pool.query(`
        SELECT l.brand, l.series, COALESCE(SUM(si.qty),0) AS sold_qty
        FROM sale_items si JOIN laptops l ON l.id = si.laptop_id
        GROUP BY l.id, l.brand, l.series
        ORDER BY sold_qty DESC LIMIT 5
      `),
      // Специальные статусы для отдельных карточек на дашборде
      pool.query(`
        SELECT s.status_id, COUNT(*) AS qty FROM serials s JOIN laptops l ON l.id = s.laptop_id
        WHERE l.is_archived = false AND s.status_id IN ('Возврат','Гарантия КНР','Склад (восст.)')
        GROUP BY s.status_id
      `),
      // Прибыль за текущий календарный год
      pool.query(`
        SELECT
          COALESCE(SUM(si.total_cny * st.rate),0) AS revenue_rub,
          COALESCE(SUM(si.price_cost_cny * si.qty * st.rate),0) AS cost_rub
        FROM sales s JOIN sale_items si ON si.sale_id = s.id
        CROSS JOIN (SELECT rate FROM settings WHERE id=1) st
        WHERE date_part('year', s.created_at) = date_part('year', now())
      `),
      pool.query(`
        SELECT l.brand, COUNT(*) AS qty
        FROM serials s JOIN laptops l ON l.id = s.laptop_id
        WHERE s.status_id IN (SELECT label FROM lib_statuses WHERE counts_as='sold')
        GROUP BY l.brand ORDER BY qty DESC LIMIT 6
      `),
      // Последние проданные устройства
      pool.query(`
        SELECT s.id, s.created_at, s.total_rub, s.total_cny, c.name AS client_name,
          COALESCE(json_agg(json_build_object('brand', l.brand, 'series', l.series, 'qty', si.qty)) FILTER (WHERE si.id IS NOT NULL), '[]') AS items
        FROM sales s LEFT JOIN clients c ON c.id = s.client_id
        LEFT JOIN sale_items si ON si.sale_id = s.id
        LEFT JOIN laptops l ON l.id = si.laptop_id
        GROUP BY s.id, c.name
        ORDER BY s.created_at DESC LIMIT 5
      `),
      pool.query('SELECT * FROM activity_log ORDER BY created_at DESC LIMIT 5'),
      pool.query(`
        SELECT t.*, c.name AS client_name FROM tasks t LEFT JOIN clients c ON c.id = t.client_id
        WHERE t.done = false ORDER BY t.due_date NULLS LAST, t.created_at LIMIT 20
      `),
    ]);

    const statusMap = {};
    specialStatuses.rows.forEach(r => { statusMap[r.status_id] = Number(r.qty); });

    const yp = yearlyProfit.rows[0];
    const yearlyProfitRub = Number(yp.revenue_rub) - Number(yp.cost_rub);

    res.json({
      stock: stock.rows[0],
      sales30d: sales30.rows[0],
      rate: Number(settings.rows[0].rate),
      cash_balance_rub: Number(settings.rows[0].cash_balance_rub),
      low_stock: lowStock.rows,
      debts: debts.rows,
      monthly: monthly.rows,
      top_models: topModels.rows,
      special_statuses: {
        return: statusMap['Возврат'] || 0,
        sent_to_cn: statusMap['Гарантия КНР'] || 0,
        refurbished: statusMap['Склад (восст.)'] || 0,
      },
      yearly_profit_rub: yearlyProfitRub,
      by_brand: byBrand.rows.map(r => ({ brand: r.brand, qty: Number(r.qty) })),
      recent_sales: recentSales.rows,
      recent_activity: recentActivity.rows,
      tasks: tasks.rows,
    });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

module.exports = router;
