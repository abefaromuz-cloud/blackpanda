const express = require('express');
const pool = require('../db/pool');
const { authenticate, requirePermission } = require('../middleware/auth');
const router = express.Router();

router.get('/', authenticate, requirePermission('finance', 'view'), async (req, res) => {
  try {
    const [pnl, expensesByCategory, totals] = await Promise.all([
      // Выручка, себестоимость и валовая прибыль по месяцам (последние 12 месяцев)
      pool.query(`
        SELECT to_char(date_trunc('month', s.created_at), 'YYYY-MM') AS month,
          COALESCE(SUM(si.total_cny * st.rate),0) AS revenue_rub,
          COALESCE(SUM(si.price_cost_cny * si.qty * st.rate),0) AS cost_rub
        FROM sales s
        JOIN sale_items si ON si.sale_id = s.id
        CROSS JOIN (SELECT rate FROM settings WHERE id=1) st
        WHERE s.created_at > now() - interval '12 months'
        GROUP BY 1 ORDER BY 1
      `),
      pool.query(`
        SELECT COALESCE(category,'other') AS category, SUM(amount_rub) AS total
        FROM cash_log WHERE type='out' AND created_at > now() - interval '12 months'
        GROUP BY 1 ORDER BY total DESC
      `),
      pool.query(`
        SELECT
          COALESCE((SELECT SUM(si.total_cny * st.rate) FROM sale_items si CROSS JOIN (SELECT rate FROM settings WHERE id=1) st),0) AS lifetime_revenue_rub,
          COALESCE((SELECT SUM(si.price_cost_cny*si.qty * st.rate) FROM sale_items si CROSS JOIN (SELECT rate FROM settings WHERE id=1) st),0) AS lifetime_cost_rub,
          COALESCE((SELECT SUM(amount_rub) FROM cash_log WHERE type='out'),0) AS lifetime_expenses_rub
      `),
    ]);
    const t = totals.rows[0];
    const grossProfit = Number(t.lifetime_revenue_rub) - Number(t.lifetime_cost_rub);
    const netProfit = grossProfit - Number(t.lifetime_expenses_rub);
    res.json({
      monthly: pnl.rows,
      expensesByCategory: expensesByCategory.rows,
      revenue: Number(t.lifetime_revenue_rub),
      cost: Number(t.lifetime_cost_rub),
      grossProfit, expenses: Number(t.lifetime_expenses_rub), netProfit,
    });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

module.exports = router;
