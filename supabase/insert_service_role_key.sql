-- ============================================
-- Script to Insert Service Role Key
-- ============================================
-- Replace 'YOUR_SERVICE_ROLE_KEY_HERE' with your actual service role key
-- Get it from: https://supabase.com/dashboard/project/bbydsaxduuwbnwqmiant/settings/api

-- Insert or update the service role key
INSERT INTO app_config (key, value, description) 
VALUES (
  'supabase_service_role_key', 
  'YOUR_SERVICE_ROLE_KEY_HERE',  -- Replace this with your actual service role key
  'Service role key for edge functions'
)
ON CONFLICT (key) 
DO UPDATE SET 
  value = EXCLUDED.value,
  updated_at = NOW();

-- Verify it was inserted
SELECT 
  key, 
  CASE 
    WHEN value IS NOT NULL AND length(value) > 20 THEN '✅ Configured (' || length(value) || ' chars)'
    ELSE '❌ Not configured properly'
  END as status,
  description,
  updated_at
FROM app_config 
WHERE key = 'supabase_service_role_key';
