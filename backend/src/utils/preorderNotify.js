const pool = require('../db/pool');
const { sendTelegramMessage } = require('./telegram');

// Если поступившая модель ожидается в каком-то активном предзаказе — создаём задачу-уведомление,
// чтобы на Дашборде сразу было видно "товар пришёл, есть клиент, который его ждёт".
// Также проверяет "отложенный интерес" (вишлист без предоплаты) — таким клиентам вместо задачи
// менеджеру уходит уведомление прямо в Telegram, раз тут не было формального обязательства.
// Вызывается после того, как хотя бы один серийник этой модели реально добавлен на склад.
async function notifyIfPreorderWaiting(laptopId, byUserId) {
  try {
    const waitingRes = await pool.query(`
      SELECT p.id, p.client_id FROM preorder_items pi
      JOIN preorders p ON p.id = pi.preorder_id
      WHERE pi.laptop_id = $1 AND pi.item_status != 'transferred' AND p.stage = 'active'
      GROUP BY p.id, p.client_id
    `, [laptopId]);
    const wishlistRes = await pool.query(`
      SELECT w.id, w.client_id, c.name AS client_name, c.telegram FROM wishlist w
      JOIN clients c ON c.id = w.client_id
      WHERE w.laptop_id = $1 AND w.notified = false
    `, [laptopId]);
    if (!waitingRes.rows.length && !wishlistRes.rows.length) return;
    const laptopRes = await pool.query('SELECT brand, series FROM laptops WHERE id=$1', [laptopId]);
    const laptopName = laptopRes.rows[0] ? `${laptopRes.rows[0].brand} ${laptopRes.rows[0].series || ''}`.trim() : '';
    for (const w of waitingRes.rows) {
      // Не плодим дубли, если уведомление по этому же предзаказу уже стоит невыполненным
      const exists = await pool.query(
        `SELECT 1 FROM tasks WHERE done=false AND client_id=$1 AND title LIKE $2 LIMIT 1`,
        [w.client_id, `%No.${w.id.slice(-6)}%`]
      );
      if (exists.rows[0]) continue;
      await pool.query(
        'INSERT INTO tasks (title, client_id, created_by) VALUES ($1,$2,$3)',
        [`📦 Поступил товар «${laptopName}» — ждёт предзаказ No.${w.id.slice(-6)}`, w.client_id, byUserId || null]
      );
    }
    for (const w of wishlistRes.rows) {
      await pool.query('UPDATE wishlist SET notified=true WHERE id=$1', [w.id]);
      // Уведомляем менеджера задачей в любом случае — на случай если у клиента нет Telegram
      await pool.query(
        'INSERT INTO tasks (title, client_id, created_by) VALUES ($1,$2,$3)',
        [`📦 Поступила модель «${laptopName}», которую ждал ${w.client_name} (отложенный интерес)`, w.client_id, byUserId || null]
      );
      if (w.telegram) {
        await sendTelegramMessage(w.telegram,
          `🐼 BlackPanda\n\n📦 Отличная новость, ${w.client_name}!\n\nМодель, которую вы ждали — «${laptopName}» — появилась у нас в наличии. Если ещё интересно, напишите нам!`
        ).catch(() => {});
      }
    }
  } catch (e) { console.error('Не удалось создать уведомление о предзаказе:', e.message); }
}

module.exports = { notifyIfPreorderWaiting };
