const express = require('express');
const pool = require('../db/pool');
const { authenticate, requirePermission } = require('../middleware/auth');
const { logActivity } = require('../utils/activityLog');
const router = express.Router();

// Старые коды статусов (s1..s15) из HTML-версии → новые текстовые метки
const LEGACY_STATUS_MAP = { s1: 'В пути', s2: 'На складе', s3: 'Продан', s15: 'Зарезервирован' };
function mapLegacyStatus(code) { return LEGACY_STATUS_MAP[code] || code || 'На складе'; }

// Импорт из JSON-бэкапа старой HTML/Firebase-версии (кнопка "Бэкап данных" в старом приложении
// выгружает весь объект S целиком — сюда загружаем этот файл как есть).
// Запускать только ОДИН РАЗ: повторный запуск продублирует клиентов, склад и продажи
// (серийники защищены от дублей уникальностью номера, а вот остальные сущности — нет).
router.post('/legacy-backup', authenticate, requirePermission('import', 'edit'), async (req, res) => {
  const data = req.body;
  if (!data || typeof data !== 'object') return res.status(400).json({ error: 'Некорректный файл бэкапа' });

  const client = await pool.connect();
  const clientIdMap = {}, laptopIdMap = {}, serialIdMap = {}, saleIdMap = {};
  const counts = { clients: 0, laptops: 0, serials: 0, sales: 0, cash: 0, debts: 0 };
  let placeholderClientId = null;
  const batchId = require('crypto').randomUUID(); // метка этой конкретной загрузки — по ней можно будет удалить именно её

  // Продажа в новой системе обязательно привязана к клиенту. Если в старом бэкапе у продажи
  // клиент не указан или ссылается на уже несуществующего/удалённого клиента — вместо падения
  // импорта создаём (один раз) служебного клиента-заглушку и вешаем такие продажи на него,
  // чтобы данные не терялись и импорт не прерывался на середине.
  async function getPlaceholderClientId() {
    if (placeholderClientId) return placeholderClientId;
    const existing = await client.query(`SELECT id FROM clients WHERE name='Без клиента (импорт)' LIMIT 1`);
    if (existing.rows[0]) { placeholderClientId = existing.rows[0].id; return placeholderClientId; }
    const created = await client.query(
      `INSERT INTO clients (name, notes, import_batch_id) VALUES ('Без клиента (импорт)', 'Создан автоматически при импорте — продажи без указанного клиента в старой системе', $1) RETURNING id`,
      [batchId]
    );
    placeholderClientId = created.rows[0].id;
    return placeholderClientId;
  }

  try {
    await client.query('BEGIN');

    // 1. Клиенты
    for (const c of (data.clients || [])) {
      const r = await client.query(
        `INSERT INTO clients (name, phone, telegram, balance_rub, notes, import_batch_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [c.name || 'Без имени', c.phone || null, c.telegram || null, c.balance || 0, c.info || null, batchId]
      );
      clientIdMap[c.id] = r.rows[0].id;
      counts.clients++;
    }

    // 2. Модели ноутбуков
    for (const l of (data.laptops || [])) {
      const images = (l.images && l.images.length) ? l.images : (l.image ? [l.image] : []);
      const r = await client.query(
        `INSERT INTO laptops (brand,series,cpu,ram,gpu,storage,color,screen,touch,image_url,images,cost_cny,price_sell_cny,is_hot,import_batch_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,
        [l.brand || '—', l.series || null, l.cpu || null, l.ram || null, l.gpu || null, l.storage || null,
         l.color || null, l.screen || null, l.touch || 'no', images[0] || null, images, l.priceBuyCny || 0, l.priceSellCny || 0, !!l.hot, batchId]
      );
      laptopIdMap[l.id] = r.rows[0].id;
      counts.laptops++;
    }

    // 3. Серийные номера (статусы s1..s15 — те же коды, что и в старой версии, переносятся как есть)
    for (const s of (data.serials || [])) {
      const laptopId = laptopIdMap[s.laptopId];
      if (!laptopId || !s.serial) continue;
      const saleClientId = s.saleClientId ? (clientIdMap[s.saleClientId] || null) : null;
      const r = await client.query(
        `INSERT INTO serials (laptop_id, serial, status_id, arrival_date, sale_date, sale_client_id, warranty_months, warranty_notify, notes, import_batch_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (serial) DO NOTHING RETURNING id`,
        [laptopId, s.serial, mapLegacyStatus(s.statusId), s.arrivalDate || null, s.saleDate || null, saleClientId,
         s.warranty || 3, !!s.warrantyNotify, s.notes || null, batchId]
      );
      if (r.rows[0]) {
        serialIdMap[s.serial] = r.rows[0].id;
        counts.serials++;
        for (const h of (s.history || [])) {
          await client.query(
            'INSERT INTO serial_history (serial_id, status_id, note, created_at) VALUES ($1,$2,$3,COALESCE($4,now()))',
            [r.rows[0].id, mapLegacyStatus(h.status || s.statusId), (h.note || 'Импортировано из старой версии'), h.date || null]
          );
        }
      }
    }

    // 4. Продажи
    for (const sale of (data.sales || [])) {
      let clientId = sale.clientId ? (clientIdMap[sale.clientId] || null) : null;
      if (!clientId) clientId = await getPlaceholderClientId();
      const r = await client.query(
        `INSERT INTO sales (client_id, total_cny, total_rub, rate, payment_mode, note, created_at, import_batch_id)
         VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7,now()),$8) RETURNING id`,
        [clientId, sale.totalCny || 0, sale.totalRub || 0, sale.rate || 13, sale.paymentMode || 'full', sale.note || null, sale.date || null, batchId]
      );
      saleIdMap[sale.id] = r.rows[0].id;
      counts.sales++;
      for (const item of (sale.items || [])) {
        const laptopId = laptopIdMap[item.laptopId];
        if (!laptopId) continue;
        const serialIds = (item.serials || []).map(sn => serialIdMap[sn]).filter(Boolean);
        await client.query(
          `INSERT INTO sale_items (sale_id, laptop_id, serial_ids, qty, price_sell_cny, total_cny)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [r.rows[0].id, laptopId, serialIds, item.qty || 1, item.unitPriceCny || 0, item.totalCny || 0]
        );
      }
    }

    // 5. Долги клиентов (привязка к перенесённым продажам, если найдены)
    for (const c of (data.clients || [])) {
      const newClientId = clientIdMap[c.id];
      if (!newClientId) continue;
      for (const d of (c.debts || [])) {
        const amountRub = d.amountRub || (d.amountCny ? d.amountCny * (d.rateAtSale || 13) : 0);
        if (!amountRub) continue;
        await client.query(
          `INSERT INTO debts (client_id, sale_id, amount_rub, amount_paid_rub, due_date, status, created_at, import_batch_id)
           VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7,now()),$8)`,
          [newClientId, d.saleId ? (saleIdMap[d.saleId] || null) : null, amountRub, d.amountPaid || 0,
           d.dueDate || null, d.status === 'paid' ? 'paid' : 'open', d.date || null, batchId]
        );
        counts.debts++;
      }
    }

    // 6. Касса, курс, банковские счета
    for (const c of (data.cashLog || [])) {
      await client.query(
        `INSERT INTO cash_log (type, amount_rub, note, category, bank_key, created_at, import_batch_id)
         VALUES ($1,$2,$3,'other',$4,COALESCE($5,now()),$6)`,
        [c.type === 'in' ? 'in' : 'out', c.amount || 0, c.note || null, c.bankDest || null, c.date || null, batchId]
      );
      counts.cash++;
    }
    if (typeof data.cashBalance === 'number') {
      await client.query('UPDATE settings SET cash_balance_rub=$1 WHERE id=1', [data.cashBalance]);
    }
    if (data.rate) await client.query('UPDATE settings SET rate=$1 WHERE id=1', [data.rate]);
    for (const rh of (data.rateHistory || [])) {
      if (rh.rate) await client.query('INSERT INTO rate_history (rate, created_at) VALUES ($1,COALESCE($2,now()))', [rh.rate, rh.date || null]);
    }
    if (data.bankBalances) {
      for (const [key, bal] of Object.entries(data.bankBalances)) {
        await client.query('UPDATE bank_accounts SET balance_rub=$1 WHERE key=$2', [bal || 0, key]);
      }
    }

    await client.query(
      'INSERT INTO import_batches (id, imported_by, counts, source_note) VALUES ($1,$2,$3,$4)',
      [batchId, req.user.id, JSON.stringify(counts), 'Импорт из старой HTML-версии']
    );

    await client.query('COMMIT');
    await logActivity(req.user, 'Импорт из старой версии', 'legacy_import',
      `клиенты: ${counts.clients}, модели: ${counts.laptops}, серийники: ${counts.serials}, продажи: ${counts.sales}`);
    res.json({ success: true, counts, batch_id: batchId });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Ошибка импорта: ' + err.message });
  } finally { client.release(); }
});

// Импорт клиентов. rows: [{ name, phone, telegram }]
router.post('/clients', authenticate, requirePermission('import', 'edit'), async (req, res) => {
  const { rows } = req.body;
  if (!Array.isArray(rows) || !rows.length) return res.status(400).json({ error: 'Нет строк для импорта' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let created = 0;
    for (const r of rows) {
      if (!r.name) continue;
      await client.query('INSERT INTO clients (name, phone, telegram) VALUES ($1,$2,$3)', [r.name, r.phone || null, r.telegram || null]);
      created++;
    }
    await client.query('COMMIT');
    await logActivity(req.user, 'Импорт клиентов', 'client', `${created} шт.`);
    res.status(201).json({ created });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  } finally { client.release(); }
});

// Импорт моделей ноутбуков. rows: [{ brand, series, cpu, ram, gpu, storage, cost_cny, price_sell_cny }]
router.post('/laptops', authenticate, requirePermission('import', 'edit'), async (req, res) => {
  const { rows } = req.body;
  if (!Array.isArray(rows) || !rows.length) return res.status(400).json({ error: 'Нет строк для импорта' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let created = 0;
    for (const r of rows) {
      if (!r.brand) continue;
      await client.query(
        `INSERT INTO laptops (brand,series,cpu,ram,gpu,storage,cost_cny,price_sell_cny) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [r.brand, r.series||null, r.cpu||null, r.ram||null, r.gpu||null, r.storage||null, r.cost_cny||0, r.price_sell_cny||0]
      );
      created++;
    }
    await client.query('COMMIT');
    await logActivity(req.user, 'Импорт моделей склада', 'laptop', `${created} шт.`);
    res.status(201).json({ created });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  } finally { client.release(); }
});

// Список партий импорта — что и когда загружали, сколько чего создалось
router.get('/batches', authenticate, requirePermission('import', 'view'), async (req, res) => {
  const result = await pool.query(`
    SELECT ib.*, u.full_name AS imported_by_name FROM import_batches ib LEFT JOIN users u ON u.id = ib.imported_by
    ORDER BY ib.imported_at DESC
  `);
  res.json(result.rows);
});

// Удалить конкретную партию импорта целиком — не трогая ничего, что было добавлено вручную
// после импорта (клиенты удаляются, только если у них не появилось реальной активности с тех пор)
router.delete('/batches/:id', authenticate, requirePermission('import', 'edit'), async (req, res) => {
  const batchId = req.params.id;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query('DELETE FROM serials WHERE import_batch_id=$1', [batchId]); // каскадом уйдёт serial_history, reservations

    const salesRes = await client.query('SELECT id FROM sales WHERE import_batch_id=$1', [batchId]);
    const saleIds = salesRes.rows.map(r => r.id);
    if (saleIds.length) await client.query('DELETE FROM sale_items WHERE sale_id = ANY($1)', [saleIds]);
    await client.query('DELETE FROM sales WHERE import_batch_id=$1', [batchId]);

    await client.query('DELETE FROM debts WHERE import_batch_id=$1', [batchId]);
    await client.query('DELETE FROM cash_log WHERE import_batch_id=$1', [batchId]);

    const laptopsRes = await client.query('SELECT id FROM laptops WHERE import_batch_id=$1', [batchId]);
    const laptopIds = laptopsRes.rows.map(r => r.id);
    if (laptopIds.length) {
      await client.query('DELETE FROM sale_items WHERE laptop_id = ANY($1)', [laptopIds]);
      await client.query('DELETE FROM preorder_items WHERE laptop_id = ANY($1)', [laptopIds]);
    }
    await client.query('DELETE FROM laptops WHERE import_batch_id=$1', [batchId]); // каскадом уйдёт price_history

    // Клиентов удаляем только если с момента импорта у них не появилось ничего своего —
    // иначе можно случайно стереть реального клиента с настоящими продажами
    const clientsRes = await client.query('SELECT id FROM clients WHERE import_batch_id=$1', [batchId]);
    let clientsDeleted = 0;
    for (const c of clientsRes.rows) {
      const stillUsed = await client.query(`
        SELECT (SELECT COUNT(*) FROM sales WHERE client_id=$1) +
               (SELECT COUNT(*) FROM debts WHERE client_id=$1) +
               (SELECT COUNT(*) FROM preorders WHERE client_id=$1) AS n
      `, [c.id]);
      if (Number(stillUsed.rows[0].n) === 0) {
        await client.query('DELETE FROM clients WHERE id=$1', [c.id]);
        clientsDeleted++;
      }
    }

    await client.query('DELETE FROM import_batches WHERE id=$1', [batchId]);
    await client.query('COMMIT');
    await logActivity(req.user, '⚠️ Удалена партия импорта', 'legacy_import',
      `моделей: ${laptopIds.length}, серийников удалено, клиентов: ${clientsDeleted}, продаж: ${saleIds.length}`);
    res.json({ success: true, laptops_deleted: laptopIds.length, clients_deleted: clientsDeleted, sales_deleted: saleIds.length });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  } finally { client.release(); }
});

// Полный бэкап собственных данных — симметрично импорту из старой версии. Скачивает JSON
// со всеми основными таблицами, чтобы можно было восстановить систему при необходимости.
router.get('/export-backup', authenticate, requirePermission('import', 'view'), async (req, res) => {
  try {
    const tables = [
      'clients', 'laptops', 'serials', 'serial_history', 'sales', 'sale_items',
      'preorders', 'preorder_items', 'cash_log', 'debts', 'balance_history',
      'bank_accounts', 'reservations', 'lib_brands', 'lib_series', 'lib_values',
      'lib_statuses', 'employees', 'client_notes', 'tasks',
    ];
    const backup = { exported_at: new Date().toISOString(), version: 2 };
    for (const t of tables) {
      try {
        const r = await pool.query(`SELECT * FROM ${t}`);
        backup[t] = r.rows;
      } catch (e) { backup[t] = []; }
    }
    const settingsRes = await pool.query('SELECT rate, cash_balance_rub FROM settings WHERE id=1');
    backup.settings = settingsRes.rows[0];
    res.setHeader('Content-Disposition', `attachment; filename="blackpanda-backup-${new Date().toISOString().slice(0, 10)}.json"`);
    res.json(backup);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

module.exports = router;
