#!/usr/bin/env bash
# Inject Rice Studio customizations from overlay/ into build-engine/ (the
# VSCodium clone) for a given EDITION. Idempotent: re-runnable before every
# build. Keeps the engine otherwise pristine so `git pull upstream` stays clean.
#
# Usage: scripts/apply-overlay.sh <edition>   (edition = student | faculty)
set -euo pipefail

EDITION="${1:?usage: apply-overlay.sh <edition>}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENGINE="$ROOT/build-engine"
OVERLAY="$ROOT/overlay"
EDIR="$OVERLAY/editions/$EDITION"
[ -d "$EDIR" ] || { echo "unknown edition '$EDITION' (no $EDIR)"; exit 1; }

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
  "$EDIR/product.overrides.json" \
  > "$ENGINE/product.json"
echo "[overlay] merged $EDITION branding -> build-engine/product.json"

# 2) source patches ----------------------------------------------------------
# VSCodium auto-applies patches/user/*.patch last. We stage common patches (both
# editions) + edition-specific ones, prefixed 'as-' so order is deterministic.
# Clear stale copies first so removals/edition-switches take effect.
mkdir -p "$ENGINE/patches/user"
find "$ENGINE/patches/user" -name 'as-*.patch' -delete 2>/dev/null || true
staged=0
for dir in "$OVERLAY/patches/common" "$OVERLAY/patches/$EDITION"; do
  if compgen -G "$dir/*.patch" > /dev/null; then
    for p in "$dir"/*.patch; do
      cp "$p" "$ENGINE/patches/user/as-$(basename "$p")"
      echo "[overlay] staged patch: as-$(basename "$p")"
      staged=$((staged+1))
    done
  fi
done
[ "$staged" -eq 0 ] && echo "[overlay] no source patches"

# 3) icons -------------------------------------------------------------------
# Files under src/stable/resources are copied into vscode/resources by
# prepare_vscode.sh (cp -rp src/stable/* vscode/), so they become the app icon.
if [ -f "$OVERLAY/icons/rice-studio.icns" ]; then
  cp "$OVERLAY/icons/rice-studio.icns" \
     "$ENGINE/src/stable/resources/darwin/code.icns"
  echo "[overlay] applied macOS icon (darwin/code.icns)"
fi
if [ -f "$OVERLAY/icons/rice-studio.ico" ]; then
  mkdir -p "$ENGINE/src/stable/resources/win32"
  cp "$OVERLAY/icons/rice-studio.ico" \
     "$ENGINE/src/stable/resources/win32/code.ico"
  echo "[overlay] applied Windows icon (win32/code.ico)"
fi

echo "[overlay] done (edition=$EDITION)."
