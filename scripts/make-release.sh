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
# Usage:
#   scripts/make-release.sh [tag]             publish assets -> PUBLIC release
#                                             (tag defaults to v<version>)
#   scripts/make-release.sh --staging [tag]   publish assets -> a PRERELEASE
#                                             (tag defaults to staging-v<version>)
#   scripts/make-release.sh --promote [tag]   copy the staging prerelease's
#                                             assets -> the public release, no
#                                             rebuild (tag defaults to v<version>)
#
# Staging exists so you can download + test installers on every OS without
# touching what users see: a prerelease never changes what
# releases/latest/download/... serves (the site's permanent links), and the
# in-app Check for Updates uses the releases/latest API, which also ignores
# prereleases. The staging prerelease is visible on the GitHub Releases page
# (badged "Pre-release"); if you ever need fully invisible staging, publish to
# a separate repo instead.
#
# Typical flow: build + sign per platform -> `make-release.sh --staging` on
# each machine -> test the staging downloads everywhere -> when satisfied,
# `make-release.sh --promote` once (any machine) to publish those exact files.
set -e

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OVERRIDES="$ROOT/overlay/product.overrides.json"
ASSETS="$ROOT/build-engine/assets"
REPO="kerryback/academic_studio"

command -v jq >/dev/null 2>&1 || { echo "ERROR: jq not found."; exit 1; }
command -v gh >/dev/null 2>&1 || { echo "ERROR: gh CLI not found. Install from https://cli.github.com/ and run 'gh auth login'."; exit 1; }

ASVER="$(jq -r '.academicStudioVersion // "0.0"' "$OVERRIDES")"

MODE="public"
case "${1:-}" in
  --staging) MODE="staging"; shift ;;
  --promote) MODE="promote"; shift ;;
esac
if [ "$MODE" = "staging" ]; then
  TAG="${1:-staging-v$ASVER}"
  # Staging builds are often unsigned test builds; don't gate them by default.
  if [ "${ALLOW_UNSIGNED:-}" = "" ]; then
    ALLOW_UNSIGNED=1
    echo "NOTE: staging mode — signature check skipped (set ALLOW_UNSIGNED=0 to enforce)."
  fi
else
  TAG="${1:-v$ASVER}"
fi
STAGING_TAG="staging-v$ASVER"

if [ "$MODE" = "promote" ]; then
  # Publish the exact files that were tested: download them from the staging
  # prerelease instead of reading local build output.
  ASSETS="$(mktemp -d)"
  echo "Promoting: downloading assets from $STAGING_TAG…"
  gh release download "$STAGING_TAG" --repo "$REPO" --dir "$ASSETS" --pattern '*' || {
    echo "ERROR: could not download assets from $STAGING_TAG."
    echo "  Publish a staging release first: scripts/make-release.sh --staging"; exit 1; }
  echo
fi

[ -d "$ASSETS" ] || { echo "ERROR: no assets dir ($ASSETS). Build with SKIP_ASSETS=no first."; exit 1; }
shopt -s nullglob

# Stable, version-less aliases for the three primary installers, so a website can
# link permanently to .../releases/latest/download/<name>. The versioned copies
# are uploaded too (archival). Each machine only has its own platform's file, so
# the [ -e ] guard makes the others no-ops.
#
# Delete existing aliases FIRST: a version-less file left over from a previous
# release has no version in its name, so the stale-version filter below can't
# catch it — it would silently ship the previous build at the permanent URL.
rm -f "$ASSETS/Academic-Studio-macos-arm64.dmg" \
      "$ASSETS/Academic-Studio-windows-x64-Setup.exe" \
      "$ASSETS/Academic-Studio-windows-arm64-Setup.exe"
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

# --- refuse to publish unsigned artifacts -------------------------------------
# The release notes promise signed installers and the site serves these files at
# permanent URLs, so verify before upload. .dmg is checked with codesign (on the
# Mac that signed it), .exe/.msi with signtool (on the Windows machine that
# signed them). Override with ALLOW_UNSIGNED=1 only for a deliberate unsigned
# release (the notes will then overstate — edit them).
verify_signed() {   # 0 = verified, 1 = unsigned/invalid, 2 = cannot verify here
  case "$1" in
    *.dmg)
      command -v codesign >/dev/null 2>&1 || return 2
      codesign -v "$1" >/dev/null 2>&1 || return 1 ;;
    *.exe|*.msi)
      # osslsigncode verifies Authenticode on any OS — prefer it when present.
      if command -v osslsigncode >/dev/null 2>&1; then
        osslsigncode verify -in "$1" >/dev/null 2>&1 || return 1
        return 0
      fi
      # Trust a `signtool` on PATH only on Windows: macOS Homebrew's nss
      # formula ships an unrelated Netscape `signtool` that would misreport
      # every installer as unsigned.
      case "$(uname -s)" in
        MINGW*|MSYS*|CYGWIN*) ;;
        *) return 2 ;;
      esac
      local st
      st="$(command -v signtool 2>/dev/null || command -v signtool.exe 2>/dev/null || true)"
      [ -n "$st" ] || st="$(ls -d "/c/Program Files (x86)/Windows Kits/10/bin/"*/x64/signtool.exe 2>/dev/null | sort -V | tail -1)"
      [ -n "$st" ] || return 2
      MSYS_NO_PATHCONV=1 "$st" verify /pa "$1" >/dev/null 2>&1 || return 1 ;;
    *) return 0 ;;   # .zip cannot carry a signature; its inner exe was checked at build time
  esac
}
if [ "${ALLOW_UNSIGNED:-0}" != "1" ]; then
  bad=(); unverifiable=()
  for f in "${files[@]}"; do
    # `&& rc=0 || rc=$?` so a nonzero return reaches the checks below instead
    # of tripping set -e.
    verify_signed "$f" && rc=0 || rc=$?
    if [ "$rc" = "1" ]; then bad+=("$(basename "$f") (UNSIGNED or invalid signature)");
    elif [ "$rc" = "2" ]; then unverifiable+=("$(basename "$f") (cannot verify on this machine)"); fi
  done
  # A promote is inherently cross-platform (one machine publishes every OS's
  # files), so "no verify tool here" is expected — warn, don't refuse. Each
  # file was gated on its signing machine when it went into staging. For a
  # direct publish the machine can always verify its own platform: refuse.
  if [ "$MODE" != "promote" ] && [ "${#unverifiable[@]}" -gt 0 ]; then
    bad+=("${unverifiable[@]}"); unverifiable=()
  fi
  if [ "${#unverifiable[@]}" -gt 0 ]; then
    echo "WARN: cannot verify these on this machine (promoted as-is):"
    printf '  %s\n' "${unverifiable[@]}"
  fi
  if [ "${#bad[@]}" -gt 0 ]; then
    echo "ERROR: refusing to publish — signature check failed for:"
    printf '  %s\n' "${bad[@]}"
    echo "Sign the artifacts first (SIGN_ONLY=yes build, or scripts/sign-windows-installers.sh),"
    echo "or re-run with ALLOW_UNSIGNED=1 to publish anyway."
    exit 1
  fi
  echo "Signature check: passed."
  echo
fi

echo "Release $TAG on $REPO"
echo "Assets to upload:"
printf '  %s\n' "${files[@]##*/}"
echo

if gh release view "$TAG" --repo "$REPO" >/dev/null 2>&1; then
  echo "Release $TAG already exists — uploading (clobbering same-named assets)…"
  gh release upload "$TAG" "${files[@]}" --repo "$REPO" --clobber
elif [ "$MODE" = "staging" ]; then
  echo "Creating staging prerelease $TAG…"
  # --prerelease keeps this out of releases/latest (site links) and out of the
  # in-app update check; --latest=false is belt-and-braces.
  gh release create "$TAG" "${files[@]}" --repo "$REPO" \
    --prerelease --latest=false \
    --title "Academic Studio $ASVER (staging — for testing only)" \
    --notes "Internal test build of Academic Studio $ASVER. Not for end users —
the official downloads are at https://academic-studio.com/#downloads.

Once every platform checks out, publish these exact files with:
  scripts/make-release.sh --promote"
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
if [ "$MODE" = "staging" ]; then
  echo
  echo "Staging asset URLs for test machines (anonymous download):"
  for f in "${files[@]}"; do
    echo "  https://github.com/$REPO/releases/download/$TAG/${f##*/}"
  done
  echo
  echo "When everything checks out:   scripts/make-release.sh --promote"
elif [ "$MODE" = "promote" ]; then
  echo
  echo "Promoted the staging assets. Optional cleanup:"
  echo "  gh release delete $STAGING_TAG --repo $REPO --yes"
  echo "  git push --delete origin $STAGING_TAG   # if the tag was pushed"
fi
