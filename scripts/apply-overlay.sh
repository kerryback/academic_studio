#!/usr/bin/env bash
# Inject Academic Studio customizations from overlay/ into build-engine/ (the
# VSCodium clone). Idempotent: re-runnable before every build. Keeps the engine
# otherwise pristine so `git pull upstream` stays clean.
#
# Usage: scripts/apply-overlay.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENGINE="$ROOT/build-engine"
OVERLAY="$ROOT/overlay"
OVERRIDES="$OVERLAY/product.overrides.json"
[ -f "$OVERRIDES" ] || { echo "missing $OVERRIDES"; exit 1; }
# Sourced here rather than inherited, so this script still works run on its own.
# shellcheck disable=SC1091
. "$ROOT/scripts/versions.sh"

# 1) product.json branding overrides ----------------------------------------
# VSCodium merges build-engine/product.json (root) LAST over the vscode base,
# so our keys land there. Keep a pristine copy to merge against each time.
# NOTE: bundled builtInExtensions are injected later by the build script's
# staging step (it needs the checked-out vscode tree to read the base js-debug
# entries and union ours onto them — jq '*' replaces arrays, so a naive merge
# here would drop js-debug).
# Refresh the pristine snapshot whenever product.json is actually pristine —
# i.e. has no academicStudioVersion marker (fresh clone, or an upstream pull /
# checkout replaced it). A once-only snapshot goes stale on long-lived build
# machines and would merge old upstream branding forever.
if ! jq -e 'has("academicStudioVersion")' "$ENGINE/product.json" >/dev/null 2>&1; then
  cp "$ENGINE/product.json" "$ENGINE/product.json.vscodium"
elif [ ! -f "$ENGINE/product.json.vscodium" ]; then
  echo "ERROR: build-engine/product.json already contains Academic Studio overrides,"
  echo "but the pristine snapshot (product.json.vscodium) is missing. Restore the"
  echo "upstream file first:  cd build-engine && git checkout -- product.json"
  exit 1
fi
jq -s '.[0] * .[1]' \
  "$ENGINE/product.json.vscodium" \
  "$OVERRIDES" \
  > "$ENGINE/product.json"
echo "[overlay] merged branding -> build-engine/product.json"

# 1b) remote extension host download URL -------------------------------------
# We publish no REH of our own, so open-remote-ssh installs VSCodium's. The
# release is pinned in scripts/versions.sh and injected here so it lives in one
# place; ${os}/${arch} stay as literals because server-setup.sh resolves them on
# the remote host (one installer serves linux-x64, linux-arm64, darwin, win32).
# jq interpolates only \(...), so ${os}/${arch} pass through untouched.
#
# Hardcoding the version is what lets remote.SSH.serverVersion stay at its
# default "match": the extension then returns early instead of querying the
# GitHub releases API, which is unauthenticated and rate-limited per IP (a real
# hazard behind a shared campus NAT).
REH_URL_BASE="https://github.com/VSCodium/vscodium/releases/download/${AS_VSCODIUM_REH}"

# Fail loudly at build time if the pinned release is gone or was never right.
# Without this the mistake is invisible until a user cannot connect, and
# serverValidation:force suppresses the version check that would have caught it.
if ! curl -sfIL -o /dev/null "${REH_URL_BASE}/vscodium-reh-linux-x64-${AS_VSCODIUM_REH}.tar.gz"; then
  echo "ERROR: pinned VSCodium REH ${AS_VSCODIUM_REH} has no linux-x64 asset at"
  echo "  ${REH_URL_BASE}/"
  echo "Set AS_VSCODIUM_REH in scripts/versions.sh to a release matching the VS"
  echo "Code minor that AS_VSCODIUM_REF builds. Releases:"
  echo "  https://github.com/VSCodium/vscodium/releases"
  exit 1
fi

jq --arg reh "$AS_VSCODIUM_REH" \
  '.configurationDefaults["remote.SSH.serverDownloadUrlTemplate"] =
     "https://github.com/VSCodium/vscodium/releases/download/\($reh)/vscodium-reh-${os}-${arch}-\($reh).tar.gz"' \
  "$ENGINE/product.json" > "$ENGINE/product.json.tmp"
mv "$ENGINE/product.json.tmp" "$ENGINE/product.json"
echo "[overlay] pinned remote SSH server to VSCodium ${AS_VSCODIUM_REH}"

# 2) source patches ----------------------------------------------------------
# VSCodium auto-applies patches/user/*.patch last. We stage our common patches,
# prefixed 'as-' so order is deterministic. Clear stale copies first so removals
# take effect.
mkdir -p "$ENGINE/patches/user"
find "$ENGINE/patches/user" -name 'as-*.patch' -delete 2>/dev/null || true
staged=0
if compgen -G "$OVERLAY/patches/common/*.patch" > /dev/null; then
  for p in "$OVERLAY"/patches/common/*.patch; do
    cp "$p" "$ENGINE/patches/user/as-$(basename "$p")"
    echo "[overlay] staged patch: as-$(basename "$p")"
    staged=$((staged+1))
  done
fi
[ "$staged" -eq 0 ] && echo "[overlay] no source patches"

# 2b) drop unwanted VSCodium patches -----------------------------------------
# These ship in the engine's own patches/ dir (not our overlay).
#   announcements   removes the announcements section from the Get Started page.
#   remote-add-url  bakes a serverDownloadUrlTemplate into product.json pointing
#                   at OUR releases: "<assets repo>/<release version>/<app name
#                   lowercased>-reh-...". Every part of that is wrong for us — we
#                   publish no REH, the release version is time-derived so no such
#                   tag exists, and lowercasing "Academic Studio" puts a space in
#                   the filename. Step 1b supplies the real URL via settings,
#                   which take precedence, so this only survives as a misleading
#                   dead string in product.json for the next person to debug.
# build-engine is regenerable, so re-doing this each run is fine + idempotent.
for cp in 00-community-add-announcements.patch 00-remote-add-url.patch; do
  if [ -f "$ENGINE/patches/$cp" ]; then
    rm -f "$ENGINE/patches/$cp"
    echo "[overlay] dropped upstream patch: $cp"
  fi
done

# 3) icons -------------------------------------------------------------------
# Files under src/stable/resources are copied into vscode/resources by
# prepare_vscode.sh (cp -rp src/stable/* vscode/), so they become the app icon.
if [ -f "$OVERLAY/icons/academic-studio.icns" ]; then
  cp "$OVERLAY/icons/academic-studio.icns" \
     "$ENGINE/src/stable/resources/darwin/code.icns"
  echo "[overlay] applied macOS icon (darwin/code.icns)"
fi
if [ -f "$OVERLAY/icons/academic-studio.ico" ]; then
  mkdir -p "$ENGINE/src/stable/resources/win32"
  cp "$OVERLAY/icons/academic-studio.ico" \
     "$ENGINE/src/stable/resources/win32/code.ico"
  echo "[overlay] applied Windows icon (win32/code.ico)"
fi
# Inno Setup wizard images (the installer's sidebar and corner logo).
if compgen -G "$OVERLAY/icons/inno/inno-*.bmp" > /dev/null; then
  cp "$OVERLAY"/icons/inno/inno-*.bmp "$ENGINE/src/stable/resources/win32/"
  echo "[overlay] applied Inno Setup wizard images"
fi
# The custom title bar (Windows/Linux) shows an SVG, not the .ico. Replace the
# VSCodium "antler" with our AS logo so the top-left corner matches.
if [ -f "$OVERLAY/icons/code-icon.svg" ]; then
  mkdir -p "$ENGINE/src/stable/src/vs/workbench/browser/media"
  cp "$OVERLAY/icons/code-icon.svg" \
     "$ENGINE/src/stable/src/vs/workbench/browser/media/code-icon.svg"
  echo "[overlay] applied title-bar SVG (code-icon.svg)"
fi

echo "[overlay] done."
