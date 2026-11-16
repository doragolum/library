-- Журнал читання (16.11.2026, погоджено: A + B + C): кожна закладка й «Читала» — запис із датою, часом і сторінками.
-- Записи можна виправити або видалити в додатку; серія (kv streak.days) перераховується з журналу.
create table reading_log (
  id          bigint generated always as identity primary key,
  owner_id    bigint not null default 1 references app_users(id),
  book_id     bigint references books(id) on delete cascade,
  day         date not null,
  at          timestamptz,            -- час позначки (порожньо — невідомо, старі дні)
  page_from   int check (page_from >= 0),
  page_to     int check (page_to >= 0),
  kind        text not null default 'page' check (kind in ('page','read')),  -- page — закладка, read — «Читала» без сторінок
  created_at  timestamptz not null default now()
);
create index reading_log_owner_day_idx on reading_log(owner_id, day desc);
create index reading_log_book_idx on reading_log(book_id);
alter table reading_log enable row level security;  -- без політик: усе через функції

-- дні, вже відмічені для серії (закладки й «Читала» до появи журналу), стають записами «Читала» без часу
insert into reading_log (day, kind)
select distinct d::date, 'read' from kv, jsonb_array_elements_text(coalesce(value->'days','[]'::jsonb)) d where kv.key = 'streak';

insert into log (action, details, owner_id) values ('📖 Журнал читання',
  'Додано журнал читання. Дні серії, відмічені раніше, перенесено в журнал як «Читала» без часу. Погоджено 16.11.', 1);
