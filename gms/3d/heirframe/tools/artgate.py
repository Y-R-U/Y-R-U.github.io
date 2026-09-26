#!/usr/bin/env python3
"""HEIRFRAME art gate: image statistics for screenshots vs the refs. Stdlib only (PNG decode via macOS `sips` -> BMP).

  artgate.py shot.png                      stats + PASS/FAIL against the gameplay targets
  artgate.py shot.png --base old.png       also % of frame changed vs a baseline shot
  artgate.py shot.png --crop 0.2,0.6,0.8,1 stats of a sub-rectangle (fractions x0,y0,x1,y1)
  artgate.py --refs                        stats of the ref crops the targets were derived from
  artgate.py a.png b.png --sbs out.png     side-by-side (for blind critics); needs sips only
"""
import os, sys, json, struct, subprocess, tempfile, colorsys, math

HERE = os.path.dirname(os.path.abspath(__file__))
REFS = os.path.join(HERE, '..', 'refs')
W = 480

# Ref crops that stand in for what the gameplay camera sees (paving, robots, reflections).
REF_CROPS = {
    'plaza_floor': ('ref_plaza_gold.png', (0.28, 0.62, 0.95, 1.0)),
    'blue_floor': ('ref_boulevard_blue.png', (0.25, 0.62, 0.95, 1.0)),
    'plaza_full': ('ref_plaza_gold.png', (0, 0, 1, 1)),
    'blue_full': ('ref_boulevard_blue.png', (0, 0, 1, 1)),
}

# Targets set from the ref floor crops (see --refs); (min, max), None = unbounded.
TARGETS = {
    'luma_mean': (0.30, 0.52),
    'luma_p5': (None, 0.12),
    'luma_range': (0.62, None),
    'luma_std': (0.17, None),
    'dark_pct': (6.0, None),
    'hi_pct': (1.0, None),
    'sat_mean': (0.18, None),
    'detail': (0.030, None),
}


def load(path, width=W):
    fd, tmp = tempfile.mkstemp(suffix='.bmp'); os.close(fd)
    try:
        subprocess.run(['sips', '-s', 'format', 'bmp', '--resampleWidth', str(width), path, '--out', tmp],
                       check=True, capture_output=True)
        b = open(tmp, 'rb').read()
    finally:
        os.unlink(tmp)
    off = struct.unpack_from('<I', b, 10)[0]
    w, h = struct.unpack_from('<ii', b, 18)
    bpp = struct.unpack_from('<H', b, 28)[0]
    comp = struct.unpack_from('<I', b, 30)[0]
    bps = bpp // 8
    stride = (w * bps + 3) & ~3
    flip = h > 0; h = abs(h)
    px = []
    for y in range(h):
        ry = (h - 1 - y) if flip else y
        row = b[off + ry * stride: off + ry * stride + w * bps]
        px.append([(row[i + 2], row[i + 1], row[i]) for i in range(0, w * bps, bps)])
    return px


def crop(px, c):
    h, w = len(px), len(px[0])
    x0, y0, x1, y1 = int(c[0] * w), int(c[1] * h), int(c[2] * w), int(c[3] * h)
    return [row[x0:x1] for row in px[y0:y1]]


def pct(sorted_vals, p):
    return sorted_vals[min(len(sorted_vals) - 1, int(p / 100 * len(sorted_vals)))]


HUES = ['red', 'orange', 'gold', 'green', 'cyan', 'blue', 'violet', 'pink']
HUE_EDGES = [15, 38, 65, 160, 195, 250, 290, 340]


def stats(px):
    h, w = len(px), len(px[0])
    lum, sats = [], []
    hues = dict.fromkeys(HUES, 0)
    dark = hi = 0
    warm = cool = 0
    for row in px:
        for r, g, b in row:
            l = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
            lum.append(l)
            hh, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            sats.append(s)
            if l < 0.15: dark += 1
            if l > 0.85: hi += 1
            if s > 0.22 and v > 0.12:
                d = hh * 360
                k = next((i for i, e in enumerate(HUE_EDGES) if d < e), 0)
                hues[HUES[k]] += 1
                if HUES[k] in ('red', 'orange', 'gold'): warm += 1
                if HUES[k] in ('cyan', 'blue'): cool += 1
    n = len(lum)
    grad = 0.0
    for y in range(h - 1):
        for x in range(w - 1):
            i = y * w + x
            grad += abs(lum[i] - lum[i + 1]) + abs(lum[i] - lum[i + w])
    sl = sorted(lum)
    mean = sum(lum) / n
    std = math.sqrt(sum((v - mean) ** 2 for v in lum) / n)
    return {
        'luma_mean': round(mean, 3), 'luma_std': round(std, 3),
        'luma_p5': round(pct(sl, 5), 3), 'luma_p50': round(pct(sl, 50), 3), 'luma_p95': round(pct(sl, 95), 3),
        'luma_range': round(pct(sl, 95) - pct(sl, 5), 3),
        'dark_pct': round(100 * dark / n, 1), 'hi_pct': round(100 * hi / n, 1),
        'sat_mean': round(sum(sats) / n, 3), 'detail': round(grad / (2 * (h - 1) * (w - 1)), 4),
        'warm_pct': round(100 * warm / n, 1), 'cool_pct': round(100 * cool / n, 1),
        'hues': {k: round(100 * v / n, 1) for k, v in hues.items() if v},
    }


def changed(a, b, thr=10):
    h, w = min(len(a), len(b)), min(len(a[0]), len(b[0]))
    n = c = 0
    for y in range(h):
        for x in range(w):
            p, q = a[y][x], b[y][x]
            n += 1
            if max(abs(p[0] - q[0]), abs(p[1] - q[1]), abs(p[2] - q[2])) > thr: c += 1
    return round(100 * c / n, 1)


def gate(s):
    out, fails = [], 0
    for k, (lo, hi) in TARGETS.items():
        v = s[k]
        ok = (lo is None or v >= lo) and (hi is None or v <= hi)
        fails += not ok
        rng = f"{'' if lo is None else lo}..{'' if hi is None else hi}"
        out.append(f"  {'PASS' if ok else 'FAIL'} {k:<10} {v:<8} target {rng}")
    return out, fails


def show(name, s):
    hues = ' '.join(f'{k}:{v}' for k, v in s['hues'].items())
    print(f"{name}\n  mean {s['luma_mean']} std {s['luma_std']} p5/50/95 {s['luma_p5']}/{s['luma_p50']}/{s['luma_p95']} "
          f"range {s['luma_range']} dark {s['dark_pct']}% hi {s['hi_pct']}% sat {s['sat_mean']} detail {s['detail']} "
          f"warm {s['warm_pct']}% cool {s['cool_pct']}%\n  hues {hues}")


def sbs(a, b, out, h=480):
    # two images side by side with a gap, via ffmpeg if present, else sips can't compose -> error
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', a, '-i', b, '-filter_complex',
                    f'[0]scale=-2:{h}[a];[1]scale=-2:{h}[b];[a]pad=iw+24:ih:0:0:gray[a2];[a2][b]hstack', out], check=True)


def main(argv):
    args = {'crop': None, 'base': None, 'json': False, 'sbs': None}
    files = []
    it = iter(argv)
    for a in it:
        if a == '--crop': args['crop'] = tuple(float(v) for v in next(it).split(','))
        elif a == '--base': args['base'] = next(it)
        elif a == '--json': args['json'] = True
        elif a == '--sbs': args['sbs'] = next(it)
        elif a == '--refs': args['refs'] = True
        else: files.append(a)
    if args.get('refs'):
        for name, (f, c) in REF_CROPS.items():
            show(f'ref {name} {c}', stats(crop(load(os.path.join(REFS, f)), c)))
        return 0
    if args['sbs']:
        sbs(files[0], files[1], args['sbs']); print('wrote', args['sbs']); return 0
    rc = 0
    for f in files:
        px = load(f)
        if args['crop']: px = crop(px, args['crop'])
        s = stats(px)
        if args['base']:
            bp = load(args['base'])
            if args['crop']: bp = crop(bp, args['crop'])
            s['changed_pct'] = changed(px, bp)
        if args['json']: print(json.dumps(s)); continue
        show(f, s)
        if 'changed_pct' in s: print(f"  changed vs base: {s['changed_pct']}%")
        lines, fails = gate(s)
        print('\n'.join(lines)); print(f'  gate: {len(TARGETS) - fails}/{len(TARGETS)} pass')
        rc |= fails > 0
    return rc


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
