-- ============================================
-- Migration: One notification per day for proximity alerts
-- Ensures users only receive one push notification per day
-- even if they re-enter the same proximity area
-- ============================================

-- Update the function to check if user has been notified TODAY
CREATE OR REPLACE FUNCTION has_been_notified_about_incident(
  p_user_id TEXT,
  p_incident_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM incident_proximity_notifications 
    WHERE user_id = p_user_id 
      AND incident_id = p_incident_id
      AND DATE(notified_at) = CURRENT_DATE
  );
END;
$$ LANGUAGE plpgsql;

-- New function: Check if user has been notified about ANY incident today
-- This prevents multiple notifications per day even for different incidents
CREATE OR REPLACE FUNCTION has_been_notified_today(
  p_user_id TEXT
)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM incident_proximity_notifications 
    WHERE user_id = p_user_id 
      AND DATE(notified_at) = CURRENT_DATE
  );
END;
$$ LANGUAGE plpgsql;

-- Update get_users_near_incidents to also check if user was notified today
CREATE OR REPLACE FUNCTION get_users_near_incidents(
  p_min_distance_km DOUBLE PRECISION DEFAULT 0,
  p_max_distance_km DOUBLE PRECISION DEFAULT 10,
  p_max_hours_ago INTEGER DEFAULT 1
)
RETURNS TABLE (
  user_id TEXT,
  incident_id UUID,
  incident_title TEXT,
  incident_category TEXT,
  incident_location_lat DOUBLE PRECISION,
  incident_location_lon DOUBLE PRECISION,
  user_location_lat DOUBLE PRECISION,
  user_location_lon DOUBLE PRECISION,
  distance_km DOUBLE PRECISION,
  incident_created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  WITH recent_incidents AS (
    SELECT 
      i.id,
      i.title,
      i.category,
      i.location_latitude,
      i.location_longitude,
      i.created_at
    FROM incidents i
    WHERE i.created_at >= NOW() - (p_max_hours_ago || ' hours')::INTERVAL
  ),
  user_locations AS (
    SELECT DISTINCT ON (lh.user_id)
      lh.user_id,
      lh.latitude,
      lh.longitude
    FROM location_history lh
    WHERE lh.latitude IS NOT NULL 
      AND lh.longitude IS NOT NULL
    ORDER BY lh.user_id, lh.created_at DESC
  )
  SELECT 
    ul.user_id,
    ri.id AS incident_id,
    ri.title AS incident_title,
    ri.category AS incident_category,
    ri.location_latitude AS incident_location_lat,
    ri.location_longitude AS incident_location_lon,
    ul.latitude AS user_location_lat,
    ul.longitude AS user_location_lon,
    calculate_distance(
      ul.latitude,
      ul.longitude,
      ri.location_latitude,
      ri.location_longitude
    ) AS distance_km,
    ri.created_at AS incident_created_at
  FROM user_locations ul
  CROSS JOIN recent_incidents ri
  WHERE calculate_distance(
    ul.latitude,
    ul.longitude,
    ri.location_latitude,
    ri.location_longitude
  ) BETWEEN p_min_distance_km AND p_max_distance_km
    AND NOT has_been_notified_about_incident(ul.user_id, ri.id)
    AND NOT has_been_notified_today(ul.user_id) -- Prevent multiple notifications per day
  ORDER BY ri.created_at DESC, distance_km ASC;
END;
$$ LANGUAGE plpgsql;

