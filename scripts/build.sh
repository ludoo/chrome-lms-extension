#!/bin/bash
set -e

echo "Building LMS Extension..."

# We are inside scripts/, so we go up one level to the project root
PROJECT_ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$PROJECT_ROOT"

SRC_DIR="."
TEST_ZIP="lms-extension-test.zip"
PUBLISH_ZIP="lms-extension-publish.zip"

# Use a temporary folder in /tmp as per guidelines
TMP_DIR=$(mktemp -d /tmp/lms-build.XXXXXX)

# Setup directories to maintain the top-level 'lms-extension' folder in the zip
mkdir -p "$TMP_DIR/test/lms-extension"
mkdir -p "$TMP_DIR/publish/lms-extension"

# Copy files, excluding node_modules, tests, and build artifacts
rsync -a --exclude="node_modules" --exclude="test-results" --exclude="playwright-report" --exclude="tests" --exclude=".*" --exclude="*.zip" --exclude="scripts" "$SRC_DIR/" "$TMP_DIR/test/lms-extension/"
rsync -a --exclude="node_modules" --exclude="test-results" --exclude="playwright-report" --exclude="tests" --exclude=".*" --exclude="*.zip" --exclude="scripts" "$SRC_DIR/" "$TMP_DIR/publish/lms-extension/"

# Remove old zips if they exist
rm -f "$TEST_ZIP" "$PUBLISH_ZIP"

# Create zips
echo "Creating test zip ($TEST_ZIP)..."
cd "$TMP_DIR/test"
zip -qr "$PROJECT_ROOT/$TEST_ZIP" "lms-extension"
cd "$PROJECT_ROOT"

echo "Creating publish zip ($PUBLISH_ZIP)..."
cd "$TMP_DIR/publish"
zip -qr "$PROJECT_ROOT/$PUBLISH_ZIP" "lms-extension"
cd "$PROJECT_ROOT"

# Cleanup
rm -rf "$TMP_DIR"

echo "Build complete. Generated $TEST_ZIP and $PUBLISH_ZIP."