# Review — the gather runtime

Adversarial review of the uncommitted gather wave (`data/gather.json`, `js/game/gathering.js`,
`js/game/gathering.test.js`, `js/game/context.js`, `js/world/nodes.js`; edits to `js/game/session.js`,
`js/main.js`, `js/game/placement.js`, `js/game/hud.js`, `js/world/materials.js`, `js/sim/tables.js`)
against `docs/NOTES_GATHER.md`, on top of `1ea695a`.

Every number below is one I ran. Node harnesses that build a **real `Session`** against the real packs,
real `data/areas.json` and real `data/gather.json`, plus raw-CDP driver scripts and 20 renders, live in
the session scratchpad. Where I could not reproduce something it is under *Suspicions*, and one
hypothesis of mine was killed by measurement — it is recorded there too.

---

## Verdict

**Not safe to commit as-is. One blocker, and it is a two-line fix.**

`Session.channel()` dispatches on **the context kind at the moment of release**, not on the kind that
started the hold. Any change of context under a held thumb — including the context going `null` when you
walk out of range — leaves `this.run` / `this.cooking` / `this.working` alive with nothing holding them.
The most natural path to it is a single shipped quest, `sandbox.04`, with no contrivance at all: the cook
step completes under the thumb, the delivery target takes the button, the player lets go, and **the fire
keeps cooking the entire raw stock of the bag — 40 mudbream in 70 s — with nothing held**.

Everything else is good work, and some of it is very good. The pure layer is genuinely pure and genuinely
tested: I reverted six defended behaviours and all six went red. The coverage claim is true — I re-derived
it independently and all 24 ids have a source inside every area a step scopes them to. The "region is
demanded, not guessed" call is correct and all eight overrides are load-bearing. The two shared-file edits
are clean: **no pre-existing economy number moves**, and `zones.js` is untouched.

The builder's own headline count is right and the count in my brief was wrong — see §*The 24-vs-21 count*.

Six should-fixes follow the blocker. The two worth doing in the same pass are the hand-over target's
missing `yields` flag (2) and the button reading **SPENT** for the entire time you are fishing (3).

---

## Demonstrated defects

### 1 — BLOCKER: a gather hold survives the context changing under it

**Where.** `js/game/session.js:503-521`:

```js
if (phase === 'cancel') {
  if (kind === 'graft') this.graftFail(null);
  if (kind === 'work' || kind === 'cook') this.workStop();   // :513
  return;
}
if (phase !== 'release') return;
...
if (kind === 'work' || kind === 'cook') return this.workRelease();
this.act(kind);                                              // :520
```

`kind` is whatever `hud.context.kind` happens to be when the HUD fires. Two routes make it wrong:

- **`hud.setContext(null, …)`** (`js/game/hud.js:212-216`) sets `this.context = { kind: null }` **and then**
  calls `this.finish(false)`, which sends `onChannel('cancel', this.context.kind)` — i.e. `cancel, null`.
  Line 513 does not fire. `workStop()` is never called.
- **The context flips to another kind** (`give`, `talk`, `trade`) while the thumb is down. The HUD cancels
  nothing, and the release falls through line 520 into `this.act(kind)`. `workStop()` is never called.

`workStop()` is the only thing that clears `this.run` / `this.cooking` / `this.working` and the only thing
that puts a fishing spot back to `ready`. Nothing else in `session.js` touches them (`grep` for
`this.run` gives lines 98, 648, 665, 670, 686, 786-789, 1243 and none of them is a cancel path).

#### Face A — the fire cooks the whole bag with nothing held

Real `Session`, real packs, real reducer, one shipped quest, no contrivance
(`scratchpad/runaway.mjs`). `sandbox.04` is *cook 3 cooked_mudbream* → *deliver 3 to `wwa.kitchen`*, and
`wwa.kitchen.fire` stands in `wwa.kitchen`:

```
sandbox.04 step index : 0 (0 = cook, 1 = serve)
bag                   : mudbreamx20
context               : wwa.kitchen.fire cook
cooking               : {"id":"wwa.kitchen.fire","t":0}

frame 95: the cook step finished under the thumb
  step index          : 1  bag mudbreamx17 cooked_mudbreamx3
  context flipped to  : give wwa.kitchen  hud label now "give"
  released with kind  : give → handed over: { cook: [ 3 ], serve: [ 3 ] }
  session.cooking     : {"id":"wwa.kitchen.fire","t":0}  ← still running, nothing is held

30 s later, thumb off the screen:
  bag                 : mudbreamx17
       becomes        : cooked_mudbreamx17
  focus               : 9972 → 9819 (17 cooks, 9 Focus each, regen off)
```

With the **real shipped limits** for a fresh sheet (`hp 52, focus 70, regen 6.6`) it is sustainable and
does not kill you — regen covers 9 Focus per 1.6 s — so it runs until the bag is empty:

```
shipped limits: {"hp":52,"focus":70,"regen":6.6}
  t=  0s  hp 52  focus 70  cooking true  raw left 40
  t= 30s  hp 52  focus 69  cooking true  raw left 22
  t= 70s  hp 52  focus 70  cooking true  raw left 0
```

40 raw ingredients converted in 70 s with the thumb off the screen. Every raw item in the bag is destroyed,
including anything a *different* quest's cook step or the market wanted. There is no telegraph beyond the
`+1 …` flash repeating. It only stops because the bag runs dry.

#### Face B — the fishing run is orphaned, and credits the wrong area from anywhere in the world

Live, real browser, mobile emulation at 844 × 390, real `Input.dispatchTouchEvent`
(`scratchpad/live4.mjs`):

```
holding : {"run":true,"held":true,"node":"working"}
walked  : {"ctx":null,"held":false,"run":{"phase":"cast","casts":0},
           "node":"working","pips":25}
12 s later, thumb off the screen:
          {"run":{"phase":"cast","casts":4},"node":"working","focus":70}
at a forage patch: {"ctx":"downs.pasture.patch","label":"GATHER"}
one tap  → {"said":["Too soon — the line comes back empty."],
            "items":["silverlingx1"], "patch":"ready"}
```

Three consequences, all visible: the fishing spot is stuck on `working` (its ready pip is off and its
button label reads **SPENT**) until the next press anywhere; the phantom run keeps casting, biting,
buzzing and playing the bite sound while the player is doing something else; and **the player's only verb
is dead for one press at the next node they walk up to** — the tap at a forage patch harvests nothing and
says "Too soon — the line comes back empty."

Worse, that dead press is not always dead. Same harness (`scratchpad/hold3.mjs`), orphan the run at the
Whitewall fish steps, walk ~900 m to the Blackstone obsidian seam, press the button during a bite:

```
at the obsidian seam  : context bst.levels.face work "cut"
one tap on the seam   : got silverlingx1
                        event {"t":"gather","kind":"silverling","n":1,"verb":"line",
                               "area":"wwa.fishsteps","areas":["downs","reach.light","wwa.fishsteps"]}
```

A silverling credited to `wwa.fishsteps` / `reach.light` while standing in `bst.levels`. `light.02`,
`light.26` and `light.28` all scope their catch steps to `reach.light`; they can be ticked from anywhere
in the valley. This is the *node's area, not the player's* decision (correct in itself, `session.js:698-702`)
turned into an exploit by the orphan.

The forage/rock variant is the same shape via `this.working`, which `workRelease` reads to harvest a patch
by id with no distance check.

**Aggravating factor: `holdAssist`.** `js/game/hud.js:184` makes the hold persist across pointerup when the
accessibility setting is on (`js/game/save.js:65`, default false, exposed in the menu at
`js/game/menu.js:193`). With it on, *walking around while "holding" is the intended usage*, so route one
becomes the normal case rather than an accident.

**Fix.** In `channel()`, stop the gather hold whenever one is running, regardless of `kind` — one line in
the `cancel` branch and one before `this.act(kind)`. `js/game/session.js:513`, `js/game/session.js:520`.

**The comment above `workStop` promises exactly the guarantee the dispatch does not deliver**
(`js/game/session.js:682-683`): *"Ends the hold without working anything: a pointercancel is a phone
call."* The pointercancel that actually happens in play — the one `setContext(null)` fires — does not
reach it.

---

### 2 — SHOULD-FIX: an area hand-over sits on the player at zero distance without `yields`, so it shadows everything in the area

`js/game/session.js:812` builds a hand-over target for an area delivery at the player's own position with
`range: 1` and **no `yields` flag**:

```js
x: h.body ? h.body.x : p.x, z: h.body ? h.body.z : p.z, range: h.body ? 3.6 : 1,
```

`pickContext` (`js/game/context.js:14`) only defers a zero-distance target when `yields` is set. The eat
target got the flag; the give target has identical geometry and did not. So an area hand-over wins every
tie against everything else in the area — which is the exact failure `yields` was invented for, and the
builder's own §4 says so about the eat target.

Live, real browser (`scratchpad/live5.mjs`), standing on `wwa.kitchen.fire` with `sandbox.04` at its serve
step:

```
standing at the fire, 0 cooked_mudbream: {"ctx":"wwa.kitchen.fire","kind":"cook","label":"COOK"}
with 1 cooked_mudbream in the bag     : {"ctx":"wwa.kitchen","kind":"give","label":"GIVE",
                                         "glyph":"⇢","x":-486.5,"range":1}
```

**How much this shadows.** All eleven non-sell delivery targets against the real placed props, cast and
nodes (`scratchpad/give1.mjs`) — seven are areas, and five of those contain something else:

| area target | what carrying the delivery item hides |
|---|---|
| `bst.levels` | **all three rock seams**, 6 props, `corve` |
| `lac.westfield` | 2 forage patches, **the chalk seam**, 6 props |
| `wwa.market` | the market stall (`wwa.market.stall`), `wwa.board`, `wwa.lamp`, `wick_ww` |
| `lac.barn` | **`lac.barn.fire`** — the only Longacre hearth — 3 props, `dob` |
| `wwa.kitchen` | **`wwa.kitchen.fire`**, `marrin` |
| `lac.millbridge` | 1 prop, `fen` |
| `reach.east` | `stand.east.spot`, 1 prop |

Concretely reachable: `sandbox.11` (*stack 8 wheatglass at `lac.barn`*) is a board chore that can be live
alongside `neutral.22`, whose cook step is *bake 6 cooked_wheatglass **in `lac.barn`***. Carrying the raw
wheatglass you need for the cook makes the button read GIVE and the fire unreachable. Same shape for
`dark.20` (*carry 8 wheatglass to `bst.levels`*) against the three seams `dark.19` / `dark.22` /
`neutral.13` mine there.

It always resolves — hand over what you carry and the target disappears — so it is a persistent nuisance
rather than a lock, but it is the player's only verb changing meaning underneath them, and it is the
direct cause of defect 1's face A.

The body variant is milder because it is range-gated, but it still replaces a live `talk`. Live
(`scratchpad/live7.mjs`), `light.28` at its brief step (*talk marrin*) with `sandbox.02` at its carry step:

```
light.28 at its brief step, no silverling : {"ctx":"marrin","kind":"talk","label":"TALK"}
sandbox.02 at carry + one silverling      : {"ctx":"marrin","kind":"give","label":"GIVE"}
```

`sandbox.02`'s carry step has `in: null`, so this holds anywhere in the world. Also self-resolving.

The comment at `js/game/session.js:797-799` says the area target *"sits on the player like the self target
does"* — it sits there like it, and behaves the opposite way.

---

### 3 — SHOULD-FIX: the context button reads **SPENT** for the whole time you are fishing

`js/world/nodes.js:207` labels a target `'spent'` whenever the node is not `ready`, and `workStart` puts
a fishing spot into `working` for the length of the cast. Live at 844 × 390 (`scratchpad/live4.mjs`):

```
before  : {"label":"LINE","node":"ready","pips":26}
casting : {"label":"SPENT","node":"working","pips":25}
biting  : {"label":"SPENT","node":"working","pips":25}
after   : {"label":"LINE","node":"ready","pips":26}
```

The button you are holding relabels itself SPENT the moment you start using it, and the ready pip — the
node's only other state tell — goes out. At Line 1 `secondsPerCatch` is 7 s, so SPENT is what the player
reads for essentially the whole interaction. `scratchpad/shots/hud_bite.png` shows it: the button under
the thumb says **SPENT** during the bite.

`NodeSet.release` is right that a spot is never used up; `working` should simply not map to the same label
as `cooling`.

---

### 4 — SHOULD-FIX (test): `js/world/nodes.js` has zero coverage, and its file-top comment is why

`js/world/nodes.js:5-7`:

> *Everything a node **decides** … is in js/game/gathering.js … This file is the three side of that split
> and **holds no rules**: it draws the bodies, and it draws a pip over the ones that are ready.*

It holds three, all of them load-bearing and none of them anywhere else:

| `nodes.js` | rule |
|---|---|
| `:138` `ui: e.kind === 'hearth' ? 'cook' : 'work'` | which verb the context button fires |
| `:138` `range: 3.6` | how close you must stand — the whole reachability rule |
| `:207` `label: i.state === 'ready' ? i.label : 'spent'` | what the button says (defect 3) |

`js/game/gathering.test.js`'s only reach into this file is a **source grep of `main.js`** for the string
`nodes.targets()`. I mutilated `nodes.js` four times and re-ran the suite each time:

| mutilation | expected | got |
|---|---|---|
| every node `range: 3.6 → 0` (nothing is ever in reach; the whole verb is unreachable) | red | **GREEN 430/0** ✗ |
| `targets()` returns `[]` (no node is ever offered) | red | **GREEN 430/0** ✗ |
| `ui` always `'work'` **and** the `'spent'` label deleted | red | **GREEN 430/0** ✗ |
| the unknown-kind guard deleted | red | **GREEN 430/0** ✗ |

This is `REVIEW_PROPS.md`'s closing finding, verbatim, one wave later: *"`js/world/props.js` has no
automated coverage at all … Deleting the guard from `props.js` would leave 393/393 green."* The lesson was
not applied. It is not fixable without a headless-three harness, but the comment that says there is nothing
here to test is the thing that keeps it unfixed, and it is wrong.

`js/main.js:76-77` repeats the claim: *"`Nodes` only draws them, and the session works them."*

---

### 5 — SHOULD-FIX: holding past the strike window tells the player they were too soon

`js/game/session.js:674` picks the message off `why`, and `why` is `'early'` for **any** release that is
not on a bite — including a release after the window has already closed and the run has silently gone back
to casting. `'Gone.'` fires only on `why === 'nothing'` (`rollCatch` returning nothing), which is not the
overshoot case at all.

Live, real touch (`scratchpad/live3.mjs`): wait for the bite, hold 1.4 s, release:

```
held past the window : {"phase":"cast","casts":1,"inverted":false,"big":false}
                       [ "Too soon — the line comes back empty." ]
```

The two ways to miss a 0.9 s window are being early and being late, and the game reports both as early.
The moment of loss itself says nothing at all (`gatherTick`'s `'lost'` branch plays `uiBlip` and no line).
`NOTES_GATHER.md` §3's *"Hold past it: 'Gone.'"* does not happen.

---

### 6 — SHOULD-FIX: the fire picks the most valuable raw in the bag, which is the one certain to burn

`js/game/gathering.js:240-251`: with no live cook step wanting a dish, `cookChoice` falls back to the
highest `ITEM_VALUE` perishable in the bag. `recipeLevel` is derived from the same value ladder, and
`burnChance` (`js/sim/gather.js:80-81`) is **unclamped above 1**. The most valuable item in the bag is
therefore the one most likely to be destroyed (`scratchpad/misc.mjs`):

```
bag {"silverling":5,"goldenscale":1,"wheatglass":4} → cookChoice picks goldenscale
    (value 300, recipeLevel 13)
burn chance at Hearth 1: 106%  →  burnt 200 / 200 over 200 cookOne() calls
    Hearth 1: 100%   Hearth 2: 100%   Hearth 3: 95%   Hearth 5: 84%
```

`goldenscale` is the Line 13 fish behind `sandbox.03`, the rarest thing in the catch tables. Holding the
cook button at any fire with one in the bag and no live cook step destroys it on the first 1.6 s tick with
certainty, and says "Goldenscale, burnt." It does not soft-lock anything — the `gather` objective is
credited at catch time — but it is the single most hostile default in the wave, and it compounds defect 1:
the runaway eats the bag in descending order of value.

---

### 7 — MINOR: only one hand-over per target is ever offered

`js/game/gathering.js:303` dedupes by `to` **and** `item`; `js/game/session.js:809` then dedupes the
targets by `to` alone. Two live deliveries to the same place produce one button
(`scratchpad/misc.mjs`, real `neutral.22` + `sandbox.11` defs):

```
handovers() returns 2 entries: cooked_wheatglassx6→lac.barn, wheatglassx8→lac.barn
context can only ever be the first one
```

Which one you get is the insertion order of `doc.quests`, i.e. the order you accepted the quests.
`bst.barracks` has three deliveries (`dark.05`, `dark.10`, `neutral.25`) and `bst.levels` two. Self-resolving
— finish the first and the second appears — but it is arbitrary and unexplained.

---

### 8 — MINOR: node state is not saved, so a reload refills every patch and seam

The handoff admits it; here is what the player gets. Live, real touch (`scratchpad/live5.mjs`):

```
after one pick: {"patch":"cooling","respawnAt":20.1,"played":0.4,"bag":["whitepetalx3"],"pips":25}
pressing again: {"bag":["whitepetalx3"],"label":"SPENT"}
save shape    : {"keys":["forge.save"],"atlas":{"ferry":[],"nodes":[]}}
after reload  : {"patch":"ready","played":1.1,"bag":["whitepetalx3"],"pips":26}
pick again    : {"bag":["whitepetalx3","chalk_sagex3"],"patch":"cooling"}
```

The item is autosaved (`landed()` calls `autosave.mark()`); the cooling timer is not. **Reload and the
whole world is full again** — no save-scum trick needed, an F5 does it. `doc.atlas.nodes` is present in the
written save and empty, as documented. Nothing strands: a `working` node comes back `ready`, so quitting
mid-cast is clean. Ceiling is low (35–240 s of respawn), but `gravecap` ×3 and `foul_water` ×3 are the
grinds the handoff names, and both are now skippable by reloading.

---

### 9 — MINOR: `recipeLevel` disagreement quantified, and there is a third copy for forage

Asked for a number. `js/game/gathering.js:67-70` against `tools/soak.mjs:200`
(`Math.max(1, itemTier(value) * 3 - 2)`), over all 21 perishables (`scratchpad/recipe.mjs`):

```
14 of 21 disagree; largest gap 5 levels
  riverlight  15 vs 10   burn@Hearth1 117% vs 90%
  gravebarb   11 vs  7             95% vs 73%
  ford_eel     7 vs  4             73% vs 57%
  goldenscale 13 vs 10            106% vs 90%
  silt_carp    2 vs  4             46% vs 57%    ← the only one where soak is harsher
Hearth  1: 14 items differ, worst gap 27.5 percentage points of burn chance
Hearth 20:  1 item  differs, worst gap 10.5 percentage points
```

And a third definition nobody mentioned: forage source level is `(tier - 1) * 5` in `sourceOf`
(`gathering.js:59`), `Math.max(1, (tier - 1) * 5)` in `harvest` (`gathering.js:173`) — so a tier-1 herb is
level 0 in one and 1 in the other — and `tier * 4 - 3` in `tools/soak.mjs:214`. Three numbers for one
concept. `soak` should import both, per the handoff's own §10.2.

---

### 10 — MINOR: four comments that are wrong, and three measured claims in the handoff that are wrong

Comments (`CLAUDE.md`'s strictest rule, and the thing both previous reviews rated above real bugs):

- **`js/world/nodes.js:7`** — *"holds no rules"*. Three rules, all uncovered. Defect 4. This is the
  confidently-wrong one, and it is causal.
- **`js/game/context.js:3-4`** — *"Nearest wins, on the same cost function the aim picker uses, so the
  button and the bolt agree on 'nearest'."* `pickContext` costs `d * 0.06`; `acquire`
  (`js/sim/combat.js`) costs `ang + d * 0.06`, and a radian is worth 16.7 m. Demonstrated:

  ```
  facing +z, two targets in range:  ahead (0, 3.0)   behind (0, -2.9)
  pickContext → behind      acquire → ahead
  ```

  `pickContext(list, pos)` does not take `camYaw` at all, so it cannot be the same function. The text is
  pre-existing — it was inline in the old `retarget()` — but this wave lifted it into a new file's header
  and made it the stated rationale for the module.
- **`js/game/session.js:682-683`** — the `workStop` comment. Defect 1.
- **`js/game/placement.js:62`** — *"Three results, not one."* This wave added a fourth and did not update
  the count.
- **`js/game/session.js:797-799`** — *"sits on the player like the self target does"*. Defect 2; it sits
  there and behaves oppositely.

One new banner comment, `js/game/session.js:612` (`// ── gathering, SYSTEMS §6 ───`), which `CLAUDE.md`
bans outright — but `session.js` already had eight, so it is consistent with its surroundings rather than
novel. Same call `REVIEW_COMBAT.md` made. `js/game/gathering.js`'s seven-line file-top block is over the
"a short file-top line" budget, as `roster.js` and `placement.js` were; it is good prose and I would not
cut it. No JSDoc anywhere. Every other comment I checked in the new files is accurate, including the big
one at `gathering.js:20-24`, which I verified in full (see *What I verified*).

Measured claims in `NOTES_GATHER.md` that do not hold:

- **§2 and §7: "6 merged meshes"** — it is **nine**. All three surfaces are used in all three zones:
  `light` wood 460 / trim 880 / bush 240, `neutral` 548 / 664 / 720, `dark` 232 / 1336 / 240. Total 5,320,
  so the triangle figure is exactly right; only the mesh count is wrong, and it matters because the
  draw-call story in §7 is built on it. Plus three pip meshes, 26 × 8 = 208 triangles — that part is right.
- **§3: "Hold past it: 'Gone.'"** — defect 5.
- **§8: "The fire reads as … a stone ring with a spit and a flame in the middle."** There is no flame.
  `KIT.hearth` (`js/world/nodes.js:87-99`) is seven stones, three logs and a spit frame with no emissive
  of any kind; the thing in the middle of the render is `out.mark` — the generic ready pip, the identical
  gold octahedron every bush and seam wears. See *Node kit renders*.

---

### 11 — MINOR: the rock kit shows the zone, not the rock

`KIT.rock` builds everything from `trim`, so a seam takes the colour of the zone it stands in and says
nothing about what is in it. `heath.crag.seam` (iron_glass) and `bst.levels.face` (obsidian) are pixel-for-
pixel the same idea; `downs.pasture.chalk` and `lac.westfield.chalk` are the *same rock* and look nothing
alike — a pale coursed cone in Whitewall, a dark boulder in Longacre
(`scratchpad/kits/seam_chalk.png` vs `scratchpad/kits/seam_chalk_lac.png`). `dark.19` and `dark.22` want
obsidian specifically and `dark.22`/`neutral.13` want iron; the player cannot tell them apart by looking.
The rarity table already knows which rock is which (`gathering.js:32`); a tint per rock would be three lines.

---

## Suspicions I could not demonstrate

- **A hypothesis of mine that measurement killed, recorded because it looked certain.** `gatherTick`'s
  recast branch (`session.js:791-794`) calls `hud.finish(false)` when `spendFocus` fails but `tickRun` has
  *already* recast, and nothing clears `this.run` — so I expected fishing to become free once Focus ran
  out. It does not. `vitals.spend` (`js/game/vitals.js`) overdraws into HP rather than refusing, so the
  cast is still paid for: with regen off, 15 casts at zero Focus took HP 100 → 5.4. **The cost is real.**
  What is true and worth knowing is that the *auto*-recast keeps spending on its own, so a hold left down
  at low Focus drains HP with no deliberate press — and an orphaned run (defect 1) does it while the
  player is elsewhere. With the shipped regen of 6.6/s against 1.23/s of fishing, Focus never runs out
  from fishing alone, so I could not make it gutter anyone in a realistic session and I am not claiming it
  will.
- **Whether 0.9 s is hittable with a thumb.** Unprovable here; see §*The strike window*.
- **`demo.rebuild()` re-seating.** Same as props: ground heights are read once in `Nodes.build`. I did not
  drag a rebuild knob and re-measure.
- **The other 97 quests.** I drove `light.02`, `sandbox.04`, `sandbox.02`, `light.28` and `neutral.22`'s
  shapes. `light.26` end to end is the builder's, and the test that pins it is honest.
- **Whether `bst.levels`' four surface nodes read as wrong to a player.** They are in an open grassy
  courtyard beside the Blackstone keep at y ≈ 46 m, which is what the handoff says, and I have no view of
  what A8 intends there.

---

## What I verified as correct — do not re-check these

| | |
|---|---|
| **Coverage, derived independently** | I re-walked the real packs and matched every gathered id against the real placed nodes without using the builder's test (`scratchpad/cover.mjs`): `placeAll` errors `[]`, `buildNodes` errors `[]`, 26 nodes, and **all 24 ids covered** — a producing node exists, and one stands inside every area a step scopes it to, including every `hearth: true` area |
| **"A region is demanded, not guessed" — correct, and all eight overrides are load-bearing** | every `region` in `data/gather.json` is on an area whose lineage has **no `town` at all**, so `buildNodes` would refuse the node without it. The nine nodes with no override each derive from a real declared `town` — `stand.dry → blackstone`, `stand.quiet → longacre`, `reach.light → whitewall`. Nothing guesses. `heath.ford.spot` is the only one whose value differs from what its surroundings would suggest, and the test pins it |
| **The dial reasoning is true, checked three ways** | a brand-new save has `unlocked = ['kindle']` and `pins = ['kindle']` (`sheet.isUnlocked`); **no quest in the corpus sets any `school.*` flag** (walked every `onDone` in all four packs); and `rewardFor` only pays a school with `v > 0`, so a reward can never bootstrap one — `light.01` pays `{cull, kindle}` with a fresh sheet and with 500 kindle XP alike. The only `gainXp('line', …)` in the runtime is `landed()` at `session.js:705`. **A dial check really would make `light.02` unreachable.** |
| The lamp inconsistency is harmless | the button always names the verb it will fire: a node's label is its own school (LINE/GATHER/CUT/COOK), a prop's comes from `verbFor`. The only `verb:` on any gather step is `hearth` on the cook steps and `forage` on `sandbox.11`, and both match `KIND[…].school` exactly. No quest can be blocked by it |
| **`js/sim/tables.js` moves no existing number** | diffed the built `ITEM_VALUE` against `HEAD`'s: 40 keys → 61, **0 pre-existing values changed, 0 removed**, 21 added, all `cooked_*`, all exactly `round(raw × 2.4)`. `PERISHABLE` is 21 before and after and contains no cooked id. Every other export of the module is byte-identical. Moving `COOKED_MUL` above `raw` is inert |
| `js/world/materials.js` | `bush` is purely additive beside `crest`, reads `z.foliage.bush[0]`, which all three zones define. No texture, so `budget.js track()` is correctly not involved. No existing `SURFACE` entry touched |
| **`js/world/zones.js` unmodified** | `git status` clean on that path. No zone-string test anywhere in `nodes.js`, `gathering.js`, `context.js` or `materials.js`; the two in `hud.js:288-289` are pre-existing and outside the diff. `REGION`'s three keys are `areas.json`'s `town` ids, which is game data, not art |
| **`js/game/gathering.js` and `js/game/context.js` are pure** | walked the whole import graph: `gathering.js → sim/tables, sim/gather, sim/rng, sim/schools, game/areas, game/quest, game/predicate, sim/xp, sim/campaign`. No bare imports, no `three`, no DOM, no `Math.random`, no `Date.now`, no `fetch` |
| **The strike window really is 0.9 s in the running game** | see §*The strike window* |
| Degradation | moved `data/gather.json` aside and booted for real: `ready true, nodes 0, props 48, cast 18, session true, gaps [], tracked light.01`, one warning naming the file. `loadPlacements` settles all four files independently — `REVIEW_PROPS.md` defect 8 was fixed in `1ea695a` and the new file follows the fixed pattern |
| Both non-play boots | `?shot=creek_day`: 26 nodes, 26 pips, `game: false`, **82 calls / 96,348 main triangles** (the handoff's figure to the call), no console output. `?editor=1`: 26 nodes, no session, `nodePip` knob registered, no console output |
| `nodePip` knob | 0 → all pip meshes `visible: false`; 1 and 2 → visible, `pipLevel` follows. Turning it off really does turn them off |
| Geometry cost | 26 nodes, **5,320 triangles** counted off the built geometry, exactly as claimed; 3 instanced pip meshes, `count` 8/10/8 = 26, 208 triangles, opaque `MeshBasicMaterial`, no alpha. Only the *mesh count* in the note is wrong (defect 10) |
| The event shapes | `gatherEvent` carries the node's `area` and full `areas` lineage; `cookEvent` carries `via: 'craft'`, which all seven `cooked_*` steps in the corpus require; `deliverEvent` carries `to`. `handovers`' `here` and the reducer's `inArea` read the **same list** — `QuestRunner.ctx().areas === this.here` — so a hand-over the button offers is one the reducer accepts. I could not make it consume items without crediting |
| No double-credit | `applyEvent` clamps at `o.target` and `handovers` offers `min(left, have)`; `give()` re-mins against `itemCount` at press time. `via: 'sell'` steps are skipped, so the market keeps its eight |
| Suite / linters | `node --test` **430 pass, 0 fail**; `lintQuests` 99 quests · 405 steps · 175 nodes · 1 warning (the pre-existing `light.06`) · 0 errors; `lintText` 175 nodes · 705 lines · 0 warnings · 0 errors |
| `docs/REMAINING.md` | honestly updated — `gather` 48/24 matches the packs, `deliver`'s "11 non-sell targets" matches my own count of 11 |

---

## The strike window

**0.9 s is real and the boundary is where it says it is.** Live, mobile emulation at 844 × 390, real
`Input.dispatchTouchEvent`, releasing at controlled delays after the bite (`scratchpad/live2.mjs`, ~60 fps):

```
  asked | what the game saw
   0 ms | phase=bite  run.t=0.057  caught=true    wall bite→release   57 ms
 400 ms | phase=bite  run.t=0.449  caught=true                       449 ms
 800 ms | phase=bite  run.t=0.867  caught=true                       867 ms
 900 ms | phase=cast  run.t=0.033  caught=false                      951 ms
1200 ms | phase=cast  run.t=0.341  caught=false                     1250 ms
2500 ms | phase=cast  run.t=1.640  caught=false                     2539 ms
```

867 ms lands, 951 ms does not. Game time tracked wall time 1:1 (`app.js:108` clamps `dt` at 0.1, which
only matters below 10 fps).

**There is no lag between the cue and the hittable window.** `hud.bite(true)` is called from the same
`gatherTick` frame that sets `phase: 'bite'` (`session.js:790`), and the release is handled synchronously
from the DOM `pointerup`, not on a frame boundary. Cue and window open together.

**The cue itself, measured at 844 × 390** (`scratchpad/live3b.mjs`, `shots/hud_bite.png`):

- the act button goes 76.0 → **85.1 px**, `transform: matrix(1.12, …)`, over a 120 ms transition
  (`game.css:387`). Real, but it is the button **under the thumb** — on a phone the growth and the glyph
  are behind the finger.
- the inverted draining ring is on `.g-dial` — **the other button**, ~30 px to the left
  (`hud.js:74-76` appends `chargeRing` to `this.dial`; the act button carries `suspRing`). So the visual
  cue a thumb can actually see is on a different control from the one it is pressing.
- the label on the act button reads **SPENT** throughout (defect 3).
- the dial's `em` reads `1.0×`–`1.4×` during the hold, which is the *cast charge multiplier* readout
  (`hud.js:309-311`) leaking into fishing, where nothing is multiplied.
- plus `audio.play('bite')` and `buzz(20)`.

**Judgement.** The mechanic is fair *in the rules*: 0.9 s is generous for a reaction test, the window is
exactly what it claims, there is no input lag, a miss recasts free and costs only time, and there are
audio and haptic channels that a thumb cannot occlude. What is not fair is the **feedback**: the one
visible cue is on the wrong button, the button you are pressing tells you SPENT, and both ways of missing
report "Too soon". Fix defects 3 and 5 and move the inverted ring onto `.g-act` and I would expect 0.9 s
to be comfortable. **Thumb-feel remains unproven — I have no phone either, and everything above is desktop
Chrome under device emulation.**

---

## Test quality

**The pure layer is well tested and the revert claims are honest. The three layer is not tested at all.**

The 26 tests in `gathering.test.js` are real seam tests: they drive the shipped `data/quests/*.json` through
`lintAll()`, the real `data/areas.json`, the real `placeAll`, the real `buildNodes` and the real `quest.js`
reducer, and the `light.26` end-to-end test builds its events with the same `gatherEvent` / `cookEvent` /
`deliverEvent` the session uses. "the reducer refuses a cook that does not say it was craft" and "session.js
emits through the shared event builders" are exactly the right pair — one proves the shape, the other
proves nothing bypasses it. `GAPS`-style hard-coded lists are absent; the corpus is the only authority.

**Spot-check of the 25 revert claims — I reverted six myself:**

| reverted | expected | got |
|---|---|---|
| `strike()` loses the `phase !== 'bite'` guard | red | **red** (429/1) ✓ |
| `regionOf()` defaults to `whitewall` instead of `null` | red | **red** (429/1) ✓ |
| `pickContext` loses the `yields` branch | red | **red** (429/1) ✓ |
| the generated `cooked_*` prices removed from `tables.js` | red | **red** (429/1) ✓ |
| `heath.ford.spot`'s override flipped to `blackstone` | red | **red** (429/1) ✓ |
| `handovers` loses its `s.in` / `here` scoping | red | **red** (428/2) ✓ |

Six for six. The builder's table is trustworthy for everything it covers.

**What it does not cover** is defect 4: `js/world/nodes.js`, four mutilations, all green — including
`range: 0`, which makes every gather node in the game unreachable, and `targets() { return []; }`, which
removes them from the world. It also does not cover `js/game/session.js`'s gather section at all — defect
1 lives in `channel()`, which no test constructs, and I had to build a real `Session` under a DOM shim to
see it. That is the same structural hole `REVIEW_COMBAT.md` found in `combat.test.js`'s rig stub and
`REVIEW_PROPS.md` found in `props.js`, and it is now three waves old.

The two tests marked `n/a` in the builder's table ("nothing above the level cap", "the region map is the
three towns") are correctly marked — they assert properties of the corpus and of a constant.

---

## The 24-vs-21 count

**The builder is right: 24 distinct ids, 48 objectives. The 21/44 in my brief is a `do:`-only count.**

The packs author a step either as `do: [verb, …]` or as `all: [[verb, …], …]`, and `questdef.js:58`
normalises both into `objectives`. Counting the raw JSON's `do` field alone gives exactly the brief's
numbers; the four objectives hidden inside `all:` blocks are the whole difference
(`scratchpad/count3.mjs`):

```
total do-gather: 44        all-gather: 4          →  48
ids appearing ONLY inside `all` steps: silt_carp(1), field_honey(1), tuber(1)
distinct: 21 + 3 = 24      raw 17 + cooked 7
```

- `silt_carp` — `dark.10`, in an `all:` step
- `field_honey`, `tuber` — `neutral.22`'s `gather` step, `all: [["gather","field_honey",4],["gather","tuber",4]]`

Per-pack distinct: dark 10, light 6, neutral 11, sandbox 6, union **24**. Nothing is uncovered: my
independent check (not the builder's test) confirms every one of the 24 has a producing node, and a
producing node inside every area a step scopes it to, including all three `hearth: true` kitchens.

Deliver: **24 objectives, 8 `via: sell`, 16 hand-overs across 11 distinct targets** (9 areas, 2 people —
`hana`, `marrin` — plus `wwa.board`, which resolves to the prop body, so 11 targets over 16 objectives).
The handoff's table says "14 to an area, 2 to a person", counting objectives rather than targets; both
add to 24 and both are right about the routes.

---

## Node kit renders

Twenty renders at 844 × 390, cameras placed by hand at 6–9 m — gameplay distance — in all three zones,
plus the two HUD frames (`scratchpad/kits/`, `scratchpad/shots/`). Plain judgement, worst last:

- **Fishing spot — genuinely good, ship it.** From the bank looking at the water it reads exactly as
  described: a low rail, two plank steps, bank stones and a rod out over the channel with the gold pip as
  the float at its tip (`kits/fish_wwa_water.png`, `fish_dry_water.png`). It stands on the bank in all
  three zones; nothing is drawn on the water. The best of the four.
- **Forage patch — good.** A broad-leaved clump, clearly a plant and clearly not scatter foliage
  (`kits/forage_light.png`). The Blackstone version is near-black on green
  (`kits/forage_dark.png`) — reads as a dead or burnt shrub, which is right for gravecap. In both cases the
  *pip* is what makes it findable at range; the leaf colour is close enough to the grass that the clump
  alone would be easy to walk past. That is what the pip is for, so: fine.
- **Obsidian / iron seam — good.** Dark angular blocks with shards standing out of them, plainly a mineral
  outcrop, and the orange pip reads hard against the black (`kits/seam_obsidian.png`, `seam_iron.png`).
  The "brick igloo" is gone.
- **Hearth — legible, but it is not on fire.** The Longacre one is the good version: dark stone ring, three
  logs, a spit frame (`kits/fire_lac.png`). Two problems. **There is no flame** — what looks like one in a
  render is the ready pip, the same gold octahedron a bush wears, and there is no lit state at all while
  you are cooking, so a fire you are actively using looks exactly like a cold one. And in **Whitewall** the
  spit's three thin `trim` cylinders come out **candy-striped black-and-white** — the uprights and the
  crossbar read as barber poles (`kits/fire_wwa.png`). That is the same `projectUV`-at-world-scale problem
  the seam was redesigned to escape, still present on the thin members in the one zone whose masonry has
  high-contrast courses.
- **Chalk seam — weak.** In Whitewall it is a neat pale cone of stacked stones: a **cairn or a termite
  mound**, not a seam cut into the ground (`kits/seam_chalk.png`). In Longacre the same rock is a dark
  boulder indistinguishable from obsidian (`kits/seam_chalk_lac.png`). Defect 11.

**Shippable?** Fishing spots, patches and the dark seams: yes, without reservation. Hearths: yes for
Longacre and Blackstone, but the Whitewall spit needs the stripe fixed and all three want a lit state —
"cook here" is the one node whose whole identity is the fire, and it has none. The chalk seam is the one
kit I would not ship as it stands.

Two HUD frames are also worth the reviewer's eye: `shots/hud_idle.png` (button reads LINE, pip on the rod)
and `shots/hud_bite.png` (button reads **SPENT** during the bite, ring inverting on the *other* button) —
defects 3 and the cue note in §*The strike window*.

---

## If you pick this up next

1. **Stop the gather hold on any `cancel` or `release`, whatever `kind` says.** Two lines,
   `js/game/session.js:513` and `:520`. This is the blocker.
2. **Give the area hand-over target `yields: true`**, `js/game/session.js:812`. One word, and it stops the
   button changing meaning on top of five fires, seams and stalls.
3. **Do not label a `working` node `spent`**, `js/world/nodes.js:207`.
4. **`why === 'lost'`** so holding too long can say so, `js/game/session.js:674` and
   `gathering.js:206-208`.
5. **Skip an item `cookChoice` is certain to burn**, or clamp `burnChance` at something under 1.
6. **Move the charge ring onto `.g-act`** so the bite cue is on the button being pressed — then the 0.9 s
   window can be judged on a phone with a fair chance.
7. **A headless-three harness.** Three waves have now shipped a `js/world/*.js` file with zero coverage and
   a comment explaining why none is needed.
