#!/usr/bin/env bash
# Build Academic Studio for macOS. Adapted from VSCodium's dev/build.sh, but sets OUR
# branding (dev/build.sh hardcodes APP_NAME=VSCodium, so we cannot just call it).
#
# Usage: scripts/build-macos.sh
#
# Env knobs:
#   SKIP_SOURCE=yes   reuse already-fetched vscode source (faster re-builds)
#   SKIP_ASSETS=no    also package a .dmg (default: app bundle only)
set -e

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENGINE="$ROOT/build-engine"

# --- branding (single source of truth: overlay/product.overrides.json) ------
OVERRIDES="$ROOT/overlay/product.overrides.json"
EXTDIR="$ROOT/overlay/extensions"
[ -f "$OVERRIDES" ] || { echo "missing $OVERRIDES"; exit 1; }
APP_NAME="$(jq -r '.nameLong' "$OVERRIDES")"
BINARY_NAME="$(jq -r '.applicationName' "$OVERRIDES")"

# --- Academic Studio branding ---------------------------------------------------
export APP_NAME BINARY_NAME
export ORG_NAME="AcademicStudio"
export GH_REPO_PATH="kerryback/academic_studio"
export ASSETS_REPOSITORY="kerryback/academic_studio"
export TUNNEL_APP_NAME="${BINARY_NAME}-tunnel"

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
echo "[build] app='$APP_NAME'  node $(node --version)  arch=${VSCODE_ARCH}"

# --- fetch bundled extensions for this target (if not cached) ---------------
EXT_TARGET="darwin-${VSCODE_ARCH}"
if [ ! -f "$EXTDIR/builtin.${EXT_TARGET}.json" ]; then
  "$ROOT/scripts/fetch-extensions.sh" "$EXT_TARGET"
fi

# --- inject our overlay (branding + patches + icons) ------------------------
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
  # reuse the fetched source, but unwind prior patch commits and clear build
  # output so patches + bundled extensions re-apply from a clean tree.
  if [ -d vscode ]; then
    ( cd vscode
      git add -A 2>/dev/null || true
      git reset -q --hard HEAD 2>/dev/null || true
      while [ -n "$(git log -1 2>/dev/null | grep 'VSCODIUM HELPER')" ]; do
        git reset -q --hard HEAD~ || break
      done
      # clear build output + the CLI's untracked openssl scratch dir, which
      # build_cli.sh creates with a bare `mkdir openssl` (fails if it lingers).
      rm -rf .build out* cli/openssl cli/vscode-openssl-prebuilt-*.tgz )
  fi
fi

# --- bundle extensions: builtInExtensions union + stage VSIX ----------------
# prepare_vscode.sh merges build-engine/product.json into vscode/product.json
# with jq '*', which REPLACES the builtInExtensions array. So we set the
# override's builtInExtensions to the UNION of the base js-debug entries (read
# pristine from git, downloaded via GitHub at build time) and our bundled list
# (extracted from local VSIX). Reading base from git keeps this correct across
# vscode version bumps.
BASE_BUILTINS="$(git -C vscode show HEAD:product.json | jq '.builtInExtensions // []')"
OUR_BUILTINS="$(jq '.builtInExtensions' "$EXTDIR/builtin.${EXT_TARGET}.json")"
UNION="$(jq -n --argjson a "$BASE_BUILTINS" --argjson b "$OUR_BUILTINS" '$a + $b')"
PJTMP="$(jq --argjson bi "$UNION" '.builtInExtensions = $bi' "$ENGINE/product.json")"
echo "$PJTMP" > "$ENGINE/product.json"
echo "[build] builtInExtensions: $(echo "$UNION" | jq length) total ($(echo "$BASE_BUILTINS" | jq length) base + $(echo "$OUR_BUILTINS" | jq length) bundled)"

# product.json vsix paths are relative to the vscode repo root; the build
# extracts them at package time.
STAGE="$ENGINE/vscode/as-extensions"
mkdir -p "$STAGE"
rm -f "$STAGE"/*.vsix
cp "$EXTDIR/vsix/${EXT_TARGET}/"*.vsix "$STAGE"/
echo "[build] staged $(ls "$STAGE"/*.vsix | wc -l | tr -d ' ') extension vsix -> vscode/as-extensions"

# bundle local built-in extensions (e.g. academic-studio-defaults, which sets
# configurationDefaults). These go into vscode/extensions/ where the build's
# glob('extensions/*/package.json') picks them up automatically.
for d in "$ROOT"/overlay/builtin-extensions/*/; do
  [ -d "$d" ] || continue
  ename="$(basename "$d")"
  rm -rf "vscode/extensions/$ename"
  cp -R "$d" "vscode/extensions/$ename"
  echo "[build] bundled local extension: $ename"
done

# --- fix build_cli.sh app-bundle name assumption ----------------------------
# VSCodium's build_cli.sh copies the tunnel binary into "${nameShort}.app", but
# VS Code names the macOS bundle after nameLong (= APP_NAME). When short != long
# (our editions) that path is wrong and the CLI step fails. Point it at APP_NAME.
if grep -q 'VSCode-darwin-${VSCODE_ARCH}/${NAME_SHORT}.app' build_cli.sh; then
  sed -i '' 's|VSCode-darwin-${VSCODE_ARCH}/${NAME_SHORT}.app|VSCode-darwin-${VSCODE_ARCH}/${APP_NAME}.app|g' build_cli.sh
  echo "[build] patched build_cli.sh to use APP_NAME for the .app bundle"
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

# --- package installer (.dmg) when requested --------------------------------
# VSCodium's prepare_assets.sh only builds a .dmg when a signing cert is present.
# We build an unsigned drag-to-Applications .dmg with hdiutil (pure macOS, no
# Node native deps — create-dmg's macos-alias module breaks under the build's
# pinned Node). Signing/notarization is Phase 7.
if [ "$SKIP_ASSETS" = "no" ]; then
  echo "[build] packaging .dmg (unsigned, hdiutil)..."
  # shellcheck disable=SC1091
  . dev/build.env
  mkdir -p assets
  APPDIR="VSCode-darwin-${VSCODE_ARCH}"
  SLUG="$(echo "$APP_NAME" | tr ' ' '-')"   # Academic-Studio
  ASVER="$(jq -r '.academicStudioVersion // "0.0"' "$OVERRIDES")"
  # OS-qualified name: an arch alone is ambiguous (arm64 spans Apple Silicon and
  # Windows-on-ARM), so the filename says "macos". Versioned by our own product
  # version, not the upstream VS Code engine version.
  DMG="assets/${SLUG}-${ASVER}-macos-${VSCODE_ARCH}.dmg"
  STAGEDMG="$(mktemp -d)"
  cp -R "${APPDIR}/${APP_NAME}.app" "$STAGEDMG/"
  ln -s /Applications "$STAGEDMG/Applications"
  rm -f "$DMG"
  if hdiutil create -volname "$APP_NAME" -srcfolder "$STAGEDMG" -ov -format UDZO "$DMG" >/dev/null; then
    echo "[build] assets: $(ls assets/ | tr '\n' ' ')"
  else
    echo "[build] WARNING: dmg not produced"
  fi
  rm -rf "$STAGEDMG"
fi

echo ""
echo "[build] DONE. App bundle: ${ENGINE}/VSCode-darwin-${VSCODE_ARCH}/"
