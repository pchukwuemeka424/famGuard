-- ============================================
-- Migration: Schedule Afternoon Greeting (Secure Version)
-- ============================================
-- This migration creates a function and cron job to send afternoon greetings
-- at 1:20 PM Nigeria time (12:20 PM UTC) daily

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Function to call the afternoon greeting edge function
-- Reads service role key from app_config table
CREATE OR REPLACE FUNCTION call_afternoon_greeting_edge_function()
RETURNS void AS $$
DECLARE
  project_ref TEXT := 'bbydsaxduuwbnwqmiant';
  service_role_key TEXT;
  function_url TEXT;
  request_id BIGINT;
BEGIN
  -- Get service role key from config table
  SELECT value INTO service_role_key
  FROM app_config
  WHERE key = 'supabase_service_role_key';
  
  IF service_role_key IS NULL OR service_role_key = '' THEN
    RAISE EXCEPTION 'Service role key not configured. Please insert it into app_config table with key ''supabase_service_role_key''';
  END IF;
  
  -- Build the function URL
  function_url := 'https://' || project_ref || '.supabase.co/functions/v1/send-goodafternoon-greeting';
  
  -- Make HTTP request to the edge function
  -- net.http_post returns a request ID (asynchronous request)
  request_id := net.http_post(
    url := function_url,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || service_role_key,
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  
  RAISE NOTICE 'Afternoon greeting request queued with ID: % at %', request_id, NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Schedule the function to run daily at 1:20 PM Nigeria time (12:20 PM UTC)
-- Nigeria is UTC+1, so 1:20 PM Nigeria time = 12:20 PM UTC
-- Cron format: minute hour day month weekday
-- '20 12 * * *' means: 20 minutes, 12 hours (12:20 PM UTC), every day
DO $$
BEGIN
  -- Unschedule existing job if it exists
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-afternoon-greeting') THEN
    PERFORM cron.unschedule('send-afternoon-greeting');
  END IF;
  
  -- Schedule the new job (using single quotes for the command)
  PERFORM cron.schedule(
    'send-afternoon-greeting',
    '20 12 * * *',  -- 12:20 PM UTC = 1:20 PM Nigeria time (UTC+1) daily
    'SELECT call_afternoon_greeting_edge_function()'
  );
  
  RAISE NOTICE 'Afternoon greeting cron job scheduled successfully';
  RAISE NOTICE 'IMPORTANT: You must insert your service_role key into app_config table if not already done:';
  RAISE NOTICE '  INSERT INTO app_config (key, value, description) VALUES (''supabase_service_role_key'', ''YOUR_KEY_HERE'', ''Service role key for edge functions'') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;';
END $$;

-- Display current job status
SELECT 
  jobid,
  jobname,
  schedule,
  active,
  CASE 
    WHEN EXISTS (SELECT 1 FROM app_config WHERE key = 'supabase_service_role_key') 
    THEN '✅ Service role key configured'
    ELSE '❌ Service role key NOT configured - job will fail until key is inserted'
  END as config_status
FROM cron.job 
WHERE jobname = 'send-afternoon-greeting';

-- Note: To manually test the function, run:
-- SELECT call_afternoon_greeting_edge_function();

-- Note: To check job execution history:
-- SELECT * FROM cron.job_run_details WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'send-afternoon-greeting') ORDER BY start_time DESC LIMIT 10;

-- Note: To unschedule the job:
-- SELECT cron.unschedule('send-afternoon-greeting');
