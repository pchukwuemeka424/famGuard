#!/bin/bash
# EAS Build Pre-Install Hook
# This script runs before dependencies are installed
# Set error handling to be lenient

set +e  # Don't exit on error

echo "EAS Build Pre-Install: Setting up lenient error handling..."

# Export environment variables to make expo export more lenient
export EXPO_NO_DOTENV=1
export SKIP_ENV_VALIDATION=true
export EXPO_NO_TYPESCRIPT_CHECK=true
export CI=true

# Make npm/yarn more lenient
export npm_config_legacy_peer_deps=true
export YARN_ENABLE_IMMUTABLE_INSTALLS=false

exit 0

