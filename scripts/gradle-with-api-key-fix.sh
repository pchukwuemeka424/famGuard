#!/bin/bash
# Wrapper script for Gradle that ensures Google Maps API key is fixed before building
# This runs right before Gradle executes, ensuring the manifest is fixed

set +e  # Don't exit on error

echo "=========================================="
echo "Gradle Wrapper: Fixing Google Maps API Key"
echo "=========================================="

# Run the fix script first
if [ -f "scripts/fix-google-maps-key.sh" ]; then
  echo "Running Google Maps API key fix script..."
  bash scripts/fix-google-maps-key.sh
  FIX_EXIT=$?
  
  if [ $FIX_EXIT -eq 0 ]; then
    echo "✅ Google Maps API key fix completed successfully"
  else
    echo "⚠️  Google Maps API key fix had issues, but continuing with build..."
  fi
else
  echo "⚠️  Fix script not found, trying direct fix..."
  
  # Direct fix if script doesn't exist
  ANDROID_MANIFEST="android/app/src/main/AndroidManifest.xml"
  API_KEY="${EXPO_PUBLIC_GOOGLE_MAPS_API_KEY}"
  
  # Remove placeholder syntax if present
  if [ -n "$API_KEY" ]; then
    API_KEY=$(echo "$API_KEY" | sed 's/\${EXPO_PUBLIC_GOOGLE_MAPS_API_KEY}//g' | xargs)
  fi
  
  if [ -f "$ANDROID_MANIFEST" ] && [ -n "$API_KEY" ] && [ "$API_KEY" != "" ]; then
    if grep -q "\${EXPO_PUBLIC_GOOGLE_MAPS_API_KEY}" "$ANDROID_MANIFEST"; then
      echo "Fixing Google Maps API key in AndroidManifest.xml..."
      perl -i -pe "s/\$\{EXPO_PUBLIC_GOOGLE_MAPS_API_KEY\}/$API_KEY/g" "$ANDROID_MANIFEST" 2>/dev/null || \
      sed -i "s|\${EXPO_PUBLIC_GOOGLE_MAPS_API_KEY}|$API_KEY|g" "$ANDROID_MANIFEST"
      echo "✅ API key replaced directly"
    fi
  fi
fi

echo ""
echo "=========================================="
echo "Running Gradle build..."
echo "=========================================="
echo ""

# Run the actual Gradle command passed as arguments
exec ./gradlew "$@"

