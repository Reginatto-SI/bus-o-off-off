SELECT cron.schedule(
  'retention-cron-job-run-details',
  '0 4 * * *',
  $$ DELETE FROM cron.job_run_details WHERE end_time < now() - interval '2 days' $$
);