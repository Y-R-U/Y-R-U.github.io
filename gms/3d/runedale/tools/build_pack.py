#!/usr/bin/env python3
"""Build the protected asset pack for /gms/3d/runedale/.

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
import gzip, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(HERE)
SRC  = "/Users/aaronair/cc/yru/site/app/3d/gallery/models_all"
RIG  = "/Users/aaronair/cc/yru/site/gms/3d/fable5_glade/models"
OUT  = os.path.join(GAME, "assets")

KEY = "runedale-lpup-9Rn!aron-2026"   # also embedded in js/assets.js (must match)

# logical name -> source GLB filename in models_all (or the rig folder)
MODELS = {
    # --- characters (one rigged humanoid, reskinned per NPC) ---
    "hero":            (RIG, "man-casual-rigged.glb"),
    # --- creatures (static, animated procedurally) ---
    "rat":             (SRC, "rat-bc25efa9.glb"),
    "hen":             (SRC, "hen-a35d4e45.glb"),
    "cow":             (SRC, "cow-8a25b076.glb"),
    "sheep":           (SRC, "sheep-white-3579a937.glb"),
    "goblin":          (SRC, "man-zombie-eb3bcf45.glb"),   # green humanoid, reskins as a goblin
    # --- nature / resource nodes ---
    "tree":            (SRC, "tree-ddf7f5e4.glb"),
    "tree_forest":     (SRC, "tree-forest-f95c9e4c.glb"),
    "bush":            (SRC, "bush-medium-96464766.glb"),
    "bush_small":      (SRC, "bush-small-80fa2b8a.glb"),
    "rock_large":      (SRC, "rock-large-da6b5011.glb"),
    "rocks_small":     (SRC, "rocks-small-6cc96307.glb"),
    "ore":             (SRC, "iron-ore-8e5b2742.glb"),     # tinted per ore type
    "stump":           (SRC, "stump-9d7f29b7.glb"),
    "stump_small":     (SRC, "stump-small-a3c8d8ef.glb"),
    "wheat":           (SRC, "wheat-plant-19bb4768.glb"),
    "hay":             (SRC, "hay-pile-c6375916.glb"),
    # --- buildings / stations ---
    "bank":            (SRC, "building-bank-b0fafeba.glb"),
    "house":           (SRC, "farm-house-06b472f1.glb"),
    "barn":            (SRC, "building-forester-house-bb9f5903.glb"),
    "store":           (SRC, "marketplace-stand-simple-df5a7769.glb"),
    "well":            (SRC, "well-a95afc34.glb"),
    "furnace":         (SRC, "furnace-tribal-bc09e4bc.glb"),
    "anvil":           (SRC, "anvil-187304ce.glb"),
    "campfire":        (SRC, "campfire-cooker-7fc94cbf.glb"),
    "fire":            (SRC, "fire-e915f40c.glb"),
    "fence":           (SRC, "fence-897748ef.glb"),
    "barrel":          (SRC, "barrel-eec5409d.glb"),
    "crate":           (SRC, "crate-box-39a96ac2.glb"),
    "lantern":         (SRC, "lantern-a177066c.glb"),
    "chest":           (SRC, "chest-22ef1977.glb"),
    "torch":           (SRC, "torche-60fe4e36.glb"),
    "dock":            (SRC, "dock-wood-80a0963c.glb"),
    "boat":            (SRC, "boat-fishing-c4345ffb.glb"),
    "windmill":        (SRC, "windmill-medieval-f22da9d8.glb"),
    "flag":            (SRC, "flag-medieval-9459b496.glb"),
    "scarecrow":       (SRC, "scarecrow-5d1593e2.glb"),
    # --- goblin camp ---
    "totem":           (SRC, "totem-b9bca629.glb"),
    "tent_war":        (SRC, "tent-war-d7ad27af.glb"),
    "teepee":          (SRC, "tent-teepee-4c8d7c28.glb"),
    # --- scenery items (smithy / woodpile dressing) ---
    "axe":             (SRC, "axe-c2822dd9.glb"),
    "pickaxe":         (SRC, "pickaxe-4b4f942c.glb"),
    "hammer":          (SRC, "hammer-947ce47c.glb"),
    "sword":           (SRC, "sword-be032db6.glb"),
    "log":             (SRC, "log-0f5f1c7c.glb"),
    "logs":            (SRC, "logs-7af1e6e6.glb"),
    "fishing_pole":    (SRC, "fishing-pole-b2e3175a.glb"),
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
    index = {"key_hint": "runedale", "entries": {}}
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
