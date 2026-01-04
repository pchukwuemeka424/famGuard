#!/bin/bash

# Run Remove user_id from app_setting Migration Script
# This script executes the 20250114000000_remove_user_id_from_app_setting.sql file

echo "🚀 Running Remove user_id from app_setting Migration..."
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
    echo "2. Copy contents of: supabase/migrations/20250114000000_remove_user_id_from_app_setting.sql"
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
    echo "2. Copy contents of: supabase/migrations/20250114000000_remove_user_id_from_app_setting.sql"
    echo "3. Paste and run"
    exit 1
fi

echo "📋 Connecting to database..."
echo ""

# Run the SQL migration
psql "$DATABASE_URL" -f "$SCRIPT_DIR/migrations/20250114000000_remove_user_id_from_app_setting.sql"

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Migration completed successfully!"
    echo ""
    echo "📝 Verification:"
    echo "1. Check Supabase Dashboard > Table Editor > app_setting"
    echo "2. Verify user_id column does not exist"
    echo "3. Table should only have: id, hide_report_incident, hide_incident, created_at, updated_at"
else
    echo ""
    echo "❌ Migration failed. Please check the error messages above."
    echo ""
    echo "📝 Alternative: Run the SQL manually in Supabase Dashboard:"
    echo "1. Go to Supabase Dashboard > SQL Editor"
    echo "2. Copy contents of: supabase/migrations/20250114000000_remove_user_id_from_app_setting.sql"
    echo "3. Paste and run"
    exit 1
fi






