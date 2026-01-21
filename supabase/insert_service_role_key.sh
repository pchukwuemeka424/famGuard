#!/bin/bash

# ============================================
# Script to Insert Service Role Key
# ============================================

DB_URL="postgresql://postgres:eYHNPishBvzReZ6P@db.bbydsaxduuwbnwqmiant.supabase.co:5432/postgres"

echo "============================================"
echo "Insert Service Role Key"
echo "============================================"
echo ""
echo "This will insert your Supabase service_role key into the database."
echo ""
echo "Get your service_role key from:"
echo "  https://supabase.com/dashboard/project/bbydsaxduuwbnwqmiant/settings/api"
echo ""
echo "Look for the 'service_role' key (NOT the 'anon' key)"
echo ""

read -p "Enter your service_role key: " SERVICE_KEY

if [ -z "$SERVICE_KEY" ]; then
    echo "❌ Service role key is required. Exiting."
    exit 1
fi

echo ""
echo "Inserting service role key..."

# Create temporary SQL file
TEMP_SQL=$(mktemp)
cat > "$TEMP_SQL" << EOF
INSERT INTO app_config (key, value, description) 
VALUES (
  'supabase_service_role_key', 
  '$SERVICE_KEY',
  'Service role key for edge functions'
)
ON CONFLICT (key) 
DO UPDATE SET 
  value = EXCLUDED.value,
  updated_at = NOW();

SELECT 
  key, 
  CASE 
    WHEN value IS NOT NULL AND length(value) > 20 THEN '✅ Configured (' || length(value) || ' chars)'
    ELSE '❌ Not configured properly'
  END as status,
  description,
  updated_at
FROM app_config 
WHERE key = 'supabase_service_role_key';
EOF

# Run the SQL
psql "$DB_URL" -f "$TEMP_SQL"

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Service role key inserted successfully!"
    echo ""
    echo "The morning greeting cron job is now fully configured."
    echo "It will run daily at 8:00 AM UTC and send push notifications"
    echo "to all registered users."
    echo ""
    echo "To test it manually, run:"
    echo "  psql \"$DB_URL\" -c \"SELECT call_morning_greeting_edge_function();\""
else
    echo ""
    echo "❌ Failed to insert service role key. Please check the error above."
    rm "$TEMP_SQL"
    exit 1
fi

# Clean up
rm "$TEMP_SQL"
