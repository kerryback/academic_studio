#!/usr/bin/env bash
# Turn a finished square icon PNG into transparent-corner .png/.icns/.ico.
# Usage: scripts/make-named-icon.sh <source.png> <name>
#   -> overlay/icons/<name>.png  .icns  .ico
set -euo pipefail
SRC="${1:?usage: make-named-icon.sh <source.png> <name>}"
NAME="${2:?usage: make-named-icon.sh <source.png> <name>}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ICONS="$ROOT/overlay/icons"
PNG="$ICONS/$NAME.png"
mkdir -p "$ICONS"

# 1) resize to 1024 + flood-fill the four corners to transparent (macOS style)
python3 - "$SRC" "$PNG" <<'PY'
import sys
from PIL import Image, ImageDraw
src, out = sys.argv[1], sys.argv[2]
S = 1024
img = Image.open(src).convert("RGBA").resize((S, S), Image.LANCZOS)
for c in [(0, 0), (S - 1, 0), (0, S - 1), (S - 1, S - 1)]:
    ImageDraw.floodfill(img, c, (0, 0, 0, 0), thresh=40)
img.save(out)
print("wrote", out)
PY

# 2) macOS .icns
SET="$(mktemp -d)/icon.iconset"; mkdir -p "$SET"
for sz in 16 32 128 256 512; do
  sips -z $sz $sz             "$PNG" --out "$SET/icon_${sz}x${sz}.png"      >/dev/null
  sips -z $((sz*2)) $((sz*2)) "$PNG" --out "$SET/icon_${sz}x${sz}@2x.png"   >/dev/null
done
iconutil -c icns "$SET" -o "$ICONS/$NAME.icns"

# 3) Windows .ico
python3 - "$PNG" "$ICONS/$NAME.ico" <<'PY'
import sys
from PIL import Image
Image.open(sys.argv[1]).save(sys.argv[2], sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])
PY
echo "wrote $NAME.png/.icns/.ico"
