# AIRPORT lane — world, runways, terminal, tower

Owner: lane AIRPORT. Files: `js/world/*` (except `layout.js`), `tools/airport.html`, this doc.

## API (`js/world/airport.js`)

`buildWorld(scene, renderer, { quality: 'high'|'low', windFrom?, windKt? })` adds everything to `scene` and returns:

| field | notes |
|---|---|
| `update(dt, camera)` | call once per frame **after** the camera has moved: sky follows camera, PAPI colours from camera position, windsocks, flags, tower radar + crew (heads track the camera). No allocations. |
| `groundHeightAt(x, z)` | 0 inside 3.8 km of the field; beyond, hills up to ~400 m. Exact: it interpolates the same triangles the terrain mesh draws. |
| `surfaceAt(x, z)` | `building` > `runway` > `taxiway` > runway shoulders/blast pads (`runway`) > `apron` (apron, hangar apron, tower pad, roads, car park) > `water` (lake) > `grass`. Taxiway fillets report `grass`. |
| `colliders` | ~257 AABBs `{min,max,kind}`: `terminal`, `hangar`, `tower`, `mast`, `house`. |
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
- **Land**: mown airfield (lighter runway strip, mowing stripes), patchwork farmland/woods (mirrored-tiled texture +
  airfield/lake mask), lake, instanced deciduous/conifer trees, basic town (instanced houses), roads, car park + cars.

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

- Terminal interior is unlit-looking through tinted glass; jet bridges not built (stands are GA-style, 67 m out).
- Rubber in the TDZ reads a little blobby at mid range; skid decals could be thinner and more numerous.
- Woods are texture only — no trees standing in them yet. Town is boxes.
- No night lighting (edge lights are daytime fixtures; only PAPI glows).
