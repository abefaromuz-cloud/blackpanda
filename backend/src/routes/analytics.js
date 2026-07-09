const express = require('express');
const pool = require('../db/pool');
const { authenticate, requirePermission } = require('../middleware/auth');
const router = express.Router();

router.get('/', authenticate, requirePermission('analytics', 'view'), async (req, res) => {
  try {
    const [byBrand, topClients, avgCheck, bySeries] = await Promise.all([
      pool.query(`
        SELECT l.brand, COUNT(*) AS qty
        FROM serials s JOIN laptops l ON l.id = s.laptop_id
        WHERE s.status_id = 's3'
        GROUP BY l.brand ORDER BY qty DESC
      `),
      pool.query(`
        SELECT c.id, c.name, COALESCE(SUM(s.total_rub),0) AS total_rub, COUNT(s.id) AS orders
        FROM clients c JOIN sales s ON s.client_id = c.id
        GROUP BY c.id ORDER BY total_rub DESC LIMIT 8
      `),
      pool.query(`SELECT COALESCE(AVG(total_rub),0) AS avg_check, COUNT(*) AS total_sales FROM sales`),
      pool.query(`
        SELECT l.brand, l.series, COUNT(*) AS qty
        FROM serials s JOIN laptops l ON l.id = s.laptop_id
        WHERE s.status_id='s3'
        GROUP BY l.brand, l.series ORDER BY qty DESC LIMIT 10
      `),
    ]);
    res.json({
      byBrand: byBrand.rows,
      topClients: topClients.rows,
      avgCheck: Number(avgCheck.rows[0].avg_check),
      totalSales: Number(avgCheck.rows[0].total_sales),
      bySeries: bySeries.rows,
    });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

// Временной ряд продаж/себестоимости/маржи — для линейного графика с переключением периода
router.get('/timeseries', authenticate, requirePermission('analytics', 'view'), async (req, res) => {
  const period = req.query.period || '30'; // '7' | '30' | '365' | 'years'
  try {
    let rows;
    if (period === 'years') {
      rows = await pool.query(`
        SELECT to_char(s.created_at,'YYYY') AS lbl,
          COALESCE(SUM(si.total_cny),0) AS revenue_cny,
          COALESCE(SUM(si.price_cost_cny*si.qty),0) AS cost_cny
        FROM sales s JOIN sale_items si ON si.sale_id=s.id
        GROUP BY 1 ORDER BY 1
      `);
    } else {
      const days = parseInt(period) || 30;
      rows = await pool.query(`
        SELECT to_char(d.day,'DD.MM') AS lbl, d.day,
          COALESCE(SUM(si.total_cny) FILTER (WHERE date_trunc('day', s.created_at) = d.day), 0) AS revenue_cny,
          COALESCE(SUM(si.price_cost_cny*si.qty) FILTER (WHERE date_trunc('day', s.created_at) = d.day), 0) AS cost_cny
        FROM generate_series(now()::date - ($1::int - 1), now()::date, interval '1 day') AS d(day)
        LEFT JOIN sales s ON date_trunc('day', s.created_at) = d.day
        LEFT JOIN sale_items si ON si.sale_id = s.id
        GROUP BY d.day ORDER BY d.day
      `, [days]);
    }
    const points = rows.rows.map(r => ({
      lbl: r.lbl,
      revenue_cny: Number(r.revenue_cny),
      cost_cny: Number(r.cost_cny),
      margin_cny: Number(r.revenue_cny) - Number(r.cost_cny),
    }));
    res.json(points);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

module.exports = router;
