-- ============================================
-- Migration: Auto-cleanup location_history
-- ============================================
-- This migration sets up automatic cleanup of location_history:
-- - Deletes all entries older than 24 hours
-- - Each day starts with a fresh entry (no retention of yesterday's data)
--
-- NOTE: pg_cron requires Supabase Pro plan or self-hosted PostgreSQL
-- If you're on the free tier, use the Edge Function alternative:
-- See: supabase/functions/cleanup-location-history/index.ts
-- Deploy it and schedule it via Supabase Dashboard > Database > Cron Jobs
-- Or use an external cron service to call the function daily

-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Function: Cleanup location_history
-- - Deletes all entries older than 24 hours
-- - Each day starts fresh with no retention of previous day's data
CREATE OR REPLACE FUNCTION cleanup_location_history()
RETURNS void AS $$
DECLARE
  deleted_count INTEGER := 0;
  twenty_four_hours_ago TIMESTAMP WITH TIME ZONE;
BEGIN
  -- Calculate time boundary: 24 hours ago
  twenty_four_hours_ago := NOW() - INTERVAL '24 hours';

  -- Delete all entries older than 24 hours
  DELETE FROM location_history
  WHERE created_at < twenty_four_hours_ago;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'Deleted % entries older than 24 hours', deleted_count;
  RAISE NOTICE 'Location history cleanup completed at %', NOW();
END;
$$ LANGUAGE plpgsql;

-- Schedule the cleanup function to run daily at 2:00 AM
-- This ensures cleanup happens after the day has fully passed
SELECT cron.schedule(
  'cleanup-location-history',           -- Job name
  '0 2 * * *',                         -- Cron schedule: daily at 2:00 AM
  $$SELECT cleanup_location_history()$$ -- SQL to execute
);

-- Note: To manually run the cleanup function, execute:
-- SELECT cleanup_location_history();

-- Note: To check scheduled jobs, execute:
-- SELECT * FROM cron.job WHERE jobname = 'cleanup-location-history';

-- Note: To unschedule the job, execute:
-- SELECT cron.unschedule('cleanup-location-history');
