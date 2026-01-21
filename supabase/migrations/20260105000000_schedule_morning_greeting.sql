-- ============================================
-- Migration: Schedule Morning Greeting Push Notifications
-- ============================================
-- This migration provides instructions and setup for automatic morning greeting
-- push notifications that are sent to all registered users every day at 8:00 AM
--
-- IMPORTANT: This requires setting up a cron job to call the Edge Function
-- See setup instructions below

-- ============================================
-- SETUP INSTRUCTIONS
-- ============================================
-- 
-- STEP 1: Deploy the Edge Function
--   Run: supabase functions deploy send-morning-greeting
--
-- STEP 2: Choose one of these scheduling options:
--
-- OPTION A: Supabase Dashboard (Recommended)
--   1. Go to Supabase Dashboard > Database > Cron Jobs
--   2. Click "New Cron Job"
--   3. Configure:
--      - Name: send-morning-greeting
--      - Schedule: 0 8 * * * (8:00 AM daily in UTC)
--      - SQL Command: See SQL below
--
-- OPTION B: External Cron Service (Works on all plans)
--   Use cron-job.org, EasyCron, or GitHub Actions:
--   - URL: https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-morning-greeting
--   - Method: POST
--   - Headers:
--     Authorization: Bearer YOUR_SERVICE_ROLE_KEY
--     Content-Type: application/json
--   - Schedule: Daily at 8:00 AM (adjust timezone as needed)
--
-- OPTION C: pg_cron with pg_net (Pro plan required)
--   If you have pg_net extension available, you can use:
--   See the commented SQL below for pg_cron setup
--

-- ============================================
-- SQL FOR SUPABASE DASHBOARD CRON JOB
-- ============================================
-- Copy and paste this into Supabase Dashboard > Database > Cron Jobs
-- Replace YOUR_PROJECT_REF and YOUR_SERVICE_ROLE_KEY with your actual values
--
-- SELECT net.http_post(
--   url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-morning-greeting',
--   headers := jsonb_build_object(
--     'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY',
--     'Content-Type', 'application/json'
--   ),
--   body := '{}'::jsonb
-- );
--

-- ============================================
-- ALTERNATIVE: pg_cron Setup (If available)
-- ============================================
-- Uncomment and configure if you have pg_cron and pg_net extensions

/*
-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Function to call the edge function via HTTP
CREATE OR REPLACE FUNCTION call_morning_greeting_edge_function()
RETURNS void AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-morning-greeting',
    headers := jsonb_build_object(
      'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  
  RAISE NOTICE 'Morning greeting function called at %', NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Schedule the function to run daily at 8:00 AM UTC
-- Cron format: minute hour day month weekday
-- '0 8 * * *' means: 0 minutes, 8 hours (8:00 AM), every day
SELECT cron.schedule(
  'send-morning-greeting',              -- Job name
  '0 8 * * *',                         -- Cron schedule: daily at 8:00 AM UTC
  $$SELECT call_morning_greeting_edge_function()$$ -- SQL to execute
);
*/

-- ============================================
-- ALTERNATIVE SETUP (If pg_net/pg_cron not available)
-- ============================================
-- If the above doesn't work, use one of these options:
--
-- OPTION 1: Supabase Dashboard Cron Jobs
--   1. Deploy the edge function: supabase functions deploy send-morning-greeting
--   2. Go to Supabase Dashboard > Database > Cron Jobs
--   3. Create a new cron job:
--      - Name: send-morning-greeting
--      - Schedule: 0 8 * * * (8:00 AM daily)
--      - SQL: SELECT net.http_post(
--               url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-morning-greeting',
--               headers := '{"Authorization": "Bearer YOUR_SERVICE_ROLE_KEY", "Content-Type": "application/json"}'::jsonb,
--               body := '{}'::jsonb
--             );
--
-- OPTION 2: External Cron Service (Recommended for free tier)
--   Use a service like cron-job.org, EasyCron, or GitHub Actions:
--   - URL: https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-morning-greeting
--   - Method: POST
--   - Headers: 
--     Authorization: Bearer YOUR_SERVICE_ROLE_KEY
--     Content-Type: application/json
--   - Schedule: Daily at 8:00 AM (your timezone)
--
-- OPTION 3: Manual Testing
--   To manually trigger the function:
--   curl -X POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-morning-greeting \
--     -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
--     -H "Content-Type: application/json"

-- Note: To check if the function is scheduled, query:
-- SELECT * FROM cron.job WHERE jobname = 'send-morning-greeting';

-- Note: To manually run the function:
-- SELECT call_morning_greeting_function();

-- Note: To unschedule the job:
-- SELECT cron.unschedule('send-morning-greeting');
