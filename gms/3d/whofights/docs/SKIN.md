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
node tools/skin/render.mjs --all --shape=m                 # every skin, one contact sheet each
node tools/skin/uitest.mjs                        # the studio, real clicks, no GPU
node tools/skin/uitest.mjs --server=http://localhost:8796 \
  --generate="a sand-worn desert nomad" --name=nomad       # …and one real generation through it
```

Two to nine minutes per skin in `edit` mode, two in `txt2img`. §6.

**Open the render.** A texture sheet is not evidence; the four-view contact sheet is. Every claim
in §4, §5 and §7 below came out of looking at one, and two of them contradicted what the sheet
alone suggested.

## 3. The rig

`PARTS` in `layout.mjs` is a list of parts, each a chain of **sections**: an axis-aligned rectangle
in xz at a height y, swept to the next one. Joints carry a deliberate bulge at shoulder, elbow and
knee — this is a crash-test dummy, not an anatomy study, and those balls are what make it read as
one. 284 quads, 568 triangles, one material, one draw call.

**Two bodies, one skin.** `SHAPES.m` and `SHAPES.f` are multipliers on the canonical rig — shoulder,
waist and hip width, limb thickness, overall height. Positions come from the shaped rig; **UVs
always come from the canonical one**, so both bodies have identical UVs and vertex counts and one
painted skin fits either. `faces('m')` and `faces('f')` are asserted to have byte-identical UV sets
in `js/dev/skin/layout.test.mjs`, and `render.mjs --all` (both shapes, no `--shape`) is the version
of that check you can look at: the same sheet on both bodies, face on the face, with visible but
mild stretch across the female hips.

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

The visible consequence, as rendered rather than as predicted: **the sides of the model are a
smear of its front and back edges, and where Flux painted inside the mannequin's outline they are a
smear of the edge padding instead.** The smear itself is fine — under a flat-shaded low-poly look it
reads as a lit edge, and at game distance it is invisible. The padding is the part that had to be
fixed; see §5.

The measurement, on `watch_s11`: down the arm, Flux's painted edge tracks the mannequin's to within
about ten texels, sometimes outside it and sometimes inside. Where it falls inside — the upper arm
and the shoulder ball are the worst — the whole folded strip lands on background. Rendering the
sheet with its background flooded magenta shows exactly which parts of the model are padding rather
than paint, and is the fastest way to answer "is this the unwrap or is it the drawing".

## 5. Edge padding is not optional

Flux never fills the mannequin silhouette to the last pixel, and the folded strips sample exactly
those outermost texels. Without padding every limb gets a white sliver down its side and the model
looks broken in a way the texture sheet does not — the sheet is beautiful, the character has racing
stripes.

`tools/skin/dilate.mjs` floods the white background in from the border (border-connected, so a
white highlight inside the armour is not eaten), grows the painted colour outward into it for twenty
passes, and then **blurs the grown ring only**. `skin.mjs` runs it on every generation;
`<id>_raw.png` keeps the untouched sheet, because that is the one to look at when judging a
generation, and it is gitignored.

The blur is not cosmetic. Growth propagates each source texel outward in a straight ray, so an ink
outline and a metal highlight sitting side by side come out as a **comb of alternating light and
dark teeth** — and the folded strips run that comb down the entire length of the limb, which is far
louder than any flat band would be. Four passes of a 3×3 mean over the grown pixels turns it into a
wash of the edge's own average colour, which is what the side of a limb should look like anyway.

Two things that were tried and did not work, so nobody tries them again:

- **More passes.** 20 → 60 → 140 is pixel-for-pixel identical on the model. The strips only ever
  sample the first twenty texels; everything past that is padding nothing reads.
- **Insetting the fold** so it starts twelve texels inside the silhouette instead of on it. It
  changed 0.5 % of the frame and nothing visible. Where Flux paints inside the outline the gap is
  wider than any inset small enough to keep the fold on the limb.

## 6. Generating

`buildPrompt()` in `tools/skin/skin.mjs` owns the wrapper, and both the CLI and the dev server route
call it, so there is one prompt in the project and not two that drift.

**`edit` (the default).** The grey mannequin `art/skin/pose_ref.png` goes in as a reference and
every instruction in the prompt is about *not moving it*: same pose, same outline, same height,
same width, same position. Output 1024×1024, 14 steps, `flux2-klein-4b`. ~5 minutes.

**`txt2img`.** No reference. ~2 minutes, and a much prettier drawing — but the figure lands
wherever it likes, at whatever scale it likes, so most of the sheet misses the islands. It produced
nothing usable in three attempts and it is a preview of a drawing, not a way to make a character.
See §7.

The reference is downscaled to 512² before upload (`pose_ref.png`; `pose_ref_1024.png` is the full
one). It made no measurable difference to time or quality — the bottleneck is the 1024² output —
but the mannequin has no detail to lose, so the smaller one is the default.

## 7. Reliability — what actually happens

Fifteen generations, five subjects, judged on the four-view render and not on the sheet. The bar is
"would this go in a game as it came out, with no touch-up".

| | `edit` | `txt2img` |
|---|---|---|
| ships as-is | **8 / 12** | 0 / 3 |
| good costume, unusable head | 3 / 12 | 0 / 3 |
| unusable | 1 / 12 | 3 / 3 |

**`edit` mode is about two thirds reliable, and the third that fails almost always fails in the same
place: the head.** The reference mannequin's head is a featureless grey egg, and "do not change the
outline" beats "paint a face" every time. A bare-headed subject — the baker, the ranger — comes back
with a beautifully painted costume above which sits a blank grey mask. A subject whose head has
something on it comes back complete: every knight (visor), the watch sergeant (open-faced helm), the
nomad (hood and face scarf) and the undead (skull) landed a head that reads.

So the single most useful thing to know when writing a prompt: **say what is on the head.** A helmet,
a hood, a mask, a hat, a scarf, a painted face — anything that gives Flux a frame to draw into. That
one habit is the difference between a two-thirds hit rate and something close to a ninety-percent
one.

The second failure mode is rarer and worth recognising: Flux sometimes reads the grey mannequin as
the character's own grey skin and leaves whole limbs unpainted rather than painting over them
(`ranger`, seed 11 — green armour, grey arms and legs). It is a re-roll, not a fix.

`txt2img` went 0 for 3 and is not close. The figure lands at its own scale and position, so the
islands sample background: white bands down the arms and legs, a face on a collarbone. It is useful
for looking at a drawing before spending nine minutes on the real thing, and for nothing else.

Cost, measured: 2–9 minutes per `edit` generation on the local `flux2-klein-4b` (the spread is real
and it is the queue, not the prompt), about 2 minutes for `txt2img`. At a two-thirds hit rate that
is roughly ten GPU-minutes per usable character — cheap enough to iterate on a cast, and slow enough
that you want the prompt right before you press it.

**The verdict.** Yes, with the head caveat, for this art style. A crowd of townsfolk and a bestiary
of one-off enemies is a good use of it: the characters are distinct at a glance, the silhouettes are
identical so they cost one draw call each, and a bad one is a re-roll rather than a repair. What it
is not is a way to make a hero. There is no control finer than a sentence, no way to ask for the
same character with a different tabard, and no faces at all unless something frames them. Build a
cast on it; do not build a protagonist on it.

The four kept in `art/skins/` are the shipping examples, one per category:

| | |
|---|---|
| `knight_s33` | plate armour, the category that works best |
| `watch_s11` | a uniformed human with a painted face |
| `undead_s77` | a monster, and the only kind of subject where the folded sides are invisible |
| `nomad_ui` | cloth and a hood — and the one the dev tab made, end to end, from a typed sentence |

## 8. The tab, and reaching it

`js/dev/hub.js`'s `SLOTS` list has no `skin` id and that file belongs to the dev-infrastructure
agent, so the hub does not import `js/dev/tabs/skin.js` yet. Until **one line** is added there:

```js
{ id: 'skin', label: 'Skins', order: 35, owner: 'skin agent' },
```

…the tab is reached standalone at **`http://localhost:8796/js/dev/skin/studio.html`**, which mounts
the same module in a minimal shell. Nothing else needs to change; `skin.js` already calls
`registerTab` and will simply appear.

The whole path works: type a sentence, press Generate, watch the queue position and then mflux's own
progress, and the finished skin lands on the turntable with its sheet beside it.
`node tools/skin/uitest.mjs --server=… --generate="…"` drives exactly that with real clicks and
asserts the progress readout actually moves, because a five-minute job stuck on "submitting…" is a
broken tab even when the PNG eventually arrives.

One bug that had it dead on arrival, in case the shape recurs: `api.base` answers `''` for "this
page is already served by the dev server" — the normal case — and `gen.js` tested it for truthiness.
Every generation from the tab reported "no dev server". Only `null` means offline.

## 9. Dev server

One additive route, `POST /api/skin`, alongside `/api/flux`:

| | |
|---|---|
| body | `{id, desc, mode, seed, steps}` — or `{raw:true, prompt}` |
| does | builds the prompt, uploads the pose reference to mflux, runs on the **same GPU queue**, pads the result, writes `art/skins/<id>.png`, `_raw.png`, `.json` and refreshes `index.json` |
| returns | `{ok, job, position, out, prompt}` — then poll `/api/job/<id>` as usual |

Two other one-word changes to `tools/devserver.mjs`: `/api/skin` added to `WRITE_ROUTES`, and
`art/skin` + `art/skins` added to the `/api/ls` whitelist. **A dev server started before those
landed answers `no route /api/skin` and `dir not listable: art/skins` — restart it.** The studio
falls back to `art/skins/index.json` when it has not been, which is also what makes it work with no
dev server at all, and is why the failure looks like "the list is fine but Generate does nothing".

## 10. One thing to know about the file layout

`js/world/dummy.js` imports `tools/skin/layout.mjs`, so that file is a **runtime dependency of the
shipped game**, not only of the tools. It is 200 lines, pure, and imports nothing, so shipping it
costs nothing — but it does mean `tools/` is no longer purely authoring-time. The alternative was
two copies of the rig, one for the mesh and one for the template, which is the exact drift this
whole design exists to prevent. If that bothers anyone, move `layout.mjs` under `js/world/` and
point both importers at it; nothing else changes.

## 11. What is not done

- **Nothing writes `data/characters.json`.** The contract now has `body: "dummy"` with `sex` and
  `skin`; wiring a dummy into `js/game/characters.js` and placing one in the level is the next
  agent's job, and it is small — `Dummy` from `js/world/dummy.js` takes `{shape, map}`.
- **No animation.** The dummy is a static mesh. `people.js`'s cloth shader does not apply and a
  jointed dummy wants real bones, not vertex wobble.
- **No normal or roughness map.** A skin is albedo only. Nothing generated is a usable normal map,
  and pretending otherwise puts baked highlights on top of the renderer's own lighting.
- **Hands and feet are stubs**, and a front/back projection barely sees them — the top of a foot is
  a folded strip, not a painted surface. Boots read fine; fingers never will.
- **Nothing paints a head reliably.** §7. The obvious next experiment is to give `pose_ref.png` a
  head that is not a blank egg — the suggestion of a brow, a nose and a jaw, enough for Flux to
  anchor a face on without dictating one. That is a change to `template.mjs` and a re-run of the
  five subjects, and it is the highest-value hour left in this pipeline.
- **`art/skins/` keeps four examples, not the study.** `*_raw.png` is gitignored; the seed variants
  the reliability numbers came from were deleted after they were read. `node tools/skin/render.mjs
  --all --shape=m` regenerates the evidence for whatever is on disk.
