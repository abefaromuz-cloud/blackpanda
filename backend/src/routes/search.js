const express = require('express');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

router.get('/', authenticate, async (req, res) => {
  const q = (req.query.q || '').trim();
  if (q.length < 2) return res.json({ serials: [], laptops: [], clients: [] });
  const like = `%${q}%`;
  try {
    const [serials, laptops, clients] = await Promise.all([
      pool.query(`SELECT s.id, s.serial, l.brand, l.series FROM serials s JOIN laptops l ON l.id=s.laptop_id WHERE s.serial ILIKE $1 LIMIT 5`, [like]),
      pool.query(`SELECT id, brand, series FROM laptops WHERE is_archived=false AND (brand ILIKE $1 OR series ILIKE $1) LIMIT 5`, [like]),
      pool.query(`SELECT id, name, phone FROM clients WHERE name ILIKE $1 OR phone ILIKE $1 LIMIT 5`, [like]),
    ]);
    res.json({ serials: serials.rows, laptops: laptops.rows, clients: clients.rows });
  } catch (err) { res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

module.exports = router;
