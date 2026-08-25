#!/usr/bin/env python3
"""Local debug media helper for DRK.

Run from this folder:
    python3 regen_helper.py

Then open:
    http://127.0.0.1:8788/?debug

This helper is intentionally DRK-specific. It serves the static game and
queues local Flux/LTX jobs for character images, shared backgrounds, looping
videos, and transition videos.
"""

from __future__ import annotations

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import mimetypes
import os
import queue
import shutil
import threading
import time
import urllib.parse
import urllib.request


HOST = os.environ.get("DRK_HELPER_HOST", "127.0.0.1")
PORT = int(os.environ.get("PORT", os.environ.get("DRK_HELPER_PORT", "8788")))
HERE = os.path.dirname(os.path.abspath(__file__))
MANIFEST_PATH = os.path.join(HERE, "data", "media_manifest.json")

MFLUX_API = "http://localhost:7867"
LTX_API = "http://localhost:7866"
IMAGE_MODEL = "flux2-klein-9b-mlx-4bit"
IMAGE_WIDTH = 576
IMAGE_HEIGHT = 1024
IMAGE_STEPS = 10
NEGATIVE_IMAGE = "child, teen, underage, explicit nudity, readable text, watermark, logo, distorted face, extra fingers"
NEGATIVE_VIDEO = "child, teen, underage, explicit nudity, readable text, watermark, logo, distorted face, warped hands, melting anatomy"
ALLOWED_VIDEO_SIZES = {(192, 320), (320, 512), (576, 1024)}

TASKS: "queue.Queue[dict]" = queue.Queue()
JOBS: list[dict] = []
RUNNING: dict | None = None
LOCK = threading.Lock()


def now_label() -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S")


def slugify(value: str, fallback: str = "asset") -> str:
    text = "".join(ch.lower() if ch.isalnum() else "_" for ch in str(value).strip())
    text = "_".join(part for part in text.split("_") if part)
    return text[:80] or fallback


def rel_path(*parts: str) -> str:
    return "/".join(parts)


def abs_path(path: str) -> str:
    return os.path.realpath(os.path.join(HERE, path))


def assert_project_path(path: str) -> str:
    resolved = abs_path(path)
    if not resolved.startswith(HERE + os.sep):
        raise RuntimeError("path escapes project")
    return resolved


def load_manifest() -> dict:
    with open(MANIFEST_PATH, "r", encoding="utf-8") as handle:
        return json.load(handle)


def save_manifest(manifest: dict) -> None:
    manifest["updated_at"] = now_label()
    with open(MANIFEST_PATH, "w", encoding="utf-8") as handle:
        json.dump(manifest, handle, indent=2)


def service_post(api: str, path: str, payload: dict, timeout: int = 60) -> dict:
    request = urllib.request.Request(
        f"{api}{path}",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.load(response)


def service_get(api: str, path: str, timeout: int = 60) -> dict:
    with urllib.request.urlopen(f"{api}{path}", timeout=timeout) as response:
        return json.load(response)


def download(api: str, path: str, target: str, timeout: int = 240) -> None:
    with urllib.request.urlopen(f"{api}{path}", timeout=timeout) as response:
        data = response.read()
    os.makedirs(os.path.dirname(target), exist_ok=True)
    with open(target, "wb") as handle:
        handle.write(data)


def best_effort_unload(api: str) -> None:
    try:
        request = urllib.request.Request(
            f"{api}/admin/unload",
            data=b"{}",
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=8):
            return
    except Exception:
        return


def mflux_generate(prompt: str, target: str, job: dict, *, mode: str = "txt2img", image_paths: list[str] | None = None) -> None:
    payload = {
        "mode": mode,
        "prompt": f"{prompt}, {NEGATIVE_IMAGE}",
        "model": IMAGE_MODEL,
        "width": IMAGE_WIDTH,
        "height": IMAGE_HEIGHT,
        "num_inference_steps": IMAGE_STEPS,
        "seed": int(time.time()) % 2_000_000_000,
        "guidance": 1.0,
        "num_images": 1,
    }
    if mode == "edit":
        payload["image_paths"] = image_paths or []
    remote = service_post(MFLUX_API, "/api/generate", payload)
    remote_id = remote["job_id"]
    job["remote_job_id"] = remote_id
    while True:
        remote_job = service_get(MFLUX_API, f"/api/jobs/{remote_id}")
        job["remote_status"] = remote_job.get("status")
        if remote_job.get("status") == "done":
            break
        if remote_job.get("status") in {"failed", "cancelled"}:
            raise RuntimeError(remote_job.get("error") or f"Flux job {remote_id} failed")
        time.sleep(3)
    download(MFLUX_API, f"/api/jobs/{remote_id}/file/0", target)


def ltx_generate(payload: dict, target: str, job: dict) -> None:
    best_effort_unload(MFLUX_API)
    remote = service_post(LTX_API, "/api/generate", payload)
    remote_id = remote["job_id"]
    job["remote_job_id"] = remote_id
    while True:
        remote_job = service_get(LTX_API, f"/api/jobs/{remote_id}")
        job["remote_status"] = remote_job.get("status")
        events = remote_job.get("events") or []
        if events:
            job["remote_event"] = events[-1]
        if remote_job.get("status") == "done":
            break
        if remote_job.get("status") in {"failed", "cancelled"}:
            raise RuntimeError(remote_job.get("error") or f"LTX job {remote_id} failed")
        time.sleep(4)
    temp = f"{target}.tmp"
    download(LTX_API, f"/api/jobs/{remote_id}/file", temp, timeout=300)
    shutil.move(temp, target)


def ensure_character(manifest: dict, character_id: str) -> dict:
    manifest.setdefault("characters", {})
    manifest["characters"].setdefault(character_id, {"name": character_id, "scenes": {}})
    manifest["characters"][character_id].setdefault("scenes", {})
    return manifest["characters"][character_id]


def scene_path(character_id: str, image_name: str) -> str:
    safe_character = slugify(character_id, "character")
    safe_name = slugify(image_name, "character_card")
    if safe_name == "character_card":
        return rel_path("images", "characters", f"{safe_character}_card.png")
    return rel_path("images", "scenes", f"{safe_character}_{safe_name}.png")


def resolve_scene(manifest: dict, ref: dict) -> tuple[str, str]:
    character_id = slugify(ref.get("characterId", ""), "mara")
    scene_name = slugify(ref.get("sceneName", "character_card"), "character_card")
    character = ensure_character(manifest, character_id)
    scene = character.get("scenes", {}).get(scene_name)
    if not scene:
        raise RuntimeError(f"unknown scene {character_id}:{scene_name}")
    path = scene.get("path")
    if not path:
        raise RuntimeError(f"scene has no image path: {character_id}:{scene_name}")
    return f"{character_id}:{scene_name}", assert_project_path(path)


def process_character_image(job: dict) -> None:
    manifest = load_manifest()
    character_id = slugify(job["characterId"], "mara")
    image_name = slugify(job["imageName"], "character_card")
    background_id = slugify(job.get("backgroundId", ""), "loft")
    prompt = job["prompt"].strip()
    if not prompt:
        raise RuntimeError("prompt is required")
    character = ensure_character(manifest, character_id)
    target_rel = scene_path(character_id, image_name)
    target_abs = assert_project_path(target_rel)
    mode = "txt2img"
    refs: list[str] = []
    if image_name != "character_card":
        card = character.get("scenes", {}).get("character_card", {})
        background = manifest.get("backgrounds", {}).get(background_id, {})
        if card.get("path"):
            refs.append(assert_project_path(card["path"]))
        if background.get("path"):
            refs.append(assert_project_path(background["path"]))
        if refs:
            mode = "edit"
    job["status"] = "generating"
    mflux_generate(prompt, target_abs, job, mode=mode, image_paths=refs)
    character["scenes"][image_name] = {
        "type": "image",
        "path": target_rel,
        "prompt": prompt,
        "backgroundId": background_id,
        "generated_at": now_label(),
        "mode": mode,
        "references": [os.path.relpath(path, HERE) for path in refs],
    }
    save_manifest(manifest)
    job["target"] = target_rel
    job["status"] = "done"


def process_background(job: dict) -> None:
    manifest = load_manifest()
    name = slugify(job["name"], "background")
    prompt = job["prompt"].strip()
    if not prompt:
        raise RuntimeError("prompt is required")
    target_rel = rel_path("images", "backgrounds", f"{name}.png")
    target_abs = assert_project_path(target_rel)
    job["status"] = "generating"
    mflux_generate(prompt, target_abs, job)
    manifest.setdefault("backgrounds", {})[name] = {
        "name": job["name"].strip() or name,
        "path": target_rel,
        "prompt": prompt,
        "generated_at": now_label(),
    }
    save_manifest(manifest)
    job["target"] = target_rel
    job["status"] = "done"


def process_video(job: dict) -> None:
    manifest = load_manifest()
    video_type = str(job.get("type") or "LOOPING").upper()
    if video_type not in {"LOOPING", "TRANSITION"}:
        raise RuntimeError("type must be LOOPING or TRANSITION")
    width = int(job.get("width") or 576)
    height = int(job.get("height") or 1024)
    if (width, height) not in ALLOWED_VIDEO_SIZES:
        raise RuntimeError("size must be 192x320, 320x512, or 576x1024")
    frames = max(9, int(job.get("numFrames") or 25))
    seed = job.get("seed")
    prompt = str(job.get("prompt") or "").strip()
    if not prompt:
        raise RuntimeError("prompt is required")
    first_key, first_abs = resolve_scene(manifest, job["firstFrame"])
    end_key = ""
    end_abs = ""
    if job.get("endFrame"):
        end_key, end_abs = resolve_scene(manifest, job["endFrame"])
    if video_type == "TRANSITION" and not end_abs:
        raise RuntimeError("transition video requires an end frame")

    safe_name = slugify(job.get("name") or f"{video_type.lower()}_{int(time.time())}", video_type.lower())
    folder = "transitions" if video_type == "TRANSITION" else "looping"
    target_rel = rel_path("videos", folder, f"{safe_name}.mp4")
    target_abs = assert_project_path(target_rel)
    payload = {
        "prompt": prompt,
        "width": width,
        "height": height,
        "num_frames": frames,
        "fps": 24,
        "seed": seed if seed is not None else None,
        "num_inference_steps": 20,
        "cfg_scale": 3.0,
        "negative_prompt": NEGATIVE_VIDEO,
        "image": first_abs,
        "image_strength": 1.0,
        "tiling": "aggressive",
        "no_audio": True,
        "hidden": True,
    }
    if end_abs:
        payload["image_end"] = end_abs
    job["status"] = "generating"
    ltx_generate(payload, target_abs, job)
    if video_type == "LOOPING":
        first = job["firstFrame"]
        character = ensure_character(manifest, slugify(first.get("characterId", ""), "mara"))
        scene_name = slugify(first.get("sceneName", "character_card"), "character_card")
        character["scenes"].setdefault(scene_name, {})["loopVideo"] = target_rel
        manifest.setdefault("loopingVideos", {})[safe_name] = {
            "type": video_type,
            "path": target_rel,
            "scene": first_key,
            "prompt": prompt,
            "width": width,
            "height": height,
            "numFrames": frames,
            "seed": seed,
            "generated_at": now_label(),
        }
    else:
        rows = [row for row in manifest.setdefault("transitionVideos", []) if row.get("name") != safe_name]
        rows.append({
            "name": safe_name,
            "type": video_type,
            "path": target_rel,
            "from": first_key,
            "to": end_key,
            "prompt": prompt,
            "width": width,
            "height": height,
            "numFrames": frames,
            "seed": seed,
            "generated_at": now_label(),
        })
        manifest["transitionVideos"] = rows
    save_manifest(manifest)
    job["target"] = target_rel
    job["status"] = "done"


def worker_loop() -> None:
    global RUNNING
    while True:
        job = TASKS.get()
        with LOCK:
            RUNNING = job
        try:
            if job["task"] == "character-image":
                process_character_image(job)
            elif job["task"] == "background-image":
                process_background(job)
            elif job["task"] == "video":
                process_video(job)
            else:
                raise RuntimeError(f"unknown task {job['task']}")
        except Exception as exc:
            job["status"] = "failed"
            job["error"] = str(exc)
        with LOCK:
            RUNNING = None
        TASKS.task_done()


def enqueue(task: str, payload: dict) -> dict:
    job = {
        "id": f"drk-{int(time.time() * 1000)}",
        "task": task,
        "status": "queued",
        "created_at": now_label(),
        "label": payload.get("name") or payload.get("imageName") or payload.get("characterId") or task,
        **payload,
    }
    with LOCK:
        JOBS.append(job)
        del JOBS[:-30]
    TASKS.put(job)
    return job


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
        parsed = urllib.parse.urlparse(self.path)
        path = urllib.parse.unquote(parsed.path)
        if path == "/api/status":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            return
        return self.send_static(path, head_only=True)

    def send_json(self, data: dict, status: int = 200) -> None:
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = urllib.parse.unquote(parsed.path)
        if path == "/api/status":
            try:
                manifest = load_manifest()
            except Exception as exc:
                return self.send_json({"ok": False, "error": str(exc)}, 500)
            with LOCK:
                jobs = list(JOBS)
                running = RUNNING
            return self.send_json({
                "ok": True,
                "manifest": manifest,
                "jobs": jobs,
                "running": running,
                "queue_depth": TASKS.qsize(),
                "services": {
                    "mflux": MFLUX_API,
                    "ltx": LTX_API,
                    "image_model": IMAGE_MODEL,
                },
            })
        return self.send_static(path)

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = urllib.parse.unquote(parsed.path)
        if path not in {"/api/character-image", "/api/background-image", "/api/video"}:
            return self.send_json({"ok": False, "error": "not found"}, 404)
        length = int(self.headers.get("Content-Length", "0"))
        try:
            data = json.loads(self.rfile.read(length).decode("utf-8"))
        except json.JSONDecodeError:
            return self.send_json({"ok": False, "error": "invalid json"}, 400)
        try:
            if path == "/api/character-image":
                if not data.get("characterId"):
                    raise RuntimeError("characterId is required")
                if not data.get("imageName"):
                    data["imageName"] = "character_card"
                job = enqueue("character-image", data)
            elif path == "/api/background-image":
                if not data.get("name"):
                    raise RuntimeError("name is required")
                job = enqueue("background-image", data)
            else:
                job = enqueue("video", data)
        except Exception as exc:
            return self.send_json({"ok": False, "error": str(exc)}, 400)
        return self.send_json({"ok": True, "job": job})

    def send_static(self, path: str, head_only: bool = False) -> None:
        if path in {"", "/"}:
            path = "/index.html"
        resolved = os.path.realpath(os.path.join(HERE, path.lstrip("/")))
        if not resolved.startswith(HERE + os.sep):
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
        if head_only:
            return
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        print(f"[{time.strftime('%H:%M:%S')}] {fmt % args}", flush=True)


def main() -> None:
    threading.Thread(target=worker_loop, daemon=True).start()
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"DRK helper serving http://{HOST}:{PORT}/?debug", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
