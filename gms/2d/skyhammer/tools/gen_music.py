#!/usr/bin/env python3
"""Generate background themes + ending stings via local ACE-Step (port 8001).

Uses the turbo recipe (inference_steps=4, instrumental). Submits all jobs,
polls until each completes, copies the result mp3 into music/.

Lyric inline cues if you want vocals (uncommon for horror bg):
  (female) / (male) / (both) / (harmony) — see audio/CLAUDE.md.

Usage:
  python3 gen_music.py
  python3 gen_music.py theme1.mp3        # one
  python3 gen_music.py --force           # re-gen
"""

import json
import os
import shutil
import sys
import time
from urllib.parse import unquote
from urllib.request import Request, urlopen

PROXY = "http://localhost:8001"
HERE = os.path.dirname(os.path.abspath(__file__))
TARGET_DIR = os.path.join(HERE, "..", "assets", "audio", "music")
LOG_PATH = os.path.join(HERE, "gen_music.log")

JOBS = [
    ("probe_ww2.mp3", {
        "prompt": "heroic world war two military orchestral march, brass fanfare, snare drum roll, sweeping strings, wartime newsreel energy, driving and triumphant, instrumental, 120 bpm",
        "audio_duration": 90, "inference_steps": 4, "batch_size": 1,
        "audio_format": "mp3", "task_type": "text2music", "thinking": False,
    }),
    ("probe_metal.mp3", {
        "prompt": "heavy metal war anthem, distorted downtuned guitars, double kick drums, aggressive palm muted riff, soaring lead guitar over a military snare, instrumental, 150 bpm",
        "audio_duration": 90, "inference_steps": 4, "batch_size": 1,
        "audio_format": "mp3", "task_type": "text2music", "thinking": False,
    }),
    ("probe_hybrid.mp3", {
        "prompt": "world war two orchestral march that builds into heavy metal, brass and snare opening then distorted electric guitars and double kick take over, epic hybrid of big band brass and metal riffing, instrumental, 130 bpm",
        "audio_duration": 120, "inference_steps": 4, "batch_size": 1,
        "audio_format": "mp3", "task_type": "text2music", "thinking": False,
    }),
]


def log(message):
    line = f"[{time.strftime('%H:%M:%S')}] {message}"
    print(line, flush=True)
    with open(LOG_PATH, "a", encoding="utf-8") as handle:
        handle.write(line + "\n")


def post_json(path, body, timeout=180):
    req = Request(
        f"{PROXY}{path}",
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urlopen(req, timeout=timeout) as r:
        return json.loads(r.read())


def submit(params):
    return post_json("/release_task", params)["data"]["task_id"]


def query(task_ids):
    return post_json("/query_result", {"task_id_list": task_ids}, timeout=15)["data"]


def download(server_path, dest):
    if "path=" in server_path:
        abs_path = unquote(server_path.split("path=", 1)[1])
        if os.path.exists(abs_path):
            shutil.copyfile(abs_path, dest)
            return
    with urlopen(f"{PROXY}{server_path}", timeout=60) as r:
        with open(dest, "wb") as f:
            shutil.copyfileobj(r, f)


def main():
    os.makedirs(TARGET_DIR, exist_ok=True)
    with open(LOG_PATH, "w", encoding="utf-8") as handle:
        handle.write("")
    args = set(sys.argv[1:])
    force = "--force" in args
    wanted = args - {"--force"}

    todo = []
    for fname, params in JOBS:
        target = os.path.join(TARGET_DIR, fname)
        if wanted and fname not in wanted and os.path.splitext(fname)[0] not in wanted:
            continue
        if os.path.exists(target) and not force:
            log(f"skip {fname} already exists")
            continue
        todo.append((fname, params))

    pending = {}  # task_id -> fname
    for fname, params in todo:
        for attempt in range(3):
            try:
                tid = submit(params)
                pending[tid] = fname
                log(f"  {fname:24s}  →  {tid}")
                break
            except Exception as e:
                log(f"  retry {attempt+1}/3 for {fname}: {e}")
                time.sleep(5)
        else:
            log(f"  ✗ FAILED TO SUBMIT {fname}")

    start = time.time()
    while pending:
        try:
            rows = query(list(pending.keys()))
        except Exception as e:
            log(f"  poll error: {e}")
            time.sleep(5)
            continue
        for row in rows:
            tid = row["task_id"]
            if tid not in pending:
                continue
            status = row.get("status", 0)
            if status == 1:
                result = json.loads(row["result"])
                file_ref = result[0].get("file") if result else ""
                if not file_ref:
                    log(f"  ⚠  {pending[tid]}: status=1 but no file?")
                    pending.pop(tid)
                    continue
                dest = os.path.join(TARGET_DIR, pending[tid])
                download(file_ref, dest)
                size_kb = os.path.getsize(dest) / 1024
                elapsed = time.time() - start
                log(f"  ✓ {pending[tid]:24s}  {size_kb:>7.0f} KB  (+{elapsed:.0f}s)")
                pending.pop(tid)
            elif status == 2:
                log(f"  ✗ {pending[tid]:24s}  FAILED: {row.get('progress_text', '')[:120]}")
                pending.pop(tid)
        if pending:
            time.sleep(3)

    log("all done.")


if __name__ == "__main__":
    main()
