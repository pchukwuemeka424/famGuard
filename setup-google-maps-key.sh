#!/bin/bash
# Script to help set up Google Maps API key in EAS
# Note: EXPO_PUBLIC_ variables are PUBLIC and will be embedded in the app bundle
# This is safe for Google Maps API keys as they should be restricted by package name/bundle ID

echo "Google Maps API Key Setup"
echo "========================="
echo ""
echo "This script will help you set up the EXPO_PUBLIC_GOOGLE_MAPS_API_KEY in EAS."
echo ""
echo "Note: This is a PUBLIC variable (EXPO_PUBLIC_ prefix) and will be embedded in your app."
echo "Make sure to restrict your Google Maps API key in Google Cloud Console to:"
echo "  - Android: Package name: com.famguardacehubtech"
echo "  - iOS: Bundle ID: com.famguardacehubtech"
echo ""
read -p "Do you have a Google Maps API key? (y/n): " has_key

if [ "$has_key" = "y" ] || [ "$has_key" = "Y" ]; then
  read -p "Enter your Google Maps API key: " api_key
  if [ -n "$api_key" ]; then
    echo ""
    echo "Setting up EAS environment variable (public, not a secret)..."
    eas secret:create --scope project --name EXPO_PUBLIC_GOOGLE_MAPS_API_KEY --value "$api_key" --type string
    echo ""
    echo "✅ Done! The API key has been set as a public environment variable in EAS."
    echo "   It will be embedded in your app bundle during builds."
  else
    echo "No API key provided. Exiting."
  fi
else
  echo ""
  echo "To get a Google Maps API key:"
  echo "1. Go to https://console.cloud.google.com/"
  echo "2. Create a new project or select an existing one"
  echo "3. Enable 'Maps SDK for Android' and 'Maps SDK for iOS'"
  echo "4. Go to Credentials → Create Credentials → API Key"
  echo "5. IMPORTANT: Restrict the key to:"
echo "   - Android package: com.famguardacehubtech"
echo "   - iOS bundle ID: com.famguardacehubtech"
  echo ""
  echo "Then run this script again or use:"
  echo "  eas secret:create --scope project --name EXPO_PUBLIC_GOOGLE_MAPS_API_KEY --value 'YOUR_KEY' --type string"
  echo ""
  echo "Note: Even though we use 'secret:create', EXPO_PUBLIC_ variables are public"
  echo "      and will be embedded in your app bundle. This is expected behavior."
fi
