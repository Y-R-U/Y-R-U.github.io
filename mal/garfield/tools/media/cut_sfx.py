#!/usr/bin/env python3
"""Cut sample SFX out of raw clips → audio/sfx/<name>.mp3 (mono 44.1k 96 kbps, loudness-normalised).
cut_sfx.py bursts <raw.wav>                     list detected vocal bursts (start-end s)
cut_sfx.py cut <name> <raw.wav> <start> <end> [--loop] [--lufs -18]
  --loop: crossfade the tail into the head so the clip loops seamlessly (pant_loop)."""
import subprocess, sys
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "audio/sfx"
SR = 44100


def load(p):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(p), "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"], capture_output=True).stdout
    return np.frombuffer(raw, np.float32).copy()


def bursts(x, thr_db=18, gap=0.06, minlen=0.05):
    w = int(0.01 * SR)
    env = np.array([np.sqrt((x[i:i + w] ** 2).mean()) for i in range(0, len(x) - w, w)])
    db = 20 * np.log10(env + 1e-7); on = db > db.max() - thr_db
    segs, s = [], None
    for i, v in enumerate(on):
        if v and s is None: s = i
        if not v and s is not None: segs.append([s, i]); s = None
    if s is not None: segs.append([s, len(on)])
    merged = []
    for a, b in segs:
        if merged and (a - merged[-1][1]) * 0.01 < gap: merged[-1][1] = b
        else: merged.append([a, b])
    return [(a * 0.01, b * 0.01) for a, b in merged if (b - a) * 0.01 >= minlen]


def cut(name, raw, start, end, loop=False, lufs=-18):
    x = load(raw)
    a = x[int(start * SR): int(end * SR)].copy()
    if loop:
        X = int(0.12 * SR); t = np.linspace(0, 1, X)
        head, a = a[:X].copy(), a[X:].copy()
        a[-X:] = a[-X:] * np.cos(t * np.pi / 2) + head * np.sin(t * np.pi / 2)
    else:
        f = int(0.006 * SR); a[:f] *= np.linspace(0, 1, f)
        f = int(0.04 * SR); a[-f:] *= np.linspace(1, 0, f)
    OUT.mkdir(parents=True, exist_ok=True)
    tmp = ROOT / "tools/media/scratch/_cut.wav"
    import soundfile as sf
    sf.write(tmp, a, SR)
    af = f"highpass=f=110,afftdn=nf=-40,loudnorm=I={lufs}:TP=-1.5:LRA=7"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(tmp), "-af", af, "-ac", "1", "-ar", str(SR),
                    "-b:a", "96k", str(OUT / f"{name}.mp3")], check=True)
    print("wrote", name, round(len(a) / SR, 2), "s")


if __name__ == "__main__":
    c = sys.argv[1]
    if c == "bursts":
        for p in sys.argv[2:]:
            print(Path(p).name, " ".join(f"{a:.2f}-{b:.2f}" for a, b in bursts(load(p))))
    elif c == "cut":
        args = [a for a in sys.argv[2:] if not a.startswith("--")]
        lufs = float(sys.argv[sys.argv.index("--lufs") + 1]) if "--lufs" in sys.argv else -18
        if "--lufs" in sys.argv: args.remove(sys.argv[sys.argv.index("--lufs") + 1])
        cut(args[0], args[1], float(args[2]), float(args[3]), "--loop" in sys.argv, lufs)
