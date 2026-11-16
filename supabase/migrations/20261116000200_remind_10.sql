-- Ранкові нагадування з 16.11.2026 о 10:00 за Києвом (9:00 у Роттердамі): Київ = UTC+2 взимку (8:00 UTC), UTC+3 влітку (7:00 UTC).
select cron.unschedule('lb-remind');
select cron.schedule('lb-remind', '0 7,8 * * *', $$select net.http_post('https://syrwtxxgbybftkuxuvlq.supabase.co/functions/v1/daily', '{"job":"remind"}'::jsonb, '{}'::jsonb, jsonb_build_object('Content-Type','application/json','x-import-token',(select value#>>'{}' from kv where key='import_token')), 60000)$$);
