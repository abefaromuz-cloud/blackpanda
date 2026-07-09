const jwt = require('jsonwebtoken');
const pool = require('../db/pool');
const JWT_SECRET = process.env.JWT_SECRET || 'change_this_secret';

function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Не авторизован' });
  try {
    req.user = jwt.verify(header.split(' ')[1], JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Недействительный токен' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role))
      return res.status(403).json({ error: 'Недостаточно прав' });
    next();
  };
}

// Определяет реальные права пользователя на страницу: точечное право > право роли > нет доступа.
// Роль admin всегда имеет полный доступ, независимо от таблиц прав.
async function resolvePermission(userId, role, pageKey) {
  if (role === 'admin') return { can_view: true, can_edit: true };
  const userRow = await pool.query(
    'SELECT can_view, can_edit FROM user_permissions WHERE user_id=$1 AND page_key=$2', [userId, pageKey]
  );
  if (userRow.rows[0]) return userRow.rows[0];
  const roleRow = await pool.query(
    'SELECT can_view, can_edit FROM role_permissions WHERE role=$1 AND page_key=$2', [role, pageKey]
  );
  return roleRow.rows[0] || { can_view: false, can_edit: false };
}

// Middleware: требует право на просмотр (mode='view') или редактирование (mode='edit') страницы pageKey
function requirePermission(pageKey, mode = 'view') {
  return async (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Не авторизован' });
    if (req.user.role === 'admin') return next();
    try {
      const perm = await resolvePermission(req.user.id, req.user.role, pageKey);
      const ok = mode === 'edit' ? perm.can_edit : perm.can_view;
      if (!ok) return res.status(403).json({ error: 'Нет доступа к этому разделу' });
      next();
    } catch (err) {
      res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
  };
}

module.exports = { authenticate, requireRole, requirePermission, resolvePermission, JWT_SECRET };
