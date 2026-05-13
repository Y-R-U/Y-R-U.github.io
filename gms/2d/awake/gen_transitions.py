#!/usr/bin/env python3
"""Generate Awake room transition videos through the local LTX API."""

import json
import os
import sys
import time
import urllib.request

API = "http://localhost:7866"
HERE = os.path.dirname(os.path.abspath(__file__))
VIDEO_DIR = os.path.join(HERE, "videos")
LOG_PATH = os.path.join(HERE, "gen_transitions.log")

COMMON = (
    "realistic cinematic sci-fi horror game transition, vertical mobile portrait shot, "
    "smooth forward camera movement through a sealed doorway, preserve exact architecture, "
    "empty environment, no people, no readable text, no logos, no watermark, no collapse, "
    "no melting, no creature, no body, professional atmospheric game footage"
)

NEGATIVE = (
    "person, face, body, creature, readable text, logo, watermark, cartoon, painting, "
    "melting architecture, collapsing room, explosion, gore, extra doors, duplicated hallway"
)

TRANSITIONS = [
    {
        "output": "cryo_room_to_hallway.mp4",
        "start": "images/cryo_room.jpg",
        "end": "images/hallway.jpg",
        "seed": 84,
        "prompt": "camera leaves a cracked cryogenic room, passes through the only exit door, and ends in the central hallway",
    },
    {
        "output": "med_bay_to_hallway.mp4",
        "start": "images/med_bay.jpg",
        "end": "images/hallway.jpg",
        "seed": 91,
        "prompt": "camera leaves an abandoned futuristic med bay, passes through the only exit door, and ends in the central hallway",
    },
    {
        "output": "hallway_to_med_bay.mp4",
        "start": "images/hallway.jpg",
        "end": "images/med_bay.jpg",
        "seed": 92,
        "prompt": "camera moves from the central hallway through a sealed medical door and ends inside the abandoned med bay",
    },
    {
        "output": "hydroponic_biome_to_hallway.mp4",
        "start": "images/hydroponic_biome.jpg",
        "end": "images/hallway.jpg",
        "seed": 101,
        "prompt": "camera leaves an overgrown hydroponic biome chamber, passes through the airlock door, and ends in the central hallway",
    },
    {
        "output": "hallway_to_hydroponic_biome.mp4",
        "start": "images/hallway.jpg",
        "end": "images/hydroponic_biome.jpg",
        "seed": 102,
        "prompt": "camera moves from the central hallway through a fogged airlock and ends inside the overgrown hydroponic biome",
    },
    {
        "output": "reactor_gallery_to_hallway.mp4",
        "start": "images/reactor_gallery.jpg",
        "end": "images/hallway.jpg",
        "seed": 111,
        "prompt": "camera leaves a narrow reactor gallery, passes through the reinforced exit door, and ends in the central hallway",
    },
    {
        "output": "hallway_to_reactor_gallery.mp4",
        "start": "images/hallway.jpg",
        "end": "images/reactor_gallery.jpg",
        "seed": 112,
        "prompt": "camera moves from the central hallway through a reinforced service door and ends inside the glowing reactor gallery",
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
        "width": 384,
        "height": 640,
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
