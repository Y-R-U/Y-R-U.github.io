#!/usr/bin/env python3
"""Verify the audition mp3s: duration, loudness, and whether the WORDS arrived.

    /Users/aaronair/cc/yru/site/gms/3d/neonhaul/tools/vo/vw/bin/python verify.py

Loudness proves something was spoken; only a transcript proves it was the right thing. The score is
a word-sequence ratio against the scripted line and is for RANKING, not a pass mark -- whisper
writes "409" for "four-oh-nine" and has never heard of Marrender.
"""
import difflib, json, os, re, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
cast = json.load(open(os.path.join(HERE, "audition.json")))
import mlx_whisper

def norm(s):
    return re.sub(r"[^a-z0-9 ]", " ", s.lower()).split()

out = []
for c in cast:
    mp3 = os.path.join(HERE, f'{c["who"]}_{c["voice"]}_{c["speed"]:.2f}.mp3')
    dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                                "-of", "csv=p=0", mp3], capture_output=True, text=True).stdout)
    ebu = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", mp3, "-filter_complex",
                          "ebur128=peak=true", "-f", "null", "-"], capture_output=True, text=True).stderr
    tail = ebu.split("Summary")[-1]
    lufs = float(re.search(r"I:\s+(-?[\d.]+) LUFS", tail).group(1))
    tp = float(re.search(r"Peak:\s+(-?[\d.]+) dBFS", tail).group(1))
    txt = mlx_whisper.transcribe(mp3, path_or_hf_repo="mlx-community/whisper-small.en-mlx")["text"]
    score = difflib.SequenceMatcher(None, norm(c["text"]), norm(txt)).ratio()
    out.append({**c, "sec": round(dur, 2), "lufs": lufs, "peak": tp,
                "wpm": round(len(c["text"].split()) / dur * 60), "heard": txt.strip(),
                "score": round(score, 3)})
    print(f'{c["who"]:<9} {dur:>5.2f}s {lufs:>6.1f} LUFS {tp:>6.1f} dBFS  {score:.2f}  "{txt.strip()}"')

json.dump(out, open(os.path.join(HERE, "verify.json"), "w"), indent=1)
bad = [o for o in out if o["sec"] < 0.5 or o["lufs"] < -50 or o["score"] < 0.6]
print("\nFLAGGED:", [b["who"] for b in bad] or "none")
