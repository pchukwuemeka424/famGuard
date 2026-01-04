-- ============================================
-- Update Notification Types
-- Migration: 20250117000001
-- Adds new notification types for check-ins and travel advisories
-- ============================================

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

-- Add the new constraint with all notification types
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
    'general'
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

