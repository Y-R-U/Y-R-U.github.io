#!/usr/bin/env python3
"""Multi-project local helper for hub-spoke video games.

Run from any project folder (or anywhere — projects are auto-discovered):
    python3 regen_helper.py

Discovers every `regen_config.json` under `~/cc/yru/site/gms/2d/*/` and
exposes each one under its own URL prefix on http://127.0.0.1:8788:

    http://127.0.0.1:8788/                → simple index linking to each game
    http://127.0.0.1:8788/<slug>/         → that game's index.html
    http://127.0.0.1:8788/<slug>/?debug   → opens with the debug panel
    http://127.0.0.1:8788/<slug>/api/...  → that game's regen API
    http://127.0.0.1:8788/<slug>/videos/  → that game's video files

`<slug>` is the basename of the project directory (e.g. `awake`, `the_horrors`).

Each project keeps its own queue, jobs list, and metadata file — they don't
share state. One worker thread per project so a redo in one game doesn't
block the other.

The script itself is identical across project copies — it's a starting
point, not project-specific. Edits go in `regen_config.json` (next to this
script), not here.
"""

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import glob
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

LTX_API = "http://localhost:7866"
HOST = "127.0.0.1"
PORT = 8788
HERE = os.path.dirname(os.path.abspath(__file__))
SEARCH_GLOB = os.path.expanduser("~/cc/yru/site/gms/2d/*/regen_config.json")
GAME_PORTRAIT_WIDTH = 384
GAME_PORTRAIT_HEIGHT = 640


class Project:
    """One game's state — config, queues, metadata, and worker thread."""

    def __init__(self, root):
        self.root = os.path.realpath(root)
        self.slug = os.path.basename(self.root)
        self.video_dir = os.path.join(self.root, "videos")
        self.metadata_path = os.path.join(self.root, ".debug_transition_metadata.json")
        with open(os.path.join(self.root, "regen_config.json"), "r", encoding="utf-8") as handle:
            cfg = json.load(handle)
        self.common = cfg["common"]
        self.negative = cfg["negative"]
        self.transitions = cfg["transitions"]
        self.extras = cfg.get("extras", [])
        self.extra_prefixes = cfg.get("extra_prefixes", {})
        self.tasks = queue.Queue()
        self.jobs = []
        self.running = None
        self.lock = threading.Lock()
        os.makedirs(self.video_dir, exist_ok=True)
        threading.Thread(target=_worker_loop, args=(self,), daemon=True).start()

    # ── per-project helpers ────────────────────────────────────────────
    def load_metadata(self):
        try:
            with open(self.metadata_path, "r", encoding="utf-8") as handle:
                data = json.load(handle)
            return data if isinstance(data, dict) else {}
        except (FileNotFoundError, json.JSONDecodeError):
            return {}

    def save_metadata(self, data):
        with open(self.metadata_path, "w", encoding="utf-8") as handle:
            json.dump(data, handle, indent=2, sort_keys=True)

    def video_row_src(self, file_name):
        path = os.path.join(self.video_dir, file_name)
        url_file = urllib.parse.quote(file_name)
        if not os.path.exists(path):
            return f"http://{HOST}:{PORT}/{self.slug}/videos/{url_file}"
        stat = os.stat(path)
        return f"http://{HOST}:{PORT}/{self.slug}/videos/{url_file}?v={int(stat.st_mtime)}-{stat.st_size}"

    def video_file_info(self, file_name):
        path = os.path.join(self.video_dir, file_name)
        if not os.path.exists(path):
            return {"bytes": 0, "modified": "", "label": "missing"}
        stat = os.stat(path)
        modified = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(stat.st_mtime))
        size = stat.st_size
        if size >= 1024 * 1024:
            size_label = f"{size / 1024 / 1024:.2f} MB"
        else:
            size_label = f"{size / 1024:.0f} KB"
        return {"bytes": size, "modified": modified, "label": f"{size_label} | {modified}"}

    def running_file_name(self):
        if not self.running:
            return None
        return self.running.get("targetFile") or self.running.get("file")

    def reverse_target_for(self, file_name):
        if file_name.endswith("_to_hallway.mp4"):
            room = file_name.removesuffix("_to_hallway.mp4")
            target = f"hallway_to_{room}.mp4"
        elif file_name.startswith("hallway_to_") and file_name.endswith(".mp4"):
            room = file_name.removeprefix("hallway_to_").removesuffix(".mp4")
            target = f"{room}_to_hallway.mp4"
        else:
            return None
        return target if target in self.transitions else None

    def extra_video_defaults(self, file_name):
        for prefix, defaults in self.extra_prefixes.items():
            if file_name.startswith(prefix):
                return defaults
        return None

    def queue_snapshot(self):
        with self.lock:
            return {
                "running": self.running,
                "jobs": self.jobs[-20:],
                "queue_depth": self.tasks.qsize(),
                "transitions": self.list_transitions(),
            }

    def list_transitions(self):
        rows = []
        metadata = self.load_metadata()
        processing_file = self.running_file_name()
        explicit_files = set(self.transitions.keys())
        for file_name, transition in self.transitions.items():
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
                "src": self.video_row_src(file_name),
                "poster": transition["start"],
                "startImage": transition["start"],
                "endImage": transition["end"],
                "promptText": meta.get("promptText") or transition["promptText"],
                "status": status,
                "canRedo": True,
                "canReverse": self.reverse_target_for(file_name) is not None,
                "reverseTarget": self.reverse_target_for(file_name),
                "processing": is_processing,
                "fileInfo": self.video_file_info(file_name),
                "exists": os.path.exists(os.path.join(self.video_dir, file_name)),
            })
        for extra in self.extras:
            file_name = extra["file"]
            explicit_files.add(file_name)
            rows.append({
                "id": extra.get("id", file_name.replace(".mp4", "")),
                "group": extra.get("group", "possible_other_transition"),
                "label": extra.get("label", file_name.replace(".mp4", "")),
                "file": file_name,
                "src": self.video_row_src(file_name),
                "poster": extra.get("poster", "images/hallway.jpg"),
                "status": extra.get("status", "Local helper managed extra clip."),
                "canRedo": False,
                "canReverse": False,
                "reverseTarget": None,
                "processing": file_name == processing_file,
                "fileInfo": self.video_file_info(file_name),
                "exists": os.path.exists(os.path.join(self.video_dir, file_name)),
            })
        for file_name in sorted(os.listdir(self.video_dir)):
            if not file_name.endswith(".mp4"):
                continue
            if file_name in explicit_files:
                continue
            defaults = self.extra_video_defaults(file_name)
            if not defaults:
                continue
            meta = metadata.get(file_name, {})
            rows.append({
                "id": file_name.replace(".mp4", ""),
                "group": meta.get("group", defaults["group"]),
                "label": file_name.replace(".mp4", ""),
                "file": file_name,
                "src": self.video_row_src(file_name),
                "poster": meta.get("poster", defaults.get("default_poster", "images/hallway.jpg")),
                "status": meta.get("status", defaults["status"]),
                "canRedo": False,
                "canReverse": False,
                "reverseTarget": None,
                "processing": file_name == processing_file,
                "fileInfo": self.video_file_info(file_name),
                "exists": True,
            })
        return rows


# ── LTX HTTP helpers (shared across all projects) ──────────────────────
def post_json(path, payload):
    request = urllib.request.Request(
        f"{LTX_API}{path}",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.load(response)


def get_json(path):
    with urllib.request.urlopen(f"{LTX_API}{path}", timeout=60) as response:
        return json.load(response)


def download(path, target):
    with urllib.request.urlopen(f"{LTX_API}{path}", timeout=180) as response:
        data = response.read()
    with open(target, "wb") as handle:
        handle.write(data)


def submit_ltx(project, transition, prompt_text):
    payload = {
        "prompt": f"{prompt_text}, {project.common}",
        "width": GAME_PORTRAIT_WIDTH,
        "height": GAME_PORTRAIT_HEIGHT,
        "num_frames": 73,
        "fps": 24,
        "seed": int(time.time()) % 100000,
        "num_inference_steps": 20,
        "cfg_scale": 3.0,
        "negative_prompt": project.negative,
        "image": os.path.join(project.root, transition["start"]),
        "image_end": os.path.join(project.root, transition["end"]),
        "image_strength": 1.0,
        "tiling": "aggressive",
        "no_audio": True,
    }
    return post_json("/api/generate", payload)["job_id"]


def wait_for_ltx(project, job_id, local_job):
    while True:
        job = get_json(f"/api/jobs/{job_id}")
        with project.lock:
            local_job["ltx_status"] = job.get("status")
            local_job["ltx_event"] = job.get("running_last_event") or job.get("last_event")
        if job.get("status") == "done":
            return job
        if job.get("status") in {"failed", "cancelled"}:
            raise RuntimeError(f"LTX job {job_id} ended with {job.get('status')}")
        time.sleep(4)


def move_existing_target(project, target_file, target_path, prefix, moved_status, poster):
    if not os.path.exists(target_path):
        return None, project.load_metadata()
    stamp = time.strftime("%Y%m%d_%H%M%S")
    moved_name = f"{prefix}_{os.path.splitext(target_file)[0]}_{stamp}.mp4"
    moved = os.path.join(project.video_dir, moved_name)
    shutil.move(target_path, moved)
    metadata = project.load_metadata()
    metadata[moved_name] = {
        "group": "other_transition" if prefix == "other" else "possible_other_transition",
        "poster": poster,
        "status": moved_status or ("Moved to other for later review." if prefix == "other" else "Moved to possible for later review."),
    }
    return moved_name, metadata


def process_regen(project, local_job):
    file_name = local_job["file"]
    mode = local_job["mode"]
    prompt_text = local_job["promptText"].strip()
    moved_status = local_job.get("movedStatus", "").strip()
    transition = project.transitions[file_name]
    target = os.path.join(project.video_dir, file_name)
    temp = os.path.join(project.video_dir, f".regen_{file_name}")

    local_job["status"] = "queued_ltx"
    ltx_id = submit_ltx(project, transition, prompt_text)
    local_job["ltx_job_id"] = ltx_id
    local_job["status"] = "generating"
    ltx_job = wait_for_ltx(project, ltx_id, local_job)
    local_job["status"] = "downloading"
    download(f"/api/jobs/{ltx_id}/file", temp)

    metadata = project.load_metadata()
    completed_stamp = time.strftime("%Y-%m-%d %H:%M:%S")
    moved_name = None
    if mode in {"move", "other"} and os.path.exists(target):
        prefix = "other" if mode == "other" else "possible"
        moved_name, metadata = move_existing_target(project, file_name, target, prefix, moved_status, transition["start"])
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
    project.save_metadata(metadata)
    local_job["status"] = "done"


def process_reverse(project, local_job):
    source_file = local_job["file"]
    target_file = local_job["targetFile"]
    mode = local_job["mode"]
    moved_status = local_job.get("movedStatus", "").strip()
    source = os.path.join(project.video_dir, source_file)
    target = os.path.join(project.video_dir, target_file)
    temp = os.path.join(project.video_dir, f".reverse_{target_file}")
    transition = project.transitions[target_file]

    if not os.path.exists(source):
        raise RuntimeError(f"source video missing: {source_file}")

    local_job["status"] = "reversing"
    result = subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", source, "-vf", "reverse", "-an", "-movflags", "+faststart", temp],
        cwd=project.root,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or f"ffmpeg exited with {result.returncode}")

    metadata = project.load_metadata()
    moved_name = None
    if mode in {"move", "other"} and os.path.exists(target):
        prefix = "other" if mode == "other" else "possible"
        moved_name, metadata = move_existing_target(project, target_file, target, prefix, moved_status, transition["start"])
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
    project.save_metadata(metadata)
    local_job["status"] = "done"


def _worker_loop(project):
    while True:
        job = project.tasks.get()
        with project.lock:
            project.running = job
        try:
            if job.get("task") == "reverse":
                process_reverse(project, job)
            else:
                process_regen(project, job)
        except Exception as err:
            job["status"] = "failed"
            job["error"] = str(err)
            for prefix, file_key in ((".regen_", "file"), (".reverse_", "targetFile")):
                temp = os.path.join(project.video_dir, f"{prefix}{job.get(file_key, '')}")
                if os.path.exists(temp):
                    os.remove(temp)
        with project.lock:
            project.running = None
        project.tasks.task_done()


# ── Project discovery ──────────────────────────────────────────────────
def discover_projects():
    projects = {}
    seen_roots = set()
    candidates = sorted(glob.glob(SEARCH_GLOB))
    here_config = os.path.join(HERE, "regen_config.json")
    if os.path.exists(here_config) and here_config not in candidates:
        candidates.insert(0, here_config)
    for config_path in candidates:
        root = os.path.realpath(os.path.dirname(config_path))
        if root in seen_roots:
            continue
        seen_roots.add(root)
        try:
            project = Project(root)
        except Exception as err:
            print(f"  ⚠ skipping {root}: {err}", flush=True)
            continue
        projects[project.slug] = project
        print(f"  ✓ {project.slug:20} ← {project.root}", flush=True)
    return projects


PROJECTS = {}


# ── HTTP handler ───────────────────────────────────────────────────────
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
        slug, rest = self._split_path()
        if slug and rest.startswith("/videos/") and slug in PROJECTS:
            self._send_video(PROJECTS[slug], rest, head_only=True)
            return
        self.send_response(404)
        self.end_headers()

    def _split_path(self):
        parsed = urllib.parse.urlparse(self.path)
        path = urllib.parse.unquote(parsed.path)
        parts = path.lstrip("/").split("/", 1)
        if len(parts) == 1:
            return parts[0], "/"
        return parts[0], "/" + parts[1]

    def send_json(self, data, status=200):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    # ── GET dispatch ──────────────────────────────────────────────────
    def do_GET(self):
        slug, rest = self._split_path()
        # Root index
        if not slug:
            return self._send_index()
        if slug not in PROJECTS:
            return self.send_json({"ok": False, "error": f"unknown project: {slug}"}, 404)
        project = PROJECTS[slug]
        if rest == "/api/status":
            return self.send_json({"ok": True, **project.queue_snapshot()})
        if rest.startswith("/videos/"):
            return self._send_video(project, rest)
        return self._send_static(project, rest)

    def _send_index(self):
        rows = "".join(
            f'<li><a href="/{slug}/?debug">{slug}</a> '
            f'<small>({len(project.transitions)} transitions, {project.tasks.qsize()} queued)</small></li>'
            for slug, project in sorted(PROJECTS.items())
        )
        body = (
            "<!doctype html><html><head><meta charset='utf-8'><title>regen helper</title>"
            "<style>body{font:14px ui-sans-serif,system-ui;background:#0a0705;color:#f6efe5;"
            "padding:40px;max-width:560px;margin:0 auto}h1{font-size:1.4rem}"
            "a{color:#d9a86a;text-decoration:none}a:hover{text-decoration:underline}"
            "li{margin:8px 0}small{color:#a89380}</style></head>"
            f"<body><h1>Regen helper — {len(PROJECTS)} project(s)</h1>"
            f"<p>Each link opens the game with <code>?debug</code> so the panel is visible.</p>"
            f"<ul>{rows}</ul></body></html>"
        ).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_static(self, project, rest):
        # Default to index.html for the project root.
        if rest in ("", "/"):
            rest = "/index.html"
        resolved = os.path.realpath(os.path.join(project.root, rest.lstrip("/")))
        if not resolved.startswith(project.root + os.sep) and resolved != project.root:
            return self.send_json({"ok": False, "error": "not found"}, 404)
        if not os.path.isfile(resolved):
            return self.send_json({"ok": False, "error": "not found"}, 404)
        content_type = mimetypes.guess_type(resolved)[0] or "application/octet-stream"
        try:
            with open(resolved, "rb") as handle:
                body = handle.read()
        except OSError:
            return self.send_json({"ok": False, "error": "not found"}, 404)
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _send_video(self, project, rest, head_only=False):
        file_name = os.path.basename(rest)
        if not file_name.endswith(".mp4"):
            return self.send_json({"ok": False, "error": "not found"}, 404)
        path = os.path.join(project.video_dir, file_name)
        if not os.path.exists(path):
            return self.send_json({"ok": False, "error": "not found"}, 404)
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

    # ── POST dispatch ─────────────────────────────────────────────────
    def do_POST(self):
        slug, rest = self._split_path()
        if slug not in PROJECTS:
            return self.send_json({"ok": False, "error": f"unknown project: {slug}"}, 404)
        if rest not in {"/api/regen", "/api/reverse"}:
            return self.send_json({"ok": False, "error": "not found"}, 404)
        project = PROJECTS[slug]
        length = int(self.headers.get("Content-Length", "0"))
        try:
            data = json.loads(self.rfile.read(length).decode("utf-8"))
        except json.JSONDecodeError:
            return self.send_json({"ok": False, "error": "invalid json"}, 400)
        file_name = os.path.basename(data.get("file", ""))
        mode = data.get("mode")
        prompt_text = data.get("promptText", "")
        if file_name not in project.transitions:
            return self.send_json({"ok": False, "error": "unknown transition"}, 400)
        if mode not in {"delete", "move", "other"}:
            return self.send_json({"ok": False, "error": "mode must be delete, move, or other"}, 400)
        is_reverse = rest == "/api/reverse"
        target_file = project.reverse_target_for(file_name) if is_reverse else None
        if is_reverse:
            if not target_file:
                return self.send_json({"ok": False, "error": "transition has no reverse target"}, 400)
        else:
            if not prompt_text.strip():
                return self.send_json({"ok": False, "error": "promptText is required"}, 400)
        job = {
            "id": f"{project.slug}-{int(time.time() * 1000)}",
            "task": "reverse" if is_reverse else "regen",
            "file": file_name,
            "targetFile": target_file,
            "mode": mode,
            "promptText": prompt_text,
            "movedStatus": data.get("movedStatus", ""),
            "status": "queued",
            "created_at": time.time(),
            "project": project.slug,
        }
        with project.lock:
            project.jobs.append(job)
        project.tasks.put(job)
        self.send_json({"ok": True, "job": job})

    def log_message(self, fmt, *args):
        print(f"[{time.strftime('%H:%M:%S')}] {fmt % args}", flush=True)


def main():
    global PROJECTS
    print(f"Regen helper scanning {SEARCH_GLOB}", flush=True)
    PROJECTS = discover_projects()
    if not PROJECTS:
        raise SystemExit("No projects found. Place a regen_config.json next to this script or under the search glob.")
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"\nMulti-project regen helper listening on http://{HOST}:{PORT}", flush=True)
    print(f"  Open http://{HOST}:{PORT}/ for the project index, or jump straight to a game's debug panel:", flush=True)
    for slug in sorted(PROJECTS):
        print(f"    http://{HOST}:{PORT}/{slug}/?debug", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
