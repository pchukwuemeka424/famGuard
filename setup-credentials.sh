#!/bin/bash
# Script to set up Android credentials
# Run this in your terminal: bash setup-credentials.sh

export EXPO_TOKEN="ewxsvviM4-BUrZfgMIi47VL2R2X1N9QYcX7_rQ9x"

echo "=========================================="
echo "Setting up Android Credentials"
echo "=========================================="
echo ""
echo "This will prompt you to:"
echo "1. Select 'android' platform"
echo "2. Answer 'y' or 'yes' to generate keystore"
echo ""
echo "Starting credentials setup..."
echo ""

eas credentials

echo ""
echo "=========================================="
if [ $? -eq 0 ]; then
  echo "✅ Credentials set up successfully!"
  echo "You can now build with:"
  echo "  eas build --platform android --profile apk --non-interactive"
else
  echo "❌ Credentials setup failed or was cancelled"
fi
echo "=========================================="

