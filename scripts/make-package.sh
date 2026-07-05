#!/usr/bin/env bash
# Package one Academic Studio catalog package for publishing — NO app rebuild.
#
# Workflow to ship or update a package:
#   1. Edit the skill files under packages/<id>/ (must contain SKILL.md), and/or
#      the entry's pip/mcp fields in site/packages.json.
#   2. Bump that entry's "version" (integer) in site/packages.json.
#   3. Run: scripts/make-package.sh <id>
#      -> builds site/packages/<id>-<version>.tar.gz
#      -> fills in the entry's skill.url + skill.sha256
#      -> refreshes the app's offline snapshot (packages.snapshot.json)
#   4. Commit + push. GitHub Pages deploys site/**; running apps pick the new
#      version up on next launch and offer it to users.
#
# Old tarballs are kept on purpose: an app holding a cached older catalog can
# still install the version it knows about.
#
# Usage: scripts/make-package.sh <package-id>
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ID="${1:?usage: make-package.sh <package-id>}"
SRC="$ROOT/packages/$ID"
CATALOG="$ROOT/site/packages.json"
SNAPSHOT="$ROOT/overlay/builtin-extensions/academic-studio-setup/packages.snapshot.json"
BASE_URL="https://academic-studio.com/packages"

command -v jq >/dev/null 2>&1 || { echo "ERROR: jq not found."; exit 1; }
[ -f "$CATALOG" ] || { echo "ERROR: missing $CATALOG"; exit 1; }

ENTRY="$(jq --arg id "$ID" '.packages[] | select(.id == $id)' "$CATALOG")"
[ -n "$ENTRY" ] || { echo "ERROR: no entry with id '$ID' in site/packages.json — add it first."; exit 1; }

HAS_SKILL="$(echo "$ENTRY" | jq 'has("skill")')"
if [ "$HAS_SKILL" = "true" ]; then
  [ -f "$SRC/SKILL.md" ] || { echo "ERROR: $SRC/SKILL.md not found."; exit 1; }
  VER="$(echo "$ENTRY" | jq -r '.version')"
  case "$VER" in ''|null|*[!0-9]*) echo "ERROR: entry '$ID' needs an integer \"version\"."; exit 1;; esac

  OUT="$ROOT/site/packages/$ID-$VER.tar.gz"
  mkdir -p "$ROOT/site/packages"
  # COPYFILE_DISABLE stops macOS tar from adding ._* AppleDouble entries.
  COPYFILE_DISABLE=1 tar -czf "$OUT" -C "$SRC" .
  if command -v shasum >/dev/null 2>&1; then
    SHA="$(shasum -a 256 "$OUT" | cut -d' ' -f1)"
  else
    SHA="$(sha256sum "$OUT" | cut -d' ' -f1)"
  fi
  URL="$BASE_URL/$ID-$VER.tar.gz"

  TMP="$(mktemp)"
  jq --arg id "$ID" --arg url "$URL" --arg sha "$SHA" \
    '(.packages[] | select(.id == $id) | .skill.url) = $url
     | (.packages[] | select(.id == $id) | .skill.sha256) = $sha' \
    "$CATALOG" > "$TMP" && mv "$TMP" "$CATALOG"
  echo "[package] $ID v$VER"
  echo "  tarball : site/packages/$ID-$VER.tar.gz  ($(du -h "$OUT" | cut -f1 | tr -d ' '))"
  echo "  sha256  : $SHA"
else
  echo "[package] $ID has no skill payload — catalog entry only."
fi

# Refresh the app's bundled offline snapshot so the next app build ships the
# same catalog it would fetch.
cp "$CATALOG" "$SNAPSHOT"
echo "  snapshot: overlay/builtin-extensions/academic-studio-setup/packages.snapshot.json refreshed"
echo
echo "Next: commit + push. The site deploy (pages.yml) publishes the catalog;"
echo "running apps offer the package on their next launch."
