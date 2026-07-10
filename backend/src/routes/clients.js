const express = require('express');
const pool = require('../db/pool');
const { authenticate, requirePermission } = require('../middleware/auth');
const { logActivity } = require('../utils/activityLog');
const { sendTelegramMessage } = require('../utils/telegram');
const router = express.Router();

router.get('/', authenticate, requirePermission('clients', 'view'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT c.*, COALESCE(SUM(s.total_rub),0) AS total_purchases_rub, COUNT(s.id) AS purchases_count
      FROM clients c LEFT JOIN sales s ON s.client_id=c.id
      GROUP BY c.id ORDER BY c.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

router.get('/:id', authenticate, requirePermission('clients', 'view'), async (req, res) => {
  try {
    const [c, sales, preorders, debts, balanceHistory] = await Promise.all([
      pool.query('SELECT * FROM clients WHERE id=$1', [req.params.id]),
      pool.query('SELECT * FROM sales WHERE client_id=$1 ORDER BY created_at DESC', [req.params.id]),
      pool.query(`SELECT * FROM preorders WHERE client_id=$1 ORDER BY created_at DESC`, [req.params.id]),
      pool.query(`SELECT * FROM debts WHERE client_id=$1 ORDER BY created_at DESC`, [req.params.id]),
      pool.query(`SELECT * FROM balance_history WHERE client_id=$1 ORDER BY created_at DESC LIMIT 100`, [req.params.id]),
    ]);
    if (!c.rows[0]) return res.status(404).json({ error: 'Клиент не найден' });
    res.json({ ...c.rows[0], sales: sales.rows, preorders: preorders.rows, debts: debts.rows, balance_history: balanceHistory.rows });
  } catch (err) { res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
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

// Погасить все открытые долги клиента разом — сумма поступает в кассу
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
  res.json(result);
});

router.post('/', authenticate, requirePermission('clients', 'edit'), async (req, res) => {
  const { name, phone, telegram, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'Укажите имя клиента' });
  try {
    const result = await pool.query(
      'INSERT INTO clients (name, phone, telegram, notes) VALUES ($1,$2,$3,$4) RETURNING *',
      [name, phone||null, telegram||null, notes||null]
    );
    await logActivity(req.user, 'Добавлен клиент', 'client', name);
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

router.put('/:id', authenticate, requirePermission('clients', 'edit'), async (req, res) => {
  const { name, phone, telegram, debt_rub, notes } = req.body;
  try {
    const result = await pool.query(
      `UPDATE clients SET name=COALESCE($1,name), phone=COALESCE($2,phone), telegram=COALESCE($3,telegram),
       debt_rub=COALESCE($4,debt_rub), notes=COALESCE($5,notes) WHERE id=$6 RETURNING *`,
      [name||null, phone||null, telegram||null, debt_rub ?? null, notes||null, req.params.id]
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
