#!/usr/bin/env python3
"""Build the protected asset pack for /gms/3d/hotwire/.

PolyPerfect "Low Poly Ultimate Pack" is a commercial Unity Asset Store pack;
its raw GLB/PNG files must never land in the public repo. This packs every
model the game needs into ONE opaque blob (`assets/pack.dat`):

    entry bytes  =  XOR( gzip(raw_glb_or_png) , keystream(name) )

keystream = xorshift32 seeded by fnv1a(KEY + ':' + name); js/assets.js
reverses it (un-XOR -> DecompressionStream('gzip')). Obfuscation, NOT
encryption — enough to keep usable assets out of the public repo.

Run:  python3 tools/build_pack.py
"""
import gzip, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(HERE)
SRC  = "/Users/aaronair/cc/yru/site/app/3d/gallery/models_all"
RIGD = "/Users/aaronair/cc/assets/3d/public/assets/chars_rigged"
OUT  = os.path.join(GAME, "assets")

KEY = "hotwire-lpup-vR7!aron-2026"   # must match js/assets.js

# Rigged SkinnedMesh characters (shared 80-bone skeleton, body-space driven
# by js/hero.js). Loaded raw — own skin + skeleton survive cloning.
RIGS = ["hero", "ped_m", "ped_w", "ped_m2", "ped_w2", "cop", "swat",
        "gang_m", "gang_w", "rico", "marlowe", "vex", "knuckles", "dot", "dane"]

MODELS = {
    # --- characters ---
    "hero":     (RIGD, "man_race_driver.glb"),
    "ped_m":    (RIGD, "man_casual.glb"),
    "ped_w":    (RIGD, "woman_casual.glb"),
    "ped_m2":   (RIGD, "man_business.glb"),
    "ped_w2":   (RIGD, "woman_skate.glb"),
    "cop":      (RIGD, "man_police.glb"),
    "swat":     (RIGD, "man_officer_swat.glb"),
    "gang_m":   (RIGD, "man_punk.glb"),
    "gang_w":   (RIGD, "woman_punk.glb"),
    "rico":     (RIGD, "man_mechanic.glb"),
    "marlowe":  (RIGD, "woman_business.glb"),
    "vex":      (RIGD, "woman_metalhead.glb"),
    "knuckles": (RIGD, "man_boxer.glb"),
    "dot":      (RIGD, "woman_chef.glb"),
    "dane":     (RIGD, "man_naval_officer.glb"),

    # --- vehicles (static bodies; game fakes motion/dust/smoke) ---
    "v_beater":   (SRC, "car-veteran-da7730d2.glb"),
    "v_sedan":    (SRC, "car-passenger-8e79e3b3.glb"),
    "v_taxi":     (SRC, "car-taxi-22cac3ac.glb"),
    "v_pickup":   (SRC, "car-pickup-modern-ecaf23df.glb"),
    "v_van":      (SRC, "car-van-long-3eb4a4e1.glb"),
    "v_hippie":   (SRC, "car-hippie-van-524c9902.glb"),
    "v_sport":    (SRC, "car-passenger-race-25726768.glb"),
    "v_formula":  (SRC, "car-formula-bd2801b2.glb"),
    "v_police":   (SRC, "car-police-a1c54521.glb"),
    "v_tow":      (SRC, "car-tow-truck-ca8fe652.glb"),
    "v_bus":      (SRC, "bus-school-ff673c46.glb"),
    "v_fire":     (SRC, "firetruck-c89d2a5e.glb"),
    "v_military": (SRC, "military-truck-3fbaac4b.glb"),
    "v_golf":     (SRC, "golf-cart-b36ff06e.glb"),
    "v_armored":  (SRC, "armored-truck-fd8dd763.glb"),
    "heli":       (SRC, "helicopter-ede3934e.glb"),

    # --- buildings ---
    "bld_bank":      (SRC, "building-bank-b0fafeba.glb"),
    "bld_casino":    (SRC, "building-casino-07c8e106.glb"),
    "bld_cinema":    (SRC, "building-cinema-22511d1a.glb"),
    "bld_hotel":     (SRC, "building-hotel-1628a9fe.glb"),
    "bld_mall":      (SRC, "building-mall-d5ba6a50.glb"),
    "bld_office":    (SRC, "building-office-900d8f3a.glb"),
    "bld_tower":     (SRC, "building-office-tall-adadf8ac.glb"),
    "bld_police":    (SRC, "building-policestation-898c82c3.glb"),
    "bld_pgarage":   (SRC, "building-policestation-garage-6ad39ebe.glb"),
    "bld_fire":      (SRC, "building-firestation-616b8742.glb"),
    "bld_hospital":  (SRC, "building-hospital-b24626a0.glb"),
    "bld_diner":     (SRC, "building-burger-joint-97146327.glb"),
    "bld_nest":      (SRC, "building-cafe-cb3726ee.glb"),
    "bld_garage":    (SRC, "building-carwash-77c14c13.glb"),
    "bld_house_a":   (SRC, "building-house-family-small-82809e6e.glb"),
    "bld_house_b":   (SRC, "building-house-modern-49d4f6af.glb"),
    "bld_house_c":   (SRC, "building-house-middle-53f2f504.glb"),
    "bld_house_d":   (SRC, "building-house-big-4c7e7092.glb"),
    "bld_block_a":   (SRC, "building-block-4floor-front-7f619148.glb"),
    "bld_block_b":   (SRC, "building-block-5floor-front-2cc7571c.glb"),
    "hangar":        (SRC, "airport-hangar-48f8cf20.glb"),

    # --- nature ---
    "tree_a": (SRC, "tree-beech-82bd0e3e.glb"),
    "tree_b": (SRC, "tree-birch-tall-14083644.glb"),
    "palm_a": (SRC, "palm-big-34d656d0.glb"),
    "palm_b": (SRC, "palm-angle-e54a4902.glb"),
    "bush":   (SRC, "bush-medium-96464766.glb"),
    "rock_a": (SRC, "rock-large-da6b5011.glb"),
    "rock_b": (SRC, "rock-sharp-2285a345.glb"),

    # --- street props (block or smash) ---
    "lamp":       (SRC, "lamp-city-b135320f.glb"),
    "tlight":     (SRC, "traffic-lights-4d957633.glb"),
    "barrier":    (SRC, "barrier-concrete-756b79cb.glb"),
    "busstop":    (SRC, "bus-stop-ad241916.glb"),
    "cone":       (SRC, "traffic-cone-c97e7989.glb"),
    "hydrant":    (SRC, "fire-hydrant-1c5f3552.glb"),
    "bench":      (SRC, "bench-forest-a1cbd879.glb"),
    "bin":        (SRC, "bin-wheelie-d15abc5d.glb"),
    "dumpster":   (SRC, "dumpster-55c38dd9.glb"),
    "sign_stop":  (SRC, "traffic-sign-stop-06268d63.glb"),
    "atm":        (SRC, "atm-mechine-8fddfebe.glb"),
    "tirepile":   (SRC, "tire-pile-1b55a894.glb"),
    "crate":      (SRC, "crate-army-a-f95bc722.glb"),
    "stall_pizza":  (SRC, "pizza-stall-766b48f4.glb"),
    "stall_soda":   (SRC, "soda-stall-0d9e2db5.glb"),
    "stall_coffee": (SRC, "coffee-stall-c8bcbb68.glb"),
    "stall_burger": (SRC, "burger-stall-70b10086.glb"),

    # --- docks / airfield set dressing ---
    "cont_a":  (SRC, "cargo-shipping-blue-aa5dc305.glb"),
    "cont_b":  (SRC, "cargo-shipping-red-5aa74c7b.glb"),
    "cont_c":  (SRC, "cargo-shipping-green-6d17f1c0.glb"),
    "crane":   (SRC, "crane-port-c6fe72a2.glb"),
    "ship":    (SRC, "ship-cargo-2bf1cec3.glb"),
    "boat":    (SRC, "boat-speed-22faefc6.glb"),
    "plane":   (SRC, "plane-passenger-9ecf32d4.glb"),

    # --- pickups with real models ---
    "wrench": (SRC, "wrench-fd066ed1.glb"),
    "medkit": (SRC, "medkit-6d5584c9.glb"),
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
    index = {"key_hint": "hotwire", "rigs": RIGS, "entries": {}}
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
    e = index["entries"]["v_taxi"]
    chunk = bytes(blob[e["off"]:e["off"] + e["len"]])
    ks = keystream(fnv1a(f"{KEY}:v_taxi"), len(chunk))
    comp = bytes(c ^ k for c, k in zip(chunk, ks))
    back = gzip.decompress(comp)
    assert back == open(os.path.join(SRC, "car-taxi-22cac3ac.glb"), "rb").read(), "round-trip FAILED"

    n = len(index["entries"])
    print(f"packed {n} entries  raw={raw_total/1e6:.2f}MB  blob={len(blob)/1e6:.2f}MB")
    print(f"  -> {OUT}/pack.dat + pack.index.json   round-trip OK")


if __name__ == "__main__":
    main()
