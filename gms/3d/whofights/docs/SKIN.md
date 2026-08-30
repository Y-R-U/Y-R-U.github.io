# Skins — the dummy body and its Flux textures

The second class of character in Who Fights. The **robed** rig in `js/world/people.js` is the
default look and is not touched by any of this; the **dummy** is a crash-test-dummy body with real
UVs that gets dressed by a texture a local Flux model paints from a sentence you type.

```
tools/skin/layout.mjs     the rig AND the unwrap — one file, no three, no DOM
tools/skin/template.mjs   → art/skin/pose_ref.png, pose_ref_1024.png, uv_guide.png
tools/skin/skin.mjs       generate one skin        → art/skins/<id>.png + .json + _raw.png
tools/skin/dilate.mjs     edge padding (run automatically by skin.mjs)
tools/skin/render.mjs     headless four-view render of the dummy wearing a skin
tools/skin/uitest.mjs     real clicks through the studio, headless
js/world/dummy.js         the mesh, the material, skin loading (tracked through engine/budget.js)
js/dev/skin/preview.js    the turntable, shared by the tab and the bench page
js/dev/skin/gen.js        client for POST /api/skin
js/dev/skin/bench.html    the dummy alone; render.mjs drives it
js/dev/skin/studio.html   the Skin tab standalone — see "reaching the tab" below
js/dev/tabs/skin.js       the tab
```

---

## 1. The idea, in one line

**The UV layout is a character turnaround sheet.** The left half of the texture is the dummy seen
from the front, the right half is the same dummy from behind, both orthographic and at the same
scale. Every front-facing polygon takes its UV straight from that projection.

That is the whole reason this works. A front/back turnaround on white is something an image model
draws extremely well unprompted — the very first probe here produced a clean one — so the texture
Flux naturally wants to make *is* the texture the mesh wants to receive. Ask it instead to fill a
conventional packed atlas of rectangular islands and it has nothing to draw on.

It also satisfies the legibility requirement for free: open `art/skin/uv_guide.png` and the island
that is the face is a face.

## 2. Running it

```bash
node tools/skin/template.mjs                      # after any change to the rig
node tools/skin/skin.mjs --desc="a rusted iron knight in battered plate armour" --out=knight
node tools/skin/render.mjs --skin=art/skins/knight.png     # then OPEN the png
node tools/skin/uitest.mjs                        # the studio, real clicks
```

Roughly five minutes per skin in `edit` mode, seventy seconds in `txt2img`. §6.

## 3. The rig

`PARTS` in `layout.mjs` is a list of parts, each a chain of **sections**: an axis-aligned rectangle
in xz at a height y, swept to the next one. Joints carry a deliberate bulge at shoulder, elbow and
knee — this is a crash-test dummy, not an anatomy study, and those balls are what make it read as
one. 284 quads, 568 triangles, one material, one draw call.

**Two bodies, one skin.** `SHAPES.m` and `SHAPES.f` are multipliers on the canonical rig — shoulder,
waist and hip width, limb thickness, overall height. Positions come from the shaped rig; **UVs
always come from the canonical one**, so both bodies have identical UVs and vertex counts and one
painted skin fits either. `faces('m')` and `faces('f')` are asserted to have byte-identical UV sets
in `tools/skin/layout.test.mjs`.

The cost of that: neither shape may stray far from the average before the texture visibly stretches
over it. The dials are modest for exactly that reason. A shape that needed its own proportions —
a child, an ogre — would need its own skin as well, and the honest answer there is a second atlas.

`sex` on a character picks `m` or `f` and nothing else. It is not `gender`, which is metadata for
the author and never selects a mesh.

## 4. The unwrap, and the one wrinkle in it

Front-facing polygons project into the left panel, back-facing into the right (mirrored, so the
figure's own left stays on the same side of the sheet in both views — which is what a turnaround
sheet does and what Flux draws when it is not told otherwise).

Faces whose normal is nearly parallel to the projection plane — the sides of a limb, the top of the
head, the sole of a foot — have no area in that projection at all. They are **folded inward**: the
side of an arm samples the outermost centimetres of the front of that arm, mirrored. Those UVs
overlap the front face's, which costs nothing here because nothing is baked, and it never reaches
outside the painted figure. Folding *outward* would have put the side of every limb on the
background. The red edges in `uv_guide.png` are those folded strips.

The visible consequence: **the sides of the model are a smear of its front and back edges.** At
game distance that is invisible. Under a turntable at two metres you can see it on the outer thigh.
That is the price of an unwrap that an image model can paint, and it is the right trade here.

## 5. Edge padding is not optional

Flux never fills the mannequin silhouette to the last pixel, and the folded strips sample exactly
those outermost texels. Without padding every limb gets a white sliver down its side and the model
looks broken in a way the texture sheet does not — the sheet is beautiful, the character has racing
stripes.

`tools/skin/dilate.mjs` floods the white background in from the border (border-connected, so a
white highlight inside the armour is not eaten) and then grows the painted colour outward into it
for twenty passes. `skin.mjs` runs it on every generation; `<id>_raw.png` keeps the untouched sheet,
because that is the one to look at when judging a generation.

This was the single largest quality win in the whole pipeline. It is also the least interesting,
which is why it is written down here.

## 6. Generating

`buildPrompt()` in `tools/skin/skin.mjs` owns the wrapper, and both the CLI and the dev server route
call it, so there is one prompt in the project and not two that drift.

**`edit` (the default).** The grey mannequin `art/skin/pose_ref.png` goes in as a reference and
every instruction in the prompt is about *not moving it*: same pose, same outline, same height,
same width, same position. Output 1024×1024, 14 steps, `flux2-klein-4b`. ~5 minutes.

**`txt2img`.** No reference. ~70 seconds, and a much prettier drawing — but the figure lands
wherever it likes, at whatever scale it likes, so most of the sheet misses the islands. See §7.

The reference is downscaled to 512² before upload (`pose_ref.png`; `pose_ref_1024.png` is the full
one). It made no measurable difference to time or quality — the bottleneck is the 1024² output —
but the mannequin has no detail to lose, so the smaller one is the default.

## 7. Reliability — what actually happens

See `docs/SKIN_RESULTS.md` for the run this is drawn from, with every image.

## 8. Reaching the tab

`js/dev/hub.js`'s `SLOTS` list has no `skin` id and that file belongs to the dev-infrastructure
agent, so the hub does not import `js/dev/tabs/skin.js` yet. Until **one line** is added there:

```js
{ id: 'skin', label: 'Skins', order: 35, owner: 'skin agent' },
```

…the tab is reached standalone at **`http://localhost:8796/js/dev/skin/studio.html`**, which mounts
the same module in a minimal shell. Nothing else needs to change; `skin.js` already calls
`registerTab` and will simply appear.

## 9. Dev server

One additive route, `POST /api/skin`, alongside `/api/flux`:

| | |
|---|---|
| body | `{id, desc, mode, seed, steps}` — or `{raw:true, prompt}` |
| does | builds the prompt, uploads the pose reference to mflux, runs on the **same GPU queue**, pads the result, writes `art/skins/<id>.png`, `_raw.png`, `.json` and refreshes `index.json` |
| returns | `{ok, job, position, out, prompt}` — then poll `/api/job/<id>` as usual |

Two other one-word changes to `tools/devserver.mjs`: `/api/skin` added to `WRITE_ROUTES`, and
`art/skin` + `art/skins` added to the `/api/ls` whitelist. **The running dev server must be
restarted to pick those up**; the studio falls back to `art/skins/index.json` when it has not been,
which is also what makes it work with no dev server at all.

## 10. What is not done

- **Nothing writes `data/characters.json`.** The contract now has `body: "dummy"` with `sex` and
  `skin`; wiring a dummy into `js/game/characters.js` and placing one in the level is the next
  agent's job, and it is small — `Dummy` from `js/world/dummy.js` takes `{shape, map}`.
- **No animation.** The dummy is a static mesh. `people.js`'s cloth shader does not apply and a
  jointed dummy wants real bones, not vertex wobble.
- **No normal or roughness map.** A skin is albedo only. Nothing generated is a usable normal map,
  and pretending otherwise puts baked highlights on top of the renderer's own lighting.
- **Hands and feet are stubs**, and a front/back projection barely sees them — the top of a foot is
  a folded strip, not a painted surface. Boots read fine; fingers never will.
