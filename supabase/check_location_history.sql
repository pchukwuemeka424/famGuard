-- ============================================
-- Diagnostic Script: Check location_history Table
-- ============================================
-- Run this script in Supabase SQL Editor or via psql to verify:
-- 1. Table structure
-- 2. Accuracy column status
-- 3. Connection verification
-- 4. Recent entries with accuracy values

-- 1. Check table structure
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'location_history'
ORDER BY ordinal_position;

-- 2. Count total records
SELECT COUNT(*) as total_records FROM location_history;

-- 3. Check accuracy column statistics
SELECT 
    COUNT(*) as total_rows,
    COUNT(accuracy) as rows_with_accuracy,
    COUNT(*) - COUNT(accuracy) as rows_with_null_accuracy,
    ROUND(100.0 * COUNT(accuracy) / COUNT(*), 2) as accuracy_population_percent,
    MIN(accuracy) as min_accuracy,
    MAX(accuracy) as max_accuracy,
    ROUND(AVG(accuracy), 2) as avg_accuracy
FROM location_history;

-- 4. Check recent entries (last 24 hours) with accuracy
SELECT 
    id,
    user_id,
    latitude,
    longitude,
    address,
    accuracy,
    created_at
FROM location_history
WHERE created_at >= NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC
LIMIT 20;

-- 5. Check entries with NULL accuracy (recent)
SELECT 
    id,
    user_id,
    latitude,
    longitude,
    address,
    accuracy,
    created_at
FROM location_history
WHERE accuracy IS NULL
  AND created_at >= NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC
LIMIT 20;

-- 6. Check entries with valid accuracy (recent)
SELECT 
    id,
    user_id,
    latitude,
    longitude,
    address,
    accuracy,
    created_at
FROM location_history
WHERE accuracy IS NOT NULL
  AND created_at >= NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC
LIMIT 20;

-- 7. Verify indexes exist
SELECT 
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'location_history';

-- 8. Check for any constraints
SELECT 
    conname as constraint_name,
    contype as constraint_type,
    pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint
WHERE conrelid = 'location_history'::regclass;
