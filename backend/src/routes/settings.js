const express = require('express');
const pool = require('../db/pool');
const { authenticate, requirePermission } = require('../middleware/auth');
const { sendTelegramMessage } = require('../utils/telegram');
const router = express.Router();

router.get('/', authenticate, requirePermission('settings', 'view'), async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM settings WHERE id=1');
    const row = result.rows[0];
    // Токен бота и ключ ИИ на фронт не отдаём — только признак того, что они заданы
    res.json({ ...row, tg_token: undefined, tg_token_set: !!row.tg_token, ai_api_key: undefined, ai_key_set: !!row.ai_api_key });
  } catch (err) { res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

// Ключ ИИ хранится и используется только на сервере — не уходит в браузер
router.put('/ai-key', authenticate, requirePermission('settings', 'edit'), async (req, res) => {
  const { ai_api_key } = req.body;
  if (!ai_api_key) return res.status(400).json({ error: 'Укажите ключ' });
  await pool.query('UPDATE settings SET ai_api_key=$1 WHERE id=1', [ai_api_key]);
  res.json({ success: true });
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

router.get('/public-rate', authenticate, async (req, res) => {
  const result = await pool.query('SELECT rate FROM settings WHERE id=1');
  res.json({ rate: Number(result.rows[0].rate) });
});

router.get('/rate-history', authenticate, async (req, res) => {
  try {
    const result = await pool.query('SELECT rate, created_at FROM rate_history ORDER BY created_at DESC LIMIT 90');
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

// Курс ЦБ РФ — сам курс запрашивается из браузера (см. Analytics.jsx) и здесь только сохраняется,
// чтобы история была общая для всех, а не в localStorage одного человека
router.post('/cbr-rate', authenticate, async (req, res) => {
  const { date, rate } = req.body;
  if (!date || !rate) return res.status(400).json({ error: 'Укажите дату и курс' });
  await pool.query('INSERT INTO cbr_rate_history (date, rate) VALUES ($1,$2) ON CONFLICT (date) DO UPDATE SET rate=$2', [date, rate]);
  res.json({ success: true });
});

router.get('/cbr-rate-history', authenticate, async (req, res) => {
  const result = await pool.query('SELECT date, rate FROM cbr_rate_history ORDER BY date DESC LIMIT 400');
  res.json(result.rows);
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
