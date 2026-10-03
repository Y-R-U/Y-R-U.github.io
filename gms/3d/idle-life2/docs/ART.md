# Idle Life 2 — art kit and plot contract (lane L3a)

The look is set by the concept stills in `refs/` (soft, warm toy diorama: pastel townhouses with chimneys and dormers,
pastel cobbles, striped awnings, iron lamp posts, chunky big-headed people, warm sunrise light, soft shadows).
`js/render/plots/lemonade.js` is the **reference plot**. Copy its structure.

## Tools

| Command | What it does |
|---|---|
| `node tools/artshot.mjs out.png "view=card&plot=lemonade&tod=9&frames=300" 780 341` | Renders `tools/artlab.html` headless on Metal (no UI). Prints calls, tris, programs, top meshes by triangles. |
| `view=hero` (use 412×330) · `view=town` (900×600) | Hero framing comes from the real director (`cameras.js`). Town = the 🗺️ establishing shot. |
| `vt=0\|1\|2` `owned=0` `stock=0..1` `thr=N` `boosts=N` | Visual tier, for-sale lot, pile fill, throughput/boost counts as `stats()` reports them. |
| `tod=0..24` `tm=aces\|agx\|none` `expo=1` | Time of day (local hour otherwise), tone mapper and exposure experiments. |
| `python3 tools/artgate.py shot.png` | Luma/saturation/warmth stats vs the ref crops (`--refs` prints the ref numbers, `--sbs a b out` builds a side-by-side). |
| `node tools/test-boot.mjs` | Must keep passing. |

Shots are only evidence once you have **looked at them**. Self-scores run 1.5–2 points high (HEIRFRAME lesson).

## World layout (`js/data/plots.js`)
- One straight high street along +x at `z = 7.5` (6 m wide). Every plot sits north of it, origin at the plot centre,
  `+x` = street direction, **front = +z** (the road starts at local `z = +4.5`). Plots are 24 m apart (27 m pitch).
- Old Town x 0…81 (home at 0) · river + stone bridge · Suburbs 130…184 · Harbour 226…280 · Downtown 322…376.
- The world draws the ground under every plot (district paving, pavement, kerbs, road). Plots build on top of it.
  - Old Town: pastel cobbles from local z −8.5 to +4.5; a terrace row of townhouses fronts at z ≈ −8.5.
  - Suburbs: a pavement strip z +1.7…+4.5, lawn behind, a hedge + lamp line at z −6/−7.5, detached houses from z −14.
  - **Harbour: quay paving from z −8.2 to +4.5; the quay wall edge is at world/local `z = −8.2`; water (`WATER_Y = −0.55`)
    lies north of it.** Piers, ferries and slipways go north (−z) over the water. The Coast teaser is visible across the bay.
  - Downtown: light plaza tiles from z −20.5 to +4.5; pastel glass towers behind from z ≈ −16.
- `WORLD_BOUNDS` is passed to the director's keep-in-world test. Terrain extends 50–60 m beyond it.

## Plot contract (`kit.plot`)
```js
export default function buildPlot(kit, { line, palette, rng, district }) {
  const P = kit.plot({ id: 'fishchips', line, palette, rng, seed: 21, colors: { accent: '#4f8fb5' } });
  const { b, t1, t2, lot, props: K } = P;   // builders: tier 0 (L1), tier 1 (L25), tier 2 (L100), for-sale lot
  ...build static geometry with b / t1 / t2 / lot...
  const m = P.dynamic((d) => { ...build... }, { tier: 0 });   // a moving part = its own draw call; keep ≤ 3
  P.pile({ at: [x, y, z], kind: 'cup'|'parcel'|'bag'|'crate'|'bun'|'box', size, max, cols, layout, range: [0, 1] });
  const crowd = P.crowd({ count: 8 });                        // 1 draw + 1 blob-shadow draw
  const q = P.queue(crowd, { ids, spawn, counter, dir, gap, exit, serve });   // customers queue, get served, leave carrying
  P.walkers(crowd, { ids, paths: [[[x, z], ...]], speed, loop: 'wrap'|'pingpong' });
  return P.done({ w, d, h, camera: { pos, look, fov }, exit, tapTargets, update(dt, stats, time, tier, ctx) { ... } });
}
```
- Tiers are **additive**: `t1` geometry shows from Lv 25, `t2` from Lv 100. They are merged into one static mesh on change
  (one draw call per plot) and pop in with a squash-and-stretch. `lot` shows only while the line is unowned.
- `bounds.w` sets the framing: the card fits `0.92 × w` across; the hero fits `1.02 × w`. ~13–16 m reads well.
- `camera.pos/look` are local; the rig solves distance from the width, but never goes closer than |pos − look|, so keep pos close. Use elevation ≈ 30° so the top of
  the 16:7 card lands on facades, not sky. Look from the front-left (`pos.x < 0`) so the sun rakes across.
- `ctx` in update = `{ owned, managed, stats, vt, time, dt }`. `stats.sigmaUpgrades` / `stats.boosts` let throughput
  and boost purchases appear (second server, ice box …). `stats.stockRatio` drives piles (use `range` to split piles).
- `q.serving()` is the customer being served right now — animate the worker / prop from it.
- Do not create materials. Everything goes through builders → `materials.uber`.

## Builder (`kit.builder(palette)` / the P builders)
Colours are palette **slot names** (`'wall'`, `'roof'`, `'wood'`, `'accent'`, …), hex strings, or `{ c, r, m, g }`.
Per-vertex PBR rides along: roughness `r`, metalness `m`, glow `g` (`g > 0` always lit — neon/bulbs; `g < 0` lights only
at night — windows, lamp glass). Slots with built-in response: `glass window metal chrome gold neon bulb lamp …`.

| Call | Notes |
|---|---|
| `b.slab(slot, x, y, z, w, h, d, {round, taper, ry, rx, rz, parent, r, m, g, sway, noAo})` | The soft rounded block. Origin at its base centre. Never a raw box. |
| `b.box(...)`, `b.tilt(...)` | Legacy names → slab. |
| `b.cyl(slot, x, y, z, r, h, ry, {sides=9, taper=0.88})` · `b.disc` · `b.cone` · `b.ball(slot, x, y, z, r, {sx, sy, sz, detail, smooth})` | Odd side counts only. |
| `b.roof(...)`, `b.hip(...)`, `b.awning(slot, x, y, z, w, d, ry, {alt, drop, stripes})` | Awning slopes toward +z with a scalloped valance. |
| `b.add(geometry, slot \| null, {x, y, z, ry, scale, parent})` | Stamp any `kit.shape` geometry (null slot keeps its colours). |
| `opts.parent` | A `kit.shape.matrix({pos, ry})` to nest a sub-assembly (every prop helper accepts it). |
| `opts.sway` | Wind sway weight per metre of height (foliage, bunting). |

`kit.props`: `house(b, x, z, {w, d, floors, wall, roof, ridgeX, shop:{awning, sign}, shutters, boxes, lite})`,
`windowUnit`, `door`, `roofGeo`, `lamp` (returns the bulb position — push it to `plot.lamps` for the night halo),
`bench`, `planter`, `bush`, `roundTree`, `pineTree`, `cypress`, `bin`, `bollard`, `crate`, `picket`, `hedge`,
`bunting(b, a3, c3)`, `paving(b, cx, cz, w, d, {colors, tile})`, `flowerBed`, `signPost`, `umbrella`, `table`, `streetSign`.
`kit.vehicles`: `van(b, x, z, ry, slot)`, `car(b, x, z, ry, slot, {dirty})`, `boat(b, x, z, ry, slot, len, {y, stripe})` — front = +x.
`kit.stockUnit(kind, palette, color)` returns a unit stock geometry. `kit.shape` is the FACET primitive kit
(`prism`, `block`, `blob`, `spire`, `gable`, `loft`, `ribbon`, `drum`, `smooth`, `matrix` …).

## People (`kit/crowd.js`)
Chibi rig, one InstancedMesh per crowd. `crowd.set(i, x, y, z, heading, clip, phase?, speed?)`, `crowd.hide(i)`,
`crowd.look(i, {top, bot, skin 0–5, hair 0–7, style 0–4, acc})` (`acc: 0` = apron), `crowd.body(i, headK, legK, scale)`
(kids: `1.12, 0.72, 0.8`). Clips (`kit.CLIP`): `idle walk carry work cheer sit sip sweep`. Heading 0 faces +z.
People never cast shadow-map shadows; each gets a soft blob.

## Light and time of day
`data/palette.js` `LIGHTS` (dawn/day/dusk/night) blended by local hour (`DAY_KEYS`); `?tod=` overrides. One sun casts
the only shadow map (mid/high tiers; 1024/2048), its box follows each view. Hemisphere fill is lilac/peach (never grey),
plus a low rim light. Fog = sky horizon colour, near/far set per view. ACES tone mapping. `world.configureRenderer`
runs from `scene.onBeforeRender` (shadow map on/off per tier, tone mapping) so the host needs no changes.
At night (`uNight`) windows and lamp glass glow and lamps get additive halos (`ambient.js`).

## Budgets (measure with artshot / host.debug)
Hero ≤ 90 draw calls incl. the shadow pass; card ≤ 30 (ARCH said 20 for a Lambert world; the shadow pass alone is
4–8). Per plot: 1 static mesh + ≤ 3 dynamic + piles + crowds. Plot static ≤ ~25k triangles.

## Status (L3a, 2026-10-03)
- Kit, town (Old Town / river + bridge / Suburbs / Harbour quay + lighthouse / Downtown towers / far coast), lighting + time of
  day, chibi crowd, ambient life (pigeons, gulls, joggers, traffic, night lamp halos): done.
- Plots done: lemonade (reference), foodtruck, barber, cafe, carwash, petsalon, home (bench/cans/bin + 6 homes + removal van).
  `render/life.js`: player ageing (grey at 56+, slower at 66+), partner, 3 kids by stage, teen working their line, dog,
  landmarks (plaque at the line, statues in the home park, Grandma's House at x −15.5).
- Shots: `docs/art/shots/`. Blind sheets: `docs/art/critic/*_r1.png`, answer key `docs/art/critic/KEY.md`
  (`node tools/artsheet.mjs ours.png refs/x.jpg name [round]`).
- Measured (artlab, Metal): card ≈ 24 calls / 310k tris main + ≈ 15 / 146k shadow; hero ≈ 45–59 calls. Real game (412×915
  mobile, high): heroCallsMax 59, cardCallsMax 39, avg frame work 3.7 ms. Over the old 20-call card budget because of the
  shadow pass; town chunks (44 m × 3 z-bands) are the main triangle cost.
- Self-critique (honest, vs refs): ~6–7/10. Gaps: no soft DOF/tilt-shift and no bloom (needs a host post pass — L2); refs'
  global-illumination softness; barber/pet salon interiors still a little bare; town map view reads as a strip.

## Art round 2 (2026-10-03) — what changed, read before building on the kit
- **Root-cause fix: `shape.loft` side quads were wound inside-out** (normals inward, front walls back-face culled — every
  slab/prism showed its far inner wall, and sun-facing facades self-shadowed). Fixed in `loft`; all blocks, cylinders, cones,
  crowd limbs are now solid. If you hand-built geometry to compensate, remove the compensation.
- `build.js`: vertex AO clamped (no black below y = 0). **New `b.contact(x, z, sx, sz, {ry, parent, k, m})`** — soft ground
  contact shadow; plots get one contact mesh per tier automatically, town gets one mesh. Props (house, lamp, bench, planter,
  bush, tree, bin, crate, table, dog, signPost, flowerBed, car, van) add their own. `contactMesh(materials, rows)` exported.
- `P.blobs(n)` → instanced moving contact shadows (`place(i, x, z, sx, sz, ry)`, `commit()`), e.g. under cars.
- `P.done({ cardW })`: card framing width (hero keeps `w`); world raises `kit.FIT.card` while card rigs fit.
- `props.shop(b, x, z, {w, d, fh, floors, uh, wall, inner, trim, roof|false, sign, floor, open, oh, rh, chimneys, dormer,
  shutters, boxes, awning})` → solid cutaway shopfront (thick pilasters, lintel + sign band, plinth, cornice, upper floor,
  roof). Returns `{M, x0, x1, z0, z1, y (floor top), h, oh, ow}`. Barber and pet salon use it.
- `props.paving` rewritten: default tile 0.62, multi-hue bevelled cobbles, darker crevice from the palette average (`grout`
  still honoured), `edge` option. `props.edging(b, a3, c3, {c, w, h, len})` kerb runs.
- Town ground lives in non-casting `ground:*` chunks; town chunks stop casting on card views (card ≈ 30 calls / 325k tris,
  was 40 / 470k). Old Town: house-front pavement strip + kerb, tree planters/benches/bollards between plots.
- Lighting: sun az ≈ 36°, el 28° (rakes facades, shadows fall back-left), cool lilac sky fill + warm peach bounce, env
  intensity per palette (`envK`), exposure ≈ 1.3, fog pushed ~70 % further, fresnel sheen on uber (`uRim`) and stronger warm
  rim + skin subsurface on crowd (`uRimCrowd`). `world.renderConfig` tames L2's bloom (threshold from night factor) + tilt.
- Palette: saturated walls/roofs, darker glass, softer grass, warm amber night windows `#ffb45a`, turquoise water.
- Crowd default scale 1.36. Cars chunkier, smaller wheels, tinted glass. New food truck, car wash tunnel (solid portal,
  star-disc brushes, foam clouds, waiting bay), barber, pet salon.
- cameras.js: hero centres on `plot.focus` (L3b) else z −1.0 (more terrace, less road); portrait elevation 31°.
- Night/dusk: deeper blue night key with a low moon, warm bounce, amber windows, **warm lamp pools** on the ground
  (`ambient.js`, additive, scale with night); plot lamps are now collected automatically (`b.lamps` → `plot.lamps`).
  Judge at `tod=9`, `tod=18` and `tod=22`. Night cobbles still read lighter/lilac vs the Hollow's Eve ref.
- Critic set r2: `docs/art/critic/*_r2.png` (7 day + `night_r2`, `dusk_r2`), key `KEY_r2.md`; shots `docs/art/shots/r2_*.png`.
- Honest self-score vs refs: ~6/10 cards, ~6.5 hero (critic would likely say 5–6). Remaining gaps: brushes read blocky,
  pet-salon interior pale, empty road band at the bottom of the hero, no real GI softness, cards could use per-plot polish.

## Art round 3 (R3A, 2026-10-03) — read before building on the kit
Kit API is backward compatible; additions and default changes:
- **Shader world light** (`materials.js`, also on the crowd): every uber/crowd fragment gets `vWP/vWN` world varyings and
  `WORLD_LIGHT_FRAG` — warm **bounce** off the paving onto low walls (`uBounce`, from `LIGHTS.*.bounce/bounceK`) and the
  **8 nearest street lamps as real warm pools** at night (`uLamps`, `uLampCol`, `uLampK = LIGHTS.*.lamps × 2.6`). World
  picks the lamps per view in `prepare()` (`ambient.nearest(x, z, n)`); every `b.lamps`/`plot.lamps`/town lamp is a light.
  The old additive pool quads are now a faint 0.28 halo. Exported for custom shaders: `WORLD_LIGHT_HEAD/FRAG`, `WORLD_POS_VERT`.
- Night windows (`g < 0`) emit at `uNight × 2.2` (was 1.4). `kit.setLamps(list)` exists if you need to drive lamps yourself.
- **Palette `LIGHTS`**: dawn warm key + golden rim (`rim` is now warm, not lilac), dusk = low orange sun az 150 / el 14 with
  violet fill and a strong golden rim, night = rich violet fill, dim moon, warm lamp pools. New keys: `bounce`, `bounceK`, `lamps`.
- **`props.paving` defaults changed**: tile 0.95 (was 0.62), 2-step rounded bevel, thin gap, warm grout (avg × 0.86/0.8/0.8),
  `breaks` (chance of the last two colours as a subtle colour break, default 0.06). Pass `tile:` explicitly to keep a small cobble.
  `PALETTE.cobbles` is now one warm cream/peach family with two lilac/sage breaks at the end — keep breaks last.
- New `props.lawn(b, x, z, w, d, {ry, h, kerb, grass, y})` → raised kerbed lawn island; returns the top y for dressing.
- `props.windowUnit({lite: true})` now has a real frame (reveal + sill + mullion, ~34 tris) and honours `shutter`/`box`.
- `props.shop({innerGlow = 0.12})` — interior floor/walls carry a small always-on glow so cutaway interiors read in shadow.
- Crowd: bigger eyes with catchlights, brows (hair colour), smile, chunkier arms/hands, lighter `HAIR` palette (no near-black).
- Cameras: hero fov 34, elevation 35° portrait / 31° wide, yaw ±19°. Plots may set **`plot.heroBox = {z0, z1, h, hf, w, x}`**
  (plot-local framing box: back edge carries the facades + roofs, front edge stops at the kerb; look is centred in it). World
  gives every Old Town plot `{z0: −9, z1: 1.4, h: 6.6}` by default; `plot.heroFocus` overrides `focus` for the hero only.
  Card cameras for the 6 R3A plots moved to ~28–35° elevation (shop interiors ~24–27° so the lintel doesn't hide the action).
- world.js: a plot builder that throws is logged and skipped instead of taking the whole world down.
- Tools: `artlab.html` renders the hero through the real `post.js` (bloom + tilt; `post=0|1` overrides). `artsheet.mjs`:
  `FIT=pad` letterboxes both sides (full frames, no crop); round ≠ 1 writes `KEY_r<round>.md`. Use your own `CDP_PORT`
  (two agents on 9251 kill each other's Chrome).
- Plots: carwash = big pink/white foam spilling from both mouths, bright orange hero car dwelling at the exit with a
  drier; barber = customers face camera, barbers 3/4 behind the chair, chairs forward, lighter checker, glowing wallpaper;
  pet salon = wider/taller opening, grooming station + tub moved forward and lowered, bigger dogs/tub, ceiling bulbs;
  café = no umbrella over the shopfront, side seats; lemonade = lawn island + bench/planters in the empty plaza.
- Measured: artlab cards 28–35 calls (all tiers, night); real game S22 412×915 high: heroCallsMax 70, cardCallsMax 35–36,
  avg frame work 4.1–4.7 ms (desktop Metal). Hero ≈ 565k tris incl. shadow pass (window frames + wider hero view; was 480k).
- Critic set r3: `docs/art/critic/*_r3.png` (6 R3A plots + hero + dusk + night), key `KEY_r3.md`; shots `docs/art/shots/r3_*.png`.
- Honest self-score (subtract 1.5–2 for the critic): carwash ~7, lemonade/foodtruck ~7, hero ~7, night ~7, dusk ~6.5,
  barber ~6.5, cafe ~6, pet salon ~6. Open: plaza paving still the largest area in the hero; pet salon dog head under the
  lintel; dusk sky never visible (no-sky-wedge rule) so dusk reads from light only; Downtown paving (R3B lane) still lilac.

## Art round 4 (R4A, 2026-10-04) — read before building on the kit
Kit stays backward compatible. Additions and default changes:
- **Textured ground (`kit/surface.js`, new).** Boot generates three DataTextures (~2.4 MB GPU with mips): a 512² tileable
  irregular cobble set (albedo jitter per stone in pastel tints, worn centres, cracks, joint mask, height slope) and a 256²
  grass clump map. The uber shader picks a surface by **`aPbr.w < 0.5`**: `cobble(moss)` = −1 − moss (0..1, moss grows in the
  joints), `GRASS` = 0.25, `ROOF` = 0.4 (procedural staggered roof-tile courses, no texture, derivative-faded). Exported from
  `build.js`: `GRASS`, `ROOF`, `cobble()`. Pass `{ surf }` to `b.add/slab`, or put a per-vertex `aSurf` attribute on the geometry.
  Slots `grass`/`grass2`/`lawn` get GRASS automatically on their top faces. Terrain grass is flagged too. World-space planar
  mapping (3.9 m cobble tile), so any flat ground anywhere just works — no UVs needed.
- **`props.paving` is now a flat textured grid** (the old bevelled tiles are `{ legacy: true }`). Options: `colors` (averaged to
  one district tint), `tone` (×brightness, default 0.94), `moss` (number or `{ n, s, e, w }` edge weights), `mossW` (falloff m),
  `edge`. `tile`/`long`/`h`/`grout` are ignored. Far fewer triangles than before.
- **Every `roofGeo` roof now shows tile courses** (it carries `aSurf = ROOF`).
- `props.house`: `band` (darker ground-floor band), `quoins` (corner stones), `ww`/`wh` (window size); town rows jitter z,
  floor height, pitch, floors, chimneys, dormers per house. `windowUnit({ lite })` has a transom bar. `props.lawn` scatters
  swaying grass tufts (`tufts:` count).
- **Crowd**: global `CROWD_K = 1.22` multiplies every crowd's scale (R4B plots grew too — check staff behind low canopies/lintels);
  bigger eyes with two catchlights, nose, bigger mouth/cheeks, hair styles 5 (long) and 6 (bunches), 10 hair colours, more
  outfit/pant colours, stronger fresnel rim that doubles at night. Blob/contact shadows darker (0.58 / 0.62).
- Ambient: night **ground mist** (one mesh, drifts), fades in above night 0.3.
- Palette: cooler dawn/day fill (blue sky fill, less orange bounce), more neutral cobbles, richer greens; dusk exposure 1.05;
  night fill lifted (no crushed navy), cool-blue rim, lamps 1.35.
- World: Old Town default `heroBox = { z0: −9, z1: 0.8, h: 7.4, hf: 1.6 }` (more facade/roof, less plaza).
- Plots: barber deeper → shallower shop (Z0 −3.5, H 3.6), first chair centred, barber beside the chair, waiting bench moved right
  and angled to camera, flowerbed + A-board; pet salon shallower + taller opening, grooming station/tub/staff forward, smaller
  sign plaque on the parapet, camera lifted (no crop); café terrace moved back, hatch canopy raised, frontal camera; lemonade
  lanterns (warm lamp light at night), two kerbed lawns with tree/bushes/flowers; card looks raised on lemonade/foodtruck/carwash.
- Tools: `tools/gameshot.mjs out.png "tod=9"` = real game at S22 412×915@3x + host perf + rAF p50/p95 (CDP_PORT default 9451).
  `artsheet.mjs` `FIT=native` = both sides at the same height, full frames, no letterbox, no crop (use refs of the same aspect).
- Measured: artlab cards 27–32 calls, hero 70–73. Real game S22 (Metal, high): heroCallsMax 69–70, cardCallsMax 29–32,
  avg frame work 1.1–1.3 ms, rAF p95 16.8 ms (vsync), day and night.
- Critic set r4: `docs/art/critic/*_r4.png` (6 plots + hero + dusk + night, hero/dusk/night are 1.75:1 vs the wide refs),
  key `KEY_r4.md`; shots `docs/art/shots/r4_*.png`.
- Honest self-score (subtract 1.5–2 for the critic): lemonade/hero ~7.5, barber ~7, pet salon ~7, café ~6.5, carwash ~7,
  foodtruck ~7, dusk ~7, night ~7. Open: queue walkers still crop at card edges; sky/moon never in frame (no moon added);
  Old Town street uses the same cobble as the plaza (only darker); grass reads soft rather than lush up close.

## Pre-ship polish (2026-10-04, after critic r4)
- **Cobbles calmer** (`kit/surface.js`): per-stone luminance spread 0.26→0.10, tints ~60% closer to neutral, wear/crack/noise
  contrast cut, lighter grout (0.72), slope-normal strength 18→7, joint AO 0.7→0.84. Shader adds large soft tonal drift
  (two low-frequency noises, cool↔warm) and desaturates the cobble albedo 38%. Irregular stone read kept.
- **Lamp pools** (`materials.js` WORLD_LIGHT_FRAG): hard product falloff → gaussian (`exp(-h²/7)`, ×0.8), softer edges, less blotch.
- **Night palette**: fill sky/ground and sheen less saturated (cobbles less pink/purple).
- **Hollow's Eve**: crowd hair is lightened per hue while inside the season (`crowd.userData.hair`, restored on leave), brighter
  costume tops, crowd rim `#ffc49a ×0.5` (was `#ffb070 ×0.95`), pumpkin glow pools opacity 0.3→0.17 and 20% smaller.
  Fixes "black blobs with orange halos".
- **Card crops**: queue/spawn/exit paths in cafe, foodtruck, fishchips, lemonade moved back from the camera (z ≲ 2) and left exits
  leave via the far side; foodtruck queue runs left of the hatch (exit right); diners/benches pulled inside the frame;
  foodtruck and lemonade card cameras dollied back ~12–15%. Probe: no walker head below 0.86 of frame height while on screen.
- Perf unchanged (calls identical; real game S22 rAF p95 16.7 ms, heroCallsMax 69–71, cardCallsMax 30–33).
