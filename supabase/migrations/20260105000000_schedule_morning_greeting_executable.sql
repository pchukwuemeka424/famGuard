-- ============================================
-- Migration: Schedule Morning Greeting Push Notifications
-- ============================================
-- This migration sets up automatic morning greeting push notifications
-- that are sent to all registered users every day at 8:00 AM
--
-- IMPORTANT: Before running this, replace:
--   - YOUR_PROJECT_REF with your Supabase project reference (e.g., bbydsaxduuwbnwqmiant)
--   - YOUR_SERVICE_ROLE_KEY with your service_role key from Supabase Dashboard > Settings > API

-- Enable required extensions (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Function to call the edge function via HTTP
CREATE OR REPLACE FUNCTION call_morning_greeting_edge_function()
RETURNS void AS $$
DECLARE
  project_ref TEXT := 'bbydsaxduuwbnwqmiant'; -- Replace with your project reference
  service_role_key TEXT := 'YOUR_SERVICE_ROLE_KEY'; -- Replace with your service_role key
  function_url TEXT;
  response_status INTEGER;
  response_body TEXT;
BEGIN
  -- Build the function URL
  function_url := 'https://' || project_ref || '.supabase.co/functions/v1/send-morning-greeting';
  
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
    RAISE NOTICE 'Morning greeting sent successfully at %', NOW();
    RAISE NOTICE 'Response: %', response_body;
  ELSE
    RAISE WARNING 'Failed to send morning greeting. Status: %, Response: %', response_status, response_body;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Schedule the function to run daily at 8:00 AM UTC
-- Cron format: minute hour day month weekday
-- '0 8 * * *' means: 0 minutes, 8 hours (8:00 AM), every day
-- 
-- Note: If a job with this name already exists, it will be updated
DO $$
BEGIN
  -- Unschedule existing job if it exists
  PERFORM cron.unschedule('send-morning-greeting') WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'send-morning-greeting'
  );
  
  -- Schedule the new job
  PERFORM cron.schedule(
    'send-morning-greeting',              -- Job name
    '0 8 * * *',                         -- Cron schedule: daily at 8:00 AM UTC
    $$SELECT call_morning_greeting_edge_function()$$ -- SQL to execute
  );
  
  RAISE NOTICE 'Morning greeting cron job scheduled successfully';
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
WHERE jobname = 'send-morning-greeting';

-- Note: To manually test the function, run:
-- SELECT call_morning_greeting_edge_function();

-- Note: To check job execution history:
-- SELECT * FROM cron.job_run_details WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'send-morning-greeting') ORDER BY start_time DESC LIMIT 10;

-- Note: To unschedule the job:
-- SELECT cron.unschedule('send-morning-greeting');
