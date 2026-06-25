#!/usr/bin/env python3
"""Generate the Academic Studio app icon (placeholder).

Draws a graduation mortarboard on a rounded-square indigo gradient, then writes
a 1024px master PNG. The shell wrapper turns it into .icns (macOS) and .ico (Win).
Replace overlay/icons/academic-studio.png with real art to rebrand.
"""
import math
from PIL import Image, ImageDraw, ImageFilter

S = 1024
img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

# --- rounded-square background with vertical gradient (indigo -> blue) ------
margin = 96               # macOS Big Sur style padding
box = (margin, margin, S - margin, S - margin)
radius = 200
top = (62, 56, 168)       # deep indigo
bot = (37, 99, 235)       # blue
grad = Image.new("RGBA", (S, S), (0, 0, 0, 0))
gd = ImageDraw.Draw(grad)
for y in range(S):
    t = y / S
    r = int(top[0] + (bot[0] - top[0]) * t)
    g = int(top[1] + (bot[1] - top[1]) * t)
    b = int(top[2] + (bot[2] - top[2]) * t)
    gd.line([(0, y), (S, y)], fill=(r, g, b, 255))
mask = Image.new("L", (S, S), 0)
ImageDraw.Draw(mask).rounded_rectangle(box, radius=radius, fill=255)
img.paste(grad, (0, 0), mask)

# subtle inner highlight at top
hl = Image.new("RGBA", (S, S), (0, 0, 0, 0))
ImageDraw.Draw(hl).rounded_rectangle(
    (margin, margin, S - margin, S // 2), radius=radius, fill=(255, 255, 255, 22))
img = Image.alpha_composite(img, hl)
d = ImageDraw.Draw(img)

# --- mortarboard (graduation cap) -------------------------------------------
cx, cy = S // 2, int(S * 0.46)        # center of the board
hw, hh = 300, 150                     # board half-width / half-height (perspective)
white = (255, 255, 255, 255)
shadow = (20, 24, 60, 90)

# drop shadow for the board
sh = Image.new("RGBA", (S, S), (0, 0, 0, 0))
ImageDraw.Draw(sh).polygon(
    [(cx, cy - hh + 18), (cx + hw, cy + 18), (cx, cy + hh + 18), (cx - hw, cy + 18)],
    fill=shadow)
sh = sh.filter(ImageFilter.GaussianBlur(14))
img = Image.alpha_composite(img, sh)
d = ImageDraw.Draw(img)

# the flat board (rhombus)
board = [(cx, cy - hh), (cx + hw, cy), (cx, cy + hh), (cx - hw, cy)]
d.polygon(board, fill=white)

# the cap base (head piece) hanging below the board front edge
base_w, base_top, base_h = 150, cy + 28, 120
d.polygon([
    (cx - base_w, base_top), (cx + base_w, base_top),
    (cx + base_w - 26, base_top + base_h), (cx - base_w + 26, base_top + base_h),
], fill=(226, 232, 255, 255))
# arch cutout under the base for a cap-like silhouette
d.pieslice([cx - base_w, base_top + base_h - 60, cx + base_w, base_top + base_h + 60],
           0, 180, fill=top + (255,))

# center button
d.ellipse([cx - 22, cy - 22, cx + 22, cy + 22], fill=(250, 204, 21, 255))  # gold

# tassel: cord from button to the right edge, then hanging strands
edge = (cx + hw - 30, cy + 6)
d.line([(cx, cy), edge], fill=(250, 204, 21, 255), width=10)
d.line([edge, (edge[0] + 6, edge[1] + 150)], fill=(250, 204, 21, 255), width=10)
# tassel tuft
tx, ty = edge[0] + 6, edge[1] + 150
for i in range(-3, 4):
    d.line([(tx, ty), (tx + i * 9, ty + 70)], fill=(250, 204, 21, 255), width=7)
d.ellipse([tx - 22, ty - 18, tx + 22, ty + 14], fill=(253, 224, 71, 255))

img.save("/Users/kerryback/repos/academic_code/overlay/icons/academic-studio.png")
print("wrote overlay/icons/academic-studio.png (1024x1024)")
