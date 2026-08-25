#!/usr/bin/env python3
"""Generate DRK's initial 576x1024 Flux media through local mflux-queue."""

from __future__ import annotations

import argparse
import json
import os
import time
import urllib.request


HERE = os.path.dirname(os.path.abspath(__file__))
MANIFEST_PATH = os.path.join(HERE, "data", "media_manifest.json")
MFLUX_API = "http://localhost:7867"
MODEL = "flux2-klein-9b-mlx-4bit"
WIDTH = 576
HEIGHT = 1024
STEPS = 10
NEGATIVE = "child, teen, underage, explicit nudity, readable text, watermark, logo, distorted face, extra fingers"


def post(path: str, payload: dict) -> dict:
    request = urllib.request.Request(
        f"{MFLUX_API}{path}",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.load(response)


def get(path: str) -> dict:
    with urllib.request.urlopen(f"{MFLUX_API}{path}", timeout=60) as response:
        return json.load(response)


def download(path: str, target: str) -> None:
    with urllib.request.urlopen(f"{MFLUX_API}{path}", timeout=240) as response:
        data = response.read()
    os.makedirs(os.path.dirname(target), exist_ok=True)
    with open(target, "wb") as handle:
        handle.write(data)


def generate(prompt: str, target: str, force: bool) -> None:
    if os.path.exists(target) and not force:
        print(f"skip existing {os.path.relpath(target, HERE)}", flush=True)
        return
    payload = {
        "mode": "txt2img",
        "prompt": f"{prompt}, {NEGATIVE}",
        "model": MODEL,
        "width": WIDTH,
        "height": HEIGHT,
        "num_inference_steps": STEPS,
        "seed": int(time.time()) % 2_000_000_000,
        "guidance": 1.0,
        "num_images": 1,
    }
    remote = post("/api/generate", payload)
    job_id = remote["job_id"]
    print(f"queued {job_id} -> {os.path.relpath(target, HERE)}", flush=True)
    while True:
        job = get(f"/api/jobs/{job_id}")
        status = job.get("status")
        event = (job.get("events") or [{}])[-1]
        print(f"  {job_id}: {status} {event.get('event', '')}", flush=True)
        if status == "done":
            break
        if status in {"failed", "cancelled"}:
            raise RuntimeError(job.get("error") or f"job {job_id} failed")
        time.sleep(4)
    download(f"/api/jobs/{job_id}/file/0", target)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--characters-only", action="store_true")
    parser.add_argument("--backgrounds-only", action="store_true")
    args = parser.parse_args()

    with open(MANIFEST_PATH, "r", encoding="utf-8") as handle:
        manifest = json.load(handle)

    if not args.backgrounds_only:
        for character_id, character in manifest.get("characters", {}).items():
            scene = character.get("scenes", {}).get("character_card")
            if not scene:
                continue
            target = os.path.join(HERE, scene["path"])
            print(f"character {character_id}", flush=True)
            generate(scene["prompt"], target, args.force)

    if not args.characters_only:
        for background_id, background in manifest.get("backgrounds", {}).items():
            target = os.path.join(HERE, background["path"])
            print(f"background {background_id}", flush=True)
            generate(background["prompt"], target, args.force)


if __name__ == "__main__":
    main()

