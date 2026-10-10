"""dogbursts.py raw.wav… → each vocal burst (cut_sfx.bursts) with its YIN F0 median, voiced fraction and spectral centroid,
so dog takes can be picked by measured pitch. Run with ~/cc/airon/qwen-tts/.venv/bin/python."""
import sys, os
import numpy as np
sys.path.insert(0, os.path.dirname(__file__))
import cut_sfx, dogpitch

for p in sys.argv[1:]:
    x = cut_sfx.load(p)
    out = []
    for a, b in cut_sfx.bursts(x):
        seg = x[int(a * cut_sfx.SR): int(b * cut_sfx.SR)]
        y = seg[::2].astype(np.float32)          # 44.1k → 22.05k for dogpitch
        f = dogpitch.yin(y)
        out.append(f"{a:.2f}-{b:.2f} f0={int(np.median(f)) if len(f) else 0} v={len(f) * 256 / max(1, len(y)):.2f} c={int(dogpitch.centroid(y))}")
    print(os.path.basename(p), " | ".join(out))
