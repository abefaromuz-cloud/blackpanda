const express = require('express');
const pool = require('../db/pool');
const { authenticate, requirePermission } = require('../middleware/auth');
const { logActivity } = require('../utils/activityLog');
const { sendTelegramMessage } = require('../utils/telegram');
const router = express.Router();

// Этапы ремонта — как в старой версии (отправка в Китай), у каждого устройства свой этап независимо
const STAGES = {
  received: { ru: 'Принят на ремонт', zh: '已接收', ico: '📥' },
  consolidation: { ru: 'Консолидация — ожидает отправки в Китай', zh: '等待发往中国', ico: '📦' },
  sent_cn: { ru: 'Отправлен в Китай', zh: '已发往中国', ico: '✈️' },
  in_repair: { ru: 'На ремонте в Китае', zh: '维修中', ico: '🔧' },
  returning: { ru: 'Возвращается из Китая', zh: '回程中', ico: '📬' },
  awaiting_repair: { ru: 'Ожидает ремонта', zh: '等待维修', ico: '🕒' },
  repairing_local: { ru: 'Ремонтируется у нас', zh: '本地维修中', ico: '🛠️' },
  ready: { ru: 'Готов к выдаче — свяжитесь с нами для получения', zh: '可取件，请联系我们', ico: '✅' },
  done: { ru: 'Выдан клиенту', zh: '已交付', ico: '🏁' },
};

async function notifyStage(item, stage) {
  try {
    if (!item.serial_id && !item.device_label) return;
    const orderRes = await pool.query('SELECT client_id FROM service_orders WHERE id=$1', [item.service_order_id]);
    const clientId = orderRes.rows[0]?.client_id;
    if (!clientId) return;
    const clRes = await pool.query('SELECT name, telegram FROM clients WHERE id=$1', [clientId]);
    const cl = clRes.rows[0];
    if (!cl?.telegram) return;
    const st = STAGES[stage] || STAGES.received;
    const rateRes = await pool.query('SELECT rate FROM settings WHERE id=1');
    const rate = Number(rateRes.rows[0].rate);
    let name = item.device_label;
    if (item.serial_id) {
      const sr = await pool.query('SELECT s.serial, l.brand, l.series FROM serials s JOIN laptops l ON l.id=s.laptop_id WHERE s.id=$1', [item.serial_id]);
      if (sr.rows[0]) name = `${sr.rows[0].serial} — ${sr.rows[0].brand} ${sr.rows[0].series || ''}`.trim();
    }
    let msg = `🐼 BlackPanda\n\n${st.ico} Обновление статуса ремонта\n\nУважаемый(ая) ${cl.name}!\n\nТекущий статус: ${st.ru}\n\nУстройство: ${name}\n`;
    if (item.issue) msg += `🔍 ${item.issue}\n`;
    if (Number(item.cost_cny) > 0) msg += `💰 ¥${item.cost_cny} (≈${Math.round(item.cost_cny * rate).toLocaleString('ru-RU')} ₽)\n`;
    if (item.tracking && (stage === 'sent_cn' || stage === 'returning')) msg += `📦 Трек-номер: ${item.tracking}\n`;
    if (item.expected_date && stage !== 'done' && stage !== 'ready') msg += `⏰ Ожидаемая дата возврата: ${new Date(item.expected_date).toLocaleDateString('ru-RU')}\n`;
    msg += `\nДата: ${new Date().toLocaleDateString('ru-RU')}`;
    await sendTelegramMessage(cl.telegram, msg);
  } catch (e) { console.error('Не удалось отправить уведомление о статусе ремонта:', e.message); }
}

// Список заявок — каждая заявка со всеми своими позициями (мультипозиционно)
router.get('/', authenticate, requirePermission('service', 'view'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT so.*, c.name AS client_name,
        COALESCE(json_agg(json_build_object(
          'id', soi.id, 'kind', soi.kind, 'serial_id', soi.serial_id, 'device_label', soi.device_label,
          'issue', soi.issue, 'is_warranty', soi.is_warranty, 'cost_cny', soi.cost_cny,
          'technician', soi.technician, 'stage', soi.status, 'return_status', soi.return_status,
          'tracking', soi.tracking, 'expected_date', soi.expected_date, 'repair_location', soi.repair_location,
          'serial', s.serial, 'brand', l.brand, 'series', l.series,
          'cpu', l.cpu, 'ram', l.ram, 'gpu', l.gpu, 'storage', l.storage, 'color', l.color, 'screen', l.screen,
          'created_at', soi.created_at, 'image_url', l.image_url,
          'sale_date', s.sale_date, 'warranty_months', s.warranty_months
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

// Найти серийник по номеру — плюс автоподстановка клиента, если этот ноутбук уже кому-то продавался
router.get('/lookup-serial/:serial', authenticate, requirePermission('service', 'view'), async (req, res) => {
  const result = await pool.query(
    `SELECT s.id, s.serial, s.status_id, s.sale_client_id, l.brand, l.series, l.cpu, l.gpu, l.ram, l.storage, l.screen, l.color,
       c.name AS sale_client_name
     FROM serials s JOIN laptops l ON l.id=s.laptop_id LEFT JOIN clients c ON c.id=s.sale_client_id
     WHERE s.serial=$1`, [req.params.serial]
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'Не найден в нашей базе — оформляй как внешнее устройство' });
  res.json(result.rows[0]);
});

// Создать заявку — сразу с одной или несколькими позициями
router.post('/', authenticate, requirePermission('service', 'edit'), async (req, res) => {
  const { client_id, notes, items } = req.body;
  const list = Array.isArray(items) && items.length ? items : [req.body];
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
        `INSERT INTO service_order_items (service_order_id, kind, serial_id, device_label, issue, is_warranty, cost_cny, technician, expected_date, status, repair_location)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'received',$10) RETURNING *`,
        [order.rows[0].id, it.kind || 'external', it.kind === 'own_stock' ? it.serial_id : null,
         it.kind === 'own_stock' ? null : it.device_label, it.issue || null, !!it.is_warranty, it.cost_cny || 0, it.technician || null, it.expected_date || null, it.repair_location || 'china']
      );
      await client.query('INSERT INTO service_item_history (service_item_id, stage, note) VALUES ($1,$2,$3)', [itemRes.rows[0].id, 'received', 'Принято на ремонт']);
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
  const { kind, serial_id, device_label, issue, is_warranty, cost_cny, technician, expected_date, repair_location } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `INSERT INTO service_order_items (service_order_id, kind, serial_id, device_label, issue, is_warranty, cost_cny, technician, expected_date, status, repair_location)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'received',$10) RETURNING *`,
      [req.params.id, kind || 'external', kind === 'own_stock' ? serial_id : null,
       kind === 'own_stock' ? null : device_label, issue || null, !!is_warranty, cost_cny || 0, technician || null, expected_date || null, repair_location || 'china']
    );
    await client.query('INSERT INTO service_item_history (service_item_id, stage, note) VALUES ($1,$2,$3)', [result.rows[0].id, 'received', 'Принято на ремонт']);
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

// Сменить этап конкретного устройства (независимо от остальных в заявке) — при переходе на
// "Отправлен в Китай" можно указать трек-номер; на "Выдан клиенту" — статус, в котором серийник
// возвращается на склад. Клиенту автоматически уходит уведомление о новом этапе.
router.put('/:id/items/:itemId', authenticate, requirePermission('service', 'edit'), async (req, res) => {
  const { stage, cost_cny, technician, is_warranty, issue, tracking, expected_date, return_status, repair_location } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE service_order_items SET status=COALESCE($1,status), cost_cny=COALESCE($2,cost_cny),
       technician=COALESCE($3,technician), is_warranty=COALESCE($4,is_warranty), issue=COALESCE($5,issue),
       tracking=COALESCE($6,tracking), expected_date=COALESCE($7,expected_date), repair_location=COALESCE($8,repair_location)
       WHERE id=$9 AND service_order_id=$10 RETURNING *`,
      [stage || null, cost_cny ?? null, technician || null, is_warranty ?? null, issue || null,
       tracking || null, expected_date || null, repair_location || null, req.params.itemId, req.params.id]
    );
    const item = result.rows[0];
    if (!item) throw { status: 404, message: 'Позиция не найдена' };

    if (stage) {
      await client.query('INSERT INTO service_item_history (service_item_id, stage) VALUES ($1,$2)', [item.id, stage]);
    }

    if (item.serial_id && stage === 'done' && return_status) {
      await client.query(`UPDATE serials SET status_id=$1 WHERE id=$2`, [return_status, item.serial_id]);
      await client.query(`INSERT INTO serial_history (serial_id, status_id, note) VALUES ($1,$2,'Ремонт завершён')`, [item.serial_id, return_status]);
      await client.query(`UPDATE service_order_items SET return_status=$1 WHERE id=$2`, [return_status, item.id]);
    }

    // Если ВСЕ позиции заявки выданы клиенту — проставляем дату завершения самой заявки
    const allItems = await client.query('SELECT status FROM service_order_items WHERE service_order_id=$1', [req.params.id]);
    const allDone = allItems.rows.length > 0 && allItems.rows.every(r => r.status === 'done');
    if (allDone) {
      const orderRes = await client.query('SELECT completed_date FROM service_orders WHERE id=$1', [req.params.id]);
      if (orderRes.rows[0] && !orderRes.rows[0].completed_date) {
        await client.query('UPDATE service_orders SET completed_date=now() WHERE id=$1', [req.params.id]);
      }
    }

    await client.query('COMMIT');
    if (stage) await notifyStage(item, stage); // не блокирует ответ, шлётся после коммита

    res.json(item);
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.status) return res.status(err.status).json({ error: err.message });
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  } finally { client.release(); }
});

// Отправить уведомление о текущем этапе устройства вручную (например, повторно)
router.post('/:id/items/:itemId/notify', authenticate, requirePermission('service', 'edit'), async (req, res) => {
  const item = (await pool.query('SELECT * FROM service_order_items WHERE id=$1 AND service_order_id=$2', [req.params.itemId, req.params.id])).rows[0];
  if (!item) return res.status(404).json({ error: 'Не найдено' });
  await notifyStage(item, item.status);
  res.json({ success: true });
});

// История смены этапов конкретного устройства
router.get('/:id/items/:itemId/history', authenticate, requirePermission('service', 'view'), async (req, res) => {
  const result = await pool.query('SELECT * FROM service_item_history WHERE service_item_id=$1 ORDER BY created_at ASC', [req.params.itemId]);
  res.json(result.rows);
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
