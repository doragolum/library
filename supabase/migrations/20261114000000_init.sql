-- «Моя бібліотека» на Supabase: одна книга = один запис (бажанка → замовлено → в дорозі → у бібліотеці → продана/подарована).
-- Доступ лише через edge-функцію api (ключ ?k= або підпис Телеграму), тому RLS увімкнено без політик:
-- анонімний ключ сайту нічого не читає й не пише напряму.

create extension if not exists pg_trgm;

-- Каталог видань: дані з інтернету за ISBN (MEGOGO, Goodreads, Книгарня Є, Google Books). Наповнюється автоматично.
create table catalog (
  isbn        text primary key,               -- 13 цифр
  title       text,
  author      text,
  series      text,
  series_num  numeric,
  series_total int,
  publisher   text,
  pages       int,
  lang        text,
  year        int,
  release     date,
  cover       text,
  description text,
  orig_title  text,
  genres      text[] default '{}',
  rating      numeric,                         -- Goodreads
  sources     jsonb  default '{}'::jsonb,      -- {"megogo":"https://…","goodreads":"https://…"}
  fetched_at  timestamptz default now()
);

create table series (
  id        bigserial primary key,
  name      text not null,
  author    text not null,
  total     int,
  finished  boolean,                           -- «Завершена?»
  full_ua   boolean,                           -- «Повний переклад укр»
  unique (name, author)
);

create table books (
  id          bigserial primary key,
  -- шлях книги
  stage       text not null default 'wish'
              check (stage in ('wish','ordered','ttn','shipped','delivered','library','sold','gifted')),
  wish_kind   text check (wish_kind in ('Хочу купити','Докупити серію','На майбутнє')),
  -- що це за книга
  isbn        text references catalog(isbn) on update cascade on delete set null,
  author      text not null,
  title       text not null,
  orig_title  text,
  series_id   bigint references series(id) on delete set null,
  series_num  numeric,
  publisher   text,
  lang        text default 'українська',
  pages       int,
  genre       text,
  genres      text[] default '{}',
  tropes      text[] default '{}',
  moods       text[] default '{}',
  cover       text,
  source_url  text,
  -- купівля
  price       numeric,                         -- 0 або 1 = акція
  sale_status text check (sale_status in ('Є у продажу','Анонс','Передзамовлення','Немає у продажу','Не видана')),
  release     date,
  shop        text,                            -- «Де замовлено»
  shop_site   text,
  order_no    text,
  ordered_on  date,
  ttn         text,
  np_status   text,
  np_checked  timestamptz,
  np_error    text,
  bought_on   date,
  -- у бібліотеці
  avail       text default 'у колекції'
              check (avail in ('у колекції','на продаж','на розподілення','позичена','продана','подарована')),
  place       text default 'Роттердам' check (place in ('Роттердам','Київ')),
  shelf       text,
  kyiv_prio   text,
  kyiv_parcel text,
  lent_to     text,
  lent_on     date,
  return_by   date,
  -- читання
  read_status text default 'не читала' check (read_status in ('не читала','читаю','прочитано','закинула')),
  started_on  date,
  finished_on date,
  rating      numeric,
  cur_page    int,
  plan_month  text,                            -- 'MM.YYYY'
  -- службове
  legacy      jsonb default '{}'::jsonb,       -- {"lib_row":12,"wish_row":40,"id":"K00012"} — звідки перенесено
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- Дубль неможливий: той самий ISBN двічі в активних книгах (не продана/подарована) не пройде
create unique index books_isbn_active on books (isbn) where isbn is not null and stage not in ('sold','gifted');
create index books_stage on books (stage);
create index books_author_title on books using gin ((lower(author || ' ' || title)) gin_trgm_ops);

create table log (
  id      bigserial primary key,
  at      timestamptz default now(),
  action  text not null,
  book_id bigint references books(id) on delete set null,
  title   text,
  author  text,
  details text
);

-- налаштування й стани (цілі, позначки полиць, новини серій, стан бота…)
create table kv (
  key   text primary key,
  value jsonb,
  updated_at timestamptz default now()
);

create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger books_touch before update on books for each row execute function touch_updated_at();

alter table catalog enable row level security;
alter table series  enable row level security;
alter table books   enable row level security;
alter table log     enable row level security;
alter table kv      enable row level security;
