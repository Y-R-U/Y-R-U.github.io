#!/usr/bin/env python3
"""Odie's noises via LTX-2.3's audio track (:7866): tiny low-res clips, keep only the audio.
gen_dog.py gen [name ...]   → tools/media/scratch/dog/<name>_s<seed>.wav (+ .mp4)
Waits for Flux to be idle first (Flux and LTX can't co-reside)."""
import json, os, subprocess, sys, time, urllib.request
from pathlib import Path

LTX = "http://localhost:7866"
FLUX = "http://localhost:7867"
OUT = Path(__file__).resolve().parent / "scratch/dog"
TAIL = " Clear close-up sound recording, no music, no people talking, quiet living room."
DOG = "A goofy pale yellow cartoon dog with long floppy black ears and a huge tongue"
CLIPS = {
    "bark": (DOG + " barks loudly twice, 'arf! arf!', dopey and friendly, a medium-sized dog bark." + TAIL, 73),
    "yip": (DOG + " is startled and lets out short high-pitched yelps, 'yip! yip!', jumping in surprise." + TAIL, 73),
    "yap": (DOG + " yaps happily and excitedly, rapid playful barks, tail wagging." + TAIL, 73),
    "pant": (DOG + " pants heavily and happily with his tongue hanging out, loud rhythmic 'hah hah hah' dog panting breaths." + TAIL, 121),
    "whimper": (DOG + " whimpers sadly, soft high whimpering and crying dog noises, ears drooping." + TAIL, 73),
    "whine": (DOG + " trembles and whines in fear, a long scared high-pitched dog whine, shaking." + TAIL, 73),
    "sniff": (DOG + " sniffs the floor loudly, quick snuffling sniff sniff sniff sounds with its nose." + TAIL, 73),
}


def req(base, path, data=None):
    r = urllib.request.Request(base + path, data=json.dumps(data).encode() if data is not None else None,
                               headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(r, timeout=60) as f:
        return f.read()


def main():
    names = sys.argv[2:] or list(CLIPS)
    seeds = [int(s) for s in os.environ.get("SEEDS", "11,22").split(",")]
    OUT.mkdir(parents=True, exist_ok=True)
    while True:
        st = json.loads(req(FLUX, "/api/status"))
        if not st.get("running_job_id") and not st.get("queue_depth") and not st.get("worker_warm"):
            break
        print("waiting for Flux idle", flush=True); time.sleep(10)
    jobs = []
    for n in names:
        p, frames = CLIPS[n]
        for s in seeds:
            if (OUT / f"{n}_s{s}.wav").exists():
                continue
            j = json.loads(req(LTX, "/api/generate", {"prompt": p, "width": 256, "height": 256, "num_frames": frames, "fps": 24,
                                                    "seed": s, "num_inference_steps": 8, "no_audio": False}))
            jobs.append((n, s, j.get("job_id") or j.get("id")))
    print("submitted", len(jobs), flush=True)
    for n, s, jid in jobs:
        while True:
            st = json.loads(req(LTX, f"/api/jobs/{jid}"))
            if st.get("status") in ("done", "error", "failed", "cancelled"):
                break
            time.sleep(4)
        if st.get("status") != "done":
            print("FAIL", n, s, st.get("status"), st.get("error"), flush=True); continue
        mp4 = OUT / f"{n}_s{s}.mp4"
        mp4.write_bytes(req(LTX, f"/api/jobs/{jid}/file"))
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(mp4), "-vn", "-ac", "1", "-ar", "44100", str(OUT / f"{n}_s{s}.wav")])
        print("got", n, s, flush=True)


if __name__ == "__main__":
    main()
