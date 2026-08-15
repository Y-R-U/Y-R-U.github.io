# Props and the placed cast — the other half of the seam

`interact` is the largest verb in the corpus: **82 objectives across 48 ids**, and not one could
fire, because no prop existed. `talk` was the largest by count and only worked in a fake sense —
`main.js`'s `targets()` handed the cast's ids to whichever wandering figures were nearest, so Bel
was a different body every time you looked.

Both are real now. **A new game opens in the granary, eight rats die, the lamp lights, Bel is where
she was left, and `light.01` finishes and pays.** Verified in a real browser, three times over — §7.

**48 of 48 referenced prop ids are placed. Tests: 383 before, 393 after. 0 failing.**
`node tools/lintQuests.mjs` — 0 errors, the same one pre-existing `light.06` warning.

---

## 1. What was built, file by file

| File | | |
|---|---|---|
| `data/props.json` | **new** | 48 authored placements: id, kit, variant, anchor area, offset, facing, label. |
| `data/cast_at.json` | **new** | 18 named NPC placements. `data/cast.json` stays id → display name and is untouched. |
| `js/game/placement.js` | **new** | Pure `anchor()` / `placeAll()` / `propIds()`, plus the one impure `loadPlacements()`. No `three`, no DOM — this is the piece the tests drive against the real data. |
| `js/game/placement.test.js` | **new** | 10 tests. The seam: corpus → placement → area shape → reducer. |
| `js/world/props.js` | **new** | The 17-type kit, the merged per-zone geometry, `targets()`, `use()`, `arm()` and the lamp glow. |
| `js/world/cast.js` | **new** | The named cast as fixed bodies on the people rig. Imports `field.js` rather than `terrain.js` for `zoneAt` — same function, no renderer — so a node test can construct it against a stand-in rig. |
| `js/world/people.js` | edited | `place()`; `setCrowd` now orders through `crowd()`. |
| `js/world/roster.js` | edited | `crowd(agents, count)` — §3. |
| `js/main.js` | edited | The stand-in `CAST` array is gone; `targets()` is the placed props plus the placed cast. Two new world hooks, `interact` and `arm`. One top-level `await`. |
| `js/game/session.js` | edited | `act()` tells the world before it tells the reducer; the context label honours the step's `verb`; `questWorld`'s `arm` reports a refusal. |
| `js/game/questrunner.js` | edited | `verbFor(id)`. |
| `js/game/hud.js` | edited | A glyph for `interact`. One line. |
| `js/game/wiring.test.js` | edited | One assertion on the `arm` refusal. |

### The flow, end to end

```
loadPlacements()   data/areas.json + props.json + cast_at.json
   → placeAll()    normalised offset × the area's own extent → world x,z, refusing anything outside
   → new Props()   one Batch per zone, kit(b, matrix) per prop → 9 merged meshes
   → new Cast()    people.place() per name → a pinned agent the rig draws and never moves

session.retarget → world.targets()      props.list  ++  cast.targets()
                 → quests.verbFor(id)   the button reads KINDLE, not LIGHT
session.act      → world.interact(id, school)   props.use() lights the lamp
                 → quests.emit({ t:'interact', id, verb })   ← the event that had nothing to aim at
quests.recover   → world.arm(id)        props.arm() puts it out again
```

Nothing in `js/sim/*` was touched. `quest.js`'s reducer is used exactly as it was written — including
the `verb` check, which is what makes the wrong school pay nothing.

---

## 2. The kit

Seventeen types, fourteen variants, no bespoke models:

`lamp` · `post` (chalk, gauge) · `crate` (chest, sacks) · `barrel` (bowl) · `table` (stall) ·
`shelf` · `board` (lectern, slate) · `door` (lock, hinge) · `hurdle` · `kerb` · `font` (hearth) ·
`stone` (plot, floor) · `rubble` (spit) · `sluice` · `timber` · `sapling` (thorn) · `hatch`

Every part goes through `details.js`'s `Batch.add(surface, geo, matrix)` on one of three surfaces —
`wood`, `trim`, `crest` — which is the same vocabulary `buildings.js` and `interior.js` use. A prop
therefore takes its colour, its stone, its roughness and its metal from `zones.js` and from nothing
else. There is no `if (zone === …)` anywhere in `props.js`; the only string test in the file is
`verb !== 'kindle'`, which is a school, not a town.

**48 props are 3,362 triangles in 9 draw calls** — three merged meshes per zone. A lit lamp adds an
instanced 36-triangle sphere; the glow mesh is `visible = false` until something in that zone is
alight, so it costs nothing until it is earned.

---

## 3. Named NPCs, and the trap `roster.js` already knew about

`People.setCrowd(n)` was `agents.slice(0, n)`. Left alone, a named body would have been dropped the
moment the crowd knob went below its index — the same defect `roster.js` was written for on the
vermin side, for the same reason, and invisible in the same way: an NPC that is not drawn looks
exactly like an NPC that was never placed.

`crowd()` lives beside `roster()` because it is the same invariant:

```js
export function crowd(agents, count) {
  const held = [], rest = [];
  for (const a of agents) (a.npc ? held : rest).push(a);
  return held.concat(rest.slice(0, Math.max(0, count | 0)));
}
```

Two properties, both asserted, both confirmed live:

- **A named body is always in `active`, and always first**, so it also always gets a seat in its
  (zone, variant) `InstancedMesh` — the buckets are filled in roster order.
- **The knob sizes the wanderers around it.** `crowd = 36` is now 36 wanderers *plus* the 18 named,
  not 18 named crowding out half the ambience. At `crowd = 0` the towns still hold their cast and
  nothing else. That is a deliberate change of meaning for the knob — see §4.

A named agent is `kind: 'idle'` with `turn: 0.09`, which is the rig's existing standing behaviour:
it holds its x and z forever and drifts its heading a few degrees. It potters; it does not wander.

---

## 4. Decisions that could have gone the other way

**Placement is authored data, not derived from the area shapes.** Aaron leaned this way for the A8
reason and I agree, but not for that reason: derivation cannot tell a lamp *by the door* from a lamp
*in the middle of the field*, and half the ids in the corpus are specific about where they are
("the lamp bracket by the door", "two paces west of the hole it came out of").

**But the coordinates are authored as a fraction of the area, not as world x/z.** `at: [-0.5, 0.7]`
is half-left, seven-tenths toward the south edge of whatever `wwa.granary` currently is. Three
things follow: a prop **cannot** be authored outside the area a quest looks for it in; if A8 moves
or resizes an area everything standing in it moves with it; and an out-of-range offset is a
*rejection*, not a clamp, so a typo is an error rather than a prop silently pinned to a boundary.
The cost is that the file is not readable as a map — you cannot tell where `[0.62, -0.66]` is
without the area beside it.

**Props are world geometry, not game state.** They are built under `?shot=` and in the editor as
well as in play, and they are in every number in §5. The alternative — build them only in a session,
like the spawner — would have made the gate measurements a measurement of a world the player never
sees. The consequence is that the five critic scenarios changed by 2–6k triangles; that is real
geometry in a real world, and the plates should be re-blessed rather than the props hidden.

**One prop per id, however many times a step asks for it.** "Six kerb stones", "three readings",
"fill six barrels" are one prop tapped six times, not six props. Six separate bodies would need six
ids the corpus does not have, and `retarget()` would pick whichever was nearest anyway. The `kerb`
kit does draw six stones, so at least that one reads right.

**Only lamps have visible state.** "Relight the lamp" with nothing happening on screen is the same
defect as damage landing where the player is shown nothing, so lamps light. Everything else —
counting a shelf, weighing a crate, reading a post — changes nothing you can see, and inventing an
animation for 44 props would be inventing 44 pieces of art direction I was not asked for. The
context button's confirm sound and the tracker ticking over are the feedback.

**A lamp answers to Kindle and nothing else.** Otherwise a player with Barter dialled taps the lamp,
watches it light, and the quest does not advance — the worst possible feedback. The same fact drives
the **button label**: `questrunner.verbFor(id)` finds the live step that names this object and the
button reads `KINDLE` instead of `LIGHT`. That is `verb` honoured in the one place the player can
act on it; the reducer's own check is unchanged.

**`wwa.board` is a prop with `kind: 'talk'`.** It is in `data/cast.json` as "the Yard post" and it
gives five board quests, so the context button has to route it to `session.talk()` and the offer
dialogue. It is the one entry in `props.json` the corpus never `interact`s with. Verified live: the
button reads TALK/read and opens `offer.sandbox.01`.

**`world.arm` returning false is still a gap.** `questWorld` used to treat "the world has an `arm`"
as "the world can arm anything". It cannot: `lac.henhouse.hen` is armed by a step and is an escort
target that nothing places. `arm: id => world.arm?.(id) || hooks.missing('arm', id)` keeps §9.4's
promise that a reset that did nothing says so.

**Bel stands at the granary door, not in the Cloister.** `STORY.md` §2 puts her in the apprentice
hall. Step 4 of the first quest in the game is "Speak to Bel outside" with no `in` and therefore no
chevron, and a 95 m search for the quest-giver is not the opening beat. She is at the south edge of
`wwa.granary`, 9.2 m from where a new game spawns. A test pins that distance under 20 m, so moving
her back to the Cloister fails loudly rather than quietly ruining the first hour.

**Interior props stand in the open.** `wwa.almonry`, `lac.mill`, `bst.kitchen` and the rest have no
buildings yet, so their props sit on grass inside the correct rectangle. That is the same state the
granary's rats are in and it is honest about what A8 has not done.

---

## 5. Cost

Every figure below is `node tools/shot.mjs --all --preset=medium --dpr=1 --w=844 --h=390`, main
pass, on this machine. **The "before" column was measured, not quoted**: `data/props.json` and
`data/cast_at.json` were moved aside and the sweep re-run, which is the only difference between the
two columns. It reproduces `NOTES_COMBAT.md` §9's numbers to the call, which is what makes the
deltas trustworthy.

| scenario | before | after | delta |
|---|---|---|---|
| `wall_day` | 64 calls / 145k | **70 / 150k** | +6 / +5k |
| `street_dusk` | 57 / 106k | **60 / 108k** | +3 / +2k |
| `gate_night` | 38 / 96k | **43 / 100k** | +5 / +4k |
| `town_night` | 66 / 111k | **72 / 117k** | +6 / +6k |
| `creek_day` | 67 / 87k | **73 / 92k** | +6 / +5k |

**Worst case on the gate profile is 150k of 350k.** In a live session in the granary, `light.01`
active with eight rats, props and cast: **63 calls / 136k**. Under mobile emulation (iPhone UA,
touch, 844 × 390, dpr 2): **62 calls / 136k**, no console output.

Where it goes:

| | |
|---|---|
| 48 props | **3,362 triangles**, 9 merged meshes (wood/trim/crest × light/neutral/dark) |
| one lit lamp | 36 triangles, 1 instanced draw, only while alight |
| 18 named figures | **3,454 triangles** (~192 each) and 1,458 of contact disc |
| people at `crowd = 36` | 6,900 → **10,112**, because 36 now means 36 wanderers *plus* the cast |

No new textures, so nothing new goes through `budget.js` `track()`. One new knob, group **World**:
`propGlow` (lit lamp scale, 0 turns the glow off).

The +3 to +6 draw calls are constant across all five scenarios because the merged per-zone meshes
have valley-sized bounding spheres: `reach.light.stand` is 220 m from Whitewall and shares the light
batch, so the light batch is in frustum almost everywhere. Batching per *area cluster* rather than
per zone would cull better at the cost of more meshes. At 3.4k triangles it is not worth it yet;
if A8 pushes the gate it is the first thing to change.

---

## 6. What I could NOT verify, and what is still missing

Stated plainly. All of this is real, none of it is hedging.

**Still cannot fire, and is not a prop problem:**

- **`interact self` has two objectives that no target can produce.** Nine of its eleven are `graft`
  and `session.selfTarget()` answers them. The other two — `dark.02 robe` ("Take the white robe
  off", no verb) and `neutral.05 eat` (verb `hearth`) — need `selfTarget()` to return something when
  the dialled school is *not* Glamour. Untouched: it is the self target, not the prop runtime.
- **`lac.henhouse.hen` is armed by a step and nothing places it.** It is an escort target and out of
  this wave's scope. `world.arm` now says so out loud instead of reporting a reset it did not do,
  and a test pins it as the only such id — a second one appearing fails the suite.
- **82 objectives can now fire; that is not the same as 82 objectives being reachable.** Most of them
  sit behind `gather`, `deliver` and `escort` steps that still have no runtime. I proved `light.01`;
  I did not play the other 98 quests.

**Deliberately not done:**

- **Props have no colliders.** You walk through the market stall and through the font. Adding them
  means feeding 48 boxes into `colliders.js`, and a badly-sized box you can get wedged behind is
  worse than a prop you can walk through. Not attempted.
- **`bst.levels`' six props are on the surface, above the keep.** There is no subterranean support in
  the engine (`REMAINING.md` §6). They are inside the right circle at the right ground height, which
  is the most that can be true today.
- **`wwa.board`'s own 5 m circle is entirely under demo massing**, so the Yard post is anchored in
  `wwa.market` 9 m away instead. Nothing asks for it to be inside `wwa.board`, but the id says one
  thing and the anchor says another, and A8 should put it back.
- **`wwa.temple.hand` is a trestle.** "Feed the temple hands" is people, and a prop is what the
  runtime can act on. It is the one id where the object is a stand-in for what the step means.
- **Nothing re-seats a prop after `demo.rebuild()`.** Ground heights are read once at load. The world
  knobs that trigger a rebuild change terrain mesh resolution, so a prop could end up a few
  centimetres off after dragging one. Not observed; not tested either.

**Verified less well than I would like:**

- **No phone.** Everything is desktop Chrome over CDP, including the "mobile" run, which is device
  emulation. Per `BUILD_PLAN.md` the images and the counts are trustworthy and the frame times are
  not, so no fps is quoted anywhere above.
- **The kit is legible, not art-directed.** I rendered the granary lamp close up (post, bracket,
  lantern, lit), the west field group (post, mark, two grafting stocks, two spits) and Bel at the
  granary door, and they read as what they are. I did **not** get a good look at most of the other
  40 — Sanctum Yard and the Blackstone terraces are so dense with demo massing that a close camera
  ends up inside a wall. **Treat "the whole kit looks right" as unproven.** Nine of the seventeen
  types have never been photographed.
- **Placement was tuned against the demo massing A8 will delete.** Three props and two NPCs were
  inside a building footprint on the first pass and were moved; a machine check now says nothing is
  inside a footprint, nothing is at or under the waterline, and no two targets are within 3 m. All
  three of those facts are about buildings that do not survive A8.
- **The context button was never pressed with a finger.** `session.act()` was called directly and
  through `retarget()`; `hud.bindAct()`'s pointer path was not exercised.
- **The 90 s chevron was not tested against a prop step.** A step whose `in` is set will point at the
  area, not at the prop, and I did not sit still for 90 s to watch it.

**Found while testing, pre-existing, not fixed:**

- **The spawner can put a rat somewhere the player cannot hit it from any angle.** `place()` rejects
  a point inside a nested *planned area* but not inside a building footprint, so a granary rat can
  end up inside the demo massing where `world.sight()` correctly refuses every approach at every
  distance. It cost me two acceptance runs (6 of 8 kills, then stuck) before I worked out it was the
  world and not my change. It resolves itself once the rat chases the player out, so it is a stall
  rather than a soft-lock — but with a leash and a doorway it might not.

---

## 7. How it was checked

`node --test` — **393 pass, 0 fail** (383 before). `node tools/lintQuests.mjs` — 0 errors, 1 warning,
pre-existing. `node tools/lintText.mjs` — clean. `node tools/shot.mjs --all` — §5.

**Every new test was reverted-against.** For each one I broke the thing it defends and confirmed it
goes red, then restored:

| test | reverted by | went red |
|---|---|---|
| places every prop id the packs reference | deleting `wwa.granary.lamp` from `props.json` | ✓ (and took two others with it) |
| stands inside every area a step looks for it in | re-anchoring the lamp to `wwa.market` — still placed, still inside *an* area | ✓ |
| an `at` outside the anchor is refused | making `anchor()` clamp instead of return null | ✓ |
| every named NPC has a body | deleting `bel` from `cast_at.json` | ✓ |
| a named NPC is one fixed body | reverting `crowd()` to `agents.slice(0, n)` | ✓ |
| the granary lamp answers Kindle | deleting the `verb` check from `quest.js`'s `credit()` | ✓ |
| `light.01` runs end to end | deleting `bel` | ✓ |
| every armed object is a prop | — (asserts the exact gap list; changes if the corpus does) | n/a |
| `main.js` hands over the placed props and cast | restoring the wandering stand-in `targets()` | ✓ |
| Bel is close enough to the granary | moving her to `wwa.cloister` | ✓ |
| `arm` refusal is recorded (`wiring.test.js`) | restoring `arm: id => (world.arm ? … )` | ✓ |

Then a real session over raw CDP against the real page — new game, slate clicked, no test doubles in
the path. **Three consecutive runs, identical in every row below.** Getting there took work on the
*driver*, not on the game: teleporting the player on top of a rat is a good way to be bitten to
death, and a gutter correctly puts him back at the Whitewall hearth 90 m away — so the driver now
tops his health up between rounds and waits for `quests.here` to agree he is in the granary before
it presses anything.

| | Checked | Result |
|---|---|---|
| 1 | new game | `light.01` tracked, player at `(-547, -24)` in `['wwa','wwa.granary']`, **48 props, 18 cast**, boot overlay gone |
| 2 | what `targets()` really returns | `wwa.granary.lamp` (interact) at 8.3 m, `bel` (talk) at 9.2 m, then kerb, font, alder — real ids, real distances |
| 3 | Bel is a body | `cast.at('bel')` is one agent at `(-547.00, -14.80)`, in `people.active` |
| 4 | eight kills through the real `strike()` | step 0 → **2** |
| 5 | the lamp in range | context `wwa.granary.lamp`, kind `interact`, **button label `kindle`** — `verbFor` reading the live step |
| 6 | the context button | step 2 → **3**, `lit: ['wwa.granary.lamp']`, glow mesh count 1 and visible |
| 7 | Bel in range | context `bel`, kind `talk` |
| 8 | pressing it | dialogue opens on **`light.01.out`** — the step's own scene, not the offer |
| 9 | the quest | **`done`**, tracked null, `rat_tail` 16 (8 drops + 8 reward), `wwa.granary.clear` true, Cull 477 · Kindle 253, Standing +12 |
| 10 | `recover: arm` | lamp lit → `arm('wwa.granary.lamp')` → unlit, **`session.gaps` empty** |
| 11 | Bel over 120 frames | `(-547.000, -14.800)` before and after, still drawn |
| 12 | the crowd knob at 0 | `active = 18`, Bel still in it and still holding a mesh seat |
| 13 | the Yard post | button TALK/read, opens `offer.sandbox.01` — a board route that did not exist |
| 14 | cost in session | 63 calls / 136k, props 3,362 |

No console errors or warnings in any run, in any of the three boot modes (`play`, `?shot=`,
`?editor=1`) or under mobile emulation.

Two machine sweeps over the placed set, against the live world: **nothing inside a building
footprint, nothing at or under the waterline, no two targets within 3 m.**

---

## 8. If you pick this up next

1. **`selfTarget()` for the two non-graft `self` objectives** — `dark.02` and `neutral.05`. Small.
2. **Colliders for the props that are solid** — the stall, the font, the crates, the barrel. The
   others (kerb, hatch, rubble, marks) should stay walkable.
3. **A pass on the kit's art**, with `?dev=1` scenarios so the critic can score it. Nine of the
   seventeen types have never been looked at.
4. **The spawner's footprint check** — §6's last item.
5. **A8 will move things.** The offsets are area-relative, so most of it follows for free; the three
   in §6 that were nudged around demo massing will need re-authoring, and `wwa.board` wants putting
   back on `wwa.board`.

---

# Follow-up: the review's eight findings

Everything below is a second pass over the wave above, against `docs/REVIEW_PROPS.md`. The builder's
text is unchanged; this is what was done to it.

**Tests: 393 → 404, 0 failing.** `node tools/lintQuests.mjs` 0 errors, the same one pre-existing
`light.06` warning. `node tools/lintText.mjs` clean. Gate unmoved: `wall_day` **70 / 150k**,
`street_dusk` 60 / 108k, `gate_night` 43 / 100k, `town_night` 72 / 117k, `creek_day` 73 / 93k
(93k was 92k — the new lantern cages and the slate rack). The 48 props went **3,362 → 3,758
triangles**, still 9 merged meshes.

---

## 1. The boot tripwire now follows the hoisted helpers

`combat.test.js`'s scan built a map of `const|let|class` positions and walked the identifiers in the
`world: { … }` block. `targets` and `sight` are `function` declarations, so they were in no map and
the scan stopped at their names.

It now also builds a map of top-level `function` bodies and walks the hooks **transitively**: any
identifier naming one pushes that body onto the queue, and every `const|let|class` reached anywhere
in the closure is checked against `app.start()`. Two extra assertions keep the scan honest — that
`targets` and `sight` are still hoisted functions the hooks name, and that the walk reached `EYE`,
which only exists inside `sight`'s body. Without that last line the test could quietly stop
descending again and stay green.

**Proved by rebuilding the reviewer's bug.** `targets()` → `…concat(LATE)`, `const LATE = [];`
immediately after `app.start()`:

```
392 pass, 1 fail
AssertionError: main.js hands the session `LATE`, which it declares after app.start()
  at js/game/combat.test.js:555
```

Restored afterwards.

## 2. `verbFor` and the reducer now read the same function

`quest.js` exports `openSteps(def, rec, ctx)` — the live required step plus the optional ones, less
anything its own `after`/`before`/`worn`/`onDay`/`require` has shut. `advance()` iterates it instead
of assembling that list and filtering with `stepOpen` itself, and `verbFor` calls the same function.
There is no second copy to keep in step.

New test in `wiring.test.js`, driven through the real runner, the real reducer and the shipped packs:

| | button | reducer |
|---|---|---|
| `sandbox.19/round`, 14:00 | **null** | four taps credit `{}` |
| `sandbox.19/round`, 19:00 | `kindle` | credits `{"round":[1]}` |
| `neutral.09/count`, no face | **null** | four taps leave `i` at 3 |
| `neutral.09/count`, `worn: light` | `barter` | four taps finish the step |

Reverted `verbFor` to its old body → red on *"the round is lit between 18:00 and 21:00, not at
14:00"*. Restored.

Confirmed live over CDP in a real session: `verbFor('wwa.lamp')` is `null` at 14:00 and `kindle` at
19:00, and the granary lamp's own step still puts **KINDLE** on the button.

**Two things I deliberately did not change.**

- `verbFor` still does not apply a step's `in`. That is a per-event area test inside `credit()`, not
  part of "is this step open", and folding it into `openSteps` would change what the reducer does.
  In practice they agree: the button only appears within 3.6 m of a prop, and `placement.test.js`
  pins every prop inside every area a step scopes it to. A prop within range of a player standing
  just outside its area would still be a button that credits nothing. Unproven either way — I did
  not find a case in the shipped 48.
- `props.use()` still lights a lamp whenever Kindle is dialled, including when no step wants it
  (step 0 of `light.01`, say). That is world state, not quest feedback; the button reads the prop's
  own label there, not a verb, so it is no longer a claim that anything will be credited.

## 3. The lamp

**The head.** The solid `taperBox(0.30, 0.30, 0.38, …)` housing is gone. The lantern is now an open
cage — a tray skirt, four corner bars, a pitched roof with a finial, a hanger — on a bracket arm
with a diagonal stay. The flame is inside it and visible from every side, which is the actual fix:
there is nothing left to occlude.

**The lit state.** A hard core sphere (r 0.13) plus a halo that is five nested additive spheres
merged into one geometry (r 0.17 → 0.41, gain 0.06 each). Front faces only, so each shell adds its
gain once and the overlaps step the brightness down toward the edge — a single additive sphere is a
hard-edged octagon in the sky, which is what the first attempt looked like. Both meshes stay
`visible = false` until something in that zone is alight, so nothing changed in the gate numbers.

**Looked at the PNGs**, not the numbers: unlit and lit at 9 m in daylight on the 844 × 390 profile,
a 2 m close-up of both, night, and a **real gameplay frame** — mobile profile, new game, player
walked to the lamp, `act('cast')` through the real context button path. The lit lamp is a ~30 px
warm disc against the grass where the review measured an 8 × 14 px chip. Night still reads as a
candle in a lantern.

Honest limits: the halo is faceted spheres, not a radial falloff, so at 2 m you can see the shell
steps and the glow swallows the fixture; and `propGlow = 3` is still a beach ball. That knob is an
art knob and 1 is what the game ships.

## 4. `bst.intake.draw`

`at: [-0.25, 0.45] → [0.62, -0.7]`, `ry: 0 → 5.88`. The bearing is measured, not guessed: a probe
swept 32 headings at 4 m for the deepest water and found it at 5.88 rad, so the gate faces the
river.

| | before | after |
|---|---|---|
| terrain across its own 2.7 m frame | +2.16 m to −1.10 m | **0.59 m** total spread |
| base above the waterline | cantilevered over the channel | **2.87 m**, on the bank shelf |
| inside a collider box | — | no |

**Rendered from four bearings and looked at all four.** The frame, the gate panel, the wheel and
both abutments stand on ground; the gorge and the river are below and in shot from the approach.
This is the best the circle offers: everywhere within 4 m of the waterline inside `bst.intake` has
at least 1.5 m of relief across a 2.7 m frame, so a sluice literally at the water's edge would be
half-buried again.

## 5. The spawner asks the colliders

`Spawner` takes a `blocked` hook and `place()`'s retry loop skips a point it rejects. `main.js`
passes `(x, z) => walkStep(x, z, x, z, groundAt(x, z, 0)).hit` — a step against itself, which only
pushes when the walker began inside a box.

Measured in the live world, 1200 real `place()` calls into `wwa.granary`, then the review's own
reachability sweep on every result (32 headings × 13 radii to 26 m for a standable point with a
clear line):

```
before   placed 1200   inside a walk box 258   unreachable 256   21.3 %
after    placed 1200   inside a walk box   0   unreachable   0    0.0 %
```

The nest still fills: 1200 of 1200 placed, so the retry loop finds open ground rather than handing
back a short nest.

Test in `combat.test.js` blocks a strip across the granary, asserts eight rats and none of them in
it, and asserts first that the same rng really does put rats there without the hook — otherwise the
fixture proves nothing. It also reads `main.js` to check the game builds a spawner that asks.
Reverted twice — the check in `place()`, then the hook in `main.js` — red both times.

## 6. A named body now holds a seat or is refused

`roster.js` gains `PER_CROWD_MESH` (32, moved out of `people.js`), `crowdSeatsLeft()` and
`crowdSeats()`. `People.place()` refuses a named body whose `(zone, variant)` mesh is full, warns,
and returns null — the same shape as `Vermin.add()`. `Cast` skips a refused body and records the id
on `cast.unseated`, so nothing can be in `targets()` with no figure under it. That is the guarantee
§3 claimed; the old code only guaranteed a place in `active`.

Live: 18 named, 18 seated, `unseated: []`.

## 7. Two placements

**The Yard post.** `at: [-0.45, 0.3] → [-0.03, -0.48]`, `ry: 3.14 → 0.07`. Openness measured as the
minimum clear distance over 16 headings, capped at 6 m: **2.0 m at the old spot** — the review's 3 m
alley — and **6 m or more at the new one**. Rendered from three bearings: it stands on the paved
yard in front of the hall with standing room all round. Still anchored in `wwa.market`; `wwa.board`'s
own 5 m circle is still under demo massing, so putting it back there is still A8's.

**`board:slate`.** Five 0.05 m boards stacked flat became a rack: two uprights and a top rail with
five slates of staggered width and height stood on edge against it, one loose slate flat on the
ground, and a chalk band. Rendered at 3.6 m and 8 m, before and after. At 8 m it is now an object
standing out of the grass instead of a dark smear on it.

## 8. Minors

**The comment.** `placement.js`'s file-top block now claims only what the coordinate system
provides — that moving an area moves what is anchored in it — and says outright that nothing here
reads a step's `in`, that `wwa.board` is already anchored outside its own id, and that
`placement.test.js` is what holds the property. `main.js`'s comment about the `loadPlacements`
catch was also wrong after the change below, and now says what the catch is actually for.

**The three fetches.** `loadPlacements()` runs them in parallel and settles each on its own, so
losing `props.json` no longer takes `cast_at.json` and all eighteen named NPCs with it. A missing
`areas.json` is reported once instead of as 66 unknown-area errors. New test stubs `fetch` and 404s
each file in turn; reverted to the serial version → red.

## 9. The two coverage gaps

**`setCrowd`.** The invariant no longer lives one call away from its test: `crowdSeats()` in
`roster.js` decides both `active` and what each mesh draws, and `setCrowd` is a driver over it.
Three tests, three reverts, all red:

| reverted | went red on |
|---|---|
| `crowdSeats` back to a bare `agents.slice()` | *n0 is out of the world at crowd = 0* |
| `setCrowd` doing its own slicing again (**the reviewer's exact revert**) | the source check |
| `place()` no longer asking for a seat | *place() places named bodies it has no seat for* |

The middle one is a source read of `people.js`, which is not something to do lightly — but
`people.js` imports `three` and there is no other way to pin that the rig uses the function, and
this is the exact revert that stayed 393/0 green while `crowd = 0` deleted eighteen bodies.

**`props.js`.** Split the way `roster.js` splits `vermin.js`: `js/world/propstate.js` holds
`LIT_VERB`, `hasState`, `findProp`, `propItem`, `targetList`, `useProp` and `armProp`, and
`props.js` is the three-side driver. `js/world/propstate.test.js` drives those against the real
`data/props.json` and the real packs — the Kindle guard, that no other kit has state, that `arm`
answers true for an unlit lamp and false for `lac.henhouse.hen`, and the label defaults. Deleting
the school check now fails with *"barter lit the lamp"*. `props.js` also warns if a kit and
`propstate` ever disagree about a prop having a lit state.

**Still uncovered, and not fixable without a headless-three harness:** every kit builder's
geometry, `drawGlow()`, and the `Batch` merge. The renders are the only check on those.

---

## What I could not verify

- **No real phone.** Desktop Chrome over CDP throughout, including the mobile-profile run.
- **I did not re-render the 33-combination kit sheet.** Only the four props I touched, plus one
  other (below). "The whole kit looks right" is still unproven, exactly as §6 says.
- **`lac.millbridge.crate` is inside a collider box.** Found by a machine sweep, not by the brief.
  It has a standable point with a clear line, its base matches `groundAt` to 0.0 m, and the render
  shows it on grass beside the bridge approach — the box is the bridge abutment, not a building.
  Left alone; worth an eye in A8. It is the only one of the 48 that trips that test.
- **`demo.rebuild()` still does not re-seat a prop**, and I still did not test it.
- **The 90 s chevron against a prop step** is still untested.
- **The `in` residual in `verbFor`** — described in §2 above. I could not construct a shipped case
  where it bites, and I did not prove there is none.
- **Timings.** Headless renders here are software-rendered, so only calls and triangles are quoted.

## Machine sweep over the placed set, after the changes

48 props, 18 cast, against the live world: **0** at or under the waterline, **0** with no standable
point holding a clear line inside their own context range, **0** pairs of targets within 4 m, max
|base − `groundAt`| under 0.2 m, and 1 prop inside a collider box (the bridge crate above). Both
boot paths clean: new game 48 props / 18 cast / boot overlay gone, save flushed and reloaded with no
slate and the same counts, **no console output on either**.
