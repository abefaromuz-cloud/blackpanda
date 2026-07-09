const express = require('express');
const pool = require('../db/pool');
const { authenticate, requirePermission } = require('../middleware/auth');
const { sendTelegramMessage } = require('../utils/telegram');
const router = express.Router();

router.get('/', authenticate, requirePermission('settings', 'view'), async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM settings WHERE id=1');
    const row = result.rows[0];
    // Токен бота на фронт не отдаём — только признак того, что он задан
    res.json({ ...row, tg_token: undefined, tg_token_set: !!row.tg_token });
  } catch (err) { res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

// Обновление курса — также пишем точку в историю для графика
router.put('/rate', authenticate, requirePermission('settings', 'edit'), async (req, res) => {
  const { rate } = req.body;
  if (!rate || rate <= 0) return res.status(400).json({ error: 'Некорректный курс' });
  try {
    await pool.query('UPDATE settings SET rate=$1 WHERE id=1', [rate]);
    await pool.query('INSERT INTO rate_history (rate) VALUES ($1)', [rate]);
    res.json({ rate });
  } catch (err) { res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

router.get('/rate-history', authenticate, requirePermission('settings', 'view'), async (req, res) => {
  try {
    const result = await pool.query('SELECT rate, created_at FROM rate_history ORDER BY created_at DESC LIMIT 90');
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

// Telegram-токен хранится и используется только на сервере — не уходит в браузер
router.put('/telegram', authenticate, requirePermission('settings', 'edit'), async (req, res) => {
  const { tg_token, tg_chat_id, notify_low_stock, low_stock_threshold } = req.body;
  try {
    await pool.query(
      `UPDATE settings SET tg_token=COALESCE($1,tg_token), tg_chat_id=COALESCE($2,tg_chat_id),
       notify_low_stock=COALESCE($3,notify_low_stock), low_stock_threshold=COALESCE($4,low_stock_threshold) WHERE id=1`,
      [tg_token ?? null, tg_chat_id ?? null, notify_low_stock ?? null, low_stock_threshold ?? null]
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

router.post('/telegram/test', authenticate, requirePermission('settings', 'edit'), async (req, res) => {
  const { chat_id } = req.body;
  const result = await sendTelegramMessage(chat_id, '🐼 BlackPanda CRM: тестовое сообщение успешно доставлено!');
  res.json(result);
});

router.put('/lang', authenticate, requirePermission('settings', 'edit'), async (req, res) => {
  const { lang } = req.body;
  if (!['ru', 'zh'].includes(lang)) return res.status(400).json({ error: 'Недопустимый язык' });
  await pool.query('UPDATE settings SET lang=$1 WHERE id=1', [lang]);
  res.json({ lang });
});

module.exports = router;
