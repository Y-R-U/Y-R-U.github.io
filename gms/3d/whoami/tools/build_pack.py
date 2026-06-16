#!/usr/bin/env python3
"""Build the protected asset pack for /gms/whoami/.

PolyPerfect "Low Poly Ultimate Pack" is a commercial Unity Asset Store pack;
its raw GLB/PNG files must never land in the public repo. This packs every
model the game needs into ONE opaque blob (`assets/pack.dat`) so the repo
holds no directly-usable asset file:

    entry bytes  =  XOR( gzip(raw_glb_or_png) , keystream(name) )

The keystream is an xorshift32 stream seeded by fnv1a(KEY + ':' + name); the
browser (js/assets.js) reverses it (un-XOR -> DecompressionStream('gzip')).
This is obfuscation, NOT encryption — the key lives in client JS — but it
stops casual scraping/redistribution and keeps the repo free of usable assets.

Run:  python3 tools/build_pack.py
Sources are read from the local-only gallery cache; only the blob is written
into the (committable) game folder.
"""
import gzip, json, os, struct, sys

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(HERE)
SRC  = "/Users/aaronair/cc/yru/site/app/3d/gallery/models_all"
RIG  = "/Users/aaronair/cc/yru/site/gms/3d/fable5_glade/models"
OUT  = os.path.join(GAME, "assets")

KEY = "whoami-lpup-7Qz!aron-2026"   # also embedded in js/assets.js (must match)

# logical name -> source GLB filename in models_all (or the rig folder)
MODELS = {
    # --- characters (one rigged humanoid, reskinned per NPC) ---
    "hero":            (RIG, "man-casual-rigged.glb"),
    # --- creatures (static, animated procedurally) ---
    "rat":             (SRC, "rat-bc25efa9.glb"),
    "hen":             (SRC, "hen-a35d4e45.glb"),
    "fish":            (SRC, "fish-3b484b11.glb"),
    "skeleton":        (SRC, "skeleton-3ffa0276.glb"),
    "skeleton_soldier":(SRC, "skeleton-soldier-db74bcf5.glb"),
    "spider":          (SRC, "spider-e26a0ea7.glb"),
    "snake":           (SRC, "snake-bcab5df0.glb"),
    "zombie":          (SRC, "man-zombie-eb3bcf45.glb"),
    # --- nature ---
    "tree":            (SRC, "tree-ddf7f5e4.glb"),
    "tree_apple":      (SRC, "tree-round-apple-843a5d4c.glb"),
    "tree_forest":     (SRC, "tree-forest-f95c9e4c.glb"),
    "bush":            (SRC, "bush-medium-96464766.glb"),
    "bush_small":      (SRC, "bush-small-80fa2b8a.glb"),
    "rock_large":      (SRC, "rock-large-da6b5011.glb"),
    "rocks_small":     (SRC, "rocks-small-6cc96307.glb"),
    "mushroom":        (SRC, "mushroom-toadstool-62e9723a.glb"),
    # --- buildings / stations ---
    "store":           (SRC, "marketplace-stand-simple-df5a7769.glb"),
    "house":           (SRC, "building-forester-house-bb9f5903.glb"),
    "well":            (SRC, "well-a95afc34.glb"),
    "campfire":        (SRC, "campfire-cooker-7fc94cbf.glb"),
    "fire":            (SRC, "fire-e915f40c.glb"),
    "tent":            (SRC, "tent-big-51aa92df.glb"),
    "fence":           (SRC, "fence-897748ef.glb"),
    "barrel":          (SRC, "barrel-eec5409d.glb"),
    "crate":           (SRC, "crate-box-39a96ac2.glb"),
    "anvil":           (SRC, "anvil-187304ce.glb"),
    "pot":             (SRC, "pot-medium-166b13df.glb"),
    "lantern":         (SRC, "lantern-a177066c.glb"),
    # --- items / pickups ---
    "apple":           (SRC, "apple-d8dad9d2.glb"),
    "carrot":          (SRC, "carrot-a36c89e4.glb"),
    "bread":           (SRC, "bread-round-f613098c.glb"),
    "meat":            (SRC, "meat-steak-6ebb1b29.glb"),
    "potion_red":      (SRC, "potion-red-8bfe2941.glb"),
    "potion_blue":     (SRC, "potion-blue-fc07049e.glb"),
    "axe":             (SRC, "axe-c2822dd9.glb"),
    "log":             (SRC, "log-0f5f1c7c.glb"),
    "logs":            (SRC, "logs-7af1e6e6.glb"),
    "sword":           (SRC, "sword-be032db6.glb"),
    "bow":             (SRC, "bow-ee26dc18.glb"),
    "fishing_pole":    (SRC, "fishing-pole-b2e3175a.glb"),
    "gem":             (SRC, "gem-4232d397.glb"),
    "gems":            (SRC, "gems-1f106b8e.glb"),
    "gold":            (SRC, "gold-brick-6e45f1a4.glb"),
    "chest":           (SRC, "chest-22ef1977.glb"),
    "bucket":          (SRC, "bucket-milk-fe20fc39.glb"),
    "torch":           (SRC, "torche-60fe4e36.glb"),
    # --- dungeon kit ---
    "dn_floor":        (SRC, "dungeon-floor-stone-6f65b76c.glb"),
    "dn_wall":         (SRC, "dungeon-wall-stone-752bb20f.glb"),
    "dn_wall_window":  (SRC, "dungeon-wall-window-stone-801317f8.glb"),
    "dn_pillar":       (SRC, "dungeon-pillar-stone-round-b5c517d7.glb"),
    "dn_pillar_corner":(SRC, "dungeon-pillar-stone-corner-f8fd1ff8.glb"),
    "dn_door":         (SRC, "dungeon-door-stone-3290b84c.glb"),
    "dn_torch":        (SRC, "torche-wall-33310882.glb"),
    "cave_skull":      (SRC, "cave-skull-10ba00ba.glb"),
}

# shared atlas textures (loaded once, applied to every model's material)
TEX = {
    "atlas_gradient": (SRC, "lpup_gradient.png"),
    "atlas_specular": (SRC, "lpup_specular.png"),
}


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
    os.makedirs(OUT, exist_ok=True)
    index = {"key_hint": "whoami", "entries": {}}
    blob = bytearray()
    raw_total = 0
    missing = []
    for kind, table in (("model", MODELS), ("tex", TEX)):
        for name, (root, fname) in table.items():
            path = os.path.join(root, fname)
            if not os.path.exists(path):
                missing.append(f"{name} -> {path}")
                continue
            raw = open(path, "rb").read()
            enc = encode(name, raw)
            off = len(blob)
            blob.extend(enc)
            index["entries"][name] = {"off": off, "len": len(enc), "kind": kind,
                                      "raw": len(raw)}
            raw_total += len(raw)
    if missing:
        print("MISSING SOURCES:", *missing, sep="\n  ")
        sys.exit(1)
    open(os.path.join(OUT, "pack.dat"), "wb").write(blob)
    json.dump(index, open(os.path.join(OUT, "pack.index.json"), "w"), indent=0)

    # round-trip self-check on one entry
    import io
    e = index["entries"]["axe"]
    chunk = bytes(blob[e["off"]:e["off"] + e["len"]])
    ks = keystream(fnv1a(f"{KEY}:axe"), len(chunk))
    comp = bytes(c ^ k for c, k in zip(chunk, ks))
    back = gzip.decompress(comp)
    assert back == open(os.path.join(SRC, "axe-c2822dd9.glb"), "rb").read(), "round-trip FAILED"

    n = len(index["entries"])
    print(f"packed {n} entries  raw={raw_total/1e6:.2f}MB  "
          f"blob={len(blob)/1e6:.2f}MB  (compressed+obfuscated)")
    print(f"  -> {OUT}/pack.dat + pack.index.json   round-trip OK")


if __name__ == "__main__":
    main()
