#!/usr/bin/env python3
"""Generate the Rice Studio app icon from the Rice University shield.

Auto-crops the shield from Rice-University-Symbol.png, centers it on a white
rounded-square (macOS Big Sur style) with a soft shadow, and writes a 1024px
master PNG. The shell wrapper turns it into .icns (macOS) and .ico (Windows).
"""
import os
from PIL import Image, ImageDraw, ImageFilter

ROOT = "/Users/kerryback/repos/academic_code"
SRC = os.path.join(ROOT, "Rice-University-Symbol.png")
OUT = os.path.join(ROOT, "overlay/icons/rice-studio.png")

S = 1024
margin = 96                      # outer padding to the rounded square
radius = 200
RICE_NAVY = (0, 32, 91, 255)

# --- load shield and crop to its non-transparent bounding box ---------------
shield = Image.open(SRC).convert("RGBA")
bbox = shield.getbbox()          # tight box around non-zero alpha
if bbox:
    shield = shield.crop(bbox)

# scale shield to fit inside the inner area (leave breathing room)
inner = S - 2 * margin - 120     # extra inset so the crest doesn't touch edges
w, h = shield.size
scale = min(inner / w, inner / h)
shield = shield.resize((max(1, int(w * scale)), max(1, int(h * scale))), Image.LANCZOS)

# --- white rounded-square background with a faint vertical gradient ---------
img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
grad = Image.new("RGBA", (S, S), (0, 0, 0, 0))
gd = ImageDraw.Draw(grad)
topc, botc = (255, 255, 255), (232, 235, 242)   # white -> very light grey
for y in range(S):
    t = y / S
    c = tuple(int(topc[i] + (botc[i] - topc[i]) * t) for i in range(3))
    gd.line([(0, y), (S, y)], fill=c + (255,))
mask = Image.new("L", (S, S), 0)
ImageDraw.Draw(mask).rounded_rectangle((margin, margin, S - margin, S - margin),
                                       radius=radius, fill=255)
img.paste(grad, (0, 0), mask)

# --- soft shadow under the shield, then the shield --------------------------
px = (S - shield.width) // 2
py = (S - shield.height) // 2
sh = Image.new("RGBA", (S, S), (0, 0, 0, 0))
sh.paste(Image.new("RGBA", shield.size, (0, 0, 0, 70)), (px, py + 10), shield)
sh = sh.filter(ImageFilter.GaussianBlur(16))
img = Image.alpha_composite(img, sh)
img.alpha_composite(shield, (px, py))

os.makedirs(os.path.dirname(OUT), exist_ok=True)
img.save(OUT)
print("wrote", OUT, img.size)
