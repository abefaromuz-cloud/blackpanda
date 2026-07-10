const express = require('express');
const bcrypt = require('bcrypt');
const pool = require('../db/pool');
const { authenticate, requireRole } = require('../middleware/auth');
const { logActivity } = require('../utils/activityLog');
const router = express.Router();

// Всё в этом файле — только для администратора. Права роли/пользователя тут не участвуют:
// доступ к самой админке нельзя выдать через матрицу прав, только явной ролью 'admin'.
router.use(authenticate, requireRole('admin'));

const PAGES = ['dashboard','warehouse','clients','preorders','sales','cash','settings','admin','client_portal',
  'finance','analytics','reports','import','employees','activity_log','scan','broadcast','library','arrivals','service'];
const ROLES = ['admin','staff','accountant','client'];

// ---------- Пользователи ----------
router.get('/users', async (req, res) => {
  const result = await pool.query(
    `SELECT u.id, u.full_name, u.email, u.role, u.is_active, u.client_id, u.created_at, c.name AS client_name
     FROM users u LEFT JOIN clients c ON c.id = u.client_id ORDER BY u.created_at`
  );
  res.json(result.rows);
});

router.post('/users', async (req, res) => {
  const { full_name, email, password, role, client_id } = req.body;
  if (!full_name || !email || !password) return res.status(400).json({ error: 'Заполните имя, email и пароль' });
  if (!ROLES.includes(role)) return res.status(400).json({ error: 'Недопустимая роль' });
  if (role === 'client' && !client_id) return res.status(400).json({ error: 'Для роли «клиент» укажите карточку клиента' });
  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (full_name, email, password_hash, role, client_id) VALUES ($1,$2,$3,$4,$5) RETURNING id, full_name, email, role, client_id',
      [full_name, email, hash, role, role === 'client' ? client_id : null]
    );
    await logActivity(req.user, 'Создан пользователь', 'user', full_name + ' (' + role + ')');
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email уже занят' });
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

router.put('/users/:id', async (req, res) => {
  const { full_name, email, role, is_active, client_id, password } = req.body;
  try {
    if (password) {
      const hash = await bcrypt.hash(password, 10);
      await pool.query('UPDATE users SET password_hash=$1 WHERE id=$2', [hash, req.params.id]);
    }
    const result = await pool.query(
      `UPDATE users SET full_name=COALESCE($1,full_name), email=COALESCE($2,email), role=COALESCE($3,role),
       is_active=COALESCE($4,is_active), client_id=$5 WHERE id=$6
       RETURNING id, full_name, email, role, is_active, client_id`,
      [full_name||null, email||null, role||null, is_active ?? null, client_id||null, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Пользователь не найден' });
    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email уже занят' });
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

router.delete('/users/:id', async (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ error: 'Нельзя удалить самого себя' });
  await pool.query('DELETE FROM users WHERE id=$1', [req.params.id]);
  res.json({ success: true });
});

// ---------- Права доступа ----------
// Полная матрица: права по ролям + все точечные переопределения по пользователям
router.get('/permissions', async (req, res) => {
  const [roleRows, userRows] = await Promise.all([
    pool.query('SELECT * FROM role_permissions'),
    pool.query(`SELECT up.*, u.full_name, u.email FROM user_permissions up JOIN users u ON u.id=up.user_id`),
  ]);
  res.json({ pages: PAGES, roles: ROLES, rolePermissions: roleRows.rows, userPermissions: userRows.rows });
});

// Установить право для роли на страницу
router.put('/permissions/role', async (req, res) => {
  const { role, page_key, can_view, can_edit } = req.body;
  if (!ROLES.includes(role) || !PAGES.includes(page_key)) return res.status(400).json({ error: 'Некорректные данные' });
  await pool.query(
    `INSERT INTO role_permissions (role, page_key, can_view, can_edit) VALUES ($1,$2,$3,$4)
     ON CONFLICT (role, page_key) DO UPDATE SET can_view=$3, can_edit=$4`,
    [role, page_key, !!can_view, !!can_edit]
  );
  res.json({ success: true });
});

// Установить точечное право для конкретного пользователя (перекрывает роль)
router.put('/permissions/user', async (req, res) => {
  const { user_id, page_key, can_view, can_edit } = req.body;
  if (!PAGES.includes(page_key)) return res.status(400).json({ error: 'Некорректная страница' });
  await pool.query(
    `INSERT INTO user_permissions (user_id, page_key, can_view, can_edit) VALUES ($1,$2,$3,$4)
     ON CONFLICT (user_id, page_key) DO UPDATE SET can_view=$3, can_edit=$4`,
    [user_id, page_key, !!can_view, !!can_edit]
  );
  res.json({ success: true });
});

// Убрать точечное переопределение — пользователь вернётся к правам своей роли
router.delete('/permissions/user/:userId/:pageKey', async (req, res) => {
  await pool.query('DELETE FROM user_permissions WHERE user_id=$1 AND page_key=$2', [req.params.userId, req.params.pageKey]);
  res.json({ success: true });
});

module.exports = router;
