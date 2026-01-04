-- ============================================
-- Migration: Create Incident Proximity Notifications Table
-- Tracks which users have been notified about which incidents
-- to prevent duplicate notifications
-- ============================================

-- Create table to track incident proximity notifications
CREATE TABLE IF NOT EXISTS incident_proximity_notifications (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id TEXT NOT NULL,
  incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  distance_km DOUBLE PRECISION NOT NULL,
  notified_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, incident_id) -- Ensure one notification per user per incident
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_incident_proximity_notifications_user_id 
  ON incident_proximity_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_incident_proximity_notifications_incident_id 
  ON incident_proximity_notifications(incident_id);
CREATE INDEX IF NOT EXISTS idx_incident_proximity_notifications_notified_at 
  ON incident_proximity_notifications(notified_at DESC);

-- Enable RLS
ALTER TABLE incident_proximity_notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies - Allow all operations for authenticated users
DROP POLICY IF EXISTS "Allow all select" ON incident_proximity_notifications;
DROP POLICY IF EXISTS "Allow all insert" ON incident_proximity_notifications;
DROP POLICY IF EXISTS "Allow all update" ON incident_proximity_notifications;
DROP POLICY IF EXISTS "Allow all delete" ON incident_proximity_notifications;

CREATE POLICY "Allow all select"
  ON incident_proximity_notifications FOR SELECT
  USING (true);

CREATE POLICY "Allow all insert"
  ON incident_proximity_notifications FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow all update"
  ON incident_proximity_notifications FOR UPDATE
  USING (true);

CREATE POLICY "Allow all delete"
  ON incident_proximity_notifications FOR DELETE
  USING (true);

-- Grant permissions
GRANT ALL ON incident_proximity_notifications TO authenticated;
GRANT ALL ON incident_proximity_notifications TO service_role;

-- Function: Check if user has already been notified about an incident
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
  );
END;
$$ LANGUAGE plpgsql;

-- Function: Get users within proximity of incidents (45min-1hr travel time)
-- Uses distance as proxy: 5-10km for urban areas (assuming 30-60km/h average speed)
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
    SELECT 
      lh.user_id,
      lh.latitude,
      lh.longitude
    FROM location_history lh
    WHERE lh.latitude IS NOT NULL 
      AND lh.longitude IS NOT NULL
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
  ORDER BY ri.created_at DESC, distance_km ASC;
END;
$$ LANGUAGE plpgsql;

