#!/usr/bin/env python3
"""Generate Awake room stills through the local MFLUX API.

The room catalogue is loaded from js/story.js so new rooms only need to
be authored once. Existing outputs are skipped unless --force is passed.
"""

import base64
import json
import os
import subprocess
import sys
import time
import urllib.request

API_URL = "http://localhost:7861/sdapi/v1/txt2img"
MODEL = "flux2-klein-4b"
HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(HERE, "original_files")
RUNTIME_DIR = os.path.join(HERE, "images")
LOG_PATH = os.path.join(HERE, "gen_images.log")

STYLE = (
    "cinematic realistic sci-fi horror concept art, premium mobile game background, "
    "portrait composition, deep spatial depth, volumetric emergency lighting, high detail, "
    "beautiful but unsettling, no people, no readable text, no watermark, no logo"
)

ROOM_KIND_HINTS = {
    "sleeping": "sleep pods, medical sleep hardware, waking mystery, one sealed exit door visible",
    "study_like": "terminals, lab benches, archive equipment, hard interface glow, one sealed exit door visible",
    "storage_like": "stacked lockers, crates, cold utility lighting, narrow paths, one heavy exit door visible",
    "kitchen_like": "compact galley surfaces, ration hardware, communal crew traces, one sealed exit door visible",
    "lounge_like": "crew seating, viewport light, lived-in details, one sealed exit door visible",
    "wild": "overgrown controlled biome, humid air, strange plants, wet reflective walkway, one airlock exit visible",
    "power_like": "industrial machinery, conduits, warning lamps, pulsing power systems, one reinforced exit door visible",
    "hallway": "long central corridor, curved metal walls, floor vents, distant sealed transport door",
}


def load_story():
    script = (
        "global.window={};"
        "require('./js/story.js');"
        "const s=window.CodexHorrorStory;"
        "console.log(JSON.stringify({rooms:s.rooms}));"
    )
    raw = subprocess.check_output(["node", "-e", script], cwd=HERE, text=True)
    return json.loads(raw)


def image_prompt(room):
    hint = ROOM_KIND_HINTS.get(room.get("kind"), ROOM_KIND_HINTS["study_like"])
    return (
        f"{room['name']} in a remote abandoned sci-fi habitat, {hint}, "
        f"{room.get('text', '')}"
    )


def log(message):
    line = f"[{time.strftime('%H:%M:%S')}] {message}"
    print(line, flush=True)
    with open(LOG_PATH, "a", encoding="utf-8") as handle:
        handle.write(line + "\n")


def generate(prompt, width, height):
    payload = {
        "prompt": f"{prompt}, {STYLE}",
        "model": MODEL,
        "steps": 10,
        "width": width,
        "height": height,
    }
    request = urllib.request.Request(
        API_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=520) as response:
        return json.load(response)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    os.makedirs(RUNTIME_DIR, exist_ok=True)
    with open(LOG_PATH, "w", encoding="utf-8") as handle:
        handle.write("")

    args = set(sys.argv[1:])
    force = "--force" in args
    wanted = args - {"--force"}
    story = load_story()
    rooms = story["rooms"]
    for room_id, room in rooms.items():
        filename = f"{room_id}.png"
        jpg_name = f"{room_id}.jpg"
        stem = room_id
        width = 768
        height = 1344
        prompt = image_prompt(room)
        if wanted and filename not in wanted and stem not in wanted:
            continue
        path = os.path.join(OUT_DIR, filename)
        jpg_path = os.path.join(RUNTIME_DIR, jpg_name)
        if os.path.exists(path) and os.path.exists(jpg_path) and not force:
            log(f"skip {filename} and {jpg_name} already exist")
            continue
        if not os.path.exists(path) or force:
            started = time.time()
            log(f"gen {filename} {width}x{height}")
            result = generate(prompt, width, height)
            with open(path, "wb") as image_file:
                image_file.write(base64.b64decode(result["images"][0]))
            elapsed = time.time() - started
            log(f"ok  {filename} {os.path.getsize(path) // 1024} kB {elapsed:.1f}s")
        log(f"jpg {jpg_name}")
        subprocess.run(
            ["sips", "-s", "format", "jpeg", "-s", "formatOptions", "85", path, "--out", jpg_path],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )


if __name__ == "__main__":
    main()
