const express = require('express');
const pool = require('../db/pool');
const { authenticate, requirePermission } = require('../middleware/auth');
const { logActivity } = require('../utils/activityLog');
const router = express.Router();

router.get('/', authenticate, requirePermission('service', 'view'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT so.*, s.serial, l.brand, l.series, c.name AS client_name
      FROM service_orders so
      LEFT JOIN serials s ON s.id = so.serial_id
      LEFT JOIN laptops l ON l.id = s.laptop_id
      LEFT JOIN clients c ON c.id = so.client_id
      ORDER BY so.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

// Найти серийник по номеру — чтобы понять "наш это ноутбук или нет" при оформлении заявки
router.get('/lookup-serial/:serial', authenticate, requirePermission('service', 'view'), async (req, res) => {
  const result = await pool.query(
    `SELECT s.id, s.serial, s.status_id, s.sale_client_id, l.brand, l.series, c.name AS sale_client_name
     FROM serials s JOIN laptops l ON l.id=s.laptop_id LEFT JOIN clients c ON c.id=s.sale_client_id
     WHERE s.serial=$1`, [req.params.serial]
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'Не найден в нашей базе — оформляй как внешнее устройство' });
  res.json(result.rows[0]);
});

router.post('/', authenticate, requirePermission('service', 'edit'), async (req, res) => {
  const { kind, serial_id, device_label, client_id, issue, is_warranty, cost_rub, technician, notes } = req.body;
  if (kind === 'own_stock' && !serial_id) return res.status(400).json({ error: 'Укажите серийник своего товара' });
  if (kind === 'external' && !device_label) return res.status(400).json({ error: 'Укажите модель внешнего устройства' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `INSERT INTO service_orders (kind, serial_id, device_label, client_id, issue, is_warranty, cost_rub, technician, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [kind || 'external', kind === 'own_stock' ? serial_id : null, device_label || null, client_id || null,
       issue || null, !!is_warranty, cost_rub || 0, technician || null, notes || null]
    );
    if (kind === 'own_stock' && serial_id) {
      await client.query(`UPDATE serials SET status_id='На ремонте' WHERE id=$1`, [serial_id]);
      await client.query(`INSERT INTO serial_history (serial_id, status_id, note) VALUES ($1,'На ремонте',$2)`,
        [serial_id, 'Передан в сервис' + (issue ? ': ' + issue : '')]);
    }
    await client.query('COMMIT');
    await logActivity(req.user, 'Заявка в сервис', 'service_order', device_label || 'наш товар');
    res.status(201).json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  } finally { client.release(); }
});

router.put('/:id', authenticate, requirePermission('service', 'edit'), async (req, res) => {
  const { status, cost_rub, technician, notes, is_warranty, completed_date, return_status } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE service_orders SET status=COALESCE($1,status), cost_rub=COALESCE($2,cost_rub),
       technician=COALESCE($3,technician), notes=COALESCE($4,notes), is_warranty=COALESCE($5,is_warranty),
       completed_date=COALESCE($6,completed_date) WHERE id=$7 RETURNING *`,
      [status||null, cost_rub ?? null, technician||null, notes||null, is_warranty ?? null, completed_date||null, req.params.id]
    );
    const order = result.rows[0];
    if (!order) throw { status: 404, message: 'Не найдено' };
    // Когда ремонт завершён и это наш серийник — статус самого серийника тоже можно вернуть в выбранный
    if (order.serial_id && status === 'done' && return_status) {
      await client.query(`UPDATE serials SET status_id=$1 WHERE id=$2`, [return_status, order.serial_id]);
      await client.query(`INSERT INTO serial_history (serial_id, status_id, note) VALUES ($1,$2,'Ремонт завершён')`, [order.serial_id, return_status]);
    }
    await client.query('COMMIT');
    res.json(order);
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.status) return res.status(err.status).json({ error: err.message });
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  } finally { client.release(); }
});

router.delete('/:id', authenticate, requirePermission('service', 'edit'), async (req, res) => {
  await pool.query('DELETE FROM service_orders WHERE id=$1', [req.params.id]);
  res.json({ success: true });
});

module.exports = router;
