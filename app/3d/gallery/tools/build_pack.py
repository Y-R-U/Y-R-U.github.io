#!/usr/bin/env python3
"""Build the protected asset pack for the PolyPerfect gallery + fly-through.

PolyPerfect "Low Poly Ultimate Pack" is a commercial Unity Asset Store pack;
its raw GLB/PNG files must never land in the public repo. This packs every
stripped model (`models_all/*.glb`) plus the two shared atlas textures into ONE
opaque blob (`assets/pack.dat`) so the repo holds no directly-usable asset file:

    entry bytes  =  XOR( gzip(raw_glb_or_png) , keystream(name) )

The keystream is an xorshift32 stream seeded by fnv1a(KEY + ':' + name); the
browser (js/assets.js) reverses it (un-XOR -> DecompressionStream('gzip')). This
is obfuscation, NOT encryption — the key lives in client JS — but it stops
casual scraping/redistribution and keeps the repo free of usable assets.

Entries are keyed by their GLB *filename* so the existing gallery metadata
(`data/catalog.json`) and scene placements (`scenes/*.json`) reference them
unchanged. js/assets.js range-fetches each entry's slice on demand, so the
45 MB blob is never downloaded whole — only the bytes a page actually needs.

Run:  python3 tools/build_pack.py
The raw `models_all/` cache stays local (gitignored); only the blob + the
plaintext metadata catalog are written into the committable gallery folder.
"""
import glob, gzip, json, os, shutil, sys

HERE = os.path.dirname(os.path.abspath(__file__))
GALLERY = os.path.dirname(HERE)
SRC = os.path.join(GALLERY, "models_all")        # local-only raw cache
OUT = os.path.join(GALLERY, "assets")            # committable blob
DATA = os.path.join(GALLERY, "data")             # committable metadata

KEY = "lpup-gallery-3Dz!aron-2026"   # also embedded in js/assets.js (must match)

# shared atlas textures (decoded once, applied to every model's material)
TEX = ["lpup_gradient.png", "lpup_specular.png"]


def fnv1a(s: str) -> int:
    h = 2166136261
    for b in s.encode("utf-8"):
        h = ((h ^ b) * 16777619) & 0xFFFFFFFF
    return h


def keystream(seed: int, n: int) -> bytes:
    x = seed or 0x1234567
    out = bytearray(n)
    for i in range(n):
        x = (x ^ (x << 13)) & 0xFFFFFFFF
        x = (x ^ (x >> 17)) & 0xFFFFFFFF
        x = (x ^ (x << 5)) & 0xFFFFFFFF
        out[i] = x & 0xFF
    return bytes(out)


def encode(name: str, raw: bytes) -> bytes:
    comp = gzip.compress(raw, 6)
    ks = keystream(fnv1a(f"{KEY}:{name}"), len(comp))
    return bytes(c ^ k for c, k in zip(comp, ks))


def main():
    if not os.path.isdir(SRC):
        sys.exit(f"raw source cache not found: {SRC}")
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(DATA, exist_ok=True)

    glbs = sorted(os.path.basename(p) for p in glob.glob(os.path.join(SRC, "*.glb")))
    names = TEX + glbs

    index = {"key_hint": "gallery", "entries": {}}
    blob = bytearray()
    raw_total = 0
    for name in names:
        path = os.path.join(SRC, name)
        if not os.path.exists(path):
            sys.exit(f"MISSING SOURCE: {path}")
        raw = open(path, "rb").read()
        enc = encode(name, raw)
        off = len(blob)
        blob.extend(enc)
        kind = "tex" if name in TEX else "model"
        index["entries"][name] = {"off": off, "len": len(enc), "kind": kind, "raw": len(raw)}
        raw_total += len(raw)

    open(os.path.join(OUT, "pack.dat"), "wb").write(blob)
    json.dump(index, open(os.path.join(OUT, "pack.index.json"), "w"))

    # committable metadata catalog (titles/tags/tris/dims — descriptive, not art)
    cat_src = os.path.join(SRC, "index.json")
    if os.path.exists(cat_src):
        shutil.copyfile(cat_src, os.path.join(DATA, "catalog.json"))

    # round-trip self-check on one model entry
    sample = glbs[len(glbs) // 2]
    e = index["entries"][sample]
    chunk = bytes(blob[e["off"]:e["off"] + e["len"]])
    ks = keystream(fnv1a(f"{KEY}:{sample}"), len(chunk))
    comp = bytes(c ^ k for c, k in zip(chunk, ks))
    back = gzip.decompress(comp)
    assert back == open(os.path.join(SRC, sample), "rb").read(), "round-trip FAILED"

    n = len(index["entries"])
    print(f"packed {n} entries ({len(glbs)} models + {len(TEX)} atlases)")
    print(f"  raw  = {raw_total/1e6:.1f} MB")
    print(f"  blob = {len(blob)/1e6:.1f} MB  (gzip+obfuscated)  -> {OUT}/pack.dat")
    print(f"  index + catalog written   round-trip OK ({sample})")


if __name__ == "__main__":
    main()
