#!/bin/bash

# Run Afternoon Greeting Migration Script
# This script executes the 20260106000000_schedule_afternoon_greeting.sql file against your Supabase database

echo "🚀 Running Afternoon Greeting Migration..."
echo ""
echo "This migration will:"
echo "1. Create function to call the afternoon greeting edge function"
echo "2. Schedule cron job to run daily at 12:00 PM (noon) UTC"
echo "3. Send afternoon greetings with notifications to all users"
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
    echo "2. Copy contents of: supabase/migrations/20260106000000_schedule_afternoon_greeting.sql"
    echo "3. Paste and run"
    exit 1
fi

# Extract DATABASE_URL from .env
DATABASE_URL=$(grep "^DATABASE_URL=" "$ENV_FILE" | cut -d'=' -f2-)

if [ -z "$DATABASE_URL" ]; then
    echo "⚠️  DATABASE_URL not found in .env file"
    echo ""
    echo "📝 You can run this migration in one of these ways:"
    echo ""
    echo "OPTION 1: Supabase Dashboard (Recommended)"
    echo "1. Go to: https://supabase.com/dashboard/project/bbydsaxduuwbnwqmiant/sql/new"
    echo "2. Copy contents of: supabase/migrations/20260106000000_schedule_afternoon_greeting.sql"
    echo "3. Paste and run"
    echo ""
    echo "OPTION 2: Using psql with database password"
    echo "  psql 'postgresql://postgres:[PASSWORD]@db.bbydsaxduuwbnwqmiant.supabase.co:5432/postgres' \\"
    echo "    -f supabase/migrations/20260106000000_schedule_afternoon_greeting.sql"
    echo ""
    echo "OPTION 3: Using Supabase CLI"
    echo "  supabase db push --linked"
    echo ""
    exit 1
fi

echo "📋 Connecting to database..."
echo ""

# Run the SQL migration
psql "$DATABASE_URL" -f "$SCRIPT_DIR/migrations/20260106000000_schedule_afternoon_greeting.sql"

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Afternoon greeting migration completed successfully!"
    echo ""
    echo "📝 Verification:"
    echo "1. Check Supabase Dashboard > Database > Cron Jobs"
    echo "2. Verify 'send-afternoon-greeting' job exists and is scheduled for 12:00 PM UTC"
    echo "3. Verify function 'call_afternoon_greeting_edge_function' exists"
    echo ""
    echo "💡 To test the function manually:"
    echo "   SELECT call_afternoon_greeting_edge_function();"
    echo ""
    echo "⚠️  IMPORTANT: Make sure the edge function is deployed:"
    echo "   supabase functions deploy send-goodafternoon-greeting"
    echo ""
else
    echo ""
    echo "❌ Migration failed. Please check the error messages above."
    echo ""
    echo "📝 Alternative: Run the SQL manually in Supabase Dashboard:"
    echo "1. Go to: https://supabase.com/dashboard/project/bbydsaxduuwbnwqmiant/sql/new"
    echo "2. Copy contents of: supabase/migrations/20260106000000_schedule_afternoon_greeting.sql"
    echo "3. Paste and run"
    exit 1
fi
