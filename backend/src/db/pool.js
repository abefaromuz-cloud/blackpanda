const { Pool } = require('pg');
require('dotenv').config();

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 20, // с запасом на 10 одновременных пользователей + фоновые запросы
    })
  : new Pool({
      host:     process.env.DB_HOST     || 'localhost',
      port:     process.env.DB_PORT     || 5432,
      user:     process.env.DB_USER     || 'blackpanda',
      password: process.env.DB_PASSWORD || 'blackpanda',
      database: process.env.DB_NAME     || 'blackpanda',
      max: 20,
    });

pool.on('error', (err) => console.error('PG error', err));

module.exports = pool;
