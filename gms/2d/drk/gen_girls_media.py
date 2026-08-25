#!/usr/bin/env python3
"""Generate scene IMAGES (no video) for Sienna, June, and Valentina.

Each girl already has a character_card. This fills the default won-media gallery
slots (cafe_date, rooftop_scene, bedroom_fadeout) and gives dates real scene art.
Runs as a batch through the same Flux plumbing as the debug helper.

    python3 gen_girls_media.py            # generate anything missing
    python3 gen_girls_media.py --force    # regenerate everything
"""

from __future__ import annotations

import argparse
import os

import regen_helper


# sceneName -> backgroundId used as the edit reference
SCENES = {
    "cafe_date": "velvet_cafe",
    "rooftop_scene": "roof_bar",
    "bedroom_fadeout": "loft",
}

GIRLS = {
    "sienna": {
        "cafe_date": (
            "Sienna Park adult woman nightlife host, same identity and face as reference card, seated in the velvet cafe "
            "booth with warm candlelight and a rainy window behind her, crimson cocktail dress with a tailored black jacket, "
            "playful flirtatious half-smile, leaning in close, mature romantic dating sim scene, vertical 576x1024, tasteful, "
            "no explicit nudity, no readable text, no watermark"
        ),
        "rooftop_scene": (
            "Sienna Park adult woman nightlife host, same identity and face as reference card, standing at a rooftop bar glass "
            "rail with glittering city lights behind her, crimson cocktail dress and black jacket, laughing with a cocktail in "
            "hand, lively magnetic energy, mature dating sim scene, vertical 576x1024, tasteful, no explicit nudity, no readable "
            "text, no watermark"
        ),
        "bedroom_fadeout": (
            "safe after-date fade-out scene with Sienna Park adult woman, same identity and face as reference card, a deep red "
            "satin robe over modest sleepwear, sitting on a neatly made bed in soft city light, intimate but non-explicit, "
            "romantic mature dating sim image, vertical 576x1024, no nudity, no sexual act, no readable text, no watermark"
        ),
    },
    "june": {
        "cafe_date": (
            "June Ramos adult woman paramedic and amateur boxer, same identity and face as reference card, seated in the velvet "
            "cafe booth with warm candlelight, an athletic jacket over a fitted top, warm genuine relaxed smile, honest grounded "
            "presence, mature romantic dating sim scene, vertical 576x1024, tasteful, no explicit nudity, no readable text, no "
            "watermark"
        ),
        "rooftop_scene": (
            "June Ramos adult woman paramedic and amateur boxer, same identity and face as reference card, at a rooftop bar rail "
            "with city lights, a casual elegant fitted top, easy confident athletic posture, warm direct eye contact, mature "
            "dating sim scene, vertical 576x1024, tasteful, no explicit nudity, no readable text, no watermark"
        ),
        "bedroom_fadeout": (
            "safe after-date fade-out scene with June Ramos adult woman, same identity and face as reference card, soft cotton "
            "sleepwear and an open hoodie, sitting on a neatly made bed in soft warm light, intimate but non-explicit, romantic "
            "mature dating sim image, vertical 576x1024, no nudity, no sexual act, no readable text, no watermark"
        ),
    },
    "valentina": {
        "cafe_date": (
            "Valentina Ricci adult woman art gallery owner, same identity and face as reference card, seated in the velvet cafe "
            "booth with warm candlelight and a rainy window, tailored ivory blouse and refined jewelry, elegant knowing "
            "half-smile, cultured composed poise, mature romantic dating sim scene, vertical 576x1024, tasteful, no explicit "
            "nudity, no readable text, no watermark"
        ),
        "rooftop_scene": (
            "Valentina Ricci adult woman art gallery owner, same identity and face as reference card, at a rooftop bar with "
            "glittering city lights, sleek refined evening wear, composed magnetic expression, a glass of wine in hand, mature "
            "dating sim scene, vertical 576x1024, tasteful, no explicit nudity, no readable text, no watermark"
        ),
        "bedroom_fadeout": (
            "safe after-date fade-out scene with Valentina Ricci adult woman, same identity and face as reference card, an "
            "elegant ivory silk robe over modest sleepwear, seated on a neatly made bed in soft city light, intimate but "
            "non-explicit, romantic mature dating sim image, vertical 576x1024, no nudity, no sexual act, no readable text, no "
            "watermark"
        ),
    },
}


def scene_exists(character_id: str, image_name: str) -> bool:
    manifest = regen_helper.load_manifest()
    scene = manifest.get("characters", {}).get(character_id, {}).get("scenes", {}).get(image_name)
    return bool(scene and scene.get("path") and os.path.exists(os.path.join(regen_helper.HERE, scene["path"])))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    for character_id, scenes in GIRLS.items():
        for image_name, prompt in scenes.items():
            if not args.force and scene_exists(character_id, image_name):
                print(f"skip {character_id}:{image_name}", flush=True)
                continue
            job = {
                "task": "character-image",
                "characterId": character_id,
                "imageName": image_name,
                "backgroundId": SCENES[image_name],
                "prompt": prompt,
            }
            print(f"generate {character_id}:{image_name} (bg {SCENES[image_name]})", flush=True)
            regen_helper.process_character_image(job)
            if job.get("status") != "done":
                raise RuntimeError(job)
            print(f"  wrote {job.get('target')}", flush=True)

    print("ALL DONE", flush=True)


if __name__ == "__main__":
    main()
