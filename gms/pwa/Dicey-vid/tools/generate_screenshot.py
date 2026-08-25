#!/usr/bin/env python3
"""Create a project-card screenshot for Dicey-vid without a browser."""

from __future__ import annotations

import math
from pathlib import Path
import subprocess


ROOT = Path(__file__).resolve().parents[4]
OUT = ROOT / "assets" / "screenshots" / "dicey-vid.jpg"
TMP = Path("/tmp/dicey-vid-shot.ppm")
W, H = 1280, 800


def rgb(hex_color: str) -> tuple[int, int, int]:
    value = hex_color.lstrip("#")
    return int(value[:2], 16), int(value[2:4], 16), int(value[4:6], 16)


def mix(a: tuple[int, int, int], b: tuple[int, int, int], t: float) -> tuple[int, int, int]:
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


pixels = bytearray(W * H * 3)


def set_px(x: int, y: int, color: tuple[int, int, int]) -> None:
    if 0 <= x < W and 0 <= y < H:
        i = (y * W + x) * 3
        pixels[i:i + 3] = bytes(color)


def fill_rect(x: int, y: int, w: int, h: int, color: tuple[int, int, int]) -> None:
    x0, y0 = max(0, x), max(0, y)
    x1, y1 = min(W, x + w), min(H, y + h)
    row = bytes(color) * max(0, x1 - x0)
    for yy in range(y0, y1):
        start = (yy * W + x0) * 3
        pixels[start:start + len(row)] = row


def fill_circle(cx: int, cy: int, r: int, color: tuple[int, int, int]) -> None:
    rr = r * r
    for y in range(cy - r, cy + r + 1):
        for x in range(cx - r, cx + r + 1):
            if (x - cx) * (x - cx) + (y - cy) * (y - cy) <= rr:
                set_px(x, y, color)


def outline_rect(x: int, y: int, w: int, h: int, color: tuple[int, int, int], thickness: int = 2) -> None:
    fill_rect(x, y, w, thickness, color)
    fill_rect(x, y + h - thickness, w, thickness, color)
    fill_rect(x, y, thickness, h, color)
    fill_rect(x + w - thickness, y, thickness, h, color)


def draw_gradient() -> None:
    top = rgb("#08111c")
    bottom = rgb("#110d17")
    warm = rgb("#e94560")
    gold = rgb("#f5c518")
    for y in range(H):
        base = mix(top, bottom, y / H)
        for x in range(W):
            dx = (x - W * 0.18) / W
            dy = (y - H * 0.25) / H
            glow = max(0.0, 1.0 - math.sqrt(dx * dx + dy * dy) * 4.0)
            dx2 = (x - W * 0.82) / W
            dy2 = (y - H * 0.78) / H
            glow2 = max(0.0, 1.0 - math.sqrt(dx2 * dx2 + dy2 * dy2) * 3.2)
            color = mix(base, warm, glow * 0.18)
            color = mix(color, gold, glow2 * 0.12)
            set_px(x, y, color)


def draw_text_block() -> None:
    fill_rect(90, 132, 420, 8, rgb("#f5c518"))
    fill_rect(90, 160, 260, 28, rgb("#f5c518"))
    fill_rect(90, 202, 360, 18, rgb("#ffffff"))
    fill_rect(90, 234, 320, 14, rgb("#8fa0b8"))
    fill_rect(90, 278, 190, 44, rgb("#e94560"))
    fill_rect(300, 278, 170, 44, rgb("#16213e"))
    for i, color in enumerate(["#e74c3c", "#2980b9", "#9b59b6", "#2ecc71"]):
        fill_circle(125 + i * 54, 395, 18, rgb(color))
    fill_rect(90, 470, 350, 4, rgb("#2ecc71"))
    fill_rect(90, 492, 260, 4, rgb("#3498db"))
    fill_rect(90, 514, 310, 4, rgb("#e67e22"))


def draw_board() -> None:
    board = 620
    bx, by = 560, 88
    fill_rect(bx - 14, by - 14, board + 28, board + 28, rgb("#05080d"))
    fill_rect(bx, by, board, board, rgb("#091421"))
    center_pad = 126
    fill_rect(bx + center_pad, by + center_pad, board - center_pad * 2, board - center_pad * 2, rgb("#101d2b"))
    outline_rect(bx + center_pad, by + center_pad, board - center_pad * 2, board - center_pad * 2, rgb("#24374e"), 3)
    fill_circle(bx + board // 2, by + board // 2, 90, rgb("#172a3d"))
    fill_circle(bx + board // 2, by + board // 2, 46, rgb("#f5c518"))

    accents = [
        "#f5c518", "#e74c3c", "#9b59b6", "#2980b9", "#e67e22", "#f39c12", "#c0392b", "#9b59b6",
        "#3498db", "#e67e22", "#27ae60", "#d35400", "#9b59b6", "#2ecc71", "#8e44ad", "#e74c3c",
        "#2ecc71", "#e74c3c", "#9b59b6", "#3498db", "#e67e22", "#2c3e50", "#c0392b", "#9b59b6",
        "#e94560", "#e74c3c", "#2980b9", "#9b59b6", "#f39c12", "#c0392b", "#27ae60", "#e67e22",
    ]
    cs = int(board / (7 + 2 * 1.4) * 1.4)
    ns = int(board / (7 + 2 * 1.4))
    positions = {}
    positions[0] = (bx + board - cs, by + board - cs, cs, cs)
    for i in range(1, 8):
        positions[i] = (bx + board - cs - i * ns, by + board - cs, ns, cs)
    positions[8] = (bx, by + board - cs, cs, cs)
    for i in range(1, 8):
        positions[8 + i] = (bx, by + board - cs - i * ns, cs, ns)
    positions[16] = (bx, by, cs, cs)
    for i in range(1, 8):
        positions[16 + i] = (bx + cs + (i - 1) * ns, by, ns, cs)
    positions[24] = (bx + board - cs, by, cs, cs)
    for i in range(1, 8):
        positions[24 + i] = (bx + board - cs, by + cs + (i - 1) * ns, cs, ns)

    for i in range(32):
        x, y, w, h = positions[i]
        accent = rgb(accents[i])
        fill_rect(x + 2, y + 2, w - 4, h - 4, mix(rgb("#07101a"), accent, 0.35))
        fill_rect(x + 7, y + 7, max(8, w // 4), max(8, h // 4), mix(rgb("#ffffff"), accent, 0.18))
        fill_rect(x + w // 3, y + h // 2, max(10, w // 2), max(8, h // 5), mix(rgb("#02050a"), accent, 0.42))
        outline_rect(x, y, w, h, rgb("#dce8ff"), 1)

    for x, y, color in [(1048, 588, "#3498db"), (1014, 620, "#e94560"), (1084, 621, "#2ecc71"), (1050, 652, "#f39c12")]:
        fill_circle(x, y, 15, rgb(color))
        outline_rect(x - 15, y - 15, 30, 30, rgb("#ffffff"), 2)


draw_gradient()
draw_text_block()
draw_board()

TMP.write_bytes(f"P6\n{W} {H}\n255\n".encode("ascii") + pixels)
OUT.parent.mkdir(parents=True, exist_ok=True)
subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(TMP), "-q:v", "3", str(OUT)], check=True)
print(OUT)
