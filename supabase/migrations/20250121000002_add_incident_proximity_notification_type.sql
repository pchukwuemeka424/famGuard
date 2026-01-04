-- ============================================
-- Migration: Add 'incident_proximity' to notification types
-- This allows incident proximity notifications to be created
-- ============================================

-- Drop the existing constraint
ALTER TABLE notifications 
  DROP CONSTRAINT IF EXISTS notifications_type_check;

-- Add the new constraint with 'incident_proximity' included
ALTER TABLE notifications 
  ADD CONSTRAINT notifications_type_check 
  CHECK (type IN (
    'sos_alert',
    'connection_added',
    'location_updated',
    'incident',
    'incident_proximity',
    'check_in',
    'check_in_emergency',
    'check_in_unsafe',
    'missed_check_in',
    'travel_advisory',
    'route_risk',
    'general'
  ));

