# AIRPORT lane — world, runways, terminal, tower

Owner: lane AIRPORT. Files: `js/world/*` (except `layout.js`), `tools/airport.html`, this doc.
Round 2 (2026-10-22) added the countryside: field patchwork, woods, hedgerows, village, castle, lake water, aerial
perspective, cloud shadows, quality tiers. See **Round 2** below; the round-1 sections still hold unless it says otherwise.

## API (`js/world/airport.js`)

`buildWorld(scene, renderer, { quality: 'low'|'medium'|'high', windFrom?, windKt? })` adds everything to `scene` and returns:

| field | notes |
|---|---|
| `update(dt, camera)` | call once per frame **after** the camera has moved: sky follows camera, PAPI colours from camera position, windsocks, flags, tower radar + crew (heads track the camera), lake ripples, **tree LOD** (re-buckets near/far trees when the camera has moved 12–60 m, altitude-scaled). Pass the camera every frame. |
| `groundHeightAt(x, z)` | 0 on the airfield, its approach corridors (3.4 km out, widening), the village, the lake and the long road; gently rolling (about −10…+25 m) elsewhere, the castle hill (70 m plateau at 780, −2300), and big hills beyond ~4 km. Exact: it interpolates the same triangles the terrain mesh draws. |
| `surfaceAt(x, z)` | `building` > `runway` > `taxiway` > runway shoulders/blast pads (`runway`) > `apron` (apron, hangar apron, tower pad, the flat roads incl. village streets, car park) > `water` (lake) > `grass`. Taxiway fillets and the draped country lanes report `grass`. |
| `colliders` | ~330 AABBs `{min,max,kind}`: `terminal`, `hangar`, `tower`, `mast`, `house` (village, farms, church incl. its 41 m spire), `castle` (curtain wall + plinth, palace, great tower to 190 m above field). |
| `sun` | DirectionalLight, castShadow on, 2048² (high) / 1024² (low) map, ortho ±430 m centred on (-40, -170) (terminal, apron, tower, hangars, middle of 09/27). |
| extras | `setShadowFocus(x, z, r)` re-centres the shadow box (use for the player's plane), `runwayAt(x,z)` → runway id or null, `wind {from, kt}` + `setWind(fromDeg, kt)` (drives windsocks + flags), `envMap` (PMREM of the sky — use it on plane paint/glass), `hemi`, `sunDir`, `tower.cab` (Vector3, cab eye point), `tower.crew` (the three controllers: `{body, head, arms[], stand}` — animate freely), `papi` (light unit positions/angles), `root` (Group). |

FLIGHT owns the renderer. Assumed and tested with: ACES filmic, exposure 1, `shadowMap.enabled` (PCFSoft high / PCF low),
antialias on. `scene.fog` and both lights are set by `buildWorld`. Camera far ≥ 15000 recommended (terrain is 28 km across;
fog ends at 14 km). The sky is a camera-following dome drawn first, so far-plane choice doesn't clip it.

Near plane: tested down to 0.05 with no z-fighting. All flat ground layers (pavement, paint, number decals, rubber)
are `depthWrite:false` and ordered by `renderOrder` (-10 terrain … -5 rubber), so coplanar layers cannot fight at any range.
Consequence: things that must appear *under* the paint must not be drawn after it — nothing else is ground-coplanar.

## What's built

- **Runways** (`pavement.js`, `geom.js`): ICAO markings — threshold piano keys (8 stripes on the 30 m runway, 6 on 23 m),
  designators 09/27/04/22 (9 m tall, upright for the landing pilot), centreline 30 m dashes / ~20 m gaps, aiming point
  (09/27 at 300 m — game-shortened from ICAO's 400 m so it matches a 3° PAPI on a 1400 m strip; 04/22 at 250 m),
  touchdown-zone bars (3/2/1 pairs), side stripes, blast pads with yellow chevrons. 04/22 markings are interrupted
  across 09/27 (the primary runway's paint wins). Asphalt: seamless tile + baked vertex colour for paving lanes, edge
  weathering and touchdown rubber; decals for rubber streaks, crack sealant and patches. Shoulders lighter.
- **Taxiways**: A + A1–A4 with fillets, yellow centrelines that curve at junctions and lead on to the runway, ICAO
  pattern-A hold-short lines at `HOLD_OFFSET` (50 m) from each runway centreline — computed generically for any
  taxiway that enters a runway (`HOLDS` in `geom.js`; currently A1–A4 on 09/27 plus both sides of the A/04-22 crossing).
- **Signs**: at every hold — red mandatory sign (`27-09` etc., ends arranged per the threshold to the pilot's left)
  with the black/yellow location sign outboard, both sides of the taxiway; a few yellow direction signs on A.
- **Lights**: instanced edge lights (white, yellow last 600 m), threshold green / end red bars, blue taxiway edges.
  **PAPI** 4-box at each runway end on the pilot's left; lens colour is computed per frame from the camera's
  elevation angle (2.5/2.83/3.17/3.5°, inner unit highest), plus point-sprite glows so they read from 1.5 km.
- **Apron**: concrete slabs with joints, 8 stands (lead-in, turn circle, stop bar, tie-down rings, painted S1–S8),
  red wingtip/equipment lines, service road, a **royal red carpet** with gold stanchions from the pavilion.
- **Terminal**: two glazed wings + a central royal pavilion (full-height curtain wall, stone frieze with
  "KRAYZEE ROYAL AIRPORT", crests, patinated barrel vault with gold ribs, a big jewelled **crown** on top, flag pylons),
  visible interiors (shops, check-in, purple banners, gold chandeliers), landside canopy + flag row.
- **Tower**: tapered octagonal shaft, outward-leaning glass cab with mullions, catwalk, rotating radar, mast with flag,
  tiny crown. **Crew of three** inside: two seated (one sipping from a red mug), a standing supervisor who peers through
  binoculars and periodically throws his arms up in despair. Heads track the camera.
- **Hangars** ×2 (arched, ribbed, one door open), fuel truck, tug + baggage train, GPUs, cones, three windsocks.
- **Land**: replaced in round 2 (see below); car park + cars unchanged.

## Budgets (measured, headless Chrome + Metal, `renderer.info` incl. shadow pass)

| view | high calls / tris | low calls / tris |
|---|---|---|
| final 09 (1.5 km, 80 m) | 34 / 257k | 34 / 130k |
| touchdown zone | 32 / 253k | 32 / 125k |
| hold short A2 | 17 / 247k | 17 / 119k |
| apron / terminal | 22 / 255k | 22 / 128k |
| tower / overhead | 35 / 257k | 35 / 130k |

Low ≤ 35 calls for the whole world (budget 60). Build time ~0.3–1.2 s (canvas textures). Low uses a 96² terrain grid,
1024² farm/shadow maps, fewer trees/rubber decals, no tree/PAPI shadows.

## Test bed

`tools/airport.html` — drag to look, WASD/QE fly (shift = fast), wheel = dolly. Presets: `final09` (1.5 km, 80 m, 3°),
`mid09`, `flare09`, `tdz09`, `short09`, `final22`, `hold` (A2 hold line, pilot eye), `crossing`, `apron`, `terminal`,
`hangars`, `tower`, `towercab`, `fromtower`, `overhead`. Query: `?q=low|high`, `?lite`, `?cam=<preset>`, `?near=0.05`,
`?plane=1` (drops PLANE's C172s at a hold, two stands and the 09 threshold for scale), `?shot=1` hides UI.
`window.__setPreset(name)`, `window.__world`, `window.__stats`.

Screenshots: `docs/shots/airport/` (`<preset>_1280x800.png`, `<preset>_low_1280x800.png`, `<preset>_390x844.png`).

## Known gaps / next

- Jet bridges not built (stands are GA-style, 67 m out).
- Rubber in the TDZ reads a little blobby at mid range; skid decals could be thinner and more numerous.
- No night lighting (edge lights are daytime fixtures; only PAPI glows).


## Round 2 — the countryside (2026-10-22)

### API additions (all additive; round-1 fields unchanged)

| field | notes |
|---|---|
| `opts.quality` | now `'low' \| 'medium' \| 'high'` (anything else → high). It fixes build-time *content*: terrain grid (low 120², else 176² + a refined band round the castle hill), tree density, shade-map and mask resolution, edge-light mesh. |
| `setQuality(q)` | runtime tier switch, **no rebuild**: tree near-mesh radius/cap, impostor radius/cap/thinning, tree + house shadow casting, terrain close-up bump, sun shadow-map size (1024 low / 2048 else). Call it whenever the governor changes tier (FLIGHT: from `R.setQuality` / `createFpsGovernor`). Cheap (one InstancedMesh swap when crossing low↔medium). |
| `quality` | getter, current tier. |
| `treeStats()` | `{ total, near: [broadleaf, conifer, poplar], far }` — what the last LOD pass drew. |
| `debug` | `{ terrain, trees, lake, timings }` — for the test bed only; not API. |

Content built at `low` stays low-density after stepping up (D6 boots low on mobile): the tier switch improves LOD,
shadows and bump, not the tree count or terrain grid. Desktop auto builds `high` content (main.js `contentQ`).

### Global rendering changes FLIGHT/PLANE should know
- `scene.fog` is now **`THREE.FogExp2`**, and `env.js` patches `THREE.ShaderChunk.fog_*` once (on first `buildWorld`):
  height-falloff aerial perspective (thick near the ground, thin aloft), sun-warmed haze, hard fade to haze colour at
  9–13.8 km, and **static cumulus cloud shadows** projected along the sun (strength 0.38, only below 1 800 m). Every
  fogged material gets it, including the plane and cockpit — flying under a cloud shadow darkens the cabin a little,
  which is intended. A custom `ShaderMaterial` with `fog: true` must include the fog chunks with `mvPosition` in scope
  (as all built-ins do). `fog: false` materials are untouched.
- Camera far ≥ 15 000 still recommended. Near 0.05 still fine (terrain, lanes and decals are offset/ordered).

### What's new
- **Fields** (`fields.js`, shared JS + GLSL with identical integer hashes): the world is domain-warped, cut into 470 m
  rotated blocks, each split recursively into rectangular fields (≥120 m). Kinds: pasture, meadow, wheat, barley,
  plough, rapeseed, ley, conifer plantation. Crop rows + tramlines, headland margins, per-field macro variation, hedges
  (85 % of borders, 1.5–3 m, lumpy), fences elsewhere. Natural woods are a separate noise field laid over the top
  (irregular, cross field borders), painted as canopy with sun-side highlight and a cast-shadow band on the ground.
  No texture tiling anywhere — everything is procedural in world space; detail textures are mixed at 7 scales.
- **Trees** (`trees.js`): three species (broadleaf 2 variants, conifer, poplar) as instanced meshes near the camera
  and camera-facing impostors far away. The impostor atlas is rendered **from the same meshes** at boot, so the swap
  is invisible. ~250–300k trees placed (woods, plantations in rows, hedgerow lines and singles, roadside, gardens,
  church yews, farmsteads, the airfield boundary). Chunked (200 m) LOD with edge-first priority so wood outlines
  survive the far cap; wood interiors are thinned with distance (the painted canopy fills in). A baked **ground shade
  map** (±4.6 km) adds soft tree/building shadows and the village garden mask.
- **Airfield**: real boundary hedge geometry (gap at the north road), gravel perimeter track, darker rough vs lighter
  mown runway strips with mowing stripes along each runway, patchy grass, close-up blade/tuft detail + bump, grazing-
  angle sheen. Approach corridors (both runways, 3.4 km) are flat and tree-free.
- **Village** (`town.js`): high street, church lane, back lane (flat, in `ROADS` → dashed centrelines), houses fronting
  the streets — 4 instanced archetypes (cottage, terrace of three, hip-roof manor, shop) with pitched/hipped roofs,
  chimneys + pots, windows/doors, per-instance wall (brick/render/stone) and roof (slate/clay) colours. Village green,
  church with tower + spire and churchyard yews. 7 farmsteads (house + barns + track) out in the fields.
- **Krayzee Castle** on a 70 m hill 2.4 km north-east: curtain wall with merlons, drum towers with purple spires and
  gold finials, gatehouse with gold portcullis, palace block, great octagonal tower with gold-ribbed spire, a giant
  crown and the royal flag (animated). Visible from every circuit leg. Lane winds up to the gate.
- **Roads**: long E–W road now −3.6…+3.6 km (lake moved off it), draped extensions into the hills, a southern country
  road and two N–S lanes framing the field (centre dashes on roads, plain lanes), farm tracks.
- **Lake** moved to (−1700, −700), irregular shoreline, PBR water: env-map sky reflection with BRDF fresnel, two
  scrolling ripple normal layers (calmer with distance), shallow/muddy edge tint, reed/mud shore band on land.
- **Sky**: horizon haze band matching the fog, clouds lit from the sun side (density-gradient self-shadowing, silver
  lining near the sun).
- **Terminal interior** is lit: unlit-material interior cards (floor, back wall, ceilings with light strips, shop
  fronts + signage, banners) behind lighter glass (opacity 0.4).

### Budgets (headless Chrome + Metal, 1280×800, `renderer.info` incl. shadow pass, test bed's 430 m shadow box)

| view | low | medium | high |
|---|---|---|---|
| final 09 | 41 / 181k | 41 / 267k | 41 / 303k |
| touchdown zone | 38 / 165k | 38 / 253k | 40 / 292k |
| hold short A2 | 21 / 141k | 21 / 229k | 21 / 265k |
| apron / terminal | 28 / 179k | 28 / 265k | 28 / 301k |
| tower | 41 / 180k | 41 / 267k | 41 / 303k |
| overhead 1.7 km | 41 / 169k | 41 / 267k | 41 / 303k |
| **circuit** (downwind 300 m, field + town) | 41 / 181k | 41 / 267k | 41 / 303k |
| base leg 200 m | 41 / 179k | 41 / 267k | 43 / 307k |
| **cruise** 1 500 m | 41 / 170k | 41 / 267k | 41 / 303k |
| inside a wood edge, eye height | 13 / 119k | 15 / 212k | 15 / 300k |
| village 35 m | 17 / 160k | 18 / 224k | 19 / 263k |
| low over a wood (70 m) — worst tris | 16 / 148k | 16 / 295k | 16 / 451k |

Calls ≤ 43 on every tier (budget low 60 / high 150). Low ≤ 181k tris (budget ~200k). Tier knobs (`TREE_TIERS` in
`trees.js`): near meshes within 110 / 180 / 260 m (cap 400 / 1000 / 2000, low uses a 90-tri tree), impostors to
2.6 / 3.8 / 5.2 km (cap 12k / 22k / 40k), tree shadows off on low. Build time (desktop): ~1.3 s low, ~2.0 s high
(trees 0.45–0.7 s, terrain + textures 0.25–0.5 s, round-1 airport 0.4 s, shade map 0.1–0.25 s).

### Test bed additions
Presets `circuit`, `circuitw`, `base`, `cruise`, `cruisefar`, `grass` (pilot eye on the mown grass), `woods` (eye
height at a wood edge), `village`, `castle`, `lake`, `town`. `?q=low|medium|high` (button cycles). `window.__breakdown()`
→ triangles per mesh name. Screenshots: `docs/shots/airport/r2_<preset>_<tier>[_390x844].png`, plus in-game
`r2_game_chase_1280x800.png` and `r2_game_cockpit_low_844x390.png`.

### Known gaps / next
- Trees are stylised low-poly (lumpy crowns, no leaf cards); a leaf-card high tier would lift close-ups further.
- Woods beyond 5.2 km are canopy paint only (fine under the haze at cruise; edges read as soft blobs).
- Cloud shadows are static (the sky's clouds drift); they are not tied to the sky dome's cloud layout.
- No 3D grass near the camera (shader detail only). No night lighting. Village streets have no pavements/kerbs.
- The airport build is now ~2 s on desktop; a worker for tree placement/shade map would hide it on mobile.
