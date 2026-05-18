#!/usr/bin/env python3
"""Generate Awake room transition videos through the local LTX API.

Transitions are loaded from js/story.js so the runtime, debug panel, and
generation queue share one catalogue. Existing MP4s are skipped unless
--force is passed.

The local LTX server has a warm queue: submit all selected jobs first,
then poll/download them one at a time. The server still runs one render
at a time, but this avoids idle unload gaps between clips.
"""

import json
import os
import subprocess
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
    "realistic cinematic sci-fi horror game transition, vertical mobile portrait shot, "
    "smooth forward camera movement through a sealed doorway, preserve exact architecture, "
    "empty environment, no people, no readable text, no logos, no watermark, no collapse, "
    "no melting, no creature, no body, professional atmospheric game footage"
)

NEGATIVE = (
    "person, face, body, creature, readable text, logo, watermark, cartoon, painting, "
    "melting architecture, collapsing room, explosion, gore, extra doors, duplicated hallway"
)

def load_story_transitions():
    script = (
        "global.window={};"
        "require('./js/story.js');"
        "const s=window.CodexHorrorStory;"
        "console.log(JSON.stringify(s.transitions.filter(t=>t.group==='room_transitions')));"
    )
    raw = subprocess.check_output(["node", "-e", script], cwd=HERE, text=True)
    transitions = []
    for index, transition in enumerate(json.loads(raw), start=1):
        transitions.append({
            "output": transition["file"],
            "start": transition["startImage"],
            "end": transition["endImage"],
            "seed": transition.get("seed") or 1000 + index,
            "prompt": transition["promptText"],
        })
    return transitions


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
    last_event = ""
    while True:
        job = get_json(f"/api/jobs/{job_id}")
        status = job.get("status")
        event = job.get("running_last_event") or job.get("last_event") or {}
        event_name = event.get("event") or ""
        if event_name and event_name != last_event:
            last_event = event_name
            log(f"{job_id} {status} {event_name}")
        if status == "done":
            return job
        if status in {"failed", "cancelled"}:
            return job
        time.sleep(5)


def main():
    os.makedirs(VIDEO_DIR, exist_ok=True)
    with open(LOG_PATH, "w", encoding="utf-8") as handle:
        handle.write("")
    args = set(sys.argv[1:])
    force = "--force" in args
    wanted = args - {"--force"}
    todo = []
    for transition in load_story_transitions():
        stem = os.path.splitext(transition["output"])[0]
        if wanted and stem not in wanted and transition["output"] not in wanted:
            continue
        target = os.path.join(VIDEO_DIR, transition["output"])
        if os.path.exists(target) and not force:
            log(f"skip {transition['output']} already exists")
            continue
        todo.append(transition)
    queued = []
    for transition in todo:
        log(f"queue {transition['output']}")
        try:
            job_id = submit(transition)
        except Exception as exc:
            log(f"submit failed {transition['output']} {exc}")
            continue
        queued.append((transition, job_id))
        log(f"job {job_id} {transition['output']}")
    for transition, job_id in queued:
        target = os.path.join(VIDEO_DIR, transition["output"])
        job = wait_for_job(job_id)
        if job.get("status") != "done":
            log(f"failed {transition['output']} {job_id} status={job.get('status')} events={job.get('events', [])[-1:]}")
            continue
        download(f"/api/jobs/{job_id}/file", target)
        log(f"ok {transition['output']} {os.path.getsize(target)} bytes {job.get('duration_secs')}s")
    log(f"done {len(queued)} generated")


if __name__ == "__main__":
    main()
