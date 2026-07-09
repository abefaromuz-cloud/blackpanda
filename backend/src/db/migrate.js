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
  console.error('Ошибка миграции:', err);
  process.exit(1);
});
