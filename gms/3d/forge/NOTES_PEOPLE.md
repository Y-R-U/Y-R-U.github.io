# People, player and input — notes

Owned files: `js/world/people.js`, `js/player.js`, `js/input.js`.
Touched, minimally: `js/main.js` (wiring), `style.css` (the touch block only).

---

## 1. The figure — round 2

Round 1 was a lathe, and the blind critic killed it in one line: *"every figure is a cone of
rotation with a knob on top … you cannot shade or light your way out of it."* Everything below
exists to give light something to catch.

**Robe — a faceted fold prism, not a revolve.** 5 rings, `SEG = 12` around, **flat-shaded**
(face normals baked in `Build.flatTri`, not `material.flatShading`, so the props keep smooth
normals). Each vertex is pushed radially by

```
fold = cos(SEG/2 · a + phase) · (0.118 − 0.014·ring) + cos(2a + phase·1.7) · 0.042
```

`cos(SEG/2 · a)` lands on exactly ±1 at every vertex, so it is a clean in/out alternation; the
phase advances 0.66 rad per ring, which is what makes the fold lines wander down the body instead
of running dead vertical. The second, low-frequency term breaks the outline so the silhouette is
not a regular 12-gon. That is ~96 triangles and it is more than half the value of the whole
rebuild.

**Hem.** The bottom ring's `y` is offset per vertex — outward folds hang low, plus a hash jitter —
so it scallops between roughly −0.10 and +0.05. It therefore pokes above the ground on a slope,
which is why there is still a 12-triangle dark cap underneath.

**Hood.** Three rings (rim / brow / crown) plus an apex. The rim is *wider than the shoulders*
(0.226 against 0.198) so it overhangs with a real lip, and the underside is closed by a dark fan.
**The two front quads of the rim→brow band are simply not built**, and the six-vertex hole is
filled by a flat inset at vertex colour 0.05. That black void is the whole reason the shape reads
as hooded at thumbnail size — it was the single biggest legibility win. Rim/brow vertices at
j = 1 and 3 are pinched to 0.82 so the mouth is not a letterbox the full width of the head.

**Held props are attached.** A 6-sided, 2-segment arm tube leaves the shoulder under the hood
drape and ends on the grip at y ≈ 1.05; the staff/pitchfork is authored to pass through that
point, and its base is pushed out to x 0.425 so it clears the hem instead of growing out of it.
Only variant 0 carries anything — *a floating spear is worse than no spear*.

**Two geometry variants per zone**, so a crowd is not clones: variant 0 has the prop, the arm and
a short scarf; variant 1 has no prop and a scarf half again as long, mirrored to the other
shoulder, and a different fold phase seed. Costs +3 draw calls; see §3.

Per zone, still only from `zones.js`:

| | robe tint | `staff` |
|---|---|---|
| light | `#dedbd2` | staff + pale finial |
| neutral | `#9c8a72` | pitchfork |
| dark | `#3c3a3e` | staff + black spike |

`robeColor()` clips the tint's brightest channel to 0.72 in sRGB before it reaches the material.
The light robe at `#dedbd2` is 0.87 and rendered as a flat white cutout.

Value comes from a baked `color` attribute, and every shade goes through `tone(s)`, which drops
red faster than blue so darks are cool rather than a single crushed near-black:

- hem 0.50 rising to 1.0 by the third ring — the bottom-25 % ramp the critic asked for;
- ±0.11 on top of that from the fold term, so folds read even in flat frontal light;
- hood underside 0.13, cowl inset 0.05;
- `instanceColor` carries a ±13 % value jitter *and* a small warm/cool hue jitter per figure.

**Scarf shade is deliberately off the robe's own value** (`SCARF_SHADE`), so on the dark zone it
is a vertex colour of **2.0** — above 1, which is fine, attributes are not clamped. Without that
the tail vanishes into a dark robe.

`envMapIntensity` is **not** left at 1. `lighting.js` drives env intensity through `materials.js`
only, so an outside material sits at 1.0 while the whole town runs at ~0.28 — the robes came out
blown to white. `People.update` reads the live value back off `getMaterial(<zone>, 'crest')` and
copies it onto the three robe materials, so they track time of day exactly.

## 1b. Shading — zero triangles

Injected after `<opaque_fragment>` in `robeMaterial`, reading three's own `directionalLights[0]`:

- **Wrap diffuse** `max(0, (N·L + w)/(1 + w))`, `w = 0.4`, added as the *difference* from the hard
  lambert so the standard lighting is untouched elsewhere. Mix is 0.45. It was 0.6 and that
  compressed the robe into a 30-value band; 0.45 keeps the soft terminator and gets the range
  back. Knob: `robeWrap`.
- **Fresnel rim** `pow(1 − N·V, 3)` tinted with `scene.fog.color` (the live sky/haze colour,
  which is why `update` now takes `app`) and **multiplied by saturate(N·L)**, so it only fires on
  the sunward edge. Round 1's ungated rim ringed the whole figure and washed the tints out.
  Knob: `robeRim`, default 0.22.
- A small cool `uShade` fill on the unlit side.

**Contact occlusion** is a separate `InstancedMesh` of 10-triangle discs — `MultiplyBlending`,
`toneMapped: false`, `fog: false`, `depthWrite: false`, radius 0.8, centre vertex darkened by the
`contactAO` knob. **One draw call for the whole crowd**, no shadow pass. `fog: false` matters: a
fogged multiply quad fades to the fog colour, which at distance darkens the ground by a flat 0.8
in a visible disc. The player has no disc — it builds its own mesh in `player.js`, which I do not
own.

## 2. Cloth

Vertex shader, no solver. `MeshStandardMaterial` + `onBeforeCompile`, injected into
`<beginnormal_vertex>` and `<begin_vertex>`.

Per-vertex `attribute vec2 aCloth` = **(amplitude, part)**. Amplitude is `((1.26 - y)/1.26)^1.5`
on the robe — 1.0 at the hem, exactly 0 at the shoulders, so the body never moves — 1.45 at the
free end of the scarf, and **0 on the hood, the arm and the staff**, which is why the prop stays a
rigid stick and the hand stays on it while everything around them moves. `part` is 1 for the
scarf, which redirects its motion backward instead of radially.

Per-figure phase comes from an instanced `attribute vec4 aInst` = (phase, speed, gait, kick), so
36 figures are never in lockstep. The non-instanced player reads the same four numbers from a
`uSelf` uniform under `#ifdef USE_INSTANCING`, which is how one material serves both.

Four terms, in rough order of how much they matter:

1. **Ripple** — two counter-running travelling waves in azimuth and height, displaced along the
   outward normal. This is the fabric.
2. **Wind** — a low-frequency double-sine gust along a world direction. The world direction is
   rotated into object space in the shader using `instanceMatrix[2].xz` as the figure's heading,
   so the whole crowd leans the same way regardless of which way each one faces.
3. **Drag** — the hem and scarf trail backwards proportional to walk speed, and to `kick` during
   an attack.
4. **Gait sway** — a lateral swing at footfall frequency.

**Normals.** Central difference around the body axis, but only the *change* the cloth causes is
applied: `objectNormal += (nA - nRef) * 1.2`. Swapping in the raw cross product instead — which
is what I wrote first — replaces the authored facet normal with a purely radial one, and every
fold flattens out. That single line is most of the difference between "cloth" and "cardboard".

The delta is scaled by `(1 - aCloth.y * 0.85)`. At the scarf's amplitude the finite difference is
large enough to throw the normal right round, and the tail renders black.

Shadows use a `MeshDepthMaterial` with the same displacement injected (`customDepthMaterial`),
so the shadow matches the moving silhouette. Without it the shadow is a static bell.

**The scarf is double-wound and every triangle is flat-shaded from its own winding.** That is not
a style choice: the winding is also what the renderer culls on, so the two can never disagree.
The first version authored normals separately and mirrored variant 1's ribbon in x — mirroring
flips handedness, so half the crowd's scarves rendered as black planks. Flat-shading off the
winding makes that class of bug impossible. `curl()` warps the two edges of the strip apart so no
quad is planar, which stops it reading as a sheet of paper.

## 3. Costs

Measured, not estimated (`__forge.people.triangleCost()`), `[variant 0, variant 1]`:

| | prop carrier | long-scarf |
|---|---|---|
| light | **224** | 192 |
| neutral (pitchfork) | **240** | 192 |
| dark | **224** | 192 |

Mobile gate (`--preset=medium --dpr=1 --w=844 --h=390`), `street_dusk`:

| crowd | draw calls | triangles |
|---|---|---|
| 0 | 68 | 490 k |
| **36 (default)** | **80** | **504 k** |
| 120 (max) | 81 | 542 k |

So the whole system is **+12 draw calls and +14 k triangles**, and the draw calls do not grow with
crowd size. Triangles count twice per figure because the shadow pass redraws them.

Draw calls: 6 `InstancedMesh` (zone × variant) + 1 player mesh, ×2 for the shadow pass, plus 1
contact-disc mesh that casts nothing. Round 1 was +6; the extra 6 buys the prop/no-prop split,
which is the only per-instance silhouette variety available without per-instance geometry.
If they ever need clawing back, collapse the two variants and lose that.

**The scene was already over the triangle gate before this work** — 490 k against 350 k. People
add 2.9 % on top. I have not tried to claw that back; it is `scatter.js`'s `CAP` and the merged
`wall`/`trim` batches, not people. GPU p95 is unchanged inside measurement noise and every shot
still holds 60 fps.

Textures: **zero**. Nothing to track through `budget.js`.

## 4. Crowd placement

`spawn()` uses **quotas, not dice**. A uniform roll put everyone on the three streets and left
`wall_day`, `creek_day` and `town_night` empty. The rota, cycled per district, is:

```
road, front, road, outer, road, meadow, road, bank, front, road, outer, meadow
```

- `road` — walks the district street from z −32 (through the wall gate) to past the creek bridge,
  reversing at each end
- `front` — stands at a building frontage, turning slowly
- `outer` — strolls the meadow north of the curtain wall (this is `wall_day`)
- `meadow` / `bank` — strolls south of / just above the creek (this is `creek_day`)

At the default crowd of 36 that is exactly one full rota per district.

**`terrain.blocked()` is the scatter-occupancy mask and it includes the roads**, because scatter
must not drop grass on a road. People want the opposite. Using it as a walkability test rejected
every road walker and, because the rota only advances when an agent is accepted, deadlocked
`spawn()` at zero agents. Walkability is now tested against `terrain.footprints` directly.

**Coupling to watch:** `roadOf()` in `people.js` mirrors the road control points `demo.js` lays
down per district. If that road array changes in `demo.js`, walkers will drift off it. It is seven
numbers and I did not want to widen a `demo.js` export I do not own; a `roadOf(zoneId)` export
from `demo.js` or `terrain.js` would kill the duplication.

## 5. Player, camera, input

- **Camera**: spring-follow, behind and above, `1 - exp(-11·dt)`. Lifted clear of terrain
  (`heightAt + 0.7`) so it does not sink into a bank. Feet track `heightAt(x, z)` every frame.
  No collision — you walk through buildings.
- **Attack**: a 0.38 s body arc plus a lean, and `kick` spikes the cloth drag. There are no bones,
  so the staff swings because the whole figure does. Good enough to read; not an animation system.
- **Robe switching**: `playerZone` select (Controls group). Swaps geometry and material — 1 line.
- **Keyboard**: WASD / arrows, Shift sprint, Space attack, left-drag to look.
- **Touch**: floating stick — it appears wherever the thumb lands on the move half, not in a fixed
  corner. The other half is attack on tap (< 240 ms, < 16 px) and look on drag; a pure attack pad
  would leave a phone with no way to turn the camera.
- **`flipTouch`** (Controls) swaps the halves and moves the attack ring with them.

Verified by driving the real page over CDP (keyboard walk, mouse-drag look, robe switch, floating
stick appear/track/release, right-half tap → swing, flip → left-half tap → swing and the stick
moves to the right half).

### `freeCam` — read this before you change it

`freeCam` (Controls) defaults to **true on desktop and false on a coarse pointer**. On desktop
FORGE is the level editor and `js/editor/editor.js` is built on `OrbitControls`; on a phone it is
the game. When `freeCam` is on, `Player.update` drives nothing and calls `controls.update()`
itself — `main.js` no longer adds its own orbit updater, because `OrbitControls.update()` calls
`lookAt()` unconditionally and would fight the follow camera. `?freeCam=0` forces third person.

## 6. Dev-only scenarios

`?dev=1` registers `people_day`, `people_dusk` and `people_macro` — three figures, one per zone,
plus a walking one behind. They are gated on the query param so `--shot.mjs --all` keeps rendering
only the five the critic scores.

`?ct=<seconds>` pins cloth time. A still frame cannot show motion; render the same scenario at
two `ct` values and diff:

```bash
node tools/shot.mjs --shot=people_macro --outdir=scratch --set="dev=1&ct=0.0"
node tools/shot.mjs --shot=people_macro --outdir=scratch --set="dev=1&ct=0.55"
```

## 7. Still open

- **No collision.** The player walks through walls and across the creek. Not asked for, and a
  real answer wants `terrain.footprints` plus a capsule sweep.
- **Crowd walkers ignore buildings while moving.** Only the spawn point is validated; a walker
  whose road segment was later built over would clip. Has not happened with the current layout.
- **The cowl inset is coplanar, not recessed.** Pushing it back would need a side wall around the
  opening (~12 more triangles) or it gaps at grazing angles. At vertex colour 0.05 it reads as a
  void anyway, and that was the cheap win.
- **The player has no contact disc.** The disc mesh is instanced from `People.update` over crowd
  agents only; the player builds its own mesh in `player.js`, which I do not own. One reserved
  instance slot plus a hook would fix it.
- **The scarf still reads slightly stiff at macro range.** Four (or six) segments is not many for
  1.7 m of cloth. Another two segments is 8 triangles if it is ever worth it.
- **No idle animation beyond cloth.** Standing figures move their robe and nothing else. A slow
  breathing scale would be nearly free and I did not add it.
- **Nobody sits, carries or works.** Every figure walks, strolls or stands.
- **Zone tint only.** `zones.js` gives one robe colour per district. Two or three tints per zone
  (`robe: ['#…','#…']`) would break up a crowd better than the value/hue jitter does — additive
  change, worth asking for.
- **Fold phase is per geometry, not per instance.** Two variants is all the shared-geometry
  instancing allows. A third variant is +3 draw calls if the crowd ever reads as clones again.
