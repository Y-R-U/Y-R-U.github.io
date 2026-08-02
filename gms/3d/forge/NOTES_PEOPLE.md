# People, player and input — notes

Owned files: `js/world/people.js`, `js/player.js`, `js/input.js`.
Touched, minimally: `js/main.js` (wiring), `style.css` (the touch block only).

Round 3 rewrote the figure. Rounds 1 and 2 both scored 2.7–2.8 blind; round 2's mistake was
polishing shading while every complaint was about the outline. Everything in §1 changes the black
shape of the figure against the sky.

---

## 1. What round 3 removed

**The scarf is gone.** It was a double-wound ribbon trailing 1.7 m off one shoulder, and on a phone
it read as a flat plank sticking out sideways — Aaron's words were "the robes have a cape? cape
doesn't look good". The `ribbon()` builder, `SCARF`, `SCARF_AXES`, `SCARF_SHADE`, `scarf()` and the
`cape` term in the cloth shader are all deleted, not disabled. `aCloth` was `vec2 (amplitude, part)`
where `part` only existed to redirect the scarf's motion; it is now `attribute float aCloth`, one
component.

**The black face plate is gone.** Round 2 filled the hood opening with a coplanar fan at vertex
colour 0.05. It rendered as a letterbox decal. There is now a real socket: one 45° segment of the
jaw→brow band is left out, and the four boundary vertices run back 13 cm to a near-black point.
The boundary keeps the fabric's own value scaled by 0.3, so the edge is continuous with the hood
and only the depth of the cavity makes it dark. It is `flatTri`, not `tri`, so the four facets keep
distinct normals and the socket still has a shading gradient inside it.

Two things that did **not** work on the way there, both visible in `scratch/fig_front.png` history:

- Leaving the boundary vertices at full hood brightness. One of the four socket facets catches the
  sun and lights up like a facet of the head — you get a bright triangle next to a black one.
- Authoring the socket normals to point *into* the cavity so it can never catch light. That gives a
  perfectly uniform unlit quad, which is exactly the black rectangle again.

## 2. The figure — a nine-ring loft

Five robe rings, five hood rings, `SEG = 10` around the body and `HSEG = 8` around the hood, all
flat-shaded via `Build.flatTri` (face normals baked in, not `material.flatShading`, so the props
keep smooth normals).

| ring | y | r | baked AO |
|---|---|---|---|
| hem | 0.00 | 0.402 | 0.36 |
| shin | 0.31 | 0.302 | 0.72 |
| knee | 0.67 | 0.270 | 0.86 |
| waist | 0.98 | **0.216** | 0.62 |
| neck | 1.22 | 0.182 | 0.74 |
| hood mantle | 1.145 | **0.264** | 0.62 |
| jaw | 1.352 | 0.214 | 0.64 |
| brow | 1.462 | 0.194 | 0.74 |
| temple | 1.566 | 0.152 | 0.94 |
| crown | 1.672 | 0.086 | 1.00 |

The profile changes direction five times: flare out to the hem, in to the waist, out to the cowl
mantle, in to the jaw, out again over the brow. That is the whole point — round 1 and 2 were a
monotone taper and the critic called it a cone of rotation both times.

**The shoulder flare is the hood's mantle ring, not a robe ring.** 0.264 against the 0.216 waist is
22 % wider. The robe's own neck ring is deliberately narrow (0.182) and lives entirely inside the
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

**Hood.** `dx` and `dz` sweep the peak 15 cm back and 3 cm to one side, so the side profile is a
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

Per zone, still only from `zones.js`:

| | robe tint | `staff` |
|---|---|---|
| light | `#dedbd2` | staff + pale finial |
| neutral | `#9c8a72` | pitchfork |
| dark | `#3c3a3e` | staff + black spike |

## 3. Value and the light-zone blowout

`robeColor()` clips the tint's brightest channel to `ROBE_CEIL` in sRGB before it reaches the
material. Round 2 had this at 0.72 and the light robe still rendered as a flat white cutout with no
folds. **0.64** is where it stops clipping: the brightest pixel on a light robe in `people_day` is
now 193, and the whole 1280×720 frame has zero pixels above 246.

0.56 was tried first. It works too, but at 0.56 the light robe drops to a peak of 176 and the
neutral robe gets clipped as well (its own max channel is 0.61), which collapses the value gap
between the two zones. At 0.64 neutral is untouched and the zones separate on hue as well as value.

Value otherwise comes from a baked `color` attribute through `tone(s)`, which drops red faster than
blue so darks are cool rather than a single crushed near-black. The `sh` column in the table above
is **ambient occlusion, baked, not lighting**: dark at the ground, dark in the waist pinch, dark
where the cowl overhangs, bright on the sky-facing crown. On top of that the fold term adds ±0.18,
and `instanceColor` carries a ±13 % value jitter and a small warm/cool hue jitter per figure.

## 4. Shading — zero triangles

Injected after `<opaque_fragment>` in `robeMaterial`, reading three's own `directionalLights[0]`:

- **Wrap diffuse** `max(0, (N·L + w)/(1 + w))`, `w = 0.4`, added as the *difference* from the hard
  lambert so the standard lighting is untouched elsewhere. Mix 0.45. Knob: `robeWrap`.
- **Fresnel rim** `pow(1 − N·V, 2.4)` tinted with `scene.fog.color` and multiplied by
  `saturate(N·L·1.8)` so it only fires on the sunward edge. Knob: `robeRim`, **now 0.5, was 0.22**.

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

| | round 2 | round 3 |
|---|---|---|
| light | 224, 192 | **198, 172** |
| neutral (pitchfork) | 240, 192 | **214, 172** |
| dark | 224, 192 | **198, 172** |

Mobile gate, `--preset=medium --dpr=1 --w=844 --h=390`, `street_dusk`:

| crowd | draw calls | triangles | people's own share |
|---|---|---|---|
| 0 | 65 | 485 519 | — |
| **36 (default)** | **77** | **498 889** | **+13 370, +12 calls** |
| 120 (max) | 78 | 534 011 | +48 492, +13 calls |

Round 2's equivalent was +14 000 triangles and +12 calls at crowd 36, and the crowd's geometry sum
went **7 504 → 6 694** (−11 %). Draw calls are unchanged. The contact discs went the other way,
360 → 972, because they went from 10 triangles to 27 *and* started actually drawing; net people
cost is still down.

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
plain plane with a plain sun, and print the triangle counts. That page imports only `people.js` and
`zones.js`, so it kept working through a whole afternoon in which `demo.js` would not boot at all
because another agent's `scatter.js` was mid-edit against a `zones.js` field that had not landed
yet. Iterate there, confirm in the real scene. `view=front|side|macro|top`, `ao=`, `spin=`, `ct=`.
`scratch/` is gitignored.

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
- **Fold phase is per geometry, not per instance.** Two variants is all shared-geometry instancing
  allows; a third is +3 draw calls.
