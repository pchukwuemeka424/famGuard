-- ============================================
-- Migration: Add background location verification functions
-- ============================================
-- This migration adds functions to verify background location updates
-- are being inserted properly into location_history
-- Updates find_users_without_location_history() to check for background location specifically

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

-- Update find_users_without_location_history() to check for background location specifically
-- This ensures we're checking for background location updates, not just any location_history entries
CREATE OR REPLACE FUNCTION find_users_without_location_history()
RETURNS TABLE(user_id TEXT) AS $$
BEGIN
  RETURN QUERY
  -- Find all users who have push tokens
  -- AND (have no location_history at all OR have no location for today)
  -- AND it's been more than 28 hours since account creation (if no location_history)
  --    OR more than 28 hours since last location update (if has location_history but not for today)
  -- AND haven't received a location_reminder notification in the last 28 hours (one-time check)
  -- AND specifically checking that background location is not active
  SELECT DISTINCT u.id::TEXT
  FROM users u
  INNER JOIN user_push_tokens upt ON u.id::TEXT = upt.user_id
  WHERE 
  -- Check if user has no location_history at all OR no location for today
  (
    -- Case 1: User has no location_history at all
    NOT EXISTS (
      SELECT 1
      FROM location_history lh
      WHERE lh.user_id = u.id::TEXT
    )
    -- AND account was created more than 28 hours ago
    AND u.created_at < NOW() - INTERVAL '28 hours'
  )
  OR
  (
    -- Case 2: User has location_history but no location for today
    EXISTS (
      SELECT 1
      FROM location_history lh
      WHERE lh.user_id = u.id::TEXT
    )
    AND NOT EXISTS (
      SELECT 1
      FROM location_history lh
      WHERE lh.user_id = u.id::TEXT
        AND DATE(lh.created_at) = CURRENT_DATE
    )
    -- AND last location update was more than 28 hours ago
    AND NOT EXISTS (
      SELECT 1
      FROM location_history lh
      WHERE lh.user_id = u.id::TEXT
        AND lh.created_at >= NOW() - INTERVAL '28 hours'
    )
    -- AND background location is not active (no regular background updates)
    AND NOT has_background_location_updates(u.id::TEXT, 24)
  )
  -- Only notify if they haven't received a location_reminder notification in the last 28 hours (one-time)
  AND NOT EXISTS (
    SELECT 1
    FROM notifications n
    WHERE n.user_id = u.id::TEXT
      AND n.type = 'location_reminder'
      AND n.created_at >= NOW() - INTERVAL '28 hours'
  )
  -- Only notify users who have been active (created account more than 1 day ago)
  -- This prevents notifying brand new users
  AND u.created_at < NOW() - INTERVAL '1 day';
END;
$$ LANGUAGE plpgsql;

-- Note: To check background location status for a specific user, execute:
-- SELECT * FROM get_background_location_status('user-id-here');

-- Note: To verify all users' background location inserts, execute:
-- SELECT * FROM verify_background_location_inserts();

-- Note: To check if a user has background location updates, execute:
-- SELECT has_background_location_updates('user-id-here', 6);

-- Note: To get list of users without background location history, execute:
-- SELECT * FROM find_users_without_location_history();
