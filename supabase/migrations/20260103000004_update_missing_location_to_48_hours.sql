-- ============================================
-- Migration: Update missing location check to 48 hours
-- ============================================
-- Updates find_users_without_location_history() to check for users
-- without location updates in the last 48 hours (instead of 6 hours)
-- and sends push notifications

-- Function: Find users with no location history in the last 48 hours
-- Returns array of user_ids that need to be notified
CREATE OR REPLACE FUNCTION find_users_without_location_history()
RETURNS TABLE(user_id TEXT) AS $$
BEGIN
  RETURN QUERY
  -- Find all users who have push tokens but no location history in last 48 hours
  SELECT DISTINCT u.id::TEXT
  FROM users u
  INNER JOIN user_push_tokens upt ON u.id::TEXT = upt.user_id
  WHERE NOT EXISTS (
    SELECT 1
    FROM location_history lh
    WHERE lh.user_id = u.id::TEXT
      AND lh.created_at >= NOW() - INTERVAL '48 hours'
  )
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
    RAISE NOTICE 'Found % users without location history in last 48 hours', user_count;
    RAISE NOTICE 'User IDs: %', array_to_string(users_to_notify, ', ');
    -- Note: Actual push notification sending will be done by the edge function
    -- This function just identifies the users
  ELSE
    RAISE NOTICE 'All users have location history in the last 48 hours';
  END IF;
END;
$$ LANGUAGE plpgsql;
