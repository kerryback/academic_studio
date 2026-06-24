#!/usr/bin/env bash
# Build Academic Studio for macOS. Adapted from VSCodium's dev/build.sh, but
# sets OUR branding (dev/build.sh hardcodes APP_NAME=VSCodium, so we cannot just
# call it). Run from anywhere: scripts/build-macos.sh
#
# Env knobs:
#   SKIP_SOURCE=yes   reuse already-fetched vscode source (faster re-builds)
#   SKIP_ASSETS=no    also package a .dmg/.zip (default: app bundle only)
set -e

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENGINE="$ROOT/build-engine"

# --- Academic Studio branding ----------------------------------------------
export APP_NAME="Academic Studio"
export BINARY_NAME="academic-studio"
export ORG_NAME="AcademicStudio"
export GH_REPO_PATH="kerryback/academic-studio"
export ASSETS_REPOSITORY="kerryback/academic-studio"
export TUNNEL_APP_NAME="academic-studio-tunnel"

# --- build flags ------------------------------------------------------------
export CI_BUILD="no"
export SHOULD_BUILD="yes"
export SKIP_ASSETS="${SKIP_ASSETS:-yes}"
export SKIP_BUILD="no"
export SKIP_SOURCE="${SKIP_SOURCE:-no}"
export VSCODE_LATEST="no"
export VSCODE_QUALITY="stable"
export VSCODE_SKIP_NODE_VERSION_CHECK="yes"
export OS_NAME="osx"

UNAME_ARCH="$(uname -m)"
if [ "$UNAME_ARCH" = "arm64" ] || [ "$UNAME_ARCH" = "aarch64" ]; then
  export VSCODE_ARCH="arm64"
else
  export VSCODE_ARCH="x64"
fi
export NODE_OPTIONS="--max-old-space-size=8192"

# --- pin Node 22.22.1 via nvm ----------------------------------------------
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
# shellcheck disable=SC1091
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
if command -v nvm >/dev/null 2>&1; then
  nvm use 22.22.1 >/dev/null 2>&1 || { nvm install 22.22.1 && nvm use 22.22.1; }
fi
echo "[build] node $(node --version)  arch=${VSCODE_ARCH}"

# --- inject our overlay -----------------------------------------------------
"$ROOT/scripts/apply-overlay.sh"

cd "$ENGINE"

# --- fetch vscode source at the pinned tag ---------------------------------
if [ "$SKIP_SOURCE" = "no" ]; then
  rm -rf vscode vscode-*
  # shellcheck disable=SC1091
  . get_repo.sh
  # shellcheck disable=SC1091
  . version.sh
  {
    echo "MS_TAG=\"${MS_TAG}\""
    echo "MS_COMMIT=\"${MS_COMMIT}\""
    echo "RELEASE_VERSION=\"${RELEASE_VERSION}\""
    echo "BUILD_SOURCEVERSION=\"${BUILD_SOURCEVERSION}\""
  } > dev/build.env
else
  # shellcheck disable=SC1091
  . dev/build.env
fi

# --- macOS native build include --------------------------------------------
if [ -f "./include_${OS_NAME}.gypi" ]; then
  mkdir -p ~/.gyp
  [ -f ~/.gyp/include.gypi ] && mv ~/.gyp/include.gypi ~/.gyp/include.gypi.pre-as
  cp ./build/osx/include.gypi ~/.gyp/include.gypi
fi

# --- compile + package the .app --------------------------------------------
# shellcheck disable=SC1091
. build.sh

if [ -f ~/.gyp/include.gypi.pre-as ]; then
  mv ~/.gyp/include.gypi.pre-as ~/.gyp/include.gypi
fi

echo ""
echo "[build] DONE. App bundle: ${ENGINE}/VSCode-darwin-${VSCODE_ARCH}/"
