#!/bin/bash
# EAS Build Hooks - Error handling script
# This script helps ignore errors during the build process

set +e  # Don't exit on error

# Function to run command and ignore errors
run_ignore_errors() {
    "$@" || true
}

# Pre-build hook - run any pre-build tasks
if [ -f "eas-hooks/pre-build.sh" ]; then
    run_ignore_errors bash eas-hooks/pre-build.sh
fi

# Post-build hook - run any post-build tasks
if [ -f "eas-hooks/post-build.sh" ]; then
    run_ignore_errors bash eas-hooks/post-build.sh
fi

exit 0

