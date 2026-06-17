#!/usr/bin/env python3
"""
Build the FULL asset-gallery index for all 3,156 textured (_T) models.

Unlike build_index.py (the 37-model western subset with embedded atlases), this
reads the full export manifest at lpup_T_all/manifest.json and indexes the
geometry-only stripped GLBs already staged in models_all/. Colour comes from a
single shared gradient atlas applied at load time in the UI — no per-model
texture is embedded, so the whole set is ~146 MB instead of ~778 MB.

Tagging:  tags(item) = { category.lower() } ∪ { words of the asset name } ∪ curated
The curated half (semantic cross-tags a machine can't guess) lives in tags.json.

Re-run any time the export changes:  python3 build_index_all.py
LOCAL ONLY — never commit these GLBs (commercial Unity Asset Store pack).
"""
import json, re, datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
MANIFEST = Path("/Users/aaronair/cc/assets/3d/public/assets/lpup_T_all/manifest.json")
MODELS_OUT = HERE / "models_all"          # stripped GLBs already staged here
TAGS_FILE = HERE / "tags.json"

STOP = {"the", "of", "and", "a"}
NAME_FIX = {"Scheriff": "Sheriff"}        # PolyPerfect misspelling


def category_of(source_path: str) -> str:
    parts = source_path.replace("\\", "/").split("/")
    for i, p in enumerate(parts):
        if p.startswith("Prefabs_") and i + 1 < len(parts):
            return re.sub(r"_[A-Z]$", "", parts[i + 1])   # strip _T / _M suffix
    if "Animated People" in source_path:
        return "People"
    return "Misc"


def prettify(name: str) -> str:
    for bad, good in NAME_FIX.items():
        name = name.replace(bad, good)
    words = name.replace("_", " ").split()
    return " ".join(w if w.isupper() else w.capitalize() for w in words)


def name_words(name: str):
    out = []
    for w in re.split(r"[ _]+", name):
        for piece in re.findall(r"[A-Z]+(?=[A-Z][a-z])|[A-Z]?[a-z]+|[A-Z]+|\d+", w):
            lw = piece.lower()
            if lw and lw not in STOP and not lw.isdigit():
                out.append(lw)
    return out


def main():
    manifest = json.loads(MANIFEST.read_text())
    curated = json.loads(TAGS_FILE.read_text())

    items, cats, worlds, alltags = [], set(), set(), set()
    missing = 0

    for it in manifest["items"]:
        name = it["name"]
        glb = it["file"]
        if not (MODELS_OUT / glb).exists():
            missing += 1
            continue

        cat = category_of(it.get("sourcePath", ""))
        cur = curated.get(name, {})
        tags = []
        for t in [cat.lower(), *name_words(name), *cur.get("tags", [])]:
            t = t.lower()
            if t and t not in tags:
                tags.append(t)
        wl = [w.lower() for w in cur.get("worlds", [])]

        b = it.get("bounds", {})
        size = None
        if "min" in b and "max" in b:
            size = [round(mx - mn, 2) for mn, mx in zip(b["min"], b["max"])]

        items.append({
            "name": name,
            "title": prettify(name),
            "file": glb,
            "category": cat,
            "worlds": wl,
            "tags": tags,
            "tris": it.get("triangleCount"),
            "verts": it.get("vertexCount"),
            "size": size,
        })
        cats.add(cat); worlds.update(wl); alltags.update(tags)

    items.sort(key=lambda x: (x["category"], x["title"]))
    index = {
        "generatedAt": datetime.datetime.now().isoformat(timespec="seconds"),
        "source": "PolyPerfect — Low Poly Ultimate Pack · all 3,156 models (textured / _T)",
        "atlas": "lpup_gradient.png",
        "specular": "lpup_specular.png",
        "count": len(items),
        "categories": sorted(cats),
        "worlds": sorted(worlds),
        "tags": sorted(alltags),
        "items": items,
    }
    (MODELS_OUT / "index.json").write_text(json.dumps(index, indent=1))
    print(f"Wrote {MODELS_OUT/'index.json'} — {len(items)} assets ({missing} missing glb)")
    print(f"categories ({len(cats)}):", ", ".join(sorted(cats)))
    print(f"tags: {len(alltags)}")


if __name__ == "__main__":
    main()
