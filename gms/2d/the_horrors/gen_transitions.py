#!/usr/bin/env python3
"""Generate The Horrors hub-spoke transition videos via the local LTX API.

Each room pairs with the hallway: <room>_to_hallway and hallway_to_<room>.
The first frame of <room>_to_hallway.mp4 is held as the room's static "still"
view in-game, so `start` must equal that room's poster JPG exactly.

Usage:
  python3 gen_transitions.py                   # all
  python3 gen_transitions.py hallway_to_bedroom
  python3 gen_transitions.py --force
"""

import json
import os
import sys
import time
import urllib.request

API = "http://localhost:7866"
HERE = os.path.dirname(os.path.abspath(__file__))
VIDEO_DIR = os.path.join(HERE, "videos")
LOG_PATH = os.path.join(HERE, "gen_transitions.log")
GAME_PORTRAIT_WIDTH = 384
GAME_PORTRAIT_HEIGHT = 640

COMMON = (
    "realistic cinematic horror game transition, vertical mobile portrait shot, "
    "smooth forward camera movement through a wooden doorway, preserve exact architecture, "
    "empty environment, period-neutral, no people, no readable text, no logos, no watermark, "
    "no collapse, no melting, no creature, no body, professional atmospheric game footage"
)

NEGATIVE = (
    "person, face, body, creature, readable text, logo, watermark, cartoon, painting, "
    "melting architecture, collapsing room, explosion, gore, extra doors, duplicated hallway, "
    "sci-fi, futuristic, neon, hologram"
)

TRANSITIONS = [
    {
        "output": "bedroom_to_hallway.mp4",
        "start": "images/bedroom.jpg",
        "end": "images/hallway.jpg",
        "seed": 211,
        "prompt": "camera leaves a plain bedroom past the lace curtains and the unlit lamp, "
                  "passes through the only wooden bedroom door, and ends in the long central hallway",
    },
    {
        "output": "hallway_to_bedroom.mp4",
        "start": "images/hallway.jpg",
        "end": "images/bedroom.jpg",
        "seed": 212,
        "prompt": "camera moves from the central hallway through a wooden bedroom door, "
                  "and ends inside a plain bedroom with the lace curtain shifting at the window",
    },
    {
        "output": "bathroom_to_hallway.mp4",
        "start": "images/bathroom.jpg",
        "end": "images/hallway.jpg",
        "seed": 221,
        "prompt": "camera leaves a small white-tiled bathroom past the basin and shower curtain, "
                  "passes through the only wooden bathroom door, and ends in the long central hallway",
    },
    {
        "output": "hallway_to_bathroom.mp4",
        "start": "images/hallway.jpg",
        "end": "images/bathroom.jpg",
        "seed": 222,
        "prompt": "camera moves from the central hallway through a wooden bathroom door, "
                  "and ends inside a small white-tiled bathroom with a single overhead bulb",
    },
    {
        "output": "cellar_to_hallway.mp4",
        "start": "images/cellar.jpg",
        "end": "images/hallway.jpg",
        "seed": 231,
        "prompt": "camera climbs the wooden steps out of a dim cellar, passes through the only "
                  "wooden cellar door, and ends in the long central hallway",
    },
    {
        "output": "hallway_to_cellar.mp4",
        "start": "images/hallway.jpg",
        "end": "images/cellar.jpg",
        "seed": 232,
        "prompt": "camera moves from the central hallway through a wooden cellar door, "
                  "descends the wooden staircase, and ends in a dim cellar lit by a single bare bulb",
    },
]


def log(message):
    line = f"[{time.strftime('%H:%M:%S')}] {message}"
    print(line, flush=True)
    with open(LOG_PATH, "a", encoding="utf-8") as handle:
        handle.write(line + "\n")


def post_json(path, payload):
    request = urllib.request.Request(
        f"{API}{path}",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.load(response)


def get_json(path):
    with urllib.request.urlopen(f"{API}{path}", timeout=60) as response:
        return json.load(response)


def download(path, target):
    with urllib.request.urlopen(f"{API}{path}", timeout=180) as response:
        data = response.read()
    with open(target, "wb") as handle:
        handle.write(data)


def submit(transition):
    payload = {
        "prompt": f"{transition['prompt']}, {COMMON}",
        "width": GAME_PORTRAIT_WIDTH,
        "height": GAME_PORTRAIT_HEIGHT,
        "num_frames": 73,
        "fps": 24,
        "seed": transition["seed"],
        "num_inference_steps": 20,
        "cfg_scale": 3.0,
        "negative_prompt": NEGATIVE,
        "image": os.path.join(HERE, transition["start"]),
        "image_end": os.path.join(HERE, transition["end"]),
        "image_strength": 1.0,
        "tiling": "aggressive",
        "no_audio": True,
    }
    return post_json("/api/generate", payload)["job_id"]


def wait_for_job(job_id):
    while True:
        job = get_json(f"/api/jobs/{job_id}")
        status = job.get("status")
        event = job.get("running_last_event") or job.get("last_event") or {}
        if event.get("event"):
            log(f"{job_id} {status} {event.get('event')}")
        if status == "done":
            return job
        if status in {"failed", "cancelled"}:
            raise RuntimeError(f"{job_id} ended with {status}")
        time.sleep(5)


def main():
    os.makedirs(VIDEO_DIR, exist_ok=True)
    with open(LOG_PATH, "w", encoding="utf-8") as handle:
        handle.write("")
    args = set(sys.argv[1:])
    force = "--force" in args
    wanted = args - {"--force"}
    for transition in TRANSITIONS:
        stem = os.path.splitext(transition["output"])[0]
        if wanted and stem not in wanted and transition["output"] not in wanted:
            continue
        target = os.path.join(VIDEO_DIR, transition["output"])
        if os.path.exists(target) and not force:
            log(f"skip {transition['output']} already exists")
            continue
        log(f"queue {transition['output']}")
        job_id = submit(transition)
        log(f"job {job_id} {transition['output']}")
        job = wait_for_job(job_id)
        download(f"/api/jobs/{job_id}/file", target)
        log(f"ok {transition['output']} {os.path.getsize(target)} bytes {job.get('duration_secs')}s")


if __name__ == "__main__":
    main()
