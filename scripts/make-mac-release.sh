#!/usr/bin/env bash
# One-command macOS release: sign + notarize + package the .dmg, then publish it
# to the GitHub Release. Wraps build-macos.sh (signing) + make-release.sh (upload)
# with the credentials that are already set up on this Mac.
#
# Credentials (override via env only if they change):
#   AS_MAC_SIGN_IDENTITY  Developer ID Application cert SHA-1 hash (keychain)
#   Notarization uses an App Store Connect API key (.p8) by default — see below —
#   because a notarytool KEYCHAIN PROFILE cannot be read from a detached/background
#   process (it fails with "No Keychain password item found"), which is how these
#   signing runs execute. The key file is keychain-free and always works.
#     AS_NOTARY_KEY / _KEY_ID / _ISSUER   API key path + ids (auto-discovered)
#     AS_NOTARY_PROFILE                    keychain-profile fallback (interactive)
#   See docs/SIGNING.md.
#
# Modes:
#   scripts/make-mac-release.sh              # sign the already-built .app, then publish (fast)
#   REBUILD=yes scripts/make-mac-release.sh  # repackage from compiled source first, then sign+publish
#   FULL=yes    scripts/make-mac-release.sh  # full source rebuild first (slow), then sign+publish
#
# Extra arguments pass through to make-release.sh — e.g. `--staging` publishes
# to the staging prerelease instead of the public release, or a tag name
# overrides the default v<version>.
set -e

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

export AS_MAC_SIGN_IDENTITY="${AS_MAC_SIGN_IDENTITY:-5B712916DFFDA96219856B41FD49D00AF1E67501}"
export AS_NOTARY_PROFILE="${AS_NOTARY_PROFILE:-AS_NOTARY}"

# Prefer the App Store Connect API key over the keychain profile: the profile is
# unreadable from a detached/background process, but a key file is not. Auto-discover
# AuthKey_<KEYID>.p8 at the repo root (the id is derived from the filename, so a
# rotated key needs no code change). The .p8 is gitignored — if it's absent, this is
# a no-op and we fall back to the keychain profile. Explicit env vars still win.
if [ -z "${AS_NOTARY_KEY:-}" ]; then
  for k in "$ROOT"/AuthKey_*.p8; do
    [ -f "$k" ] || continue
    export AS_NOTARY_KEY="$k"
    kid="${k##*/AuthKey_}"
    export AS_NOTARY_KEY_ID="${AS_NOTARY_KEY_ID:-${kid%.p8}}"
    export AS_NOTARY_ISSUER="${AS_NOTARY_ISSUER:-dca426cf-788e-4206-8eb1-f4e1c75e350d}"
    break
  done
fi

# Fail early on a missing credential rather than silently shipping an unsigned or
# un-notarized build.
if ! security find-identity -v -p codesigning 2>/dev/null | grep -q "$AS_MAC_SIGN_IDENTITY"; then
  echo "ERROR: signing identity $AS_MAC_SIGN_IDENTITY not found in the keychain." >&2
  echo "       Check: security find-identity -v -p codesigning" >&2
  exit 1
fi
# A direct App Store Connect API key (AS_NOTARY_KEY + _KEY_ID + _ISSUER) needs no
# keychain — it works in detached/non-interactive runs where keychain access is
# lost — so skip the keychain pre-check when it's provided.
if [ -n "${AS_NOTARY_KEY:-}" ] && [ -n "${AS_NOTARY_KEY_ID:-}" ] && [ -n "${AS_NOTARY_ISSUER:-}" ]; then
  :
elif ! xcrun notarytool history --keychain-profile "$AS_NOTARY_PROFILE" >/dev/null 2>&1; then
  echo "ERROR: notarytool profile '$AS_NOTARY_PROFILE' not found in the keychain." >&2
  echo "       Create it once with:" >&2
  echo "         xcrun notarytool store-credentials $AS_NOTARY_PROFILE \\" >&2
  echo "           --apple-id <your-apple-id-email> --team-id 99W4CS4AMT --password <app-specific-pwd>" >&2
  exit 1
fi

if [ -n "${AS_NOTARY_KEY:-}" ]; then
  echo "[mac-release] identity ${AS_MAC_SIGN_IDENTITY:0:10}…  notary: API key ${AS_NOTARY_KEY_ID} (${AS_NOTARY_KEY##*/})"
else
  echo "[mac-release] identity ${AS_MAC_SIGN_IDENTITY:0:10}…  notary: keychain profile '$AS_NOTARY_PROFILE'"
fi

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
