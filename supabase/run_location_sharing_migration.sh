#!/bin/bash

# Run Location Sharing Migration Script
# This script executes the 20250120000000_add_location_sharing_to_connections.sql file against your Supabase database

echo "🚀 Running Location Sharing Migration..."
echo ""
echo "This migration will:"
echo "1. Add location_sharing_enabled column to connections table"
echo "2. Create index for faster queries"
echo "3. Set default value to true for existing connections"
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
    echo "2. Copy contents of: supabase/migrations/20250120000000_add_location_sharing_to_connections.sql"
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
    echo "2. Copy contents of: supabase/migrations/20250120000000_add_location_sharing_to_connections.sql"
    echo "3. Paste and run"
    exit 1
fi

echo "📋 Connecting to database..."
echo ""

# Run the SQL migration
psql "$DATABASE_URL" -f "$SCRIPT_DIR/migrations/20250120000000_add_location_sharing_to_connections.sql"

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Location sharing migration completed successfully!"
    echo ""
    echo "📝 Verification:"
    echo "1. Check Supabase Dashboard > Table Editor > connections"
    echo "2. Verify location_sharing_enabled column exists"
    echo "3. All existing connections should have location_sharing_enabled = true"
    echo ""
else
    echo ""
    echo "❌ Migration failed. Please check the error messages above."
    echo ""
    echo "📝 Alternative: Run the SQL manually in Supabase Dashboard:"
    echo "1. Go to Supabase Dashboard > SQL Editor"
    echo "2. Copy contents of: supabase/migrations/20250120000000_add_location_sharing_to_connections.sql"
    echo "3. Paste and run"
    exit 1
fi

