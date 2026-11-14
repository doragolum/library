-- Що база знайшла в інтернеті для бажанок без ISBN (ключ: автор|назва). status: auto — записано в порожні поля, doubt — лише підказка, none — не знайдено.
create table if not exists wish_found (
  key text primary key,
  status text not null check (status in ('auto', 'doubt', 'none')),
  data jsonb not null default '{}'::jsonb,
  tried_at timestamptz not null default now()
);
alter table wish_found enable row level security;
