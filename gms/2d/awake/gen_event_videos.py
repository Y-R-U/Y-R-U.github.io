#!/usr/bin/env python3
"""Queue Awake event and review videos through the local LTX API.

Threat events and victory clips are loaded from js/story.js. Existing
MP4s are skipped unless --force is passed. Victory/escape clips render
at about 6 seconds; threat events stay at the 3 second review length.

The local LTX server has a warm queue: submit all selected jobs first,
then poll/download them one at a time. The server still runs one render
at a time, but this avoids idle unload gaps between clips.
"""

import json
import os
import subprocess
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
    "realistic cinematic sci-fi horror game footage, vertical mobile portrait shot, "
    "professional atmospheric lighting, preserve the central hallway architecture, "
    "no readable text, no logos, no watermark, no gore, no blood, no body horror"
)

NEGATIVE = (
    "readable text, logo, watermark, subtitles, gore, blood, dismemberment, corpse, "
    "cartoon, anime, painting, melting architecture, duplicated doors, distorted camera"
)

VICTORY_PROMPTS = {
    "ending_victory_transport_tube.mp4": "central hallway transforms into a bright emergency transport tube, doors open, white-blue light pulls the camera forward into escape, hopeful sci-fi victory ending",
    "ending_victory_shuttle_launch.mp4": "central hallway opens to a small escape shuttle bay, the camera rushes into the launch light as the shuttle departs the station, hopeful sci-fi victory ending",
    "ending_victory_escape_pod_drift.mp4": "central hallway opens into a compact escape pod, the pod seals, launches into deep space, then drifts away from the damaged facility, hopeful sci-fi victory ending",
    "ending_victory_surface_dawn.mp4": "central hallway becomes a transport airlock, the camera exits into a quiet planetary dawn under a thin atmosphere, hopeful sci-fi victory ending",
}

THREAT_VISUALS = {
    "gene": "a tall bio-engineered humanoid hunter with pale synthetic armor plates and long predatory limbs",
    "alien": "a sleek black-grey alien infiltrator with reflective eyes and a narrow insectile silhouette",
    "zombie": "a reanimated crew member in a torn space uniform, helmet cracked, movements stiff and unnatural",
    "machine": "an autonomous maintenance rig with jointed repair arms, sensor lenses, and sparking tool claws",
    "parasite": "black root-like alien vines spreading across the floor and walls like a living cable mass",
    "shadow": "an empty pressure suit walking by itself, helmet dark, limbs hanging slightly wrong",
    "mimic": "a false rescue worker in a clean emergency suit with a visor-glare face and unnaturally smooth posture",
    "swarm": "a dense grey nanite cloud forming a rough human outline above the hallway floor",
    "frost": "a translucent frost-covered figure forming from rolling cryogenic vapor and ice crystals",
    "radiant": "a glowing radiation silhouette in a damaged hazard suit, edges flaring with hot white light",
    "mirror": "a duplicate astronaut with a reflective visor and mismatched body language, copying the viewer badly",
    "siren": "a humanoid emergency alarm host with flashing red beacon lights embedded in its suit and shoulders",
    "warden": "a bulky containment security android with lockdown plating, clamp arms, and a cold visor slit",
    "spore": "a breathing spore mass of pale fungal bulbs and drifting dust motes gathering into a hunched shape",
}


def load_story():
    script = (
        "global.window={};"
        "require('./js/story.js');"
        "const s=window.CodexHorrorStory;"
        "console.log(JSON.stringify({threats:s.threats,eventVideos:s.eventVideos}));"
    )
    raw = subprocess.check_output(["node", "-e", script], cwd=HERE, text=True)
    return json.loads(raw)


def threat_release_prompt(threat):
    visual = THREAT_VISUALS.get(threat["id"], f"the {threat['name']}")
    return (
        f"the empty central hallway flickers and reveals {visual} at the far end, "
        f"it turns toward the camera, tense PG sci-fi horror reveal, {threat.get('clue', '')}"
    )


def threat_attack_prompt(threat):
    visual = THREAT_VISUALS.get(threat["id"], f"the {threat['name']}")
    return (
        f"central hallway point of view, {visual} suddenly rushes directly toward the camera, "
        "fast PG jump scare impact, no blood, no gore"
    )


def load_events():
    story = load_story()
    by_id = {threat["id"]: threat for threat in story["threats"]}
    events = []
    seed = 1200
    for group_key, group_name, prompt_fn in [
        ("release", "monster_release", threat_release_prompt),
        ("attack", "monster_attack", threat_attack_prompt),
    ]:
        for threat_id, src in story["eventVideos"].get(group_key, {}).items():
            if threat_id == "default" or threat_id not in by_id:
                continue
            seed += 1
            output = src.split("/")[-1]
            events.append({
                "output": output,
                "group": group_name,
                "poster": "images/hallway.jpg",
                "start": "images/hallway.jpg",
                "seed": seed,
                "num_frames": 73,
                "prompt": prompt_fn(by_id[threat_id]),
            })
    for src in story["eventVideos"].get("victory", []):
        seed += 1
        output = src.split("/")[-1]
        events.append({
            "output": output,
            "group": "ending_video",
            "poster": "images/hallway.jpg",
            "start": "images/hallway.jpg",
            "seed": seed,
            "num_frames": 145,
            "prompt": VICTORY_PROMPTS.get(output, "central hallway opens into a clean emergency escape route, the camera moves forward into safe light, hopeful sci-fi victory ending"),
        })
    return events


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
        "num_frames": item.get("num_frames", 73),
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
            return job
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
    for item in load_events():
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
        try:
            job_id = submit(item)
        except Exception as exc:
            log(f"submit failed {item['output']} {exc}")
            continue
        queued.append((item, job_id))
        log(f"job {job_id} {item['output']}")
    for item, job_id in queued:
        target = os.path.join(VIDEO_DIR, item["output"])
        job = wait_for_job(job_id, item["output"])
        if job.get("status") != "done":
            log(f"failed {item['output']} {job_id} status={job.get('status')} events={job.get('events', [])[-1:]}")
            continue
        job["id"] = job_id
        download(f"/api/jobs/{job_id}/file", target)
        bytes_written = os.path.getsize(target)
        update_metadata(item, job, bytes_written)
        log(f"ok {item['output']} {bytes_written} bytes {job.get('duration_secs')}s")
    log(f"done {len(queued)} generated")


if __name__ == "__main__":
    main()
