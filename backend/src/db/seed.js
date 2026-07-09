// Создаёт первого администратора. Запуск: npm run seed
// Данные для входа задаются переменными окружения SEED_EMAIL / SEED_PASSWORD / SEED_NAME,
// либо используются значения по умолчанию ниже (обязательно смените пароль после первого входа).
const bcrypt = require('bcrypt');
const pool = require('./pool');

async function seed() {
  const email = process.env.SEED_EMAIL || 'admin@blackpanda.local';
  const password = process.env.SEED_PASSWORD || 'changeme123';
  const fullName = process.env.SEED_NAME || 'Admin';

  const existing = await pool.query('SELECT id FROM users WHERE email=$1', [email]);
  if (existing.rows.length) {
    console.log('Пользователь уже существует:', email);
    await pool.end();
    return;
  }

  const hash = await bcrypt.hash(password, 10);
  await pool.query(
    'INSERT INTO users (full_name, email, password_hash, role) VALUES ($1,$2,$3,$4)',
    [fullName, email, hash, 'admin']
  );
  console.log('🐼 Создан пользователь:', email, '| пароль:', password);
  await pool.end();
}

seed().catch((err) => {
  console.error('Ошибка сидирования:', err);
  process.exit(1);
});
