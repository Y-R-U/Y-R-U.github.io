#!/usr/bin/env python3
"""Generate The Horrors room stills via the local MFLUX API.

Visual style is intentionally diegesis-neutral so the same images can serve
hospital / asylum / haunted house runs (per-run flavour comes from text).
PNGs land in original_files/; convert to JPGs for runtime separately:

  for p in original_files/*.png; do
    sips -s format jpeg -s formatOptions 80 -Z 1344 "$p" \\
      --out "images/$(basename "${p%.png}").jpg"
  done

Usage:
  python3 gen_images.py                # all
  python3 gen_images.py hallway        # one (by stem)
  python3 gen_images.py --force        # re-gen even if PNG exists
"""

import base64
import json
import os
import sys
import time
import urllib.request

API_URL = "http://localhost:7861/sdapi/v1/txt2img"
MODEL = "flux2-klein-4b"
HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(HERE, "original_files")
LOG_PATH = os.path.join(HERE, "gen_images.log")

STYLE = (
    "cinematic realistic horror concept art, premium mobile game background, "
    "portrait composition, deep spatial depth, volumetric atmospheric lighting, "
    "high detail, beautiful but unsettling, plain off-white walls, period-neutral, "
    "no people, no readable text, no watermark, no logo, no sci-fi, no futuristic technology"
)

IMAGES = [
    (
        "hallway.png", 768, 1344,
        "long plain corridor inside an old building, off-white walls slightly stained "
        "with age, a few simple framed paintings on the walls, dark wood floor with a "
        "faded runner rug, several closed wooden doors visible on each side, dim warm "
        "ceiling light fixtures, dust motes drifting through the light, atmospheric and "
        "slightly unsettling, empty environment, the front door barely visible at the far "
        "end of the corridor",
    ),
    (
        "bedroom.png", 768, 1344,
        "small plain bedroom inside an old building, single iron-frame bed with white "
        "linens slightly disturbed, small wooden bedside table with an unlit lamp and a "
        "leather diary, large window with thin lace curtains shifting slightly, plain "
        "wooden chair beside a small writing desk, faded wallpaper, dim natural light "
        "through the curtains, the only door visible at the side, atmospheric quiet, "
        "empty",
    ),
    (
        "bathroom.png", 768, 1344,
        "small plain bathroom inside an old building, white square tiles on walls and "
        "floor, porcelain basin under a square mirror, claw-foot bathtub with a white "
        "shower curtain partway drawn, single overhead bulb casting cool light, water "
        "drop frozen mid-fall from a brass tap, the only door visible at the side, "
        "atmospheric and claustrophobic, empty environment",
    ),
    (
        "cellar.png", 768, 1344,
        "small underground cellar inside an old building, rough stone walls, packed dirt "
        "floor, single bare bulb hanging on a wire casting a yellow circle of light, old "
        "wooden shelves crowded with dusty preserve jars, a white sheet draped over "
        "something low in the corner, wooden steps leading up to the only door at the "
        "top of frame, oppressive low ceiling, empty environment",
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
    args = set(sys.argv[1:])
    force = "--force" in args
    wanted = args - {"--force"}
    for filename, width, height, prompt in IMAGES:
        stem = os.path.splitext(filename)[0]
        if wanted and filename not in wanted and stem not in wanted:
            continue
        path = os.path.join(OUT_DIR, filename)
        if os.path.exists(path) and not force:
            log(f"skip {filename} already exists")
            continue
        started = time.time()
        log(f"gen {filename} {width}x{height}")
        result = generate(prompt, width, height)
        with open(path, "wb") as image_file:
            image_file.write(base64.b64decode(result["images"][0]))
        elapsed = time.time() - started
        log(f"ok  {filename} {os.path.getsize(path) // 1024} kB {elapsed:.1f}s")


if __name__ == "__main__":
    main()
