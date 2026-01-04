#!/bin/bash

# Run Notification Types Constraint Migration Script
# This script executes the 20250117000003_fix_notification_types_immediate.sql file against your Supabase database

echo "🚀 Running Notification Types Constraint Migration..."
echo ""
echo "This migration will:"
echo "1. Remove old notification type constraints"
echo "2. Add new constraint with all notification types including:"
echo "   - check_in"
echo "   - check_in_emergency"
echo "   - check_in_unsafe"
echo "   - missed_check_in"
echo "   - travel_advisory"
echo "   - route_risk"
echo "   - And all existing types"
echo ""

# Get database URL from .env file
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$PROJECT_DIR/.env"

if [ ! -f "$ENV_FILE" ]; then
    echo "❌ Error: .env file not found at $ENV_FILE"
    echo ""
    echo "📝 Alternative: Run the SQL manually in Supabase Dashboard:"
    echo "1. Go to Supabase Dashboard > SQL Editor"
    echo "2. Copy contents of: supabase/migrations/20250117000003_fix_notification_types_immediate.sql"
    echo "3. Paste and run"
    exit 1
fi

# Extract DATABASE_URL from .env
DATABASE_URL=$(grep "^DATABASE_URL=" "$ENV_FILE" | cut -d'=' -f2-)

if [ -z "$DATABASE_URL" ]; then
    echo "❌ Error: DATABASE_URL not found in .env file"
    echo ""
    echo "📝 Alternative: Run the SQL manually in Supabase Dashboard:"
    echo "1. Go to Supabase Dashboard > SQL Editor"
    echo "2. Copy contents of: supabase/migrations/20250117000003_fix_notification_types_immediate.sql"
    echo "3. Paste and run"
    exit 1
fi

echo "📋 Connecting to database..."
echo ""

# Run the SQL migration
psql "$DATABASE_URL" -f "$SCRIPT_DIR/migrations/20250117000003_fix_notification_types_immediate.sql"

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Notification types constraint migration completed successfully!"
    echo ""
    echo "📝 Verification:"
    echo "1. Check Supabase Dashboard > SQL Editor"
    echo "2. Run this query to verify the constraint:"
    echo "   SELECT conname, pg_get_constraintdef(oid) as definition"
    echo "   FROM pg_constraint"
    echo "   WHERE conname = 'notifications_type_check';"
    echo ""
    echo "3. The constraint should include: check_in, check_in_emergency, check_in_unsafe, missed_check_in"
    echo ""
    echo "💡 The app will now be able to save notifications with check-in types without errors!"
else
    echo ""
    echo "❌ Migration failed. Please check the error messages above."
    echo ""
    echo "📝 Alternative: Run the SQL manually in Supabase Dashboard:"
    echo "1. Go to Supabase Dashboard > SQL Editor"
    echo "2. Copy contents of: supabase/migrations/20250117000003_fix_notification_types_immediate.sql"
    echo "3. Paste and run"
    exit 1
fi

