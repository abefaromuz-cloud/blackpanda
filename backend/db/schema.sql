-- BlackPanda CRM — схема базы данных PostgreSQL

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Пользователи (сотрудники, у которых есть доступ)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'staff', -- admin | staff | accountant | client
  client_id UUID, -- если role='client' — ссылка на карточку клиента, чьи данные он видит
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Права доступа по роли (группе). Одна строка = одна страница/раздел для одной роли.
CREATE TABLE IF NOT EXISTS role_permissions (
  role TEXT NOT NULL,
  page_key TEXT NOT NULL,
  can_view BOOLEAN NOT NULL DEFAULT false,
  can_edit BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (role, page_key)
);

-- Точечные права для конкретного пользователя — перекрывают права его роли для этой страницы
CREATE TABLE IF NOT EXISTS user_permissions (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  page_key TEXT NOT NULL,
  can_view BOOLEAN NOT NULL DEFAULT false,
  can_edit BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (user_id, page_key)
);

-- Права по умолчанию для стандартных ролей (админ дальше всегда имеет полный доступ на уровне кода)
INSERT INTO role_permissions (role, page_key, can_view, can_edit) VALUES
  ('staff','dashboard',true,false),
  ('staff','warehouse',true,true),
  ('staff','clients',true,true),
  ('staff','preorders',true,true),
  ('staff','sales',true,true),
  ('staff','cash',true,true),
  ('staff','settings',false,false),
  ('staff','admin',false,false),
  ('staff','finance',true,false),
  ('staff','analytics',true,false),
  ('staff','reports',true,false),
  ('staff','import',true,true),
  ('staff','employees',true,false),
  ('staff','activity_log',false,false),
  ('staff','scan',true,true),
  ('staff','broadcast',true,true),
  ('staff','library',true,true),
  ('staff','arrivals',true,true),
  ('staff','service',true,true),
  ('accountant','dashboard',true,false),
  ('accountant','warehouse',true,false),
  ('accountant','clients',true,false),
  ('accountant','preorders',true,false),
  ('accountant','sales',true,false),
  ('accountant','cash',true,true),
  ('accountant','settings',false,false),
  ('accountant','admin',false,false),
  ('accountant','finance',true,true),
  ('accountant','analytics',true,false),
  ('accountant','reports',true,true),
  ('accountant','import',false,false),
  ('accountant','employees',true,true),
  ('accountant','activity_log',true,false),
  ('accountant','scan',false,false),
  ('accountant','broadcast',false,false),
  ('accountant','library',false,false),
  ('accountant','arrivals',false,false),
  ('accountant','service',false,false),
  ('client','client_portal',true,false)
ON CONFLICT (role, page_key) DO NOTHING;

-- Модели ноутбуков (карточка товара, без привязки к конкретной единице)
CREATE TABLE IF NOT EXISTS laptops (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  brand TEXT NOT NULL,
  series TEXT,
  cpu TEXT,
  ram TEXT,
  gpu TEXT,
  storage TEXT,
  color TEXT,
  screen TEXT,
  touch TEXT DEFAULT 'no', -- yes | no
  image_url TEXT,
  cost_cny NUMERIC(12,2) DEFAULT 0,   -- закупочная цена в юанях
  price_sell_cny NUMERIC(12,2) DEFAULT 0, -- цена продажи в юанях
  low_stock_threshold INT DEFAULT 2,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Клиенты
CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  phone TEXT,
  telegram TEXT,
  debt_rub NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Серийные номера конкретных единиц товара
-- s1 = в пути (заказано у поставщика), s2 = на складе, s15 = зарезервирован (под предзаказ), s3 = продан
CREATE TABLE IF NOT EXISTS serials (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  laptop_id UUID NOT NULL REFERENCES laptops(id) ON DELETE CASCADE,
  serial TEXT NOT NULL UNIQUE,
  status_id TEXT NOT NULL DEFAULT 'На складе',
  arrival_date TIMESTAMPTZ,
  sale_date TIMESTAMPTZ,
  sale_client_id UUID REFERENCES clients(id),
  warranty_months INT DEFAULT 3,
  warranty_notify BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_serials_laptop ON serials(laptop_id);
CREATE INDEX IF NOT EXISTS idx_serials_status ON serials(status_id);
ALTER TABLE serials ADD COLUMN IF NOT EXISTS warranty_notify BOOLEAN DEFAULT false;

-- История статусов серийника (аналог history[] в старой версии)
CREATE TABLE IF NOT EXISTS serial_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  serial_id UUID NOT NULL REFERENCES serials(id) ON DELETE CASCADE,
  status_id TEXT NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Предзаказы
CREATE TABLE IF NOT EXISTS preorders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id),
  payment_type TEXT NOT NULL DEFAULT 'full', -- full | deposit
  stage TEXT NOT NULL DEFAULT 'active', -- active | done | cancelled
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- Позиции предзаказа
CREATE TABLE IF NOT EXISTS preorder_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  preorder_id UUID NOT NULL REFERENCES preorders(id) ON DELETE CASCADE,
  laptop_id UUID NOT NULL REFERENCES laptops(id),
  qty INT NOT NULL DEFAULT 1,
  cost_cny NUMERIC(12,2) DEFAULT 0,
  price_sell_cny NUMERIC(12,2) DEFAULT 0,
  item_status TEXT NOT NULL DEFAULT 'pending' -- pending | transferred
);

-- Продажи (факт передачи товара клиенту, из предзаказа или напрямую)
CREATE TABLE IF NOT EXISTS sales (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id),
  preorder_id UUID REFERENCES preorders(id),
  total_cny NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_rub NUMERIC(14,2) NOT NULL DEFAULT 0,
  rate NUMERIC(10,4) NOT NULL, -- курс юань->рубль на момент сделки
  payment_mode TEXT NOT NULL DEFAULT 'full', -- full | transfer | partial | balance
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Позиции продажи
CREATE TABLE IF NOT EXISTS sale_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  laptop_id UUID NOT NULL REFERENCES laptops(id),
  serial_ids UUID[] NOT NULL DEFAULT '{}',
  qty INT NOT NULL DEFAULT 1,
  price_sell_cny NUMERIC(12,2) DEFAULT 0,
  price_sell_rub NUMERIC(14,2) DEFAULT 0,
  price_cost_cny NUMERIC(12,2) DEFAULT 0,
  total_cny NUMERIC(14,2) DEFAULT 0
);

-- Касса (движение наличных)
CREATE TABLE IF NOT EXISTS cash_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type TEXT NOT NULL, -- in | out
  amount_rub NUMERIC(14,2) NOT NULL,
  note TEXT,
  client_id UUID REFERENCES clients(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- История курса валют (для графика динамики)
CREATE TABLE IF NOT EXISTS rate_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rate NUMERIC(10,4) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Общие настройки (курс, telegram, язык интерфейса) — одна строка
CREATE TABLE IF NOT EXISTS settings (
  id INT PRIMARY KEY DEFAULT 1,
  rate NUMERIC(10,4) NOT NULL DEFAULT 13.0,
  cash_balance_rub NUMERIC(14,2) NOT NULL DEFAULT 0,
  tg_token TEXT DEFAULT '',
  tg_chat_id TEXT DEFAULT '',
  notify_low_stock BOOLEAN DEFAULT true,
  low_stock_threshold INT DEFAULT 2,
  lang TEXT DEFAULT 'ru',
  CONSTRAINT single_row CHECK (id = 1)
);
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_client_id_fkey;
ALTER TABLE users ADD CONSTRAINT users_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;

-- Сотрудники (HR-карточка; отдельно от учётных записей users — не у каждого сотрудника есть логин)
CREATE TABLE IF NOT EXISTS employees (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name TEXT NOT NULL,
  position TEXT,
  phone TEXT,
  hire_date DATE,
  salary_rub NUMERIC(12,2) DEFAULT 0,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Журнал действий (аудит) — кто что сделал
CREATE TABLE IF NOT EXISTS activity_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  user_name TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_log(created_at DESC);

ALTER TABLE laptops ADD COLUMN IF NOT EXISTS is_hot BOOLEAN NOT NULL DEFAULT false;
CREATE SEQUENCE IF NOT EXISTS laptop_item_seq START 1;
ALTER TABLE laptops ADD COLUMN IF NOT EXISTS item_code TEXT UNIQUE;
ALTER TABLE laptops ALTER COLUMN item_code SET DEFAULT ('LAP-' || to_char(now(),'YYYY') || '-' || lpad(nextval('laptop_item_seq')::text, 4, '0'));
UPDATE laptops SET item_code = 'LAP-' || to_char(created_at,'YYYY') || '-' || lpad(nextval('laptop_item_seq')::text, 4, '0')
  WHERE item_code IS NULL;
ALTER TABLE laptops ADD COLUMN IF NOT EXISTS images TEXT[] DEFAULT '{}';
ALTER TABLE laptops ADD COLUMN IF NOT EXISTS mfr_item_code TEXT;

-- Справочник: бренды и их серии
CREATE TABLE IF NOT EXISTS lib_brands (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT UNIQUE NOT NULL,
  name_zh TEXT,
  sort_order INT NOT NULL DEFAULT 100
);
ALTER TABLE lib_brands ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 100;
ALTER TABLE lib_brands ADD COLUMN IF NOT EXISTS name_zh TEXT;

CREATE TABLE IF NOT EXISTS lib_series (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  brand_id UUID NOT NULL REFERENCES lib_brands(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  name_zh TEXT,
  sort_order INT NOT NULL DEFAULT 100,
  UNIQUE(brand_id, name)
);
ALTER TABLE lib_series ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 100;
ALTER TABLE lib_series ADD COLUMN IF NOT EXISTS name_zh TEXT;

-- Справочник: плоские списки значений (CPU/GPU/RAM/накопитель/цвет/экран)
CREATE TABLE IF NOT EXISTS lib_values (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category TEXT NOT NULL, -- cpu | gpu | ram | storage | color | screen
  value TEXT NOT NULL,
  value_zh TEXT,
  sort_order INT NOT NULL DEFAULT 100,
  UNIQUE(category, value)
);
ALTER TABLE lib_values ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 100;
ALTER TABLE lib_values ADD COLUMN IF NOT EXISTS value_zh TEXT;

-- Личные задачи/напоминания на дашборде (в т.ч. можно привязать к клиенту — напомнить о долге)
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  due_date DATE,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  done BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Порядок разделов в боковом меню (общий для всех, настраивается администратором)
CREATE TABLE IF NOT EXISTS nav_order (
  page_key TEXT PRIMARY KEY,
  sort_order INT NOT NULL
);

-- Статусы товара (управляются в Справочнике). counts_as — к какой "корзине" относится статус
-- для агрегатов на складе/дашборде: instock | intransit | reserved | sold | other
CREATE TABLE IF NOT EXISTS lib_statuses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  label TEXT UNIQUE NOT NULL,
  label_zh TEXT,
  counts_as TEXT NOT NULL DEFAULT 'other',
  sort_order INT NOT NULL DEFAULT 100
);
ALTER TABLE lib_statuses ADD COLUMN IF NOT EXISTS counts_as TEXT NOT NULL DEFAULT 'other';
ALTER TABLE lib_statuses ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 100;
ALTER TABLE lib_statuses ADD COLUMN IF NOT EXISTS label_zh TEXT;

INSERT INTO lib_statuses (label, label_zh, counts_as, sort_order) VALUES
  ('В пути','在途','intransit',100),
  ('На складе','在库','instock',200),
  ('Продан','已售','sold',300),
  ('Возврат','退货','other',400),
  ('Гарантия КНР','中国保修','other',500),
  ('На ремонте','维修中','other',600),
  ('Потерян','丢失','other',700),
  ('Склад (восст.)','库存（翻新）','instock',800),
  ('Новый (Коробка повр.)','全新（包装破损）','instock',900),
  ('Зарезервирован','已预留','reserved',1000)
ON CONFLICT (label) DO UPDATE SET label_zh = EXCLUDED.label_zh WHERE lib_statuses.label_zh IS NULL;

-- Разовая идемпотентная миграция старых кодов статусов (s1/s2/s3/s15) на новые текстовые метки.
-- Условие "status_id='s2'" перестаёт находить строки после первого выполнения, поэтому повторные
-- прогоны миграции ничего не ломают.
UPDATE serials SET status_id='В пути' WHERE status_id='s1';
UPDATE serials SET status_id='На складе' WHERE status_id='s2';
UPDATE serials SET status_id='Продан' WHERE status_id='s3';
UPDATE serials SET status_id='Зарезервирован' WHERE status_id='s15';
UPDATE serial_history SET status_id='В пути' WHERE status_id='s1';
UPDATE serial_history SET status_id='На складе' WHERE status_id='s2';
UPDATE serial_history SET status_id='Продан' WHERE status_id='s3';
UPDATE serial_history SET status_id='Зарезервирован' WHERE status_id='s15';

-- Стартовый набор, чтобы список не был пустым — дальше пополняется вручную в разделе «Справочник»
INSERT INTO lib_brands (name, name_zh, sort_order) VALUES
  ('Acer','宏碁',100),('Apple','苹果',200),('Asus','华硕',300),('Dell','戴尔',400),('HP','惠普',500),
  ('Huawei','华为',600),('Lenovo','联想',700),('MSI','微星',800),('Samsung','三星',900),('Xiaomi','小米',1000)
ON CONFLICT (name) DO UPDATE SET name_zh = EXCLUDED.name_zh WHERE lib_brands.name_zh IS NULL;
INSERT INTO lib_values (category, value, value_zh, sort_order) VALUES
  ('cpu','Apple M2','Apple M2',100),('cpu','Apple M3','Apple M3',200),('cpu','Intel Core i5-1240P','英特尔酷睿 i5-1240P',300),
  ('cpu','Intel Core i5-13500H','英特尔酷睿 i5-13500H',400),('cpu','Intel Core i7-12700H','英特尔酷睿 i7-12700H',500),
  ('cpu','Ryzen 5 5600H','锐龙 5 5600H',600),('cpu','Ryzen 7 7840HS','锐龙 7 7840HS',700),
  ('gpu','GeForce RTX 3050','GeForce RTX 3050',100),('gpu','GeForce RTX 4060','GeForce RTX 4060',200),('gpu','Intel Iris Xe','英特尔锐炬 Xe',300),
  ('gpu','Intel UHD Graphics','英特尔UHD显卡',400),('gpu','Radeon 680M','镭龙 680M',500),
  ('ram','16 GB','16GB',200),('ram','32 GB','32GB',300),('ram','64 GB','64GB',400),('ram','8 GB','8GB',100),
  ('storage','1 TB SSD','1TB固态硬盘',300),('storage','2 TB SSD','2TB固态硬盘',400),('storage','256 GB SSD','256GB固态硬盘',100),('storage','512 GB SSD','512GB固态硬盘',200),
  ('color','Синий','蓝色',400),('color','Серебристый','银色',200),('color','Серый','灰色',300),('color','Чёрный','黑色',100),
  ('screen','13.3"','13.3英寸',100),('screen','14"','14英寸',200),('screen','15.6"','15.6英寸',300),('screen','16"','16英寸',400),('screen','17.3"','17.3英寸',500)
ON CONFLICT (category, value) DO UPDATE SET value_zh = EXCLUDED.value_zh WHERE lib_values.value_zh IS NULL;

ALTER TABLE serials DROP COLUMN IF EXISTS supplier_id;
DROP TABLE IF EXISTS suppliers CASCADE;
DELETE FROM role_permissions WHERE page_key='suppliers';
DELETE FROM user_permissions WHERE page_key='suppliers';

ALTER TABLE clients ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'retail'; -- retail | wholesale | vip
ALTER TABLE clients ADD COLUMN IF NOT EXISTS discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS manager_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- Заметки/звонки/ручные записи взаимодействия с клиентом (комментарии менеджера, звонки, отметки Telegram)
CREATE TABLE IF NOT EXISTS client_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'comment', -- comment | call | telegram
  text TEXT NOT NULL,
  created_by UUID REFERENCES users(id),
  created_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE serials ADD COLUMN IF NOT EXISTS cost_cny NUMERIC(12,2);
ALTER TABLE serials ADD COLUMN IF NOT EXISTS arrival_note TEXT;
ALTER TABLE serials ADD COLUMN IF NOT EXISTS price_override_cny NUMERIC(12,2);

-- Сервис/ремонт: и наши ноутбуки (свой серийник), и внешние (клиент принёс своё устройство)
CREATE TABLE IF NOT EXISTS service_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  kind TEXT NOT NULL DEFAULT 'external', -- own_stock | external
  serial_id UUID REFERENCES serials(id) ON DELETE SET NULL, -- заполнено, если kind='own_stock'
  device_label TEXT, -- для external: марка/модель со слов клиента
  client_id UUID REFERENCES clients(id),
  issue TEXT,
  is_warranty BOOLEAN NOT NULL DEFAULT false,
  cost_rub NUMERIC(12,2) DEFAULT 0,
  technician TEXT,
  status TEXT NOT NULL DEFAULT 'in_progress', -- in_progress | done | issued | declined
  received_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_date TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE cash_log ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'other';
ALTER TABLE cash_log ADD COLUMN IF NOT EXISTS bank_key TEXT;
ALTER TABLE cash_log ADD COLUMN IF NOT EXISTS recipient TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS balance_rub NUMERIC(14,2) NOT NULL DEFAULT 0;

-- Резервирование конкретного серийника за клиентом до дедлайна
CREATE TABLE IF NOT EXISTS reservations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  serial_id UUID NOT NULL REFERENCES serials(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id),
  deadline TIMESTAMPTZ,
  note TEXT,
  pay_type TEXT DEFAULT 'none', -- none | partial | full
  pay_amount_rub NUMERIC(12,2) DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Долги клиента (открываются при частичной оплате продажи)
CREATE TABLE IF NOT EXISTS debts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  sale_id UUID REFERENCES sales(id),
  amount_rub NUMERIC(12,2) NOT NULL,
  amount_paid_rub NUMERIC(12,2) NOT NULL DEFAULT 0,
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'open', -- open | paid
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- История изменений баланса предоплаты клиента
CREATE TABLE IF NOT EXISTS balance_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  amount_rub NUMERIC(12,2) NOT NULL, -- знак: + пополнение, - списание
  note TEXT,
  balance_after_rub NUMERIC(14,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Банковские счета (помимо наличной кассы)
CREATE TABLE IF NOT EXISTS bank_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key TEXT UNIQUE NOT NULL,      -- напр. 'sber','alfa','tbank'
  name TEXT NOT NULL,
  balance_rub NUMERIC(14,2) NOT NULL DEFAULT 0
);
INSERT INTO bank_accounts (key, name) VALUES
  ('sber','Сбербанк'), ('alfa','Альфа-банк'), ('tbank','Т-банк')
ON CONFLICT (key) DO NOTHING;

-- Шаблоны сообщений для клиентов (используются в карточке клиента и в рассылке)
CREATE TABLE IF NOT EXISTS msg_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Разовая очистка дублей, накопившихся из-за прежнего бага (ON CONFLICT DO NOTHING не работал,
-- потому что уникальный ключ был только на случайный id — конфликтов никогда не было, и при
-- каждом прогоне миграции шаблоны тихо копировались). На каждое имя оставляем самую раннюю запись.
DELETE FROM msg_templates a USING msg_templates b
  WHERE a.name = b.name AND a.created_at > b.created_at;

-- Теперь настоящий уникальный ключ по названию — повторный запуск больше никогда не продублирует.
-- Обёрнуто проверкой, чтобы повторный прогон миграции не падал на "ограничение уже существует".
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'msg_templates_name_unique') THEN
    ALTER TABLE msg_templates ADD CONSTRAINT msg_templates_name_unique UNIQUE (name);
  END IF;
END $$;

INSERT INTO msg_templates (name, text) VALUES
  ('Подтверждение заказа','Здравствуйте, {name}! Ваш заказ подтверждён. Сумма: {total}. Спасибо за покупку!'),
  ('Напоминание о долге','Здравствуйте, {name}! Напоминаем о задолженности: {total}. Пожалуйста, оплатите в ближайшее время.')
ON CONFLICT (name) DO NOTHING;

-- История курса ЦБ РФ (для сравнительного графика со своим курсом)
CREATE TABLE IF NOT EXISTS cbr_rate_history (
  date DATE PRIMARY KEY,
  rate NUMERIC(10,4) NOT NULL
);

INSERT INTO settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Стартовые скидки по категории клиента (справочные значения, админ может менять руками у каждого клиента)
UPDATE clients SET discount_percent = 5 WHERE category = 'vip' AND discount_percent = 0;
UPDATE clients SET discount_percent = 3 WHERE category = 'wholesale' AND discount_percent = 0;

-- Сервис: переход на мультипозиционные заявки — одна заявка (клиент, дата, статус) может
-- содержать несколько устройств/позиций (как было в старой версии — svcAddItem).
DROP TABLE IF EXISTS service_items; -- забытый черновик более раннего варианта, больше не используется
CREATE TABLE IF NOT EXISTS service_order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  service_order_id UUID NOT NULL,
  kind TEXT NOT NULL DEFAULT 'external', -- own_stock | external
  serial_id UUID REFERENCES serials(id) ON DELETE SET NULL,
  device_label TEXT,
  issue TEXT,
  is_warranty BOOLEAN NOT NULL DEFAULT false,
  cost_rub NUMERIC(12,2) DEFAULT 0,
  technician TEXT,
  status TEXT NOT NULL DEFAULT 'in_progress', -- in_progress | done | issued | declined
  return_status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE service_order_items DROP CONSTRAINT IF EXISTS service_order_items_order_fk;
ALTER TABLE service_order_items ADD CONSTRAINT service_order_items_order_fk
  FOREIGN KEY (service_order_id) REFERENCES service_orders(id) ON DELETE CASCADE;

-- Разовая идемпотентная миграция: переносим уже существующие одно-позиционные заявки в
-- новую таблицу позиций (если ещё не перенесены), затем убираем позиционные поля из заявки.
-- Обёрнуто в DO-блок с динамическим SQL: без этого Postgres пытается резолвить колонки
-- service_orders.kind и т.д. ещё на этапе разбора запроса, даже если WHERE EXISTS их
-- отфильтрует — и падает при повторном запуске миграции, когда колонки уже перенесены.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='service_orders' AND column_name='kind') THEN
    EXECUTE '
      INSERT INTO service_order_items (service_order_id, kind, serial_id, device_label, issue, is_warranty, cost_rub, technician, status, created_at)
        SELECT id, kind, serial_id, device_label, issue, is_warranty, cost_rub, technician, status, created_at
        FROM service_orders so
        WHERE NOT EXISTS (SELECT 1 FROM service_order_items soi WHERE soi.service_order_id = so.id)
    ';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Перенос позиций сервиса пропущен (уже перенесено ранее или колонки отсутствуют): %', SQLERRM;
END $$;

ALTER TABLE service_orders DROP COLUMN IF EXISTS kind;
ALTER TABLE service_orders DROP COLUMN IF EXISTS serial_id;
ALTER TABLE service_orders DROP COLUMN IF EXISTS device_label;
ALTER TABLE service_orders DROP COLUMN IF EXISTS issue;
ALTER TABLE service_orders DROP COLUMN IF EXISTS is_warranty;
ALTER TABLE service_orders DROP COLUMN IF EXISTS cost_rub;
ALTER TABLE service_orders DROP COLUMN IF EXISTS technician;

-- Ключ Anthropic API для функций ИИ (хранится только на сервере, фронту отдаётся лишь флаг "задан")
ALTER TABLE settings ADD COLUMN IF NOT EXISTS ai_api_key TEXT DEFAULT '';

-- Черновики персонализированных ИИ-рассылок — требуют одобрения менеджера перед отправкой
CREATE TABLE IF NOT EXISTS broadcast_drafts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  message_text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft', -- draft | approved | sent | rejected
  batch_id UUID NOT NULL DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Кто оформил продажу — нужно для аналитики "эффективность менеджеров"
ALTER TABLE sales ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id);

-- Дата фактического погашения долга — для честного расчёта среднего срока оплаты в Аналитике
ALTER TABLE debts ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

-- Ценообразование предзаказа: наценка зависит от % предоплаты (0% -> 9%, 50% -> 6%, 100% -> 3%),
-- логистика 200 или 300 юаней за позицию. Долг за непредоплаченный остаток хранится В ЮАНЯХ —
-- при погашении пересчитывается по курсу на момент оплаты, а не по курсу на момент заказа.
ALTER TABLE preorders ADD COLUMN IF NOT EXISTS prepayment_pct NUMERIC(5,2) NOT NULL DEFAULT 0;
ALTER TABLE preorders ADD COLUMN IF NOT EXISTS markup_pct NUMERIC(5,2) NOT NULL DEFAULT 9;
ALTER TABLE preorders ADD COLUMN IF NOT EXISTS total_cny NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE preorders ADD COLUMN IF NOT EXISTS paid_cny NUMERIC(12,2) NOT NULL DEFAULT 0;

ALTER TABLE preorder_items ADD COLUMN IF NOT EXISTS logistics_cny NUMERIC(12,2) NOT NULL DEFAULT 200;

-- Долг, привязанный к предзаказу, может быть выражен в юанях (amount_cny) — тогда РЕАЛЬНАЯ
-- сумма к оплате в рублях всегда пересчитывается по текущему курсу, а не фиксируется один раз.
ALTER TABLE debts ADD COLUMN IF NOT EXISTS amount_cny NUMERIC(12,2);
ALTER TABLE debts ADD COLUMN IF NOT EXISTS amount_paid_cny NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE debts ADD COLUMN IF NOT EXISTS preorder_id UUID REFERENCES preorders(id) ON DELETE SET NULL;

-- История изменения цены продажи модели — для мини-графика и стрелки роста/падения на Складе
CREATE TABLE IF NOT EXISTS price_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  laptop_id UUID NOT NULL REFERENCES laptops(id) ON DELETE CASCADE,
  price_cny NUMERIC(12,2) NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Разовая идемпотентная миграция: заносим текущую цену каждой модели как первую точку истории,
-- если по ней ещё вообще нет ни одной записи
INSERT INTO price_history (laptop_id, price_cny, changed_at)
  SELECT id, price_sell_cny, created_at FROM laptops l
  WHERE NOT EXISTS (SELECT 1 FROM price_history ph WHERE ph.laptop_id = l.id);

-- Код доступа к разрушительным операциям (очистка склада/системы) — знает только владелец,
-- хранится в виде хэша, не в открытом виде
ALTER TABLE settings ADD COLUMN IF NOT EXISTS danger_code_hash TEXT;

-- Метка партии импорта — у каждой загрузки бэкапа старой версии свой ID, чтобы можно было
-- удалить именно эту партию данных, не трогая остальное (в т.ч. добавленное вручную позже)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS import_batch_id UUID;
ALTER TABLE laptops ADD COLUMN IF NOT EXISTS import_batch_id UUID;
ALTER TABLE serials ADD COLUMN IF NOT EXISTS import_batch_id UUID;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS import_batch_id UUID;
ALTER TABLE debts ADD COLUMN IF NOT EXISTS import_batch_id UUID;
ALTER TABLE cash_log ADD COLUMN IF NOT EXISTS import_batch_id UUID;

-- Журнал импортов — список партий с датой и количеством, чтобы было видно, что и когда загружали
CREATE TABLE IF NOT EXISTS import_batches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  imported_by UUID REFERENCES users(id),
  counts JSONB NOT NULL DEFAULT '{}',
  source_note TEXT
);
