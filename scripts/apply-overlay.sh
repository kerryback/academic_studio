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

# 1) product.json branding overrides ----------------------------------------
# VSCodium merges build-engine/product.json (root) LAST over the vscode base,
# so our keys land there. Keep a pristine copy to merge against each time.
# NOTE: bundled builtInExtensions are injected later by the build script's
# staging step (it needs the checked-out vscode tree to read the base js-debug
# entries and union ours onto them — jq '*' replaces arrays, so a naive merge
# here would drop js-debug).
if [ ! -f "$ENGINE/product.json.vscodium" ]; then
  cp "$ENGINE/product.json" "$ENGINE/product.json.vscodium"
fi
jq -s '.[0] * .[1]' \
  "$ENGINE/product.json.vscodium" \
  "$OVERRIDES" \
  > "$ENGINE/product.json"
echo "[overlay] merged branding -> build-engine/product.json"

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

echo "[overlay] done."
