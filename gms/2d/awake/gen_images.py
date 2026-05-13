#!/usr/bin/env python3
"""Generate Wake Protocol v0.1 stills through the local MFLUX API."""

import base64
import json
import os
import time
import urllib.request

API_URL = "http://localhost:7861/sdapi/v1/txt2img"
MODEL = "flux2-klein-4b"
HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(HERE, "images")
LOG_PATH = os.path.join(HERE, "gen_images.log")

STYLE = (
    "cinematic realistic sci-fi horror concept art, premium mobile game background, "
    "portrait composition, deep spatial depth, volumetric emergency lighting, high detail, "
    "beautiful but unsettling, no people, no readable text, no watermark, no logo"
)

IMAGES = [
    (
        "suspension_room.png",
        768,
        1344,
        "inside a cracked cryogenic suspension room in a remote space habitat, open sleep pod in foreground, "
        "thin frost floating upward, medical glass, restrained cyan and green lights, one exit door visible, "
        "lonely mystery atmosphere",
    ),
    (
        "hallway.png",
        768,
        1344,
        "long central hallway inside an abandoned mars habitat and orbital station hybrid, curved metal walls, "
        "floor vents, emergency red rim lights, distant sealed transport door, reflective black floor, "
        "claustrophobic sci-fi horror corridor",
    ),
]


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
    with open(LOG_PATH, "w", encoding="utf-8") as handle:
        handle.write("")

    for filename, width, height, prompt in IMAGES:
        path = os.path.join(OUT_DIR, filename)
        started = time.time()
        log(f"gen {filename} {width}x{height}")
        result = generate(prompt, width, height)
        with open(path, "wb") as image_file:
            image_file.write(base64.b64decode(result["images"][0]))
        elapsed = time.time() - started
        log(f"ok  {filename} {os.path.getsize(path) // 1024} kB {elapsed:.1f}s")


if __name__ == "__main__":
    main()
