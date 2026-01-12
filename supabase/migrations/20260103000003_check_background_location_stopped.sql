-- ============================================
-- Migration: Check for users with stopped background location updates
-- ============================================
-- This migration sets up checking for users whose background location
-- has stopped updating/inserting in the past 4 hours in location_history
-- Sends a one-time push notification reminder

-- Function: Find users with no background location updates in the last 4 hours
-- Only returns users who haven't received a notification in the last 4 hours (one-time)
-- Returns array of user_ids that need to be notified
CREATE OR REPLACE FUNCTION find_users_with_stopped_background_location()
RETURNS TABLE(user_id TEXT) AS $$
BEGIN
  RETURN QUERY
  -- Find users who have push tokens but no location history in last 4 hours
  -- AND haven't received a location_reminder notification in the last 4 hours (one-time check)
  SELECT DISTINCT u.id::TEXT
  FROM users u
  INNER JOIN user_push_tokens upt ON u.id::TEXT = upt.user_id
  WHERE NOT EXISTS (
    SELECT 1
    FROM location_history lh
    WHERE lh.user_id = u.id::TEXT
      AND lh.created_at >= NOW() - INTERVAL '4 hours'
  )
  -- Only notify if they haven't received a location_reminder notification in the last 4 hours
  AND NOT EXISTS (
    SELECT 1
    FROM notifications n
    WHERE n.user_id = u.id::TEXT
      AND n.type = 'location_reminder'
      AND n.created_at >= NOW() - INTERVAL '4 hours'
  )
  -- Only notify users who have been active (created account more than 1 day ago)
  AND u.created_at < NOW() - INTERVAL '1 day';
END;
$$ LANGUAGE plpgsql;

-- Function: Check and notify users with stopped background location
CREATE OR REPLACE FUNCTION check_background_location_stopped_and_notify()
RETURNS void AS $$
DECLARE
  users_to_notify TEXT[];
  user_count INTEGER;
BEGIN
  -- Get list of users with stopped background location
  SELECT ARRAY_AGG(user_id) INTO users_to_notify
  FROM find_users_with_stopped_background_location();
  
  -- Count users
  user_count := COALESCE(array_length(users_to_notify, 1), 0);
  
  IF user_count > 0 THEN
    RAISE NOTICE 'Found % users with stopped background location in last 4 hours', user_count;
    RAISE NOTICE 'User IDs: %', array_to_string(users_to_notify, ', ');
    -- Note: Actual push notification sending will be done by the edge function
    -- This function just identifies the users
  ELSE
    RAISE NOTICE 'All users have background location updates in the last 4 hours';
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Note: To manually run the check function, execute:
-- SELECT check_background_location_stopped_and_notify();

-- Note: To get list of users with stopped background location, execute:
-- SELECT * FROM find_users_with_stopped_background_location();
