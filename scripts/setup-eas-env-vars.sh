#!/bin/bash
# Script to set up EAS environment variables for the new project
# Run this to ensure all environment variables are set

export EXPO_TOKEN="ewxsvviM4-BUrZfgMIi47VL2R2X1N9QYcX7_rQ9x"

echo "=========================================="
echo "Setting up EAS Environment Variables"
echo "=========================================="
echo ""
echo "This script will help you set environment variables for project:"
echo "84162762-f743-411c-8b9a-0ed643cdb7a2"
echo ""
echo "You'll need to provide values for:"
echo "1. EXPO_PUBLIC_SUPABASE_URL"
echo "2. EXPO_PUBLIC_SUPABASE_ANON_KEY"
echo "3. EXPO_PUBLIC_EXPO_PROJECT_ID"
echo "4. EXPO_PUBLIC_GOOGLE_MAPS_API_KEY"
echo "5. EXPO_PUBLIC_DELETE_ACCOUNT_URL (optional)"
echo ""
echo "Run these commands (replace with your actual values):"
echo ""
echo "eas env:create --scope project --name EXPO_PUBLIC_SUPABASE_URL --value 'YOUR_SUPABASE_URL' --environment production"
echo "eas env:create --scope project --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value 'YOUR_SUPABASE_KEY' --environment production"
echo "eas env:create --scope project --name EXPO_PUBLIC_EXPO_PROJECT_ID --value 'YOUR_EXPO_PROJECT_ID' --environment production"
echo "eas env:create --scope project --name EXPO_PUBLIC_GOOGLE_MAPS_API_KEY --value 'YOUR_GOOGLE_MAPS_KEY' --environment production"
echo "eas env:create --scope project --name EXPO_PUBLIC_DELETE_ACCOUNT_URL --value 'https://safezone.app/delete-account' --environment production"
echo ""
echo "=========================================="

