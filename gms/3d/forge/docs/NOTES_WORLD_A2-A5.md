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
