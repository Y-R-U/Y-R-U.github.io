#!/usr/bin/env python3
"""Generate the player's home-base scene images (Alex's loft).

The game opens here instead of staring at a romance character. Images only.

    python3 gen_player_media.py          # generate anything missing
    python3 gen_player_media.py --force  # regenerate
"""

from __future__ import annotations

import argparse
import os

import regen_helper


SCENES = {
    "home_base": (
        "Alex Vale adult man age 27, same identity and face as reference card, in his compact city loft apartment in soft "
        "morning light, casual white tee, standing near a window with a city view, a small desk with a laptop and rent "
        "notices, a neatly made bed, relaxed but determined expression, cinematic realistic, vertical 576x1024 life sim "
        "home base scene, no readable text, no watermark"
    ),
    "home_night": (
        "Alex Vale adult man age 27, same identity and face as reference card, in his compact city loft apartment at night, "
        "warm lamp light and moody green neon from the window, casual clothes, sitting on the edge of a neatly made bed with "
        "the glow of a laptop, contemplative expression, cinematic realistic, vertical 576x1024 life sim home base scene, no "
        "readable text, no watermark"
    ),
}


def scene_exists(image_name: str) -> bool:
    manifest = regen_helper.load_manifest()
    scene = manifest.get("characters", {}).get("alex", {}).get("scenes", {}).get(image_name)
    return bool(scene and scene.get("path") and os.path.exists(os.path.join(regen_helper.HERE, scene["path"])))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    for image_name, prompt in SCENES.items():
        if not args.force and scene_exists(image_name):
            print(f"skip alex:{image_name}", flush=True)
            continue
        job = {
            "task": "character-image",
            "characterId": "alex",
            "imageName": image_name,
            "backgroundId": "loft",
            "prompt": prompt,
        }
        print(f"generate alex:{image_name} (bg loft)", flush=True)
        regen_helper.process_character_image(job)
        if job.get("status") != "done":
            raise RuntimeError(job)
        print(f"  wrote {job.get('target')}", flush=True)

    print("ALL DONE", flush=True)


if __name__ == "__main__":
    main()
