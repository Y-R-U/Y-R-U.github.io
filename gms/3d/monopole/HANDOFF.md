# HANDOFF — MONOPOLE

Running state. Read `CLAUDE.md`, then this, then `BUILD_PLAN.md`.

## Where it is

| # | Component | State |
|---|---|---|
| 0 | Skeleton | **done** |
| 1 | Backdrop + lighting | **done, round 4 rendered.** R1 4/10 vs plate 8; R2 6.5 vs 7.0; R3 4.5 vs 8.5; R4 fixes the *resolution* problem R3 lost on. **This was the last round — if R4 misses, record it and leave it for v0.2.** |
| 2 | Materials & palettes | **done** (round 3 retuned two texture terms — see below) |
| 3 | Ship kit | **done — three rounds spent, stop here.** R1 2.5/10 vs plate 8.5, R2 3.0/10 vs 8.0. R3 fixed the light rig and put masses across the silhouette. **The budget is gone; anything left goes to v0.2.** |
| 4 | Belt kit | **done, one pass.** No critic rounds. |
| 5 | FX + bloom | **done, one pass.** Bloom ships — measured cost below. |
| 6 | Station kit | **done, one pass.** No critic rounds — Phase 1's goal changed to breadth. |
| 7 | Planet | **done, one pass.** Same. |
| 8 | Camera | **done, session 9.** `js/world/camera.js`; three gestures verified headlessly; 6 fly-by/orbit showroom entries. **Not yet tried on Aaron's phone** — build order says that is the acceptance test. |
| 9 | Sim core | **done, session 8.** All targets pass. One off-by-one in `emit` fixed in session 9 — see below. |
| 10 | Content pack | **done.** All eight `content/*.js` written and importing in plain node. |
| 11 | UI shell | **done, session 9.** HUD, 8 panels, story panel + Dossier, `ui.css`. `showroom.missing()` 0. |
| 12 | Wiring | **done, session 10.** The §1 beat table is playable end to end — see "Session 10" at the bottom. |
| 13 | Fleet | **done, session 10.** Merged across ships; 24 hulls cost 19 calls. No critic round run. |
| 14 | Gate pass | not started. All eleven scenarios and the live game pass the gate — the numbers are in session 10 — but no blind critic sweep has been run on `fleet_line` / `fleet_scale`. |

Session 1 did components 0, 1 and 2 per amendment A. Session 2 did backdrop round 3 and component 3.
Session 3 rebuilt the hull form (component 3 round 2) and did backdrop round 4. Session 4 did
hull round 3 — lighting and silhouette only, and nothing else. **Session 5 did components 6 and 7
under a changed mandate: one pass each, build it well, look at it once, fix what is obviously
wrong, hand back. No critic rounds were run and none should be run on these two until the whole
basic set exists.**

## What exists

```
index.html style.css .gitignore
js/main.js js/scenarios.js
js/engine/{app,quality,budget,stats,aa}.js
js/world/{backdrop,lighting,materials,palettes,scene}.js
js/ui/knobs.js
js/showroom/{index,entries}.js
tools/{shot,compare,ratio}.mjs
```

Session 5 added `js/world/kit/{geom,station,planet}.js`. Session 6 added
`js/world/kit/belt.js`, `js/world/fx.js` and `js/engine/post.js`. Session 7 filled `content/`:

```
content/{commodities,ships,stations,system.tamber}.js     first half
content/{tactics,stories,rival,balance}.js                second half
```

Empty and untouched: `js/sim/`, `sim.mjs`, `js/ui/{hud,panels,story,format}.js`,
`js/world/{fleet,camera}.js`.

## Numbers

`node tools/shot.mjs --shot=<id> --w=1280 --h=720 --dpr=1` (default `--preset=high`)

| | nebula_back r4 | hero_hull r2 | hero_hull r3 | hull_close |
|---|---|---|---|---|
| draw calls | 60 | 50 | **61** | **12** |
| triangles | 19 k | 16 k | **19 k** | **6 k** |
| texture memory (high) | 25.4 MB | 26.7 MB | **26.7 MB** | **25.4 MB** |
| cpu p95 | 2.0 ms | 1.7 ms | **1.9 ms** | **0.9 ms** |

`hero_hull` r3's extra calls are the scenario's ships, not the kit — the two escorts moved from
120 m to 150 m and dropped a LOD tier back. Per-ship mesh count is still **10 / 7 / 3**, verified
by traversing the hero in `hull_close` (`--eval`).

The texMB jump is `nebulaRes` going 2048 → **3072** on the high and ultra presets (8.4 → 18.9 MB
for the baked equirect) plus two 512² decal sheets. The draw-call rise on `hero_hull` is the
scenario carrying more ships for scale, **not** more meshes per ship.

**Per-ship mesh count is unchanged: 10 at LOD 0, 7 at LOD 1, 3 at LOD 2.** Two things were added
(an additive exhaust plume, a second and third decal) and two were folded away to pay for them —
the hangar glow now rides the engine-glow mesh as vertex colour, and every decal on a hull shares
one four-row 512² sheet and one merged quad.

Gate profile, headed, `--preset=medium --dpr=1 --w=844 --h=390` (re-measured session 4):

| Metric | Budget | nebula_back | hero_hull | hull_close |
|---|---|---|---|---|
| GPU p95 | < 11 ms | *unreliable* | *unreliable* | *unreliable* |
| CPU p95 | < 6 ms | **2.0** | **1.8** | **0.7** |
| Draw calls | < 150 | **62** | **61** | **12** |
| Triangles | < 350 k | **20 k** | **19 k** | **6 k** |
| Texture memory | < 60 MB | **9.4** | **10.7** | **9.4** |
| fps | 60 | 60 | 60 | 60 |

**The GPU timer is still garbage.** Session 3 saw 1.5, 5.2, 20, 31, 46, 76, 94, 120 and 138 ms
across identical scenes at a steady 60 fps with bit-identical counts. Fourth session confirming it.

**Draw calls are still the fleet risk.** Ten meshes per hauler at LOD 0; twenty-four hulls at mixed
LOD is 150–200 calls. Component 13 must merge or instance *across* ships.

## Component 0 — skeleton

Ported from FORGE nearly as-is. What changed for space:

- `window.__forge` → **`window.__mono`**, same shape. `tools/shot.mjs` depends on it.
- **No shadow rig at all.** `renderer.shadowMap.enabled = false`, the `shadows` / `shadowMap` /
  `shadowDist` / `shadowRate` / `shadowSoft` knobs are gone, and so is `app.js`'s
  `shadowMap.render` monkey patch and `stats.markShadow()`. `stats.read()` still returns
  `mainCalls`/`mainTris` (equal to the totals) so `shot.mjs`'s readout keeps its shape.
- Gone with them: `foliage`, `lightCap`, `a2c`. Added to the presets: **`nebulaRes`**, **`stars`**,
  **`viewDist`**.
- Camera `near 1, far = viewDist` (14 k–48 k m by preset). See "Depth range" below.
- `js/engine/post.js` was **not** written. GTAO is deleted from the plan and the threshold bloom is
  component 5's. `aa.js` still routes through `app.post` if one appears, so dropping a `Post` class
  in later needs no change to `aa.js`.
- `tools/ratio.mjs` was repurposed: FORGE compared shadow-on to shadow-off, which is meaningless
  here. It now renders the scenario twice, once with `keyPower=0`, and compares on the pixels the
  key lit — the same idea aimed at the 2.0-weight "one dominant key" criterion.

Showroom: `showroom.register/run/list/step/open/close` plus `expect(kind, id)` and `missing()`.
`defineScenario` auto-registers into group `scene` and auto-`expect`s, so a scenario can never be
missing an entry. `definePanel` and `content/stories.js` must call `showroom.expect('panel', id)`
/ `expect('story', id)` when they land. **`showroom.missing()` is currently 0 of 10 entries (re-checked session 3).**

Reach it three ways: `?showroom=1`, the ▤ button bottom-left, `?sr=<id>`. The current entry id is
written to the URL. ← → sweep without going back to the list; tapping the title bar shows the list
again.

## Component 1 — backdrop

`js/world/backdrop.js`. The whole backdrop lives on a **unit sphere** that is repositioned to the
camera and scaled to `min(8000, camera.far × 0.35)` every frame, so nothing in it can ever clip.
Dome, starfield and flare are all `depthTest: false`, `transparent: false` (so they sit in the
opaque bucket and real geometry draws over them) at `renderOrder` −1000 / −950 / −900. The glow
quad added in round 2 is the exception — see below.

**The nebula is baked once** into an equirect `WebGLRenderTarget` (RGBA8, no mips, `RepeatWrapping`
on S) by a fullscreen-quad shader, then sampled **by direction** in the dome fragment shader. So:

- per-frame cost is one 1024-triangle sphere and one texture fetch, no noise;
- the bake writes **already-sRGB-encoded bytes** (it does its own ACES + sRGB encode) and the
  render target is flagged `LinearSRGBColorSpace` so the hardware does not decode them. The dome
  material is a raw `ShaderMaterial` with no `<colorspace_fragment>`, so what was baked is what
  reaches the framebuffer. **Do not add `toneMapped` or a colorspace include to either end** —
  they are matched deliberately. The trade is that the backdrop does not respond to the `exposure`
  knob;
- re-baking is a knob change away (`this.dirty = true`, picked up in `update`). It is one GPU frame,
  and after round 2 that frame costs **~95 ms at 2048×1024** on an M-series (measured by forcing a
  sync with `readRenderTargetPixels`). One stall on load or on a knob drag; nothing per frame.

The bake model, which is what the tuning rounds converged on:

1. `mask` — a low-frequency field on the *warped* coordinate, floored at 0.08. Without it the noise
   fills the whole sky at one density and the result reads as **fire**, not gas. Round 1 floored it
   at 0.34, which is why nothing ever went properly black.
2. **Two warp levels** feeding one 7-octave fbm, plus a ridged filament term (`uFil`). One warp
   alone leaves round lumps — that is exactly what the round-1 critic called "blobby fBm with
   obvious octave banding". The long warp shears the big shapes, the short one frays their edges.
3. `dens = pow(dens, uContrast)`. This is the black point, and it is the whole answer to
   "grey-purple mud". Round 1's thin gas sat around 0.3 and never reached zero.
4. **Two falloffs from the star, not one.** `broad` (`uBroad ≈ 2.4`) decides which half of the sky
   the star lights; `core` (`uFall ≈ 170`) is the tight blaze. At fov 35 the entire frame sits
   inside 25° of the star, so a single gaussian either blows the whole image out or vanishes.
5. God rays: noise sampled on the component of the direction **perpendicular** to the star, so the
   pattern varies with angle around the star and not with distance from it. That is exactly what a
   shaft is, and it costs two fbm. `uReach` sets how far they run (smaller = longer); round 1 had
   the equivalent of 5.0 hardcoded, which kept every shaft inside the flare where nothing could see
   it. 0.62 gets a full radial fan across the frame.
6. `veil` — dust in front of the star breaks the halo up. A clean circle reads as sun-through-fog.
7. **`gas` and `blaze` are separate.** The hue field and the scatter term act on `gas` only, so the
   star cannot dim because it happened to land in a cool patch.
8. **The wide halo is its own knob (`nebHalo`), and it is the most destructive term in the file.**
   It is `exp(-ang²·uFall·0.07)`, which at this fov covers the entire frame. Round 1 had it welded
   to `nebGlow` at 0.45, invisible only because the gas was bright enough to compete. The moment
   the gas was given a real black point the halo became the whole image — a smooth amber gradient
   with no structure at all. Default is now **0.07**. If the nebula ever goes flat and orange on
   you, look here first.
9. `uScatter` — starlight scattered by the medium lifts the gas near the star and collapses its
   contrast. That is aerial perspective *inside* the cloud. It is added in **`uHot`**, not in the
   gas hue, and multiplied by `dens`; tinting it with the gas hue instead turns the whole region
   round the star grey.
10. Hue comes from its **own** slow field, not from brightness, and the cool half is also made much
    **dimmer** (`uCoolDim`, default 0.30). Without that the blue patches read as blue objects pasted
    over a red field instead of as the thin cold parts of one cloud. `uDesat` lifts the two weak
    channels of the gas hue toward the strong one, which turns deep red into the crimson-pink the
    plate sits at without touching the frozen palette.

Starfield is `THREE.Points` with a shader disc (no texture), **18 000 of them** (2 600 in round 1,
which put ~44 in a fov-35 frame — the critic saw none). Two round-2 changes made them read:

- **The gas occludes them.** The star fragment shader samples the baked dome at the star's own
  direction and attenuates by its luminance (`starOcclude`). Thin gas passes starlight, the bright
  band swallows it. Without this the stars sit *on* the gas and the sky reads as painted.
- **The directional fade round the star is now a ~10° guard, not a 90° one.** Round 1 faded stars
  by `1 − 0.8·cos²`, which in a scenario pointed *at* the star deletes every star in shot. That,
  not the star count, is why round 1 had stars only at the extreme left edge.

Flare is one quad with a procedural core, halo, three diffraction spikes and one anamorphic streak
— **no texture**, `flareSize` is in degrees. A **second quad** (`bloomPower`, `renderOrder 3000`,
`transparent`, additive, no depth test) draws *after* all world geometry so the star's glow eats
into the hull silhouette instead of being cut off by it. It is standing in for the bloom pass
component 5 owns; delete it when real bloom lands, or keep it at a lower power as a cheap fallback.

`nebDetail` adds two octaves of per-pixel grain in the dome shader, weighted by `1 − brightness` so
the core stays clean. The baked dome is always magnified (2048 px ÷ 360° = 5.7 texels/deg against
~36 px/deg on screen), so its clumps otherwise read as soft blobs. Default 0.09. Set it to 0 if a
phone is fill-rate bound — it is the only per-pixel noise in the frame. At `nebulaRes 1024`
(medium preset) the frame still holds up; the grain covers the extra magnification.

**Round-2 knobs**, all in group `Backdrop`: `nebWarp` `nebFilament` `nebContrast` `nebFloor`
`nebScatter` `nebDesat` `nebCool` `nebHalo` `nebRayReach` `starOcclude` `bloomPower` `bloomSize`
`bloomFalloff` `bloomStreak`. Retuned defaults: `nebScale` 3.4→4.2, `nebGain` 1.3→1.85, `nebBroad`
1.5→2.4, `nebRays` 0.8→3.0, `nebGlow` 0.9→1.0, `nebFalloff` 95→170, `nebCore` 0.85→1.1,
`nebDetail` 0.10→0.09, `flareSize` 15→13, `flarePower` 1.5, `flareHalo` 2.9→4.2, `flareStreak`
0.5→0.34, `starSize` 2.6→2.2, `starBright` 3.2→3.6.

`js/world/lighting.js`: one warm `DirectionalLight` key aimed from the star, one cool
`DirectionalLight` fill at a fixed angle **around** the key (so moving the star moves both), a
`HemisphereLight` at 0.03, and a PMREM env built from a 256×128 analytic `DataTexture` using the
same hue ramp. **The env is doing most of the visible work on hulls**, not the key — see below.
Round 2 did not touch it.

## Component 1 — backdrop, round 3

Three faults were named after round 2 (6.5 vs the plate's 7.0). All three are fixed in the bake
shader; nothing per frame changed.

1. **A second hue.** `coolD` is a **separate density layer** with its own warped field
   (`qc`/`qcw`, own seed), gated by `smoothstep(uCoolNear, uCoolFar, ang)` so it can only exist
   away from the star — and because `nebula_back` looks straight at the star, angle from the star
   *is* distance from frame centre. It lands as a violet/teal mass over the upper-left ~25 % of
   frame. Colour is `mix(uCool, uCool2, …)` on a slow field, and the warm gas is suppressed under
   it (`gas *= 1.0 - 0.55 * coolD`) so the two read as adjacent regions rather than a wash.
   New in `palettes.js`: `cool2` and `starOut` on the tamber system (additive).
2. **The black point.** `dens = smoothstep(uDLo, uDHi, dens)` **after** the contrast pow and
   **before** the colour ramp. Knobs `nebBlack` (0.22) / `nebWhite` (0.86). Also `nebAmbient`
   0.05→0.015 and `nebBroad` 2.4→**5.2**, and the constant term in `gas` 0.10→0.04. The broad
   falloff is what actually produced the value gradient — the smoothstep alone did not, because
   the cloud genuinely covers the whole sky at `nebScale` 4.2.
3. **The star.** `core` is now `exp(-ang²·uFall)` with **uFall 170 → 1400**, so the saturated core
   is about 2.5° across instead of 6°, plus **three wider lobes** (`0.40/0.15/0.05` at
   `0.090/0.018/0.0035 × uFall`) carrying the energy out to ~23°. Chromatic drift is
   `white → uHot → uStarOut` over `uChromA`(0.035 rad) → `uChromB`(0.24 rad). The wide halo is
   **decoupled from uFall** (`uHalo · exp(-ang²·2.0)`) — it used to be `uFall·0.07` and tightening
   the core would have deleted it. The flare quad got the same treatment: tiny core, three lobes,
   `uOuter` tint, `flareSize` 13→26°.
   God rays are now multiplied by **transmittance along the arc to the star** — three taps of a
   reduced-cost warped cloud between `dir` and `uStar`, `exp(-uRayOcc · path/3)`. That is what
   turns them from an evenly-spaced flare pass into light picking through dust.
4. **Starfield.** Magnitude is `u^4.5` over 0.004→1 (about 2.5 orders) with size correlated to it,
   and 3.8 % of stars carry a named spectral colour (red giant / orange / blue) boosted 1.9×.

New backdrop knobs: `nebBlack` `nebWhite` `nebCoolMass` `nebCoolGain` `nebCoolNear` `nebCoolFar`
`nebRayOcc` `starChromaA` `starChromaB`. Retuned defaults: `nebScale` 4.2, `nebDust` 0.40→**0.55**,
`nebContrast` 1.45→**1.70**, `nebGain` 1.85→**1.90**, `nebBroad` 2.4→**5.2**, `nebFalloff`
170→**1400**, `nebHalo` 0.07→**0.03**, `nebRays` 3.0→**3.6**, `nebRayReach` 0.62→**0.28**,
`nebCool` 0.30→**0.16**, `nebAmbient` 0.05→**0.015**, `flareSize` 13→**26**, `flareStreak`
0.34→**0.16**.

Honest self-score **7.5/10** against a plate this critic scored 7.0. Still behind: the plate's
gas is smoother and its shafts cut across its fleet where ours mostly fan above the star; and the
glow-over-silhouette is still the `bloomPower` quad, not a real bloom pass (component 5).

## Component 2 — materials

`getMaterial(paletteId, surface)` resolves all thirteen surfaces in §3. Cached per
`palette:surface`. Three palettes: `ferrous` (yours, warm/rust/amber), `corvain` (theirs,
cool steel/cyan) and `reach` (neutral rock, so the belt kit need not belong to a company).
`palettes.js` also holds the per-**system** backdrop palette; `backdrop.js` reads `system('tamber')`
from it. Both are frozen; additive only.

One shared texture set serves every palette — a faction is a tint and a set of accent colours, not
its own textures. That is what keeps `texMB` flat as factions are added.

- **plate albedo / aux / normal**, 512², shared. `aux` packs ao in R, roughness in G, metalness in B
  and is used as both `roughnessMap` and `metalnessMap` (three reads .g and .b). The plate layout is
  a recursive rectangle split, not a grid, plus rivet rows on the larger plates.
- **rock albedo + normal**, 256², greyscale (an earlier green bias made `rock`, `ore` and `ice` all
  read as moss).
- **window atlas**, 256², a 16×16 grid of lit panes at mixed brightness with a few cool ones and
  ~28 % dark. Used as `emissiveMap` on a near-black base — it never illuminates anything.
- **ore veins**, 256², ridged mask used as `emissiveMap` on `ore`.

**Round 3 changed two terms in `buildTextures`.** The soot/rust `streak` was
`fbm2(u*0.02, v*0.6, 3)` — long along **u**, which on the ship kit's UV convention runs *across*
the hull and made every flank read as corrugated iron. It is now `fbm2(u*0.34, v*0.05, 3)`, long
along the hull's length, which is how weathering actually runs. Nothing else in component 2 moved.

`registerMaterialKnobs(q)` owns `texCap` (capped at 512 — plates gain nothing above it),
`aniso`, `windowGlow`, `stripPower`, `beamPower`, `wear`. `setEnvIntensity(v)` is called by
lighting's `envPower` knob and scales every material by its own `envMul`.

Showroom entries `mat_lineup` and `mat_lineup_close` line up 3 palettes × 13 surfaces on a sphere
and a slab each.

Two additions the ship kit needed, both exported from `materials.js`:

- **`adopt(m)`** — a kit that clones a cached material to give it its own uniforms hands the clone
  back through this, which puts it inside `setEnvIntensity` and `rebuildTextures`. Without it a
  cloned material silently ignores the `envPower` and `wear` knobs.
- **`getDecal(text)`** — a canvas-drawn painted name, alpha eroded by the same `fbm2` the plates
  use so it reads as worn paint rather than a printed sticker. Cached per string, `track`ed.
- **`getDecalSheet(texts)`** (session 3) — the same thing for up to four strings stacked in one
  512² sheet, so a hull's whole marking set is one texture and one draw call. `getDecal` is still
  exported but the ship kit no longer uses it.

## Component 3 — the ship kit

`js/world/kit/ship.js`. `shipClass(classId, { palette, lod = 0, seed = 0 })` → `Object3D`, origin
at the hull centroid, forward −Z, per the §3 contract. Three classes: **`hauler`** (84 m),
**`rig`** (52 m), **`escort`** (30 m). `allShipClasses()`, `LOD_DIST = [0, 900, 2600]`,
`lodForDistance(d)`. Signature and class ids are unchanged from session 2.

### Round 2 — the form rebuild

Round 1's hull scored **2.5/10 against the plate's 8.5**: *"not a ship; a container barge with
crates. A lens-shaped slab with a heap of unrelated boxes on top."* Every part of that is a
modelling problem, and it was fixed by throwing the section system away, not by re-greebling.

**The section is now twelve points, not eight, and it is parametric.**

```
S(t, w, top, bot, dk, tw, td, kw)
```
`w` half-beam · `top`/`bot` absolute y · `dk` deck half-width as a fraction of w · `tw` **dorsal
trench** half-width · `td` trench depth in metres · `kw` keel flat half-width. `sectionPts()`
turns that into: a flat deck split down the middle by a trench, a **vertical flank band** between
an upper and a lower chine, and a flat keel.

Three consequences, and they are the component:

1. **The trench is part of the lofted shell.** The superstructure loft rides *in* it — its bottom
   is always 0.45 m below the trench floor no matter how tall the bridge gets. That is what
   "the superstructure sits in the hull, not on it" means in geometry. `tw` opens from ~0 at the
   bow to 0.46·w amidships and closes again at the stern.
2. **The flank band is vertical and derived.** Windows, decals, the hangar and flank greeble are
   all placed between the two chines by `sectionAt()`, so nothing can float off a chamfer any more
   (session 2's gotcha 16 is designed out).
3. **The taper is monotone over the first 80 % of the length.** Every class is a point at the bow
   growing to full beam near the stern. Length:beam is **7.0 : 1** (hauler), 5.2 : 1 (rig),
   6.3 : 1 (escort) — inside the 5:1–7:1 the critic asked for. There is no lens anywhere.

Also on the base form:

- **A spine/superstructure loft** (`spineSections`) and a **keel fin loft** (`keelSections`), both
  built by the same `hullLoft`. The spine rises out of the trench into the bridge tower over
  t 0.64 → 0.83; the keel is a shallow ventral blade deepest around t 0.6. Together they give the
  dorsal ridge and the ventral line the critic named.
- **One asymmetry per class**: a long starboard sponson and a shorter port shoulder on the hauler,
  unequal boom arms on the rig. The hull is no longer a mirrored extrusion.
- **Faired blisters** — low cylinders lying along the deck bands. The only curved masses in the
  kit, and the only things that are not at 90°.

### Vertex-colour cavity AO — the substitute for a shadow rig

There is no shadow map in this project, so recessed geometry had nothing to make it read. Every
geometry now carries a `color` attribute and `hull`/`hullDark`/`panel`/`trim` set
`vertexColors: true`. `SECT_AO` darkens the section per point — trench floor 0.36, flank band
0.50–0.72, keel 0.32, deck 1.0 — and `box()`/`cyl()` take an `ao` argument so the hangar interior,
the engine recess and flank greeble bake their own occlusion. This is what stops the flank reading
at the same value as the deck. `strip()` synthesises white for anything that skips it.

### Materials

- Base albedo is deliberately near-black: `TINT` multiplies each palette colour down to roughly
  **0.07 linear**, so everything you read on a hull is key, rim or bounce and never diffuse colour.
  Expect to run `keyPower` at **13–34**, not 3–7.
- **Roughness break-up in the shader**: three-octave world-space value noise clamped into
  **0.32–0.78** around the map's own roughness, knob `hullRough`. That is the moving specular the
  critic wanted, and it costs one noise per pixel on hull surfaces.
- **`panel` is a genuinely second material** — cooler, `metalness 0.55`, `roughness 0.40` — and it
  is what the superstructure loft, the deck rails and the greeble are built from. `trim` is now
  tinted down as well; at full `p.trim` rust it turned the whole deck into orange planks.
- **Plate scale**: `UV = 4.4` m per tile across, **× 1.9 along** the length (was 8 m and × 3.2).
  At 8 m per tile the plates were metres wide and the flank read as timber planking.

### Engines with real depth

Per bell: an outer housing ring, a **cone bored forward into the hull with its winding and normals
flipped** (`invert()`) so you look down it, a small very hot core disc deep inside, a wider dim
throat disc, a trim lip, and an **additive exhaust plume** that fades over its length. The inverted
cone merges into the same `hullDark` bucket, so the recess costs no extra draw call. The hauler
carries five bells at two sizes.

### Decals

`getDecalSheet(texts)` in `materials.js` stacks up to four painted strings in one 512² canvas,
eroded by the same fbm as the plates. Each quad maps to one row, all quads merge into one mesh, so
a hull's whole marking set is **one texture and one draw call**. Hauler carries the painted company
name on the flank, a deck registration block and a `CAUTION` panel.

### The hangar

**A recess sunk behind the flank skin is invisible** — the skin occludes it and all you get is the
bounce light, which is what made round 1's flank a flat cyan wash. The collar now stands *proud* of
the flank and the lit wall sits at skin level. Reads as a deep bay from any oblique angle with no
hole cut in the shell.

### Windows

`windowRun` gained `jitter: 0`, which gives a **dead-regular fixed-pitch row**. Each hull has one
per flank. That is the cheapest scale cue in the frame — a viewer reads an evenly spaced lit row as
deck lights and sizes the hull off it. The jittered rows are still there for variety.

### LODs and buckets

LOD 0: hull, hullDark, panel, trim, strip, window, glass, engine glow, plume, decal — **10 meshes**.
LOD 1: panel and trim fold into hullDark, decals drop — **7**.
LOD 2: glass folds in, windows/lamps/plume drop — **3**.

### Knobs — group `Hulls`

`rimPower` `rimWidth` `rimDist` `rimFall` `rimNear` `bouncePower` `hullDetail` **`hullRough`**
**`engineGlow`** **`plumePower`**.

## Component 1 — lighting, round 2

`js/world/lighting.js` gained two knobs that matter for every hero shot:

- **`keySwing`** (deg off the star's bearing, around the vertical) and **`keyLift`** (deg of
  elevation offset). `Lighting.keyDir` is the resulting direction; the key light *and* the ship
  kit's rim now both track it, so shading and rim never disagree.
- Why they exist: **the star's position in frame is composition, the angle its light rakes a hull
  at is form, and the two are geometrically incompatible.** If the star is in frame ahead of the
  camera and the camera is on the hull's flank, that flank is *always* backlit — measured, not
  guessed: with everything but the key switched off, `hero_hull`'s hull rendered **pure black**.
  The honest reading is that the physical source in these frames is the nebula's bright band, which
  is a quarter of the sky, not the point star. `hero_hull` swings the key **−64°** off the star.

**Superseded by hull round 3.** That reasoning is what produced a frame with no readable key at
all — a key that disagrees with the visible source is a second ambient. Both knobs still exist and
both are **0 in every scenario**; leave them there and move the star or the camera instead.
`envFloor` (round 3) is the other knob in this group that matters for every hero shot.

Retuned defaults: `keyPower` 5.0 → **6.0**, `fillPower` 0.5 → **0.9** (15 % of key, per the
critic), `ambient` 0.03 → **0.012**.

## Component 3 — the hull, round 3 (the last one)

Round 2 scored **3.0/10 against the plate's 8.0**. The critic named the faults in order —
*lighting, then form, then material* — and said material was the one most likely to eat time for
the least return. Round 3 spent everything on the first two and did not touch materials, palettes
or the nebula.

### Lighting — the scenario was contradictory, not the rig

`hero_hull` used to ask for a key "raking along the flank" *and* "nebula backlight only", with the
star in frame at the upper-left. **Those cannot both be true.** If the star is in shot ahead of the
camera and the camera is on the hull's flank, that flank is backlit — session 3 measured it (the
hull rendered pure black with everything but the key off) and answered it by swinging the key 64°
off the star. That is what produced "top and side differ by 15 %": once the key no longer agrees
with the visible light source it is just a second ambient.

Round 3 accepts the geometry instead of fighting it:

- **`keySwing` and `keyLift` are 0 in every scenario now.** The key is the star. If a shot needs a
  different rake, move the star or move the camera — not the key.
- The star sits at **az −24, el 10**: in frame at the upper-left, ahead of the hull's far bow
  quarter. It lights the deck, the far chine and every forward-facing step; the camera-side flank
  is the shadow mass. That is exactly what the plate does — its sun is beyond the bow and its
  visible flank is *dark*, with the value carried by a blazing deck and a hot chine.
- `keyPower` **58**, `ambient` **0.004**, `envPower` 0.16, `bouncePower` 0.10 (was 0.55 — the
  hangar's cyan was washing forty metres of hull, gotcha 21 again), `fillPower` **4.5** at
  `fillAngle` 168 / `fillLift` −24, which puts the cool fill on the shadow flank at roughly 8 % of
  the key on the deck.
- **New knob `envFloor`** (group `Lighting`, default 0.16). `buildEnv` now multiplies the analytic
  env by `low + (1−low)·smoothstep((d.y+0.55)/0.95)`, so the lower hemisphere is dim. Without it
  the env is a sphere of one brightness and every up- and down-facing surface on a hull reads at
  the same value — *that* is what "ambient is dominating" looks like from the outside. It is what
  drops an underside to black. `hero_hull` runs it at 0.06, `hull_close` 0.14, `nebula_back` 0.20.
- Camera moved from just-below the deck plane to **6 m above it** (`pos [-12,10,30]`,
  `look [-13,2.5,-11]`, fov 46) and swung so the view azimuth is near the star's. Two reasons: the
  deck only reads as a value if you can see it, and pointing near the star is what puts the bright
  half of the nebula behind the hull. Round 2's frame had the dark hull against the *dark* half of
  the sky, so it separated on nothing.
- `fogDensity` 0.0075 → **0.0022**. At 0.0075 the escorts at 120 m were 99 % fog and read as flat
  orange lozenges.

### Form — three masses that cross the profile

The critic: *"a single straight taper — nothing crosses it."* All of this is in existing merge
buckets, so **per-ship mesh count is unchanged: 10 / 7 / 3.**

- **The dorsal spine is stepped.** `spineSections` is a loft, so a pair of t values a hair apart
  (0.292/0.304, 0.420/0.432, 0.640/0.652, 0.736/0.748, 0.838/0.850) is a *vertical riser*. The
  hauler now reads forward deckhouse → drop → bridge base → bridge tower → drop → stern house, and
  the tower is 6.85 m proud of the deck instead of 3.55. This is the cheapest silhouette event
  available and it costs nothing but a few sections.
- **A stepped bow.** Three raised plates at t 0.135 / 0.205 / 0.268, each ending in a riser that
  faces forward. They climb in stages *and* every riser faces the key square-on, so the bow third
  is the brightest thing on the ship.
- **Sponson, fins and a gantry.** A port sponson hanging below the lower chine (notches the bottom
  edge), two canted stern fins 5.4 m tall (notch the top edge where the hull used to just run out),
  and a gantry arch over the forward deckhouse — a gap of sky under a mass reads at any size.
- Bridge glass and the bridge bounce moved up to the new tower (y 9.4 / 9.9); the two masts moved
  with them.

Careful with the sponson: it started in `hull` with a wide `trim` cap and read as a bright orange
plank in the near corner. It is `hullDark` with a 0.6 m trim line and a −0.16 roll now.

### What it bought

Value now runs blown deck chine → dark flank → black underside, the key direction is unambiguous
in a second, and the profile survives being shrunk to sheet size. Honest self-score **5.5/10**
against a plate the last critic put at 8.0.

What is still behind, and is *not* getting another round:

- The shadow flank is nearly black rather than a dark form with panel structure in it. That is the
  0.07-albedo metal, i.e. the material fault the critic ranked third, and it is a v0.2 job.
- The hull still occupies less of the frame than the plate's does, and the right third fades into
  the sky.
- The lit far chine tonemaps orange where the plate's is pink-white.
- The rig and the escort did **not** get the stepped-spine treatment. Only the hauler did. If a
  later round wants them, the recipe is the paired-t risers in their `spine` arrays.

## Component 1 — backdrop, round 4

Round 3 scored **4.5 against the plate's 8.5**: *"two smooth colour zones meeting in a soft
diagonal band with zero high-frequency detail."* That is not what the 1280×720 render looked like —
it was a **resolution** failure, not an art failure, and round 4 only addresses the resolution.

The arithmetic: the bake covered the whole sky at 2048 px ÷ 360° = **5.7 texels per degree**, and
the scenarios render at roughly **36 pixels per degree**. Every high-frequency octave in the bake
was magnified ~6× and smeared. `nebDetail`, the only per-pixel term, was 0.09 of plain grain.

Two changes, both about frequency:

1. **`nebulaRes` 2048 → 3072** on the high and ultra presets (option added to the select).
   11.4 texels/deg, 18.9 MB, bake cost roughly 2.25× of round 3's ~95 ms. Still one frame on load.
2. **The dome shader now carries a real filament layer at screen frequency**, not grain: a
   domain-warped, four-octave **ridged** field plus a three-octave dust-lane field, evaluated per
   pixel. Knobs `nebDetail` (0.42), **`nebDetailScale`** (44), **`nebLanes`** (0.55).

Three gates keep it from destroying the image, and all three were learned the hard way:

- **Luminance gate** `smoothstep(0.015, 0.16, lum) · (1 − smoothstep(0.34, 0.72, lum))` — filaments
  only exist in gas that is already there, and never inside the blown core.
- **A low-frequency clump mask.** Without it the filaments cover the whole sky at one amplitude and
  the frame reads as **fire**, which is exactly how the bake failed in round 1 before it got its
  own mask. First version of this layer looked like burning coals.
- **`nebDetail` is in the presets**: 0 / 0.16 / 0.30 / 0.42 / 0.52 by preset. It is the only
  per-pixel noise in the frame and the one thing to zero if a phone is fill-rate bound.

The critic's other two named faults:

- **Stars punching through the densest gas** — `starOcclude` 3.4 → **7.0**.
- **Stars uniform in size** — magnitude is unchanged (`u^4.5`) but size is now `0.30 + 4.2·u^3`,
  which puts real separation between the handful of bright ones and the tail.
- **"A Gaussian bloom sprite with a hard white core and no interaction with the medium"** — the
  flare's lobes and halo are modulated by three angular sinusoids (`flareBreak`, default 0.42), so
  the falloff is no longer a perfect circle. `nebula_back` also drops `flareSpikes` to 0.18 so it
  reads as a star in dust rather than a lens flare.

Honest self-score **6.5/10**. What is fixed: the detail now survives the shrink to sheet size,
which is what round 3 lost on. What is still behind the plate: our filaments are finer and wispier
than the plate's big soft dust masses, and the plate's shafts cut across its fleet where ours still
mostly fan around the star. **This was round 4 of a three-round budget. If it misses, record it and
leave the backdrop alone until v0.2.**

## Scenarios

`hero_hull` was reframed to the §4 spec — it had been rendering a centred hull, fully in frame,
against a cool starfield with no backlight, and scored **3/10 on composition**. Now: bow in the
lower-left, hull running off the right edge, star inside the upper-left corner, camera 36 m out at
fov 40 just above the deck plane, key swung to rake the deck at ~15°, two escorts for scale, and
`fogDensity` at 0.0075 so the far end of the hull washes toward the nebula.

`hull_close` and `nebula_back` were both re-aimed for the 84 m hull — the old camera positions were
tuned for a 58 m one.

## Gotchas that cost time

1. **A backtick inside a GLSL comment inside a template literal terminates the string.** Cost a
   confusing `SyntaxError: Unexpected identifier 'broad'` pointing at the shader. No backticks in
   shader comments.
2. **`usePreset` re-applies every knob, including ones whose value did not change.** `wear` and
   `envFalloff` rebuilt and re-`track`ed a whole second texture set and a second PMREM on every
   preset change — `texMB` read 20.0 when the real figure was 14.0. Every knob whose apply is
   expensive now early-returns on an unchanged value, and `rebuildTextures` / `buildEnv` `untrack`
   before disposing. **If you register an expensive knob, guard it.**
3. **A metal hull backlit by a directional light is pure black.** Metals have no diffuse and the
   specular lobe points away from the camera, so no amount of `keyPower` produces a rim. In
   `nebula_back` the key light contributes to **0.0 % of pixels** (measured with `ratio.mjs`) —
   everything you can see on the hull is the PMREM env. Plan for that: the "coloured fill" the
   rubric wants comes from `envPower`, and `keyPower` will only start doing work once there is
   geometry with faces angled toward the star. `ratio.mjs` will be meaningful on `hero_hull`.
4. **`e` is an unbounded linear value fed through ACES.** The first three rounds all failed the same
   way: values in the 2–6 range everywhere, so ACES clipped the whole frame to white-orange. The
   working range is roughly 0.05 (quiet corner) → 0.4 (field) → 1.0 (band) → 4+ (core). Check that
   before touching thresholds.
5. `SphereGeometry`'s own UVs are **not** used — the dome shader computes the equirect uv from the
   interpolated object-space position. Both ends use the same convention
   (`dir = (−cos φ·sin θ, cos θ, sin φ·sin θ)`, `θ = (1−v)π`, `φ = 2πu`). Change one, change both.
6. 110 separate running-light meshes on the placeholder put draw calls at 137. They are one
   `InstancedMesh` now (34 calls). Watch this in the ship kit.
7. **The bake's terms are not independent, and fixing one exposes another.** Round 2 raised density
   contrast, dropped the mask floor and tightened `uBroad` in one go, and the nebula vanished —
   replaced by a featureless amber gradient. Nothing about the gas was wrong; the wide halo term
   had simply been dim relative to the old bright gas and became the entire image once the gas had
   a real black point. Change one term, re-render, look. Three at once tells you nothing.
8. **`gl.finish()` does not synchronise under ANGLE/Metal**, so timing a render target this way
   reports 0.0 ms. `renderer.readRenderTargetPixels(rt, 0, 0, 1, 1, buf)` does force the sync. That
   is how the 95 ms bake figure was measured.
9. **The GPU p95 readout is still garbage** — round 2 saw 13, 28, 47, 90, 134 and 177 ms across
   identical scenes all holding a steady 60 fps and returning bit-identical counts. Confirmed twice
   now. Trust fps and counts.
10. `smoothstep` is not a JS builtin. `buildStars` needed its own three-line one.

Session 2 added these:

11. **`-x ** 2` is a JS syntax error.** `Math.exp(-((t - c) / w) ** 2)` throws
    *"Unary operator used immediately before exponentiation expression"* at parse time, so the
    whole module fails to load and `shot.mjs` times out on `__mono.ready` with no useful message.
    Parenthesise the whole exponentiation.
12. **`modelMatrix` is not in three's fragment prefix.** `viewMatrix` and `cameraPosition` are;
    `modelMatrix` is not. Declaring `uniform mat4 modelMatrix;` yourself is enough — the renderer
    sets it unconditionally on any program that has it. That is what lets object-space light
    positions work in the fragment shader and keeps one material per class.
13. **`geos.map(strip)` passes the array index as the second argument.** A helper with an optional
    second parameter picks it up and gets a number where it wanted an array. Wrap it:
    `geos.map(g => strip(g))`.
14. **`mergeGeometries` refuses a set whose attributes differ.** `BoxGeometry`, `PlaneGeometry` and
    `CylinderGeometry` do not agree on which of `uv`/`uv1`/`normal`/`color` they ship with. `strip()`
    deletes everything outside an explicit whitelist and synthesises a zero `uv` if one is missing.
15. **The cross-section's negative-Y points were being mirrored above the origin.** `fy * s.bot`
    with `s.bot` stored negative gives `+`, so the hull's "bottom" landed on top of its top and the
    loft was a folded, self-intersecting shell — which presents as greeble floating in space off
    the silhouette, not as an obviously broken hull. It is `-fy * s.bot`. **If kit geometry looks
    detached, suspect the section maths before the placement maths.**
16. **Greeble must land on the flat of a face, not past the chamfer.** `CS` puts the top face
    between ±0.50 w and the flank between `top·0.42` and `bot·0.52`. Placing at ±0.82 w, which
    looks conservative, is outside the top face and the piece floats.
17. **A narrow hull strip repeats one thin column of the plate texture.** The chamfer sides span
    about 0.3 of a UV tile across and seven tiles along, so the same plate edges recur seven times
    and read as corduroy. Neither `normalScale` nor the wear frequency fixes it — the length UV
    scale does. Ours is 3.2× coarser along the hull than across it.
18. **An additive quad over a lit surface shows that surface's texture.** The engine nozzle glow
    was additive over the bell's end cap and read as a glowing decal with plate lines in it. Opaque
    with a vertex-colour falloff is right for a nozzle.

Session 4 added these:

26. **"No key direction" is a *scenario* fault far more often than a rig fault.** Round 2 answered
    it by swinging the key off the star, which cannot work: a light that no longer agrees with the
    visible source in frame is a second ambient by definition. The question to ask is "can a key
    that lights this surface also be in this frame?" — and if the surface faces the camera the
    answer is always no. Move the camera or the star. (This supersedes gotcha 22.)
27. **An analytic env with no vertical structure is indistinguishable from ambient.** Every knob in
    `Lighting` was already near zero and the frame still read flat, because a PMREM of a sphere
    that is one brightness top-to-bottom lights an up-face and a down-face identically. `envFloor`
    is the fix and it was worth more than any change to `keyPower`.
28. **A loft gives you free silhouette steps.** Two sections at t and t+0.012 with different
    `rise` is a vertical riser, costs one extra ring of triangles and no extra mesh. Reach for that
    before adding boxes. Note `thin()` decimates the array at LOD ≥ 1, so the steps soften with
    distance — which is what you want anyway.
29. **`--pre` on `shot.mjs` can drive the camera.** `--pre="(()=>{const c=window.__mono.app.camera;
    c.position.set(...);c.lookAt(...);c.fov=46;c.updateProjectionMatrix();return 1})()"` re-frames
    a scenario without editing a file, and `--set=a=1&b=2` does the same for knobs. Twenty framing
    candidates in the time one code edit round-trips.
30. **Fog eats your scale cues.** `fogDensity 0.0075` is 99 % opaque at 120 m, which turned two
    escorts into flat orange lozenges. Check `1-exp(-(d·density)²)` at the distance of the thing
    you are trying to keep readable before touching the number.

Session 3 added these:

19. **`patch` is a reserved word in GLSL ES.** `float patch = ...` in the dome shader gave
    *"Illegal use of reserved word"*, the fragment shader failed to compile, and the whole nebula
    rendered **black** with no thrown JS error — `shot.mjs` prints the shader log but the run still
    "succeeds". If a shader-driven thing goes black, read the full `shot.mjs` output, not the tail.
    Other names to avoid: `sample`, `filter`, `output`, `input`, `active`.
20. **The hull loft is a single-sided shell, so anything "buried" inside it shows through.** A
    blister sunk below the deck plane was clearly visible from a camera below that plane, because
    the deck's back faces are culled and you look straight into the hull. Kit parts have to sit
    *on* a surface, not inside it — there is no interior.
21. **`1/(1 + d²/w²)` falls off far slower than it looks on an 84 m hull.** The hangar bounce at
    `w = 6.5` was still 9.5 % at 20 m and 2.6 % at 40 m, and against a 0.07-albedo hull that made
    the entire flank read cyan. `w` is the *half-power* radius, not the reach. It is 4.5 now and
    `bouncePower` runs at 0.55 in `hero_hull`, not 1.6.
22. **The critic's "no key direction" complaint is usually geometric, not a tuning problem.**
    Switch everything but the key off and render: if the subject is black, no amount of `keyPower`
    will help and the answer is `keySwing` / a different camera. Took three rounds of tuning before
    anyone actually measured it.
23. **`getDecal` per string is one draw call per marking.** Three markings on a hull took LOD 0
    from 10 meshes to 12. `getDecalSheet(texts)` stacks four rows in one 512² and the quads merge.
24. **Canvas row 0 is the top of the image; texture v = 0 is the bottom** (three sets
    `flipY = true` on a `CanvasTexture`). A decal sheet row index has to be flipped
    (`(rows - 1 - i + uv.y) / rows`) or every quad samples an empty row and nothing draws.
25. **A fully degenerate quad in a loft can produce NaN normals.** `computeVertexNormals` divides
    by a zero-length sum. The trench keeps a floor of `td = 0.05` and `tw = 0.03` for exactly this
    reason, and the end caps are built with `td: 0` on purpose — that both bulkheads the channel
    and keeps the cap outline convex enough for a triangle fan.

## Component 6 — the station kit

`js/world/kit/station.js`, plus `js/world/kit/geom.js` (see below). Contract as specified:

```js
stationModule(moduleId, { palette, seed = 0 })   // origin at its dock face
station(stationId, { palette, seed = 0 })        // origin at the hub centre
```

Also exported, all additive: `allStationModules()`, `allStations()`, `hazeSlab(opts)`,
`registerStationKnobs(q)`.

**Conventions.** A module's dock face is the plane **z = 0**, approached from **−Z**, with the body
extending toward **+Z**. So `stationModule` output drops straight onto a dock arm with no wrapper,
same idea as the ship kit's forward −Z. A station's origin is the hub centre and its **spine runs
along X**; bays hang in two columns at z = ±80 with their dock faces pointing outward.

**Six modules**, all built from merged boxes/cylinders with a baked cavity term in vertex colour:

| id | what it is |
|---|---|
| `bay` | the repeated unit. 38 × 17 × 54 m. Pale deck plates either side of a dark slot with an emissive line in it, three deckhouses whose **±X walls** carry the window grids, cross ribs at a fixed pitch, a dock collar standing proud of the face with a lit mouth behind it. |
| `refinery` | four tanks, a cross drum, stacks, two control blocks, a hot separator core. The only round silhouette on the station apart from the hub. |
| `coilline` | ten induction rings on a 150 m pipe. A second, finer repetition at a different frequency from the bays. |
| `hub` | an 84 m drum lying on the module's depth axis with **four window bands of 96 panes** round it, a bridge tower and a mast. |
| `spine` | **the hero.** A 320 m tapered blade in the faction accent with an emissive edge line, a lit mouth and a windowed bridge block. This is the break in the run — `8500_06` is twenty grey bays and one orange spine, and the orange spine is the shot. |
| `pylon` | a 300 m tapered spire. Its only job is to be the near, dark, off-frame layer in a haze shot. |

**Two stations** in `STATIONS`, data only: **`ledger`** (ferrous — hub, refinery, 18 bays on a
480 m truss, the hero blade over the row on two masts, coil line off the far end) and
**`drayyard`** (corvain — the same kit rearranged compactly, with a pylon hanging below).

### Draw calls — the thing the brief was worried about

A bay is seven material buckets. Eighteen of them built as separate `Object3D`s would be
**~126 calls for the bays alone**, plus ~28 for the rest, which blows the 150 gate on the station
by itself before a single ship is added.

What it actually costs: **14 meshes for a whole station, 7 of them `InstancedMesh`.** Everything
that is placed once (truss, hub, refinery, coil line, hero, masts, struts) has its matrix baked
into its geometry and merges into **7 meshes**; the 18 bays are **7 InstancedMeshes** of 18
instances. Adding bays past that is free in draw calls.

Whole-frame numbers are in the table below: `station_night` is 58 calls with a station, a docked
hauler and four other hulls in shot.

### Emissive density

The window atlas is used exactly as component 2 intended — one quad per pane, mapped to one cell of
the 16 × 16 atlas, so cell choice varies size, brightness and colour temperature at once. A bay
carries ~90 panes, the hub ~300, and they all ride the bay's or the module's own merged window
mesh, so the density is free. Nothing emissive illuminates anything; `dockGlow` mouths and coil
cores are opaque vertex-coloured quads (the ship kit's `glowDisc` trick), not additive.

### The haze slab

`hazeSlab({ w, h, color, opacity, glow })` is a `ShaderMaterial` quad with a soft-edged rectangular
alpha and a vertical density ramp. **Exponential fog cannot do this job**: fog is a function of
distance from the camera, and what `1840080_04` does is put a finite wall of lit dust *between* two
objects, so the far one loses its blacks while the near one keeps them. `station_haze` puts one at
660 m between a 320 m pylon and Dray Yard at 940 m.

### Knobs — group `Station`

`dockGlow` `hazePower` `hazeSoft` `stationDetail`. `stationDetail` is **build-time** (greeble and
window counts): a station already in the scene keeps what it was built with, re-run the showroom
entry to see a change. Everything else is live.

### `js/world/kit/geom.js`

`box` `cyl` `ring` `paint` `scaleUV` `strip` `mergeAll` `rnd` `UV` — the primitives the station kit
needs, all carrying a vertex-colour cavity term and world-scaled plate UVs. **`ship.js` still has
its own private copies of `box`/`cyl`/`paint`/`strip`.** That duplication is deliberate for now:
component 3 is closed and re-pointing it at `geom.js` is a v0.2 tidy, not a session-5 job. Note the
signatures are *not* identical — `geom.cyl` takes `(rx, rz)` where `ship.cyl` takes `(rx)`.

## Component 7 — the planet

`js/world/kit/planet.js`. `planet(planetId, { seed = 0 })` → `Object3D`, origin at the centre, per
the §3 contract. One planet in the table: **`ossian`**, radius 4200 m, 96 × 48 sphere. Also
`allPlanets()`, `registerPlanetKnobs(q)`, `updatePlanetLighting(backdrop, lighting)` — the last is
called every frame from `World.update`, exactly like `updateShipLighting`.

**Two meshes, two draw calls.** A body `ShaderMaterial` and a halo shell at 1.035 × radius drawn
`BackSide` + additive + `depthWrite: false`, so the scatter spills *outside* the body's silhouette
— the body's own depth occludes the halo everywhere over the disc, which is what leaves a thin
overspill arc and nothing else. Both are `fog: false` (a planet at 8 km with any of our fog
densities is 100 % fog) and both end in `#include <tonemapping_fragment>` +
`#include <colorspace_fragment>`, which **do** expand correctly in a `ShaderMaterial` — three sets
the `TONE_MAPPING` define and emits `linearToOutputTexel` for any non-raw shader material. Do not
copy the backdrop dome's deliberate omission of those; the dome bakes its own sRGB and this does
not.

The body shader, in order of how much of the effect each term is worth:

1. **The rim.** `pow(1 - N·V, 7.0) × smoothstep(-0.45, 0.55, N·L)` — grazing view **and** grazing
   light. Both, or it is an outline round the whole disc instead of a limb.
2. **The terminator.** `smoothstep(-0.12·uTerm, 0.34·uTerm, N·L)`, a narrow wrap so the day side
   rolls into black instead of clipping at zero.
3. **Forward scatter** just inside the terminator, plus the halo shell.
4. **Limb darkening**, `pow(N·V, 0.42)`, so the disc is not a pancake.
5. **Bands**, last and cheapest: latitude sheared by a slow domain warp, mixed with fbm, plus a
   storm mask. This is the weakest part of the component — see below.

Depth range: it is a scaled proxy, per the known limit in this file. 4200 m at ~10 km, not a real
gas giant. `near 1 / far = viewDist` still holds.

**Knobs — group `Planet`:** `planetRim` `planetScatter` `planetHalo` `planetBands` `planetTerm`.

## Scenarios added

`station_night` (`8500_06`), `station_haze` (`1840080_04`), `planet_limb` (`244160_15c`),
`star_flare` (`244160_02c`), all in `js/world/scene.js` via `registerStationScenarios` /
`registerPlanetScenarios`, both wired in `main.js`. Plus one hand-written showroom entry,
`station_modules`, which lines up all six modules. **`showroom.missing()` is `[]` — 0 of 22
entries.**

Every one of the four follows the session-4 rule: `keySwing` and `keyLift` are **0**, the star is
the key, and the star is placed so it lights the faces the camera can actually see.

- `station_night` — star at **az 152 / el 33**, high and off the right shoulder, out of frame. It
  lights the bay decks and the +Z dock faces, which is exactly what this camera sees; the flanks
  and the hub go black. `keyPower` 20 (station albedo is ~3 × the hull's — do not carry the hull's
  58 across), `fillPower` 1.8 for the cool counterpoint, `envFloor` 0.05.
- `station_haze` — the one place in the set where a **silhouette is the point**. The star is at
  az 21 / el 8, behind Dray Yard, so the near pylon is meant to be black.
- `planet_limb` — star upper-left, planet along the bottom edge, ships in the lower-left eighth,
  ~70 % empty.
- `star_flare` — star half in frame at the left edge, limb a diagonal out of the lower-right
  corner, six hulls crossing between the two as cut-outs.

## Numbers — session 5

`node tools/shot.mjs --shot=<id> --w=1280 --h=720 --dpr=1` (`--preset=high`)

| | station_night | station_haze | planet_limb | star_flare |
|---|---|---|---|---|
| draw calls | **58** | **75** | **54** | **65** |
| triangles | **52 k** | **77 k** | **28 k** | **33 k** |
| texture memory (high) | 26.7 MB | 25.4 MB | 25.4 MB | 26.7 MB |
| cpu p95 | 2.0 ms | 2.6 ms | 1.9 ms | 2.1 ms |

Gate profile, `--preset=medium --dpr=1 --w=844 --h=390`:

| Metric | Budget | station_night | station_haze | planet_limb | star_flare |
|---|---|---|---|---|---|
| CPU p95 | < 6 ms | **0.6** | **2.7** | **2.1** | **0.9** |
| Draw calls | < 150 | **58** | **75** | **54** | **65** |
| Triangles | < 350 k | **52 k** | **77 k** | **28 k** | **33 k** |
| Texture memory | < 60 MB | **10.7** | **9.4** | **9.4** | **10.7** |
| fps | 60 | 60 | 60 | 60 | 60 |

No new textures were added by either component — both kits reuse component 2's shared set, so
`texMB` is unchanged. `station_haze` is the worst case in the set and it is at half the draw-call
budget with **two whole stations, a pylon and four hulls** in frame. The other three scenarios were
re-rendered on this build and none regressed (`nebula_back` 60/20 k, `hero_hull` 61/19 k,
`hull_close` 12/6 k — identical to session 4).

## What is short, and would be the v0.2 jobs

Honest self-assessment, no critic was run.

- **The planet's bands are nearly flat.** Everything else about it works — the arc, the
  terminator, the black — but the lit face reads as one orange with a faint swirl. Band frequency
  and contrast were both raised once and it barely moved, which suggests the fault is that the
  bands are a *value* variation on an albedo that the rim and scatter terms then wash over. The
  fix is probably a second, cooler band colour and putting the band term inside the limb-darkening
  rather than beside it.
- **Ossian has no rings, no moons and no cloud motion.** Rings would be the cheapest large gain
  available and were skipped only because the reference plates do not have them.
- **The station has no docked-ship logic.** `station_night` positions its hauler by hand. Nothing
  knows where a bay's dock point is in world space; a `station()` should return dock anchors in
  `userData` the way the ship returns `trails`.
- **Nothing on a station moves.** No rotating drum, no breathing lights, no traffic. §6 wants
  station lights to breathe between ticks.
- **The bay is the only instanced module.** A station with two hero elements or two coil lines
  merges them separately.
- **`station_haze`'s slab is subtle.** It works, but at 0.5 opacity against our nebula it does
  perhaps two thirds of what `1840080_04` gets out of the same trick. Worth a round on its own.
- **Dray Yard is Ledger's modules rearranged.** It has no silhouette of its own beyond the palette
  and the pylon. The fiction wants the rival's yard to *look* like a rival.
- **`geom.js` and `ship.js` still have duplicate primitives.** See above.
- **No `belt` kit**, so `belt_work` / `belt_fog` / `fleet_line` / `dock_night` / `fleet_scale` /
  `hull_close`-style shots from §4 are still missing. `showroom.missing()` only counts registered
  entries, so those simply do not exist yet — five of the twelve §4 scenarios remain.

## Gotchas that cost time — session 5

31. **`CylinderGeometry` and `TorusGeometry` wrap uv 0..1 once round the entire circumference.**
    On the hub's 264 m drum that makes one plate tile ~30 m across, and the hub rendered as a
    giant white grid that looked exactly like a broken window atlas. It cost a render and a wrong
    diagnosis. `geom.cyl` / `geom.ring` rescale by world size now; `ship.js`'s `scaleUV` only ever
    handled boxes because the ship kit's cylinders are all small.
32. **`CylinderGeometry`'s axis is Y, so rotating it about Y does nothing.** `cyl(..., ry, ...)`
    left the hub drum standing upright and looking fine in the wireframe sense. `geom.cyl`'s
    rotation arguments are `(rx, rz)` for that reason: `rx = π/2` lays it along Z, `rz = π/2`
    along X.
33. **An `InstancedMesh` must have `frustumCulled = false` when the instances are spread out.**
    Three computes the bounding sphere from the *geometry*, which here is one 54 m bay, so an
    18-bay row 400 m long disappears the moment the origin bay leaves frame.
34. **A rim term with a low exponent is not a limb, it is a wash.** `pow(1 - N·V, 3.4)` looks
    tight on a fully lit sphere and covers most of the *visible* area of a crescent, because on a
    crescent almost everything you can see is already near-grazing. It painted the whole planet
    one flat orange and buried the bands. 7.0 makes it an arc.
35. **Where the planet sits in frame and where the star sits in frame are not independent.** The
    edge of the disc that enters the frame is always the edge nearest frame centre. Put the star
    on that side and that edge is fully lit with the terminator off-screen; put it directly behind
    the planet and the crescent is off-screen too. **Planet in one corner, star in the opposite
    corner** is the arrangement that gets a thin lit limb *and* a terminator falling to black into
    the same frame. This cost three renders of `planet_limb` and it is pure geometry — the same
    class of mistake as session 4's gotcha 26, one step further out.
36. **A haze slab loses to the nebula.** At the default `nebGain` the whole frame is already a
    saturated red field and a 50 %-opacity slab changes nothing you can see. `station_haze` pulls
    `nebGain` to 1.05 and `nebHalo` to 0.02 so the slab can be the brightest thing in the middle
    distance. If a layer effect is invisible, check what the backdrop is already doing to that
    part of the value range before touching the layer.
37. **Station albedo is not hull albedo.** The ship kit tints its base metal down to ~0.07 linear
    and therefore runs `keyPower` at 34–58. The station kit does not (its pale deck plates are the
    whole value story), so the same `keyPower` blows it out. Stations want 5–20.

## Deliberately left undone

- **`js/engine/post.js`.** Bloom is component 5's and belongs with the fx that need it. The nebula
  core is baked to near-white already, so a threshold pass will isolate it for free. The
  `bloomPower` quad added in round 2 is a stand-in for exactly this — retire or turn it down when
  the real pass lands. The engine plumes will want it too; they are additive vertex-coloured cones
  with no bloom behind them.
- **No env/IBL from the baked nebula itself.** The env is a separate analytic bake because the
  nebula texture stores sRGB bytes flagged linear and a PMREM of it would come out wrong. If a
  later round wants the real thing, bake a second small **linear** equirect from the same shader.
- **No touch camera, no orbit controls.** Component 8. The scenarios set the camera directly.
- **`fxDensity` is not registered.** Component 5 owns it.
- **Ship decals beyond the painted name.** No hazard striping, hull-number blocks or roundels.
  The `decal` surface and `getDecal()` are both there; it is a content job, not a plumbing one.
- **Swept and chamfered volumes.** The hull is a lofted polygon with chines, plus a few cylinders.
  The plates' hulls have compound curvature; ours does not. It is no longer the biggest gap, but
  it is still a gap.
- **Structure inside the shadow.** Round 3 got the value *range* (blown deck to black underside);
  what the shadow side still lacks is form within it. The base albedo is 0.07 linear, so there is
  almost nothing for a fill to land on. v0.2, and it is a materials job, not a lighting one.
- **Hazard striping and roundels.** There are three painted markings; the sheet holds four rows.
- **No cross-ship instancing.** See the draw-call note under Numbers — component 13's problem.
- **`aa` defaults to `off`.** The modes all work; nobody has measured which is worth its cost here.

## Known limits

- **Depth range.** `near 1 / far = viewDist`, no logarithmic depth buffer. Anything past ~48 km has
  to be faked (the star and dome already are — they are depth-independent). The planet limb in
  component 7 **is** such a proxy — 4200 m at ~10 km — and must stay one.
- The plate texture does not tile seamlessly, and on a box at 5 m per plate it reads slightly like
  brickwork. Fine for a placeholder; the ship kit should set its own UV scale and probably wants a
  second, finer detail layer.
- `nebulaRes` is capped at 3072 (high and ultra). At fov 35 that is still ~3× magnification; the
  dome's screen-frequency filament layer is what covers it, not the bake.
- The nebula bake ignores the `exposure` knob (see above). If that becomes a problem, feed exposure
  into `uGain` and re-bake on change.

## Rounds

**Components 6 and 7 have no rounds.** The mandate changed before session 5: Phase 1's goal is
breadth — the whole basic set of scenes and UI existing so Aaron can see what worked and what needs
more time. One pass each, fix what is obviously wrong, move on. `shots/station_night.png`,
`shots/station_haze.png`, `shots/planet_limb.png` and `shots/star_flare.png` are the one-pass
results; the honest gaps are listed under "What is short" above. Do not open a critic round on
either component until the belt kit, the fleet and the UI exist.

Round 1: `critique/nebula_back_r1.png`, key in `.keys/nebula_back_r1.json`. The blind critic gave
the **backdrop 4/10 against the plate's 8**, for five specific reasons: blobby fBm with octave
banding, no stars, a flat additive star sprite sitting in front of the volume with no occlusion or
god rays, no aerial perspective, and dark regions reading as grey-purple mud rather than black.

Round 2: blind sheet `critique/nebula_back_r2.png`, key in
`.keys/nebula_back_r2.json`. All five are addressed — see the section above. Honest self-score
**7/10**. What is still behind the plate: the plate's gas is smoother and more uniformly crimson
where ours carries an orange-brown cast through the mid-tones; the plate's shafts cut right across
its fleet where ours mostly fan above and left of the star; and the glow-over-silhouette is a quad,
not a real bloom pass, so it does not respond to how bright the hull actually is. That last one is
component 5's to replace.

Round 3: `shots/nebula_back.png`. The three round-2 faults — one hue, a lifted black point, a
blown hard-edged star disc — are addressed in the section above, plus the starfield magnitude
spread. Honest self-score **7.5/10** against a plate this critic scored 7.0.

Round 3 also produced the first `hero_hull` and `hull_close` renders. Self-score at the time 6/10;
the blind critic scored the hull **2.5 against the plate's 8.5**.

Round 4 (backdrop): `shots/nebula_back.png`, sheet `critique/nebula_back_r4.png`. The resolution
fault is addressed above. Self-score **6.5/10**.

Hull round 3: `shots/hero_hull.png`, sheet `critique/hero_hull_r3.png`, ref `1840080_01`. Self-score
**5.5/10** against a plate the last critic put at 8.0 — lighting and silhouette are fixed, the
shadow-side material is not. **This was round 3 of 3. The component is closed; do not sand it
again.** `hull_close` and `nebula_back` were re-rendered on the same build and neither regressed —
`nebula_back` in particular gained from the stepped spine, since its whole job is a silhouette
against the bright band.

Hull round 2: `shots/hero_hull.png`, sheet `critique/hero_hull_r2.png`, ref `1840080_01`. Self-score
**6/10** against a plate the last critic scored 8.5 — the form, the taper, the prow, the framing,
the material break-up and the engine depth are all fixed; the value structure and the fineness of
the surface detail are not. `critique/hull_close_r1.png` is the first `hull_close` sheet
(ref `244160_11c`); it is a long way behind that plate and has not had a round of its own.

---

# Session 6 — components 4 (belt) and 5 (fx + bloom)

One pass each, no critic rounds, same mandate as session 5. `showroom.missing()` is **0**;
28 showroom entries.

## Component 4 — the belt kit

`js/world/kit/belt.js`, to contract:

```js
belt(beltId, { seed = 0, density = 1 })      // → Object3D, userData.oreRocks sorted big-first
asteroid(sizeClass, { seed = 0, ore = 0 })   // 'gravel' 'small' 'mid' 'large' 'huge'
allBelts()  registerBeltKnobs(q)
```

Two belts: `kestrel` (the opening loop) and `drift` (a thinner spur, used as the far layer).

**Everything in a field is instanced.** Five size classes map onto three geometry tiers
(icosahedron subdivision 1 / 2 / 3, 80 / 320 / 1280 tris) with 2 / 2 / 3 base shapes each, and
each instance gets its own rotation and a non-uniform scale, so ~640 rocks come out of seven
shapes. Bucket key is `tier:shape:ore`. **Ore only ever lands on shape 0 of its tier** — that one
rule is what stops the ore variant multiplying the draw-call count by the shape count. A full
`kestrel` field is 9 instanced meshes plus one dust `Points`.

**A belt is a cone, not a box.** Spread grows with distance (`fan` = half the angular width),
because a box-shaped field puts every near rock outside the frustum and bunches the far ones into
a small patch in the middle of frame. Each size class also has its own depth band, so the big
rocks stand off and a hero rock is a scenario's choice, not an accident.

**Rock shape.** Displaced icosahedron: fbm lumps, fine grain, and three-to-six random planar cuts
that subtract along the plane. The cuts are what separate an asteroid from a potato. The mesh is
non-indexed and the displacement is a function of the *undisplaced* position, so it stays
watertight and `computeVertexNormals` gives flat facets — which is what you want anyway.

**Ore veins.** Vertex colour carries a cavity term; the material is `getMaterial('reach','ore')`
cloned with an `onBeforeCompile` patch after `emissivemap_fragment`:

```glsl
float oreV = smoothstep(0.16, 0.52, texture2D(emissiveMap, vEmissiveMapUv).r);
totalEmissiveRadiance *= oreV * 2.0 * pow(1.0 - vColor.r, 1.3);
```

The vein map says *where* across the uv, the cavity says *how deep*, and the ore only glows where
both agree. Without the cavity term the whole rock lights up and reads as a painted orange ball.
`oreGlow` is the knob; 1.5–2.5 reads as molten cracks, above 4 it reads as lava.

**Dust cards** are a `Points` cloud with the shared soft-point shader — always camera-facing, one
draw call, size in metres with a real perspective divide. Trade: `gl_PointSize` is clamped
(`max: 900`), so a card closer than ~40 m stops growing.

Depth fog is the existing `FogExp2` plus a new **`fogLevel`** knob (below).

Knobs, group `Belt`: `beltDensity` (rebuild), `oreGlow`, `beltDust` (rebuild), `beltDustSize`.

## Component 5 — fx

`js/world/fx.js`:

```js
beams(list, { color, width, glow, dust })        // list: [{ from, to, color? }] → 2 draw calls
engineTrails(ship, { color, length, width })     // reads ship.userData.trails, adds to the ship
motes({ count, radius, spread, center, color, size, seed })
debris({ count, radius, spread, center, size, seed, palette })
softPoints(pos, col, size, opts)                 // the shared additive point sprite
fxDensity()  registerFxKnobs(q)
```

A beam is a **cross of two 5-column quad strips** — colour falls to zero at both edges, so it
reads round from any bearing with no per-frame billboarding. Three widths stacked: a near-white
core, a dim coloured sheath, and a very dim cone that widens toward the target (the dust the beam
is passing through). Muzzle and impact flares are points in the same object. The whole beam set
is one merged mesh plus one `Points`.

Engine trails are the same ribbon primitive run +Z off every `userData.trails` anchor, tapering
to black.

Knobs, group `FX`: `fxDensity` (rebuild — scales motes, debris and belt dust cards together),
`beamGlow`, `beamWidth` (rebuild), `beamDust` (rebuild), `trailPower`, `motePower`, `cardPower`.

## Bloom — `js/engine/post.js`

Threshold pass off the main buffer at quarter res, two separable blur taps, composite.
**Four extra draw calls** (74 → 78 on `belt_work`), not a mip chain.

The main buffer is `outputSpaceTarget()` from `aa.js` — already tone-mapped and sRGB-encoded — so
the threshold and the blurs work on *encoded* values and **nothing in post.js converts colour**.
The bloom buffers are flagged `LinearSRGBColorSpace` for the same reason. `aa.js` already had the
`post.enabled` / `post.setAA()` / `post.composer.render()` hooks; `composer` here is just a
`{ render }` handle, there is no `EffectComposer`.

Knobs, group `Bloom`: `bloom` (toggle, default **on**), `bloomThreshold` 0.74, `bloomKnee` 0.22,
`bloomStrength` 0.62, `bloomRadius` 1.0, `bloomScale` (0.5 / 0.25 / 0.125, default 0.25).

Showroom A-B: `bloom_on` / `bloom_off` in group `fx` — same `belt_work` frame, one tap apart.

### Measured cost of bloom alone — it ships

At the gate profile (`--preset=medium --dpr=1 --w=844 --h=390`, headed):

| | bloom off | bloom on | Δ |
|---|---|---|---|
| draw calls | 74 | 78 | **+4** |
| texture MB | 10.7 | 13.4 | **+2.7 MB** (full-res scene target + depth + two 211×98 buffers) |
| GPU | — | — | **≈0.20 ms/frame** |

**How the 0.20 ms was measured**, because the timer query is still garbage (it reported bloom-on
*faster* than bloom-off on three interleaved A-B passes): patch `app.renderPath` to run the three
bloom quads N extra times per frame, then compare median frame time at N = 0 and N = 200 inside
one page load. 16.64 ms → 55.9 ms, twice, i.e. 39.3 ms for 200 chains. That is 0.20 ms per chain
against the vsync-locked baseline and ~0.27 ms against a true (lower) GPU baseline. Under 2 % of
the 11 ms budget. **Keep it on.**

`--pre` recipe for repeating a pass, worth stealing:

```js
const base = M.app.renderPath;
M.app.renderPath = () => { base(); for (let i=0;i<window.__rep;i++) { /* the passes */ } };
```

### Additive coverage

Rule was total additive coverage under 1.5× the screen. Estimated for `belt_work` at 844×390
(329k px), from the authored geometry: beam ribbons 69k, beam flares 2.5k, engine trails 5.8k,
motes 2.1k, belt dust cards ~170k (half of the 19 are off-screen), starfield 13.5k → **≈0.8×**.
The dust cards are three quarters of it, which is why `cardPower` and `beltDust` are separate
knobs. This is an estimate from geometry, not an instrumented overdraw read — nobody has written
that harness yet.

## The starfield fix (global, and it was worth it)

Three critics called the field uniform. Root cause found: **a point smaller than one pixel is
still rasterised as one whole pixel at full brightness**, so the entire magnitude spread built
into `aSize` was being thrown away and every star came out the same dot. The vertex shader now
turns sub-pixel size into coverage:

```glsl
float s = aSize * uScale * uDpr;
vCol = aCol * min(1.0, s * s);
gl_PointSize = max(s, 1.0);
```

Plus: magnitude `u2**5.5` (was 4.5), size `0.20 + 2.4*u2**4.0` (was `0.30 + 4.2*u2**3.0`),
`starSize` default 2.2 → 1.5, `starOcclude` default 7 → 13 (range extended to 20). Compare the old
and new `station_night` — it is the single biggest change in this session's diff and it improves
every shot in the game.

## Two edits to other components' files

Both are fixes, not preferences, and both were found by looking at a render:

1. **`materials.js` `rock` no longer uses `roughnessMap: tex.rockAlb`.** Driving roughness off
   the rock's own albedo makes every *dark* patch a mirror, and a belt under one hard key came out
   as wet stone with gold highlights. Base colour also lifted `#6d665e` → `#a09689`; the old one
   put rock at roughly hull albedo, which needed `keyPower` in the 30s.
2. **`backdrop.js` gained `fogLevel`.** Both palette hues are bright, so in a scene with a dark
   backdrop the fog made distant objects *lighter* — a belt of pale pink blobs receding into
   black. `fogLevel` scales the tinted fog colour so the haze can match what is actually behind
   it. `belt_work` runs 0.16, `belt_fog` 0.24; every existing scenario keeps the default 1.0 and
   none of them changed.

## Scenarios added

| id | ref | what it is |
|---|---|---|
| `belt_work` | `8500_01` | Rig lower-left, two beams on the frame diagonal converging on an ore-rich rock upper-right, `kestrel` field plus a `drift` spur, motes and debris, star behind the camera. |
| `belt_fog` | `8500_02` | Down the belt axis, hauler in the left third, three beams out to three sharp rocks, heavy nebula-tinted fog dissolving the rest. |

Showroom, group `misc`: `belt_kit` (every size class, ore and bare, side by side — this is the
entry to use when tuning `oreGlow`), `belt_field` (the bare field, no ship, no beams).
Group `fx`: `bloom_on`, `bloom_off`.

## Numbers — session 6

`--all --preset=medium --dpr=1 --w=844 --h=390` (the gate), before → after this session:

| shot | calls | tris | texMB |
|---|---|---|---|
| nebula_back | 62 → 66 | 20k → 21k | 9.4 → 12.0 |
| hero_hull | 61 → 65 | 19k → 19k | 10.7 → 13.4 |
| hull_close | 12 → 16 | 6k → 6k | 9.4 → 12.0 |
| **belt_work** | — → **78** | — → **114k** | — → **13.4** |
| **belt_fog** | — → **51** | — → **117k** | — → **12.0** |
| station_night | 58 → 62 | 52k | 10.7 → 13.4 |
| station_haze | 75 → 79 | 77k | 9.4 → 12.0 |
| planet_limb | 54 → 58 | 28k | 9.4 → 12.0 |
| star_flare | 65 → 69 | 33k | 10.7 → 13.4 |

Everything is +4 calls and +2.7 MB; that is bloom, and nothing else moved. Worst case is 79 calls
of 150, 117k tris of 350k, 13.4 MB of 60, cpu p95 2.9 ms of 6. **All nine scenarios hold 60 fps
and every one is inside the gate.** `--all` at 1280×720 was checked by eye: no shot regressed into
a bloom haze — `hero_hull`, `station_haze` and `star_flare` all gained a controlled halo on the
star and nothing else.

## What is short — the v0.2 list for these two components

- **The beam dust cone barely reads.** At the level where it is visible at all it starts eating
  the line it is meant to sit behind. `8500_01`'s fan is a real volumetric; ours is a flat ribbon.
  Probably wants a soft-edged shader rather than a vertex-colour taper.
- **No impact effect where a beam meets a rock.** There is a flare point, but no sparks, no
  local orange bounce on the rock, no chips coming off. The plate has all three.
- **Ore reads at one temperature.** A rock is either ore-bearing or not; there are no grades, so
  the player cannot see *how rich* a rock is. `asteroid()` takes `ore` as a number and ignores
  everything except `> 0`. Two or three shared ore materials would fix it without costing
  instancing.
- **Nothing moves.** Motes, debris and rocks are all static. `fx.js` has no update loop at all —
  drift, tumble and beam flicker are all v0.2, and the beams do not animate between ticks.
- **`fxDensity`, `beltDensity`, `beamWidth` and `beamDust` are build-time.** Changing them in the
  panel does nothing until the scenario is re-run. Same pattern as `stationDetail`.
- **Rock silhouettes repeat.** Seven base shapes with random rotation is enough at field density
  but two `huge` rocks side by side are visibly the same rock.
- **The rock texture is the same greyscale fbm at every tier.** No large-scale albedo variation
  between rocks, so a field is one colour of stone.
- **Belt dust cards clamp.** `gl_PointSize` is capped, so a card the camera flies into stops
  growing. Fine for framed shots, wrong the moment there is a free camera (component 8).
- **No overdraw instrumentation.** The 0.8× figure above is arithmetic, not a measurement.

## Gotchas that cost time — session 6

38. **`-Math.abs(x) ** 0.8` is the same syntax error as gotcha 11**, and it fails the same silent
    way: the module does not load and `shot.mjs` times out on `__mono.ready`. Read the `[throw]`
    line in the output, it names it exactly.
39. **`onBeforeCompile` is invisible to the program cache.** For anything that is not a
    `ShaderMaterial`, the cache key is built from the *parameters*, not the source, so a patched
    material can silently be handed another material's already-compiled program and your edit
    does nothing. Set `material.customProgramCacheKey = () => 'something'`. The ore material has
    one.
40. **A `Points` smaller than one pixel is drawn as a full bright pixel.** See the starfield fix.
    Any size-based falloff you build below 1 px is thrown away unless you fold it into the colour.
41. **sRGB encoding lifts a low linear value a very long way.** A beam sheath at 0.14 linear is a
    0.41 pixel, and two crossed ribbons double it — the first beam rendered as a solid green bar
    six times its intended width while the numbers all looked conservative. Judge additive
    brightness from the render, never from the constant.
42. **"Everything is pink" was the fog, not the material.** Four renders were spent chasing a
    pink wash on the asteroids through the ore emissive, the env and the motes. It was `FogExp2`:
    both palette hues are bright, the backdrop was near-black, and 60 % fog on a distant rock made
    it *lighter* than a near one. **If distance makes something brighter, look at the fog colour
    before you look at anything else.** (This is what `fogLevel` exists for.)
43. **`shot.mjs --eval` cannot await a promise** — it wraps the expression in `JSON.stringify(…)`,
    which stringifies the promise itself and returns `{}`. Kick the async work off in `--pre`,
    park the result on `window`, and read that plain value in `--eval`. `--perf` gives you a
    180-frame settle in between, which is about 3 s at 60 fps.
44. **Instancing a field means instancing the *bucket*, not the rock.** The thing that decides
    the draw-call count is how many (shape × material) combinations exist, not how many rocks.
    Constraining ore to one shape per tier took `kestrel` from a potential 20 meshes to 9.
45. **`InstancedMesh.frustumCulled = false` again** (session 5's gotcha 33, second occurrence).
    Every instanced mesh in `belt.js` and `fx.js` sets it. The bounding sphere is one rock.
46. **The vein atlas is not sparse.** `veinAtlas` puts roughly half its area above 0.5, so using
    it directly as an ore mask lights the whole rock. It needs a `smoothstep` on top, and the
    useful window is narrow — 0.16→0.52 reads as cracks, 0.62→0.96 is invisible, 0.22→0.78 is a
    painted orange ball. There is very little room between "nothing" and "too much".
47. **Texel density on a shared instanced geometry is a per-tier decision.** `TIER_UV` at 7 on a
    120 m rock magnified the vein map into lava confetti; 3.0 makes it branching cracks. Same
    shader, same knob values — only the uv scale changed. Look at `belt_kit` in the showroom when
    tuning this, not at `belt_work`.

## Rounds

**Components 4 and 5 have no rounds**, same as 6 and 7. `shots/belt_work.png` and
`shots/belt_fog.png` are the one-pass results. Do not open a critic round on them until the fleet
and the UI exist.

---

# Session 7 — component 10, the content pack (second half)

Wrote `content/tactics.js`, `content/stories.js`, `content/rival.js`, `content/balance.js`.
No sim code was written — `js/sim/` and `sim.mjs` are still the next agent's job, untouched.

## Tactics — six, all three bands

| id | band | cost | heat/wk | duration | story |
|---|---|---|---|---|---|
| `exclusive_supply` | legal | 26000 | 0 | 8 q | `bunnings_ryobi` |
| `vertical_integration` | legal | 34000 | 0 | permanent | `ford_rouge` |
| `price_guarantee` | legal | 12000 | 0 | 6 q | `bunnings_guarantee` |
| `brand_buyout` | grey | 78000 | 9 | permanent | `meta_instagram` |
| `below_cost` | grey | 0 | 6 | 4 q | `boral_predatory` |
| `spec_collusion` | illegal | 18000 | 14 | 8 q | `phoebus_cartel` |

`duration` is **quarters**, 0 = permanent. `heat` is points per week while active.
`exclusive_supply` is the one the v0.1 loop ends on (§1 beat 7). The three greyed on the meter at
beat 10 are `vertical_integration`, `below_cost`, `spec_collusion`, exactly as the plan says.

**`price_guarantee` carries a `requires` field the others do not:**
`{ dominance: { commodity: 'filament', share: 0.5 } }`. That is the whole lesson of the tactic —
the guarantee is free only where nobody else sells the line — and it is data, so keep it in data.

### The effect op vocabulary the sim has to implement

Listed in the header of `tactics.js`, repeated here because `js/sim/tactics.js` is the thing that
must satisfy it:

`lockBrand{brand,commodity}` `rivalPrice{commodity,mult}` `ownPrice{commodity,mult}`
`ownCost{stage,mult}` `rivalCash{perWeek}` `sharePull{perWeek}` `absorb{ships,share}`
`demandPull{commodity,frac}` `demandMult{commodity,mult}` `decayMult{commodity,mult}`
`rivalMood{set}` — plus `rivalShips{delta}`, `freightPrice{mult}` and `rivalRep{delta}`, which
only `rival.js` uses. `commodity: '*'` means every commodity. `ownCost.stage` is one of
`transit` `refine` `upkeep` `wages`. Rival options reuse the same ops with `owner: 'rival'`.

Every grey and illegal tactic has `penalty: { fine, shareLoss, repLoss, ban }`; legal ones have
`penalty: null`. `ban: true` only on `spec_collusion` — get caught colluding and it is gone for
the run.

## Stories — six, checked against sources

| id | band | who | outcome in one line |
|---|---|---|---|
| `bunnings_ryobi` | legal | Bunnings & Techtronic, 2008 | ACCC did not oppose; exclusive dealing is only illegal where it substantially lessens competition |
| `ford_rouge` | legal | Ford, 1917–28 | legal, never challenged, and the assets were later a liability |
| `bunnings_guarantee` | legal | Bunnings, 2025 | legal; no finding against it; it cannot cost anything on lines nobody else sells |
| `meta_instagram` | grey | Facebook/Meta, 2012–2026 | cleared, challenged 8 years later, Meta won at trial Nov 2025, FTC appealing |
| `boral_predatory` | grey | Boral & ACCC, 1994–2003 | Boral won in the High Court 6–1; recoupment is what the regulator can rarely prove |
| `phoebus_cartel` | illegal | Osram/Philips/AEI/GE et al, 1924–39 | illegal today everywhere, largely lawful in Europe then; US court found against GE in 1949 |

Every fact was checked against a primary or named source and the source URL is in `links`.
The ACCC media releases, the Bunnings price policy page, the CNBC ruling report, the IEEE Spectrum
Krajewski article and the ACCC Boral release were all fetched or returned by search this session.

**Where the law is genuinely unsettled the body says so, and that is deliberate.** Exclusive
dealing is not "legal" flatly — it is legal unless it substantially lessens competition, and the
ACCC's 2008 assessment turned on that test. The Meta story ends with an appeal pending, not with a
verdict. Boral lost twice and won once. Phoebus has a real engineering defence (a shorter-lived
filament runs hotter and gives more lumens per watt) which is stated before it is answered.
**Do not let a UI pass flatten any of that into a green tick or a red cross.** If a panel needs a
one-word band, use the `band` field and leave the body alone.

## Story images — none generated, none should be yet

Every story has `image: null`, a written `imagePrompt`, and `credit: 'illustration'` as the
starting value. The image job:

- `phoebus_cartel` is the one with genuine PD material — 1920s/30s lamp advertisements and period
  factory photography. Its prompt says to source a PD plate first and upgrade `credit` to
  `PD: <archive>, <item>`, with an illustration fallback described.
- `ford_rouge`'s prompt notes period Rouge photography may be PD via the Library of Congress, same
  upgrade path.
- The other four are illustration-only: a stylised emblematic object or diagram, two hues, no
  text, no logos, no real people, no storefronts, no fabricated photographs. Amendment B.
- `credit` must always end as `PD: <source>` or `illustration`. Nothing else ships.

## Rival — `content/rival.js`

Six options, exactly the six §6 names: `expand_capacity` `undercut_freight` `own_supply_deal`
`buy_brand` `cut_costs` `hold`. Each has a `weights` object over nine state terms, and **every
option carries all nine keys** (verified) so the sim can dot-product without a lookup miss:

`bias shareGap playerShare cashNorm idleShips playerHeat weekNorm brandLocked underCut`

Term definitions are in the file header — `shareGap` is player minus rival, `cashNorm` is rival
cash over 100000, `playerHeat` is heat over the threshold clamped to 0..1, `brandLocked` is 1
while the player holds any exclusive lock. **The sim computes those nine numbers and nothing
else.** Adding a term means editing both the header and every option.

Two named exports beside the default: `profile` (Corvain's starting cash/ships/share/mood — 4
ships, 71%, matching §1) and `scoring` (`noise: 0.16`, `floor: 0.05`, `moodMult` per mood).
`moodMult` includes `cartel: 0.6`, which is what `spec_collusion`'s `rivalMood{set:'cartel'}`
switches the rival into — a partner acts less.

## Balance — `content/balance.js`

**It default-exports a frozen object, not an array.** It is one namespace, not a list, and the
verify line in the brief (`Array.isArray(...) ? length : typeof`) allows for it. Same as
`system.tamber.js`.

`balance.targets` holds the §9 assertions as data so `sim.mjs` reads them rather than hard-coding:
`offerByWeek13: 0.80`, `bustRateMax: 0.10`, `shareAtWeek13: { min: 0.12, max: 0.25 }`, `runs: 500`.

### Numbers I expect to move, in the order I expect to move them

1. **`loan.interestWeekly` (0.0042)** — this is the single biggest lever on the bust rate. 60k of
   starting debt at 0.0042 is ~252/wk against 900/wk of overhead plus ship upkeep. If the bust
   rate comes in over 10% this is the first knob, not the ship costs.
2. **`market.priceStep` (0.35)** — how fast a market closes the gap to its clearing price. Too
   high and the first ore run spikes the price and kills its own margin; too low and week 13
   revenue never lands. Expect to end somewhere in 0.2–0.5.
3. **`share.window` (8) and `share.inertia` (0.35)** — share is a trailing average of delivered
   tonnage. These two decide whether 4% → 19% by week 13 is reachable at all. **If
   `shareAtWeek13` refuses to land in 0.12–0.25, tune these before touching anything else** —
   they move the target without changing the economy underneath it.
4. **`heat.threshold` (60)** — 60 points against `below_cost` at 6/wk is ten weeks of grey play
   before a roll starts; `spec_collusion` at 14/wk is four. That ratio is the intent. The absolute
   number is a guess.
5. **`offer.weekMin/weekMax` (9/13)** — straight from §9's assertion. If the offer misses the
   window in more than 20% of runs, the cause is almost certainly `unlock.share: 0.12` on
   `exclusive_supply` being unreachable, not this window. Check share first.

Everything else — module costs, ship costs, fuel, `mining.*`, `win.*` — should hold. They came
from the already-good half of the content pack and are internally consistent with it.

Two more I am less sure of and flag now:

- **`below_cost` has `cost: 0` and bleeds through `ownPrice '*' 0.72`.** If that reads as free in
  the UI it is wrong; the cost is the margin, and the panel has to show projected weekly loss or
  the tactic looks strictly good.
- **`spec_collusion` raises both sides' price (1.22 each) and does not pull share.** That is
  deliberate and it is the honest model of a cartel — it makes money, it does not win the market.
  It funds the tactics that do. If a balance pass finds it useless, add a small `sharePull`
  rather than removing the symmetry, because the symmetry is the teaching.

## Verified this session

```bash
node -e "['tactics','stories','rival','balance'].forEach(f=>import('./content/'+f+'.js').then(m=>console.log(f, Array.isArray(m.default)?m.default.length:typeof m.default)))"
# tactics 6 / stories 6 / rival 6 / balance object
```

Also checked, and all pass:

- every `tactic.story` resolves to a real story id; no story is orphaned
- every nested object is frozen, recursively, in all four files
- every story has `image === null`, a non-empty `imagePrompt`, a 2–3 paragraph `body`, an
  `outcome`, at least one link, and a `credit` of `illustration` or `PD: …`
- all six rival options carry the same nine weight keys
- `grep -nE "Math.random|document|require\(|from 'three'|=>|function |window\." content/*.js`
  returns nothing — there is no logic in `content/` at all

## Gotchas — session 7

48. **`content/balance.js` is an object, every other default export is an array.** Any loader that
    assumes `Array.isArray(mod.default)` will drop it silently. `content.load()` has to special-case
    balance (and `system.tamber.js`, which was already an object).
49. **`stations.js` and `rival.js` both have named exports beside the default** (`stations`,
    `profile`, `scoring`). A loader that only reads `default` loses the two stations, Corvain's
    starting numbers and the scoring noise.
50. **Story `body` strings contain apostrophes and are single-quoted.** They are escaped correctly
    now; if you rewrite one, do not switch quote style halfway — a broken string here fails the
    same silent way gotcha 11 and 38 describe.

# Session 8 — component 9, the tick sim

Wrote `js/sim/{rng,content,state,market,tactics,rival,step}.js` and `sim.mjs`.
Nothing under `js/world/`, `js/engine/` or `js/ui/` was touched. The eight `content/*.js`
files were **tuned, not rewritten** — every edit is a number, listed below.

**The one-commodity fallback was NOT taken.** `ore → halide → filament` all three stages ship.

## `node sim.mjs 500` — the numbers it lands on

```
MONOPOLE — 500 seeded games, 40 weeks each

offer week histogram (exclusive_supply):
  10:250  11:124  12:113  13:13
  in window 9-13: 500/500 = 100.0%
  coil line built in 500/500 (median week 7), deal taken 376/500

player share at week 13:
  p10 12.1%  p25 22.1%  median 23.7%  p75 25.1%  p90 26.1%
  in band 12%-25%: 330/500

cash:  week 13  p10 17,418  median 20,030  p90 31,175
       week 40  p10 39,312  median 63,963  p90 83,953

by style:
  cautious    bust 0.0%  offer-in-window 100.0%  median share w13 12.3%
  standard    bust 0.0%  offer-in-window 100.0%  median share w13 25.9%
  aggressive  bust 0.0%  offer-in-window 100.0%  median share w13 23.6%
  reckless    bust 0.0%  offer-in-window 100.0%  median share w13 24.0%

PASS  offer in weeks 9-13: 100.0%  (target 80.0%)
PASS  bust rate: 0.0%              (target max 10.0%)
PASS  median share at week 13: 23.7%  (target 12.0%–25.0%)
```

Two 500-game runs diff clean — the sim is fully deterministic from the seed.

`node sim.mjs --selftest` is a second, separate gate and it is clean. It asserts the
no-mutation contract, that every event carries `t` and `week`, and that the four paths the
balance run never reaches actually execute: illegal-tactic activation, heat crossing the
threshold into an investigation, `spec_collusion`'s ban-on-conviction, bust, and the
monopoly win streak. **Run it before and after any balance edit** — it is much faster than
500 games and it catches the paths the assertions cannot see.

`node sim.mjs --trace --seed=1001 --style=1` prints one game week by week.

## Do the §1 beats actually happen?

Yes, on a standard-style seed, and closer to the table than I expected:

| Beat | Plan | Lands | |
|---|---|---|---|
| 2 rig sent, ships animate | 1–2 | w1 depart, w2 at Kestrel | ✓ |
| 3 ore lands, refinery, first revenue | 3–5 | ore at Ledger w4, halide w4, first sale w5 | ✓ |
| 4 Corvain undercuts freight 12% | 6 | w6 | ✓ |
| 5 buy Coil Line, cash near-zero | 7–9 | w6, cash 27,916 → 9,496 | one week early |
| 6 filament ships, margin triples | 10 | w8: 845/wk of ore becomes 4,944/wk of filament | ✓ early |
| 6 Ryland offers | 10 | w10 | ✓ |
| 7 tactic unlock | 11 | w11 | ✓ |
| 9 rival's share slides | 12–13 | 74% → 57.8% (w12) → 50.4% (w13); player 11.5 → 25.4% | ✓ shape, overshoots |

The story happens. Two honest caveats:

- **Beat 9's exact figures do not.** The plan says "you 19%, them 58%" at week 13; a standard
  run gets you ~25% and them ~50%. The *shape* — their share visibly sliding the moment you
  hold the brand — is right and reads clearly in the log. Getting to exactly 19/58 needs a
  bigger `share.reachTotal`, and that pushes the cautious player under the 12% floor. The two
  cannot both be satisfied; I chose the assertion.
- **The coil line lands a week early** (w6, not 7–9) for a player who buys the moment they can
  afford it. A UI that makes the player think about it for a tick puts it back in the window.

## Balance edits — every number I moved, and why

All in `content/`. Nothing else in those files changed.

| File | Key | Was | Now | Why |
|---|---|---|---|---|
| balance.js | `loan.interestWeekly` | 0.0042 | **0.006** | at 0.0042 debt was free; even a reckless player on the full 80k line could not lose |
| balance.js | `costs.overheadWeekly` | 900 | **650** | pre-coil-line bleed was −2,300/wk, coil line unreachable |
| balance.js | `costs.idleUpkeepMult` | 0.65 | **0.45** | same; a docked hull should not cost like a working one |
| balance.js | `share.window` | 8 | **6** | 8 weeks of trailing mean put half the pre-filament weeks in the week-13 number; share lagged the story by 3 weeks |
| stations.js | `refinery.converts.rate` | 9 | **12** | 12 halide/wk is exactly what a Coil Line at rate 6 eats — the two modules now chain with no waste |
| stations.js | `refinery.upkeep` | 620 | **460** | see overhead |
| stations.js | `coilline.cost` | 36000 | **17000** | at 36k no play style ever reached it; §7's own example was 22000 |
| tactics.js | `exclusive_supply.unlock.share` | 0.12 | **0.08** | the offer window is 9–13 and share does not reach 0.12 until ~w14; this is the lever HANDOFF §7 predicted |
| tactics.js | `exclusive_supply` `demandPull.frac` | 0.22 | **0.14** | the deal stacked a price floor, a demand pull and a rival squeeze; two of three were trimmed |
| rival.js | `expand_capacity` `cashNorm` | 0.75 | **0.45** | Corvain expanded every 6 weeks forever on a 118k bankroll |
| rival.js | `expand_capacity` `idleShips` | −0.90 | **−1.80** | so extra hulls it cannot fill actually deter the next order |
| rival.js | `undercut_freight` `bias` | 0.34 | **0.42** | never fired at all at 0.34 |
| rival.js | `undercut_freight` `shareGap` | 0.95 | **0.35** | at 0.95 it could only fire once the player was already big — the opposite of beat 4 |
| rival.js | `undercut_freight` `weekNorm` | 0.15 | **2.40** | with bias low and weekNorm high it lands on week 6, which is beat 4 |
| rival.js | `undercut_freight` `cooldown` | 2 | **8** | at 2 the player sat permanently at the 0.88 freight multiplier |

### Keys I added to `content/balance.js` (all data, no logic)

`market.feedWeeks: 3` · `share.rivalPerShip: 4850` `share.otherBase: 6600` `share.undercutBoost: 1.06`
`share.reachTotal: 26500` `share.reachDrift: 0.002` · `rival.effectWeeks: 4` `rival.incomePerShip: 3400`
`rival.upkeepPerShip: 1900` `rival.woundedCash: 24000` `rival.aggressiveAt: 0.16` ·
`contract.shortfallFrac: 0.12` · `offer.tactic` `offer.units: 6` `offer.priceMult: 1.02` ·
`tick.maxDwell: 3`

`share.reachTotal` is the single most powerful knob in the file. **Share is measured in
delivered credits, not tonnes** — tonnage made refining *lower* your share, which is backwards
for the whole story. The Reach is a fixed pot of freight value: `player + rival + other =
reachTotal`, so hulls the rival cannot fill earn it nothing and every credit you take comes out
of somebody. Move `reachTotal` to move the whole share band without touching the economy under it.

## Event vocabulary — the complete list

Every event is `{ t, week, ...payload }`. `week` is the week the tick produced, not the week it
started. The 3D and the UI replay this list; **they must never read state**.

| `t` | payload |
|---|---|
| `order` | `{ order: 'route'\|'assign', ship, legs? , to? }` — a player order was accepted |
| `module` | `{ module, name, site, cost }` |
| `ship` | `{ ship, class, name, cost }` |
| `loan` | `{ amount, fee, debt }` |
| `repay` | `{ amount, debt }` |
| `depart` | `{ ship, class, from, to, weeks, arc, cargo }` — `arc` is the route's curve, for the flight path |
| `arrive` | `{ ship, class, site, cargo }` |
| `mine` | `{ ship, site, commodity: 'ore', units, rich }` — hold the mining beam while these repeat |
| `load` | `{ ship, site, cargo }` — `cargo` is the delta taken, not the hold |
| `deliver` | market sale: `{ ship, site, commodity, units, price, credits }`; contract delivery: `{ contract, with, site, commodity, units, price, credits }` — **branch on `ship` vs `contract`** |
| `refine` | `{ site, module, from, into, units, consumed }` |
| `shortfall` | `{ contract, commodity, units, fee }` |
| `contractEnd` | `{ contract, with }` |
| `price` | `{ prices: { ore, halide, filament } }` — one per tick, rounded |
| `rival` | `{ action, name, ships }` — only when the rival did something; `hold` emits nothing |
| `expire` | `{ tactic, name }` |
| `heat` | `{ heat, gained, threshold }` — only on weeks heat was gained |
| `investigate` | `{ tactic, name, band, fine, shareLoss, repLoss, banned, story }` |
| `cost` | `{ wages, modules, fuel, interest, overhead, total, cash, revenue }` — one per tick, the whole P&L |
| `share` | `{ player, rival, other }` — floats summing to 1, one per tick |
| `quarter` | `{ quarter, week, share, cash, debt, heat, rivalAction }` — week % 13 === 0 |
| `offer` | `{ tactic, brand, commodity, cost, units, price }` — Ryland's approach, §1 beat 6 |
| `unlock` | `{ tactic, band, story, name }` — carries `story` so the story panel needs no lookup |
| `tactic` | `{ tactic, name, band, cost, story }` — the player took it |
| `lose` | `{ reason: 'bust', cash, week }` |
| `win` | `{ tier: 'monopoly'\|'duopoly', share, week }` |

`state.log` is the same list, appended, for the Dossier and for replay.

## State shape

```js
{
  v, seed, system, week,
  cash, debt, rep, heat, investigateCooldown,
  ships: [{ id, class, at, leg, eta, cargo, route, routeIdx, dwell, arrived }],
      // leg: null | { from, to, weeks, arc };  cargo: { [commodityId]: tonnes }
      // route: null | [siteId, siteId, …] cycled forever;  arrived: true only on the arrival tick
  sites: {
    ledger:   { id, kind: 'station', owner: 'player', stock: {}, modules: [], hold },
    kestrel:  { id, kind: 'belt',    owner: 'none',   stock: {}, yield, reserve, worked },
    ossian:   { id, kind: 'market',  owner: 'none',   stock: {}, buys: [] },
    drayyard: { id, kind: 'station', owner: 'rival',  stock: {}, modules: [], hold },
  },
  market: { ore: { price, demand, supply, last }, halide: {…}, filament: {…} },
  contracts: [{ id, with, commodity, units, price, weeksLeft, exclusive }],
  tactics: { unlocked: [], active: [{ id, owner, weeksLeft, band }], owned: [], banned: [], offered: [] },
  rival: { cash, debt, ships, rep, mood, lastAction, cooldowns: {}, costMult,
           undercutFor, freightMult, effects: [{ op, weeksLeft }] },
  share: { player, rival, other },       // floats summing to 1
  locks: { [commodityId]: 'player' | 'rival' },
  flow: { [commodityId]: tonnes },       // this tick's player supply; reset by the market clear
  hist: { player: [ …credits, one per week, length share.window ] },
  loadOrder: ['filament', 'halide', 'ore'],
  over: null | 'bust' | 'duopoly' | 'monopoly',
  holdStreak, log: []
}
```

`tactics.active[].weeksLeft` is `Infinity` for permanent tactics — **do not `JSON.stringify` the
state and expect it back**; use `state.clone()` / `serialise()` from `js/sim/state.js`.

## Action vocabulary — what the UI sends into `step`

```js
step(state, { actions: [...], rng })   // → { state, events }
{ type: 'route',      ship, legs: [siteId, …] }   // cycled forever
{ type: 'assign',     ship, to }                  // one hop, becomes a 2-stop route
{ type: 'buyModule',  module, site = 'ledger' }
{ type: 'buyShip',    class }
{ type: 'tactic',     tactic }                    // buy + activate; silently no-ops if not affordable/unlocked
{ type: 'loan',       amount }
{ type: 'repay',      amount }
{ type: 'loadOrder',  order: [commodityId, …] }
```

Actions resolve **before** stage 1, so a tactic bought this tick applies this tick. Unknown
action types are ignored, never thrown — a UI bug must not kill a run.

## Two design calls a reviewer should know about

**The unlock/offer check runs after the share recompute, not in stage 6.** §6's ten stages do
not mention unlocks at all, and the offer is gated on share, so checking it in stage 6 would
read *last* week's share and cost a full week of lag — enough on its own to push the offer
outside the 9–13 window. `tickActive` and `accrueHeat` stay in stage 6 where the plan puts them.
The ten specified stages are in the specified order.

**`demandPull` moves value, it does not create it.** `demandPull{frac}` scales the player's
weekly value up and the rival's cap down by the same fraction. `lockBrand` sets `state.locks`
(read by the rival's `brandLocked` term). `rivalPrice` squeezes the rival's *volume* through
`1 / rivalPrice[filament]`, which is how beat 9's share slide is produced from data.

## What is short, and would be the v0.2 jobs

- **The economy has no failure mode.** Bust is 0% under all four harness styles, including one
  that draws the full 80k credit line and buys three extra ships. The assertion is a maximum so
  it passes, but a game you cannot lose is worse than one you can. `loan.interestWeekly` and
  `costs.*` are the levers; the bust *code path* is proven by `--selftest`, so this is a tuning
  job, not a plumbing one.
- **Heat and investigations never fire in a 40-week run.** The grey and illegal tactics unlock
  at 20–28% share *and* 55–90k cash, which a v0.1 game reaches around week 30 at the earliest,
  and then needs 13 more weeks to cross the heat threshold. Everything works (`--selftest`
  proves activation, accrual, the roll, the fine and the ban) but nothing exercises it. Either
  the unlocks come down or v0.2 needs a longer campaign.
- **Ossian is the only market and Dray Yard is inert.** The rival's economy is an abstraction
  (`rival.incomePerShip`/`upkeepPerShip`), not simulated freight. Fine for v0.1; it is why
  `share.reachTotal` has to exist at all.
- **`content.all('palette')` and `content.all('formation')` return `[]`.** Both kinds are in the
  §3 contract but their data lives in `js/world/palettes.js`, which imports three and therefore
  cannot be pulled into `js/sim/content.js`. The next agent to need them should add
  `content/palettes.js` as data and have `js/world/palettes.js` read *that*.
- **The harness policy is not a game AI.** It lives in `sim.mjs`, deliberately outside
  `js/sim/`. If a future component wants an autopilot, it needs its own module.

## Gotchas — session 8

51. **A hauler docked at a station will strip it bare before production runs.** Stage 1 (load)
    is before stage 2 (produce), so the first build had the refinery seeing zero ore for the
    whole game and silently producing nothing — no error, just a company that never made a
    credit. `feedstock()` in `step.js` holds back `per × rate × market.feedWeeks` of every
    converter's input. If you add a converter module, this is automatic; if you change
    `feedWeeks`, re-run the balance.
52. **A hauler that waits for a full hold destroys the share curve.** Waiting to fill 120 t at
    6 filament/wk made revenue arrive in 3-week lumps, and whether the lump landed on week 12 or
    13 decided the assertion. Ships now leave when the station has nothing *free* left to give
    (`freeStock()`), not when the hold is full. Rigs still fill up, because a belt always has
    more to give. This one change took the offer-in-window rate from 76% to 100%.
53. **Share had to be measured in credits, not tonnes.** §6 says "trailing average of delivered
    tonnage". Under tonnage, refining ore into halide *halves* your share — the exact opposite
    of the game's story. `hist.player` holds weekly delivered credits.
54. **Week 1 collapsed the 4% the ticker had just quoted.** With an empty history the computed
    share target was ~0 and the meter fell to 0.2% by week 3. `newGame` prefills `hist.player`
    with `reachTotal × start.share.player` — the freight the company was already doing — and it
    decays out naturally over `share.window` weeks.
55. **`weeksLeft: Infinity` does not survive `JSON.stringify`.** Permanent tactics carry it.
    `clone()` uses `structuredClone` where it exists for exactly this reason.
56. **The rival will expand forever if its share is not capped by demand.** With share
    proportional to hull count, Corvain bought a hull every 6 weeks to 84% and the player could
    never catch up. The fixed Reach pot is the fix; the `idleShips` weight only works once
    hulls the rival cannot fill stop paying.
57. **`sim.mjs` numeric args must be filtered out of the flags.** `parseInt(process.argv[3])` on
    `--seed=1000` gives `NaN`, `w < NaN` is false, and the trace prints nothing at all with no
    error. Numbers are picked out with `/^\d+$/` now.

---

# Session 9 — components 11 (UI shell) and 8 (camera)

Wrote `js/ui/{format,simview,panels,fixture,screens,story,hud}.js`, `ui.css`,
`js/world/camera.js`, `tools/uishot.mjs`, the camera showroom entries in
`js/showroom/entries.js`, and small additive edits to `index.html`, `js/main.js`,
`js/scenarios.js` and `js/showroom/index.js`. Nothing under `js/world/kit/`, `js/engine/` or
`content/` was touched.

**One sim file was changed** — see "The off-by-one in `emit`" below. It is a one-line fix, both
sim gates were re-run clean, and it had to happen before any UI could show a week number.

## The panels — eight, all bottom sheets

| id | title | group | what it is |
|---|---|---|---|
| `assign` | Assign a ship | fleet | ship chips → destination cards (weeks + fuel + what is there) or a named loop; sends `assign` / `route` |
| `holdings` | Holdings | company | three tabs: Fleet (+ order a hull), Ledger (modules, bond store, + build), Finance (cash/debt/credit line, last week's P&L, draw/repay) |
| `market` | Market | company | three commodity cards with price + trend + demand/supply, the ore→halide→filament chain, contracts, load-order priority |
| `refinery` | Refinery | company | the chain as a pipeline with live rates, the feed-buffer explanation, and the Coil Line build CTA — this is §1 beat 5 |
| `tactics` | Tactics | company | the tree: three band groups on a spine, per-card state, effects in plain English, "Read the real case" |
| `quarterly` | Quarterly results | company | quarter numeral, headline sentence, three-way share bar with the delta in points, quarter P&L, what Corvain did |
| `story` | The real case | dossier | the case panel — below |
| `dossier` | Dossier | the cases | every case grouped by band, uncovered ones tappable, the rest shown as locked rows |

**Nothing is ever a blocking modal.** `#sheet` is `pointer-events: none`; only `.sheet` takes
events. The scene behind an open sheet keeps rendering **and keeps taking gestures** — that is
asserted in the flow test (`sceneStillOrbitsUnderSheet`). A sheet is dismissed by ✕, by Escape,
or by dragging the grab bar / header down (>96 px or a flick). Tapping the 3D orbits it; it does
not close the sheet.

One sheet is visible at a time on a back stack. `panels.open` pushes (a ‹ back chevron appears),
`panels.swap` replaces the top for sibling navigation, `panels.close` pops, `closeAll` clears.
Every sheet's primary action is a full-width ≥44 px button in a sticky footer inside the thumb
zone; `tools/uishot.mjs` asserts that.

### The story panel

Plate → header → the tactic in your hands → what actually happened → **where the law stands** →
sources. Serif for the title, the outcome and the quarter numeral; the rest is system sans at
14.5 px/1.62 with a real section-label hierarchy.

**The law is never a tick or a cross,** per the content agent's warning. The band chip is one
word for scanning — Legal / Contested / Illegal — and immediately under it sit two things it
cannot be read without: a fixed stance line per band ("Lawful or not depending on facts somebody
has to prove in court") and the story's own `outcome` string in full, set large. A closing note
says in as many words that the one word is shorthand and the paragraphs above are the actual
answer. `format.js` owns `BAND_WORD` and `BAND_STANCE`; if a future panel wants a shorter
summary, add a field to `content/stories.js` rather than truncating `outcome`.

**Images.** Every story is `image: null` today. The plate renders a composed card in the same
`2.4 / 1` box with the same caption slot: a band-tinted two-hue gradient, a scanline overlay, a
per-story line-art motif (six of them, in `MOTIF` in `story.js`), the year in serif bottom-left
and the place in small caps bottom-right. When `image` lands, `plate()` takes the other branch —
an `<img>` at the same ratio with the same `credit` caption — and nothing else moves. The credit
line is always rendered, never conditional.

## The fixture mechanism — how the showroom shows a panel

`definePanel({ id, title, group, render(props, api), mount?, fixture? })` auto-registers into
showroom group `panel` and calls `showroom.expect('panel', id)`, so a panel cannot be forgotten.
`content/stories.js` auto-registers six more entries into group `story` via
`registerStoryEntries()`.

Running a panel entry calls `panels.showFixture(id)`, which:

1. builds (once, memoised) `js/ui/fixture.js`'s canned company — **a real game**: `newGame(1001)`
   stepped 13 weeks through the real `step()` with a small scripted policy. Coil Line built,
   Ryland's offer taken, the exclusive running, one `quarter` event in the log, share 25.4 %,
   cash 20,030, debt 80,000. A fixture that is not real state hides bugs;
2. points `panels` **and the HUD** at it (`panels.onSim` → `hud.bind`), so the top bar reads
   week 13 / 25.4 % rather than contradicting the sheet;
3. opens the panel with `def.fixture(view, content)` or `fixtureProps(id, view)` from `fixture.js`;
4. adds `body.fixture`, which only draws a small "showroom fixture" label. The dock, the speed
   control and the HUD stay live and usable — what gets reviewed is the shipping chrome.

`showroom.onRun` (added, additive) lets `main.js` stand the fixture down when the ← → sweep
moves onto a non-panel entry.

`showroom.missing()` is **0**. 48 entries: scene 9, camera 6, fx 9, panel 8, story 6, misc 10.

## The camera — `js/world/camera.js`

The §3 contract is met exactly: `moveCamera(app, {pos, look, fov, ms, ease})` returns a Promise
that resolves on arrival, `flyBy(app, {keys, ms, loop})`, `camera.focus(object3D, {dist, phi,
theta, ms})`, `camera.setTouchEnabled(bool)`.

**The rig is always in orbit form** — target, distance, polar, azimuth, fov. `moveCamera` and
`flyBy` convert their endpoints back into orbit terms on arrival, and `frameCamera()` in
`scenarios.js` now stands the rig down and hands it the new framing. That is the mechanism that
makes "the camera can never end up in a state that blocks play" true rather than hoped for:
however the camera got there, a finger continues from there and `focus()` reframes from bounds.

**Exactly three gestures, verified headlessly** (synthetic pointer events over CDP, in the
session log):

| behaviour | result |
|---|---|
| one-finger drag orbits | theta −0.36 → −1.02, phi moved |
| **a pinch that starts as a drag does not ruin the framing** | first finger moved the framing (`midDragMoved`), the second finger **restored** phi/theta to the values at gesture start (`dragWasUndone`) before dollying |
| two-finger pinch dollies | dist 811 → 261, angles untouched |
| tap selects and does not orbit | `onTap` fired, phi/theta unchanged |
| `setTouchEnabled(false)` | a full drag changes nothing |

There is no pan, and there is no third gesture. Lifting one finger out of a pinch rebases the
pinch rather than falling back to a drag, or the framing snaps.

Knobs, group `Camera`: `camOrbitSpeed` `camPinchSpeed` `camDamp` `camDistMin` `camDistMax`
`camTapSlop` `camInvertY` `camTouch`.

Camera showroom entries: `cam_cold_open` (§1 beat 1 — down Ledger Station's spine, out, and round
until the belt fills the frame; 11 s), `cam_cold_open_loop` (same keys, `loop: true`),
`cam_belt_run`, `cam_focus` (wide → `focus()` on a hull), `cam_orbit` (touch live),
`cam_dolly` (two chained `moveCamera` promises). They share `reachScene()`, which builds Ledger +
Kestrel + four hulls and measures the belt's real bounding-sphere centre so the last fly-by key
lands on the rocks rather than near them.

## The off-by-one in `emit` — the one sim change

`js/sim/step.js` line 45 was `{ week: s.week + 1, ...e }`, but `s.week += 1` runs four lines
later and before anything emits. Every event therefore carried a week one ahead of the state that
produced it, against the contract this file's own handoff states ("`week` is the week the tick
produced"). The `quarter` event was right only because it passes `week` explicitly and the spread
comes after.

It is now `{ week: s.week, ...e }`. Re-run clean:

- `node sim.mjs --selftest` — all ten assertions pass.
- `node sim.mjs 500` — **identical distributions**; offer-in-window 100 %, bust 0 %, median share
  at week 13 23.7 %. Only the offer-week histogram shifts down one (10/11/12/13 → 9/10/11/12),
  still 100 % inside the 9–13 window.

**Every event week recorded in earlier sessions is therefore one higher than the sim now
reports.** The §1 beat table in session 8 read event weeks: the coil line lands at w5 (not w6),
Ryland offers at w9 (not w10), the tactic unlocks at w10. The *state* weeks in those tables were
always right.

## Perf — nothing regressed

`--all --preset=medium --dpr=1 --w=844 --h=390`, the gate: calls 16–79, tris 6k–117k, texMB
12.0–13.4, cpu p95 ≤ 2.9 ms, all nine at 60 fps. Identical to session 6's table. The UI is DOM
over the canvas and costs nothing measurable; the HUD refreshes on sim events and on panel stack
changes, not per frame.

## `tools/uishot.mjs` — the new tool

Same raw-CDP recipe as `shot.mjs`, but it emulates touch, drives the showroom instead of a
scenario, and asserts layout rather than only capturing it.

```bash
node tools/uishot.mjs --all-panels --w=390 --h=844      # every panel, portrait
node tools/uishot.mjs --all-stories --w=844 --h=390     # every case, landscape
node tools/uishot.mjs --sr=cam_cold_open --wait=11400   # a fly-by at a given moment
node tools/uishot.mjs --panel=tactics                   # a panel against the LIVE company
node tools/uishot.mjs --eval="…" --report="window.__X"  # drive it, then read a value back
```

Every run checks and reports: sheet under the top bar, sheet over the dock, sheet off screen,
primary action off screen / above the thumb zone / under 40 px, sideways scroll in the body or
the page. All eight panels are clean at **390×844 and 844×390**.

## Layout, for whoever touches `ui.css`

Three CSS variables carry the whole thing: `--top` (46 px + safe area), `--dock` (58 px + safe
area), `--ctrl` (42 px, the floating row that holds the speed pill and the recentre button).
Sheets sit at `bottom: var(--dock) + var(--ctrl)` and cap at `min(66vh, …)`, which leaves the
middle third of the screen — the part the 3D lives in — permanently clear. Above 700 px wide the
sheet becomes a 430 px right-hand column and the speed pill moves left of it. Under 460 px tall
everything shrinks and the case plate goes to `5 / 1`.

`body.game` hides the perf readout (`?perf=1` brings it back) and moves the ⚙ knob panel to the
left, because the sheet owns the top-right corner in landscape.

## What component 12 needs

**The seam is `js/ui/simview.js`.** It holds one state, a queue of player actions and the speed
setting, and it deliberately **does not own a clock**. Component 12 writes the tick clock and
calls:

```js
sim.tick()                    // → { state, events }; also emits 'tick' to subscribers
sim.speed                     // 0 | 1 | 2 | 4, set by the HUD's speed control
sim.tickSeconds               // 6, from content/balance.js
hud.setTickProgress(f)        // 0..1 — drives the 2 px line across the top of the screen
```

The HUD already reacts to the events: `hud.react(events)` runs the ticker line, opens the story
sheet on `unlock` (§1 beat 8) and the results sheet on `quarter` (beat 4), and refreshes. It is
wired to `sim.on('tick')` already — **do not call `hud.react` a second time from the clock.**

Everything else it needs:

- `camera.attach(app, { onTap })` is already called in `main.js`. Pass a real `onTap` to make tap
  selection do something: it receives the first raycast hit and the full hit list. Tapping the
  belt should open `assign`, per §1 beat 2 — `panels.open('assign', { ship, dest: 'kestrel' })`.
- The live scene is still the placeholder: `main.js` leaves `world.subject` as the default hauler
  and calls `camera.focus` on it. Building the real Tamber Reach scene (station, belt, planet,
  ships at their site positions) is component 12's. `reachScene()` in
  `js/showroom/entries.js` is a working sketch of it — lift it, do not import it.
- Ship movement replays `depart` / `arrive` events (`leg.arc` is the curve), mining beams hold
  while `mine` events repeat. The UI never reads state for any of this.
- `panels.refresh()` re-renders the visible sheet in place; it is cheap enough to call every tick
  and the HUD already does it on non-tick events.
- Actions are queued, never applied: a panel calls `sim.act({...})` and the sim sees it at the
  next `tick()`. `sim.unact(pred)` is the same-tick cancel the Assign panel uses.

## What is short, and would be v0.2

- **The camera has not been on Aaron's phone.** Build order §8 says that is component 8's
  acceptance test and it is the one thing that could not be done headlessly. Synthetic pointer
  events prove the state machine; they do not prove the feel of `camOrbitSpeed` or whether
  `camTapSlop` at 9 px is right for a thumb.
- **`camera.focus()` has no tap-to-select target yet** because nothing in the live scene is
  selectable — that lands with component 12.
- **Save/load is not wired.** `simview.load()` and `js/sim/state.js`'s `serialise/deserialise`
  exist; nothing calls them and there is no localStorage key.
- **No win/lose screen.** `hud.react` puts `win` and `lose` on the ticker and nothing more.
- **The Dossier derives "seen" from the event log** plus a session Set. That survives save/load
  for free but means a story read from the showroom is not remembered across a reload.
- **No sound, no haptics.**
- The `assign` panel's "one trip" and "loop" are the same thing to the sim (`assign` sets a
  two-stop route that cycles). The copy says "run between", which is honest, but if v0.2 wants a
  genuine one-way order the sim needs a new action.

## Gotchas — session 9

58. **`emit` was one week ahead of the state.** Above. Anything comparing `event.week` to
    `state.week` before this session was off by one.
59. **A CSS `aspect-ratio` plus `max-height` shrinks the *width*.** The case plate was set to
    `2.4 / 1` with `max-height: 32vh`; in landscape the cap won and the plate rendered at 300 px
    wide inside a 430 px sheet instead of filling it. Use a different ratio in a media query, not
    a height cap.
60. **`setPointerCapture` throws on a pointer id the browser does not own,** and the throw aborts
    the rest of the `pointerdown` handler — the gesture then half-starts and the next move does
    something wrong. Both capture calls in `camera.js` are in `try {} catch {}`. This bit during
    headless testing with synthetic events but the same failure is reachable on a real phone with
    a stale id after an interrupted touch.
61. **Absolutely-positioned bar captions need a positioned parent and reserved space.** Three
    separate bars (`.bar b`, `.ds s`, `.heat-strip s`) laid their labels straight over the next
    block. `.bar` now reserves `margin-bottom: 22px`; the other two were made static.
62. **`.tactic { overflow: hidden }` clipped the tree's node dots,** which sit at `left: -16px` in
    the spine gutter. Radius on the header instead of overflow on the card.
63. **The HUD does not know a panel opened.** Dock highlighting needs `panels.onStack(...)`;
    without it the dock never lights up, because `hud.refresh()` otherwise only runs on sim
    events. Same shape of problem as `panels.onSim` for the fixture.
64. **`showroom.step(±1)` sweeps across groups,** so a panel's fixture sheet was still on screen
    when the sweep reached a scene. `showroom.onRun` (new, additive) is the hook that stands it
    down; `main.js` owns the policy, not `panels.js`.
65. **A landscape phone puts the sheet and the ⚙ knob panel in the same corner.** `body.game`
    moves the knob panel to the left. Anything else added top-right has the same problem.

---

# Session 10 — components 12 (wiring) and 13 (fleet)

Wrote `js/world/fleet.js`. Rewrote `js/main.js`. Added the live system, the two fleet scenarios
and the fleet showroom entries to `js/world/scene.js`. Three small additive fixes elsewhere:
`js/ui/panels.js` (the CTA footer), `ui.css` (same), `js/world/camera.js` (tap picking).
**Nothing under `js/sim/`, `content/` or `js/world/kit/` was touched.** `node sim.mjs --selftest`
is still clean.

## What is playable, end to end

Load `index.html` with no query string and you get a game. Measured by driving it headlessly
over CDP and reading the event log — every §1 beat fires:

| Beat | Plan | Fires at | |
|---|---|---|---|
| 1 cold open, ticker | — | fly-by 0–11 s, ticker `Corvain Drayage 71%. You: 4%.` | ✓ |
| 2 tap the belt → Assign, send the rig | 1–2 | tap opens `assign` with `{ship:'ossa-3', dest:'kestrel'}`; w1 `depart`, w2 `arrive`+`mine` | ✓ |
| 3 ore lands, refinery, first revenue | 3–5 | w4 `arrive ledger` + `refine`, w5 first `deliver` at Ossian | ✓ |
| 5 buy the Coil Line, cash near zero | 7–9 | w7 `module coilline`, cash 27.9k → 9.5k | ✓ |
| 6 filament ships, Ryland offers | 10 | w7 `refine coilline`, w11 `offer exclusive_supply` | ✓ |
| 7 tactic unlock | 11 | w12 `unlock` | ✓ |
| 8 story panel, non-blocking | 11 | `hud.react` opens `story` over the live scene at w12 | ✓ |
| 9 their share slides, quarterly | 12–13 | w13 `quarter`: **you 18.5 %, them 57.3 %** (plan said 19/58) | ✓ |
| 4 quarterly results | 6 | **w13, not w6** — `weeksPerQuarter` is 13, so the plan's week-6 quarterly was never reachable | ✗ |
| 10 monopoly meter, next three tactics greyed | — | the Tactics panel already draws the tree with locked bands | ✓ |

Two things the player has to do that the beat table does not mention, both real decisions the UI
supports: **the Coil Line has to be bought** (Refinery panel CTA) and **the exclusive needs 30 k
cash in hand**, which on this line means drawing on the credit line in Holdings → Finance. That is
exactly what `js/ui/fixture.js`'s scripted policy does, and without the loan the offer arrives at
w11 and the unlock never fires. Worth knowing before anyone calls it a bug.

## The tick clock — `js/main.js`

```js
const gap = sim.tickSeconds / sim.speed;      // tickSeconds 6, speeds 0 / 1 / 2 / 4
clock.acc += dt;
while (clock.acc >= gap && budget-- > 0) { clock.acc -= gap; sim.tick(); }
hud.setTickProgress(clock.acc / gap);
```

- It is a plain system on `app.systems`, so it runs off the render loop and stops when the tab does.
- **Speed only changes the gap between whole ticks.** Nothing is ever integrated per-second, so a
  run at ×4 resolves identically to the same run at ×1. Proven, not argued: the same seed driven by
  the same scripted policy at ×1 and at ×4 lands on `cash 8224`, `share.player 0.02032043207152621`
  at week 7 — bit-identical.
- `budget = 2` caps ticks per frame; a backgrounded tab drops the *remainder* (`acc = 0`), never a
  tick's effects.
- `hud.react` is subscribed by `hud.bind` already. The clock does **not** call it. `main.js` has its
  own `sim.on('tick')` that only feeds the 3D and calls `panels.refresh()`.

## The live scene — `ReachScene` in `js/world/scene.js`

`reachScene()` in `entries.js` is superseded; the camera entries still use their own copy and were
left alone. The real one is `new ReachScene(app, world)` + `world.setLive(reach)`.

**Visual positions are not sim positions.** `content/system.tamber.js`'s `pos` is the sim's
topology. Ossian is a 4200 m sphere and at the content position it filled two thirds of a phone
screen, so the planet is pushed out to `[5600, -1500, -4400]` **and scaled to 0.34**; Dray Yard is
pushed to `[1540, 400, 3520]`. The table is `REACH` at the top of the section, with a `dock` per
site — where hulls park — separate from the body's centre.

- `world.setLive()` / `world.resumeLive()`: a showroom entry **parks** the live group instead of
  disposing it (`setSubject` skips `disposeTree` for `live.group`). Showroom entry `live_reach`
  puts the player back in the running company.
- `World.update` calls `live.update(dt)` only while the live group is still the subject.
- Station lights breathe by riding the `windowGlow` knob's own value
  (`m.emissiveIntensity = q.get('windowGlow') * pulse`), so the knob still sets the level and the
  breathe rides on top. No cloned materials, no extra draw calls.
- **Tap targets are regions, not meshes.** Each site carries an invisible `SphereGeometry` proxy
  (`material.visible = false`, `DoubleSide`). three gates the render-list push on `material.visible`,
  so a proxy costs **zero draw calls** and still raycasts. Without them a finger between two rocks
  at Kestrel hits nothing at all — measured: 0 solid hits at frame centre.
- `siteAt(hit, hits)` scans the **whole** hit list and prefers a ship, because a docked hull sits
  inside its site's proxy and would otherwise never be tappable.
- Tap map: belt → `assign` preloaded with the rig and Kestrel (§1 beat 2), Ledger → `holdings`
  (Ledger tab), Ossian → `market`, Dray Yard → `quarterly`, a hull → `assign` for that hull.

## Event replay — `shipMover` in `js/world/fleet.js`

The 3D never reads state. `mover.apply(events)` once per tick, `mover.update(f, t)` every frame.

- **Advance, then replay.** Every hull in flight gets `elapsed += 1` *before* the events are read,
  because an `arrive` in this tick's list means the hull reached the end of its curve during the
  gap that just finished. Position is `curve.getPoint((elapsed + f) / weeks)`. A one-week leg runs
  0 → 1 over exactly one gap and lands as `arrive` fires.
- `depart` builds a `QuadraticBezierCurve3` from the route's own `arc` (sideways by `arc·len·0.5`,
  up by `arc·len·0.16`), so the four routes bend differently and a ship never slides down a
  straight line.
- `mine` sets `mining = 2` and a beam is built once, from the rig's dock to the hero ore rock, then
  toggled `visible`. Rebuilding beam geometry every tick would have been two `mergeGeometries` a
  week for nothing.
- Engine trails are built per hull and **hidden while docked**, so they cost nothing at rest.
- `seed(ships)` is the only place anything reads a state snapshot, and only to place hulls before
  the first tick.

## Component 13 — `fleet()` and the draw-call answer

```js
fleet(formationId, entries, { spacing = 1, merge = true, gap = 1 })
allFormations()   // line column wedge echelon ranks swarm
```
`entries` is `'hauler'` or `{ class, palette, lod, seed, scale, ry, pos }`. Returns an `Object3D`
whose origin is the lead hull. Formations return slots in **hull lengths**, and the unit is the
**longest class in the set** — spacing off each ship's own length collapses the rank wherever an
escort lands and the formation stops reading as a formation.

**Merging across ships is the whole component.** `mergeAcross(src)` bakes every mesh's world matrix
into a clone of its geometry and merges one mesh per material.

- **Instancing does not work here and this is why:** the ship shader recomputes
  `vWP = (modelMatrix * vec4(transformed,1)).xyz` and never sees `instanceMatrix`, so every instance
  would take its rim, its roughness noise and its bounce from the mesh origin. Merging is correct
  for all three because the baked positions *are* world positions.
- Materials are deduped by a key, not by identity: `m.name` for the kit's cached ones
  (`palette:surface:class`), else `palette:surface:map.uuid`. Without that the per-ship
  `engineGlow`, `plume` and decal materials — which are freshly constructed inside `shipClass` but
  identical in every respect — would each keep their own draw call and the merge would buy nothing.

### The numbers, at `--preset=medium --dpr=1 --w=844 --h=390`

Whole frame, `showroom` entries `fleet_1/4/9/24`, three classes at four scales in `ranks`:

| hulls | calls | fleet only | tris | texMB | cpu p95 |
|---|---|---|---|---|---|
| baseline (backdrop + bloom, no hulls) | 8 | — | 1 k | 13.4 | — |
| 1 | **19** | 11 | 6.7 k | 13.4 | 1.2 ms |
| 4 | **25** | 17 | 13.0 k | 13.4 | 1.4 ms |
| 9 | **27** | 19 | 23.2 k | 13.4 | 1.4 ms |
| 24 | **27** | 19 | 48.5 k | 13.4 | 1.4 ms |

**Flat from nine hulls to twenty-four**, because the count is set by the number of distinct
(class × surface) buckets in the set, not by the number of hulls. Unmerged, the same 24-hull set is
5×10 + 10×7 + 9×3 = **147 calls for the hulls alone**, 155 with the backdrop — over the 150 gate.
The gate passes with 123 calls of headroom.

### Perf — the gate, `--preset=medium --dpr=1 --w=844 --h=390`

| | calls | tris | texMB | cpu p95 | fps |
|---|---|---|---|---|---|
| budget | < 150 | < 350 k | < 60 | < 6 ms | 60 |
| eleven scenarios (`--all`) | 16 – **79** | 6 k – **117 k** | 12.0 – 13.4 | ≤ **2.7** | 60 |
| `fleet_line` | 50 | 42 k | 13.4 | 2.1 | 60 |
| `fleet_scale` | 48 | 57 k | 13.4 | 2.2 | 60 |
| **the live game, at the belt** | **51** | 118 k | 13.4 | 1.9 | 60 |
| **the live game, whole system in frame** | **77** | 141 k | 13.4 | 2.6 | 60 |

`showroom.missing()` is **0**. **61 entries**: scene 11, camera 6, fleet 10, fx 9, panel 8,
story 6, misc 11.

## The story-panel bug — and it was the shared container

At 390×844 the CTA row floated over the last lines of the case body and cut a line in half. Cause:
`.sheet-cta` is written inside each panel's markup, so it lived **inside `.sheet-body`** — the
scroll area — as `position: sticky; bottom: 0` with a gradient that is transparent at the top. Every
panel had it; the story panel just made it obvious.

Fixed in the container, not per panel. `panels.js`'s `draw()` now lifts every `.sheet-cta` out of
`.sheet-body` and appends it to `.sheet`, where it is a real flex footer, and `.sheet-cta` lost its
sticky positioning and gained a `border-top`. Two knock-ons, both handled:

- **`def.mount()` now receives the `.sheet`, not the `.sheet-body`.** It had to: `wire()` delegates
  clicks and the CTA's `data-a="send"` / `data-a="build"` buttons are outside the body now.
- `.sheet-body` gained `padding-bottom: 10px`.

`tools/uishot.mjs --all-panels` and `--all-stories` are clean at 390×844 **and** 844×390 — no sheet
under the top bar, no primary action off screen or under 40 px, no sideways scroll.

## Gotchas — session 10

66. **`Object.assign(target, { get x() {…} })` copies the getter's *value*, not the getter.**
    `window.__mono.reach` was permanently `null` because the assign ran before the scene existed.
    Assign the property after the thing is built, or use `defineProperty`.
67. **A tap raycast hits the starfield before it hits anything real.** The backdrop is repositioned
    to the camera every frame, so its 18 000 `THREE.Points` are all at distance ~0 and a tap
    returned 13 501 hits, every one of them a star. `camera.js` now sets
    `raycaster.params.Points.threshold = 0` and filters `isPoints` and `renderOrder < 0` out of the
    hit list. Symptom is "tap does nothing", which looks like a wiring bug and is not one.
68. **`material.visible = false` costs no draw call but still raycasts.** three gates the
    render-list push on it in `projectObject`. That is what makes an invisible tap proxy free, and
    it is the only sane way to make a sparse asteroid field tappable.
69. **`Object3D.lookAt` points +Z at the target for anything that is not a camera or a light.** §3
    says "forward is −Z, so `lookAt` aims a ship with no wrapper" — that is only true for cameras.
    `faceAt(obj, target)` in `fleet.js` aims the far side (`2·pos − target`).
70. **A `position: sticky` footer inside a scroll area is not a footer.** It reserves its space at
    the *end* of the content, so it floats over everything above it until you have scrolled all the
    way down. If the design wants a footer, it has to be a sibling of the scroll area.
71. **Formation spacing must use one unit for the whole set.** Scaling each slot by its own hull's
    length puts the escorts on top of each other and the fleet stops reading as a formation.
72. **A knob's own value is the right base for an animation.** The station breathe multiplies
    `quality.get('windowGlow')` every frame rather than a captured constant, so the knob keeps
    working and the animation still rides on top. Capturing the base at build time silently breaks
    the knob.

## What is short, and what v0.2 gets

- **No critic round on `fleet_line` or `fleet_scale`.** Both render and both pass the gate.
  `fleet_scale` is the stronger of the two — 480 m of truss running off three edges, a 62 m rig and
  a 38 m escort carrying the scale, engines doing the energy. **`fleet_line` is the weak one**: the
  ranks read as scattered hulls rather than as ranks, and the near hull does not run off the frame
  hard enough. Four framing passes went into it and it needs a fifth plus a critic round.
- **Beat 4's week-6 quarterly cannot happen** while `weeksPerQuarter` is 13. Either the plan means
  a mid-quarter statement (a new panel) or the beat table is wrong. Left alone deliberately — it is
  a design call, not a wiring one.
- **The exclusive needs a loan and nothing tells the player that.** The offer arrives, the tactic
  card says "needs 30,000 cr", and the credit line is two taps away in Holdings → Finance. A hint
  on the Tactics card ("draw on the line?") would close it.
- **No win/lose screen**, still. `hud.react` puts both on the ticker.
- **Save/load is still not wired.** `simview.load()` and `state.js`'s `serialise/deserialise` exist
  and nothing calls them.
- **The camera has still not been on Aaron's phone.** Component 8's acceptance test.
- **`reachScene()` in `js/showroom/entries.js` is now a duplicate** of a subset of `ReachScene`.
  The six `cam_*` entries still use it. Deleting it means pointing those at `ReachScene`, which is
  a v0.2 tidy.
- The rival's four hulls at Dray Yard are a **static merged fleet** — Corvain's ships never move.
  The sim does not simulate their freight either (`rival.incomePerShip`), so this is honest, but a
  v0.2 that gives Corvain real hulls should give them a `shipMover` of their own.
- **The bounce term is wrong on a merged fleet.** The hangar's coloured bounce is an object-space
  point transformed by `modelMatrix`, and after a merge that is the fleet's origin — so the lead
  hull gets the glow and the rest do not. Invisible at fleet distances, wrong up close. Fixing it
  needs a per-fleet material clone, which `ship.js` does not currently expose.
- The tick clock does not pause when the sheet is open, by design (`panels` is explicitly
  non-blocking). If playtesting says a story panel should hold the week, that is one line.

---

# Session 11 — the atmosphere pass (last art fix of v0.1)

A blind critic scored three scenes against their plates: `station_night` 4.25 / 8.35,
`belt_work` 4.61 / 8.35, `planet_limb` 4.25 / 7.30. Asked for the single change that would lift
the whole set it said: put dust and haze in every scene — all three render vacuum as literally
empty and all three lose Atmosphere, Scale and Energy for it. This session is that one system,
tuned per scene, plus the two bugs the same critic named (the planet_limb light rig aimed at the
camera's own side, and the mining beam that stops in mid air).

## The system — `js/world/atmos.js`

One module owns **the medium**. Three parts, one knob group (`Atmosphere`):

| Part | What it is |
|---|---|
| **Distance fog** | `FogExp2`, moved here out of `backdrop.js`. Knobs `fogDensity` / `fogTint` / `fogLevel` are unchanged in name and meaning, so every existing scenario still reads. |
| **`fogDesat`** *(new)* | The two palette hues are saturated teal and saturated orange and the lerp between them never passes through a neutral — but a belt plate's medium is a warm *grey*. This pulls the mix toward its own luminance. 0 by default, so nothing that does not ask for it changes. |
| **`dustField`** *(new, baked)* | A flat additive fill in the nebula bake (`uHaze` in `BAKE_FRAG`), unmodulated by cloud density or by the star. Registered in `backdrop.js` but grouped under `Atmosphere` because it is the medium, not the sky. **This is what makes 8500_01's background a warm grey instead of black, and fog cannot do it** — fog only tints geometry and most of that frame is empty. |
| **`atmosphere({ layers })`** | Additive dust cards. Each layer is `{ count, center, size, scale, aspect, color, power, variant }`; the whole set — every layer — is **one draw call**, one merged buffer, billboarded in the vertex shader (no per-frame quaternion, no sorting). Counts ride `fxDensity() × atmosDensity`. Live knobs `atmosSize`, `atmosPower`; the material also joins `cardBucket()` so the pre-existing `cardPower` knob drives it. |

The card texture is a 256² **R8** 2×2 atlas of four puffs (two round, one wisp, one broad bank),
built once and `track()`ed at 0.08 MB.

**Two things cost real time here, both worth writing down:**

1. **sRGB encoding lifts a low linear value a long way.** A puff whose alpha falls off as
   `(1-r)^1.6` renders as a *flat disc with a hard rim*. The atlas exponents are 2.8–6.0 on
   purpose. Same trap the beam sheath comment already warns about.
2. **The near-fade heuristic.** A card the camera is inside of fills the frame with one flat
   colour, so `vFade` ramps it out — but the first version faded from `size*0.5` to `size*2.4`
   and silently deleted 77 % of every big card in `station_night`. It is now `0.12 → 0.55`.

## Per-scene settings

**`belt_work`** — the closest to shipping and now the best of the three.
- `dustField 0.036`, `nebGain 0.85`, `nebAmbient 0.014`, `nebDesat 0.70` → the background is an
  even warm grey field measured against the plate's own histogram (ours 35–45, plate 30–50, both
  near-neutral). Before: 33,21,21 — a magenta cast.
- `fogDensity 0.00175 / fogTint 0.60 / fogDesat 0.85 / fogLevel 0.16` → far rocks lose ~60 % of
  their contrast into a warm grey that matches what is behind them.
- Three card layers (5 banks + 16 mid + 8 near), total power 0.10–0.18.
- Belt density 1.0 → **1.45** and twelve hand-placed rocks instead of five. The plate reads five
  depth planes because every one of them is *occupied*; an empty mid-field was the biggest single
  thing rounds 1–2 were missing.
- The rig was reframed to NDC ≈ (−0.55, −0.55) and given a rim key that actually reaches it
  (`rimDist 230 / rimNear 120 / rimFall 170` — at the old 90 m the rim was off for everything in
  the shot).

**`planet_limb`** — the light rig was aimed wrong, same class of bug as the hull two sessions ago.
- **Star moved behind the fleet**: `starAz −40 → −30`, `starEl 14 → −9`, which is roughly the
  bearing of the fleet's own centroid. Fill 1.1 → 0.55, ambient 0.006 → 0.046, env 0.20 → 0.46.
- **The rim was off for every hull in the shot.** `RIM.uKeyPos` is a *point* at `keyDir × rimDist`
  and the fleet sits 150–1400 m out; `rimDist 90 / rimNear 30 / rimFall 60` gave
  `att = e^−4.5 ≈ 0.01`. Now `rimDist 520 / rimNear 340 / rimFall 420 / rimPower 12 / rimWidth 3`.
  **If a scenario's subject is further out than ~150 m, its rim numbers have to be re-derived.**
- Grade pulled from four hues to two: `nebGain 0.15`, `nebDensity 0.45`, `nebDesat 0.76`,
  `nebBroad 9.5`, `nebHalo 0.07`, and `starChromaA/B 0.16 / 0.80` so the wide halo stays **pale**
  instead of orange. An orange wash at the hulls' own value is not a backlight.
- **Terminator banding fixed**: it was two things. A hash dither after `colorspace_fragment` in
  both planet shaders (the ramp crosses a screen at under 1/255 per pixel), and the **halo shell's
  48-segment silhouette** — that shell is the outermost edge in frame and its facets were the
  stair-steps. Body 96 → 144 segments, halo 48×24 → 144×72. +21k tris on a 350k budget.
- Planet pushed out to a corner arc (the plate gives it an eighth of the picture), fleet restaged
  across the frame with one hull large enough to survive a thumbnail.

**`station_night`** — the critic called this one asset-level, not lighting, and it still is.
Everything here is the cheap half of what it asked for; **the station kit was not remodelled.**
- **The bay row is no longer a constant rhythm.** `station()` now builds a `slots` list: ragged
  dock line (±10 m in z), height and depth scale (0.80–1.22 / 0.82–1.10), ±0.11 rad yaw, ±2.5 m
  in x, and **13 % of bays simply dropped**. Width never varies — the x pitch only has 6 m of
  slack over a 38 m bay.
- **`spec.swaps`** substitutes a different module into a bay slot (`{ 8: refinery ×0.8,
  15: refinery ×0.62 }` on Ledger, `{ 5: refinery ×0.72 }` on Dray Yard). A swapped module merges
  into the *fixed* buckets, so breaking the run costs **zero extra draw calls**. Its same-column
  neighbours stand down automatically.
- **`breakUp()`** — world-space roughness noise plus a normal-direction value tilt on every
  station material. The critic's "every face of every box is within ~6 % luminance of every other
  face" was literally true: nothing separated a deck from a wall from a soffit. Knobs
  `stationRough` (0.30) and `stationPlane` (0.45).
- A **second structure layer** (Dray Yard at ~1130 m) with three card layers between it and the
  near row — there was nothing behind the row to lose contrast against, which is what "haze
  between the near and far structure layers" actually needs.
- `bloomThreshold 0.52 / bloomStrength 0.92` — a night station is mostly emissive texels and the
  dock lights becoming glow is what reads as air.
- **The camera was reframed** to look *down* the row (`pos [10,132,214] look [420,−14,−34] fov 48`).
  The old shallow angle showed the bay *sides*, which are blank; the deck tops carry all the
  greeble and every dock light. This is the largest single improvement in the shot.

## The beams — `js/world/fx.js`

`beams()` gained `impact`, `ejecta`, `ejectaColor`. The core now falls off along its length
(`w*1.15 → w*0.72`, colour × 0.42) and the impact puts the energy back where the rock is: a
back-thrown dust cone, 12–20 ejecta streaks, and a four-flare hot bloom. The dust sheath widened
from `w*26` to `w*52`.

**Gotcha that cost time: an impact flare placed at the rock's *centre* is depth-tested away.**
Every beam endpoint in `belt_work` and `belt_fog` now targets the rock's **near face**
(centre − radius × the unit vector from the camera). Ejecta is also sprayed in the plane *across*
the beam, not on a sphere — the half of a sphere that points at the camera foreshortens to nothing
and the whole impact reads as one dot.

## `quality.resetDefaults()` and the showroom

Scenarios inherit whatever the previous one left behind. That was survivable while every knob a
scenario cared about was one it set; `fogDesat` / `fogLevel` / `dustField` made it a real hazard.
`Quality.resetDefaults()` restores every knob that has a schema default (preset-driven ones —
`renderScale`, `texCap`, `viewDist`, `nebDetail`, `stars`, `aniso` — have none and stay put), and
`defineScenario`'s showroom wrapper calls it before `setup`. **The showroom now shows exactly what
`tools/shot.mjs` renders in a fresh page.**

## Numbers — the gate is `--preset=medium --dpr=1 --w=844 --h=390`, headed

| | GPU p95 | CPU p95 | calls | tris | texMB |
|---|---|---|---|---|---|
| budget | < 11 | < 6 | < 150 | < 350k | < 60 |
| `belt_work` | 3.2–4.1 | 2.5 | 90 | 160k | 13.4 |
| `planet_limb` | 2.5 | 2.0 | 72 | 62k | 12.1 |
| `station_night` | 2.3–3.0 | 3.4 | 107 | 77k | 13.4 |
| live game | 2.5 | 2.8 | 75 | 168k | 13.4 |

**Cost of the atmosphere system: one draw call and ~180 triangles per scene, plus 0.08 MB for the
puff atlas.** Fill rate is the real cost and it is not measurable above run-to-run noise at the
mobile profile — but it is exactly the risk this project has been managing, so `atmosDensity`
(build-time count) and `atmosPower` / `atmosSize` (live) are there, and `fxDensity` still scales
the counts with everything else. `station_night` went 63 → 107 calls, and **only one of those 44
is the dust**: the rest is the far station (~14) and four extra hulls.

All eleven scenarios still render, and `nebula_back` / `hero_hull` / `hull_close` / `belt_fog` /
`station_haze` / `star_flare` / `fleet_line` / `fleet_scale` were checked frame-by-frame against
their previous renders. `belt_fog` and `star_flare` changed slightly and both improved (impact
flares; a clean terminator).

## Honest scores, judged at sheet scale

- **`belt_work` ~6.5–7** (was 4.61). Reads as a sibling of the plate now: warm grey medium, five
  occupied depth planes, a beam with scatter and a hot impact, a hull running off the left edge
  with an engine plume. Short of the plate on rock shape variety and on the width of the muzzle fan.
- **`planet_limb` ~6** (was 4.25). The backlight is unambiguous, the hulls cut out against the
  halo, the terminator is clean. Still louder than the plate and the hulls read closer to
  silhouettes than to surfaces — the plate's hulls are mid-value with detail.
- **`station_night` ~5.5** (was 4.25). The rhythm is broken, there are two structure layers with
  haze between them, and the down-the-row framing shows the detail. Still the weakest of the
  three, and still for the reason the critic gave: **the kit needs more module types.** That is
  the v0.2 note.

## What is short — v0.2

- **The station kit needs two or three more module shapes.** Substituting a refinery twice is a
  workaround; the plate's strength is that no two bays are the same object. This is modelling work
  and it was explicitly out of scope this session.
- `station_night`'s right half is still mostly empty sky against a plate that fills every pixel.
- The dust cards are **unlit** — one flat colour per card. A card near a bright emissive should
  pick it up. A per-card "nearest light" tint would be cheap and would sell the station shot.
- `planet_limb`'s hulls could take another 10 % of value without losing the silhouette; worth one
  A/B with a critic rather than another guess.
- `belt_work`'s beams still have no *muzzle* fan as wide as the plate's — the scatter cone widens
  toward the impact, the plate's widens from the emitter.

---

# Session 12 — sim/balance pass: the shady half, and a game you can lose

**Scope: `content/balance.js`, `content/tactics.js`, `sim.mjs` only.** Nothing under `js/sim/`,
`js/world/`, `js/ui/` or `js/engine/` was touched — **no sim code changed at all**, this is
entirely numbers plus a wider stand-in-player set in the harness. Session 8 left two things on the
"what is short" list; this pass closes both.

## What was wrong

1. **The shady half was unreachable.** Grey and illegal tactics gated on 20–28% share *and*
   55–90k cash. Share arrives around week 12; that much cash never does inside a session. So a
   v0.1 player never saw a grey tactic, never accrued a point of heat, never got investigated and
   never reached the Phoebus story the whole commodity chain was designed around. 0 investigations
   in 500 games.
2. **You could not lose.** Bust 0% under every style, including one drawing the full 80k line and
   buying three hulls. `bustRateMax: 0.10` is a *maximum*, so it passed.

## `node sim.mjs 500` — after

```
offer week histogram (exclusive_supply):
  9:300  10:98  11:75  12:22  13:1  16:1  late:3
  in window 9-13: 496/500 = 99.2%
  coil line built in 500/500 (median week 5), deal taken 288/500

player share at week 13:
  p10 11.6%  p25 21.8%  median 23.0%  p75 25.5%  p90 27.8%   in band 12-25%: 289/500

cash:  week 13  p10 9,901  median 11,899  p90 25,646
       week 30  p10 -22,090  median 13,040  p90 43,486

by style:                bust     offer-in-window   median share w13
  cautious    n 100       0.0%        96.0%             11.6%
  standard    n 100       0.0%       100.0%             24.7%
  aggressive  n 100      11.0%       100.0%             22.5%
  greedy      n 100      32.0%       100.0%             22.7%
  reckless    n 100      11.0%       100.0%             27.5%

the shady half:
  grey unlocked    500/500 = 100.0%  (median week 13, by w13 74.0%, by w16 99.2%)
  grey taken       200/500 = 40.0%          <- every grey-capable style takes one
  illegal unlocked 296/500 = 59.2%  (median week 18)
  illegal taken    100/500 = 20.0%, caught 54 = 54.0% of takers, banned 54
  peak heat        p50 39  p90 80  (threshold 34)
  cash the week the fine lands, pre-fine — grey    p10 7,846  p50 10,382  p90 13,068
                                          illegal p10 13,524  p50 22,614  p90 31,450

outcomes: {"running":431,"bust":54,"duopoly":15}   investigations 231
          busts within 2 weeks of a fine: 54  (i.e. every bust is a fine)

PASS  offer in weeks 9-13: 99.2%              (target 80.0%)
PASS  bust rate: 10.8%                        (target 5.0%-18.0%)
PASS  median share at week 13: 23.0%          (target 12.0%-25.0%)
PASS  grey tactic reachable: 100.0%           (target 85.0%)
PASS  grey reachable by week 16: 99.2%        (target 60.0%)
PASS  illegal tactic taken: 20.0%             (target 15.0%)
PASS  caught, of runs that went illegal: 54.0% (target 35.0%-90.0%)
```

`--selftest` still clean, all ten assertions including the no-mutation contract. Two 500-game runs
diff clean; the sim is still fully deterministic from the seed.

## Does the story actually happen? Read tick by tick, seed 1008

**Cautious** — never touches grey, never goes negative. Offer w11, unlock w12, takes the deal w18
(4% → 23.6% → peaks 30.0% w21), ends w30 on 16.9% share and 29,415 cash. Safe, as briefed.

**Greedy** (legal + illegal, skips the price war) — trough of −5,342 at w6 that reads as real
danger. Takes the Ryland deal w21. `spec_collusion` unlocks w20, taken **w24**. The cartel visibly
pays: share 32.2% → 38.0% and cash 6,139 → 22,396 in three weeks while the heat bar climbs
13/week from 13 to 52. **w28 the investigation lands**: 46,000 fine, 14% of share gone, standing
halved, tactic permanently banned, cash −19,909 — 2,091 credits off folding. It limps to w30 on
32.8% share and no money. That is the arc the brief asked for, and it is legible in the log.

**Aggressive** (legal + grey) takes `below_cost` w14 — share jumps 22.6% → 27.3% while cash goes
flat, which is exactly what predatory pricing should feel like — heat grinds 5 → 45 over nine
weeks, caught w23, −19,241, survives crippled. **Reckless** on the same seed is caught at w23 on
−21,635, inside 400 credits of the limit.

So: greedy gets tempted, takes the risk, and gets caught in 54% of the runs that go illegal — and
32% of greedy runs end in bust. Cautious survives 100%.

## Every number moved

### `content/balance.js`

| Key | Was | Now | Why |
|---|---|---|---|
| `loan.interestWeekly` | 0.006 | **0.012** | the session-8 bust lever, doubled. It does not bust anyone on its own — what it does is decide how thin your cash is when a fine lands, and that is what decides the bust. At 0.006 the same fines killed nobody. |
| `loan.debtLimit` | 40000 | **22000** | 40k of overdraft on top of an 80k credit line meant nothing could reach it. This is now the single most sensitive number in the file — see gotcha 58. |
| `market.noise` | 0.03 | **0.05** | weekly price movement the player can see. Tried 0.07; it widened the week-13 share spread enough to cost 8 points of offer-in-window on the cautious style. 0.05 was better on every metric. |
| `heat.threshold` | 60 | **34** | 60 was 13 weeks of grey play before the first roll, in a game that is over at 30. At 34, `below_cost` (6/wk net 5) crosses in 7 weeks and `spec_collusion` (14/wk net 13) in 3. The 2:1 intent from session 7 is preserved. |
| `heat.decayWeekly` | 1.4 | **1.0** | same reason; also makes the bar's cooldown legible next to the 6/wk and 14/wk accruals. |
| `heat.investigateBase` | 0.06 | **0.07** | briefly ran 0.10 with `investigatePerPoint` 0.006 — it caught 81% of colluders, which made the illegal band a formality rather than a gamble. 0.07 lands at 54%. |
| `heat.investigatePerPoint` | 0.004 | 0.004 | unchanged, after the experiment above |
| `share.reachTotal` | 26500 | **27600** | the master share knob. The cheaper Ryland deal (below) pushed the week-13 median to 24.1%, within 0.9pp of failing its own assertion. This backed it off to 23.0% without touching the economy underneath. |
| `targets.bustRateMax: 0.10` | — | **removed** | replaced by `targets.bustRate: { min: 0.05, max: 0.18 }`. **A ceiling cannot catch the failure we actually had** — 0% bust passed it for a whole version. The band asserts the game is losable *and* not punishing; the design target was 8–15% and we land at 10.8%. |
| `targets.greyReachable` | — | **0.85** | new |
| `targets.greyReachableByWeek16` | — | **0.60** | new |
| `targets.illegalTaken` | — | **0.15** | new |
| `targets.caughtWhenIllegal` | — | **{ min: 0.35, max: 0.90 }** | new — a band, because 100% caught is as broken as 0% caught |

### `content/tactics.js`

| Tactic | Key | Was | Now | Why |
|---|---|---|---|---|
| `exclusive_supply` | `unlock.cash` | 30000 | **22000** | at double interest, 30k arrives ~8 weeks later than it used to; the flagship legal beat was slipping to w20 |
| `exclusive_supply` | `cost` | 26000 | **22000** | same — deal taken went 234/500 → 288/500 |
| `brand_buyout` | `unlock` | share .22 / cash 90000 | **share .22 / cash 30000** | 90k is unreachable in a session; it unlocked in 33/500 runs at median w27 |
| `brand_buyout` | `cost` | 78000 | **26000** | now unlocks 200/500 at median w21, i.e. it is a real choice on the panel |
| `brand_buyout` | `penalty.fine` | 52000 | **30000** | scaled to the cash a player actually has when caught |
| `below_cost` | `unlock` | share .20 / cash 55000 | **share .14 / cash 10000** | the main fix. Grey now unlocks in 100% of runs, 74% of them by week 13 |
| `below_cost` | `penalty.fine` | 40000 | **30000** | sits just under the cash-at-catch cluster (p10 7,846) so the price war rarely kills — it bleeds |
| `below_cost` | effect | — | **+ `demandPull{'*', 0.24}`** | **it was a strictly bad tactic.** `ownPrice ×0.72` cut revenue, which cut share, so it lost you money *and* market — nobody would ever take it. Selling cheap has to move volume. Now share climbs while cash goes flat, which is the actual lesson of predatory pricing. Uses an existing op; no code change. |
| `spec_collusion` | `unlock` | share .28 / cash 60000 | **share .20 / cash 22000** | reachable ~w18–24 for a player who pushes |
| `spec_collusion` | `penalty.fine` | 120000 | **46000** | 120k was an instant, unavoidable death sentence — not a gamble. 46k against a p50 cash-at-catch of 22,614 kills roughly half the companies that are caught and cripples the rest. Share loss, rep loss and the permanent ban are unchanged. |

### `sim.mjs` (the harness, not the sim)

- **Five stand-in styles, not four.** Added `greedy` — legal + illegal, *skipping* grey. With four
  styles the illegal branch was structurally unreachable: the policy takes the first affordable
  unlocked tactic, and `below_cost` is free and unlocks 5 weeks earlier, so a grey-capable style
  never saved for the cartel. `greedy` is the player who thinks a price war is a mug's game.
- `style.grey: bool` → `style.bands: ['legal'|'grey'|'illegal']`. Explicit; the old flag silently
  allowed illegal too.
- New per-run tracking: grey/illegal unlock and take weeks, peak heat, catch band, cash the week
  the fine lands, and whether a bust followed a fine within two weeks.
- New report block ("the shady half") and four new assertions, all reading `balance.targets`.

**No UI reads `balance.targets`** (checked) — only `sim.mjs` did, so renaming `bustRateMax`
breaks nothing. `js/ui/screens.js` reads `loan.debtLimit`, `loan.interestWeekly`,
`heat.threshold`, `heat.decayWeekly` and `tactic.penalty.*` and picks up all the new values for
free. One consequence worth knowing: **the heat strip in the tactics screen now actually moves in
normal play** — before this pass it was permanently at zero.

## Two design calls a reviewer should know about

**Every bust in the 500 is a fine.** 54 busts, 54 of them within two weeks of an investigation.
Nothing else in the economy can reach the debt limit. That is deliberate: an overextension bust
at week 6 would be deterministic per style (the min-cash spread across seeds is only a few hundred
credits — see gotcha 59) and would fire before the player has made a single interesting decision.
Losing because a regulator caught you is a *story*; losing to compound interest in week 6 is a
tutorial failure. Interest is still the lever that makes it possible — it is what leaves you with
~11k when a 30k fine lands instead of ~30k.

**`brand_buyout` and `vertical_integration` are unlocked but never taken by the harness.**
`brand_buyout` now unlocks in 200/500 runs, but the policy always finds `below_cost` first because
it is free and earlier in content order. `vertical_integration` needs a refinery, which only the
sprawl style builds. Both are reachable for a human; neither is exercised by a stand-in. Not worth
contorting the harness policy over — but do not read "taken 0" as "dead content".

## Gotchas — session 12

58. **`loan.debtLimit` is a cliff, not a slope.** The cash a player holds the week a fine lands is
    *tightly* clustered (grey: p10 7,846 / p50 10,382 / p90 13,068 — a 5k spread across 500 games).
    Bust fires iff `cash < fine − debtLimit`, so moving `debtLimit` by 2,000 moved the bust rate
    from 5% to 33% in testing. Move it 1,000 at a time and re-run 500. **Keep the grey fines below
    that cluster and the illegal fine above its middle** — that is what makes the rate come from
    the illegal branch, where the cash spread is wide (13.5k–31k) and the response is smooth.
59. **Seeds barely diverge.** Min-cash across 300 seeds of the same style varies by under 300
    credits. The RNG only touches rich veins and price noise; everything else is the policy. Any
    balance number you tune will therefore behave like a step function per style, not a
    distribution — the distribution comes from having five styles, not from the seed.
60. **A tactic whose only effect is a cost is a tactic nobody takes.** `below_cost` cut its own
    share by cutting its own revenue, because share is measured in delivered credits (gotcha 53).
    Any future "sacrifice margin for position" tactic needs a `demandPull` or a `sharePull` to
    represent the position it buys, or the share model turns the sacrifice into a double loss.
61. **A `Max` target cannot catch a floor failure.** `bustRateMax: 0.10` passed happily at 0% for
    an entire version. Where a metric is broken at *both* ends, assert the band.
62. **`sim.mjs`'s tactic loop takes the first affordable unlocked tactic in content order.** Making
    a grey tactic cheap and early therefore hides everything after it in the array from every style
    that can take it. If you add a tactic and its take count is 0, check the order before you
    change its numbers.

## What is still short

- **Cautious ends on 11.6% median share at week 13**, just under the 12% band floor. The pooled
  median (23.0%) is what is asserted and it passes, but the most careful play style is the one
  closest to feeling flat. `share.reachTotal` moves everyone together, so this needs a per-style
  answer (a cheaper early module, or the coil line one tick sooner) rather than another knob.
- **The offer slipped from 100% to 99.2% in window** — 4 runs land at w16 or later, all cautious.
  Caused by the extra price noise. Well inside the 80% target; noted so it is not a surprise.
- **Nothing in the economy itself can bust you** (see the design call above). If v0.2 wants an
  overextension death it needs an actual shock — a lost hull, a cancelled contract, a demand
  collapse — not a bigger interest number.
- **Heat only accrues from active tactics.** A dominant player running nothing but legal tactics
  attracts no regulator attention at all. That is what session 7's content says should happen, and
  it is left alone — but it does mean the heat bar is invisible until the first grey tactic.
# Session 12a — `station_night` and `hero_hull` (parallel worktree A)

Two shots only. Files touched: `js/world/kit/station.js`, `js/world/kit/ship.js`, and the
`station_night` / `hero_hull` scenario blocks in `js/world/scene.js`. Nothing else.

## `station_night` — 4.25 → self-score **6.0**

The critic's note was asset-level and this session is the modelling it asked for.

### The row is no longer one module repeated

**Instancing is gone.** `bakedModule(id, palette, seed)` merges a module to one geometry per
bucket and caches it; every slot in the dock row `clone()`s those buffers and applies its matrix
into the station's own `fixed` buckets. A station is now **7 draw calls instead of 14**, and the
row can use as many module types as it likes for nothing. Three baked seeds per id
(`seed + (i % 3) * 101`) so neighbours do not share a greeble layout. Cost is one memcpy per slot
per bucket; build time did not move measurably.

`spec.row` is a cycle of module ids consumed per slot (Ledger's is 11 long over 24 slots, so
neither column repeats a rhythm). `spec.swaps` still works and still stands its neighbours down.

### Four new modules, all bay-footprint, all on the dock-face convention

| id | what it is |
|---|---|
| `radiator` | two flat wings angled off a boom, each combed with 15 ribs at a pitch four times finer than the bay ribs. The only non-boxy silhouette in the row. |
| `gantry` | rail clutter — a deck with running rails, a travelling crane on two legs, and 16 containers at three sizes drawn from four tint buckets. |
| `tankage` | three horizontal tanks in cradles with band ribs, a catwalk and a handrail at fixed pitch. |
| `mast` | a 108 m lattice tower with three dishes. The vertical break in a row that is otherwise all horizontal. |

Plus **nav points** (`navPoints` / `navRun`): 1–1.8 m cubes in the `glow` bucket carrying their
hue in the vertex colour, red/amber/cyan, on every module and along the truss. They are below a
pixel at sheet scale — the bloom is what turns each into a coloured dot, which is exactly what
the plate's fourth density band is.

### Four other model changes

- **The spine deck.** `truss()` now carries a 34 m plated deck with pale strakes, cross ribs,
  scattered greeble and two runs of dock lights. A bare lattice between two bay columns reads as
  a rack of separate objects; this is what makes the row one mass, and it is the single biggest
  change in the shot.
- **The `spine` module has a chamfered section** — belly, lower chine, flank, upper chine, pale
  deck: five faces at five angles. An accent-coloured extruded box has one normal per side, so
  however hard you key it the whole flank comes back at one value and reads as a painted wall.
  It also moved onto the deck at the far end (`x 326`), where 8500_06 puts its hero.
- **A third of the dock mouths are shut.** One identical lit rectangle on every bay was the
  loudest repeat on the station. Open mouths got gate bars across them and a dimmer, tighter
  falloff; closed ones are a ribbed door with one red light.
- **The hub's drum ends** got cap ribs, a boss and rim blocks. End-on it was a smooth grey circle
  and read as a moon.

### Cladding

`breakUp()` gained `uSPanel` and `uSDirt` (knobs `stationPanel` 0.42, `stationDirt` 0.55).
Hard-edged **world-space blocks at 6.5 / 21 / 61 m** drive albedo and roughness, plus a very
low-frequency soot term and a downface darkening. Because the blocks are world-space, two
identical modules at different x get different cladding for free.

`TINT` was re-spread: `hull` 1.00 → **1.42**, `panel` 0.62 → **0.40**, `dark` 0.30 → **0.11**.
Every bucket used to sit inside one stop of every other, which is what "flat tan" was.

### Scenario

Reframed to a three-quarter broadside (`pos [110,128,268] look [356,-24,-26] fov 42`) with the
near bays cropped by the left edge. **Four structure layers** — Ledger at 0 m, a Dray Yard at
~900 m, another at ~1200 m, a fourth at ~2700 m that the fog reduces to a pale ghost. Twelve
hulls instead of eight. Grade: `keyPower` 13 → 17 (the pale decks now clip toward white while
`dark` stays near black), `fillPower` 1.5 → 2.6, `envPower` 0.22 → 0.15, `exposure` 0.88,
`nebGain` 0.30 so the background keeps its blacks.

**Four `PointLight`s at the dock line** (`distance` 130–190, `decay` 2). The critic's sharpest
line was that the emissive strips light nothing at all; these are the falloff on the cladding
beside a lit mouth. They cost no draw call and live in the scenario's group, so they leave with it.

## `hero_hull` — self-score **6.0** (last blind score 3.0, last self-score 5.5)

The last session's own open note was "structure inside the shadow — the 0.07-albedo metal gives
the fill nothing to land on". That is now fixed properly.

**`shadowFill` (knob, group `Hulls`, default 0).** An *additive* term in the ship shader, gated by
`smoothstep(0.34, -0.52, N·keyDir)` so it only exists where the key does not reach, shaped by
`N·fillDir`, and multiplied by a read of the **plate map** — so what it lands on is the plating,
not the albedo. A multiplied fill on 0.07 albedo returns nothing, which is why every previous
attempt flattened instead of revealing. The tint is `sys.fill` lerped 45 % toward grey; at full
saturation a 0.07-albedo metal reads as painted plastic.

Scenario: `shadowFill 0.26`, `keyPower` 58 → 41 (the bow deck was clipping to a hard-edged white
sticker), `fillPower` 4.5 → 5.6, `fogDensity` 0.0022 → 0.0030 with `fogDesat 0.30` so the mid
distance actually grades. Added a **500 m Dray Yard at ~820 m** — nine tenths of it lost to fog,
which is the known-huge the 84 m hauler needed — plus three card layers of warm dust and two more
escorts in the near field.

## Numbers — gate is `--preset=medium --dpr=1 --w=844 --h=390`

| | budget | station_night | hero_hull |
|---|---|---|---|
| draw calls | < 150 | **125** | **94** |
| triangles | < 350 k | **136 k** | **54 k** |
| texture memory | < 60 MB | **13.4** | **13.4** |
| CPU p95 | < 6 ms | 2.1–2.7 | 1.8–2.5 |
| fps | 60 | 58–62 | 56–60 |

At 1280×720 `--preset=high`: station_night 115 / 134 k, hero_hull 94 / 54 k. All eleven scenarios
were re-rendered on this build; `station_haze` gains the new modules and the spine deck and looks
better for it, `hull_close` is unchanged (`shadowFill` defaults to 0 and `resetDefaults` restores
it), and nothing else moved.

## Gotchas — session 12a

38. **Instancing was costing draw calls here, not saving them.** Seven fixed meshes plus seven
    `InstancedMesh`es is fourteen calls for a station whose bays could simply have been merged
    into the fixed buckets — an instanced row only pays off if the bays are also the *only* thing
    in the station. Baking each module once and cloning the merged buffer per slot is 7 calls,
    unlimited module vocabulary, and the same triangle count (three counts an instanced draw as
    `count × instances` anyway).
39. **A shadow fill has to be additive and driven by the texture, not the albedo.** `0.07 × fill`
    is 0.07 × nothing. Multiplying the *plate map read* instead puts panel structure into a dark
    half at any fill level. Keep the map term soft, though — `0.30 + 1.10·t²` made the hull read
    as a checkerboard at sheet scale; `0.62 + 0.62·t` is right.
40. **A dish or a drum end face-on to the key reads as a golf ball or a moon.** Both were `panel`
    bucket and both had a perfectly circular silhouette. Move them to `dark` and put something
    proud of the rim.
41. **A bright near-foreground module is worse than none.** The "near dark layer" trick needs the
    module's unlit side toward the camera, and there is no shadow rig to guarantee that — the
    1.8×-scaled gantry at 90 m came back as the brightest object in the frame. Cropping the near
    bays with the frame edge does the same job for free.
42. **`tools/compare.mjs`'s `REFS` path is four levels up from the project root**, which resolves
    outside a `.claude/worktrees/<id>/` checkout. Symlink
    `.claude/worktrees/gms/3d/aaa_refs → ~/cc/yru/gms/3d/aaa_refs` rather than editing the tool.

## What is still short on these two

- **`station_night`'s subject still does not dominate the frame the way the plate's barge does.**
  Ours is ~45 % of the image against the plate's ~70 %, and closing that means either a longer
  row or a much tighter lens, and the tighter lens costs the depth layers that were just added.
- The bay decks read as a tiled floor at sheet scale. The plate's containers have individual
  silhouette variation — different heights, some open, some tarped; ours vary only in tint.
- `hero_hull` is still a lofted polygon with chines against a plate with compound curvature, and
  it is still darker and more contrasty than the plate's high-key haze. That is the component-3
  limit, not a lighting one.
- The four dock lamps are hand-placed. A station should return its lit dock points in `userData`,
  the way it should already return dock anchors.
# Story content pass — fact re-verification + story plate images (2026-08-04)

Scope was `content/stories.js` and the new `assets/story/` folder only. Nothing under `js/`,
`tools/`, `ui.css` or `style.css` was touched.

## Job 1 — the six stories were re-verified against sources

The stories were **not** already accurate. One was materially stale, two had wrong facts, and one
gave a one-sided account of a live dispute. Every correction below is sourced from a link now in
that story's `links` array.

### `meta_instagram` — stale, now corrected (this was the important one)

The text stopped at "The FTC said in January 2026 that it would appeal", which was true when
written and is no longer the current state. Verified and updated:

- Notice of appeal **filed 20 January 2026**, D.C. Circuit, docket **No. 26-5028**.
- FTC filed its **opening brief on 22 May 2026**, arguing Boasberg measured monopoly power at the
  wrong moment — at trial rather than when the suit was filed in 2020.
- Meta's answering brief is due **20 August 2026**; reply 29 September 2026. **No oral argument has
  been scheduled and the appeal is undecided.** The `outcome` line now says so explicitly.
- Confirmed correct and left alone: Boasberg, 18 November 2025, **six-week bench trial**, FTC suit
  filed December 2020, the PSN market as Facebook / Instagram / Snapchat / MeWe, TikTok and YouTube
  as the substitutes that broke the market definition.
- Softened "Both deals were cleared by regulators" to "reviewed and allowed to proceed" — the FTC
  closed its Instagram investigation rather than issuing a clearance.
- Links replaced with the FTC's own press release and the CourtListener appellate docket.

### `bunnings_guarantee` — was one-sided on a live dispute

- Episode identified: Four Corners **"Hammered", broadcast 12 May 2025**. Added.
- The **9,000 figure is Bunnings' own**, given in its media statement ("around 9,000 products
  associated with Bunnings-owned brands", "more than 40 Bunnings-owned brands"). The story
  previously attributed it to Four Corners. Corrected.
- **The material fix.** The story asserted flatly that the guarantee "could not be triggered" on
  those lines. Bunnings' media statement rejects exactly that: asked whether owned brands are used
  to sidestep the promise it answered **"absolutely not"**, said the lowest prices policy applies
  **"across like-for-like products"** rather than only identical ones, and cited its Ozito range
  being cut to match comparable Black & Decker products. Both sides are now in the text.
- The genuinely checkable tension is now stated instead of a conclusion: **Bunnings' published
  price policy still reads "the same in-stock item"**, while its statement describes a like-for-like
  practice. That gap is the contested part and the text says so.
- No ACCC finding against the guarantee exists — checked, that claim stands.
- Links: swapped the RNZ syndication for **Bunnings' own media statement (primary)** plus the price
  policy page, keeping RNZ as the report-of-record for the programme. ABC's own domain blocks the
  fetcher, hence RNZ rather than abc.net.au.

### `bunnings_ryobi` — was accurate; sharpened and extended

- 22 May 2008 assessment not opposing, Graeme Samuel's reasoning, "no single power tool brand
  dominated" — all confirmed against the ACCC media release.
- The Bosch objection was asserted without a source; **verified** — Robert Bosch (Australia) Pty Ltd
  filed a submission arguing the public benefit did not outweigh the competition impact.
- Corrected the legal test: revoking an exclusive dealing notification needs the ACCC satisfied of
  SLC **and** that public benefit does not outweigh the harm. The story had only the first limb.
- Added that the arrangement **still holds** — Bunnings confirmed to Four Corners in 2025 that Ryobi
  is sold exclusively through Bunnings. Reflected in `outcome`.
- Added the Techtronic notification N93330 alongside Bunnings' N93331.

### `ford_rouge` — small factual tightening

- 2,000-acre site confirmed (Ford bought 2,000 acres on the Rouge in 1915). Kept.
- Supply-chain holdings verified via Britannica: ~16 coal mines (Kentucky, West Virginia **and
  Pennsylvania** — Pennsylvania was missing), ~700,000 acres of timberland, iron mines and limestone
  quarries in northern Michigan, Minnesota **and Wisconsin**, Great Lakes freighters, a railroad.
- **Fordlandia corrected.** It was a **concession over roughly 2.5 million acres**, not a purchase
  of "a tract". Sold back to Brazil in 1945 at a loss of **more than US$20 million**.
- "a British cartel controlled the latex price" softened to "a British-backed scheme was restricting
  output and holding up the latex price" — accurate to the restriction scheme without overclaiming.
- "none of it was challenged" narrowed to "never the subject of an antitrust challenge", since Ford
  faced unrelated antitrust matters in later decades.

### `boral_predatory` — was accurate; detail added

- High Court 7 February 2003, **6–1 with Kirby J dissenting**, in Boral's favour — confirmed.
  Trial: **Heerey J, 1999**, dismissed. Full Federal Court reversed unanimously **2001**. Below-cost
  period **April 1994 – October 1996**. C&M Brick. Section 46 TPA. Brooke Group 1993. All correct.
- Named the 2007 provision properly: **s 46(1AA), the "Birdsville amendment"**, and added that it
  **never produced a single case** before being repealed in 2017 on the Harper Review's
  recommendation. The story previously implied it simply lapsed.

### `phoebus_cartel` — two real errors fixed

- **Wrong: "through its Paris subsidiary International General Electric".** GE was not a direct
  member and IGE was not a Paris subsidiary. Corrected to: GE took part through **International
  General Electric and the GE Overseas Group**, an arrangement usually read as keeping the American
  parent at arm's length from US antitrust law. The causal claim is now attributed, not asserted.
- **Wrong: "average bulb life fell to roughly 1,000 hours within a decade".** Krajewski's figures
  are **about 1,800 hours in 1926 down to about 1,205 hours by the 1933–34 financial year**. The
  story overstated the effect. Corrected to the actual numbers.
- Members: added **Tokyo Electric (Japan)** and **ELIN (Austria)**, which were missing. `who` field
  updated.
- End date: the cartel was meant to run to **1955**, stopped working as the war broke it up and was
  **nullified in 1940**. `year` changed **1924–1939 → 1924–1940**.
- Attributed the efficiency counter-argument properly: **Britain's Monopolies and Restrictive
  Practices Commission, 1951**, called 1,000 hours a reasonable compromise. Previously vague
  ("British regulators later said as much").
- Confirmed and kept: 23 December 1924 Geneva meeting, 15 January 1925 incorporation as Phoebus
  S.A., the 1,000-hour standard against prior lives of 1,500–2,500 hours, Swiss-franc fines on a
  published scale after central laboratory testing, and the **1949 US District Court (New Jersey)**
  finding that GE violated the Sherman Act in the lamp business.

## Job 2 — six story plate illustrations

All six generated locally on mflux-queue `:7867`, `flux2-klein-9b-mlx-4bit`, 10 steps,
**1024×432** to match the plate's 2.4:1 box. LTX `:7866` was checked idle before each submit (the
script polls `worker_warm` and waits). Converted to JPG with `sips` at quality 80 — **26–58 KB
each**, well inside the ~120 KB budget. `credit: 'illustration'` on all six; no PD photography used.

Generator script (throwaway, not committed): `scratchpad/gen_story_images.py`. Every prompt appends
a shared style tail:

> flat vector editorial illustration, wide banner composition, clean geometric linework, plain dark
> background, generous negative space, no lettering, no words, no numbers, no logos, no signage, no
> watermark, no people, not a photograph

Prompts as used (subject clause only; the style tail is appended to each):

- **`bunnings_ryobi`** — "Left of frame, a long steel retail shelf carrying one plain rectangular
  toolbox, and a heavy padlock hanging from the shelf rail directly above it. Right of frame, a
  closed corrugated roller shutter fully down to the floor, with three identical plain toolboxes
  stacked outside it on the ground, shut out. Deep hardware green toolboxes, warm grey steel,
  near-black background."
- **`ford_rouge`** — "Isometric blueprint diagram of an industrial supply chain drawn as one
  connected vertical column: a mine shaft at the top, then a bulk ore ship, then a blast furnace,
  then a long assembly hall at the bottom, one bold arrow running straight down through all four
  stages. Muted ochre and slate blue technical linework on a dark ground."
- **`bunnings_guarantee`** — "A large swing price tag stamped with a bold percent symbol, its string
  tied to a long empty shelf holding exactly one plain product box. Beside it a second empty
  comparison column with a magnifying glass hovering over nothing. Hardware green and warm grey on
  near-black."
- **`meta_instagram`** — "Abstract outline diagram, off-centre to the left, on a plain dark ground:
  one large hollow square drawn in thin blue outline, and a smaller hollow square drawn in dotted
  violet outline being pulled sideways through a gap in the large square's edge, half in and half
  out. A long thin arrow runs in from the right edge of the frame pointing at the smaller square.
  Two hues only, cool blue and violet, thin uniform line weight, unfilled shapes, wireframe
  schematic. Absolutely not an app icon, not a rounded-square tile, not glossy, no gradient tile,
  no logo."
- **`boral_predatory`** — "A wide technical line chart filling the entire frame edge to edge, faint
  grid across the whole width. A long horizontal dashed grey line spans the full width as a cost
  threshold. A bold red line starts at the left edge above the dashed line, dives steeply beneath it
  near the left and runs flat and low far below it all the way across to the right edge, then climbs
  sharply at the far right. A thinner slate blue line starts above the dashed line, dips, and stops
  abruptly a third of the way across, ending in a small hollow circle marker. Deep red, slate blue,
  near black. Precise thin technical linework."
- **`phoebus_cartel`** — "A single incandescent light bulb drawn in blueprint linework, a large
  circular hour dial ringing the glass envelope with tick marks, its needle stopped hard at one
  marked division. Warm amber glowing filament against deep blue-black."

### Three were rejected on the first pass and re-prompted

- **`meta_instagram` — rejected as a rule violation.** The first prompt produced a centred, glossy,
  blue-to-violet **rounded-square gradient tile**: unmistakably an app icon, which amendment B
  forbids. Re-prompted for an off-centre unfilled wireframe with explicit negatives ("not an app
  icon, not a rounded-square tile, not glossy"). The replacement reads as a diagram.
- **`boral_predatory` — rejected as incoherent.** The grid covered only the left half, the two lines
  did not read as two lines, and nothing dived below the cost line and held. Re-prompted with
  explicit edge-to-edge framing and a per-line description. The replacement now also shows the price
  climbing at the far right, which happens to illustrate the recoupment point the story turns on.
- **`bunnings_ryobi` — rejected as weak.** The shelf bracket held nothing and the excluded cases read
  as wheelie bins. Re-prompted to put the toolbox on the shelf and stack the excluded ones at a
  fully closed shutter.

`ford_rouge`, `bunnings_guarantee` and `phoebus_cartel` passed first time. All six were opened and
looked at, not merely generated. None contains text, a logo, a real person, a real storefront or
anything photo-realistic.

### Verified in the panel

`node -e "import('./content/stories.js')..."` lists all six with a path and `illustration`.
`tools/uishot.mjs --sr=story_phoebus_cartel` and `--sr=story_bunnings_ryobi` at 390×844 were both
opened: the image fills the plate at the right ratio, the crop is negligible (source 2.37:1 into a
2.4:1 box under `object-fit: cover`), and the `ILLUSTRATION` credit line renders beneath it. No
console errors.

## Notes for whoever comes next

- **A PD upgrade is genuinely available for `phoebus_cartel`**, and only that one. 1920s–30s
  incandescent lamp advertising and lamp-factory photography are out of copyright in most
  jurisdictions and sit on Wikimedia Commons. Its `imagePrompt` carries that note. If it is taken,
  `credit` must become `PD: <archive>, <item>`. `ford_rouge` has period Library of Congress Rouge
  photography available too, but a real photograph of a real plant sits closer to the line amendment
  B draws than lamp advertising does — the illustration is the safer choice there, and its
  `imagePrompt` no longer suggests otherwise.
- **`tools/uishot.mjs` has no `.jpg` entry in its MIME map**, so story images are served as
  `application/octet-stream`. Chrome sniffs them and renders them fine, so this is cosmetic; I left
  it alone rather than touch a file another agent may be editing. Worth a one-line fix later.
- `meta_instagram` is the story that will go stale next. Meta's answering brief lands 20 August 2026
  and the D.C. Circuit will rule some time after that. The `year` field, the last paragraph and
  `outcome` all need revisiting when it does.
# Session 12 — round 5 on `belt_work` and `planet_limb`

Blind critics scored `belt_work` 4.3 / 8.0 and `planet_limb` 4.5 / 8.3. This session is those two
shots only. Files touched: `js/world/kit/belt.js`, `js/world/kit/planet.js`, `js/world/fx.js`,
`js/world/backdrop.js`, and **only** the two scenario blocks in `js/world/scene.js`.
`station.js`, `ship.js`, `lighting.js` and `atmos.js` were not touched.

## `belt_work` — 132 → 134 calls, 160k → 268k tris, 12.1 MB tex

- **Craters.** `rockGeom` now carves 3–6 bowls with raised rims per shape. That is the whole
  answer to "one noise-bumped potato": a bowl under a hard key casts its own terminator, and no
  amount of displacement noise does. `TIER_SHAPES` 2/3/5 and `TIER_DETAIL` 1/3/5, plus a
  `HERO_BOOST` so a hand-placed rock gets 2880 triangles instead of 320. The field does not — 45
  instances at hero detail is the whole triangle budget.
- **Per-rock ore.** The ore shader hashes the *instance translation* into `vOreSeed` (the only
  per-rock value a shader can see on an `InstancedMesh`) and uses it to slide the vein uv and move
  the threshold, so no two rocks carry the same network. A three-sine object-space `pocket` mask
  confines the ore to a few regions; the vein atlas cannot gate itself because it is far too
  sparse to survive being sampled at a coarse scale.
- **Stars.** There were none. `starOcclude` 18 against a lifted `dustField` is `e^-2.7`, which
  deletes the whole sky. 2.2 / `starBright` 3.4 / `stars` 1.0.
- **Grade.** `nebGain` 0.85 → 0.22, `nebBlack` 0.34, `fogDesat` 1.0, key 17 → 21 with `ambient`
  0.008 and `envPower` 0.045. Background is a neutral warm grey with a full starfield in it.
- **Beams.** New **muzzle fan** in `fx.js` — a long shallow cone from 5 % to 82 % of the run,
  widening away from the emitter. The impact flare stack went from a 46w blob to a 2.4w hot point
  with a dim skirt, and two `debris()` clouds sit at the two cut faces as spall.
- **Subject and scale.** The 52 m rig is now an 84 m hauler at a third of the frame width across
  the bottom, one 38 m escort and one 0.42-scale tug parked against a 140 m rock, and twenty-three
  hand-placed rocks with four cut by a frame edge.

## `planet_limb` — 72 → 141 calls, 62k → 77k tris, 13.4 MB tex

Round 4's premise was wrong. 244160_15c is a **night sky with a bloom in it**, not a sunset: two
hues, a lit navy field and one pale wash, and the hulls are mid-value with surface on them. The
star is a composition element, **not the key**.

- **The key had to come over the camera's shoulder.** With the star in frame at −Z, any
  `keySwing` under 60° is still a backlight — `keyDir.z` only goes positive past ~120° for a star
  at az 30. 140° / lift 24 front-lights the hulls from the same side of frame the star is on.
- **`rimWidth` was the orange.** At 2.6 with `rimNear` 340 every near hull sat inside one broad
  wash and read as an orange smear — gotcha 34 again, on hulls this time. 1.8 / 5.5 gives an edge.
- **`envFalloff` was the rest of it.** The analytic env ramps cool→mid→hot with angle from the
  star, so a wide falloff makes the whole sphere orange. 5.5 keeps the warm inside 25°.
- Three new knobs, all default-neutral so nothing else moves: **`flareTint`** (flare + glow toward
  white — the palette's star is a K-type orange and every backlit shot inherited it),
  **`coolField`** (a smooth cool sky field with a slow gradient toward the star; every other term
  in the bake is cloud-modulated and far too lumpy to be a night sky), and **`bloomCore`** (the
  glow quad carries the flare's core, so raising it for a wide wash also clipped a hard white disc
  over the star — 0 leaves it pure halo). Plus **`planetTint`** in `planet.js`.
- **The planet is lit by the star, never by the key.** `updatePlanetLighting` used
  `lighting.keyDir`; a scene that swings the key round to front-light its hulls also front-lit the
  planet and the crescent vanished. It reads `backdrop.dir` now — a no-op for every other
  scenario, all of which run `keySwing 0`.
- **Scale.** Eighteen hulls at three-quarter rear yaws (0.62–0.96) with real pitch, from an 84 m
  hauler at 122 m down to lod-2 escorts at 1.4 km, plus a flight of four Corvain escorts cutting
  across the halo. Round 4's sixteen broadside hulls at 1.3 rad were sixteen identical slivers.

## Gotchas — session 12

73. **`PolyhedronGeometry` subdivides each edge into `detail+1`, so faces are 20·(detail+1)², not
    20·4^detail.** Raising `IcosahedronGeometry`'s detail from 3 to 4 is 320 → 500 triangles, not
    1280 → 5120, and the "+1 for hero rocks" that was meant to make craters readable did nothing
    at all — the triangle count moved by 1k and looked like a no-op bug.
74. **The only per-instance value a shader can see on an `InstancedMesh` is `instanceMatrix`.**
    `modelMatrix * instanceMatrix * vec4(0,0,0,1)` in the vertex shader hashed into a varying is
    what makes one shared material paint every rock differently. Guard it with
    `#ifdef USE_INSTANCING` so the standalone hero rocks still compile.
75. **`veinAtlas` is far too sparse to be its own regional mask.** Roughly nothing is above 0.5, so
    sampling it at a coarse uv to decide *where* ore lives returns zero nearly everywhere and the
    ore disappears entirely. A product of three object-space sines is the cheap correct answer.
76. **`engineTrails` is two draw calls a ship** — a merged ribbon mesh and a `Points`. Twelve
    trails put `planet_limb` at 165 calls, over the 150 budget, and the hulls were not the problem.
77. **The `bloomStreak` default of 0.2 on a 78° glow quad is a bright horizontal line clean across
    the frame.** It reads as a compositing seam, not as an anamorphic flare.
78. **A knob without a schema `default` leaks between showroom scenarios** (`stars`, `nebDetail`,
    `viewDist`, …) because `resetDefaults` cannot restore it. `belt_work` and `planet_limb` both
    set `stars` deliberately; `tools/shot.mjs` reloads the page per shot so `--all` is unaffected,
    but the showroom will carry it into whatever scenario runs next.
79. **`tools/compare.mjs`'s `REFS` path breaks inside a git worktree.** It is four levels up from
    the project root, which is correct in `site/` and wrong anywhere else. Build the sheet by hand
    with the same ffmpeg `hstack` if you are working in a worktree; do not "fix" the path.

## Honest scores, judged on the comparison sheets at sheet scale

- **`belt_work` ~6.5** (was 4.3). Reads as a sibling of the plate: crater relief with real
  terminators, ore in pockets rather than stencilled on, a full starfield through a neutral grey
  medium, beams with a muzzle fan and a hot compact impact, an 84 m hauler running off the left
  edge with a known-small escort against a known-huge rock. Still short of the plate on hull
  colour — the plate's subject is saturated yellow and blue and is the whole value story, ours is
  grey with orange trim — and on the sheer count of ore rocks along the top.
- **`planet_limb` ~6.5–7** (was 4.5). Now genuinely two hues, an unambiguous key direction, hulls
  that are mid-value with panel detail against a pale halo, a real size ladder and a planet that
  is a lit corner arc. Short of the plate on hull *mass*: the ship kit's 7:1 wedges will always
  read thinner than the plate's blocky frigates, and no amount of framing fixes that.

## What is short — next version

- **A pale panel on the hauler's deckhouse blows to near-white at any `keyPower` over ~10** and it
  is the one thing in `belt_work` that reads as a rendering artefact rather than as a ship. It is
  albedo, not exposure — at key 2 it is a pale grey box with plate lines on it. A `ship.js` fix,
  out of scope here; pitching the hull to 0.13 / −0.09 hides most of it.
- `belt_work`'s hull wants the plate's saturated two-colour paint scheme. That is a palette job.
- `planet_limb` could use two more *large* hulls; the plate has three that read as objects.
# Session 12 — second pass on `hero_hull` and `station_night`

Two shots, briefed off a critic that named one bug on `hero_hull` ("unclamped nebula bloom blows
the upper hull to near-white, and every other weakness on that side is downstream of it") and one
on `station_night` ("kill the flat ambient and put in one hard key — the boxes have no dark side").
Both diagnoses were right, and in both cases the named fix was the cheap half of the work.

**Owned this session:** `js/world/kit/station.js`, `js/world/kit/ship.js`, `js/engine/post.js`, and
only the `hero_hull` / `station_night` blocks of `js/world/scene.js`. `geom.js`, `materials.js` and
`lighting.js` were read and left alone — nothing needed changing in them.

## `hero_hull`

**The blowout was two things multiplied, and only one of them was the bloom.**

1. `nebGain 1.9` put the cloud directly behind the dorsal *hotter than the deck in front of it*, so
   the silhouette was inverted exactly where it should have been strongest.
2. `post.js` composited `scene + bloom × strength` with **no clamp at all**. Anything over 1.0 hard
   clipped to flat white, and the clipped region was a solid shape with no gradient in it.

Fixes, in that order:

- **`bloomShoulder` (new knob, default 1.0 = the old hard clamp).** `COMP_FRAG` now runs the sum
  through `shoulder()`: below `k` nothing moves, above `k` the excess rolls into the last stop
  (`e / (1 + e / (1 − k))`, which maps `k → k` and `∞ → 1`). `hero_hull` runs 0.72. **Default 1.0
  is a genuine no-op, so no other scenario changed.**
- Nebula pulled back for this shot only: `nebGain 1.05`, `nebCore 0.55`, `nebGlow 0.62`,
  `nebHalo 0.02`; bloom `threshold 0.86 / knee 0.16 / strength 0.44`.
- **`keyLift 28`.** With a 10° key the deck was dark and the *risers* were what blew — `keyPower 58`
  was compensating for a key that never reached the dorsal. Lifting the key off the star bearing
  (the star does not move, so the flare is untouched) put the light where it belongs and `keyPower`
  came down to **19**.

**Micro-panelling — `hullPanel`, new knob, default 0.** A world-space plate grid in `patch()`,
projected onto whichever axis pair the normal is furthest from. Two rectangular-cell frequencies
plus one fine square one, each row offset by `floor(cell.y) × k` — **a square grid reads as
brickwork at every scale, and that was the first version.** Each cell gets a seam at its edges, a
hash value jitter and a roughness bump in the seam. This is the detail that has to survive a
thumbnail; the plate map alone averages to grey the moment the hull is 200 px wide. Runs 0.68 here.

**The engine wash.**
- `plume()` now emits **three nested open cones** instead of one tube — radius ×1.3/×2.2/×3.6,
  length ×1.0/×1.45/×2.1, power ×1.0/×0.32/×0.11, falloff exponent 2.4/1.7/1.2. Additively they
  integrate to a soft radial profile with a core, and because each shell dies at a different
  distance the wash has no edge to find. That is what the critic meant by "flat white capsules that
  terminate with a hard edge". It applies to every ship in every scene and improves all of them.
- **`engineWash`, new knob, default 0.** A third bounce point (`uB2`) in the ship shader at the
  nozzle plane, in the palette's engine hue, with the same inverse-square falloff the hangar and
  bridge bounces already use. That is the "visible inverse-square falloff onto the hull skin".
  Runs 1.5 here.
- One `atmosphere()` call added (**+1 draw call**) — this was the only scenario in the set still
  rendering vacuum as literally empty.

## `station_night`

**The flatness was a material bug, not a lighting one.** Station surfaces inherit the ship palette's
`metalness` (0.86–0.9). A MeshStandardMaterial at that metalness **has no diffuse term**, so a
directional key contributes a specular lobe nobody sees at this angle and every face falls back to
whatever the env map hands it. That is why the last pass's key did nothing, and why its four
short-range point lights "did not read" — they could not.

- **`stationPaint`, new knob, default 0 (nothing changes).** Lerps `metalness → base × (1 − 0.86p)`
  and `roughness → base + 0.22p`. At 0.86 the boxes are painted plate and the key finally has
  something to shade. **This is the single change that gave the shot form.** Every other lighting
  number then had to come *down*: `keyPower 13 → 6.2`, `ambient 0.006 → 0.002`,
  `envPower 0.22 → 0.07`, `stationPlane 0.45 → 0.30`.
- One hard key at `keyLift 34`, plus a real coloured fill (`fillPower 1.15`, `fillAngle 128`).

**Dock spill — `setStationSpill(list)` + `spillPower`, default 0.** An eight-slot uniform array of
`[x, y, z, radius, colour, gain]` read by the station shader: inverse-square from a finite radius,
`N·L` so a wall facing away stays black. **Real point lights are wasted on this kit** — the whole
station is four merged meshes, so the cost is per-fragment either way and the uniform array costs no
draw call. Two things that matter:
- **The source has to sit above the deck plane.** Level with the mouth it pools on walls and never
  on the plates, which is the exact failure the critic described.
- **0.42 floods the truss orange; 0.16 is right.** The falloff is not the limit, the count is.

Six warm sources on the near dock line, two cool ones down the row — one hue on its own is not a
grade.

**Density that varies.** `bay()`'s greeble was a flat scatter over the whole module. It now runs
through a two-lobe cluster function (peaks at the dock end and the inner end, near-zero over the
middle third), and the kinds are pipe runs / stanchion-and-rail / crates instead of one box type.
The middle third gets **five long shallow seams and nothing else** — the calm plate run is what
makes the clusters read as clusters. A dead-regular railing runs the outer deck edge at the dock
end only. All of it merges into the existing buckets: **zero extra draw calls.**

**Value inside the bay.** The pale deck plates ran the full 38 m, which made the whole row one beige
field. They are now `W × 0.30` with a dark coaming capping each outer edge, and 55 % of the deck
greeble moved to the `dark` bucket. The plate is a *dark* machine with pale plates set into it, not
a pale machine.

**The dock mouth is a slot now,** not a lit wall the size of the bay — a flat emissive rectangle
that big reads as a screen bolted to the front and swallows its own collar. `station_haze` gets this
too and is better for it.

**Composition.** `ledger`'s `spine` module moved from `[128, 52, −40]` to `[200, 44, 10]` — berthed
*down the middle of the row* instead of floating off one shoulder. 8500_06 is twenty grey bays with
one orange hull lying along them, and where that hull sits is most of the read. The far Dray Yard
moved to `(950, −60, 60)` to bridge the gap at frame centre-right, and a **third structure layer**
(ferrous Dray Yard, ×1.6, at `(1250, −330, 300)`) fills the right half, which was empty sky against
a plate that fills every pixel. `dustField 0.016` puts a value in the top-left quarter.

## Depth of field — `js/engine/post.js`, default off

A **tilt band, not a depth blur**: no depth buffer, no per-pixel CoC. The scene is blurred once at
half res (two separable taps) and the composite mixes sharp → blurred on
`smoothstep(uIn, uOut, |dot(uv − 0.5, axis) − centre|)`.

**Two things that will cost you time if you copy the numbers wrong:**
1. **The band works in `vUv − 0.5`, which is half NDC.** Every threshold is half what the same
   distance is in NDC. The first tuning pass was off by exactly 2× and the effect looked broken.
2. **`dofNearSide` exists because a symmetric band defocuses the subject.** `station_night`'s row
   runs 185 m → 600 m across the frame, so it occupies most of the band's own axis and a symmetric
   band blurred the near bays along with the background. The near side's distance is scaled by
   `dofNearSide` (0.16 here) so only the far half really goes.

**Cost, measured at `--preset=medium --dpr=1 --w=844 --h=390`: +2 draw calls, +0.7 MB texture,
0 triangles**, GPU delta inside run-to-run noise. `station_night` 121 → 123 calls.

## Numbers — `--preset=medium --dpr=1 --w=844 --h=390`

| | calls | tris | texMB |
|---|---|---|---|
| budget | < 150 | < 350k | < 60 |
| `hero_hull` (was 65 / 19k / 13.4) | **66** | 20k | 13.4 |
| `station_night` (was 107 / 77k / 13.4) | **123** | 111k | 14.1 |

`station_night`'s +16 is the third structure layer (+14) and the DOF (+2). Nothing else in the
session cost a draw call — the module vocabulary, the spill and the panelling are all free, which
was the constraint.

All eleven scenarios render clean. `station_haze` (dock-mouth slots, deck plates, greeble clusters),
`belt_work`, `fleet_line`, `nebula_back` and `hull_close` (nested plumes) were checked frame by
frame against their previous renders and all changed only for the better. Every new knob defaults to
the old behaviour, so nothing outside these two scenarios moved by accident.

## Gotchas — session 12

50. **`-((t - c) / w) ** 2` is gotchas 11 and 38 for the third time.** It threw
    `SyntaxError: Unary operator used immediately before exponentiation expression` in
    `station.js`'s cluster function and cost one render. Wrap it: `-(((t - c) / w) ** 2)`.
51. **A second composite quad needs the render call changed too.** Adding `dofComp` beside `comp`
    and selecting between them at the top of `render()` still left `this.comp.render(renderer)` in
    both branches at the bottom. The frame went **entirely black with no console error**, because
    the quad that actually drew had never had its `tDiffuse` set. If a post pass renders black and
    nothing is logged, look for a texture uniform that was assigned to the object you are not
    drawing.
52. **`roughnessmap_fragment`, not `map_fragment`, is where a hull shader wants to touch
    `diffuseColor`.** Three emits `map_fragment` before `color_fragment`, so anything written there
    is multiplied by the vertex colours afterwards, and `roughnessFactor` does not exist yet. The
    panel grid needs both, so it hooks `roughnessmap_fragment` — `diffuseColor` is still in scope
    there and vertex colours have already landed.
53. **Two `.replace()` calls on the same `#include` both hit**, because each replacement re-emits
    the include line. The order is the order you called them in, which is not obvious when the two
    hooks are 40 lines apart. Bump `customProgramCacheKey` whenever either changes, or the program
    cache serves the old shader (gotcha 39 again).
54. **`--eval` runs after the screenshot; `--pre` runs before it.** An A/B done with `--eval` looks
    identical to the control every time. It is documented in `shot.mjs` and still cost a render.

## Honest scores, judged at sheet scale

- **`hero_hull` ~6** (was 5.0). The named bug is gone: the hull holds a dark value against the red
  field, the dorsal reads as continuous structure at thumbnail size, and the plumes are soft cones
  that put light on the skin. Still short of the plate on two things — the plate fills its whole
  frame with a light haze where our lower-left is mostly black, and its recess occlusion is real
  where our seams are a shader trick.
- **`station_night` ~6** (was 4.7). Form, a hero mass, three depth layers, warm spill on the deck
  plates, real defocus. Still the weaker of the two: the plate's bay tops carry four or five
  distinguishable sub-assemblies each and ours carry two, and its teal accent lighting is everywhere
  where ours is two spill points.

## What is short — next pass

- **The bay module still has one silhouette.** The clusters and the coaming help, but the plate's
  strength is that no two bays present the same shape. The `swaps` mechanism merges a substituted
  module into the fixed buckets for free and is still used only three times across both stations —
  that is the cheapest unspent density in the project.
- **The DOF band cannot follow depth round a corner.** A shot that needs foreground *and* background
  soft with the subject between them on a curve needs a real depth tap. The band is the right answer
  for a subject that runs on one diagonal and nothing more.
- `hullPanel`'s grid is world-space, so two hulls at different scales share a cell size. On the 84 m
  hauler that is right; on a 30 m escort the cells are proportionally too big.
- The station spill is authored by hand in the scenario. `station()` knows where every dock mouth it
  built ended up and could emit the list itself — it does not, because the group's world transform
  is not known at build time. Worth solving if a third station shot appears.
