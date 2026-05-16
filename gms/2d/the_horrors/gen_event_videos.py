#!/usr/bin/env python3
"""Generate The Horrors event videos (monster + endings) via the local LTX API.

Most events live IN the hub, so they share hallway.jpg as their start frame.
The bedroom-window ending is the exception (start = bedroom.jpg).

Usage:
  python3 gen_event_videos.py
  python3 gen_event_videos.py monster_release           # whole group
  python3 gen_event_videos.py ending_window             # one (by stem)
  python3 gen_event_videos.py --force
"""

import json
import os
import sys
import time
import urllib.request

API = "http://localhost:7866"
HERE = os.path.dirname(os.path.abspath(__file__))
VIDEO_DIR = os.path.join(HERE, "videos")
LOG_PATH = os.path.join(HERE, "gen_event_videos.log")
METADATA_PATH = os.path.join(HERE, ".debug_transition_metadata.json")
GAME_PORTRAIT_WIDTH = 384
GAME_PORTRAIT_HEIGHT = 640

COMMON = (
    "realistic cinematic horror game footage, vertical mobile portrait shot, "
    "professional atmospheric lighting, preserve the architecture, period-neutral, "
    "no readable text, no logos, no watermark, no gore, no blood, no body horror, "
    "no sci-fi, no futuristic technology"
)

NEGATIVE = (
    "readable text, logo, watermark, subtitles, gore, blood, dismemberment, corpse, "
    "cartoon, anime, painting, melting architecture, duplicated doors, distorted camera, "
    "sci-fi, futuristic, neon, hologram, "
    # Tessellation guard — LTX-2.3 distilled-Q4 falls into a repeating-tile
    # attractor when foreground/background contrast is too low. v1 clips with
    # white nightgown against off-white walls all dissolved into mosaic by
    # frame ~20. Keep these in the negative prompt:
    "tessellated pattern, repeating texture, mosaic tile, grid pattern, "
    "interlocking pattern, repeating squares, kaleidoscope, fractal artifact"
)

EVENTS = [
    # All figures are deliberately HIGH-CONTRAST against the off-white walls:
    # dark hooded shawl / long dark dress / dark hair. Avoid white-on-white
    # (caused v1 tessellation collapse — see possible_*_v1.mp4 archives).
    {
        "output": "monster_release_pale_woman.mp4",
        "group": "monster_release",
        "poster": "images/hallway.jpg",
        "start": "images/hallway.jpg",
        "seed": 511,
        "prompt": "the empty central hallway lights dim, a tall pale-faced woman wrapped in a "
                  "dark grey shawl with long dark hair down past her shoulders steps slowly out "
                  "of the shadow at the far end of the corridor, her dark silhouette clearly "
                  "framed against the off-white walls, she stops and looks toward the camera, "
                  "tense atmospheric PG horror reveal, no gore",
    },
    {
        "output": "monster_attack_pale_woman.mp4",
        "group": "monster_attack",
        "poster": "images/hallway.jpg",
        "start": "images/hallway.jpg",
        "seed": 512,
        "prompt": "central hallway point of view, a pale-faced woman in a long dark dress with "
                  "loose long dark hair rushes directly toward the camera at running pace, her "
                  "dark figure clearly silhouetted against the lit hallway, hair flowing behind "
                  "her, fast PG jump scare impact, no blood, no gore",
    },
    {
        "output": "ending_window.mp4",
        "group": "ending_video",
        "poster": "images/bedroom.jpg",
        "start": "images/bedroom.jpg",
        "seed": 601,
        "prompt": "inside a plain bedroom, the lace curtain shifts and the silhouette of a "
                  "pale-faced woman wearing a long dark dress with long dark hair gradually "
                  "becomes visible standing motionless outside the bedroom window, she presses "
                  "her dark hand and pale face against the glass, slow oppressive PG horror "
                  "reveal, no blood, no gore",
    },
    # ── lost_child ─────────────────────────────────────────────────────────
    {
        "output": "monster_release_lost_child.mp4",
        "group": "monster_release",
        "poster": "images/hallway.jpg",
        "start": "images/hallway.jpg",
        "seed": 521,
        "prompt": "the empty central hallway lights flicker, a small child of about eight in a "
                  "dirty dark navy coat and dark hood with dark hair partly covering the face "
                  "steps slowly out of the shadow at the far end of the corridor, the small "
                  "dark silhouette clearly framed against the lit off-white walls, the child "
                  "stops and tilts its head toward the camera, tense atmospheric PG horror reveal, no gore",
    },
    {
        "output": "monster_attack_lost_child.mp4",
        "group": "monster_attack",
        "poster": "images/hallway.jpg",
        "start": "images/hallway.jpg",
        "seed": 522,
        "prompt": "central hallway point of view, a small dark-coated child runs directly toward "
                  "the camera with arms outstretched, dark hood pulled back, dark hair flying, "
                  "the small figure clearly silhouetted against the lit hallway, fast PG jump "
                  "scare impact, no blood, no gore",
    },
    # ── previous_tenant ───────────────────────────────────────────────────
    {
        "output": "monster_release_previous_tenant.mp4",
        "group": "monster_release",
        "poster": "images/hallway.jpg",
        "start": "images/hallway.jpg",
        "seed": 531,
        "prompt": "the empty central hallway dims, a gaunt elderly man in a dark brown wool "
                  "suit and dark waistcoat with neatly combed dark grey hair and hollow shadowed "
                  "eyes steps slowly out from a doorway at the far end of the corridor, his "
                  "dark figure clearly silhouetted against the lit off-white walls, he stops "
                  "and stares directly toward the camera, slow oppressive PG horror reveal, no gore",
    },
    {
        "output": "monster_attack_previous_tenant.mp4",
        "group": "monster_attack",
        "poster": "images/hallway.jpg",
        "start": "images/hallway.jpg",
        "seed": 532,
        "prompt": "central hallway point of view, a gaunt elderly man in a dark brown suit "
                  "strides quickly toward the camera with one bony hand raised, his hollow "
                  "shadowed eyes wide, the dark figure clearly silhouetted against the lit "
                  "off-white walls, fast PG jump scare impact, no blood, no gore",
    },
    # ── white_shadow ──────────────────────────────────────────────────────
    # NOTE: white_shadow needs a high-contrast READING despite the name. We
    # use a tall jet-black silhouette so it stays clearly framed against the
    # off-white walls and never collapses into the tessellation attractor.
    # The "white" of the name refers to the LIT-WALL backdrop, not the figure.
    {
        "output": "monster_release_white_shadow.mp4",
        "group": "monster_release",
        "poster": "images/hallway.jpg",
        "start": "images/hallway.jpg",
        "seed": 541,
        "prompt": "the empty central hallway lights flare bright, a tall featureless jet-black "
                  "humanoid silhouette like a perfect ink-cut shape steps slowly out of the "
                  "shadow at the far end of the corridor, the very dark figure is razor-sharp "
                  "against the brightly lit off-white walls, it pauses motionless facing the "
                  "camera, slow oppressive PG horror reveal, no detail on the figure, no face, no gore",
    },
    {
        "output": "monster_attack_white_shadow.mp4",
        "group": "monster_attack",
        "poster": "images/hallway.jpg",
        "start": "images/hallway.jpg",
        "seed": 542,
        "prompt": "central hallway point of view, a tall featureless jet-black humanoid "
                  "silhouette glides quickly toward the camera, the very dark figure is "
                  "razor-sharp against the brightly lit off-white walls, no facial detail, "
                  "fast PG jump scare impact, no blood, no gore",
    },
    # ── silent_companion ──────────────────────────────────────────────────
    {
        "output": "monster_release_silent_companion.mp4",
        "group": "monster_release",
        "poster": "images/hallway.jpg",
        "start": "images/hallway.jpg",
        "seed": 551,
        "prompt": "the empty central hallway is still, a slim figure in a charcoal-grey dressing "
                  "gown with long dark hair gradually rises into frame as if from sitting on the "
                  "hallway floor at the far end, dark silhouette clearly framed against the "
                  "lit off-white walls, the figure quietly turns its head toward the camera "
                  "without moving its feet, slow oppressive PG horror reveal, no gore",
    },
    {
        "output": "monster_attack_silent_companion.mp4",
        "group": "monster_attack",
        "poster": "images/hallway.jpg",
        "start": "images/hallway.jpg",
        "seed": 552,
        "prompt": "central hallway point of view, a slim figure in a charcoal-grey dressing "
                  "gown with long dark hair walks deliberately toward the camera without "
                  "making a sound, dark silhouette clearly against the lit off-white walls, "
                  "their hand rises slowly toward the lens, tense PG jump scare impact, "
                  "no blood, no gore",
    },
    # ── hollow_one ────────────────────────────────────────────────────────
    {
        "output": "monster_release_hollow_one.mp4",
        "group": "monster_release",
        "poster": "images/hallway.jpg",
        "start": "images/hallway.jpg",
        "seed": 561,
        "prompt": "the empty central hallway lights dim, a tall figure in a long dark heavy "
                  "coat steps slowly out of the shadow at the far end of the corridor with a "
                  "deep dark hood pulled up so the face is completely hidden in shadow, dark "
                  "silhouette clearly framed against the lit off-white walls, the figure "
                  "stops and faces the camera, slow oppressive PG horror reveal, hood obscures "
                  "all facial features, no gore",
    },
    {
        "output": "monster_attack_hollow_one.mp4",
        "group": "monster_attack",
        "poster": "images/hallway.jpg",
        "start": "images/hallway.jpg",
        "seed": 562,
        "prompt": "central hallway point of view, a tall hooded figure in a long dark coat "
                  "with a deep dark hood hiding the face rushes directly toward the camera, "
                  "dark silhouette clearly against the lit off-white walls, hood and coat "
                  "billowing, fast PG jump scare impact, hood obscures all facial features, "
                  "no blood, no gore",
    },
    # ── faceless_doctor ──────────────────────────────────────────────────
    {
        "output": "monster_release_faceless_doctor.mp4",
        "group": "monster_release",
        "poster": "images/hallway.jpg",
        "start": "images/hallway.jpg",
        "seed": 571,
        "prompt": "the empty central hallway lights flicker, a tall slim figure in a long dark "
                  "physician's coat with a brass stethoscope steps slowly out of a doorway at "
                  "the far end, the collar high enough that above the collar is only a smooth "
                  "blank shape with no features, dark silhouette clearly framed against the lit "
                  "off-white walls, slow oppressive PG horror reveal, no face, no gore",
    },
    {
        "output": "monster_attack_faceless_doctor.mp4",
        "group": "monster_attack",
        "poster": "images/hallway.jpg",
        "start": "images/hallway.jpg",
        "seed": 572,
        "prompt": "central hallway point of view, the tall faceless physician in a long dark "
                  "coat strides quickly toward the camera with one gloved hand outstretched, "
                  "above the high collar there is only a smooth blank shape, dark figure "
                  "razor-sharp against the lit off-white walls, fast PG jump scare impact, "
                  "no blood, no gore",
    },
    # ── bone_collector ───────────────────────────────────────────────────
    {
        "output": "monster_release_bone_collector.mp4",
        "group": "monster_release",
        "poster": "images/hallway.jpg",
        "start": "images/hallway.jpg",
        "seed": 581,
        "prompt": "the empty central hallway dims, a stooped figure in a long dark travelling "
                  "coat carrying a heavy worn leather bag steps slowly out of the shadow at the "
                  "far end of the corridor, dark silhouette clearly framed against the lit "
                  "off-white walls, the figure stops and tilts the bag toward the camera as if "
                  "offering it, slow oppressive PG horror reveal, no gore",
    },
    {
        "output": "monster_attack_bone_collector.mp4",
        "group": "monster_attack",
        "poster": "images/hallway.jpg",
        "start": "images/hallway.jpg",
        "seed": 582,
        "prompt": "central hallway point of view, the stooped bone collector in a long dark "
                  "coat lurches directly toward the camera, the heavy leather bag swinging in "
                  "one hand, dark figure clearly silhouetted against the lit off-white walls, "
                  "fast PG jump scare impact, no blood, no gore",
    },
    # ── crawling_thing ───────────────────────────────────────────────────
    {
        "output": "monster_release_crawling_thing.mp4",
        "group": "monster_release",
        "poster": "images/hallway.jpg",
        "start": "images/hallway.jpg",
        "seed": 591,
        "prompt": "the empty central hallway is still, a long dark humanoid shape slowly "
                  "extends along the floor from the shadow at the far end of the corridor, "
                  "crawling low and silently on all fours, the very dark silhouette razor-sharp "
                  "against the lit off-white walls, head lifts toward the camera at the end of "
                  "the motion, slow oppressive PG horror reveal, no blood, no gore",
    },
    {
        "output": "monster_attack_crawling_thing.mp4",
        "group": "monster_attack",
        "poster": "images/hallway.jpg",
        "start": "images/hallway.jpg",
        "seed": 592,
        "prompt": "central hallway point of view, a dark humanoid shape crawls fast directly "
                  "toward the camera along the floor on all fours, the very dark silhouette "
                  "razor-sharp against the lit off-white walls, head lifts at the lens, fast "
                  "PG jump scare impact, no blood, no gore",
    },
    # ── mourning_groom ───────────────────────────────────────────────────
    {
        "output": "monster_release_mourning_groom.mp4",
        "group": "monster_release",
        "poster": "images/hallway.jpg",
        "start": "images/hallway.jpg",
        "seed": 601,
        "prompt": "the empty central hallway dims, a tall man in a formal black wedding suit "
                  "with neatly combed dark hair and a small white boutonniere on his lapel "
                  "steps slowly out of a doorway at the far end of the corridor, dark "
                  "silhouette clearly framed against the lit off-white walls, his hollow eyes "
                  "are fixed on the camera as if expecting someone else, slow oppressive PG "
                  "horror reveal, no gore",
    },
    {
        "output": "monster_attack_mourning_groom.mp4",
        "group": "monster_attack",
        "poster": "images/hallway.jpg",
        "start": "images/hallway.jpg",
        "seed": 602,
        "prompt": "central hallway point of view, the tall mourning groom in a formal black "
                  "wedding suit walks quickly toward the camera with one hand outstretched as "
                  "if asking for a dance, dark figure clearly silhouetted against the lit "
                  "off-white walls, fast PG jump scare impact, no blood, no gore",
    },
    # ── paper_mask ───────────────────────────────────────────────────────
    {
        "output": "monster_release_paper_mask.mp4",
        "group": "monster_release",
        "poster": "images/hallway.jpg",
        "start": "images/hallway.jpg",
        "seed": 611,
        "prompt": "the empty central hallway flickers, a slim figure in a long dark coat steps "
                  "slowly out of the shadow at the far end of the corridor, the face is "
                  "completely covered by a flat folded white sheet of paper held in place, dark "
                  "silhouette clearly framed against the lit off-white walls, the figure stops "
                  "and tilts the paper face toward the camera, slow oppressive PG horror "
                  "reveal, paper covers entire face, no gore",
    },
    {
        "output": "monster_attack_paper_mask.mp4",
        "group": "monster_attack",
        "poster": "images/hallway.jpg",
        "start": "images/hallway.jpg",
        "seed": 612,
        "prompt": "central hallway point of view, the slim figure in a long dark coat with a "
                  "flat folded white paper covering its whole face strides quickly toward the "
                  "camera, paper face held perfectly forward, dark silhouette clearly against "
                  "the lit off-white walls, fast PG jump scare impact, paper covers entire "
                  "face, no blood, no gore",
    },
    # ── red_lady ─────────────────────────────────────────────────────────
    {
        "output": "monster_release_red_lady.mp4",
        "group": "monster_release",
        "poster": "images/hallway.jpg",
        "start": "images/hallway.jpg",
        "seed": 621,
        "prompt": "the empty central hallway dims, a tall woman in a long deep crimson red "
                  "evening dress with dark hair worn up steps slowly out of the shadow at the "
                  "far end of the corridor, the dark red dress is strikingly saturated against "
                  "the lit off-white walls, she stops and turns her head smoothly toward the "
                  "camera, slow oppressive PG horror reveal, no gore",
    },
    {
        "output": "monster_attack_red_lady.mp4",
        "group": "monster_attack",
        "poster": "images/hallway.jpg",
        "start": "images/hallway.jpg",
        "seed": 622,
        "prompt": "central hallway point of view, the tall woman in a long deep crimson red "
                  "evening dress with dark hair worn up walks quickly directly toward the "
                  "camera, the saturated red dress razor-sharp against the lit off-white walls, "
                  "fast PG jump scare impact, no blood, no gore",
    },
]


def log(message):
    line = f"[{time.strftime('%H:%M:%S')}] {message}"
    print(line, flush=True)
    with open(LOG_PATH, "a", encoding="utf-8") as handle:
        handle.write(line + "\n")


def load_metadata():
    try:
        with open(METADATA_PATH, "r", encoding="utf-8") as handle:
            data = json.load(handle)
        return data if isinstance(data, dict) else {}
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def save_metadata(data):
    with open(METADATA_PATH, "w", encoding="utf-8") as handle:
        json.dump(data, handle, indent=2, sort_keys=True)


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


def submit(item):
    payload = {
        "prompt": f"{item['prompt']}, {COMMON}",
        "width": GAME_PORTRAIT_WIDTH,
        "height": GAME_PORTRAIT_HEIGHT,
        "num_frames": 73,
        "fps": 24,
        "seed": item["seed"],
        "num_inference_steps": 20,
        "cfg_scale": 3.0,
        "negative_prompt": NEGATIVE,
        "image": os.path.join(HERE, item["start"]),
        "image_strength": 1.0,
        "tiling": "aggressive",
        "no_audio": True,
    }
    if item.get("end"):
        payload["image_end"] = os.path.join(HERE, item["end"])
    return post_json("/api/generate", payload)["job_id"]


def wait_for_job(job_id, output):
    last_event = ""
    while True:
        job = get_json(f"/api/jobs/{job_id}")
        status = job.get("status")
        event = job.get("running_last_event") or job.get("last_event") or {}
        event_name = event.get("event") or ""
        if event_name and event_name != last_event:
            last_event = event_name
            log(f"{output} {job_id} {status} {event_name}")
        if status == "done":
            return job
        if status in {"failed", "cancelled"}:
            raise RuntimeError(f"{output} {job_id} ended with {status}")
        time.sleep(6)


def update_metadata(item, job, bytes_written):
    metadata = load_metadata()
    metadata[item["output"]] = {
        "group": item["group"],
        "poster": item["poster"],
        "promptText": item["prompt"],
        "status": f"Generated event batch {time.strftime('%Y-%m-%d %H:%M:%S')}. Needs review.",
        "ltxJobId": job.get("id"),
        "bytes": bytes_written,
        "duration_secs": job.get("duration_secs"),
    }
    save_metadata(metadata)


def main():
    os.makedirs(VIDEO_DIR, exist_ok=True)
    with open(LOG_PATH, "w", encoding="utf-8") as handle:
        handle.write("")
    args = set(sys.argv[1:])
    force = "--force" in args
    wanted = args - {"--force"}
    todo = []
    for item in EVENTS:
        stem = os.path.splitext(item["output"])[0]
        target = os.path.join(VIDEO_DIR, item["output"])
        if wanted and stem not in wanted and item["output"] not in wanted and item["group"] not in wanted:
            continue
        if os.path.exists(target) and not force:
            log(f"skip {item['output']} already exists")
            continue
        todo.append(item)
    queued = []
    for item in todo:
        log(f"queue {item['output']}")
        queued.append((item, submit(item)))
        log(f"job {queued[-1][1]} {item['output']}")
    for item, job_id in queued:
        target = os.path.join(VIDEO_DIR, item["output"])
        job = wait_for_job(job_id, item["output"])
        job["id"] = job_id
        download(f"/api/jobs/{job_id}/file", target)
        bytes_written = os.path.getsize(target)
        update_metadata(item, job, bytes_written)
        log(f"ok {item['output']} {bytes_written} bytes {job.get('duration_secs')}s")
    log(f"done {len(queued)} generated")


if __name__ == "__main__":
    main()
