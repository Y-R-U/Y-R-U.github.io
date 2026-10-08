#!/usr/bin/env python3
"""Submit reference stills to mflux-queue :7867 and download candidates into refs/_cands/.
Usage: gen_refs.py [name ...]   (no args = all)"""
import json, sys, time, urllib.request
from pathlib import Path

API = "http://localhost:7867"
LTX = "http://localhost:7866"
OUT = Path(__file__).resolve().parents[2] / "refs" / "_cands"
STYLE = ("3D animated feature film still, Pixar and Illumination style soft stylized render, "
         "rounded shapes, warm golden lighting, soft shadows, subsurface scattering, high detail, ")
CAT = ("a very fat chubby orange tabby cat with bold black tiger stripes on its back and head, huge round orange belly (mostly orange fur, only a pale muzzle), "
       "heavy half-lidded sleepy eyes, large white eyes with small black pupils, small pink nose, wide muzzle, "
       "small rounded ears, thick striped orange tail, fluffy fur, smug lazy expression, ")
JON = ("a tall lanky friendly cartoon man in his thirties, brown neat hair, big friendly smile, long neck, "
       "light-blue button-up shirt, brown trousers, brown shoes, slightly goofy cartoon proportions, long thin arms and legs, ")
ODIE = ("a goofy cartoon dog with pale yellow fur, long floppy black ears, a black nose, a thin black tail, one round black spot on his side, "
        "long gangly legs, a huge long pink slobbery tongue hanging out of his wide open smiling mouth, big dopey happy eyes, "
        "lovable and dim-witted, ")
LYMAN = ("a cartoon man in his thirties with neat black hair and a big bushy black moustache, theatrical and charming, "
         "wearing a mustard-yellow knit sweater over a collared shirt, dark green trousers, brown shoes, slightly goofy cartoon proportions, ")
BG = "plain warm cream studio backdrop, character turnaround reference sheet style, full body visible"

REFS = {
    "garfield_front": (STYLE + CAT + "walking on all fours like a normal cat, horizontal body, all four paws on the floor, belly sagging low to the ground, facing the camera directly, front view, " + BG, 1024, 768),
    "garfield_side": (STYLE + CAT + "walking on all fours like a normal cat, horizontal body, all four paws on the floor, belly sagging low, exact side profile view facing left, tail curving up, " + BG, 1024, 768),
    "garfield_3q": (STYLE + CAT + "walking on all fours like a normal cat, horizontal body, all four paws on the floor, belly sagging low, three-quarter view, head turned to camera, " + BG, 1024, 768),
    "garfield_sit": (STYLE + CAT + "sitting upright on its bottom like a person, belly sticking out, arms resting on belly, front view, " + BG, 768, 1024),
    "jon_front": (STYLE + JON + "standing relaxed, front view facing camera, " + BG, 768, 1024),
    "jon_3q": (STYLE + JON + "standing, three-quarter view, waving with one hand, " + BG, 768, 1024),
    "kitchen": (STYLE + "interior of a cosy small suburban kitchen in the evening, wooden dining table with two chairs, "
                "a wooden bench along the wall, an old rounded retro cream fridge with a hanging pot plant on top, "
                "warm lamp light, checkered floor, window with dusk outside, no people, wide shot", 1024, 768),
    "living_room": (STYLE + "interior of a cosy small old-fashioned living room in the evening, a small old wooden CRT television "
                    "on a stand, a small two-seat sofa, a comfy lounge armchair, a window with flowing curtains and a vase on the windowsill, "
                    "the front door right beside the living room, warm lamp light, rug, no people, wide shot", 1024, 768),
    "bedroom": (STYLE + "interior of a cosy upstairs bedroom at evening, a single man's bed with a patterned quilt, "
                "and next to it a small round cat bed with a little blanket in it, bedside lamp, wooden floor, window, "
                "warm light, no people, wide shot", 1024, 768),
    "culdesac_exterior": (STYLE + "a cosy suburban cul-de-sac at dusk, a circle of charming two-storey houses with lawns and "
                          "picket fences, one hero house in the centre with warm glowing windows and a front porch, street lamps on, "
                          "purple-orange sunset sky, aerial establishing shot", 1024, 576),
    "food_steak": (STYLE + "a delicious dinner plate on a wooden table: a juicy grilled steak, a pile of bright green peas, "
                   "a fluffy mound of mashed potato with melting butter and gravy, appetising food close-up, warm light", 1024, 768),
    "food_lasagna": (STYLE + "a classic square-cornered slice of Italian lasagna on a white plate next to a metal baking pan of lasagna, "
                     "the slice shows neat flat horizontal stacked layers: wide flat pasta sheets, rich red bolognese meat sauce, "
                     "creamy white bechamel, browned bubbling melted cheese on top with crispy golden edges, steam rising, "
                     "appetising close-up on a wooden kitchen table", 1024, 768),
    "food_meatloaf": (STYLE + "a delicious glazed meatloaf on a plate, a thick sliced slab with shiny tomato glaze, on a wooden table, "
                      "appetising food close-up, warm kitchen light", 1024, 768),
    # wave 3 (Brief 2)
    "odie_front": (STYLE + ODIE + "standing on all fours, front view facing the camera, tongue hanging out, " + BG, 1024, 768),
    "odie_side": (STYLE + ODIE + "standing on all fours, exact side profile view facing left, the black spot clearly visible on his side, tongue flopping out, tail up, " + BG, 1024, 768),
    "lyman_front": (STYLE + LYMAN + "standing relaxed, front view facing camera, " + BG, 768, 1024),
    "lyman_3q": (STYLE + LYMAN + "standing, three-quarter view, one arm flung out dramatically, holding a small battered suitcase in the other hand, " + BG, 768, 1024),
    "lyman_disco": (STYLE + "a cartoon man in his thirties with black hair and a big bushy black moustache, wearing a shiny white 1970s disco suit "
                    "with wide lapels, flared bell-bottom trousers, open-collar shirt, white platform shoes, striking a proud disco pose with one finger pointing up, "
                    "slightly goofy cartoon proportions, " + BG, 768, 1024),
    "garfield_bald": (STYLE + "a very fat chubby cartoon cat with NO fur at all, completely hairless bald smooth pink skin, huge round belly, "
                      "the same shape as a fat orange tabby cat but all pink and naked, large white eyes with small black pupils, small pink nose, "
                      "wide muzzle, small rounded ears, thin pink tail, comically embarrassed blushing expression, trying to cover himself with a paw, "
                      "sitting upright, funny and cute not gross, " + BG, 1024, 768),
    "delivery_man": (STYLE + "a friendly cartoon delivery man in his forties, brown uniform shirt and shorts, brown cap, holding a big cardboard box "
                     "with a TV picture printed on it, sturdy build, cheerful, slightly goofy cartoon proportions, " + BG, 768, 1024),
    "lyman_bedroom": (STYLE + "interior of a small cosy upstairs guest bedroom at evening, a single bed with a plain striped blanket, a battered old suitcase "
                      "open on the floor with clothes spilling out, a small round dog bed with a chewed toy bone, a bedside table with a lamp, "
                      "a coat rack, wooden floor, small window, warm lamp light, slightly messy, no people, wide shot", 1024, 768),
    "ui_mood": ("cosy cartoon video game main menu screen design, chunky rounded buttons with thick outlines, "
                "warm palette of orange, cream and chocolate brown, playful bouncy title lettering area, paw print and lasagna "
                "icons, soft drop shadows, clean friendly UI for kids, flat-shaded game UI mockup, no text", 1024, 576),
}


def req(path, data=None, base=API):
    r = urllib.request.Request(base + path, data=json.dumps(data).encode() if data is not None else None,
                               headers={"Content-Type": "application/json"}, method="POST" if data is not None else "GET")
    with urllib.request.urlopen(r, timeout=60) as f:
        return f.read()


def main():
    names = sys.argv[1:] or list(REFS)
    nseeds = int(__import__("os").environ.get("NSEEDS", "1"))
    seeds = [101, 202, 303, 404][:nseeds]
    OUT.mkdir(parents=True, exist_ok=True)
    while json.loads(req("/api/status", base=LTX)).get("worker_warm"):
        print("waiting for LTX idle"); time.sleep(5)
    jobs = []
    for n in names:
        p, w, h = REFS[n]
        k = float(__import__("os").environ.get("SCALE", "1")); w, h = int(w * k) // 16 * 16, int(h * k) // 16 * 16
        if __import__("os").environ.get("SIZE"): w, h = map(int, __import__("os").environ["SIZE"].split("x"))
        for s in seeds:
            j = json.loads(req("/api/generate", {"mode": "txt2img", "prompt": p, "model": "flux2-klein-4b", "width": w,
                                                 "height": h, "num_inference_steps": int(__import__("os").environ.get("STEPS","16")), "seed": s, "num_images": 1}))
            jobs.append((n, s, j["job_id"]))
    print(f"submitted {len(jobs)}", flush=True)
    if __import__("os").environ.get("NOWAIT"): return
    for n, s, jid in jobs:
        while True:
            st = json.loads(req(f"/api/jobs/{jid}"))
            if st["status"] in ("done", "error", "failed"):
                break
            time.sleep(3)
        if st["status"] == "done":
            (OUT / f"{n}_s{s}.png").write_bytes(req(f"/api/jobs/{jid}/file/0"))
            print("got", n, s, flush=True)
        else:
            print("FAIL", n, s, st, flush=True)


if __name__ == "__main__":
    main()
