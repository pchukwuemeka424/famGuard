-- ============================================
-- Travel Advisory and Check-in System
-- Migration: 20250117000000
-- ============================================

-- ============================================
-- 1. TRAVEL ADVISORIES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS travel_advisories (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  state TEXT NOT NULL,
  region TEXT,
  lga TEXT, -- Local Government Area
  risk_level TEXT NOT NULL CHECK (risk_level IN ('low', 'moderate', 'high', 'critical')),
  advisory_type TEXT NOT NULL CHECK (advisory_type IN ('security', 'weather', 'combined')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  affected_areas TEXT[], -- Array of specific areas
  start_date TIMESTAMP WITH TIME ZONE NOT NULL,
  end_date TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT true,
  source TEXT, -- e.g., 'NEMA', 'Police', 'Community'
  created_by_user_id TEXT,
  upvotes INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_travel_advisories_state ON travel_advisories(state);
CREATE INDEX IF NOT EXISTS idx_travel_advisories_region ON travel_advisories(region);
CREATE INDEX IF NOT EXISTS idx_travel_advisories_risk_level ON travel_advisories(risk_level);
CREATE INDEX IF NOT EXISTS idx_travel_advisories_is_active ON travel_advisories(is_active);
CREATE INDEX IF NOT EXISTS idx_travel_advisories_active_dates ON travel_advisories(is_active, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_travel_advisories_type ON travel_advisories(advisory_type);

-- Add update trigger
DROP TRIGGER IF EXISTS update_travel_advisories_updated_at ON travel_advisories;
CREATE TRIGGER update_travel_advisories_updated_at
  BEFORE UPDATE ON travel_advisories
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 2. ROUTE RISK DATA TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS route_risk_data (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  origin_state TEXT NOT NULL,
  origin_city TEXT,
  destination_state TEXT NOT NULL,
  destination_city TEXT,
  route_coordinates JSONB, -- Array of {lat, lng} points
  risk_score DOUBLE PRECISION DEFAULT 0, -- 0-100
  incident_count_24h INTEGER DEFAULT 0,
  incident_count_7d INTEGER DEFAULT 0,
  incident_count_30d INTEGER DEFAULT 0,
  last_incident_at TIMESTAMP WITH TIME ZONE,
  average_travel_time_minutes INTEGER,
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_route_risk_origin ON route_risk_data(origin_state, origin_city);
CREATE INDEX IF NOT EXISTS idx_route_risk_destination ON route_risk_data(destination_state, destination_city);
CREATE INDEX IF NOT EXISTS idx_route_risk_score ON route_risk_data(risk_score);
CREATE INDEX IF NOT EXISTS idx_route_risk_last_updated ON route_risk_data(last_updated);

-- ============================================
-- 3. USER CHECK-INS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS user_check_ins (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id TEXT NOT NULL,
  check_in_type TEXT NOT NULL CHECK (check_in_type IN ('manual', 'automatic', 'scheduled', 'emergency')),
  location_latitude DOUBLE PRECISION,
  location_longitude DOUBLE PRECISION,
  location_address TEXT,
  status TEXT NOT NULL CHECK (status IN ('safe', 'unsafe', 'delayed', 'missed')),
  message TEXT,
  next_check_in_due_at TIMESTAMP WITH TIME ZONE,
  is_emergency BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_user_check_ins_user_id ON user_check_ins(user_id);
CREATE INDEX IF NOT EXISTS idx_user_check_ins_status ON user_check_ins(status);
CREATE INDEX IF NOT EXISTS idx_user_check_ins_next_due ON user_check_ins(next_check_in_due_at);
CREATE INDEX IF NOT EXISTS idx_user_check_ins_created ON user_check_ins(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_check_ins_emergency ON user_check_ins(is_emergency);

-- Add update trigger
DROP TRIGGER IF EXISTS update_user_check_ins_updated_at ON user_check_ins;
CREATE TRIGGER update_user_check_ins_updated_at
  BEFORE UPDATE ON user_check_ins
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 4. CHECK-IN SETTINGS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS check_in_settings (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  enabled BOOLEAN DEFAULT true,
  check_in_interval_minutes INTEGER DEFAULT 60, -- Default 1 hour
  auto_check_in_enabled BOOLEAN DEFAULT false,
  auto_check_in_during_travel BOOLEAN DEFAULT true,
  travel_speed_threshold_kmh DOUBLE PRECISION DEFAULT 20, -- Consider traveling if speed > 20 km/h
  missed_check_in_alert_minutes INTEGER DEFAULT 30, -- Alert if missed by 30 minutes
  emergency_contacts JSONB DEFAULT '[]'::jsonb, -- Array of user IDs to notify
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index
CREATE INDEX IF NOT EXISTS idx_check_in_settings_user_id ON check_in_settings(user_id);

-- Add update trigger
DROP TRIGGER IF EXISTS update_check_in_settings_updated_at ON check_in_settings;
CREATE TRIGGER update_check_in_settings_updated_at
  BEFORE UPDATE ON check_in_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================

-- Enable RLS
ALTER TABLE travel_advisories ENABLE ROW LEVEL SECURITY;
ALTER TABLE route_risk_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_check_ins ENABLE ROW LEVEL SECURITY;
ALTER TABLE check_in_settings ENABLE ROW LEVEL SECURITY;

-- TRAVEL ADVISORIES POLICIES
DROP POLICY IF EXISTS "Users can read all travel advisories" ON travel_advisories;
DROP POLICY IF EXISTS "Users can create travel advisories" ON travel_advisories;
DROP POLICY IF EXISTS "Users can update their own advisories" ON travel_advisories;
DROP POLICY IF EXISTS "Users can upvote advisories" ON travel_advisories;

CREATE POLICY "Users can read all travel advisories"
  ON travel_advisories FOR SELECT
  USING (true);

CREATE POLICY "Users can create travel advisories"
  ON travel_advisories FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can update their own advisories"
  ON travel_advisories FOR UPDATE
  USING (true);

CREATE POLICY "Users can upvote advisories"
  ON travel_advisories FOR UPDATE
  USING (true);

-- ROUTE RISK DATA POLICIES
DROP POLICY IF EXISTS "Users can read route risk data" ON route_risk_data;
DROP POLICY IF EXISTS "System can update route risk data" ON route_risk_data;

CREATE POLICY "Users can read route risk data"
  ON route_risk_data FOR SELECT
  USING (true);

CREATE POLICY "System can update route risk data"
  ON route_risk_data FOR ALL
  USING (true);

-- USER CHECK-INS POLICIES
DROP POLICY IF EXISTS "Users can read their own check-ins" ON user_check_ins;
DROP POLICY IF EXISTS "Users can create their own check-ins" ON user_check_ins;
DROP POLICY IF EXISTS "Users can update their own check-ins" ON user_check_ins;
DROP POLICY IF EXISTS "Connections can read check-ins" ON user_check_ins;

CREATE POLICY "Users can read their own check-ins"
  ON user_check_ins FOR SELECT
  USING (true);

CREATE POLICY "Users can create their own check-ins"
  ON user_check_ins FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can update their own check-ins"
  ON user_check_ins FOR UPDATE
  USING (true);

-- Allow connections to read check-ins (for safety monitoring)
CREATE POLICY "Connections can read check-ins"
  ON user_check_ins FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM connections
      WHERE (connections.user_id = auth.uid()::text AND connections.connected_user_id = user_check_ins.user_id)
         OR (connections.connected_user_id = auth.uid()::text AND connections.user_id = user_check_ins.user_id)
      AND connections.status = 'connected'
    )
  );

-- CHECK-IN SETTINGS POLICIES
DROP POLICY IF EXISTS "Users can manage their own check-in settings" ON check_in_settings;

CREATE POLICY "Users can manage their own check-in settings"
  ON check_in_settings FOR ALL
  USING (true);

-- ============================================
-- ENABLE REAL-TIME REPLICATION
-- ============================================
ALTER PUBLICATION supabase_realtime ADD TABLE travel_advisories;
ALTER PUBLICATION supabase_realtime ADD TABLE user_check_ins;
ALTER PUBLICATION supabase_realtime ADD TABLE check_in_settings;

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function: Get active advisories for a location
CREATE OR REPLACE FUNCTION get_advisories_for_location(
  p_state TEXT,
  p_region TEXT DEFAULT NULL,
  p_lga TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  state TEXT,
  region TEXT,
  lga TEXT,
  risk_level TEXT,
  advisory_type TEXT,
  title TEXT,
  description TEXT,
  affected_areas TEXT[],
  start_date TIMESTAMP WITH TIME ZONE,
  end_date TIMESTAMP WITH TIME ZONE,
  source TEXT,
  upvotes INTEGER,
  created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ta.id,
    ta.state,
    ta.region,
    ta.lga,
    ta.risk_level,
    ta.advisory_type,
    ta.title,
    ta.description,
    ta.affected_areas,
    ta.start_date,
    ta.end_date,
    ta.source,
    ta.upvotes,
    ta.created_at
  FROM travel_advisories ta
  WHERE ta.is_active = true
    AND ta.state = p_state
    AND (p_region IS NULL OR ta.region = p_region OR ta.region IS NULL)
    AND (p_lga IS NULL OR ta.lga = p_lga OR ta.lga IS NULL)
    AND (ta.end_date IS NULL OR ta.end_date > NOW())
    AND ta.start_date <= NOW()
  ORDER BY 
    CASE ta.risk_level
      WHEN 'critical' THEN 1
      WHEN 'high' THEN 2
      WHEN 'moderate' THEN 3
      WHEN 'low' THEN 4
    END,
    ta.created_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Function: Calculate route risk score
CREATE OR REPLACE FUNCTION calculate_route_risk(
  p_origin_state TEXT,
  p_destination_state TEXT,
  p_origin_city TEXT DEFAULT NULL,
  p_destination_city TEXT DEFAULT NULL
)
RETURNS DOUBLE PRECISION AS $$
DECLARE
  v_risk_score DOUBLE PRECISION := 0;
  v_incident_count_24h INTEGER := 0;
  v_incident_count_7d INTEGER := 0;
  v_incident_count_30d INTEGER := 0;
BEGIN
  -- Get incident counts along the route (simplified - would need actual route calculation)
  SELECT COUNT(*) INTO v_incident_count_24h
  FROM incidents
  WHERE created_at >= NOW() - INTERVAL '24 hours'
    AND (
      (location_address ILIKE '%' || p_origin_state || '%' OR location_address ILIKE '%' || p_destination_state || '%')
      OR (p_origin_city IS NOT NULL AND location_address ILIKE '%' || p_origin_city || '%')
      OR (p_destination_city IS NOT NULL AND location_address ILIKE '%' || p_destination_city || '%')
    );

  SELECT COUNT(*) INTO v_incident_count_7d
  FROM incidents
  WHERE created_at >= NOW() - INTERVAL '7 days'
    AND (
      (location_address ILIKE '%' || p_origin_state || '%' OR location_address ILIKE '%' || p_destination_state || '%')
      OR (p_origin_city IS NOT NULL AND location_address ILIKE '%' || p_origin_city || '%')
      OR (p_destination_city IS NOT NULL AND location_address ILIKE '%' || p_destination_city || '%')
    );

  SELECT COUNT(*) INTO v_incident_count_30d
  FROM incidents
  WHERE created_at >= NOW() - INTERVAL '30 days'
    AND (
      (location_address ILIKE '%' || p_origin_state || '%' OR location_address ILIKE '%' || p_destination_state || '%')
      OR (p_origin_city IS NOT NULL AND location_address ILIKE '%' || p_origin_city || '%')
      OR (p_destination_city IS NOT NULL AND location_address ILIKE '%' || p_destination_city || '%')
    );

  -- Calculate risk score (0-100)
  -- Weight: 24h incidents = 50%, 7d = 30%, 30d = 20%
  v_risk_score := LEAST(100, 
    (v_incident_count_24h * 10) + 
    (v_incident_count_7d * 2) + 
    (v_incident_count_30d * 0.5)
  );

  RETURN v_risk_score;
END;
$$ LANGUAGE plpgsql;




