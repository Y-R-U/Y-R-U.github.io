#!/usr/bin/env python3
"""
Build world-space placement JSON for every PolyPerfect demo scene.

For each `_Demo Scenes/DEMO_*.unity` file:
  - parse its PrefabInstance placements (local TRS from m_Modifications + parent),
  - walk the grouping-Transform hierarchy to compose world matrices,
  - map each m_SourcePrefab guid -> our stripped GLB in models_all/,
  - write scenes/<id>.json = {count, uniques, files:[glb], items:[{f,p,q,s}]}.

guid mapping:
  DEMO_01_AllModels places each model as both the _T (atlas) and _M (material)
  variant; we use a _T-only map there to avoid doubles. The world demos are built
  from _M prefabs, so we map _M (and every variant) guid -> the matching _T GLB by
  prefab base name (identical geometry). 88-99% of placements map.

Coordinate space is left raw Unity (the viewer rebases C·M·C, C=diag(1,1,-1)).
LOCAL ONLY — never commit the resulting GLB-referencing data with the GLBs public.

Run:  python3 build_scenes.py
"""
import json, re, os, math
from pathlib import Path

HERE = Path(__file__).resolve().parent
PACK = Path("/Users/aaronair/unity/AssetDL/Assets/polyperfect/Low Poly Ultimate Pack")
MANIFEST = Path("/Users/aaronair/cc/assets/3d/public/assets/lpup_T_all/manifest.json")
DEMODIR = PACK / "_Demo Scenes"
OUT = HERE / "scenes"

# DEMO_01 is the only one we feed the _T-only map (it already places every model once).
T_ONLY = {"DEMO_01_AllModels"}
SCENE_ID = {  # filename stem -> output id used by scene.js
    "DEMO_01_AllModels": "demo01", "DEMO_02_Worlds": "demo02", "DEMO_03_Islands": "demo03",
    "DEMO_04_City": "demo04", "DEMO_05_Suburban": "demo05", "DEMO_06_Castle": "demo06",
    "DEMO_07_WildWest": "demo07", "DEMO_08_Japan": "demo08", "DEMO_09_Dungeon": "demo09",
    "DEMO_10_Scifi": "demo10", "DEMO_11_Farm": "demo11", "DEMO_12_Home": "demo12",
    "DEMO_13_Empire": "demo13", "DEMO_14_Landmarks": "demo14",
}


# ── guid maps ───────────────────────────────────────────────────────────────
def build_guid_maps():
    man = json.loads(MANIFEST.read_text())
    name_to_glb = {it["name"]: it["file"] for it in man["items"]}

    # _T-only: read each manifest prefab's .meta guid (sourcePath is relative to
    # the Unity project root = the dir holding "Assets/").
    proj_root = Path(str(PACK).rsplit("/Assets/", 1)[0])
    t_map = {}
    for it in man["items"]:
        meta = proj_root / (it["sourcePath"] + ".meta")
        if meta.exists():
            m = re.search(r"guid:\s*([0-9a-f]+)", meta.read_text())
            if m:
                t_map[m.group(1)] = it["file"]

    # extended: every *.prefab.meta in the pack, matched to a _T GLB by base name
    ext_map = {}
    for root, _, files in os.walk(PACK):
        for fn in files:
            if fn.endswith(".prefab.meta"):
                base = fn[: -len(".prefab.meta")]
                if base in name_to_glb:
                    try:
                        m = re.search(r"guid:\s*([0-9a-f]+)", Path(root, fn).read_text())
                    except OSError:
                        continue
                    if m:
                        ext_map[m.group(1)] = name_to_glb[base]
    return t_map, ext_map


# ── matrix helpers ──────────────────────────────────────────────────────────
def mat_mul(a, b):
    return [[sum(a[i][k] * b[k][j] for k in range(4)) for j in range(4)] for i in range(4)]


def trs(t, r, s):
    x, y, z, w = r
    xx, yy, zz, xy, xz, yz, wx, wy, wz = x*x, y*y, z*z, x*y, x*z, y*z, w*x, w*y, w*z
    R = [[1-2*(yy+zz), 2*(xy-wz), 2*(xz+wy)],
         [2*(xy+wz), 1-2*(xx+zz), 2*(yz-wx)],
         [2*(xz-wy), 2*(yz+wx), 1-2*(xx+yy)]]
    return [[R[0][0]*s[0], R[0][1]*s[1], R[0][2]*s[2], t[0]],
            [R[1][0]*s[0], R[1][1]*s[1], R[1][2]*s[2], t[1]],
            [R[2][0]*s[0], R[2][1]*s[1], R[2][2]*s[2], t[2]],
            [0, 0, 0, 1]]


def decompose(m):
    t = [m[0][3], m[1][3], m[2][3]]
    s = [max(math.hypot(m[0][i], m[1][i], m[2][i]), 1e-9) for i in range(3)]
    R = [[m[i][j] / s[j] for j in range(3)] for i in range(3)]
    tr = R[0][0] + R[1][1] + R[2][2]
    if tr > 0:
        S = math.sqrt(tr + 1) * 2
        w, x, y, z = 0.25*S, (R[2][1]-R[1][2])/S, (R[0][2]-R[2][0])/S, (R[1][0]-R[0][1])/S
    elif R[0][0] > R[1][1] and R[0][0] > R[2][2]:
        S = math.sqrt(1 + R[0][0] - R[1][1] - R[2][2]) * 2
        w, x, y, z = (R[2][1]-R[1][2])/S, 0.25*S, (R[0][1]+R[1][0])/S, (R[0][2]+R[2][0])/S
    elif R[1][1] > R[2][2]:
        S = math.sqrt(1 + R[1][1] - R[0][0] - R[2][2]) * 2
        w, x, y, z = (R[0][2]-R[2][0])/S, (R[0][1]+R[1][0])/S, 0.25*S, (R[1][2]+R[2][1])/S
    else:
        S = math.sqrt(1 + R[2][2] - R[0][0] - R[1][1]) * 2
        w, x, y, z = (R[1][0]-R[0][1])/S, (R[0][2]+R[2][0])/S, (R[1][2]+R[2][1])/S, 0.25*S
    return t, [x, y, z, w], s


def fnum(v, d=0.0):
    try: return float(v)
    except (TypeError, ValueError): return d


# ── scene parse ─────────────────────────────────────────────────────────────
def parse(scene_path, guid_map):
    docs = scene_path.read_text().split("\n--- ")

    def grab3(d, key):
        m = re.search(key + r":\s*\{x:\s*([^,]+),\s*y:\s*([^,]+),\s*z:\s*([^,}]+)", d)
        return [fnum(m[1]), fnum(m[2]), fnum(m[3])] if m else None

    def grab4(d, key):
        m = re.search(key + r":\s*\{x:\s*([^,]+),\s*y:\s*([^,]+),\s*z:\s*([^,]+),\s*w:\s*([^,}]+)", d)
        return [fnum(m[1]), fnum(m[2]), fnum(m[3]), fnum(m[4])] if m else None

    transforms = {}
    for d in docs:
        head = d.split("\n", 1)[0]
        if not head.startswith("!u!4 ") or "stripped" in head:
            continue
        fid = head.split("&")[1].split()[0]
        fm = re.search(r"m_Father:\s*\{fileID:\s*(-?\d+)\}", d)
        transforms[fid] = {
            "t": grab3(d, "m_LocalPosition") or [0, 0, 0],
            "r": grab4(d, "m_LocalRotation") or [0, 0, 0, 1],
            "s": grab3(d, "m_LocalScale") or [1, 1, 1],
            "father": fm[1] if fm and fm[1] != "0" else None,
        }

    wcache = {}
    def world_of(fid):
        if fid is None or fid not in transforms:
            return [[1,0,0,0],[0,1,0,0],[0,0,1,0],[0,0,0,1]]
        if fid in wcache:
            return wcache[fid]
        n = transforms[fid]
        local = trs(n["t"], n["r"], n["s"])
        w = mat_mul(world_of(n["father"]), local) if n["father"] else local
        wcache[fid] = w
        return w

    files, file_idx, items, unmapped = [], {}, [], 0
    for d in docs:
        if not d.split("\n", 1)[0].startswith("!u!1001 "):
            continue
        gm = re.search(r"m_SourcePrefab:\s*\{fileID:\s*\d+,\s*guid:\s*([0-9a-f]+)", d)
        if not gm:
            continue
        glb = guid_map.get(gm[1])
        if not glb:
            unmapped += 1
            continue

        def mod(path, default):
            m = re.search(r"propertyPath:\s*" + re.escape(path) + r"\s*\n\s*value:\s*([^\n]+)", d)
            return fnum(m[1].strip(), default) if m else default

        t = [mod("m_LocalPosition.x", 0), mod("m_LocalPosition.y", 0), mod("m_LocalPosition.z", 0)]
        r = [mod("m_LocalRotation.x", 0), mod("m_LocalRotation.y", 0),
             mod("m_LocalRotation.z", 0), mod("m_LocalRotation.w", 1)]
        s = [mod("m_LocalScale.x", 1), mod("m_LocalScale.y", 1), mod("m_LocalScale.z", 1)]
        pm = re.search(r"m_TransformParent:\s*\{fileID:\s*(-?\d+)\}", d)
        parent = pm[1] if pm and pm[1] != "0" else None
        wt, wq, ws = decompose(mat_mul(world_of(parent), trs(t, r, s)))
        if glb not in file_idx:
            file_idx[glb] = len(files); files.append(glb)
        items.append({"f": file_idx[glb],
                      "p": [round(v, 3) for v in wt],
                      "q": [round(v, 5) for v in wq],
                      "s": [round(v, 4) for v in ws]})
    return {"count": len(items), "uniques": len(files), "files": files, "items": items}, unmapped


def main():
    OUT.mkdir(exist_ok=True)
    t_map, ext_map = build_guid_maps()
    print(f"guid maps: _T={len(t_map)}  extended={len(ext_map)}")
    for stem, sid in SCENE_ID.items():
        path = DEMODIR / f"{stem}.unity"
        if not path.exists():
            print(f"  {sid}: MISSING {stem}.unity"); continue
        gmap = t_map if stem in T_ONLY else ext_map
        data, unmapped = parse(path, gmap)
        (OUT / f"{sid}.json").write_text(json.dumps(data, separators=(",", ":")))
        print(f"  {sid} ({stem}): {data['count']} placed, {data['uniques']} unique, {unmapped} unmapped")


if __name__ == "__main__":
    main()
