-- Add location_sharing_enabled column to connections table
-- This allows users to disable location sharing for individual connections
-- while still allowing emergency alerts to receive location

ALTER TABLE connections 
ADD COLUMN IF NOT EXISTS location_sharing_enabled BOOLEAN DEFAULT true;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_connections_location_sharing_enabled 
ON connections(location_sharing_enabled) 
WHERE location_sharing_enabled = false;

-- Update existing connections to have location sharing enabled by default
UPDATE connections 
SET location_sharing_enabled = true 
WHERE location_sharing_enabled IS NULL;

