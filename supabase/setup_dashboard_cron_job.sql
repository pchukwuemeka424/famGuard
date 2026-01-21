-- ============================================
-- SQL for Supabase Dashboard Cron Job
-- ============================================
-- Copy and paste this into:
-- Supabase Dashboard > Database > Cron Jobs > New Cron Job
--
-- Configuration:
--   Name: send-morning-greeting
--   Schedule: 0 8 * * * (8:00 AM UTC daily)
--   SQL: (paste the SQL below)

SELECT net.http_post(
  url := 'https://bbydsaxduuwbnwqmiant.supabase.co/functions/v1/send-morning-greeting',
  headers := jsonb_build_object(
    'apikey', (SELECT value FROM app_config WHERE key = 'supabase_service_role_key'),
    'Authorization', 'Bearer ' || (SELECT value FROM app_config WHERE key = 'supabase_service_role_key'),
    'Content-Type', 'application/json'
  ),
  body := '{}'::jsonb,
  timeout_milliseconds := 60000
);

-- This will directly call the edge function via HTTP
-- The Dashboard cron jobs are more reliable than pg_cron with async HTTP
