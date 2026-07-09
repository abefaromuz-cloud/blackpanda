const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../db/pool');
const { JWT_SECRET, authenticate, resolvePermission } = require('../middleware/auth');
const router = express.Router();

const ALL_PAGES = ['dashboard','warehouse','clients','preorders','sales','cash','settings','admin','client_portal',
  'suppliers','finance','analytics','reports','import','employees','activity_log','scan','broadcast','library'];

async function buildPermissionsMap(userId, role) {
  const map = {};
  for (const p of ALL_PAGES) map[p] = await resolvePermission(userId, role, p);
  return map;
}

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email и пароль обязательны' });
  try {
    const result = await pool.query('SELECT * FROM users WHERE email=$1', [email]);
    const user = result.rows[0];
    if (!user || !user.is_active) return res.status(401).json({ error: 'Неверный email или пароль' });
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Неверный email или пароль' });
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, full_name: user.full_name, client_id: user.client_id },
      JWT_SECRET, { expiresIn: '12h' }
    );
    const permissions = await buildPermissionsMap(user.id, user.role);
    res.json({ token, user: { id: user.id, full_name: user.full_name, email: user.email, role: user.role, client_id: user.client_id }, permissions });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

router.get('/me', authenticate, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, full_name, email, role, client_id FROM users WHERE id=$1', [req.user.id]);
    const permissions = await buildPermissionsMap(req.user.id, req.user.role);
    res.json({ ...result.rows[0], permissions });
  } catch (err) {
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

router.put('/change-password', authenticate, async (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) return res.status(400).json({ error: 'Укажите текущий и новый пароль' });
  try {
    const result = await pool.query('SELECT * FROM users WHERE id=$1', [req.user.id]);
    const user = result.rows[0];
    const match = await bcrypt.compare(current_password, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Неверный текущий пароль' });
    const hash = await bcrypt.hash(new_password, 10);
    await pool.query('UPDATE users SET password_hash=$1 WHERE id=$2', [hash, req.user.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

module.exports = router;
