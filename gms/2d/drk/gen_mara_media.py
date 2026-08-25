#!/usr/bin/env python3
"""Populate a complete Mara media test set for DRK.

This uses the same local Flux/LTX plumbing as the debug helper, but runs as a
batch so one character has enough images/videos to test every debug path.
"""

from __future__ import annotations

import argparse
import os

import regen_helper


SCENES = [
    {
        "imageName": "market_scene",
        "backgroundId": "market_floor",
        "prompt": (
            "Mara Voss adult woman venture scout, same identity as reference card, standing beside a dark trading desk "
            "inside the market floor background, black suit dress, emerald earrings, confident evaluating expression, "
            "cinematic mature dating sim scene, vertical 576x1024, tasteful, no explicit nudity, no readable text, no watermark"
        ),
    },
    {
        "imageName": "cafe_date",
        "backgroundId": "velvet_cafe",
        "prompt": (
            "Mara Voss adult woman venture scout, same identity as reference card, seated in the velvet cafe booth "
            "with warm candlelight and rainy window, jacket relaxed but elegant, direct intimate eye contact, "
            "mature romantic dating sim scene, vertical 576x1024, tasteful, no explicit nudity, no readable text, no watermark"
        ),
    },
    {
        "imageName": "rooftop_scene",
        "backgroundId": "roof_bar",
        "prompt": (
            "Mara Voss adult woman venture scout, same identity as reference card, standing at a rooftop bar glass rail "
            "with city lights behind her, black evening dress under tailored blazer, subtle smile, poised romantic tension, "
            "mature dating sim scene, vertical 576x1024, tasteful, no explicit nudity, no readable text, no watermark"
        ),
    },
    {
        "imageName": "bedroom_fadeout",
        "backgroundId": "loft",
        "prompt": (
            "safe after-date fade-out scene with Mara Voss adult woman, same identity as reference card, elegant satin robe "
            "over modest sleepwear, sitting on a neatly made bed in soft city light, intimate but non-explicit, "
            "romantic mature dating sim image, vertical 576x1024, no nudity, no sexual act, no readable text, no watermark"
        ),
    },
]

VIDEOS = [
    {
        "name": "mara_market_loop_576",
        "type": "LOOPING",
        "firstFrame": {"characterId": "mara", "sceneName": "market_scene"},
        "endFrame": None,
        "width": 576,
        "height": 1024,
        "numFrames": 25,
        "seed": 240611,
        "prompt": (
            "subtle looping motion, Mara Voss breathes and shifts her weight beside the trading desk, "
            "city market screens glow softly, preserve identity, outfit, composition, and background, mature dating sim, no text, no watermark"
        ),
    },
    {
        "name": "mara_cafe_loop_192",
        "type": "LOOPING",
        "firstFrame": {"characterId": "mara", "sceneName": "cafe_date"},
        "endFrame": None,
        "width": 192,
        "height": 320,
        "numFrames": 25,
        "seed": 240612,
        "prompt": (
            "subtle looping cafe date motion, candle flickers, Mara Voss gives a small knowing smile and slight head movement, "
            "preserve identity and composition, mature romantic dating sim, no text, no watermark"
        ),
    },
    {
        "name": "mara_rooftop_loop_320",
        "type": "LOOPING",
        "firstFrame": {"characterId": "mara", "sceneName": "rooftop_scene"},
        "endFrame": None,
        "width": 320,
        "height": 512,
        "numFrames": 25,
        "seed": 240613,
        "prompt": (
            "subtle looping rooftop motion, night breeze moves Mara Voss hair and blazer slightly, city lights shimmer, "
            "preserve identity and tasteful mature tone, no text, no watermark"
        ),
    },
    {
        "name": "mara_card_to_cafe_192",
        "type": "TRANSITION",
        "firstFrame": {"characterId": "mara", "sceneName": "character_card"},
        "endFrame": {"characterId": "mara", "sceneName": "cafe_date"},
        "width": 192,
        "height": 320,
        "numFrames": 25,
        "seed": 240621,
        "prompt": (
            "smooth cinematic transition from Mara Voss formal character card into an intimate cafe date booth, "
            "camera glides closer, preserve identity and elegant outfit, mature dating sim, no text, no watermark"
        ),
    },
    {
        "name": "mara_cafe_to_rooftop_320",
        "type": "TRANSITION",
        "firstFrame": {"characterId": "mara", "sceneName": "cafe_date"},
        "endFrame": {"characterId": "mara", "sceneName": "rooftop_scene"},
        "width": 320,
        "height": 512,
        "numFrames": 25,
        "seed": 240622,
        "prompt": (
            "smooth cinematic transition from the candlelit cafe date to the rooftop bar at night, "
            "Mara Voss remains elegant and composed, preserve identity, mature romantic game scene, no text, no watermark"
        ),
    },
    {
        "name": "mara_rooftop_to_fadeout_576",
        "type": "TRANSITION",
        "firstFrame": {"characterId": "mara", "sceneName": "rooftop_scene"},
        "endFrame": {"characterId": "mara", "sceneName": "bedroom_fadeout"},
        "width": 576,
        "height": 1024,
        "numFrames": 25,
        "seed": 240623,
        "prompt": (
            "safe romantic fade-out transition from rooftop city lights to a modest bedroom fade-out scene, "
            "Mara Voss remains tasteful and non-explicit, soft cinematic motion, no nudity, no sexual act, no text, no watermark"
        ),
    },
]


def scene_exists(image_name: str) -> bool:
    manifest = regen_helper.load_manifest()
    scene = manifest.get("characters", {}).get("mara", {}).get("scenes", {}).get(image_name)
    return bool(scene and scene.get("path") and os.path.exists(os.path.join(regen_helper.HERE, scene["path"])))


def video_exists(name: str) -> bool:
    manifest = regen_helper.load_manifest()
    for row in manifest.get("transitionVideos", []):
        if row.get("name") == name and row.get("path") and os.path.exists(os.path.join(regen_helper.HERE, row["path"])):
            return True
    row = manifest.get("loopingVideos", {}).get(name)
    return bool(row and row.get("path") and os.path.exists(os.path.join(regen_helper.HERE, row["path"])))


def run_images(force: bool) -> None:
    for scene in SCENES:
        if not force and scene_exists(scene["imageName"]):
            print(f"skip image {scene['imageName']}", flush=True)
            continue
        job = {"task": "character-image", "characterId": "mara", **scene}
        print(f"generate image {scene['imageName']}", flush=True)
        regen_helper.process_character_image(job)
        if job.get("status") != "done":
            raise RuntimeError(job)
        print(f"  wrote {job.get('target')}", flush=True)


def run_videos(force: bool) -> None:
    for video in VIDEOS:
        if not force and video_exists(video["name"]):
            print(f"skip video {video['name']}", flush=True)
            continue
        job = {"task": "video", **video}
        print(
            f"generate video {video['name']} {video['type']} "
            f"{video['width']}x{video['height']} {video['numFrames']}f",
            flush=True,
        )
        regen_helper.process_video(job)
        if job.get("status") != "done":
            raise RuntimeError(job)
        print(f"  wrote {job.get('target')}", flush=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--images-only", action="store_true")
    parser.add_argument("--videos-only", action="store_true")
    args = parser.parse_args()
    if not args.videos_only:
        run_images(args.force)
    if not args.images_only:
        run_videos(args.force)


if __name__ == "__main__":
    main()

