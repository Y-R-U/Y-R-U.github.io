#!/usr/bin/env python3
"""Colour signature of each item's pictures, so picture questions can tell look-alikes apart by difficulty.

Writes item.look = [L, a, b] (CIELAB mean of the centre 60% of each picture, averaged over the item's
pictures) into the pack JSON and into tools/img_look.json (pack -> id -> look), which c1_build re-applies.
Usage: python3 tools/img_look.py gems [birds ...]     (downloads are cached in tools/.cache/look/)
"""
import hashlib, io, json, os, sys, time, urllib.request
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
CACHE = os.path.join(HERE, '.cache', 'look')
SIDE = os.path.join(HERE, 'img_look.json')
UA = 'CluedTrivia/1.0 (games.br8t.com; colour signatures)'


def fetch(src):
    os.makedirs(CACHE, exist_ok=True)
    p = os.path.join(CACHE, hashlib.sha1(src.encode()).hexdigest())
    if os.path.exists(p):
        return open(p, 'rb').read()
    if src.startswith('http'):
        for i in range(4):
            try:
                data = urllib.request.urlopen(urllib.request.Request(src, headers={'User-Agent': UA}), timeout=30).read()
                break
            except Exception as e:
                if i == 3:
                    raise
                time.sleep(2 + i * 3)
        time.sleep(0.5)
    else:
        data = open(os.path.join(ROOT, src.lstrip('/')), 'rb').read()
    open(p, 'wb').write(data)
    return data


def lab(rgb):
    def lin(c):
        c /= 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (lin(float(c)) for c in rgb)
    x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047
    y = 0.2126 * r + 0.7152 * g + 0.0722 * b
    z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883
    f = lambda t: t ** (1 / 3) if t > 0.008856 else 7.787 * t + 16 / 116
    return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))]


def signature(data):
    im = Image.open(io.BytesIO(data)).convert('RGBA')
    w, h = im.size
    im = im.crop((int(w * .2), int(h * .2), int(w * .8), int(h * .8))).resize((48, 48))
    px = [p[:3] for p in im.getdata() if p[3] > 128]
    # drop near-white/near-black backdrop pixels when there is enough subject left
    subj = [p for p in px if 18 < sum(p) / 3 < 240]
    px = subj if len(subj) > len(px) * .25 else px
    labs = [lab(p) for p in px]
    return [round(sum(v[i] for v in labs) / len(labs), 1) for i in range(3)]


def main(packs):
    side = json.load(open(SIDE)) if os.path.exists(SIDE) else {}
    for pid in packs:
        path = os.path.join(ROOT, 'data', 'packs', f'{pid}.json')
        raw = open(path).read()
        pack = json.loads(raw)
        out = side.setdefault(pid, {})
        for it in pack.get('items', []):
            sigs = []
            for m in (it.get('media') or {}).get('img') or []:
                try:
                    sigs.append(signature(fetch(m['src'])))
                except Exception as e:
                    print('  skip', it['id'], m.get('src', '')[:80], e)
            if sigs:
                it['look'] = out[it['id']] = [round(sum(s[i] for s in sigs) / len(sigs), 1) for i in range(3)]
        with open(path, 'w') as f:
            json.dump(pack, f, ensure_ascii=False, indent=1 if raw.startswith('{\n') else None)
            f.write("\n")
        print(pid, sum(1 for it in pack['items'] if 'look' in it), 'of', len(pack['items']), 'items')
    json.dump(side, open(SIDE, 'w'), indent=1, sort_keys=True)


if __name__ == '__main__':
    main(sys.argv[1:])
