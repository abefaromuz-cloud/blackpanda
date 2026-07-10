const express = require('express');
const pool = require('../db/pool');
const { authenticate, requirePermission } = require('../middleware/auth');
const { sendTelegramMessage } = require('../utils/telegram');
const { logActivity } = require('../utils/activityLog');
const router = express.Router();

// Сгенерировать текст со списком товаров в наличии (для рассылки "склад актуальный")
router.get('/stock-message', authenticate, requirePermission('broadcast', 'view'), async (req, res) => {
  const laptops = await pool.query(`
    SELECT l.*, COUNT(s.id) FILTER (WHERE s.status_id IN (SELECT label FROM lib_statuses WHERE counts_as='instock')) AS in_stock
    FROM laptops l LEFT JOIN serials s ON s.laptop_id=l.id
    WHERE l.is_archived=false GROUP BY l.id HAVING COUNT(s.id) FILTER (WHERE s.status_id IN (SELECT label FROM lib_statuses WHERE counts_as='instock')) > 0
    ORDER BY l.brand, l.series
  `);
  const settings = await pool.query('SELECT rate FROM settings WHERE id=1');
  const rate = Number(settings.rows[0].rate);
  let msg = `🐼 BlackPanda — склад актуальный\nКурс: ${rate} ₽/¥\n\n`;
  for (const l of laptops.rows) {
    const priceRub = Math.round(Number(l.price_sell_cny) * rate);
    msg += `▪️ ${l.brand} ${l.series} | ${l.cpu || ''} | ${l.ram || ''}\n   ${l.in_stock} шт. → ¥${l.price_sell_cny} / ${priceRub.toLocaleString('ru-RU')} ₽\n\n`;
  }
  res.json({ message: msg });
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
