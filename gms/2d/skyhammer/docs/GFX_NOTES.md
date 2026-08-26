# SKYHAMMER — GFX NOTES

Owner: **3D RENDER agent**. Files owned: `js/gfx/**` except `js/gfx/debug.js`, `tools/lab/**`,
`tools/contrastgate.mjs`, this file.

Read `CONTRACTS.md` §14, `ART.md`, then `ART_NOTES.md` (the outgoing 2D agent's handover), then
this. Written so a fresh agent can resume without re-deriving anything.

---

## 0. State — 2026-08-26

Everything below is built, running, and captured. The renderer is complete end to end: sky,
clouds, distant skyline, streamed terrain and water, models for every `shape` string, actors,
projectiles, FX, explosions, mesh debris, bloom, and a falsified readability gate.

| area | state |
|---|---|
| sky / clouds / backdrop / terrain / water | done |
| lighting + fog + shadows | done |
| models: 24 ground shapes, 20 aircraft, 13 boss parts, graceful placeholder | done |
| actors, instancing, damage lean/shake/flash | done |
| explosions, nuke, debris, tracers, muzzle, contrails, jet exhaust | done |
| bloom behind a toggle, correct with it off | done |
| `tools/lab/gfx.html` + fake world + burned-in resolved config | done |
| `tools/contrastgate.mjs` **falsified** | done |
| water sparkle, city skyline silhouette, alpine colour | weak, see §9 |

Console errors: **zero** across all captured palettes (`--console` sweep, §7).

---

## 1. The five decisions that everything else hangs off

### 1.1 The camera fit is exact and load-bearing
`js/gfx/camera.js`. `PerspectiveCamera(fov 20°)` at `z = (900/2)/tan(10°) = 2551.4`, so the
visible height at `z = 0` is **exactly 900 world units**. The camera is **never rotated**, which
is what makes `sim x/y == mesh x/y` true, makes the curve shader exact, and makes world→screen a
pure scale (`scale = screenH / 900`).

**Consequence worth knowing:** an unrotated camera sees **no horizontal top faces at all**. A
terrain "top surface" is invisible edge-on. Every lit upper surface in the game is therefore a
*chamfer* — a face that slopes forward and down — never a flat top. See §3.

### 1.2 Parallax comes from a corrected z, not from z alone (`js/gfx/layer.js`)
A layer at `z = -Z` is naturally scaled by `n = D/(D+Z)`, which bottoms out near 0.30 inside the
`-6000` budget — nowhere near ART.md's 0.06 far band. So each layer's group is repositioned every
frame and its children are pre-multiplied by `1/n`:

```
group.x = camX - inv*(camX*p)
group.y = camY - inv*(REST + (camY-REST)*p)      // REST = CAM.baseY + 450
child   = design * inv
```

This gives **exactly** parallax `p` while the layer still lives at a real `z`, so depth sorting
and (where enabled) fog still work on it.

> **The bug this cost an hour.** Without the `REST` term, a layer's design y is measured from the
> camera *centre* rather than from the world, so at rest every background band sits ~217 units too
> high and reads as enormous. If a background band ever looks the wrong size, check `REST_Y` first.

### 1.3 The horizon curve is a vertex shader, applied to everything in the world layer
`js/gfx/materials.js: patchCurve`. `project_vertex` is replaced so world y is bent by a term
quadratic in the point's camera-relative x, divided by perspective so a background band bends by
the same number of *screen pixels* as the gameplay plane. `curveK` = 4.8% of viewport height at
the screen edges.

**Shadows are deliberately NOT curved.** The depth pass and the receiver's shadow coordinate are
both computed from *uncurved* world space, so the shadow is painted onto the surface and bends
*with* it. Curving one side only is what would break them.

### 1.4 Fog is a linear band that starts just in front of the gameplay plane
`js/gfx/lighting.js`. With a narrow-FOV camera 2551 units back, **every gameplay object sits at
essentially the same distance from the camera**, so a distance fog would be a flat tint over the
playfield and useless. Setting `fog.near = D - 220` and `fog.far = D + 5400/fog.k` leaves the
whole playfield untouched and hazes only the negative-z background. That satisfies ART.md §2's
"keep fog off the player" with no per-object exception.

The **backdrop bands have scene fog OFF** (`js/gfx/backdrop.js`). One scene fog colour is tuned to
the *horizon*; applying it to bands that rise well above the horizon turned every distant mountain
warm — the "orange sand dunes" defect ART_NOTES §5 recorded. Per-band haze baked with
`band.hazeFar` gives the same aerial perspective with per-band control.

### 1.5 Aerial perspective pulls distant things toward the SKY BEHIND them, not toward the sun glow
`js/gfx/palette.js: distTint`. `band.haze` (= fog colour, warm) is right for cloud undersides;
`band.hazeFar` (= fog mixed 80% toward the sky colour above the horizon, then desaturated 50%) is
right for mountains. Using the warm one for both is what made dusk mountains read as sand dunes.

---

## 2. Palettes are COMPOSED (D20 / CONTRACTS §15.4)

`js/gfx/palette.js` is pure data + pure functions, loads under plain node, no DOM.

```
BIOME (6) x TOD (4) x WEATHER (3)  ->  resolvePalette(biome, tod, weather)  ->  72 combinations
```

13 authored entries. `validatePalettes()` resolves and structurally checks all 72; it currently
returns 72. Weather is a modifier (fog density, cloud cover, light attenuation, desaturation, sky
flattening), never its own palette.

Derived rather than authored, on purpose:
- **fog colour** is derived from the horizon stop, so haze can never disagree with the sky;
- **`band.*`** are hazed from the biome's base tints toward `hazeFar`;
- **`sun.discK` is forced to 0** when `sun.intensity * lightK < 0.7` or under a flat sky —
  ART_NOTES §5 recorded that overcast was still showing a disc it shouldn't.

`resolvePalette` caches, so a per-frame call is free. The renderer resolves once per level.

---

## 3. Terrain: one mesh covers land AND water

`js/gfx/terrain.js`. `heightAt(x)` already returns the water line over sea, so a single streamed
ribbon draws both. That kills ART_NOTES §2's recorded mistake (land horizon curved, water horizon
flat) by construction — one silhouette, one curve, one shoreline junction.

Per column, three levels:

```
A (x, h,       0)     silhouette edge — at z=0 so screen y == sim y, EXACTLY
B (x, h-34,  200)     lit chamfer bottom: the grassy crest that catches the low sun
C (x, -1600, 200)     near-black earth face (ART.md §1's silhouette band)
```

Nothing has `z < 0` in the ground layer. Anything that did would poke *above* A on screen and
steal the silhouette, which is how the ground line would stop agreeing with `heightAt`.

Streamed in 1200-unit chunks, sampled every 24 units, 2 chunks of slack either side, disposed on
the way out. Typically **4 chunks live**.

The procedural mid-ridge that used to sit behind this was **removed**: three land bands is one
more than the value separation supports (ART_NOTES §5) and the hills plate already owns that
distance. Land bands are now exactly: mountains plate (p 0.14) → hills plate (p 0.35) → terrain
(p 1.0).

Vegetation is instanced, clustered by a low-frequency mask gating a high-frequency scatter, with
real scale variance, and takes its colour from the **earth**, not from the hazed distant
treeline — using the distant tint made foreground trees read as pale tan blobs.

---

## 4. Background band geometry — the numbers, and how to re-derive them

Both plates are solid below their ridge, so the band in *front* hides the one behind unless the
ridge heights are placed deliberately. Targets, in world y:

| band | ridge typical | ridge peaks |
|---|---|---|
| terrain | −90 … +120 (sim's, D21) | |
| hills (p 0.35, z −1500) | ~+90 | ~+130 |
| mountains (p 0.14, z −3600) | ~+230 | ~+400 |

To re-derive after changing a baker: work out where the ridge sits as a fraction of the plate
height from the bottom (`fTyp`, `fPeak`), then solve
`B + fTyp*H = wantTypical`, `B + fPeak*H = wantPeak` for plate height `H` and base `B`;
`tileScreen = H * plateAspect`. Current values are in `BANDS` in `js/gfx/backdrop.js`.

Mountains use a **ridged** noise (`peaks()` in `bakers.js`, `1 - |sin|` summed) — a plain sine sum
gives a snow *blanket*, not mountains.

**Seamlessness (D24).** Every harmonic in both `ridge()` and `peaks()` is an **integer** multiple
of the tile, so value and slope match at the wrap. The old 2.13× ratio produced a hard wedge once
per screen width in every frame. Any plate that cannot tile is not usable as a plate.

---

## 5. The readability law, and the gate that has been proven to fail

### How it is built into the drawing
1. **Adaptive core value.** `js/gfx/actors.js` sets the player material's core luminance *away
   from the sky's*: near-black on a bright daylight sky, lifted on a night sky. A fixed livery
   value cannot satisfy ART.md §2 across 72 palettes, and a plane at the sky's own luminance is
   invisible however saturated it is.
2. **A camera-tracking rim** (`patchRim`, `pow(1-|N·V|, 3.4)`), warm, stronger on bright skies.
3. **The halo** — a soft additive lift behind the plane at ~1.9× its length. ART_NOTES §3 says do
   not drop it; it is doing the work the sun cannot when the plane crosses the horizon bloom.
4. **An altitude shadow** on the terrain directly below the player, fading with height.
5. **Fog is off the player entirely**, and **enemy aircraft carry a haze term** (`patchHaze`, a
   `mix()` toward the sky colour at k=0.30) that pushes them *toward* the background.
   > A `mix` is used rather than an emissive lift because an emissive lift ADDS light and flattens
   > the shading; a mix keeps the form and only lowers the contrast, which is what distance does.
   > Note also that **darkening** a hostile against a bright sky makes it MORE readable, not less —
   > the opposite of what ART_NOTES §1.2 asks for.

### `tools/contrastgate.mjs`
Copies the WebGL canvas into a 2D canvas inside the page and samples it there, so no PNG decoding
is needed and the numbers come from the frame that was really drawn. Per actor it measures RMS
luminance contrast of a screen-space box against a 3× dilated ring.

**Asserted:** (1) the player's RMS clears a floor; (2) the player out-scores every **enemy
aircraft** by ≥5%.

**Reported but NOT asserted, deliberately:**
- *Rank against ground props.* A dark building whose box straddles the horizon contains both
  near-black earth and bright sky, so its within-box variance is enormous no matter how the plane
  is drawn. It is a property of the box, not of the building's salience.
- *Michelson (box mean vs ring mean).* Even a tight fuselage box is ~55% background, so as the
  plane's value crosses the sky's the signed difference passes through zero and the number
  collapses **while the plane is at its most readable**. Asserting on it failed a good build for
  the wrong reason during development. RMS has no such failure mode.

Aircraft boxes are the **fuselage core** (0.66 × len by 0.22 × len), not the full span: a
full-span box is mostly background, and background contamination is what makes a contrast number
lie.

### FALSIFICATION LEDGER — the point of the exercise

`--sabotage` calls `window.__lab.camouflage(true)`, which samples the pixel actually behind the
plane and repaints the player in that colour with `color=black, emissive=thatColour`, rim 0, halo
hidden. That is precisely the failure ART.md §2 exists to prevent.

| run | date | result |
|---|---|---|
| `node tools/contrastgate.mjs` | 2026-08-26 | **GATE PASS 8/8** |
| `node tools/contrastgate.mjs --sabotage` | 2026-08-26 | **GATE FAIL 0/8** — every case failed the RMS floor, most also out-read by enemy aircraft |
| repeat run, byte-identical numbers | 2026-08-26 | deterministic (see `?gate=1` below) |

**The gate is only meaningful because the frame is reproducible.** `?gate=1` disables the fake
world's random explosions and gunfire, warms exactly `t*60` ticks at a fixed `dt`, then freezes.
Before that was added the gate flipped between PASS 8/8 and FAIL 3/8 on consecutive runs, purely
because an enemy biplane happened to drift over the horizon instead of over open sky — a contrast
number measured on a frame that differs run to run is a coin toss, not a gate.

Measured RMS, 844×390 (the numbers the floor is set from):

| case | live | sabotaged |
|---|---|---|
| farmland/dawn/clear | 0.396 | 0.131 |
| city/dusk/clear | 0.635 | 0.224 |
| sea/day/clear | 0.408 | 0.091 |
| alpine/day/overcast | 0.400 | 0.089 |

Floor is **0.28** — above every sabotage score, below every live score. Re-derive it if the
lighting changes materially; do not raise it without re-running the sabotage.

**The gate was seen to fail before it was believed. Do not trust a future pass without re-running
`--sabotage` after any change to lighting, liveries or the halo.**

---

## 6. Explosions (`js/gfx/explosions.js`) — the file with the most work in it

One recipe, scaled continuously off the blast radius `R`: white-hot core → additive fireball →
embers under gravity → smoke column sheared backwards → shockwave ring → **a real `PointLight`
that lights the terrain and the aeroplane** → scorch decal on the ground. Above `NUKE_R = 520` it
grows a mushroom and whites the screen out.

Nothing is allocated after boot: one particle array (cap 2200), two instanced meshes (additive
fire, alpha smoke with a per-instance alpha attribute), 20 pooled rings, 40 pooled decals,
**4 `PointLight`s that live in the scene permanently at intensity 0** — adding or removing a light
recompiles every shader, so they are never added or removed.

Two pacing lessons, both learned from captures:
- **The viewport is only 900 units tall.** The mushroom cap height is capped in *absolute* units
  (`min(R*1.5, 520)`), not scaled off `R`. At `r = 700` an uncapped 1.5R cap sits entirely above
  the top of the screen and the nuke looks like it vanished.
- **The column must rise slowly enough to be read** — about a quarter of the blast radius per
  second, over 4–7 s. The first version climbed at 2–3 × R/s and was off-screen in one second.

`explode` events throw **dirt**, not masonry: real mesh chunks come from `kill`, where the def
says how big the thing that broke actually was. Shattering off the blast radius produced a swarm
of building-sized cubes from a bomb hitting open ground.

---

## 7. Performance — measured, on a real GPU

`--gpu` (ANGLE Metal). SwiftShader numbers are meaningless and are not reported.
Stress: an explosion every 250 ms for 6.5 s plus one `r=640` nuke, ~700 live particles.

| size | bloom | p95 CPU frame | mean | fps | draw calls | tris |
|---|---|---|---|---|---|---|
| 844×390 | on | **2.60 ms** | 16.61 ms | 60.2 | **64** | 10.5k |
| 844×390 | off | **1.50 ms** | 16.62 ms | 60.2 | **51** | 10.6k |
| 932×430 | on | **2.50 ms** | 16.60 ms | 60.2 | **65** | 10.6k |
| 932×430 | off | **1.70 ms** | 16.67 ms | 60.0 | **51** | 10.4k |

Idle (no FX) is **48–60 draw calls** depending on palette; `mean 16.6 ms` is vsync, i.e. the frame
budget was never missed in any run.

**Read this honestly:** `p95` is the CPU cost of `world.tick + renderer.draw`, not GPU time. The
frame rate holding at 60.0–60.2 through the nuke is the real signal. **No measurement has been
taken on a phone.** The headroom (2.6 ms of a 16.6 ms budget, ~60 draw calls) is the argument, not
a measurement.

Budget notes: the ground layer is 4 chunks; every repeated prop is one `InstancedMesh` per shape;
clouds are 4 draw calls for 50 sprites via a 4×4 atlas with a per-instance UV attribute; all
particles are 2 draw calls; `devicePixelRatio` capped at 2 (`?dpr=` overrides for capture).

---

## 8. The lab, and how to capture

`tools/lab/gfx.html` builds a **fake world matching CONTRACTS §4/§5/§6** and drives the real
renderer with it. It uses the **real** `js/sim/terrain.js` (DOM-free, node-runnable), so the
ground the lab shows is the ground the game will show.

Controls: biome / tod / weather selectors, per-layer toggles (sky, clouds, backdrop, terrain, veg,
actors, fx), BOOM, NUKE, bloom, reduce-effects, climb, dive, freeze, photo, reseed.

URL params: `biome tod weather seed plane bloom reduce photo freeze ang alt t preserve dpr`.
`t=<seconds>` warms the fake sim forward before the first frame so a capture at t=0 is not empty.
`photo=1` hides the UI but **keeps a one-line stamp**; `photo=2` is fully clean.

```
node tools/shot.mjs --url "/tools/lab/gfx.html?biome=farmland&tod=dawn&t=5&photo=1" \
     --size 844x390 --dpr 1 --at 0 --out shots/gfx --console --state
```

`?preserve=1` and `?dpr=` are honoured by the renderer (`js/gfx/renderer.js` reads them) — this is
cdp.mjs gotcha 2, `Page.captureScreenshot` hangs forever on an animating WebGL canvas.

### D23 — the resolved configuration is burned into the picture
`tools/lab/readout.js` renders the **resolved** palette key, seed, size, dpr and bloom state into
a camera-locked textured quad, so it lands **inside the WebGL canvas that `shot.mjs` captures**.
A separate 2D overlay would not be in the picture.

> This caught a real fault during this session, exactly as D23 predicted. A zsh capture loop using
> `set -- $k` produced seven files named `final_<biome> <tod> <clear>___*.png` with **all three
> values in `$1`** — zsh does not word-split unquoted parameters. The filenames looked plausible.
> The `--state` JSON and the burn-in are what showed it. Always check the resolved key, never the
> filename. The current sweep's resolved keys were verified against their requests one by one.

---

## 9. What still looks weak — read this before claiming anything is finished

1. **Ground props read as dark lumps at gameplay scale.** A farmhouse is ~85 world units against
   900, i.e. ~37 px at 844×390, and against a bright sky it is mostly silhouette. The models
   themselves are fine in isolation (check them by flying the lab close); the problem is value —
   they need a lighter sun-side plane or a stronger prop rim to separate from each other. The prop
   rim is currently only 0.30.
2. **Water is under-built.** The sparkle band exists (`glint` in `terrain.js`) but is faint, there
   is no shoreline foam, and there are no wave forms. Sea and coast levels are the least finished
   biomes. ART_NOTES §5's "white dashes" defect is *not* reproduced — the streaks are randomised —
   but nothing has replaced it either.
3. **Alpine still reads dead**, exactly as ART_NOTES §5 said. Near-white haze, near-black earth,
   no colour anywhere. It needs a deliberate cool-blue shadow shift or a warm accent; the composed
   palette makes that a two-line change in `BIOME.alpine` / `TOD.day`.

4. **Night clouds are too bright.** `cloud.top` is derived as `mix('#ffffff', ...)` regardless of
   time of day, so at `city/night` the cloud bands read as white paint on a black sky instead of
   dark shapes catching a little skyglow. It is a one-line change in `resolvePalette`'s `cloud`
   block — key `cloud.top` off the TOD's sky luminance.
5. **The player's halo reads as an orange blob on a dark sky.** It is doing its job at dawn/day;
   at night, where the plane already has all the contrast it needs, it should shrink or switch off.
   `haloMat.opacity` is already palette-driven in `actors.js`, so this is a value change.

Also outstanding, lower priority: `BIOME.city` declares `skyline: 'city'` but the hills baker
ignores it, so a city level gets farmland hills; the mid-hills band is only just distinguishable
from the mountains at some palettes; enemy aircraft read a little flat at gameplay scale.

---

## 10. Interfaces other agents depend on

```js
// js/gfx/renderer.js
makeRenderer(canvas | { gl, hud })  ->  {
  resize(), draw(world, alpha, events),
  project(x, y, z?) -> {x, y},   // world -> CSS px, INCLUDES the horizon curve — the HUD agent
  unproject(sx, sy) -> {x, y},   // needs project() for any world-anchored mark
  scale(),                       // CSS px per world unit
  setQuality({ bloom, reduceEffects }), quality(),
  boom(x, y, r, opts),           // fire an explosion directly (lab + tests)
  camera, camApi, scene, parts, stats,
}
```

`stats` carries `{ fps, ms, drawCalls, tris, chunks, particles, palette, dpr, size }`.

**For the UI agent:** `project()` already applies the screen-space horizon curve, so a health bar
placed with it sits correctly over a prop near the screen edge. Do not re-implement CONTRACTS §2's
transform in `js/ui/**` — it would be flat and would drift by up to 43 px at the edges.

**Plates.** `js/gfx/plates.js` is unchanged in contract: `getPlate(key, pal, palKey, variant,
index)` with a registered procedural baker as the **permanent** fallback and `setPlateSource()` to
inject a generated bitmap. Every background texture and every FX sprite goes through it, so a
Flux-generated sky or cloud plate drops in with no code change. Keys and sizes are in
`PLATE_SPECS`.

**Models — coverage verified.** Every `shape` string reachable from `js/data/**` was enumerated in
the browser and built: **60 shapes (39 enemy defs incl. all 5 bosses' parts, 9 player planes, pad
and carrier) — 60 built, 0 empty, 0 threw**, and a deliberately unknown shape logged exactly one
warning and returned the placeholder. Re-run that check after any data change; it is a dozen lines
of `cdp.eval` over `ENEMIES` and `PLANES`.

`js/gfx/models/index.js: buildModel(shape, pal, opts)` dispatches on the `shape`
string and **degrades gracefully** — an unknown shape logs once and renders an obvious hazard
crate; it never throws and never renders nothing. Add a shape by adding one entry to
`models/ground.js`, `models/aircraft.js` (a row in `FAM` is usually enough) or `models/boss.js`.

---

## 11. Dead code

`js/gfx/dead2d/**` is the cancelled Canvas-2D renderer, banner-marked, imported by nothing. The
cloud-mask recipe and the colour helpers were lifted out of it into `js/gfx/bakers.js` and
`js/gfx/bake.js`; everything else there is dead. Do not wire it up.
