#!/usr/bin/env python3
"""Local debug helper for Dicey-vid media regeneration.

Run from this folder:
    python3 regen_helper.py

Then open:
    http://127.0.0.1:8788/Dicey-vid/?debug=true

The browser app can also be served from the main site on port 8888. In debug
mode it calls this helper at http://127.0.0.1:8788/Dicey-vid/api/...
"""

from __future__ import annotations

import base64
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import mimetypes
import os
from pathlib import Path
import subprocess
import time
import urllib.parse
import urllib.request


HOST = os.environ.get("DICEY_VID_HELPER_HOST", "127.0.0.1")
PORT = int(os.environ.get("DICEY_VID_HELPER_PORT", "8789"))
SLUG = "Dicey-vid"
ROOT = Path(__file__).resolve().parent
MANIFEST_PATH = ROOT / "media" / "manifest.json"
MFLUX_TXT2IMG = "http://localhost:7867/sdapi/v1/txt2img"
LTX_API = "http://localhost:7866"
IMAGE_MODEL = "flux2-klein-9b-mlx-4bit"
IMAGE_STEPS = 10


def load_manifest() -> dict:
    return json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))


def save_manifest(manifest: dict) -> None:
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


def find_spot(manifest: dict, index: int) -> dict:
    for spot in manifest.get("spots", []):
        if int(spot.get("index", -1)) == int(index):
            return spot
    raise KeyError(f"unknown spot index {index}")


def rel(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def post_json(url: str, payload: dict, timeout: int = 60) -> dict:
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.load(response)


def get_json(url: str, timeout: int = 60) -> dict:
    with urllib.request.urlopen(url, timeout=timeout) as response:
        return json.load(response)


def download(url: str, target: Path, timeout: int = 180) -> None:
    with urllib.request.urlopen(url, timeout=timeout) as response:
        target.write_bytes(response.read())


def mflux_txt2img(prompt: str, width: int, height: int, target: Path) -> str:
    payload = {
        "prompt": prompt,
        "model": IMAGE_MODEL,
        "steps": IMAGE_STEPS,
        "width": width,
        "height": height,
    }
    result = post_json(MFLUX_TXT2IMG, payload, timeout=540)
    image = base64.b64decode(result["images"][0])
    target.write_bytes(image)
    return "flux"


def ffmpeg_color(hex_color: str) -> str:
    return hex_color.replace("#", "0x")


def color_mix(a: str, b: str, t: float) -> str:
    def parts(value: str) -> tuple[int, int, int]:
        value = value.lstrip("#")
        return int(value[0:2], 16), int(value[2:4], 16), int(value[4:6], 16)

    ar, ag, ab = parts(a)
    br, bg, bb = parts(b)
    return "#{:02x}{:02x}{:02x}".format(
        round(ar + (br - ar) * t),
        round(ag + (bg - ag) * t),
        round(ab + (bb - ab) * t),
    )


def placeholder_svg(spot: dict, prompt: str, target: Path) -> str:
    orientation = spot.get("orientation", "square")
    width, height = {
        "square": (512, 512),
        "portrait": (384, 512),
        "landscape": (512, 384),
    }.get(orientation, (512, 512))
    accent = spot.get("accent", "#e94560")
    marker = (spot.get("category") or spot.get("type") or "S")[:2].upper()
    safe_prompt = (
        prompt[:90]
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}">
  <defs>
    <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
      <stop stop-color="#070b13" offset="0"/>
      <stop stop-color="{accent}" offset="1"/>
    </linearGradient>
    <radialGradient id="r" cx="50%" cy="38%" r="60%">
      <stop stop-color="#fff" stop-opacity="0.32" offset="0"/>
      <stop stop-color="{accent}" stop-opacity="0.18" offset="0.48"/>
      <stop stop-color="#070b13" stop-opacity="0" offset="1"/>
    </radialGradient>
  </defs>
  <rect width="{width}" height="{height}" fill="url(#g)"/>
  <rect width="{width}" height="{height}" fill="url(#r)"/>
  <polygon points="0,{height} 0,{height * 0.64:.0f} {width * 0.28:.0f},{height * 0.54:.0f} {width * 0.52:.0f},{height * 0.68:.0f} {width},{height * 0.52:.0f} {width},{height}" fill="#02060d" opacity="0.7"/>
  <circle cx="{width / 2:.0f}" cy="{height * 0.38:.0f}" r="{min(width, height) * 0.2:.0f}" fill="#08111f" opacity="0.76"/>
  <circle cx="{width / 2:.0f}" cy="{height * 0.38:.0f}" r="{min(width, height) * 0.145:.0f}" fill="{accent}" opacity="0.68"/>
  <text x="{width / 2:.0f}" y="{height * 0.42:.0f}" text-anchor="middle" font-family="Arial, sans-serif" font-size="{min(width, height) * 0.14:.0f}" font-weight="900" fill="#fff">{marker}</text>
  <text x="{width / 2:.0f}" y="{height * 0.88:.0f}" text-anchor="middle" font-family="Arial, sans-serif" font-size="{max(14, min(width, height) * 0.035):.0f}" fill="#fff" opacity="0.42">{safe_prompt}</text>
</svg>
"""
    target.write_text(svg, encoding="utf-8")
    return "placeholder"


def placeholder_video(spot: dict, target: Path) -> str:
    width, height = spot.get("videoDimensions") or [192, 192]
    accent = spot.get("accent", "#e94560")
    bg = color_mix("#080c14", accent, 0.25)
    box_w = max(32, width // 3)
    box_h = max(32, height // 3)
    glow_w = max(40, width // 2)
    glow_h = max(28, height // 5)
    vf = (
        "drawbox="
        "x='(iw/2-w/2)+(iw/5)*sin(PI*t)':"
        "y='(ih/2-h/2)+(ih/6)*cos(PI*t)':"
        f"w={box_w}:h={box_h}:color={accent}@0.32:t=fill,"
        "drawbox="
        "x='(iw/2-w/2)+(iw/4)*sin(PI*t+1.57)':"
        "y='(ih*0.72-h/2)':"
        f"w={glow_w}:h={glow_h}:color=white@0.09:t=fill,"
        "vignette,format=yuv420p"
    )
    cmd = [
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-f",
        "lavfi",
        "-i",
        f"color=c={ffmpeg_color(bg)}:s={width}x{height}:r=15:d=2",
        "-vf",
        vf,
        "-an",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "34",
        "-movflags",
        "+faststart",
        str(target),
    ]
    subprocess.run(cmd, check=True)
    return "placeholder-video"


def resolve_image(image_ref: str) -> Path | None:
    if not image_ref or image_ref.startswith("data:"):
        return None
    clean = image_ref.split("?", 1)[0].lstrip("/")
    candidate = ROOT / clean
    try:
        candidate.relative_to(ROOT)
    except ValueError:
        return None
    return candidate if candidate.exists() else None


def ltx_image_to_video(spot: dict, prompt: str, image_path: Path, target: Path) -> str:
    width, height = spot.get("videoDimensions") or [192, 192]
    payload = {
        "prompt": prompt,
        "width": width,
        "height": height,
        "num_frames": 49,
        "fps": 24,
        "seed": int(time.time()) % 100000,
        "num_inference_steps": 18,
        "cfg_scale": 3.0,
        "negative_prompt": "readable text, logo, watermark, broken board tile, people",
        "image": str(image_path),
        "image_strength": 1.0,
        "tiling": "aggressive",
        "no_audio": True,
    }
    job_id = post_json(f"{LTX_API}/api/generate", payload, timeout=60)["job_id"]
    while True:
        job = get_json(f"{LTX_API}/api/jobs/{job_id}", timeout=60)
        status = job.get("status")
        if status == "done":
            download(f"{LTX_API}/api/jobs/{job_id}/file", target, timeout=240)
            return "ltx"
        if status in {"failed", "cancelled"}:
            raise RuntimeError(f"LTX job {job_id} {status}")
        time.sleep(4)


def regenerate_image(payload: dict) -> dict:
    started = time.time()
    manifest = load_manifest()
    spot = find_spot(manifest, int(payload["index"]))
    prompt = payload.get("prompt") or spot.get("imagePrompt") or spot.get("label", "")
    target_dir = ROOT / "media" / "images"
    target_dir.mkdir(parents=True, exist_ok=True)
    stem = spot["id"]
    version = str(int(time.time()))
    png_target = target_dir / f"{stem}-flux.png"
    svg_target = target_dir / f"{stem}-custom.svg"
    width, height = spot.get("imageDimensions") or [512, 512]
    try:
        mode = mflux_txt2img(prompt, width, height, png_target)
        output = png_target
        message = "Flux image generated through local MFLUX."
    except Exception as exc:
        print(f"image fallback for {stem}: {exc}", flush=True)
        mode = placeholder_svg(spot, prompt, svg_target)
        output = svg_target
        message = "MFLUX unavailable; wrote a local placeholder image."

    spot["image"] = rel(output)
    spot["imagePrompt"] = prompt
    spot["status"] = message
    duration = round(time.time() - started, 1)
    spot["lastImageDurationSecs"] = duration
    spot["lastImageMode"] = mode
    save_manifest(manifest)
    return {
        "ok": True,
        "mode": mode,
        "image": rel(output),
        "version": version,
        "message": message,
        "durationSecs": duration,
        "estimatedNextSecs": round(duration + 5, 1),
    }


def regenerate_video(payload: dict) -> dict:
    started = time.time()
    manifest = load_manifest()
    spot = find_spot(manifest, int(payload["index"]))
    prompt = payload.get("prompt") or spot.get("videoPrompt") or spot.get("label", "")
    target_dir = ROOT / "media" / "videos"
    target_dir.mkdir(parents=True, exist_ok=True)
    target = target_dir / f"{spot['id']}-custom.mp4"
    version = str(int(time.time()))
    image_path = resolve_image(payload.get("image") or spot.get("image", ""))
    try:
        if image_path is None:
            raise RuntimeError("current image is not a local raster file")
        mode = ltx_image_to_video(spot, prompt, image_path, target)
        message = "LTX video generated from the current image."
    except Exception as exc:
        print(f"video fallback for {spot['id']}: {exc}", flush=True)
        mode = placeholder_video(spot, target)
        message = "LTX unavailable or image unsuitable; wrote a local placeholder video."

    spot["video"] = rel(target)
    spot["videoPrompt"] = prompt
    spot["status"] = message
    duration = round(time.time() - started, 1)
    spot["lastVideoDurationSecs"] = duration
    spot["lastVideoMode"] = mode
    save_manifest(manifest)
    return {
        "ok": True,
        "mode": mode,
        "video": rel(target),
        "version": version,
        "message": message,
        "durationSecs": duration,
        "estimatedNextSecs": round(duration + 5, 1),
    }


class Handler(BaseHTTPRequestHandler):
    server_version = "DiceyVidRegen/0.1"

    def end_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.end_headers()

    def do_GET(self) -> None:
        rest = self.rest_path()
        if rest == "/api/status":
            manifest = load_manifest()
            self.json_response({
                "ok": True,
                "project": SLUG,
                "spots": len(manifest.get("spots", [])),
                "root": str(ROOT),
            })
            return
        self.serve_static(rest)

    def do_POST(self) -> None:
        rest = self.rest_path()
        try:
            payload = self.read_json()
            if rest == "/api/regenerate-image":
                self.json_response(regenerate_image(payload))
                return
            if rest == "/api/regenerate-video":
                self.json_response(regenerate_video(payload))
                return
            self.error_json(404, "unknown endpoint")
        except Exception as exc:
            self.error_json(500, str(exc))

    def rest_path(self) -> str:
        parsed = urllib.parse.urlparse(self.path)
        path = urllib.parse.unquote(parsed.path)
        prefix = f"/{SLUG}"
        if path == prefix:
            return "/"
        if path.startswith(prefix + "/"):
            return path[len(prefix):]
        return path

    def read_json(self) -> dict:
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length) if length else b"{}"
        return json.loads(raw.decode("utf-8") or "{}")

    def json_response(self, data: dict, status: int = 200) -> None:
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def error_json(self, status: int, message: str) -> None:
        self.json_response({"ok": False, "error": message}, status=status)

    def serve_static(self, rest: str) -> None:
        if rest in {"", "/"}:
            target = ROOT / "index.html"
        else:
            clean = rest.split("?", 1)[0].lstrip("/")
            target = ROOT / clean
        try:
            target.relative_to(ROOT)
        except ValueError:
            self.send_error(403)
            return
        if not target.exists() or target.is_dir():
            self.send_error(404)
            return
        content_type = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        data = target.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def main() -> None:
    os.chdir(ROOT)
    httpd = None
    port = PORT
    for attempt in range(20):
        try:
            httpd = ThreadingHTTPServer((HOST, port), Handler)
            break
        except OSError as exc:
            if getattr(exc, "errno", None) != 48:
                raise
            if attempt == 0:
                print(f"Port {port} is busy; trying the next Dicey-vid helper port.", flush=True)
            port += 1
    if httpd is None:
        raise RuntimeError(f"could not bind Dicey-vid helper near port {PORT}")
    shown_host = "127.0.0.1" if HOST in {"0.0.0.0", "::"} else HOST
    print(f"Dicey-vid helper on http://{shown_host}:{port}/{SLUG}/?debug=true", flush=True)
    httpd.serve_forever()


if __name__ == "__main__":
    main()
