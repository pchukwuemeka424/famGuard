#!/bin/bash

# ============================================
# Script to run the incident cleanup migration
# ============================================
# This script helps you apply the migration that sets up
# automatic deletion of incidents older than 3 hours

echo "============================================"
echo "Incident Cleanup Migration Script"
echo "============================================"
echo ""
echo "This migration will:"
echo "1. Enable pg_cron extension"
echo "2. Create cleanup_expired_incidents() function"
echo "3. Schedule automatic cleanup every hour"
echo ""
echo "Note: pg_cron requires Supabase Pro plan or self-hosted PostgreSQL"
echo ""
echo "OPTION 1: Database Function with pg_cron (Pro plan required)"
echo "  - Run the SQL migration file"
echo ""
echo "OPTION 2: Edge Function (Works on all plans)"
echo "  1. Deploy the Edge Function:"
echo "     supabase functions deploy cleanup-expired-incidents"
echo "  2. Schedule it via:"
echo "     - Supabase Dashboard > Database > Cron Jobs"
echo "     - Or external cron service (call function every hour)"
echo ""
read -p "Do you want to continue? (y/n) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Migration cancelled."
  exit 1
fi

echo ""
echo "To apply this migration:"
echo "1. Open your Supabase Dashboard"
echo "2. Go to SQL Editor"
echo "3. Copy and paste the contents of:"
echo "   supabase/migrations/20250116000000_auto_delete_expired_incidents.sql"
echo "4. Run the SQL"
echo ""
echo "Alternatively, if you have Supabase CLI installed:"
echo "  supabase db push"
echo ""
echo "To manually test the cleanup function:"
echo "  SELECT cleanup_expired_incidents();"
echo ""
echo "To check scheduled jobs:"
echo "  SELECT * FROM cron.job;"
echo ""
echo "To unschedule the job:"
echo "  SELECT cron.unschedule('cleanup-expired-incidents');"
echo ""

