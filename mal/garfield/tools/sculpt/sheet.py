# python3 tools/sculpt/sheet.py <dir> <out.png> [cols]  — labelled contact sheet of every png in dir
import sys, os
from PIL import Image, ImageDraw
d, out = sys.argv[1], sys.argv[2]
cols = int(sys.argv[3]) if len(sys.argv) > 3 else 4
fs = sorted(f for f in os.listdir(d) if f.endswith('.png'))
ims = [Image.open(os.path.join(d, f)).convert('RGB') for f in fs]
w, h = ims[0].size
rows = (len(ims) + cols - 1) // cols
S = Image.new('RGB', (cols * w, rows * h), 'white')
for i, (f, im) in enumerate(zip(fs, ims)):
    x, y = (i % cols) * w, (i // cols) * h
    S.paste(im, (x, y))
    ImageDraw.Draw(S).text((x + 6, y + 4), f[:-4], fill=(0, 0, 0))
S.save(out)
