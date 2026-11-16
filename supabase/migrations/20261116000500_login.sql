-- Етап 4 плану акаунтів (16.11.2026): вхід за запрошенням через Телеграм, сесії, ліміт Gemini для друзів.
-- Даних не змінює; унікальність ISBN і серій тепер у межах однієї людини.
create table invites (
  code        text primary key,
  created_by  bigint not null default 1 references app_users(id),
  note        text,                       -- кому (для себе)
  created_at  timestamptz not null default now(),
  used_by     bigint references app_users(id),
  used_at     timestamptz,
  revoked     boolean not null default false
);
create table login_requests (
  nonce        text primary key,          -- одноразовий код у посиланні t.me/<бот>?start=login_<nonce>
  invite       text references invites(code),
  user_id      bigint references app_users(id),
  tg_name      text,
  created_at   timestamptz not null default now(),
  confirmed_at timestamptz,
  taken_at     timestamptz                -- сайт уже забрав сесію
);
create table sessions (
  id          bigint generated always as identity primary key,
  user_id     bigint not null references app_users(id) on delete cascade,
  token_hash  text not null unique,       -- зберігаємо лише відбиток (sha-256), не сам токен
  created_at  timestamptz not null default now(),
  last_seen   timestamptz,
  agent       text,
  revoked     boolean not null default false
);
create table ai_usage (
  user_id bigint not null references app_users(id) on delete cascade,
  day     date not null,
  n       int not null default 0,
  primary key (user_id, day)
);
alter table invites enable row level security;
alter table login_requests enable row level security;
alter table sessions enable row level security;
alter table ai_usage enable row level security;
create index sessions_user_idx on sessions(user_id);

-- той самий ISBN чи серія можуть бути в різних людей
drop index if exists books_isbn_active;
create unique index books_isbn_active on books(owner_id, isbn) where isbn is not null and stage <> all (array['sold','gifted']);
alter table series drop constraint if exists series_name_author_key;
drop index if exists series_name_author_key;
create unique index series_name_author_key on series(owner_id, name, author);
create index reading_log_owner_book_idx on reading_log(owner_id, book_id);

insert into log (action, details, owner_id) values ('👥 Етап 4: вхід за запрошенням',
  'Додано запрошення, вхід через Телеграм (сесії), ліміт Gemini для друзів. Даних не змінено. Погоджено 16.11.', 1);
