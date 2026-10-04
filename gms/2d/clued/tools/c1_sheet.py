#!/usr/bin/env python3
"""Contact sheet for eyeballing pack photos: python3 tools/c1_sheet.py <pack> [out.jpg] [--d1] [--first] [--only=id,id]
Each row = one item, its photos side by side, labelled "id [index]". Needs Pillow."""
import io, json, os, sys, urllib.request
from concurrent.futures import ThreadPoolExecutor
from PIL import Image, ImageDraw

args = [a for a in sys.argv[1:] if not a.startswith('--')]
root = os.path.join(os.path.dirname(__file__), '..')
pack = json.load(open(os.path.join(root, 'data/packs', args[0] + '.json')))
out = args[1] if len(args) > 1 else f'/tmp/{args[0]}_sheet.jpg'
items = [i for i in pack['items'] if i.get('media', {}).get('img')]
only = [a[7:] for a in sys.argv if a.startswith('--only=')]
if only: items = [i for i in items if i['id'] in only[0].split(',')]
if '--d1' in sys.argv: items = [i for i in items if i.get('difficulty') == 1]
T = 150
cols = 1 if '--first' in sys.argv else 3

def load(src):
    try:
        if src.startswith('media/'): data = open(os.path.join(root, src), 'rb').read()
        else: data = urllib.request.urlopen(urllib.request.Request(src, headers={'User-Agent': 'CluedSheet/1.0'}), timeout=30).read()
        im = Image.open(io.BytesIO(data)).convert('RGB'); im.thumbnail((T, T)); return im
    except Exception:
        return None

jobs = [(i, k, m['src']) for i in items for k, m in enumerate(i['media']['img'][:cols])]
with ThreadPoolExecutor(12) as ex: ims = list(ex.map(lambda j: load(j[2]), jobs))
per_row = 2 if cols == 1 else 1  # items per sheet row
cells = cols * (6 if cols == 1 else 2)
n_rows = -(-len(items) // (cells // cols))
sheet = Image.new('RGB', (cells * (T + 4), n_rows * (T + 16)), 'white')
d = ImageDraw.Draw(sheet)
idx = {id(i): n for n, i in enumerate(items)}
for (it, k, _), im in zip(jobs, ims):
    n = idx[id(it)]; per = cells // cols
    x = ((n % per) * cols + k) * (T + 4); y = (n // per) * (T + 16)
    if im: sheet.paste(im, (x, y + 14))
    else: d.rectangle([x, y + 14, x + T, y + 14 + T], fill='red')
    d.text((x + 2, y + 1), f"{it['id'][:22]} {k}", fill='black')
H = 1660
parts = []
for n, y in enumerate(range(0, sheet.height, H)):
    o = out.replace('.jpg', f'_{n}.jpg'); sheet.crop((0, y, sheet.width, min(sheet.height, y + H))).save(o, quality=80); parts.append(o)
print(' '.join(parts), len(items), 'items')
