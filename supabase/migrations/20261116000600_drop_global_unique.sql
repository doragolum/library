-- Етап 4: прибрати старі глобальні правила унікальності (замість них — у межах людини, див. 20261116000500).
-- Supabase просить окремого підтвердження на drop; запускається з SQL Editor або після підтвердження.
drop index if exists books_isbn_active;
alter table series drop constraint if exists series_name_author_key;
drop index if exists series_name_author_key;
