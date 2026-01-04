-- Remove all notification-related tables and data
-- Run this script to completely remove notifications from the database

-- Drop notification-related tables
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS user_push_tokens CASCADE;

-- Remove notification-related columns from other tables if they exist
-- (These may not exist, but safe to try)
DO $$ 
BEGIN
    -- Remove notification preferences from user_settings if they exist
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'user_settings' 
        AND column_name = 'notification_preferences'
    ) THEN
        ALTER TABLE user_settings DROP COLUMN notification_preferences;
    END IF;
END $$;

-- Clean up any notification-related functions or triggers
-- (Add any custom functions/triggers related to notifications here if they exist)

