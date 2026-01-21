#!/bin/bash

# ============================================
# Direct Migration Runner (with environment variable)
# ============================================
# Usage: SUPABASE_SERVICE_ROLE_KEY=your_key ./run_morning_greeting_migration_direct.sh

DB_URL="postgresql://postgres:eYHNPishBvzReZ6P@db.bbydsaxduuwbnwqmiant.supabase.co:5432/postgres"
PROJECT_REF="bbydsaxduuwbnwqmiant"
SERVICE_KEY="${SUPABASE_SERVICE_ROLE_KEY}"

if [ -z "$SERVICE_KEY" ]; then
    echo "❌ Error: SUPABASE_SERVICE_ROLE_KEY environment variable is not set"
    echo ""
    echo "Usage:"
    echo "  SUPABASE_SERVICE_ROLE_KEY=your_key ./supabase/run_morning_greeting_migration_direct.sh"
    echo ""
    echo "Or get your service role key from:"
    echo "  https://supabase.com/dashboard/project/${PROJECT_REF}/settings/api"
    exit 1
fi

echo "Running morning greeting migration..."
echo "Project: ${PROJECT_REF}"
echo ""

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
    echo "To test it manually:"
    echo "  psql \"$DB_URL\" -c \"SELECT call_morning_greeting_edge_function();\""
else
    echo ""
    echo "❌ Migration failed. Please check the error messages above."
    rm "$TEMP_SQL"
    exit 1
fi

# Clean up temp file
rm "$TEMP_SQL"
