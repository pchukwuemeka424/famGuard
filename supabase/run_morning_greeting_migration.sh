#!/bin/bash

# ============================================
# Script to run Morning Greeting Migration
# ============================================
# This script helps you run the migration to set up the morning greeting cron job

DB_URL="postgresql://postgres:eYHNPishBvzReZ6P@db.bbydsaxduuwbnwqmiant.supabase.co:5432/postgres"
PROJECT_REF="bbydsaxduuwbnwqmiant"

echo "============================================"
echo "Morning Greeting Migration Script"
echo "============================================"
echo ""
echo "This will set up a cron job to send morning greetings"
echo "to all registered users every day at 8:00 AM UTC."
echo ""

# Prompt for service role key
echo "You need your Supabase service_role key."
echo "Get it from: https://supabase.com/dashboard/project/${PROJECT_REF}/settings/api"
echo ""
read -p "Enter your service_role key: " SERVICE_KEY

if [ -z "$SERVICE_KEY" ]; then
    echo "❌ Service role key is required. Exiting."
    exit 1
fi

echo ""
echo "Running migration..."

# Create a temporary SQL file with the service role key replaced
TEMP_SQL=$(mktemp)
sed "s/YOUR_SERVICE_ROLE_KEY/${SERVICE_KEY}/g" \
    "supabase/migrations/20260105000000_schedule_morning_greeting_executable.sql" > "$TEMP_SQL"

# Run the migration
psql "$DB_URL" -f "$TEMP_SQL"

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Migration completed successfully!"
    echo ""
    echo "The morning greeting will be sent to all users daily at 8:00 AM UTC."
    echo ""
    echo "To test it manually, run:"
    echo "  psql \"$DB_URL\" -c \"SELECT call_morning_greeting_edge_function();\""
    echo ""
    echo "To check the scheduled job:"
    echo "  psql \"$DB_URL\" -c \"SELECT * FROM cron.job WHERE jobname = 'send-morning-greeting';\""
else
    echo ""
    echo "❌ Migration failed. Please check the error messages above."
    exit 1
fi

# Clean up temp file
rm "$TEMP_SQL"
