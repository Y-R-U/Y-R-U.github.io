# Level editor & the scene document — notes

Owned files: `js/editor/*`, `js/world/demo.js`. Two lines added to `js/main.js`, one to
`index.html`. `style.css` untouched — editor CSS is `js/editor/editor.css`.

---

## The big change: the scene is data

`demo.js` used to *be* the scene — 250 lines that built three districts in code. It is now the
world host (terrain, foliage, the five scenarios) and nothing else. The buildings come from a
**scene document**, and `js/editor/build.js` is the only thing that turns one into geometry.

```
js/editor/scene.js       the document: types, footprints, defaults, validation
js/editor/demoScene.js   the demo layout, emitting a document instead of meshes
js/editor/build.js       document → batched geometry, plus the live copy of one object
js/editor/editor.js      selection, pointer handling, every mutation
js/editor/ui.js          the ✎ sheet
js/editor/store.js       localStorage, named copies, file export/import
js/editor/panel.js       the existing settings panel (unchanged)
js/editor/editor.css
```

## The format

```jsonc
{
  "version": 1,
  "name": "Demo",
  "districts": [{
    "zone": "light",          // which zone's materials the district's dressing uses
    "cx": -70,                // district centre on x; objects are assigned by nearest centre
    "seed": 3086961,          // seeds the decorative RNG (foundations, kerbs, blocks, rubble)
    "road": [[x, z], …],      // street spine, registered with the terrain at boot
    "roadWidth": 3.6,
    "kerbs": [{ "x": …, "z": …, "len": …, "side": -1, "top": … }],
    "bridge": { "x": …, "z": …, "halfSpan": 5.6 },
    "dressSkip": 191
  }],
  "objects": [{
    "id": 1,
    "dist": 0,                // which district batch it merges into
    "zone": "light",          // materials — free to differ from the district
    "type": "wallRun",        // wallRun | tower | house | mass
    "x": -70, "z": -34, "ry": 0,
    "p": { "length": 56, "height": 9, "thickness": 2.4 },
    "fp": [28.6, 1.9],        // optional footprint override; derived from `p` when absent
    "rubble": true            // wallRun only: spill debris along both faces
  }]
}
```

**`y` is never stored.** Every object is seated on `terrain.range(x, z, hw, hd, ry).hi` at build
time, so a document is valid against any terrain.

**`p` is exactly what the builder takes** — `wallRun{length,height,thickness}`,
`tower{radius,height,sides}`, `house{w,d,h}`. `mass` is the cheap gabled block that used to be
`plainHouse()` in `demo.js`; it takes `{w,d,h}` too. `TYPES` in `scene.js` carries the slider
schema for each, so the Object sheet builds itself the same way the settings panel does.

**Footprint** = plan half-extents plus a per-type margin (`TYPES[t].margin`). It is what blocks
foliage, drives the contact decal and is sampled for the seat height. The demo overrides it on
exactly two objects per district (the campanile and the hall), which is why `fp` exists.

### `dressSkip`, and why it is there

Foundations, kerbs, the bridge, the wall rubble and every background block are *decoration* —
derived from the objects, not authored. The demo rolled all of it from the same RNG stream as
its layout, so the only way to reproduce the shipped look byte-for-byte is to start that stream
where the layout left off. `dressSkip` is that offset (191 / 173 / 176 for the three districts),
computed by the generator, carried in the document, and `0` for anything hand-built.

## Reproducing the demo exactly

`demoScene()` is the old layout code with `wallRun(...)`/`house(...)` calls replaced by pushes
into `objects`. The RNG draw order is identical — including two places where the original
relied on JS argument-evaluation order, which is the one bug this refactor introduced and then
fixed. Verified two ways:

- Per-surface triangle counts across the whole scene are **identical** to the pre-refactor
  build, including `contactAO` (which encodes every footprint *and* every scatter prop decal, so
  terrain occupancy and foliage placement match too).
- `demoScene()` → JSON → `localStorage` → reload → `normalise()` → rebuild gives the same
  fingerprint, so the serialised form is lossless.

Pixel-diffing the five scenarios is no longer meaningful on its own: `people.js` animates on
wall-clock time, so two runs of *identical* code already differ by ~40 px.

## Batching, and how editing does not break it

A district is one `beginBatch()` / `endBatch()` pair, exactly as `NOTES_BUILDINGS.md` asks. The
demo's 82 objects come out as **13 meshes** (wall / trim / roof / glass per district, plus one
crest).

Two things make live editing safe:

**Sinking, not removing.** `buildings.js` seeds each builder from a module-global counter of how
many builders have run in the current batch. Pulling an object *out* of the batch would therefore
re-roll the dormers, lean-tos and bays of every building after it — visibly, mid-drag. So the
selected object is still built into the batch, just 4 km below the world. The rest of the batch
is untouched; the only cost is that the district's bounding sphere stops culling while something
is selected.

**Seed replay for the live copy.** The unmerged copy has to be seeded as the *n*-th builder or it
comes out as a different building. `endBatch()` clears the pending list without resetting the
counter, so `liveObject()` opens a batch, advances the counter with `n` empty `dressing()` calls
(the cheapest call that still consumes one), closes it, and then builds for real — unbatched,
which is how it gets its own meshes. For a `mass` the same idea applies to the decoration RNG:
the preceding blocks are replayed into a throwaway `Batch`.

The upshot: the live copy is pixel-identical to the merged one, so nothing pops on commit.

## Interaction

- **✎** next to the ⚙ toggles the editor. It parks the player controller and hides `#touch`
  while it is open, and restores both on close.
- **Tap** a building to select it. Picking is a ray against each object's oriented footprint box
  — analytic, no picking meshes, no geometry cost.
- **Drag** a selected building to move it. The object rides the ground point under the pointer;
  OrbitControls is suspended for the duration. Nothing rebuilds during the drag.
- **Sheet**: Place (zone + kind chips, one big arm button), Object (actions first so Delete and
  Done are above the fold on a phone, then zone, rotation and the type's parameters), Scene
  (name, counts, live draw-call readout, undo, save copy, export, import, reset).
- Desktop also gets Esc / Delete / ⌘Z / ⌘D.
- Everything is ≥ 44 px and the sheet is thumb-anchored to the bottom edge; above 760 px it
  becomes a floating right-hand column.

## Save / load

- The working scene autosaves to `localStorage['forge.scene']` on every commit.
- Named copies live in `localStorage['forge.scenes']`; **Export/Import** move `.forge.json` files.
- **Reset to demo** clears the key, so the demo is always one tap away and is regenerated rather
  than restored from a copy that might have drifted.
- Loading a *different* scene reloads the page. Roads, the creek crossing and the foliage are
  baked into the terrain before it is triangulated, so pretending they can be swapped live would
  be a lie. Object edits never need it.
- **`?shot=` always loads the demo**, whatever is saved. `tools/shot.mjs` can never render
  somebody's half-finished level.

## Numbers

Headless, 1280 × 720, dpr 1, `--preset=high`, all five scenarios:

| state | draw calls | triangles |
|---|---|---|
| committed | **74** | 577 k |
| editing — house lifted out | 80 | 587 k |
| editing — tower / wall / block lifted out | 82 | 578–594 k |

The editor costs **nothing** committed: same 74 calls and same triangles as before this work
(the scene was 68 / 561 k before `people.js` landed mid-session). While an object is selected it
costs 3–4 extra meshes — doubled by the shadow pass — plus one line-loop gizmo. Texture memory
is unchanged at 50 MB: the editor is DOM and adds no maps.

Timings (headless, software rasteriser — indicative, not gate numbers):

| operation | ms |
|---|---|
| select (district re-merge + live build + decals) | 46 |
| drag, per pointer move | < 1 |
| parameter slider step (live object only) | 3 |
| deselect / commit | 33 |
| one district rebuild | 19 |
| whole scene rebuild (undo) | 75 |
| contact-decal rebuild | 1 |

## Things other agents should know

- **`demo.js` no longer contains the scene.** `SHOTS` and `setCameras()` still live there and are
  still the camera contract; the buildings are in `js/editor/demoScene.js`.
- **`plainHouse` and the bridge moved** out of `demo.js` into `build.js`, unchanged.
- The editor writes into two public `terrain` fields when it rebuilds contact shade:
  `terrain.decalRings` (cleared and refilled) and a re-run of `terrain.finish()` after removing
  the old `contactAO` mesh. Nothing else in `terrain.js` is touched.
- `window.__forge.editor` is the controller. `__forge.editor.doc` is the live document.

## Requests

- **`buildings.js`** — one additive change would fix the only real wart in here: let the options
  object carry a `seed`, i.e. `house(zone, { w, d, h, seed })`, and use it in place of the module
  counter when present. Today an object's fine detail depends on **how many builders ran before
  it in its batch**, which means deleting a building re-rolls the dormers and bays of every
  building after it in that district, and it is why `liveObject()` has to replay a counter. With
  a per-object seed the editor would store it in the document, every object would be stable under
  insert and delete, and the replay could go.
- **`terrain.js`** — a `rebuildContact()` (drop the `contactAO` mesh, refill `decalRings`,
  re-run `finish()`) would let the editor stop reaching into fields. Ditto a way to re-register
  paths so a swapped scene could move its roads without a page reload.
- `TUNING` in `buildings.js` and the terrain constants can now be wired to a scene-rebuild hook —
  `__forge.editor.builder.buildAll(doc)` is 75 ms and is exactly that hook. Not done, because
  those knobs belong to whoever owns those files.

## Still open

- **Kerbs are district data, not object data.** They are the retaining walls along the street and
  the demo generates them from its row layout; the editor cannot author or move them, and moving
  a building does not move the kerb in front of it. They carry a baked `top` so they survive
  their building being deleted, which is how the demo behaves today.
- **Roads and the bridge are not editable** for the terrain-baking reason above.
- Foliage and ground vertex AO are baked at boot, so a building placed in the editor does not
  push grass out of its footprint until a reload. The contact collar *does* update.
- No multi-select, no copy between districts other than dragging across the boundary, no grid or
  angle snapping. Undo is objects-only (24 deep) and does not cover district fields.
- The Object sheet has no numeric entry — sliders only. Fine on a phone, coarse on a desktop.
