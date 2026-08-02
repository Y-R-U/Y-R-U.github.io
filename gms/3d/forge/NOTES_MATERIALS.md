# NOTES — materials & lighting

Owned files: `js/world/materials.js`, `js/world/lighting.js`, `js/world/textures/*`.
Tools added here: `tools/ratio.mjs`.

## Round 3 — what changed

The round-2 verdict was "a flat, untinted ambient fill with a token directional light bolted on,
so nothing in any frame is ever occluded by anything else". That was accurate. Every fix below
is a consequence of it.

### ★ The "no shadows below 15° elevation" bug — it was never the shadow map

Reproduced, then ruled the shadow camera out: at `time=17.6` the shadow map is bound, the
camera fits, and rendering the same frame with `shadows=off` differs on **37% of pixels**.
Rendering with the fill and env forced to zero shows a correct, hard-edged, full-length shadow
across the whole street. The shadow was always there.

What was wrong was `lerp(1, 2.6, lowSun)` on the fill. A grazing sun leaves every surface at
N·L ≈ 0.2, so round 2 lifted the ambient 2.6× to stop dusk going muddy — which put so much
untinted light into the shadowed half that the shadow and the lit surface landed at the same
value. Measured lit-to-shadow was **1.69 : 1** at dusk. You cannot see a 1.69 : 1 shadow.

The fix is a gain on **key and fill together** (`expo`, up to 2.7× at a low sun) instead of on
the fill alone. Same overall level, ratio untouched. Verified across the whole sweep — shadows
now render and read at every hour:

| time | elevation | key | fill | lit:shadow |
|---|---|---|---|---|
| 06:30 | 11.4° | 10.18 | 1.55 | 5.16 : 1 |
| 12:00 | 54° | 5.15 | 0.62 | 2.47 : 1 |
| 16:00 | 27° | 6.4 | 0.83 | 2.27 : 1 |
| 17:36 | 10.3° | 10.65 | 1.66 | 3.40 : 1 |

**`tools/ratio.mjs` measures this.** It renders a scenario twice, once with `shadows=soft` and
once with `shadows=off`, and compares the two *on the pixels the shadow map darkened* — so lit
and shadow are read off the same surfaces rather than off whatever happens to be in frame.

```bash
node tools/ratio.mjs --shot=wall_day
node tools/ratio.mjs --shot=street_dusk --set="time=6.5"
```

Do not go back to eyeballing this. It is the number the whole rig hangs off.

### Sun and sky disagree; ambient cut

- Key stays warm (`SUN_LUT`), but the low end **desaturates** rather than saturating — round 2
  ran a 0xff7038 sun at 5°, which painted the whole dusk frame brown. The reference dusk light
  is a pale warm cream, not orange.
- Fill target is cool **relative to the key**, which is not the same as blue. At a high sun it
  pulls to `#7fa8d8`; at a low sun to `#bf9bd6`, because at dusk the sky genuinely is the pink
  one and pulling the fill toward a midday blue paints the frame the wrong colour.
- `skyFill` 0.34 → **0.11**, `envPower` 0.18 → **0.28**. The fill came down hard; the env went
  *up*, because the env is the PMREM sky and it lifts shadows with the sky's own hue. That
  trade is what puts the shadow floor where the plates have it without flattening the ratio.

### Contact skirt (wall side)

`js/world/textures/groundfield.js` bakes a 256×200 R16F lookup of `heightAt(x, z)` (0.1 MB,
tracked). `project.js` samples it and darkens by height *above the terrain*, not world y — a
building on a slope has to darken along the line where it actually meets the hill:

```glsl
float pSk = pSkirt.x * exp2(-clamp((vPPos.y - pGy) * pSkirt.y, 0.0, 9.0));
diffuseColor.rgb *= mix(vec3(1.0), vec3(0.30, 0.34, 0.30), pSk);
```

Roughness rises with it, so the base reads damp as well as dark. On for `wall`, `trim`, `wood`;
off for `ground`, `road`, `glass`. Knob: `wallSkirt`. Cost is one extra fetch on surfaces that
already do three, and it only compiles into the shaders that use it (`proj:<mode>:<skirt>`).

**SSAO was not attempted.** There is no post stack and no way to add one without editing
`engine/app.js`, which this round did not own — `renderer.render()` is called directly from the
loop. The ground side of contact occlusion is already handled by terrain's `contactAO` decal
mesh; this covers the wall side. If a composer ever lands in `app.js`, half-res SSAO is still
the better answer for object-to-object joins, which neither of these two reaches.

### Breaking the tile repeat

A second noise layer at ~7× the tile period (`pGrunge`), multiplied over albedo and added to
roughness. It runs **up** the facade as well as across it — an XZ-only field leaves a tall wall
with no vertical variation. Per-building drift pushed harder too: value 0.17 → 0.23, hue
0.07 → 0.10. In-shader rather than a second texture, because tex memory is at 50 of 60 MB.

### Night

Four things together, and it needed all four:

1. **Roof albedo floor.** `ROOF_FLOOR = 0.30`. Round 2 scaled roofs to 0.62 × their zone's wall
   value with no floor, which put the dark zone's slate at 0.085 sRGB — 0.008 linear. Below
   about 0.05 linear a roof plane returns the same near-zero at *every* orientation, so a
   district of them merges into one black mass and no amount of light recovers it. Roof means
   are now light 0.41 / neutral 0.34 / dark 0.30 against walls of 0.60 / 0.51 / 0.24.
2. **`normalise()` in `surfaces.js`.** The tile shading inside `roof()` multiplied the authored
   colour down by an amount that depended on the tile *kind*, so an authored roof colour and
   the roof you saw were two different values. Roofs now normalise to an explicit mean, which
   is what makes the floor above mean anything.
3. **Moon as a real cool key.** `moonPower` 1.5 against a 5.6 day sun — the ~10% the critique
   asked for, and enough that roof planes at different orientations separate.
4. **Fill lifted and saturated.** `nightLift` 3.2, night fill target `#3d78f2`. The old
   complaint that "terrain stays green while buildings sit near-black" was not a ground-vs-
   building inconsistency — the terrain's albedo is 0.43 and the roofs' was 0.09.

Window panes now scale with it (`windowGlow`, default 3.2) or the warm glow drowns in the
raised ambient. `windowPower` 26 → 38 and `windowReach` 11 → 13 so a pane pools onto the ground
rather than only rimming the stone around it. Three's point light is already inverse-square
with a range window; the reach only sets where it is cut off.

### Aerial perspective

Fog density up (1.5 → 1.6 base) and **2.2× at a low sun** — a grazing sun means a far longer
path through the atmosphere, and that haze is most of why the reference dusk plate has nothing
black anywhere in it. Fog colour leans harder on the horizon band.

The sky's broad glow skirt widens at a low sun (`broad`, 0.05 → 0.26). It stays narrow at
midday for the reason round 2 found: a wide skirt covers most of the dome, the PMREM irradiance
comes out warm everywhere, and shadowed faces can never read cool. At dusk it is the only cue
in a frame whose camera is not pointing at the sun that there is a sun at all — which is what
the critic meant by "there is no light source in this image".

Height fog was **not** added. It would need a `ShaderChunk` monkey-patch to reach `scatter.js`'s
foliage materials, which are not built through `getMaterial`, and getting it half-applied would
look worse than not having it.

## Numbers

Lit-to-shadow, measured with `tools/ratio.mjs`, before → after:

| | round 2 mean | round 3 mean | round 3 median |
|---|---|---|---|
| wall_day | 2.44 : 1 | **3.43 : 1** | 7.4 : 1 |
| street_dusk | 1.69 : 1 | **2.78 : 1** | 2.5 : 1 |
| creek_day | 1.77 : 1 | **2.38 : 1** | 2.7 : 1 |
| town_night | 1.27 : 1 | n/a (moon key) | |

The mean is dragged down by penumbra: 15% of `wall_day` is now touched by the shadow map (was
9.7%), and most of that new area is soft edge. The median tells you what a shadow actually looks
like where it is solid. The numbers also move with the scene — terrain and scatter changed under
this work several times — so re-measure rather than trusting the table.

Whole-image luminance percentiles and blue/red mean, ours vs the plate each shot is judged
against (800×450):

| | p5 | p25 | p50 | B/R | | plate p5 | p25 | p50 | B/R |
|---|---|---|---|---|---|---|---|---|---|
| wall_day | 36 | 73 | 150 | 1.15 | vs `_03` | 33 | 76 | 112 | 1.02 |
| street_dusk | 27 | 40 | 62 | 0.75 | vs `_05` | 50 | 62 | 100 | 0.91 |
| creek_day | 45 | 96 | 132 | 0.97 | vs `_00` | 44 | 67 | 89 | 0.89 |
| town_night | 18 | 30 | 44 | 4.19 | vs `_04` | 26 | 34 | 49 | 4.67 |
| gate_night | 5 | 14 | 24 | 5.75 | vs `_08` | 6 | 17 | 37 | 4.94 |

Round 2's shadow floor was p25 = 54 / 16 / 7 on wall_day / street_dusk / town_night. That was
the whole problem. **Nothing in a Tiny Glade frame is crushed** — the plates carry their look on
hue separation and aerial perspective, not on a black point.

To reproduce the plate side: `sips -s format png <plate>.jpg --out /tmp/x.png`, then any script
that reads the PNG and reports percentiles. The plates stay outside the repo; nothing was
copied into `site/`.

**Perf gate, headed, `--preset=medium --dpr=1 --w=844 --h=390`, `town_night` (worst case):**

| Metric | Budget | Measured |
|---|---|---|
| GPU p95 | < 11 ms | **7.7 ms** |
| CPU p95 | < 6 ms | **2.5 ms** |
| Draw calls | < 150 | **44** |
| Triangles | < 350k | **289k** |
| Texture memory | < 60 MB | **50.2 MB** |

The heightfield costs 0.1 MB. Texture budget is otherwise untouched and is still the binding
constraint — wall is 1024 (32 MB of the 50), ground 512, roof/road/glass 256. **Check `texMB`
before adding a surface.** If a future round needs a real detail/grunge map rather than the
in-shader one, say so; it does not fit at these resolutions.

## Contract

`getMaterial(zoneId, surface)` unchanged; `wall trim roof road ground wood crest glass` all
resolve. Exports: `glassMaterial`, `windows`, `setEnvIntensity`, `setVariation`,
**`setGroundField`**, **`setSkirt`**, `disposeAll`.

New knobs: `moonPower`, `windowGlow`, `wallSkirt`. Changed defaults: `sunPower` 4.6 → 5.6,
`skyFill` 0.34 → 0.11, `envPower` 0.18 → 0.28, `nightLift` 1.9 → 3.2, `windowPower` 26 → 38,
`windowReach` 11 → 13.

Window-light API for the building kit is unchanged from round 1 — `windows.add(mesh, {...})` /
`windows.addAt(worldPos, {...})`, `normal` must point **out** of the building, `windows.clear()`
before rebuilding. `discover()` is still the fallback that actually runs and is still guesswork.

## Things I'd like changed elsewhere

- **`engine/app.js` has no render hook.** `renderer.render(scene, camera)` is called straight
  from the loop, so there is no way to add a depth prepass or any post pass from a world module.
  A `systems[].render(renderer, scene, camera)` opt-in, or a composer, would unlock SSAO — which
  is the only remaining answer for object-to-object contact occlusion.
- **`scatter.js` builds its own `MeshStandardMaterial`s** (`foliageMat`), so nothing done in
  `project.js` reaches the foliage. Anything that has to be uniform across the whole frame —
  height fog, a global grade — has to go through `THREE.ShaderChunk` instead, or foliage has to
  come through `getMaterial`.
- **`zones.js` roof colours are being overridden in two places now** (a value floor and a mean
  normalisation). If the authored values should be the real ones, they need to move into the
  bands `roofCfg()` enforces. The dark zone's roof is now slightly *lighter* than its wall,
  which is what a slate roof on a basalt wall actually looks like but is not what the file says.
- Scenario cameras still do not sample terrain height beyond a 2.2 m clamp; terrain churn can
  still bury a shot.

## Known limits

- Changing `texCap` rebuilds every texture (~0.6 s); `aniso` is live.
- The sky redraw is ~20 ms of JS at 1024×512, only on `time` / `cloudCover` change.
- The heightfield is 1.25 m per texel. Fine for the skirt, which falls off over 0.5 m of
  *height*, but it will not follow a sharp terrain lip.
- `street_dusk` at 17.6 puts the sun almost exactly broadside to a street that runs north–south,
  so nearly the whole street is legitimately in one building row's shadow. The frame reads now,
  but it will never have the raking light the reference dusk plate has without either a
  different hour or a different street angle — both live in `demo.js`.
- The deepest 10% of shadow still sits around 19:1 against the lit surface. That is dark-zone
  material under an eave with neither sky nor key; it is the last crushed thing in the frame.
