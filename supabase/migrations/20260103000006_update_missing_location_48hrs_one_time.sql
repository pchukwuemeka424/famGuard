-- ============================================
-- Migration: Update missing location check to 28 hours (one-time notification)
-- ============================================
-- Updates find_users_without_location_history() to check for users
-- with no location_history at all OR no location_history for today
-- Sends a one-time push notification after 28 hours (won't send if notification already sent in last 28 hours)

-- Function: Find users with no location history OR no location for today
-- Only returns users who haven't received a notification in the last 28 hours (one-time)
-- Returns array of user_ids that need to be notified
CREATE OR REPLACE FUNCTION find_users_without_location_history()
RETURNS TABLE(user_id TEXT) AS $$
BEGIN
  RETURN QUERY
  -- Find all users who have push tokens
  -- AND (have no location_history at all OR have no location for today)
  -- AND it's been more than 28 hours since account creation (if no location_history)
  --    OR more than 28 hours since last location update (if has location_history but not for today)
  -- AND haven't received a location_reminder notification in the last 28 hours (one-time check)
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
    RAISE NOTICE 'Found % users with no location_history OR no location for today (after 28 hours, one-time notification)', user_count;
    RAISE NOTICE 'User IDs: %', array_to_string(users_to_notify, ', ');
    -- Note: Actual push notification sending will be done by the edge function
    -- This function just identifies the users
  ELSE
    RAISE NOTICE 'All users have location_history and location for today, or already received notification in last 28 hours';
  END IF;
END;
$$ LANGUAGE plpgsql;
