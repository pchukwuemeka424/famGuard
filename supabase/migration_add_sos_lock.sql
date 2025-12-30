-- ============================================
-- Migration: Add sos_lock column to app_setting table
-- ============================================
-- Run this migration if you have an existing database
-- This adds the sos_lock column to the app_setting table

-- Add sos_lock column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'app_setting' 
    AND column_name = 'sos_lock'
  ) THEN
    ALTER TABLE app_setting 
    ADD COLUMN sos_lock BOOLEAN DEFAULT false;
    
    RAISE NOTICE 'Column sos_lock added to app_setting table';
  ELSE
    RAISE NOTICE 'Column sos_lock already exists in app_setting table';
  END IF;
END $$;

