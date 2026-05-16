#!/usr/bin/env python3
"""Generate The Horrors hub-spoke transition videos via the local LTX API.

Each room pairs with the hallway: <room>_to_hallway and hallway_to_<room>.
The first frame of <room>_to_hallway.mp4 is held as the room's static "still"
view in-game, so `start` must equal that room's poster JPG exactly.

Usage:
  python3 gen_transitions.py                   # all
  python3 gen_transitions.py hallway_to_bedroom
  python3 gen_transitions.py --force
"""

import json
import os
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
    "realistic cinematic horror game transition, vertical mobile portrait shot, "
    "smooth forward camera movement through a wooden doorway, preserve exact architecture, "
    "empty environment, period-neutral, no people, no readable text, no logos, no watermark, "
    "no collapse, no melting, no creature, no body, professional atmospheric game footage"
)

NEGATIVE = (
    "person, face, body, creature, readable text, logo, watermark, cartoon, painting, "
    "melting architecture, collapsing room, explosion, gore, extra doors, duplicated hallway, "
    "sci-fi, futuristic, neon, hologram"
)

TRANSITIONS = [
    {
        "output": "bedroom_to_hallway.mp4",
        "start": "images/bedroom.jpg",
        "end": "images/hallway.jpg",
        "seed": 211,
        "prompt": "camera leaves a plain bedroom past the lace curtains and the unlit lamp, "
                  "passes through the only wooden bedroom door, and ends in the long central hallway",
    },
    {
        "output": "hallway_to_bedroom.mp4",
        "start": "images/hallway.jpg",
        "end": "images/bedroom.jpg",
        "seed": 212,
        "prompt": "camera moves from the central hallway through a wooden bedroom door, "
                  "and ends inside a plain bedroom with the lace curtain shifting at the window",
    },
    {
        "output": "bathroom_to_hallway.mp4",
        "start": "images/bathroom.jpg",
        "end": "images/hallway.jpg",
        "seed": 221,
        "prompt": "camera leaves a small white-tiled bathroom past the basin and shower curtain, "
                  "passes through the only wooden bathroom door, and ends in the long central hallway",
    },
    {
        "output": "hallway_to_bathroom.mp4",
        "start": "images/hallway.jpg",
        "end": "images/bathroom.jpg",
        "seed": 222,
        "prompt": "camera moves from the central hallway through a wooden bathroom door, "
                  "and ends inside a small white-tiled bathroom with a single overhead bulb",
    },
    {
        "output": "cellar_to_hallway.mp4",
        "start": "images/cellar.jpg",
        "end": "images/hallway.jpg",
        "seed": 231,
        "prompt": "camera climbs the wooden steps out of a dim cellar, passes through the only "
                  "wooden cellar door, and ends in the long central hallway",
    },
    {
        "output": "hallway_to_cellar.mp4",
        "start": "images/hallway.jpg",
        "end": "images/cellar.jpg",
        "seed": 232,
        "prompt": "camera moves from the central hallway through a wooden cellar door, "
                  "descends the wooden staircase, and ends in a dim cellar lit by a single bare bulb",
    },
    # ── kitchen ─────────────────────────────────────────────────────────
    {
        "output": "kitchen_to_hallway.mp4",
        "start": "images/kitchen.jpg",
        "end": "images/hallway.jpg",
        "seed": 241,
        "prompt": "camera leaves a plain kitchen past the enamel sink and the wooden table, "
                  "passes through the only wooden kitchen door, and ends in the long central hallway",
    },
    {
        "output": "hallway_to_kitchen.mp4",
        "start": "images/hallway.jpg",
        "end": "images/kitchen.jpg",
        "seed": 242,
        "prompt": "camera moves from the central hallway through a wooden kitchen door, "
                  "and ends inside a plain kitchen with an old kettle on the hob",
    },
    # ── study ───────────────────────────────────────────────────────────
    {
        "output": "study_to_hallway.mp4",
        "start": "images/study.jpg",
        "end": "images/hallway.jpg",
        "seed": 251,
        "prompt": "camera leaves a small study past the wooden desk and the lit oil lamp, "
                  "passes through the only wooden study door, and ends in the long central hallway",
    },
    {
        "output": "hallway_to_study.mp4",
        "start": "images/hallway.jpg",
        "end": "images/study.jpg",
        "seed": 252,
        "prompt": "camera moves from the central hallway through a wooden study door, "
                  "and ends inside a small study with a heavy wooden desk and a single lit oil lamp",
    },
    # ── attic ───────────────────────────────────────────────────────────
    {
        "output": "attic_to_hallway.mp4",
        "start": "images/attic.jpg",
        "end": "images/hallway.jpg",
        "seed": 261,
        "prompt": "camera descends the wooden attic staircase past the round dusty window and the "
                  "covered chairs, passes through the only wooden attic door at the bottom, "
                  "and ends in the long central hallway",
    },
    {
        "output": "hallway_to_attic.mp4",
        "start": "images/hallway.jpg",
        "end": "images/attic.jpg",
        "seed": 262,
        "prompt": "camera moves from the central hallway through a wooden attic door, "
                  "ascends the wooden staircase, and ends in a dim attic with sloped beams "
                  "and a single round window letting in pale grey light",
    },
    # ── dining_room ─────────────────────────────────────────────────────
    {
        "output": "dining_room_to_hallway.mp4",
        "start": "images/dining_room.jpg",
        "end": "images/hallway.jpg",
        "seed": 271,
        "prompt": "camera leaves a plain dining room past the long wooden table set with white "
                  "plates and the unlit candelabra, passes through the only wooden dining room "
                  "door, and ends in the long central hallway",
    },
    {
        "output": "hallway_to_dining_room.mp4",
        "start": "images/hallway.jpg",
        "end": "images/dining_room.jpg",
        "seed": 272,
        "prompt": "camera moves from the central hallway through a wooden dining room door, "
                  "and ends inside a plain dining room with a long wooden table set for no one "
                  "and an unlit candelabra in the centre",
    },
    # ── library ─────────────────────────────────────────────────────────
    {
        "output": "library_to_hallway.mp4",
        "start": "images/library.jpg",
        "end": "images/hallway.jpg",
        "seed": 281,
        "prompt": "camera leaves a small library past the tall dark wood bookshelves and the "
                  "armchair beside the unlit fireplace, passes through the only wooden library "
                  "door, and ends in the long central hallway",
    },
    {
        "output": "hallway_to_library.mp4",
        "start": "images/hallway.jpg",
        "end": "images/library.jpg",
        "seed": 282,
        "prompt": "camera moves from the central hallway through a wooden library door, "
                  "and ends inside a small library with tall bookshelves and a single armchair "
                  "angled toward an unlit fireplace",
    },
    # ── parlour ─────────────────────────────────────────────────────────
    {
        "output": "parlour_to_hallway.mp4",
        "start": "images/parlour.jpg",
        "end": "images/hallway.jpg",
        "seed": 291,
        "prompt": "camera leaves a plain parlour past the low couch and the wooden tea table "
                  "with an empty teacup, passes through the only wooden parlour door, and ends "
                  "in the long central hallway",
    },
    {
        "output": "hallway_to_parlour.mp4",
        "start": "images/hallway.jpg",
        "end": "images/parlour.jpg",
        "seed": 292,
        "prompt": "camera moves from the central hallway through a wooden parlour door, "
                  "and ends inside a plain parlour with a low couch and a still wall clock",
    },
    # ── storeroom ───────────────────────────────────────────────────────
    {
        "output": "storeroom_to_hallway.mp4",
        "start": "images/storeroom.jpg",
        "end": "images/hallway.jpg",
        "seed": 301,
        "prompt": "camera leaves a plain storeroom past the wooden shelves crowded with old "
                  "boxes and folded linens, passes through the only wooden storeroom door, "
                  "and ends in the long central hallway",
    },
    {
        "output": "hallway_to_storeroom.mp4",
        "start": "images/hallway.jpg",
        "end": "images/storeroom.jpg",
        "seed": 302,
        "prompt": "camera moves from the central hallway through a wooden storeroom door, "
                  "and ends inside a plain storeroom with floor-to-ceiling wooden shelves "
                  "lit by a single overhead bulb",
    },
    # ── conservatory ────────────────────────────────────────────────────
    {
        "output": "conservatory_to_hallway.mp4",
        "start": "images/conservatory.jpg",
        "end": "images/hallway.jpg",
        "seed": 311,
        "prompt": "camera leaves a plain glass-walled conservatory past the potted ferns and "
                  "the wicker chair, passes through the only interior wooden conservatory door, "
                  "and ends in the long central hallway",
    },
    {
        "output": "hallway_to_conservatory.mp4",
        "start": "images/hallway.jpg",
        "end": "images/conservatory.jpg",
        "seed": 312,
        "prompt": "camera moves from the central hallway through a wooden conservatory door, "
                  "and ends inside a glass-walled conservatory with arched panes letting in "
                  "cold pale grey light, potted ferns and a wicker chair",
    },
]


# ── v0.3 expansion: 19 new rooms × 2 transitions each ──────────────────────
# Compact spec: each entry is (room_id, seed_base, room_phrase). The pair of
# transitions for each room is built below the spec. Seeds are spaced 10
# apart so seed_base = N → outgoing N+1, return N+2 (and N+3..N+9 are free
# for re-rolls).
V03_ROOMS = [
    ("master_bedroom",    400,
     "large master bedroom past the canopied four-poster bed and the dressing table with its mirror turned to the wall"),
    ("childs_bedroom",    410,
     "small child's bedroom past the rocking horse and the patchwork quilt with the faded alphabet wallpaper border"),
    ("elegant_bedroom",   420,
     "elegant damask-walled bedroom past the silk-draped chair and the brass-fitted four-poster bed"),
    ("servants_quarters", 430,
     "narrow servants quarters past the three iron-framed cots and the row of folded uniforms"),
    ("nursery",           440,
     "small nursery past the wicker bassinet and the slowly turning wooden mobile of carved animals"),
    ("elegant_bathroom",  450,
     "elegant period bathroom past the marble basin and the deep porcelain clawfoot bathtub"),
    ("red_bathroom",      460,
     "small dim oxblood-red painted bathroom past the dark mirror and the curtained clawfoot bathtub"),
    ("bloody_bathroom",   470,
     "small white tiled bathroom with dried dark stained tiles past the clawfoot tub holding murky water"),
    ("butlers_kitchen",   480,
     "narrow butler's prep kitchen past the polished silver cutlery laid out and the hanging copper pans"),
    ("grand_dining_hall", 490,
     "grand formal dining hall past the long table set for twelve and the unlit chandelier draped in candles"),
    ("pantry",            500,
     "small pantry past the floor-to-ceiling shelves of labelled preserve jars with one jar conspicuously missing"),
    ("music_room",        510,
     "elegant music room past the baby grand piano with raised lid and the velvet daybed against the wall"),
    ("billiard_room",     520,
     "small billiard room past the green-felted billiard table with three balls arranged and the leather chesterfield"),
    ("smoking_room",      530,
     "small dark wood-panelled smoking room past the two leather wingback chairs and the still-smouldering cigar in the ashtray"),
    ("portrait_gallery",  540,
     "long portrait gallery past the rows of gilt-framed family portraits with the last one turned to face the wall"),
    ("chapel",            550,
     "small private chapel past the six wooden pews and the single lit candle on the plain altar"),
    ("wine_cellar",       560,
     "small underground wine cellar past the stone alcoves of dark bottles and the wooden ledger of vintages"),
    ("linen_closet",      570,
     "small linen closet past the floor-to-ceiling shelves of folded white sheets and pillowcases tied with ribbon"),
    ("greenhouse",        580,
     "small greenhouse past the long benches of seedling trays and the crookedly grown young plant"),
]

for _room_id, _seed_base, _phrase in V03_ROOMS:
    TRANSITIONS.append({
        "output": f"{_room_id}_to_hallway.mp4",
        "start":  f"images/{_room_id}.jpg",
        "end":    "images/hallway.jpg",
        "seed":   _seed_base + 1,
        "prompt": f"camera leaves a {_phrase}, passes through the only wooden door, "
                  f"and ends in the long central hallway",
    })
    TRANSITIONS.append({
        "output": f"hallway_to_{_room_id}.mp4",
        "start":  "images/hallway.jpg",
        "end":    f"images/{_room_id}.jpg",
        "seed":   _seed_base + 2,
        "prompt": f"camera moves from the central hallway through a wooden door, "
                  f"and ends inside a {_phrase}",
    })


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
    while True:
        job = get_json(f"/api/jobs/{job_id}")
        status = job.get("status")
        event = job.get("running_last_event") or job.get("last_event") or {}
        if event.get("event"):
            log(f"{job_id} {status} {event.get('event')}")
        if status == "done":
            return job
        if status in {"failed", "cancelled"}:
            raise RuntimeError(f"{job_id} ended with {status}")
        time.sleep(5)


def main():
    os.makedirs(VIDEO_DIR, exist_ok=True)
    with open(LOG_PATH, "w", encoding="utf-8") as handle:
        handle.write("")
    args = set(sys.argv[1:])
    force = "--force" in args
    wanted = args - {"--force"}
    for transition in TRANSITIONS:
        stem = os.path.splitext(transition["output"])[0]
        if wanted and stem not in wanted and transition["output"] not in wanted:
            continue
        target = os.path.join(VIDEO_DIR, transition["output"])
        if os.path.exists(target) and not force:
            log(f"skip {transition['output']} already exists")
            continue
        log(f"queue {transition['output']}")
        job_id = submit(transition)
        log(f"job {job_id} {transition['output']}")
        job = wait_for_job(job_id)
        download(f"/api/jobs/{job_id}/file", target)
        log(f"ok {transition['output']} {os.path.getsize(target)} bytes {job.get('duration_secs')}s")


if __name__ == "__main__":
    main()
