#!/usr/bin/env bash
# Sync a skill's files from the kerryback/skills plugin marketplace (the single
# source of truth) into academic_code/packages/<id>, so the Academic Studio tarball
# is built from the same files and can't drift. Run before make-package.sh <id>.
#
# Usage: scripts/sync-from-marketplace.sh <id>   (e.g. voiceover)
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ID="${1:?usage: sync-from-marketplace.sh <id>}"
SKILLS="${SKILLS_REPO:-$HOME/repos/skills}"
SRC="$SKILLS/plugins/$ID/skills/$ID"
DST="$ROOT/packages/$ID"
[ -d "$SRC" ] || { echo "ERROR: $SRC not found — clone kerryback/skills to $SKILLS (or set SKILLS_REPO)."; exit 1; }
rm -rf "$DST"; mkdir -p "$DST"
rsync -a \
  --exclude '.git' --exclude 'node_modules' --exclude '__pycache__' \
  --exclude '.venv' --exclude 'venv' --exclude 'data' \
  "$SRC/" "$DST/"
echo "synced $ID from marketplace: $SRC -> $DST"
echo "next: scripts/make-package.sh $ID"
