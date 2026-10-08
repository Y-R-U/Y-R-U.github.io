#!/usr/bin/env python3
"""ACE-Step (:8001) instrumentals → audio/music/. Run with a python that has numpy+soundfile
(e.g. ~/cc/airon/audio/yue2/.venv/bin/python).
gen_music.py gen [name ...]      submit + download raw takes into tools/media/scratch/music/<name>_<seed>.mp3
gen_music.py loop <name> <raw> [start] [end]   seamless-loop/trim a chosen raw take into audio/music/<name>.mp3"""
import json, subprocess, sys, time, urllib.request, urllib.parse
from pathlib import Path
import numpy as np, soundfile as sf

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "tools/media/scratch/music"
OUT = ROOT / "audio/music"
API = "http://localhost:8001"

TRACKS = {
    "menu": ("cosy jazzy bouncy cartoon instrumental, walking upright bass, brushed drums, playful clarinet and muted trumpet "
             "melody, vibraphone, honky-tonk piano, warm lighthearted family animated movie score, 112 bpm, major key", 95),
    "sneak": ("sneaky tiptoe cartoon heist music, pizzicato strings, staccato bassoon and clarinet, light jazz brushes, "
              "walking bass, mischievous and playful, quiet, steady 100 bpm, instrumental, animated movie", 90),
    "chase": ("frantic comedic cartoon chase music, fast swing big band, xylophone runs, slapstick brass stabs, galloping "
              "drums, slide whistle, energetic and silly, 165 bpm, instrumental, animated movie", 75),
    "cutscene": ("gentle warm cartoon underscore, soft celesta and glockenspiel, pizzicato strings, light acoustic guitar, "
                 "cosy suburban evening at home, calm and charming, 90 bpm, instrumental, animated movie", 70),
    "victory": ("short triumphant cartoon victory jingle, bright brass fanfare, snare roll, cymbal crash, happy jazzy ending "
                "flourish, instrumental", 15),
    "arena": ("bouncy comedic cartoon battle music, playful boxing-match energy, punchy tuba and brass stabs, bongos and snare, "
              "xylophone and slide whistle accents, silly wrestling showdown, upbeat swing, 140 bpm, major key, instrumental, animated movie", 90),
    "sneak2": ("sneaky mischievous cartoon music with a goofy dog twist, plucky pizzicato strings, bouncy bassoon and tuba, "
               "light marimba, woodblock, walking bass, tiptoe heist, playful and silly, 104 bpm, instrumental, animated movie", 90),
    "fanfare": ("big celebratory cartoon finale fanfare, jazzy brass band and full orchestra, drum roll, cymbals, joyful "
                "triumphant chapter complete, instrumental", 20),
}


def post(path, data):
    r = urllib.request.Request(API + path, data=json.dumps(data).encode(), headers={"Content-Type": "application/json"})
    return json.load(urllib.request.urlopen(r, timeout=900))


def fetch(n, s, tid):
    while True:
        r = post("/query_result", {"task_id_list": [tid]})["data"][0]
        if r["status"] in (1, 2):
            break
        time.sleep(3)
    if r["status"] == 2:
        print("FAIL", n, s, r.get("progress_text"), flush=True); return
    f = json.loads(r["result"])[0]["file"]
    dst = RAW / f"{n}_{s}.mp3"
    urllib.request.urlretrieve(API + f, dst)
    print("got", dst.name, flush=True)


def gen(names, seeds=(1,)):
    """One task at a time: submit, wait, download (keeps the proxy and memory calm)."""
    RAW.mkdir(parents=True, exist_ok=True)
    for n in names:
        p, d = TRACKS[n]
        for s in seeds:
            if (RAW / f"{n}_{s}.mp3").exists():
                continue
            j = post("/release_task", {"prompt": p, "lyrics": "", "thinking": False, "audio_duration": d,
                                       "inference_steps": 6, "batch_size": 1, "audio_format": "mp3",
                                       "task_type": "text2music", "vocal_language": "en", "seed": s,
                                       "use_random_seed": False})
            print("submitted", n, s, flush=True)
            fetch(n, s, j["data"]["task_id"])


def loop(name, raw, start=None, end=None, xf=2.0):
    """Seamless loop: keep [start+xf, end), and crossfade its last xf seconds with [start, start+xf)."""
    a, sr = sf.read(raw, always_2d=True)
    s0 = int((start or 0) * sr); s1 = int(end * sr) if end else len(a)
    a = a[s0:s1]; X = int(xf * sr)
    head, body = a[:X], a[X:]
    t = np.linspace(0, 1, X)[:, None]
    body = body.copy()
    body[-X:] = body[-X:] * np.cos(t * np.pi / 2) + head * np.sin(t * np.pi / 2)
    _write(name, body, sr)


def oneshot(name, raw, start=0.0, end=None, fade=1.2):
    a, sr = sf.read(raw, always_2d=True)
    a = a[int(start * sr): int(end * sr) if end else len(a)].copy()
    F = int(fade * sr); a[-F:] *= np.linspace(1, 0, F)[:, None] ** 2
    a[:int(0.01 * sr)] *= np.linspace(0, 1, int(0.01 * sr))[:, None]
    _write(name, a, sr)


def _write(name, a, sr):
    OUT.mkdir(parents=True, exist_ok=True)
    tmp = RAW / f"_{name}.wav"
    sf.write(tmp, a, sr)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", tmp, "-af", "loudnorm=I=-18:TP=-1.5:LRA=9",
                    "-ar", "44100", "-b:a", "128k", OUT / f"{name}.mp3"], check=True)
    print("wrote", name, round(len(a) / sr, 1), "s")


if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "fetch":
        fetch(sys.argv[2], int(sys.argv[3]), sys.argv[4])
    elif cmd == "gen":
        gen(sys.argv[2:] or list(TRACKS))
    elif cmd == "loop":
        n, raw = sys.argv[2], sys.argv[3]
        loop(n, raw, *(float(x) for x in sys.argv[4:6]))
    elif cmd == "oneshot":
        n, raw = sys.argv[2], sys.argv[3]
        oneshot(n, raw, *(float(x) for x in sys.argv[4:6]))
