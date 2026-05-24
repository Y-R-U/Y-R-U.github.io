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
import importlib.util
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
MFLUX_API = "http://localhost:7867"
HOST = "127.0.0.1"
PORT = 8788
HERE = os.path.dirname(os.path.abspath(__file__))
SEARCH_GLOB = os.path.expanduser("~/cc/yru/site/gms/2d/*/regen_config.json")
GAME_PORTRAIT_WIDTH = 384
GAME_PORTRAIT_HEIGHT = 640
ALLOWED_RESOLUTIONS = {(384, 640), (576, 960)}

# Image redo (still generation) runs on the mflux-queue warm server, which does
# both txt2img (rooms / success end-frames) and multi-ref edit (monster-in-hallway
# composites). Matched 3:5 portrait, 9B-4bit @ 10 steps — see the airon
# project-awake-video-pipeline memory for why these are the go-forward defaults.
IMAGE_MODEL = "flux2-klein-9b-mlx-4bit"
IMAGE_STEPS = 10
IMAGE_WIDTH = 768
IMAGE_HEIGHT = 1280
# Monster character reference: a clean identity portrait reused across every
# redo of that monster's release/attack clips so the creature stays consistent.
MONSTER_REF_STYLE = (
    "full-body character reference, one single creature centered in frame, "
    "plain dark neutral background, dramatic rim lighting, sharp high detail, "
    "no people, no human bystanders, no readable text, no watermark, no logo"
)


def load_story_transitions(root):
    story_path = os.path.join(root, "js", "story.js")
    if not os.path.exists(story_path):
        return {}
    script = (
        "global.window={};"
        "require('./js/story.js');"
        "const s=window.CodexHorrorStory||window.TheHorrorsStory;"
        "if(!s){console.log('{}');process.exit(0);}"
        "const out={};"
        "(s.transitions||[]).filter(t=>t.group==='room_transitions').forEach(t=>{"
        "out[t.file]={id:t.id,label:t.label,start:t.startImage,end:t.endImage,"
        "seed:t.seed||0,promptText:t.promptText,status:t.status||'Story-managed transition. Needs review.'};"
        "});"
        "console.log(JSON.stringify(out));"
    )
    try:
        raw = subprocess.check_output(["node", "-e", script], cwd=root, text=True)
        data = json.loads(raw)
        return data if isinstance(data, dict) else {}
    except Exception as exc:
        print(f"[{time.strftime('%H:%M:%S')}] story transition load failed for {root}: {exc}", flush=True)
        return {}


def import_project_module(root, filename):
    """Import a project's gen_*.py module so we can reuse its prompt builders
    and style strings. Returns the module or None (missing/failed import)."""
    script_path = os.path.join(root, filename)
    if not os.path.exists(script_path):
        return None
    module_name = f"regen_{os.path.splitext(filename)[0]}_{os.path.basename(root)}"
    try:
        spec = importlib.util.spec_from_file_location(module_name, script_path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module
    except Exception as exc:
        print(f"[{time.strftime('%H:%M:%S')}] import {filename} failed for {root}: {exc}", flush=True)
        return None


def load_event_transitions(root, module=None):
    if module is None:
        module = import_project_module(root, "gen_event_videos.py")
    if module is None:
        return {}
    try:
        if hasattr(module, "load_events"):
            events = module.load_events()
        else:
            events = getattr(module, "EVENTS", [])
    except Exception as exc:
        print(f"[{time.strftime('%H:%M:%S')}] event transition load failed for {root}: {exc}", flush=True)
        return {}
    rows = {}
    for item in events:
        file_name = item.get("output")
        if not file_name:
            continue
        group = item.get("group", "")
        if group not in {"ending_video", "monster_release", "monster_attack"}:
            continue
        stem = os.path.splitext(file_name)[0]
        rows[file_name] = {
            "id": stem,
            "group": group,
            "label": stem,
            "start": item.get("start", "images/hallway.jpg"),
            "end": item.get("end", ""),
            "seed": item.get("seed", 0),
            "num_frames": item.get("num_frames", 73),
            "promptText": item.get("prompt", ""),
            "status": "Event clip. Needs review.",
            "poster": item.get("poster", item.get("start", "images/hallway.jpg")),
            "common": getattr(module, "COMMON", ""),
            "negative": getattr(module, "NEGATIVE", ""),
        }
    return rows


def sanitize_marker_name(name):
    value = "".join(ch if ch.isalnum() or ch in {"_", "-"} else "_" for ch in str(name).strip().lower())
    value = "_".join(part for part in value.split("_") if part)
    return value[:80] or f"marker_{int(time.time())}"


def room_id_from_transition(file_name):
    if file_name.endswith("_to_hallway.mp4"):
        return file_name.removesuffix("_to_hallway.mp4")
    if file_name.startswith("hallway_to_") and file_name.endswith(".mp4"):
        return file_name.removeprefix("hallway_to_").removesuffix(".mp4")
    return None


def monster_id_from_transition(file_name):
    stem = os.path.splitext(file_name)[0]
    if stem.startswith("monster_release_"):
        return stem.removeprefix("monster_release_"), "release"
    if stem.startswith("monster_attack_"):
        return stem.removeprefix("monster_attack_"), "attack"
    return None, None


def build_image_meta(project):
    """Per-transition still-generation metadata: which non-hallway image an
    Image-Redo regenerates, its editable prompt, and which video(s) it feeds.

    Rooms feed two clips (room->hallway and hallway->room); monster and success
    clips feed one each. Best-effort — a missing module/attr just yields a blank
    prompt the user can fill in by hand."""
    meta = {}
    img = project.image_module
    evt = project.event_module

    # ── rooms ──────────────────────────────────────────────────────────
    # Two game layouts: awake builds prompts from story.js rooms via
    # image_prompt(); the_horrors hardcodes an IMAGES list of (file, w, h, prompt).
    style = getattr(img, "STYLE", "") if img is not None else ""
    rooms = {}
    if img is not None and hasattr(img, "load_story"):
        try:
            rooms = (img.load_story() or {}).get("rooms", {}) or {}
        except Exception as exc:
            print(f"[{time.strftime('%H:%M:%S')}] room story load failed: {exc}", flush=True)
    images_list = {}
    for entry in (getattr(img, "IMAGES", []) or []):
        try:
            images_list[os.path.splitext(entry[0])[0]] = entry[-1]
        except (IndexError, TypeError):
            continue

    def room_prompt(room):
        if room in rooms and img is not None and hasattr(img, "image_prompt"):
            try:
                base = img.image_prompt(rooms[room])
                return f"{base}, {style}" if style else base
            except Exception:
                pass
        if room in images_list:
            base = images_list[room]
            return f"{base}, {style}" if style else base
        return ""

    seen_rooms = set()
    for file_name in project.transitions:
        room = room_id_from_transition(file_name)
        if not room or room == "hallway":
            continue
        siblings = [f"{room}_to_hallway.mp4", f"hallway_to_{room}.mp4"]
        video_files = [f for f in siblings if f in project.transitions]
        prompt = room_prompt(room)
        info = {
            "kind": "room",
            "imagePrompt": prompt,
            "otherImage": f"images/{room}.jpg",
            "otherImagePng": f"original_files/{room}.png",
            "videoFiles": video_files,
            "endFrame": False,
            "monsterId": "",
        }
        for f in video_files:
            meta[f] = info
        seen_rooms.add(room)

    # ── monsters (release / attack) ────────────────────────────────────
    threats = {}
    if evt is not None and hasattr(evt, "load_story"):
        try:
            threats = {t["id"]: t for t in (evt.load_story() or {}).get("threats", [])}
        except Exception as exc:
            print(f"[{time.strftime('%H:%M:%S')}] threat story load failed: {exc}", flush=True)
    visuals = getattr(evt, "THREAT_VISUALS", {}) if evt is not None else {}
    for file_name, transition in project.event_transitions.items():
        monster_id, variant = monster_id_from_transition(file_name)
        if not monster_id:
            continue
        # Start-frame prompt: the event's own per-monster prompt already places
        # the creature in the hallway and is hand-tuned in both games.
        start_prompt = transition.get("promptText", "")
        # Character-reference prompt: prefer a clean visual descriptor; the user
        # can edit it before re-rolling the saved monster reference.
        visual = (visuals.get(monster_id) if visuals else "") or (threats.get(monster_id, {}).get("name") if threats else "")
        ref_basis = visual or start_prompt or f"the {monster_id}"
        meta[file_name] = {
            "kind": f"monster_{variant}",
            "imagePrompt": start_prompt,
            "otherImage": f"images/monster_{variant}_{monster_id}_start.jpg",
            "otherImagePng": f"original_files/monster_{variant}_{monster_id}_start.png",
            "videoFiles": [file_name],
            "endFrame": False,
            "monsterId": monster_id,
            "monsterRefFile": f"monster_{monster_id}.png",
            "monsterRefPrompt": f"{ref_basis}, {MONSTER_REF_STYLE}",
        }

    # ── success / ending videos (still becomes the end-frame) ──────────
    victory = getattr(evt, "VICTORY_PROMPTS", {}) if evt is not None else {}
    for file_name, transition in project.event_transitions.items():
        if transition.get("group") != "ending_video":
            continue
        stem = os.path.splitext(file_name)[0]
        prompt = victory.get(file_name) or transition.get("promptText", "")
        meta[file_name] = {
            "kind": "success",
            "imagePrompt": prompt,
            "otherImage": f"images/{stem}_end.jpg",
            "otherImagePng": f"original_files/{stem}_end.png",
            "videoFiles": [file_name],
            "endFrame": True,
            "monsterId": "",
        }
    return meta


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
        if cfg.get("auto_story_transitions"):
            merged = dict(self.transitions)
            merged.update(load_story_transitions(self.root))
            self.transitions = merged
        self.image_module = import_project_module(self.root, "gen_images.py")
        self.event_module = import_project_module(self.root, "gen_event_videos.py")
        self.event_transitions = load_event_transitions(self.root, self.event_module)
        self.regen_targets = dict(self.transitions)
        self.regen_targets.update(self.event_transitions)
        self.extras = cfg.get("extras", [])
        self.extra_prefixes = cfg.get("extra_prefixes", {})
        self.tasks = queue.Queue()
        self.jobs = []
        self.running = None
        self.lock = threading.Lock()
        self.ref_dir = os.path.join(self.root, "ref")
        self.preview_dir = os.path.join(self.root, ".image_previews")
        os.makedirs(self.video_dir, exist_ok=True)
        os.makedirs(self.ref_dir, exist_ok=True)
        os.makedirs(self.preview_dir, exist_ok=True)
        self.image_meta = {}
        try:
            self.image_meta = build_image_meta(self)
        except Exception as exc:
            print(f"[{time.strftime('%H:%M:%S')}] image meta build failed for {self.root}: {exc}", flush=True)
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

    def marker_src(self, file_name):
        path = os.path.join(self.ref_dir, file_name)
        url_file = urllib.parse.quote(file_name)
        if not os.path.exists(path):
            return f"http://{HOST}:{PORT}/{self.slug}/ref/{url_file}"
        stat = os.stat(path)
        return f"http://{HOST}:{PORT}/{self.slug}/ref/{url_file}?v={int(stat.st_mtime)}-{stat.st_size}"

    def list_markers(self):
        markers = []
        if not os.path.isdir(self.ref_dir):
            return markers
        for file_name in sorted(os.listdir(self.ref_dir)):
            if not file_name.lower().endswith((".jpg", ".jpeg", ".png")):
                continue
            path = os.path.join(self.ref_dir, file_name)
            stat = os.stat(path)
            markers.append({
                "file": file_name,
                "name": os.path.splitext(file_name)[0],
                "src": self.marker_src(file_name),
                "modified": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(stat.st_mtime)),
            })
        return markers

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
                "markers": self.list_markers(),
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
        for file_name, transition in self.event_transitions.items():
            explicit_files.add(file_name)
            meta = metadata.get(file_name, {})
            is_processing = file_name == processing_file
            status = meta.get("status") or transition.get("status", "Event clip. Needs review.")
            if is_processing:
                status = "Processing replacement video. Current preview is the previous file until generation finishes."
            rows.append({
                "id": transition["id"],
                "group": transition["group"],
                "label": transition["label"],
                "file": file_name,
                "src": self.video_row_src(file_name),
                "poster": meta.get("poster") or transition.get("poster", transition["start"]),
                "startImage": transition["start"],
                "endImage": transition.get("end", ""),
                "promptText": meta.get("promptText") or transition["promptText"],
                "status": status,
                "canRedo": True,
                "canReverse": False,
                "canMarker": True,
                "reverseTarget": None,
                "processing": is_processing,
                "fileInfo": self.video_file_info(file_name),
                "exists": os.path.exists(os.path.join(self.video_dir, file_name)),
                "numFrames": meta.get("num_frames") or transition.get("num_frames", 73),
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
        for row in rows:
            # Clips with a defined end-frame are cut 0.4s short (tail rides on
            # the end-frame); surface it so the debug preview matches gameplay.
            if row.get("endImage"):
                row["trimEnd"] = -0.4
            info = self.image_meta.get(row["file"])
            if not info:
                continue
            decorated = dict(info)
            ref_file = info.get("monsterRefFile")
            if ref_file:
                ref_path = os.path.join(self.ref_dir, ref_file)
                decorated["monsterRefExists"] = os.path.exists(ref_path)
                decorated["monsterRefSrc"] = self.marker_src(ref_file) if os.path.exists(ref_path) else ""
            decorated["otherImageExists"] = os.path.exists(os.path.join(self.root, info["otherImage"]))
            row["imageRedo"] = decorated
        return rows

    def preview_src(self, file_name):
        path = os.path.join(self.preview_dir, file_name)
        url_file = urllib.parse.quote(file_name)
        if not os.path.exists(path):
            return f"http://{HOST}:{PORT}/{self.slug}/preview/{url_file}"
        stat = os.stat(path)
        return f"http://{HOST}:{PORT}/{self.slug}/preview/{url_file}?v={int(stat.st_mtime)}-{stat.st_size}"


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


# ── mflux-queue HTTP helpers (image generation) ────────────────────────
def mflux_post(path, payload):
    request = urllib.request.Request(
        f"{MFLUX_API}{path}",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.load(response)


def mflux_get(path):
    with urllib.request.urlopen(f"{MFLUX_API}{path}", timeout=60) as response:
        return json.load(response)


def mflux_download(path, target):
    with urllib.request.urlopen(f"{MFLUX_API}{path}", timeout=240) as response:
        data = response.read()
    with open(target, "wb") as handle:
        handle.write(data)


def best_effort_unload(api):
    """Free a backend's resident model so the other can fit in 24 GB.
    Swallows 409 (job in flight) and connection errors."""
    try:
        request = urllib.request.Request(f"{api}/admin/unload", data=b"{}",
                                         headers={"Content-Type": "application/json"}, method="POST")
        with urllib.request.urlopen(request, timeout=30):
            return True
    except Exception:
        return False


def wait_for_ltx_idle(local_job, timeout=150):
    """LTX has no explicit unload — it drops its ~16 GB worker after 120 s of
    queue idle. Before loading Flux, wait for that so they don't co-reside."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            status = get_json("/api/status")
        except Exception:
            return
        if not status.get("worker_warm"):
            return
        local_job["status"] = "waiting_ltx_idle"
        time.sleep(5)


def mflux_generate(prompt, target, *, mode="txt2img", image_paths=None, local_job=None):
    """Generate one still on mflux-queue and download it to target."""
    payload = {
        "mode": mode,
        "prompt": prompt,
        "model": IMAGE_MODEL,
        "width": IMAGE_WIDTH,
        "height": IMAGE_HEIGHT,
        "num_inference_steps": IMAGE_STEPS,
        "seed": int(time.time()) % 100000,
        "num_images": 1,
    }
    if mode == "edit":
        payload["image_paths"] = image_paths or []
    job_id = mflux_post("/api/generate", payload)["job_id"]
    if local_job is not None:
        local_job["mflux_job_id"] = job_id
    while True:
        job = mflux_get(f"/api/jobs/{job_id}")
        if local_job is not None:
            local_job["mflux_status"] = job.get("status")
        if job.get("status") == "done":
            break
        if job.get("status") in {"failed", "cancelled"}:
            raise RuntimeError(f"mflux job {job_id} ended with {job.get('status')}: {job.get('error', '')}")
        time.sleep(3)
    mflux_download(f"/api/jobs/{job_id}/file/0", target)
    return target


def submit_ltx(project, transition, prompt_text, render_options):
    width = int(render_options.get("width") or GAME_PORTRAIT_WIDTH)
    height = int(render_options.get("height") or GAME_PORTRAIT_HEIGHT)
    if (width, height) not in ALLOWED_RESOLUTIONS:
        width, height = GAME_PORTRAIT_WIDTH, GAME_PORTRAIT_HEIGHT
    num_frames = max(1, int(render_options.get("num_frames") or transition.get("num_frames") or 73))
    marker_file = os.path.basename(render_options.get("marker") or "")
    marker_path = os.path.join(project.ref_dir, marker_file) if marker_file else ""
    # Image-Redo wires its generated still in here: a monster start-frame
    # overrides the start image; a success destination overrides the end frame.
    start_image = render_options.get("start_image") or transition.get("start") or "images/hallway.jpg"
    end_image = render_options.get("end_image") or transition.get("end") or ""
    common = transition.get("common") or project.common
    negative = transition.get("negative") or project.negative
    payload = {
        "prompt": f"{prompt_text}, {common}",
        "width": width,
        "height": height,
        "num_frames": num_frames,
        "fps": 24,
        "seed": int(time.time()) % 100000,
        "num_inference_steps": 20,
        "cfg_scale": 3.0,
        "negative_prompt": negative,
        "image": os.path.join(project.root, start_image),
        "image_strength": 1.0,
        "tiling": "aggressive",
        "no_audio": True,
    }
    if marker_path and os.path.exists(marker_path):
        payload["image_end"] = marker_path
    elif end_image:
        payload["image_end"] = os.path.join(project.root, end_image)
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
    transition = project.regen_targets[file_name]
    target = os.path.join(project.video_dir, file_name)
    temp = os.path.join(project.video_dir, f".regen_{file_name}")

    local_job["status"] = "queued_ltx"
    render_options = local_job.get("renderOptions") or {}
    # Free the Flux worker so LTX (~16 GB) fits in 24 GB before we render video.
    best_effort_unload(MFLUX_API)
    ltx_id = submit_ltx(project, transition, prompt_text, render_options)
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
        "group": transition.get("group", "room_transitions"),
        "poster": transition.get("poster") or transition["start"],
        "promptText": prompt_text,
        "status": f"{action}. Local regen completed {completed_stamp}.",
        "ltxJobId": ltx_id,
        "bytes": local_job["bytes"],
        "duration_secs": ltx_job.get("duration_secs"),
        "width": render_options.get("width"),
        "height": render_options.get("height"),
        "num_frames": render_options.get("num_frames"),
        "marker": render_options.get("marker", ""),
    }
    project.save_metadata(metadata)
    local_job["status"] = "done"


def hallway_reference(project):
    """Highest-quality hallway still available, for monster composites."""
    for candidate in ("original_files/hallway.png", "images/hallway.jpg", "images/hallway.png"):
        path = os.path.join(project.root, candidate)
        if os.path.exists(path):
            return path
    return os.path.join(project.root, "images/hallway.jpg")


def png_to_jpg(src_png, dst_jpg, quality=85):
    os.makedirs(os.path.dirname(dst_jpg), exist_ok=True)
    subprocess.run(
        ["sips", "-s", "format", "jpeg", "-s", "formatOptions", str(quality), src_png, "--out", dst_jpg],
        check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )


def process_image_preview(project, local_job):
    file_name = local_job["file"]
    info = project.image_meta.get(file_name)
    if not info:
        raise RuntimeError(f"no image-redo metadata for {file_name}")
    prompt = (local_job.get("promptText") or info.get("imagePrompt") or "").strip()
    if not prompt:
        raise RuntimeError("image prompt is required")
    kind = info["kind"]
    # Let LTX drop its worker so Flux has room (24 GB box).
    wait_for_ltx_idle(local_job)
    local_job["status"] = "generating_image"
    token = f"{os.path.splitext(file_name)[0]}_{int(time.time())}.png"
    preview_path = os.path.join(project.preview_dir, token)

    if kind in {"monster_release", "monster_attack"} and local_job.get("useMonsterRef", True):
        ref_file = info["monsterRefFile"]
        ref_path = os.path.join(project.ref_dir, ref_file)
        if not os.path.exists(ref_path) or local_job.get("rerollRef"):
            ref_prompt = (local_job.get("monsterRefPrompt") or info.get("monsterRefPrompt") or "").strip()
            local_job["status"] = "generating_monster_ref"
            mflux_generate(ref_prompt, ref_path, mode="txt2img", local_job=local_job)
            local_job["monsterRefSrc"] = project.marker_src(ref_file)
        else:
            local_job["monsterRefSrc"] = project.marker_src(ref_file)
        local_job["status"] = "compositing"
        mflux_generate(prompt, preview_path, mode="edit",
                       image_paths=[hallway_reference(project), ref_path], local_job=local_job)
    else:
        mflux_generate(prompt, preview_path, mode="txt2img", local_job=local_job)

    local_job["preview"] = token
    local_job["previewSrc"] = project.preview_src(token)
    local_job["imagePrompt"] = prompt
    local_job["status"] = "image_ready"


def commit_image(project, file_name, preview_token, render_options, mode, moved_status):
    """Move an accepted preview into the game's image paths and enqueue the
    video redo(s) it feeds. Rooms feed two clips; monster/success feed one."""
    info = project.image_meta.get(file_name)
    if not info:
        raise RuntimeError(f"no image-redo metadata for {file_name}")
    preview_path = os.path.join(project.preview_dir, os.path.basename(preview_token))
    if not os.path.exists(preview_path):
        raise RuntimeError("preview image not found; regenerate it first")
    png_dst = os.path.join(project.root, info["otherImagePng"])
    jpg_dst = os.path.join(project.root, info["otherImage"])
    os.makedirs(os.path.dirname(png_dst), exist_ok=True)
    shutil.copyfile(preview_path, png_dst)
    png_to_jpg(png_dst, jpg_dst)

    enqueued = []
    for video_file in info["videoFiles"]:
        if video_file not in project.regen_targets:
            continue
        transition = project.regen_targets[video_file]
        opts = {
            "width": render_options.get("width"),
            "height": render_options.get("height"),
            "num_frames": render_options.get("num_frames"),
            "marker": "",
        }
        if info.get("endFrame"):
            opts["end_image"] = info["otherImage"]
        elif info["kind"].startswith("monster_"):
            opts["start_image"] = info["otherImage"]
        job = {
            "id": f"{project.slug}-{int(time.time() * 1000)}-{len(enqueued)}",
            "task": "regen",
            "file": video_file,
            "targetFile": None,
            "mode": mode,
            "promptText": transition.get("promptText", ""),
            "movedStatus": moved_status,
            "renderOptions": opts,
            "status": "queued",
            "created_at": time.time(),
            "project": project.slug,
            "fromImageRedo": True,
        }
        with project.lock:
            project.jobs.append(job)
        project.tasks.put(job)
        enqueued.append(job)
    return enqueued


def process_marker(project, local_job):
    file_name = local_job["file"]
    source = os.path.join(project.video_dir, file_name)
    if not os.path.exists(source):
        raise RuntimeError(f"source video missing: {file_name}")
    marker_name = sanitize_marker_name(local_job.get("name", ""))
    target_file = f"{marker_name}.jpg"
    target = os.path.join(project.ref_dir, target_file)
    seconds = max(0, float(local_job.get("time", 0) or 0))
    local_job["status"] = "extracting"
    result = subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-ss", f"{seconds:.3f}", "-i", source, "-frames:v", "1", "-q:v", "2", target],
        cwd=project.root,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or f"ffmpeg exited with {result.returncode}")
    local_job["marker"] = target_file
    local_job["bytes"] = os.path.getsize(target)
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
            if job.get("task") == "marker":
                process_marker(project, job)
            elif job.get("task") == "reverse":
                process_reverse(project, job)
            elif job.get("task") == "image_preview":
                process_image_preview(project, job)
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
        if slug and rest.startswith("/ref/") and slug in PROJECTS:
            self._send_ref(PROJECTS[slug], rest, head_only=True)
            return
        if slug and rest.startswith("/preview/") and slug in PROJECTS:
            self._send_ref(PROJECTS[slug], rest, head_only=True, base_dir=PROJECTS[slug].preview_dir)
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
        if rest.startswith("/ref/"):
            return self._send_ref(project, rest)
        if rest.startswith("/preview/"):
            return self._send_ref(project, rest, base_dir=project.preview_dir)
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

    def _send_ref(self, project, rest, head_only=False, base_dir=None):
        base = base_dir or project.ref_dir
        file_name = os.path.basename(rest)
        if not file_name.lower().endswith((".jpg", ".jpeg", ".png")):
            return self.send_json({"ok": False, "error": "not found"}, 404)
        path = os.path.realpath(os.path.join(base, file_name))
        if not path.startswith(base + os.sep):
            return self.send_json({"ok": False, "error": "not found"}, 404)
        if not os.path.exists(path):
            return self.send_json({"ok": False, "error": "not found"}, 404)
        stat = os.stat(path)
        content_type = mimetypes.guess_type(path)[0] or "image/jpeg"
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(stat.st_size))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Last-Modified", self.date_time_string(stat.st_mtime))
        self.end_headers()
        if head_only:
            return
        with open(path, "rb") as handle:
            shutil.copyfileobj(handle, self.wfile)

    # ── POST dispatch ─────────────────────────────────────────────────
    def do_POST(self):
        slug, rest = self._split_path()
        if slug not in PROJECTS:
            return self.send_json({"ok": False, "error": f"unknown project: {slug}"}, 404)
        if rest not in {"/api/regen", "/api/reverse", "/api/marker", "/api/image_preview", "/api/image_commit"}:
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
        if rest == "/api/marker":
            if file_name not in project.event_transitions:
                return self.send_json({"ok": False, "error": "markers are only enabled for event clips"}, 400)
            job = {
                "id": f"{project.slug}-{int(time.time() * 1000)}",
                "task": "marker",
                "file": file_name,
                "name": data.get("name", ""),
                "time": data.get("time", 0),
                "status": "queued",
                "created_at": time.time(),
                "project": project.slug,
            }
            with project.lock:
                project.jobs.append(job)
            project.tasks.put(job)
            return self.send_json({"ok": True, "job": job})
        if rest == "/api/image_preview":
            if file_name not in project.image_meta:
                return self.send_json({"ok": False, "error": "image redo is not available for this transition"}, 400)
            job = {
                "id": f"{project.slug}-{int(time.time() * 1000)}",
                "task": "image_preview",
                "file": file_name,
                "promptText": prompt_text,
                "useMonsterRef": bool(data.get("useMonsterRef", True)),
                "monsterRefPrompt": data.get("monsterRefPrompt", ""),
                "rerollRef": bool(data.get("rerollRef", False)),
                "status": "queued",
                "created_at": time.time(),
                "project": project.slug,
            }
            with project.lock:
                project.jobs.append(job)
            project.tasks.put(job)
            return self.send_json({"ok": True, "job": job})
        if rest == "/api/image_commit":
            if file_name not in project.image_meta:
                return self.send_json({"ok": False, "error": "image redo is not available for this transition"}, 400)
            if mode not in {"delete", "move", "other"}:
                return self.send_json({"ok": False, "error": "mode must be delete, move, or other"}, 400)
            preview_token = os.path.basename(data.get("preview", ""))
            if not preview_token:
                return self.send_json({"ok": False, "error": "preview token is required"}, 400)
            c_width = int(data.get("width") or GAME_PORTRAIT_WIDTH)
            c_height = int(data.get("height") or GAME_PORTRAIT_HEIGHT)
            if (c_width, c_height) not in ALLOWED_RESOLUTIONS:
                return self.send_json({"ok": False, "error": "resolution must be 384x640 or 576x960"}, 400)
            try:
                c_frames = max(1, int(data.get("numFrames") or 73))
            except (TypeError, ValueError):
                return self.send_json({"ok": False, "error": "numFrames must be a number"}, 400)
            try:
                enqueued = commit_image(
                    project, file_name, preview_token,
                    {"width": c_width, "height": c_height, "num_frames": c_frames},
                    mode, data.get("movedStatus", "").strip(),
                )
            except Exception as exc:
                return self.send_json({"ok": False, "error": str(exc)}, 400)
            return self.send_json({"ok": True, "jobs": enqueued})
        if file_name not in project.regen_targets:
            return self.send_json({"ok": False, "error": "unknown transition"}, 400)
        if mode not in {"delete", "move", "other"}:
            return self.send_json({"ok": False, "error": "mode must be delete, move, or other"}, 400)
        is_reverse = rest == "/api/reverse"
        target_file = project.reverse_target_for(file_name) if is_reverse else None
        if is_reverse:
            if file_name not in project.transitions:
                return self.send_json({"ok": False, "error": "reverse is only supported for room transitions"}, 400)
            if not target_file:
                return self.send_json({"ok": False, "error": "transition has no reverse target"}, 400)
        else:
            if not prompt_text.strip():
                return self.send_json({"ok": False, "error": "promptText is required"}, 400)
        width = int(data.get("width") or GAME_PORTRAIT_WIDTH)
        height = int(data.get("height") or GAME_PORTRAIT_HEIGHT)
        if (width, height) not in ALLOWED_RESOLUTIONS:
            return self.send_json({"ok": False, "error": "resolution must be 384x640 or 576x960"}, 400)
        try:
            num_frames = max(1, int(data.get("numFrames") or 73))
        except (TypeError, ValueError):
            return self.send_json({"ok": False, "error": "numFrames must be a number"}, 400)
        marker = os.path.basename(data.get("marker", ""))
        if marker and not os.path.exists(os.path.join(project.ref_dir, marker)):
            return self.send_json({"ok": False, "error": "marker frame not found"}, 400)
        job = {
            "id": f"{project.slug}-{int(time.time() * 1000)}",
            "task": "reverse" if is_reverse else "regen",
            "file": file_name,
            "targetFile": target_file,
            "mode": mode,
            "promptText": prompt_text,
            "movedStatus": data.get("movedStatus", ""),
            "renderOptions": {
                "width": width,
                "height": height,
                "num_frames": num_frames,
                "marker": marker,
            },
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
