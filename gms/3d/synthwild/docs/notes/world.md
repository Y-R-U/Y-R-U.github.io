# Lane 1 (WORLD) notes

Owner of `js/world/*`, `js/data/blocks.js`, `tools/world_*`.

**Status: world waves done through the starter-outpost wave.** `node tools/world_test.mjs` → 485 passed, 0 failed (≈15 s).
Visual check: `http://localhost:8861/gms/3d/synthwild/tools/world_view.html?seed=kids&r=12&scale=2` (top-down map,
real module workers). Extra params: `x=&z=` centre, `mode=biome` (biome colours), `bench=1` (warm-worker timing).
Seed `synthwild` landmarks: mountains 1568,-3808 · desert ruin -3400,-3992 · deep ocean -2592,-4000 · plains -800,-4000.

## Files
| file | what |
|---|---|
| `js/data/blocks.js` | `BLOCKS`, `BLOCK.KEY → id`, `TILES` (atlas paint hints), `OPACITY/EMIT/SOLID` lookup tables |
| `js/world/world.js` | `World` class (the ARCHITECTURE contract + extras below), `UNLOADED`, `SEA` |
| `js/world/section.js` | section storage primitives (refine/collapse, keys) |
| `js/world/terrain.js` | pure deterministic generator `makeTerrain(seed)` → `{ column(x,z), genColumn(cx,cz), spawnPoint() }`; climate, heights, surfaces, ores |
| `js/world/caves.js` | worm tunnels, noodles, caverns, mountain overhangs, cave flora |
| `js/world/features.js` | flora, kelp, seabed nodes, trees, glass spires; exports `growTree` |
| `js/world/structures.js` | outposts, sunken vaults, observatories, desert ruins; `structuresNear` |
| `js/world/column.js` | gen + overlay saved edits + light for one 16×128×16 column (shared by worker and sync path) |
| `js/world/gen.worker.js` | module worker wrapping `column.js` |
| `js/world/light.js` | column light (worker), incremental relight on edits, border merge on chunk load |
| `js/world/edit.js` | `setBox` (+ plant-support and water-inflow passes) |
| `js/world/raycast.js` | fine-grid DDA |
| `js/world/persist.js` | section codec: varint RLE + base64 |
| `js/world/noise.js` | seeded simplex 2D/3D, fbm, integer hashes |

## Section data layout (for lane 2's mesher)

- `world.sections` : `Map<"cx,sy,cz", Section | null>`
  - `get()` returns `undefined` → not loaded (or just unloaded: drop the mesh).
  - `null` → all-air section whose light is all sky 15 (`0xF0`). Empty mesh.
  - `cx = floor(x/16)`, `cz = floor(z/16)`, `sy = floor(y/16)` with `sy` in `0..7`.
- `Section = { key, cx, sy, cz, cells: Uint16Array(4096), subs: Array<Uint8Array(64)|null>, free, light: Uint8Array(4096), version, dirty, modified }`
  - cell index `i = x + z*16 + y*256` (local 0..15).
  - `v = cells[i]`: `v < 0x8000` → uniform material id `v` (0 = air). `v & 0x8000` → refined, `subs[v & 0x7fff]` is a
    `Uint8Array(64)` of material ids, sub index `sx + sz*4 + sy*16` (local 0..3). Freed slots are `null`.
  - `light[i] = (sky << 4) | block`, cell resolution, 0..15 each. Refined cells are transparent to light.
  - `version` increments on edits/relight; `dirty` is set when notified (the renderer may clear it).
- Global sub coords: `s = floor(u*4)`; cell `= s >> 2`, sub-in-cell `= s & 3`.

### Mesh payload (one call = the section plus a 1-cell border, transferable)
`world.meshPayload(cx, sy, cz)` → `null` if not loaded; `{ key, cx, sy, cz, version, empty: true }` if the section
is null/all air (no arrays); else
```
{ key, cx, sy, cz, version, empty: false,
  cells: Uint16Array(18*18*18),   // padded: idx = (x+1) + (z+1)*18 + (y+1)*324, x,y,z ∈ [-1..16]
  subs:  Uint8Array(n*64),        // refined value v → subs[(v & 0x7fff)*64 + (sx + sz*4 + sy*16)]
  light: Uint8Array(18*18*18) }   // same padding, (sky<<4)|block
```
Refined indices are renumbered into the payload's own flat `subs`, border cells included. Outside the world:
`y < 0` → coreplate, light 0; `y >= 128` → air, light `0xF0`. Unloaded neighbour cells → `UNLOADED = 0x7fff`,
light `0xF0`. All arrays are fresh copies (safe to transfer). Cost ≈ 0.05 ms.

### Dirty notifications
`world.onSectionDirty(cb(key))` (returns an unsubscribe fn) fires synchronously at the end of `setBox` and `update`:
- chunk load: its 8 sections + all 8 sections of each loaded neighbour chunk (incl. diagonals, for AO);
- chunk unload: its 8 keys (then `sections.get(key)` is `undefined`);
- edits: each edited section, plus only the neighbour sections the edited cells touch (a cell on the x=15 face marks
  the +x neighbour, corner cells mark the diagonal ones), plus every section whose light changed (and its neighbour
  when the changed light cell is on its border). A typical single block break dirties 1–4 sections.
`world.onChunk(cb(type, cx, cz))` with `type` `'load' | 'unload'` is also available.

## Block registry and the tile-hint schema (note to lane 2)
`BLOCKS[id]` follows the ARCHITECTURE shape plus: `glow: 'none'|'always'|'night'|'pulse'` (emissive behaviour:
leaves glow only at night, vines/kelp pulse), `waterlogged` (kelp: the cell is also water, draw it inside the water
volume), `tier` (tool tier needed, gameplay), `buildOnly`. `color` is the top tile's base colour as 0..1 floats
(particles, far LOD, map). `drops` is an item key string (`'none'` = nothing; usually the block's own key).
`tile.{top,side,bottom}` are indices into `TILES`.

`TILES[i] = { index, name, pattern, base, accent, emissive, glow, scale, alpha, lip }`
- `base` / `accent`: `'#rrggbb'`. Base is the dominant colour; accent is the detail colour. If `emissive > 0`, the
  accent pixels are the emissive mask, and `emissive` (0..1) is how strongly they glow.
- `pattern` — what to draw with accent on base:
  `lattice` (grid/hex struts) · `film` (smooth with fine sheen streaks / cells) · `grain` (speckled organic noise) ·
  `circuit` (traces + nodes) · `mirror` (bright facets, glints; the mesher already flags these with T_GLINT) ·
  `veins` (cracks/veins) · `panel` (framed plate with a border/inset; neon panels, devices, glass) · `noise`
  (pebbly mottled) · `rings` (log end-grain rings) · `ore` (basalt base with accent clusters) · `plant` (cutout
  sprite for X-meshes: stems/fronds in base, glowing tips in accent) · `bulb` (cutout glowing bulb sprite) ·
  `brick` (offset brick courses, accent = mortar) · `device` (panel with a glowing window/slot) · `water` (soft
  caustic noise).
- `scale`: feature size multiplier (1 = default, 2 = bigger features). `alpha`: `'opaque'|'cutout'|'blend'`.
- `lip`: `{ color, px, ragged }` or null — draw a band of `color` `px` texels tall along the top edge (grass side).
- Tiles shared between blocks have one entry (e.g. `device_bottom`, `loam_mesh`).

**M2 new pattern words** (each new tile also carries `fallback`, an M1 pattern to use until the atlas knows it):
`fibre` (long parallel spun strands, slightly wavy; fallback `veins`) — fibre stone, frost-lattice side ·
`crystal` (tall faceted prism planes with bright edges; fallback `mirror`) — glass spire side ·
`rail` (two vertical side rails + glowing rungs on a transparent background; fallback `lattice`) — climb rail.
New shared field `fallback` on every tile (null on M1 tiles).

**M2 block flags:** `shape: 'cube'|'cross'|'rail'` (plants are `'cross'`), `climbable` (climb rail, data vine — lane 3
reads it), `hangs` (data vine, filament moss: hang from a ceiling). **Climb rail** (`shape:'rail'`) is a thin panel
drawn against its wall: the wall is the first solid horizontal neighbour in −x, +x, −z, +z order, and
`world.railFace(x,y,z)` returns the outward normal (`[1,0,0]` = wall on −x) or null. The mesher can do the same test
on the padded payload. Rails are non-solid, let light through, and pop when their wall is broken.

Ids (stable, append only): 0 air, 1 photomoss, 2 loam_mesh, 3 basalt_matrix, 4 fractured_matrix, 5 coreplate,
6 mirror_sand, 7 shard_gravel, 8 polymer_clay, 9 carbon_log, 10 lattice_planks, 11 solar_leaves, 12 data_vine,
13 lumen_bloom, 14 water, 15 server_kelp, 16 chrome_shingle, 17 clearglass, 18–21 ore_carbon/ferrite/aurum/qubit,
22 glowbulb, 23 fabricator, 24 reflow_oven, 25 cache, 26 sleep_pod, 27 polymer_brick, 28–35 neon_cyan, magenta,
lime, amber, violet, coral, white, cobalt, 36 light_panel. **M2:** 37 fibre_stone, 38 frost_lattice (snowcap; side
has a frost lip), 39 glass_spire (desert "cactus", solid, night glow), 40 mirror_tile, 41 mirror_tile_cracked,
42 crystal_turf (glass-plains grass; lip side), 43 prism_flower (plant, light 4), 44 seabed_node (solid, light 10,
pulse), 45 kelp_bulb (waterlogged plant, light 9, tops tall kelp), 46 glowcap (cave floor plant, light 6),
47 filament_moss (hangs from cave ceilings, light 4), 48 mirror_sandstone (desert subsoil, brick sides),
49 climb_rail (ladder). **Farming (lane 4):** 50 `grow_bed` (tilled loam cube; top pattern `furrows`, fallback
`grain`), 51–54 `sun_crop_0..3` (cross plants, stage in `block.stage`, stage 3 glows; `drops:'none'` so lane 4 owns
harvest drops), 55 `bio_sapling` (cross plant). Crops and saplings pop if the ground under them is broken.

## World API beyond the ARCHITECTURE contract (proposed additions)
- `world.spawn` → `[x, y, z]` feet position on dry shore land near the sea with forest within ~40 m. Deterministic.
- `world.ensureArea(px, pz, r)` / `genChunkSync(cx, cz)`: synchronous generation (tests, warm-up, no-Worker fallback).
- `world.isChunkLoaded(cx, cz)`, `world.neighborsReady(cx, cz)` (all 8 around loaded), `world.pendingCount()`.
- `world.lightAt(x,y,z)` → byte, `skyLight(x,y,z)`, `blockLight(x,y,z)` (float positions; unloaded → sky 15).
  Use `blockLight >= 8` for the power-droop rule and `skyLight`/`blockLight` for mob spawning.
- `world.waterLevelAt(x, z)` → generated water surface height (0 = dry column). Sea is 32 (`SEA`).
- `world.stats` = `{ generated, genMs, workerMs, applyMs, lastApplyMs }` (sum totals).
- `world.dispose()` terminates the workers.
- `BLOCKS[].color` follows lane 2's repainted palette (REPAINT table in blocks.js, from atlas_styles.js STYLE).
- `world.railFace(x, y, z)` → wall normal of a climb rail (see above).
- `world.structuresNear(x, z, r = 256)` → `[{ kind, pos:[x,y,z], dist }]` nearest first; kinds `'outpost' | 'vault' |
  'observatory' | 'ruin'`. Pure (works far outside loaded chunks), cheap (cached per grid cell): fine for a compass.
  `pos` is the floor centre (the cache is nearby, not exactly there).
- `world.readBox(minSub, maxSub)` → `{ min, max, size:[w,h,d], data: Uint8Array, unloaded }`, data index
  `(x-x0) + (z-z0)*w + (y-y0)*w*d` over subs (x fastest). Unloaded cells read as 0 and set `unloaded`.
- `world.writeBox(minSub, maxSub, data, { skipAir, support })` → `{ changed, removed }` like setBox. `data[i] === 255`
  (`KEEP` in edit.js) leaves that sub alone; `skipAir: true` also leaves subs where data is 0 (paste without carving).
  Whole cells that the data covers uniformly stay uniform. Relight, dirty marking and the plant/rail support pass match
  setBox. There is no water flow on paste. Undo = `writeBox(min, max, readBox(min, max).data)` taken before the edit
  (tested: every sub and all light restored exactly).
- `world.growTree(x, y, z, seed?)` (also `growTree(world, …)` exported from features.js): grows a forest tree whose
  trunk starts at cell (x,y,z), replacing a sapling there. It only writes into air/soft plants (never player blocks),
  needs a clear trunk, does one batched relight, and returns cells placed (0 = no room, nothing changed).
- `world.lightPending()` / `world.finishLight()`: big edits relight over several frames (below).
- `world.update(px, pz, radius)`: `radius` is in chunks (render distance). Loads a disc of that radius nearest-first,
  unloads beyond `radius + 2`. Modified sections of unloaded chunks are encoded into `world.mods` and re-applied
  in the worker when the chunk comes back.

### Semantics worth knowing
- `getCell` returns `-1` for refined, `0` for unloaded. `getSub` returns 0 for unloaded. `isSolidSub` returns
  **true** for unloaded columns (holds the player until the chunk arrives), true below y=0.
- `surfaceY(x, z)` returns the **top of the highest solid sub** in units (e.g. `36` or `36.75`), reading the exact
  sub column under (x,z). Leaves count as solid. Unloaded → generator height.
- `setBox(minSub, maxSub /*exclusive*/, mat, mode, opts)`:
  - `opts.wall` = hollow/shell wall thickness in subs (default **4** = 1 block). The brush should pass its scale×4
    (e.g. `wall: 1` at 0.25 scale).
  - `removed` = `[{ mat, count /*subs; 64 = one full block*/, blocks /*count/64*/ }]`, largest first. Liquids are
    never reported (no water drops). Plants knocked off by losing their support are included.
  - Cell y=0 (the coreplate floor) is immutable. Bedrock-ish coreplate at y=1–2 is editable (gameplay checks hardness -1).
  - Post passes: lumen blooms/kelp lose their ground → removed; data vines lose their anchor → removed; **water flows
    into fresh holes** next to water (sideways and down, never up, cap 2048 cells; `opts.flow:false` disables).
    Cells that were water and that this edit deliberately removed are not refilled, so build mode can drain water.
  - Aligned whole cells stay uniform: an 8×8×8-unit fill refines nothing.
- `raycast(origin, dir, maxDist, { liquids:false, plants:true })` → hits plants by default, ignores water.
  `normal` is `[0,0,0]` when the origin is inside a block.
- Light: sky light going straight down loses only the cell's opacity (no −1 per step), sideways it loses 1 + opacity.
  Leaves and water have opacity 1; glass, plants and refined cells 0; everything else blocks. Verified: incremental
  relight equals a full recompute and a brute-force reference exactly.
- `serialize()` stores only modified sections (cells + subs, no light) — after a handful of edits ~3 KB JSON.

### Time-sliced relight (M2)
An edit that changes more than `world.deferLightOver` (4096) cells keeps its cells immediately, but its relight runs
as a generator stepped ≤ 4 ms per `update()`. A 32×2×32-unit stamp: setBox 9 ms, then relit over ~15 frames, worst
frame ~8 ms (was one 55–140 ms hitch). Any later `setBox`, chunk load/unload or `genChunkSync` first finishes a
pending relight synchronously, so light is never computed on top of a half-done pass. Chunk results wait while a relight
is pending. Smaller edits (an 8×8×8 stamp is 512 cells) relight synchronously as before.

## Terrain (M2)
**Biome map**: continentalness (ocean ↔ land), temperature + moisture (≈1 km noise) and a ridge noise.
- Land blend weights: forest = wet, desert = dry + hot, plains = dry + cool; mountains are an overlay where the ridge
  noise is high inland. Heights are blended by the weights, so borders are smooth slopes, not walls; the surface
  material switches at the dominant biome.
- Within ~250 m of the origin the climate is forced wet and mountains off, so spawn is always forest + shore (tested).
- `biomeAt` now returns `'forest'|'shore'|'ocean'|'desert'|'mountains'|'plains'|'deep_ocean'` (`BIOMES` in terrain.js).
  Over 12 km every biome is common (test).
- **Mirror Desert**: warped ridged dunes (mirror sand over mirror sandstone), glass spires 2–5 tall with saguaro arms,
  mirror-tile ruins (72 m grid, ~30% where desert: tiled floor on a sandstone foundation, broken walls, clearglass
  windows, corner pillars, sometimes a glowbulb; dunes cleared inside). Oasis lakes are possible.
- **Fibre Mountains**: peaks to ~110, terraced cliffs, overhang notches cut under cliff lips; fibre stone above y≈46,
  frost-lattice snowcaps above y≈84±5, green meadows only in low gentle valleys, a few spire trees below 66.
- **Glass Plains**: flat crystal-turf grassland, prism-flower patches, rare clearglass outcrops, lone trees.
- **Deep ocean**: floor at ~y 8–14, tall kelp (up to 20) topped with glowing kelp bulbs, seabed nodes on the floor.
- Forest and shore unchanged from M1.

**Caves**: worm tunnels (0–3 per 96 m region, 70–180 steps, radius 1.3–4.3, cached per region; they may break the
surface as cave mouths, and trees avoid worm mouths) + noise noodles + caverns below y≈48 + mountain overhangs.
Never carved beside or under water. About 13% of the underground volume in hilly land is cave.
**Ores** (2×2×2 clusters in stone, MC-like): carbon common at every depth (more from 20–128), ferrite peaks ~y30
(< 72), aurum peaks ~y14 (< 34), qubit very rare, below y 15. Tested order: count carbon > ferrite > aurum > qubit and
mean depth carbon > ferrite > aurum > qubit.
**Cave flora**: glowcaps on floors (4.5%) and filament moss hanging from ceilings (3%). Light ≤ 6, so with lane 4's
`block < 7` spawn rule every cave stays spawnable while the flora still marks the way.

### Dithered biome edges
Each column compares the blend weights with a per-column jitter (±0.16 hash + a 6 m noise), so a border becomes a
speckled band about 10–30 m wide instead of a line (desert↔forest↔plains, mountain edge, shore↔land).

### Structures (one candidate per grid cell; existence and layout come only from pure column data)
| kind | where | grid / chance | contents |
|---|---|---|---|
| outpost | forest/plains, flat (≤3 over ±6), dry | 160 m / 45% → one per ~318×318 m of forest/plains | glass dome (40%) or brick/glass hut with neon trim, door, fabricator, cache, glowbulbs, light panel, sometimes a sleep pod; 0–2 brick pods with a glowbulb; lumen-bloom garden |
| vault | deep ocean ≥ 9 deep, flat | 192 m / 45% | dry glass dome on a mirror-tile floor, cache, two glowbulbs, light panel, seabed-node ring; kelp over it is cleared |
| observatory | mountains, h 76–112 | 256 m / 40% (rare: mountains only) | mirror-tile tower ring, cobalt band, glass dome, glowing telescope, cache, glowbulb, fibre-stone foundation |
| ruin | desert | 72 m / 30% | as before, now with a cache 35% of the time |
Caches are placed empty (lane 4 rolls loot on first open). Trees and spires keep 2 m clear of every footprint.
Foundations fill down to the ground and the volume above the floor is cleared, so structures sit cleanly on slopes.
Breaking a vault's glass floods it (the water inflow rule), which is intended.
Test: generating at half-chunk offsets around one structure of each kind equals the aligned chunks (0 mismatches).
Seed `synthwild` from spawn: nearest outpost ~385 m, ruin ~440 m, vault ~530 m, observatory ~1.2 km.

### Starter outpost and spawn kit (guaranteed on every seed)
- **Starter outpost**: a 5×5 hut 60–120 m from spawn (usually 80), door facing spawn. It holds a fabricator, the
  cache at the reported `cache` cell, two glowbulbs and a roof light, and has a 17-cell cyan/white neon mast with a
  light-panel tip and arms at floor+21. The site is the first flat, dry forest/shore/plains spot that prefers (1) a height
  within ±6 of spawn and an unobstructed terrain sightline from a kid's eye at spawn to the mast tip, then (2) just the
  sightline, then (3) anything. Normal outposts keep 48 m away. Screenshots: at night the beacon reads clearly down
  the beach; by day it is a faint mast through the fog at 80 m.
- **Spawn kit** (not listed in structuresNear): a lumen-bloom patch (~8–15 blooms; prefers forest) and a knee-high
  basalt boulder studded with carbon-nodule ore, both 10–28 m from spawn and 8+ m apart. Tested on 6 seeds: ≥ 5
  blooms and ≥ 2 exposed carbon ores within 30 m.

### Floating fragments
After carving, `removeFragments` (caves.js) floods from every solid cell with air below and deletes components under
20 cells that never reach y ≤ 4 or water. The flood follows a component across chunk borders using `solidOutside`, a
pure re-computation of what the generator leaves in the neighbour (terrain height minus worms, noise caves and
overhangs, with the same float32 lattice rounding). So both chunks see the whole component, and the result does not
depend on where chunk borders fall (the half-chunk-offset determinism test still passes). Cells across the border are
only evaluated if the in-chunk flood stays under 20, and they're memoised per chunk.
Result: small floating islands per 7×7-chunk mountain area went from 51 to 0–1 (the remaining one is a spire arm
resting on tree leaves). Trees and spires now also require firm ground two cells deep (`solidOutside`), so they never
stand on a lip the cleanup removes. Giant-tree root flares and the observatory telescope were made face-connected.
Observatories now need a near-summit site (nothing within 4 m more than 4 higher), so they're rarer (~1–5 per 6 km).
Ruins need flat-ish ground (≤ 5 spread) and clear 9 cells up.

### Shoreline water walls (lane 2 report)
Generation does not produce them: a regression test scans every water cell around spawn, a lake and a vault
(> 10 000 water cells) for an air neighbour on a side or below and finds 0. Scans of mountains, desert, plains and
deep ocean also found 0. The likely source was M1's noise caves, which only checked their own column and could open a
cell beside sea water; M2's "never carve beside water" rule removed that. Water next to air can still come from player
edits: the end of a placed-water spread, the inflow cap (2048), or a refined cell beside water (water is whole-cell
only). Hiding liquid side faces against air in the mesher is a reasonable belt-and-braces fix on lane 2's side.

### Placed water
Water a player places falls straight down, then spreads up to 3 cells across whatever it lands on (falling resets the
spread), as full still cells. Capped at 512 cells per edit. `setBox(..., WATER, 'fill', { flow:false })` places a still
cell. There are no flow levels: removing the source does not drain the spread water. A real level-based flow sim was
skipped as too risky for the time (ongoing simulation, save churn and remesh load on phones).

## Terrain (M1, still accurate for forest/shore)
Continental noise → ocean (shallow shelf ~depth 1–6, then a drop to ~depth 15–20) / beach / forest hills (5–27 m).
- **Mirror Shore**: mirror sand beaches, chrome shingle patches at the waterline, sand shallows, polymer-clay /
  shard-gravel deep floor, server kelp clusters wherever depth ≥ 3.
- **Solar Forest**: photomoss over loam over basalt, steep slopes expose basalt; three tree kinds (round 64%, layered
  spire 26%, giant 2×2 10%) with solar-film canopies and hanging data vines; lumen blooms on the ground.
- Lakes on a 112 m grid (~55% of eligible cells), each with its own level, a bowl, and a raised rim so water never
  floats; polymer-clay beds and kelp.
- Spaghetti caves (two 3D noises on a 4-cell lattice, wider below y 24) only under dry land, never within 7 of the
  surface. Ores in 2×2×2 clusters: carbon < y100, ferrite < 64, aurum < 32, qubit < 16. Coreplate floor at y 0 (+ some at 1–2).
- Cross-border determinism: everything is a function of world coords. Test: generating at a half-chunk-offset
  origin equals the halves of two aligned chunks, 0 mismatches over 169 columns with trees straddling borders.

## Performance M2 (warm V8, best of 3, 100 columns per biome; the machine had load ≈ 11 from other lanes)
| biome | gen + light per column |
|---|---|
| forest + shore (spawn) | 0.72 ms |
| plains | 0.81 ms |
| desert + ruin | 0.92 ms |
| deep ocean | 1.11 ms |
| mountains | 1.26 ms |
The Chrome worker runs the same V8: warm-worker runs measured 0.9–2.1 ms when the machine was quieter. The first
~50 chunks after the workers start are 2–5× slower while the JIT warms up, so `workerAvgMs` over a short session
reads high. Column light got cheaper in M2: sky seeds now come from per-column sky-floor differences instead of a
scan of every lit cell (mountains 2 → 0.7 ms).
Reproduce with `node tools/world_bench.mjs` or `world_view.html?bench=1`.

## Performance M1 (measured 2026-10-02, M-series Mac)
| what | node | Chrome (module worker, 3 workers) |
|---|---|---|
| terrain gen, one 16×128×16 column | 0.45–0.8 ms | 0.9–1.3 ms |
| gen + column light (worker total) | 1.0–1.5 ms | 1.75–2.55 ms |
| main-thread apply (border light merge) | 0.3–0.5 ms | 0.4–0.5 ms |
| radius-12 disc (489 chunks) | — | 1.6 s to fully load |
| 8×8×8 stamp on the ground | place 1.3 ms, break 3.5 ms | |
| 32×16×32 stamp in the sky (big shadow relight) | 55–120 ms | |
| single sub break | 0.03 ms | |
| raycast 8 m | 1.4–3 µs | |
| meshPayload | 0.05–0.09 ms | |
A phone is ~3–4× slower: expect ~6–8 ms per column in a worker, and the main thread stays < 2 ms per arriving chunk
(results are applied under a 6 ms per-frame budget).

## Fixed in M2
- Light bug (from M1): an emitter next to an edit (e.g. kelp beside a dug shaft) could be zeroed by the removal pass
  and never re-seeded. Now re-seeded. Caught by a new brute-force light reference test (deep ocean + edits), which
  also exposed a sky-level-1 propagation cut-off mismatch (fixed). Light is exact vs the reference in all biomes.

## Open issues / later
- Mountain overhang carving plus worms can leave a few floating fibre-stone fragments on steep peaks (seen beside the
  synthwild observatory). Minecraft has the same; a connectivity cleanup could remove the small ones.
- Daytime fog hides the starter mast beyond ~70 m on some seeds; it is clear at dusk and night.
- Water is static apart from the inflow pass (no flowing levels). Refined cells next to water stay dry.
- M2: more cave variety (caverns, lava-equivalent), the other biomes (mirror desert, fibre mountains, glass plains).

## Requests to other lanes
- Lane 2: `grow_bed` top uses the new pattern `furrows` (fallback `grain`); crops are `shape:'cross'`.
- Lane 2 (M2): new tiles use the patterns `fibre`, `crystal` and `rail` (each has a `fallback`). Draw `climb_rail` as a thin
  panel against its wall (`shape:'rail'`, see above), not as a cube. `kelp_bulb` is waterlogged like kelp.
  `frost_lattice` and `crystal_turf` sides use `lip`. Glass spires have `glow:'night'`.
- Lane 3: `climbable` and its alias `climb` are both true on `climb_rail` and `data_vine`. Copy/paste/undo:
  `world.readBox` / `world.writeBox` (above).
- Lane 4 (farming): keys `grow_bed`, `sun_crop_0`…`sun_crop_3` (`BLOCKS[id].stage`), `bio_sapling`; call
  `world.growTree(x, y, z)` when a sapling matures. Crops have `drops:'none'`, so map harvest drops yourself. Caches in
  structures have no saved state, so roll loot on first open as planned.
- Lane 5 (UI): `world.structuresNear(px, pz, 400)[0]` gives the compass target; the starter is `kind:'starter'`.
- Lane 4: the starter cache is `structuresNear(...).find(s => s.starter).cache`. The journal can count `starter` as an outpost.
- Lane 4: biome strings grew (see Terrain M2) if you key mob spawns by biome. New drops: `mirror_tile_cracked` →
  `mirror_tile`, `kelp_bulb` → `server_kelp`; `frost_lattice`/`crystal_turf` drop themselves (crystal_turf → loam_mesh).
- Lane 2: `server_kelp` is `waterlogged` — render it inside water (the cell counts as water for swimming, while
  `getCell` returns kelp). Leaves have `glow:'night'`, vines/kelp `glow:'pulse'`.
- Lane 3 (brush): pass `{ wall: scale*4 }` for hollow/shell; boxes are in subs, max exclusive.
- Lane 4: `removed[].count` is in subs (64 per block); use `blocks` for whole-block drops. Ore drops are item keys
  `carbon_nodule`, `qubit_crystal`; ferrite/aurum ores drop themselves (smelt). Swimming checks: treat
  `WATER` and `SERVER_KELP` cells as water.
