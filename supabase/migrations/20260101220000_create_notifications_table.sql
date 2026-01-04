-- Create notifications table
-- This table stores in-app notifications for users

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

-- Disable RLS to allow notifications to be created and read
ALTER TABLE notifications DISABLE ROW LEVEL SECURITY;

-- Grant permissions
GRANT ALL ON notifications TO authenticated;
GRANT ALL ON notifications TO service_role;

