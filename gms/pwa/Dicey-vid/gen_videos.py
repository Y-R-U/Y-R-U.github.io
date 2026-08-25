#!/usr/bin/env python3
"""Generate Dicey-vid spot videos through the local helper pipeline.

Videos use each spot's current manifest image, so run gen_images.py first if
you want LTX to animate fresh Flux stills.
"""

from __future__ import annotations

import sys

from regen_helper import load_manifest, regenerate_video


def wanted(spot: dict, filters: set[str]) -> bool:
    if not filters:
        return True
    haystack = f"{spot.get('index')} {spot.get('id')} {spot.get('label')} {spot.get('skillId')}".lower()
    return any(item.lower() in haystack for item in filters)


def main() -> None:
    filters = set(sys.argv[1:])
    manifest = load_manifest()
    spots = [spot for spot in manifest.get("spots", []) if wanted(spot, filters)]
    for spot in spots:
        result = regenerate_video({
            "index": spot["index"],
            "id": spot["id"],
            "prompt": spot["videoPrompt"],
            "orientation": spot["orientation"],
            "dimensions": spot["videoDimensions"],
            "accent": spot["accent"],
            "category": spot["category"],
            "image": spot["image"],
        })
        print(f"{spot['index']:02d} {spot['id']} {result['mode']} {result['video']}")


if __name__ == "__main__":
    main()
