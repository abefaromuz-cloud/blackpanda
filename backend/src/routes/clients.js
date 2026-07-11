const express = require('express');
const pool = require('../db/pool');
const { authenticate, requirePermission } = require('../middleware/auth');
const { logActivity } = require('../utils/activityLog');
const { sendTelegramMessage } = require('../utils/telegram');
const router = express.Router();

// Общая статистика для верхних карточек на странице Клиенты
// Список сотрудников для назначения менеджером клиента (без прав admin — достаточно clients:view)
router.get('/managers-list', authenticate, requirePermission('clients', 'view'), async (req, res) => {
  const result = await pool.query(`SELECT id, full_name FROM users WHERE role != 'client' AND is_active=true ORDER BY full_name`);
  res.json(result.rows);
});

router.get('/stats', authenticate, requirePermission('clients', 'view'), async (req, res) => {
  try {
    const [totals, debtTotal, turnover, settings] = await Promise.all([
      pool.query(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE category='vip') AS vip_count FROM clients`),
      pool.query(`SELECT COALESCE(SUM(amount_rub - amount_paid_rub),0) AS total FROM debts WHERE status='open'`),
      pool.query(`SELECT COALESCE(SUM(total_rub),0) AS total FROM sales WHERE created_at > now() - interval '30 days'`),
      pool.query('SELECT rate FROM settings WHERE id=1'),
    ]);
    const rate = Number(settings.rows[0].rate) || 1;
    const debtRub = Number(debtTotal.rows[0].total);
    res.json({
      total: Number(totals.rows[0].total),
      vip_count: Number(totals.rows[0].vip_count),
      total_debt_rub: debtRub,
      total_debt_cny: rate > 0 ? debtRub / rate : 0,
      total_turnover_30d_rub: Number(turnover.rows[0].total),
    });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

router.get('/', authenticate, requirePermission('clients', 'view'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT c.*, u.full_name AS manager_name,
        COALESCE(SUM(s.total_rub),0) AS total_purchases_rub, COUNT(s.id) AS purchases_count,
        MAX(s.created_at) AS last_purchase_at,
        COALESCE((SELECT SUM(d.amount_rub - d.amount_paid_rub) FROM debts d WHERE d.client_id=c.id AND d.status='open'),0) AS open_debt_rub
      FROM clients c
      LEFT JOIN sales s ON s.client_id=c.id
      LEFT JOIN users u ON u.id = c.manager_id
      GROUP BY c.id, u.full_name ORDER BY c.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

router.get('/:id', authenticate, requirePermission('clients', 'view'), async (req, res) => {
  try {
    const [c, sales, preorders, debts, balanceHistory, notes] = await Promise.all([
      pool.query('SELECT c.*, u.full_name AS manager_name FROM clients c LEFT JOIN users u ON u.id=c.manager_id WHERE c.id=$1', [req.params.id]),
      pool.query('SELECT * FROM sales WHERE client_id=$1 ORDER BY created_at DESC', [req.params.id]),
      pool.query(`SELECT * FROM preorders WHERE client_id=$1 ORDER BY created_at DESC`, [req.params.id]),
      pool.query(`SELECT * FROM debts WHERE client_id=$1 ORDER BY created_at DESC`, [req.params.id]),
      pool.query(`SELECT * FROM balance_history WHERE client_id=$1 ORDER BY created_at DESC LIMIT 100`, [req.params.id]),
      pool.query(`SELECT * FROM client_notes WHERE client_id=$1 ORDER BY created_at DESC LIMIT 50`, [req.params.id]),
    ]);
    if (!c.rows[0]) return res.status(404).json({ error: 'Клиент не найден' });
    const lastPurchase = sales.rows[0]?.created_at || null;
    res.json({ ...c.rows[0], sales: sales.rows, preorders: preorders.rows, debts: debts.rows, balance_history: balanceHistory.rows, notes: notes.rows, last_purchase_at: lastPurchase });
  } catch (err) { res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

// Полная история клиента для страницы "История клиента": события + статистика за период
router.get('/:id/history', authenticate, requirePermission('clients', 'view'), async (req, res) => {
  const { from, to } = req.query;
  const fromDate = from || '2000-01-01';
  const toDate = to || '2100-01-01';
  try {
    const [
      client, sales, balanceHistory, debts, serviceOrders, preorders, notes, statsRow, purchasesByMonth, devices,
    ] = await Promise.all([
      pool.query('SELECT c.*, u.full_name AS manager_name FROM clients c LEFT JOIN users u ON u.id=c.manager_id WHERE c.id=$1', [req.params.id]),
      pool.query(`SELECT s.*, COALESCE(json_agg(json_build_object('brand',l.brand,'series',l.series,'qty',si.qty)) FILTER (WHERE si.id IS NOT NULL), '[]') AS items
        FROM sales s LEFT JOIN sale_items si ON si.sale_id=s.id LEFT JOIN laptops l ON l.id=si.laptop_id
        WHERE s.client_id=$1 AND s.created_at BETWEEN $2 AND $3 GROUP BY s.id ORDER BY s.created_at DESC`, [req.params.id, fromDate, toDate]),
      pool.query('SELECT * FROM balance_history WHERE client_id=$1 AND created_at BETWEEN $2 AND $3 ORDER BY created_at DESC', [req.params.id, fromDate, toDate]),
      pool.query('SELECT * FROM debts WHERE client_id=$1 AND created_at BETWEEN $2 AND $3 ORDER BY created_at DESC', [req.params.id, fromDate, toDate]),
      pool.query('SELECT * FROM service_orders WHERE client_id=$1 AND created_at BETWEEN $2 AND $3 ORDER BY created_at DESC', [req.params.id, fromDate, toDate]),
      pool.query('SELECT * FROM preorders WHERE client_id=$1 AND created_at BETWEEN $2 AND $3 ORDER BY created_at DESC', [req.params.id, fromDate, toDate]),
      pool.query('SELECT * FROM client_notes WHERE client_id=$1 AND created_at BETWEEN $2 AND $3 ORDER BY created_at DESC', [req.params.id, fromDate, toDate]),
      pool.query(`
        SELECT COUNT(*) AS purchases, COALESCE(SUM(total_rub),0) AS revenue,
          COALESCE(SUM(si.total_cny * s.rate),0) - COALESCE(SUM(si.price_cost_cny * si.qty * s.rate),0) AS profit
        FROM sales s LEFT JOIN sale_items si ON si.sale_id = s.id
        WHERE s.client_id=$1 AND s.created_at BETWEEN $2 AND $3
      `, [req.params.id, fromDate, toDate]),
      pool.query(`
        SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month, COALESCE(SUM(total_rub),0) AS total
        FROM sales WHERE client_id=$1 GROUP BY 1 ORDER BY 1
      `, [req.params.id]),
      pool.query(`
        SELECT s.id, s.serial, s.warranty_months, s.sale_date, l.brand, l.series, si.total_cny, sale.total_rub, sale.rate
        FROM sale_items si
        JOIN sales sale ON sale.id = si.sale_id
        JOIN laptops l ON l.id = si.laptop_id
        CROSS JOIN LATERAL unnest(si.serial_ids) AS serial_id
        JOIN serials s ON s.id = serial_id
        WHERE sale.client_id=$1 ORDER BY s.sale_date DESC LIMIT 20
      `, [req.params.id]),
    ]);
    if (!client.rows[0]) return res.status(404).json({ error: 'Клиент не найден' });

    const returnsCount = serviceOrders.rows.filter(() => false).length; // возвраты считаем через serial_history отдельно не требуется на этом этапе
    const repairsCount = serviceOrders.rows.length;

    // Единая лента событий, отсортированная по дате
    const events = [
      ...sales.rows.map(s => ({ type: 'sale', date: s.created_at, data: s })),
      ...balanceHistory.rows.map(b => ({ type: 'balance', date: b.created_at, data: b })),
      ...debts.rows.map(d => ({ type: 'debt', date: d.created_at, data: d })),
      ...serviceOrders.rows.map(o => ({ type: 'service', date: o.created_at, data: o })),
      ...preorders.rows.map(p => ({ type: 'preorder', date: p.created_at, data: p })),
      ...notes.rows.map(n => ({ type: n.type, date: n.created_at, data: n })),
    ].sort((a, b) => new Date(b.date) - new Date(a.date));

    const st = statsRow.rows[0];
    res.json({
      client: client.rows[0],
      events,
      devices: devices.rows,
      purchases_by_month: purchasesByMonth.rows,
      stats: {
        purchases: Number(st.purchases),
        revenue_rub: Number(st.revenue),
        profit_rub: Number(st.profit),
        avg_check_rub: Number(st.purchases) > 0 ? Number(st.revenue) / Number(st.purchases) : 0,
        returns: returnsCount,
        repairs: repairsCount,
      },
    });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

// Добавить заметку/звонок/лог Telegram вручную
router.post('/:id/notes', authenticate, requirePermission('clients', 'edit'), async (req, res) => {
  const { type, text } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: 'Укажите текст' });
  const result = await pool.query(
    'INSERT INTO client_notes (client_id, type, text, created_by, created_by_name) VALUES ($1,$2,$3,$4,$5) RETURNING *',
    [req.params.id, ['comment', 'call', 'telegram'].includes(type) ? type : 'comment', text.trim(), req.user.id, req.user.full_name]
  );
  res.status(201).json(result.rows[0]);
});

// Ручная корректировка баланса предоплаты клиента
router.post('/:id/balance', authenticate, requirePermission('finance', 'edit'), async (req, res) => {
  const { amount_rub, note } = req.body;
  if (!amount_rub) return res.status(400).json({ error: 'Укажите сумму' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const cur = await client.query('SELECT balance_rub FROM clients WHERE id=$1 FOR UPDATE', [req.params.id]);
    if (!cur.rows[0]) throw { status: 404, message: 'Клиент не найден' };
    const newBalance = Number(cur.rows[0].balance_rub) + Number(amount_rub);
    await client.query('UPDATE clients SET balance_rub=$1 WHERE id=$2', [newBalance, req.params.id]);
    await client.query(
      'INSERT INTO balance_history (client_id, amount_rub, note, balance_after_rub) VALUES ($1,$2,$3,$4)',
      [req.params.id, amount_rub, note || 'Ручная корректировка', newBalance]
    );
    await client.query('COMMIT');
    res.json({ balance_rub: newBalance });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.status) return res.status(err.status).json({ error: err.message });
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  } finally { client.release(); }
});

// Обнулить баланс клиента (с опцией "выдать наличными" — тогда спишется из кассы)
router.post('/:id/balance/reset', authenticate, requirePermission('clients', 'edit'), async (req, res) => {
  const { refund_cash } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const cur = await client.query('SELECT balance_rub, name FROM clients WHERE id=$1 FOR UPDATE', [req.params.id]);
    if (!cur.rows[0]) throw { status: 404, message: 'Клиент не найден' };
    const amount = Number(cur.rows[0].balance_rub);
    if (amount !== 0) {
      await client.query('UPDATE clients SET balance_rub=0 WHERE id=$1', [req.params.id]);
      await client.query(
        'INSERT INTO balance_history (client_id, amount_rub, note, balance_after_rub) VALUES ($1,$2,$3,0)',
        [req.params.id, -amount, refund_cash ? 'Клиент забрал баланс наличными' : 'Обнуление баланса']
      );
      if (refund_cash) {
        await client.query('UPDATE settings SET cash_balance_rub = cash_balance_rub - $1 WHERE id=1', [amount]);
        await client.query(`INSERT INTO cash_log (type, amount_rub, note, client_id, category) VALUES ('out',$1,$2,$3,'other')`,
          [amount, 'Возврат баланса клиенту: ' + cur.rows[0].name, req.params.id]);
      }
    }
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.status) return res.status(err.status).json({ error: err.message });
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  } finally { client.release(); }
});

// Добавить долг клиенту вручную (не привязан к продаже) — используется в блоке "Операция" на Финансах
router.post('/:id/debts', authenticate, requirePermission('finance', 'edit'), async (req, res) => {
  const { amount_rub, due_date, note } = req.body;
  if (!amount_rub || Number(amount_rub) <= 0) return res.status(400).json({ error: 'Укажите сумму долга' });
  try {
    const result = await pool.query(
      'INSERT INTO debts (client_id, amount_rub, due_date) VALUES ($1,$2,$3) RETURNING *',
      [req.params.id, amount_rub, due_date || null]
    );
    await logActivity(req.user, 'Добавлен долг клиенту', 'debt', Math.round(amount_rub).toLocaleString('ru-RU') + ' ₽' + (note ? ' — ' + note : ''));
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

router.post('/:id/debts/payoff', authenticate, requirePermission('finance', 'edit'), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const open = await client.query(`SELECT * FROM debts WHERE client_id=$1 AND status='open'`, [req.params.id]);
    const total = open.rows.reduce((s, d) => s + (Number(d.amount_rub) - Number(d.amount_paid_rub)), 0);
    if (total > 0) {
      await client.query(`UPDATE debts SET status='paid', amount_paid_rub=amount_rub WHERE client_id=$1 AND status='open'`, [req.params.id]);
      await client.query('UPDATE settings SET cash_balance_rub = cash_balance_rub + $1 WHERE id=1', [total]);
      await client.query(`INSERT INTO cash_log (type, amount_rub, note, client_id, category) VALUES ('in',$1,'Погашение долга клиента',$2,'other')`,
        [total, req.params.id]);
    }
    await client.query('COMMIT');
    res.json({ paid_rub: total });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  } finally { client.release(); }
});

// Отправить клиенту напоминание о долге в Telegram
router.post('/:id/debts/remind', authenticate, requirePermission('clients', 'edit'), async (req, res) => {
  const { debt_id } = req.body;
  const c = await pool.query('SELECT * FROM clients WHERE id=$1', [req.params.id]);
  const d = await pool.query('SELECT * FROM debts WHERE id=$1', [debt_id]);
  if (!c.rows[0] || !d.rows[0]) return res.status(404).json({ error: 'Не найдено' });
  if (!c.rows[0].telegram) return res.status(400).json({ error: 'У клиента нет Telegram' });
  const remaining = Number(d.rows[0].amount_rub) - Number(d.rows[0].amount_paid_rub);
  const text = `Здравствуйте, ${c.rows[0].name}! Напоминаем о задолженности перед BlackPanda: ${Math.round(remaining).toLocaleString('ru-RU')} ₽` +
    (d.rows[0].due_date ? `. Срок оплаты: ${new Date(d.rows[0].due_date).toLocaleDateString('ru-RU')}` : '');
  const result = await sendTelegramMessage(c.rows[0].telegram, text);
  await pool.query('INSERT INTO client_notes (client_id, type, text, created_by, created_by_name) VALUES ($1,$2,$3,$4,$5)',
    [req.params.id, 'telegram', 'Напоминание о долге отправлено в Telegram', req.user.id, req.user.full_name]);
  res.json(result);
});

router.post('/', authenticate, requirePermission('clients', 'edit'), async (req, res) => {
  const { name, phone, telegram, notes, category, discount_percent, city, avatar_url, manager_id } = req.body;
  if (!name) return res.status(400).json({ error: 'Укажите имя клиента' });
  try {
    const result = await pool.query(
      `INSERT INTO clients (name, phone, telegram, notes, category, discount_percent, city, avatar_url, manager_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [name, phone||null, telegram||null, notes||null, category || 'retail', discount_percent || 0, city||null, avatar_url||null, manager_id||null]
    );
    await logActivity(req.user, 'Добавлен клиент', 'client', name);
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

router.put('/:id', authenticate, requirePermission('clients', 'edit'), async (req, res) => {
  const { name, phone, telegram, notes, category, discount_percent, city, avatar_url, manager_id } = req.body;
  try {
    const result = await pool.query(
      `UPDATE clients SET name=COALESCE($1,name), phone=COALESCE($2,phone), telegram=COALESCE($3,telegram),
       notes=COALESCE($4,notes), category=COALESCE($5,category), discount_percent=COALESCE($6,discount_percent),
       city=COALESCE($7,city), avatar_url=COALESCE($8,avatar_url), manager_id=COALESCE($9,manager_id)
       WHERE id=$10 RETURNING *`,
      [name||null, phone||null, telegram||null, notes||null, category||null, discount_percent ?? null, city||null, avatar_url||null, manager_id||null, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Клиент не найден' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

router.delete('/:id', authenticate, requirePermission('clients', 'edit'), async (req, res) => {
  try {
    await pool.query('DELETE FROM clients WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

module.exports = router;
