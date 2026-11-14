-- Щоденні роботи функції daily (час UTC; Київ = UTC+2 взимку, UTC+3 влітку).
-- Нагадування: двічі (6:00 і 7:00 UTC), функція сама шле лише раз на день і не раніше 9:00 за Києвом,
-- і лише коли бот уже переведено в базу (lbSwitchToDb), щоб не дублювати Apps Script.
select cron.schedule('lb-remind', '0 6,7 * * *', $$select net.http_post('https://syrwtxxgbybftkuxuvlq.supabase.co/functions/v1/daily', '{"job":"remind"}'::jsonb, '{}'::jsonb, jsonb_build_object('Content-Type','application/json','x-import-token',(select value#>>'{}' from kv where key='import_token')), 60000)$$);
-- Ніч: «Передзамовлення/Анонс» з настанням дати релізу → «Є у продажу».
select cron.schedule('lb-night', '0 1 * * *', $$select net.http_post('https://syrwtxxgbybftkuxuvlq.supabase.co/functions/v1/daily', '{"job":"night"}'::jsonb, '{}'::jsonb, jsonb_build_object('Content-Type','application/json','x-import-token',(select value#>>'{}' from kv where key='import_token')), 60000)$$);
-- Новини серій: щопонеділка.
select cron.schedule('lb-news', '0 3 * * 1', $$select net.http_post('https://syrwtxxgbybftkuxuvlq.supabase.co/functions/v1/daily', '{"job":"news"}'::jsonb, '{}'::jsonb, jsonb_build_object('Content-Type','application/json','x-import-token',(select value#>>'{}' from kv where key='import_token')), 150000)$$);
