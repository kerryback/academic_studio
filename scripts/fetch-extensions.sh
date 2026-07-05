#!/usr/bin/env bash
# Download the bundled extensions from Open VSX for a given build target and
# emit the product.json `builtInExtensions` fragment used to bake them in.
#
# Usage: scripts/fetch-extensions.sh <target> [--pinned]
#   target  = darwin-arm64 | darwin-x64 | win32-x64 | win32-arm64
#
#   --pinned   Download the EXACT versions recorded in the committed manifest
#              (overlay/extensions/builtin.<target>.json) and verify each file
#              against the manifest's sha256; the manifest is not rewritten.
#              This is what CI and fresh clones use, so every build of a given
#              commit bundles identical extensions.
#
#   (default)  Resolve the LATEST versions from Open VSX and rewrite the
#              manifest. This is the deliberate "bump the bundled extensions"
#              step — review and commit the manifest changes it makes.
#
# Outputs (per target):
#   overlay/extensions/vsix/<target>/<id>.vsix
#   overlay/extensions/builtin.<target>.json   (latest mode only)
set -euo pipefail

TARGET="${1:?usage: fetch-extensions.sh <target> [--pinned]}"
MODE="latest"
[ "${2:-}" = "--pinned" ] && MODE="pinned"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXTDIR="$ROOT/overlay/extensions"
LIST="$EXTDIR.json"
[ -f "$LIST" ] || { echo "missing extension list ($LIST)"; exit 1; }
OUTDIR="$EXTDIR/vsix/$TARGET"
MANIFEST="$EXTDIR/builtin.$TARGET.json"
mkdir -p "$OUTDIR"

API="https://open-vsx.org/api"
# Retry transient Open VSX hiccups instead of failing the whole build matrix.
CURL=(curl -fsSL --retry 3 --retry-delay 2)

sha_of() {
  if command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1" | cut -d' ' -f1
  else sha256sum "$1" | cut -d' ' -f1; fi
}

# Original-case id + universal/platform mode for a lowercased folder name
# (the manifest stores lowercased publisher.name; the Open VSX API wants the
# real namespace/name from extensions.json).
lookup_id() {  # $1 = lowercase folder name; echoes "<id> <mode>"
  local id
  for id in $(jq -r '.universal[]' "$LIST" | tr -d '\r'); do
    [ "$(echo "$id" | tr '[:upper:]' '[:lower:]')" = "$1" ] && { echo "$id universal"; return 0; }
  done
  for id in $(jq -r '.platformSpecific[]' "$LIST" | tr -d '\r'); do
    [ "$(echo "$id" | tr '[:upper:]' '[:lower:]')" = "$1" ] && { echo "$id platform"; return 0; }
  done
  return 1
}

# ---- pinned mode -------------------------------------------------------------
fetch_pinned_one() {   # $1=folder $2=version $3=sha256
  local folder="$1" version="$2" sha="$3"
  if [ -f "$OUTDIR/$folder.vsix" ] && [ "$(sha_of "$OUTDIR/$folder.vsix")" = "$sha" ]; then
    echo "$version" > "$OUTDIR/$folder.version"
    echo "  cached $folder@$version (sha ok)"
    return 0
  fi
  local pair id mode ns name meta url
  pair="$(lookup_id "$folder")" || { echo "  !! $folder is in the manifest but not overlay/extensions.json"; return 1; }
  id="${pair% *}"; mode="${pair#* }"
  ns="${id%%.*}"; name="${id#*.}"
  if [ "$mode" = "platform" ]; then
    meta="$("${CURL[@]}" "$API/$ns/$name/$TARGET/$version")"
  else
    meta="$("${CURL[@]}" "$API/$ns/$name/$version")"
  fi
  url="$(echo "$meta" | jq -r '.files.download' | tr -d '\r')"
  if [ -z "$url" ] || [ "$url" = "null" ]; then
    echo "  !! no download for $folder@$version ($mode/$TARGET)"; return 1
  fi
  local tmp; tmp="$(mktemp -d)"
  "${CURL[@]}" "$url" -o "$tmp/ext.vsix"
  local got; got="$(sha_of "$tmp/ext.vsix")"
  if [ "$got" != "$sha" ]; then
    echo "  !! sha256 MISMATCH for $folder@$version — refusing this file"
    echo "     manifest: $sha"
    echo "     download: $got"
    rm -rf "$tmp"; return 1
  fi
  mv "$tmp/ext.vsix" "$OUTDIR/$folder.vsix"; rm -rf "$tmp"
  echo "$version" > "$OUTDIR/$folder.version"
  echo "  ok  $folder@$version (pinned, sha verified)"
}

if [ "$MODE" = "pinned" ]; then
  [ -f "$MANIFEST" ] || { echo "missing $MANIFEST — run once without --pinned to create it, review, and commit."; exit 1; }
  echo "[fetch] target=$TARGET (pinned from overlay/extensions/builtin.$TARGET.json) -> $OUTDIR"
  fail=0
  while IFS=$'\t' read -r folder version sha; do
    fetch_pinned_one "$folder" "$version" "$sha" || fail=1
  done < <(jq -r '.builtInExtensions[] | [.name, .version, .sha256] | @tsv' "$MANIFEST")
  [ "$fail" -eq 0 ] || { echo "[fetch] FAILED — one or more pinned extensions could not be fetched/verified."; exit 1; }
  echo "[fetch] pinned fetch complete ($(jq '.builtInExtensions | length' "$MANIFEST") extensions)"
  exit 0
fi

# ---- latest mode: resolve newest versions and REWRITE the manifest ------------
ENTRIES="[]"   # accumulates builtInExtensions JSON

fetch_one() {
  local id="$1" mode="$2"        # mode: universal | platform
  local ns="${id%%.*}" name="${id#*.}" meta url version
  if [ "$mode" = "platform" ]; then
    meta="$("${CURL[@]}" "$API/$ns/$name/$TARGET/latest")"
  else
    meta="$("${CURL[@]}" "$API/$ns/$name")"
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
    "${CURL[@]}" "$url" -o "$tmp/ext.vsix"
    # confirm folder id from the real manifest (publisher.name)
    local realfolder deps
    realfolder="$(unzip -p "$tmp/ext.vsix" extension/package.json | jq -r '"\(.publisher).\(.name)"' | tr '[:upper:]' '[:lower:]' | tr -d '\r')"
    deps="$(unzip -p "$tmp/ext.vsix" extension/package.json | jq -rc '.extensionDependencies // []' | tr -d '\r')"
    [ "$realfolder" != "$folder" ] && folder="$realfolder"
    mv "$tmp/ext.vsix" "$OUTDIR/$folder.vsix"; rm -rf "$tmp"
    echo "$version" > "$OUTDIR/$folder.version"
    echo "  ok  $folder@$version  ($(du -h "$OUTDIR/$folder.vsix" | cut -f1))  deps=$deps"
  fi

  # sha256 of the vsix is REQUIRED by the build's local-vsix checksum check,
  # and is what --pinned mode verifies downloads against.
  local sha; sha="$(sha_of "$OUTDIR/$folder.vsix")"
  ENTRIES="$(echo "$ENTRIES" | jq \
    --arg name "$folder" --arg version "$version" \
    --arg vsix "as-extensions/$folder.vsix" --arg sha "$sha" \
    '. += [{name: $name, version: $version, sha256: $sha, vsix: $vsix}]')"
}

echo "[fetch] target=$TARGET (resolving LATEST — rewrites the manifest) -> $OUTDIR"
for id in $(jq -r '.universal[]' "$LIST" | tr -d '\r'); do
  echo "- universal: $id"; fetch_one "$id" universal
done
for id in $(jq -r '.platformSpecific[]' "$LIST" | tr -d '\r'); do
  echo "- platform : $id"; fetch_one "$id" platform
done

echo "{\"builtInExtensions\": $ENTRIES}" | jq '.' > "$MANIFEST"
echo "[fetch] wrote overlay/extensions/builtin.$TARGET.json ($(echo "$ENTRIES" | jq length) extensions)"
echo "[fetch] review + commit the manifest to pin these versions for CI (--pinned)."
