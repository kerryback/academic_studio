#!/usr/bin/env bash
# Build Academic Studio for Windows. RUN FROM GIT BASH on a Windows machine:
#   "C:\Program Files\Git\bin\bash.exe" ./scripts/build-windows.sh
#
# Usage: scripts/build-windows.sh   (arch via ARCH=x64|arm64, default x64)
# See docs/WINDOWS-BUILD.md for prerequisites (Node 22.22.1, Python, VS Build
# Tools with C++, jq, Inno Setup). Sets OUR branding then drives VSCodium's
# build.sh (which hardcodes APP_NAME=VSCodium, so we cannot call dev/build.sh).
#
# Env knobs:
#   SKIP_SOURCE=yes   reuse already-fetched vscode source
#   SKIP_ASSETS=yes   skip building the installer (.exe); app dir only
#   ARCH=x64|arm64    target arch (default: x64)
#   SIGN_ONLY=yes     skip the build; sign the already-built app exe, repackage
#                     the installers, and sign them. Needs AS_WIN_CERT_* (see
#                     docs/SIGNING.md).
set -e

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENGINE="$ROOT/build-engine"

# --- preflight: required tools (fail clearly, not with a cryptic crash) ------
missing=""
for tool in jq node npm git python; do
  command -v "$tool" >/dev/null 2>&1 || missing="$missing $tool"
done
if [ -n "$missing" ]; then
  echo "ERROR: missing required tool(s):$missing"
  echo "Install them, reopen Git Bash, and re-run. See docs/WINDOWS-BUILD.md."
  echo "  jq:     winget install jqlang.jq"
  echo "  node:   https://nodejs.org/dist/v22.22.1/  (need v22.22.1)"
  echo "  python: install 3.11 and check 'Add to PATH'"
  exit 1
fi
# Node version: the build's native modules expect Node 22.x (the macOS build
# pins 22.22.1 via nvm). A mismatched Node is the #1 cause of cryptic
# native-module build failures, so fail fast with a clear message instead.
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
if [ "$NODE_MAJOR" != "22" ]; then
  echo "ERROR: Node $(node --version 2>/dev/null) detected, but the build needs Node 22.x (22.22.1)."
  echo "Install it from https://nodejs.org/dist/v22.22.1/ (or via nvm-windows:"
  echo "  nvm install 22.22.1 && nvm use 22.22.1), reopen Git Bash, and re-run."
  echo "See docs/WINDOWS-BUILD.md."
  exit 1
fi
if [ "${SKIP_ASSETS:-no}" = "no" ]; then
  for tool in iscc ISCC.exe 7z 7z.exe; do command -v "$tool" >/dev/null 2>&1 && break; done || true
  command -v iscc >/dev/null 2>&1 || command -v ISCC.exe >/dev/null 2>&1 || \
    echo "WARN: Inno Setup (ISCC) not on PATH — the installer step will fail. winget install JRSoftware.InnoSetup"
  command -v 7z >/dev/null 2>&1 || command -v 7z.exe >/dev/null 2>&1 || \
    echo "WARN: 7-Zip (7z) not on PATH — the .zip step will fail. winget install 7zip.7zip"
fi

# --- branding (single source of truth: overlay/product.overrides.json) ------
OVERRIDES="$ROOT/overlay/product.overrides.json"
EXTDIR="$ROOT/overlay/extensions"
[ -f "$OVERRIDES" ] || { echo "missing $OVERRIDES"; exit 1; }
APP_NAME="$(jq -r '.nameLong' "$OVERRIDES")"
BINARY_NAME="$(jq -r '.applicationName' "$OVERRIDES")"
export APP_NAME BINARY_NAME
export ORG_NAME="AcademicStudio"
export GH_REPO_PATH="kerryback/academic_studio"
export ASSETS_REPOSITORY="kerryback/academic_studio"
export TUNNEL_APP_NAME="${BINARY_NAME}-tunnel"
NAME_SHORT="$(jq -r '.nameShort' "$OVERRIDES")"   # the .exe is "<nameShort>.exe"

# --- code signing (optional; only when a cert is configured) ----------------
# Set ONE credential source, then the app exe + installers get Authenticode
# signed (removes the SmartScreen "unknown publisher" warning). See docs/SIGNING.md.
#   AS_WIN_CERT_FILE [+ AS_WIN_CERT_PASSWORD]   path to a .pfx and its password
#   AS_WIN_CERT_SHA1                            SHA1 thumbprint of a cert in the
#                                               store (typical for EV USB tokens)
#   AS_WIN_TIMESTAMP_URL                        RFC3161 server (has a default)
as_find_signtool() {
  command -v signtool   >/dev/null 2>&1 && { echo signtool;   return; }
  command -v signtool.exe >/dev/null 2>&1 && { echo signtool.exe; return; }
  local st
  st="$(ls -d "/c/Program Files (x86)/Windows Kits/10/bin/"*/x64/signtool.exe 2>/dev/null | sort -V | tail -1)"
  [ -n "$st" ] && echo "$st"
}
as_win_sign() {   # $@ = files to sign; no-op unless a cert is configured
  [ "$#" -gt 0 ] || return 0
  local cred=()
  if [ -n "${AS_WIN_CERT_FILE:-}" ]; then
    cred=(/f "$AS_WIN_CERT_FILE")
    [ -n "${AS_WIN_CERT_PASSWORD:-}" ] && cred+=(/p "$AS_WIN_CERT_PASSWORD")
  elif [ -n "${AS_WIN_CERT_SHA1:-}" ]; then
    cred=(/sha1 "$AS_WIN_CERT_SHA1")
  else
    return 0
  fi
  local st; st="$(as_find_signtool)"
  [ -n "$st" ] || { echo "WARN: signtool not found (install the Windows 10/11 SDK) — leaving files UNSIGNED."; return 0; }
  local ts="${AS_WIN_TIMESTAMP_URL:-http://timestamp.digicert.com}"
  local f
  for f in "$@"; do
    [ -e "$f" ] || continue
    echo "[sign] $f"
    "$st" sign /fd SHA256 /tr "$ts" /td SHA256 "${cred[@]}" "$f" || echo "WARN: signing failed for $f"
  done
}
if [ -z "${AS_WIN_CERT_FILE:-}${AS_WIN_CERT_SHA1:-}" ]; then
  echo "[sign] no Windows cert configured (AS_WIN_CERT_FILE or AS_WIN_CERT_SHA1) — shipping UNSIGNED (SmartScreen will warn)."
fi

# --- build flags ------------------------------------------------------------
export CI_BUILD="no"
export SHOULD_BUILD="yes"
export SKIP_ASSETS="${SKIP_ASSETS:-no}"   # default: build the installer
export SKIP_BUILD="no"
export SKIP_SOURCE="${SKIP_SOURCE:-no}"
SIGN_ONLY="${SIGN_ONLY:-no}"
export VSCODE_LATEST="no"
export VSCODE_QUALITY="stable"
export VSCODE_SKIP_NODE_VERSION_CHECK="yes"
export OS_NAME="windows"
export VSCODE_ARCH="${ARCH:-x64}"
export npm_config_arch="${VSCODE_ARCH}"
export NODE_OPTIONS="--max-old-space-size=8192"

echo "[build] app='$APP_NAME'  node $(node --version)  arch=${VSCODE_ARCH}"
EXT_TARGET="win32-${VSCODE_ARCH}"

# --- sign the app exe + (re)package + sign installers -----------------------
# Factored out so a normal build (after compile) and SIGN_ONLY=yes share it.
# Assumes cwd is "$ENGINE". Signing is a no-op unless a cert is configured.
win_sign_and_package() {
  # sign the app's main exe BEFORE packaging, so the installer ships a signed app.
  as_win_sign "VSCode-win32-${VSCODE_ARCH}/${NAME_SHORT}.exe"

  [ "$SKIP_ASSETS" = "no" ] || return 0
  echo "[build] packaging installer + zip into assets/ ..."
  rm -rf build/windows/msi/releasedir
  mkdir -p assets
  # We ship the Inno Setup .exe installers + .zip, not MSI. The MSI build needs
  # WiX (heat.exe), which is NOT a documented prerequisite (see docs/WINDOWS-
  # BUILD.md); leaving it on makes prepare_assets.sh abort under `set -e` before
  # it promotes the Setup .exe into assets/. Skip MSI unless explicitly enabled.
  export SHOULD_BUILD_MSI="${SHOULD_BUILD_MSI:-no}"
  export SHOULD_BUILD_MSI_NOUP="${SHOULD_BUILD_MSI_NOUP:-no}"
  # shellcheck disable=SC1091
  . prepare_assets.sh

  # rename engine outputs to OS-qualified, AS-versioned names (arch alone is
  # ambiguous: arm64 spans Apple Silicon and Windows-on-ARM, so we say "windows").
  local ASVER A
  ASVER="$(jq -r '.academicStudioVersion // "0.0"' "$OVERRIDES")"
  A="${VSCODE_ARCH}"
  ( cd assets || exit 0
    shopt -s nullglob
    for f in *Setup-"${A}"-*.exe; do
      case "$f" in
        *UserSetup-*) mv -f "$f" "Academic-Studio-${ASVER}-windows-${A}-UserSetup.exe" ;;
        *)            mv -f "$f" "Academic-Studio-${ASVER}-windows-${A}-Setup.exe" ;;
      esac
    done
    for f in *-win32-"${A}"-*.zip; do
      mv -f "$f" "Academic-Studio-${ASVER}-windows-${A}.zip"
    done
    for f in *-"${A}"-*.msi; do
      case "$f" in
        *updates-disabled*) mv -f "$f" "Academic-Studio-${ASVER}-windows-${A}-updates-disabled.msi" ;;
        *)                  mv -f "$f" "Academic-Studio-${ASVER}-windows-${A}.msi" ;;
      esac
    done )

  # sign the produced installers (the .zip can't be signed; its app exe already was).
  as_win_sign assets/Academic-Studio-"${ASVER}"-windows-"${A}"-*.exe \
              assets/Academic-Studio-"${ASVER}"-windows-"${A}".msi \
              assets/Academic-Studio-"${ASVER}"-windows-"${A}"-updates-disabled.msi
}

# --- SIGN_ONLY: sign the already-built app, skip fetch/compile ---------------
if [ "$SIGN_ONLY" = "yes" ]; then
  [ -n "${AS_WIN_CERT_FILE:-}${AS_WIN_CERT_SHA1:-}" ] || { echo "SIGN_ONLY=yes needs AS_WIN_CERT_FILE or AS_WIN_CERT_SHA1 (see docs/SIGNING.md)."; exit 1; }
  cd "$ENGINE"
  [ -d "VSCode-win32-${VSCODE_ARCH}" ] || { echo "No built app at ${ENGINE}/VSCode-win32-${VSCODE_ARCH} — run a full build first."; exit 1; }
  # shellcheck disable=SC1091
  [ -f dev/build.env ] && . dev/build.env
  SKIP_ASSETS="no"   # must repackage so the installer wraps the signed exe
  echo "[sign-only] signing the already-built ${VSCODE_ARCH} app + installers (no recompile)…"
  win_sign_and_package
  echo ""
  echo "[sign-only] DONE. Signed installers in ${ENGINE}/assets/"
  exit 0
fi

# --- fetch bundled extensions for this target -------------------------------
if [ ! -f "$EXTDIR/builtin.${EXT_TARGET}.json" ]; then
  "$ROOT/scripts/fetch-extensions.sh" "$EXT_TARGET"
fi

# --- inject overlay (branding + patches + icons) ----------------------------
"$ROOT/scripts/apply-overlay.sh"

cd "$ENGINE"

# --- apply build-engine patches (npm platform fixes for Windows) -----------
BEPATCH="$ROOT/build-engine-npm-platform-fixes.patch"
if [ -f "$BEPATCH" ]; then
  if git apply --check "$BEPATCH" 2>/dev/null; then
    echo "[patch] applying build-engine-npm-platform-fixes.patch"
    git apply "$BEPATCH"
  else
    echo "[patch] build-engine-npm-platform-fixes.patch already applied or does not apply cleanly — skipping"
  fi
fi

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
OUR_BUILTINS="$(jq '.builtInExtensions' "$EXTDIR/builtin.${EXT_TARGET}.json")"
UNION="$(jq -n --argjson a "$BASE_BUILTINS" --argjson b "$OUR_BUILTINS" '$a + $b')"
PJTMP="$(jq --argjson bi "$UNION" '.builtInExtensions = $bi' "$ENGINE/product.json")"
echo "$PJTMP" > "$ENGINE/product.json"
echo "[build] builtInExtensions: $(echo "$UNION" | jq length) total ($(echo "$BASE_BUILTINS" | jq length) base + $(echo "$OUR_BUILTINS" | jq length) bundled)"

STAGE="$ENGINE/vscode/as-extensions"
mkdir -p "$STAGE"; rm -f "$STAGE"/*.vsix
cp "$EXTDIR/vsix/${EXT_TARGET}/"*.vsix "$STAGE"/
echo "[build] staged $(ls "$STAGE"/*.vsix | wc -l | tr -d ' ') extension vsix"

for d in "$ROOT"/overlay/builtin-extensions/*/; do
  [ -d "$d" ] || continue
  ename="$(basename "$d")"
  rm -rf "vscode/extensions/$ename"; cp -R "$d" "vscode/extensions/$ename"
  echo "[build] bundled local extension: $ename"
done

# --- compile the app (produces VSCode-win32-<arch>/) ------------------------
# shellcheck disable=SC1091
. build.sh

# --- package + sign installers ----------------------------------------------
# build.sh only builds the app folder; win_sign_and_package signs the app exe,
# runs the Inno Setup + 7-Zip packaging (prepare_assets.sh), renames to
# OS-qualified names, and signs the installers. Needs Inno Setup + 7-Zip on PATH.
win_sign_and_package

echo ""
if [ -d "${ENGINE}/VSCode-win32-${VSCODE_ARCH}" ]; then
  echo "[build] DONE."
  echo "  App folder : ${ENGINE}/VSCode-win32-${VSCODE_ARCH}/   (run the .exe inside to test)"
  echo "  Installers : ${ENGINE}/assets/   ($(ls "${ENGINE}/assets" 2>/dev/null | tr '\n' ' ' || echo 'none - check log above'))"
else
  echo "[build] FAILED: ${ENGINE}/VSCode-win32-${VSCODE_ARCH}/ was not produced. Check the log above."
  exit 1
fi
