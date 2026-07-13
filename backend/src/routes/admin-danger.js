const express = require('express');
const bcrypt = require('bcrypt');
const pool = require('../db/pool');
const { authenticate, requireRole } = require('../middleware/auth');
const { logActivity } = require('../utils/activityLog');
const router = express.Router();

// Все действия в этом файле — только для admin И только с верным секретным кодом.
router.use(authenticate, requireRole('admin'));

async function checkCode(code) {
  const r = await pool.query('SELECT danger_code_hash FROM settings WHERE id=1');
  const hash = r.rows[0]?.danger_code_hash;
  if (!hash) return { ok: false, reason: 'Код доступа ещё не задан — сначала установи его ниже' };
  if (!code) return { ok: false, reason: 'Введи код доступа' };
  const match = await bcrypt.compare(String(code), hash);
  return match ? { ok: true } : { ok: false, reason: 'Неверный код доступа' };
}

// Задать / сменить код доступа
router.post('/set-code', async (req, res) => {
  const { code } = req.body;
  if (!code || String(code).length < 4) return res.status(400).json({ error: 'Код должен быть не короче 4 символов' });
  const hash = await bcrypt.hash(String(code), 10);
  await pool.query('UPDATE settings SET danger_code_hash=$1 WHERE id=1', [hash]);
  res.json({ success: true });
});

router.get('/code-status', async (req, res) => {
  const r = await pool.query('SELECT danger_code_hash FROM settings WHERE id=1');
  res.json({ code_set: !!r.rows[0]?.danger_code_hash });
});

// Полная очистка склада: все модели, серийники, связанные позиции продаж/предзаказов
// и сами продажи/предзаказы, у которых после этого не осталось бы позиций.
router.post('/clear-warehouse', async (req, res) => {
  const { code, from, to } = req.body;
  const check = await checkCode(code);
  if (!check.ok) return res.status(403).json({ error: check.reason });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const dateFilter = from || to ? 'WHERE created_at BETWEEN $1 AND $2' : '';
    const params = from || to ? [from || '2000-01-01', to || '2100-01-01'] : [];
    const laptopIds = await client.query(`SELECT id FROM laptops ${dateFilter}`, params);
    const ids = laptopIds.rows.map(r => r.id);
    if (!ids.length) { await client.query('ROLLBACK'); return res.json({ deleted_models: 0, deleted_serials: 0 }); }

    const serialsRes = await client.query('SELECT COUNT(*) AS n FROM serials WHERE laptop_id = ANY($1)', [ids]);
    await client.query('DELETE FROM sale_items WHERE laptop_id = ANY($1)', [ids]);
    await client.query('DELETE FROM preorder_items WHERE laptop_id = ANY($1)', [ids]);
    // Продажи/предзаказы, у которых после этого не осталось ни одной позиции — тоже убираем,
    // чтобы не оставалось пустых "призрачных" записей
    await client.query(`DELETE FROM sales s WHERE NOT EXISTS (SELECT 1 FROM sale_items si WHERE si.sale_id = s.id)`);
    await client.query(`DELETE FROM preorders p WHERE NOT EXISTS (SELECT 1 FROM preorder_items pi WHERE pi.preorder_id = p.id)`);
    await client.query('DELETE FROM laptops WHERE id = ANY($1)', [ids]); // serials и price_history удалятся каскадом

    await client.query('COMMIT');
    await logActivity(req.user, '⚠️ Очистка склада', 'system', `Удалено моделей: ${ids.length}, серийников: ${serialsRes.rows[0].n}`);
    res.json({ deleted_models: ids.length, deleted_serials: Number(serialsRes.rows[0].n) });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  } finally { client.release(); }
});

// Полный сброс — почти всё, кроме пользователей, настроек и справочника
router.post('/clear-everything', async (req, res) => {
  const { code } = req.body;
  const check = await checkCode(code);
  if (!check.ok) return res.status(403).json({ error: check.reason });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const tables = [
      'sale_items', 'sales', 'preorder_items', 'preorders', 'service_order_items', 'service_orders',
      'reservations', 'debts', 'balance_history', 'cash_log', 'client_notes', 'tasks',
      'broadcast_drafts', 'serial_history', 'serials', 'price_history', 'laptops', 'clients',
      'rate_history', 'cbr_rate_history', 'activity_log',
    ];
    for (const t of tables) {
      await client.query(`DELETE FROM ${t}`);
    }
    await client.query(`UPDATE settings SET cash_balance_rub = 0 WHERE id=1`);
    await client.query(`UPDATE bank_accounts SET balance_rub = 0`);
    await client.query('COMMIT');
    await logActivity(req.user, '⚠️ ПОЛНАЯ ОЧИСТКА СИСТЕМЫ', 'system', 'Все клиенты, склад, продажи, касса — обнулены');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  } finally { client.release(); }
});

module.exports = router;
