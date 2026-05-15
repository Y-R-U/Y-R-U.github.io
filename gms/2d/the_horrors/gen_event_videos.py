#!/usr/bin/env python3
"""Generate The Horrors event videos (monster + endings) via the local LTX API.

Most events live IN the hub, so they share hallway.jpg as their start frame.
The bedroom-window ending is the exception (start = bedroom.jpg).

Usage:
  python3 gen_event_videos.py
  python3 gen_event_videos.py monster_release           # whole group
  python3 gen_event_videos.py ending_window             # one (by stem)
  python3 gen_event_videos.py --force
"""

import json
import os
import sys
import time
import urllib.request

API = "http://localhost:7866"
HERE = os.path.dirname(os.path.abspath(__file__))
VIDEO_DIR = os.path.join(HERE, "videos")
LOG_PATH = os.path.join(HERE, "gen_event_videos.log")
METADATA_PATH = os.path.join(HERE, ".debug_transition_metadata.json")
GAME_PORTRAIT_WIDTH = 384
GAME_PORTRAIT_HEIGHT = 640

COMMON = (
    "realistic cinematic horror game footage, vertical mobile portrait shot, "
    "professional atmospheric lighting, preserve the architecture, period-neutral, "
    "no readable text, no logos, no watermark, no gore, no blood, no body horror, "
    "no sci-fi, no futuristic technology"
)

NEGATIVE = (
    "readable text, logo, watermark, subtitles, gore, blood, dismemberment, corpse, "
    "cartoon, anime, painting, melting architecture, duplicated doors, distorted camera, "
    "sci-fi, futuristic, neon, hologram"
)

EVENTS = [
    {
        "output": "monster_release_pale_woman.mp4",
        "group": "monster_release",
        "poster": "images/hallway.jpg",
        "start": "images/hallway.jpg",
        "seed": 311,
        "prompt": "the empty central hallway lights flicker, a tall pale woman in a white "
                  "nightgown with long dark hair covering her face appears at the far end of "
                  "the corridor and slowly turns her head toward the camera, tense PG horror "
                  "reveal, no gore",
    },
    {
        "output": "monster_attack_pale_woman.mp4",
        "group": "monster_attack",
        "poster": "images/hallway.jpg",
        "start": "images/hallway.jpg",
        "seed": 312,
        "prompt": "central hallway point of view, a pale woman in a white nightgown with long "
                  "dark hair rushes directly toward the camera with arms slightly raised, hair "
                  "whipping behind her, fast PG jump scare impact, no blood, no gore",
    },
    {
        "output": "ending_window.mp4",
        "group": "ending_video",
        "poster": "images/bedroom.jpg",
        "start": "images/bedroom.jpg",
        "seed": 401,
        "prompt": "inside a plain bedroom, the lace curtain shifts and a tall pale woman in a "
                  "white nightgown with long dark hair appears outside the window pressing her "
                  "pale face and one hand against the glass, slow oppressive PG horror reveal, "
                  "no blood, no gore",
    },
]


def log(message):
    line = f"[{time.strftime('%H:%M:%S')}] {message}"
    print(line, flush=True)
    with open(LOG_PATH, "a", encoding="utf-8") as handle:
        handle.write(line + "\n")


def load_metadata():
    try:
        with open(METADATA_PATH, "r", encoding="utf-8") as handle:
            data = json.load(handle)
        return data if isinstance(data, dict) else {}
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def save_metadata(data):
    with open(METADATA_PATH, "w", encoding="utf-8") as handle:
        json.dump(data, handle, indent=2, sort_keys=True)


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


def submit(item):
    payload = {
        "prompt": f"{item['prompt']}, {COMMON}",
        "width": GAME_PORTRAIT_WIDTH,
        "height": GAME_PORTRAIT_HEIGHT,
        "num_frames": 73,
        "fps": 24,
        "seed": item["seed"],
        "num_inference_steps": 20,
        "cfg_scale": 3.0,
        "negative_prompt": NEGATIVE,
        "image": os.path.join(HERE, item["start"]),
        "image_strength": 1.0,
        "tiling": "aggressive",
        "no_audio": True,
    }
    if item.get("end"):
        payload["image_end"] = os.path.join(HERE, item["end"])
    return post_json("/api/generate", payload)["job_id"]


def wait_for_job(job_id, output):
    last_event = ""
    while True:
        job = get_json(f"/api/jobs/{job_id}")
        status = job.get("status")
        event = job.get("running_last_event") or job.get("last_event") or {}
        event_name = event.get("event") or ""
        if event_name and event_name != last_event:
            last_event = event_name
            log(f"{output} {job_id} {status} {event_name}")
        if status == "done":
            return job
        if status in {"failed", "cancelled"}:
            raise RuntimeError(f"{output} {job_id} ended with {status}")
        time.sleep(6)


def update_metadata(item, job, bytes_written):
    metadata = load_metadata()
    metadata[item["output"]] = {
        "group": item["group"],
        "poster": item["poster"],
        "promptText": item["prompt"],
        "status": f"Generated event batch {time.strftime('%Y-%m-%d %H:%M:%S')}. Needs review.",
        "ltxJobId": job.get("id"),
        "bytes": bytes_written,
        "duration_secs": job.get("duration_secs"),
    }
    save_metadata(metadata)


def main():
    os.makedirs(VIDEO_DIR, exist_ok=True)
    with open(LOG_PATH, "w", encoding="utf-8") as handle:
        handle.write("")
    args = set(sys.argv[1:])
    force = "--force" in args
    wanted = args - {"--force"}
    todo = []
    for item in EVENTS:
        stem = os.path.splitext(item["output"])[0]
        target = os.path.join(VIDEO_DIR, item["output"])
        if wanted and stem not in wanted and item["output"] not in wanted and item["group"] not in wanted:
            continue
        if os.path.exists(target) and not force:
            log(f"skip {item['output']} already exists")
            continue
        todo.append(item)
    queued = []
    for item in todo:
        log(f"queue {item['output']}")
        queued.append((item, submit(item)))
        log(f"job {queued[-1][1]} {item['output']}")
    for item, job_id in queued:
        target = os.path.join(VIDEO_DIR, item["output"])
        job = wait_for_job(job_id, item["output"])
        job["id"] = job_id
        download(f"/api/jobs/{job_id}/file", target)
        bytes_written = os.path.getsize(target)
        update_metadata(item, job, bytes_written)
        log(f"ok {item['output']} {bytes_written} bytes {job.get('duration_secs')}s")
    log(f"done {len(queued)} generated")


if __name__ == "__main__":
    main()
