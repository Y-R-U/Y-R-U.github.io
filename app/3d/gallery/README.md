# 3D Asset Gallery + Demo-Scene Fly-through

A browsable, searchable, taggable index of **all 3,156 models** from the
**PolyPerfect — Low Poly Ultimate Pack**, converted to three.js-loadable `.glb`,
plus a walk/fly-through of the pack's Unity demo scenes.

> **⚠ ASSETS ARE PROTECTED, NOT PUBLIC.** PolyPerfect is a commercial Unity Asset
> Store pack — its raw GLB/PNG files must never be committed. So the page ships the
> art **only as an obfuscated pack** (`assets/pack.dat`, built by `tools/build_pack.py`);
> the repo contains no directly-usable model or texture. The raw source folders
> (`models_all/`, `models/`) stay **local-only** (gitignored) and double as the
> reference cache for current/future games. Serve locally:
> `python3 -m http.server 8899 --directory ~/cc/yru/site` then open `/app/3d/gallery/`.

## Asset protection (the committable bit)

`tools/build_pack.py` reads every `models_all/*.glb` plus the two shared atlas PNGs
and writes one opaque blob, keyed by filename:

```
entry bytes = XOR( gzip(raw) , keystream(name) )    keystream = xorshift32 seeded
                                                     by fnv1a(KEY + ':' + name)
```

- `assets/pack.dat` — the blob (~45 MB, 3,156 models + 2 atlases). **Committable.**
- `assets/pack.index.json` — `{name: {off, len, kind}}` byte offsets into the blob.
- `data/catalog.json` — gallery metadata (titles/tags/tris/dims), copied out of the
  local `models_all/index.json`; descriptive text, not art, so it's plaintext.

`js/assets.js` reverses it at runtime: it reads `pack.index.json`, then pulls each
model with an **HTTP Range request** so only that entry's bytes download (GitHub
Pages' CDN returns `206 Partial Content`; the 45 MB blob is never fetched whole). A
server that ignores Range (`200`) triggers a one-time whole-blob fallback. Decoded
bytes are un-XORed, `DecompressionStream('gzip')`-ed, then handed to
`GLTFLoader.parse` / `TextureLoader`. This is **obfuscation, not encryption** (the key
is in client JS) but keeps the repo free of usable assets — what the licence needs.

Re-pack after changing the model set or re-stripping: `python3 tools/build_pack.py`.
**Do not** copy raw `.glb`/`.png` into the committed folders.

## Structure

```
gallery/                                  COMMITTED (page + obfuscated pack):
  index.html  css/style.css  js/app.js   ← gallery (grid + filters + orbit viewer)
  scene.html               js/scene.js    ← demo-scene fly-through (WASD + mouse)
  js/assets.js                           ← protected-pack loader (Range-fetch + decode)
  tools/build_pack.py                    ← builds assets/pack.dat from models_all/
  assets/pack.dat  assets/pack.index.json ← obfuscated art blob + byte offsets
  data/catalog.json                      ← gallery metadata (titles/tags/tris) — plaintext
  scenes/demo01.json … demo14.json       ← world-space placements per Unity demo scene
  tags.json                              ← hand-curated semantic cross-tags
  build_index_all.py  build_index.py     ← (local) rebuild models_all/index.json

                                          LOCAL-ONLY (gitignored raw source cache):
  models_all/
    *.glb                                ← all 3,156 geometry-only models (atlas stripped)
    lpup_gradient.png  lpup_specular.png ← the two shared palette / specular atlases
    index.json                           ← gallery data (generated; copied → data/catalog.json)
  models/                                ← legacy 37-asset western subset (embedded atlas)
```

## How colour works (one shared atlas, no per-model textures)

Every model is geometry-only (the embedded atlas is stripped → ~45 KB each, 146 MB
total vs 778 MB). Colour comes purely from each vertex's UV position on ONE shared
gradient atlas, applied at load time. Material recipe matching Unity:

- `lpup_gradient.png` as `.map` — `flipY=true`, sRGB. The `flipY` reproduces the
  V-flip correction (Unity UV origin is bottom-left, glTF's top-left) that was the
  original "steel→cyan / red→green" colour bug.
- `lpup_specular.png` as `.metalnessMap`, `metalness=1 roughness=0.62` — the pack
  flags one palette swatch as metal, so only those faces go reflective.
- `RoomEnvironment` PMREM as `scene.environment`.

→ steel guns, red dynamite, tan buildings — matching the Unity demo.

## The fly-through (scene.html)

Loads `scenes/<id>.json` (built offline from the `.unity` files by `parse_scene.py`),
fetches each unique GLB once, drops a clone at every placement (all sharing the one
atlas material, static + frustum-culled). Controls: **WASD** move, **mouse** look,
**Shift** sprint, **Space/C** up/down. A dropdown switches between 14 demo scenes.

Unity is left-handed; our geometry is in glTF (right-handed) space, so each Unity
placement matrix `M` is rebased to `C·M·C` with `C = diag(1,1,-1)`. The world demos
(City, Wild West, …) are built from the pack's `_M` material-variant prefabs; since
`_M` and `_T` share identical geometry, `parse_scene.py` maps `_M` guids → our `_T`
GLB by prefab name (88–99 % coverage).

## Regenerate

```sh
cd app/3d/gallery
python3 build_index_all.py                          # rebuild models_all/index.json
python3 tools/build_pack.py                         # re-pack assets/ + copy data/catalog.json
# scene placements (run from anywhere; needs /tmp/guid_to_glb*.json — see parse_scene.py):
python3 /tmp/parse_scene.py <SCENE.unity> scenes/<id>.json [guid_map.json]
```

`index.json` item schema: `name, title, file, category, worlds[], tags[], tris,
verts, size[w,h,d]`. `scenes/*.json`: `{count, uniques, files[], items:[{f,p,q,s}]}`
where `f` indexes `files`, `p/q/s` are world position / quaternion / scale.
