#!/usr/bin/env python3
"""Build the KITEHAWK voice audition set.

    python3 gen_audition.py

Runs under the PROJECT python. It shells out to Abogen's interpreter for the one stage that needs
kokoro's weights, exactly as NEONHAUL does:

    /Users/aaronair/.local/share/uv/tools/abogen/bin/python kokoro_say.py jobs.json

One process, all 15 lines: KPipeline loads an 82M model + phonemiser once (~6 s), then ~1 s a line.
Kokoro writes 24 kHz wav; ffmpeg makes the mp3 Aaron actually opens. No radio treatment here on
purpose -- an audition judges the voice, not the filter chain.
"""
import json, os, subprocess, sys, shutil

HERE = os.path.dirname(os.path.abspath(__file__))
ABOGEN = "/Users/aaronair/.local/share/uv/tools/abogen/bin/python"
WAV = os.path.join(HERE, "wav")

cast = json.load(open(os.path.join(HERE, "audition.json")))
os.makedirs(WAV, exist_ok=True)

jobs = [{"voice": c["voice"], "speed": c["speed"], "text": c["text"],
         "out": os.path.join(WAV, f'{c["who"]}.wav')} for c in cast]
jpath = os.path.join(HERE, "jobs.json")
json.dump(jobs, open(jpath, "w"), indent=1)

p = subprocess.run([ABOGEN, os.path.join(HERE, "kokoro_say.py"), jpath],
                   capture_output=True, text=True)
sys.stderr.write(p.stderr[-2000:] if p.stderr else "")
if "\x1e" not in p.stdout:
    print("kokoro_say produced no result record; exit", p.returncode)
    print(p.stdout[-2000:])
    sys.exit(1)
res = {os.path.basename(r["out"]): r for r in json.loads(p.stdout.split("\x1e", 1)[1])}

rows = []
for c in cast:
    r = res.get(f'{c["who"]}.wav', {})
    mp3 = os.path.join(HERE, f'{c["who"]}_{c["voice"]}_{c["speed"]:.2f}.mp3')
    if "error" in r or not os.path.exists(os.path.join(WAV, f'{c["who"]}.wav')):
        rows.append(dict(c, ok=False, why=r.get("error", "no wav written")))
        continue
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", os.path.join(WAV, f'{c["who"]}.wav'),
                    "-codec:a", "libmp3lame", "-b:a", "128k", "-ar", "24000", mp3], check=True)
    rows.append(dict(c, ok=True, mp3=os.path.basename(mp3), **{k: r[k] for k in
                ("sec", "rms", "peak", "wpm") if k in r}))

json.dump(rows, open(os.path.join(HERE, "audition_result.json"), "w"), indent=1)
for r in rows:
    print(f'{"ok " if r["ok"] else "FAIL"} {r["who"]:<9} {r.get("mp3","-"):<34} '
          f'{r.get("sec",0):>5.2f}s rms {r.get("rms",0):>6.1f} peak {r.get("peak",0):>6.1f} '
          f'{r.get("wpm",0):>5.0f} wpm {r.get("why","")}')
