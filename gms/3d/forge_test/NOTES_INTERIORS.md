# Doors, interiors and world collision — notes

Owned files: `js/player.js`, `js/world/doors.js`, `js/world/interior.js`, `js/world/colliders.js`,
`js/world/textures/stained.js`. Edited additively: `js/world/zones.js`, `js/world/materials.js`,
`js/world/buildings.js`, `js/world/demo.js`, `js/main.js`, `tools/shot.mjs`.

## 1. The spring arm — built and verified first, on its own

`player.js` used to put the camera at `aim + back * dist` and clamp only `back.y` against terrain
height, so it went straight through buildings. It now rays the arm against `colliders.js` and
clamps.

The part that matters, and the part I got wrong first: **clamping the target is not enough.** The
camera lerps toward the target and the *lag* is what trails through a wall. The clamp is applied
last, to `camPos` itself, along the line from the head — so whatever the smoothing did, the camera
always finishes on the unobstructed segment. Pull-in is immediate, ease-out is the existing lerp
toward an unclamped target, and no wall ever has to be made invisible.

Two bugs found by measuring rather than looking:

- **The clearance margin was unconditional.** `hit() - 0.06` was applied even when nothing was hit,
  which ratchets the arm a few cm shorter every frame; the outdoor camera settled at 5.84 m against
  a set distance of 6.2. Now the margin is only paid on an actual hit.
- The soak below only means anything if the *head* is standing somewhere legal. Teleporting the
  player into a wall and then complaining the camera is in a wall is not a test.

**Soak: 21 doors × 12 camera headings × 3 stand-off distances = 588 legal samples, 0 cases where
the camera ends up inside a building or below the terrain.** Unobstructed arm is exactly 6.2 m;
walking the whole main street it never once clamped. Aimed at a wall from 1.6 m out it clamps to
1.04 m (1.6 − radius 0.26 − pad 0.25 − margin 0.06). Reproduce with `scratch` evals or:

```
node tools/shot.mjs --shot=none --w=400 --h=240 --dpr=1 --eval="<the soak in this file's git blame>"
```

Colliders are **oriented boxes derived from the scene document**, not mesh raycasts. A merged
district is one 60k-triangle mesh; raycasting it every frame is not affordable and was never
going to be. A slab test per box against ~100 boxes is nothing.

## 2. The door

`house()` now publishes `userData.door` (leaf size, hinge plane, floor height) and **no longer
bakes the leaf into the district batch**. Every door leaf in the world is one instance of one
`InstancedMesh` per zone — 3 draw calls for all 21 doors — which is what lets the one you are
walking through swing without paying a mesh per house. All house doors are the same size
(`dw = 1.25, dh = 2.35` are constants in `buildings.js`), so one geometry covers them; the instance
matrix carries a scale anyway in case that stops being true.

`house()` also **lost its solid interior core**. That box existed for nothing: the panes are opaque
and the shell is already closed by four panels, two gables, the roof slab and the plinth. Removing
it is what makes a room possible. Verified against all five critic shots — nothing is see-through.

The leaf uses `getMaterial(zone, 'wood')`, which is the first thing in the project to ask for
`wood`. `NOTES_BUILDINGS.md` said to say so if wood ever got a distinctive grain worth a draw call:
it has, and it is a door.

## 3. The transition

One scalar `u`, 0→1 over `doorTime` (1.9 s), driving four things off the same timeline: a
four-waypoint path (where you were → the outside stand-off → the threshold → inside), the leaf
angle, the camera arm blend, and which collider is ignored. Entering and leaving are the same code
with the path reversed.

While a transition runs the player is `driven`: the door script writes `pos` and `yaw`, input is
ignored, world collision is off (the house is a solid blocker and you are walking through it), and
`camYaw` is eased onto the door axis so the camera trails through the doorway rather than the wall.

**The exit is the part that needed care.** At the instant the walk ends the camera is still lagging
in the doorway. Handing the house back to the collider set at that moment finds the camera inside a
box, returns 0, and snaps the camera onto the head — a visible pop. So the house stays ignored, and
the room stays built, until `camPos` is genuinely outside the house's box (capped at 1.2 s). That
is the `releasing` state in `doors.js`.

Measured over a full walk-in-and-out with simulated input: arm goes 6.14 → 1.45 on the way in and
1.45 → 6.2 on the way out, the leaf swings 0 → 1.85 rad → 0 each way, and the camera is **never**
inside a building other than the one being entered or left.

## 4. The room

Built on demand for the house being entered, torn down on exit. Everything is in the house's own
local frame, so it is one `applyMatrix4` to place.

**A live interior costs 936–1017 triangles and 6 draw calls** (wood / stone / cloth / pane / floor
patch / shaft), plus 2 point lights and one 512² texture for the zone's leaded light.

It is also a large net *win*, because once you are fully inside the outdoor world stops being
drawn. Indoors the whole frame is **13 draw calls and 2–3k triangles**, against 87 / 496k outdoors.
That only works because the room is sealed: the doorway aperture is cut a shade smaller than the
leaf and sits in the leaf's own plane, lined with a short reveal, so the shut door plugs it. Any
gap round the door would be a hole straight to the sky.

Surfaces, all per-zone from `zones.js`:

- **Walls** — full-height boarding in the zone's `wood` shade, with a proud panelled dado, a rail
  and a skirting. Aaron asked for wood-grain walls; my first pass used the zone's masonry as
  limewash and it read as blue brick, which was wrong.
- **Floor** — boards or flagstones per `interior.floor`; ceiling is boarded with exposed beams.
- **Furniture** — table, benches, chest, shelf, stool, bed, and a stone hearth with a fire.
- **Accent** — `interior.cloth`, on the rug, the bench cushions and the bed.

Both texture generators shade their authored colour down by an amount that depends on the zone, so
wood and stone are normalised to a target value in `materials()` — the same trick `roofCfg()` plays
outdoors. Without it the light zone's boarding came out as dark as the dark zone's and the room
stopped being a zone read. It is a data read off `z.wood.base` / `z.stone.base`, not a zone check.

**No `getMaterial` for interior surfaces.** Its projection includes the contact skirt, which
darkens by height above the *terrain* — at plinth level that is the whole room, and it turned the
floor and lower walls muddy green. Interiors build their own materials from the same cached
`{map, normalMap}` via the new `textureSet(zoneId, set)` export, so they cost no extra memory.

## 5. The stained glass

`js/world/textures/stained.js` draws one leaded light per zone with the 2D canvas API: a quarry
field, then a pattern from `interior.pattern` (`rose` / `quarry` / `rays`) over it, then a lead
border. 512², albedo only, tracked, built lazily for the zone you actually enter — 1.4 MB, and only
for zones you visit.

The single change that made it look like stained glass rather than a pastel poster was **using a
dark lead** rather than `z.window.frame`, which is near-white in the light zone. Cames are lead in
every zone; the surround is the thing that varies.

The pane is emissive, not lit. The shell behind it is solid, so there is no real light to transmit,
and everything the eye reads as sun through glass is driven off the same `lighting.keyDir` the
outdoor sun uses:

- The pane's brightness and saturation ride on how much the window faces the sun and how high it is.
- **The floor patch** is the pane's own outline projected along the sun direction onto the floor
  and textured with the same leaded light, additively blended. This is the thing that sells it.
- A faint shaft joins the two, fading toward the floor.

The patch and shaft geometry rebuild only when the sun has actually moved. Everything else is a
uniform update. Move `time` and the colour walks across the floor; at night the pane drops to a dim
warm value and the patch fades out.

## Zones.js — exactly what I added

Three `interior` blocks, one per zone, additive only. Nothing existing was touched.

```js
interior: {
  pattern: 'rose' | 'quarry' | 'rays',   // the leaded light's design
  floor:   'flag' | 'board',
  cloth:   '#…',                          // the room's one accent
  glow:    0.85–1.15,                     // hearth strength
  warmth:  '#…',                          // firelight colour
  glass:   ['#…', …],                     // the interior light's palette; falls back to
                                          // window.glass if absent
}
```

`interior.glass` exists because the neutral zone glazes its street facades with two drab greens by
design, and a leaded light meant to be stood in front of needs more than that. It is the interior
window's palette, a different thing from the exterior pane tints, and it keeps each zone's
character (light: pastel; neutral: earthy ochre and russet; dark: deep saturated).

`materials.js` gained one export, `textureSet(zoneId, set)`. `getMaterial` is unchanged.

## 6. World collision — blockers, platforms and steps

`colliders.js` now also owns a walkable world, built from the same document. One primitive does all
three behaviours: a box with a `top` and a `rise`, where `rise` is how far above your feet its top
may sit and still be walked up onto. `rise = 0` is a wall; a large `rise` is something with steps.

- **Buildings** — solid, `rise = 0`, and deliberately **no doorway gap**. The door hotspot is the
  only way in; a gap you could walk through would put you inside an empty shell.
- **Bridge deck** — a platform at `waterY + 1.71` with `rise = stepUp`, and two parapet blockers.
  Its base sits 0.75 m under the deck so you can still wade underneath.
- **Kerbs** — platforms with `rise = 1.5`, because a kerb carries a flight of steps and a strict
  step-up would fence the road off from every front door. *In the shipped demo no kerb exceeds a
  0.39 m drop, so none of them actually become colliders* — the code is there for scenes that do.

Sliding falls out of pushing penetration along the box's own shorter local axis: walking diagonally
into a wall moves you along it. Measured: 7.61 m of travel along a wall from a 45° push.

Height is **eased, not snapped** (`stepEase`, default 16/s). That is the "float up stairs" Aaron
described, and it is fast enough that a slope still reads as feet on the ground.

### Headless walk results

| test | result |
|---|---|
| straight at a house side wall | stopped, 13.0 m travelled, never inside the plan |
| 45° into the same wall | slid **7.61 m** along it |
| straight at a door | transition fires (`entering`) |
| same, with `doors=0` | shell stops him **0.46 m** out (radius 0.34 + pad 0.12) |
| walk the bridge | **y holds at 1.86 while the terrain drops to −1.58** — deck wins over terrain |
| push sideways on the deck | parapet stops him at the deck edge, still at deck height |

### The query the crowd needs — exact signatures

`js/world/people.js` was not touched. Import from `js/world/colliders.js`:

```js
import { walkStep, groundAt, setStepUp } from './colliders.js';

// Resolved end of one step. Slides along blockers; `y` is the surface to stand on there.
walkStep(x0, z0, x1, z1, y, radius = 0.34) -> { x, z, y, hit }

// Walkable surface height at (x, z) for a walker whose feet are at `fromY`.
// Terrain unless a platform it can reach is higher.
groundAt(x, z, fromY) -> number

setStepUp(metres)   // already wired to the `stepUp` knob by player.js
```

Both are safe before the world exists (`walkStep` passes the destination through, `groundAt`
returns 0). The world is built by `Colliders.rebuild(doc)`, which runs in the `Doors` constructor at
boot and again whenever the object count changes. Also exposed as `window.__forge.walk` for tests.

For an NPC: call `walkStep(prev.x, prev.z, want.x, want.z, npc.y, 0.3)`, take `x`/`z`, and ease
`npc.y` toward the returned `y` rather than snapping it.

**Cost: 0.20 µs per `walkStep`, 0.11 µs per `groundAt`.** 41 walkers stepping every frame is
**0.008 ms**. The broadphase is a uniform 8 m grid; every box is registered in each cell its AABB
touches, so a point query reads exactly one cell.

## Perf

`--preset=medium --dpr=1 --w=844 --h=390`, headless. Before is the same tree with `doors=0`, which
reproduces the stated 495k / 84 baseline exactly.

| shot | calls before → after | tris before → after |
|---|---|---|
| wall_day | 84 → **87** | 495k → **496k** |
| street_dusk | 83 → **86** | 494k → **495k** |
| gate_night | 53 → **54** | 312k → **313k** |
| town_night | 83 → **86** | 494k → **495k** |
| creek_day | 83 → **85** | 494k → **495k** |

Outdoors: **+3 draw calls, +1k triangles.** Indoors, standing in a room: **13 calls, 2–3k
triangles.** Texture memory 50.2 → **53 MB** (the three `wood` sets the door leaves pull in), plus
1.4 MB per zone whose interior you actually enter. Budget is 60.

The leaves do **not** cast shadows. A shadow-casting instanced mesh is a second draw call per zone
and the leaf sits in a reveal the wall already shadows; 3 draw calls is 2% of the whole budget for
a shadow on one door for two seconds.

Headless GPU timings are software-rendered and not the gate — `--headed --perf` is. CPU p95 stayed
at 1.4–2.6 ms throughout, well under 6.

## How to drive it yourself

`--shot=none` boots with the player active. `tools/shot.mjs` gained **`--pre`**, which evaluates
*before* the frame is captured (`--eval` still runs after it), which is the only way to photograph a
transition.

```bash
# stand inside door #17 and photograph the room
node tools/shot.mjs --shot=none --w=1280 --h=720 --dpr=1 --set="doorSnap=17&time=11"

# step a real entry to u = 0.52 and photograph the threshold
node tools/shot.mjs --shot=none --w=1280 --h=720 --dpr=1 --pre="(()=>{
  const f=window.__forge,P=f.player,D=f.doors,app=f.app;
  P.input.read=()=>({lx:0,ly:0,mx:0,my:0,sprint:false,attack:false});
  const d=D.doors[17];
  P.pos.copy(d.pos).addScaledVector(d.n,3.2);
  P.pos.y=D.demo.terrain.surfaceY(P.pos.x,P.pos.z);
  P.camYaw=d.yaw+Math.PI;P.yaw=P.camYaw;P.camPitch=0.24;P.started=false;
  D.begin(d,'entering');
  for(let k=0;k<Math.round(0.52*D.secs*60);k++){D.update(1/60,app);P.update(1/60,app);}
  D.update=()=>{};                      // freeze so the settle frames do not advance it
  return JSON.stringify(D.report());
})()"

# in the browser: walk at any front door and it takes over. Or from the console:
__forge.doors.trigger(17)   // enter door 17, or leave if already inside
__forge.doors.report()      // { state, u, doors, indoor, arm, tris }
__forge.walk.groundAt(x, z, y)
```

`?dev=1` adds three exterior door framings (`door_light` / `door_neutral` / `door_dark`), derived
from the scene rather than hardcoded. Without it `--all` still renders only the five scored shots.

Best renders, all in `shots/dev/`: `room_light.png`, `room_neutral.png`, `room_dark.png`,
`room_night.png`, `t52.png` (standing in the open doorway, room lit behind), `t72.png` (camera
passing through the reveal), `door_approach.png`, `bridge_walk.png`.

## Knobs added

`Controls`: `camDistIn`, `camRadius`, `walkCollide`, `walkRadius`, `stepUp`, `stepEase`.
`Interiors`: `doors`, `doorRadius`, `doorTime`, `interiorLight`, `glassGlow`, `sunShaft`, `doorSnap`.

## What failed, and what is still wrong

- **`THREE.MathUtils.smootherstep(x, min, max)`, not `(min, max, x)`.** I had the arguments the
  wrong way round in every call in `doors.js`, which pinned the path parameter, the leaf angle and
  the arm blend at zero. The transition still "completed" — the player teleported between waypoints
  and the door never moved — and nothing threw. Only stepping the transition frame by frame and
  printing the numbers caught it. Wrapped in a local helper with my own argument order now.
- **The first interior was unusable and I nearly shipped the diagnosis wrong.** The room was there
  and the numbers were fine; the camera was jammed at `armMin` because *neighbouring* buildings'
  padded boxes reach through a terraced room. Hence `colliders.interiorOnly` — indoors, only the
  room's own four walls count.
- **The first stained glass rendered mostly black.** The rose medallion only filled the middle of
  the light and the rest of the canvas was bare lead. Fixed by laying a quarry field down first.
- **No real light comes through the window.** The pane is emissive and the floor patch is projected
  geometry. The shell behind the interior wall is solid, so a genuinely lit window would need a hole
  cut through merged district geometry. The fake is driven off the real sun direction and is, I
  think, the right call — but it is a fake.
- **The floor patch is clamped into the room.** At a grazing sun the true patch runs out through the
  far wall; it should climb it. Clamping distorts the shape at low sun. A patch that stops at the
  skirting is a smaller lie than one drawn through masonry, but it is still a lie.
- **The room is one plan.** Size and ceiling height follow the house, but the layout — hearth on
  the left, window opposite the door, table in the middle — is fixed. It will read as repetition
  once you have been in three houses.
- **Only `house` has a door.** Towers and the wall-run gatehouse do not, and the wall gate is not
  passable even though it has a visible archway. It is barred with a portcullis, so I left it.
- **Colliders only rebuild when the object *count* changes.** Move a building in the editor without
  adding or deleting one and the collider is stale until something else triggers a rebuild. A
  revision counter on the document would fix it properly; that lives in `editor/`, which I do not
  own.
- **The exterior camera hugs you in the tight parts of town.** That is a spring arm working
  correctly — the demo lays buildings 1–3 m apart — but it is a real change in feel and Aaron should
  see it before it is called done. `camRadius` and `camDist` are the dials.
- Kerbs never become colliders in this demo (no drop exceeds 0.39 m), so the stepped-kerb path is
  written but untested against real geometry.
