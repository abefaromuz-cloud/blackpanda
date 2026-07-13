const pool = require('../db/pool');

// Официальный курс ЦБ РФ (публичное зеркало, обновляется ЦБ раз в день). Берём юань (CNY).
const CBR_URL = 'https://www.cbr-xml-daily.ru/daily_json.js';

async function fetchAndSaveCbrRate() {
  try {
    const res = await fetch(CBR_URL);
    if (!res.ok) throw new Error(`CBR API: ${res.status}`);
    const data = await res.json();
    const cny = data?.Valute?.CNY;
    if (!cny?.Value) throw new Error('Нет курса CNY в ответе ЦБ РФ');
    const rate = Number(cny.Value) / Number(cny.Nominal || 1);
    const date = (data.Date || new Date().toISOString()).slice(0, 10);
    await pool.query(
      'INSERT INTO cbr_rate_history (date, rate) VALUES ($1,$2) ON CONFLICT (date) DO UPDATE SET rate=$2',
      [date, rate]
    );
    console.log(`🐼 Курс ЦБ РФ (юань) обновлён: ${rate} ₽ на ${date}`);
    return rate;
  } catch (err) {
    console.error('Не удалось обновить курс ЦБ РФ:', err.message);
    return null;
  }
}

// Запускать при старте сервера + держать интервал, чтобы курс обновлялся сам,
// без необходимости кому-либо заходить на страницу или нажимать кнопку.
function startCbrRateScheduler() {
  fetchAndSaveCbrRate(); // сразу при старте
  const FOUR_HOURS = 4 * 60 * 60 * 1000;
  setInterval(fetchAndSaveCbrRate, FOUR_HOURS); // несколько раз в день (курс ЦБ и так меняется не чаще раза в день, но подстрахуемся)
}

module.exports = { fetchAndSaveCbrRate, startCbrRateScheduler };
