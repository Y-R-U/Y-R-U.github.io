# FORGE — the game

A three-town, three-campaign magic RPG built on the FORGE engine. Mobile first; no build step.

**Read `docs/` before doing anything.** `STORY.md` is the narrative bible, `SYSTEMS.md` the
mechanics, `WORLD.md` the layout and engine plan, `BUILD_PLAN.md` the phase you are actually on.

The graphics test bed this came from lives at `../forge_test/`. Its `CLAUDE.md` and eight
`NOTES_*.md` files are the engineering record for the renderer, terrain, buildings, interiors,
foliage, lighting, materials, people and editor. **They are still the reference — read the relevant
one before changing that subsystem.** Do not copy them here; they stay there and stay accurate.

## The concept — fixed, from Aaron

- Three **entire towns**, not districts: **Light** at one end, **Dark** at the other, **Neutral in
  the middle** between them, with real countryside in between.
- The **towns are fairly structured** — planned streets, a real centre. The **roads and rivers
  meander**. Organic movement belongs to the connective tissue, not the town plans.
- **Buildings are built bigger than real-world proportion.** The camera angle makes a room look
  smaller once you are inside it, so exteriors and especially interior volumes are oversized to
  stay comfortable to move and fight in. See the derivation in `WORLD.md` — this is a deliberate
  design rule, not a bug to be corrected back to realism later.
- **Neutral are farmers / non-magical** in public. Light and Dark are opposing forces.
- **Unlock ladder:** you can only start as **Light**. Finish Light to unlock **Dark**. Finish both
  to unlock **Neutral**. Neutral is very secretive, plays both sides by **transforming to look
  Light or Dark**, and can become **far more powerful** than either.
- **Opening:** the player is a young adult told it is time to take their magic skills seriously —
  to earn their way and learn their craft. Cull the problematic rodents, catch fish and sell them
  at the market.
- **Everything is magic-based.** There is no mundane skill. Fishing is fishing magic, cooking is
  cooking magic, trading and mending are their own schools.
- **Sandbox plus story/quest driven.** The world stays open; quests thread through it.

## Decisions already taken — Aaron has signed these off, do not relitigate

| | |
|---|---|
| Town authoring | **Generated, then hand-tuned in the editor.** The generator lays out each town's structured plan; the result is saved as an ordinary scene document and refined by hand. The editor stays a first-class tool and **ships as is — do not extend it.** |
| `forge_test` | **Stays tracked in git.** Its 222M of renders are gitignored; only source and notes are committed. |
| Orientation | **Portrait first, landscape everywhere.** Both are first class on phone and desktop; there is no rotate prompt. `js/engine/fov.js` holds the 55° field on whichever axis of the viewport is *shorter*, which leaves **landscape bit-for-bit what shipped**: every landscape aspect keeps exactly its 55° vertical, so 16:9 still reads 85.6° horizontal and the 844 × 390 gate still reads the 96.8° the K = 1.5 derivation assumes. A phone in portrait gets that same frustum transposed — 96.8° vertical, 55° horizontal, the same solid angle, near-plane reach and shadow fit — so rotating the device rescales nothing, bar the 21 : 9 phones that reach the 100° cap and rescale by 2 %. The rig is orientation-independent: no arm, height, pitch or clamp differs. Portrait costs street width, 7.2 m in frame at the player against 15.7 m, and gives the ceiling a quarter to two-fifths of an interior frame. **Roofs were not raised; four lofts let the camera through the ceiling and that is pre-existing — see `docs/NOTES_PORTRAIT.md` §3.** |
| Building scale | **K = 1.5**, permanent. Derived three independent ways in `WORLD.md`, agreeing within 2%. Human-scale things — player, walk radius, stair rise, furniture, step rise — **do not scale**. That asymmetry is the design, not an oversight. |
| Scene schema | **New object types approved**: mill, barn, market cross, arcade. Built from the same shared materials — no zone-specific geometry code. |
| Foliage | **Grass goes player-centred**, 73k → 24k triangles, to buy the headroom three towns needs. |
| Protagonist | **One character across all three campaigns**, full skill carry. The Household fosters its children out, so the Light protagonist was always a Longacre child placed in Whitewall. This is what makes "Neutral becomes far more powerful" literally true — the power is cumulative. |
| Level cap | **20.** At 50 the XP economy did not close and four of the ten schools were mathematically untrainable. |
| First playable | **All three towns built and walkable**, with the Light campaign Acts 1–2 (~12 quests, six schools, three enemies) as the first playable slice. Dark and Neutral campaigns follow. The world is not staged; the campaign content is. |

## Canonical terms — arbitrated, binding

Ten schools: **Kindle · Ward · Line · Forage · Cull · Hearth · Mend · Barter · Setting · Glamour**

| Term | Note |
|---|---|
| **Line** | fishing magic. Not "Draw" — "the draw" is the plot's most-repeated noun. |
| **Setting** | building/stonework. Not "Delve" — Blackstone's people are the Delvers. |
| **Graft** | the Neutral capstone *spell* (the disguise), not a school. Not "Wear". |
| **Marks** (`mk`) | currency. Not `m` — collides with metres. |
| **the Watch** | the disguise-detecting enemy class. Not "Wardens" — Warden Alder is a friendly NPC. |
| **Binding** | charm crafting. Not "Forge" — the game, the seam and the verb were all already "forge". |
| Whitewall / Longacre / Blackstone | Light / Neutral / Dark. `light` / `neutral` / `dark` are the permanent code ids. |

## Non-negotiables carried over from the test bed

- **No build step.** ES modules, `three` via the importmap in `index.html`.
- **Same building blocks in every zone.** A zone differs by *material* and by small roofline
  additions — never by having its own geometry code. `if (zone === 'dark')` outside `zones.js`
  is a bug; put the difference in `zones.js`.
- **`js/world/zones.js` is the art bible and is frozen — additive changes only, ask first.** The
  story was written to justify the values already in it. In particular: light's spell has a warm
  core and `void: null`; dark's has a cold core and a `void`; **neutral's is the only one carrying
  both signatures at once — a warm, light-like core *and* a void.** That is deliberate
  foreshadowing of the third campaign. Do not "tidy" those values.
- **Everything tunable is a knob.** Register it with `quality.register(schema, apply)` and it gets
  panel UI for free. No magic numbers buried in a module.
- **Track every texture** through `engine/budget.js` `track()`, or the memory readout lies.
- **The perf gate is real** — see `../forge_test/CLAUDE.md`. Note the starting point: the untouched
  engine already draws 350k triangles with *one* district visible, which is exactly the gate. Three
  towns has no headroom to spend; it has to be earned back with culling and LOD.

## Comments — read this twice

Aaron has ADHD and finds comment noise genuinely hard to read. The code is self-documenting.

- **Only comment to clear up something genuinely confusing.** A non-obvious formula, a workaround
  for a Three.js quirk, a unit that isn't guessable.
- Never restate what the line does. Never write section-banner comments. Never write JSDoc blocks.
- A short file-top line saying what the file owns is fine. That's usually the only comment a file
  needs.
- If in doubt, delete the comment.

## Layout

```
index.html            importmap, HUD, panel, boot
docs/                 STORY.md, SYSTEMS.md, WORLD.md, REVIEW.md, BUILD_PLAN.md
js/main.js            boot + wiring
js/scenarios.js       named camera setups — the critic's contract
js/engine/            renderer, loop, stats, quality knobs, texture budget, post
js/world/zones.js     ★ the three zones. Frozen — additive changes only, ask first.
js/world/             terrain, materials, lighting, buildings, interiors, doors, people, spells
js/editor/            scene document schema, document → geometry, the level editor
tools/shot.mjs        headless render → PNG + perf JSON
tools/compare.mjs     blind side-by-side sheet vs the reference plate
```

## Checking your work

```bash
node tools/shot.mjs --shot=street_dusk --w=1280 --h=720 --dpr=1
node tools/shot.mjs --all
```

`shots/<id>.png` + `shots/<id>.json`. **Always actually look at the PNG with the Read tool.**
Numbers in a JSON file will not tell you it looks wrong.

Headless renders here are software-rendered: the *image* is trustworthy, the *timings* are not.
For a real perf number add `--headed --perf`, and trust fps and the counts over the GPU ms.
