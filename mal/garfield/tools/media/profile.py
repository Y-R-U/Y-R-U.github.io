"""profile.py file → RMS dB per 2.5 s window + crude tempo (onset autocorrelation). Run with yue2 venv python."""
import sys, subprocess, numpy as np
for p in sys.argv[1:]:
    sr = 22050
    x = np.frombuffer(subprocess.run(["ffmpeg", "-v", "error", "-i", p, "-ac", "1", "-ar", str(sr), "-f", "f32le", "-"], capture_output=True).stdout, np.float32)
    w = int(2.5 * sr)
    rms = [20 * np.log10(np.sqrt((x[i:i + w] ** 2).mean()) + 1e-9) for i in range(0, len(x) - w, w)]
    hop = 512; e = np.array([np.sqrt((x[i:i + hop] ** 2).mean()) for i in range(0, len(x) - hop, hop)])
    on = np.maximum(0, np.diff(e)); on -= on.mean()
    ac = np.correlate(on, on, "full")[len(on) - 1:]
    fps = sr / hop; lags = np.arange(len(ac)) / fps
    m = (lags > 60 / 200) & (lags < 60 / 60)
    bpm = 60 / lags[m][np.argmax(ac[m])]
    print(p.split("/")[-1], f"{len(x)/sr:.1f}s bpm~{bpm:.0f}", " ".join(f"{r:.0f}" for r in rms))
