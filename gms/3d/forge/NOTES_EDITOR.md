# Level editor & the scene document — notes

Owned files: `js/editor/*`, `js/world/demo.js`. Two lines added to `js/main.js`, one to
`index.html`. `style.css` untouched — editor CSS is `js/editor/editor.css`.

---

## The big change: the scene is data

`demo.js` used to *be* the scene — 250 lines that built three districts in code. It is now the
world host (terrain, foliage, the five scenarios) and nothing else. The buildings come from a
**scene document**, and `js/editor/build.js` is the only thing that turns one into geometry.

```
js/editor/scene.js       the document: types, footprints, defaults, migration, validation
js/editor/demoScene.js   the demo layout, emitting a document instead of meshes
js/editor/build.js       document → batched geometry, plus the live copy of one object
js/editor/editor.js      selection, gestures, every mutation, undo, save
js/editor/ui.js          the ✎ sheet, the notice/confirm bar
js/editor/store.js       localStorage, named copies, file export/import
js/editor/panel.js       the settings panel (+ `refreshPanel()` for late knobs)
js/editor/editor.css
```

## The format — version 2

```jsonc
{
  "version": 2,
  "name": "Demo",
  "districts": [{
    "zone": "light",          // which zone's materials the district's dressing uses
    "cx": -70,                // district centre on x; objects are assigned by nearest centre
    "seed": 3086961,
    "dressSeed": 118240733,   // seeds foundations, kerbs, the bridge — the district's own decor
    "road": [[x, z], …],      // street spine, registered with the terrain at boot
    "roadWidth": 3.6,
    "kerbs": [{ "x": …, "z": …, "len": …, "side": -1, "top": … }],
    "bridge": { "x": …, "z": …, "halfSpan": 5.6 }
  }],
  "objects": [{
    "id": 1,
    "dist": 0,                // which district batch it merges into
    "zone": "light",          // materials — free to differ from the district
    "type": "wallRun",        // wallRun | tower | house | mass
    "x": -70, "z": -34, "ry": 0,
    "seed": 8112733,          // this object's own detail: dormers, bays, quoins, windows
    "p": { "length": 56, "height": 9, "thickness": 2.4 },
    "fp": [28.6, 1.9],        // optional footprint override; derived from `p` when absent
    "rubble": true,           // wallRun only: spill debris along both faces
    "rubbleSeed": 44012       // …seeded separately so toggling it is stable
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

### v1 → v2

v1 had no per-object seeds: `buildings.js` seeded each builder from a counter of how many
builders had already run in the batch, so deleting one building re-rolled the detail of every
building after it, and the demo carried a `dressSkip` to fast-forward one shared RNG per
district. `buildings.js` now takes `seed` in the options object, every object owns one, and
`build.js:seedDocument()` stamps the demo's objects once at generation time so the shipped look
is reproduced exactly. `normalise()` migrates a v1 document by handing out fresh seeds and
saying so in the load report — the old detail is not recoverable from the data.

`normalise()` is also the validator for anything untrusted: unknown types and zones are dropped,
every number is coerced with a default, ids are made unique, a document from a *newer*
`SCENE_VERSION` is refused rather than half-read, and the report carries `dropped` + `warnings`
so the caller can say what was lost.

## Batching, and how editing does not break it

A district is one `beginBatch()` / `endBatch()` pair, exactly as `NOTES_BUILDINGS.md` asks. The
demo's 82 objects come out as **13 meshes**, counted: 4 / 4 / 5 (wall / trim / roof / glass per
district, plus a crest).

**Sinking, not removing.** The selected object is still built into the batch, just 4 km below the
world (`builder.held`). Pulling it out of the batch entirely is now safe for *detail* — seeds are
per object — but it would still re-merge the district on every drag frame, so the sink stays.
The only cost is that the district's bounding sphere stops culling while something is selected.

### The live copy versus the merged one — corrected

The previous notes claimed *"the live copy is pixel-identical to the merged one, so nothing pops
on commit."* **That was wrong**, and the later claim that a re-zoned block differs by 4.31% with
a different chimney, ridge pitch and windows was wrong too. Measured, both are false and the
truth is a third thing:

- The **building** is identical. Same seed, same params, same zone → same geometry, merged or
  live, and re-zoning changes nothing about that. Verified by pixel diff at 1280×720 with the
  people hidden and the gizmo suppressed: select ↔ commit ↔ re-select differed only in the
  **ground dressing**, and the counts were identical for the original zone and after a zone
  change (house 3017 px both ways, tower 7519 px both ways — a re-roll would not repeat itself).
- What *did* pop was **grounding**: the held object was skipped when the contact-AO collar was
  rebuilt, and its foundation skirt lives in the district's dressing, which it had been lifted
  out of. So a selected building lost its contact shadow and its plinth, and got them back on
  deselect — worst on a slope.

Both are fixed:

- `refreshDecals(opacity, skip)` now only skips an object **while a finger is dragging it**
  (where a collar would otherwise sit at the pick-up point). Merely selecting keeps it.
- `liveObject()` builds the object's foundation skirt into the live copy, in the district's
  zone, so it travels with the building instead of staying behind in the batch.

Same measurement after the fix: **house 3017 → 9 px, tower 7519 → 65 px** on a 1280×720 frame,
and what is left is antialiasing along the roofline, not a change of shape.

## Interaction — thumb rules

- **✎** next to the ⚙ toggles the editor. It parks the player controller and hides `#touch`
  while it is open, and restores both on close.
- **Tap** a building to select it. Picking is a ray against each object's oriented footprint box
  — analytic, no picking meshes, no geometry cost.
- **A press is a tap until the finger has moved `tapSlop` pixels** (knob, default 18; a mouse
  gets 4). There is **no time limit at all** — a slow deliberate thumb tap is still a tap.
  Pressing the selected building only *offers* a drag; nothing moves, and no undo entry is
  pushed, until the slop is crossed. Before this, 3 px of thumb wobble moved a building 3.9 m
  and burned an undo slot.
- **Drag** a selected building to move it. The offset is taken at press time, so the building
  does not jump when the drag engages. OrbitControls is suspended for the duration; nothing
  rebuilds during the drag.
- **One pointer owns a gesture.** `pointerdown` is ignored unless `isPrimary` and nothing is
  already pressed; move, up and cancel all check `pointerId`. A second thumb cannot commit the
  first one's drag, cannot move it, and cannot drop an armed placement.
- **An interrupted gesture reverts.** `pointercancel` (iOS back-swipe, system gestures) and
  closing the editor mid-drag both put the object back where it was picked up and truncate the
  undo stack to where the gesture started.
- **Sheet**: Place (zone + kind chips, one arm button that also disarms), Object (actions first
  so Delete and Done are above the fold, then zone, rubble for walls, rotation, parameters),
  Scene (name, counts, live draw-call readout, undo/redo, save copy, export, import, reset).
  A new selection pulls the sheet to the Object tab, but only on the change — the other tabs
  stay reachable while something is selected.
- Desktop also gets Esc (cancel a confirm, then disarm, then deselect) / Delete / ⌘Z / ⌘⇧Z / ⌘D.
- Everything is ≥ 44 px and the sheet is thumb-anchored to the bottom edge; above 760 px it
  becomes a floating right-hand column.

## Telling the truth about saving

**Never `alert`/`confirm`/`prompt`.** The sheet has a bar under the tabs which shows, in order:
a pending confirmation, a standing storage failure, then the last notice (dismissable, and it
does not start its 8 s timer until the sheet is actually open — the boot load report would
otherwise expire unseen).

- The working scene autosaves to `localStorage['forge.scene']` on every commit, debounced by
  250 ms, and **flushed on `pagehide` / `visibilitychange`** — switching apps on a phone can end
  the page, and the debounced write is exactly the edit that would not have landed.
- `store.js` probes localStorage once at import, because private-mode Safari and a full quota
  both throw on *write* and never on read. A failed write raises a standing red bar — *"Not
  saving — storage is full. Use Export file to keep this scene."* — which clears itself if
  storage comes back. A save that silently did not happen is the failure this exists to prevent.
- A saved scene that will not parse is copied to `localStorage['forge.scene.broken']` before the
  editor's first autosave can overwrite it, and the load report says so.
- Named copies live one key each in `localStorage['forge.slot.<name>']` with an index in
  `forge.slots`, so a corrupt byte costs one copy instead of all of them. The old single-blob
  `forge.scenes` key is migrated on first read.
- **Everything that discards work asks first, in the sheet**: reset to demo, load a copy, import
  a file, delete a copy, overwrite a copy of the same name. The confirm button is the verb
  ("Reset", "Load", "Delete", "Replace"). Deleting an *object* does not ask — it is undoable, and
  says so in the notice.
- Loading or resetting keeps the current scene as a copy first (`Before load`, `Before import`,
  `Before reset`). If that backup cannot be written, the editor asks a second time rather than
  quietly binning the scene.
- **Undo is objects-only, 24 deep**, and gestures coalesce: a whole drag, or a whole slider
  sweep, is one entry. Redo is the mirror and is cleared by any new edit. An empty stack says
  "Nothing to undo" instead of doing nothing.
- Loading a *different* scene reloads the page. Roads, the creek crossing and the foliage are
  baked into the terrain before it is triangulated, so pretending they can be swapped live would
  be a lie. Object edits never need it.
- **`?shot=` always loads the demo**, whatever is saved. `tools/shot.mjs` can never render
  somebody's half-finished level.

## Numbers

Headless, 1280 × 720, dpr 1, `--preset=high`, measured with `performance.now()` in the page:

| operation | ms |
|---|---|
| select (district re-merge + live build + decals) | 34 |
| drag, per pointer move | ~1 |
| commit at the end of a drag (same district) | 1.4 |
| parameter slider step (coalesced to one rAF) | 0.1 |
| deselect / commit | 28 |
| contact-decal rebuild | ~1 |

Draw calls: 73 committed → 81 while an object is selected. The three districts merge to 13 meshes
(4 / 4 / 5) and return to 13 on deselect; the live copy is 4–5 meshes — the builder's surfaces
plus its foundation — most of them drawn again for the shadow pass, plus the gizmo. Texture memory unchanged
— the editor is DOM and adds no maps. *Absolute scene numbers move under `people.js` /
`scatter.js`, which changed twice while this pass was running; the delta is the part to trust.*

Timings from a software rasteriser: indicative, not gate numbers.

## Things other agents should know

- **`demo.js` no longer contains the scene.** `SHOTS` and `setCameras()` still live there and are
  still the camera contract; the buildings are in `js/editor/demoScene.js`.
- **`plainHouse` and the bridge moved** out of `demo.js` into `build.js`, unchanged.
- The editor writes into two public `terrain` fields when it rebuilds contact shade:
  `terrain.decalRings` (cleared and refilled) and a re-run of `terrain.finish()` after removing
  the old `contactAO` mesh. Nothing else in `terrain.js` is touched.
- `panel.js` exports `refreshPanel()`. `buildPanel()` runs before `buildEditor()` in `main.js`,
  so a knob registered by the editor needs the panel re-rendered to get its UI. Anything else
  registering late can use it too.
- `window.__forge.editor` is the controller. `__forge.editor.doc` is the live document.

## Requests

- **`terrain.js`** — a `rebuildContact()` (drop the `contactAO` mesh, refill `decalRings`,
  re-run `finish()`) would let the editor stop reaching into fields. Ditto a way to re-register
  paths so a swapped scene could move its roads without a page reload.
- `TUNING` in `buildings.js` and the terrain constants can now be wired to a scene-rebuild hook —
  `__forge.editor.builder.buildAll(doc)` is ~75 ms and is exactly that hook. Not done, because
  those knobs belong to whoever owns those files.

## Still open

- **Kerbs are district data, not object data.** They are the retaining walls along the street and
  the demo generates them from its row layout; the editor cannot author or move them, and moving
  a building does not move the kerb in front of it. They carry a baked `top` so they survive
  their building being deleted, which is how the demo behaves today.
- **Roads and the bridge are not editable** for the terrain-baking reason above.
- Foliage and ground vertex AO are baked at boot, so a building placed in the editor does not
  push grass out of its footprint until a reload. The contact collar *does* update.
- No multi-select, no grid or angle snapping, no numeric entry (sliders only — fine on a phone,
  coarse on a desktop). Undo does not cover district fields or the scene name.
- **Duplicate gives the copy a new seed**, so it is the same size but not the same building.
  Deliberate for now — there is no re-roll button, so an exact clone would leave no way to get
  variation — but it is a coin-flip and worth revisiting.
- Nothing warns before the *page* closes with unsaved work, because there is no unsaved work:
  every commit saves. If autosave is ever made optional, a `beforeunload` guard becomes
  necessary at the same moment.

## What in here was verified, and how

Driven headlessly through CDP (`tools/shot.mjs --shot=none --eval=…` and a multi-step driver),
dispatching real `PointerEvent`s with explicit `pointerId` / `isPrimary` at the canvas and real
`click()`s at the sheet, then asserting on the document:

- tap-vs-drag: 3–8 px of thumb movement, and a 30-move slow press, move nothing and add no undo
  entry; 8 px of *mouse* movement does drag; a 96 px drag moves 11.5 m and adds exactly one entry.
- multi-touch: a second `pointerId` cannot move, commit or place another pointer's gesture.
- `pointercancel` and closing the editor mid-drag both revert the position and drop the entry;
  the late `pointerup` then does nothing.
- armed placement: ghost appears, one object lands, the brush disarms and the new object is
  selected; a tap with no terrain under it places nothing and says so.
- every confirm: cancel really cancels, the action only happens on the second tap.
- storage: `setItem` forced to throw → `saveNow()` returns false, the standing bar appears with
  the right reason, and it clears when storage comes back. Corrupt saved scene → notice waits for
  the sheet to open, `forge.scene.broken` holds the bytes. A v1 document with an unknown type and
  an unknown zone migrates, drops 2 objects, seeds the survivor and lists all of it in the confirm.
- saved copies: names render (they rendered as `0` before — `Object.keys` of an array) and Load
  hands `swapScene` a document (it used to hand it the `normalise()` *report*, which would have
  been saved as the scene).
- undo/redo: place → drag → rotate → resize → delete makes 5 entries; unwinding all of them is
  byte-identical to the start state and redoing all of them is byte-identical to the end state;
  the result survives a page reload.
- `ed.save()` — which does not exist — used to throw on every slider release and every rename.
  Fixed and asserted: no exception on `change`.
- the `tapSlop` knob reaches the settings panel and retunes the live threshold.
- live-vs-merged pixel diffs and the timings above.

Read but **not** executed, and worth a real phone:

- Export and Import through the file picker. Headless cannot drive it. The `normalise()` path
  that Import feeds is exercised, via a saved copy, in the tests above; the picker plumbing is not.
- `pagehide` / `visibilitychange` flushing, private-mode Safari, and iOS taking a touch away for
  its back swipe. The `pointercancel` handler is verified with a synthetic event, not a real one.
- Perf: headless is a software rasteriser, so none of the numbers above are gate numbers.
