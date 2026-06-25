#!/usr/bin/env bash
# Build platform icon files from the 1024px master PNG:
#   overlay/icons/academic-studio.icns  (macOS)
#   overlay/icons/academic-studio.ico   (Windows)
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ICONS="$ROOT/overlay/icons"
SRC="$ICONS/rice-studio.png"

python3 "$ROOT/scripts/make-icon.py"

# --- macOS .icns via iconset + iconutil ------------------------------------
SET="$(mktemp -d)/icon.iconset"; mkdir -p "$SET"
for sz in 16 32 128 256 512; do
  sips -z $sz $sz       "$SRC" --out "$SET/icon_${sz}x${sz}.png"      >/dev/null
  sips -z $((sz*2)) $((sz*2)) "$SRC" --out "$SET/icon_${sz}x${sz}@2x.png" >/dev/null
done
iconutil -c icns "$SET" -o "$ICONS/rice-studio.icns"
echo "wrote rice-studio.icns ($(du -h "$ICONS/rice-studio.icns" | cut -f1))"

# --- Windows .ico via Pillow (multi-resolution) ----------------------------
python3 - "$SRC" "$ICONS/rice-studio.ico" <<'PY'
import sys
from PIL import Image
src, out = sys.argv[1], sys.argv[2]
Image.open(src).save(out, sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])
print("wrote", out)
PY
