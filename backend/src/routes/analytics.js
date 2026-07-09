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

module.exports = router;
