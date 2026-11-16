-- «Нагадати пізніше» для сповіщень з додатку (16.11.2026): відкладені сповіщення й крон, що надсилає їх у свій час.
create table push_snooze (
  id       bigint generated always as identity primary key,
  owner_id bigint not null default 1 references app_users(id) on delete cascade,
  due_at   timestamptz not null,
  msg      jsonb not null,             -- {kind, id, title, body, tag, actions}
  created_at timestamptz not null default now()
);
create index push_snooze_due_idx on push_snooze(due_at);
alter table push_snooze enable row level security;
select cron.schedule('lb-snooze', '*/5 * * * *', $$select net.http_post('https://syrwtxxgbybftkuxuvlq.supabase.co/functions/v1/daily', '{"job":"snooze"}'::jsonb, '{}'::jsonb, jsonb_build_object('Content-Type','application/json','x-import-token',(select value#>>'{}' from kv where key='import_token')), 60000)$$);
