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

-- Большое пополнение Справочника по присланным спискам (бренды, CPU, GPU, накопители, цвета).
-- ON CONFLICT безопасно пропускает/обновляет перевод, если значение уже было — дублей не будет
-- ни в Справочнике, ни, соответственно, при последующем выборе этих значений в карточках товара.
INSERT INTO lib_brands (name, name_zh) VALUES
  ('Acer','宏碁'),
  ('Alienware','外星人'),
  ('Apple','苹果'),
  ('ASRock','华擎'),
  ('Asus','华硕'),
  ('Avita','艾维塔'),
  ('BenQ','明基'),
  ('Chuwi','驰为'),
  ('Clevo','精英电脑'),
  ('COLORFUL','七彩虹'),
  ('COLORFIRE','橘宝'),
  ('Dell','戴尔'),
  ('Dynabook','东芝Dynabook'),
  ('eMachines','易电脑'),
  ('Fujitsu','富士通'),
  ('Gigabyte','技嘉'),
  ('Google Pixelbook','谷歌笔记本'),
  ('Haier','海尔'),
  ('Hasee','神舟'),
  ('HP','惠普'),
  ('Huawei','华为'),
  ('Honor','荣耀'),
  ('Infinix','传音Infinix'),
  ('Jumper','奔腾'),
  ('Lenovo','联想'),
  ('LG','乐金'),
  ('MECHREVO','机械革命'),
  ('Machenike','机械师'),
  ('Microsoft','微软 (Surface)'),
  ('MSI','微星'),
  ('NOHON','诺希恩'),
  ('Onda','昂达'),
  ('Origin PC','原点电脑'),
  ('Panasonic','松下'),
  ('Packard Bell','百利'),
  ('Prestigio','普利司通'),
  ('Razer','雷蛇'),
  ('RoverBook','罗弗'),
  ('Samsung','三星'),
  ('Suma','苏玛'),
  ('Teclast','台电'),
  ('ThundeRobot','雷神'),
  ('Toshiba','东芝'),
  ('Tongfang','同方'),
  ('VAIO','索尼VAIO'),
  ('Xiaomi','小米'),
  ('Other','其他')
ON CONFLICT (name) DO UPDATE SET name_zh = EXCLUDED.name_zh WHERE lib_brands.name_zh IS NULL;

INSERT INTO lib_values (category, value, value_zh) VALUES
  ('cpu','Snapdragon X Elite X1E-78-100','骁龙 X Elite X1E-78-100'),
  ('cpu','Snapdragon X Elite X1E-84-100','骁龙 X Elite X1E-84-100'),
  ('cpu','Snapdragon X Elite X1E-80-100','骁龙 X Elite X1E-80-100'),
  ('cpu','Snapdragon X Plus X1P-64-100','骁龙 X Plus X1P-64-100'),
  ('cpu','Snapdragon 8cx Gen 3','骁龙 8cx Gen 3'),
  ('cpu','Snapdragon 8cx Gen 2','骁龙 8cx Gen 2'),
  ('cpu','i3-10100','英特尔酷睿 i3-10100'),
  ('cpu','i5-10400','英特尔酷睿 i5-10400'),
  ('cpu','i5-14450HX','英特尔酷睿 i5-14450HX'),
  ('cpu','i5-10600K','英特尔酷睿 i5-10600K'),
  ('cpu','i7-10700K','英特尔酷睿 i7-10700K'),
  ('cpu','i9-10900K','英特尔酷睿 i9-10900K'),
  ('cpu','i5-11400','英特尔酷睿 i5-11400'),
  ('cpu','i7-11700K','英特尔酷睿 i7-11700K'),
  ('cpu','i9-11900K','英特尔酷睿 i9-11900K'),
  ('cpu','i3-1215U','英特尔酷睿 i3-1215U'),
  ('cpu','i3-1315U','英特尔酷睿 i3-1315U'),
  ('cpu','i5-1240P','英特尔酷睿 i5-1240P'),
  ('cpu','i5-12450H','英特尔酷睿 i5-12450H'),
  ('cpu','i5-1340P','英特尔酷睿 i5-1340P'),
  ('cpu','i5-13500H','英特尔酷睿 i5-13500H'),
  ('cpu','i5-13500HX','英特尔酷睿 i5-13500HX'),
  ('cpu','i7-1260P','英特尔酷睿 i7-1260P'),
  ('cpu','i7-12700H','英特尔酷睿 i7-12700H'),
  ('cpu','i7-13620H','英特尔酷睿 i7-13620H'),
  ('cpu','i7-13645HX','英特尔酷睿 i7-13645HX'),
  ('cpu','i7-13650HX','英特尔酷睿 i7-13650HX'),
  ('cpu','i7-13700H','英特尔酷睿 i7-13700H'),
  ('cpu','i7-13700HX','英特尔酷睿 i7-13700HX'),
  ('cpu','i7-14650HX','英特尔酷睿 i7-14650HX'),
  ('cpu','i7-14700HX','英特尔酷睿 i7-14700HX'),
  ('cpu','i9-12900H','英特尔酷睿 i9-12900H'),
  ('cpu','i9-12900HX','英特尔酷睿 i9-12900HX'),
  ('cpu','i9-13900H','英特尔酷睿 i9-13900H'),
  ('cpu','i9-13900HX','英特尔酷睿 i9-13900HX'),
  ('cpu','i9-14900HX','英特尔酷睿 i9-14900HX'),
  ('cpu','Ultra 5 125H','英特尔酷睿 Ultra 5 125H'),
  ('cpu','Ultra 5 135H','英特尔酷睿 Ultra 5 135H'),
  ('cpu','Ultra 5 155H','英特尔酷睿 Ultra 5 155H'),
  ('cpu','Core 5 220H','英特尔酷睿 Core 5 220H'),
  ('cpu','Ultra 5 225H','英特尔酷睿 Ultra 5 225H'),
  ('cpu','Ultra 5 255H','英特尔酷睿 Ultra 5 255H'),
  ('cpu','Ultra 7 155H','英特尔酷睿 Ultra 7 155H'),
  ('cpu','Ultra 7 165H','英特尔酷睿 Ultra 7 165H'),
  ('cpu','Ultra 7 164H','英特尔酷睿 Ultra 7 164H'),
  ('cpu','Ultra 7 255H','英特尔酷睿 Ultra 7 255H'),
  ('cpu','Ultra 9 185H','英特尔酷睿 Ultra 9 185H'),
  ('cpu','Ultra 9 275HX','英特尔酷睿 Ultra 9 275HX'),
  ('cpu','Ultra 9 285H','英特尔酷睿 Ultra 9 285H'),
  ('cpu','Ultra 9 288H','英特尔酷睿 Ultra 9 288H'),
  ('cpu','Ryzen Threadripper 3960X','锐龙 Threadripper 3960X'),
  ('cpu','Ryzen Threadripper 5975WX','锐龙 Threadripper 5975WX'),
  ('cpu','Ryzen Threadripper 7980X','锐龙 Threadripper 7980X'),
  ('cpu','Ryzen Threadripper PRO 7995WX','锐龙 Threadripper PRO 7995WX'),
  ('cpu','Ryzen AI 7 H 350','锐龙 AI 7 H 350'),
  ('cpu','Ryzen AI 9 365','锐龙 AI 9 365'),
  ('cpu','Ryzen AI 9 370','锐龙 AI 9 370'),
  ('cpu','Ryzen 5 5600H','锐龙 5 5600H'),
  ('cpu','Ryzen 5 6600H','锐龙 5 6600H'),
  ('cpu','Ryzen 7 H260','锐龙 7 H260'),
  ('cpu','Ryzen 7 5800H','锐龙 7 5800H'),
  ('cpu','Ryzen 7 6800H','锐龙 7 6800H'),
  ('cpu','Ryzen 7 7745HX','锐龙 7 7745HX'),
  ('cpu','Ryzen 9 5900HX','锐龙 9 5900HX'),
  ('cpu','Ryzen 9 6900HX','锐龙 9 6900HX'),
  ('cpu','Ryzen 9 7845HX','锐龙 9 7845HX'),
  ('cpu','Ryzen 9 8945HX','锐龙 9 8945HX'),
  ('cpu','Ryzen 5 7640HS','锐龙 5 7640HS'),
  ('cpu','Ryzen 7 7735HS','锐龙 7 7735HS'),
  ('cpu','Ryzen 7 7840HS','锐龙 7 7840HS'),
  ('cpu','Ryzen 7 7840U','锐龙 7 7840U'),
  ('cpu','Ryzen 9 7940HX','锐龙 9 7940HX'),
  ('cpu','Ryzen 9 7940HS','锐龙 9 7940HS'),
  ('cpu','Ryzen 9 7945HX','锐龙 9 7945HX'),
  ('cpu','Ryzen 3 8440U','锐龙 3 8440U'),
  ('cpu','Ryzen 5 8640U','锐龙 5 8640U'),
  ('cpu','Ryzen 5 8645HS','锐龙 5 8645HS'),
  ('cpu','Ryzen 7 8745H','锐龙 7 8745H'),
  ('cpu','Ryzen 7 8840HS','锐龙 7 8840HS'),
  ('cpu','Ryzen 7 8840HX','锐龙 7 8840HX'),
  ('cpu','Ryzen 7 8845H','锐龙 7 8845H'),
  ('cpu','Ryzen 7 8845HX','锐龙 7 8845HX'),
  ('cpu','Ryzen 7 8845HS','锐龙 7 8845HS'),
  ('cpu','Ryzen 9 8940HX','锐龙 9 8940HX'),
  ('cpu','Ryzen 9 8950HX','锐龙 9 8950HX'),
  ('cpu','Ryzen 9 9955HX','锐龙 9 9955HX'),
  ('gpu','Intel GMA 950 / 128 MB','英特尔GMA 950 / 128 MB'),
  ('gpu','Intel GMA X3100 / 256 MB','英特尔GMA X3100 / 256 MB'),
  ('gpu','Intel HD Graphics 3000 / 512 MB (Shared)','英特尔HD显卡 3000 / 512 MB (共享)'),
  ('gpu','Intel HD Graphics 4000 / Shared','英特尔HD显卡 4000 / 共享显存'),
  ('gpu','Intel UHD Graphics','英特尔UHD显卡'),
  ('gpu','Intel UHD Graphics 620 / Shared','英特尔UHD显卡 620 / 共享显存'),
  ('gpu','Intel Graphics','英特尔显卡'),
  ('gpu','Intel® UHD Graphics','英特尔® UHD显卡'),
  ('gpu','Intel Iris Plus 640 / Shared','英特尔锐炬 Plus 640 / 共享显存'),
  ('gpu','Intel Iris Xe / Shared','英特尔锐炬 Xe / 共享显存'),
  ('gpu','Intel Arc graphics','英特尔Arc显卡'),
  ('gpu','Intel Arc 130T','英特尔Arc 130T'),
  ('gpu','Intel Arc 140T','英特尔Arc 140T'),
  ('gpu','Intel Arc A380 / 6 GB','英特尔Arc A380 / 6 GB'),
  ('gpu','Intel Arc A750 / 8 GB','英特尔Arc A750 / 8 GB'),
  ('gpu','Intel Arc A770 / 16 GB','英特尔Arc A770 / 16 GB'),
  ('gpu','GeForce2 MX / 32 MB','GeForce2 MX / 32 MB'),
  ('gpu','GeForce4 MX 440 / 64 MB','GeForce4 MX 440 / 64 MB'),
  ('gpu','GeForce FX 5200 / 128 MB','GeForce FX 5200 / 128 MB'),
  ('gpu','GeForce 6600 / 256 MB','GeForce 6600 / 256 MB'),
  ('gpu','GeForce 7600 GT / 256 MB','GeForce 7600 GT / 256 MB'),
  ('gpu','GeForce 8400 GS / 512 MB','GeForce 8400 GS / 512 MB'),
  ('gpu','GeForce 9500 GT / 512 MB','GeForce 9500 GT / 512 MB'),
  ('gpu','GeForce GT 210 / 512 MB','GeForce GT 210 / 512 MB'),
  ('gpu','GeForce GT 240 / 1 GB','GeForce GT 240 / 1 GB'),
  ('gpu','GeForce GT 440 / 1 GB','GeForce GT 440 / 1 GB'),
  ('gpu','GeForce GT 630 / 2 GB','GeForce GT 630 / 2 GB'),
  ('gpu','GeForce GT 710 / 2 GB','GeForce GT 710 / 2 GB'),
  ('gpu','GeForce GTX 750 Ti / 2 GB','GeForce GTX 750 Ti / 2 GB'),
  ('gpu','GeForce GTX 950 / 2 GB','GeForce GTX 950 / 2 GB'),
  ('gpu','GeForce GTX 960 / 4 GB','GeForce GTX 960 / 4 GB'),
  ('gpu','GeForce GTX 970 / 4 GB','GeForce GTX 970 / 4 GB'),
  ('gpu','GeForce GTX 980 / 4 GB','GeForce GTX 980 / 4 GB'),
  ('gpu','GeForce GTX 980 Ti / 6 GB','GeForce GTX 980 Ti / 6 GB'),
  ('gpu','GeForce GTX 1050 / 2 GB','GeForce GTX 1050 / 2 GB'),
  ('gpu','GeForce GTX 1050 Ti / 4 GB','GeForce GTX 1050 Ti / 4 GB'),
  ('gpu','GeForce GTX 1060 / 6 GB','GeForce GTX 1060 / 6 GB'),
  ('gpu','GeForce GTX 1070 / 8 GB','GeForce GTX 1070 / 8 GB'),
  ('gpu','GeForce GTX 1070 Ti / 8 GB','GeForce GTX 1070 Ti / 8 GB'),
  ('gpu','GeForce GTX 1080 / 8 GB','GeForce GTX 1080 / 8 GB'),
  ('gpu','GeForce GTX 1080 Ti / 11 GB','GeForce GTX 1080 Ti / 11 GB'),
  ('gpu','GeForce GTX 1650 / 4 GB','GeForce GTX 1650 / 4 GB'),
  ('gpu','GeForce GTX 1650 Super / 4 GB','GeForce GTX 1650 Super / 4 GB'),
  ('gpu','GeForce GTX 1660 / 6 GB','GeForce GTX 1660 / 6 GB'),
  ('gpu','GeForce GTX 1660 Super / 6 GB','GeForce GTX 1660 Super / 6 GB'),
  ('gpu','GeForce GTX 1660 Ti / 6 GB','GeForce GTX 1660 Ti / 6 GB'),
  ('gpu','GeForce RTX 2060 / 6 GB','GeForce RTX 2060 / 6 GB'),
  ('gpu','GeForce RTX 2060 Super / 8 GB','GeForce RTX 2060 Super / 8 GB'),
  ('gpu','GeForce RTX 2070 / 8 GB','GeForce RTX 2070 / 8 GB'),
  ('gpu','GeForce RTX 2070 Super / 8 GB','GeForce RTX 2070 Super / 8 GB'),
  ('gpu','GeForce RTX 2080 / 8 GB','GeForce RTX 2080 / 8 GB'),
  ('gpu','GeForce RTX 2080 Super / 8 GB','GeForce RTX 2080 Super / 8 GB'),
  ('gpu','GeForce RTX 2080 Ti / 11 GB','GeForce RTX 2080 Ti / 11 GB'),
  ('gpu','GeForce RTX 3050 / 4 GB','GeForce RTX 3050 / 4 GB'),
  ('gpu','GeForce RTX 3060 / 6 GB','GeForce RTX 3060 / 6 GB'),
  ('gpu','GeForce RTX 3060 Ti / 8 GB','GeForce RTX 3060 Ti / 8 GB'),
  ('gpu','GeForce RTX 3070 / 8 GB','GeForce RTX 3070 / 8 GB'),
  ('gpu','GeForce RTX 3070 Ti / 8 GB','GeForce RTX 3070 Ti / 8 GB'),
  ('gpu','GeForce RTX 3080 / 10 GB','GeForce RTX 3080 / 10 GB'),
  ('gpu','GeForce RTX 3080 Ti / 12 GB','GeForce RTX 3080 Ti / 12 GB'),
  ('gpu','GeForce RTX 3090 / 24 GB','GeForce RTX 3090 / 24 GB'),
  ('gpu','GeForce RTX 3090 Ti / 24 GB','GeForce RTX 3090 Ti / 24 GB'),
  ('gpu','GeForce RTX 4060 / 8 GB','GeForce RTX 4060 / 8 GB'),
  ('gpu','GeForce RTX 4060 Ti / 8 GB','GeForce RTX 4060 Ti / 8 GB'),
  ('gpu','GeForce RTX 4070 / 8 GB','GeForce RTX 4070 / 8 GB'),
  ('gpu','GeForce RTX 4070 / 12 GB','GeForce RTX 4070 / 12 GB'),
  ('gpu','GeForce RTX 4070 Ti / 12 GB','GeForce RTX 4070 Ti / 12 GB'),
  ('gpu','GeForce RTX 4080 / 16 GB','GeForce RTX 4080 / 16 GB'),
  ('gpu','GeForce RTX 4090 / 24 GB','GeForce RTX 4090 / 24 GB'),
  ('gpu','GeForce RTX 5050 / 8 GB','GeForce RTX 5050 / 8 GB'),
  ('gpu','GeForce RTX 5060 / 8 GB','GeForce RTX 5060 / 8 GB'),
  ('gpu','GeForce RTX 5070 / 8 GB','GeForce RTX 5070 / 8 GB'),
  ('gpu','GeForce RTX 5070 / 12 GB','GeForce RTX 5070 / 12 GB'),
  ('gpu','GeForce RTX 5070 Ti / 12 GB','GeForce RTX 5070 Ti / 12 GB'),
  ('gpu','GeForce RTX 5070 Ti / 16 GB','GeForce RTX 5070 Ti / 16 GB'),
  ('gpu','GeForce RTX 5080 / 16 GB','GeForce RTX 5080 / 16 GB'),
  ('gpu','GeForce RTX 5090 / 32 GB','GeForce RTX 5090 / 32 GB'),
  ('gpu','Radeon X1300 / 128 MB','Radeon X1300 / 128 MB'),
  ('gpu','Radeon HD 2400 / 256 MB','Radeon HD 2400 / 256 MB'),
  ('gpu','Radeon HD 3450 / 512 MB','Radeon HD 3450 / 512 MB'),
  ('gpu','Radeon HD 4650 / 1 GB','Radeon HD 4650 / 1 GB'),
  ('gpu','Radeon HD 5670 / 1 GB','Radeon HD 5670 / 1 GB'),
  ('gpu','Radeon HD 6750 / 1 GB','Radeon HD 6750 / 1 GB'),
  ('gpu','Radeon HD 7770 / 1 GB','Radeon HD 7770 / 1 GB'),
  ('gpu','Radeon R7 240 / 2 GB','Radeon R7 240 / 2 GB'),
  ('gpu','Radeon R7 250 / 2 GB','Radeon R7 250 / 2 GB'),
  ('gpu','Radeon R9 270 / 2 GB','Radeon R9 270 / 2 GB'),
  ('gpu','Radeon R9 280X / 3 GB','Radeon R9 280X / 3 GB'),
  ('gpu','Radeon R9 290 / 4 GB','Radeon R9 290 / 4 GB'),
  ('gpu','Radeon R9 390 / 8 GB','Radeon R9 390 / 8 GB'),
  ('gpu','Radeon RX 470 / 4 GB','Radeon RX 470 / 4 GB'),
  ('gpu','Radeon RX 480 / 8 GB','Radeon RX 480 / 8 GB'),
  ('gpu','Radeon RX 550 / 4 GB','Radeon RX 550 / 4 GB'),
  ('gpu','Radeon RX 560 / 4 GB','Radeon RX 560 / 4 GB'),
  ('gpu','Radeon RX 570 / 4 GB','Radeon RX 570 / 4 GB'),
  ('gpu','Radeon RX 580 / 8 GB','Radeon RX 580 / 8 GB'),
  ('gpu','Radeon RX 590 / 8 GB','Radeon RX 590 / 8 GB'),
  ('gpu','Radeon 680M','镭龙 680M'),
  ('gpu','Radeon 780M','镭龙 780M'),
  ('gpu','Radeon 760M','镭龙 760M'),
  ('gpu','Radeon RX 5500 / 4 GB','Radeon RX 5500 / 4 GB'),
  ('gpu','Radeon RX 5500 XT / 4 GB','Radeon RX 5500 XT / 4 GB'),
  ('gpu','Radeon RX 5600 XT / 6 GB','Radeon RX 5600 XT / 6 GB'),
  ('gpu','Radeon RX 5700 / 8 GB','Radeon RX 5700 / 8 GB'),
  ('gpu','Radeon RX 5700 XT / 8 GB','Radeon RX 5700 XT / 8 GB'),
  ('gpu','Radeon RX 6600 / 8 GB','Radeon RX 6600 / 8 GB'),
  ('gpu','Radeon RX 6600 XT / 8 GB','Radeon RX 6600 XT / 8 GB'),
  ('gpu','Radeon RX 6650 XT / 8 GB','Radeon RX 6650 XT / 8 GB'),
  ('gpu','Radeon RX 6700 XT / 12 GB','Radeon RX 6700 XT / 12 GB'),
  ('gpu','Radeon RX 6750 XT / 12 GB','Radeon RX 6750 XT / 12 GB'),
  ('gpu','Radeon RX 6800 / 16 GB','Radeon RX 6800 / 16 GB'),
  ('gpu','Radeon RX 6800 XT / 16 GB','Radeon RX 6800 XT / 16 GB'),
  ('gpu','Radeon RX 6900 XT / 16 GB','Radeon RX 6900 XT / 16 GB'),
  ('gpu','Radeon RX 6950 XT / 16 GB','Radeon RX 6950 XT / 16 GB'),
  ('gpu','Radeon RX 7600 / 8 GB','Radeon RX 7600 / 8 GB'),
  ('gpu','Radeon RX 7700 XT / 12 GB','Radeon RX 7700 XT / 12 GB'),
  ('gpu','Radeon RX 7800 XT / 16 GB','Radeon RX 7800 XT / 16 GB'),
  ('gpu','Radeon RX 7900 XT / 20 GB','Radeon RX 7900 XT / 20 GB'),
  ('gpu','Radeon RX 7900 XTX / 24 GB','Radeon RX 7900 XTX / 24 GB'),
  ('gpu','Встроенная','集成显卡'),
  ('storage','40 GB HDD','40 GB机械硬盘'),
  ('storage','80 GB HDD','80 GB机械硬盘'),
  ('storage','120 GB HDD','120 GB机械硬盘'),
  ('storage','160 GB HDD','160 GB机械硬盘'),
  ('storage','250 GB HDD','250 GB机械硬盘'),
  ('storage','320 GB HDD','320 GB机械硬盘'),
  ('storage','500 GB HDD','500 GB机械硬盘'),
  ('storage','750 GB HDD','750 GB机械硬盘'),
  ('storage','1 TB HDD','1 TB机械硬盘'),
  ('storage','2 TB HDD','2 TB机械硬盘'),
  ('storage','4 TB HDD','4 TB机械硬盘'),
  ('storage','64 GB SSD','64 GB固态硬盘'),
  ('storage','128 GB SSD','128 GB固态硬盘'),
  ('storage','256 GB SSD','256 GB固态硬盘'),
  ('storage','512 GB SSD','512 GB固态硬盘'),
  ('storage','1 TB SSD','1 TB固态硬盘'),
  ('storage','2 TB SSD','2 TB固态硬盘'),
  ('storage','4 TB SSD','4 TB固态硬盘'),
  ('storage','8 TB SSD','8 TB固态硬盘'),
  ('color','Белый','白色'),
  ('color','Лунный белый','月光白'),
  ('color','Розовый','粉色'),
  ('color','Серый','灰色'),
  ('color','Холодный серый','趣酷灰'),
  ('color','Жёлтый','黄色'),
  ('color','Коричневый','棕色'),
  ('color','Оранжевый','橙色'),
  ('color','Зелёный','绿色'),
  ('color','Бирюзовый','青色'),
  ('color','Синий','蓝色'),
  ('color','Фиолетовый','紫色'),
  ('color','Красный','红色'),
  ('color','Чёрный','黑色'),
  ('color','Снежно-белый','雪影白'),
  ('color','Каменно-серый','苍岩灰'),
  ('color','Утренне-серый','星晨灰'),
  ('color','Космический серый','星空灰'),
  ('color','Межзвёздный серый','星际灰'),
  ('color','Вселенский серый','宇宙灰'),
  ('color','Зимний серый','冬日银灰'),
  ('color','Серебристый','银色'),
  ('color','Тёмно-чёрный','凝夜色'),
  ('color','Ледниковое серебро','冰河银'),
  ('color','Зимнее серебро','冬日银色'),
  ('color','Летний оливковый','夏日橄榄'),
  ('color','Оливково-зелёный','橄榄绿'),
  ('color','Радужный','云霓色'),
  ('color','Сине-зелёный','魔幻青'),
  ('color','Тёмно-синий','深蓝色'),
  ('color','Золотой','金色'),
  ('color','Шампань','香槟金'),
  ('color','Розовое золото','玫瑰金'),
  ('color','Бордовый','酒红色'),
  ('color','Титановый серый','钛灰色'),
  ('color','Графитовый','石墨色'),
  ('color','Ледяной голубой','冰蓝色'),
  ('color','Ночной чёрный','极夜黑'),
  ('color','Полярное серебро','极光银'),
  ('color','Фантомный синий','幻影蓝'),
  ('color','Фантомный чёрный','幻影黑'),
  ('color','Обсидиановый чёрный','曜石黑'),
  ('color','Переливающееся серебро','流光银'),
  ('color','Теневой серый','暗影灰'),
  ('color','Светло-голубой','浅海蓝'),
  ('color','Другой','其他'),
  ('color','Рассветный','日出印像'),
  ('color','Облачно-белый','云涧白'),
  ('color','Кристально-белый','璃光白'),
  ('color','Северное сияние','极光绿'),
  ('color','Бежево-белый','海盐白'),
  ('color','Нежно-голубой','粉蓝色')
ON CONFLICT (category, value) DO UPDATE SET value_zh = EXCLUDED.value_zh WHERE lib_values.value_zh IS NULL;

-- Заметка о гарантийном случае по продаже — что именно произошло, если был возврат/ремонт по гарантии
ALTER TABLE sales ADD COLUMN IF NOT EXISTS warranty_note TEXT;

-- Переход на реалистичную для этого бизнеса логику (как в старой версии): каждое устройство
-- в заявке идёт по этапам "отправка в Китай на ремонт", а не просто "в работе/готово".
-- Стоимость теперь в юанях (ремонт происходит в Китае), плюс трек-номер и ожидаемая дата.
ALTER TABLE service_order_items ADD COLUMN IF NOT EXISTS cost_cny NUMERIC(12,2) DEFAULT 0;
ALTER TABLE service_order_items ADD COLUMN IF NOT EXISTS tracking TEXT;
ALTER TABLE service_order_items ADD COLUMN IF NOT EXISTS expected_date DATE;
-- Переносим уже введённые суммы из рублей в юани по текущему курсу (разово, если ещё не переносили)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='service_order_items' AND column_name='cost_rub') THEN
    UPDATE service_order_items SET cost_cny = ROUND(cost_rub / (SELECT rate FROM settings WHERE id=1), 2)
      WHERE cost_cny = 0 AND cost_rub > 0;
  END IF;
END $$;

-- История смены этапов по каждому устройству в сервисе — аналогично serial_history
CREATE TABLE IF NOT EXISTS service_item_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  service_item_id UUID NOT NULL REFERENCES service_order_items(id) ON DELETE CASCADE,
  stage TEXT NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Новые характеристики ноутбука: частота экрана, тип матрицы, подсветка клавиатуры, раскладка.
-- Все — необязательные, показываются только в карточке товара (не в таблице склада),
-- значения ведутся через Справочник (как CPU/GPU/цвет и т.д.)
ALTER TABLE laptops ADD COLUMN IF NOT EXISTS refresh_rate TEXT;
ALTER TABLE laptops ADD COLUMN IF NOT EXISTS screen_type TEXT;
ALTER TABLE laptops ADD COLUMN IF NOT EXISTS keyboard_backlight TEXT;
ALTER TABLE laptops ADD COLUMN IF NOT EXISTS keyboard_layout TEXT;

INSERT INTO lib_values (category, value, value_zh) VALUES
  ('refresh_rate','60Hz','60Hz'),('refresh_rate','120Hz','120Hz'),('refresh_rate','144Hz','144Hz'),
  ('refresh_rate','165Hz','165Hz'),('refresh_rate','240Hz','240Hz'),
  ('screen_type','IPS','IPS'),('screen_type','OLED','OLED'),('screen_type','MiniLED','MiniLED'),
  ('screen_type','TN','TN'),('screen_type','VA','VA'),
  ('keyboard_backlight','Есть подсветка','有背光'),('keyboard_backlight','Нет подсветки','无背光'),
  ('keyboard_layout','US','US'),('keyboard_layout','RU','RU'),('keyboard_layout','CN','CN')
ON CONFLICT (category, value) DO UPDATE SET value_zh = EXCLUDED.value_zh WHERE lib_values.value_zh IS NULL;
