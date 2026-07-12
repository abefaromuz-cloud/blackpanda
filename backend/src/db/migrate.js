const fs = require('fs');
const path = require('path');
const pool = require('./pool');

async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, '..', '..', 'db', 'schema.sql'), 'utf8');
  await pool.query(sql);
  console.log('🐼 Схема БД применена успешно');
  await pool.end();
}

migrate().catch((err) => {
  // Не роняем весь контейнер из-за сбоя миграции — иначе сервер вообще не стартует и
  // теряется доступ даже к Console/логам для диагностики. Ошибку показываем явно,
  // но даём серверу подняться (существующая часть схемы почти наверняка уже применена).
  console.error('⚠️ Ошибка миграции (сервер всё равно запустится):', err.message);
  console.error(err);
  process.exit(0);
});
