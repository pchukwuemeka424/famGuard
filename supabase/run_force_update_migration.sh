#!/bin/bash

# Run Force Update Required Migration Script
# This script executes the 20260103000007_add_force_update_required_to_app_setting.sql file against your Supabase database

echo "🚀 Running Force Update Required Migration..."
echo ""
echo "This migration will:"
echo "1. Add force_update_required column to app_setting table"
echo "2. Set default value to false"
echo "3. If TRUE: Shows update screen and locks the app"
echo "4. If FALSE: Does not show update screen"
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
    echo "2. Copy contents of: supabase/migrations/20260103000007_add_force_update_required_to_app_setting.sql"
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
    echo "2. Copy contents of: supabase/migrations/20260103000007_add_force_update_required_to_app_setting.sql"
    echo "3. Paste and run"
    exit 1
fi

echo "📋 Connecting to database..."
echo ""

# Run the SQL migration
psql "$DATABASE_URL" -f "$SCRIPT_DIR/migrations/20260103000007_add_force_update_required_to_app_setting.sql"

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Force update required migration completed successfully!"
    echo ""
    echo "📝 Verification:"
    echo "1. Check Supabase Dashboard > Table Editor > app_setting"
    echo "2. You should see the 'force_update_required' column"
    echo "3. Default value should be false"
    echo ""
    echo "💡 To enable force update (lock app with update screen):"
    echo "   UPDATE app_setting SET force_update_required = true WHERE id = '00000000-0000-0000-0000-000000000000';"
    echo ""
    echo "💡 To disable force update:"
    echo "   UPDATE app_setting SET force_update_required = false WHERE id = '00000000-0000-0000-0000-000000000000';"
    echo ""
else
    echo ""
    echo "❌ Migration failed. Please check the error messages above."
    echo ""
    echo "📝 Alternative: Run the SQL manually in Supabase Dashboard:"
    echo "1. Go to Supabase Dashboard > SQL Editor"
    echo "2. Copy contents of: supabase/migrations/20260103000007_add_force_update_required_to_app_setting.sql"
    echo "3. Paste and run"
fi
