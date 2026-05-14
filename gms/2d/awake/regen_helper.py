#!/usr/bin/env python3
"""Local-only Awake transition regeneration helper.

Run from this folder with:
    python3 regen_helper.py

The static game can then call http://127.0.0.1:8788/api/regen to queue
replacement LTX renders that write back into ./videos.
"""

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
import queue
import shutil
import threading
import time
import urllib.request

API = "http://localhost:7866"
HOST = "127.0.0.1"
PORT = 8788
HERE = os.path.dirname(os.path.abspath(__file__))
VIDEO_DIR = os.path.join(HERE, "videos")
METADATA_PATH = os.path.join(HERE, ".debug_transition_metadata.json")

COMMON = (
    "realistic cinematic sci-fi horror game transition, vertical mobile portrait shot, "
    "smooth forward camera movement through a sealed doorway, preserve exact architecture, "
    "empty environment, no people, no readable text, no logos, no watermark, no collapse, "
    "no melting, no creature, no body, professional atmospheric game footage"
)

NEGATIVE = (
    "person, face, body, creature, readable text, logo, watermark, cartoon, painting, "
    "melting architecture, collapsing room, explosion, gore, extra doors, duplicated hallway"
)

TRANSITIONS = {
    "cryo_room_to_hallway.mp4": {
        "id": "cryo_room_to_hallway",
        "label": "cryo_room to hallway",
        "start": "images/cryo_room.jpg",
        "end": "images/hallway.jpg",
        "seed": 84,
        "promptText": "camera leaves a cracked cryogenic room, passes through the only exit door, and ends in the central hallway",
        "status": "New 3.04s intended transition. Needs review.",
    },
    "hallway_to_cryo_room.mp4": {
        "id": "hallway_to_cryo_room",
        "label": "hallway to cryo_room",
        "start": "images/hallway.jpg",
        "end": "images/cryo_room.jpg",
        "seed": 86,
        "promptText": "camera moves from the central hallway through a sealed cryogenic door and ends inside the cracked cryo_room",
        "status": "Approved candidate for hallway-to-room transition.",
    },
    "med_bay_to_hallway.mp4": {
        "id": "med_bay_to_hallway",
        "label": "med_bay to hallway",
        "start": "images/med_bay.jpg",
        "end": "images/hallway.jpg",
        "seed": 91,
        "promptText": "camera leaves an abandoned futuristic med bay, passes through the only exit door, and ends in the central hallway",
        "status": "New 3.04s intended transition. Needs review.",
    },
    "hallway_to_med_bay.mp4": {
        "id": "hallway_to_med_bay",
        "label": "hallway to med_bay",
        "start": "images/hallway.jpg",
        "end": "images/med_bay.jpg",
        "seed": 92,
        "promptText": "camera moves from the central hallway through a sealed medical door and ends inside the abandoned med bay",
        "status": "New 3.04s intended transition. Needs review.",
    },
    "hydroponic_biome_to_hallway.mp4": {
        "id": "hydroponic_biome_to_hallway",
        "label": "hydroponic_biome to hallway",
        "start": "images/hydroponic_biome.jpg",
        "end": "images/hallway.jpg",
        "seed": 101,
        "promptText": "camera leaves an overgrown hydroponic biome chamber, passes through the airlock door, and ends in the central hallway",
        "status": "New 3.04s intended transition. Needs review.",
    },
    "hallway_to_hydroponic_biome.mp4": {
        "id": "hallway_to_hydroponic_biome",
        "label": "hallway to hydroponic_biome",
        "start": "images/hallway.jpg",
        "end": "images/hydroponic_biome.jpg",
        "seed": 102,
        "promptText": "camera moves from the central hallway through a fogged airlock and ends inside the overgrown hydroponic biome",
        "status": "New 3.04s intended transition. Needs review.",
    },
    "reactor_gallery_to_hallway.mp4": {
        "id": "reactor_gallery_to_hallway",
        "label": "reactor_gallery to hallway",
        "start": "images/reactor_gallery.jpg",
        "end": "images/hallway.jpg",
        "seed": 111,
        "promptText": "camera leaves a narrow reactor gallery, passes through the reinforced exit door, and ends in the central hallway",
        "status": "New 3.04s intended transition. Needs review.",
    },
    "hallway_to_reactor_gallery.mp4": {
        "id": "hallway_to_reactor_gallery",
        "label": "hallway to reactor_gallery",
        "start": "images/hallway.jpg",
        "end": "images/reactor_gallery.jpg",
        "seed": 112,
        "promptText": "camera moves from the central hallway through a reinforced service door and ends inside the glowing reactor gallery",
        "status": "New 3.04s intended transition. Needs review.",
    },
}

TASKS = queue.Queue()
JOBS = []
RUNNING = None
LOCK = threading.Lock()


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


def queue_snapshot():
    with LOCK:
        return {
            "running": RUNNING,
            "jobs": JOBS[-20:],
            "queue_depth": TASKS.qsize(),
            "transitions": list_transitions(),
        }


def list_transitions():
    rows = []
    metadata = load_metadata()
    for file_name, transition in TRANSITIONS.items():
        rows.append({
            "id": transition["id"],
            "group": "room_transitions",
            "label": transition["label"],
            "file": file_name,
            "src": f"videos/{file_name}",
            "poster": transition["start"],
            "startImage": transition["start"],
            "endImage": transition["end"],
            "promptText": transition["promptText"],
            "status": transition.get("status", "Local helper managed transition."),
            "canRedo": True,
            "exists": os.path.exists(os.path.join(VIDEO_DIR, file_name)),
        })
    rows.append({
        "id": "cryo_room_event_collapse",
        "group": "possible_other_transition",
        "label": "cryo_room collapse event",
        "file": "cryo_room_event_collapse.mp4",
        "src": "videos/cryo_room_event_collapse.mp4",
        "poster": "images/cryo_room.jpg",
        "status": "Candidate bad ending or room-event clip.",
        "canRedo": False,
        "exists": os.path.exists(os.path.join(VIDEO_DIR, "cryo_room_event_collapse.mp4")),
    })
    for file_name in sorted(os.listdir(VIDEO_DIR)):
        if not file_name.endswith(".mp4"):
            continue
        if file_name.startswith("possible_"):
            default_group = "possible_other_transition"
            default_status = "Moved to possible by local regen helper."
        elif file_name.startswith("other_"):
            default_group = "other_transition"
            default_status = "Moved to other by local regen helper."
        else:
            continue
        meta = metadata.get(file_name, {})
        rows.append({
            "id": file_name.replace(".mp4", ""),
            "group": meta.get("group", default_group),
            "label": file_name.replace(".mp4", ""),
            "file": file_name,
            "src": f"videos/{file_name}",
            "poster": meta.get("poster", "images/hallway.jpg"),
            "status": meta.get("status", default_status),
            "canRedo": False,
            "exists": True,
        })
    return rows


def submit_ltx(transition, prompt_text):
    payload = {
        "prompt": f"{prompt_text}, {COMMON}",
        "width": 384,
        "height": 640,
        "num_frames": 73,
        "fps": 24,
        "seed": int(time.time()) % 100000,
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


def wait_for_ltx(job_id, local_job):
    while True:
        job = get_json(f"/api/jobs/{job_id}")
        with LOCK:
            local_job["ltx_status"] = job.get("status")
            local_job["ltx_event"] = job.get("running_last_event") or job.get("last_event")
        if job.get("status") == "done":
            return job
        if job.get("status") in {"failed", "cancelled"}:
            raise RuntimeError(f"LTX job {job_id} ended with {job.get('status')}")
        time.sleep(4)


def process_one(local_job):
    file_name = local_job["file"]
    mode = local_job["mode"]
    prompt_text = local_job["promptText"].strip()
    moved_status = local_job.get("movedStatus", "").strip()
    transition = TRANSITIONS[file_name]
    target = os.path.join(VIDEO_DIR, file_name)
    temp = os.path.join(VIDEO_DIR, f".regen_{file_name}")

    local_job["status"] = "queued_ltx"
    ltx_id = submit_ltx(transition, prompt_text)
    local_job["ltx_job_id"] = ltx_id
    local_job["status"] = "generating"
    ltx_job = wait_for_ltx(ltx_id, local_job)
    local_job["status"] = "downloading"
    download(f"/api/jobs/{ltx_id}/file", temp)

    if mode in {"move", "other"} and os.path.exists(target):
        stamp = time.strftime("%Y%m%d_%H%M%S")
        prefix = "other" if mode == "other" else "possible"
        moved_name = f"{prefix}_{os.path.splitext(file_name)[0]}_{stamp}.mp4"
        moved = os.path.join(VIDEO_DIR, moved_name)
        shutil.move(target, moved)
        local_job["moved_to"] = moved_name
        metadata = load_metadata()
        metadata[moved_name] = {
            "group": "other_transition" if mode == "other" else "possible_other_transition",
            "poster": transition["start"],
            "status": moved_status or ("Moved to other for later review." if mode == "other" else "Moved to possible for later review."),
        }
        save_metadata(metadata)
    elif mode == "delete" and os.path.exists(target):
        os.remove(target)
    shutil.move(temp, target)
    transition["promptText"] = prompt_text
    local_job["bytes"] = os.path.getsize(target)
    local_job["duration_secs"] = ltx_job.get("duration_secs")
    local_job["status"] = "done"


def worker():
    global RUNNING
    while True:
        job = TASKS.get()
        with LOCK:
            RUNNING = job
        try:
            process_one(job)
        except Exception as err:
            job["status"] = "failed"
            job["error"] = str(err)
            temp = os.path.join(VIDEO_DIR, f".regen_{job['file']}")
            if os.path.exists(temp):
                os.remove(temp)
        with LOCK:
            RUNNING = None
        TASKS.task_done()


class Handler(BaseHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def send_json(self, data, status=200):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/api/status":
            self.send_json({"ok": True, **queue_snapshot()})
            return
        self.send_json({"ok": False, "error": "not found"}, 404)

    def do_POST(self):
        if self.path != "/api/regen":
            self.send_json({"ok": False, "error": "not found"}, 404)
            return
        length = int(self.headers.get("Content-Length", "0"))
        try:
            data = json.loads(self.rfile.read(length).decode("utf-8"))
        except json.JSONDecodeError:
            self.send_json({"ok": False, "error": "invalid json"}, 400)
            return
        file_name = os.path.basename(data.get("file", ""))
        mode = data.get("mode")
        prompt_text = data.get("promptText", "")
        if file_name not in TRANSITIONS:
            self.send_json({"ok": False, "error": "unknown transition"}, 400)
            return
        if mode not in {"delete", "move", "other"}:
            self.send_json({"ok": False, "error": "mode must be delete, move, or other"}, 400)
            return
        if not prompt_text.strip():
            self.send_json({"ok": False, "error": "promptText is required"}, 400)
            return
        job = {
            "id": f"awake-{int(time.time() * 1000)}",
            "file": file_name,
            "mode": mode,
            "promptText": prompt_text,
            "movedStatus": data.get("movedStatus", ""),
            "status": "queued",
            "created_at": time.time(),
        }
        with LOCK:
            JOBS.append(job)
        TASKS.put(job)
        self.send_json({"ok": True, "job": job})

    def log_message(self, fmt, *args):
        print(f"[{time.strftime('%H:%M:%S')}] {fmt % args}", flush=True)


def main():
    os.makedirs(VIDEO_DIR, exist_ok=True)
    threading.Thread(target=worker, daemon=True).start()
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"Awake regen helper listening on http://{HOST}:{PORT}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
