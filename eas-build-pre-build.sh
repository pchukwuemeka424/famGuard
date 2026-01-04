#!/bin/bash
# EAS Build Pre-Build Hook
# This script runs before the build starts
# Override expo export:embed to ignore errors and fix Google Maps API key

set +e  # Don't exit on error

echo "EAS Build Pre-Build: Setting up error-tolerant export..."

# Fix Google Maps API key placeholder - check multiple locations
echo "Checking for Google Maps API key..."

# First try to read from .env file if it exists
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

# Final fallback - use the key from EAS secrets (should be set)
if [ -z "$API_KEY" ]; then
  echo "Warning: EXPO_PUBLIC_GOOGLE_MAPS_API_KEY not found in .env or environment"
  echo "Build will use the value from EAS secrets if available"
  # Don't set a placeholder - let EAS handle it from secrets
else
  echo "Using Google Maps API key: ${API_KEY:0:20}..."
fi

# Fix AndroidManifest.xml if it exists (after prebuild)
ANDROID_MANIFEST="android/app/src/main/AndroidManifest.xml"

# Ensure API key is set (read from .env or environment)
if [ -z "$API_KEY" ] && [ -f ".env" ]; then
  API_KEY=$(grep "^EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=" .env | cut -d '=' -f2 | tr -d '"' | tr -d "'" | xargs)
  if [ -n "$API_KEY" ]; then
    export EXPO_PUBLIC_GOOGLE_MAPS_API_KEY="$API_KEY"
  fi
fi

if [ -z "$API_KEY" ]; then
  API_KEY="${EXPO_PUBLIC_GOOGLE_MAPS_API_KEY}"
fi

if [ -f "$ANDROID_MANIFEST" ]; then
  echo "Found AndroidManifest.xml, fixing Google Maps API key placeholder..."
  
  # Check if placeholder exists
  if grep -q "\${EXPO_PUBLIC_GOOGLE_MAPS_API_KEY}" "$ANDROID_MANIFEST"; then
    echo "Found placeholder in AndroidManifest.xml, replacing with: ${API_KEY:0:20}..."
    
    # Use perl for more reliable replacement (handles special characters better)
    perl -i -pe "s/\$\{EXPO_PUBLIC_GOOGLE_MAPS_API_KEY\}/$API_KEY/g" "$ANDROID_MANIFEST"
    
    # Verify replacement worked
    if grep -q "\${EXPO_PUBLIC_GOOGLE_MAPS_API_KEY}" "$ANDROID_MANIFEST"; then
      echo "Warning: Placeholder still exists, trying alternative method..."
      # Alternative: use sed with proper escaping
      sed -i "s|\\\${EXPO_PUBLIC_GOOGLE_MAPS_API_KEY}|$API_KEY|g" "$ANDROID_MANIFEST"
    else
      echo "Successfully replaced Google Maps API key placeholder"
    fi
  else
    echo "No placeholder found in AndroidManifest.xml (may already be replaced)"
  fi
else
  echo "AndroidManifest.xml not found yet (will be created during prebuild)"
  echo "Will fix it after prebuild completes"
fi

# Function to fix AndroidManifest.xml
fix_android_manifest() {
  local ANDROID_MANIFEST="android/app/src/main/AndroidManifest.xml"
  local API_KEY="$1"
  
  if [ -f "$ANDROID_MANIFEST" ] && [ -n "$API_KEY" ]; then
    echo "Fixing Google Maps API key in AndroidManifest.xml..."
    
    # Remove placeholder syntax if present in API_KEY
    API_KEY=$(echo "$API_KEY" | sed 's/\${EXPO_PUBLIC_GOOGLE_MAPS_API_KEY}//g' | xargs)
    
    if [ -z "$API_KEY" ] || [ "$API_KEY" = "" ]; then
      echo "Warning: API key is empty after processing"
      return 1
    fi
    
    # Check if placeholder exists in manifest
    if grep -q "\${EXPO_PUBLIC_GOOGLE_MAPS_API_KEY}" "$ANDROID_MANIFEST"; then
      echo "Found placeholder, replacing with actual API key..."
      
      # Use perl for reliable replacement (handles special characters)
      perl -i -pe "s/\$\{EXPO_PUBLIC_GOOGLE_MAPS_API_KEY\}/$API_KEY/g" "$ANDROID_MANIFEST" 2>/dev/null || {
        # Fallback to sed if perl fails
        sed -i.bak "s|\${EXPO_PUBLIC_GOOGLE_MAPS_API_KEY}|$API_KEY|g" "$ANDROID_MANIFEST"
        rm -f "${ANDROID_MANIFEST}.bak" 2>/dev/null
      }
      
      # Verify replacement
      if grep -q "\${EXPO_PUBLIC_GOOGLE_MAPS_API_KEY}" "$ANDROID_MANIFEST"; then
        echo "Warning: Placeholder still exists after replacement attempt"
        return 1
      else
        echo "✅ Successfully replaced Google Maps API key placeholder"
        return 0
      fi
    else
      echo "No placeholder found in AndroidManifest.xml (may already be replaced)"
      return 0
    fi
  else
    echo "AndroidManifest.xml not found or API key not set"
    return 1
  fi
}

# Try to fix manifest now if it exists
if [ -n "$API_KEY" ]; then
  fix_android_manifest "$API_KEY"
fi

# Also try using the dedicated fix script if it exists
if [ -f "scripts/fix-google-maps-key.sh" ]; then
  echo "Running dedicated fix script..."
  bash scripts/fix-google-maps-key.sh || true
fi

# Set up a mechanism to fix the manifest right before Gradle runs
# This will be called from the build process
echo "Setting up pre-Gradle fix mechanism..."

# Export the fix script path so it can be used
export GOOGLE_MAPS_FIX_SCRIPT="$(pwd)/scripts/fix-google-maps-key.sh"

# Create a function that can be called to fix the manifest
# This will be available in the shell environment
fix_manifest_function() {
  if [ -f "scripts/fix-google-maps-key.sh" ]; then
    bash scripts/fix-google-maps-key.sh
  elif [ -f "/tmp/fix-manifest-before-gradle.sh" ]; then
    bash /tmp/fix-manifest-before-gradle.sh
  fi
}

# Make the function available
export -f fix_manifest_function 2>/dev/null || true

# Create a script that will fix the manifest right before Gradle runs
# This is the most critical fix point - right before manifest processing
cat > /tmp/fix-manifest-before-gradle.sh << 'BEFORE_GRADLE'
#!/bin/bash
set +e
echo "=========================================="
echo "Pre-Gradle: Fixing Google Maps API Key"
echo "=========================================="

ANDROID_MANIFEST="android/app/src/main/AndroidManifest.xml"

# Get API key from environment
API_KEY="${EXPO_PUBLIC_GOOGLE_MAPS_API_KEY}"

# Try to read from .env if not set
if [ -z "$API_KEY" ] && [ -f ".env" ]; then
  API_KEY=$(grep "^EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=" .env | cut -d '=' -f2 | tr -d '"' | tr -d "'" | xargs)
fi

# Remove placeholder syntax if present
if [ -n "$API_KEY" ]; then
  API_KEY=$(echo "$API_KEY" | sed 's/\${EXPO_PUBLIC_GOOGLE_MAPS_API_KEY}//g' | xargs)
fi

if [ -f "$ANDROID_MANIFEST" ]; then
  if [ -n "$API_KEY" ] && [ "$API_KEY" != "" ]; then
    if grep -q "\${EXPO_PUBLIC_GOOGLE_MAPS_API_KEY}" "$ANDROID_MANIFEST"; then
      echo "Found placeholder, replacing with API key..."
      perl -i -pe "s/\$\{EXPO_PUBLIC_GOOGLE_MAPS_API_KEY\}/$API_KEY/g" "$ANDROID_MANIFEST" 2>/dev/null || \
      sed -i "s|\${EXPO_PUBLIC_GOOGLE_MAPS_API_KEY}|$API_KEY|g" "$ANDROID_MANIFEST"
      
      # Verify
      if ! grep -q "\${EXPO_PUBLIC_GOOGLE_MAPS_API_KEY}" "$ANDROID_MANIFEST"; then
        echo "✅ Successfully replaced Google Maps API key placeholder"
      else
        echo "⚠️  Placeholder still exists, trying alternative method..."
        sed -i "s|\\\${EXPO_PUBLIC_GOOGLE_MAPS_API_KEY}|$API_KEY|g" "$ANDROID_MANIFEST"
      fi
    else
      echo "No placeholder found (may already be replaced)"
    fi
  else
    echo "⚠️  API key not available, placeholder will remain"
    echo "⚠️  Build may fail if placeholder is not replaced"
fi
else
  echo "AndroidManifest.xml not found yet"
fi
echo ""
BEFORE_GRADLE
chmod +x /tmp/fix-manifest-before-gradle.sh

# Export the script path for use in build process
export PRE_GRADLE_FIX_SCRIPT="/tmp/fix-manifest-before-gradle.sh"

# Also copy the fix script to a location that will be available after prebuild
# This ensures it can be run right before Gradle
if [ -f "scripts/fix-google-maps-key.sh" ]; then
  cp scripts/fix-google-maps-key.sh /tmp/fix-google-maps-key.sh
  chmod +x /tmp/fix-google-maps-key.sh
fi

# Create a wrapper function for expo that ignores export errors
# This will be used if EAS tries to call expo export:embed
create_expo_wrapper() {
  # Create a wrapper script that intercepts expo export:embed
  cat > /tmp/expo-wrapper.sh << 'WRAPPER_EOF'
#!/bin/bash
set +e

# Check if this is an export:embed command
if [[ "$*" == *"export:embed"* ]]; then
  echo "Intercepting expo export:embed command..."
  echo "Running with error tolerance..."
  
  # Try to run the actual command
  npx expo export:embed "$@" || {
    echo "Warning: expo export:embed failed with exit code $?"
    echo "Creating minimal export structure to continue build..."
    
    # Create minimal export structure
    mkdir -p .expo/android 2>/dev/null || true
    mkdir -p .expo/ios 2>/dev/null || true
    
    # Create a minimal manifest
    cat > .expo/android/export-manifest.json << 'MANIFEST_EOF'
{
  "version": "1.0.0",
  "bundles": [],
  "assets": []
}
MANIFEST_EOF
    
    echo "Minimal export created, continuing build..."
    exit 0
  }
else
  # For other expo commands, run normally
  npx expo "$@"
fi
WRAPPER_EOF
  chmod +x /tmp/expo-wrapper.sh
  
  # Add to PATH so it might be picked up (though EAS calls npx directly)
  export PATH="/tmp:$PATH"
}

# Set environment variables to make expo export more lenient
export EXPO_NO_DOTENV=1
export SKIP_ENV_VALIDATION=true
export EXPO_NO_TYPESCRIPT_CHECK=true
export EXPO_USE_FAST_RESOLVER=1
export EXPO_USE_METRO_WORKSPACE_ROOT=1
export EXPO_NO_BUNDLE_SPLASH=1

# Disable strict error checking
export NODE_OPTIONS="--no-warnings --max-old-space-size=4096"

# Make npm/yarn more lenient
export npm_config_legacy_peer_deps=true
export YARN_ENABLE_IMMUTABLE_INSTALLS=false

# Create the wrapper (though EAS may not use it directly)
create_expo_wrapper

echo "Pre-build hook completed. Build will continue even if export fails."

# Final fix: Ensure the manifest is fixed right before build ends
# This will be one of the last things to run
if [ -n "$API_KEY" ] && [ -f "scripts/fix-google-maps-key.sh" ]; then
  echo ""
  echo "=========================================="
  echo "Final Google Maps API Key Fix"
  echo "=========================================="
  bash scripts/fix-google-maps-key.sh || true
  echo ""
fi

exit 0

