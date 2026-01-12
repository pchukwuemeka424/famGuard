-- ============================================
-- Migration: Add location_reminder notification type
-- ============================================
-- Adds 'location_reminder' to the notification types

-- Drop existing type constraint
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

-- Add the updated constraint with location_reminder type
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
    'location_reminder',
    'general'
  ));
