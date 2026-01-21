-- ============================================
-- Migration: Add app_update notification type
-- ============================================
-- This migration adds 'app_update' to the notification types

-- Drop ALL existing type constraints (they might have different names)
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT constraint_name
        FROM information_schema.table_constraints
        WHERE table_name = 'notifications'
        AND constraint_type = 'CHECK'
        AND constraint_name LIKE '%type%'
    ) LOOP
        EXECUTE 'ALTER TABLE notifications DROP CONSTRAINT IF EXISTS ' || quote_ident(r.constraint_name);
    END LOOP;
END $$;

-- Add the new constraint with all notification types including app_update
ALTER TABLE notifications 
  ADD CONSTRAINT notifications_type_check 
  CHECK (type IN (
    'sos_alert',
    'connection_added',
    'location_updated',
    'incident',
    'check_in',
    'check_in_emergency',
    'check_in_unsafe',
    'missed_check_in',
    'travel_advisory',
    'route_risk',
    'general',
    'app_update'
  ));

-- Verify the constraint was created
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'notifications_type_check'
        AND conrelid = 'notifications'::regclass
    ) THEN
        RAISE EXCEPTION 'Failed to create notifications_type_check constraint';
    END IF;
END $$;
