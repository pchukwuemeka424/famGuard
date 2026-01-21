-- ============================================
-- Migration: Schedule App Update Notification (Every 2 Hours)
-- ============================================
-- This migration sets up automatic app update push notifications
-- that check every 2 hours if app_update_notification_enabled is true
-- and sends notifications to all registered users

-- Enable required extensions (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Function to call the edge function via HTTP
CREATE OR REPLACE FUNCTION call_app_update_notification_edge_function()
RETURNS void AS $$
DECLARE
  project_ref TEXT := 'bbydsaxduuwbnwqmiant'; -- Replace with your project reference
  service_role_key TEXT := 'YOUR_SERVICE_ROLE_KEY'; -- Replace with your service_role key
  function_url TEXT;
  response_status INTEGER;
  response_body TEXT;
BEGIN
  -- Build the function URL
  function_url := 'https://' || project_ref || '.supabase.co/functions/v1/send-app-update-notification';
  
  -- Make HTTP request to the edge function
  SELECT status, content INTO response_status, response_body
  FROM net.http_post(
    url := function_url,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || service_role_key,
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  
  IF response_status = 200 THEN
    RAISE NOTICE 'App update notification check completed at %', NOW();
    RAISE NOTICE 'Response: %', response_body;
  ELSE
    RAISE WARNING 'Failed to check/send app update notifications. Status: %, Response: %', response_status, response_body;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Schedule the function to run every 2 hours
-- Cron format: minute hour day month weekday
-- '0 */2 * * *' means: 0 minutes, every 2 hours, every day
-- 
-- Note: If a job with this name already exists, it will be updated
DO $$
BEGIN
  -- Unschedule existing job if it exists
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-app-update-notification') THEN
    PERFORM cron.unschedule('send-app-update-notification');
    RAISE NOTICE 'Unscheduled existing app update notification job';
  END IF;
  
  -- Schedule the new job
  PERFORM cron.schedule(
    'send-app-update-notification',              -- Job name
    '0 */2 * * *',                              -- Cron schedule: every 2 hours
    'SELECT call_app_update_notification_edge_function()' -- SQL to execute
  );
  
  RAISE NOTICE 'App update notification cron job scheduled successfully (every 2 hours)';
END $$;

-- Verify the job was created
SELECT 
  jobid,
  jobname,
  schedule,
  command,
  nodename,
  nodeport,
  database,
  username,
  active
FROM cron.job 
WHERE jobname = 'send-app-update-notification';

-- Note: To manually test the function, run:
-- SELECT call_app_update_notification_edge_function();

-- Note: To check job execution history:
-- SELECT * FROM cron.job_run_details WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'send-app-update-notification') ORDER BY start_time DESC LIMIT 10;

-- Note: To unschedule the job:
-- SELECT cron.unschedule('send-app-update-notification');
