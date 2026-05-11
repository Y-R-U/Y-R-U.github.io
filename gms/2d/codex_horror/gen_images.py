#!/usr/bin/env python3
"""Generate Black Glass House source room art through the local MFLUX API.

The script is intentionally re-runnable and skips existing PNG sources.
For production runtime assets, convert the generated PNGs to JPEGs with:

    for f in images/*.png; do sips -s format jpeg -s formatOptions 82 "$f" --out "${f%.png}.jpg"; done
"""

import base64
import json
import os
import time
import urllib.error
import urllib.request

API_URL = "http://localhost:7861/sdapi/v1/txt2img"
MODEL = "flux2-klein-4b"
HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(HERE, "images")
LOG_PATH = os.path.join(HERE, "gen_images.log")

STYLE = (
    "cinematic psychological horror, elegant mobile visual novel room art, "
    "photorealistic painterly detail, deep shadow, subtle film grain, muted cold colors, "
    "single strong focal point, no people, no readable text, no logo, no watermark"
)

IMAGES = [
    ("title.png", 960, 540,
     "an impossible black glass hospital-house on a hill at night, rain falling upward around it, "
     "one warm window glowing, cracked glass architecture, lonely road in foreground, premium horror cover art"),
    ("cot_room.png", 720, 960,
     "small abandoned hospital cot room, high ceiling, cold tile floor, narrow metal cot, old door with scratched paint, "
     "moonlight through wired glass, antiseptic dread, vertical composition"),
    ("artery_hall.png", 720, 960,
     "bending hospital hallway that feels alive, red emergency bulbs, uneven doors, wet floor reflecting dim lights, "
     "subtle vein-like cracks in plaster, claustrophobic vertical corridor"),
    ("washroom.png", 720, 960,
     "old tiled hospital washroom, rows of porcelain basins filled with still black water, cracked black mirror, "
     "condensation, cold fluorescent glow, deep shadows"),
    ("nursery.png", 720, 960,
     "abandoned nursery ward with tiny iron beds, paper moon mobiles, a music box on a nurse desk, dust in blue light, "
     "childhood unease without showing children"),
    ("stairwell.png", 720, 960,
     "brutalist concrete stairwell inside an old sanitarium, wet steps, arrows painted on walls, one red emergency lamp, "
     "deep vertical drop into darkness"),
    ("kitchen.png", 720, 960,
     "night kitchen in an abandoned institution, long metal table set for one, dry bowls, oven light glowing, ash on plate, "
     "industrial tiles, cinematic shadows"),
    ("archive.png", 720, 960,
     "records archive room filled with leaning paper folders and file boxes, brass desk lamp lighting an open ledger, "
     "dusty shelves rising into darkness, noir horror atmosphere"),
    ("chapel.png", 720, 960,
     "small hospital chapel with twelve empty chairs facing a blank wall, black candle on metal tray, old hymn books, "
     "soft gold light surrounded by darkness"),
    ("conservatory.png", 720, 960,
     "glass conservatory attached to an abandoned hospital, rain moving upward over cracked panes, dead plants, stone fountain, "
     "moonlit greenhouse horror, vertical composition"),
    ("engine_room.png", 720, 960,
     "generator room with antique brass machine, porcelain fuse socket, wires and pressure gauges, warm pulse-like light, "
     "industrial gothic horror, no workers"),
    ("cellar.png", 720, 960,
     "lower observation ward cellar, one-way glass rooms, damp concrete, empty hospital bed at the end, dim ceiling lamps, "
     "clinical dread and deep shadows"),
    ("observatory.png", 720, 960,
     "roof observatory made of cracked black glass, rotating brass lenses, surgical paper star chart on a stand, storm sky, "
     "cosmic psychological horror"),
    ("black_door.png", 720, 960,
     "black glass door set into a concrete wall, reflecting many impossible rooms at once, warm handle, thin line of morning light, "
     "surreal finale threshold"),
    ("horror.png", 720, 960,
     "abstract faceless hospital presence behind black glass, tall shadow shape, cold rim light, fragmented reflections, "
     "minimal but terrifying psychological horror"),
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
    with urllib.request.urlopen(request, timeout=420) as response:
        return json.load(response)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    with open(LOG_PATH, "w", encoding="utf-8") as handle:
        handle.write("")

    skipped = 0
    for filename, width, height, prompt in IMAGES:
        path = os.path.join(OUT_DIR, filename)
        if os.path.exists(path) and os.path.getsize(path) > 2048:
            skipped += 1
            log(f"skip {filename}")
            continue
        started = time.time()
        try:
            log(f"gen  {filename} {width}x{height}")
            result = generate(prompt, width, height)
            encoded = result["images"][0]
            with open(path, "wb") as image_file:
                image_file.write(base64.b64decode(encoded))
            elapsed = time.time() - started
            size = os.path.getsize(path) // 1024
            log(f"ok   {filename} {size} kB {elapsed:.1f}s")
        except urllib.error.HTTPError as err:
            log(f"fail {filename} HTTP {err.code}: {err.reason}")
        except Exception as err:
            log(f"fail {filename}: {err}")
            time.sleep(2)
    log(f"done skipped {skipped}/{len(IMAGES)}")


if __name__ == "__main__":
    main()
