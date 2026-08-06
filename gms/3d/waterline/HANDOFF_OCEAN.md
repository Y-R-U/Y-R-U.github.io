# WATERLINE — C1 handoff: ocean, sky and exterior light

Files owned and rewritten: `js/world/ocean.js`, `js/world/sky.js`, `js/world/lighting.js`.
Nothing else was touched. No new files added to the map.

**Pass 3 of 3 — final.** §0 is pass 3's diagnosis; §0b keeps pass 2's, because both are still true
of the code. The rest of the file is current. §11 is my honest read of what is still wrong, and it
is written for the known-gaps log, not to look good.

---

## 0. Pass 3 — the one bug under most of the failing critique

Three separate complaints — *no aerial perspective at the waterline*, *detail does not rescale with
distance*, *sparkle is constant-pixel-size* — turned out to be one missing term, plus a shader typo
that made a fourth.

### 0.1 A distance LOD cannot flatten a sea, because grazing angle sets the footprint

Every LOD in the shader ran on `vDist`. But what a pixel covers on a horizontal plane is not set by
range, it is set by range **over grazing angle**: a metre of world spans `dist / (-V.y)` times more
screen at the waterline than it does underfoot. Measured on `sea_noon` (camera 17 m, fov 33°, 720
rows): at 2 km one screen pixel spans about **188 m** of water vertically, while the detail octave
in force there was a **36 m** tile. Deep sub-pixel, so it aliased — and it aliased *anisotropically*,
into the horizontal streaks that ran right up to the horizon line.

The swell was worse than the ripple. `uLodA`/`uLodB` are in wavelengths, so the 74 m component was
still at **64% amplitude at 2 km**, giving a surface slope of ~0.064 against a viewing `ndv` of
0.0085. A slope seven times the grazing angle means Fresnel swings from floor to ceiling across
every ripple, which is why the last twenty rows of water were a lace of bright and dark instead of
a converging haze.

So `main()` now computes one number and every slope term is faded on it:

```glsl
float flatten = smoothstep(uFlatA, uFlatB, log2(vDist / max(-V.y, 0.0015)));
float sharpness = 1.0 - flatten;
```

`sharpness` multiplies the swell normal's horizontal components, the detail gradient, the sparkle
and the foam. Range is per grade (`sea.graze: [a, b]`, in log2 units — see §3).

**That is what produced the aerial perspective, and it is worth understanding why**, because it is
not a haze tweak. With the normal smooth at the waterline, `ndv → 0`, so Fresnel `→ 1`, so the water
*is* `skyColour()` along a ray that is itself a hair above the horizon. The sea and the sky stop
being two differently-computed things that meet: they converge on the same function. Raising `fogK`
could never have done this — to force `fg = 0.99` at 1.5 km you need `k = 0.003`, which flattens the
whole mid-field into milk.

Measured on the clean strip `x 900–1200` of `sea_noon` at 1280×720, mean row luma:

| | y=356 (sky) | y=360 (horizon) | y=364 | y=372 | y=384 | y=400 |
|---|---|---|---|---|---|---|
| pass 2 | 163.7 | 166.4 | *162.4* | 153.1 | 141.8 | 117.3 |
| pass 3 | 163.7 | 166.4 | 158.8 | 148.4 | 134.9 | 117.3 |

The plate (`236390_14`) falls 175 → 110 across 55 rows through its horizon with no step anywhere.
Pass 3's largest single jump at the join is **7.6 levels over 4 rows**. The critique's 33-level step
was measured full-width, which at noon means straight through the D10 placeholder hull.

### 0.2 The detail octave crossfade was between two different fields

Real seam, exactly as the critique reported under the dusk horizon. `detail()` crossfaded
`RIP_A` at scale `sA` against `RIP_B` at scale `2·sA`, on `fract(o)`. At the octave boundary
`floor(o)` increments, so the layer that had just faded *in* at `2·sA` under `RIP_B` is replaced by
a layer at the same scale under `RIP_A`, with a different rotation and a different time offset.
Same size, different content, zero-width transition. The weights were continuous and the image was
not.

Both octaves now go through one `ripGrad(p, s, t)` that differs only in `s`, so octave *n*'s fine
layer and octave *n+1*'s coarse layer are the same field and the crossfade is continuous by
construction. Widening the transition would not have fixed this; it would have widened the seam.

### 0.3 Sparkle was its own un-mipped fetch, and drew a lattice

Pass 1 called the under-mipped sample "a workaround" and was right to be uneasy. It sampled the
ripple tile at a fixed 2.9 m world scale outside every LOD, so it stayed the same on-screen size at
300 m and at 3 km — and at grazing incidence a periodic tile beat against the pixel grid and drew a
visible **diamond cross-hatch down the glitter path** in `sea_dusk`. It is plainly there in the
pass-2 render at 1280×720, rows 620–720.

The separate fetch is gone. Sparkle now rides the detail octaves at their raw amplitude
(`rgRaw`, captured before the amplitude scaling) times `uSparkle * sharpness`, so it is world-space,
mipped, and shrinks with distance like everything else. **One texture fetch cheaper** than pass 2.

### 0.4 The dusk sun disc, again

Pass 2 fixed a disc that was too small by overshooting: `discW/discH` of 0.95° × 0.44° **half**-
widths is 1.9° × 0.88° across, which in a 24.6° horizontal fov is 7.7% of frame width at a 2.15:1
flattening. Now **0.135° × 0.120°** — about 1.1% of frame width at 1.13:1, which is within the
refraction limit. The feather also moved from `smoothstep(0.42, 1.0, q)` to `(0.10, 1.0)` so the
edge is soft rather than a sticker rim, and `glowCore` went 0.22 → 0.45 with `glowPow` 1400 → 900,
which is the ~2° bloom the plate actually shows around a hazed sun.

### 0.5 Dusk's sun was too low for its own plate

Not on the brief, but it was costing the whole frame. `552990_08` puts its sun about **0.23 of the
frame height** above the horizon; ours at `elev 0.55°` sat 0.04 above it. That inverts the sky's
value structure — the plate is brightest at the sun and darkens toward the horizon, ours was dark at
mid-frame and blew out into cream at the waterline. `elev` is now **2.6°**, which lands the disc at
0.59 of frame against the plate's 0.60, and `glow` came down 0.72 → 0.45 so the horizon band stops
outshining the sun.

### 0.6 Two things that will cost you twenty minutes if you do not know them

- **`flat` is a reserved word in GLSL ES 3.0** (the interpolation qualifier). `float flat = …` fails
  to compile with a bare `syntax error` and no hint. The local is called `flatten`.
- **A backtick inside a GLSL template literal ends the template.** A comment reading ``// `flat` is
  reserved`` turned the whole shader string into JS and the page threw
  `SyntaxError: Unexpected identifier` from `main.js`, nowhere near the file. Never quote an
  identifier with backticks inside `SKY_GLSL`, `VERT` or `FRAG`.

---

## 0b. Pass 2 — the two invisible fixes, still true of the code

Both were **present in the source and multiplied out in the pixel**. Neither was mis-wired. This was
confirmed with the `seaDebug` knob (§4) before anything was changed.

### 0b.1 The sky-dome reflection was wired correctly and cancelled

`seaDebug=1` renders `refl * F` and came back near-black across the whole sea. The cancellation:

```glsl
float open = smoothstep(-0.10, 0.30, R.y);      // old
vec3  refl = mix(sky * 0.32 + uDeep, sky, open);
```

**Fresnel and `open` are anti-correlated.** Distant water is where `F → 1` and the sky reflection
carries the entire image — and distant water has `R.y ≈ 0.005`, which on a ramp running to 0.30
gives `open ≈ 0.17`. The term was strongest exactly where it was switched off.

The ramp is now tight around zero (`-0.05, 0.02`), the occluded value is a dimmed horizon sky
(`sky * 0.42 + uDeep * 0.6`) rather than the body colour, and the occlusion test runs off the swell
normal, not off `N` — feeding the ripple in made every facet flip independently and `seaDebug=3`
showed that as salt-and-pepper across 40% of the near water.

### 0b.2 The LOD was on the swell, not on the detail normal

The `uLodA`/`uLodB` LOD is real but it is on the **swell components**. The ripple normal had only an
amplitude fade, never a scale change, and its two layers were sampled **transposed** (`uv` and
`uv.yx * 2.17`) — a pair at exactly 90°, world-locked, which is a lattice generator. Replaced with
`detail()`: two octaves of one tile crossfaded on `log2(distance)`, rotated 26° and 59° — pointedly
*not* 90° apart. Pass 3 then made both octaves share one rotation (§0.2); the anti-lattice argument
survives because the two layers now differ in scale rather than in angle, which is ordinary fBm.

---

## 1. The one idea the whole component rests on

**The water reflects the sky by evaluating the sky function, not by sampling a map.**
`sky.js` exports `SKY_GLSL`, a self-contained GLSL block with `skyBase(dir)`, `skyColour(dir, disc)`
and `sunDisc(dir)`. `ocean.js` pastes it into its own fragment shader and calls
`skyColour(reflect(V, N))`.

That is why there is no SSR, no refraction and no planar reflection (BUILD_PLAN §7.2) and why the
sea still tracks the grade for free. It also means **the sky and the ocean share one uniform
block** — `skyUniforms()` returns a module-level singleton whose `{value}` entries are assigned by
reference into both materials, so writing `uSunDir` once updates both.

Pass 3's waterline convergence (§0.1) depends on this and would not be reproducible with an env map:
the water at the horizon has to be *bit-for-bit* the same function the dome is evaluating one pixel
higher, or the join is a step again.

---

## 2. API

### `buildSky(quality, renderer)` — `js/world/sky.js`

```js
{ object3D, material, uniforms, sunDir /*Vector3, live*/,
  env, background, time, grade,
  setGrade(name)  → sky,   // 'noon' | 'dusk' | 'night'
  setTime(hours)  → sky,   // §2.2 contract; picks the nearest authored grade
  setSun(azDeg, elevDeg) → sky,
  update(dt, app),
  registerKnobs(quality) }
```

Also exported: `GRADES`, `SKY_GLSL`, `skyUniforms()`, `onGrade(fn) → unsubscribe`, `grade()`.

### `buildOcean(quality)` — `js/world/ocean.js`

```js
{ object3D, material, uniforms, seaState,
  update(dt, app),
  setSeaState(0..3)        → ocean,
  setSeaLights([{ pos: Vector3, colour, intensity, radius }]) → ocean,   // max 2
  heightAt(x, z)           → number,     // metres, matches the GPU displacement
  normalAt(x, z, out?)     → Vector3,
  registerKnobs(quality, app) }
```

**`setSeaLights` is the seam C4 wants.** A warm point source *on the water* producing both a broad
diffuse glow and a long reflected streak. Falloff is `r/(r+d)`, not inverse-square, deliberately:
the streak has to survive to the horizon.

**`radius` and `intensity` interact and both matter.** `radius` is the `r` in `r/(r+d)`, so it sets
where the falloff bites; `intensity` has to leave the *far* end under 1.0 after tone-mapping or both
ends clip and the whole sea reads as a flat orange multiplier with no falloff. Pass 1 shipped
`intensity: 9.0, radius: 360`; it is `2.4 / 300`. If you raise one, check the near end in the render.

### `buildLighting(quality, sky)` — `js/world/lighting.js`

Unchanged since pass 1. **It parents and pumps the sky dome** — `main.js` never calls `app.add(sky)`,
so without `object3D.add(sky.object3D)` and the `sky.update` forward the dome is never in the scene.

---

## 3. Grades — where the numbers live

`GRADES` in `sky.js` holds **noon**, **dusk**, **night**. Every colour is **PRE-tone-map**: ACES
plus the grade's exposure sits between the table and the pixel.

Values were derived by sampling the plate crop and the render at the same frame fractions and
closing the gap. The sampling script is throwaway — `ffmpeg -f rawvideo -pix_fmt rgb24` piped into a
column-mean in Python takes two minutes to rewrite, and `tools/plates.json` has the crop rects.
**Do that rather than nudging by eye.** Pass 3 found the noon sky's real defect that way and it was
not the one the critique named: measured against the plate, a noon sky barely changes *luma* from
zenith to horizon (155 → 171 in `236390_14`) — what changes is **saturation**, 68 → 20. Chasing a
luma falloff would have made it worse.

Fields added in pass 2:

| field | where | what |
|---|---|---|
| `discW`, `discH` | grade | sun disc half-widths in **degrees**, azimuth × elevation |
| `cloudFar`, `cloudProx` | grade | the colour clouds take far from the sun, and the exponent on proximity |
| `sea.fogTint` | grade | per-channel multiplier on `fogK` — chromatic extinction |
| `sea.ripRef`, `sea.ripLod` | grade | metres at which the base detail octave is right, and how fast the LOD walks |
| `sea.ripFar`, `sea.laceScale` | grade | far-field detail amplitude; foam lace frequency |
| `sea.reflBlur` | grade | how far roughness lifts the reflected ray |

Fields added in pass 3:

| field | where | what |
|---|---|---|
| **`sea.graze`** | grade | `[a, b]` in **log2 units of `dist / -V.y`** — where surface slope starts and finishes flattening into the horizon. See §0.1. Night is `[22, 26]`, i.e. deliberately out of reach |
| `sea.hazePow` | grade | exponent on `pathT` in the airlight's handover from the authored tint to `skyBase`. 2 by default; dusk uses 3 so its water stays mauve-grey longer instead of going pure sun-orange |
| `sea.glintCol` | grade | glint colour, defaulting to `sun.colour`. Noon's sun is warm and its **specular** should not be: a cream highlight at partial strength over navy reads olive |
| `cloudSun` | grade | how far along the sun's azimuth the cloud self-shadow samples |

`hazeH` at noon is 0.105 and is load-bearing. It is the e-folding height of the horizon haze in
`sin(elevation)`; at 0.02 the band was barely a degree tall, so a **reflected** ray at 4° already saw
deep zenith blue and the mid-field sea came back navy. The sky's own appearance and the water's
reflected appearance are the same number — you cannot tune one without moving the other.

Noon's `gradPow` went 0.60 → 0.42 and `cover` 0.47 → 0.34 in pass 3. Both are about the same thing:
the shot's 33° fov only reaches 16.5° of elevation, so at `gradPow 0.60` the top of frame was 47% of
the way to zenith and half of what was left was covered in cloud. Measured zenith-to-horizon on the
clean strip: **saturation 71 → 14** (plate: 68 → 20), luma 135 → 166 (plate: 155 → 171). We are
about 20 levels darker than the plate at the top of frame; pushing that up flattens the gradient
again and I chose the gradient.

---

## 4. Knobs registered

All are live URL params too (`?seaChop=1.4`, and `--set=seaChop=1.4` through `shot.mjs`).
**No knobs were added or removed in pass 3.**

| key | group | range | default | note |
|---|---|---|---|---|
| `skyGrade` | Sky | select noon/dusk/night | noon | |
| `skyCover` | Sky | 0–2 | 1 | multiplier on the grade's cloud cover |
| `skyHaze` | Sky | 0–2 | 1 | multiplier on horizon haze |
| `skyCloudSize` | Sky | 0.3–3 | 1 | multiplier on cloud feature size |
| `seaState` | Ocean | **-1**–3 | -1 | −1 = follow the grade |
| `seaChop` | Ocean | 0–2.5 | 1 | multiplier on wave slope |
| `seaGlint` | Ocean | 0–4 | 1 | multiplier on the sun glint lobe |
| `seaHaze` | Ocean | 0.2–3 | 1 | multiplier on the sea's aerial perspective |
| `seaRipple` | Ocean | 0.25–4 | 1 | multiplier on ripple tile size |
| **`seaDebug`** | Ocean | 0–4 | 0 | **isolate one term — see below** |
| `shadowDist` | Lighting | 40–400 | preset | unchanged from W0 |

**`seaDebug` is how §0b was diagnosed and it should stay.** `1` = what the sky reflection actually
contributes (`refl * F`), `2` = Fresnel, `3` = the `open` ramp, `4` = the detail-normal deflection.
Isolating a term is the only way to tell "wired wrong" from "wired right and multiplied out", and
those two failure modes look identical in a finished frame.

`seaGlint=0` is the other one worth knowing: pass 3 used it to prove that the olive cast in noon's
mid-field was *not* the glint, which is what sent the search to the airlight's neutral grey instead.

**Why `seaState` has a −1:** `quality.register` applies a knob's default at registration, *before* a
scenario runs, so an absolute-valued knob pins the value and the grade can never set it. Every other
knob here is a multiplier for the same reason.

**There is no knob on `graze`.** It is per grade and it is the term that makes the horizon work; a
default-applying knob on it would pin all three grades to one range and undo §0.1 silently. If you
need to sweep it, edit the grade.

---

## 5. How the ocean is built

- **One polar mesh, one draw call.** Radii grow geometrically from 3 m; `oceanSegs` sets the
  angular count and the radial step count is capped at `17500/segs`. Three flat skirt rings run to
  ~39 km past the 1.5 km detail radius — without them the polygonal outer boundary sits about a
  degree under the horizon and notches the skyline.
- **The mesh follows the camera in XZ**; the wave field is a function of world position, so waves
  do not slide.
- **The swell normal is computed per fragment**, and each of the 5 components fades out on its own
  wavelength (`uLodA`/`uLodB`, in wavelengths of distance).
- **On top of that, every slope term is faded on grazing footprint** (`sharpness`, §0.1). The
  wavelength LOD alone left the 74 m swell at 64% amplitude at 2 km, which is seven times the
  viewing angle.
- **The detail normal is two octaves of one tile crossfaded on `log2(distance)`**, both through the
  same mapping so the crossfade cannot land as a seam (§0.2).
- **No `pow()` in the wave loop.** Crest sharpening is one lerp toward the square
  (`WSHAPE`/`WSLOPE`), differentiable in closed form, which `heightAt()` needs.
- **Roughness lifts the reflected ray** (`uReflBlur`). A rough sea at 3° grazing cannot mirror the
  horizon line; it averages a cone a few degrees wide and the upper half of that cone sees darker
  sky. This one term is what puts a far-bright / near-dark gradient on the water.
- **Aerial perspective is chromatic and converges on the sky.** Extinction is a `vec3`; one scalar
  makes distance a pure desaturation. The haze *tint* gives way to `skyBase` as the path gets long
  (`uHazeSky + (1-uHazeSky) * pathT^uHazePow`), because airlight integrated over a long enough path
  **is** the sky radiance in that direction. Noon's `fogTint` was `[1.22, 1.04, 0.86]` and is now
  `[0.92, 1.00, 1.14]`: red extinguishing fastest builds red airlight fastest, which put a brown
  cast through the mid-field troughs. Blue scatters more, so blue airlight should build first.
- **Foam laces off its own world-locked field, deliberately not the LOD'd one.** A whitecap is a
  physical patch a few metres across and has to shrink on screen; its threshold also widens with
  distance so a crest edge never resolves onto one pixel and steps. Noon's `capT/capAmt` went
  0.66/0.80 → 0.72/0.60 in pass 3 — at 0.80 the foam ran as long smooth smears down the swell backs
  rather than sitting on breaking crests.
- **Sparkle is not a separate fetch any more** (§0.3). If C6 reports crawling on the water during a
  dolly, `uSparkle` is still the first uniform to look at, but it now shares the detail LOD, so the
  crawl would be the octave crossfade rather than an un-mipped tile.

---

## 6. The sky

- Analytic gradient + sun band + tight sun core + a cloud deck projected onto a plane at altitude.
- The projection **saturates** at `uCloudReach` tiles. A true `1/y` plane runs to infinity at the
  horizon where the texture repeats hundreds of times and explodes into radial streaks; saturating
  stands in for the earth's curvature.
- **Clouds are lit by angle to the sun** (`uCloudProx`, `uCloudFar`) and **self-shadowed along the
  sun's azimuth with two samples** at `uCloudSun` and `2.6 × uCloudSun` (pass 3). One sample alone
  shades only the pixel behind a cloud edge, so every mass got the same softness and the deck had no
  sense of where the light was. The difference of the two samples is also used as a signed edge
  term, brightening where the deck thins toward the sun. Cost: one texture fetch, inside the
  existing `dens > 0.001` branch.
- The sun glow is **two terms**: a band hugging the horizon around the sun's azimuth, and a tight
  core. One isotropic `pow()` wide enough to cover the band blows the whole frame out.
- The **disc is an ellipse in angle**, not a threshold on `dot(d, sun)` — see §0.4.
- The dome writes `gl_Position.z = w`, so its radius can never collide with a scenario's near or far
  clip. At radius 1 a camera with `near: 1` clipped it away entirely and the sky went black.
- **The sky is never `app.add`ed.** It hangs off `lighting.object3D`.

Textures: `sky:cloud` 256² RGBA, `sea:ripple` 128² RGBA, `sky:env` PMREM, plus the placeholder
sprite cards. Total **4.46 MB** against a 45 MB budget. Unchanged across all three passes.

---

## 7. Scenarios registered

Registered from `ocean.js` at import time (append-only — `js/scenarios.js` untouched).

| id | ref | camera |
|---|---|---|
| `sea_dusk` | `552990_08` | y **18 m**, fov 14° vertical, horizon at 0.775 of frame, yaw +3.4° |
| `sea_night` | `494840_10` | y 15 m, fov 18°, horizon at 0.575 — authored to the plate's reframe |
| `sea_noon` | `236390_14` | y 17 m, fov 33°, horizon at 0.50 |
| `sea_only` | `null` | sea_noon's camera with everything but the ocean hidden — the §6 sub-budget shot |

`seaCamera()` places the horizon by screen fraction: for a plane running to infinity the horizon
sits at eye level whatever the camera height, so `tan(pitch) = (2f − 1)·tan(fov/2)`. Height then
only changes how far away the bottom of the frame is — dropping `sea_dusk` from 26 m to 18 m pulls
the nearest visible water from 472 m to 327 m and roughly doubles its apparent texture scale
without changing the framing at all.

### `sea()` hides everything that is not sea — read this before adding a ship

```js
const SEA_ROOTS = new Set(['lighting', 'ocean', 'vfx']);
for (const o of app.scene.children) o.visible = SEA_ROOTS.has(o.name);
```

Pass 1 did the opposite: `o.visible = true` on every root. That worked **only because the camera
happened to sit above the bridge stub**. Dropping `sea_dusk` to 18 m put the interior box in frame
and it rendered as a flat brown sky with a curved lower edge — a convincing-looking "the sky dome
broke" bug that was nothing of the kind.

**C3/C4: when real ships land, add `'fleet'` (and whatever else belongs at sea) to `SEA_ROOTS`.**
Deliberately a whitelist so the failure is "my ship is missing", which you notice, rather than
"the bridge is in my seascape", which reads as a shader bug.

---

## 8. D10 placeholders — what they are and where

In `ocean.js`, under the `D10 placeholders` banner. **Not C1's work, not scored, deliberately
crude.** C3/C4 delete them and the same scenarios re-run unchanged.

- `placeholderHull(len, colour, dark)` — six boxes and cylinders on one MeshStandardMaterial.
  `sea_noon` puts one at 640 m, `sea_night` a black one at 850 m.
- `fireGlow(spread, scale)` — 12 additive sprites, plus a `PointLight` named `_ph2`.
- `smokeColumn(scale)` — 26 sprites on a noise-carrying puff texture. The noise matters: a smooth
  radial gradient repeated 26 times integrates into a hard-edged cone.
- Everything is added to `app.scene` with a name starting `_ph`, and `sea()` removes anything so
  named on entry. Keep that prefix.

`sea_night` costs 45 draw calls almost entirely because of those 38 sprites. When C4 lands the
pooled VFX that becomes one call.

**A warning for anyone measuring these shots:** `sea_noon`'s hull spans x 220–620 of a 1280-wide
frame and straddles the horizon. A full-width row mean therefore reads the hull, not the water, over
the exact rows where the waterline lives. Pass 3's numbers are all taken on `x 900–1200`, which is
clear of it. This is very likely where the reported "33-level step" came from.

---

## 9. Measured perf

`--preset=medium --dpr=1 --w=844 --h=390 --mobile --perf`. Per D4 these are the numbers that
matter; GPU ms is advisory.

| shot | calls (main) | tris (main) | texMB | fps | pass 2 calls |
|---|---|---|---|---|---|
| `sea_only` (ocean alone) | **1** (1) | **16k** (16k) | 4.46 | 60 | 1 |
| `sea_noon` | 9 (9) | 19k (19k) | 4.46 | 60 | 9 |
| `sea_dusk` | 3 (3) | 19k (19k) | 4.46 | 60 | 3 |
| `sea_night` | 45 (45) | 19k (19k) | 4.46 | 60 | 45 |

Budget for sea shots is < 90 calls, < 300k tris, < 45 MB. **Every count is identical to pass 2 and
nothing was traded.** No texture was added or removed, so texture MB is unchanged.

Ocean sub-budget (≤ 40k tris), `sea_only` across the ladder:
**potato 5k · low 7k · medium 16k · high 28k · ultra 36k.** Identical to pass 2.

Desktop `--w=1280 --h=720 --dpr=1 --preset=high`: `sea_dusk` 3 / 30k, `sea_noon` 9 / 30k,
`sea_night` 45 / 30k, `sea_only` 1 / 28k, all 60 fps.

`--mobile --preset=low --w=390 --h=844 --dpr=2` renders correctly on all three sea shots
(3 / 6 / 26 calls, 10k tris, 4.46 MB, 60 fps) and looks close to high, because the swell normal and
the grazing fade are both per fragment. `boot` re-checked and unchanged at 15 calls / 32k.

**Fragment-shader cost went down slightly**, which is unusual for a pass that added a term: the
ocean lost the dedicated sparkle fetch (§0.3) and the sky gained one cloud-shadow fetch inside an
existing branch that the ocean only enters when its reflected ray is above the horizon. Net ≤ 0
fetches per water pixel. GPU ms on `sea_noon` at 1280×720 read 2.3 → 2.0, which per D4 is noise and
is quoted only to show nothing blew up.

**Sea shots report 0 shadow calls at every preset, and that is correct.** The only shadow caster in
a sea scene is the D10 hull 640 m out, far outside the shadow camera's 45–150 m extent, and the
ocean is a lean `ShaderMaterial` that does not receive shadows anyway (§10.3). `boot` still renders
its shadows normally — check there if you are validating the shadow ladder.

---

## 10. Requests for files I do not own

1. **Anti-aliasing is off by default and the sea shots want it. This costs memory, so I did not
   take it.** `engine/aa.js` defaults `aa` to `off` unless `?aa=native`. Measured on `sea_noon` at
   1280×720 dpr 1: `aa=msaa4` takes texture memory from **4.46 MB to 36.1 MB** — 80% of the 45 MB
   budget, and it scales with dpr², so dpr 2 blows it outright. `fxaa` is one full-res target
   instead of five and would be ~12 MB. **Your call:** one line in `sea()` if you want it, but it is
   a budget decision, not a shader one. Pass 3's grazing fade removed most of the remaining
   stair-stepping at the waterline for free, so this is now less urgent than it was.

2. **`js/main.js` (frozen) — `app.add(sky)`.** The sky is parented to `lighting.object3D` purely
   because `main.js` builds it and never adds it. Works, but surprising. **Not blocking.**

3. **No shadows on the water.** The ocean is a lean `ShaderMaterial`, not a grafted
   `MeshStandardMaterial`. At sea nothing in the plates casts a visible shadow on water and the fill
   saving is the point (S1). If C3 finds a ship needs its own shadow to sit in the water, say so —
   about 15 lines, and it costs fill on every water pixel.

4. **`js/engine/quality.js` — `aniso` at `medium` is 4.** Water at grazing incidence has an
   anisotropy ratio around 20:1. The grazing fade has made this much less painful than it was.
   **Not blocking.**

5. **`config.js` `SEA_STATES`** is read by `ocean.js` and nothing else. Wave *lengths* live in
   `WAVES` in `ocean.js` because they are coupled to the LOD distances in the same file.

---

## 11. Known gaps — my honest read after the final pass

Ordered by how much I think each costs against the plate. This is the known-gaps log, so it is
written straight.

- **`sea_dusk`'s water has almost no structure left, and that is a trade I made knowingly.** The
  grazing fade at `[12.4, 16.0]` is aggressive because the alternative was visible corduroy: a 14°
  lens at 18 m sees nothing nearer than 327 m, so *all* of that shot's water is at grazing angles
  where the swell aliases into diagonal hatching. The plate has a low-contrast fine grain across its
  whole sea that we now do not have — ours is a smooth wash outside the bottom fifth. If anyone
  revisits this, the right fix is not to relax the fade: it is a **detail term that survives
  flattening because it modulates radiance rather than the normal** (a low-amplitude world-space
  albedo/roughness breakup), which does not have to obey the slope-versus-grazing-angle limit at
  all. That is a real piece of work, not a tune.

- **The cloud deck is still one deck.** Two sun-ward samples bought genuine directional shading and
  the dusk sky now reads much closer to the plate, but every cloud in frame is still the same size
  and the same softness because they are one tiled texture on one flat plane. The plate has layered
  masses at three scales with dark undersides and a blazing lit core. A second deck at a different
  altitude and scale, composited, is the obvious next move and it is one more texture fetch.

- **Noon's mid-field has a faint warm cast in the wave troughs.** Chased and only partly fixed:
  it is not the glint (proved with `seaGlint=0`) and it is not the fog tint (flipped, helped, did
  not clear it). What is left is the airlight converging on a near-neutral grey against saturated
  blue water, which is *physically* right — the plate's own mid-field is nearly neutral — but ours
  arrives in patches on the swell backs rather than as a smooth distance gradient, because that is
  where Fresnel is lowest and the body colour shows through. It reads as a slight olive mottle at
  1280×720. I would attack `uRefl`'s interaction with the swell normal, not the haze colour.

- **The noon sky is about 20 luma levels darker than the plate at the top of frame** (135 vs 155),
  though its saturation matches within 3 points. Lifting it flattens the gradient the critique
  asked for. Fixing both at once means a brighter *and* more saturated zenith, which means moving
  `zenith` off a plausible sky blue, or a second gradient term. Left as is, deliberately.

- **`sea_night`'s foreground is darker than the plate's.** The plate's near water is a faintly lit
  grey-brown — light scattered in the air over a kilometre, not light reflected off the water. My
  falloff is a surface term, so the foreground goes to the water's own near-black. Raising the sea
  light re-flattens the whole image. The right fix is a volumetric-ish glow term around the sea
  light, which is C4's territory more than mine.

- **Whitecaps read as scattered patches, not as breaking crests.** Threshold on crest height laced
  with noise; there is no directional foam and no wake. Better than pass 1's opaque decals and than
  pass 2's smears, but still wrong at close range.

- **The grazing fade is a screen-space-derived term evaluated per fragment, and nothing has watched
  it move.** `dist / -V.y` changes as the camera dollies, and although `smoothstep` makes it
  continuous, a camera that drops toward the water will pull the flattening boundary toward it. I
  expect that to look like the sea *sharpening* as you descend, which is the right direction, but it
  is an expectation and not an observation. Every judgement in this file is from stills.

- **Nothing here is validated on a real phone.** Per D4 that is a ship gate, not a component gate,
  but the grazing fade adds a `log2` and a `smoothstep` per water fragment and water is the largest
  fill in the game.
