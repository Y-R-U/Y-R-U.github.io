#!/usr/bin/env python3
"""Generate Dicey-vid spot stills through the local helper pipeline.

Examples:
    python3 gen_images.py                  # all spots
    python3 gen_images.py 00_start ambush  # selected by id fragment
"""

from __future__ import annotations

import sys

from regen_helper import load_manifest, regenerate_image


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
        result = regenerate_image({
            "index": spot["index"],
            "id": spot["id"],
            "prompt": spot["imagePrompt"],
            "orientation": spot["orientation"],
            "dimensions": spot["imageDimensions"],
            "accent": spot["accent"],
            "category": spot["category"],
        })
        print(f"{spot['index']:02d} {spot['id']} {result['mode']} {result['image']}")


if __name__ == "__main__":
    main()
