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
    (
        "kitchen.png", 768, 1344,
        "small plain kitchen inside an old building, off-white plaster walls, dark wood "
        "floor, large enamel sink under a curtained window, plain wooden table in the "
        "centre with a single chair pushed in, an old kettle on a hob, plain cupboards "
        "with chipped paint, a single overhead light fixture, dim warm light, the only "
        "door visible at the side, atmospheric quiet, empty environment",
    ),
    (
        "study.png", 768, 1344,
        "small plain study inside an old building, off-white walls with a few simple "
        "framed pictures, dark wood floor, a heavy wooden desk against the wall with a "
        "blotter and a single lit oil lamp, a wooden chair pulled out as if recently "
        "vacated, narrow bookshelf beside the desk with a few worn books, the only door "
        "visible at the side, dim warm light, atmospheric quiet, empty environment",
    ),
    (
        "attic.png", 768, 1344,
        "small plain attic inside an old building, sloped wooden ceiling beams, bare "
        "wooden floorboards, off-white painted dwarf walls, a single dusty round window "
        "letting in pale grey light, an old steamer trunk and a few covered chairs under "
        "white sheets, cobwebs in the corners, the only access via a wooden staircase "
        "rising into the lower edge of frame, oppressive low ceiling, empty environment",
    ),
    (
        "dining_room.png", 768, 1344,
        "small plain dining room inside an old building, off-white walls with a single "
        "framed painting, dark wood floor, long plain wooden dining table set for no one "
        "with simple white plates and folded napkins, six wooden chairs neatly tucked in, "
        "a candelabra in the centre with unlit candles, plain dresser against the back "
        "wall, the only door visible at the side, dim warm light, atmospheric quiet, "
        "empty environment",
    ),
    (
        "library.png", 768, 1344,
        "small plain library inside an old building, off-white plaster walls partially "
        "covered by tall dark wood bookshelves filled with worn books, dark wood floor "
        "with a faded rug, a single armchair angled toward an unlit fireplace, a small "
        "side table with an open book left face down, dim warm light from a single floor "
        "lamp, the only door visible at the side, atmospheric quiet, empty environment",
    ),
    (
        "parlour.png", 768, 1344,
        "small plain parlour or sitting room inside an old building, off-white walls with "
        "a few simple framed pictures, dark wood floor with a faded rug, a low couch and "
        "two armchairs around an unlit fireplace, a small wooden tea table with an empty "
        "teacup, lace curtains over a tall window letting in pale grey light, a wall "
        "clock with the pendulum still, dim warm light, the only door visible at the "
        "side, atmospheric quiet, empty environment",
    ),
    (
        "storeroom.png", 768, 1344,
        "small plain storeroom inside an old building, off-white plaster walls with patches "
        "of damp, dark wood floor, plain wooden shelving from floor to ceiling on three "
        "walls crowded with old cardboard boxes, folded linens, stacked tin pails and "
        "wrapped objects, a single overhead bulb on a wire casting cool light, a few "
        "white sheets covering taller shapes in the back, the only door visible at the "
        "side, atmospheric quiet, empty environment",
    ),
    (
        "conservatory.png", 768, 1344,
        "small plain conservatory or glasshouse attached to an old building, large arched "
        "panes of glass on three walls letting in cold pale grey light, dark wrought iron "
        "framing between the panes, dark wood and stone tile floor, a few large potted "
        "ferns and a tall palm in plain terracotta pots, a wicker chair and a small round "
        "table with an empty glass, lace of frost on the lower panes, the only interior "
        "door visible at the side, atmospheric quiet, empty environment",
    ),
    # ── v0.3 expansion: 19 new rooms ──────────────────────────────────────
    (
        "master_bedroom.png", 768, 1344,
        "large master bedroom inside an old building, off-white walls with a single framed "
        "painting, dark wood floor with a faded rug, a wide four-poster bed under a heavy "
        "fabric canopy, two upholstered armchairs facing an unlit fireplace, a tall dressing "
        "table with its mirror turned to face the wall, dim warm light, the only door "
        "visible at the side, atmospheric quiet, empty environment",
    ),
    (
        "childs_bedroom.png", 768, 1344,
        "small child's bedroom inside an old building, off-white walls with faded animal "
        "alphabet wallpaper border, dark wood floor, a single small bed under a quilted "
        "patchwork blanket, a wooden rocking horse beside the bed, a small writing desk "
        "with a single drawing left out, dim warm light through thin curtains, the only "
        "door visible at the side, atmospheric quiet, empty environment",
    ),
    (
        "elegant_bedroom.png", 768, 1344,
        "elegant bedroom inside an old building, deep damask wallpaper, dark wood floor "
        "with a patterned rug, a tall four-poster bed with brass fittings, a silk dressing "
        "gown draped on a velvet chair, a bedside table with two glasses (one empty), dim "
        "warm light from a single brass lamp, the only door visible at the side, "
        "atmospheric quiet, empty environment",
    ),
    (
        "servants_quarters.png", 768, 1344,
        "small servants quarters inside an old building, off-white plain walls, plain "
        "wooden floor, three narrow iron-framed cots in a row with neatly folded grey "
        "blankets, three small foot-lockers at the foot of each cot, three sets of folded "
        "plain uniforms on simple wooden shelves, a single overhead bulb, dim cool light, "
        "the only door visible at the side, atmospheric quiet, empty environment",
    ),
    (
        "nursery.png", 768, 1344,
        "small nursery inside an old building, off-white walls with a faded pastel border, "
        "dark wood floor, a wicker bassinet near a tall window, a wooden cot at the side, "
        "a hanging wooden mobile of carved animals turning gently above the bassinet, a "
        "low shelf with one music box and a few small toys, dim warm light through thin "
        "curtains, the only door visible at the side, atmospheric quiet, empty environment",
    ),
    (
        "elegant_bathroom.png", 768, 1344,
        "elegant period bathroom inside an old building, polished marble basin under a "
        "tall mirror in a gilt frame, brass swan taps, a deep porcelain clawfoot bathtub "
        "with a fresh folded white towel draped over the edge, dark and white checkered "
        "tile floor, single overhead light fixture casting warm light, the only door "
        "visible at the side, atmospheric quiet, empty environment",
    ),
    (
        "red_bathroom.png", 768, 1344,
        "small bathroom inside an old building with deep oxblood red painted walls, dark "
        "stained wood floor, a small white porcelain basin under a dim red-glass lamp "
        "fixture, a clawfoot bathtub with a dark curtain partly drawn, an oval mirror "
        "with an ornate dark frame reflecting only part of the room, single dim red light, "
        "the only door visible at the side, atmospheric and oppressive, empty environment",
    ),
    (
        "bloody_bathroom.png", 768, 1344,
        "small plain white tiled bathroom inside an old building after an incident has been "
        "partly cleaned up, dried dark red-brown stains streaking down the lower white tiles "
        "and pooling toward the drain, a clawfoot tub holding a few inches of murky dark "
        "water, a white porcelain basin under a square mirror, single overhead bulb casting "
        "cool sterile light, the only door visible at the side, atmospheric horror, no body, "
        "no gore, empty environment",
    ),
    (
        "butlers_kitchen.png", 768, 1344,
        "narrow butler's prep kitchen inside an old building, off-white walls, dark wood "
        "floor, a long wooden prep bench down one side with polished silver cutlery laid "
        "out on a cloth, a hanging row of copper pots and pans on a rack above the bench, "
        "tall plain wooden cupboards along the back wall, an open leather notebook of menus "
        "on the bench, dim warm overhead light, the only door visible at the side, "
        "atmospheric quiet, empty environment",
    ),
    (
        "grand_dining_hall.png", 768, 1344,
        "grand formal dining hall inside an old building, off-white walls with tall framed "
        "paintings, dark polished wood floor, a long polished wooden dining table set for "
        "twelve with simple white plates and folded napkins, twelve wooden chairs tucked in, "
        "a large multi-tier candelabra at the centre with unlit candles, a chandelier "
        "draped in unlit candles hanging low above the table, a single half-empty wine "
        "glass at one end, dim warm light, the only door visible at the side, atmospheric "
        "quiet, empty environment",
    ),
    (
        "pantry.png", 768, 1344,
        "small pantry inside an old building, off-white plaster walls, plain wooden floor, "
        "floor-to-ceiling plain wooden shelves on three walls crowded with rows of identical "
        "preserve jars and dried-goods sacks, each shelf carefully labelled in old "
        "handwriting, one jar visibly missing from a row leaving a clean outline in the dust, "
        "a single overhead bulb casting warm light, the only door visible at the side, "
        "atmospheric quiet, empty environment",
    ),
    (
        "music_room.png", 768, 1344,
        "elegant music room inside an old building, off-white walls with simple framed "
        "sheet-music prints, dark polished wood floor, a baby grand piano lid raised with "
        "an open music book on the stand, a velvet daybed against the side wall, a small "
        "side table with a metronome, dim warm light from a single brass floor lamp, the "
        "only door visible at the side, atmospheric quiet, empty environment",
    ),
    (
        "billiard_room.png", 768, 1344,
        "small billiard room inside an old building, dark wood-panelled walls, dark wood "
        "floor with a small patterned rug, a green-felted billiard table in the centre with "
        "three balls arranged in a half-finished shot, a wooden cue rack mounted on the back "
        "wall with several cues, a leather chesterfield sofa against the back wall, dim warm "
        "overhead light, the only door visible at the side, atmospheric quiet, empty "
        "environment",
    ),
    (
        "smoking_room.png", 768, 1344,
        "small smoking room inside an old building, dark wood-panelled walls, dark wood "
        "floor with a small patterned rug, two deep leather wingback chairs angled toward "
        "an unlit fireplace, a small low table between them with a heavy glass ashtray "
        "holding a single still-smouldering cigar, dim warm amber light from a single brass "
        "lamp, the only door visible at the side, atmospheric and heavy, empty environment",
    ),
    (
        "portrait_gallery.png", 768, 1344,
        "long narrow portrait gallery inside an old building, off-white plaster walls "
        "crowded with rows of large gilt-framed family portraits illuminated by small "
        "brass picture lights, dark polished wood floor, a single dark wooden bench in the "
        "centre, the very last portrait at the far end of the gallery is conspicuously "
        "turned to face the wall, dim warm light, the only door visible at the side, "
        "atmospheric quiet, empty environment",
    ),
    (
        "chapel.png", 768, 1344,
        "small private chapel inside an old building, off-white plaster walls, dark stone "
        "floor, six plain wooden pews in two short rows, a plain wooden altar with a single "
        "lit candle and a closed bible, a small pointed-arch window with frosted glass "
        "above the altar, a wooden kneeler at the front pew showing the marks of recent "
        "use, dim warm light, the only door visible at the side, atmospheric quiet, empty "
        "environment",
    ),
    (
        "wine_cellar.png", 768, 1344,
        "small underground wine cellar inside an old building, rough stone walls and "
        "vaulted brick ceiling, packed dirt floor, rows of dark wine bottles laid in stone "
        "diamond-shaped alcoves on the side walls, a single wooden stool, a small wooden "
        "table holding one empty wine glass and a leather ledger of vintages with one entry "
        "crossed out, a single bare bulb casting yellow light, the only door visible at the "
        "side, atmospheric and old, empty environment",
    ),
    (
        "linen_closet.png", 768, 1344,
        "small linen closet inside an old building, off-white plaster walls, plain wooden "
        "floor, floor-to-ceiling plain wooden shelves crowded with piles of neatly folded "
        "white sheets and pillowcases each tied with a thin white ribbon, one pile in the "
        "middle clearly unfolded and refolded with less care, a single overhead bulb on a "
        "wire casting cool light, the only door visible at the side, atmospheric quiet, "
        "empty environment",
    ),
    (
        "greenhouse.png", 768, 1344,
        "small greenhouse attached to an old building, pitched roof of cracked greenhouse "
        "glass panes letting in cold pale grey light, dark iron framing between the panes, "
        "long wooden benches crowded with seedling trays and small terracotta pots, a "
        "trowel resting wet beside an unfinished pot of soil, one young plant grown "
        "crookedly toward the side door rather than the light, the only interior door "
        "visible at the side, atmospheric quiet, empty environment",
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
