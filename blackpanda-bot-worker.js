// ═══════════════════════════════════════════════════════
// BlackPanda Telegram Bot — Cloudflare Worker
// Источник данных — новая CRM (Postgres/Express), а не старая Firebase-система.
// ═══════════════════════════════════════════════════════

const BOT_TOKEN = '8689009234:AAFcAGJy2vtSPot9VbjrBaUgWwFnlP5mCn4'; // TODO: см. примечание в чате — этот токен светился в переписке, лучше перевыпустить через @BotFather (/revoke) и вставить сюда новый
const CRM_API_URL = 'https://blackpanda-production-2354.up.railway.app'; // адрес бэкенда, без / на конце
// Бот логинится как обычный сотрудник CRM (через уже существующий /api/auth/login) —
// никаких новых эндпоинтов в бэкенде для этого не требуется.
// В Админке → Сотрудники заведи отдельную учётку специально для бота (не свою личную!),
// роль staff, и дай ей право можно ТОЛЬКО «Просмотр» на раздел «Склад» — тогда даже если
// логин/пароль когда-нибудь утекут, через них нельзя будет ничего продать/изменить.
const BOT_LOGIN_EMAIL = 'blackbot';
const BOT_LOGIN_PASSWORD = 'blackpandabot1_2';
const ADMIN_CHAT_ID = '1647536586'; // твой ID — уведомления о запросах клиентов

// ═══════════════════════════════════════════════════════

export default {
  async fetch(request) {
    if (request.method !== 'POST') {
      return new Response('BlackPanda Bot is running ✅', { status: 200 });
    }

    const update = await request.json();
    const msg = update.message;
    if (!msg) return new Response('ok');

    const chatId = String(msg.chat.id);
    const text = (msg.text || '').toLowerCase().trim();
    const firstName = msg.from?.first_name || '';
    const username = msg.from?.username ? '@' + msg.from.username : firstName;
    const isAdmin = chatId === ADMIN_CHAT_ID;

    // ── /start ──
    if (text === '/start') {
      await sendMessage(chatId,
        `🐼 Привет, ${firstName}!\n\nЯ бот магазина BlackPanda — ноутбуки из Китая 🇨🇳→🇷🇺\n\n🌐 Наш сайт: https://shop.abefaromuz.workers.dev\n\nВыбери раздел в меню ниже 👇`,
        mainKeyboard()
      );
      // Notify admin
      await notifyAdmin(`👤 Новый пользователь: ${firstName} ${username}\nChat ID: ${chatId}`);
    }

    // ── /price — весь список ──
    else if (text === '/price' || text === '/список' || text === '/прайс' || text === '📋 все ноутбуки') {
      await sendMessage(chatId, '⏳ Загружаю актуальный список...');
      await notifyAdmin(`📋 ${firstName} ${username} запросил /price`);
      try {
        const { laptops, rate } = await getCrmData();
        const msg2 = buildStockMessage(laptops, rate, null);
        for (const chunk of splitMessage(msg2, 4000)) {
          await sendMessage(chatId, chunk);
          await sleep(300);
        }
      } catch(e) {
        await sendMessage(chatId, '❌ Ошибка загрузки. Напиши напрямую: @abefors');
      }
    }

    // ── Фильтры по бренду ──
    else if (['/honor','/asus','/lenovo','/msi','/mechrevo'].includes(text) ||
             ['💻 honor','💻 asus','💻 lenovo','💻 msi','💻 mechrevo'].includes(text)) {
      // Map button text to brand
      if (text === '💻 honor') text = '/honor';
      if (text === '💻 asus') text = '/asus';
      if (text === '💻 lenovo') text = '/lenovo';
      if (text === '💻 msi') text = '/msi';
      if (text === '💻 mechrevo') text = '/mechrevo';
      const brandMap = {
        '/honor':'Honor', '/asus':'Asus',
        '/lenovo':'Lenovo', '/msi':'MSI', '/mechrevo':'Mechrevo'
      };
      const brand = brandMap[text];
      await sendMessage(chatId, `⏳ Загружаю ${brand}...`);
      await notifyAdmin(`📋 ${firstName} ${username} запросил ${text}`);
      try {
        const { laptops, rate } = await getCrmData();
        const msg2 = buildStockMessage(laptops, rate, brand);
        if (msg2.includes('▪️')) {
          for (const chunk of splitMessage(msg2, 4000)) {
            await sendMessage(chatId, chunk);
            await sleep(300);
          }
        } else {
          await sendMessage(chatId, `😔 Нет ${brand} в наличии. Напиши нам — привезём под заказ!\n/contact`);
        }
      } catch(e) {
        await sendMessage(chatId, '❌ Ошибка загрузки. Напиши напрямую: @abefors');
      }
    }



    // ── /contact ──
    else if (text === '🌐 наш сайт') {
      await sendMessage(chatId, `🌐 Наш сайт:\nhttps://shop.abefaromuz.workers.dev`, mainKeyboard());
    }

    else if (text === '/contact' || text === '/контакты' || text === '📞 контакты') {
      await notifyAdmin(`📞 ${firstName} ${username} запросил контакты`);
      await sendMessage(chatId,
        `📞 *Контакты BlackPanda*\n\n` +
        `📱 +7 925 136-29-91\n` +
        `📱 +7 925 428-85-88\n` +
        `✈️ @abefors\n` +
        `✈️ @jxiangpc\n\n` +
        `🕐 Работаем ежедневно`
      );
    }

    // ── /help ──
    else if (text === '/help' || text === '❓ помощь') {
      await sendMessage(chatId,
        `🐼 *BlackPanda — Команды бота*\n\n` +
        `*/price* — весь список в наличии\n` +
        `*/honor* — только Honor\n` +
        `*/asus* — только Asus\n` +
        `*/lenovo* — только Lenovo\n` +
        `*/msi* — только MSI\n` +
        `*/mechrevo* — только Mechrevo\n` +
        `*/contact* — контакты менеджеров\n\n` +
        `По всем вопросам: @abefors`
      );
    }

    // ── Неизвестная команда ──
    else {
      await notifyAdmin(`💬 ${firstName} ${username} написал: ${msg.text}`);
      await sendMessage(chatId,
        `Привет! Используй команды:\n\n` +
        `/price — список ноутбуков\n` +
        `/contact — написать менеджеру\n` +
        `/help — все команды`
      );
    }

    return new Response('ok');
  }
};

// ═══ Уведомить админа ═══
async function notifyAdmin(text) {
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: ADMIN_CHAT_ID, text: `🔔 ${text}` })
    });
  } catch(e) {}
}

// ═══ Авторизация в CRM как обычный сотрудник (через уже существующий /api/auth/login) ═══
// Токен кэшируем в памяти воркера между запросами, чтобы не логиниться на каждое сообщение.
let cachedToken = null;
let tokenExpiresAt = 0;

async function getAuthToken(forceRelogin) {
  if (!forceRelogin && cachedToken && Date.now() < tokenExpiresAt) return cachedToken;
  const resp = await fetch(`${CRM_API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: BOT_LOGIN_EMAIL, password: BOT_LOGIN_PASSWORD })
  });
  if (!resp.ok) throw new Error('Не удалось авторизоваться в CRM: ' + resp.status);
  const data = await resp.json();
  cachedToken = data.token;
  // На бэкенде токен живёт 12 часов — обновляем заранее, с запасом в час, чтобы не ловить 401 посреди дня
  tokenExpiresAt = Date.now() + 11 * 60 * 60 * 1000;
  return cachedToken;
}

// ═══ Загрузить данные из новой CRM (Postgres/Express), а не из Firebase ═══
async function getCrmData() {
  const token = await getAuthToken(false);
  const authedGet = (path, tok) => fetch(`${CRM_API_URL}${path}`, { headers: { Authorization: `Bearer ${tok}` } });

  let [laptopsResp, rateResp] = await Promise.all([
    authedGet('/api/laptops', token),
    authedGet('/api/settings/public-rate', token),
  ]);

  // Токен мог протухнуть раньше расчётного времени (например, учётку бота деактивировали
  // и снова включили) — на этот случай один раз перелогиниваемся и повторяем запрос.
  if (laptopsResp.status === 401 || rateResp.status === 401) {
    const freshToken = await getAuthToken(true);
    [laptopsResp, rateResp] = await Promise.all([
      authedGet('/api/laptops', freshToken),
      authedGet('/api/settings/public-rate', freshToken),
    ]);
  }

  if (!laptopsResp.ok) throw new Error('CRM API error (laptops): ' + laptopsResp.status);
  if (!rateResp.ok) throw new Error('CRM API error (rate): ' + rateResp.status);

  const allLaptops = await laptopsResp.json();
  const rateData = await rateResp.json();
  // /api/laptops отдаёт и архивные модели тоже — архив в список склада бота не показываем
  const laptops = allLaptops.filter(l => !l.is_archived);
  return { laptops, rate: Number(rateData.rate) || 0 };
}

// ═══ Построить сообщение со складом ═══
// Поля теперь приходят из Postgres как есть (snake_case): price_sell_cny, in_stock и т.д.
function buildStockMessage(laptops, rate, brandFilter, skipHeader) {
  const today = new Date().toLocaleDateString('ru-RU');
  const brands = {};

  laptops.forEach(l => {
    const inStock = Number(l.in_stock) || 0;
    if (!inStock) return;
    const brand = (l.brand || '').trim();
    if (brandFilter && brand.toLowerCase() !== brandFilter.toLowerCase()) return;
    if (!brands[brand]) brands[brand] = [];
    brands[brand].push({ ...l, inStock });
  });

  if (!Object.keys(brands).length) return '';

  let msg = skipHeader ? '' : `🐼 BlackPanda | Склад актуальный\n📅 ${today} | Курс: ${rate} ₽/¥\n`;

  Object.entries(brands).forEach(([brand, items]) => {
    msg += `\n━━━━━━━━━━━━━━━━━━\n💻 ${brand.toUpperCase()}\n`;
    items.forEach(l => {
      const price = Math.round((Number(l.price_sell_cny) || 0) * rate);
      const series = l.series ? l.series.split('/').pop().trim() : '';
      const touch = l.touch === 'yes' ? '| 👆 Сенсорный' : '';
      let screen = '';
      if (l.screen) {
        const m = String(l.screen).match(/(\d+[\.,]\d*)"?/);
        if (m) screen = m[1].replace(',', '.') + '"';
      }
      let line = `▪️ ${series}`;
      if (l.cpu) line += ` | ${l.cpu}`;
      if (l.gpu) line += ` | ${l.gpu}`;
      if (l.ram) line += ` | ${l.ram}`;
      if (l.storage) line += ` | ${l.storage}`;
      if (screen) line += ` | ${screen}`;
      if (l.color) line += ` | ${l.color}`;
      if (touch) line += ` ${touch}`;
      line += `\n   ${l.inStock} шт. → ${price.toLocaleString('ru-RU')} ₽ (¥${l.price_sell_cny || 0})\n`;
      msg += line;
    });
  });

  msg += `━━━━━━━━━━━━━━━━━━\n📞 +7 925 136-29-91\n📞 +7 925 428-85-88\n✈️ @abefors | @jxiangpc`;
  return msg;
}

// ═══ Отправка сообщения ═══
async function sendMessage(chatId, text, keyboard) {
  const body = { chat_id: chatId, text, parse_mode: 'Markdown' };
  if (keyboard) body.reply_markup = keyboard;
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

// ═══ Главная клавиатура ═══
function mainKeyboard() {
  return {
    keyboard: [
      [{ text: '📋 Все ноутбуки' }],
      [{ text: '💻 Honor' }, { text: '💻 Asus' }, { text: '💻 Lenovo' }],
      [{ text: '💻 MSI' }, { text: '💻 Mechrevo' }],
      [{ text: '📞 Контакты' }, { text: '❓ Помощь' }],
      [{ text: '🌐 Наш сайт' }]
    ],
    resize_keyboard: true,
    persistent: true
  };
}

function splitMessage(text, maxLen) {
  if (text.length <= maxLen) return [text];
  const chunks = [];
  let current = '';
  for (const line of text.split('\n')) {
    if ((current + '\n' + line).length > maxLen) {
      if (current) chunks.push(current);
      current = line;
    } else {
      current = current ? current + '\n' + line : line;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
