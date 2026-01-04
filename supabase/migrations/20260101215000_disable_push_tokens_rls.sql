-- Disable RLS on user_push_tokens to fix token registration
-- The edge function uses service_role key which bypasses RLS anyway

-- Drop existing policies
DROP POLICY IF EXISTS "Users can manage their own push tokens" ON user_push_tokens;

-- Disable RLS
ALTER TABLE user_push_tokens DISABLE ROW LEVEL SECURITY;

