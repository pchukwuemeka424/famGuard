-- Create user_push_tokens table for storing push notification tokens

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

-- Disable RLS for now to allow token registration
-- The edge function uses service_role key which bypasses RLS anyway
ALTER TABLE user_push_tokens DISABLE ROW LEVEL SECURITY;

-- Grant permissions
GRANT ALL ON user_push_tokens TO authenticated;
GRANT ALL ON user_push_tokens TO service_role;
