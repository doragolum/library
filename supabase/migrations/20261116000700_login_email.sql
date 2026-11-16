-- Вхід поштою (етап 4, 16.11.2026): запит на вхід пам'ятає пошту й запрошення.
alter table login_requests add column email text;
create index login_requests_email_idx on login_requests(lower(email));
