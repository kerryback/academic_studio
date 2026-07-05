#!/usr/bin/env bash
# Publish the built installers in build-engine/assets/ to a GitHub Release.
#
# Run this AFTER a release build (SKIP_ASSETS=no) on each platform:
#   macOS:   SKIP_ASSETS=no scripts/build-macos.sh
#   Windows: SKIP_ASSETS=no scripts/build-windows.sh   (from Git Bash)
# then run this script on that machine to upload that platform's assets.
#
# Idempotent: creates the release on first run, and on later runs uploads
# (clobbering same-named assets) so you can publish Mac and Windows builds to
# the same release from two different machines.
#
# Usage: scripts/make-release.sh [tag]
#   tag defaults to v<academicStudioVersion> (e.g. v0.1).
set -e

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OVERRIDES="$ROOT/overlay/product.overrides.json"
ASSETS="$ROOT/build-engine/assets"
REPO="kerryback/academic_studio"

command -v jq >/dev/null 2>&1 || { echo "ERROR: jq not found."; exit 1; }
command -v gh >/dev/null 2>&1 || { echo "ERROR: gh CLI not found. Install from https://cli.github.com/ and run 'gh auth login'."; exit 1; }

ASVER="$(jq -r '.academicStudioVersion // "0.0"' "$OVERRIDES")"
TAG="${1:-v$ASVER}"

[ -d "$ASSETS" ] || { echo "ERROR: no assets dir ($ASSETS). Build with SKIP_ASSETS=no first."; exit 1; }
shopt -s nullglob

# Stable, version-less aliases for the three primary installers, so a website can
# link permanently to .../releases/latest/download/<name>. The versioned copies
# are uploaded too (archival). Each machine only has its own platform's file, so
# the [ -e ] guard makes the others no-ops.
alias_copy() { [ -e "$1" ] || return 0; cp -f "$1" "$ASSETS/$2" && echo "  aliased: $2"; }
echo "Version-less 'latest' aliases:"
alias_copy "$ASSETS/Academic-Studio-${ASVER}-macos-arm64.dmg"          "Academic-Studio-macos-arm64.dmg"
alias_copy "$ASSETS/Academic-Studio-${ASVER}-windows-x64-Setup.exe"    "Academic-Studio-windows-x64-Setup.exe"
alias_copy "$ASSETS/Academic-Studio-${ASVER}-windows-arm64-Setup.exe"  "Academic-Studio-windows-arm64-Setup.exe"
echo

# Upload only distributable installer types — not stray build artifacts (e.g. the
# CLI tarball the Windows packaging drops in assets/). nullglob (set above) drops
# patterns that match nothing.
files=("$ASSETS"/*.dmg "$ASSETS"/*.exe "$ASSETS"/*.zip "$ASSETS"/*.msi)

# Drop stale-version installers: a previous version's file left in assets/ (e.g.
# a prior .dmg on the Mac) would otherwise be uploaded into THIS release. Keep the
# version-less aliases and anything tagged with the current version only.
kept=()
for f in "${files[@]}"; do
  fver="$(basename "$f" | sed -nE 's/^Academic-Studio-([0-9]+(\.[0-9]+)*)-.*/\1/p')"
  if [ -n "$fver" ] && [ "$fver" != "$ASVER" ]; then
    echo "  skipping stale-version asset: $(basename "$f")"
    continue
  fi
  kept+=("$f")
done
files=("${kept[@]}")

[ "${#files[@]}" -gt 0 ] || { echo "ERROR: no installer files (.dmg/.exe/.zip/.msi) in $ASSETS. Build with SKIP_ASSETS=no first."; exit 1; }

echo "Release $TAG on $REPO"
echo "Assets to upload:"
printf '  %s\n' "${files[@]##*/}"
echo

if gh release view "$TAG" --repo "$REPO" >/dev/null 2>&1; then
  echo "Release $TAG already exists — uploading (clobbering same-named assets)…"
  gh release upload "$TAG" "${files[@]}" --repo "$REPO" --clobber
else
  echo "Creating release $TAG…"
  gh release create "$TAG" "${files[@]}" --repo "$REPO" \
    --title "Academic Studio $ASVER" \
    --notes "Academic Studio $ASVER

Download the installer for your computer:
- Mac — Apple Silicon only; does not run on older Macs with Intel chips:
  Academic-Studio-macos-arm64.dmg
- Windows — for most Windows computers:
  Academic-Studio-windows-x64-Setup.exe
- Windows on ARM — for Microsoft Surface Pro laptops and other Windows ARM computers:
  Academic-Studio-windows-arm64-Setup.exe

The macOS build is signed and notarized, and the Windows builds are code-signed,
so both open with a normal double-click. (A newly issued Windows certificate can
still show a SmartScreen prompt until it builds reputation — if so, click \"More
info\" then \"Run anyway\".)"
fi

echo
echo "Done: https://github.com/$REPO/releases/tag/$TAG"
