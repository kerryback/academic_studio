#!/usr/bin/env bash
# One-command macOS release: sign + notarize + package the .dmg, then publish it
# to the GitHub Release. Wraps build-macos.sh (signing) + make-release.sh (upload)
# with the credentials that are already set up on this Mac.
#
# Credentials (in the keychain; override via env only if they change):
#   AS_MAC_SIGN_IDENTITY  Developer ID Application cert SHA-1 hash
#   AS_NOTARY_PROFILE     notarytool keychain profile name (holds Apple ID +
#                         app-specific password; create with `notarytool
#                         store-credentials`). See docs/SIGNING.md.
#
# Modes:
#   scripts/make-mac-release.sh              # sign the already-built .app, then publish (fast)
#   REBUILD=yes scripts/make-mac-release.sh  # repackage from compiled source first, then sign+publish
#   FULL=yes    scripts/make-mac-release.sh  # full source rebuild first (slow), then sign+publish
#
# Any extra argument is passed to make-release.sh as the tag (default v<version>).
set -e

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

export AS_MAC_SIGN_IDENTITY="${AS_MAC_SIGN_IDENTITY:-5B712916DFFDA96219856B41FD49D00AF1E67501}"
export AS_NOTARY_PROFILE="${AS_NOTARY_PROFILE:-AS_NOTARY}"

# Fail early on a missing credential rather than silently shipping an unsigned or
# un-notarized build.
if ! security find-identity -v -p codesigning 2>/dev/null | grep -q "$AS_MAC_SIGN_IDENTITY"; then
  echo "ERROR: signing identity $AS_MAC_SIGN_IDENTITY not found in the keychain." >&2
  echo "       Check: security find-identity -v -p codesigning" >&2
  exit 1
fi
if ! xcrun notarytool history --keychain-profile "$AS_NOTARY_PROFILE" >/dev/null 2>&1; then
  echo "ERROR: notarytool profile '$AS_NOTARY_PROFILE' not found in the keychain." >&2
  echo "       Create it once with:" >&2
  echo "         xcrun notarytool store-credentials $AS_NOTARY_PROFILE \\" >&2
  echo "           --apple-id <your-apple-id-email> --team-id 99W4CS4AMT --password <app-specific-pwd>" >&2
  exit 1
fi

echo "[mac-release] identity ${AS_MAC_SIGN_IDENTITY:0:10}…  notary profile '$AS_NOTARY_PROFILE'"

if [ "${FULL:-no}" = "yes" ]; then
  echo "[mac-release] FULL rebuild from source…"
  SKIP_ASSETS=no "$ROOT/scripts/build-macos.sh"
elif [ "${REBUILD:-no}" = "yes" ]; then
  echo "[mac-release] repackaging from compiled source…"
  SKIP_SOURCE=yes SKIP_ASSETS=no "$ROOT/scripts/build-macos.sh"
else
  echo "[mac-release] signing the already-built app (use REBUILD=yes to repackage first)…"
  SIGN_ONLY=yes "$ROOT/scripts/build-macos.sh"
fi

"$ROOT/scripts/make-release.sh" "$@"

echo "[mac-release] done — signed, notarized, and published."
