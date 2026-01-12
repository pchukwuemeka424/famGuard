-- ============================================
-- Migration: Check for users with no location history
-- ============================================
-- This migration sets up automatic checking for users with no location history
-- and sends polite push notifications asking "Are you safe?"
-- Checks for users without location updates in the last 6 hours
--
-- NOTE: pg_cron requires Supabase Pro plan or self-hosted PostgreSQL
-- If you're on the free tier, use the Edge Function alternative:
-- See: supabase/functions/check-missing-location/index.ts
-- Deploy it and schedule it via Supabase Dashboard > Database > Cron Jobs

-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Function: Check if user has background location updates
-- Background location typically inserts at regular intervals (every 30-120 minutes)
-- This function checks if user has location_history entries from background updates
CREATE OR REPLACE FUNCTION has_background_location_updates(p_user_id TEXT, p_hours INTEGER DEFAULT 6)
RETURNS BOOLEAN AS $$
DECLARE
  location_count INTEGER;
  time_span INTERVAL;
  avg_interval_minutes NUMERIC;
BEGIN
  -- Count location_history entries in the specified time period
  SELECT COUNT(*), 
         EXTRACT(EPOCH FROM (MAX(created_at) - MIN(created_at))) / 60.0
  INTO location_count, avg_interval_minutes
  FROM location_history
  WHERE user_id = p_user_id
    AND created_at >= NOW() - (p_hours || ' hours')::INTERVAL;
  
  -- If no entries, background location is not working
  IF location_count = 0 THEN
    RETURN FALSE;
  END IF;
  
  -- If only one entry, can't determine pattern but at least one update exists
  IF location_count = 1 THEN
    RETURN TRUE;
  END IF;
  
  -- Check if entries are coming at regular intervals (background pattern)
  -- Background location typically has entries every 30-120 minutes
  -- If average interval is reasonable (between 15-180 minutes), it's likely background
  IF avg_interval_minutes BETWEEN 15 AND 180 THEN
    RETURN TRUE;
  END IF;
  
  -- If entries exist but pattern doesn't match background, still return true
  -- (might be manual updates or different frequency setting)
  RETURN location_count > 0;
END;
$$ LANGUAGE plpgsql;

-- Function: Get background location status for a user
-- Returns information about background location updates
CREATE OR REPLACE FUNCTION get_background_location_status(p_user_id TEXT)
RETURNS TABLE(
  has_updates BOOLEAN,
  entry_count INTEGER,
  last_update TIMESTAMP WITH TIME ZONE,
  hours_since_last_update NUMERIC,
  avg_interval_minutes NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*) > 0 as has_updates,
    COUNT(*)::INTEGER as entry_count,
    MAX(lh.created_at) as last_update,
    EXTRACT(EPOCH FROM (NOW() - MAX(lh.created_at))) / 3600.0 as hours_since_last_update,
    CASE 
      WHEN COUNT(*) > 1 THEN 
        EXTRACT(EPOCH FROM (MAX(lh.created_at) - MIN(lh.created_at))) / 60.0 / NULLIF(COUNT(*) - 1, 0)
      ELSE NULL
    END as avg_interval_minutes
  FROM location_history lh
  WHERE lh.user_id = p_user_id
    AND lh.created_at >= NOW() - INTERVAL '24 hours';
END;
$$ LANGUAGE plpgsql;

-- Function: Find users with no location history in the last 6 hours
-- Specifically checks for background location updates
-- Returns array of user_ids that need to be notified
CREATE OR REPLACE FUNCTION find_users_without_location_history()
RETURNS TABLE(user_id TEXT) AS $$
BEGIN
  RETURN QUERY
  -- Find all users who have push tokens but no location history in last 6 hours
  -- Specifically checking for background location updates
  SELECT DISTINCT u.id::TEXT
  FROM users u
  INNER JOIN user_push_tokens upt ON u.id::TEXT = upt.user_id
  WHERE 
    -- Check if user has background location updates in last 6 hours
    NOT has_background_location_updates(u.id::TEXT, 6)
    -- Only notify users who have been active (created account more than 1 day ago)
    -- This prevents notifying brand new users
    AND u.created_at < NOW() - INTERVAL '1 day';
END;
$$ LANGUAGE plpgsql;

-- Function: Check and notify users with missing location history
-- This function will be called by the edge function or cron job
CREATE OR REPLACE FUNCTION check_missing_location_and_notify()
RETURNS void AS $$
DECLARE
  users_to_notify TEXT[];
  user_count INTEGER;
BEGIN
  -- Get list of users without location history
  SELECT ARRAY_AGG(user_id) INTO users_to_notify
  FROM find_users_without_location_history();
  
  -- Count users
  user_count := COALESCE(array_length(users_to_notify, 1), 0);
  
  IF user_count > 0 THEN
    RAISE NOTICE 'Found % users without location history in last 6 hours', user_count;
    RAISE NOTICE 'User IDs: %', array_to_string(users_to_notify, ', ');
    -- Note: Actual push notification sending will be done by the edge function
    -- This function just identifies the users
  ELSE
    RAISE NOTICE 'All users have location history in the last 6 hours';
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Note: pg_cron cannot call HTTP endpoints directly
-- To schedule automatic checks, use one of these options:
--
-- OPTION 1: Schedule the Edge Function via Supabase Dashboard
--   1. Deploy the edge function: supabase functions deploy check-missing-location
--   2. Go to Supabase Dashboard > Database > Cron Jobs
--   3. Create a new cron job that calls the edge function every 12 hours
--   4. Use schedule: 0 8,20 * * * (8:00 AM and 8:00 PM daily)
--
-- OPTION 2: Use external cron service (e.g., cron-job.org, EasyCron)
--   - Call: https://YOUR_PROJECT.supabase.co/functions/v1/check-missing-location
--   - Method: POST
--   - Headers: Authorization: Bearer YOUR_SERVICE_ROLE_KEY
--   - Schedule: Every 12 hours
--
-- OPTION 3: Use pg_net extension (if available on your plan)
--   See alternative migration file for HTTP-based cron job

-- Function: Verify background location is inserting properly
-- This function can be used to check if background location updates are being inserted
CREATE OR REPLACE FUNCTION verify_background_location_inserts()
RETURNS TABLE(
  user_id TEXT,
  has_background_updates BOOLEAN,
  entry_count_24h INTEGER,
  last_update TIMESTAMP WITH TIME ZONE,
  hours_since_last_update NUMERIC,
  status TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    u.id::TEXT as user_id,
    has_background_location_updates(u.id::TEXT, 24) as has_background_updates,
    (SELECT COUNT(*)::INTEGER 
     FROM location_history lh 
     WHERE lh.user_id = u.id::TEXT 
       AND lh.created_at >= NOW() - INTERVAL '24 hours') as entry_count_24h,
    (SELECT MAX(created_at) 
     FROM location_history lh 
     WHERE lh.user_id = u.id::TEXT) as last_update,
    (SELECT EXTRACT(EPOCH FROM (NOW() - MAX(created_at))) / 3600.0 
     FROM location_history lh 
     WHERE lh.user_id = u.id::TEXT) as hours_since_last_update,
    CASE 
      WHEN NOT EXISTS (SELECT 1 FROM location_history lh WHERE lh.user_id = u.id::TEXT) THEN 'No location history'
      WHEN NOT has_background_location_updates(u.id::TEXT, 24) THEN 'Background location not active'
      ELSE 'Background location active'
    END as status
  FROM users u
  INNER JOIN user_push_tokens upt ON u.id::TEXT = upt.user_id
  WHERE u.created_at < NOW() - INTERVAL '1 day'
  ORDER BY hours_since_last_update DESC NULLS LAST;
END;
$$ LANGUAGE plpgsql;

-- Note: To manually run the check function, execute:
-- SELECT check_missing_location_and_notify();

-- Note: To get list of users without location history, execute:
-- SELECT * FROM find_users_without_location_history();

-- Note: To check background location status for a specific user, execute:
-- SELECT * FROM get_background_location_status('user-id-here');

-- Note: To verify all users' background location inserts, execute:
-- SELECT * FROM verify_background_location_inserts();

-- Note: To check if a user has background location updates, execute:
-- SELECT has_background_location_updates('user-id-here', 6);

-- Note: To check scheduled jobs, execute:
-- SELECT * FROM cron.job WHERE jobname = 'check-missing-location';

-- Note: To unschedule the job, execute:
-- SELECT cron.unschedule('check-missing-location');
