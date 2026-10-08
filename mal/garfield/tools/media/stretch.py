"""stretch.py f… → speech span, longest voiced runs (s), pitch range, ASR."""
import sys, glob, os, numpy as np
from analyze import load
from mlx_audio.stt.utils import load_model
from transformers import WhisperProcessor
m = load_model("mlx-community/whisper-small.en-mlx")
m._processor = WhisperProcessor.from_pretrained(glob.glob(os.path.expanduser("~/.cache/huggingface/hub/models--openai--whisper-small.en/snapshots/*"))[0])
for p in sys.argv[1:]:
    x, sr = load(p); hop, win = 160, 640; v = []; f0s = []
    for i in range(0, len(x) - win, hop):
        fr = x[i:i + win] - x[i:i + win].mean()
        if np.sqrt((fr ** 2).mean()) < 0.02: v.append(0); continue
        ac = np.correlate(fr, fr, "full")[win - 1:]; lo, hi = sr // 400, sr // 70
        k = lo + np.argmax(ac[lo:hi]); ok = ac[k] / (ac[0] + 1e-9) > 0.45
        v.append(int(ok)); ok and f0s.append(sr / k)
    v = np.array(v); idx = np.nonzero(v)[0]
    span = (idx[-1] - idx[0]) * hop / sr if len(idx) else 0
    runs, r = [], 0
    for b in v:
        if b: r += 1
        else:
            if r: runs.append(r)
            r = 0
    if r: runs.append(r)
    runs = sorted((x * hop / sr for x in runs), reverse=True)[:3]
    f = np.array(f0s)
    asr = m.generate(p, language="en").text.strip()[:60]
    print(os.path.basename(p), f"span {span:.2f}s runs {' '.join(f'{r:.2f}' for r in runs)} f0 {np.percentile(f,10):.0f}-{np.percentile(f,90):.0f} | {asr}", flush=True)
