-- ============================================
-- Ensure user_id exists on user_settings table
-- Adds FK to users(id), uniqueness, and NOT NULL when safe
-- ============================================

-- Add user_id column if it does not exist
ALTER TABLE user_settings
ADD COLUMN IF NOT EXISTS user_id TEXT;

-- Add foreign key constraint to users(id) if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'user_settings'
      AND constraint_name = 'user_settings_user_id_fkey'
  ) THEN
    ALTER TABLE user_settings
      ADD CONSTRAINT user_settings_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Add unique constraint on user_id if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'user_settings'
      AND constraint_name = 'user_settings_user_id_key'
  ) THEN
    ALTER TABLE user_settings
      ADD CONSTRAINT user_settings_user_id_key UNIQUE(user_id);
  END IF;
END $$;

-- Set NOT NULL on user_id when there are no NULL values
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user_settings'
      AND column_name = 'user_id'
      AND is_nullable = 'YES'
  ) THEN
    IF NOT EXISTS (SELECT 1 FROM user_settings WHERE user_id IS NULL) THEN
      ALTER TABLE user_settings ALTER COLUMN user_id SET NOT NULL;
    ELSE
      RAISE NOTICE 'user_settings contains NULL user_id values; NOT NULL not enforced';
    END IF;
  END IF;
END $$;

-- Ensure an index exists for lookups (unique constraint already creates one)
CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON user_settings(user_id);



