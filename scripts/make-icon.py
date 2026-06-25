#!/usr/bin/env python3
"""Prepare the Academic Studio app icon from AcademicStudio.png.

The source is already a finished icon (ribbon 'A' over a book on navy, with a
rounded-square shape baked in but opaque white corners). We resize to 1024 and
flood-fill the four white corners to transparent (macOS expects transparent
corners) without disturbing the white book pages inside the navy field.
"""
import os
from PIL import Image, ImageDraw

ROOT = "/Users/kerryback/repos/academic_code"
SRC = os.path.join(ROOT, "AcademicStudio.png")
OUT = os.path.join(ROOT, "overlay/icons/academic-studio.png")

S = 1024
img = Image.open(SRC).convert("RGBA").resize((S, S), Image.LANCZOS)

# Flood-fill from each corner, turning the connected near-white border region
# transparent. The navy field bounds the fill, so interior white (book) is safe.
for corner in [(0, 0), (S - 1, 0), (0, S - 1), (S - 1, S - 1)]:
    ImageDraw.floodfill(img, corner, (0, 0, 0, 0), thresh=40)

img.save(OUT)
print("wrote", OUT, img.size)
