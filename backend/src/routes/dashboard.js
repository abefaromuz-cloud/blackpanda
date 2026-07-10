const express = require('express');
const pool = require('../db/pool');
const { authenticate, requirePermission } = require('../middleware/auth');
const router = express.Router();

router.get('/', authenticate, requirePermission('dashboard', 'view'), async (req, res) => {
  try {
    const [stock, sales30, settings, lowStock, debts, monthly, topModels] = await Promise.all([
      pool.query(`SELECT
          COUNT(*) FILTER (WHERE status_id IN (SELECT label FROM lib_statuses WHERE counts_as='instock'))   AS in_stock,
          COUNT(*) FILTER (WHERE status_id IN (SELECT label FROM lib_statuses WHERE counts_as='intransit')) AS in_transit,
          COUNT(*) FILTER (WHERE status_id IN (SELECT label FROM lib_statuses WHERE counts_as='reserved'))  AS reserved,
          COUNT(*) FILTER (WHERE status_id IN (SELECT label FROM lib_statuses WHERE counts_as='sold'))      AS sold
        FROM serials`),
      pool.query(`SELECT COALESCE(SUM(total_rub),0) AS total_rub, COUNT(*) AS count
        FROM sales WHERE created_at > now() - interval '30 days'`),
      pool.query('SELECT rate, cash_balance_rub FROM settings WHERE id=1'),
      pool.query(`
        SELECT l.id, l.brand, l.series, COUNT(s.id) FILTER (WHERE s.status_id IN (SELECT label FROM lib_statuses WHERE counts_as='instock')) AS in_stock, l.low_stock_threshold
        FROM laptops l LEFT JOIN serials s ON s.laptop_id=l.id
        WHERE l.is_archived=false
        GROUP BY l.id
        HAVING COUNT(s.id) FILTER (WHERE s.status_id IN (SELECT label FROM lib_statuses WHERE counts_as='instock')) <= l.low_stock_threshold
      `),
      pool.query(`SELECT id, name, debt_rub FROM clients WHERE debt_rub > 0 ORDER BY debt_rub DESC`),
      // Продажи и прибыль по месяцам за последние 6 месяцев — для графика
      pool.query(`
        SELECT to_char(date_trunc('month', s.created_at), 'YYYY-MM') AS month,
          COALESCE(SUM(s.total_rub),0) AS revenue_rub,
          COALESCE(SUM(si.total_cny * (SELECT rate FROM settings WHERE id=1)), 0)
            - COALESCE(SUM(si.price_cost_cny * si.qty * (SELECT rate FROM settings WHERE id=1)), 0) AS profit_rub
        FROM sales s LEFT JOIN sale_items si ON si.sale_id = s.id
        WHERE s.created_at > now() - interval '6 months'
        GROUP BY 1 ORDER BY 1
      `),
      // Топ-5 самых продаваемых моделей
      pool.query(`
        SELECT l.brand, l.series, COALESCE(SUM(si.qty),0) AS sold_qty
        FROM sale_items si JOIN laptops l ON l.id = si.laptop_id
        GROUP BY l.id, l.brand, l.series
        ORDER BY sold_qty DESC LIMIT 5
      `),
    ]);
    res.json({
      stock: stock.rows[0],
      sales30d: sales30.rows[0],
      rate: Number(settings.rows[0].rate),
      cash_balance_rub: Number(settings.rows[0].cash_balance_rub),
      low_stock: lowStock.rows,
      debts: debts.rows,
      monthly: monthly.rows,
      top_models: topModels.rows,
    });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

module.exports = router;
