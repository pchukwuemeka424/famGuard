-- ============================================
-- Migration: Add app_update_notification_enabled column to app_setting table
-- ============================================
-- This migration adds a column to control whether app update notifications
-- should be sent to all users
-- If TRUE: Send push notifications to all users about app update
-- If FALSE: Do not send app update notifications

-- Add app_update_notification_enabled column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'app_setting' 
    AND column_name = 'app_update_notification_enabled'
  ) THEN
    ALTER TABLE app_setting 
    ADD COLUMN app_update_notification_enabled BOOLEAN DEFAULT false;
    
    RAISE NOTICE 'Column app_update_notification_enabled added to app_setting table';
  ELSE
    RAISE NOTICE 'Column app_update_notification_enabled already exists in app_setting table';
  END IF;
END $$;

-- Update existing row to set default value if needed
UPDATE app_setting 
SET app_update_notification_enabled = false 
WHERE id = '00000000-0000-0000-0000-000000000000' 
  AND app_update_notification_enabled IS NULL;

-- Add comment to column
COMMENT ON COLUMN app_setting.app_update_notification_enabled IS 
'If TRUE, sends push notifications to all users about app update. If FALSE, does not send notifications.';
