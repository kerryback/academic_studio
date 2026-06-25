#!/usr/bin/env bash
# Download the bundled extensions from Open VSX for a given build target and
# emit the product.json `builtInExtensions` fragment used to bake them in.
#
# Usage: scripts/fetch-extensions.sh <edition> <target>
#   edition = student | faculty
#   target  = darwin-arm64 | darwin-x64 | win32-x64 | win32-arm64
#
# Outputs (per edition+target):
#   overlay/editions/<edition>/extensions/vsix/<target>/<id>.vsix
#   overlay/editions/<edition>/extensions/builtin.<target>.json
set -euo pipefail

EDITION="${1:?usage: fetch-extensions.sh <edition> <target>}"
TARGET="${2:?usage: fetch-extensions.sh <edition> <target>}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EDIR="$ROOT/overlay/editions/$EDITION"
LIST="$EDIR/extensions.json"
[ -f "$LIST" ] || { echo "unknown edition '$EDITION' (no $LIST)"; exit 1; }
OUTDIR="$EDIR/extensions/vsix/$TARGET"
mkdir -p "$OUTDIR"

API="https://open-vsx.org/api"
ENTRIES="[]"   # accumulates builtInExtensions JSON

fetch_one() {
  local id="$1" mode="$2"        # mode: universal | platform
  local ns="${id%%.*}" name="${id#*.}" meta url version
  if [ "$mode" = "platform" ]; then
    meta="$(curl -fsSL "$API/$ns/$name/$TARGET/latest")"
  else
    meta="$(curl -fsSL "$API/$ns/$name")"
  fi
  version="$(echo "$meta" | jq -r '.version' | tr -d '\r')"
  url="$(echo "$meta" | jq -r '.files.download' | tr -d '\r')"
  if [ -z "$url" ] || [ "$url" = "null" ]; then
    echo "  !! no download for $id ($mode/$TARGET)"; return 1
  fi

  # canonical extension folder id = <publisher>.<name>, lowercased.
  # (Open VSX namespace/name lowercased == the vsix's publisher.name lowercased.)
  local folder; folder="$(echo "$id" | tr '[:upper:]' '[:lower:]')"

  # download unless an up-to-date copy is already cached
  if [ -f "$OUTDIR/$folder.vsix" ] && [ "$(cat "$OUTDIR/$folder.version" 2>/dev/null)" = "$version" ]; then
    echo "  cached $folder@$version"
  else
    local tmp; tmp="$(mktemp -d)"
    curl -fsSL "$url" -o "$tmp/ext.vsix"
    # confirm folder id from the real manifest (publisher.name)
    local realfolder deps
    realfolder="$(unzip -p "$tmp/ext.vsix" extension/package.json | jq -r '"\(.publisher).\(.name)"' | tr '[:upper:]' '[:lower:]' | tr -d '\r')"
    deps="$(unzip -p "$tmp/ext.vsix" extension/package.json | jq -rc '.extensionDependencies // []' | tr -d '\r')"
    [ "$realfolder" != "$folder" ] && folder="$realfolder"
    mv "$tmp/ext.vsix" "$OUTDIR/$folder.vsix"; rm -rf "$tmp"
    echo "$version" > "$OUTDIR/$folder.version"
    echo "  ok  $folder@$version  ($(du -h "$OUTDIR/$folder.vsix" | cut -f1))  deps=$deps"
  fi

  # sha256 of the vsix is REQUIRED by the build's local-vsix checksum check
  local sha
  if command -v shasum >/dev/null 2>&1; then
    sha="$(shasum -a 256 "$OUTDIR/$folder.vsix" | cut -d' ' -f1)"
  else
    sha="$(sha256sum "$OUTDIR/$folder.vsix" | cut -d' ' -f1)"
  fi
  ENTRIES="$(echo "$ENTRIES" | jq \
    --arg name "$folder" --arg version "$version" \
    --arg vsix "as-extensions/$folder.vsix" --arg sha "$sha" \
    '. += [{name: $name, version: $version, sha256: $sha, vsix: $vsix}]')"
}

echo "[fetch] edition=$EDITION target=$TARGET -> $OUTDIR"
for id in $(jq -r '.universal[]' "$LIST" | tr -d '\r'); do
  echo "- universal: $id"; fetch_one "$id" universal
done
for id in $(jq -r '.platformSpecific[]' "$LIST" | tr -d '\r'); do
  echo "- platform : $id"; fetch_one "$id" platform
done

echo "{\"builtInExtensions\": $ENTRIES}" | jq '.' > "$EDIR/extensions/builtin.$TARGET.json"
echo "[fetch] wrote editions/$EDITION/extensions/builtin.$TARGET.json ($(echo "$ENTRIES" | jq length) extensions)"
