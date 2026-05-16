#!/usr/bin/env python3
"""Local-only video regeneration helper for hub-spoke video games.

Run from the project folder with:
    python3 regen_helper.py

Reads `regen_config.json` from the same directory for project-specific data
(transitions, COMMON/NEGATIVE prompt boilerplate, extra-video prefixes). The
script itself is identical between projects — copy it verbatim alongside a
fresh regen_config.json and it works.

The static game then calls http://127.0.0.1:8788/api/regen to queue
replacement LTX renders that write back into ./videos.
"""

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import mimetypes
import os
import queue
import shutil
import subprocess
import threading
import time
import urllib.parse
import urllib.request

API = "http://localhost:7866"
HOST = "127.0.0.1"
PORT = 8788
HERE = os.path.dirname(os.path.abspath(__file__))
VIDEO_DIR = os.path.join(HERE, "videos")
METADATA_PATH = os.path.join(HERE, ".debug_transition_metadata.json")
CONFIG_PATH = os.path.join(HERE, "regen_config.json")
GAME_PORTRAIT_WIDTH = 384
GAME_PORTRAIT_HEIGHT = 640


def _load_config():
    if not os.path.exists(CONFIG_PATH):
        raise SystemExit(
            f"regen_helper.py: missing {CONFIG_PATH}.\n"
            "Create one alongside this script. See ~/cc/yru/site/gms/2d/awake/regen_config.json for the schema."
        )
    with open(CONFIG_PATH, "r", encoding="utf-8") as handle:
        return json.load(handle)


CONFIG = _load_config()
COMMON = CONFIG["common"]
NEGATIVE = CONFIG["negative"]
TRANSITIONS = CONFIG["transitions"]
EXTRA_ROWS = CONFIG.get("extras", [])
EXTRA_VIDEO_PREFIXES = CONFIG.get("extra_prefixes", {})

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


def video_row_src(file_name):
    path = os.path.join(VIDEO_DIR, file_name)
    url_file = urllib.parse.quote(file_name)
    if not os.path.exists(path):
        return f"http://{HOST}:{PORT}/videos/{url_file}"
    stat = os.stat(path)
    return f"http://{HOST}:{PORT}/videos/{url_file}?v={int(stat.st_mtime)}-{stat.st_size}"


def video_file_info(file_name):
    path = os.path.join(VIDEO_DIR, file_name)
    if not os.path.exists(path):
        return {"bytes": 0, "modified": "", "label": "missing"}
    stat = os.stat(path)
    modified = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(stat.st_mtime))
    size = stat.st_size
    if size >= 1024 * 1024:
        size_label = f"{size / 1024 / 1024:.2f} MB"
    else:
        size_label = f"{size / 1024:.0f} KB"
    return {
        "bytes": size,
        "modified": modified,
        "label": f"{size_label} | {modified}",
    }


def running_file_name():
    if not RUNNING:
        return None
    return RUNNING.get("targetFile") or RUNNING.get("file")


def reverse_target_for(file_name):
    if file_name.endswith("_to_hallway.mp4"):
        room = file_name.removesuffix("_to_hallway.mp4")
        target = f"hallway_to_{room}.mp4"
    elif file_name.startswith("hallway_to_") and file_name.endswith(".mp4"):
        room = file_name.removeprefix("hallway_to_").removesuffix(".mp4")
        target = f"{room}_to_hallway.mp4"
    else:
        return None
    return target if target in TRANSITIONS else None


def extra_video_defaults(file_name):
    for prefix, defaults in EXTRA_VIDEO_PREFIXES.items():
        if file_name.startswith(prefix):
            return defaults
    return None


def list_transitions():
    rows = []
    metadata = load_metadata()
    processing_file = running_file_name()
    explicit_files = set(TRANSITIONS.keys())
    for file_name, transition in TRANSITIONS.items():
        meta = metadata.get(file_name, {})
        is_processing = file_name == processing_file
        status = meta.get("status") or transition.get("status", "Local helper managed transition.")
        if is_processing:
            status = "Processing replacement video. Current preview is the previous file until generation finishes."
        rows.append({
            "id": transition["id"],
            "group": "room_transitions",
            "label": transition["label"],
            "file": file_name,
            "src": video_row_src(file_name),
            "poster": transition["start"],
            "startImage": transition["start"],
            "endImage": transition["end"],
            "promptText": meta.get("promptText") or transition["promptText"],
            "status": status,
            "canRedo": True,
            "canReverse": reverse_target_for(file_name) is not None,
            "reverseTarget": reverse_target_for(file_name),
            "processing": is_processing,
            "fileInfo": video_file_info(file_name),
            "exists": os.path.exists(os.path.join(VIDEO_DIR, file_name)),
        })
    for extra in EXTRA_ROWS:
        file_name = extra["file"]
        explicit_files.add(file_name)
        rows.append({
            "id": extra.get("id", file_name.replace(".mp4", "")),
            "group": extra.get("group", "possible_other_transition"),
            "label": extra.get("label", file_name.replace(".mp4", "")),
            "file": file_name,
            "src": video_row_src(file_name),
            "poster": extra.get("poster", "images/hallway.jpg"),
            "status": extra.get("status", "Local helper managed extra clip."),
            "canRedo": False,
            "canReverse": False,
            "reverseTarget": None,
            "processing": file_name == processing_file,
            "fileInfo": video_file_info(file_name),
            "exists": os.path.exists(os.path.join(VIDEO_DIR, file_name)),
        })
    for file_name in sorted(os.listdir(VIDEO_DIR)):
        if not file_name.endswith(".mp4"):
            continue
        if file_name in explicit_files:
            continue
        defaults = extra_video_defaults(file_name)
        if not defaults:
            continue
        meta = metadata.get(file_name, {})
        rows.append({
            "id": file_name.replace(".mp4", ""),
            "group": meta.get("group", defaults["group"]),
            "label": file_name.replace(".mp4", ""),
            "file": file_name,
            "src": video_row_src(file_name),
            "poster": meta.get("poster", defaults.get("default_poster", "images/hallway.jpg")),
            "status": meta.get("status", defaults["status"]),
            "canRedo": False,
            "canReverse": False,
            "reverseTarget": None,
            "processing": file_name == processing_file,
            "fileInfo": video_file_info(file_name),
            "exists": True,
        })
    return rows


def submit_ltx(transition, prompt_text):
    payload = {
        "prompt": f"{prompt_text}, {COMMON}",
        "width": GAME_PORTRAIT_WIDTH,
        "height": GAME_PORTRAIT_HEIGHT,
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
    if local_job.get("task") == "reverse":
        process_reverse(local_job)
    else:
        process_regen(local_job)


def move_existing_target(target_file, target_path, prefix, moved_status, poster):
    if not os.path.exists(target_path):
        return None, load_metadata()
    stamp = time.strftime("%Y%m%d_%H%M%S")
    moved_name = f"{prefix}_{os.path.splitext(target_file)[0]}_{stamp}.mp4"
    moved = os.path.join(VIDEO_DIR, moved_name)
    shutil.move(target_path, moved)
    metadata = load_metadata()
    metadata[moved_name] = {
        "group": "other_transition" if prefix == "other" else "possible_other_transition",
        "poster": poster,
        "status": moved_status or ("Moved to other for later review." if prefix == "other" else "Moved to possible for later review."),
    }
    return moved_name, metadata


def process_regen(local_job):
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

    metadata = load_metadata()
    completed_stamp = time.strftime("%Y-%m-%d %H:%M:%S")
    moved_name = None
    if mode in {"move", "other"} and os.path.exists(target):
        prefix = "other" if mode == "other" else "possible"
        moved_name, metadata = move_existing_target(file_name, target, prefix, moved_status, transition["start"])
        local_job["moved_to"] = moved_name
    elif mode == "delete" and os.path.exists(target):
        os.remove(target)
    shutil.move(temp, target)
    transition["promptText"] = prompt_text
    local_job["bytes"] = os.path.getsize(target)
    local_job["duration_secs"] = ltx_job.get("duration_secs")
    action = "Replaced old clip after delete"
    if moved_name:
        action = f"Replaced target; previous clip moved to {moved_name}"
    metadata[file_name] = {
        "group": "room_transitions",
        "poster": transition["start"],
        "promptText": prompt_text,
        "status": f"{action}. Local regen completed {completed_stamp}.",
        "ltxJobId": ltx_id,
        "bytes": local_job["bytes"],
        "duration_secs": ltx_job.get("duration_secs"),
    }
    save_metadata(metadata)
    local_job["status"] = "done"


def process_reverse(local_job):
    source_file = local_job["file"]
    target_file = local_job["targetFile"]
    mode = local_job["mode"]
    moved_status = local_job.get("movedStatus", "").strip()
    source = os.path.join(VIDEO_DIR, source_file)
    target = os.path.join(VIDEO_DIR, target_file)
    temp = os.path.join(VIDEO_DIR, f".reverse_{target_file}")
    transition = TRANSITIONS[target_file]

    if not os.path.exists(source):
        raise RuntimeError(f"source video missing: {source_file}")

    local_job["status"] = "reversing"
    result = subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", source, "-vf", "reverse", "-an", "-movflags", "+faststart", temp],
        cwd=HERE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or f"ffmpeg exited with {result.returncode}")

    metadata = load_metadata()
    moved_name = None
    if mode in {"move", "other"} and os.path.exists(target):
        prefix = "other" if mode == "other" else "possible"
        moved_name, metadata = move_existing_target(target_file, target, prefix, moved_status, transition["start"])
        local_job["moved_to"] = moved_name
    elif mode == "delete" and os.path.exists(target):
        os.remove(target)
    shutil.move(temp, target)

    local_job["bytes"] = os.path.getsize(target)
    completed_stamp = time.strftime("%Y-%m-%d %H:%M:%S")
    action = f"Replaced with reversed {source_file}"
    if moved_name:
        action += f"; previous clip moved to {moved_name}"
    metadata[target_file] = {
        "group": "room_transitions",
        "poster": transition["start"],
        "promptText": transition["promptText"],
        "status": f"{action}. Local reverse completed {completed_stamp}.",
        "sourceFile": source_file,
        "bytes": local_job["bytes"],
    }
    save_metadata(metadata)
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
            for prefix, file_key in ((".regen_", "file"), (".reverse_", "targetFile")):
                temp = os.path.join(VIDEO_DIR, f"{prefix}{job.get(file_key, '')}")
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

    def do_HEAD(self):
        if self.path.startswith("/videos/"):
            self.send_video(head_only=True)
            return
        self.send_response(404)
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
        if self.path.startswith("/videos/"):
            self.send_video()
            return
        self.send_json({"ok": False, "error": "not found"}, 404)

    def send_video(self, head_only=False):
        parsed = urllib.parse.urlparse(self.path)
        file_name = os.path.basename(urllib.parse.unquote(parsed.path))
        if not file_name.endswith(".mp4"):
            self.send_json({"ok": False, "error": "not found"}, 404)
            return
        path = os.path.join(VIDEO_DIR, file_name)
        if not os.path.exists(path):
            self.send_json({"ok": False, "error": "not found"}, 404)
            return
        stat = os.stat(path)
        content_type = mimetypes.guess_type(path)[0] or "video/mp4"
        start = 0
        end = stat.st_size - 1
        status = 200
        range_header = self.headers.get("Range", "")
        if range_header.startswith("bytes="):
            first, _, last = range_header[6:].partition("-")
            try:
                start = int(first) if first else 0
                end = int(last) if last else stat.st_size - 1
                start = max(0, min(start, stat.st_size - 1))
                end = max(start, min(end, stat.st_size - 1))
                status = 206
            except ValueError:
                start = 0
                end = stat.st_size - 1
        content_length = end - start + 1
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(content_length))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Accept-Ranges", "bytes")
        if status == 206:
            self.send_header("Content-Range", f"bytes {start}-{end}/{stat.st_size}")
        self.send_header("Last-Modified", self.date_time_string(stat.st_mtime))
        self.end_headers()
        if head_only:
            return
        with open(path, "rb") as handle:
            handle.seek(start)
            remaining = content_length
            while remaining > 0:
                chunk = handle.read(min(1024 * 256, remaining))
                if not chunk:
                    break
                self.wfile.write(chunk)
                remaining -= len(chunk)

    def do_POST(self):
        if self.path not in {"/api/regen", "/api/reverse"}:
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
        is_reverse = self.path == "/api/reverse"
        target_file = reverse_target_for(file_name) if is_reverse else None
        if is_reverse:
            if not target_file:
                self.send_json({"ok": False, "error": "transition has no reverse target"}, 400)
                return
        else:
            if not prompt_text.strip():
                self.send_json({"ok": False, "error": "promptText is required"}, 400)
                return
        job = {
            "id": f"regen-{int(time.time() * 1000)}",
            "task": "reverse" if is_reverse else "regen",
            "file": file_name,
            "targetFile": target_file,
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
    print(f"Regen helper listening on http://{HOST}:{PORT} (project dir: {HERE})", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
