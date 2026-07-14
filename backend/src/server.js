require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { startCbrRateScheduler } = require('./utils/cbrRate');
const { startWarrantyReminderScheduler } = require('./utils/warrantyReminder');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

app.get('/api/health', (req, res) => res.json({ status: 'ok', service: 'BlackPanda CRM API' }));
app.use('/api/auth',      require('./routes/auth'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/laptops',   require('./routes/laptops'));
app.use('/api/serials',   require('./routes/serials'));
app.use('/api/clients',   require('./routes/clients'));
app.use('/api/preorders', require('./routes/preorders'));
app.use('/api/sales',     require('./routes/sales'));
app.use('/api/cash',      require('./routes/cash'));
app.use('/api/settings',  require('./routes/settings'));
app.use('/api/admin',     require('./routes/admin'));
app.use('/api/client-portal', require('./routes/clientPortal'));
app.use('/api/employees', require('./routes/employees'));
app.use('/api/finance',   require('./routes/finance'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/reports',   require('./routes/reports'));
app.use('/api/import',    require('./routes/import'));
app.use('/api/activity-log', require('./routes/activityLog'));
app.use('/api/reservations', require('./routes/reservations'));
app.use('/api/bank-accounts', require('./routes/bankAccounts'));
app.use('/api/msg-templates', require('./routes/msgTemplates'));
app.use('/api/broadcast', require('./routes/broadcast'));
app.use('/api/library', require('./routes/library'));
app.use('/api/arrivals', require('./routes/arrivals'));
app.use('/api/service', require('./routes/service'));
app.use('/api/tasks', require('./routes/tasks'));
app.use('/api/search', require('./routes/search'));
app.use('/api/ai', require('./routes/ai'));
app.use('/api/admin-danger', require('./routes/admin-danger'));
app.use('/api/wishlist', require('./routes/wishlist'));
app.use('/api/public', require('./routes/public'));
app.use('/api/nav-order', require('./routes/navOrder'));

// Раздача собранного фронтенда
const DIST = path.join(__dirname, '..', '..', 'frontend', 'dist');
app.use(express.static(DIST));
app.get('*', (req, res) => res.sendFile(path.join(DIST, 'index.html')));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Внутренняя ошибка сервера' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🐼 BlackPanda CRM запущен на порту ${PORT}`);
  startCbrRateScheduler(); // курс ЦБ РФ обновляется сам, без кнопок и захода в интерфейс
  startWarrantyReminderScheduler(); // напоминания об окончании гарантии — раз в сутки
});
