-- ============================================
-- Migration: Auto-delete incidents older than 3 hours
-- ============================================
-- This migration sets up automatic deletion of incidents
-- that are older than 3 hours using pg_cron
--
-- NOTE: pg_cron requires Supabase Pro plan or self-hosted PostgreSQL
-- If you're on the free tier, use the Edge Function alternative:
-- See: supabase/functions/cleanup-expired-incidents/index.ts
-- Deploy it and schedule it via Supabase Dashboard > Database > Cron Jobs
-- Or use an external cron service to call the function every hour

-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Function: Delete incidents older than 3 hours
CREATE OR REPLACE FUNCTION cleanup_expired_incidents()
RETURNS void AS $$
BEGIN
  DELETE FROM incidents
  WHERE created_at < NOW() - INTERVAL '3 hours';
  
  -- Log the cleanup (optional, can be removed if not needed)
  RAISE NOTICE 'Cleaned up incidents older than 3 hours at %', NOW();
END;
$$ LANGUAGE plpgsql;

-- Schedule the cleanup function to run every hour
-- This ensures incidents are deleted within 3-4 hours of creation
SELECT cron.schedule(
  'cleanup-expired-incidents',           -- Job name
  '0 * * * *',                          -- Cron schedule: every hour at minute 0
  $$SELECT cleanup_expired_incidents()$$ -- SQL to execute
);

-- Note: To manually run the cleanup function, execute:
-- SELECT cleanup_expired_incidents();

-- Note: To unschedule the job, execute:
-- SELECT cron.unschedule('cleanup-expired-incidents');

