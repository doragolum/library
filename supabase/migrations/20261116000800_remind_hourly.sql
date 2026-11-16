-- Етап 6 (16.11.2026): ранкове нагадування щогодини; функція daily сама шле кожній людині о 9:00 за її часовим поясом (раз на день).
select cron.alter_job((select jobid from cron.job where jobname = 'lb-remind'), schedule := '0 * * * *');
