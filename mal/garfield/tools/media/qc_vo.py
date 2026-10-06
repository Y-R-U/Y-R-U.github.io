"""ASR QC of generated VO (run with ~/cc/airon/qwen-tts/.venv/bin/python, HF_HUB_OFFLINE=1).
qc_vo.py [key ...] → writes tools/media/scratch/qc.json {key: {score, asr, dur, f0}} and prints failures.
score = fraction of the line's words found, in order, near the start of the transcript (whisper hallucinates after
the speech ends, so only the head is compared)."""
import glob, json, os, re, sys
from pathlib import Path
import numpy as np
sys.path.insert(0, os.path.dirname(__file__))
from analyze import load, f0

ROOT = Path(__file__).resolve().parents[2]
mf = json.load(open(ROOT / "audio/vo/manifest.json"))
QC = ROOT / "tools/media/scratch/qc.json"
qc = json.load(open(QC)) if QC.exists() else {}
keys = sys.argv[1:] or [k for k in mf if (ROOT / f"audio/vo/{k}.mp3").exists()]

from mlx_audio.stt.utils import load_model
from transformers import WhisperProcessor
model = load_model("mlx-community/whisper-small.en-mlx")
model._processor = WhisperProcessor.from_pretrained(glob.glob(os.path.expanduser(
    "~/.cache/huggingface/hub/models--openai--whisper-small.en/snapshots/*"))[0])

NUM = {"50": "fifty", "5": "five", "3": "three", "10": "ten", "1": "one", "2": "two"}
def words(t):
    t = t.lower().replace("’", "'")
    return [NUM.get(w, w) for w in re.findall(r"[a-z0-9']+", t)]

def score(target, asr):
    tw = words(target); aw = words(asr)[: len(tw) + 4]
    if not tw: return 1.0
    j = hit = 0
    for w in tw:
        for k in range(j, min(len(aw), j + 4)):
            if aw[k] == w or (len(w) > 3 and aw[k][:4] == w[:4]):
                hit += 1; j = k + 1; break
    return hit / len(tw)

for k in keys:
    p = str(ROOT / f"audio/vo/{k}.mp3")
    if not os.path.exists(p): continue
    if k in qc and qc[k].get("gen_text") == mf[k].get("gen_text") and qc[k].get("mtime") == os.path.getmtime(p) and not sys.argv[1:]:
        continue
    asr = model.generate(p, language="en").text.strip()
    x, sr = load(p); f = f0(x, sr)
    qc[k] = dict(score=round(score(mf[k]["text"], asr), 2), asr=asr[:160], dur=mf[k].get("dur"),
                 f0=round(float(np.median(f)), 1) if len(f) else 0, gen_text=mf[k].get("gen_text"), mtime=os.path.getmtime(p))
    json.dump(qc, open(QC, "w"), indent=1)
    if qc[k]["score"] < 0.75: print("LOW", k, qc[k]["score"], "|", mf[k]["text"], "|", asr[:100], flush=True)
bad = sorted(k for k, v in qc.items() if v["score"] < 0.75)
print("checked", len(qc), "low", len(bad), " ".join(bad))
