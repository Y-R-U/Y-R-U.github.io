"""timbre.py a.wav b.mp3 ... → pairwise distance of mean log-mel spectra over voiced frames (lower = more alike)."""
import sys, numpy as np
from analyze import load
def mel_fb(sr, n=512, m=32):
    hz = lambda x: 700 * (10 ** (x / 2595) - 1); mel = lambda f: 2595 * np.log10(1 + f / 700)
    pts = hz(np.linspace(mel(80), mel(7600), m + 2)); bins = np.floor((n + 1) * pts / sr).astype(int)
    fb = np.zeros((m, n // 2 + 1))
    for i in range(m):
        a, b, c = bins[i], bins[i + 1], bins[i + 2]
        fb[i, a:b] = np.linspace(0, 1, b - a, endpoint=False); fb[i, b:c] = np.linspace(1, 0, c - b, endpoint=False)
    return fb
def prof(p):
    x, sr = load(p, 16000); fb = mel_fb(sr); fr = []
    for i in range(0, len(x) - 512, 256):
        w = x[i:i + 512]
        if np.sqrt((w ** 2).mean()) < 0.03: continue
        fr.append(np.log(fb @ (np.abs(np.fft.rfft(w * np.hanning(512))) ** 2) + 1e-8))
    f = np.array(fr); f = f - f.mean(1, keepdims=True)
    return f.mean(0)
P = {a.split('/')[-1][:18]: prof(a) for a in sys.argv[1:]}
names = list(P)
print(' ' * 18 + ''.join(f'{n[:8]:>9}' for n in names))
for a in names:
    print(f'{a:18s}' + ''.join(f'{np.sqrt(((P[a] - P[b]) ** 2).mean()):9.2f}' for b in names))
