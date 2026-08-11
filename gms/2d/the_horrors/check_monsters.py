#!/usr/bin/env python3
"""Score the monster clips in js/variants.js and pick the best take.

Cheap objective checks only — they catch the failure modes LTX actually has on
this box, and leave taste to the reviewer in the debug panel:

  dark      mean luminance collapsed (the render went black)
  static    last frame ≈ first frame (the creature never moved)
  runaway   huge frame-to-frame delta (tessellation / structure collapse)
  tiny      suspiciously small file (encoder gave up)

Frames are sampled with ffmpeg and compared with `sips`-free pure-python PPM
parsing so there is no Pillow/numpy dependency.

    python3 check_monsters.py                  # score everything, print a table
    python3 check_monsters.py --select         # also set `selected` to the best take
    python3 check_monsters.py --failures       # print just the ids worth re-rendering
"""

import argparse
import json
import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
VARIANTS_PATH = os.path.join(HERE, "js", "variants.js")
VIDEO_DIR = os.path.join(HERE, "videos")
SAMPLE_WIDTH = 64
MIN_BYTES = 60 * 1024


def load_variants():
    with open(VARIANTS_PATH, "r", encoding="utf-8") as handle:
        raw = handle.read()
    return raw[:raw.index("{")], json.loads(raw[raw.index("{"):raw.rindex("}") + 1])


def save_variants(header, data):
    with open(VARIANTS_PATH, "w", encoding="utf-8") as handle:
        handle.write(header + json.dumps(data, indent=2, sort_keys=True) + ";\n")


def duration(path):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
        capture_output=True, text=True, check=False,
    ).stdout.strip()
    try:
        return float(out)
    except ValueError:
        return 0.0


def frame_pixels(path, at_seconds, work_dir, tag):
    """One frame as a flat list of (r, g, b), downsampled hard."""
    out = os.path.join(work_dir, f"{tag}.ppm")
    result = subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-ss", f"{at_seconds:.3f}",
         "-i", path, "-frames:v", "1", "-vf", f"scale={SAMPLE_WIDTH}:-1", "-pix_fmt", "rgb24", out],
        capture_output=True, check=False,
    )
    if result.returncode != 0 or not os.path.exists(out):
        return []
    with open(out, "rb") as handle:
        blob = handle.read()
    # P6 header: magic, width, height, maxval — each whitespace separated.
    fields, index = [], 2
    while len(fields) < 3:
        while index < len(blob) and blob[index:index + 1].isspace():
            index += 1
        if blob[index:index + 1] == b"#":
            while index < len(blob) and blob[index:index + 1] != b"\n":
                index += 1
            continue
        start = index
        while index < len(blob) and not blob[index:index + 1].isspace():
            index += 1
        fields.append(int(blob[start:index]))
    index += 1
    body = blob[index:]
    return [tuple(body[i:i + 3]) for i in range(0, len(body) - 2, 3)]


def luminance(pixels):
    if not pixels:
        return 0.0
    return sum(0.2126 * r + 0.7152 * g + 0.0722 * b for r, g, b in pixels) / len(pixels)


def mean_abs_diff(a, b):
    if not a or not b or len(a) != len(b):
        return 0.0
    total = sum(abs(x[0] - y[0]) + abs(x[1] - y[1]) + abs(x[2] - y[2]) for x, y in zip(a, b))
    return total / (len(a) * 3)


def score(path):
    if not os.path.exists(path):
        return {"ok": False, "flags": ["missing"], "score": 0}
    size = os.path.getsize(path)
    length = duration(path)
    flags = []
    if size < MIN_BYTES:
        flags.append("tiny")
    if length <= 0.5:
        flags.append("short")
        return {"ok": False, "flags": flags, "score": 0, "bytes": size}
    with tempfile.TemporaryDirectory() as work:
        first = frame_pixels(path, 0.05, work, "first")
        mid = frame_pixels(path, length / 2, work, "mid")
        last = frame_pixels(path, max(0, length - 0.12), work, "last")
    lum = [luminance(f) for f in (first, mid, last)]
    travel = mean_abs_diff(first, last)
    step = max(mean_abs_diff(first, mid), mean_abs_diff(mid, last))
    if max(lum) < 22:
        flags.append("dark")
    # A clip can start bright and still be unreadable where it matters: dark
    # creatures against a dim corridor lose the monster in the middle of the
    # clip, which is exactly when the player is looking at it.
    if lum[1] < 26:
        flags.append("murky")
    if travel < 6:
        flags.append("static")
    if step > 95:
        flags.append("runaway")
    # Reward motion, penalise the failure modes. Deliberately blunt: this only
    # has to order takes sensibly, the reviewer makes the call.
    value = min(travel, 60) + (10 if 25 <= min(lum) else 0) - 40 * len(flags)
    return {
        "ok": not flags,
        "flags": flags,
        "score": round(value, 1),
        "bytes": size,
        "seconds": round(length, 2),
        "luminance": [round(x, 1) for x in lum],
        "travel": round(travel, 1),
        "step": round(step, 1),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--select", action="store_true", help="set selected to the best-scoring take")
    parser.add_argument("--failures", action="store_true", help="print only clips worth re-rendering")
    args = parser.parse_args()

    header, data = load_variants()
    failures = []
    for clip_key in sorted(data["clips"]):
        entry = data["clips"][clip_key]
        scored = []
        for variant in entry["variants"]:
            result = score(os.path.join(VIDEO_DIR, variant["file"]))
            variant["score"] = result["score"]
            variant["flags"] = result["flags"]
            scored.append((result["score"], variant, result))
        if not scored:
            continue
        scored.sort(key=lambda row: row[0], reverse=True)
        best = scored[0]
        # Selection is "newest clean take wins", NOT "highest score wins". The
        # score rewards pixel travel, which systematically under-rates the v2+
        # release clips: they are a deliberate two-step walk, where the v1 clips
        # had the creature materialising out of nothing. Side-by-side last
        # frames confirmed v2 reads better on identity and framing every time it
        # scored lower. So only fall back to score when every take is flagged.
        clean = [row for row in scored if row[2]["ok"]]
        choice = max(clean, key=lambda row: row[1]["n"]) if clean else best
        if args.select and choice[0] > 0 or (args.select and clean):
            entry["selected"] = choice[1]["src"]
        if not any(row[2]["ok"] for row in scored):
            failures.append(clip_key)
        if args.failures:
            continue
        print(f"{clip_key:34} use v{choice[1]['n']} score {choice[0]:>6}  "
              f"{','.join(choice[2]['flags']) or 'ok':<18} "
              + "  ".join(f"v{v['n']}:{s}{'!' if not r['ok'] else ''}" for s, v, r in scored))

    if args.failures:
        print("\n".join(failures))
    else:
        print(f"\n{len(failures)} clip(s) with no usable take: {', '.join(failures) or 'none'}")
    if args.select:
        save_variants(header, data)
        print("selections written to js/variants.js")


if __name__ == "__main__":
    sys.exit(main())
