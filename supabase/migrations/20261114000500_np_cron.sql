-- Нова пошта: щогодини (хв. 15) функція np перевіряє ТТН замовлених книг.
-- Нічна копія в Google-таблицю йде через Apps Script (LbExport.gs → функція export), тут кронів не треба.
select cron.schedule('lb-np', '15 * * * *', $$select net.http_post('https://syrwtxxgbybftkuxuvlq.supabase.co/functions/v1/np', '{}'::jsonb, '{}'::jsonb, jsonb_build_object('Content-Type','application/json','x-import-token',(select value#>>'{}' from kv where key='import_token')), 120000)$$);
