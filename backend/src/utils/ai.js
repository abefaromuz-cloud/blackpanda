const pool = require('../db/pool');

async function getApiKey() {
  const r = await pool.query('SELECT ai_api_key FROM settings WHERE id=1');
  return r.rows[0]?.ai_api_key || process.env.ANTHROPIC_API_KEY || '';
}

// Универсальный вызов Claude — возвращает текст ответа. content может быть строкой
// (просто текст) или массивом content-блоков (например, текст + фото для распознавания).
async function callClaude({ system, content, model = 'claude-sonnet-5', maxTokens = 1024 }) {
  const apiKey = await getApiKey();
  if (!apiKey) throw new Error('Ключ ИИ не задан — добавь его в Настройках');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: system || undefined,
      messages: [{ role: 'user', content }],
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Anthropic API: ${res.status} ${errText.slice(0, 200)}`);
  }
  const data = await res.json();
  return (data.content || []).map(b => b.text || '').join('\n').trim();
}

// Просит модель ответить СТРОГО в формате JSON и парсит результат, убирая markdown-обёртку ```json
async function callClaudeJSON(args) {
  const text = await callClaude(args);
  const cleaned = text.replace(/^```json\s*|```\s*$/g, '').trim();
  return JSON.parse(cleaned);
}

module.exports = { callClaude, callClaudeJSON, getApiKey };
