const express = require('express');
const pool = require('../db/pool');
const { authenticate, requirePermission } = require('../middleware/auth');
const { logActivity } = require('../utils/activityLog');
const router = express.Router();

// Список моделей + агрегированные остатки по статусам + прогноз "на сколько дней хватит"
router.get('/', authenticate, requirePermission('warehouse', 'view'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT l.*,
        COUNT(s.id) FILTER (WHERE s.status_id IN (SELECT label FROM lib_statuses WHERE counts_as='instock'))    AS in_stock,
        COUNT(s.id) FILTER (WHERE s.status_id IN (SELECT label FROM lib_statuses WHERE counts_as='intransit'))  AS in_transit,
        COUNT(s.id) FILTER (WHERE s.status_id IN (SELECT label FROM lib_statuses WHERE counts_as='reserved'))   AS reserved,
        COUNT(s.id) FILTER (WHERE s.status_id IN (SELECT label FROM lib_statuses WHERE counts_as='sold'))       AS sold,
        COUNT(s.id) AS total,
        COALESCE((
          SELECT SUM(si.qty) FROM sale_items si JOIN sales sale ON sale.id = si.sale_id
          WHERE si.laptop_id = l.id AND sale.created_at > now() - interval '30 days'
        ), 0) AS sold_last_30d,
        COALESCE((
          SELECT json_agg(x.price_cny ORDER BY x.changed_at) FROM (
            SELECT price_cny, changed_at FROM price_history ph WHERE ph.laptop_id = l.id ORDER BY ph.changed_at DESC LIMIT 10
          ) x
        ), '[]') AS price_sparkline
      FROM laptops l
      LEFT JOIN serials s ON s.laptop_id = l.id
      GROUP BY l.id
      ORDER BY l.is_archived ASC, l.created_at DESC
    `);
    // Прогноз: сколько дней хватит остатка при текущем темпе продаж (среднее в день за последние 30 дней)
    const rows = result.rows.map(r => {
      const dailyRate = Number(r.sold_last_30d) / 30;
      const daysLeft = dailyRate > 0 ? Math.round(Number(r.in_stock) / dailyRate) : null;
      // Тренд цены: сравниваем последнюю зафиксированную точку истории с предпоследней
      const spark = r.price_sparkline || [];
      let priceTrend = 'flat';
      if (spark.length >= 2) {
        const last = Number(spark[spark.length - 1]);
        const prev = Number(spark[spark.length - 2]);
        priceTrend = last > prev ? 'up' : last < prev ? 'down' : 'flat';
      }
      return { ...r, days_left_forecast: daysLeft, price_trend: priceTrend };
    });
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

router.get('/:id', authenticate, requirePermission('warehouse', 'view'), async (req, res) => {
  try {
    const [l, s, ph] = await Promise.all([
      pool.query('SELECT * FROM laptops WHERE id=$1', [req.params.id]),
      pool.query('SELECT * FROM serials WHERE laptop_id=$1 ORDER BY created_at DESC', [req.params.id]),
      pool.query('SELECT price_cny, changed_at FROM price_history WHERE laptop_id=$1 ORDER BY changed_at ASC', [req.params.id]),
    ]);
    if (!l.rows[0]) return res.status(404).json({ error: 'Модель не найдена' });
    const sparkline = ph.rows.slice(-10).map(r => Number(r.price_cny));
    let priceTrend = 'flat';
    if (sparkline.length >= 2) {
      const last = sparkline[sparkline.length - 1], prev = sparkline[sparkline.length - 2];
      priceTrend = last > prev ? 'up' : last < prev ? 'down' : 'flat';
    }
    res.json({ ...l.rows[0], serials: s.rows, price_sparkline: sparkline, price_trend: priceTrend, price_history_full: ph.rows });
  } catch (err) { res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

router.post('/', authenticate, requirePermission('warehouse', 'edit'), async (req, res) => {
  const { brand, series, cpu, ram, gpu, storage, color, screen, touch, images, cost_cny, price_sell_cny, low_stock_threshold, is_hot, mfr_item_code, refresh_rate, screen_type, keyboard_backlight, keyboard_layout } = req.body;
  if (!brand) return res.status(400).json({ error: 'Укажите бренд' });
  try {
    const imgArr = Array.isArray(images) ? images.filter(Boolean) : [];
    const result = await pool.query(
      `INSERT INTO laptops (brand,series,cpu,ram,gpu,storage,color,screen,touch,image_url,images,cost_cny,price_sell_cny,low_stock_threshold,is_hot,mfr_item_code,refresh_rate,screen_type,keyboard_backlight,keyboard_layout)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING *`,
      [brand, series||null, cpu||null, ram||null, gpu||null, storage||null, color||null, screen||null,
       touch||'no', imgArr[0]||null, imgArr, cost_cny||0, price_sell_cny||0, low_stock_threshold||2, !!is_hot, mfr_item_code||null,
       refresh_rate||null, screen_type||null, keyboard_backlight||null, keyboard_layout||null]
    );
    // Первая точка истории цены — чтобы мини-график сразу с чего-то начинался
    await pool.query('INSERT INTO price_history (laptop_id, price_cny) VALUES ($1,$2)', [result.rows[0].id, price_sell_cny || 0]);
    await logActivity(req.user, 'Добавлена модель', 'laptop', brand + ' ' + (series||''));
    res.status(201).json(result.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

router.put('/:id', authenticate, requirePermission('warehouse', 'edit'), async (req, res) => {
  const f = req.body;
  const imgArr = Array.isArray(f.images) ? f.images.filter(Boolean) : null;
  try {
    // Если меняется цена продажи — сначала узнаём текущую, чтобы понять, реально ли она изменилась
    let priceChanged = false;
    if (f.price_sell_cny !== undefined) {
      const cur = await pool.query('SELECT price_sell_cny FROM laptops WHERE id=$1', [req.params.id]);
      priceChanged = cur.rows[0] && Number(cur.rows[0].price_sell_cny) !== Number(f.price_sell_cny);
    }
    const result = await pool.query(
      `UPDATE laptops SET brand=COALESCE($1,brand), series=COALESCE($2,series), cpu=COALESCE($3,cpu),
        ram=COALESCE($4,ram), gpu=COALESCE($5,gpu), storage=COALESCE($6,storage), color=COALESCE($7,color),
        screen=COALESCE($8,screen), touch=COALESCE($9,touch),
        images=COALESCE($10,images), image_url=COALESCE($11,image_url),
        cost_cny=COALESCE($12,cost_cny), price_sell_cny=COALESCE($13,price_sell_cny),
        low_stock_threshold=COALESCE($14,low_stock_threshold), is_hot=COALESCE($15,is_hot),
        mfr_item_code=COALESCE($16,mfr_item_code),
        refresh_rate=COALESCE($17,refresh_rate), screen_type=COALESCE($18,screen_type),
        keyboard_backlight=COALESCE($19,keyboard_backlight), keyboard_layout=COALESCE($20,keyboard_layout)
       WHERE id=$21 RETURNING *`,
      [f.brand,f.series,f.cpu,f.ram,f.gpu,f.storage,f.color,f.screen,f.touch,
       imgArr, imgArr ? imgArr[0] : null, f.cost_cny,f.price_sell_cny,f.low_stock_threshold,
       f.is_hot !== undefined ? !!f.is_hot : null, f.mfr_item_code,
       f.refresh_rate, f.screen_type, f.keyboard_backlight, f.keyboard_layout, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Модель не найдена' });
    if (priceChanged) {
      await pool.query('INSERT INTO price_history (laptop_id, price_cny) VALUES ($1,$2)', [req.params.id, result.rows[0].price_sell_cny]);
    }
    res.json(result.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

// Полная история изменения цены модели — для страницы карточки товара
router.get('/:id/price-history', authenticate, requirePermission('warehouse', 'view'), async (req, res) => {
  const result = await pool.query('SELECT price_cny, changed_at FROM price_history WHERE laptop_id=$1 ORDER BY changed_at ASC', [req.params.id]);
  res.json(result.rows);
});

router.delete('/:id', authenticate, requirePermission('warehouse', 'edit'), async (req, res) => {
  try {
    // Мягкое удаление — чтобы не потерять историю продаж по этой модели
    await pool.query('UPDATE laptops SET is_archived=true WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

// Восстановить ранее удалённую (архивную) модель — на случай, если удалили по ошибке
router.post('/:id/restore', authenticate, requirePermission('warehouse', 'edit'), async (req, res) => {
  try {
    await pool.query('UPDATE laptops SET is_archived=false WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

// Объединение дублей модели — например, если импорт из старой версии создал две карточки
// для одного и того же товара (одна с латиницей/кириллицей, другая с китайским названием).
// Переносит все серийники, позиции продаж/предзаказов и историю цены на "оригинал",
// затем удаляет карточку-дубль. Ничего не теряется — только объединяется в одну карточку.
router.post('/merge', authenticate, requirePermission('warehouse', 'edit'), async (req, res) => {
  const { keep_id, remove_id } = req.body;
  if (!keep_id || !remove_id) return res.status(400).json({ error: 'Укажите обе модели' });
  if (keep_id === remove_id) return res.status(400).json({ error: 'Это одна и та же модель' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const [keepRes, removeRes] = await Promise.all([
      client.query('SELECT id, brand, series FROM laptops WHERE id=$1 FOR UPDATE', [keep_id]),
      client.query('SELECT id, brand, series FROM laptops WHERE id=$1 FOR UPDATE', [remove_id]),
    ]);
    if (!keepRes.rows[0] || !removeRes.rows[0]) throw { status: 404, message: 'Модель не найдена' };

    await client.query('UPDATE serials SET laptop_id=$1 WHERE laptop_id=$2', [keep_id, remove_id]);
    await client.query('UPDATE preorder_items SET laptop_id=$1 WHERE laptop_id=$2', [keep_id, remove_id]);
    await client.query('UPDATE sale_items SET laptop_id=$1 WHERE laptop_id=$2', [keep_id, remove_id]);
    await client.query('DELETE FROM price_history WHERE laptop_id=$1', [remove_id]); // история цены дубля неактуальна для оригинала
    await client.query('DELETE FROM laptops WHERE id=$1', [remove_id]);

    await client.query('COMMIT');
    await logActivity(req.user, 'Объединены дубли моделей', 'laptop',
      `${removeRes.rows[0].brand} ${removeRes.rows[0].series||''} → ${keepRes.rows[0].brand} ${keepRes.rows[0].series||''}`);
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  } finally { client.release(); }
});

module.exports = router;
