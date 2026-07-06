#!/usr/bin/env python3
"""Build the protected asset pack for /gms/3d/firstfolk/.

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
CHRS = "/Users/aaronair/cc/assets/3d/public/assets/chars_rigged"   # animated-people rigs
OUT  = os.path.join(GAME, "assets")

KEY = "firstfolk-lpup-9Ff!aron-2026"   # also embedded in js/assets.js (must match)

# Rigged SkinnedMesh characters loaded raw (own skin + skeleton), driven in
# body space via js/rig.js. One shared 80-bone family across all of them.
RIGS = ["man_farm", "woman_farm", "man_lumberjack", "woman_lumberjack",
        "man_carpenter", "woman_carpenter", "man_casual", "woman_casual",
        "man_wizard", "man_knight", "man_viking", "woman_viking",
        "boy", "girl"]

MODELS = {
    # --- villagers / raiders (rigged) ---
    "man_farm":         (CHRS, "man_farm.glb"),
    "woman_farm":       (CHRS, "woman_farm.glb"),
    "man_lumberjack":   (CHRS, "man_lumberjack.glb"),
    "woman_lumberjack": (CHRS, "woman_lumberjack.glb"),
    "man_carpenter":    (CHRS, "man_carpenter.glb"),
    "woman_carpenter":  (CHRS, "woman_carpenter.glb"),
    "man_casual":       (CHRS, "man_casual.glb"),
    "woman_casual":     (CHRS, "woman_casual.glb"),
    "man_wizard":       (CHRS, "man_wizard.glb"),
    "man_knight":       (CHRS, "man_knight.glb"),
    "man_viking":       (CHRS, "man_viking.glb"),
    "woman_viking":     (CHRS, "woman_viking.glb"),
    "boy":              (CHRS, "boy_casual_cap.glb"),
    "girl":             (CHRS, "girl_casual_shorts.glb"),

    # --- buildings ---
    "hut":        (SRC, "house-medieval-small-d9f77112.glb"),
    "hut_med":    (SRC, "house-medieval-medium-be441070.glb"),
    "house_big":  (SRC, "house-medieval-big-02b6852f.glb"),
    "storehouse": (SRC, "house-medieval-large-97b79ef7.glb"),
    "temple":     (SRC, "church-medieval-0889b564.glb"),
    "windmill":   (SRC, "windmill-medieval-f22da9d8.glb"),
    "lodge":      (SRC, "building-forester-house-bb9f5903.glb"),
    "watchtower": (SRC, "tower-medieval-wood-c2ac6600.glb"),
    "well":       (SRC, "well-a95afc34.glb"),
    "dock":       (SRC, "dock-wood-80a0963c.glb"),
    "boat":       (SRC, "boat-sail-30b616db.glb"),
    "crane":      (SRC, "crane-wood-d21858d0.glb"),

    # --- props ---
    "barrel":    (SRC, "barrel-eec5409d.glb"),
    "crate":     (SRC, "crate-box-39a96ac2.glb"),
    "haystack":  (SRC, "haystack-e0826f28.glb"),
    "hay_pile":  (SRC, "hay-pile-c6375916.glb"),
    "lantern":   (SRC, "lantern-a177066c.glb"),
    "torch":     (SRC, "torch-standing-tribal-b67921ef.glb"),
    "fire":      (SRC, "fire-e915f40c.glb"),
    "flag":      (SRC, "flag-medieval-9459b496.glb"),
    "fence":     (SRC, "fence-classic-a66031aa.glb"),
    "corn":      (SRC, "corn-plant-7b9859d2.glb"),
    "log":       (SRC, "log-0f5f1c7c.glb"),
    "logs":      (SRC, "logs-7af1e6e6.glb"),
    "axe":       (SRC, "axe-c2822dd9.glb"),
    "gravestone":(SRC, "gravestone-081691bc.glb"),
    "crystals":  (SRC, "crystals-2afe8dcb.glb"),

    # --- nature ---
    "tree_beech":  (SRC, "tree-beech-82bd0e3e.glb"),
    "tree_birch":  (SRC, "tree-birch-36780175.glb"),
    "tree_birch_t":(SRC, "tree-birch-tall-14083644.glb"),
    "tree_spruce": (SRC, "tree-spruce-6b664b52.glb"),
    "tree_conifer":(SRC, "tree-conifer-3c60c622.glb"),
    "bush_big":    (SRC, "bush-big-1ec9bc1e.glb"),
    "bush_med":    (SRC, "bush-medium-96464766.glb"),
    "grass_g":     (SRC, "grass-clumb-03b67f53.glb"),
    "flower_red":  (SRC, "flower-red-6f4842f5.glb"),
    "mushroom":    (SRC, "mushroom-toadstool-62e9723a.glb"),
    "rock_large":  (SRC, "rock-large-da6b5011.glb"),
    "rock_sharp":  (SRC, "rock-sharp-2285a345.glb"),
    "rock_pillar": (SRC, "rock-pillar-abe740c4.glb"),
    "rocks_small": (SRC, "rocks-small-6cc96307.glb"),
    "stone_big":   (SRC, "stone-big-eb1231cc.glb"),
    "stone_tall":  (SRC, "stone-big-tall-f00730c3.glb"),

    # --- animals ---
    "sheep": (SRC, "sheep-white-3579a937.glb"),
    "deer":  (SRC, "deer-4e084b78.glb"),
    "wolf":  (SRC, "wolf-46c9ae36.glb"),
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
    index = {"key_hint": "firstfolk", "rigs": RIGS, "entries": {}}
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
    e = index["entries"]["hut"]
    chunk = bytes(blob[e["off"]:e["off"] + e["len"]])
    ks = keystream(fnv1a(f"{KEY}:hut"), len(chunk))
    back = gzip.decompress(bytes(c ^ k for c, k in zip(chunk, ks)))
    assert back == open(os.path.join(SRC, MODELS["hut"][1]), "rb").read(), "round-trip FAILED"

    n = len(index["entries"])
    print(f"packed {n} entries  raw={raw_total/1e6:.2f}MB  blob={len(blob)/1e6:.2f}MB")
    print(f"  -> {OUT}/pack.dat + pack.index.json   round-trip OK")


if __name__ == "__main__":
    main()
