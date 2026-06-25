#!/usr/bin/env bash
# Build Academic Studio for Windows. RUN FROM GIT BASH on a Windows machine:
#   "C:\Program Files\Git\bin\bash.exe" ./scripts/build-windows.sh student
#
# Usage: scripts/build-windows.sh [edition]    (edition = student | faculty)
# See docs/WINDOWS-BUILD.md for prerequisites (Node 22.22.1, Python, VS Build
# Tools with C++, jq, Inno Setup). Sets OUR branding then drives VSCodium's
# build.sh (which hardcodes APP_NAME=VSCodium, so we cannot call dev/build.sh).
#
# Env knobs:
#   SKIP_SOURCE=yes   reuse already-fetched vscode source
#   SKIP_ASSETS=yes   skip building the installer (.exe); app dir only
#   ARCH=x64|arm64    target arch (default: x64)
set -e

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENGINE="$ROOT/build-engine"

# --- edition + branding (from the edition's product overrides) --------------
EDITION="${1:-${EDITION:-student}}"
EDIR="$ROOT/overlay/editions/$EDITION"
[ -d "$EDIR" ] || { echo "unknown edition '$EDITION' (no $EDIR)"; exit 1; }
APP_NAME="$(jq -r '.nameLong' "$EDIR/product.overrides.json")"
BINARY_NAME="$(jq -r '.applicationName' "$EDIR/product.overrides.json")"
export APP_NAME BINARY_NAME
export ORG_NAME="AcademicStudio"
export GH_REPO_PATH="kerryback/academic_studio"
export ASSETS_REPOSITORY="kerryback/academic_studio"
export TUNNEL_APP_NAME="${BINARY_NAME}-tunnel"

# --- build flags ------------------------------------------------------------
export CI_BUILD="no"
export SHOULD_BUILD="yes"
export SKIP_ASSETS="${SKIP_ASSETS:-no}"   # default: build the installer
export SKIP_BUILD="no"
export SKIP_SOURCE="${SKIP_SOURCE:-no}"
export VSCODE_LATEST="no"
export VSCODE_QUALITY="stable"
export VSCODE_SKIP_NODE_VERSION_CHECK="yes"
export OS_NAME="windows"
export VSCODE_ARCH="${ARCH:-x64}"
export NODE_OPTIONS="--max-old-space-size=8192"

echo "[build] edition=$EDITION  app='$APP_NAME'  node $(node --version)  arch=${VSCODE_ARCH}"
EXT_TARGET="win32-${VSCODE_ARCH}"

# --- fetch bundled extensions for this edition+target -----------------------
if [ ! -f "$EDIR/extensions/builtin.${EXT_TARGET}.json" ]; then
  "$ROOT/scripts/fetch-extensions.sh" "$EDITION" "$EXT_TARGET"
fi

# --- inject overlay (branding + edition patches + icons) --------------------
"$ROOT/scripts/apply-overlay.sh" "$EDITION"

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
  if [ -d vscode ]; then
    ( cd vscode
      git add -A 2>/dev/null || true
      git reset -q --hard HEAD 2>/dev/null || true
      while [ -n "$(git log -1 2>/dev/null | grep 'VSCODIUM HELPER')" ]; do
        git reset -q --hard HEAD~ || break
      done
      rm -rf .build out* cli/openssl cli/vscode-openssl-prebuilt-*.tgz )
  fi
fi

# --- bundle extensions: builtInExtensions union + stage VSIX ----------------
BASE_BUILTINS="$(git -C vscode show HEAD:product.json | jq '.builtInExtensions // []')"
OUR_BUILTINS="$(jq '.builtInExtensions' "$EDIR/extensions/builtin.${EXT_TARGET}.json")"
UNION="$(jq -n --argjson a "$BASE_BUILTINS" --argjson b "$OUR_BUILTINS" '$a + $b')"
PJTMP="$(jq --argjson bi "$UNION" '.builtInExtensions = $bi' "$ENGINE/product.json")"
echo "$PJTMP" > "$ENGINE/product.json"
echo "[build] builtInExtensions: $(echo "$UNION" | jq length) total"

STAGE="$ENGINE/vscode/as-extensions"
mkdir -p "$STAGE"; rm -f "$STAGE"/*.vsix
cp "$EDIR/extensions/vsix/${EXT_TARGET}/"*.vsix "$STAGE"/
echo "[build] staged $(ls "$STAGE"/*.vsix | wc -l | tr -d ' ') extension vsix"

for d in "$ROOT"/overlay/builtin-extensions/*/; do
  [ -d "$d" ] || continue
  ename="$(basename "$d")"
  rm -rf "vscode/extensions/$ename"; cp -R "$d" "vscode/extensions/$ename"
  echo "[build] bundled local extension: $ename"
done

# --- compile + package (build.sh handles the win32 branch + Inno Setup) -----
# shellcheck disable=SC1091
. build.sh

echo ""
echo "[build] DONE. Output under: ${ENGINE}/  (VSCode-win32-${VSCODE_ARCH}/ and assets/)"
