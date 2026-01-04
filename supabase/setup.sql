-- ============================================
-- FamGuard Database Setup Script
-- Complete consolidated schema
-- Run this in your Supabase SQL Editor
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- HELPER FUNCTION: Update updated_at timestamps
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 1. USERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  photo TEXT,
  password TEXT,
  blood_group TEXT,
  emergency_notes TEXT,
  is_group_admin BOOLEAN DEFAULT false,
  is_locked BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS idx_users_is_locked ON users(is_locked);

-- Add update trigger for updated_at
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 2. CONNECTIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS connections (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id TEXT NOT NULL,
  connected_user_id TEXT NOT NULL,
  connected_user_name TEXT NOT NULL,
  connected_user_email TEXT,
  connected_user_phone TEXT,
  connected_user_photo TEXT,
  status TEXT DEFAULT 'connected' CHECK (status IN ('connected', 'blocked')),
  location_latitude DOUBLE PRECISION,
  location_longitude DOUBLE PRECISION,
  location_address TEXT,
  location_updated_at TIMESTAMP WITH TIME ZONE,
  battery_level INTEGER DEFAULT 100,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, connected_user_id)
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_connections_user_id ON connections(user_id);
CREATE INDEX IF NOT EXISTS idx_connections_connected_user_id ON connections(connected_user_id);
CREATE INDEX IF NOT EXISTS idx_connections_status ON connections(status);
CREATE INDEX IF NOT EXISTS idx_connections_location ON connections(location_latitude, location_longitude) 
WHERE location_latitude IS NOT NULL AND location_longitude IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_connections_location_updated ON connections(location_updated_at) 
WHERE location_updated_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_connections_battery_level ON connections(battery_level) 
WHERE battery_level IS NOT NULL;

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS update_connections_updated_at ON connections;
CREATE TRIGGER update_connections_updated_at
  BEFORE UPDATE ON connections
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function: Auto-create bidirectional connection
CREATE OR REPLACE FUNCTION create_bidirectional_connection()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO connections (
    user_id,
    connected_user_id,
    connected_user_name,
    connected_user_email,
    connected_user_phone,
    connected_user_photo,
    status
  )
  SELECT
    NEW.connected_user_id,
    NEW.user_id,
    u.name,
    u.email,
    u.phone,
    u.photo,
    'connected'
  FROM users u
  WHERE u.id = NEW.user_id
  AND NOT EXISTS (
    SELECT 1 FROM connections
    WHERE user_id = NEW.connected_user_id
    AND connected_user_id = NEW.user_id
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-create bidirectional connection
DROP TRIGGER IF EXISTS trigger_bidirectional_connection ON connections;
CREATE TRIGGER trigger_bidirectional_connection
  AFTER INSERT ON connections
  FOR EACH ROW
  EXECUTE FUNCTION create_bidirectional_connection();

-- ============================================
-- 3. CONNECTION CODES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS connection_codes (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  is_used BOOLEAN DEFAULT false,
  used_by_user_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_connection_codes_user_id ON connection_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_connection_codes_code ON connection_codes(code);
CREATE INDEX IF NOT EXISTS idx_connection_codes_expires_at ON connection_codes(expires_at);
CREATE INDEX IF NOT EXISTS idx_connection_codes_is_used ON connection_codes(is_used);

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS update_connection_codes_updated_at ON connection_codes;
CREATE TRIGGER update_connection_codes_updated_at
  BEFORE UPDATE ON connection_codes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function: Clean up expired codes
CREATE OR REPLACE FUNCTION cleanup_expired_connection_codes()
RETURNS void AS $$
BEGIN
  DELETE FROM connection_codes
  WHERE expires_at < NOW() - INTERVAL '1 day';
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 4. NOTIFICATIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS notifications (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('sos_alert', 'connection_added', 'location_updated', 'incident', 'check_in', 'check_in_emergency', 'check_in_unsafe', 'missed_check_in', 'travel_advisory', 'route_risk', 'general')),
  data JSONB DEFAULT '{}'::jsonb,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, read);
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(user_id, created_at DESC);

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS update_notifications_updated_at ON notifications;
CREATE TRIGGER update_notifications_updated_at
  BEFORE UPDATE ON notifications
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function: Auto-cleanup old notifications
CREATE OR REPLACE FUNCTION cleanup_old_notifications()
RETURNS void AS $$
BEGIN
  DELETE FROM notifications
  WHERE created_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 5. LOCATION HISTORY TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS location_history (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  address TEXT,
  accuracy DOUBLE PRECISION,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_location_history_user_id ON location_history(user_id);
CREATE INDEX IF NOT EXISTS idx_location_history_created_at ON location_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_location_history_user_created ON location_history(user_id, created_at DESC);

-- ============================================
-- 6. INCIDENTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS incidents (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('Robbery', 'Kidnapping', 'Accident', 'Fire', 'Protest', 'Assault', 'Theft', 'Other')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  location_latitude DOUBLE PRECISION NOT NULL,
  location_longitude DOUBLE PRECISION NOT NULL,
  location_address TEXT,
  reporter_name TEXT NOT NULL,
  reporter_is_anonymous BOOLEAN DEFAULT false,
  upvotes INTEGER DEFAULT 0,
  confirmed BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_incidents_user_id ON incidents(user_id);
CREATE INDEX IF NOT EXISTS idx_incidents_category ON incidents(category);
CREATE INDEX IF NOT EXISTS idx_incidents_created_at ON incidents(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_location_lat ON incidents(location_latitude);
CREATE INDEX IF NOT EXISTS idx_incidents_location_lon ON incidents(location_longitude);
CREATE INDEX IF NOT EXISTS idx_incidents_confirmed ON incidents(confirmed);
CREATE INDEX IF NOT EXISTS idx_incidents_created_confirmed ON incidents(created_at DESC, confirmed);

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS update_incidents_updated_at ON incidents;
CREATE TRIGGER update_incidents_updated_at
  BEFORE UPDATE ON incidents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function: Calculate distance between two points
CREATE OR REPLACE FUNCTION calculate_distance(
  lat1 DOUBLE PRECISION,
  lon1 DOUBLE PRECISION,
  lat2 DOUBLE PRECISION,
  lon2 DOUBLE PRECISION
)
RETURNS DOUBLE PRECISION AS $$
BEGIN
  RETURN (
    6371 * acos(
      cos(radians(lat1)) *
      cos(radians(lat2)) *
      cos(radians(lon2) - radians(lon1)) +
      sin(radians(lat1)) *
      sin(radians(lat2))
    )
  );
END;
$$ LANGUAGE plpgsql;

-- Function: Get nearby incidents
CREATE OR REPLACE FUNCTION get_nearby_incidents(
  user_lat DOUBLE PRECISION,
  user_lon DOUBLE PRECISION,
  max_distance_km DOUBLE PRECISION DEFAULT 5,
  max_hours INTEGER DEFAULT 24
)
RETURNS TABLE (
  id UUID,
  user_id TEXT,
  type TEXT,
  category TEXT,
  title TEXT,
  description TEXT,
  location_latitude DOUBLE PRECISION,
  location_longitude DOUBLE PRECISION,
  location_address TEXT,
  reporter_name TEXT,
  reporter_is_anonymous BOOLEAN,
  upvotes INTEGER,
  confirmed BOOLEAN,
  created_at TIMESTAMP WITH TIME ZONE,
  distance_km DOUBLE PRECISION
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    i.id,
    i.user_id,
    i.type,
    i.category,
    i.title,
    i.description,
    i.location_latitude,
    i.location_longitude,
    i.location_address,
    i.reporter_name,
    i.reporter_is_anonymous,
    i.upvotes,
    i.confirmed,
    i.created_at,
    calculate_distance(user_lat, user_lon, i.location_latitude, i.location_longitude) AS distance_km
  FROM incidents i
  WHERE i.created_at >= NOW() - (max_hours || ' hours')::INTERVAL
    AND calculate_distance(user_lat, user_lon, i.location_latitude, i.location_longitude) <= max_distance_km
  ORDER BY i.created_at DESC;
END;
$$ LANGUAGE plpgsql;

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

-- Enable pg_cron extension for scheduled tasks
-- NOTE: pg_cron requires Supabase Pro plan or self-hosted PostgreSQL
-- If you're on the free tier, use the Edge Function alternative:
-- See: supabase/functions/cleanup-expired-incidents/index.ts
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule the cleanup function to run every hour
-- This ensures incidents are deleted within 3-4 hours of creation
-- If pg_cron is not available, the function can still be called manually
-- or via Edge Function scheduled job
SELECT cron.schedule(
  'cleanup-expired-incidents',           -- Job name
  '0 * * * *',                          -- Cron schedule: every hour at minute 0
  $$SELECT cleanup_expired_incidents()$$ -- SQL to execute
);

-- ============================================
-- 7. USER SETTINGS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS user_settings (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  -- Notification settings
  notifications_enabled BOOLEAN DEFAULT true,
  community_reports_enabled BOOLEAN DEFAULT true,
  -- Location settings
  location_update_frequency_minutes INTEGER DEFAULT 60,
  location_sharing_enabled BOOLEAN DEFAULT false,
  location_accuracy TEXT DEFAULT 'exact',
  -- App settings
  language TEXT DEFAULT 'en',
  region TEXT DEFAULT 'US',
  units TEXT DEFAULT 'metric',
  battery_saving_mode BOOLEAN DEFAULT false,
  battery_saving_reduce_location_updates BOOLEAN DEFAULT false,
  battery_saving_reduce_background_sync BOOLEAN DEFAULT false,
  -- Sleep mode settings
  sleep_mode_enabled BOOLEAN DEFAULT false,
  sleep_mode_start_time TIME,
  sleep_mode_end_time TIME,
  -- Notification filters
  notification_filters JSONB DEFAULT '[]'::jsonb,
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON user_settings(user_id);

-- Add update trigger for updated_at
DROP TRIGGER IF EXISTS update_user_settings_updated_at ON user_settings;
CREATE TRIGGER update_user_settings_updated_at
  BEFORE UPDATE ON user_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 8. APP SETTING TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS app_setting (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  hide_report_incident BOOLEAN DEFAULT false,
  hide_incident BOOLEAN DEFAULT false,
  sos_lock BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add update trigger for updated_at
DROP TRIGGER IF EXISTS update_app_setting_updated_at ON app_setting;
CREATE TRIGGER update_app_setting_updated_at
  BEFORE UPDATE ON app_setting
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 9. FAMILY GROUPS TABLE (Legacy - still used)
-- ============================================
CREATE TABLE IF NOT EXISTS family_groups (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  admin_id TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_family_groups_admin_id ON family_groups(admin_id);
CREATE INDEX IF NOT EXISTS idx_family_groups_code ON family_groups(code);

-- Add update trigger for updated_at
DROP TRIGGER IF EXISTS update_family_groups_updated_at ON family_groups;
CREATE TRIGGER update_family_groups_updated_at
  BEFORE UPDATE ON family_groups
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 10. FAMILY MEMBERS TABLE (Legacy - still used)
-- ============================================
CREATE TABLE IF NOT EXISTS family_members (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  family_group_id UUID NOT NULL REFERENCES family_groups(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  relationship TEXT NOT NULL,
  phone TEXT,
  photo TEXT,
  location_latitude DOUBLE PRECISION,
  location_longitude DOUBLE PRECISION,
  location_address TEXT,
  last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_online BOOLEAN DEFAULT false,
  share_location BOOLEAN DEFAULT true,
  battery_level INTEGER DEFAULT 100,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(family_group_id, user_id)
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_family_members_group_id ON family_members(family_group_id);
CREATE INDEX IF NOT EXISTS idx_family_members_user_id ON family_members(user_id);
CREATE INDEX IF NOT EXISTS idx_family_members_online ON family_members(is_online);

-- Add update trigger for updated_at
DROP TRIGGER IF EXISTS update_family_members_updated_at ON family_members;
CREATE TRIGGER update_family_members_updated_at
  BEFORE UPDATE ON family_members
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 11. USER PUSH TOKENS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS user_push_tokens (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  push_token TEXT NOT NULL,
  platform TEXT NOT NULL,
  device_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_push_tokens_user_id ON user_push_tokens(user_id);

-- Add update trigger for updated_at
DROP TRIGGER IF EXISTS update_user_push_tokens_updated_at ON user_push_tokens;
CREATE TRIGGER update_user_push_tokens_updated_at
  BEFORE UPDATE ON user_push_tokens
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 12. FAMILY MEMBER REQUESTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS family_member_requests (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  family_group_id UUID NOT NULL REFERENCES family_groups(id) ON DELETE CASCADE,
  requester_user_id TEXT NOT NULL,
  requester_name TEXT NOT NULL,
  requester_phone TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_family_member_requests_group_id ON family_member_requests(family_group_id);
CREATE INDEX IF NOT EXISTS idx_family_member_requests_status ON family_member_requests(status);

-- Add update trigger for updated_at
DROP TRIGGER IF EXISTS update_family_member_requests_updated_at ON family_member_requests;
CREATE TRIGGER update_family_member_requests_updated_at
  BEFORE UPDATE ON family_member_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE connection_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE location_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_setting ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_push_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_member_requests ENABLE ROW LEVEL SECURITY;

-- USERS POLICIES
DROP POLICY IF EXISTS "Users can read their own profile" ON users;
DROP POLICY IF EXISTS "Users can update their own profile" ON users;
DROP POLICY IF EXISTS "Users can insert their own profile" ON users;

CREATE POLICY "Users can read their own profile"
  ON users FOR SELECT
  USING (true);

CREATE POLICY "Users can update their own profile"
  ON users FOR UPDATE
  USING (true);

CREATE POLICY "Users can insert their own profile"
  ON users FOR INSERT
  WITH CHECK (true);

-- CONNECTIONS POLICIES
DROP POLICY IF EXISTS "Users can read their own connections" ON connections;
DROP POLICY IF EXISTS "Users can create connections" ON connections;
DROP POLICY IF EXISTS "Users can update their own connections" ON connections;
DROP POLICY IF EXISTS "Users can delete their own connections" ON connections;

CREATE POLICY "Users can read their own connections"
  ON connections FOR SELECT
  USING (true);

CREATE POLICY "Users can create connections"
  ON connections FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can update their own connections"
  ON connections FOR UPDATE
  USING (true);

CREATE POLICY "Users can delete their own connections"
  ON connections FOR DELETE
  USING (true);

-- CONNECTION CODES POLICIES
DROP POLICY IF EXISTS "Users can read their own codes" ON connection_codes;
DROP POLICY IF EXISTS "Users can create codes" ON connection_codes;
DROP POLICY IF EXISTS "Users can read active codes" ON connection_codes;
DROP POLICY IF EXISTS "Users can update codes" ON connection_codes;

CREATE POLICY "Users can read their own codes"
  ON connection_codes FOR SELECT
  USING (true);

CREATE POLICY "Users can create codes"
  ON connection_codes FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can read active codes"
  ON connection_codes FOR SELECT
  USING (expires_at > NOW() AND is_used = false);

CREATE POLICY "Users can update codes"
  ON connection_codes FOR UPDATE
  USING (true);

-- NOTIFICATIONS POLICIES
DROP POLICY IF EXISTS "Users can read their own notifications" ON notifications;
DROP POLICY IF EXISTS "Users can create notifications" ON notifications;
DROP POLICY IF EXISTS "Users can update their own notifications" ON notifications;
DROP POLICY IF EXISTS "Users can delete their own notifications" ON notifications;

CREATE POLICY "Users can read their own notifications"
  ON notifications FOR SELECT
  USING (true);

CREATE POLICY "Users can create notifications"
  ON notifications FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can update their own notifications"
  ON notifications FOR UPDATE
  USING (true);

CREATE POLICY "Users can delete their own notifications"
  ON notifications FOR DELETE
  USING (true);

-- LOCATION HISTORY POLICIES
DROP POLICY IF EXISTS "Users can read their own location history" ON location_history;
DROP POLICY IF EXISTS "Users can insert their own location history" ON location_history;
DROP POLICY IF EXISTS "Users can update their own location history" ON location_history;
DROP POLICY IF EXISTS "Users can delete their own location history" ON location_history;

CREATE POLICY "Users can read their own location history"
  ON location_history FOR SELECT
  USING (true);

CREATE POLICY "Users can insert their own location history"
  ON location_history FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can update their own location history"
  ON location_history FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can delete their own location history"
  ON location_history FOR DELETE
  USING (true);

-- INCIDENTS POLICIES
DROP POLICY IF EXISTS "Users can read all incidents" ON incidents;
DROP POLICY IF EXISTS "Users can create incidents" ON incidents;
DROP POLICY IF EXISTS "Users can update their own incidents" ON incidents;
DROP POLICY IF EXISTS "Users can delete their own incidents" ON incidents;
DROP POLICY IF EXISTS "Users can upvote incidents" ON incidents;

CREATE POLICY "Users can read all incidents"
  ON incidents FOR SELECT
  USING (true);

CREATE POLICY "Users can create incidents"
  ON incidents FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can update their own incidents"
  ON incidents FOR UPDATE
  USING (true);

CREATE POLICY "Users can delete their own incidents"
  ON incidents FOR DELETE
  USING (true);

CREATE POLICY "Users can upvote incidents"
  ON incidents FOR UPDATE
  USING (true);

-- USER SETTINGS POLICIES
DROP POLICY IF EXISTS "Users can read their own settings" ON user_settings;
DROP POLICY IF EXISTS "Users can update their own settings" ON user_settings;
DROP POLICY IF EXISTS "Users can insert their own settings" ON user_settings;

CREATE POLICY "Users can read their own settings"
  ON user_settings FOR SELECT
  USING (true);

CREATE POLICY "Users can update their own settings"
  ON user_settings FOR UPDATE
  USING (true);

CREATE POLICY "Users can insert their own settings"
  ON user_settings FOR INSERT
  WITH CHECK (true);

-- APP SETTING POLICIES
DROP POLICY IF EXISTS "Users can read app settings" ON app_setting;
DROP POLICY IF EXISTS "Users can update app settings" ON app_setting;
DROP POLICY IF EXISTS "Users can insert app settings" ON app_setting;

CREATE POLICY "Users can read app settings"
  ON app_setting FOR SELECT
  USING (true);

CREATE POLICY "Users can update app settings"
  ON app_setting FOR UPDATE
  USING (true);

CREATE POLICY "Users can insert app settings"
  ON app_setting FOR INSERT
  WITH CHECK (true);

-- FAMILY GROUPS POLICIES
DROP POLICY IF EXISTS "Users can read their own family group" ON family_groups;
DROP POLICY IF EXISTS "Users can create their own family group" ON family_groups;
DROP POLICY IF EXISTS "Users can update their own family group" ON family_groups;
DROP POLICY IF EXISTS "Users can delete their own family group" ON family_groups;

CREATE POLICY "Users can read their own family group"
  ON family_groups FOR SELECT
  USING (true);

CREATE POLICY "Users can create their own family group"
  ON family_groups FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can update their own family group"
  ON family_groups FOR UPDATE
  USING (true);

CREATE POLICY "Users can delete their own family group"
  ON family_groups FOR DELETE
  USING (true);

-- FAMILY MEMBERS POLICIES
DROP POLICY IF EXISTS "Users can read family members in their group" ON family_members;
DROP POLICY IF EXISTS "Users can insert family members in their group" ON family_members;
DROP POLICY IF EXISTS "Users can update family members in their group" ON family_members;
DROP POLICY IF EXISTS "Users can delete family members in their group" ON family_members;

CREATE POLICY "Users can read family members in their group"
  ON family_members FOR SELECT
  USING (true);

CREATE POLICY "Users can insert family members in their group"
  ON family_members FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can update family members in their group"
  ON family_members FOR UPDATE
  USING (true);

CREATE POLICY "Users can delete family members in their group"
  ON family_members FOR DELETE
  USING (true);

-- USER PUSH TOKENS POLICIES
DROP POLICY IF EXISTS "Users can manage their own push tokens" ON user_push_tokens;

CREATE POLICY "Users can manage their own push tokens"
  ON user_push_tokens FOR ALL
  USING (true);

-- FAMILY MEMBER REQUESTS POLICIES
DROP POLICY IF EXISTS "Users can read requests for their group" ON family_member_requests;
DROP POLICY IF EXISTS "Users can create join requests" ON family_member_requests;
DROP POLICY IF EXISTS "Admins can update requests" ON family_member_requests;

CREATE POLICY "Users can read requests for their group"
  ON family_member_requests FOR SELECT
  USING (true);

CREATE POLICY "Users can create join requests"
  ON family_member_requests FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Admins can update requests"
  ON family_member_requests FOR UPDATE
  USING (true);

-- ============================================
-- ENABLE REAL-TIME REPLICATION
-- ============================================
ALTER PUBLICATION supabase_realtime ADD TABLE users;
ALTER PUBLICATION supabase_realtime ADD TABLE connections;
ALTER PUBLICATION supabase_realtime ADD TABLE connection_codes;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE location_history;
ALTER PUBLICATION supabase_realtime ADD TABLE incidents;
ALTER PUBLICATION supabase_realtime ADD TABLE user_settings;
ALTER PUBLICATION supabase_realtime ADD TABLE app_setting;
ALTER PUBLICATION supabase_realtime ADD TABLE family_groups;
ALTER PUBLICATION supabase_realtime ADD TABLE family_members;
ALTER PUBLICATION supabase_realtime ADD TABLE user_push_tokens;
ALTER PUBLICATION supabase_realtime ADD TABLE family_member_requests;
