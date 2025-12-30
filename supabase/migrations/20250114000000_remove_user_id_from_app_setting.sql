-- ============================================
-- Remove user_id from app_setting table (if it exists)
-- Ensure app_setting is a global settings table
-- ============================================

-- Remove user_id column if it exists
ALTER TABLE app_setting 
DROP COLUMN IF EXISTS user_id;

-- Verify the table structure
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'app_setting' 
    AND column_name = 'user_id'
  ) THEN
    RAISE NOTICE 'user_id column still exists - manual removal may be required';
  ELSE
    RAISE NOTICE 'user_id column does not exist - table structure is correct';
  END IF;
END $$;



