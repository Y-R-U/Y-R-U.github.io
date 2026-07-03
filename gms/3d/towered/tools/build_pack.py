#!/usr/bin/env python3
"""Build the protected asset pack for /gms/3d/towered/.

PolyPerfect packs are commercial Unity Asset Store products; raw GLB/PNG files
must never land in the public repo. This packs every model the game needs into
ONE opaque blob (`assets/pack.dat`):

    entry bytes  =  XOR( gzip(raw_glb_or_png) , keystream(name) )

keystream = xorshift32 seeded by fnv1a(KEY + ':' + name); js/assets.js
reverses it (un-XOR -> DecompressionStream('gzip')). Obfuscation, not
encryption — enough to keep usable assets out of the repo.

Run:  python3 tools/build_pack.py
"""
import gzip, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(HERE)
SRC  = "/Users/aaronair/cc/yru/site/app/3d/gallery/models_all"
RIGZ = "/Users/aaronair/cc/assets/3d/rigged"                       # skinned exports
CHRS = "/Users/aaronair/cc/assets/3d/public/assets/chars_rigged"   # animated-people rigs
OUT  = os.path.join(GAME, "assets")

KEY = "towered-lpup-7Tw!aron-2026"   # also embedded in js/assets.js (must match)

# Rigged SkinnedMesh characters loaded raw (own skin + skeleton), driven in
# body space via js/rig.js. One shared 80-bone family across all of them.
RIGS = ["zombie_m", "zombie_w", "skeleton", "viking", "viking_w",
        "knight", "ninja", "mummy", "wizard"]

MODELS = {
    # --- enemies (rigged) ---
    "zombie_m":  (RIGZ, "man_zombie.glb"),
    "zombie_w":  (RIGZ, "woman_zombie.glb"),
    "skeleton":  (RIGZ, "man_skeleton.glb"),
    "viking":    (CHRS, "man_viking.glb"),
    "viking_w":  (CHRS, "woman_viking.glb"),
    "knight":    (CHRS, "man_knight.glb"),
    "ninja":     (CHRS, "man_ninja.glb"),
    "mummy":     (CHRS, "man_mummy.glb"),
    "wizard":    (CHRS, "man_wizard.glb"),

    # --- towers / siege weapons ---
    "ballista":    (SRC, "ballista-363f5da6.glb"),
    "catapult":    (SRC, "catapult-284774c8.glb"),
    "cannon":      (SRC, "cannon-pounder-6881b395.glb"),
    "tower_stone": (SRC, "tower-medieval-big-6e9de22d.glb"),
    "tower_wood":  (SRC, "tower-medieval-wood-c2ac6600.glb"),
    "crystals":    (SRC, "crystals-2afe8dcb.glb"),
    "gems_green":  (SRC, "gems-green-048c67b5.glb"),
    "gems_orange": (SRC, "gems-orange-c5f258c7.glb"),
    "cannonballs": (SRC, "cannonballs-f4808d35.glb"),

    # --- castle + spawn ---
    "castle":     (SRC, "castle-medieval-afff660f.glb"),
    "gate":       (SRC, "gate-medieval-small-86a412f8.glb"),
    "wall_stone": (SRC, "wall-medieval-stone-567dfb72.glb"),
    "flag":       (SRC, "flag-medieval-9459b496.glb"),
    "flag_big":   (SRC, "flag-medieval-big-4f15b107.glb"),
    "skull_cave": (SRC, "cave-skull-10ba00ba.glb"),

    # --- trees / greens per realm ---
    "tree_beech":       (SRC, "tree-beech-82bd0e3e.glb"),
    "tree_birch":       (SRC, "tree-birch-36780175.glb"),
    "tree_spruce":      (SRC, "tree-spruce-6b664b52.glb"),
    "tree_beech_or":    (SRC, "tree-beech-orange-aa6cff23.glb"),
    "tree_birch_or":    (SRC, "tree-birch-orange-909b472e.glb"),
    "tree_spruce_or":   (SRC, "tree-spruce-orange-f04373a8.glb"),
    "tree_beech_wh":    (SRC, "tree-beech-white-5df38650.glb"),
    "tree_spruce_wh":   (SRC, "tree-spruce-white-71e156f0.glb"),
    "tree_spruce_snow": (SRC, "tree-spruce-snow-56681d29.glb"),
    "tree_bare":        (SRC, "tree-bare-e514bff3.glb"),
    "tree_broken":      (SRC, "tree-birch-broken-ebbb40c4.glb"),
    "bush_big":         (SRC, "bush-big-1ec9bc1e.glb"),
    "bush_med":         (SRC, "bush-medium-96464766.glb"),
    "grass_g":          (SRC, "grass-clumb-03b67f53.glb"),
    "grass_o":          (SRC, "grass-clumb-orange-aa2aba1c.glb"),
    "grass_w":          (SRC, "grass-clumb-white-8ec04f85.glb"),
    "mushroom":         (SRC, "mushroom-toadstool-62e9723a.glb"),

    # --- rocks / set dressing ---
    "rock_large":   (SRC, "rock-large-da6b5011.glb"),
    "rock_sharp":   (SRC, "rock-sharp-2285a345.glb"),
    "rock_pillar":  (SRC, "rock-pillar-abe740c4.glb"),
    "gravestone":   (SRC, "gravestone-081691bc.glb"),
    "gravestone_r": (SRC, "gravestone-round-a42de864.glb"),
    "fire":         (SRC, "fire-e915f40c.glb"),
    "torch":        (SRC, "torch-standing-tribal-b67921ef.glb"),

    # --- village props ---
    "windmill":    (SRC, "windmill-medieval-f22da9d8.glb"),
    "house_small": (SRC, "house-medieval-small-d9f77112.glb"),
    "well":        (SRC, "well-a95afc34.glb"),
    "barrel":      (SRC, "barrel-eec5409d.glb"),
    "crate":       (SRC, "crate-box-39a96ac2.glb"),
    "lantern":     (SRC, "lantern-a177066c.glb"),
    "hay":         (SRC, "haystack-e0826f28.glb"),
}

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
    index = {"key_hint": "towered", "rigs": RIGS, "entries": {}}
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

    # round-trip self-check
    e = index["entries"]["ballista"]
    chunk = bytes(blob[e["off"]:e["off"] + e["len"]])
    ks = keystream(fnv1a(f"{KEY}:ballista"), len(chunk))
    back = gzip.decompress(bytes(c ^ k for c, k in zip(chunk, ks)))
    assert back == open(os.path.join(SRC, "ballista-363f5da6.glb"), "rb").read(), "round-trip FAILED"

    n = len(index["entries"])
    print(f"packed {n} entries  raw={raw_total/1e6:.2f}MB  blob={len(blob)/1e6:.2f}MB")
    print(f"  -> {OUT}/pack.dat + pack.index.json   round-trip OK")


if __name__ == "__main__":
    main()
