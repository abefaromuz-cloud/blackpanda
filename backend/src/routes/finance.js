const express = require('express');
const pool = require('../db/pool');
const { authenticate, requirePermission } = require('../middleware/auth');
const { logActivity } = require('../utils/activityLog');
const router = express.Router();

router.get('/', authenticate, requirePermission('finance', 'view'), async (req, res) => {
  try {
    const [pnl, expensesByCategory, totals, debtors, exchangers, recentOps, settings, banks] = await Promise.all([
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
        FROM cash_log WHERE type='out' AND (category IS DISTINCT FROM 'exchanger') AND created_at > now() - interval '12 months'
        GROUP BY 1 ORDER BY total DESC
      `),
      pool.query(`
        SELECT
          COALESCE((SELECT SUM(si.total_cny * st.rate) FROM sale_items si CROSS JOIN (SELECT rate FROM settings WHERE id=1) st),0) AS lifetime_revenue_rub,
          COALESCE((SELECT SUM(si.price_cost_cny*si.qty * st.rate) FROM sale_items si CROSS JOIN (SELECT rate FROM settings WHERE id=1) st),0) AS lifetime_cost_rub,
          COALESCE((SELECT SUM(amount_rub) FROM cash_log WHERE type='out' AND (category IS DISTINCT FROM 'exchanger')),0) AS lifetime_expenses_rub
      `),
      // Должники — как и раньше на дашборде, юаневые долги пересчитываются по сегодняшнему курсу
      pool.query(`
        SELECT c.id, c.name, COALESCE(SUM(
          CASE WHEN d.amount_cny IS NOT NULL THEN (d.amount_cny - d.amount_paid_cny) * (SELECT rate FROM settings WHERE id=1)
          ELSE (d.amount_rub - d.amount_paid_rub) END
        ),0) AS debt_rub
        FROM clients c JOIN debts d ON d.client_id = c.id AND d.status='open'
        GROUP BY c.id, c.name HAVING SUM(
          CASE WHEN d.amount_cny IS NOT NULL THEN (d.amount_cny - d.amount_paid_cny) * (SELECT rate FROM settings WHERE id=1)
          ELSE (d.amount_rub - d.amount_paid_rub) END
        ) > 0
        ORDER BY debt_rub DESC
      `),
      // Сколько всего передано каждому обменнику
      pool.query(`
        SELECT COALESCE(recipient, '—') AS recipient, SUM(amount_rub) AS total
        FROM cash_log WHERE category='exchanger'
        GROUP BY recipient ORDER BY total DESC
      `),
      // Последние 10 операций (полная история — на скрытой странице /cash)
      pool.query(`
        SELECT cl.*, c.name AS client_name FROM cash_log cl LEFT JOIN clients c ON c.id=cl.client_id
        ORDER BY cl.created_at DESC LIMIT 10
      `),
      pool.query('SELECT rate, cash_balance_rub FROM settings WHERE id=1'),
      pool.query('SELECT * FROM bank_accounts ORDER BY name'),
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
      debtors: debtors.rows,
      exchangers: exchangers.rows,
      recentOps: recentOps.rows,
      rate: Number(settings.rows[0].rate),
      cash_balance_rub: Number(settings.rows[0].cash_balance_rub),
      banks: banks.rows,
    });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

// Сводка за сегодня — для блока "Закрытие дня"
router.get('/day-summary', authenticate, requirePermission('finance', 'view'), async (req, res) => {
  try {
    const [cashToday, salesToday, settings] = await Promise.all([
      pool.query(`
        SELECT COALESCE(SUM(amount_rub) FILTER (WHERE type='in'),0) AS income,
               COALESCE(SUM(amount_rub) FILTER (WHERE type='out'),0) AS expense
        FROM cash_log WHERE created_at::date = now()::date AND (bank_key IS NULL)
      `),
      pool.query(`SELECT COALESCE(SUM(total_rub),0) AS total FROM sales WHERE created_at::date = now()::date`),
      pool.query('SELECT cash_balance_rub FROM settings WHERE id=1'),
    ]);
    res.json({
      income_today: Number(cashToday.rows[0].income),
      expense_today: Number(cashToday.rows[0].expense),
      sales_today: Number(salesToday.rows[0].total),
      expected_cash_rub: Number(settings.rows[0].cash_balance_rub),
    });
  } catch (err) { res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

// Закрытие дня — сверка фактического остатка кассы с ожидаемым, расхождение фиксируется в кассе
router.post('/day-close', authenticate, requirePermission('finance', 'edit'), async (req, res) => {
  const { actual_cash_rub, note } = req.body;
  if (actual_cash_rub === undefined || actual_cash_rub === null) return res.status(400).json({ error: 'Укажите фактический остаток' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const settings = await client.query('SELECT cash_balance_rub FROM settings WHERE id=1');
    const expected = Number(settings.rows[0].cash_balance_rub);
    const actual = Number(actual_cash_rub);
    const diff = actual - expected;
    if (Math.abs(diff) > 0.5) {
      await client.query('UPDATE settings SET cash_balance_rub=$1 WHERE id=1', [actual]);
      await client.query(
        `INSERT INTO cash_log (type, amount_rub, note, category) VALUES ($1,$2,$3,'day_close')`,
        [diff > 0 ? 'in' : 'out', Math.abs(diff), 'Корректировка при закрытии дня' + (note ? ': ' + note : '')]
      );
    }
    await client.query('COMMIT');
    await logActivity(req.user, 'Закрытие дня', 'day_close',
      `Ожидалось: ${Math.round(expected).toLocaleString('ru-RU')} ₽, по факту: ${Math.round(actual).toLocaleString('ru-RU')} ₽, расхождение: ${Math.round(diff).toLocaleString('ru-RU')} ₽`);
    res.json({ expected, actual, diff });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  } finally { client.release(); }
});

module.exports = router;
