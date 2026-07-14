const pool = require('../db/pool');
const { sendTelegramMessage } = require('./telegram');

// За 2 недели до конца гарантии — напоминание клиенту в Telegram. Проверяется раз в сутки,
// каждому серийнику уходит только одно напоминание (флаг warranty_reminder_sent).
async function sendWarrantyReminders() {
  try {
    const result = await pool.query(`
      SELECT s.id, s.serial, s.sale_date, s.warranty_months, c.name AS client_name, c.telegram,
        l.brand, l.series,
        (s.sale_date + (s.warranty_months || ' months')::interval)::date AS warranty_end
      FROM serials s
      JOIN clients c ON c.id = s.sale_client_id
      JOIN laptops l ON l.id = s.laptop_id
      WHERE s.warranty_reminder_sent = false
        AND s.sale_date IS NOT NULL AND s.warranty_months > 0 AND c.telegram IS NOT NULL
        AND (s.sale_date + (s.warranty_months || ' months')::interval) BETWEEN now() AND now() + interval '14 days'
    `);
    for (const r of result.rows) {
      const name = `${r.brand} ${r.series || ''}`.trim();
      const msg = `🐼 BlackPanda\n\n🛡️ Напоминание о гарантии\n\nЗдравствуйте, ${r.client_name}!\n\nГарантия на устройство «${name}» (${r.serial}) заканчивается ${new Date(r.warranty_end).toLocaleDateString('ru-RU')}.\n\nЕсли есть какие-то вопросы или хотите что-то проверить перед окончанием гарантии — самое время написать нам!`;
      try {
        await sendTelegramMessage(r.telegram, msg);
        await pool.query('UPDATE serials SET warranty_reminder_sent=true WHERE id=$1', [r.id]);
      } catch (e) { console.error('Не удалось отправить напоминание о гарантии:', r.serial, e.message); }
    }
    if (result.rows.length) console.log(`🐼 Отправлено напоминаний о гарантии: ${result.rows.length}`);
  } catch (e) { console.error('Ошибка проверки напоминаний о гарантии:', e.message); }
}

function startWarrantyReminderScheduler() {
  sendWarrantyReminders(); // сразу при старте
  const ONE_DAY = 24 * 60 * 60 * 1000;
  setInterval(sendWarrantyReminders, ONE_DAY);
}

module.exports = { sendWarrantyReminders, startWarrantyReminderScheduler };
