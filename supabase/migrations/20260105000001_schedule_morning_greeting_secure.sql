-- ============================================
-- Migration: Schedule Morning Greeting (Secure Version)
-- ============================================
-- This migration creates a secure config table and function
-- that reads the service role key from the config table

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create a secure config table for storing sensitive keys
CREATE TABLE IF NOT EXISTS app_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on config table
ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;

-- Only service_role can access the config
CREATE POLICY "Service role can manage config" ON app_config
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

-- Grant permissions
GRANT ALL ON app_config TO service_role;

-- Function to call the morning greeting edge function
-- Reads service role key from app_config table
CREATE OR REPLACE FUNCTION call_morning_greeting_edge_function()
RETURNS void AS $$
DECLARE
  project_ref TEXT := 'bbydsaxduuwbnwqmiant';
  service_role_key TEXT;
  function_url TEXT;
  response_status INTEGER;
  response_body TEXT;
BEGIN
  -- Get service role key from config table
  SELECT value INTO service_role_key
  FROM app_config
  WHERE key = 'supabase_service_role_key';
  
  IF service_role_key IS NULL OR service_role_key = '' THEN
    RAISE EXCEPTION 'Service role key not configured. Please insert it into app_config table with key ''supabase_service_role_key''';
  END IF;
  
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
DO $$
BEGIN
  -- Unschedule existing job if it exists
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-morning-greeting') THEN
    PERFORM cron.unschedule('send-morning-greeting');
  END IF;
  
  -- Schedule the new job (using single quotes for the command)
  PERFORM cron.schedule(
    'send-morning-greeting',
    '0 8 * * *',
    'SELECT call_morning_greeting_edge_function()'
  );
  
  RAISE NOTICE 'Morning greeting cron job scheduled successfully';
  RAISE NOTICE 'IMPORTANT: You must insert your service_role key into app_config table:';
  RAISE NOTICE '  INSERT INTO app_config (key, value, description) VALUES (''supabase_service_role_key'', ''YOUR_KEY_HERE'', ''Service role key for edge functions'');';
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
WHERE jobname = 'send-morning-greeting';
