#!/usr/bin/env python3
"""Mechanical art gate. Pure stdlib PNG reader — no numpy, no PIL.

  python3 tools/artgate.py <new.png> [--baseline docs/evidence/m1-portrait.png]

Exists because twelve M1.5 checklist boxes were ticked against a frame that was pixel-identical
to the one being critiqued. Self-assessment of art does not work; this measures instead.
Prints JSON, exits 1 if any gate fails. Run it against the OLD frame too — it must fail there,
or the gate is not a gate (see AGENTS.md, "Falsify your own gate").
"""
import sys, zlib, struct, json, colorsys

def read_png(path):
    d = open(path, 'rb').read()
    assert d[:8] == b'\x89PNG\r\n\x1a\n', f'{path}: not a PNG'
    pos, idat, pal, trns = 8, [], None, None
    w = h = bitd = ct = None
    while pos < len(d):
        ln, typ = struct.unpack('>I4s', d[pos:pos+8]); pos += 8
        body = d[pos:pos+ln]; pos += ln + 4
        if typ == b'IHDR':
            w, h, bitd, ct, _, _, interlace = struct.unpack('>IIBBBBB', body)
            assert bitd == 8, f'{path}: only 8-bit supported (got {bitd})'
            assert interlace == 0, f'{path}: interlaced PNG unsupported'
        elif typ == b'PLTE': pal = body
        elif typ == b'IDAT': idat.append(body)
        elif typ == b'IEND': break
    ch = {0:1, 2:3, 3:1, 4:2, 6:4}[ct]
    raw = zlib.decompress(b''.join(idat))
    stride = w * ch
    out = bytearray(h * stride); prev = bytearray(stride); p = 0
    for y in range(h):
        f = raw[p]; p += 1
        line = bytearray(raw[p:p+stride]); p += stride
        if f == 1:
            for i in range(ch, stride): line[i] = (line[i] + line[i-ch]) & 255
        elif f == 2:
            for i in range(stride): line[i] = (line[i] + prev[i]) & 255
        elif f == 3:
            for i in range(stride):
                a = line[i-ch] if i >= ch else 0
                line[i] = (line[i] + ((a + prev[i]) >> 1)) & 255
        elif f == 4:
            for i in range(stride):
                a = line[i-ch] if i >= ch else 0
                b = prev[i]; c = prev[i-ch] if i >= ch else 0
                pp = a + b - c
                pa, pb, pc = abs(pp-a), abs(pp-b), abs(pp-c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[i] = (line[i] + pr) & 255
        out[y*stride:(y+1)*stride] = line; prev = line
    # normalise to RGB triples
    px = []
    for i in range(0, len(out), ch):
        if ct == 3:
            j = out[i]*3; px.append((pal[j], pal[j+1], pal[j+2]))
        elif ct in (0, 4): g = out[i]; px.append((g, g, g))
        else: px.append((out[i], out[i+1], out[i+2]))
    return w, h, px

def lum(p): return (0.2126*p[0] + 0.7152*p[1] + 0.0722*p[2]) / 255.0

def stats(px, step=7):
    s = px[::step]
    L = sorted(lum(p) for p in s)
    n = len(L)
    p05, p50, p95 = L[int(n*0.05)], L[n//2], L[int(n*0.95)]
    mean = sum(L)/n
    std = (sum((x-mean)**2 for x in L)/n) ** 0.5
    hues, warm, sat_n = [0]*12, 0, 0
    for p in s:
        h_, l_, sv = colorsys.rgb_to_hls(p[0]/255, p[1]/255, p[2]/255)
        if sv > 0.15:
            sat_n += 1; hues[int(h_*12) % 12] += 1
            if 0.03 < h_ < 0.19: warm += 1          # ~10deg-68deg: straw, dirt, rust, gold
    used = sum(1 for c in hues if sat_n and c/sat_n >= 0.02)
    hi = sum(1 for x in L if x > 0.80) / n          # near-white pixel fraction
    return dict(hi_frac=round(hi,4),
                lum_p05=round(p05,4), lum_p50=round(p50,4), lum_p95=round(p95,4),
                lum_std=round(std,4), contrast_ratio=round((p95+0.05)/(p05+0.05),3),
                hue_buckets=used, warm_frac=round(warm/max(sat_n,1),4), sampled=n)

def main():
    new = sys.argv[1]
    base = 'docs/evidence/m1-portrait.png'
    if '--baseline' in sys.argv: base = sys.argv[sys.argv.index('--baseline')+1]
    w, h, a = read_png(new)
    r = {'file': new, 'w': w, 'h': h}
    r.update(stats(a))
    try:
        bw, bh, b = read_png(base)
        if (bw, bh) == (w, h):
            step = 7
            sa, sb = a[::step], b[::step]
            ch = sum(1 for x, y in zip(sa, sb)
                     if abs(x[0]-y[0]) > 12 or abs(x[1]-y[1]) > 12 or abs(x[2]-y[2]) > 12)
            r['diff_pct'] = round(100*ch/len(sa), 2)
        else:
            r['diff_pct'] = None; r['note'] = 'baseline size differs; diff skipped'
    except Exception as e:
        r['diff_pct'] = None; r['note'] = f'baseline unreadable: {e}'

    gates = {
        # Thresholds are set so the frame being critiqued FAILS every one of the first four.
        # Do not relax them. If you think one is wrong, argue it in STATE.md, don't edit it.
        'redrawn_vs_baseline>=50%':  r['diff_pct'] is None or r['diff_pct'] >= 50,
        'contrast_ratio>=3.0':       r['contrast_ratio'] >= 3.0,      # old frame: 2.36
        'dark_anchor lum_p05<=0.16': r['lum_p05'] <= 0.16,            # old frame: 0.266
        'lum_std>=0.16':             r['lum_std'] >= 0.16,            # old frame: 0.139
        'hue_buckets>=6':            r['hue_buckets'] >= 6,           # old frame: 5
        'warm_frac>=0.05':           r['warm_frac'] >= 0.05,
        # Added after m1b overcorrected: dark anchor achieved by crushing the WHOLE frame.
        # A readable battlefield has a lit midtone, not just a dark floor and a few highlights.
        'midtone 0.28<=p50<=0.52':   0.28 <= r['lum_p50'] <= 0.52,   # m1b: 0.217, m1: 0.588
        # NOTE: a speckle gate was tried here (hi_frac<=0.06) and REMOVED — it passed on the
        # frame whose white grass slivers were the worst thing in it (0.0057). A check that
        # cannot be made to fail on a known-bad input is false assurance, not a check.
        # The grass is judged by eye. hi_frac is still reported, as information only.
    }
    r['gates'] = gates
    r['PASS'] = all(gates.values())
    print(json.dumps(r, indent=1))
    sys.exit(0 if r['PASS'] else 1)

main()
