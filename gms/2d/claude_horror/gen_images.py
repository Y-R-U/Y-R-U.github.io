#!/usr/bin/env python3
"""Generate atmospheric room images for The Hollow via local MFLUX (port 7861).

Re-runnable: skips images already on disk. Logs to gen_images.log next door.
"""

import base64
import json
import os
import sys
import time
import urllib.request
import urllib.error

API_URL = "http://localhost:7861/sdapi/v1/txt2img"
HERE    = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(HERE, "images")
LOG     = os.path.join(HERE, "gen_images.log")

STYLE = (
    "dark atmospheric horror, cinematic lighting, photorealistic, "
    "vintage film grain, muted desaturated palette, deep shadows, "
    "foreboding mood, painterly, eerie stillness"
)

# Each entry: (filename, prompt, width, height)
IMAGES = [
    # Title — 16:9 wider canvas suits the title screen background.
    ("title.png",
     "an abandoned haunted Victorian mansion at night, full moon behind torn clouds, "
     "dense ground mist drifting across the lawn, broken windows glowing faintly, "
     "tall iron gate, dead trees, gothic, painterly cinematic horror cover art",
     768, 432),

    # Rooms — 3:2 landscape suits the in-game image strip.
    ("bedroom.png",
     "an old child's bedroom seen from the foot of the bed at night, dim moonlight through tattered lace curtains, "
     "wallpaper peeling in long pale strips, a single rumpled iron-frame bed with grey sheets, "
     "a small wooden chair, a single shadow standing in the far corner, dust motes in a thin beam of light",
     768, 512),
    ("hallway_upper.png",
     "long Victorian upstairs hallway, flickering antique wall sconces, faded red carpet runner, "
     "peeling fleur-de-lis wallpaper, several closed dark wooden doors receding into the distance, "
     "low fog drifting along the floor",
     768, 512),
    ("bathroom.png",
     "a small vintage bathroom at night, single bare bulb buzzing over a porcelain pedestal sink, "
     "a large mirror cracked clean through the middle reflecting the room, "
     "claw-foot tub with very dark still water, broken green subway tiles, mildew on grout, dripping tap",
     768, 512),
    ("bedroom2.png",
     "an empty old bedroom with all furniture draped in white dust sheets like seated figures, "
     "a wooden rocking chair tilted in the moonlight, dust suspended in the air, "
     "faint orange nightlight glowing on a covered vanity, abandoned, oppressive stillness",
     768, 512),
    ("attic_stairs.png",
     "narrow steep folding attic stairs descending from a black square hatch in the ceiling, "
     "single bare bulb above casting hard angled shadows, dust covered rungs, "
     "the camera looking up into pure darkness above",
     768, 512),
    ("attic.png",
     "an attic crowded with old children's toys, a porcelain dollhouse shaped like a Victorian mansion, "
     "an old wooden rocking horse, sheet covered furniture, "
     "a single beam of dusty light through a small round window",
     768, 512),
    ("staircase.png",
     "a dark grand wooden staircase descending into a lower hallway, ornate carved banister, "
     "dust motes drifting in candlelight from below, oppressive shadows climbing the wall",
     768, 512),
    ("hallway_lower.png",
     "downstairs hallway with black and white checkered marble tile floor, "
     "antique gilded portrait paintings on dark wood paneled walls, "
     "three archways receding into darkness, a single oil lamp burning low",
     768, 512),
    ("kitchen.png",
     "an abandoned old-fashioned kitchen at night, vintage cast iron stove, "
     "blackening fruit in a wooden bowl on a long farmhouse table, "
     "framed family photographs leaning against a tin canister, single hanging bulb, "
     "wet rings on the wood",
     768, 512),
    ("living_room.png",
     "a vintage living room with dust covered furniture, an old grey CRT television playing static, "
     "a faded floral wingback armchair with the impression of a body in it, "
     "a fireplace filled with cold white ash, dark oil paintings on the walls",
     768, 512),
    ("study.png",
     "a dimly lit study, floor to ceiling oak bookshelves, an old leather-topped desk "
     "scattered with hand-written pages, a green banker's lamp throwing a small circle of warm light, "
     "leather wingback chair, dust suspended",
     768, 512),
    ("cellar_door.png",
     "a heavy old wooden cellar door painted a deep dried-blood red, "
     "iron hinges, a heavy brass keyhole at the centre, set into a rough stone wall, "
     "low candlelight from a sconce beside it",
     768, 512),
    ("cellar.png",
     "a stone cellar at the bottom of rough steps, thick cobwebs, broken glass jars on shelves, "
     "a single hanging bulb swinging slightly, deep impenetrable shadows in the corners, "
     "claustrophobic and humid",
     768, 512),
    ("garden.png",
     "an overgrown garden at twilight, grey grass with NO shadows beneath the dead trees, "
     "wrought iron fence in the distance, a glass greenhouse half collapsed in the background, "
     "no birds, no wind, eerie stillness",
     768, 512),
    ("greenhouse.png",
     "an abandoned glass greenhouse at twilight with many shattered panes, dead potted plants on rusted shelves, "
     "gardening tools left in disarray on a workbench, moonlight streaming through the broken roof",
     768, 512),
    ("threshold.png",
     "a doorway of pure warm white light at the end of a dark Victorian corridor, "
     "mist on the floor, otherworldly glow spilling out, ethereal, surreal, painterly, "
     "hopeful but uncertain",
     768, 512),
    ("memory_car.png",
     "memory flash POV, blurry car interior at night with heavy rain on the windshield, "
     "oncoming headlights very close, motion blur, dreamlike fragmented memory, vintage film",
     768, 512),
    ("memory_hospital.png",
     "memory flash, a dim hospital room shot from directly above, white sheets, "
     "a heart monitor with a flat green line, blurred edges, dreamlike, melancholy",
     768, 512),
    ("watcher.png",
     "a tall faceless humanoid shadow figure looming, only the pure black silhouette visible "
     "against an absolute pitch black void with only a thin rim of cold blue light, "
     "pure dread, abstract, minimalist horror",
     768, 512),
]

def log(msg):
    line = f"[{time.strftime('%H:%M:%S')}] {msg}"
    print(line, flush=True)
    with open(LOG, "a") as f:
        f.write(line + "\n")

def generate(prompt, width, height, steps=8):
    body = json.dumps({
        "prompt": f"{prompt}, {STYLE}",
        "model": "flux2-klein-4b",
        "steps": steps,
        "width": width,
        "height": height,
    }).encode("utf-8")
    req = urllib.request.Request(API_URL, data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=300) as r:
        return json.load(r)

def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    open(LOG, "w").close()

    skip = 0
    for filename, prompt, w, h in IMAGES:
        path = os.path.join(OUT_DIR, filename)
        if os.path.exists(path) and os.path.getsize(path) > 1024:
            log(f"skip {filename} (exists)")
            skip += 1
            continue
        t0 = time.time()
        try:
            log(f"gen  {filename}  {w}x{h}  …")
            result = generate(prompt, w, h)
            b64 = result["images"][0]
            with open(path, "wb") as f:
                f.write(base64.b64decode(b64))
            dt = time.time() - t0
            log(f"ok   {filename}  ({os.path.getsize(path)//1024} kB, {dt:.1f}s)")
        except urllib.error.HTTPError as e:
            log(f"FAIL {filename}: HTTP {e.code} — {e.reason}")
        except Exception as e:
            log(f"FAIL {filename}: {e}")
            time.sleep(2)
    log(f"done. skipped {skip}/{len(IMAGES)}")

if __name__ == "__main__":
    main()
