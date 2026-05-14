#!/usr/bin/env python3
"""Queue Awake event and review videos through the local LTX API."""

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
    "realistic cinematic sci-fi horror game footage, vertical mobile portrait shot, "
    "professional atmospheric lighting, preserve the central hallway architecture, "
    "no readable text, no logos, no watermark, no gore, no blood, no body horror"
)

NEGATIVE = (
    "readable text, logo, watermark, subtitles, gore, blood, dismemberment, corpse, "
    "cartoon, anime, painting, melting architecture, duplicated doors, distorted camera"
)

EVENTS = [
    {
        "output": "monster_release_gene.mp4",
        "group": "monster_release",
        "poster": "images/hallway.jpg",
        "start": "images/hallway.jpg",
        "seed": 1201,
        "prompt": "the empty central hallway lights flicker, a tall bio-engineered hunter steps out of steam at the far end and turns toward the camera, tense PG sci-fi horror reveal",
    },
    {
        "output": "monster_release_alien.mp4",
        "group": "monster_release",
        "poster": "images/hallway.jpg",
        "start": "images/hallway.jpg",
        "seed": 1202,
        "prompt": "the empty central hallway darkens, a sleek alien infiltrator silhouette appears from a side shadow and slowly raises its head toward the camera, tense PG sci-fi horror reveal",
    },
    {
        "output": "monster_release_zombie.mp4",
        "group": "monster_release",
        "poster": "images/hallway.jpg",
        "start": "images/hallway.jpg",
        "seed": 1203,
        "prompt": "the empty central hallway warning lights pulse, a reanimated crew member in a damaged space uniform staggers into view at the far end and notices the camera, tense PG sci-fi horror reveal",
    },
    {
        "output": "monster_attack_gene.mp4",
        "group": "monster_attack",
        "poster": "images/hallway.jpg",
        "start": "images/hallway.jpg",
        "seed": 1301,
        "prompt": "central hallway point of view, a tall bio-engineered hunter suddenly rushes directly toward the camera, fast PG jump scare impact, no blood, no gore",
    },
    {
        "output": "monster_attack_alien.mp4",
        "group": "monster_attack",
        "poster": "images/hallway.jpg",
        "start": "images/hallway.jpg",
        "seed": 1302,
        "prompt": "central hallway point of view, a sleek alien infiltrator darts from the shadows and lunges at the camera, fast PG jump scare impact, no blood, no gore",
    },
    {
        "output": "monster_attack_zombie.mp4",
        "group": "monster_attack",
        "poster": "images/hallway.jpg",
        "start": "images/hallway.jpg",
        "seed": 1303,
        "prompt": "central hallway point of view, a reanimated crew member in a damaged space uniform surges close and grabs toward the camera, fast PG jump scare impact, no blood, no gore",
    },
    {
        "output": "ending_victory_transport_tube.mp4",
        "group": "ending_video",
        "poster": "images/hallway.jpg",
        "start": "images/hallway.jpg",
        "seed": 1401,
        "prompt": "central hallway transforms into a bright emergency transport tube, doors open, white-blue light pulls the camera forward into escape, hopeful sci-fi victory ending",
    },
    {
        "output": "ending_victory_shuttle_launch.mp4",
        "group": "ending_video",
        "poster": "images/hallway.jpg",
        "start": "images/hallway.jpg",
        "seed": 1402,
        "prompt": "central hallway opens to a small escape shuttle bay, the camera rushes into the launch light as the shuttle departs the station, hopeful sci-fi victory ending",
    },
    {
        "output": "possible_cryo_room_to_hallway_alt01.mp4",
        "group": "possible_other_transition",
        "poster": "images/cryo_room.jpg",
        "start": "images/cryo_room.jpg",
        "end": "images/hallway.jpg",
        "seed": 1501,
        "prompt": "camera leaves the cracked cryogenic room through the only exit, moves cleanly through the door frame, and ends in the central hallway, empty environment",
    },
    {
        "output": "possible_med_bay_to_hallway_alt01.mp4",
        "group": "possible_other_transition",
        "poster": "images/med_bay.jpg",
        "start": "images/med_bay.jpg",
        "end": "images/hallway.jpg",
        "seed": 1502,
        "prompt": "camera leaves the abandoned futuristic med bay through the only medical door, moves cleanly into the central hallway, empty environment",
    },
    {
        "output": "possible_hydroponic_biome_to_hallway_alt01.mp4",
        "group": "possible_other_transition",
        "poster": "images/hydroponic_biome.jpg",
        "start": "images/hydroponic_biome.jpg",
        "end": "images/hallway.jpg",
        "seed": 1503,
        "prompt": "camera leaves the misty hydroponic biome chamber through the airlock, plant towers recede behind, and the camera ends in the central hallway, empty environment",
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
