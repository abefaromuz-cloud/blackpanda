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

// Telegram отклоняет сообщение целиком, если оно длиннее 4096 символов — поэтому длинный текст
// (например, полный список склада) режем на части по границам строк, чтобы не оборвать слово.
function splitMessage(text, maxLen = 4000) {
  if (text.length <= maxLen) return [text];
  const chunks = [];
  let current = '';
  for (const line of text.split('\n')) {
    if ((current + '\n' + line).length > maxLen) {
      if (current) chunks.push(current);
      current = line;
    } else {
      current = current ? current + '\n' + line : line;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Отправить сообщение выбранным клиентам (у которых указан telegram)
router.post('/send', authenticate, requirePermission('broadcast', 'edit'), async (req, res) => {
  const { client_ids, message } = req.body;
  if (!Array.isArray(client_ids) || !client_ids.length || !message) return res.status(400).json({ error: 'Укажите получателей и текст' });
  const clients = await pool.query('SELECT * FROM clients WHERE id = ANY($1::uuid[])', [client_ids]);
  let sent = 0, failed = 0;
  const errors = []; // причина отказа по каждому клиенту — чтобы не гадать вслепую, почему не дошло
  for (const c of clients.rows) {
    if (!c.telegram) { failed++; errors.push({ client: c.name, telegram: null, reason: 'Не указан Telegram' }); continue; }
    const personal = message.replace(/{name}/g, c.name).replace(/{phone}/g, c.phone || '—');
    const chunks = splitMessage(personal);
    let clientOk = true, lastError = null;
    for (const chunk of chunks) {
      const result = await sendTelegramMessage(c.telegram, chunk);
      if (!result.ok) { clientOk = false; lastError = result.raw?.description || result.error || 'Неизвестная ошибка'; break; }
      if (chunks.length > 1) await sleep(300); // не долбить Telegram API слишком часто при многочастных сообщениях
    }
    if (clientOk) sent++;
    else { failed++; errors.push({ client: c.name, telegram: c.telegram, reason: lastError }); }
  }
  await logActivity(req.user, 'Рассылка', 'broadcast', `${sent} доставлено, ${failed} ошибок`);
  res.json({ sent, failed, errors });
});

module.exports = router;
