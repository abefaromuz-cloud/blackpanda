const express = require('express');
const pool = require('../db/pool');
const { authenticate, requirePermission } = require('../middleware/auth');
const { logActivity } = require('../utils/activityLog');
const { sendTelegramMessage } = require('../utils/telegram');
const router = express.Router();

router.get('/', authenticate, requirePermission('sales', 'view'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT s.*, c.name AS client_name, c.telegram AS client_telegram, u.full_name AS employee_name,
        COALESCE(json_agg(json_build_object(
          'id', si.id, 'laptop_id', si.laptop_id, 'qty', si.qty,
          'price_sell_cny', si.price_sell_cny, 'price_sell_rub', si.price_sell_rub,
          'price_cost_cny', si.price_cost_cny, 'total_cny', si.total_cny,
          'brand', l.brand, 'series', l.series, 'cpu', l.cpu, 'gpu', l.gpu,
          'ram', l.ram, 'storage', l.storage, 'color', l.color, 'screen', l.screen,
          'serials', (SELECT array_agg(sr.serial) FROM serials sr WHERE sr.id = ANY(si.serial_ids)),
          'serial_details', (
            SELECT json_agg(json_build_object('serial', sr.serial, 'warranty_months', sr.warranty_months, 'status_id', sr.status_id))
            FROM serials sr WHERE sr.id = ANY(si.serial_ids)
          )
        )) FILTER (WHERE si.id IS NOT NULL), '[]') AS items
      FROM sales s LEFT JOIN clients c ON c.id=s.client_id
      LEFT JOIN users u ON u.id = s.created_by
      LEFT JOIN sale_items si ON si.sale_id=s.id
      LEFT JOIN laptops l ON l.id = si.laptop_id
      GROUP BY s.id, c.name, c.telegram, u.full_name
      ORDER BY s.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

// Полноценное оформление продажи из визарда сканирования: несколько моделей, своя цена по каждой,
// скидка в рублях, любой способ оплаты (нал/банк/сплит/долг/из баланса клиента)
router.post('/', authenticate, requirePermission('sales', 'edit'), async (req, res) => {
  const {
    client_id, items, note, discount_rub,
    payment_mode, pay_dest, split_cash, split_bank, bank_dest, paid_now_rub, due_date,
  } = req.body;
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'Нет позиций для продажи' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const settingsRes = await client.query('SELECT * FROM settings WHERE id=1');
    const settings = settingsRes.rows[0];
    const rate = Number(settings.rate);

    let subtotalRub = 0, subtotalCny = 0;
    const resolvedItems = [];
    for (const it of items) {
      if (!Array.isArray(it.serials) || !it.serials.length) continue;
      const laptopRes = await client.query('SELECT * FROM laptops WHERE id=$1', [it.laptop_id]);
      const laptop = laptopRes.rows[0];
      if (!laptop) throw { status: 400, message: 'Модель не найдена' };
      const sers = [];
      for (const sn of it.serials) {
        const sr = await client.query(`SELECT * FROM serials WHERE serial=$1 AND status_id IN (SELECT label FROM lib_statuses WHERE counts_as IN ('instock','reserved'))`, [sn]);
        if (!sr.rows[0]) throw { status: 400, message: `Серийник ${sn} не найден на складе` };
        sers.push(sr.rows[0]);
      }
      const manualOverride = it.price_sell_cny !== undefined && it.price_sell_cny !== '';
      const qty = sers.length;
      let totalCny;
      if (manualOverride) {
        // Сотрудник вручную поправил цену в визарде — применяем её ко всей группе как обычно
        totalCny = Number(it.price_sell_cny) * qty;
      } else {
        // Иначе — берём цену каждой единицы отдельно: своя цена серийника (например, скидка на
        // восстановленный), если задана, иначе цена модели по умолчанию
        totalCny = sers.reduce((sum, sr) => sum + Number(sr.price_override_cny ?? laptop.price_sell_cny), 0);
      }
      const unitPriceCny = qty > 0 ? totalCny / qty : Number(laptop.price_sell_cny);
      const totalRub = totalCny * rate;
      subtotalCny += totalCny; subtotalRub += totalRub;
      resolvedItems.push({ laptop, sers, unitPriceCny, qty, totalCny, totalRub, costCny: Number(laptop.cost_cny) });
    }
    if (!resolvedItems.length) throw { status: 400, message: 'Ни одна позиция не найдена' };

    const discRub = Number(discount_rub) || 0;
    const finalRub = Math.max(0, subtotalRub - discRub);
    const finalCny = rate > 0 ? finalRub / rate : 0;

    // Проверки для режимов оплаты, требующих клиента / достаточного баланса
    let cl = null;
    if (client_id) {
      const clRes = await client.query('SELECT * FROM clients WHERE id=$1 FOR UPDATE', [client_id]);
      cl = clRes.rows[0];
    }
    if (payment_mode === 'balance') {
      if (!cl) throw { status: 400, message: 'Выберите клиента для оплаты с баланса' };
    }
    if (payment_mode === 'partial' && !cl) {
      throw { status: 400, message: 'Выберите клиента для записи долга' };
    }

    const sale = await client.query(
      `INSERT INTO sales (client_id, total_cny, total_rub, rate, payment_mode, note, created_by)
       VALUES ($1,$2,0,$3,$4,$5,$6) RETURNING *`,
      [client_id || null, finalCny, rate, payment_mode || 'full', note || null, req.user.id]
    );
    await client.query('UPDATE sales SET total_rub=$1 WHERE id=$2', [finalRub, sale.rows[0].id]);

    for (const ri of resolvedItems) {
      await client.query(
        `INSERT INTO sale_items (sale_id, laptop_id, serial_ids, qty, price_sell_cny, price_sell_rub, price_cost_cny, total_cny)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [sale.rows[0].id, ri.laptop.id, ri.sers.map(s => s.id), ri.qty, ri.unitPriceCny, ri.unitPriceCny * rate, ri.costCny, ri.totalCny]
      );
      for (const sr of ri.sers) {
        await client.query(`UPDATE serials SET status_id='Продан', sale_date=now(), sale_client_id=$1 WHERE id=$2`, [client_id || null, sr.id]);
        await client.query(
          `INSERT INTO serial_history (serial_id, status_id, note) VALUES ($1,'Продан',$2)`,
          [sr.id, 'Продан' + (client_id ? ' клиенту ' + (cl?.name || '') : '')]
        );
        // Если серийник был зарезервирован — закрываем резерв
        await client.query(`UPDATE reservations SET active=false WHERE serial_id=$1 AND active=true`, [sr.id]);
      }
    }

    // Обработка способа оплаты
    const mode = payment_mode || 'full';
    if (mode === 'balance') {
      const bal = Number(cl.balance_rub);
      const fromBalance = Math.min(bal, finalRub);
      const remainder = finalRub - fromBalance;
      const newBalance = bal - fromBalance;
      await client.query('UPDATE clients SET balance_rub=$1 WHERE id=$2', [newBalance, client_id]);
      await client.query('INSERT INTO balance_history (client_id, amount_rub, note, balance_after_rub) VALUES ($1,$2,$3,$4)',
        [client_id, -fromBalance, 'Оплата продажи с баланса', newBalance]);
      if (remainder > 0) {
        // остаток — наличными в кассу
        await client.query('UPDATE settings SET cash_balance_rub = cash_balance_rub + $1 WHERE id=1', [remainder]);
        await client.query(`INSERT INTO cash_log (type, amount_rub, note, client_id, category) VALUES ('in',$1,'Доплата наличными к продаже (баланс не покрыл)',$2,'other')`,
          [remainder, client_id]);
      }
    } else if (mode === 'partial') {
      const paidNow = Math.max(0, Math.min(finalRub, Number(paid_now_rub) || 0));
      const remaining = finalRub - paidNow;
      if (paidNow > 0) {
        await client.query('UPDATE settings SET cash_balance_rub = cash_balance_rub + $1 WHERE id=1', [paidNow]);
        await client.query(`INSERT INTO cash_log (type, amount_rub, note, client_id, category) VALUES ('in',$1,'Частичная оплата продажи',$2,'other')`,
          [paidNow, client_id]);
      }
      if (remaining > 0.5) {
        await client.query(
          'INSERT INTO debts (client_id, sale_id, amount_rub, due_date) VALUES ($1,$2,$3,$4)',
          [client_id, sale.rows[0].id, remaining, due_date || null]
        );
      }
    } else if (mode === 'split') {
      const cash = Math.max(0, Number(split_cash) || 0);
      const bank = Math.max(0, Number(split_bank) || 0);
      const bankKey = bank_dest || 'sber';
      if (cash > 0) {
        await client.query('UPDATE settings SET cash_balance_rub = cash_balance_rub + $1 WHERE id=1', [cash]);
        await client.query(`INSERT INTO cash_log (type, amount_rub, note, client_id, category) VALUES ('in',$1,'Продажа (наличные)',$2,'other')`, [cash, client_id || null]);
      }
      if (bank > 0) {
        await client.query('UPDATE bank_accounts SET balance_rub = balance_rub + $1 WHERE key=$2', [bank, bankKey]);
        await client.query(`INSERT INTO cash_log (type, amount_rub, note, client_id, category, bank_key) VALUES ('in',$1,'Продажа (перевод)',$2,'other',$3)`, [bank, client_id || null, bankKey]);
      }
    } else {
      // full — целиком в кассу или на банк
      const dest = pay_dest || 'cash';
      if (dest === 'cash') {
        await client.query('UPDATE settings SET cash_balance_rub = cash_balance_rub + $1 WHERE id=1', [finalRub]);
        await client.query(`INSERT INTO cash_log (type, amount_rub, note, client_id, category) VALUES ('in',$1,'Продажа (наличные)',$2,'other')`, [finalRub, client_id || null]);
      } else {
        await client.query('UPDATE bank_accounts SET balance_rub = balance_rub + $1 WHERE key=$2', [finalRub, dest]);
        await client.query(`INSERT INTO cash_log (type, amount_rub, note, client_id, category, bank_key) VALUES ('in',$1,'Продажа (перевод)',$2,'other',$3)`, [finalRub, client_id || null, dest]);
      }
    }

    await client.query('COMMIT');
    await logActivity(req.user, 'Продажа', 'sale', resolvedItems.reduce((n, r) => n + r.qty, 0) + ' шт., ' + Math.round(finalRub).toLocaleString('ru-RU') + ' ₽');

    // Уведомление клиенту в Telegram — не блокирует ответ, если упадёт
    if (client_id) {
      const clRes = await pool.query('SELECT name, telegram FROM clients WHERE id=$1', [client_id]);
      if (clRes.rows[0]?.telegram) {
        const itemsText = resolvedItems.map(r => `${r.laptop.brand} ${r.laptop.series} × ${r.qty}`).join('\n');
        sendTelegramMessage(clRes.rows[0].telegram,
          `🐼 BlackPanda\n\nСпасибо за покупку, ${clRes.rows[0].name}!\n\n${itemsText}\n\nИтого: ${Math.round(finalRub).toLocaleString('ru-RU')} ₽`
        ).catch(() => {});
      }
    }

    res.status(201).json(sale.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  } finally { client.release(); }
});

// Убрать один серийник из уже оформленной продажи — товар возвращается на склад,
// суммы продажи пересчитываются. Если это была последняя позиция — продажа удаляется целиком.
router.delete('/:id/serials/:serial', authenticate, requirePermission('sales', 'edit'), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const sale = (await client.query('SELECT * FROM sales WHERE id=$1 FOR UPDATE', [req.params.id])).rows[0];
    if (!sale) throw { status: 404, message: 'Продажа не найдена' };
    const ser = (await client.query('SELECT * FROM serials WHERE serial=$1', [req.params.serial])).rows[0];
    if (!ser) throw { status: 404, message: 'Серийник не найден' };
    const item = (await client.query('SELECT * FROM sale_items WHERE sale_id=$1 AND $2 = ANY(serial_ids)', [req.params.id, ser.id])).rows[0];
    if (!item) throw { status: 404, message: 'Этот серийник не относится к данной продаже' };

    const unitCny = Number(item.price_sell_cny);
    const newSerialIds = item.serial_ids.filter(id => id !== ser.id);
    if (newSerialIds.length === 0) {
      await client.query('DELETE FROM sale_items WHERE id=$1', [item.id]);
    } else {
      await client.query('UPDATE sale_items SET serial_ids=$1, qty=$2, total_cny=$3 WHERE id=$4',
        [newSerialIds, newSerialIds.length, unitCny * newSerialIds.length, item.id]);
    }

    await client.query(`UPDATE serials SET status_id='На складе', sale_date=NULL, sale_client_id=NULL WHERE id=$1`, [ser.id]);
    await client.query(`INSERT INTO serial_history (serial_id, status_id, note) VALUES ($1,'На складе','Убран из продажи — возврат на склад')`, [ser.id]);

    const rate = Number(sale.rate);
    await client.query('UPDATE sales SET total_cny = GREATEST(total_cny - $1, 0), total_rub = GREATEST(total_rub - $2, 0) WHERE id=$3',
      [unitCny, unitCny * rate, req.params.id]);

    const remaining = Number((await client.query('SELECT COUNT(*) AS n FROM sale_items WHERE sale_id=$1', [req.params.id])).rows[0].n);
    let saleDeleted = false;
    if (remaining === 0) {
      await client.query('DELETE FROM debts WHERE sale_id=$1', [req.params.id]);
      await client.query('DELETE FROM sales WHERE id=$1', [req.params.id]);
      saleDeleted = true;
    }

    await client.query('COMMIT');
    await logActivity(req.user, 'Убран серийник из продажи (возврат на склад)', 'sale', ser.serial);
    res.json({ success: true, sale_deleted: saleDeleted });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  } finally { client.release(); }
});

// Добавить в уже существующую продажу ещё один серийник (той же или другой модели) —
// отмечается проданным, суммы продажи пересчитываются
router.post('/:id/serials', authenticate, requirePermission('sales', 'edit'), async (req, res) => {
  const { serial } = req.body;
  if (!serial) return res.status(400).json({ error: 'Укажите серийник' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const sale = (await client.query('SELECT * FROM sales WHERE id=$1 FOR UPDATE', [req.params.id])).rows[0];
    if (!sale) throw { status: 404, message: 'Продажа не найдена' };
    const ser = (await client.query(
      `SELECT * FROM serials WHERE serial=$1 AND status_id IN (SELECT label FROM lib_statuses WHERE counts_as IN ('instock','reserved'))`, [serial]
    )).rows[0];
    if (!ser) throw { status: 400, message: 'Серийник не найден на складе (или уже продан)' };
    const laptop = (await client.query('SELECT * FROM laptops WHERE id=$1', [ser.laptop_id])).rows[0];
    const unitCny = Number(ser.price_override_cny ?? laptop.price_sell_cny);
    const rate = Number(sale.rate);

    const existingItem = (await client.query('SELECT * FROM sale_items WHERE sale_id=$1 AND laptop_id=$2', [req.params.id, laptop.id])).rows[0];
    if (existingItem) {
      const newIds = [...existingItem.serial_ids, ser.id];
      await client.query('UPDATE sale_items SET serial_ids=$1, qty=$2, total_cny=$3 WHERE id=$4',
        [newIds, newIds.length, Number(existingItem.price_sell_cny) * newIds.length, existingItem.id]);
    } else {
      await client.query(
        `INSERT INTO sale_items (sale_id, laptop_id, serial_ids, qty, price_sell_cny, price_sell_rub, price_cost_cny, total_cny)
         VALUES ($1,$2,$3,1,$4,$5,$6,$4)`,
        [req.params.id, laptop.id, [ser.id], unitCny, unitCny * rate, laptop.cost_cny]
      );
    }

    await client.query(`UPDATE serials SET status_id='Продан', sale_date=now(), sale_client_id=$1 WHERE id=$2`, [sale.client_id, ser.id]);
    await client.query(`INSERT INTO serial_history (serial_id, status_id, note) VALUES ($1,'Продан','Добавлен в существующую продажу')`, [ser.id]);
    await client.query(`UPDATE reservations SET active=false WHERE serial_id=$1 AND active=true`, [ser.id]);
    await client.query('UPDATE sales SET total_cny = total_cny + $1, total_rub = total_rub + $2 WHERE id=$3', [unitCny, unitCny * rate, req.params.id]);

    await client.query('COMMIT');
    await logActivity(req.user, 'Добавлен серийник в продажу', 'sale', ser.serial);
    res.status(201).json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  } finally { client.release(); }
});

// Удалить продажу целиком — все серийники возвращаются на склад
router.delete('/:id', authenticate, requirePermission('sales', 'edit'), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const items = (await client.query('SELECT * FROM sale_items WHERE sale_id=$1', [req.params.id])).rows;
    for (const it of items) {
      for (const sid of it.serial_ids) {
        await client.query(`UPDATE serials SET status_id='На складе', sale_date=NULL, sale_client_id=NULL WHERE id=$1`, [sid]);
        await client.query(`INSERT INTO serial_history (serial_id, status_id, note) VALUES ($1,'На складе','Продажа отменена — возврат на склад')`, [sid]);
      }
    }
    await client.query('DELETE FROM sale_items WHERE sale_id=$1', [req.params.id]);
    await client.query('DELETE FROM debts WHERE sale_id=$1', [req.params.id]);
    const result = await client.query('DELETE FROM sales WHERE id=$1 RETURNING id', [req.params.id]);
    if (!result.rows[0]) throw { status: 404, message: 'Продажа не найдена' };
    await client.query('COMMIT');
    await logActivity(req.user, 'Продажа отменена целиком (возврат на склад)', 'sale', req.params.id.slice(-6));
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  } finally { client.release(); }
});

// Заметка о гарантийном случае по этой продаже (текст свободной формы)
router.put('/:id/warranty-note', authenticate, requirePermission('sales', 'edit'), async (req, res) => {
  await pool.query('UPDATE sales SET warranty_note=$1 WHERE id=$2', [req.body.note || null, req.params.id]);
  res.json({ success: true });
});

module.exports = router;
