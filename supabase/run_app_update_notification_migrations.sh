#!/bin/bash

# Run App Update Notification Migrations Script
# This script executes all three migrations for app update notifications:
# 1. Add app_update_notification_enabled column to app_setting table
# 2. Add app_update notification type
# 3. Schedule cron job to run every 2 hours

echo "🚀 Running App Update Notification Migrations..."
echo ""
echo "This will:"
echo "1. Add app_update_notification_enabled column to app_setting table"
echo "2. Add 'app_update' to notification types"
echo "3. Schedule cron job to check and send notifications every 2 hours"
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
    echo "2. Run migrations in order:"
    echo "   - 20260121000001_add_app_update_notification_enabled.sql"
    echo "   - 20260121000002_add_app_update_notification_type.sql"
    echo "   - 20260121000003_schedule_app_update_notification.sql"
    exit 1
fi

# Extract DATABASE_URL from .env
DATABASE_URL=$(grep "^DATABASE_URL=" "$ENV_FILE" | cut -d'=' -f2-)

if [ -z "$DATABASE_URL" ]; then
    echo "❌ Error: DATABASE_URL not found in .env file"
    echo ""
    echo "📝 Alternative: Run the SQL manually in Supabase Dashboard:"
    echo "1. Go to Supabase Dashboard > SQL Editor"
    echo "2. Run migrations in order:"
    echo "   - 20260121000001_add_app_update_notification_enabled.sql"
    echo "   - 20260121000002_add_app_update_notification_type.sql"
    echo "   - 20260121000003_schedule_app_update_notification.sql"
    exit 1
fi

echo "📋 Connecting to database..."
echo ""

# Migration 1: Add app_update_notification_enabled column
echo "📝 Running Migration 1: Add app_update_notification_enabled column..."
psql "$DATABASE_URL" -f "$SCRIPT_DIR/migrations/20260121000001_add_app_update_notification_enabled.sql"

if [ $? -ne 0 ]; then
    echo ""
    echo "❌ Migration 1 failed. Please check the error messages above."
    exit 1
fi

echo ""
echo "✅ Migration 1 completed successfully!"
echo ""

# Migration 2: Add app_update notification type
echo "📝 Running Migration 2: Add app_update notification type..."
psql "$DATABASE_URL" -f "$SCRIPT_DIR/migrations/20260121000002_add_app_update_notification_type.sql"

if [ $? -ne 0 ]; then
    echo ""
    echo "❌ Migration 2 failed. Please check the error messages above."
    exit 1
fi

echo ""
echo "✅ Migration 2 completed successfully!"
echo ""

# Migration 3: Schedule cron job
echo "📝 Running Migration 3: Schedule cron job (every 2 hours)..."
echo "⚠️  Note: You may need to update the project_ref and service_role_key in the migration file"
echo ""

# Check if SUPABASE_SERVICE_ROLE_KEY is set in .env
SERVICE_ROLE_KEY=$(grep "^SUPABASE_SERVICE_ROLE_KEY=" "$ENV_FILE" | cut -d'=' -f2-)
PROJECT_REF=$(grep "^SUPABASE_PROJECT_REF=" "$ENV_FILE" | cut -d'=' -f2-)

if [ -n "$SERVICE_ROLE_KEY" ] && [ -n "$PROJECT_REF" ]; then
    echo "✅ Found SERVICE_ROLE_KEY and PROJECT_REF in .env, creating temporary migration file..."
    TEMP_SQL=$(mktemp)
    sed "s/YOUR_SERVICE_ROLE_KEY/${SERVICE_ROLE_KEY}/g; s/bbydsaxduuwbnwqmiant/${PROJECT_REF}/g" \
        "$SCRIPT_DIR/migrations/20260121000003_schedule_app_update_notification.sql" > "$TEMP_SQL"
    
    psql "$DATABASE_URL" -f "$TEMP_SQL"
    MIGRATION_STATUS=$?
    rm "$TEMP_SQL"
    
    if [ $MIGRATION_STATUS -ne 0 ]; then
        echo ""
        echo "❌ Migration 3 failed. Please check the error messages above."
        exit 1
    fi
else
    echo "⚠️  SERVICE_ROLE_KEY or PROJECT_REF not found in .env"
    echo "   Running migration as-is. You may need to update it manually:"
    echo "   - Replace 'bbydsaxduuwbnwqmiant' with your project reference"
    echo "   - Replace 'YOUR_SERVICE_ROLE_KEY' with your service role key"
    echo ""
    psql "$DATABASE_URL" -f "$SCRIPT_DIR/migrations/20260121000003_schedule_app_update_notification.sql"
    
    if [ $? -ne 0 ]; then
        echo ""
        echo "❌ Migration 3 failed. Please check the error messages above."
        echo "   You may need to update the migration file with correct values."
        exit 1
    fi
fi

echo ""
echo "✅ Migration 3 completed successfully!"
echo ""
echo "🎉 All migrations completed successfully!"
echo ""
echo "📝 Verification:"
echo "1. Check Supabase Dashboard > Table Editor > app_setting"
echo "2. Verify app_update_notification_enabled column exists"
echo "3. Check cron jobs: SELECT * FROM cron.job WHERE jobname = 'send-app-update-notification';"
echo ""
echo "💡 To enable app update notifications:"
echo "   UPDATE app_setting SET app_update_notification_enabled = true WHERE id = '00000000-0000-0000-0000-000000000000';"
echo ""
echo "📱 Next steps:"
echo "1. Deploy the edge function: supabase functions deploy send-app-update-notification"
echo "2. The cron job will check every 2 hours if notifications are enabled"
echo "3. When enabled, it will send push notifications to all users"
