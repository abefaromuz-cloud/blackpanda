const express = require('express');
const pool = require('../db/pool');
const { authenticate, requirePermission } = require('../middleware/auth');
const { callClaude, callClaudeJSON } = require('../utils/ai');
const { sendTelegramMessage } = require('../utils/telegram');
const router = express.Router();

// 1) Фото коробки/этикетки → распознаём характеристики ноутбука для автозаполнения карточки
router.post('/extract-specs', authenticate, requirePermission('warehouse', 'edit'), async (req, res) => {
  const { image_base64, media_type } = req.body;
  if (!image_base64) return res.status(400).json({ error: 'Пришли фото' });
  try {
    const result = await callClaudeJSON({
      model: 'claude-sonnet-5',
      system: 'Ты помогаешь распознавать характеристики ноутбуков с фото коробки или этикетки производителя. ' +
        'Отвечай СТРОГО JSON без markdown-обёртки, только объект с полями (строки, пустая строка если не видно): ' +
        'brand, series, cpu, ram, storage, gpu, color, screen, serial, item_code. ' +
        'ram и storage указывай в формате "16 GB" / "512 GB SSD". Ничего кроме JSON не пиши.',
      content: [
        { type: 'image', source: { type: 'base64', media_type: media_type || 'image/jpeg', data: image_base64 } },
        { type: 'text', text: 'Распознай характеристики ноутбука с этого фото.' },
      ],
      maxTokens: 500,
    });
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Не удалось распознать фото' });
  }
});

// 2) Умные допродажи — что чаще всего покупают вместе с этой моделью (по реальным данным продаж)
router.get('/upsell/:laptopId', authenticate, requirePermission('sales', 'view'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT l2.id, l2.brand, l2.series, l2.price_sell_cny, COUNT(*) AS together_count
      FROM sale_items si1
      JOIN sale_items si2 ON si2.sale_id = si1.sale_id AND si2.laptop_id != si1.laptop_id
      JOIN laptops l2 ON l2.id = si2.laptop_id
      WHERE si1.laptop_id = $1 AND l2.is_archived = false
      GROUP BY l2.id, l2.brand, l2.series, l2.price_sell_cny
      ORDER BY together_count DESC LIMIT 3
    `, [req.params.laptopId]);
    res.json(result.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

// 3) Приоритизация клиентов — кому сначала написать/позвонить. Ранжирование по данным (RFM:
// давность, частота, сумма покупок + открытые долги), короткое объяснение для топ-клиентов — от ИИ.
router.get('/client-priority', authenticate, requirePermission('clients', 'view'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT c.id, c.name, c.category, c.telegram,
        COALESCE(MAX(s.created_at), c.created_at) AS last_activity,
        COUNT(s.id) AS purchases, COALESCE(SUM(s.total_rub),0) AS total_rub,
        COALESCE((SELECT SUM(
          CASE WHEN d.amount_cny IS NOT NULL THEN (d.amount_cny - d.amount_paid_cny) * (SELECT rate FROM settings WHERE id=1)
          ELSE (d.amount_rub - d.amount_paid_rub) END
        ) FROM debts d WHERE d.client_id=c.id AND d.status='open'),0) AS open_debt_rub
      FROM clients c LEFT JOIN sales s ON s.client_id = c.id
      GROUP BY c.id
    `);
    const now = Date.now();
    const scored = result.rows.map(c => {
      const daysSince = Math.floor((now - new Date(c.last_activity)) / 86400000);
      const recencyScore = Math.max(0, 60 - daysSince) / 60;
      const staleness = Math.min(daysSince / 30, 3);
      const debtScore = Number(c.open_debt_rub) > 0 ? 2 : 0;
      const valueScore = Math.log10(Number(c.total_rub) + 1) / 2;
      const score = staleness + debtScore + valueScore - recencyScore * 0.3;
      return { ...c, days_since: daysSince, priority_score: Math.round(score * 10) / 10 };
    }).sort((a, b) => b.priority_score - a.priority_score).slice(0, 10);

    try {
      const top5 = scored.slice(0, 5);
      const reasons = await callClaudeJSON({
        model: 'claude-haiku-4-5-20251001',
        system: 'Ты помощник CRM по перепродаже ноутбуков. Для каждого клиента дай ОДНУ короткую фразу ' +
          '(до 8 слов, по-русски), почему стоит связаться именно сейчас. Отвечай строго JSON-массивом строк ' +
          'в том же порядке, без markdown-обёртки.',
        content: JSON.stringify(top5.map(c => ({
          дней_с_активности: c.days_since, покупок: Number(c.purchases), сумма_руб: Number(c.total_rub),
          долг_руб: Number(c.open_debt_rub), категория: c.category,
        }))),
        maxTokens: 300,
      });
      top5.forEach((c, i) => { c.reason = reasons[i] || null; });
    } catch (e) { /* если ключ ИИ не задан или упал — просто без объяснений, ранжирование всё равно работает */ }

    res.json(scored);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

// 4a) Сгенерировать персонализированные ЧЕРНОВИКИ рассылки — НЕ отправляются автоматически,
// требуют явного одобрения менеджера (см. PUT /broadcast-drafts/:id и POST /broadcast-drafts/send)
router.post('/broadcast-drafts', authenticate, requirePermission('broadcast', 'edit'), async (req, res) => {
  const { client_ids, campaign_goal } = req.body;
  if (!Array.isArray(client_ids) || !client_ids.length) return res.status(400).json({ error: 'Выбери клиентов' });
  const batchId = require('crypto').randomUUID();
  try {
    const drafts = [];
    for (const cid of client_ids) {
      const clRes = await pool.query(`
        SELECT c.*, COALESCE(json_agg(json_build_object('brand', l.brand, 'series', l.series)) FILTER (WHERE l.id IS NOT NULL), '[]') AS bought
        FROM clients c
        LEFT JOIN sales s ON s.client_id = c.id
        LEFT JOIN sale_items si ON si.sale_id = s.id
        LEFT JOIN laptops l ON l.id = si.laptop_id
        WHERE c.id = $1 GROUP BY c.id
      `, [cid]);
      const cl = clRes.rows[0];
      if (!cl || !cl.telegram) continue;
      let text;
      try {
        text = await callClaude({
          model: 'claude-haiku-4-5-20251001',
          system: 'Ты пишешь короткое персональное сообщение в Telegram от компании BlackPanda (перепродажа ' +
            'ноутбуков из Китая). Тон дружелюбный, без канцелярита, 2-4 предложения, на русском. ' +
            'Не выдумывай факты, которых нет в данных. Не используй markdown. Подпишись просто "BlackPanda".',
          content: `Клиент: ${cl.name}, категория: ${cl.category}. Покупал: ${JSON.stringify(cl.bought)}. ` +
            `Цель сообщения: ${campaign_goal || 'напомнить о нас и предложить посмотреть новые поступления'}.`,
          maxTokens: 300,
        });
      } catch (e) {
        return res.status(500).json({ error: e.message || 'Ошибка ИИ' });
      }
      const draftRes = await pool.query(
        'INSERT INTO broadcast_drafts (client_id, message_text, batch_id) VALUES ($1,$2,$3) RETURNING *',
        [cid, text, batchId]
      );
      drafts.push({ ...draftRes.rows[0], client_name: cl.name, telegram: cl.telegram });
    }
    res.status(201).json({ batch_id: batchId, drafts });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Внутренняя ошибка сервера' }); }
});

// 4b) Список черновиков (по batch или все ожидающие)
router.get('/broadcast-drafts', authenticate, requirePermission('broadcast', 'view'), async (req, res) => {
  const { batch_id } = req.query;
  const result = await pool.query(
    `SELECT bd.*, c.name AS client_name, c.telegram FROM broadcast_drafts bd JOIN clients c ON c.id = bd.client_id
     WHERE ($1::uuid IS NULL OR bd.batch_id = $1) AND bd.status != 'sent' ORDER BY bd.created_at DESC`,
    [batch_id || null]
  );
  res.json(result.rows);
});

// 4c) Отредактировать черновик перед одобрением
router.put('/broadcast-drafts/:id', authenticate, requirePermission('broadcast', 'edit'), async (req, res) => {
  const { message_text, status } = req.body;
  const result = await pool.query(
    'UPDATE broadcast_drafts SET message_text=COALESCE($1,message_text), status=COALESCE($2,status) WHERE id=$3 RETURNING *',
    [message_text || null, status || null, req.params.id]
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'Не найдено' });
  res.json(result.rows[0]);
});

// 4d) Явная отправка одобренных черновиков — единственное место, где реально уходит сообщение в Telegram
router.post('/broadcast-drafts/send', authenticate, requirePermission('broadcast', 'edit'), async (req, res) => {
  const { draft_ids } = req.body;
  if (!Array.isArray(draft_ids) || !draft_ids.length) return res.status(400).json({ error: 'Нечего отправлять' });
  let sent = 0, failed = 0;
  for (const id of draft_ids) {
    const d = await pool.query('SELECT bd.*, c.telegram FROM broadcast_drafts bd JOIN clients c ON c.id=bd.client_id WHERE bd.id=$1', [id]);
    const draft = d.rows[0];
    if (!draft || !draft.telegram) { failed++; continue; }
    try {
      await sendTelegramMessage(draft.telegram, draft.message_text);
      await pool.query(`UPDATE broadcast_drafts SET status='sent' WHERE id=$1`, [id]);
      sent++;
    } catch (e) { failed++; }
  }
  res.json({ sent, failed });
});

router.delete('/broadcast-drafts/:id', authenticate, requirePermission('broadcast', 'edit'), async (req, res) => {
  await pool.query('DELETE FROM broadcast_drafts WHERE id=$1', [req.params.id]);
  res.json({ success: true });
});

module.exports = router;
