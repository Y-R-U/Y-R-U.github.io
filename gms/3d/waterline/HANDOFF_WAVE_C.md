# HANDOFF — Wave C, agent 1: integration correctness and performance

Scope: whole-game integration. Twelve files touched, one new. No new features. Every scored
scenario still renders at its authored camera pose and the game still boots, plays, saves and
resumes with zero console errors.

Standard render throughout: `--dpr=1 --w=1600 --h=900`. `--dpr=2 --w=1280 --h=720` was not
attempted (E2).

---

## 1. The shadow box is no longer centred on the world origin (D20)

`js/world/lighting.js`. `place()` now fits the orthographic shadow camera to the slice of the
**camera frustum** from the near plane out to `extent × 2`, instead of building a box of half-extent
`extent` around (0,0,0).

`extent` changes meaning and the call sites did not have to change: it is now **shadow reach ahead
of the lens**, not half a box around the origin. The minimal sphere round a right frustum of depth
F with half-sizes a, b at the far plane has its centre at `d = (F² + a² + b²) / 2F` along the axis,
and `r` works out equal to `d` — the apex lands exactly on the sphere. A sphere fit is
rotation-invariant, so the centre can be snapped to the shadow map's own texel grid without the
box changing size as the camera turns.

The exact minimal sphere puts the lens *on* its surface, which drops everything beside and behind
the camera. That matters for the bridge, whose sun shadows I measured at **11.8% of the frame**
(`bridge_table` rendered with `sun.castShadow` forced false differs from the shipped render in
169,503 of 1,440,000 pixels by more than 2 levels, max channel delta 158). So the centre is pulled
back by `min(0.2·r, 40) m` and the radius grown to match.

`lighting.shadowBox()` was added so a capture-time probe can read `{ extent, radius, centre, sun }`
out of the running scene rather than trusting the call site (D17).

| shot | shadow calls before | after | fitted radius |
|---|---|---|---|
| `splash_miss` | **0** | **12** | 229 m |
| `night_burn` | 12 | **18** | 194 m |
| `bridge_lamp` | (r3 key n/a) | 20 | 228 m |
| `hit_explode` | 12 | 12 | 168 m |
| `bridge_table` | 10 | 10 | 219 m |
| `fleet_wide` | 10 | 10 | 202 m |

`splash_miss` shipped with **every cast shadow missing**; it now renders all the casters in its own
frustum. Texel density on that shot goes from 280 m/2048 = 0.137 m to 458 m/2048 = 0.224 m — that
is the price, and it is smaller than the extent-300 stopgap D20 costed (0.29 m).

**What this check does not cover.** It proves casters are now submitted and that the fitted box
contains the subject. It does **not** prove the box is the right *size* aesthetically — nobody has
scored a shadow edge at 0.224 m/texel. It does **not** cover shimmer: I texel-snapped the centre
but never rendered a moving sequence and diffed consecutive frames. And `window_out` reports
`shadowCalls: 0` at every beat; I did not chase whether that is the `shadowRate` knob landing a
capture on a frame that skipped the shadow pass (`shot.mjs:160` documents that bimodality) or the
sun genuinely not casting there. Treat that one shot's shadow figures as unmeasured.

---

## 2. Draw calls

**Measured live, in a real match, over CDP with no `?shot=`** — not from scenario keys. The number
that matters is the **settled gameplay pose** (`cam [0, 20.3, −1.9]`, the bridge), because that is
where the player sits; the flyover transient is quoted separately.

| | before | after |
|---|---|---|
| title screen | — | **66** (57 main + 9 shadow) |
| settled, landscape 1280×800 | 163 (122 + 41) mine · 170/139 C7 · 196 manager | **117–138** (86–107 main + 31 shadow) |
| in-match peak (flyover / salvo) | 210 (169 main) | **157–163** |
| settled, portrait 390×844 mobile | 177–199 (C7) | **128–138** |
| portrait peak | — | **149–153** |
| triangles, settled | 132.2k | 111–126k (budget 260k) |

The 20-point spread on "settled" is the random fleet layout — how many hulls land in the window.
Five runs, quoted as a range rather than a point.

Still **over the 120 ceiling** at the peak and at the top of the settled range. It is no longer
over by 80.

Four changes, in descending yield:

**(a) `js/main.js` — the W0 scaffold hull is hidden outside the `boot` scenario.** `buildShip` at
`main.js:56` builds a 262 m cruiser at the origin that the fleet then duplicates. No file
references `hook.world.ship`; `sea()` and `bridgeScene()` already hide it by root name, so it was
only ever drawn in the real game. **−23 calls (13 main + 10 shadow), and zero pixels.** Proven by
freezing `app.clock.getDelta` to 0 (a same-code control pair then diffs bit-identically, 0/1,024,000
px), then setting every one of its meshes to `MeshBasicMaterial(0xff00ff)`: **0 pixels changed.**
Hiding it entirely: also 0 pixels. `boot` sets `visible = true` in its own setup.

This is an edit to a file whose header says FROZEN. It is four lines and it is flagged here loudly.

**(b) `js/world/merge.js` (new) + `js/world/bridge.js` — static geometry baking.** Triangles have
huge headroom and calls have none, so anything that never moves is flattened into one mesh per
(material, castShadow, receiveShadow, renderOrder). Eleven separate InstancedMeshes shared the one
`bridge:panel` material; eleven shared `bridge:trim`. `bakeStatic()` bakes each instance's matrix
into the vertices and merges. Excluded by object identity, not by guesswork: the glass C6 builds
its glare from, the crew C6 toggles, the screens, spill, lens, wear, pool, chart lamp and the whole
`tableAnchor` subtree; plus anything carrying an `instanceColor` or an extra geometry attribute.
Geometries are never `dispose()`d — one `BoxGeometry` backs half the room and other batches still
point at it.

`bridge_table`: **95 calls → 74** (85 → 64 main), triangles unchanged at 46,676, and the render
differs from the pre-bake one in **757 of 1,440,000 pixels (0.053%)**.

`window_out@0.0`, the tightest shot on the project, goes **89 → 76**. That closes **E7**.

**(c) `js/world/fleet.js` + `js/config.js` — hero detail is now chosen by range.** `layout()` gave
detail 2 (16–18 draw calls) to the first two ships of *each* side regardless of where that side
stood. One formation always sits ~800–1,050 m off the bridge. Past `FLEET.heroRange` (600 m) a ship
drops to detail 1 (6 calls). The range has to go through the side frame — `cellToWorld()` returns a
world position that is then written as a *local* position on a frame offset by half the standoff,
so `p.length()` alone reads ~320 m for a ship that is actually 800 m away. My first attempt used
`p.length()`, measured no change, and that is how I found it. The rng draw order is preserved so
layouts are unchanged.

**(d) `js/engine/app.js` — `parkEmpty()`.** An `InstancedMesh` at `count = 0` still costs a full
draw call, and the table's overlays (lattice, reticle, ghost, pegs, marks, hulks) plus the fleet's
plume mesh spend most of a match empty. It hides them before the render and **only ever un-hides
what it hid**, so it cannot fight anything that sets `visible` for its own reasons. ~5 calls.

**What these checks do not cover.** Counts only, never GPU ms (D4). Only the classic 10×10 mode via
`flow.quick(false)` — not custom grids, the ladder, the setup screen or the result panel. Not a
real device. `bakeStatic` was pixel-diffed on `bridge_table` alone; the other five bridge scenarios
were confirmed to render at their authored poses with plausible counts but were not diffed. Any
future code that adds meshes to `bridge.room` expecting the pre-bake object graph will be
surprised. `setHaze(colour, 0)` *was* exercised after the merge (1 haze mesh, `visible: false`,
74 → 73 calls).

---

## 3. Texture union — 39.03 MB of 45, so 5.97 MB headroom

Confirmed **in a live match**, not from scenario keys: `stats().texMB` = **39.03** at the settled
pose, identical in portrait, and unchanged by every edit in this pass. D16 stands — it is a project
total. The largest items are `bridge:screens` 5.36 MB and `table:chart` 5.36 MB (both 1024²),
`sky:env` 4.02 MB (256×1536), then fifteen 512² albedo/normal pairs at 1.34 MB each. Nothing here
needs to lose resolution yet; if it ever does, the two 1024² atlases are 27% of the budget between
them and are the only single decisions worth making.

---

## 4. The two top-end defects

### 4a. The sea was clamped — `js/world/ocean.js`

`uCapCol` was being used as the foam's *pixel value*: a constant colour mixed in at up to 0.88, then
tone-mapped down by the grade's exposure. That is why foam showed one RGB triplet over 2.20% of a
foreground with 19 byte-identical rows, and why **no water pixel anywhere reached luma 200**.

It is now the foam's **albedo**, lit like the rough white lambertian surface a whitecap is:

```glsl
vec3 capLit = uCapCol * (uCapAmb + uCapSun * smoothstep(-0.02, 0.22, uSunDir.y));
```

`uCapAmb` defaults to 1.0 and `uCapSun` to 2.0, both overridable per grade (`sea.capAmb`,
`sea.capSun`). Ambient at exactly 1.0 means **night and any sun-below-horizon grade are bit-for-bit
unchanged** — the sun term smoothsteps to zero there. The mix ceiling went 0.88 → 0.90.

`sea_noon`, 640,000 water pixels:

| | before | after |
|---|---|---|
| max luma | 177.9 | **224.9** |
| px > 200 | **0 (0.00%)** | 2,777 (0.43%) |
| px > 220 | 0 | 781 (0.12%) |
| p50 | 83.1 | 83.4 |

The median did not move; only the top end opened. **D13 control:** two same-code renders of
`sea_noon` came back with identical histograms to the last pixel (`>200: 2777` both), so the
0 → 2,777 delta is entirely the code change and not the per-scenario noise floor.

**What this does not cover.** The plate has 5.26% above 200 in its band and we are at 0.43% — the
*ceiling* is gone but the distribution is not matched, and I never opened a plate to compare (they
are outside `site/` and I did not fetch them). `sea_dusk` (7.08% > 200) and `sea_night` (0.43%) were
read as absolute histograms only; neither got a controlled A/B. The sun-glint path (`min(lobe(...),
uGlintMax)`, `uGlintMax = 900`) was inspected and is **not** the binding clamp, but I did not test
whether raising glint is a better lever than foam for the specific band the critic sampled.

### 4b. The ships were not over-lit by the sky — they were over-lit by C6's flash

This is the finding I would most want carried forward, because the diagnosis in `SCORES.md` §C6-1
("re-expose") points at the wrong knob.

On `window_out@1.0`, with a 260×70 patch on the lit hull:

| lights zeroed at capture time (values read back) | paint p95 | > 220 |
|---|---|---|
| nothing (shipped) | 226.6 | 8.45% |
| `sun.intensity = 0` | 221.2 | 5.49% |
| `ambient.intensity = 0` | 225.3 | 7.28% |
| `scene.environment = null` | 224.8 | 6.85% |
| all three at once | 219.2 | 4.74% |
| **the flash PointLights alone** | **148.4** | **0.00%** |

Killing the sun, the hemisphere and the IBL together moves lit paint by 7 luma. Killing `shots.js`'s
`flashLight()` moves it by 78. `flashLight` is a point source with `decay 2` set to deliver its
authored irradiance at 46 m — and the muzzle sits *on* the hull, so at 5 m it delivers 85× that.
**Lowering `decay` makes it worse**, because midships is near `atMetres` and a shallower falloff
carries more there; the total is the only lever. A sweep put 0.25× in the right place.

`power` 3.4 → **0.85** (`window_out`) and 4.6 → **1.15** (`shell_flight`).

| `window_out@1.0` | before | after |
|---|---|---|
| lit paint p95 | 226.6 | **188.3** |
| lit paint max | 237.8 | **210.4** |
| px > 220 in patch | 8.45% | **0.00%** |
| flash core max | 247.6 | 247.6 |
| flash-to-paint headroom | ~6 luma (critic) | **~37 luma** |
| hull B−R beside the flash | −31.5 | −42.1 |

C6 added the flash light to fix a blue cast on the hull (B−R +23.5 → −5.0). The hull beside the
flash is still warm at −42.1, so that fix is not undone — it is warmer relative to its own
brightness, not cooler. Visually the hull now reads as naval grey instead of sandy cream, and the
flash reads as fire rather than as paint.

**What this does not cover.** 0.25× was chosen to land the paint below 220 with headroom, not
against a plate — nobody has scored it. `shell_flight`'s light was scaled by the same factor and its
render was eyeballed, not measured. The muzzle *smoke* is a separate material and `SCORES.md` §C6-3
(smoke that gets brighter with distance from the core) is untouched.

---

## 5. C6's escalations

- **E3 — closed.** `js/world/vfx/fire.js`. Drops now carry `c.sky = smoothstep(0, 0.05, c.dir.y)`
  and get `base + (opts.skyTone ?? base·0.80)·c.sky`. 0.80 is the compensation the escalation
  computes: softAdd gives a 145-luma sky 1.75× less increment, and 1.8× source restores it.
  `night_burn`, sky band rows 80–330 against the pre-fix render: **1.98% of 400,000 px brighter,
  mean +5.3, max +13.1**; p99 102.2 → 104.5. *Blind spot: I did not render a same-code control for
  `night_burn`, whose noise floor D13 records at 33% of bytes at mean 1.218 — my ">1 luma" threshold
  sits right on that floor, so the 1.98% figure is not separated from noise. The p99 move is the
  safer statistic and it is small.*
- **E4(b) — closed.** `js/world/ship.js`. The transom is not an open hole; it is a recessed panel
  with `ao = 0.52` lit only by ambient. Measured on `window_out@1.0`: panel p50 **21.1** against
  **94.9** on the hull plate 15 px beside it. `ao` 0.52 → **0.80** gives p50 **67.4** with the hull
  unchanged at 95.3 — a 74-luma step reduced to 28, and it still reads as a recess.
- **E4(a) — NOT done.** The below-waterline slab drawn above water in `shell_flight` is untouched.
  It needs a clip at the water plane and a wet collar, which is real geometry work in C3's hull.
- **E5 — API added, no caller.** `ocean.setFlatten(a, b)` overrides `uFlatA` / `uFlatB` and
  **survives `applyGrade`** on the D15 override pattern, so a sky knob cannot quietly restore the
  grade's values. *Blind spot: nothing calls it. It is proven to parse and proven not to fire; it is
  not proven to fix the near-field inversion, because no scenario uses it yet.*
- **E6 — closed.** `table.setEnv(k)` exists in `js/world/table.js`; `shots.js`'s `tableEnv()` is now
  a one-line delegate. Exercised — `window_out@0.0` calls it and renders.
- **E7 — closed by §2(b).** 89 → 76.

---

## 6. Regression proof

**Every scored scenario, `--dpr=1 --w=1600 --h=900`.** All 21 renders complete. Camera position and
fov read out of the running scene at capture time from inside `--eval` and compared against what
each scenario authors (D21 — draw counts are not a camera check):

`sea_noon [0,17,0] f33` · `sea_dusk [0,18,0] f14` · `sea_night [0,15,0] f18` ·
`bridge_table [−0.62,19.8,−3.15] f48` · `bridge_night [−2.6,19.88,−2.7] f56` ·
`bridge_lamp [−0.35,19.86,−2.6] f50` · `bridge_plot [0.12,19.81,−0.34] f46` ·
`bridge_red [0.05,19.62,0.55] f48` · `bridge_dbg [0,25.5,−7.5] f60` · `guns_fire [−44,18,36] f50` ·
`guns_broadside [−150,46,−52] f32` · `fleet_wide [−196,46,−152] f30` ·
`splash_miss [0,19,0] f33` (D21's verified value) · `hit_explode [0,11,0] f40` ·
`night_burn [0,17,0] f30` · `shell_flight [2.83,54.01,209.45] f40` ·
`match_cut [189.49,63.23,309.28] f46` · `boot [46,26,62] f48` ·
`window_out` at 0.0 / 0.5 / 1.0.

**Zero console errors, zero warnings, zero exceptions** across the whole sweep.

**The real game, over raw CDP with no `?shot=`:**

```
TITLE      screen=title  cam [77,30,42.6] fov 50   66 calls
Battle →   screen=play   cam [0,20.3,−1.9]        132 calls (101 main + 31 shadow)  texMB 39.03
FIRE       turn resolves, HUD updates, peak 163 during the salvo
SAVE       localStorage 'waterline'  4,620 bytes  hasMatch true
RELOAD     title offers "Carry on" / "Discard",  stored true
RESUME →   screen=play  133 calls (102 main + 31 shadow)
ERRORS     0
```

**What the regression bar does not cover.** One mode (classic 10×10), one seed per run, landscape
1280×800 and portrait 390×844 only. Nothing was rendered at `--dpr=2`. No real device. Pixel diffs
were run on `bridge_table` (bake), `sea_noon` (foam control), `window_out@1.0` (flash, transom) and
the live settled pose (scaffold ship) — the other scenarios are verified as "renders, right camera,
no errors", which is a weaker claim.

---

## 7. Still outstanding, ranked

1. **Draw calls are still over 120** — 117–138 settled, 157–163 peak. The remaining bridge cost is
   the crew (5 instanced meshes, not bakeable: `setVisible` rewrites instance matrices), the glass
   (3 panes, not bakeable while `windowGlare()` walks them per-pane), the table's overlays and the
   screens/bezel/spill/lens set. The remaining fleet cost is ~6 calls per ship with no two ships
   sharing a draw. **The one big structural lever left is instancing the fleet**: identical kits
   already share geometry, so one `InstancedMesh` per (kit, material) would collapse three cruisers
   from 18 calls to 6.
2. **E4(a)** — the below-waterline slab above the water in `shell_flight`.
3. **`SCORES.md` C6-3** — the muzzle smoke gets *brighter* with distance from the core (89.1 at
   0–9 px, 103.4 at 60–69 px). Separate material from the hull; the flash-power cut does not touch
   it.
4. **The sea's top end is opened but not matched** — 0.43% above luma 200 against the plate's 5.26%.
   Next lever is glint, not foam.
5. **`window_out` reports `shadowCalls: 0`** at every beat and I did not determine whether that is a
   `shadowRate` capture artefact or real.
6. **Shadow shimmer is snapped but unverified** — needs a moving-camera frame pair.
7. **`ocean.setFlatten()` has no caller.** The near-field detail inversion E5 describes is still
   present in every level-camera shot; the seam to fix it now exists.
8. **Portrait composition** (C7's §1) — the board is 13.7% of frame height. Counts there are now
   fine; the geometry problem is untouched.
9. **`oursSide` randomisation** (D26 ruling 4), **BUILD_PLAN v2** (D5), **`projects.js` entry**, and
   the **phone perf gate on Aaron's device** (D4) — none attempted.

---

## Files changed

| file | change |
|---|---|
| `js/world/lighting.js` | frustum-fit + texel-snapped shadow box; `shadowBox()` probe |
| `js/world/merge.js` | **new** — `bakeStatic()` |
| `js/world/bridge.js` | bake the static room; repoint `hazeCards` at the merged card |
| `js/main.js` | scaffold hull hidden outside `boot` (**frozen file — 4 lines**) |
| `js/engine/app.js` | `parkEmpty()` — no draw call for a zero-instance mesh |
| `js/world/fleet.js` | hero detail chosen by range through the side frame |
| `js/config.js` | `FLEET.heroRange` |
| `js/world/ocean.js` | lit foam (`uCapAmb` / `uCapSun`); `setFlatten()` (E5) |
| `js/cine/shots.js` | flash `power` ×0.25; `tableEnv` delegates to C2 (E6) |
| `js/world/table.js` | `setEnv()` (E6) |
| `js/world/vfx/fire.js` | `skyTone` for drops silhouetted against sky (E3) |
| `js/world/ship.js` | transom ambient floor, `ao` 0.52 → 0.80 (E4b) |

Nothing outside `gms/3d/waterline/` was touched. No git command that writes was run.

---

# HANDOFF — Wave C, agent 2: the draw-call budget and E4(a)

Eleven files touched, none new, none frozen. `js/main.js` was **not** edited, so nothing here needs
a D27-style ruling. Standard render throughout: `--dpr=1 --w=1600 --h=900`. Every live measurement
below was taken with `Network.setCacheDisabled` and a **fresh** `--user-data-dir` per run (D28), and
with `crypto.getRandomValues` stubbed by an LCG so `flow.js`'s `entropy()` is pinned and the fleet
layout is the same run to run — the 20-point spread agent 1 quoted is that layout, and pinning it
turns a range into a paired before/after.

---

## 1. Draw calls: 151 → 103 settled, 166 → 117 on the flyover, at the same pinned seed

**Where the calls actually were.** `renderer.info` cannot tell you *which* object drew, so I wrapped
`renderer.renderBufferDirect` for one frame in a live match and tallied every submission by object,
material and geometry, split by whether the shadow pass or the main pass submitted it. At the worst
of four pinned seeds (4007), landscape 1280×800, settled at the bridge:

| | before | after |
|---|---|---|
| total | 151 | **104** |
| main | 120 | **83** |
| shadow | 31 | **21** |

The tally said the fleet's **wake + collar + skirt were 54 of 120 main calls** — 45% of the visible
frame — for ten ships that between them own three meshes each. Three causes, all fixed:

### (a) Every transparent DoubleSide material on this project was drawn twice per frame

three r160's `WebGLRenderer.renderObject` renders a material twice — `side = BackSide`, then
`side = FrontSide` — when `material.transparent && material.side === DoubleSide &&
material.forceSinglePass === false`, and `forceSinglePass` defaults to **false**. Each triangle
passes exactly one of the two cull tests, so the second submission draws nothing and costs a draw
call, a `needsUpdate` and a program-cache lookup.

`forceSinglePass: true` is now set on all fifteen of them: wake, collar, skirt, rail, the bridge
window glass, the plot gridlines, `bridgeKit.additive()`, and the fire / gun / impact / glare cards.

**What it cost visually — measured with the clock frozen so the control is exact:**

| scenario | control (same code, two runs) | single-pass vs two-pass | calls |
|---|---|---|---|
| `fleet_wide` | **0.00%, mean 0.000** | 14.38% of bytes, mean 0.193, and only **1,257 px of 1,440,000 (0.087%) differ by ≥8** | 38 → **31** |
| `hit_explode` | — | 11.39%, mean 0.168, **1,732 px ≥8** | 53 → **40** |
| `bridge_table` | — | 0.48%, mean 0.005, **20 px ≥8** | 74 → **69** |

The residual is blend *order* between front- and back-facing triangles of the same sheet, not double
blending. Freezing the clock is what makes this readable: unfrozen, two identical `fleet_wide`
renders differ by 29.6% at mean 0.633 and the effect vanishes into it (D13, again).

### (b) The wake and the collar were `frustumCulled = false`

Both are pushed onto `ocean.heightAt()` every frame, so their baked bounds go stale — which is why
culling was switched off. They now compute a bounding sphere at build time with a **+10 m pad** (the
swell is under a metre) and cull normally. In the settled bridge pose our own formation is behind
the camera and was paying 4 foam calls per ship for nothing.

### (c) A hero ship's turrets and barrels are now two InstancedMeshes

A battleship's four turrets and four barrels were eight meshes in the main pass and eight more in
the shadow pass, all sharing one material and two geometries. They are now
`InstancedMesh(turretGeo)` + `InstancedMesh(barrelGeo)` on `body`, written from the turret groups —
which stay, because the gun anchors, the recoil and the training angle hang off them.
`writeTurrets()` is called from `trainGuns`, `elevateGuns` and from `update()` only on a frame where
a recoil actually moved. The instance bound is set to a sphere of radius `0.62 L` at the deck rather
than left to three, because recoil and training move the matrices.

Worth 6 main + 10 shadow on seed 4007 alone.

### The live numbers, four pinned seeds, cache disabled, fresh profile each run

**Landscape 1280×800** (settle = the gameplay pose at the bridge; flyover = the opening; salvo =
firing through the real UI):

| seed | settled before | settled after | flyover before | flyover after | salvo after |
|---|---|---|---|---|---|
| 1007 | 118 (87 main) | **79 (58)** | 157 | **95** | 103 |
| 2007 | 135 (104) | **91 (70)** | 157 | **107** | 116 |
| 3007 | 118 (87) | **75 (54)** | 157 | **95** | 103 |
| 4007 | 151 (120) | **103 (82)** | 166 | **117** | **125** |
| title screen | 66 | **61** | | | |

**Portrait 390×844** — C7 measured 177–199 here before agent 1; agent 1 got it to 128–138; it is now:

| seed | settled before | settled after | peak before | peak after |
|---|---|---|---|---|
| 1007 | 101 (70) | **91 (70)** | 109 | **95** |
| 2007 | 113 (86) | **104 (83)** | 113 | **104** |
| 3007 | 97 (66) | **89 (68)** | 105 | **94** |
| 4007 | 119 (88) | **107 (86)** | 119 | **108** |

**Portrait is now entirely inside the 120 ceiling.** Landscape is inside it settled (75–103) and on
the flyover (95–117); the one remaining overage is the **salvo transient at the worst seed, 125**.

Texture memory is unchanged at **39.03 MB** of 45 in every run, before and after.

### Scored scenarios, after (`--dpr=1 --w=1600 --h=900`)

`sea_only` 1 · `sea_dusk` 3 · `sea_noon` 9 · `guns_fire` 28 · `guns_broadside` 28 · `fleet_wide` 31 ·
`match_cut` 32 · `splash_miss` 35 · `bridge_red` 36 · `hit_explode` 40 · `shell_flight` 41 ·
`sea_night` 45 · `night_burn` 53 · `window_out@0.0` **54** (agent 1: 76; E7's shot) · `bridge_plot`
60 · `bridge_dbg` 67 · `bridge_night` 68 · `bridge_table` **69** (agent 1: 74) · `boot` 79 ·
`bridge_lamp` 86.

**What this does not cover.** Counts only, never GPU ms (D4). Classic 10×10 only, one AI tier, four
pinned seeds — not custom grids, not the ladder, not the result panel. Landscape 1280×800 and
portrait 390×844, `--dpr=1` only, headless, no real device. The per-object tally was taken at one
frame of one seed; the salvo peak was sampled at 2 Hz for 12 s, so a shorter spike could hide between
samples. `forceSinglePass` was pixel-checked on three scenarios, not all twenty.

---

## 2. E4(a) — the below-waterline slab. Closed on both scored shots, and the root cause is the ocean

**It is not the ship floating wrong.** Probed at capture time on `shell_flight`: the hero
battleship's `body.position.y` is 0.45, `ocean.heightAt()` at its centre is 0.67, and its hull
bottom is at −13.3 — 14 m under water. Sampled along the length, the hull's own waterline sits
between **1.18 m below and 1.21 m above** the CPU sea. Yet ~6 m of underbody was drawn, and with the
ocean material set to `colorWrite = false` (depth only) the dark pixels **survived**, so the hull was
genuinely in front of the sea's depth.

**The measurement that found it.** I placed 21 magenta spheres of radius 1.2 m at exactly
`ocean.heightAt(x, z)` in a 7×3 grid around the ship and rendered. Several floated **entirely clear**
of the water; several were **entirely hidden** by it. `heightAt` and the surface you can see disagree
by metres.

**Why.** `radialGrid()` is a polar fan from `R_MIN = 3` to `R_MAX = 1500`. At the `high` preset
(`oceanSegs 96`, `oceanRings 3`) it takes 81 steps at growth 1.0797, so the triangles are:

| range from the origin | radial | angular |
|---|---|---|
| 100 m | 7.4 m | 6.5 m |
| 250 m | 18.5 m | 16.4 m |
| **450 m** (where `shell_flight`'s hero sits) | **33.2 m** | **29.5 m** |
| 900 m | 66.5 m | 58.9 m |

The wave field is five components at **74, 41, 23, 13 and 7 m**. At 450 m, three of the five are
shorter than one triangle. The vertex shader displaces only vertices, so the rendered sheet is a
chord across whatever the wave is doing between them — at sea state 3 (`amp 2.8`) that is several
metres low, and the ship, floated on the CPU field, stands proud of it. It is the same family as
D12/D15/D17/D20/D21: a value that is correct at the call site and defeated downstream, except here
the two are the CPU model and the GPU one.

**The fix, which is E4's own first recommendation.** `shipSurface()` takes a `clipQ` and
`hullMaterial()` passes `WATERLINE_V − 0.012`. The hull map's `v` is mirrored about 0.5 with y=0 at
`WATERLINE_V`, so `abs(vMapUv.y − 0.5) * 2` is "height above the keel as a fraction of the side" and
is the same number on a destroyer and a battleship — no per-ship uniform, no material clone. Below
it the shell is discarded. What survives gets an ambient floor (`uUnderAmb 0.55`, smoothstepped out
over the next 0.06 of the band), because anti-fouling faces down, the sun never reaches it and it
measured luma 6 against a sea at 60–140. The skirt's bottom three rows were raised to meet the clip,
or it hangs below the cut hull as a foam blade.

**`shell_flight`, the pixels at x1190–1210, y520–550** — the middle of the slab:

| | before | after |
|---|---|---|
| pixel values | `06070a`, `060507`, `030205`, `020206` | sea, 60–140 luma |
| what is drawn there | `hull:battleship`, confirmed by a per-mesh false-colour render | nothing |

**`window_out@1.0`** — rendered with `clipQ: 0` and with the shipped value and cropped to the stern:
the dark maroon transom recess that the critic called an uncapped hole is gone, and the stern reads
as pale plating ending at the water.

**What this does not cover, and it is the honest limit of the fix.** The clip converts a *black
slab* into a *hard cut edge*. When the ship rides above the rendered sea the hull now ends in a clean
line with water visible beneath it — better than the slab on both shots, and I looked at both, but
nobody has scored it. The real fix is making the rendered sea agree with `heightAt` near a ship, and
that is C1's grid, not C3's hull: either raise the tessellation in the 100–600 m band (triangles have
115k of headroom and the ocean is one draw call, so it is affordable) or fade each wave component out
of the *vertex* displacement on the local triangle size the way `waveField()` already does in the
fragment shader. I did not attempt either, because it moves every scored sea shot and there is no
critic in this pass. The clip is also a plane in the ship's own body space, so a heavily listing hull
gets clipped along its list rather than along the water.

---

## 3. Agent 1's three blind spots

### `ocean.setFlatten()` had no caller — folded into `setDetailFade`, not deleted

`setDetailFade({ fade, rip, lod })` is already called from three live sites
(`fleet.js:291`, `vfx/field.js:606`, `shots.js:52`), each passing a scenario's `fade` object
straight through. It now also takes `graze`, on the same override that survives `applyGrade`, and
`setFlatten` is gone. There is no longer a public method nobody calls; there is one optional key on a
call path every scenario already uses. **Proven at capture time**, not at the call site:

| | uFlatA / uFlatB |
|---|---|
| grade default | 13.5 / 17 |
| after `setDetailFade({ graze: [9, 12] })` | **9 / 12** |
| after a sky knob fires | **9 / 12** |
| after `{ graze: null }` | 13.5 / 17 |
| after another sky knob | 13.5 / 17 |

**Blind spot:** no scenario passes `graze` yet, so the near-field inversion E5 describes is still
present in every level-camera shot; the seam is now reachable and proven to bind, not proven to fix
it. I also could not reproduce E5's arithmetic — for a pinhole camera over a plane,
`dist / (−V.y)` is monotone in distance at any camera height, so the inversion it describes must come
from the wave slope changing `−V.y` near the lens rather than from the metric itself. Whoever tunes
this should re-derive it before choosing numbers.

### Shadow shimmer — verified with a moving box, and it is small but not zero

Test: patch `lighting.update` so `place()` fits the box for a camera offset by δ while the frame
renders from the **unmoved** pose. Then the only thing that changes between two renders is the
shadow box, and any pixel difference *is* shimmer. `bridge_table`, clock frozen, texel =
2 × 218.97 / 2048 = **0.214 m**:

| | bytes differing | mean |
|---|---|---|
| control, δ = 0 twice | 0.66% | **0.008** |
| δ = 0.06 m (0.28 texel) | 1.94% | 0.075 |
| δ = 0.50 m (2.3 texels) | 2.20% | 0.244 |

So the snap holds the *lateral* grid — a 2.3-texel move costs mean 0.24 luma, which is a
whole-texel step and not a crawl — but a sub-texel move is not free. Chasing that found one real
omission: `place()` snapped the centre in `right` and `up` and left the **light-axis** component
free, so the light slid continuously along its own direction and every depth sample moved against a
fixed `bias = −0.0008`. `n` is now snapped too (`lighting.js`). It moved δ=0.06 from 2.17% to 1.94%,
mean 0.078 to 0.075 — a real but small part of it.

**Blind spot:** one scenario, one axis of camera motion, a frozen clock and a static interior. The
remaining 0.075 is 9× the control and I did not isolate it further; candidates are `lookAt`'s up
vector disagreeing with the snap basis by a fraction of a texel, and depth-bias acne on the
deckhead. Nobody has watched a real moving camera and judged it.

### E3's rain — re-measured with a same-code control, and it is real but small

Agent 1's figure sat on `night_burn`'s **unfrozen** noise floor of 33% at mean 1.218 (D13). With the
clock frozen that floor collapses and the effect separates. Sky band, rows 80–330, 400,000 px, with
`skyTone` forced to 0 for the off arm by a temporary edit to `fire.js` (reverted):

| | bytes differing | mean abs | max | brighter by >1 |
|---|---|---|---|---|
| **control, same code, two runs** | **0.15%** | **0.001** | 1 | 0.00% |
| skyTone on vs off | 2.19% | 0.105 | 12 | **1.88%** |

p99 105 → 107, band max 193 → 202. So agent 1's numbers were right — 1.98% at mean +5.3, p99 +2.3 —
and are now separated from noise by a factor of 100 on the mean. **The effect is real and it is
small:** it lifts about 1.9% of the sky band by roughly 5 luma. E3 is closed; the rain is not
suddenly legible against sky.

**Blind spot:** one scenario, one band, one frozen frame. It says nothing about how the streaks read
in motion, which is the thing the escalation was actually about.

### `window_out`'s `shadowCalls: 0` — resolved, and it is deliberate

Not a `shadowRate` capture artefact. Probed at 0.0 / 0.25 / 0.5 / 0.75 / 1.0: the scene has exactly
one DirectionalLight and `castShadow` is **false at every beat**, because `shots.js` line ~334 sets
`lighting.sun.castShadow = false` in `window_out`'s own setup — the comment right above it explains
why (the sun would rake through the bay and wash the console faces). `shadowCalls: 0` is correct
there and should not be chased.

The 9 shadow calls the manager measured were not this shot: the box it read, centred
**[-39, -7, -52] at radius 219**, is `boot`'s — I get exactly that box on `boot` in the sweep below.

---

## 4. Regression proof

**Every scored scenario, all 20 ids plus `window_out` at five points, `--dpr=1 --w=1600 --h=900`.**
Camera position, fov and rotation read out of the running scene at capture time and compared against
what each scenario authors (D21). **All 20 match agent 1's recorded poses exactly**: `sea_noon`
[0,17,0] f33 · `sea_dusk` [0,18,0] f14 · `sea_night` [0,15,0] f18 · `bridge_table`
[−0.62,19.8,−3.15] f48 · `bridge_night` [−2.6,19.88,−2.7] f56 · `bridge_lamp` [−0.35,19.86,−2.6] f50
· `bridge_plot` [0.12,19.81,−0.34] f46 · `bridge_red` [0.05,19.62,0.55] f48 · `bridge_dbg`
[0,25.5,−7.5] f60 · `guns_fire` [−44,18,36] f50 · `guns_broadside` [−150,46,−52] f32 · `fleet_wide`
[−196,46,−152] f30 · `splash_miss` [0,19,0] f33 · `hit_explode` [0,11,0] f40 · `night_burn` [0,17,0]
f30 · `shell_flight` [2.83,54.01,209.45] f40 · `match_cut` [189.49,63.23,309.28] f46 · `boot`
[46,26,62] f48 · `sea_only` [0,17,0] f33 · `window_out` [0.1,19.57,−1.05] f48.

**Zero console errors, zero warnings, zero exceptions** across the whole sweep.

**Renders opened and read**, not just counted: `shell_flight` (at 10× on the stern, five iterations),
`window_out@1.0` (10× on the stern, with and without the clip), `guns_fire`, `guns_broadside`,
`fleet_wide`, `match_cut`, `hit_explode`, `bridge_table`, `boot`.

**The real game, live CDP, no `?shot=`, cache disabled, fresh profile, seed pinned to 4007 (the worst
of four):**

```
TITLE      screen=title   61 calls (52 main)
Battle →   screen=play    cam [0, 20.3, -1.9] fov 46   103 calls (82 main + 21 shadow)  texMB 39.03
           opening flyover peak 117 / 96
FIRE       cell tapped on the canvas, FIRE pressed, turn resolves, HUD updates, peak 125 / 104
SAVE       localStorage 'waterline'  4,350 bytes  hasMatch true
RELOAD     title offers "Carry on" / "Discard",  stored true
RESUME →   screen=play    105 calls (84 main + 21 shadow)
ERRORS     0
```

Repeated at three more landscape seeds and four portrait seeds: **zero errors in all eight**, save
and resume good in all eight. `tools/purity.mjs`: 12 files under `js/sim/` still pure.

**What the regression bar does not cover.** One mode (classic 10×10), four seeds, two window sizes,
`--dpr=1`, headless, no real device. Pixel diffs were run on `fleet_wide`, `hit_explode`,
`bridge_table` (forceSinglePass), `night_burn` (E3) and `bridge_table` again (shimmer); the other
scenarios are verified as "renders, right camera, no errors", which is weaker. Nothing was scored by
a critic.

---

## 5. Files changed

| file | change |
|---|---|
| `js/world/materials/hull.js` | `clipQ` waterline clip + `uUnderAmb` floor in `shipSurface`; `hullMaterial` passes it; `forceSinglePass` on skirt / collar / rail |
| `js/world/ship.js` | turret + barrel InstancedMesh; wake/collar culled on padded bounds; skirt rows raised to the clip; `forceSinglePass` on the wake |
| `js/world/lighting.js` | shadow-box centre snapped on the light axis as well as laterally |
| `js/world/ocean.js` | `setFlatten` folded into `setDetailFade({ graze })` |
| `js/world/materials/bridge.js` · `materials/table.js` · `bridgeKit.js` · `vfx/fire.js` · `vfx/gun.js` · `vfx/impact.js` · `cine/shots.js` | `forceSinglePass: true` |

Nothing outside `gms/3d/waterline/` was touched. No git command that writes was run. `js/main.js`
was not edited.

---

## 6. Still outstanding, ranked

1. **The rendered sea does not agree with `ocean.heightAt()` near a ship** — §2. This is the root
   cause of E4(a), it is why the clip is needed at all, and it will bite anything else that has to
   sit on the water (splash columns, floating wreckage, the shell's impact point). Fix in
   `radialGrid()` or in the vertex shader's per-wave LOD. Triangles have 115k of headroom and the
   ocean is one draw call, so it is affordable; it moves every scored sea shot, so it needs a critic.
2. **The salvo transient still peaks at 125** on the worst of four seeds, against a 120 ceiling.
   Settled and flyover are both inside it, and portrait is inside it everywhere. The next lever is
   the fleet's foam: wake, collar and skirt are still one draw each per ship and all ships share
   three materials, so concatenating them into three fleet-wide buffers would take ~27 calls to 3.
   The collar is already fully CPU-rewritten every frame, so the extra cost is writing x and z as
   well as y.
3. **`SCORES.md` C6-3** — the muzzle smoke gets brighter with distance from the core. Untouched.
4. **The sea's top end is opened but not matched** — 0.43% above luma 200 against the plate's 5.26%.
   Untouched; agent 1 says the next lever is glint, not foam.
5. **`graze` has a seam and no caller with real numbers** (§3). E5's own arithmetic does not survive
   checking; re-derive before tuning.
6. **The clipped hull's cut edge** is a hard line whenever the ship rides above the rendered sea.
   Item 1 is the real fix; a cheaper one is a per-ship sea plane fed into the hull shader so the
   clip follows the water rather than the ship's own waterline.
7. **Portrait composition** (C7's §1) — the board is 13.7% of frame height. Counts there are now
   comfortable; the geometry is untouched and it is Aaron's call.
8. **`oursSide` randomisation** (D26 ruling 4), **BUILD_PLAN v2** (D5), **`projects.js` entry**, and
   the **phone perf gate on Aaron's device** (D4) — none attempted.
