#!/usr/bin/env python3
"""Contact/review sheets for the MV packs.
  python3 tools/mv_sheet.py contact <media dir> <out.jpg> [cols]      all images, small, labelled
  python3 tools/mv_sheet.py review <media dir> <outprefix> [start] [n] review grids of 6, larger
  python3 tools/mv_sheet.py keys <media dir> <outprefix> id-1,id-2,...
"""
import sys, os, glob
from PIL import Image, ImageDraw, ImageFont

def font(sz):
    for p in ['/System/Library/Fonts/Supplemental/Arial.ttf', '/System/Library/Fonts/Helvetica.ttc']:
        if os.path.exists(p):
            return ImageFont.truetype(p, sz)
    return ImageFont.load_default()

def grid(files, cols, tw, out, fs):
    th = int(tw * 2 / 3)
    rows = (len(files) + cols - 1) // cols
    lab = fs + 6
    sheet = Image.new('RGB', (cols * tw, rows * (th + lab)), (24, 24, 28))
    d = ImageDraw.Draw(sheet)
    f = font(fs)
    for i, p in enumerate(files):
        im = Image.open(p).convert('RGB').resize((tw, th))
        x, y = (i % cols) * tw, (i // cols) * (th + lab)
        sheet.paste(im, (x, y))
        d.text((x + 4, y + th + 2), os.path.basename(p).rsplit('.', 1)[0], fill=(235, 235, 235), font=f)
    sheet.save(out, quality=82)
    print(out, len(files))

mode, media = sys.argv[1], sys.argv[2]
files = sorted(glob.glob(os.path.join(media, '*.webp')))
if mode == 'contact':
    cols = int(sys.argv[4]) if len(sys.argv) > 4 else 16
    grid(files, cols, 160, sys.argv[3], 11)
elif mode == 'keys':
    sel = [os.path.join(media, k + '.webp') for k in sys.argv[4].split(',')]
    for k in range(0, len(sel), 6):
        grid(sel[k:k + 6], 3, 520, f'{sys.argv[3]}_{k:03d}.jpg', 16)
else:
    start = int(sys.argv[4]) if len(sys.argv) > 4 else 0
    n = int(sys.argv[5]) if len(sys.argv) > 5 else len(files)
    sel = files[start:start + n]
    for k in range(0, len(sel), 6):
        grid(sel[k:k + 6], 3, 520, f'{sys.argv[3]}_{start + k:03d}.jpg', 16)
