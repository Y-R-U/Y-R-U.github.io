#!/usr/bin/env python3
"""Build the protected asset pack for /gms/3d/deadtown/.

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

Logical names map to the in-game role, not the PolyPerfect asset name, so the
game code reads cleanly (load 'zombie_m', 'pistol', 'bld_cafe', 'int_wall').
RIGS below are SkinnedMesh GLBs that share the one 80-bone skeleton — the
player drives them in body space (js/hero.js); js/assets.js loads them raw
(keeping the skeleton + their own baked skin) instead of re-skinning onto the
shared atlas.
"""
import gzip, json, os, struct, sys

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(HERE)
SRC  = "/Users/aaronair/cc/yru/site/app/3d/gallery/models_all"
RIG  = "/Users/aaronair/cc/yru/site/gms/3d/fable5_glade/models"
RIGZ = "/Users/aaronair/cc/assets/3d/rigged"   # freshly SKINNED-exported characters
OUT  = os.path.join(GAME, "assets")

KEY = "deadtown-lpup-9Xv!aron-2026"   # also embedded in js/assets.js (must match)

# Rigged SkinnedMesh characters loaded raw (own skin + skeleton, body-space
# driven via buildRig). The gallery "-rig" exports are actually STATIC (0
# bones); the real articulated characters come from the SKINNED exporter
# (Airon.SkinnedExport.ExportList) into RIGZ — same 67-80 bone skeleton family
# as the hero, so one driver animates them all. See tools/ + CLAUDE.md.
RIGS = ["hero", "zombie_m", "zombie_w", "skeleton", "survivor_w", "survivor_b", "survivor_d"]

# logical name -> (source root, GLB filename)
MODELS = {
    # --- characters (rigged, one shared skeleton, body-space driven) ---
    "hero":       (RIG,  "man-casual-rigged.glb"),         # the player (proven rig)
    "zombie_m":   (RIGZ, "man_zombie.glb"),                # rigged (skinned export)
    "zombie_w":   (RIGZ, "woman_zombie.glb"),              # rigged
    "skeleton":   (RIGZ, "man_skeleton.glb"),              # rigged bonus enemy
    "survivor_w": (RIGZ, "woman_casual.glb"),              # rigged civilian (rescue)
    "survivor_b": (RIGZ, "man_business.glb"),              # rigged civilian (rescue)
    "survivor_d": (RIGZ, "woman_doctor.glb"),              # rigged medic (rescue)

    # --- weapons (static, attach to the hand) ---
    "axe":        (SRC, "axe-c2822dd9.glb"),
    "bat":        (SRC, "baseball-bat-d6473c87.glb"),
    "pistol":     (SRC, "pistol-ff129cf4.glb"),
    "revolver":   (SRC, "revolver-1bff4569.glb"),
    "rifle":      (SRC, "rifle-british-5976fa06.glb"),
    "shotgun":    (SRC, "shotgun-old-4869f3d0.glb"),
    "smg":        (SRC, "smg-uzi-de440231.glb"),
    "machinegun": (SRC, "machinegun-77f10255.glb"),

    # --- pickups ---
    "ammo_box":   (SRC, "ammo-box-bullets-a5b88530.glb"),
    "medkit":     (SRC, "medkit-6d5584c9.glb"),

    # --- town buildings (apocalypse variants) ---
    "bld_house_a":  (SRC, "building-house-modern-apocalypse-a-befae462.glb"),
    "bld_house_b":  (SRC, "building-house-modern-apocalypse-b-a33bb11c.glb"),
    "bld_family_a": (SRC, "building-house-family-small-apocalypse-a-254c9a5e.glb"),
    "bld_family_b": (SRC, "building-house-family-small-apocalypse-b-410c9e45.glb"),
    "bld_cafe":     (SRC, "building-cafe-apocalypse-1c67aa42.glb"),
    "bld_burger":   (SRC, "building-burger-joint-apocalypse-8a945f92.glb"),
    "bld_cabin":    (SRC, "building-cabin-small-apocalypse-52fb96ad.glb"),
    "bld_police":   (SRC, "building-policestation-apocalypse-7cc8dcc4.glb"),
    "bld_block":    (SRC, "building-block-5floor-front-apocalypse-62e148fe.glb"),
    "bld_carwash":  (SRC, "building-carwash-apocalypse-7b9fc641.glb"),

    # --- street props ---
    "car_broken":   (SRC, "car-broken-apocalypse-21b00c79.glb"),
    "car_wreck":    (SRC, "car-destroyed-apocalypse-52f757e9.glb"),
    "car_wreck_b":  (SRC, "car-destroyed-apocalypse-b-1aee9ae3.glb"),
    "car_police":   (SRC, "car-police-broken-apocalypse-e61f505e.glb"),
    "bus_wreck":    (SRC, "bus-passenger-destroyed-apocalypse-6565e870.glb"),
    "lamp_city":    (SRC, "lamp-city-apocalypse-a-64d0c2f8.glb"),
    "lamp_road":    (SRC, "lamp-road-apocalypse-a-29e3f0cd.glb"),
    "barrier":      (SRC, "barrier-concrete-756b79cb.glb"),
    "barrier_dmg":  (SRC, "barrier-concrete-demaged-461957b2.glb"),
    "barricade":    (SRC, "barricade-tank-57de880d.glb"),
    "barrier_traf": (SRC, "barrier-traffic-fe15bf12.glb"),
    "barrel":       (SRC, "barrel-old-eab72f82.glb"),
    "crate":        (SRC, "crate-box-39a96ac2.glb"),
    "bin":          (SRC, "bin-wheelie-d15abc5d.glb"),
    "roadsign":     (SRC, "mainroad-sign-green-apocalypse-a-b2e44cc7.glb"),

    # --- interior kit (bedroom + building interiors, area-swap) ---
    "int_floor_wood": (SRC, "house-floor-3x3m-ba55787f.glb"),
    "int_floor_parq": (SRC, "floor-parquet-a-3x3m-cf0ee26d.glb"),
    "int_floor_conc": (SRC, "floor-concrete-3x3m-d150cf15.glb"),
    "int_wall":       (SRC, "house-wall-3x3m-33f38eb6.glb"),
    "door_house":     (SRC, "door-house-simple-4d71afa5.glb"),
    "door_wood":      (SRC, "door-wood-35a5774e.glb"),
    "bed":            (SRC, "bed-single-modern-1c6c38dd.glb"),
    "bed_wood":       (SRC, "bed-wood-063a0461.glb"),
    "television":     (SRC, "television-94e15170.glb"),
    "tv_table":       (SRC, "table-television-ca63f98c.glb"),
    "wardrobe":       (SRC, "closet-wardrobe-closed-da400535.glb"),
    "shelf":          (SRC, "shelf-modern-7f1d14ba.glb"),
    "table_coffee":   (SRC, "table-coffee-8bf4c9a6.glb"),
    "chair":          (SRC, "chair-wood-6aad0d15.glb"),
    "rug":            (SRC, "rug-rounded-80308486.glb"),
    "lamp_floor":     (SRC, "lamp-floor-tall-a-09f882d7.glb"),
    "curtains":       (SRC, "curtains-modern-1727ca98.glb"),
    "pc":             (SRC, "pc-desktop-9ef1cc79.glb"),
}

# shared atlas textures (loaded once, applied to every non-rig model's material)
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
    index = {"key_hint": "deadtown", "rigs": RIGS, "entries": {}}
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
    e = index["entries"]["pistol"]
    chunk = bytes(blob[e["off"]:e["off"] + e["len"]])
    ks = keystream(fnv1a(f"{KEY}:pistol"), len(chunk))
    comp = bytes(c ^ k for c, k in zip(chunk, ks))
    back = gzip.decompress(comp)
    assert back == open(os.path.join(SRC, "pistol-ff129cf4.glb"), "rb").read(), "round-trip FAILED"

    n = len(index["entries"])
    print(f"packed {n} entries  raw={raw_total/1e6:.2f}MB  "
          f"blob={len(blob)/1e6:.2f}MB  (compressed+obfuscated)")
    print(f"  -> {OUT}/pack.dat + pack.index.json   round-trip OK")


if __name__ == "__main__":
    main()
