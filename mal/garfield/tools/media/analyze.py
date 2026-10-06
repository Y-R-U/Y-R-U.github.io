"""Voice QC (run with ~/cc/airon/qwen-tts/.venv/bin/python): analyze.py [--asr] file.wav|mp3 ... → F0 median/IQR, rate, peak, asr text."""
import sys, json, subprocess, re
import numpy as np

def load(p, sr=16000):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", p, "-ac", "1", "-ar", str(sr), "-f", "f32le", "-"], capture_output=True).stdout
    return np.frombuffer(raw, np.float32), sr

def f0(x, sr, fmin=60, fmax=400):
    hop, win = 160, 640; out = []
    for i in range(0, len(x) - win, hop):
        fr = x[i:i + win] - x[i:i + win].mean()
        if np.sqrt((fr ** 2).mean()) < 0.02: continue
        ac = np.correlate(fr, fr, "full")[win - 1:]
        lo, hi = int(sr / fmax), int(sr / fmin)
        k = lo + np.argmax(ac[lo:hi])
        if ac[k] / (ac[0] + 1e-9) > 0.45: out.append(sr / k)
    return np.array(out)

asr = "--asr" in sys.argv
files = [a for a in sys.argv[1:] if a != "--asr"]
model = None
if asr:
    from mlx_audio.stt.utils import load_model
    import glob, os
    from transformers import WhisperProcessor
    model = load_model("mlx-community/whisper-small.en-mlx")
    model._processor = WhisperProcessor.from_pretrained(glob.glob(os.path.expanduser(
        "~/.cache/huggingface/hub/models--openai--whisper-small.en/snapshots/*"))[0])
for p in files:
    x, sr = load(p)
    f = f0(x, sr)
    r = {"file": p.split("/")[-1], "dur": round(len(x) / sr, 2), "f0_med": round(float(np.median(f)), 1) if len(f) else 0,
         "f0_iqr": round(float(np.percentile(f, 75) - np.percentile(f, 25)), 1) if len(f) else 0,
         "voiced": round(len(f) * 160 / len(x), 2), "peak": round(float(np.abs(x).max()), 2)}
    if model:
        r["asr"] = model.generate(p).text.strip()
    print(json.dumps(r), flush=True)
