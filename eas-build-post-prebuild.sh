#!/bin/bash
# EAS Build Post-Prebuild Hook
# This script runs AFTER prebuild completes
# It's the final chance to fix the Google Maps API key before Gradle runs

set +e  # Don't exit on error

echo "=========================================="
echo "Post-Prebuild: Final Google Maps API Key Fix"
echo "=========================================="

ANDROID_MANIFEST="android/app/src/main/AndroidManifest.xml"

# Get API key from environment
API_KEY="${EXPO_PUBLIC_GOOGLE_MAPS_API_KEY}"

# Try to read from .env if not set
if [ -z "$API_KEY" ] && [ -f ".env" ]; then
  API_KEY=$(grep "^EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=" .env | cut -d '=' -f2 | tr -d '"' | tr -d "'" | xargs)
fi

# Try .env.example as fallback
if [ -z "$API_KEY" ] && [ -f ".env.example" ]; then
  API_KEY=$(grep "^EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=" .env.example | cut -d '=' -f2 | tr -d '"' | tr -d "'" | xargs)
  if [ -n "$API_KEY" ]; then
    echo "Using API key from .env.example as fallback"
  fi
fi

# Remove placeholder syntax if present
if [ -n "$API_KEY" ]; then
  API_KEY=$(echo "$API_KEY" | sed 's/\${EXPO_PUBLIC_GOOGLE_MAPS_API_KEY}//g' | xargs)
fi

if [ ! -f "$ANDROID_MANIFEST" ]; then
  echo "❌ AndroidManifest.xml not found at $ANDROID_MANIFEST"
  echo "This script should run after prebuild"
  exit 1
fi

if [ -z "$API_KEY" ] || [ "$API_KEY" = "" ]; then
  echo "⚠️  EXPO_PUBLIC_GOOGLE_MAPS_API_KEY not found!"
  echo "⚠️  Checking if placeholder exists in manifest..."
  
  if grep -q "\${EXPO_PUBLIC_GOOGLE_MAPS_API_KEY}" "$ANDROID_MANIFEST"; then
    echo "❌ ERROR: Placeholder still exists in AndroidManifest.xml"
    echo "❌ Removing placeholder to prevent Gradle error..."
    # Remove the placeholder to prevent Gradle from trying to resolve it
    sed -i.bak 's/\${EXPO_PUBLIC_GOOGLE_MAPS_API_KEY}//g' "$ANDROID_MANIFEST"
    rm -f "${ANDROID_MANIFEST}.bak"
    echo "⚠️  Placeholder removed. Build will proceed but Google Maps will not work."
  else
    echo "✅ No placeholder found in manifest"
  fi
  exit 0
fi

# Check if placeholder or empty value exists in manifest
if grep -q "\${EXPO_PUBLIC_GOOGLE_MAPS_API_KEY}" "$ANDROID_MANIFEST"; then
  echo "Found placeholder in AndroidManifest.xml, replacing with API key..."
  
  # Use perl for reliable replacement (handles special characters)
  if command -v perl >/dev/null 2>&1; then
    perl -i -pe "s/\$\{EXPO_PUBLIC_GOOGLE_MAPS_API_KEY\}/$API_KEY/g" "$ANDROID_MANIFEST"
  else
    # Fallback to sed if perl is not available
    sed -i.bak "s|\${EXPO_PUBLIC_GOOGLE_MAPS_API_KEY}|$API_KEY|g" "$ANDROID_MANIFEST"
    rm -f "${ANDROID_MANIFEST}.bak"
  fi
  
  # Verify replacement worked
  if grep -q "\${EXPO_PUBLIC_GOOGLE_MAPS_API_KEY}" "$ANDROID_MANIFEST"; then
    echo "⚠️  Placeholder still exists, trying alternative method..."
    sed -i.bak "s|\\\${EXPO_PUBLIC_GOOGLE_MAPS_API_KEY}|$API_KEY|g" "$ANDROID_MANIFEST"
    rm -f "${ANDROID_MANIFEST}.bak"
  fi
  
  # Final check
  if ! grep -q "\${EXPO_PUBLIC_GOOGLE_MAPS_API_KEY}" "$ANDROID_MANIFEST"; then
    echo "✅ Successfully replaced Google Maps API key placeholder"
  else
    echo "❌ Failed to replace placeholder, removing it to prevent build failure"
    sed -i.bak 's/\${EXPO_PUBLIC_GOOGLE_MAPS_API_KEY}//g' "$ANDROID_MANIFEST"
    rm -f "${ANDROID_MANIFEST}.bak"
  fi
elif grep -q 'android:name="com.google.android.geo.API_KEY"' "$ANDROID_MANIFEST"; then
  # Check if the key exists but might be empty
  if grep -q 'android:name="com.google.android.geo.API_KEY" android:value=""' "$ANDROID_MANIFEST"; then
    echo "Found empty API key value, replacing with actual key..."
    sed -i.bak "s|android:name=\"com.google.android.geo.API_KEY\" android:value=\"\"|android:name=\"com.google.android.geo.API_KEY\" android:value=\"$API_KEY\"|g" "$ANDROID_MANIFEST"
    rm -f "${ANDROID_MANIFEST}.bak"
    echo "✅ Updated empty API key with actual value"
  else
    echo "✅ Google Maps API key already set in manifest"
  fi
else
  echo "✅ No issues found in AndroidManifest.xml"
fi

echo ""
echo "Post-prebuild hook completed successfully"
exit 0

