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
  ('staff','suppliers',true,true),
  ('staff','finance',true,false),
  ('staff','analytics',true,false),
  ('staff','reports',true,false),
  ('staff','import',true,true),
  ('staff','employees',true,false),
  ('staff','activity_log',false,false),
  ('accountant','dashboard',true,false),
  ('accountant','warehouse',true,false),
  ('accountant','clients',true,false),
  ('accountant','preorders',true,false),
  ('accountant','sales',true,false),
  ('accountant','cash',true,true),
  ('accountant','settings',false,false),
  ('accountant','admin',false,false),
  ('accountant','suppliers',true,false),
  ('accountant','finance',true,true),
  ('accountant','analytics',true,false),
  ('accountant','reports',true,true),
  ('accountant','import',false,false),
  ('accountant','employees',true,true),
  ('accountant','activity_log',true,false),
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
  status_id TEXT NOT NULL DEFAULT 's2',
  arrival_date TIMESTAMPTZ,
  sale_date TIMESTAMPTZ,
  sale_client_id UUID REFERENCES clients(id),
  warranty_months INT DEFAULT 3,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_serials_laptop ON serials(laptop_id);
CREATE INDEX IF NOT EXISTS idx_serials_status ON serials(status_id);

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

-- Поставщики (у кого закупаем товар в Китае)
CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  contact_person TEXT,
  phone TEXT,
  wechat TEXT,
  country TEXT DEFAULT 'CN',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

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

ALTER TABLE serials ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES suppliers(id);
ALTER TABLE cash_log ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'other';

INSERT INTO settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
