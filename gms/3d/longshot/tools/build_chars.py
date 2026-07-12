#!/usr/bin/env python3
"""Build LONGSHOT's protected character pack.

PolyPerfect "Low Poly Animated People" are commercial — no raw GLB/PNG may land
in the repo. Same scheme as the gallery / whoami / hotwire packs: each rigged
GLB is packed as  XOR(gzip(raw), keystream(name))  with keystream = xorshift32
seeded by fnv1a(KEY + ':' + name). Distinct KEY + a small subset (~28 people)
so the pack stays a couple of MB. js/charrig.js mirrors the cipher.

Source: the LOCAL rigged-character cache (outside the repo).
Run:  python3 tools/build_chars.py
"""
import gzip, json, os, struct

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(HERE)
SRC = os.environ.get("PP_CHARS", "/Users/aaronair/cc/assets/3d/public/assets/chars_rigged")
OUT = os.path.join(GAME, "assets")

KEY = "longshot-chars-LS!aron-2026"   # must match js/charrig.js

# suits (targets/decoys) · guards · street civilians
CHARS = [
    "man_business", "woman_business", "man_judge", "man_butler",
    "man_naval_officer", "man_pilot", "man_scientist", "woman_reporter",
    "man_officer_swat", "man_soldier", "man_police", "woman_police",
    "man_casual", "woman_casual", "man_casual_shorts", "woman_casual_shorts",
    "man_coat_winter", "woman_coat_winter", "man_punk", "woman_punk",
    "man_post", "man_chef", "woman_maid", "man_doctor",
    "man_homeless", "man_reporter", "woman_scientist", "man_mechanic",
]


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


def skin_count(raw: bytes) -> int:
    if raw[:4] != b"glTF":
        return 1
    off, n = 12, len(raw)
    while off < n:
        clen = struct.unpack("<I", raw[off:off + 4])[0]
        if raw[off + 4:off + 8] == b"JSON":
            return len(json.loads(raw[off + 8:off + 8 + clen]).get("skins", []))
        off += 8 + clen
    return 1


def main():
    os.makedirs(OUT, exist_ok=True)
    blob = bytearray()
    entries = {}
    for name in CHARS:
        path = os.path.join(SRC, f"{name}.glb")
        raw = open(path, "rb").read()
        skins = skin_count(raw)
        if skins > 12:
            print(f"  SKIP {name} (showcase prefab, {skins} skins)")
            continue
        key = f"{name}.glb"
        comp = gzip.compress(raw, 6)
        ks = keystream(fnv1a(f"{KEY}:{key}"), len(comp))
        enc = bytes(c ^ k for c, k in zip(comp, ks))
        entries[key] = {"off": len(blob), "len": len(enc)}
        blob += enc
        print(f"  {key:32s} {len(raw)//1024:5d} KB -> {len(enc)//1024:4d} KB")
    open(os.path.join(OUT, "chars.dat"), "wb").write(bytes(blob))
    json.dump({"entries": entries}, open(os.path.join(OUT, "chars.index.json"), "w"))
    print(f"pack: {len(blob)/1e6:.2f} MB, {len(entries)} characters")


if __name__ == "__main__":
    main()
