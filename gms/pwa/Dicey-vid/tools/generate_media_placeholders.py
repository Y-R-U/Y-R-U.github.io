#!/usr/bin/env python3
"""Generate starter media for Dicey-vid.

These are deliberately lightweight placeholders. The manifest keeps Flux/LTX
prompts next to every spot so the debug helper can replace any still or video
with generated media later without changing game code.
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MEDIA = ROOT / "media"
IMAGE_DIR = MEDIA / "images"
VIDEO_DIR = MEDIA / "videos"
MANIFEST = MEDIA / "manifest.json"

IMAGE_SIZES = {
    "square": (512, 512),
    "portrait": (384, 512),
    "landscape": (512, 384),
}

VIDEO_SIZES = {
    "square": (192, 192),
    "portrait": (192, 256),
    "landscape": (256, 192),
}

SKILLS = {
    "pickpocket": ("Pickpocket", "attack", 100, "#e74c3c", "sleight hand market alley"),
    "ambush": ("Ambush", "attack", 150, "#c0392b", "hidden bridge ambush point"),
    "sabotage": ("Sabotage", "attack", 120, "#e67e22", "sparking machine room trap"),
    "shakedown": ("Shakedown", "attack", 180, "#d35400", "street checkpoint pressure"),
    "jinx": ("Jinx", "attack", 80, "#8e44ad", "glowing misfortune shrine"),
    "taxman": ("Tax Collector", "attack", 200, "#e74c3c", "bureaucratic toll tower"),
    "tollbooth": ("Toll Booth", "attack", 130, "#e74c3c", "armored road toll booth"),
    "bounty": ("Bounty Hunter", "attack", 170, "#c0392b", "target board rooftop pursuit"),
    "bodyguard": ("Bodyguard", "defense", 100, "#2980b9", "shielded safehouse guard"),
    "goldmine": ("Gold Mine", "defense", 150, "#f39c12", "crystal gold mine vault"),
    "healer": ("Healer", "defense", 120, "#27ae60", "neon medical garden"),
    "forge": ("Shield Forge", "defense", 200, "#2ecc71", "glowing armor forge"),
    "mirror": ("Mirror Shield", "defense", 160, "#3498db", "reflective glass shield room"),
    "vault": ("Vault", "defense", 140, "#2c3e50", "locked steel money vault"),
}

BOARD_SPACES = [
    {"type": "go", "name": "START"},
    {"type": "skill", "skillId": "pickpocket"},
    {"type": "fate", "name": "Fate"},
    {"type": "skill", "skillId": "bodyguard"},
    {"type": "tax", "name": "Toll Gate"},
    {"type": "skill", "skillId": "goldmine"},
    {"type": "skill", "skillId": "ambush"},
    {"type": "fate", "name": "Fate"},
    {"type": "jail", "name": "Hospital"},
    {"type": "skill", "skillId": "sabotage"},
    {"type": "skill", "skillId": "healer"},
    {"type": "skill", "skillId": "shakedown"},
    {"type": "fate", "name": "Fate"},
    {"type": "skill", "skillId": "forge"},
    {"type": "skill", "skillId": "jinx"},
    {"type": "skill", "skillId": "tollbooth"},
    {"type": "rest", "name": "Rest Stop"},
    {"type": "skill", "skillId": "taxman"},
    {"type": "fate", "name": "Fate"},
    {"type": "skill", "skillId": "mirror"},
    {"type": "tax", "name": "Black Market"},
    {"type": "skill", "skillId": "vault"},
    {"type": "skill", "skillId": "bounty"},
    {"type": "fate", "name": "Fate"},
    {"type": "goToJail", "name": "Injury"},
    {"type": "skill", "skillId": "pickpocket"},
    {"type": "skill", "skillId": "bodyguard"},
    {"type": "fate", "name": "Fate"},
    {"type": "skill", "skillId": "goldmine"},
    {"type": "skill", "skillId": "ambush"},
    {"type": "skill", "skillId": "healer"},
    {"type": "skill", "skillId": "sabotage"},
]

SPECIAL = {
    "go": ("START", "#f5c518", "sunlit start plaza with golden dice monument"),
    "fate": ("Fate", "#9b59b6", "mystic dice portal with swirling violet energy"),
    "tax": ("Tax", "#e67e22", "busy toll gate and coin counter booth"),
    "jail": ("Hospital", "#3498db", "clean recovery ward with blue medical light"),
    "rest": ("Rest", "#2ecc71", "quiet roadside rest garden with shield lanterns"),
    "goToJail": ("Injury", "#e94560", "warning flare roadblock near emergency bay"),
}


def orientation(index: int) -> str:
    if index in {0, 8, 16, 24}:
        return "square"
    if 1 <= index <= 7 or 17 <= index <= 23:
        return "portrait"
    return "landscape"


def slug_for(index: int, space: dict) -> str:
    if space["type"] == "skill":
        return f"{index:02d}_{space['skillId']}"
    name = space.get("name", space["type"]).lower().replace(" ", "_")
    return f"{index:02d}_{name}"


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


def stable_float(seed: str, offset: int) -> float:
    raw = hashlib.sha256(f"{seed}:{offset}".encode("utf-8")).digest()
    return int.from_bytes(raw[:2], "big") / 65535


def polygon_points(width: int, height: int, seed: str, y_base: float, amp: float) -> str:
    points = [(0, height)]
    for i in range(7):
        x = round(width * i / 6)
        wave = math.sin((i + stable_float(seed, 1)) * 1.7) * 0.5 + 0.5
        jitter = stable_float(seed, i + 10) * amp
        y = round(height * y_base + wave * amp + jitter)
        points.append((x, y))
    points.append((width, height))
    return " ".join(f"{x},{y}" for x, y in points)


def make_svg(path: Path, *, index: int, label: str, accent: str, kind: str, orient: str, prompt_hint: str) -> None:
    width, height = IMAGE_SIZES[orient]
    seed = f"{index}-{label}-{prompt_hint}"
    dark = color_mix("#060a12", accent, 0.18)
    mid = color_mix("#12192a", accent, 0.32)
    pale = color_mix("#dff6ff", accent, 0.22)
    ridge_a = polygon_points(width, height, seed, 0.52, height * 0.13)
    ridge_b = polygon_points(width, height, seed + "b", 0.63, height * 0.11)
    ridge_c = polygon_points(width, height, seed + "c", 0.74, height * 0.08)
    badge_size = min(width, height) * 0.24
    badge_x = width * 0.5
    badge_y = height * 0.38
    type_mark = {"attack": "A", "defense": "D"}.get(kind, "S")
    if kind in {"go", "fate", "tax", "jail", "rest", "goToJail"}:
        type_mark = {
            "go": "GO",
            "fate": "?",
            "tax": "$",
            "jail": "+",
            "rest": "R",
            "goToJail": "!",
        }[kind]

    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" width="{width}" height="{height}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="{dark}"/>
      <stop offset="0.58" stop-color="{mid}"/>
      <stop offset="1" stop-color="{accent}"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="38%" r="54%">
      <stop offset="0" stop-color="{pale}" stop-opacity="0.5"/>
      <stop offset="0.42" stop-color="{accent}" stop-opacity="0.24"/>
      <stop offset="1" stop-color="{dark}" stop-opacity="0"/>
    </radialGradient>
    <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="{height * 0.025:.1f}" stdDeviation="{height * 0.02:.1f}" flood-color="#000000" flood-opacity="0.45"/>
    </filter>
  </defs>
  <rect width="{width}" height="{height}" fill="url(#sky)"/>
  <rect width="{width}" height="{height}" fill="url(#glow)"/>
  <circle cx="{width * 0.18:.1f}" cy="{height * 0.2:.1f}" r="{min(width, height) * 0.09:.1f}" fill="{pale}" opacity="0.18"/>
  <polygon points="{ridge_a}" fill="{color_mix(dark, accent, 0.2)}" opacity="0.9"/>
  <polygon points="{ridge_b}" fill="{color_mix(dark, accent, 0.34)}" opacity="0.95"/>
  <polygon points="{ridge_c}" fill="{color_mix("#02050a", accent, 0.26)}" opacity="0.98"/>
  <g filter="url(#softShadow)">
    <circle cx="{badge_x:.1f}" cy="{badge_y:.1f}" r="{badge_size:.1f}" fill="#08111f" opacity="0.72"/>
    <circle cx="{badge_x:.1f}" cy="{badge_y:.1f}" r="{badge_size * 0.78:.1f}" fill="{accent}" opacity="0.72"/>
    <path d="M {badge_x - badge_size * 0.65:.1f} {badge_y + badge_size * 0.08:.1f} L {badge_x:.1f} {badge_y - badge_size * 0.68:.1f} L {badge_x + badge_size * 0.65:.1f} {badge_y + badge_size * 0.08:.1f} L {badge_x:.1f} {badge_y + badge_size * 0.66:.1f} Z" fill="{pale}" opacity="0.3"/>
    <text x="{badge_x:.1f}" y="{badge_y + badge_size * 0.18:.1f}" text-anchor="middle" font-family="Arial, sans-serif" font-size="{badge_size * 0.72:.1f}" font-weight="900" fill="#ffffff">{type_mark}</text>
  </g>
  <g opacity="0.36">
    <path d="M {width * 0.08:.1f} {height * 0.88:.1f} C {width * 0.28:.1f} {height * 0.78:.1f}, {width * 0.58:.1f} {height * 0.97:.1f}, {width * 0.92:.1f} {height * 0.78:.1f}" stroke="{pale}" stroke-width="{max(3, min(width, height) * 0.018):.1f}" fill="none"/>
    <path d="M {width * 0.04:.1f} {height * 0.12:.1f} L {width * 0.28:.1f} {height * 0.05:.1f} L {width * 0.52:.1f} {height * 0.12:.1f} L {width * 0.76:.1f} {height * 0.05:.1f} L {width * 0.96:.1f} {height * 0.11:.1f}" stroke="#ffffff" stroke-width="2" fill="none" opacity="0.28"/>
  </g>
</svg>
"""
    path.write_text(svg, encoding="utf-8")


def ffmpeg_color(hex_color: str) -> str:
    return hex_color.replace("#", "0x")


def make_video(path: Path, *, accent: str, orient: str, index: int) -> None:
    width, height = VIDEO_SIZES[orient]
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
        str(path),
    ]
    subprocess.run(cmd, check=True)


def spot_prompt(label: str, kind: str, hint: str, orient: str) -> str:
    composition = {
        "square": "balanced square board-tile composition",
        "portrait": "vertical portrait board-tile composition",
        "landscape": "wide landscape board-tile composition",
    }[orient]
    return (
        f"{label}, {hint}, low-poly premium board game tile art, {composition}, "
        "cinematic lighting, crisp readable silhouettes, rich color contrast, no UI, no readable text, no watermark"
    )


def video_prompt(label: str, kind: str, hint: str) -> str:
    return (
        f"{label}, tiny seamless looping board-space animation, subtle parallax, drifting lights, "
        f"{hint}, no people, no readable text, no watermark, smooth loop"
    )


def build_manifest() -> dict:
    IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    VIDEO_DIR.mkdir(parents=True, exist_ok=True)
    spots = []
    for index, space in enumerate(BOARD_SPACES):
        orient = orientation(index)
        slug = slug_for(index, space)
        if space["type"] == "skill":
            label, kind, price, accent, hint = SKILLS[space["skillId"]]
        else:
            label, accent, hint = SPECIAL[space["type"]]
            kind = space["type"]
            price = 0
        image = f"media/images/{slug}.svg"
        video = f"media/videos/{slug}.mp4"
        make_svg(ROOT / image, index=index, label=label, accent=accent, kind=kind, orient=orient, prompt_hint=hint)
        make_video(ROOT / video, accent=accent, orient=orient, index=index)
        spots.append(
            {
                "index": index,
                "id": slug,
                "label": label,
                "type": space["type"],
                "skillId": space.get("skillId", ""),
                "category": kind,
                "orientation": orient,
                "image": image,
                "video": video,
                "imageDimensions": IMAGE_SIZES[orient],
                "videoDimensions": VIDEO_SIZES[orient],
                "imagePrompt": spot_prompt(label, kind, hint, orient),
                "videoPrompt": video_prompt(label, kind, hint),
                "accent": accent,
                "price": price,
                "status": "Starter placeholder. Use debug mode to re-roll with local Flux/LTX when available.",
            }
        )
    return {
        "version": 1,
        "title": "Dicey-vid",
        "notes": [
            "Images are shown on every board spot.",
            "Videos are tiny, LTX-friendly multiples of 64, and only active spots should play.",
            "Square stills target 512x512; portrait and landscape stills use similar area.",
        ],
        "limits": {
            "maxActiveVideos": 4,
            "imageModel": "flux2-klein-9b-mlx-4bit",
            "videoService": "LTX local API",
        },
        "spots": spots,
    }


def main() -> None:
    MEDIA.mkdir(parents=True, exist_ok=True)
    manifest = build_manifest()
    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {MANIFEST.relative_to(ROOT)} with {len(manifest['spots'])} spots")


if __name__ == "__main__":
    main()
