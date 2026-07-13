const pool = require('../db/pool');

// Если поступившая модель ожидается в каком-то активном предзаказе — создаём задачу-уведомление,
// чтобы на Дашборде сразу было видно "товар пришёл, есть клиент, который его ждёт".
// Вызывается после того, как хотя бы один серийник этой модели реально добавлен на склад.
async function notifyIfPreorderWaiting(laptopId, byUserId) {
  try {
    const waitingRes = await pool.query(`
      SELECT p.id, p.client_id FROM preorder_items pi
      JOIN preorders p ON p.id = pi.preorder_id
      WHERE pi.laptop_id = $1 AND pi.item_status != 'transferred' AND p.stage = 'active'
      GROUP BY p.id, p.client_id
    `, [laptopId]);
    if (!waitingRes.rows.length) return;
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
  } catch (e) { console.error('Не удалось создать уведомление о предзаказе:', e.message); }
}

module.exports = { notifyIfPreorderWaiting };
