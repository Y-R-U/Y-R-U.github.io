# People, player and input — notes

Owned files: `js/world/people.js`, `js/player.js`, `js/input.js`.
Touched, minimally: `js/main.js` (wiring), `style.css` (the touch block only).

Round 3 rewrote the figure. Rounds 1 and 2 both scored 2.7–2.8 blind; round 2's mistake was
polishing shading while every complaint was about the outline. Everything in §1 changes the black
shape of the figure against the sky.

**Round 4 rebuilt the head only** — see §1a. Round 3's socket read on a phone as a horizontal black
bar across a pale pointed hood, and the combination has an unfortunate real-world resemblance that
was the first thing Aaron saw. The robe below the shoulders is untouched.

---

## 1a. Round 4 — the hood opening

Round 3's socket was one 45° segment of one band, four facets to a point. Two things were wrong with
it and only one of them was the shape.

**It was a horizontal slot in a mitre.** The fix is two changes that only work together:

- **The opening is now two whole bands tall and one column wide**, cut through the chin→eye and
  eye→brow bands, with the six boundary vertices reshaped by `LIP`: narrow at the chin (`wx` 0.34),
  wide at eye level (0.70), narrow again at the brow (0.38), and the top and bottom pairs pinched
  towards each other in y. That gives a vertical almond 16.8 cm tall by 12.1 cm wide; round 3's
  slot measured 6.4 cm tall by 9.8 cm wide, which is why it read as a bar.
- **The hood lost a ring and gained a dome.** `HOOD` is four rings, not five — mantle / chin / eye /
  brow — and the brow ring is deliberately wide (0.196) with the apex only 12 cm above it and 14 cm
  behind. The old crown ring at r 0.086 was what made it a point. Dropping it paid for the rim and
  the cavity: hood geometry went 82 → 80 triangles including the eyes.

**Rim thickness, then a cavity.** The six boundary vertices get an inner loop scaled 0.72 toward the
opening centre and pushed `RIM` = 3.4 cm along the hole's own inward normal (computed from the loop,
not hardcoded, because the opening plane tilts back about 25°). That band of six quads is the fabric
edge and is the whole reason it reads as an opening with something behind it rather than a decal.
Behind it, six triangles run to a single point `CAVITY` = 17.5 cm back, inside the skull.

**The interior colour comes from `zones.js` and is divided by the robe tint.** `vertexColors`
multiplies the material colour, so `cavityTone()` bakes `hood.inner / robeColor` per channel and the
cavity lands on the authored value whatever the fabric is. Every interior is far darker than every
robe so the ratio never approaches 1. The gradient is `SKY[k]` on the rim loop (1.0 at the chin,
0.56 at eye level, 0.22 at the brow — where skylight would actually reach) falling to 0.10 at the
back point. A flat fill is what made round 3's read as painted on.

**What did not work.**

- **The rim band at 0.30–0.64 of the fabric value put a white sliver inside the cavity.** It looked
  like a tooth. It is not the albedo — it is the fresnel rim term in `FRAG`: every facet inside a
  concave cavity is seen edge-on, so `pow(1 − N·V, 2.4)` is near 1 on all of them, and the term is
  gated on N·L which the sky-facing bottom bevel passes. Fixed by multiplying the rim by
  `smoothstep(0.12, 0.42, luma(vColor))` — the baked value attribute is the only thing in the
  shader that knows fabric from interior. The rim band is also down to 0.13–0.30 of fabric.
- **Putting the opening on bands 1–2 of the old five-ring hood** left the mouth at 26 % from the top
  of the head with no brow above it, and the head read as a bell with a hole in the top. The ring
  heights had to come down with it (`chin` 1.352 → 1.298, `eye` 1.462 → 1.418) so the opening centre
  sits at about half the hood's height, where a face is.

**Eyes: prototyped, and off.** `robeEyes` knob, default 0. Two triangles per figure — one shard per
eye — carrying a `vec3 aEye` attribute that the fragment shader adds straight to `gl_FragColor`,
so they are invisible at gain 0 and their albedo is the cavity colour. Colours are
`zone().hood.eyes` = [core, tail]: black/red for dark, brown/green for neutral, white/grey/blue for
light. Cost is 2 triangles and one extra attribute; the hood ring that was dropped paid for both.
They do read at macro distance and are invisible at crowd distance, which is about right.

## 1. What round 3 removed

**The scarf is gone.** It was a double-wound ribbon trailing 1.7 m off one shoulder, and on a phone
it read as a flat plank sticking out sideways — Aaron's words were "the robes have a cape? cape
doesn't look good". The `ribbon()` builder, `SCARF`, `SCARF_AXES`, `SCARF_SHADE`, `scarf()` and the
`cape` term in the cloth shader are all deleted, not disabled. `aCloth` was `vec2 (amplitude, part)`
where `part` only existed to redirect the scarf's motion; it is now `attribute float aCloth`, one
component.

**The black face plate is gone.** Round 2 filled the hood opening with a coplanar fan at vertex
colour 0.05. It rendered as a letterbox decal. Round 3 replaced it with a socket; round 4 replaced
that in turn (§1a). Two things that did **not** work on the way there, still true:

- Leaving the boundary vertices at full hood brightness. One socket facet catches the sun and lights
  up like a facet of the head — you get a bright triangle next to a black one.
- Authoring the socket normals to point *into* the cavity so it can never catch light. That gives a
  perfectly uniform unlit quad, which is exactly the black rectangle again.

## 2. The figure — an eight-ring loft

Five robe rings, four hood rings, `SEG = 10` around the body and `HSEG = 8` around the hood, all
flat-shaded via `Build.flatTri` (face normals baked in, not `material.flatShading`, so the props
keep smooth normals).

| ring | y | r | baked AO |
|---|---|---|---|
| hem | 0.00 | 0.402 | 0.36 |
| shin | 0.31 | 0.302 | 0.72 |
| knee | 0.67 | 0.270 | 0.86 |
| waist | 0.98 | **0.216** | 0.62 |
| neck | 1.22 | 0.182 | 0.74 |
| hood mantle | 1.120 | **0.276** | 0.60 |
| chin | 1.298 | 0.234 | 0.66 |
| eye | 1.418 | 0.226 | 0.76 |
| brow | 1.530 | 0.196 | 0.92 |
| apex (point) | 1.652 | — | 1.00 |

The profile changes direction five times: flare out to the hem, in to the waist, out to the cowl
mantle, in to the chin, then a long slow taper over the brow to the apex. That is the whole point —
round 1 and 2 were a monotone taper and the critic called it a cone of rotation both times.

**The shoulder flare is the hood's mantle ring, not a robe ring.** 0.276 against the 0.216 waist is
28 % wider. The robe's own neck ring is deliberately narrow (0.182) and lives entirely inside the
cowl. This was rebuilt: the first attempt put the flare on the robe at 0.258 and the hood's bottom
ring at 0.262 sitting *above* it, and the hood read as a lampshade balanced on a body, with the
robe's open top ring poking 5 mm out through the hood at some azimuths.

**Folds.** Each ring carries its own fold depth `f`, so the waist creases tight (0.088) and the hem
swings loose (0.155):

```
fold = cos(SEG/2 · a + ph)·R.f + cos(2a + ph·1.7)·0.040 + cos(3a − ph·0.8)·0.030
```

`cos(SEG/2 · a)` lands on exactly ±1 at every vertex (SEG must stay even), so it is a clean in/out
alternation; `ph` advances 0.66 rad per ring so the fold lines wander instead of running vertical.
The 2- and 3-lobe terms stop the outline being a regular 10-gon.

**Hem.** The bottom ring's `y` is `−0.045 − 0.085·fn` plus a hash jitter, so outward folds hang low
and the bottom edge scallops between roughly −0.16 and +0.06 rather than cutting a clean ellipse.
It therefore pokes above the ground in places, which is why there is still a 10-triangle dark cap
underneath at vertex colour 0.12.

**Hood.** `dx` and `dz` sweep the apex 16 cm back and 3 cm to one side, so the side profile is a
flopped cowl and not a bishop's mitre. The mantle's underside is a flat dark disc at 0.10 — that is
the baked occlusion under the cowl, and it is also what closes the robe's open neck ring.

**Props are welded into the body.** The staff base is at x 0.318 against a hem that reaches 0.40+,
so it starts *inside* the silhouette and emerges around knee height. A 10-triangle sleeve leaves
the robe at x 0.150 (inside the 0.20 body radius there) and ends on the shaft at y 1.00. The
combined shape reads as one figure holding something; round 2's staff started at x 0.425, clear of
the hem, and read as a separate floating stick.

**Two geometry variants per zone.** Variant 0 carries the prop and sleeve. Variant 1 has neither, a
different fold seed, and the whole geometry is run through `makeScale(1.055, 0.935, 1.055)` — a
shorter, stouter build for free. That replaced the long-scarf variant as the source of crowd
variety.

Per zone, still only from `zones.js`. Round 4 added the `hood` block; everything already there is
untouched:

| | robe tint | `staff` | `hood.inner` | `hood.eyes` |
|---|---|---|---|---|
| light | `#dedbd2` | staff + pale finial | `#2b2d31` very dark grey | `#e8f0f6` / `#8fa6bb` |
| neutral | `#9c8a72` | pitchfork | `#241a11` very dark brown | `#9aa84e` / `#4a3418` |
| dark | `#3c3a3e` | staff + black spike | `#050507` black | `#e02a20` / `#4c060a` |

## 3. Value and the light-zone blowout

`robeColor()` clips the tint's brightest channel to `ROBE_CEIL` in sRGB before it reaches the
material. Round 4 moved it **0.64 → 0.70**, and the reason is worth recording because it is a
straight reversal of a round-3 decision.

At 0.64, `people_day` measured **light 194 / neutral 191** — no value separation at all, only hue,
which is a fail on the rubric's "tellable from a 200px thumbnail" axis. Round 3 set 0.64 because
0.72 clipped; that is no longer true, and the scene lighting has moved under other agents since.
Re-measured with `scratch/px.mjs`, whole-frame census of pixels above 246:

| ceiling | light peak | neutral peak | clipped px, all eight shots |
|---|---|---|---|
| 0.64 | 194 | 191 | 0 |
| **0.70** | **204** | **191** | **0** |
| 0.76 | 212 | 191 | 0 |

`gate_night` shows 310 clipped pixels at every setting — it is the lit windows, confirmed by
re-rendering with `&crowd=0` and getting the same 310.

Neutral's own max channel is 0.61, so anything above that clips only the light robe and anything
below clips both and collapses the gap — 0.56 was tried in round 3 and drops light to 176 while
pulling neutral down with it. 0.70 is a compromise: it buys ~10 steps of zone separation and costs
about 2 steps of fold contrast on the light robe (sampled fold spread 17 → 15). If the light robes
read too hot in a dusk shot, this one constant is the dial.

Value otherwise comes from a baked `color` attribute through `tone(s)`, which drops red faster than
blue so darks are cool rather than a single crushed near-black. The `sh` column in the table above
is **ambient occlusion, baked, not lighting**: dark at the ground, dark in the waist pinch, dark
where the cowl overhangs, bright on the sky-facing crown. On top of that the fold term adds ±0.18,
and `instanceColor` carries a ±13 % value jitter and a small warm/cool hue jitter per figure.

## 4. Shading — zero triangles

Injected after `<opaque_fragment>` in `robeMaterial`, reading three's own `directionalLights[0]`:

- **Wrap diffuse** `max(0, (N·L + w)/(1 + w))`, `w = 0.4`, added as the *difference* from the hard
  lambert so the standard lighting is untouched elsewhere. Mix 0.45. Knob: `robeWrap`.
- **Fresnel rim** `pow(1 − N·V, 2.4)` tinted with `scene.fog.color`, multiplied by
  `saturate(N·L·1.8)` so it only fires on the sunward edge, and by
  `smoothstep(0.12, 0.42, luma(vColor))` so it does not fire inside the hood (§1a). Knob:
  `robeRim`, **now 0.5, was 0.22**.

  **Round 2's note claimed the rim was working. It was compiling and running, but at 0.22 with an
  exponent of 3 it moved a silhouette pixel by 4/255 — invisible.** Measured by rendering
  `people_dusk`, reading the framebuffer with `gl.readPixels` at three known edge pixels, and
  re-rendering with `uRim.x` at 0 / 0.22 / 0.6 inside a single synchronous `--eval`. At 0.5 / 2.4
  it reads as a warm edge at dusk without ringing the whole figure.
- A small cool `uShade` fill on the unlit side.

## 5. Contact occlusion — this had never once rendered

One `InstancedMesh` of discs, one draw call for the whole crowd, no shadow pass. **Round 2's note
said this worked. It did not, and it cost me most of an afternoon to prove.** Three separate bugs,
all of which had to be fixed before a single pixel changed:

1. **`MultiplyBlending` draws nothing here.** Switched to the recipe `terrain.js` already uses for
   its own ground decals: `CustomBlending`, `blendSrc: Zero`, `blendDst: OneMinusSrcAlpha`, with the
   strength carried in a **vec4** vertex-colour alpha channel.
2. **Those factors also run on the alpha channel**, which zeroes the framebuffer alpha and punches a
   hole straight through to the page background — a bright blue halo round every figure in an
   isolated harness. Fixed with `blendSrcAlpha: Zero, blendDstAlpha: One`. `terrain.js` gets away
   without this; do not copy that part of it.
3. **The disc was positioned with `heightAt()`, which is the analytic height field, not the rendered
   mesh.** `terrain.surfaceY()` is the mesh, and they differ by enough to bury the disc. Even at the
   right height a flat disc on undulating ground depth-fails almost everywhere, so it is now also
   **tilted onto the local surface normal** (four `surfaceY` samples at ±0.6 m) and lifted 7 cm.
   The figures themselves were floating/sinking for the same reason; `People.update` now places
   them on `surfaceY` too. `player.js` still uses `heightAt` — I do not own it.

A `CircleGeometry` cannot carry this. Its only interior vertex is the centre, so alpha ramps
linearly from a point that is entirely hidden behind the robe hem, and the visible ring outside the
hem comes out nearly clear. The disc is now hand-built: centre + inner ring at 0.46 R at full alpha
+ outer rim at zero, 9 segments, 27 triangles, so the ramp starts *outside* the body. `AO_R` 0.86,
`contactAO` default raised 0.65 → 0.8.

**How to prove a decal renders, since screenshots are taken before `--eval` runs:** do it all in one
synchronous eval — install `onBeforeRender` as a counter, call
`app.renderer.render(app.scene, app.camera)` directly, then `gl.readPixels` a box before and after
toggling `mesh.visible`. `scratch/px.mjs` decodes a PNG and prints sRGB values plus a clipped-pixel
census, which is how the light-robe numbers above were measured. Do not A/B two `shot.mjs` runs
without `&ct=` pinned — the crowd animates between runs and the pixel differences are meaningless.

## 6. Cloth

Vertex shader, no solver. `MeshStandardMaterial` + `onBeforeCompile`, injected into
`<beginnormal_vertex>` and `<begin_vertex>`.

Per-vertex `attribute float aCloth` is amplitude only: `((1.22 − y)/1.22)^1.5` on the robe — 1.0 at
the hem, 0 at the neck — and **0 on the hood, the sleeve and the staff**, which is why the prop
stays a rigid stick and the hand stays on it while everything around them moves.

Per-figure phase comes from an instanced `attribute vec4 aInst` = (phase, speed, gait, kick). The
non-instanced player reads the same four numbers from a `uSelf` uniform under `#ifdef USE_INSTANCING`,
which is how one material serves both.

Four terms: a two-wave **ripple** displaced along the outward normal (this is the fabric); a
low-frequency **wind** gust along a world direction rotated into object space via
`instanceMatrix[2].xz` so the whole crowd leans the same way; **drag** on the hem proportional to
walk speed and to `kick` during an attack; and a lateral **gait sway** at footfall frequency.

**Normals.** Central difference around the body axis, but only the *change* the cloth causes is
applied: `objectNormal += (nA − nRef) * 1.2`. Swapping in the raw cross product replaces the
authored facet normal with a purely radial one and every fold flattens out. (The old
`* (1 - aCloth.y * 0.85)` scale existed only to stop the scarf's normals flipping and went with it.)

Shadows use a `MeshDepthMaterial` with the same displacement injected (`customDepthMaterial`), so
the shadow matches the moving silhouette. If you change `clothOff`, it is shared — both materials
compile the same `PARS` string, so they cannot drift.

## 7. Costs

`__forge.people.triangleCost()`, `[variant 0, variant 1]`:

| | round 2 | round 3 | round 4 |
|---|---|---|---|
| light | 224, 192 | 198, 172 | **196, 170** |
| neutral (pitchfork) | 240, 192 | 214, 172 | **212, 170** |
| dark | 224, 192 | 198, 172 | **196, 170** |

The hood is 80 of the 170-triangle body: 44 shell (three bands of eight, two quads left out for the
opening), 8 apex fan, 8 mantle underside, 12 rim band, 6 cavity, 2 eyes. Round 3's was 82 with no
rim and no eyes — dropping the crown ring paid for the whole thing and left 2 over.

Mobile gate, `--preset=medium --dpr=1 --w=844 --h=390`, `street_dusk`:

| crowd | draw calls | triangles | people's own share |
|---|---|---|---|
| 0 | 65 | 485 519 | — |
| **36 (default)** | **77** | **498 755** | **+13 236, +12 calls** (r3: +13 370) |
| 120 (max) | 78 | 533 531 | +48 012, +13 calls (r3: +48 492) |

The scene-level figure is roughly twice the geometry sum because the shadow pass counts too. Round
2's equivalent was +14 000 at crowd 36, and the crowd's geometry sum went **7 504 → 6 694 → 6 622**.
Draw calls are unchanged across all three rounds. The contact discs went the other way in round 3,
360 → 972, because they went from 10 triangles to 27 *and* started actually drawing; net people cost
is still down.

**The scene was already 40 % over the triangle gate before any of this** — 485 k against 350 k with
zero people on screen. That is `scatter.js` and the merged wall/trim batches, not people. GPU p95 is
unchanged inside measurement noise and every shot still holds 60 fps.

Textures: **zero**. Nothing to track through `budget.js`.

## 8. Crowd placement

`spawn()` uses **quotas, not dice**. A uniform roll put everyone on the three streets and left
`wall_day`, `creek_day` and `town_night` empty. The rota, cycled per district, is:

```
road, front, road, outer, road, meadow, road, bank, front, road, outer, meadow
```

- `road` — walks the district street from z −32 (through the wall gate) to past the creek bridge
- `front` — stands at a building frontage, turning slowly
- `outer` — strolls the meadow north of the curtain wall (this is `wall_day`)
- `meadow` / `bank` — strolls south of / just above the creek (this is `creek_day`)

**`terrain.blocked()` is the scatter-occupancy mask and it includes the roads**, because scatter must
not drop grass on a road. People want the opposite. Using it as a walkability test rejected every
road walker and deadlocked `spawn()` at zero agents. Walkability is tested against
`terrain.footprints` directly.

**Coupling to watch:** `roadOf()` mirrors the road control points `demo.js` lays down per district.
If that array changes in `demo.js`, walkers drift off the road. A `roadOf(zoneId)` export from
`demo.js` or `terrain.js` would kill the duplication.

## 9. Player, camera, input

- **Camera**: spring-follow, behind and above, `1 − exp(−11·dt)`, lifted clear of terrain. No
  collision — you walk through buildings.
- **Attack**: a 0.38 s body arc plus a lean; `kick` spikes the cloth drag. No bones.
- **Robe switching**: `playerZone` select (Controls group) swaps `people.geo[id]` / `people.mat[id]`.
- **Keyboard**: WASD / arrows, Shift sprint, Space attack, left-drag to look.
- **Touch**: floating stick that appears wherever the thumb lands on the move half; the other half
  is attack on tap (< 240 ms, < 16 px) and look on drag. `flipTouch` swaps the halves.

### `freeCam` — read this before you change it

Defaults to **true on desktop and false on a coarse pointer**. On desktop FORGE is the level editor
and `js/editor/editor.js` is built on `OrbitControls`; on a phone it is the game. When `freeCam` is
on, `Player.update` drives nothing and calls `controls.update()` itself — `main.js` no longer adds
its own orbit updater, because `OrbitControls.update()` calls `lookAt()` unconditionally and would
fight the follow camera. `?freeCam=0` forces third person.

## 10. Rendering and checking

```bash
node tools/shot.mjs --shot=people_day  --set="dev=1&ct=0.4" --w=1280 --h=720 --dpr=1
node tools/shot.mjs --shot=people_dusk --set="dev=1&ct=0.4" --w=1280 --h=720 --dpr=1
node tools/shot.mjs --shot=people_macro --set="dev=1&ct=0.4" --w=1280 --h=720 --dpr=1
```

`?dev=1` registers the three; `?ct=<seconds>` pins cloth time so two runs are comparable. Every
registered knob is settable from the query string (`&contactAO=0.9&crowd=0`), which is the fastest
way to A/B one of them.

**`scratch/figures.html` + `scratch/figshot.mjs` render the six figure geometries alone**, on a
plain plane with a plain sun, and print the triangle counts. `view=front|side|macro|top`, plus
`ao=`, `spin=`, `ct=`, `eye=` (the hood-eye gain) and `cx=` (macro camera x, so `cx=-1.5` and
`cx=1.5` frame the light and dark heads). That page imports only `people.js` and
`zones.js`, so it kept working through a whole afternoon in which `demo.js` would not boot at all
because another agent's `scatter.js` was mid-edit against a `zones.js` field that had not landed
yet. Iterate there, confirm in the real scene. `scratch/` is gitignored.

The failure mode to test for is **thumbnail scale, not macro** — round 3's slot passed at macro and
failed at 200 px. `--w=356 --h=200` on any `shot.mjs` scenario is the cheap check, and
`figshot.mjs w=356 h=200` is the cheaper one.

## 11. Still open

- **The robe's mid-body is still a large smooth expanse at macro range.** The fold shading reads at
  crowd distance but a single figure filling the frame is flat. More rings is the honest answer and
  costs triangles; a normal map costs a texture.
- **No collision.** The player walks through walls and across the creek.
- **The player has no contact disc.** The disc mesh is instanced from `People.update` over crowd
  agents only; the player builds its own mesh in `player.js`, which I do not own. Round 2's notes
  said `player.js` builds one — **it does not, and never did**; the player has simply never had one.
  One reserved instance slot plus a hook would fix it.
- **The player still stands on `heightAt`, not `surfaceY`.** Same floating/sinking bug the crowd
  had, one line in `player.js`.
- **Crowd walkers ignore buildings while moving.** Only the spawn point is validated.
- **No idle animation beyond cloth.** A slow breathing scale would be nearly free.
- **Nobody sits, carries or works.** Every figure walks, strolls or stands.
- **Zone tint only.** Two or three tints per zone (`robe: ['#…','#…']`) would break up a crowd
  better than the value/hue jitter does — additive `zones.js` change, worth asking for.
- **Light vs neutral is still carried mostly by hue.** At `ROBE_CEIL` 0.70 the peaks are 204 and
  191, which is a real but small value gap (§3). Genuinely fixing it needs either a darker neutral
  robe tint or a lighter light one in `zones.js`, which is a revalue, not an addition.
- **The hood eyes are a prototype.** They are two flat shards at a fixed position 5.5 cm inside the
  cavity, so they do not track the camera. Measured at `spin=0.6` (34° off front) the near one is
  occluded by the cavity wall and only the far one shows — which reads acceptably, but it is luck
  rather than design. If they are ever turned on for real they want to be billboarded, or moved
  forward towards the rim plane and made narrower.
- **Fold phase is per geometry, not per instance.** Two variants is all shared-geometry instancing
  allows; a third is +3 draw calls.
