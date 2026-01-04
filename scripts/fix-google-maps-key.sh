#!/bin/bash
# Script to fix Google Maps API key in AndroidManifest.xml
# This can be called from multiple build hooks to ensure it runs

set +e  # Don't exit on error

ANDROID_MANIFEST="android/app/src/main/AndroidManifest.xml"

# Get API key from environment
API_KEY="${EXPO_PUBLIC_GOOGLE_MAPS_API_KEY}"

# Try to read from .env file if not set
if [ -z "$API_KEY" ] && [ -f ".env" ]; then
  API_KEY=$(grep "^EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=" .env | cut -d '=' -f2 | tr -d '"' | tr -d "'" | xargs)
fi

# Remove placeholder syntax if present in the API key itself
if [ -n "$API_KEY" ]; then
  API_KEY=$(echo "$API_KEY" | sed 's/\${EXPO_PUBLIC_GOOGLE_MAPS_API_KEY}//g' | xargs)
fi

# Check if manifest exists and API key is set
if [ ! -f "$ANDROID_MANIFEST" ]; then
  echo "AndroidManifest.xml not found at $ANDROID_MANIFEST"
  exit 0  # Not an error if manifest doesn't exist yet
fi

if [ -z "$API_KEY" ] || [ "$API_KEY" = "" ]; then
  echo "Warning: EXPO_PUBLIC_GOOGLE_MAPS_API_KEY is not set"
  echo "Google Maps API key placeholder will remain in AndroidManifest.xml"
  exit 0  # Don't fail, just warn
fi

# Check if placeholder exists in manifest
if ! grep -q "\${EXPO_PUBLIC_GOOGLE_MAPS_API_KEY}" "$ANDROID_MANIFEST"; then
  echo "No placeholder found in AndroidManifest.xml (may already be replaced)"
  exit 0
fi

echo "Found placeholder in AndroidManifest.xml, replacing with API key..."

# Use perl for reliable replacement (handles special characters)
if command -v perl >/dev/null 2>&1; then
  perl -i -pe "s/\$\{EXPO_PUBLIC_GOOGLE_MAPS_API_KEY\}/$API_KEY/g" "$ANDROID_MANIFEST"
  REPLACE_EXIT=$?
else
  # Fallback to sed if perl is not available
  sed -i.bak "s|\${EXPO_PUBLIC_GOOGLE_MAPS_API_KEY}|$API_KEY|g" "$ANDROID_MANIFEST"
  REPLACE_EXIT=$?
  rm -f "${ANDROID_MANIFEST}.bak" 2>/dev/null
fi

# Verify replacement worked
if grep -q "\${EXPO_PUBLIC_GOOGLE_MAPS_API_KEY}" "$ANDROID_MANIFEST"; then
  echo "Warning: Placeholder still exists after replacement attempt"
  echo "Trying alternative replacement method..."
  
  # Alternative: use sed with different escaping
  sed -i "s|\\\${EXPO_PUBLIC_GOOGLE_MAPS_API_KEY}|$API_KEY|g" "$ANDROID_MANIFEST"
  
  # Check again
  if grep -q "\${EXPO_PUBLIC_GOOGLE_MAPS_API_KEY}" "$ANDROID_MANIFEST"; then
    echo "Error: Failed to replace placeholder in AndroidManifest.xml"
    exit 1
  fi
fi

echo "✅ Successfully replaced Google Maps API key placeholder in AndroidManifest.xml"
exit 0

