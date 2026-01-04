-- Enable RLS on notifications table and create proper policies

-- Enable RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can read their own notifications" ON notifications;
DROP POLICY IF EXISTS "Users can create notifications" ON notifications;
DROP POLICY IF EXISTS "Users can update their own notifications" ON notifications;
DROP POLICY IF EXISTS "Users can delete their own notifications" ON notifications;

-- Policy: Users can read their own notifications
CREATE POLICY "Users can read their own notifications"
  ON notifications FOR SELECT
  USING (user_id = auth.uid()::text);

-- Policy: Users can create notifications for themselves
-- Also allow service_role to create notifications for any user (for system notifications)
CREATE POLICY "Users can create notifications"
  ON notifications FOR INSERT
  WITH CHECK (
    user_id = auth.uid()::text OR
    auth.jwt() ->> 'role' = 'service_role'
  );

-- Policy: Users can update their own notifications
CREATE POLICY "Users can update their own notifications"
  ON notifications FOR UPDATE
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

-- Policy: Users can delete their own notifications
CREATE POLICY "Users can delete their own notifications"
  ON notifications FOR DELETE
  USING (user_id = auth.uid()::text);

