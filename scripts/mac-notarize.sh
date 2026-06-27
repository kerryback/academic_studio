#!/usr/bin/env bash
# Notarize and staple a signed .app or .dmg with Apple's notary service.
# Called by build-macos.sh after code-signing. Safe to run standalone too.
#
# Credentials — set ONE of:
#   AS_NOTARY_PROFILE   name of a notarytool keychain profile created with
#                       `xcrun notarytool store-credentials` (recommended)
#   AS_APPLE_ID + AS_APPLE_TEAM_ID + AS_APPLE_PWD
#                       Apple ID, Team ID, and an app-specific password
#
# If no credentials are set, this is a no-op (the build stays signed-but-not-
# notarized, which still works for local use but not for clean distribution).
set -e

TARGET="$1"
[ -n "$TARGET" ] && [ -e "$TARGET" ] || { echo "[notarize] target not found: '$TARGET'"; exit 1; }

auth=()
if [ -n "${AS_NOTARY_PROFILE:-}" ]; then
  auth=(--keychain-profile "$AS_NOTARY_PROFILE")
elif [ -n "${AS_APPLE_ID:-}" ] && [ -n "${AS_APPLE_TEAM_ID:-}" ] && [ -n "${AS_APPLE_PWD:-}" ]; then
  auth=(--apple-id "$AS_APPLE_ID" --team-id "$AS_APPLE_TEAM_ID" --password "$AS_APPLE_PWD")
else
  echo "[notarize] no notary credentials (AS_NOTARY_PROFILE, or AS_APPLE_ID + AS_APPLE_TEAM_ID + AS_APPLE_PWD) — skipping."
  exit 0
fi

# notarytool wants a container; a .app must be zipped first, a .dmg submits as-is.
SUBMIT="$TARGET"
TMP=""
case "$TARGET" in
  *.app)
    TMP="$(mktemp -d)"; SUBMIT="$TMP/$(basename "$TARGET").zip"
    ditto -c -k --keepParent "$TARGET" "$SUBMIT" ;;
esac

echo "[notarize] submitting $(basename "$TARGET") (this can take a few minutes)…"
xcrun notarytool submit "$SUBMIT" "${auth[@]}" --wait

echo "[notarize] stapling ticket to $(basename "$TARGET")…"
xcrun stapler staple "$TARGET"

[ -n "$TMP" ] && rm -rf "$TMP"
echo "[notarize] done: $(basename "$TARGET")"
