#!/bin/bash

# ============================================
# Script to run the missing location check migration
# ============================================
# This script helps you apply the migration that sets up
# automatic checking for users with no location history

echo "============================================"
echo "Missing Location Check Migration Script"
echo "============================================"
echo ""
echo "This migration will:"
echo "1. Create find_users_without_location_history() function"
echo "2. Create check_missing_location_and_notify() function"
echo ""
echo "The system will:"
echo "- Check for users with no location history in last 24 hours"
echo "- Send polite push notifications: 'Are you safe?'"
echo "- Only notify users who have push tokens registered"
echo "- Only notify users who created account more than 1 day ago"
echo ""
echo "To schedule automatic checks:"
echo ""
echo "OPTION 1: Deploy Edge Function and Schedule via Dashboard"
echo "  1. Deploy the edge function:"
echo "     supabase functions deploy check-missing-location"
echo "  2. Go to Supabase Dashboard > Database > Cron Jobs"
echo "  3. Create cron job:"
echo "     - Function: check-missing-location"
echo "     - Schedule: 0 8,20 * * * (8 AM and 8 PM daily)"
echo ""
echo "OPTION 2: Use External Cron Service"
echo "  - URL: https://YOUR_PROJECT.supabase.co/functions/v1/check-missing-location"
echo "  - Method: POST"
echo "  - Headers: Authorization: Bearer YOUR_SERVICE_ROLE_KEY"
echo "  - Schedule: Every 12 hours"
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
echo "   supabase/migrations/20260103000001_check_missing_location_notifications.sql"
echo "4. Run the SQL"
echo ""
echo "Alternatively, if you have Supabase CLI installed:"
echo "  supabase db push"
echo ""
echo "To manually test the functions:"
echo "  SELECT * FROM find_users_without_location_history();"
echo "  SELECT check_missing_location_and_notify();"
echo ""
