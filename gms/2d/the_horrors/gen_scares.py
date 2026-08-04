#!/usr/bin/env python3
"""Queue room scare and hallway death clips through the local LTX API.

Byte-identical between awake/ and the_horrors/; all game-specific text lives
in scares_config.json next door.

Room scares start from the room still that already ships in images/, so there
is no MFLUX start-frame step -- each clip is a single ~2 minute LTX pass.
Deaths always start from the hallway still: the game ejects the player back
through the existing <room>_to_hallway transition before the death plays, so
one clip per threat covers every room.

  python3 gen_scares.py                  # every missing clip, one variant
  python3 gen_scares.py --variants 2     # also queue the _v2 alternates
  python3 gen_scares.py scare_cellar     # just these stems
  python3 gen_scares.py deaths --force   # regenerate the death group
"""

import json
import os
import sys
import time
import urllib.request

API = "http://localhost:7866"
HERE = os.path.dirname(os.path.abspath(__file__))
VIDEO_DIR = os.path.join(HERE, "videos")
CONFIG_PATH = os.path.join(HERE, "scares_config.json")
LOG_PATH = os.path.join(HERE, "gen_scares.log")
METADATA_PATH = os.path.join(HERE, ".debug_transition_metadata.json")
WIDTH = 384
HEIGHT = 640
SCARE_FRAMES = 73
DEATH_FRAMES = 97


def load_config():
    with open(CONFIG_PATH, "r", encoding="utf-8") as handle:
        return json.load(handle)


def log(message):
    line = f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] {message}"
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
    with urllib.request.urlopen(f"{API}{path}", timeout=300) as response:
        data = response.read()
    with open(target, "wb") as handle:
        handle.write(data)


def build_items(config, variants):
    common = config["common"]
    negative = config["negative"]
    items = []
    seed = int(config.get("seed_base", 4200))
    for room_id, prompt in sorted(config.get("scares", {}).items()):
        start = f"images/{room_id}.jpg"
        if not os.path.exists(os.path.join(HERE, start)):
            log(f"skip {room_id}: no still at {start}")
            continue
        for variant in range(1, variants + 1):
            seed += 1
            suffix = "" if variant == 1 else f"_v{variant}"
            items.append({
                "output": f"scare_{room_id}{suffix}.mp4",
                "group": "room_scare",
                "poster": start,
                "start": start,
                "seed": seed,
                "num_frames": SCARE_FRAMES,
                "prompt": f"{prompt}, {common}",
                "negative": negative,
            })
    hallway = "images/hallway.jpg"
    for threat_id, prompt in sorted(config.get("deaths", {}).items()):
        for variant in range(1, variants + 1):
            seed += 1
            suffix = "" if variant == 1 else f"_v{variant}"
            items.append({
                "output": f"ending_death_{threat_id}{suffix}.mp4",
                "group": "ending_death",
                "poster": hallway,
                "start": hallway,
                "seed": seed,
                "num_frames": DEATH_FRAMES,
                "prompt": f"{prompt}, {common}",
                "negative": negative,
            })
    return items


def submit(item):
    payload = {
        "prompt": item["prompt"],
        "width": WIDTH,
        "height": HEIGHT,
        "num_frames": item["num_frames"],
        "fps": 24,
        "seed": item["seed"],
        "num_inference_steps": 20,
        "cfg_scale": 3.0,
        "negative_prompt": item["negative"],
        "image": os.path.join(HERE, item["start"]),
        "image_strength": 1.0,
        "tiling": "aggressive",
        "no_audio": True,
    }
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
        if status in {"done", "failed", "cancelled"}:
            return job
        time.sleep(6)


def update_metadata(item, job, bytes_written):
    metadata = load_metadata()
    metadata[item["output"]] = {
        "group": item["group"],
        "poster": item["poster"],
        "promptText": item["prompt"],
        "status": f"Generated scare batch {time.strftime('%Y-%m-%d %H:%M:%S')}. Needs review.",
        "ltxJobId": job.get("id"),
        "bytes": bytes_written,
        "duration_secs": job.get("duration_secs"),
    }
    save_metadata(metadata)


def main():
    os.makedirs(VIDEO_DIR, exist_ok=True)
    args = sys.argv[1:]
    force = "--force" in args
    variants = 1
    if "--variants" in args:
        variants = max(1, int(args[args.index("--variants") + 1]))
    wanted = {
        arg for arg in args
        if not arg.startswith("--") and not arg.isdigit()
    }
    config = load_config()
    todo = []
    for item in build_items(config, variants):
        stem = os.path.splitext(item["output"])[0]
        if wanted and stem not in wanted and item["output"] not in wanted and item["group"] not in wanted:
            continue
        if os.path.exists(os.path.join(VIDEO_DIR, item["output"])) and not force:
            continue
        todo.append(item)
    if not todo:
        log("nothing to do")
        return
    log(f"queueing {len(todo)} clips (variants={variants}, force={force})")

    # The LTX server keeps the model warm across a queue, so submit everything
    # up front and collect afterwards rather than pay a reload per clip.
    queued = []
    for item in todo:
        try:
            job_id = submit(item)
        except Exception as exc:
            log(f"submit failed {item['output']} {exc}")
            continue
        queued.append((item, job_id))
        log(f"queued {item['output']} {job_id}")
    ok = 0
    for item, job_id in queued:
        job = wait_for_job(job_id, item["output"])
        if job.get("status") != "done":
            log(f"failed {item['output']} {job_id} status={job.get('status')}")
            continue
        job["id"] = job_id
        target = os.path.join(VIDEO_DIR, item["output"])
        try:
            download(f"/api/jobs/{job_id}/file", target)
        except Exception as exc:
            log(f"download failed {item['output']} {exc}")
            continue
        bytes_written = os.path.getsize(target)
        update_metadata(item, job, bytes_written)
        ok += 1
        log(f"ok {item['output']} {bytes_written} bytes {job.get('duration_secs')}s")
    log(f"done {ok}/{len(queued)} generated")


if __name__ == "__main__":
    main()
