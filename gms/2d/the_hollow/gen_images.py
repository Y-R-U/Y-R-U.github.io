#!/usr/bin/env python3
"""Generate The Hollow's room-still pool via mflux-queue (:7867).

The game is procedural at runtime (JS picks/recombines these by room kind),
so this is a fixed, regenerable pool — like the_horrors' IMAGES list.
Submits all jobs up front, then downloads + converts each png -> jpg.
"""
import json, os, subprocess, time, urllib.request

MFLUX = "http://localhost:7867"
MODEL = "flux2-klein-9b-mlx-4bit"
W, H, STEPS = 768, 1280, 10
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "images")

STYLE = ("liminal horror, photorealistic, dim volumetric lighting, eerie atmosphere, "
         "abandoned, cinematic, deep shadows, no people, no text, no watermark, portrait composition")

IMAGES = [
    ("start_chamber", "a small bare concrete chamber with a single flickering hanging bulb, a rusted cot and one heavy metal door, the place you wake"),
    ("hall_long", "an impossibly long dim corridor with identical doors down both sides, flickering fluorescent lights, worn carpet, liminal backrooms"),
    ("hall_flooded", "a corridor with ankle-deep black water, dripping pipes overhead, dim lights reflected in the water"),
    ("junction", "a crossroads where four identical corridors meet beneath a single buzzing light, peeling paint, claustrophobic"),
    ("office", "an abandoned office, overturned desks, scattered papers across the floor, a dead glowing monitor, thick dust"),
    ("ritual", "a candlelit stone chamber with chalk symbols drawn on the floor and walls, pools of melted wax, ominous"),
    ("storage", "a storage room with towering rusted metal shelves, stacked crates and barrels, one bare hanging light"),
    ("dead_end", "a narrow corridor ending abruptly in a blank concrete wall and a boarded-up doorway, claustrophobic"),
    ("stairs_down", "a concrete stairwell descending into darkness with a faint cold glow rising from far below, an open hatch"),
    ("entity", "a tall gaunt pale humanoid figure with elongated limbs and a smooth featureless face standing far down a dim corridor facing the viewer, terrifying"),
    ("locked_door", "a heavy rusted metal door wrapped in chains and multiple locks, close up, single dim light"),
    ("shrine_item", "a small softly glowing object resting on a low stone pedestal in a dark room, faint light radiating outward, mysterious"),
    ("caught", "extreme close up of a pale smooth featureless face emerging from total darkness, mouth opening, pure horror"),
    ("title_bg", "a vast dark complex of endless intersecting corridors receding into fog, wide atmospheric establishing shot, oppressive"),
]


def post(path, payload):
    req = urllib.request.Request(f"{MFLUX}{path}", data=json.dumps(payload).encode(),
                                 headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def get(path):
    with urllib.request.urlopen(f"{MFLUX}{path}", timeout=60) as r:
        return json.load(r)


def download(path, target):
    with urllib.request.urlopen(f"{MFLUX}{path}", timeout=300) as r:
        data = r.read()
    with open(target, "wb") as fh:
        fh.write(data)


def main():
    os.makedirs(OUT, exist_ok=True)
    jobs = []
    for name, prompt in IMAGES:
        jpg = os.path.join(OUT, f"{name}.jpg")
        if os.path.exists(jpg):
            print(f"skip (exists): {name}", flush=True)
            continue
        jid = post("/api/generate", {
            "mode": "txt2img", "prompt": f"{prompt}, {STYLE}", "model": MODEL,
            "width": W, "height": H, "num_inference_steps": STEPS,
            "seed": int(time.time()) % 100000 + len(jobs), "num_images": 1,
        })["job_id"]
        jobs.append((name, jid))
        print(f"submitted {name} -> {jid}", flush=True)
        time.sleep(0.5)

    for name, jid in jobs:
        while True:
            job = get(f"/api/jobs/{jid}")
            st = job.get("status")
            if st == "done":
                break
            if st in {"failed", "cancelled"}:
                print(f"FAILED {name}: {job.get('error','')}", flush=True)
                break
            time.sleep(3)
        if get(f"/api/jobs/{jid}").get("status") != "done":
            continue
        png = os.path.join(OUT, f"{name}.png")
        download(f"/api/jobs/{jid}/file/0", png)
        jpg = os.path.join(OUT, f"{name}.jpg")
        subprocess.run(["sips", "-s", "format", "jpeg", "-s", "formatOptions", "82",
                        png, "--out", jpg], check=True, capture_output=True)
        os.remove(png)
        print(f"done {name}", flush=True)
    print("ALL DONE", flush=True)


if __name__ == "__main__":
    main()
