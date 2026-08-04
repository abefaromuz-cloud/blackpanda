const express = require('express');
const pool = require('../db/pool');
const { authenticate, requirePermission } = require('../middleware/auth');
const { sendTelegramMessage } = require('../utils/telegram');
const { logActivity } = require('../utils/activityLog');
const router = express.Router();

// Сгенерировать текст со списком товаров в наличии (для рассылки "склад актуальный")
router.get('/stock-message', authenticate, requirePermission('broadcast', 'view'), async (req, res) => {
  try {
    const laptops = await pool.query(`
      SELECT l.*, COUNT(s.id) FILTER (WHERE s.status_id IN (SELECT label FROM lib_statuses WHERE counts_as='instock')) AS in_stock
      FROM laptops l LEFT JOIN serials s ON s.laptop_id=l.id
      WHERE l.is_archived=false GROUP BY l.id HAVING COUNT(s.id) FILTER (WHERE s.status_id IN (SELECT label FROM lib_statuses WHERE counts_as='instock')) > 0
      ORDER BY l.brand, l.series
    `);
    const settings = await pool.query('SELECT rate FROM settings WHERE id=1');
    const rate = Number(settings.rows[0].rate);
    const today = new Date().toLocaleDateString('ru-RU');

    // Группируем по бренду с заголовком-разделителем — так же, как было в старой версии
    const brands = {};
    for (const l of laptops.rows) { (brands[l.brand] = brands[l.brand] || []).push(l); }

    let msg = `🐼 BlackPanda | Склад актуальный\n📅 ${today} | Курс: ${rate} ₽/¥\n`;
    for (const [brand, items] of Object.entries(brands)) {
      msg += `\n━━━━━━━━━━━━━━━━━━\n💻 ${(brand || '').toUpperCase()}\n`;
      for (const l of items) {
        const priceRub = Math.round(Number(l.price_sell_cny) * rate);
        // Полный набор характеристик — раньше отдавали только CPU и RAM, потеряв GPU/накопитель/экран/цвет/сенсор
        let line = `▪️ ${l.series || ''}`;
        if (l.cpu) line += ` | ${l.cpu}`;
        if (l.gpu) line += ` | ${l.gpu}`;
        if (l.ram) line += ` | ${l.ram}`;
        if (l.storage) line += ` | ${l.storage}`;
        if (l.screen) line += ` | ${l.screen}`;
        if (l.color) line += ` | ${l.color}`;
        if (l.touch === 'yes') line += ` | 👆 Сенсорный`;
        line += `\n   ${l.in_stock} шт. → ¥${l.price_sell_cny} / ${priceRub.toLocaleString('ru-RU')} ₽\n`;
        msg += line;
      }
    }
    res.json({ message: msg });
  } catch (err) { res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

// Отправить сообщение выбранным клиентам (у которых указан telegram)
router.post('/send', authenticate, requirePermission('broadcast', 'edit'), async (req, res) => {
  const { client_ids, message } = req.body;
  if (!Array.isArray(client_ids) || !client_ids.length || !message) return res.status(400).json({ error: 'Укажите получателей и текст' });
  const clients = await pool.query('SELECT * FROM clients WHERE id = ANY($1::uuid[])', [client_ids]);
  let sent = 0, failed = 0;
  for (const c of clients.rows) {
    if (!c.telegram) { failed++; continue; }
    const personal = message.replace(/{name}/g, c.name).replace(/{phone}/g, c.phone || '—');
    const result = await sendTelegramMessage(c.telegram, personal);
    if (result.ok) sent++; else failed++;
  }
  await logActivity(req.user, 'Рассылка', 'broadcast', `${sent} доставлено, ${failed} ошибок`);
  res.json({ sent, failed });
});

module.exports = router;
