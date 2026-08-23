#!/usr/bin/env python3
"""Contact sheet for visual triage.  python3 contact.py out.png cell_px file...

Triage only. A halo or a 1px clipped edge does not survive downscaling — use
keycheck.py for those and open the individual plate for anything suspicious.
"""
import sys, math
from PIL import Image, ImageDraw

out, cell = sys.argv[1], int(sys.argv[2])
files = sys.argv[3:]
cols = math.ceil(math.sqrt(len(files) * 1.4))
rows = math.ceil(len(files) / cols)
pad, label = 6, 14
sheet = Image.new("RGB", (cols * (cell + pad) + pad, rows * (cell + pad + label) + pad), (30, 30, 34))
d = ImageDraw.Draw(sheet)
for i, f in enumerate(files):
    im = Image.open(f).convert("RGB")
    im.thumbnail((cell, cell), Image.LANCZOS)
    x = pad + (i % cols) * (cell + pad)
    y = pad + (i // cols) * (cell + pad + label)
    sheet.paste(im, (x + (cell - im.width) // 2, y + (cell - im.height) // 2))
    d.text((x + 2, y + cell + 1), f.split("/")[-1].replace(".png", ""), fill=(210, 210, 215))
sheet.save(out)
print(out, sheet.size, len(files), "plates")
