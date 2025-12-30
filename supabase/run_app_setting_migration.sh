#!/bin/bash

# Run App Setting Table Migration Script
# This script executes the 20250113000000_create_app_setting_table.sql file against your Supabase database

echo "🚀 Running App Setting Table Migration..."
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
    echo "2. Copy contents of: supabase/migrations/20250113000000_create_app_setting_table.sql"
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
    echo "2. Copy contents of: supabase/migrations/20250113000000_create_app_setting_table.sql"
    echo "3. Paste and run"
    exit 1
fi

echo "📋 Connecting to database..."
echo ""

# Run the SQL migration
psql "$DATABASE_URL" -f "$SCRIPT_DIR/migrations/20250113000000_create_app_setting_table.sql"

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ App Setting table migration completed successfully!"
    echo ""
    echo "📝 Verification:"
    echo "1. Check Supabase Dashboard > Table Editor"
    echo "2. You should see the 'app_setting' table"
    echo "3. The table should have a single row with default values"
    echo "4. Real-time replication should be enabled"
    echo ""
    echo "💡 To update settings:"
    echo "   UPDATE app_setting SET hide_report_incident = true, hide_incident = true WHERE id = '00000000-0000-0000-0000-000000000000';"
else
    echo ""
    echo "❌ Migration failed. Please check the error messages above."
    echo ""
    echo "📝 Alternative: Run the SQL manually in Supabase Dashboard:"
    echo "1. Go to Supabase Dashboard > SQL Editor"
    echo "2. Copy contents of: supabase/migrations/20250113000000_create_app_setting_table.sql"
    echo "3. Paste and run"
    exit 1
fi



