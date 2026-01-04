#!/bin/bash
# EAS Build Post-Install Hook
# This script runs after dependencies are installed
# Fix Google Maps API key placeholder substitution

set +e  # Don't exit on error

echo "EAS Build Post-Install: Setting up Google Maps API key..."

# First try to read from .env file if it exists
API_KEY=""
if [ -f ".env" ]; then
  echo "Reading API key from .env file..."
  API_KEY=$(grep "^EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=" .env | cut -d '=' -f2 | tr -d '"' | tr -d "'" | xargs)
  if [ -n "$API_KEY" ]; then
    echo "Found API key in .env file: ${API_KEY:0:20}..."
    export EXPO_PUBLIC_GOOGLE_MAPS_API_KEY="$API_KEY"
  fi
fi

# Fall back to environment variable if not found in .env
if [ -z "$API_KEY" ]; then
  API_KEY="${EXPO_PUBLIC_GOOGLE_MAPS_API_KEY}"
  if [ -n "$API_KEY" ]; then
    echo "Found API key in environment: ${API_KEY:0:20}..."
    export EXPO_PUBLIC_GOOGLE_MAPS_API_KEY="$API_KEY"
  fi
fi

if [ -z "$API_KEY" ]; then
  echo "Warning: EXPO_PUBLIC_GOOGLE_MAPS_API_KEY not found in .env or environment"
  echo "Will use value from EAS secrets during build"
else
  echo "Google Maps API key set: ${API_KEY:0:20}..."
fi

# Create a script that will run after prebuild to fix the manifest
cat > /tmp/fix-manifest.sh << 'FIX_SCRIPT'
#!/bin/bash
set +e
ANDROID_MANIFEST="android/app/src/main/AndroidManifest.xml"
# Use environment variable only - no hardcoded fallback
API_KEY="${EXPO_PUBLIC_GOOGLE_MAPS_API_KEY}"

if [ -z "$API_KEY" ]; then
  echo "Warning: EXPO_PUBLIC_GOOGLE_MAPS_API_KEY is not set"
  echo "Skipping AndroidManifest.xml update - plugin will handle it"
  exit 0
fi

if [ -f "$ANDROID_MANIFEST" ]; then
  echo "Fixing Google Maps API key in AndroidManifest.xml..."
  # Use perl for more reliable replacement
  perl -i -pe "s/\$\{EXPO_PUBLIC_GOOGLE_MAPS_API_KEY\}/$API_KEY/g" "$ANDROID_MANIFEST"
  echo "API key replaced in AndroidManifest.xml"
fi
FIX_SCRIPT

chmod +x /tmp/fix-manifest.sh

# Also try to fix it now if AndroidManifest.xml already exists
if [ -f "android/app/src/main/AndroidManifest.xml" ]; then
  echo "AndroidManifest.xml found, fixing now..."
  /tmp/fix-manifest.sh
fi

# Also try using the dedicated fix script if it exists
if [ -f "scripts/fix-google-maps-key.sh" ]; then
  echo "Running dedicated fix script..."
  bash scripts/fix-google-maps-key.sh || true
fi

echo "Post-install hook completed."

exit 0
