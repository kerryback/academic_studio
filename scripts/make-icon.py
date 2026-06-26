#!/usr/bin/env python3
"""Prepare the Academic Studio app icon from AS_image3.png.

The source is a finished icon: a navy 'A' + orange 'S' monogram on a white
rounded-square tile, but the white fills the whole frame (the tile and the area
outside it are the same white). We KEEP the white tile and clip it to a rounded
rectangle so only the true corners go transparent (macOS expects transparent
corners), then center it at ~80% of the canvas to match the Dock grid.

(Earlier this flood-filled the corners, but because the tile fill and the outside
are the same white with only a soft boundary, the fill leaked across it and ate
the whole white background — leaving the letters floating on transparency. The
rounded-rect mask avoids that.)
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
# Corner radius for the tile — the macOS Big Sur superellipse is ~22.4% of size.
RADIUS = round(CONTENT * 0.2237)
SS = 4  # supersample the mask for smooth, anti-aliased corners

tile = Image.open(SRC).convert("RGBA").resize((CONTENT, CONTENT), Image.LANCZOS)

mask = Image.new("L", (CONTENT * SS, CONTENT * SS), 0)
ImageDraw.Draw(mask).rounded_rectangle(
    [0, 0, CONTENT * SS - 1, CONTENT * SS - 1], radius=RADIUS * SS, fill=255)
mask = mask.resize((CONTENT, CONTENT), Image.LANCZOS)
tile.putalpha(mask)

canvas = Image.new("RGBA", (S, S), (0, 0, 0, 0))
off = (S - CONTENT) // 2
canvas.paste(tile, (off, off), tile)

canvas.save(OUT)
print("wrote", OUT, canvas.size, "tile", tile.size, "radius", RADIUS)
