# Lane 2 (ENGINE / RENDER) notes

Owner of `index.html`, `js/main.js`, `js/core/*`, `js/render/*`, `tools/engine_*`.

Status: M1 built and running with every lane's real modules (no stubs left in my files).

## Files
| File | What |
|---|---|
| `index.html` | canvas `#game`, `#ui-root`, importmap → vendored three 0.180.0 (+ `three/addons/`), classic inline boot watchdog (20 s → reload message + first captured error), portrait rotate hint (touch only) |
| `js/main.js` | boot, ctx, init order, frame loop, `engine` (`start/stop/save/pause/thumbnail`), `window.__game`, query flags |
| `js/core/bus.js` | `createBus()` → `on/once/off/emit` (handler errors are caught and logged) |
| `js/core/rng.js` | `createRng(seed)` (mulberry32: `next/range/int/chance/pick/fork`), `hashString`, `seedToInt`, `hash3` |
| `js/core/math.js` | `clamp lerp invLerp smoothstep mod damp TAU srgbToLinear hexToLinear lerp3` |
| `js/render/chunks.js` | `ctx.render`: mesher pool, stale-section queue, per-column merged meshes, distance culling |
| `js/render/mesher_core.js` | pure mesher (worker + node). Greedy at cell res, 4×4 greedy for sub faces, AO + smooth light per vertex, X plants, rail panels, water |
| `js/render/mesher.worker.js`, `mesherpool.js` | module workers (hardwareConcurrency−2, max 3), 3 jobs in flight each |
| `js/render/blocktable.js` | BLOCKS → typed tables (kind, flags, tiles) for the worker |
| `js/render/atlas_styles.js` | art-direction layer: `STYLE` overrides by tile name (palette/pattern/glow/lip) + painters `hexfilm`, `weave`, `sand`, `grooves`, `furrows`, and the straight luminous lip band. Ids/tile indices untouched |
| `js/render/atlas.js` | procedural 32×32 tiles from `TILES` hints → two `DataArrayTexture`s (albedo sRGB + mat). `atlas.iconURL(block, size)` = isometric icon data URL for the UI |
| `js/render/materials.js` | the ONE opaque, ONE cutout, ONE water `ShaderMaterial` (define `LOW` = shader LOD) |
| `js/render/sky.js` | `ctx.sky`: day/night, dome (gradient, sun, moon, orbital ring arc, stars, aurora, clouds), shared uniforms, hemi+dir lights + `scene.fog` for standard materials |
| `js/render/fx.js` | `ctx.fx`: particles (cap 512, one additive Points), hologram place commit, EMP shell |
| `js/render/swimmers.js` | 28 instanced fish-drones schooling in shallow water near the camera |
| `js/render/post.js` | bloom (UnrealBloom) on `high` quality only |

## Contracts I implement
- **Boot order**: settings → api → sky, render, fx, swimmers, post → world module → input, player, brush, game (`game/index.js` `init(ctx)`), audio → `ui.init(ctx, engine)`.
  Lane modules are dynamic imports; a failing one is logged to the console and `window.__bootErrors`, and boot continues.
- **Frame order**: `input.update → player.update → brush.update → game.update → world.update(p.x, p.z, rd+1) → sky.update → render.update(camera) → swimmers → fx.update → ui.update → audio.update → render`.
  Paused: input, sky (frozen), render and ui still run; player, brush and game don't.
- **engine** (`ctx.engine`, also `export { game }` from main.js, `window.__game.engine`):
  - `start(meta, save)` → Promise (resolves when the chunks around the camera are meshed, ≤ 9 s). Builds the world
    (`World.deserialize(save.world)` or `new World({seed: meta.seed, mode})`), `player.load(save.player)` or
    `player.spawn(world.spawn)`, `game.start(save.game)`, emits `game:start {meta, mode}` and `load:progress {p, label}`.
  - `save()` → `{ v:1, mode, time, world: world.serialize(), player: player.serialize(), game: game.save() }`.
  - `stop()` → save data, disposes the world, emits `game:stop`.
  - `pause(p)` → sets `session.paused`, emits `game:pause` / `game:resume`.
  - `thumbnail(w=320, h=180)` → JPEG data URL, rendered and read in the same task (no preserveDrawingBuffer needed).
- **ctx.sky**: `time01` (0 = sunrise, 0.375 noon, 0.75 sunset, 0.875 midnight; 20 min cycle, the last 5 min are night),
  `isNight`, `daylight01`, `sunDir`, `moonDir`, `setTime(t)`, `speed`, `frozen`, `uniforms` (shared by every world material;
  other lanes may read `uAmbient`, `uLightColor`, `uLightDir`, `uFogColor`, `uFogNear/Far`, `uNight`, `uTime` to match lighting).
  Emits `time:night` / `time:day`. `alwaysDay` setting pins noon.
- **ctx.render**: `update(camera)`, `setRenderDistance(n)`, `renderDistance`, `setQuality(q)`, `remeshAll()`, `markDirty(key)`,
  `isSettled(r)`, `atlas` (with `iconURL`), `materials`, `table`, `stats`.
- **ctx.fx**: `spark(pos, color, n=14)`, `puff(pos, color, n=8)`, `hologram(minSub, maxSub, color)`, `emp(pos, radius=4)` (also emits
  `fx:emp`), `clear()`, `count`. `pos` = `[x,y,z]` or Vector3, `color` = hex or `[r,g,b]` sRGB 0..1.
- **Query flags**: `?auto=1` (lane 3's auto walker), `?shot=1` (sets `window.__shotReady` once meshed; shows the fps box),
  `?lite=1` (low quality), `?seed=`, `?mode=survival|build`, `?t=0..1` (time of day), `?fps=1` (fps box),
  `?cam=x,y,z,yaw,pitch` (fixed photo camera, player frozen), `?rd=N` (render distance), `?q=low|med|high`, `?noshell=1` (skip the UI).
  With `auto/shot/cam` (or no UI module) main.js starts a world itself; the shell adopts that session.

## Rendering details
- Vertex format (per vertex, 14 bytes): `position` Int16×3 in 1/64 block (mesh scale 1/64), `aUV` Int16×2 (1/64, world-aligned so
  greedy quads tile with `fract` + `textureGrad`), `aData` Uint8×4 = `[tile, normal | ao<<3 | flags<<5, sky<<4|block, extra]`.
  normal 0..5 = ±X ±Y ±Z, 6 = plant. flags: 1 sway, 2 wet (face is under water → caustics + depth tint), 4 glint. extra = water depth
  (water tops) or sway weight (plants).
- Greedy merges only faces whose AO/light are constant along the merge axis, so merged quads interpolate exactly like the unmerged ones.
- Columns: each section is meshed alone in a worker, then all 8 sections of a chunk column are concatenated into one mesh per material
  (≈ 3 draw calls per column). A section edit remeshes that section (and the 26 neighbours the world marks) and rebuilds the column.
- Water: no vertex waves (they crack T-junctions in greedy quads); waves are normal-only. Depth-tinted body colour, fresnel sky
  reflection, sun glints, sparkle cells, Snell's window from below, teal fog when the camera is in water. Underwater surfaces get
  caustics and a refraction-ish UV wobble in the opaque shader.
- Cutout alpha test lowers its threshold with the mip level, so foliage stays solid at a distance instead of eroding into wire.
- Glow modes from the tile hints live in the mat texture alpha: `none` steady, `night` brightens as `uNight` rises, `pulse`, `always`.
- Unknown tile patterns use `tile.fallback`. `shape:'rail'` blocks render as a two-sided panel 1/16 off the first solid horizontal
  neighbour, in the same order as `world.railFace` (−X, +X, −Z, +Z).
- Colour pipeline: shaders work in linear and include `<colorspace_fragment>`; bloom goes HalfFloat RT → OutputPass.
  The composer RT must stay `samples: 0`: an MSAA HalfFloat target rendered pure black headless (metal).

## Art-differentiation pass (wave 2)
- Ground no longer reads as Minecraft: photomoss = teal hex solar film with sparse gold conductors and night specks; grass sides =
  woven graphite-violet loam with a straight luminous moss band (no drip); mirror sand = silver-lavender gradient with dune ripples,
  sparse hard glints and a view-dependent iridescent sheen (shader, glint-flagged faces); basalt = blue-grey with engraved circuit
  grooves and a few glowing nodes; ores = glowing veins + nodes; crystal turf (plains) = teal/violet hex with magenta specks;
  fibre stone pulled to blue-violet. Crops (`sun_crop_0..3`, stage 3 glows gold), `bio_sapling`, `furrows` (grow_bed) painted.
- Block light is cyan-white (`uBlockColor` #a8e4ff, gain lowered); night ambient a touch darker.
- Water light shafts: under water (4 samples along the view ray in the fog) and in the water body seen from above. Not on `low`.
- Orbital ring: thinner, dimmer, fades in right at the horizon.
- Mesher: water draws no horizontal side faces against open air (only player edits create that) → no glassy walls.
- Emissive resists fog: the glow term is added after fog at ≥55% strength, so beacons and glowing flora read at distance.
- Review views: `tools/engine_tour.sh <outdir> <prefix>` (forest, shore, plains, desert, mountains, cave, night, close at 915×412).
- Desktop black frame (QA): bloom's high-pass now scrubs NaN/Inf texels, so one bad pixel from any material can't blank the screen.
  The likely source was the avatar's old unclamped rim `pow` (lane 3 has since clamped it). QA desktop smoke passed 5/5 afterwards.
  Also: `#ui-root > *:not(.sw-layer)` pointer events (the layer was eating desktop clicks), and an inline SVG favicon.
- main.js `safe()` now logs a failing per-frame call once then every 600th (it was pushing to `__bootErrors` every frame).

## Polish wave 3
- Solar leaves repainted (STYLE `solar_leaves` → teal-jade `#178f80` + gold): translucent film panels with a fine cell grid, lighter
  panel centres, gold conductors on the panel edges, few gaps. Cutout shader adds a backlight term (leaf faces glow through when the
  sun is behind them) plus a little constant transmission. No fps change.
- FPS box: already only `?fps=1` / `?shot=1` (`showFps` is lane 5's HUD chip).
- `engine_shot.mjs` takes `DPR=2` to emulate device pixel ratio.

## Art pass (wave 4) + review fixes
- `tools/engine_arttour.sh <outdir> <prefix> [W H]` (DPR via `DPR=2`): biomes × day/dusk/night, canopy, underwater, cave,
  outpost day/night, vault, all mobs day/night (spawned and frozen), hand with block/tool/food, HUD. Mini-games via `?mgtest=<id>`.
- Arena/building tiles (STYLE): `mirror_tile` → bevelled tiles with glowing teal inlays (was a blown-out white plate),
  `polymer_brick` → offset ceramic panels with cyan pinstripes (was MC stone brick), `lattice_planks` → pale composite boards
  with a teal inlay (was MC wood), `light_panel` → hex diffuser with dark ribs (was a flat white blob under bloom),
  `clearglass` frame tinted teal (floorfall grid was pure white).
- Mirror sand: base glint mask 0.35 → 0.04, so the shader twinkle only fires on the sparse real glints (was salt-and-pepper).
- Haze keeps some chroma (aerial perspective term in `applyFog`), leaves a touch brighter: distant canopy reads jade.
- Mobs (`js/game/mobs/models.js`): merged geometry now carries normals; the shared body material adds object-space panel
  seams, a top-lit gradient and a cyan rim that strengthens at night (silhouettes read on a phone). Glitchfuse recoloured to
  pale chrome with magenta seams (no longer a Minecraft creeper green); its glyph face and telegraph ring are untouched.
- Avatar/bots/hand (`js/player/avatar.js`, visuals only): engraved plating lines + top-lit gradient on every suit box; the
  first-person hand gets a forearm plate, knuckle plate and a pulsing teal cuff.
- B3: `js/core/dispose.js` `disposeObject(root)` (geometries, materials, material maps; uniform textures such as the atlas are
  deliberately left alone). Used by bot views, CTF flags, parkour ghost, siege core fx, hide-and-seek drone.
  `review_b_gpu.mjs`: geometries now return to 14–16 and textures to 15–16 after every mini-game (were 11→264 / 15→24).
  JS heap still creeps ~7 MB per mini-game after GC (100→167 MB over 9); not GPU-side, not yet traced.
- B14: chunk key cache is cleared past 20k entries; a mesher worker error re-queues the section (up to 3 tries); leaving High
  quality disposes the bloom composer, its passes and both half-float targets.
- Perf: GPU med phone-res forest 1.0 ms min / 1.6–1.9 ms median (was 1.2 / 3.4 under heavier contention); 4× CPU throttle 60 fps.

## R3 fixes (C2, C5, C6, C7, C13, C21)
See the fix log at the end of `docs/reviews/R3_perf_bugs_dup.md`. Short version: typed light queues + cached section view
(`light.js`, `_W.sec/markDirty` in world.js), per-column box frustum culling, sky tiers by quality + late dome draw order,
merged palette avatar (6 meshes; `avatar.setPalette({suit, seam})`), persistent audio slots, `js/core/quality.js`
(`isMobile`, `defaultQuality`, `resolveQuality`) — **UI fixer: please switch `ui/settings.js` and mob caps to it.**
Bench: `node tools/engine_light_bench.mjs`.

## Testing
- `node tools/engine_mesher_test.mjs`: mesher unit checks (greedy, culling, slabs, refined neighbours, water depth, plants, rails) + perf.
- `~/.claude/bin/cdp start --port 9312 -- --use-angle=metal`, then
  `node tools/engine_shot.mjs out.png "?shot=1&noshell=1&t=0.3&cam=-14,42,10.4,1.57,-0.2" 1280 720 2500 ["js to eval"]`
  prints `{fps, ms, calls, tris, secs, quads}` + console errors. `THROTTLE=4` sets CPU throttling.
  Good views (seed `synthwild`): forest `cam=-14,42,10.4,1.57,-0.2`, shore `cam=8,39,10,-1.2,-0.3`, under water `cam=24,30.5,12,-1.57,0.25`.
- Headless fps is capped at 60 and is noisy while other lanes run Chrome too (load average 10-18 during the build).

## Measured (MacBook Air M5, headless Chrome + metal, seed `synthwild`, forest view)
Headless caps at 60 fps, and other lanes' Chromes were running (load average 15-20), so fps swung 15-60 between runs.
Use the CPU and GPU figures; they hold up better.
- Desktop 1280×720, high (bloom), RD 8: 60 fps when the machine was quiet; 225 columns, ~400k quads. JS frame cost ~2-4 ms.
- Desktop 1280×720, med, RD 8: 60 fps when quiet; 204 draw calls (607 before the column merge), 380k tris; GPU min 5.5 ms.
- Phone-like 1144×515 (915×412 at DPR 1.25), med, RD 6: 60 fps; 157 calls, 262k tris; GPU 1.2 ms min / 3.4 ms median.
  With 4× CPU throttling: 38-44 fps, JS frame ~4 ms.
- 915×412, low, RD 6: GPU 0.5-0.7 ms; 4× CPU throttle: ~25-48 fps (contention).
- Mesher: ~1.2-1.8 ms per busy section in node (off the main thread in workers).

## Requests to other lanes
- **Lane 5 (title grey at DPR 2, found)**: it isn't CSS filters or the WebGL canvas. The `.sw-motes` canvas grows without bound:
  `anim()` reads `motes.clientWidth`, sets `motes.width = w * dpr`, and since the canvas has no CSS width/height its client size
  follows the new intrinsic size, so at DPR 2 it doubles every frame (measured 67,108,864 × 39,321,600 px). Chrome gives up and the
  layer paints white, which shows grey under `.sw-backdrop::after`. At DPR 1 it is stable, which is why only DPR 2 breaks. Real phones
  (DPR ~2.6, capped at 2) will hit it too, and it burns memory. Fix: give it a CSS size, e.g. `.sw-motes { width: 100%; height: 100%; }`
  (or size from the parent's `clientWidth`). Verified: hiding `.sw-motes` restores the correct backdrop at DPR 2.
- **Lane 3 (avatar.js)**: `pow(1.0 - max(dot(n, V), 0.0), 3.0)` can take a slightly negative base (dot > 1 by rounding) → NaN →
  with bloom one NaN pixel blacks the screen. Use `clamp(dot(n, V), 0.0, 1.0)`. The first-person hand is also very bright at night
  (bloom turns it into a white blob): consider lighting it from `ctx.sky.uniforms` (`uAmbient`, `uLightColor`, `uLightDir`, `uNight`).
- **Lane 5**: settings DEFAULTS have `renderDistance: touch ? 4 : 6`; the brief says 6 on mobile and 8 on desktop. Measured cost is fine
  at 6/8 (see below), so I suggest `touch ? 6 : 8`. The fps box is now only shown for `?fps=1` / `?shot=1`.
- **Lane 1**: the renderer now repaints some tiles (see `atlas_styles.js` STYLE). `BLOCKS[].color` (particles, map) still uses the old
  palette: photomoss ≈ `#1c9a86`, loam ≈ `#4a3f52`, mirror sand ≈ `#aaa3c4`, basalt ≈ `#3d4a60`, crystal turf ≈ `#4fb8a6` if you want them to match.

## Open issues
- Plains crystal turf reads a little pale/low-contrast at a distance under the day haze.
- Bloom costs real fps on high; it's off on med/low (phones default to med).
