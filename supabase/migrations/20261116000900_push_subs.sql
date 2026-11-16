-- Сповіщення в додатку (Web Push, 16.11.2026): пристрої, на які людина дозволила сповіщення.
-- Одна людина може мати кілька пристроїв (телефон, комп'ютер). Даних книг не змінює.
create table push_subs (
  id         bigint generated always as identity primary key,
  owner_id   bigint not null default 1 references app_users(id) on delete cascade,
  endpoint   text not null unique,      -- адреса служби сповіщень пристрою (Apple / Google / Mozilla)
  p256dh     text not null,             -- відкритий ключ пристрою для шифрування
  auth       text not null,
  agent      text,                      -- який пристрій (для «Я» → «Сповіщення»)
  created_at timestamptz not null default now(),
  last_ok    timestamptz,
  fails      int not null default 0
);
create index push_subs_owner_idx on push_subs(owner_id);
alter table push_subs enable row level security;

-- Ключі VAPID для підпису сповіщень: функції створюють їх самі при першому використанні. Лише один рядок.
-- Таблицю бачать тільки функції (RLS без політик), у репозиторій і чат ключ не потрапляє.
create table push_vapid (
  id   int primary key check (id = 1),
  pub  text not null,
  priv text not null,
  created_at timestamptz not null default now()
);
alter table push_vapid enable row level security;
