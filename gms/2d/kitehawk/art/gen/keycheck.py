#!/usr/bin/env python3
"""Measure what a keyed cutout will actually cost the bake.

  python3 keycheck.py out/*.png

For each plate, reports:
  bg        the backdrop colour, taken as the median of four 24px corner patches
  grain     max per-channel deviation from bg over the outer 3% ring — this is the
            KEY TOLERANCE FLOOR. `paper grain throughout` (D34's stem) puts real
            texture in the backdrop, so an exact-match key removes nothing.
  ring      mean luminance of the outer 2% ring minus mean luminance of the 4-10%
            ring. A large positive number means a cream paper mount or a die-cut
            white sticker border is present -> the plate is a FAIL, not a crop.
  touch     which frame edges the keyed content reaches. Any edge touched means the
            subject is clipped and the cutout will have a straight cut side.
  fill      fraction of the plate that survives the key at tolerance = grain + 4.
"""
import sys, statistics
from PIL import Image

PATCH = 24


def med(vals):
    return statistics.median(vals)


def analyse(path):
    im = Image.open(path).convert("RGB")
    w, h = im.size
    px = im.load()

    corners = []
    for ox, oy in ((0, 0), (w - PATCH, 0), (0, h - PATCH), (w - PATCH, h - PATCH)):
        for y in range(oy, oy + PATCH):
            for x in range(ox, ox + PATCH):
                corners.append(px[x, y])
    bg = tuple(int(med([c[i] for c in corners])) for i in range(3))

    def ring(lo, hi):
        """pixels between lo and hi fractional inset from the frame"""
        a, b = int(min(w, h) * lo), int(min(w, h) * hi)
        out = []
        for y in range(h):
            for x in range(0, w, 2):
                d = min(x, y, w - 1 - x, h - 1 - y)
                if a <= d < b:
                    out.append(px[x, y])
        return out

    outer = ring(0.0, 0.03)
    grain = max(max(abs(c[i] - bg[i]) for i in range(3)) for c in outer)

    def lum(c):
        return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]

    r_in = ring(0.0, 0.02)
    r_out = ring(0.04, 0.10)
    ringdelta = sum(map(lum, r_in)) / len(r_in) - sum(map(lum, r_out)) / len(r_out)

    tol = grain + 4
    def isbg(c):
        return all(abs(c[i] - bg[i]) <= tol for i in range(3))

    kept = 0
    touch = []
    for name, xs, ys in (("L", [0, 1, 2], range(0, h, 2)),
                         ("R", [w - 3, w - 2, w - 1], range(0, h, 2)),
                         ("T", range(0, w, 2), [0, 1, 2]),
                         ("B", range(0, w, 2), [h - 3, h - 2, h - 1])):
        hit = 0
        for x in (xs if not isinstance(xs, list) else xs):
            for y in (ys if not isinstance(ys, list) else ys):
                if not isbg(px[x, y]):
                    hit += 1
        if hit > 12:
            touch.append(f"{name}:{hit}")

    for y in range(0, h, 3):
        for x in range(0, w, 3):
            if not isbg(px[x, y]):
                kept += 1
    fill = kept / ((h // 3 + 1) * (w // 3 + 1))

    return dict(f=path.split("/")[-1], size=f"{w}x{h}", bg=bg, grain=grain,
                ring=round(ringdelta, 1), tol=tol, fill=round(fill, 3),
                touch=",".join(touch) or "-")


print(f"{'plate':28} {'size':10} {'bg':16} {'grain':>5} {'tol':>4} {'ring':>6} {'fill':>6}  edges")
for p in sys.argv[1:]:
    try:
        r = analyse(p)
        flag = ""
        if r["ring"] > 6:
            flag += "  <-- MOUNT/STICKER BORDER"
        if r["touch"] != "-":
            flag += "  <-- CLIPPED"
        print(f"{r['f']:28} {r['size']:10} {str(r['bg']):16} {r['grain']:5} {r['tol']:4} "
              f"{r['ring']:6} {r['fill']:6}  {r['touch']}{flag}")
    except Exception as e:
        print(f"{p}: {e}")
