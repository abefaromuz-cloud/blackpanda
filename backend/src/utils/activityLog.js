const pool = require('../db/pool');

// Пишет запись в журнал действий. Никогда не бросает исключение наружу —
// сбой логирования не должен ронять основную операцию (продажу, создание и т.д.).
async function logActivity(user, action, entityType, entityLabel) {
  try {
    await pool.query(
      'INSERT INTO activity_log (user_id, user_name, action, entity_type, entity_label) VALUES ($1,$2,$3,$4,$5)',
      [user?.id || null, user?.full_name || null, action, entityType, entityLabel || null]
    );
  } catch (err) {
    console.error('Не удалось записать журнал действий:', err.message);
  }
}

module.exports = { logActivity };
