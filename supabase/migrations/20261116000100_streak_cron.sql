-- Серія читання (16.11.2026): щогодини о :00 функція daily сама вирішує, чи час надіслати вечірнє нагадування
-- (година з kv streak.hour за Роттердамом, лише якщо сьогодні ще не читала; «Нагадати о 22:00» — kv streak.snooze).
select cron.schedule('lb-streak', '0 * * * *', $$select net.http_post('https://syrwtxxgbybftkuxuvlq.supabase.co/functions/v1/daily', '{"job":"streak"}'::jsonb, '{}'::jsonb, jsonb_build_object('Content-Type','application/json','x-import-token',(select value#>>'{}' from kv where key='import_token')), 60000)$$);
