const express = require('express');
const pool = require('../db/pool');
const router = express.Router();

// У бота нет логина, но отдавать весь склад с ценами вообще без проверки — тоже не дело.
// Поэтому отдельный простой ключ (не пароль пользователя!), который знает только сам
// Cloudflare Worker бота. Никаких паролей/логинов тут нет вообще — нечему рассинхронизироваться.
function checkBotKey(req, res, next) {
  const key = req.headers['x-bot-key'];
  if (!process.env.BOT_API_KEY || key !== process.env.BOT_API_KEY) {
    return res.status(403).json({ error: 'Доступ запрещён' });
  }
  next();
}

// Данные склада для Telegram-бота: список моделей с остатком и текущим курсом.
router.get('/bot/stock', checkBotKey, async (req, res) => {
  try {
    const rateRes = await pool.query('SELECT rate FROM settings WHERE id=1');
    const rate = Number(rateRes.rows[0]?.rate || 0);
    const result = await pool.query(`
      SELECT l.id, l.brand, l.series, l.cpu, l.gpu, l.ram, l.storage, l.color, l.screen, l.touch,
        l.price_sell_cny,
        COUNT(s.id) FILTER (WHERE s.status_id IN (SELECT label FROM lib_statuses WHERE counts_as='instock')) AS in_stock
      FROM laptops l LEFT JOIN serials s ON s.laptop_id = l.id
      WHERE l.is_archived = false
      GROUP BY l.id
      ORDER BY l.brand, l.series
    `);
    res.json({ rate, laptops: result.rows });
  } catch (err) { res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

// Публичная карточка модели — без авторизации, минимум данных (без себестоимости и внутренних полей)
router.get('/laptops/:id', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT l.id, l.brand, l.series, l.cpu, l.ram, l.gpu, l.storage, l.color, l.screen, l.touch,
        l.refresh_rate, l.screen_type, l.keyboard_backlight, l.keyboard_layout,
        l.image_url, l.images, l.price_sell_cny,
        (SELECT rate FROM settings WHERE id=1) AS rate,
        COUNT(s.id) FILTER (WHERE s.status_id IN (SELECT label FROM lib_statuses WHERE counts_as='instock')) AS in_stock
      FROM laptops l LEFT JOIN serials s ON s.laptop_id = l.id
      WHERE l.id=$1 AND l.is_archived=false AND l.public_share_enabled=true
      GROUP BY l.id
    `, [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Карточка не найдена или недоступна' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

module.exports = router;
