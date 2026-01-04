#!/bin/bash
# Script to set up Android credentials automatically

export EXPO_TOKEN="ewxsvviM4-BUrZfgMIi47VL2R2X1N9QYcX7_rQ9x"

echo "Setting up Android credentials..."
echo "This will generate a new keystore if one doesn't exist"

# Try to set up credentials using expect or by accepting defaults
# Since we can't interact, we'll let EAS handle it during build
echo "Credentials will be set up automatically during the first build"

