const express = require('express');
const pool = require('../db/pool');
const { authenticate, requirePermission } = require('../middleware/auth');
const { logActivity } = require('../utils/activityLog');
const { sendTelegramMessage } = require('../utils/telegram');
const router = express.Router();

// Список заявок — каждая заявка со всеми своими позициями (мультипозиционно, как в старой версии)
router.get('/', authenticate, requirePermission('service', 'view'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT so.*, c.name AS client_name,
        COALESCE(json_agg(json_build_object(
          'id', soi.id, 'kind', soi.kind, 'serial_id', soi.serial_id, 'device_label', soi.device_label,
          'issue', soi.issue, 'is_warranty', soi.is_warranty, 'cost_rub', soi.cost_rub,
          'technician', soi.technician, 'status', soi.status, 'return_status', soi.return_status,
          'serial', s.serial, 'brand', l.brand, 'series', l.series
        ) ORDER BY soi.created_at) FILTER (WHERE soi.id IS NOT NULL), '[]') AS items
      FROM service_orders so
      LEFT JOIN clients c ON c.id = so.client_id
      LEFT JOIN service_order_items soi ON soi.service_order_id = so.id
      LEFT JOIN serials s ON s.id = soi.serial_id
      LEFT JOIN laptops l ON l.id = s.laptop_id
      GROUP BY so.id, c.name
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

// Создать заявку — сразу с одной или несколькими позициями (items: [{kind, serial_id, device_label, issue, is_warranty, cost_rub, technician}])
router.post('/', authenticate, requirePermission('service', 'edit'), async (req, res) => {
  const { client_id, notes, items } = req.body;
  const list = Array.isArray(items) && items.length ? items : [req.body]; // поддержка старого формата "одна позиция в теле"
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const order = await client.query(
      `INSERT INTO service_orders (client_id, notes) VALUES ($1,$2) RETURNING *`,
      [client_id || null, notes || null]
    );
    for (const it of list) {
      if (it.kind === 'own_stock' && !it.serial_id) continue;
      if (it.kind !== 'own_stock' && !it.device_label) continue;
      const itemRes = await client.query(
        `INSERT INTO service_order_items (service_order_id, kind, serial_id, device_label, issue, is_warranty, cost_rub, technician)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [order.rows[0].id, it.kind || 'external', it.kind === 'own_stock' ? it.serial_id : null,
         it.kind === 'own_stock' ? null : it.device_label, it.issue || null, !!it.is_warranty, it.cost_rub || 0, it.technician || null]
      );
      if (it.kind === 'own_stock' && it.serial_id) {
        await client.query(`UPDATE serials SET status_id='На ремонте' WHERE id=$1`, [it.serial_id]);
        await client.query(`INSERT INTO serial_history (serial_id, status_id, note) VALUES ($1,'На ремонте',$2)`,
          [it.serial_id, 'Передан в сервис' + (it.issue ? ': ' + it.issue : '')]);
      }
    }
    await client.query('COMMIT');
    await logActivity(req.user, 'Заявка в сервис', 'service_order', `${list.length} поз.`);
    res.status(201).json(order.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  } finally { client.release(); }
});

// Добавить позицию в уже существующую заявку
router.post('/:id/items', authenticate, requirePermission('service', 'edit'), async (req, res) => {
  const { kind, serial_id, device_label, issue, is_warranty, cost_rub, technician } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `INSERT INTO service_order_items (service_order_id, kind, serial_id, device_label, issue, is_warranty, cost_rub, technician)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.params.id, kind || 'external', kind === 'own_stock' ? serial_id : null,
       kind === 'own_stock' ? null : device_label, issue || null, !!is_warranty, cost_rub || 0, technician || null]
    );
    if (kind === 'own_stock' && serial_id) {
      await client.query(`UPDATE serials SET status_id='На ремонте' WHERE id=$1`, [serial_id]);
      await client.query(`INSERT INTO serial_history (serial_id, status_id, note) VALUES ($1,'На ремонте',$2)`,
        [serial_id, 'Передан в сервис' + (issue ? ': ' + issue : '')]);
    }
    await client.query('COMMIT');
    res.status(201).json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  } finally { client.release(); }
});

// Обновить заявку целиком (клиент, заметки)
router.put('/:id', authenticate, requirePermission('service', 'edit'), async (req, res) => {
  const { client_id, notes, completed_date } = req.body;
  const result = await pool.query(
    `UPDATE service_orders SET client_id=COALESCE($1,client_id), notes=COALESCE($2,notes), completed_date=COALESCE($3,completed_date)
     WHERE id=$4 RETURNING *`,
    [client_id || null, notes || null, completed_date || null, req.params.id]
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'Не найдено' });
  res.json(result.rows[0]);
});

// Обновить одну позицию (статус/стоимость/мастер/гарантия) — статус меняется независимо у каждой позиции
router.put('/:id/items/:itemId', authenticate, requirePermission('service', 'edit'), async (req, res) => {
  const { status, cost_rub, technician, is_warranty, issue, return_status } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE service_order_items SET status=COALESCE($1,status), cost_rub=COALESCE($2,cost_rub),
       technician=COALESCE($3,technician), is_warranty=COALESCE($4,is_warranty), issue=COALESCE($5,issue)
       WHERE id=$6 AND service_order_id=$7 RETURNING *`,
      [status || null, cost_rub ?? null, technician || null, is_warranty ?? null, issue || null, req.params.itemId, req.params.id]
    );
    const item = result.rows[0];
    if (!item) throw { status: 404, message: 'Позиция не найдена' };

    if (item.serial_id && status === 'done' && return_status) {
      await client.query(`UPDATE serials SET status_id=$1 WHERE id=$2`, [return_status, item.serial_id]);
      await client.query(`INSERT INTO serial_history (serial_id, status_id, note) VALUES ($1,$2,'Ремонт завершён')`, [item.serial_id, return_status]);
      await client.query(`UPDATE service_order_items SET return_status=$1 WHERE id=$2`, [return_status, item.id]);
    }

    // Если ВСЕ позиции заявки готовы — проставляем дату завершения самой заявки и уведомляем клиента один раз
    const allItems = await client.query('SELECT status FROM service_order_items WHERE service_order_id=$1', [req.params.id]);
    const allDone = allItems.rows.length > 0 && allItems.rows.every(r => r.status === 'done' || r.status === 'issued' || r.status === 'declined');
    let justCompleted = false;
    if (allDone) {
      const orderRes = await client.query('SELECT completed_date, client_id FROM service_orders WHERE id=$1', [req.params.id]);
      if (orderRes.rows[0] && !orderRes.rows[0].completed_date) {
        await client.query('UPDATE service_orders SET completed_date=now() WHERE id=$1', [req.params.id]);
        justCompleted = true;
      }
    }
    await client.query('COMMIT');

    // Уведомление клиенту в Telegram, когда ВСЯ заявка (а не только эта позиция) готова
    if (justCompleted) {
      const orderRes = await pool.query('SELECT client_id FROM service_orders WHERE id=$1', [req.params.id]);
      const cid = orderRes.rows[0]?.client_id;
      if (cid) {
        const clRes = await pool.query('SELECT name, telegram FROM clients WHERE id=$1', [cid]);
        if (clRes.rows[0]?.telegram) {
          const totalCost = await pool.query('SELECT COALESCE(SUM(cost_rub),0) AS total FROM service_order_items WHERE service_order_id=$1', [req.params.id]);
          sendTelegramMessage(clRes.rows[0].telegram,
            `🐼 BlackPanda\n\nЗдравствуйте, ${clRes.rows[0].name}! Ваша заявка в сервис полностью готова.` +
            (Number(totalCost.rows[0].total) > 0 ? `\nСтоимость: ${Math.round(totalCost.rows[0].total).toLocaleString('ru-RU')} ₽` : '')
          ).catch(() => {});
        }
      }
    }

    res.json(item);
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.status) return res.status(err.status).json({ error: err.message });
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  } finally { client.release(); }
});

router.delete('/:id/items/:itemId', authenticate, requirePermission('service', 'edit'), async (req, res) => {
  await pool.query('DELETE FROM service_order_items WHERE id=$1 AND service_order_id=$2', [req.params.itemId, req.params.id]);
  res.json({ success: true });
});

router.delete('/:id', authenticate, requirePermission('service', 'edit'), async (req, res) => {
  await pool.query('DELETE FROM service_orders WHERE id=$1', [req.params.id]);
  res.json({ success: true });
});

module.exports = router;
