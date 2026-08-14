# Track A, phases A2–A5 — engineering notes

What a successor needs that does not belong in `WORLD.md`. `WORLD.md` carries the spec and has been
corrected where these measurements contradicted it; this file carries the working record.

Tools added in this stretch:

| tool | what it answers |
|---|---|
| `tools/camfit.mjs` | does the camera arm fit? Per room: core fraction per axis, headroom under the ceiling, how far the camera pokes into a wall, whether it ever leaves the shell. Plus the outdoor door soak. `--set=` passes knob overrides through the URL so any constant can be A/B'd without editing code. |

---

## A2 — camera fit and the ceiling collider

### What landed

`player.js` §2.7 constants, with two deviations from the spec (below), plus three new knobs
(`camHeightIn`, `camPitchIn`, `camArmMin`) so every camera number is tunable from the panel.
`doors.js wallColliders()` gained a fifth slab: the lid.

### The two numbers that are not what `WORLD.md` §2.7 asked for

**`dist` (outdoor arm) 6.2 → 7.2, not 8.0.** This is the `BUILD_PLAN.md` decision, not a
measurement. It stays a knob and is the first thing to tune on the phone.

**`armMin` stays 0.40. §2.7's 0.60 is wrong and was measured to be wrong.** The reasoning in §2.7 —
"the hard floor scales with the world" — does not hold, because the two dimensions that bound
`armMin` both deliberately did *not* scale:

```
interior.js walkable inset   0.42 m   (a shoulder, not a wall — §2.8 says explicitly it is unscaled)
player.js   camRadius        0.26 m   (a camera property — §2.7 says explicitly it is unscaled)
```

Pressed against a wall, the arm ray is clipped at `0.42 − 0.26 = 0.16 m`. Any `armMin` above
`0.42 / cos(0.26) = 0.435` pushes the camera *out through the wall face it was just clamped
against*. Measured at `armMin = 0.60`: the camera pokes **0.16 m into a 0.51 m wall panel** in every
one of the 25 rooms, and picks up **3 new cases of "camera inside a building"** in the outdoor door
soak that do not exist at 0.40. At 0.40 both numbers are zero. The knob range is 0.2–1.2 so it can
still be pushed if someone wants to.

### Measured, `node tools/camfit.mjs --step=0.6` (25 room/levels, 12 headings, 2 pitches)

| | target | measured |
|---|---|---|
| core along x | ≥ 60 % | **73.2 % mean**, worst room 61.1 % |
| core along z | ≥ 60 % | **63.8 % mean**, worst room 50.0 % |
| arm at full length, all headings, whole floor | — | 67.3 % (was 30 % at K = 1 per §2.3) |
| camera outside the shell | 0 | **0 of 25** |
| camera poked into a wall panel | 0 | **0.000 m** |
| least headroom under the ceiling | > 0 | **+0.22 m** (door 11's loft, 3.54 m ceiling) |

The **z axis misses 60 % in six of the demo's rooms** and that is expected rather than a failure:
§2.5 solved the 10 m house minimum for the *width* axis only. Depth defaults to `10.5`, whose core
is `2 · (5.25 − 0.60 − 2.349) / (2 · 4.23)` = 54 %. To hit 60 % on both axes the `house` depth
default would have to go to about 12.5 m. **Not changed** — that is a §2.8 number and a spec change,
and the rooms it affects are the demo's, which A8 replaces. Flagged for A8: **author dwellings
nearer square than 12 × 10.5 if the depth core matters.**

### The ceiling collider

One horizontal slab at `oy + I.top`, 0.30 m thick, spanning `rx + th` × `rz + th`. Deliberately at
`I.top` (the shell) and not at the level's own ceiling:

- **Ground floor of a loft house is already safe without it.** Max eye is `heightIn + distIn·sin(pitchMaxIn) + camRadius` = 2.05 + 1.007 + 0.26 = **3.32 m above the floor**, and the deck sits at `roomH + 0.33 ≥ 3.73 m`. Never reached.
- **Upstairs is not safe.** `roomH2` floors at 3.00 m, so the eye wants to be 0.32 m through `ceil2`. That is what the lid catches.
- A slab at the deck instead would block the camera during the scripted climb, because the deck has a stairwell hole in it and a box does not.

Proof it works: `camfit --set="camPitchIn=0.9"` drives the eye **0.418 m above the ceiling** and
still reports **0 escapes**. Without the lid that is the camera outside the roof.

### The outdoor door soak — 165 failures, all pre-existing, all one cause

21 doors × 12 headings × 3 arm lengths. 165 cases put the camera inside a collider box, at doors
4, 6, 11, 13 and 20 — and at exactly those five doors **the player's own head, standing at the door
approach, is already inside a neighbouring object's padded box** (`aim in 22 / 21 / 57 / 40 / 74`).
When the ray starts inside a box the arm collapses to `armMin` and the camera has nowhere legal to
be. 36 + 36 + 21 + 36 + 36 = 165: every failure is one of those five doors.

Identical count at the pre-A2 constants (`--set="camDist=6.2&camHeight=1.6&camDistIn=1.45&…"`), so
**A2 introduced none of them.** It is the demo layout being crowded at K = 1.5, which
`WORLD.md` Phase 1 predicted in as many words. It disappears when A8 authors real towns; the
regression test to keep is "the count does not rise".

### The 9 m Blackstone terrace — verdict: build at 9 m

The spring arm was analysed against a 9 m step. Two cases:

- **Standing on the upper terrace at its edge** — no problem at all. `player.js`'s ground clamp only ever pushes the camera *up*, and the camera is already above the terrace it is standing on.
- **Standing at the foot of the retaining wall** — this is the failure. `groundAt` behind the player returns the terrace top, `camFloor` becomes `feet + 9.7`, and the old code did `back.y = max(back.y, camFloor)`, **stretching a 7.2 m arm into a 9.7 m one**. A stretched arm then rays over the top of the retaining wall instead of into it, and the camera lands on the terrace above looking down.

Fixed in `player.js`: the lift now **swings the camera up the sphere of radius `dist`** instead of
stretching the arm — the horizontal offset shrinks by `sqrt(dist² − dy²) / (cos(pitch)·dist)` as y
rises. Worst case at the foot of a 9 m wall is now the camera going overhead at the correct arm
length, which is what a third-person camera is supposed to do at the base of a cliff. This also
fixes ordinary hills, where the arm used to grow silently and `armMin`/`clear` were being compared
against a length that was no longer `dist`.

**So: build Blackstone's terraces at 9 m.** No fallback to 6 m. If it still fights on the phone the
lever is a lower `camDist` on the terraces, which is a knob and therefore legal.

Caveat: this was analysed and simulated, not measured against real 9 m geometry, because the
geometry does not exist until A4/A5. **Re-run `tools/camfit.mjs` against Blackstone the moment A8
places it.**

### The `street_dusk` vertical seam — characterised, not fixed

It is **real**: a hard **5–6 % luminance step** (84 → 79 at 1600 × 900, rows 560–660) at image
column 799/800, sharp within ~3 px, over a region 20 px wide either side. Not noise, not a crease.

It is **a world feature at x = 0**, not a framebuffer artefact. Yawing the camera to `lookAt(8,4,−26)`
moved the step from column 800 to column **701**; the predicted projection of world x = 0 under
that yaw is 800 − 864·tan(atan(8/70)) = **701**. One pixel.

**A1's decal changes did not cause it.** `forge_test/NOTES_TERRAIN.md` §"Still open" records it from
round 3 of the test bed — *"There is a faint vertical seam down the centre of the road in
`street_dusk`… Unresolved"* — which predates the split into `forge/` and therefore predates A0 and
A1 entirely. Confirmed independently: `groundAO=0` (which zeroes the decal material's alpha) leaves
the step unchanged.

Ruled out by measurement, each a separate render:

| suspect | test | result |
|---|---|---|
| contact-AO decals | `groundAO=0` | unchanged |
| foliage | `foliage=0` | unchanged |
| shadow map | `shadows=off` | unchanged |
| stone variation noise | `stoneVary=0` | unchanged |
| wall contact skirt | `wallSkirt=0` | unchanged |
| road texture tiling | `pScale` forced to 1/3.7 (from 1/2.4) | **same pixel, same size** — not the 2.4 m tile |
| road vertex-colour alpha ramp | `material.vertexColors=false` | unchanged |
| ground zone material groups | raycast either side | same mesh, **same `materialIndex`** |
| ground vertex colour | attribute dump across x = 0 | continuous, no step |
| ground vertex normals | attribute dump across x = 0 | continuous, a kink not a step |

**Localised to the road ribbon.** Hiding the three `road` meshes removes the step entirely and
leaves a smooth luminance ridge peaking at the same column. The ground alone shows the same feature
as a soft 1.4-unit ridge; the road turns it into a 5-unit step.

**What sits underneath it.** The terrain has a genuine gradient extremum along the whole plane
x = 0. Ground face normals step from `nx ≈ 0` for x > 0 to `nx ≈ −0.03` for x < 0, and the road
ribbon's own vertex normals reproduce that pattern in every cross-section row — its cross-stations
are ~1.15 m apart, so it samples a smooth extremum coarsely and turns it into a sharp kink.

**Why the extremum is there, and the standing suspicion.** Every noise term in `wild()` uses an
**integer phase offset**:

```js
3.1 * fbm(x*0.0072,     z*0.0072,     3, 11)
1.15* fbm(x*0.025 + 3,  z*0.025 - 7,  2, 29)
0.32* fbm(x*0.083 - 5,  z*0.083 + 2,  2, 47)
      fbm(x*0.010 + 9,  0.31,         2, 61)
      fbm(x*0.013 - 4,  0.77,         2, 73)
```

`vn()` interpolates with `t²(3−2t)`, whose derivative is **zero at both ends of a cell**. So value
noise is flat at every lattice node — and because every offset above is an integer, **every term and
every octave has a lattice node at exactly x = 0.** The flat spots coincide and the field gets a
coherent gradient extremum running the full 300 m of the map along x = 0.

**Not fixed here, deliberately.** The fix is one line — an irrational phase offset inside `fbm()`,
or non-integer offsets on each term — but it re-rolls the noise for *every* consumer (terrain,
ground colour, zone boundaries, road width, foliage placement), so every render in the repo moves.
`wild()` is replaced wholesale by the region profile in A4. **Do it there, and keep the rule:
never give a noise term an integer phase offset, and never let two terms share a lattice node.**

One contributing cause *was* found and fixed here, and it is a separate bug: `padAt()` interpolated
between town centres with `lerp`, so `heightAt` had a true C1 break along every town-centre column
wherever `townMask > 0`. Now `smoothstep`, whose derivative is zero at both knots. Measured effect
on the five renders: triangle and call counts identical, no measurable change to the seam — so the
seam was never `padAt`. The fix stands on its own merits.

**Remaining unknown:** why the road turns a smooth extremum into a step sharp within 3 px rather
than a kink spread over its 1.15 m station spacing (≈ 70 px at that depth). Everything measurable
about the road's geometry and attributes is continuous there. Next things to try: dump the road's
triangulation around x = 0 looking for a self-overlap of the transparent ribbon at the polyline
bend at (−1.8, 31); and re-test after A4 re-phases the noise, which may simply make it go away.

### Phone fill-rate test — ready for Aaron, not blocking

See `docs/PHONE_TEST.md`. Five minutes, four numbers, and one A/B that actually discriminates
fill rate from geometry.

---

## A3 — world extents

`X0/X1/Z0/Z1` are −720/+720/−400/+320. `terrain.js` exports `BOUNDS` (the mesh) and `PLAY` (the
mesh inset 40 m), and `player.js` clamps to `PLAY` instead of the hardcoded ±145 / −100…108.

### The audit — what was actually sized to the old world

| thing | verdict |
|---|---|
| `camera.far` = `viewDist × 3` | **fine.** 540 at medium, 780 at high, 1200 at ultra. Fog is at 97.5 % by 300 m at medium, so the far plane is never the thing you see. |
| `app.js` far ceiling 2000 | **fine**, never reached. |
| `FogExp2` density `1.15·amt/max(40, viewDist)` | **fine, and it is the culling budget.** Not touched. |
| Shadow camera | **fine, and the §5 audit table was worrying about nothing.** `shadowCentre()` fits a sphere to *the view frustum out to `shadowDist`*, not to the world, so it was never sized to 300 × 224 m and does not care that the world is now 21× the area. |
| `shadowDist` at medium | **80 → 60**, as §2.8 asks. Not a world-extent change — it is the K = 1.5 change: the same 1024² map now has to cover 1.5×-taller casters. |
| `CAMERAS` / `nearCamera` / `inCorridor` | still correct; the scenario positions move at A4 with the towns. |
| Occupancy grid `GS` | **1 → 2.** See below. |
| `WALK.cell` | already 12 (A1). |
| `Colliders.hit()` iterating all boxes | **indexed.** See below. |

### `GS` 1 → 2

At GS 1 over 1440 × 720 the grid is **1.04 M cells** — a 1 MB `Uint8Array`, a 4.2 MB `Float32Array`
and a two-pass separable blur over a million cells at every boot. At GS 2 it is 260 k cells.

This costs nothing visible: the grid feeds the ground *vertex colour* AO and the scatter keep-out,
and the ground vertices that sample it are 2.9 m apart at their finest — GS 2 is still four times
finer than its consumer. The AO source is also already blurred with a 5-cell kernel and falls off
over `smoothstep(4.8, −0.3, d)`.

`WORLD.md` §6.5's real answer is **per-patch grids at GS 1**, which needs patches, which is A4's.
GS 2 is the holding position.

### `Colliders.hit()` broad phase

Was 82 slab tests per camera frame and would have been ~550 at three towns. Each box now carries
its centre and bounding-sphere radius, and the ray loop rejects anything whose sphere is further
from the arm's origin than `radius + pad + best`. The arm is at most 12 m, so at three towns this
drops it to a handful. Correct because no point of the padded box can be within `best` of the
origin if the centre is beyond `radius + pad + best`.

### Measured

| | before A3 | after A3 |
|---|---|---|
| `wall_day` main | 322 k | **347 k** |
| `street_dusk` main | 318 k | **342 k** |
| `gate_night` main | 185 k | **211 k** |
| `town_night` main | 321 k | **346 k** |
| `creek_day` main | 314 k | **338 k** |
| draw calls | unchanged | unchanged |
| boot | — | **605 ms** |

**+25 k triangles, flat across all five** — about 14 k of extra ground (the mesh went 7 820 → 15 029
vertices) and about 9 k of extra water (`buildWater` walks `X0 → X1` in 2.6 m steps, so it went from
116 stations to 554). Both are §6.2's to reclaim: the coarse world mesh and the ten-segment river.
Neither is culled today because each is one mesh spanning the map — this **does not make A7's job
harder**, it is the same structural problem at a larger radius.

`node --test` 217/217 green.

### Verified

- 4 000 random points across the playable box: **no NaN, ground everywhere, all four corners solid.**
- 12 000 headless walk steps across the whole world: **zero cases of the feet below the terrain.**
- The five renders were looked at. The world reads much better than it did — there is a horizon of rolling hills now instead of the map ending, and nothing tears or floats.

### The one thing this broke, and it is A4/A5's to fix

**`surfaceY` and `heightAt` now disagree by up to 6.57 m**, against `WORLD.md` Phase 4's
requirement of 5 cm. All of it is the creek:

| region | max disagreement | mean |
|---|---|---|
| the old content box (\|x\| ≤ 150) | 0.96 m | 0.025 m |
| the new countryside | 3.96 m | 0.154 m |
| the creek band, whole world | **6.57 m** (at x = 346) | 0.306 m |

The cause is exactly `NOTES_TERRAIN.md` §1 at a larger scale. The Z grid still has its 1.15 m fine
band through `z ∈ [33, 79]`, which resolves the channel *across* the flow — but the new X columns
are 24 m apart, and `creekZ` moves up to 0.295 m per metre of x, so over one 24 m column the channel
centre shifts 7 m, which is more than its 4.2 m half-width. The channel is aliased away in x.

Nothing reads it today (there is no content out there, and the player's feet follow `surfaceY`), but
it is why the headless walk sees a 4.27 m step in one metre out in the countryside. **The fix is
§6.2's, and it is the plan already**: build the world mesh *without* the channel term and let A5's
arc-length bank ribbon carry the trench. Do not try to make a 24 m grid hold a 10 m channel.

---

## A4/A5 resumed — the second pass

Picking up after the `CHANNEL(x)` interruption. The two NaN call sites were already fixed before
this session started; everything else that phase touched was unverified and most of it has now
changed.

### `js/world/field.js` — the analytic world, extracted

`terrain.js` imported `three` at line 4, so nothing in it could be measured from node. Everything
analytic now lives in **`js/world/field.js`**, which imports only `textures/noise.js` (pure) —
heights, the Vail, the towns, the grid axes, the roads, the crossings. `terrain.js` re-exports the
lot, so no other module changed an import. **`tools/fieldprobe.mjs`** is the measurement harness;
run it before and after any change to the field, it takes 2 s.

This is what makes the rest of this section numbers rather than opinions.

### The 6.57 m `surfaceY` / `heightAt` disagreement — fixed, and here is the shape of the fix

The plan recorded at the end of the A3 section was right and is what landed:

```
landAt(x, z)   the land, with no channel in it        → the coarse world mesh is built from this
carve(x, z)    how far the river cuts below the land  → zero outside the banks
heightAt       landAt + carve                          the analytic truth
surfaceY       grid sample + carve                     the rendered truth
```

Because both truths carry the *same* `carve` term, the river contributes **exactly zero** to the
disagreement — it cancels. What is left is only the coarse grid's own interpolation error against
a smooth field, which is a tractable problem. `carve` is also zero at the bank edge by
construction, so the bank ribbon meets the world mesh with no step to hide.

Measured, 40 000 random points, `node tools/fieldprobe.mjs`:

| band | mean | p90 | p99 | max |
|---|---|---|---|---|
| **town** (inside any `TOWNS` footprint) | 0.005 m | **0.009 m** | 0.092 m | 0.160 m |
| **river** (inside the banks) | 0.003 m | 0.001 m | 0.073 m | 0.222 m |
| **open countryside** | 0.018 m | 0.042 m | 0.160 m | 0.477 m |
| whole world | 0.015 m | 0.039 m | 0.149 m | 0.477 m |

Against A3's 6.57 m max / 0.306 m mean in the creek band. **Phase 4's 5 cm is met at p90 in town
and beaten by 50× in the river band; it is not met at the tail.** That is a real limit and worth
stating plainly rather than tuning until a number goes green:

- The **grid is 4 m over the three towns and 10 m between them.** Linear interpolation of a field
  with content at wavelength *L* and amplitude *A* has error ≈ `h²A(2π/L)²/8`. At h = 10 that is
  0.19 m for the finest surviving term. **You cannot hold 5 cm on a 10 m grid** unless the field
  is smooth at 40 m, and a world that smooth has no countryside in it.
- Two changes bought most of the improvement and both are worth keeping. **`detail()` lost its top
  octave on two of its three terms** (3→2 and 2→1) so nothing in the field is finer than a 38 m
  cell — relief the mesh cannot hold is relief that only shows up as disagreement. Micro-relief is
  the ground texture's job. And **the Z axis lost its 2.0 m river band and its 20 m outer bands**:
  the ribbon carries the river now, and 20 m in Z was the single largest error source (1.0 m).
- Grid is **274 × 131 = 35 894 verts / 70 980 tris**, against A3's 297 × 133 = 39 501 / 78 208.
  Finer *and* cheaper, because the fine bands now follow the towns rather than a river band that
  no longer needs one.

What is still over 5 cm, and why each is deliberate:

| feature | error | why |
|---|---|---|
| Blackstone's terrace risers | ~0.16 m | a 9 m step in 26 m. Widened from an 18 %-of-band riser (12 m, 0.5 m of error) to a **fixed 26 m in metres** — `riser` is now a field on the town record, because it is the number the grid has to resolve, not a fraction of a footprint that A8 will change. |
| the corridor lip at x ≈ −376 | 0.48 m | the flood-plain edge crossing the 4 m → 10 m grid seam. One point in 40 000; p99 in the open is 0.16 m. |

**Anything that seats geometry should read `surfaceY`, not `heightAt`.** That is the real answer
to the tail and it costs nothing.

### The town z-centres moved, and `data/areas.json` is now a complete world contract

`TOWNS` is at **(−520, −60) / (0, +40) / (+520, −80)** with §1.3's footprints, per the standing
decision. Two things follow that were not obvious:

- **`pad` is now metres above the valley floor at the town's own x**, not an absolute height.
  §1.3 says "+22 m / +2 m / +30 m" and those are now literally the numbers in the table. As
  absolute heights, Longacre's old `pad: [5]` was **below `waterY(0) = 4.84`** — the town centre
  was under the river and only `natural()`'s "never below the water line" clamp hid it.
- **`PAD_KEEP` 0.25 → 0.12.** The pad leaves that fraction of the natural relief behind. At 0.25,
  with the Vail's valley wall now inside Whitewall's footprint, the town centre sat 5 m below its
  own shelf and the inner 60 % of the town had 11 m of relief in it. At 0.12: **0.94 m**.

`data/areas.json` was rewritten by the content agent partway through this session and is now a
**complete** world contract — 80 areas, all three towns, both roads, every fishing stand, every
crossing. It is far better than what `WORLD.md` §1.2's ASCII map says and it is self-consistent.
**It is what the river and the roads are now built from.** `tools/fieldprobe.mjs` reads it and
reports relief / worst slope / points under water for every area, so a conflict between the
geometry and the content shows up as a number.

### `RIVER_CP` — reconciled, and neither existing list won

Three candidates were on the table: the list in `terrain.js`, the list in `WORLD.md` §4.2, and
`data/areas.json`.

- **`terrain.js`'s list is wrong.** It ran the Vail through the far south (z = 236 at the head,
  z = 4 at x = 330) and put the ford at x = 200 and the span at x = 400 — but it *kept* §4.3's
  x = −286 and x = −34 for the two bridges. It is a half-converted list.
- **`WORLD.md` §4.2's list is closer** and matches the ASCII map's crossing columns, but it puts
  the river at z = 112 at x = −520, which is 100 m from `reach.light` and 130 m from
  `wwa.fishsteps`. STORY.md §"Dock and fish steps" says the fish steps are *the south gate to the
  Vail*. The map loses.
- **`data/areas.json` wins.** It names the Whitespring, four fishing stands, the mill leat and all
  four crossings as points, and a river is a curve through named points — which is the entire
  argument for making `creekZ` a spline in the first place.

The list is now 31 control points threaded through: the Whitespring (−660, 184) · the chalk stand
(−600, 159) · the fish steps (−512, 124) · the low stand (−440, 106) · the east stand (−318, 50) ·
**Downs Bridge (−286, 38)** · the mill leat (−48, 104) · **Millbridge (−34, 119)** · the quiet
stretch (150, 100) · **the Hollow Ford (200, 62)** · **Blackspan (400, 30)** · the cistern intake
(497, 80) · the dry stand (560, 108). Z range −? to +222: **the Vail crosses the line of travel
four times**, which is the property §4.2 was arguing for.

The wobble term dropped 7 m → **5 m**: the named stands are 10–14 m across and the river has to
stay inside them.

`WORLD.md` §4.2, §4.3 and §4.4 have been corrected to match. **`FORD_X` 252 → 200, `SPAN_X`
348 → 400.**

### Other field changes, each with the measurement that forced it

- **`creekBank` is a function of x alone.** It was briefly a function of the query point's own land
  height, which is a bug: the bank width decides where `carve` stops, so if it varies *across* the
  section the cut is discontinuous along its own edge. The ford gets a 10 m wider shoulder
  (`bell(x, FORD_X, 60)`) — without it the King's Road climbed a 1:1.9 bank out of the water.
- **The flood plain is `corridorW(x)`, 30 m in the Downs and at the gorge, 140 m across the valley
  floor**, and the climb out of it is `30 + 3.2 × depth` metres of run. The old constant 155 m
  swallowed Whitewall whole the moment the Vail was routed past its south gate, and the old fixed
  transition put a 27 m drop in 39 m, which is where the 1.0 m disagreement at (686, 171) came
  from.
- **The gorge is the absence of a flood plain, not a deeper one.** The first attempt lowered the
  plain by 8 m below the datum at `GORGE_X`; that runs straight into `natural()`'s "nothing outside
  the channel may sit below the river surface" clamp and produced a **0.8 m** bank. Switching the
  corridor *off* over an 78 m bell instead lets the basalt uplift reach the water's edge on its
  own: **Blackspan now stands 14.51 m above the water**, which is WORLD.md §4.3's "14 m above the
  water" to 3 cm and was not tuned to it.
- **The town mask releases at the river**, `smoothstep(bank, bank + 26, |z − creekZ|)`. The Vail
  runs inside both Whitewall's and Blackstone's footprints; a pad that ignored it flattened the
  water away.
- `waterY`'s two steps moved to the features they belong to: the weir to `smoothstep(−32, −12)`
  (the mill is at x = −26…−6) and the cascade to `smoothstep(392, 428)` (the head of the gorge).
  Total fall **11.93 m over 1440 m, 0 ponding stations, 0 dry centreline stations, deepest 4.50 m.**

### The roads — built, and this is the first time they have existed

Five, all in `field.js` `ROADS`, all Catmull-Rom through control points taken from `areas.json`:

| road | measured | width |
|---|---|---|
| **King's Road** — east gate (−408, −66) → Downs Bridge → south bank → Millbridge → the square → Ash Gate → Hollow Ford → south bank → Blackspan → west gate (411, −80) | **1085 m** | 18 |
| **Drove Road** — (−470, −248) → the hillfort → the beacon (−40, −280) → (470, −242) | 946 m | 8 |
| spur_light — Whitewall north gate → the Drove | 133 m | 10 |
| spur_neutral — Longacre north → the beacon | 214 m | 10 |
| spur_dark — Blackstone north gate → the Drove | 97 m | 10 |

1085 m against §1.1's predicted 1078 m — 0.6 % out, so the 101 s / 115 s journey times in §1.1
stand. Worst adjacent-station height step off the crossings is **0.30–0.57 m** on the Drove and
the spurs. On the King's Road it is 8.27 m at (403, 23), which is Blackspan: the road there is on
a bridge deck 14 m up, and the ground under it is the gorge.

`AT(x)` control points take their z from `creekZ(x)` at build time, so a road always meets the
water where the water actually is, wobble included.

### Still to do in this pass

- the arc-length bank ribbon mesh (the field is ready; the geometry is not)
- the segmented water mesh
- the four crossings as geometry, and fading the road ribbon out over the bridge decks
- moving the demo scene to the towns' new z, and re-framing the five scenario cameras
- A6 schema v3, and the `quality.onRebuild` wiring

### One conflict to hand back, not fix

`data/areas.json` puts **`wwa.granary` at z −34…−14** and **`wwa.temple` (the Sanctum) at
z −32…−6**, both about 40 m north of the Vail at x ≈ −520. With Whitewall's pad 23 m above the
water there, that ground is on the lip of the chalk bluff. It currently measures **flat** because
`PAD_KEEP` 0.12 and the 26 m mask release hold the pad right out to the bank — but the margin is
thin, and any future change to the mask release will put L01's opening room on a slope.
The clean answer is A8's: give Whitewall a **second, lower riverside terrace** (`pad: [9, 22]`)
with the riser between the Sanctum Yard and the granary. Flagged, not done.

---

## A4/A5 — the geometry, and four bugs found by rendering

### `RIVER_CP` is frozen, and the reconciliation went the other way

Mid-session the manager confirmed that `data/areas.json` was built by **evaluating `creekZ` from
`terrain.js` at each x**, wobble included, for 89 areas. So the code's spline is the contract and
`WORLD.md` §4 is the thing that was wrong. The list above was reverted to `terrain.js`'s original
21 control points **verbatim**, and the wobble back to 7 m from the 5 m I had reduced it to.

The list I had derived from `areas.json`'s anchors was *not* safe even though it reproduced them:
`areas.json`'s z values already contain the wobble, so pinning control points to them and then
adding the wobble again double-counts it. Worth knowing if anyone is tempted to re-derive the
spline from the areas.

Verified against `areas.json` after the revert — `creekZ(x)` vs the area's own z:

| anchor | areas.json | `creekZ` |
|---|---|---|
| Downs Bridge | 38 | **38.2** |
| Millbridge | 119 | **119.4** |
| Hollow Ford | 62 | **62.4** |
| Blackspan | 30 | **30.0** |
| the low stand | 106 | 105.5 |
| the east stand | 50 | 48.4 |
| the chalk stand | 159 | 158.8 |
| the fish steps | 124 | 126.4 |
| the Whitespring | 184 | 179.5 |

The doc's numbers were corrected to the code's, not the reverse: **`FORD_X` 252 → 200**,
**`SPAN_X` 348 → 400**, Millbridge z 86 → 119.

The gorge did move, and it is depth rather than plan position, so no area is pinned to it:
`GORGE_X = 430` with `bell` profiles instead of the old permanent `smoothstep(330, 396)` step. The
old profile left everything east of x = 400 a 4.5 m slot, which is `reach.dark` — 250 m of *fished*
water with two named stands in it.

### The bank ribbon

`buildBanks()`. 12 segments, stations spaced **5 m along arc length** (not along x — on a bend
where `dz/dx` is 1.5 a 2.6 m x-step is a 4.7 m real step and the bank facets), 29 cross stations
per station in three zones: uniform across the channel, uniform up the bank shoulder, then a
stretched apron. A single power curve put **one** station on the shoulder, which is the only part
of the section with any shape in it.

Vertices are `landY(x, z) + carve(x, z) − sink`, i.e. exactly `surfaceY`, so the ribbon and the
prop-seating query cannot disagree. **4.5–6.0 k triangles drawn**, 19 k resident.

The world mesh drops any quad whose four corners are all within `bank + 16` of the centreline and
the ribbon runs to `bank + 46`, so there is always overlap rather than a hole. Two things about
that overlap that cost a render each:

- **The apron sinks 5 cm** over `bank … bank + 12` so the world mesh wins every coincident pixel.
  The first attempt used a `polygonOffset` clone of the ground material, which renders **flat
  grey**: `THREE.Material.copy` does not carry `onBeforeCompile`, and the entire ground look is a
  shader graft (world-space triplanar — the ground meshes have no `uv` attribute at all, so
  without the graft every fragment samples texel (0,0)).
- **The ribbon's winding was inverted and the whole thing was back-face culled.** In the world
  mesh's buffer `+1` is the x axis and `+row` is z; in the ribbon's, `+1` is the *cross* axis and
  `+row` is along-stream. Copying the ground's `(a, a+row, a+1)` therefore reversed it. The symptom
  was a 120 m grey void around Millbridge that a raycast passed straight through — and note that
  hiding the meshes to bisect it **did not work**, because `Terrain.update()` re-enables everything
  in `this.chunks` every frame. `parent.remove(o)` is the probe that works.

### The water surface

Ten along-stream segments sharing the same arc-length stations, so frustum culling has something
to work with (it was one mesh spanning 1440 m). 640–2 600 triangles drawn per scenario against
A3's ~9 k always-drawn. `creekArc` is now a binary search over the station table rather than a
fixed 2.6 m x-index.

### The bridges rotate now

`bridge()` built the deck axis-aligned in z. That was fine while the creek ran roughly along x; the
Vail crosses Millbridge at 45° and the unrotated deck spanned dry land beside the channel — clearly
visible in the first `creek_day` render. The bridge record gained **`ry`** (and `deck`, for
Blackspan's high arch), threaded through `scene.js normalise`, `build.js bridge()`, the footprint
and decal ring, and `colliders.js` (**one line, outside my file list — flagged**: the deck
collider and the two parapet colliders now take the same `ry`).

`demoScene` gives each district the crossing at its **real x** rather than a bridge at `cx`. Three
stone bridges, three districts, and the ford has no structure by design.

### Four of the five scenario cameras were broken, and it was not the towns moving

`SHOTS` x/z were already town-relative, but **y was absolute**, and `frameCamera` clamps the eye to
`ground + 2.2`. Every authored y was below the new ground, so `wall_day` sat in the grass with the
wall in the top corner and `gate_night` looked at the floor from 41 m up Blackstone's pad. **y is
now height above the ground at that point**, for both `pos` and `look`, read off `terrain.surfaceY`
rather than `heightAt`. `creek_day` was also re-aimed: its old look point, z = +160, was the creek's
line in the 290 m world and is 70 m of dry water meadow now. It looks at Millbridge.

All five re-rendered and looked at. `wall_day`, `gate_night`, `town_night`, `creek_day` all read
correctly for the first time since A3.

### The `street_dusk` seam — still there, and three more causes ruled out

Measured on the 1280 × 720 render, mean luminance of columns 628–635 against 645–652:

| rows | step |
|---|---|
| 400–470 | 4.0 % |
| 440–520 | 1.7 % |
| 520–560 | 3.9 % |
| **560–640** | **7.1 %** |
| 660–715 | 0.4 % |

A2 recorded 5–6 %. It is the same artefact and it is **not fixed**. Ruled out this session, each
by measurement:

| suspect | test | result |
|---|---|---|
| the ground mottle's integer noise phase | re-phased both terms to irrational offsets | **unchanged** |
| the road ribbon's width and edge-fade noise phases | same | unchanged |
| Longacre's district street ribbon overlapping the King's Road | dropped the duplicate (they *are* the same street) | unchanged |
| the road ribbon's `computeVertexNormals` creasing at its centre station column | roads now take the ground's analytic normal | rows 400–470 improved 4.5 → 4.0 %, rows 560–640 **identical to 2 d.p.** |

Hiding the road meshes still removes it, exactly as A2 found. The three noise re-phasings and the
road normals are all correct changes on their own merits and stay. The remaining candidate nobody
has tested is the transparent ribbon's **triangulation overlapping itself** at a polyline bend —
A2's own "next thing to try". It is a 7 % luminance step in one scenario and it is not blocking.

### Measured after all of it

| | |
|---|---|
| `node --test` | **264 / 264** |
| `node tools/camfit.mjs --step=0.6` | core-x **73.2 %**, core-z **63.8 %**, full **67.3 %**, headroom **+0.220 m**, poke **0.000 m**, escapes **0 / 25**, door soak **165** — every figure identical to A2, so no regression |
| ground drawn | 14.8–21.8 k per scenario, out of 71 k resident |
| bank ribbon drawn | 0–6.0 k, 19 k resident |
| water drawn | 0–2.8 k (was ~9 k, always) |
| roads drawn | 2.1–11.2 k |
| main-pass triangles, 1280 × 720 preset high | wall_day 347 k · street_dusk 236 k · gate_night 142 k · town_night 292 k · creek_day 306 k |

`contactAO` is **20.1 k triangles in every scenario**, drawn always, and is now the third largest
line in the budget after buildings and foliage. Nobody has looked at it. A7's.

---

## A6 — document schema v3

`SCENE_VERSION` 2 → 3. **Additive.** `BUILD_PLAN.md`'s done-when is "new types build; v2 documents
migrate; `normalise()` still rejects junk", and all three hold. `WORLD.md` §5 Phase 6's larger
shape — `districts` → `towns`, `dist` → `town` as the storage — is **deferred and it should be**:
`o.dist` is read in `editor/editor.js`, `editor/panel.js` and `world/colliders.js`, none of which
this pass owned, and renaming a field that three other files index by while two other agents are
in the tree is how you lose a day. What landed instead:

- **`town`** — the town's string id, written alongside `dist`. A7 and A8 should read this. An index
  into a list you are editing is a bug waiting to happen, which is §5's own argument.
- **`blk`** — a 60 m spatial grid id, **computed at load** from x and z, never authored. One less
  thing for a human to get wrong, and it re-derives when a building moves.
- **`lod`** — `full` | `proxy` | `auto`, defaulting to `auto`; junk falls back rather than dropping
  the object.
- The bridge record gained **`ry`** and **`deck`** (see A5 above).

### The six new types

All in `editor/build.js` as `dressing` batches of the shared kit, not builders in `buildings.js`:
none of them has an interior or a door, so they are furniture for a town rather than architecture.
**Nothing branches on zone** — the materials do that, which is the standing rule.

| type | built from | triangles at defaults |
|---|---|---|
| `mill` | gabled block + a 12-spoke overshot wheel + the launder | 608 |
| `barn` | long thatched gable, cart doors both long sides, no windows | 232 |
| `pen` | post-and-rail, posts every ~3.2 m | 660 |
| `cross` | stepped octagonal base, tapering shaft, head | 260 |
| `arcade` | piers, chamfered arch heads, a lean-to slab | 192 |
| `retaining` | battered face, coping course, buttresses every 8 m | 108 |

Built in the browser via `builder.liveObject()` and rendered — see `shots/_v3/creek_day.png`. The
mill and the barn read immediately; the pen is the weakest and is the one to revisit.

`retaining` exists specifically for Blackstone's terrace risers. The field spreads a 9 m step over
a 26 m slope because that is what a 4 m grid can hold; the wall is what makes it read as a terrace
rather than a grass ramp. **A8 should place one along each riser** — the risers are at
`cz + hd − k·(2·hd/n)`, i.e. z = −46.7 and −113.3 with the current numbers.

### Tests

`js/editor/scene.test.js`, 11 tests: v2 → v3, v1 → v3, `blk` follows position and is shared inside
a 60 m cell, `lod` kept or defaulted, all six new types round-trip with their defaults, every type
declares params/plan/tall with in-range defaults, junk rejected (three kinds), bad numbers repaired
rather than thrown, narrow houses kept with a warning, v3 re-normalises to itself, and the bridge
carries `ry`/`deck`.

`js/editor/scene.js` had to stop importing `CENTERS` from `terrain.js` (which imports `three`) and
take it from `field.js` instead — that is the second thing the field extraction bought.

---

## The `quality.onRebuild` hook, which was inert

`js/engine/quality.js` already had `rebuild: true` and `onRebuild(fn)` and **nothing called either**.
Now:

- `main.js` registers a **220 ms debounced** rebuilder, and **only when there is no `?shot=`**.
  Sliders fire on every step and a rebuild is ~60 ms; and a rebuild landing between a scenario's
  `setup` and the capture would break `?shot=` reproducibility, which is a hard constraint.
- `Terrain.teardown()` removes and disposes everything `build()` added. The occupancy grid, the
  footprints and the contact-AO source survive: they come from the scene document, not from the
  terrain. `blurAO` is guarded to run once — it is a two-pass blur *in place*, so a rebuild would
  blur the blurred field again and the contact shading would creep wider every time you moved a
  slider.
- `Demo.rebuild()` = teardown → build → finish. Scatter is not rebuilt; its meshes live in its own
  group and no world knob changes them.
- Two real consumers, both `rebuild: true` because they change vertex counts rather than shader
  constants: **`riverRes`** (river station spacing, 2–14 m, default 5) and **`riverWidth`** (bank
  ribbon width ×, 0.6–2, default 1).

**Measured:** a full world rebuild is **60 ms** and the render afterwards is intact — see
`shots/_rebuild/creek_day.png`, taken at `riverRes = 9, riverWidth = 1.3`.

---

## `?shot=` determinism — the noise floor, measured

Two consecutive renders of the same scenario at 1280 × 720:

| scenario | pixels differing | mean abs channel delta | worst channel |
|---|---|---|---|
| `gate_night` | **0 / 921 600** | 0.0000 | 0 |
| `street_dusk` | 1 477 / 921 600 (**0.16 %**) | 0.0047 | 168 |

`gate_night` is byte-identical because nothing in it animates. `street_dusk`'s 0.16 % is the robed
figures and the chickens landing on different frames — the worst-channel figure is high because a
figure's silhouette moves by a pixel, not because anything is drifting. **Compare against 0.16 % of
pixels / 0.005 mean delta, not against equality.**

---

## What the next agent should do first

1. **`contactAO`, 20.1 k triangles, drawn in every scenario, never culled.** It is one mesh
   spanning the map, exactly the problem chunking solved for the ground. It is now the third
   largest line in the budget and A7 owns it.
2. The `street_dusk` seam. The one untested candidate is A2's own: the transparent road ribbon's
   triangulation overlapping itself at a polyline bend.
3. `data/areas.json` `wwa.granary` / `wwa.temple` sit on the lip of Whitewall's chalk bluff with a
   thin margin — see the note at the end of the first A4/A5 section. A8's, and the fix is a second
   riverside terrace on Whitewall.
4. `js/world/colliders.js` took **one line** from this pass (the bridge deck and parapet colliders
   now take the bridge's `ry` and `deck`). It was outside the file list I was given; flagged so it
   is not a surprise.

### One tooling note

`node tools/shot.mjs --all` at its defaults (1600 × 900, `--dpr=2`, i.e. 3200 × 1800 software-
rendered) **did not complete** on this machine while three agents were rendering concurrently —
two attempts, one timing out on the enumeration load's 15 s `window.__forge.ready` wait, one
producing nothing in 25 minutes with 47 Chrome processes alive. The five scenarios in `shots/`
were each rendered and inspected individually at `--w=1280 --h=720 --dpr=1`, which takes ~2 minutes
each and works reliably. **Re-run `--all` when the tree is quiet before trusting `_summary.json`.**
