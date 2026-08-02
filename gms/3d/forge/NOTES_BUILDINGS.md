# Building kit — notes

`js/world/buildings.js` (wallRun / tower / house) + `js/world/details.js` (parts).
Signatures unchanged, so `demo.js` needs no edits to keep working.

## What each builder now produces

**wallRun** — battered footing + flared ground skirt, modular panels of a real thickness with
arrow slits cut clean through, sparse battered buttresses with weathering caps, a string course,
a corbel table under an overhanging walkway lip, merlons with height jitter and occasional gaps.
The parapet **steps** once or twice along the run, and each stretch carries its own lip and
merlons, so the top edge is never one long horizontal. Runs over 24 m get a two-module gate:
a thicker block that projects from both faces, an arch through the full depth, a portcullis
recessed in the reveal, flanking piers and a pitched gate-tower roof.

**tower** — battered plinth, shaft built from a ring of flat panels so windows are real holes,
string courses, a corbelled machicolation ring, a merlon parapet, a lathed roof (bell / spire /
cone from `edges`), finial, flag and rubble at the base.

**house** — plinth + apron, four panels of real thickness with recessed openings, closed gable
walls (this was the biggest bug — before, you looked straight through into the roof void),
quoins, sills, keystones, mullions, a door with steps and a hood, a solid roof slab with visible
eaves thickness, ridge cap, barge boards, and optional dormer / projecting gabled bay / lean-to /
chimney. Roof pitch is clamped so it can never dwarf the walls it sits on.

## Zone-driven, never id-driven

Nothing branches on a zone id. `crest.type` drives the roofline (`wing` = arches whose feet sit
on the ridge plus rounded finials; `spikes` = black metal cones; `none` = nothing).
`edges` drives roof pitch, roof profile (`curved` gets the flared Tiny Glade kick) and merlon
caps (round / flat coping / pyramid). `window.shape` drives every opening including the gate
arch. `roof.tile === 'thatch'` drives slab thickness.

One inference worth knowing: a building only allocates a separate `crest` material when the zone
declares `crest.metalness`. Otherwise the crest is merged into `trim`. That is a data read, not
a zone check, and it saves a draw call in two zones out of three.

## Numbers (headless, 1280×720, dpr 1)

| shot | calls | tris |
|---|---|---|
| wall_day | 135 | 187k |
| creek_day | 119 | 155k |
| town_night | 96 | 124k |
| gate_night | 93 | 134k |
| street_dusk | 78 | 90k |

Mobile gate, headed, `--preset=medium --dpr=1 --w=844 --h=390`, worst shot (wall_day):
**gpu p95 3.1 ms / cpu p95 0.8 ms / 136 calls / 188k tris.** Inside every budget.

## The draw-call problem, and the fix that is waiting for the demo agent

Each building merges down to 4–5 meshes (wall / trim / roof / glass / crest). That is already
one merge per building, but 24 houses + 3 walls + 6 towers still costs ~135 calls before any
other system exists. 150 is the whole-scene budget.

`buildings.js` exports **`beginBatch()` / `endBatch(root)`** for this. Wrap scene construction:

```js
import { beginBatch, endBatch, wallRun, tower, house } from './buildings.js';

beginBatch();
...build and position everything exactly as now...
const merged = endBatch(this.object3D);   // reads each builder's world matrix
if (merged) this.object3D.add(merged);
```

Builders still return their own positioned `Object3D` with `userData` intact (so picking and the
editor keep working) — the geometry is just re-homed into shared meshes. Measured on one district:
**41 draw calls → 5, identical triangle count.** Across three districts that is roughly 135 → 15,
which leaves the rest of the budget for foliage, people, water and props.

The only requirement is that `endBatch` runs after the builders' groups have been positioned,
and that nothing moves them afterwards.

## Requests / things left undone

- **zones.js** — nothing needed. Every knob I wanted was already there. Two additions would be
  nice but are not blocking:
  - `roof.overhang` (light zone wants generous eaves, dark zone wants tight ones) — currently one
    constant in `TUNING.eaves`.
  - `window.density` (how heavily a zone glazes a façade) — currently one rule for all zones.
- **materials.js** — no new surface needed. `getMaterial` is used for
  `wall / trim / roof / glass / crest`. Note the kit does **not** use `wood`: folding doors,
  shutters and barge boards into `trim` saved a draw call per building, and with triplanar
  world-space texturing they read fine. If `wood` ever gets a distinctive grain worth a call,
  say so and I will split it back out.
- Geometry now carries **world-scale box-projected UVs** (1 uv unit = 1 metre) so every part of
  the kit agrees on texture scale. Materials currently projects triplanar from world space and
  ignores them, which is fine — but if that ever changes, the UVs are correct and consistent.
- Per-pane stained-glass variety (`glassMaterial(zoneId, variant)`) is **not** used, because a
  variant per pane would mean a mesh per pane. All panes share `getMaterial(zone, 'glass')`.
  The `Windows.discover()` fallback finds them correctly in merged geometry.
- Tuning lives in the exported `TUNING` object in `buildings.js` (`wallSeg`, `buttressEvery`,
  `panelT`, `eaves`, `rubble`). These are not registered as `quality.register` knobs because a
  change requires rebuilding the scene, which `buildings.js` cannot trigger. If the demo/editor
  agent adds a scene-rebuild hook, these should be wired to it.
- **Density, not the kit, is the remaining gap against the reference plates.** Tiny Glade towns
  are packed shoulder to shoulder with terraces, steps and retaining walls between buildings;
  the demo lays out isolated buildings on open grass. Silhouette and grounding both improve a
  lot if buildings are pushed closer together and off the grid.
