-- Enable unrestricted RLS on user_push_tokens table
-- This ensures RLS is enabled but with full access (USING (true) for all operations)

-- First, drop any existing policies
DROP POLICY IF EXISTS "Users can manage their own push tokens" ON user_push_tokens;
DROP POLICY IF EXISTS "Allow all operations on push tokens" ON user_push_tokens;

-- Enable RLS (this is idempotent - safe to run multiple times)
ALTER TABLE user_push_tokens ENABLE ROW LEVEL SECURITY;

-- Create unrestricted policy for SELECT
CREATE POLICY "Allow all SELECT on push tokens"
  ON user_push_tokens FOR SELECT
  USING (true);

-- Create unrestricted policy for INSERT
CREATE POLICY "Allow all INSERT on push tokens"
  ON user_push_tokens FOR INSERT
  WITH CHECK (true);

-- Create unrestricted policy for UPDATE
CREATE POLICY "Allow all UPDATE on push tokens"
  ON user_push_tokens FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Create unrestricted policy for DELETE
CREATE POLICY "Allow all DELETE on push tokens"
  ON user_push_tokens FOR DELETE
  USING (true);

-- Grant permissions to ensure authenticated users can access
GRANT ALL ON user_push_tokens TO authenticated;
GRANT ALL ON user_push_tokens TO service_role;
GRANT ALL ON user_push_tokens TO anon;
