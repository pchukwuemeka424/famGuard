#!/bin/bash

# ============================================
# Script to Check Supabase Connection
# ============================================
# This script verifies the Supabase PostgreSQL connection
# and checks the location_history table

# Connection string from user
CONNECTION_STRING="postgresql://postgres:eYHNPishBvzReZ6P@db.bbydsaxduuwbnwqmiant.supabase.co:5432/postgres"

echo "============================================"
echo "Checking Supabase Connection..."
echo "============================================"
echo ""

# Check if psql is installed
if ! command -v psql &> /dev/null; then
    echo "❌ psql is not installed. Please install PostgreSQL client tools."
    echo "   macOS: brew install postgresql"
    echo "   Linux: sudo apt-get install postgresql-client"
    exit 1
fi

echo "✅ psql found"
echo ""

# Test connection
echo "Testing connection..."
if psql "$CONNECTION_STRING" -c "SELECT version();" &> /dev/null; then
    echo "✅ Connection successful!"
    echo ""
else
    echo "❌ Connection failed. Please check:"
    echo "   1. Connection string is correct"
    echo "   2. Network connectivity"
    echo "   3. Database credentials"
    exit 1
fi

# Check location_history table structure
echo "============================================"
echo "Checking location_history table structure..."
echo "============================================"
psql "$CONNECTION_STRING" -c "
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'location_history'
ORDER BY ordinal_position;
"

echo ""
echo "============================================"
echo "Checking accuracy column statistics..."
echo "============================================"
psql "$CONNECTION_STRING" -c "
SELECT 
    COUNT(*) as total_rows,
    COUNT(accuracy) as rows_with_accuracy,
    COUNT(*) - COUNT(accuracy) as rows_with_null_accuracy,
    ROUND(100.0 * COUNT(accuracy) / COUNT(*), 2) as accuracy_population_percent,
    MIN(accuracy) as min_accuracy,
    MAX(accuracy) as max_accuracy,
    ROUND(AVG(accuracy), 2) as avg_accuracy
FROM location_history;
"

echo ""
echo "============================================"
echo "Recent entries (last 10) with accuracy..."
echo "============================================"
psql "$CONNECTION_STRING" -c "
SELECT 
    id,
    user_id,
    latitude,
    longitude,
    accuracy,
    created_at
FROM location_history
ORDER BY created_at DESC
LIMIT 10;
"

echo ""
echo "============================================"
echo "Entries with NULL accuracy (last 10)..."
echo "============================================"
psql "$CONNECTION_STRING" -c "
SELECT 
    id,
    user_id,
    latitude,
    longitude,
    accuracy,
    created_at
FROM location_history
WHERE accuracy IS NULL
ORDER BY created_at DESC
LIMIT 10;
"

echo ""
echo "✅ Check complete!"
