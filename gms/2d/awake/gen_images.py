#!/usr/bin/env python3
"""Generate Awake room stills through the local MFLUX API."""

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
    "cinematic realistic sci-fi horror concept art, premium mobile game background, "
    "portrait composition, deep spatial depth, volumetric emergency lighting, high detail, "
    "beautiful but unsettling, no people, no readable text, no watermark, no logo"
)

IMAGES = [
    (
        "cryo_room.png",
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
    (
        "med_bay.png",
        768,
        1344,
        "abandoned futuristic med bay inside a damaged orbital habitat, two empty diagnostic beds, suspended surgical arms, "
        "soft white medical lamps mixed with warning amber light, sterile glass cabinets, one sealed exit door visible, "
        "realistic unsettling hospital science fiction mood",
    ),
    (
        "hydroponic_biome.png",
        768,
        1344,
        "overgrown hydroponic biome chamber in a failing space station, vertical plant towers, wet reflective walkway, "
        "mist drifting under ultraviolet grow lights, broken transparent dome panels showing dark space beyond, "
        "one heavy airlock exit visible, beautiful eerie survival horror atmosphere",
    ),
    (
        "reactor_gallery.png",
        768,
        1344,
        "narrow reactor gallery in a mars habitat, massive humming power core behind ribbed glass, blue white plasma glow, "
        "maintenance catwalks, warning stripes, drifting sparks, one reinforced exit door visible, cinematic realistic sci-fi dread",
    ),
    (
        "security_hub.png",
        768,
        1344,
        "compact orbital habitat security hub, curved wall of dark surveillance monitors, inactive drone racks, "
        "hard cyan interface glow, red emergency strips, one armored exit door visible, realistic sci-fi horror command room",
    ),
    (
        "observation_deck.png",
        768,
        1344,
        "tall observation deck in a damaged deep space station, panoramic reinforced window showing stars and a red planet, "
        "broken seating rails, faint aurora light, one sealed exit door visible, beautiful lonely sci-fi horror atmosphere",
    ),
    (
        "engineering_bay.png",
        768,
        1344,
        "industrial engineering bay inside an abandoned mars habitat, suspended repair arms, coolant pipes, tool lockers, "
        "orange warning lamps mixed with cold blue machinery light, one heavy exit door visible, realistic tense sci-fi survival mood",
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
