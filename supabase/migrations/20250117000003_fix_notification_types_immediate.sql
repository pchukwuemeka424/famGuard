-- ============================================
-- Fix Notification Types Constraint (Immediate Fix)
-- Migration: 20250117000003
-- This migration fixes the notification type constraint immediately
-- Run this if the previous migration didn't work
-- ============================================

-- First, find and drop any existing type constraints
DO $$
DECLARE
    constraint_record RECORD;
BEGIN
    -- Find all CHECK constraints on the notifications table that relate to 'type'
    FOR constraint_record IN
        SELECT 
            tc.constraint_name,
            tc.table_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.constraint_column_usage ccu 
            ON tc.constraint_name = ccu.constraint_name
        WHERE tc.table_name = 'notifications'
            AND tc.constraint_type = 'CHECK'
            AND ccu.column_name = 'type'
    LOOP
        EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I', 
            constraint_record.table_name, 
            constraint_record.constraint_name);
        RAISE NOTICE 'Dropped constraint: %', constraint_record.constraint_name;
    END LOOP;
END $$;

-- Now add the new constraint with all notification types
ALTER TABLE notifications 
  DROP CONSTRAINT IF EXISTS notifications_type_check;

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

-- Verify the constraint exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM pg_constraint 
        WHERE conname = 'notifications_type_check'
    ) THEN
        RAISE NOTICE 'Successfully created notifications_type_check constraint';
    ELSE
        RAISE EXCEPTION 'Failed to create notifications_type_check constraint';
    END IF;
END $$;




