#!/usr/bin/env python3
"""Prepare the Academic Studio app icon from AS_image3.png.

The source is a finished icon (navy 'A' + orange 'S' monogram on a near-white
rounded square, with opaque white corners). We resize to 1024, flood-fill the
four white corners to transparent (macOS expects transparent corners), then
re-pad the squircle to ~80% of the canvas so it matches the Dock grid.
"""
import os
from PIL import Image, ImageDraw

ROOT = "/Users/kerryback/repos/academic_code"
SRC = os.path.join(ROOT, "AS_image3.png")
OUT = os.path.join(ROOT, "overlay/icons/academic-studio.png")

S = 1024
# Content occupies ~80% of the canvas, leaving ~10% transparent margin per side
# to match the macOS Dock grid (a full-bleed icon renders visibly larger than
# every neighbor, which expects this padding).
CONTENT = round(S * 0.80)

img = Image.open(SRC).convert("RGBA").resize((S, S), Image.LANCZOS)

# Flood-fill from each corner, turning the connected near-white border region
# transparent. The navy field bounds the fill, so interior white (book) is safe.
for corner in [(0, 0), (S - 1, 0), (0, S - 1), (S - 1, S - 1)]:
    ImageDraw.floodfill(img, corner, (0, 0, 0, 0), thresh=40)

# Crop to the visible artwork, then re-pad to CONTENT centered on a transparent
# S x S canvas so the shape sits inside the standard margin.
bbox = img.split()[3].getbbox()
art = img.crop(bbox)
art.thumbnail((CONTENT, CONTENT), Image.LANCZOS)
canvas = Image.new("RGBA", (S, S), (0, 0, 0, 0))
canvas.paste(art, ((S - art.width) // 2, (S - art.height) // 2), art)

canvas.save(OUT)
print("wrote", OUT, canvas.size, "content", art.size)
