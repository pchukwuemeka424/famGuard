#!/bin/bash

# ============================================
# Script to set up Morning Greeting Push Notifications
# ============================================
# This script helps you deploy and schedule the morning greeting
# edge function that sends push notifications to all users daily at 8am

echo "============================================"
echo "Morning Greeting Setup Script"
echo "============================================"
echo ""
echo "This will help you set up daily morning greeting push notifications"
echo "that are sent to ALL registered users every day at 8:00 AM."
echo ""

# Check if Supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI is not installed."
    echo ""
    echo "Install it with:"
    echo "  npm install -g supabase"
    echo ""
    echo "Or visit: https://supabase.com/docs/guides/cli"
    exit 1
fi

echo "✅ Supabase CLI found"
echo ""

# Step 1: Deploy the Edge Function
echo "STEP 1: Deploying the Edge Function..."
echo "----------------------------------------"
echo ""
read -p "Do you want to deploy the send-morning-greeting function? (y/n) " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Deploying edge function..."
    supabase functions deploy send-morning-greeting
    
    if [ $? -eq 0 ]; then
        echo "✅ Edge function deployed successfully!"
    else
        echo "❌ Failed to deploy edge function"
        exit 1
    fi
else
    echo "⏭️  Skipping edge function deployment"
fi

echo ""
echo "============================================"
echo "STEP 2: Schedule the Function"
echo "============================================"
echo ""
echo "Now you need to schedule the function to run daily at 8:00 AM."
echo ""
echo "Choose your scheduling method:"
echo ""
echo "OPTION A: Supabase Dashboard (Recommended)"
echo "  1. Go to: https://supabase.com/dashboard/project/YOUR_PROJECT/database/cron"
echo "  2. Click 'New Cron Job'"
echo "  3. Configure:"
echo "     - Name: send-morning-greeting"
echo "     - Schedule: 0 8 * * * (8:00 AM UTC daily)"
echo "     - SQL: See instructions in migration file"
echo ""
echo "OPTION B: External Cron Service (Works on all plans)"
echo "  Use cron-job.org, EasyCron, or GitHub Actions:"
echo "  - URL: https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-morning-greeting"
echo "  - Method: POST"
echo "  - Headers:"
echo "    Authorization: Bearer YOUR_SERVICE_ROLE_KEY"
echo "    Content-Type: application/json"
echo "  - Schedule: Daily at 8:00 AM (adjust timezone as needed)"
echo ""
echo "OPTION C: Manual Testing"
echo "  Test the function manually with:"
echo "  curl -X POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-morning-greeting \\"
echo "    -H \"Authorization: Bearer YOUR_SERVICE_ROLE_KEY\" \\"
echo "    -H \"Content-Type: application/json\""
echo ""

# Get project details
echo "============================================"
echo "Your Project Details"
echo "============================================"
echo ""
echo "To find your project details:"
echo "  1. Go to: https://supabase.com/dashboard"
echo "  2. Select your project"
echo "  3. Go to Settings > API"
echo "  4. Copy:"
echo "     - Project URL (for the function URL)"
echo "     - service_role key (for Authorization header)"
echo ""

read -p "Do you want to test the function now? (y/n) " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo ""
    read -p "Enter your Supabase project URL (e.g., https://xxxxx.supabase.co): " SUPABASE_URL
    read -p "Enter your service_role key: " SERVICE_KEY
    
    echo ""
    echo "Testing the function..."
    echo ""
    
    response=$(curl -s -w "\n%{http_code}" -X POST "${SUPABASE_URL}/functions/v1/send-morning-greeting" \
      -H "Authorization: Bearer ${SERVICE_KEY}" \
      -H "Content-Type: application/json" \
      -d '{}')
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" -eq 200 ]; then
        echo "✅ Function test successful!"
        echo "Response: $body"
    else
        echo "❌ Function test failed (HTTP $http_code)"
        echo "Response: $body"
    fi
fi

echo ""
echo "============================================"
echo "Setup Complete!"
echo "============================================"
echo ""
echo "The morning greeting function is ready to use."
echo "Make sure to schedule it using one of the options above."
echo ""
echo "The function will send a push notification to ALL users"
echo "with push tokens registered in the user_push_tokens table."
echo ""
echo "Message: '🌅 Good Morning! FamGuard wishes you a safe"
echo "and wonderful day ahead. Stay protected!'"
echo ""
