#!/usr/bin/env bash
# Sign the Windows installers sitting in build-engine/assets/ with signtool,
# using the same cert env vars as the build scripts. For the CI pipeline: download
# the unsigned *Setup.exe artifacts into build-engine/assets/, run this, then
# scripts/make-release.sh.
#
# Run from Git Bash on a Windows machine (x64 or ARM — signtool signs either
# architecture's installer). Set ONE of:
#   AS_WIN_CERT_SHA1="<thumbprint>"                        # cert in the Windows store (EV token)
#   AS_WIN_CERT_FILE="/c/certs/as.pfx" AS_WIN_CERT_PASSWORD="…"   # .pfx file
# Optional: AS_WIN_TIMESTAMP_URL (defaults to DigiCert's RFC-3161 server).
#
# Note: this signs the *installers*. The app binaries inside them were built
# unsigned in CI; because a signed installer writes to Program Files without
# Mark-of-the-Web, SmartScreen keys on the installer signature, so this is the
# meaningful signature for the download/run experience. To also sign the inner
# binaries you'd need the full build tree + SIGN_ONLY (see docs/SIGNING.md).
set -e

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ASSETS="$ROOT/build-engine/assets"

[ -n "${AS_WIN_CERT_FILE:-}${AS_WIN_CERT_SHA1:-}" ] || {
  echo "Set AS_WIN_CERT_SHA1 (thumbprint) or AS_WIN_CERT_FILE (.pfx). See docs/SIGNING.md." >&2; exit 1; }

# Locate signtool the same way build-windows.sh does.
st="$(command -v signtool 2>/dev/null || command -v signtool.exe 2>/dev/null || true)"
[ -n "$st" ] || st="$(ls -d "/c/Program Files (x86)/Windows Kits/10/bin/"*/x64/signtool.exe 2>/dev/null | sort -V | tail -1)"
[ -n "$st" ] || { echo "signtool not found — install the Windows 10/11 SDK." >&2; exit 1; }

ts="${AS_WIN_TIMESTAMP_URL:-http://timestamp.digicert.com}"
if [ -n "${AS_WIN_CERT_FILE:-}" ]; then
  cred=(/f "$AS_WIN_CERT_FILE"); [ -n "${AS_WIN_CERT_PASSWORD:-}" ] && cred+=(/p "$AS_WIN_CERT_PASSWORD")
else
  cred=(/sha1 "$AS_WIN_CERT_SHA1")
fi

shopt -s nullglob
files=("$ASSETS"/*Setup.exe "$ASSETS"/*.msi)
[ "${#files[@]}" -gt 0 ] || { echo "No installers (*Setup.exe/*.msi) in $ASSETS — download the CI artifacts there first." >&2; exit 1; }

for f in "${files[@]}"; do
  echo "[sign] $(basename "$f")"
  # MSYS_NO_PATHCONV stops Git Bash from mangling signtool's /fd /tr /td flags into paths.
  MSYS_NO_PATHCONV=1 "$st" sign /fd SHA256 /tr "$ts" /td SHA256 "${cred[@]}" "$f"
  MSYS_NO_PATHCONV=1 "$st" verify /pa "$f" || echo "WARN: verify failed for $(basename "$f")"
done

echo "[sign] done. Next: scripts/make-release.sh"
