-- ============================================
-- Migration: Update Afternoon Greeting Schedule to 1:20 PM Nigeria Time
-- ============================================
-- This migration updates the afternoon greeting cron job to run at 1:20 PM Nigeria time
-- Nigeria is UTC+1, so 1:20 PM Nigeria time = 12:20 PM UTC
-- Cron format: minute hour day month weekday
-- '20 12 * * *' means: 20 minutes, 12 hours (12:20 PM UTC), every day

-- Unschedule existing job if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-afternoon-greeting') THEN
    PERFORM cron.unschedule('send-afternoon-greeting');
    RAISE NOTICE 'Unscheduled existing afternoon greeting job';
  END IF;
END $$;

-- Schedule the job for 1:20 PM Nigeria time (12:20 PM UTC)
SELECT cron.schedule(
  'send-afternoon-greeting',
  '20 12 * * *',  -- 12:20 PM UTC = 1:20 PM Nigeria time (UTC+1)
  'SELECT call_afternoon_greeting_edge_function()'
);

-- Display updated job status
SELECT 
  jobid,
  jobname,
  schedule,
  active,
  CASE 
    WHEN EXISTS (SELECT 1 FROM app_config WHERE key = 'supabase_service_role_key') 
    THEN '✅ Service role key configured'
    ELSE '❌ Service role key NOT configured - job will fail until key is inserted'
  END as config_status,
  '1:20 PM Nigeria time (12:20 PM UTC)' as schedule_description
FROM cron.job 
WHERE jobname = 'send-afternoon-greeting';

-- Note: To manually test the function, run:
-- SELECT call_afternoon_greeting_edge_function();

-- Note: To check job execution history:
-- SELECT * FROM cron.job_run_details WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'send-afternoon-greeting') ORDER BY start_time DESC LIMIT 10;
