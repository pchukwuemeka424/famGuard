-- ============================================
-- Fix Check-in Settings Duplicate Key Issue
-- Migration: 20250117000002
-- Handles existing duplicate entries and ensures unique constraint
-- ============================================

-- First, remove any duplicate entries (keep the most recent one)
DELETE FROM check_in_settings
WHERE id NOT IN (
  SELECT DISTINCT ON (user_id) id
  FROM check_in_settings
  ORDER BY user_id, created_at DESC
);

-- Ensure the unique constraint exists (it should already exist, but this ensures it)
-- If constraint doesn't exist, create it
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'check_in_settings_user_id_key'
  ) THEN
    ALTER TABLE check_in_settings
    ADD CONSTRAINT check_in_settings_user_id_key UNIQUE (user_id);
  END IF;
END $$;

-- Create index if it doesn't exist (for performance)
CREATE INDEX IF NOT EXISTS idx_check_in_settings_user_id ON check_in_settings(user_id);

-- Add a comment to the table
COMMENT ON TABLE check_in_settings IS 'User check-in settings with unique constraint on user_id';




