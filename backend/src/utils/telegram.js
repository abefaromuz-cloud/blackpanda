// Отправка сообщений в Telegram теперь идёт с бэкенда, а не из браузера —
// токен бота больше не «светится» в клиентском коде.
const pool = require('../db/pool');

async function sendTelegramMessage(chatIdOrUsername, text) {
  const { rows } = await pool.query('SELECT tg_token FROM settings WHERE id=1');
  const token = rows[0]?.tg_token;
  if (!token || !chatIdOrUsername) return { ok: false, error: 'Токен или получатель не настроены' };

  try {
    const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatIdOrUsername, text }),
    });
    const data = await resp.json();
    return { ok: data.ok, raw: data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = { sendTelegramMessage };
