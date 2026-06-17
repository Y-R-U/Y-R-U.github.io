#!/usr/bin/env python3
"""
Build the asset-gallery index.

Reads the shared PolyPerfect export manifest, copies each referenced .glb into
this folder's models/ (so GitHub Pages can serve it), enriches every item with
a category + tags + world membership, and writes models/index.json — the single
static file the gallery UI reads.

Tagging model:
  tags(item) = { category.lower() } ∪ { words of the asset name } ∪ curated tags
The curated half lives in tags.json (semantic cross-tags a machine can't guess,
e.g. a rifle is also "hunting"/"shooter"). Re-run this any time more assets are
exported:  python3 build_index.py
"""
import json, re, shutil, datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
CACHE = Path("/Users/aaronair/cc/assets/3d/public/assets/models")
MODELS_OUT = HERE / "models"
TAGS_FILE = HERE / "tags.json"

STOP = {"the", "of", "and", "a"}
NAME_FIX = {"Scheriff": "Sheriff"}  # PolyPerfect misspelling


def category_of(source_path: str) -> str:
    parts = source_path.replace("\\", "/").split("/")
    for i, p in enumerate(parts):
        if p.startswith("Prefabs_") and i + 1 < len(parts):
            return re.sub(r"_[A-Z]$", "", parts[i + 1])  # strip _T / _M suffix
    if "Animated People" in source_path:
        return "People"
    return "Misc"


def prettify(name: str) -> str:
    for bad, good in NAME_FIX.items():
        name = name.replace(bad, good)
    words = name.replace("_", " ").split()
    return " ".join(w if w.isupper() else w.capitalize() for w in words)


def name_words(name: str):
    raw = re.split(r"[ _]+", name)
    out = []
    for w in raw:
        # split CamelCase too (DoubleBarrel -> double, barrel)
        for piece in re.findall(r"[A-Z]+(?=[A-Z][a-z])|[A-Z]?[a-z]+|[A-Z]+|\d+", w):
            lw = piece.lower()
            if lw and lw not in STOP:
                out.append(lw)
    return out


def main():
    manifest = json.loads((CACHE / "manifest.json").read_text())
    curated = json.loads(TAGS_FILE.read_text())
    MODELS_OUT.mkdir(parents=True, exist_ok=True)

    items, cats, worlds, alltags = [], set(), set(), set()
    keep_files = set()

    for it in manifest["items"]:
        name = it["name"]
        glb = it["file"]
        src = CACHE / glb
        if not src.exists():
            print(f"  skip (no glb): {name}")
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

        shutil.copy2(src, MODELS_OUT / glb)
        keep_files.add(glb)

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

    # prune stale glbs from a previous build
    for f in MODELS_OUT.glob("*.glb"):
        if f.name not in keep_files:
            f.unlink(); print(f"  pruned stale: {f.name}")

    items.sort(key=lambda x: (x["category"], x["title"]))
    index = {
        "generatedAt": datetime.datetime.now().isoformat(timespec="seconds"),
        "source": "PolyPerfect — Low Poly Ultimate Pack (textured / _T)",
        "count": len(items),
        "categories": sorted(cats),
        "worlds": sorted(worlds),
        "tags": sorted(alltags),
        "items": items,
    }
    (MODELS_OUT / "index.json").write_text(json.dumps(index, indent=2))
    print(f"\nWrote {MODELS_OUT/'index.json'}  —  {len(items)} assets")
    print("categories:", ", ".join(sorted(cats)))
    print("tags:", len(alltags))


if __name__ == "__main__":
    main()
