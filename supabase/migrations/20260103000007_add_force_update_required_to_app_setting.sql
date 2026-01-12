-- ============================================
-- Migration: Add force_update_required column to app_setting table
-- ============================================
-- This migration adds a column to control whether the update screen
-- should be shown and lock the app (force update)
-- If TRUE: Show update screen and lock the app
-- If FALSE: Do not show update screen

-- Add force_update_required column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'app_setting' 
    AND column_name = 'force_update_required'
  ) THEN
    ALTER TABLE app_setting 
    ADD COLUMN force_update_required BOOLEAN DEFAULT false;
    
    RAISE NOTICE 'Column force_update_required added to app_setting table';
  ELSE
    RAISE NOTICE 'Column force_update_required already exists in app_setting table';
  END IF;
END $$;

-- Update existing row to set default value if needed
UPDATE app_setting 
SET force_update_required = false 
WHERE id = '00000000-0000-0000-0000-000000000000' 
  AND force_update_required IS NULL;

-- Add comment to column
COMMENT ON COLUMN app_setting.force_update_required IS 
'If TRUE, shows update screen and locks the app. If FALSE, does not show update screen.';
