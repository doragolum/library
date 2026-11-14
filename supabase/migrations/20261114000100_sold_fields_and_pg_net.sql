alter table books add column if not exists sold_on date, add column if not exists sold_price numeric;
create extension if not exists pg_net with schema extensions;
