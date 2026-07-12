const express = require('express');
const pool = require('../db/pool');
const { authenticate, requirePermission } = require('../middleware/auth');
const { callClaude } = require('../utils/ai');
const router = express.Router();

// Комплексная аналитика за период (from/to) + сравнение с предыдущим равным по длине периодом.
// Суммы отдаются и в ¥, и в ₽ (по текущему курсу) — фронт сам выбирает нужную валюту по языку интерфейса.
router.get('/full', authenticate, requirePermission('analytics', 'view'), async (req, res) => {
  const { from, to } = req.query;
  const toDate = to || new Date().toISOString().slice(0, 10);
  const fromDate = from || new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
  const periodDays = Math.max(1, Math.round((new Date(toDate) - new Date(fromDate)) / 86400000) + 1);
  const prevTo = new Date(new Date(fromDate).getTime() - 86400000).toISOString().slice(0, 10);
  const prevFrom = new Date(new Date(fromDate).getTime() - periodDays * 86400000).toISOString().slice(0, 10);
  // Гранулярность графика подбирается сама по длине периода — отдельная кнопка не нужна
  const bucket = periodDays <= 2 ? 'hour' : periodDays <= 14 ? 'day' : periodDays <= 90 ? 'week' : periodDays <= 400 ? 'month' : 'month';
  const bucketLabelFmt = bucket === 'hour' ? 'HH24:MI' : bucket === 'month' ? 'MM.YYYY' : 'DD.MM';

  try {
    const settingsRes = await pool.query('SELECT rate, cash_balance_rub FROM settings WHERE id=1');
    const rate = Number(settingsRes.rows[0].rate);

    const periodStats = async (f, t) => {
      const r = await pool.query(`
        SELECT
          COALESCE(SUM(s.total_rub),0) AS revenue_rub,
          COALESCE(SUM(si.price_cost_cny * si.qty * $3),0) AS cost_rub,
          COALESCE(SUM(si.qty),0) AS sold_qty,
          COUNT(DISTINCT s.id) AS orders
        FROM sales s LEFT JOIN sale_items si ON si.sale_id = s.id
        WHERE s.created_at::date BETWEEN $1 AND $2
      `, [f, t, rate]);
      const newClients = await pool.query(`SELECT COUNT(*) AS n FROM clients WHERE created_at::date BETWEEN $1 AND $2`, [f, t]);
      return {
        revenue_rub: Number(r.rows[0].revenue_rub),
        profit_rub: Number(r.rows[0].revenue_rub) - Number(r.rows[0].cost_rub),
        sold_qty: Number(r.rows[0].sold_qty),
        orders: Number(r.rows[0].orders),
        new_clients: Number(newClients.rows[0].n),
      };
    };

    const [cur, prev, stockNow, sparkline, dynamics, byBrandStock, topModels, byManager, payMethods, receivables, avgPayTerm, slowStock, topClients, geography] = await Promise.all([
      periodStats(fromDate, toDate),
      periodStats(prevFrom, prevTo),
      pool.query(`SELECT COUNT(*) AS n FROM serials WHERE status_id IN (SELECT label FROM lib_statuses WHERE counts_as='instock')`),
      pool.query(`
        SELECT d.day::date AS day,
          COALESCE(SUM(s.total_rub) FILTER (WHERE date_trunc('day', s.created_at) = d.day), 0) AS revenue_rub
        FROM generate_series($1::date, $2::date, interval '1 day') AS d(day)
        LEFT JOIN sales s ON date_trunc('day', s.created_at) = d.day
        GROUP BY d.day ORDER BY d.day
      `, [fromDate, toDate]),
      pool.query(`
        SELECT to_char(date_trunc($3, s.created_at), '${bucketLabelFmt}') AS lbl,
          date_trunc($3, s.created_at) AS grp,
          COALESCE(SUM(s.total_rub),0) AS revenue_rub,
          COALESCE(SUM(si.price_cost_cny * si.qty * $4),0) AS cost_rub,
          COALESCE(SUM(si.qty),0) AS qty
        FROM sales s LEFT JOIN sale_items si ON si.sale_id = s.id
        WHERE s.created_at::date BETWEEN $1 AND $2
        GROUP BY 2 ORDER BY 2
      `, [fromDate, toDate, bucket, rate]),
      pool.query(`
        SELECT l.brand, COUNT(*) AS qty
        FROM serials s JOIN laptops l ON l.id = s.laptop_id
        WHERE s.status_id IN (SELECT label FROM lib_statuses WHERE counts_as='instock')
        GROUP BY l.brand ORDER BY qty DESC
      `),
      pool.query(`
        SELECT l.brand, l.series, COALESCE(SUM(si.qty),0) AS sold_qty,
          COALESCE(SUM((si.price_sell_cny - si.price_cost_cny) * si.qty * $3),0) AS profit_rub
        FROM sale_items si JOIN sales s ON s.id = si.sale_id JOIN laptops l ON l.id = si.laptop_id
        WHERE s.created_at::date BETWEEN $1 AND $2
        GROUP BY l.id, l.brand, l.series ORDER BY profit_rub DESC LIMIT 5
      `, [fromDate, toDate, rate]),
      pool.query(`
        SELECT u.id, u.full_name, COUNT(s.id) AS orders, COALESCE(SUM(s.total_rub),0) AS revenue_rub
        FROM sales s JOIN users u ON u.id = s.created_by
        WHERE s.created_at::date BETWEEN $1 AND $2
        GROUP BY u.id, u.full_name ORDER BY revenue_rub DESC LIMIT 6
      `, [fromDate, toDate]),
      pool.query(`
        SELECT COALESCE(bank_key, 'cash') AS method, SUM(amount_rub) AS total
        FROM cash_log WHERE type='in' AND created_at::date BETWEEN $1 AND $2
        GROUP BY 1 ORDER BY total DESC
      `, [fromDate, toDate]),
      pool.query(`SELECT COALESCE(SUM(
        CASE WHEN amount_cny IS NOT NULL THEN (amount_cny - amount_paid_cny) * (SELECT rate FROM settings WHERE id=1)
        ELSE (amount_rub - amount_paid_rub) END
      ),0) AS total FROM debts WHERE status='open'`),
      pool.query(`SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (paid_at - created_at)) / 86400),0) AS days FROM debts WHERE status='paid' AND paid_at IS NOT NULL`),
      pool.query(`
        SELECT s.id, s.serial, l.brand, l.series, s.arrival_date,
          EXTRACT(DAY FROM now() - s.arrival_date)::int AS days_on_stock
        FROM serials s JOIN laptops l ON l.id = s.laptop_id
        WHERE s.status_id IN (SELECT label FROM lib_statuses WHERE counts_as='instock') AND s.arrival_date IS NOT NULL
        ORDER BY s.arrival_date ASC LIMIT 5
      `),
      pool.query(`
        SELECT c.id, c.name, c.category, COALESCE(SUM(s.total_rub),0) AS revenue_rub
        FROM clients c JOIN sales s ON s.client_id = c.id
        WHERE s.created_at::date BETWEEN $1 AND $2
        GROUP BY c.id ORDER BY revenue_rub DESC LIMIT 5
      `, [fromDate, toDate]),
      pool.query(`
        SELECT COALESCE(c.city, 'Не указан') AS city, COUNT(s.id) AS orders, COALESCE(SUM(s.total_rub),0) AS revenue_rub
        FROM sales s JOIN clients c ON c.id = s.client_id
        WHERE s.created_at::date BETWEEN $1 AND $2
        GROUP BY 1 ORDER BY revenue_rub DESC LIMIT 6
      `, [fromDate, toDate]),
    ]);

    const pctChange = (curVal, prevVal) => prevVal > 0 ? Math.round(((curVal - prevVal) / prevVal) * 1000) / 10 : (curVal > 0 ? 100 : 0);

    const toRubCny = (rub) => ({ rub: Math.round(rub), cny: rate > 0 ? Math.round(rub / rate) : 0 });

    const result = {
      rate,
      period: { from: fromDate, to: toDate },
      stats: {
        revenue: { ...toRubCny(cur.revenue_rub), change_pct: pctChange(cur.revenue_rub, prev.revenue_rub) },
        profit: { ...toRubCny(cur.profit_rub), change_pct: pctChange(cur.profit_rub, prev.profit_rub) },
        sold_qty: { value: cur.sold_qty, change_pct: pctChange(cur.sold_qty, prev.sold_qty) },
        stock_now: { value: Number(stockNow.rows[0].n) },
        new_clients: { value: cur.new_clients, change_pct: pctChange(cur.new_clients, prev.new_clients) },
      },
      sparkline: sparkline.rows.map(r => Number(r.revenue_rub)),
      dynamics: dynamics.rows.map(r => ({
        lbl: r.lbl,
        revenue: toRubCny(Number(r.revenue_rub)),
        profit: toRubCny(Number(r.revenue_rub) - Number(r.cost_rub)),
        qty: Number(r.qty),
      })),
      by_brand_stock: byBrandStock.rows,
      top_models: topModels.rows.map(r => ({ brand: r.brand, series: r.series, sold_qty: Number(r.sold_qty), profit: toRubCny(Number(r.profit_rub)) })),
      by_manager: byManager.rows.map(r => ({
        id: r.id, full_name: r.full_name, orders: Number(r.orders),
        revenue: toRubCny(Number(r.revenue_rub)),
        avg_check: toRubCny(Number(r.orders) > 0 ? Number(r.revenue_rub) / Number(r.orders) : 0),
      })),
      payment_methods: payMethods.rows.map(r => ({ method: r.method, ...toRubCny(Number(r.total)) })),
      receivables: toRubCny(Number(receivables.rows[0].total)),
      avg_payment_term_days: Math.round(Number(avgPayTerm.rows[0].days) * 10) / 10,
      slow_stock: slowStock.rows,
      top_clients: topClients.rows.map(r => ({ id: r.id, name: r.name, category: r.category, revenue: toRubCny(Number(r.revenue_rub)) })),
      geography: geography.rows.map(r => ({ city: r.city, orders: Number(r.orders), revenue: toRubCny(Number(r.revenue_rub)) })),
    };
    res.json(result);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

// ИИ-инсайты по уже посчитанным цифрам — короткие и по делу, на основе реальных данных
router.post('/insights', authenticate, requirePermission('analytics', 'view'), async (req, res) => {
  try {
    const text = await callClaude({
      model: 'claude-haiku-4-5-20251001',
      system: 'Ты аналитик CRM по перепродаже ноутбуков. По присланным цифрам дай 3-4 коротких ' +
        'практичных инсайта (одно предложение каждый, по-русски, без воды и общих фраз, только на основе ' +
        'присланных данных, не выдумывай). Формат ответа: обычный текст, каждый инсайт с новой строки, ' +
        'начинай строку с эмодзи (📈 рост, ⚠️ риск, 💡 идея, 👤 клиент). Без markdown-разметки.',
      content: JSON.stringify(req.body),
      maxTokens: 500,
    });
    const insights = text.split('\n').map(l => l.trim()).filter(Boolean);
    res.json({ insights });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Ошибка ИИ' });
  }
});

router.get('/', authenticate, requirePermission('analytics', 'view'), async (req, res) => {
  try {
    const [byBrand, topClients, avgCheck, bySeries] = await Promise.all([
      pool.query(`
        SELECT l.brand, COUNT(*) AS qty
        FROM serials s JOIN laptops l ON l.id = s.laptop_id
        WHERE s.status_id IN (SELECT label FROM lib_statuses WHERE counts_as='sold')
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
        WHERE s.status_id IN (SELECT label FROM lib_statuses WHERE counts_as='sold')
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
