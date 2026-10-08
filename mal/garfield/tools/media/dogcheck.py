"""dogcheck.py f.wav… → duration, 50 ms RMS envelope (dB, '#' bars), F0 median, onset count, whisper text."""
import sys, glob, os, numpy as np
from analyze import load, f0
asr = "--asr" in sys.argv
files = [a for a in sys.argv[1:] if a != "--asr"]
if asr:
    from mlx_audio.stt.utils import load_model
    from transformers import WhisperProcessor
    m = load_model("mlx-community/whisper-small.en-mlx")
    m._processor = WhisperProcessor.from_pretrained(glob.glob(os.path.expanduser("~/.cache/huggingface/hub/models--openai--whisper-small.en/snapshots/*"))[0])
for p in files:
    x, sr = load(p); w = sr // 20
    env = np.array([20 * np.log10(np.sqrt((x[i:i + w] ** 2).mean()) + 1e-6) for i in range(0, len(x) - w, w)])
    on = int(((env[1:] - env[:-1]) > 9).sum())
    f = f0(x, sr, 80, 1200)
    bars = "".join(" .:-=+*#%@"[max(0, min(9, int((e + 60) / 6)))] for e in env)
    print(os.path.basename(p), f"{len(x)/sr:.1f}s f0~{np.median(f) if len(f) else 0:.0f} onsets {on} peak {env.max():.0f}dB")
    print("  ", bars)
    if asr: print("   asr:", m.generate(p, language="en").text.strip()[:100])
