#!/usr/bin/env python3
"""Build the protected pack for the rigged PolyPerfect characters.

PolyPerfect "Low Poly Animated People" (118 characters) are all skinned to ONE
shared skeleton (`_MainRig`, identical bone names), so a single procedural
animation set drives every one of them (see js/charrig.js). Like the gallery's
build_pack.py this packs every rigged GLB into one obfuscated blob so the public
repo holds no directly-usable asset file:

    entry bytes  =  XOR( gzip(raw_glb) , keystream(name) )

Same cipher as build_pack.py (xorshift32 seeded by fnv1a(KEY + ':' + name)),
but a DISTINCT key and a SEPARATE blob (`assets/chars.dat`) so the 43 MB gallery
thumbnail pack is untouched — only the fly-through's "Characters" scene loads
chars.dat, and (via HTTP Range) only the characters it actually places.

Textures are left embedded: all 118 share the same tiny ~33 KB atlas
(`atlas-albedo-LPAP` + `atlas-emission-LPAP`), so each GLB is correct on its own
with no V-flip / shared-material plumbing to get wrong. (~19 MB packed. A future
trim: drop the unused TANGENT attribute — no normal maps — for ~4 MB.)

Source is the LOCAL rigged-character cache (outside the repo), produced by the
Unity glTFast batch exporter `Airon.SkinnedExport.ExportList`; see
~/cc/assets/POLYPERFECT_ASSET_HOWTO.md. Run:  python3 tools/build_chars.py
"""
import glob, gzip, json, os, re, struct, sys

MAX_SKINS = 12   # a real character is 1 skin (kids layer ~6); anything far above
                 # that is a showcase/scene prefab (e.g. man_actionhero = 112) the
                 # batch export wrongly pulled in — skip it (it also bloats the pack).

HERE = os.path.dirname(os.path.abspath(__file__))
GALLERY = os.path.dirname(HERE)
# rigged-character cache (local-only, outside the repo); override with $PP_CHARS
SRC = os.environ.get("PP_CHARS", "/Users/aaronair/cc/assets/3d/public/assets/chars_rigged")
OUT = os.path.join(GALLERY, "assets")            # committable blob
DATA = os.path.join(GALLERY, "data")             # committable manifest

KEY = "lpup-chars-3Dz!aron-2026"     # also embedded in js/charrig.js (must match)


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


def skin_count(raw: bytes) -> int:
    # read the glTF JSON chunk and count skins (cheap structural parse)
    if raw[:4] != b"glTF":
        return 1
    off, n = 12, len(raw)
    while off < n:
        clen = struct.unpack("<I", raw[off:off + 4])[0]
        if raw[off + 4:off + 8] == b"JSON":
            return len(json.loads(raw[off + 8:off + 8 + clen]).get("skins", []))
        off += 8 + clen
    return 1


def label(name: str) -> str:
    # man_ninja -> "Man Ninja", boy-large -> "Boy Large"
    return re.sub(r"[_-]+", " ", name).strip().title()


def main():
    if not os.path.isdir(SRC):
        sys.exit(f"rigged-character cache not found: {SRC}\n"
                 f"export it first via Airon.SkinnedExport.ExportList (see HOWTO).")
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(DATA, exist_ok=True)

    glbs = sorted(os.path.basename(p) for p in glob.glob(os.path.join(SRC, "*.glb")))
    if not glbs:
        sys.exit(f"no .glb files in {SRC}")

    index = {"key_hint": "chars", "entries": {}}
    manifest = []
    skipped = []
    blob = bytearray()
    raw_total = 0
    for name in glbs:
        raw = open(os.path.join(SRC, name), "rb").read()
        sk = skin_count(raw)
        if sk > MAX_SKINS:
            skipped.append((name, sk, len(raw)))
            continue
        enc = encode(name, raw)
        off = len(blob)
        blob.extend(enc)
        index["entries"][name] = {"off": off, "len": len(enc), "kind": "model", "raw": len(raw)}
        manifest.append({"name": name[:-4], "file": name, "label": label(name[:-4])})
        raw_total += len(raw)

    open(os.path.join(OUT, "chars.dat"), "wb").write(blob)
    json.dump(index, open(os.path.join(OUT, "chars.index.json"), "w"))
    json.dump({"count": len(manifest), "chars": manifest},
              open(os.path.join(DATA, "chars.json"), "w"), indent=0)

    # round-trip self-check on one entry
    sample = glbs[len(glbs) // 2]
    e = index["entries"][sample]
    chunk = bytes(blob[e["off"]:e["off"] + e["len"]])
    ks = keystream(fnv1a(f"{KEY}:{sample}"), len(chunk))
    comp = bytes(c ^ k for c, k in zip(chunk, ks))
    assert gzip.decompress(comp) == open(os.path.join(SRC, sample), "rb").read(), "round-trip FAILED"

    print(f"packed {len(manifest)} rigged characters")
    for n, sk, sz in skipped:
        print(f"  SKIPPED {n}  ({sk} skins, {sz/1e6:.1f} MB — not a single character)")
    print(f"  raw   = {raw_total/1e6:.1f} MB")
    print(f"  blob  = {len(blob)/1e6:.1f} MB  (gzip+obfuscated)  -> {OUT}/chars.dat")
    print(f"  manifest -> {DATA}/chars.json   round-trip OK ({sample})")


if __name__ == "__main__":
    main()
