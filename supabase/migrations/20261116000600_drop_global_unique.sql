-- Етап 4: прибрати старі глобальні правила унікальності (замість них — у межах людини, див. 20261116000500).
-- Застосовано 16.11 вручну в SQL Editor (Supabase просить окремого підтвердження на drop).
drop index if exists books_isbn_active;
alter table series drop constraint if exists series_name_author_key;
drop index if exists series_name_author_key;
