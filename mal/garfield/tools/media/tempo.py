"""tempo.py f… → fine tempo (90–190 bpm) from onset-envelope autocorrelation, with bar length (4 beats)."""
import sys, subprocess, numpy as np
for p in sys.argv[1:]:
    sr = 22050
    x = np.frombuffer(subprocess.run(["ffmpeg", "-v", "error", "-i", p, "-ac", "1", "-ar", str(sr), "-f", "f32le", "-"], capture_output=True).stdout, np.float32)
    hop = 256; e = np.array([np.sqrt((x[i:i + hop] ** 2).mean()) for i in range(0, len(x) - hop, hop)])
    on = np.maximum(0, np.diff(np.log(e + 1e-5))); on -= on.mean()
    ac = np.correlate(on, on, "full")[len(on) - 1:]; fps = sr / hop
    best = max(np.arange(90, 190, 0.1), key=lambda b: sum(np.interp(k * 60 / b * fps, np.arange(len(ac)), ac) for k in (1, 2, 4, 8)))
    print(p.split('/')[-1], f"{best:.1f} bpm  bar {240 / best:.3f}s")
