"""dogpitch.py f… → per-clip F0 (YIN, 80–2000 Hz, voiced frames only) median/p25/p75, voiced fraction, spectral centroid."""
import sys, os, subprocess, json
import numpy as np

SR = 22050

def load(p):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", p, "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"], capture_output=True).stdout
    return np.frombuffer(raw, np.float32).copy()

def yin(x, fmin=80, fmax=2000, win=1024, hop=256, thr=0.15):
    lo, hi = int(SR / fmax), int(SR / fmin)
    gate = 10 ** ((20 * np.log10(np.abs(x).max() + 1e-9) - 30) / 20)
    out = []
    for i in range(0, len(x) - win - hi, hop):
        fr = x[i:i + win + hi]
        if np.sqrt((fr[:win] ** 2).mean()) < gate: continue
        d = np.array([((fr[:win] - fr[t:t + win]) ** 2).sum() for t in range(hi + 1)])
        c = d[1:] * np.arange(1, hi + 1) / (np.cumsum(d[1:]) + 1e-12)
        c = np.concatenate([[1], c])
        k = next((t for t in range(lo, hi) if c[t] < thr and c[t] <= c[t + 1]), None)
        if k: out.append(SR / k)
    return np.array(out)

def centroid(x):
    S = np.abs(np.fft.rfft(x * np.hanning(len(x)))) if len(x) else np.zeros(1)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    return float((S * f).sum() / (S.sum() + 1e-9))

def measure(p):
    x = load(p); f = yin(x)
    return {"file": os.path.basename(p), "dur": round(len(x) / SR, 2),
            "f0": round(float(np.median(f))) if len(f) else 0,
            "p25": round(float(np.percentile(f, 25))) if len(f) else 0, "p75": round(float(np.percentile(f, 75))) if len(f) else 0,
            "voiced": round(len(f) * 256 / max(1, len(x)), 2), "cent": round(centroid(x))}

if __name__ == "__main__":
    for p in sys.argv[1:]:
        print(json.dumps(measure(p)), flush=True)
