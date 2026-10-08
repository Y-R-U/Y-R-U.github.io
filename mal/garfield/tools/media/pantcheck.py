"""pantcheck.py f.wav… → envelope modulation peak (Hz) + its strength, spectral flatness (0 tonal .. 1 noise)."""
import sys, numpy as np
from analyze import load
for p in sys.argv[1:]:
    x, sr = load(p); w = sr // 100
    env = np.array([np.sqrt((x[i:i + w] ** 2).mean()) for i in range(0, len(x) - w, w)])
    e = env - env.mean(); ac = np.correlate(e, e, 'full')[len(e) - 1:]; ac /= ac[0] + 1e-9
    lo, hi = 100 // 6, 100 // 1          # 1..6 Hz
    k = lo + np.argmax(ac[lo:hi])
    S = np.abs(np.fft.rfft(x[: sr * 2] * np.hanning(min(len(x), sr * 2)))) + 1e-9
    flat = np.exp(np.log(S).mean()) / S.mean()
    print(p.split('/')[-1], f"mod {100 / k:.1f} Hz strength {ac[k]:.2f}  flatness {flat:.2f}")
