SELECT cron.alter_job(job_id := 6, schedule := '* * * * *');
SELECT cron.unschedule('cleanup-expired-locks-every-1-minute');