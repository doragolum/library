-- Каталог: fetched_at = коли дані справді взяли з інтернету (без значення за замовчуванням).
alter table catalog alter column fetched_at drop default;
update catalog set fetched_at = null where sources->'urls' is null and sources->'notFound' is null;
create extension if not exists pg_cron;
-- Завдання 'lb-enrich' (кожні 5 хв, POST {"n":8} на /functions/v1/enrich з x-import-token) створено окремо в базі.
