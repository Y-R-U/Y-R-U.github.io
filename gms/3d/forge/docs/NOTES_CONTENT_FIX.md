# NOTES_CONTENT_FIX — the content-defect fix pass

Working record for the fix pass that follows `docs/AUDIT_CONTENT.md`. Appended after each task.
Owned files: `data/**`, `docs/STORY.md`, `docs/RUNTIME.md`, `docs/SYSTEMS.md`, `docs/NOTES_CONTENT.md`,
`tools/lintQuests.mjs`, `tools/soak.mjs`, `tools/campaign.test.mjs`. **`js/**` is off limits** — three
other agents own the runtime concurrently; anything needing a runtime change is written up under
"Runtime requests" instead of being made.

## Gates, before and after

| gate | before | after |
|---|---|---|
| `node --test` | 312 pass / 0 fail | **338 pass / 0 fail** (+6 from other agents, +5 mine) |
| `node tools/lintQuests.mjs` | 0 errors, **7 warnings** | 0 errors, **1 warning**, and **three new error-level rules** |
| `node tools/lintText.mjs` | 0 warnings | 0 warnings, longest line 43/46 |
| `node tools/soak.mjs` | 7.02 h, Grasp 152, 439,068 XP, 11,467 mk | **byte-identical — and that is a finding, see task 6** |
| `node tools/campaign.test.mjs` | 15/15 | **21/21** |

The surviving warning is `light.06: reward item apprentice_cord is not in sim/tables.js`, which is a
`js/sim/tables.js` gap and not mine to close.

**Three new lint rules, all errors so they gate, all with a paired test that proves the rule catches
the bug it was written for.** A soft-lock detector nobody has watched fail is not a detector.

| rule | catches | found |
|---|---|---|
| `travelErrors` | a timed step you cannot walk to inside its own window | `light.22` (the blocker) and `neutral.09` |
| `failRetryErrors` | a `fail` predicate a `retry` cannot clear | `neutral.06`, `neutral.15` |
| `itemFlowErrors` | a quest that spends what a sibling also needs | all four the audit listed, **plus `light.02→03/04`, which it missed** |

## Task list

1. BLOCKER — `light.22.night` uncompletable; add a travel-vs-clock check to the tooling
2. BLOCKER — `neutral.06.apart` and `neutral.15.yard` monotonic `fail`s; lint rule for the class
3. Cross-campaign Truth chains hang off skippable quests (L16, D14, D18, N10)
4. Narrative defects — `sela.was.you`, `light.14.price` "before Thursday"
5. Item-flow holes — D20/D25, N25, D04/D05, D11; lint rule if tractable
6. Combat rebalance — one-tap trash, `brood_mother`, L23, L18; S19/S20 `within`
7. Tedium — walking; do the clearly-correct compressions, propose the rest
8. Doc↔data staleness
9. `board_ww` — add the missing Whitewall board area

---

## 9 — `board_ww` (done)

`data/areas.json` gains `wwa.board`, "the Yard post", a circle at (−536, −46) r 5 inside
`wwa.market` (STORY §8.4 puts the board in Sanctum Yard). The id `board_ww` is gone: the five
sandbox givers and `sandbox.01.claim`'s deliver target are now `wwa.board`, and `cast.json`'s entry
is rekeyed so the journal still prints "the Yard post" under the title.

The giver warnings needed one lint change as well, because a board post is given by a *place*:

```js
if (def.giver && !nodeOwners[def.giver] && !areaId(def.giver)) { … }
```

That is honest rather than a suppression — `questrunner.offerFrom` matches the giver id against
whoever the player is talking to, and the board is a thing you walk up to and read. A typo'd NPC id
still warns.

**Warnings 7 → 1.** The survivor is `light.06: reward item apprentice_cord is not in sim/tables.js`,
which is a `js/sim/tables.js` gap and not mine. `js/game/packs.test.js` asserts every warning matches
`/apprentice_cord|board_ww/`, so removing warnings keeps it green.

## 1 — `light.22.night` (done) and the travel-vs-clock check (done)

**The quest.** `light.22`'s first step is now the untimed walk home, so the `wait` that `accept`
fires happens with the player already inside Whitewall:

| | |
|---|---|
| `home` | `goto wwa.market`, no window — this absorbs the 1,040 m from the Blackstone reach |
| `night` | `goto wwa.almonry`, `after: 1, before: 4` — **80 m**, 0.27 of 3 game hours |
| `ward` | now carries the `unseen`, so stealth starts at the Almonry door and not 1 km away |

Splitting `unseen` off the approach matters as much as the window did: it was live for the whole
cross-valley night march, so any detection anywhere failed the quest outright.

**The check.** `travelErrors(defs, areas)` in `tools/lintQuests.mjs`, exported and also asserted from
`tools/campaign.test.mjs`. It is the model the audit used, made executable:

- a step's location is `in`, then the `goto`/`survive` target, the `deliver` target area, the
  `escort` area, the innermost declared area around an `interact` prop, then the `recover` `moveTo`;
- the player's position entering a step is the previous located step in the same quest, and for the
  first one it is **the giver's town** if the quest has a giver (`questrunner.offerFrom` means you
  accept by talking to them) or **the end of the prereq quest** if it is self-directed like L22;
- 300 m of walking is one game hour (STORY §4's clock × `js/player.js`'s 5 m/s), and travel alone
  may not eat more than **75%** of a window or of a `within`.

It is an **error**, not a warning, so it gates. Two tests in `campaign.test.mjs`: one asserts the
corpus is clean, and one rebuilds light.22 as it shipped and asserts the check *fails* it — a
soft-lock detector nobody has seen fail is not a detector. Verified against the real file too:
restoring the old step produces
`light.22.night: 1001 m from reach.dark is 3.34 game hours of walking into a 3 h window`.

**It found a second one.** `neutral.09.attend` — 521 m from the `lac.barn` graft into a 2 h window,
87% consumed before the player does anything, and it rides an `onDay: 8` gate they get one shot at
per eight days. Widened to `after: 11, before: 14` per the audit §2.7, plus a hint that says why you
come up early. 58%, and the reading is still at High.

Note the audit's own §2.7 cleared every other timed step by hand and agreed with the tool on all of
them — including `light.24.come`, which *looks* like a second L22 (1,049 m from `bst.bailey` into a
2 h window) but is safe because L24 has a giver, so the clock does not start until the player has
already walked back to Alder in Whitewall. The tool models that distinction rather than flagging it.

## 2 — the two monotonic `fail` predicates (done)

**First, a correction to the audit.** §1.2 proposes clearing the flag in the *failing step's*
`recover`. That does not work. `quest.js` `retry` runs `required(def)[0].recover` — the **first**
step's, and nothing else — and `reset` only runs while the quest is `active`, which a failed quest
is not. A recover on the failing step is unreachable from the state it is meant to rescue.

**The real shape of the bug** is not "a flag with no reset". It is: **`fail` is read against state,
and the only state a retry can touch is whatever the first step's `recover` reaches.** `unseen` and
`within` fail on an *event*, so a retry starts clean by construction. That is the distinction the
fix and the lint rule are both built on.

**`neutral.06.apart`** — `fail: ["flag","neutral.06.met",true]` → `unseen: true`. The flag was never
set by anything, and it could not be cleared by anything either: `recover` has no `flag` verb, and
adding one to the linter's `RECOVER` table breaks `js/game/wiring.test.js`, which derives the world
adapter's required verbs by parsing that table. `unseen` is the mechanic the beat actually wants —
Hana's brief is *"What if they see each other?"* and the answer is that they see *you* crossing
between them. Hint reworded to say so.

**`neutral.15.yard`** — `fail: ["damageDealt",">",0]` → `unseen: true`. Same reasoning, and the
step text already carried it: a jailbreak is undone by a witness exactly as much as by a body.
`damageDealt` reads `QuestRunner.damage`, which is declared once and never written or reset, so the
predicate means "since the app booted"; by N15 that is several hundred kills. Text and hint now name
both failure modes.

The corpus now has **no `fail` predicate at all**, which is the correct answer for a runtime with no
`flag` recover verb.

## 3 — the four Truth chains hanging off skippable quests (done)

Two shapes, two different fixes. The brief asks for multi-path over mandatory where possible, and
that turns out to be exactly available for one of the two shapes and not for the other.

**Shape A — the skippable quest holds a *middle* link.** `light.16` grants `cousin`, `dark.14`
grants `ansel.nobody`, and the mandatory `ansel.you` (N08) supersedes only `ansel.nobody`. Skip
either and the chain has no head or no middle. Fixed topologically, in one line:

```json
"ansel.you": { …, "supersedes": ["ansel.nobody", "cousin"] }
```

`supersedes` already takes an array (`root.longacre`, `prices.raids`), so `ansel.you` now strikes
both the link and the link's own parent. Whichever of the two the player is holding gets struck;
holding neither strikes nothing and dangles nothing. **L16 and D14 stay optional**, which is what
they should be — they are colour, and the reveal they set up is mandatory anyway.

This tripped `truthErrors`' cycle detector, which used a single global `seen` set and so read any
*diamond* as a cycle. It is now a proper DFS over the current path. A diamond is not a cycle — it is
precisely how a chain stays whole when its middle link is optional, so the lint had to learn the
difference before the fix could exist.

**Shape B — the skippable quest holds the *superseding* link.** `dark.18` grants `sign.kept`, the
only thing that ever strikes the mandatory `unseen` (L20). `neutral.10` grants `count.by.design`,
the only thing that strikes the mandatory `count.never.holds` (L17). There is no second Truth in the
corpus that could honestly overturn either, so multi-path is not on the table and the audit's fix is
right. Both become load-bearing:

- `dark.19.prereq` gains `["quest","dark.18","done"]`
- `neutral.11.prereq` gains `["quest","neutral.10","done"]`

Neither is a new gate in any real sense: **`dark.18.onDone` already unlocks `dark.19`, and
`neutral.10.onDone` already unlocks `neutral.11`.** The `unlock` graph believed this all along and
`prereq` — the ladder that actually runs — did not. This just makes the two representations agree.

**One route I tried and backed out.** Giving `wagon.longacre` (N11, mandatory) a second parent of
`count.never.holds` would have closed that chain without making N10 mandatory, and it reads well —
the count does not hold *because* half the wagon is Longacre's. But it merges two connected
components, and `js/game/journal.test.js` asserts STORY §8.5's eleven chains. Merging the wagon
chain into the count chain is a narrative decision about what the Truths tab draws, not a defect
fix, so it is in the judgement list rather than in the data.

Skippable story quests: **19 → 17**. Truths struck by Neutral that the first two campaigns left
standing: 10 → **11** (`cousin` joins the list); `campaign.test.mjs`'s assertion and its name are
updated, and the count feeds STORY §8.5 in task 8.

## 4 — narrative defects (done)

**`sela.was.you`.** The shipped text — *"You were the captive. The confession was the plan."* — is
disprovable from the player's own memory: in L19 they were the **interrogator**, in `wwa.cells`,
with Alder. N14 is a second, later capture, and it is the terminal of the trilogy's most-signposted
chain, so the one Truth the player is most primed to read is the one that is wrong.

I took the audit's diagnosis and not quite its wording:

```json
"sela.was.you": { "text": "The Household wore that face into that cell before you did.", … }
```

The audit proposed *"The Household has worn that face into that cell twice. This time it was you."*
(76 chars, against a 70-char longest in the catalogue). "Before you did" is 59, says the same two
things — it was the Household, and you were not the first — and it is better English for it. It also
supersedes `sela.face` ("Someone wore Sela's face on purpose") cleanly: it answers *who*, and adds
*again*.

The audit's reveal line goes in as written, split to fit the 46-char bubble limit:

```json
["player", "Dob sat in this chair.", "I asked him the questions."]
```

It costs nothing, it answers the question the old Truth left permanently open (who *was* in that
cell in L19), it is a deduction rather than an announcement — the player has just done the same
thing with the same face — and it makes N20 "Ask Dob who Dob is" land on a debt the player already
owes him.

**`light.14.price`.** *"before Thursday"* → *"before the eighth."* STORY §4 gives the week eight
numbered days and no names; it was the only weekday in 702 lines, and its own mirror scene
(`dark.12.price`) already said "before the eighth".

**Three more one-liners from the same section of the audit,** all unambiguous and all in files I own:

- `dark.11`/`dark.12` — the player sells the iron and then offers it. *"Iron for grain. An honest
  weight."* → *"Blackstone coin for Longacre grain. / An honest weight."*
- Two `lad`s fixed the protagonist's gender by accident, in a corpus that is otherwise neutral about
  them across all 702 lines. `["alder", "Good lad. You have a Sanctum voice."]` → *"Good. You have a
  Sanctum voice."* (which is more Whitewall anyway), and Hana's *"A Whitewall lad"* → *"A Whitewall
  hand"*. Hana's was the expensive one — she is the player's mother.
- `neutral.17.table` seated six and named five. Added *"Fen is on the water. He gets told after."* —
  Fen is Household by every other measure, and this is a better Longacre line than cutting the chair.

`tools/lintText.mjs` still passes at 0 warnings, longest line 43/46.

## 5 — item-flow holes (done), and the rule that found a fifth

All four applied as the audit specifies:

| | fix |
|---|---|
| **D20 spends D25's grain** | D13's reward `wheatglass` 8 → **14**. Eight go below in D20, six are left to bake in D25. `dark.25.in` now says so: *"Eight went down the ladder. Six did not." / "Somebody was thinking. Bake them."* |
| **D04 and D05 both spend D03's eels** | D03 catches **11**, hint *"Eight for the Reeve. Three are ours."*, and `dark.03.out` gains *"Eight go up to the Board. / Three stay down here. Do not mention it."* |
| **N25 cooks what it never gives you** | two acquisition steps — `catch` 3 `snowbarb` off `reach.light` wearing the Whitewall face, and `cut` 3 `gravecap` on the heath after the ford swap. The `cut` step is free in walking terms: `heath.crag` is already on the ford→Blackstone line, and it makes "knowing what a town eats is the work" literal rather than assumed |
| **D11 needs iron from a quest that is not its prereq** | `dark.11.load` — *"Weigh and load the yield"*, the step that ought to hand over the goods — now does: `"onDone": [["item", "iron_shard", 5]]` |

**The rule** — `itemFlowErrors(defs)` in `tools/lintQuests.mjs`, an error, with two tests. Each quest
gets a net flow per item: gathers, enemy `drops` and granted rewards in; deliveries and the raw
ingredient a `craft` eats out. A quest may then spend only what it and its **prereq ancestors**
supply, **shared with every other spender whose own prereqs are satisfied by that same set** —
because those can all be finished first. Board posts are excluded as spenders: a standing order is
filled from the player's own stock, which is exactly what their `recover` grant already says.

Counting enemy drops is what makes it usable — without it `dark.24` (kill 20 `mire_rat`, deliver 20
`rat_tail`) and `neutral.02` read as holes when they are self-supplying.

**It found a fifth hole the audit missed, in the first fifteen minutes of the game.** `light.02`
catches five silverling; `light.03` sells all five; `light.04` cooks three. Both are unlocked by
L02 and neither names the other, so it is the D04/D05 shape exactly — and it is worse, because it
is the third and fourth quests a new player ever plays.

Fixed by having Marrin supply her own kitchen rather than by bumping L02's catch: *"Nothing clever.
Just five."* is too good a line to spend on an arithmetic fix, and a cook handing three off the slab
is what a cook does. `light.04.brief` gains `"onDone": [["item", "silverling", 3]]` and one line,
*"Three off the slab. Take them."* It fixes both orderings, where bumping L02 would only have fixed
one.

## 6 — combat (done, in data; three things need `js/sim/tables.js`)

### `soak.mjs` does not see the packs — read this before trusting the balance delta

`tools/soak.mjs` imports `QUESTS` from `js/sim/campaign.js` and simulates the **`work` lists in the
story spec**, never `data/quests/*.json`. So every number it prints was identical before and after
this task, and will stay identical for any pack-only combat edit:

```
TOTAL  7.02 h   Grasp 152   439,068 XP   11,467 mk     (unchanged, and it would be unchanged
§11     7.01 h   Grasp 154   439,271 XP   13,209 mk      whatever I did to the packs)
```

All four of soak's own assertions still pass. **This is a finding in its own right**: the tool that
is supposed to prove the balance closes is measuring a different artefact from the one that ships,
and `lintQuests`' `schoolPayErrors` is currently the only thing comparing the two. Moving the combat
load onto the packs would need `soak.mjs` to read them, which is a real piece of work and outside
this pass — flagged rather than done.

The numbers below are therefore measured directly: `tapsToKill` / `hpMax` / `damageTaken` from
`js/sim/combat.js` against the per-act entry levels dumped from `soak.mjs --report=csv`. Same method
as the audit, so the figures are comparable to §3.

### The delta

| | before | after |
|---|---|---|
| **one-tap kills across the corpus** | **66** | **17** |
| total kills asked | 175 | 146 |
| total taps | 626 | 609 |
| largest single step | **L23 climb, 128 taps, 12 enemies, no checkpoint** | **L23 climb, 80** |

The last row is the shape of the whole change: **the same amount of work, a fifth of the button
presses.** Kills fell 17% while taps fell 3%.

| step | before | after |
|---|---|---|
| `light.23` | one step, 128 taps, 12 enemies | `climb` 80 (hollow ×4 + raider ×4) → **checkpoint** → `gate` 48 (watchman ×4) at `bst.middle` |
| `light.18` | one step, 64 taps, 8 enemies | `crows` 20 (sour_crow ×4) → `fight` 33 (raider ×**3**) — the crows arrive first, as the hint always promised |
| `neutral.21` | one step, 116 taps, 11 enemies **including the trilogy's final boss**, then a 120 s hold | `hold` 60 (watchman ×10) → **checkpoint** → `champion` 56 (champion_3 ×1) |
| `dark.24` | 20 `mire_rat`, **20 kills / 20 taps** | `mire_rat` ×8 + `rat_knot` ×12 — 20 tails still, 32 taps, and three knot packs instead of twenty lone presses |
| `dark.01` | 14 kills / 18 taps, the first thing Dark asks after L23 | 10 kills / 14 taps |
| `dark.23` | 14 kills / 18 taps | 10 kills / 15 taps |
| `neutral.02` | 14 `grain_rat`, **14 kills / 14 taps**, deliver 14 tails | `grain_rat` ×6 + `rat_knot` ×2, deliver 8, Sedge says "Eight" |
| `neutral.18` | 16 kills / 16 taps | 9 kills / 9 taps — it is a spell demonstration, so it should be short |
| `neutral.24` | 16 `grain_rat`, **16 kills / 16 taps** | `grain_rat` ×6 + `blight_boar` ×3 — 9 kills / 18 taps, and a boar in the field is the right fiction for two centuries of buried feed |

`neutral.21` was not on the brief's list but was the largest fight in the game once L23 was split,
and it put the trilogy's final boss behind ten watchmen with no checkpoint. Splitting it makes
`champion_3` a **56-tap boss at 10 bites** — which is what the fight is for.

**S19 `within` 900 → 180 s** (3 game hours, matching the `18–21` window it sits inside) and
**S20 `within` 600 → 90 s** (against a 180 m carry that takes 36). Straight data fix, as specified.

### What could not be done in data, and why

- **`brood_mother` is still 12 taps and 31 bites.** Re-banding it is a `js/sim/tables.js` edit; the
  request is below. Nothing in the pack can fix a boss whose stats are wrong.
- **`dark.21`'s four `raider` are Blackstone's own robed casters** (audit §3.6) — the player retakes
  Blackstone by cutting through the water party. The audit's swap to `hollow` is right, but D21's
  school column in `js/sim/campaign.js` is `['kindle','cull','ward']` and `hollow` is Cull-immune
  while `watchman` never pays Cull, so the swap makes `schoolPayErrors` fire. It needs `campaign.js`
  and the pack to move together. Deferred to a request — and note the linter caught this, which is
  the rule working.
- **Neutral has no band-appropriate trash at all.** By N1 the player is Cull 13 and `power(13)` = 79.5
  one-shots every rodent in the table: `grain_rat` (10 hp), `mire_rat` (52), `rat_knot` (80). The
  only non-`people` enemies that survive a tap at Neutral levels are `creek_crab` (2) and
  `blight_boar` (4), which is why N24 uses boars. **Reshuffling counts cannot fix this** — it is a
  missing tier in `tables.js`, and it is the real cause of the "94 one-tap kills" finding.

## 7 — the walking (two compressions applied, the rest proposed)

Measured the same way the audit did — every step's location chained in the order
`campaign.test.mjs` actually plays the ladder, area centres from `areas.json`, 300 m per game hour.

| | before this pass | after |
|---|---|---|
| critical path | 34,843 m (audit) / **34,352 m** as I measure it today | **32,959 m** |
| pure walking | 116 min | **110 min** |
| **light act 4** | **3,923 m** | **2,530 m** |

### Applied

**Light Act 4 no longer crosses the valley four times.** `light.26` and `light.27` both prereq
`light.18` and were therefore always available the moment the raid ended — but they sat *after*
`light.19`/`light.20` in the pack, and `offered()` returns definition order, so the journal offered
them only once the player had already gone east to the ridge. Moving the two entries to sit directly
after `light.18` groups the eastern work while the player is still standing at the east stands.

**No gate, prereq, step or line changed** — the two quests are still optional, `light.21` still
prereqs only `light.20`, and every act-ordering assertion still holds. It is purely the order the
journal offers them in, and it is worth **1,393 m / 4.6 minutes**, the single largest saving
available anywhere in the corpus.

I deliberately did *not* take the audit's version of this fix, which adds `light.27` to `light.21`'s
prereq. That saves a similar distance but makes an optional quest mandatory, which changes the act's
shape — a decision for Aaron, not a defect fix.

**`sandbox.04` "Kitchen Order"** — giver `hana` → `marrin`, serve `lac.barn` → `wwa.kitchen`. It is
one of only two always-posted board jobs (`BOARD_ALWAYS`), and while `rollBoard` ignores its town
argument it is posted on Whitewall's board every single day and delivers 1,040 m away in Longacre.
This is the repeatable the player will do most, and it was the longest one.

### Searched and rejected

I ran an exhaustive single-quest reposition search over every optional quest in the Light and
Neutral packs, measuring the whole ladder each time. Everything that saved more than ~500 m moved an
act-3 quest behind act-4 quests and broke `assertCampaign`'s act-ordering assertion. `neutral.23` has
three legal positions and the best is worth 488 m at the cost of putting an optional quest *after*
its act's finale. Not worth it. **The Light Act 4 move is the only free one; the rest of the walking
is structural.**

### Costs I knowingly added

`neutral.25`'s two new acquisition steps (task 5) cost **+241 m**: the `catch` at `reach.light` is a
206 m detour off the barn→Whitewall line, and the `cut` on the heath is 36 m off the ford→Blackstone
line. That is the price of the quest being finishable at all, and N25 is the one quest whose walking
the audit says is earned.

### Proposals — not applied, they change an act's shape or add a beat

1. **N23 "The Ford Run" — 2,149 m for two sales, and the single worst stretch in the game.** The
   audit's answer is right: give the Blackstone leg a scene, so the longest walk in the trilogy pays
   off the one quest the player does in their own face. One step and one node:
   ```json
   { "id": "ossa", "do": ["talk", "ossa", "neutral.23.ossa"], "worn": null,
     "text": "Let the Reeve look at your cart" },
   ```
   with a node reusing D04's rate speech from the other side of the table. This adds a story beat
   rather than removing walking, so it is Aaron's call. It does not reduce the 2,149 m by a metre —
   it changes what those seven minutes are *for*.
2. **Fen's ferry as fast travel.** `FERRY = { adjacent: 12, endToEnd: 30, trustedMul: 0.5, swornMul: 0 }`
   is already in `js/sim/tables.js` and **nothing reads it**. Wiring it between `lac.millbridge`,
   `reach.dark` and `reach.light` halves the four worst legs in the game and pays off a character who
   currently exists to be counted at. This is the highest-value walking fix in the corpus by a wide
   margin, and it is a runtime job.
3. **Light Act 4's prereq version** (`light.21` ← `light.20` + `light.27`), as above.
4. **Neutral Acts 2 and 3 are 16.5 and 19.3 game hours of walking each.** Every quest in Act 2 starts
   at the `lac.barn` graft and ends in Whitewall or Blackstone, because the graft hearth is the only
   free one. A second free-graft hearth — or letting the graft be taken anywhere at the cost of ash —
   would cut both acts substantially. That is a systems change, not a content edit.

## 8 — doc ↔ data staleness (done). Data won every time

| where | was | now |
|---|---|---|
| `STORY §5` line 314 | Whitewall, five acts, **24** quests | **28** |
| `STORY §6` line 437 | Blackstone, five acts, **22** quests | **25** |
| `STORY §7` line 554 | Longacre, five acts, **21** quests | **26** |
| `STORY §8.5` prose | "finishing Neutral strikes **seven** more" | **eleven** |
| `STORY §8.5` "Where the strikes land" | Dark strikes 7, Neutral strikes 7 | Dark **9** (7 standing), Neutral **14** (11 standing), with the column split so both readings are on the page |
| `STORY §4` S19 | "must finish before 21:00" | the real `after: 18, before: 21` + `within: 180`, and a note that the window refuses credit rather than failing |
| `STORY §4` S20 | "freshness timer" | `within: 90` against a 36-second carry |
| `STORY §11` | "**7.01 hours**" | kept, plus **"≈8.1 hours with the walking"** and the 32,959 m / 110-minute figure stated explicitly |
| `RUNTIME §4.4` | "when **N24** resolves… `['merge','ansel','kettle','dob']`" | **N20**, `['merge','ansel','dob']`, with a line recording that Kettle was cut in revision 3 |
| `NOTES §5.3` | "L18's cliff is two `hollow` at level 10" | struck; the `raider` fix landed and the cliff survived it. Records what L18 is now |
| `NOTES §8.7.1` | "if ash is scarce, Acts 2 and 3 are a supply problem" | struck; seven of nine grafts are in `lac.barn`, which is free |
| `NOTES §8.7.10` | build list includes `lac.cotts.slate` | replaced with `wwa.board`; nothing in the corpus names `lac.cotts.slate` |

`STORY §11`'s own pacing table and `§8.1–8.3`'s act splits were already correct and are untouched.

The Neutral strike count moved because of task 3, not because the old number was merely misread:
`ansel.you` gaining `cousin` as a second parent adds one standing Truth to the eleven. `STORY §8.5`'s
chain diagram now draws that second edge and explains why it exists.

**The lint rule** — `failRetryErrors(defs)` in `tools/lintQuests.mjs`, an error, plus two tests in
`campaign.test.mjs` (the corpus is clean; the rule catches both shipped shapes). A `fail` term is
allowed only if a retry can clear it:

- `hour` and `worn` clear themselves — the clock moves and a face is re-grafted at will;
- `flag` clears only if the first step's recover unsets it, **and** only once `recover` has a `flag`
  verb. The rule reads `RECOVER.flag`, so it upgrades itself from "no step can unset it" to "put it
  on the first step" the day the verb lands;
- everything else — `damageDealt`, `truth`, `quest`, `item`, `level`, `attunement`, `standing`,
  `mk`, `act`, `campaign`, `day` — is monotonic or unreachable from `recover`, and the message says
  which and why. `item` is the subtle one: `recover` can `grant` but never take away.

---

# Runtime requests — things this pass could not make, with the file and the behaviour

I own `data/**`, four docs and three tools. Everything below needs a file under `js/`, which three
other agents hold concurrently. Each is written so it can be handed over as-is.

### R1 — `js/game/questrunner.js`: re-fire the wait when a window closes under the player

**Behaviour:** in `advance()`, when the current step has an `after`/`before` window, the window has
closed, and the step is incomplete, push `['wait', s.after, s.onDay]` again.

**Why:** `enterStep` fires the wait exactly once, on entry. If the player is late — and after
task 1's fix the *only* way to be late is to dawdle rather than to be geographically doomed —
`stepOpen` silently stops crediting and there is no in-game way back into the window except standing
still for as many game hours as it takes. This makes every timed step self-healing rather than only
the ones entered on time. My `travelErrors` lint proves nobody is *structurally* locked out; this
stops them locking *themselves* out.

### R2 — `js/game/questrunner.js`: reset `damageDealt` per step

**Behaviour:** zero `this.damage` in `enterStep`'s adapter path (better) or in `accept`/`retry`/
`resetStep` (adequate).

**Why:** `QuestRunner.damage` is declared in the constructor and **never written or reset anywhere**;
`grep -rn "\.damage" js/game` returns the declaration, the read in `ctx()`, and a unit test. Once
combat feeds it, `["damageDealt", ">", 0]` means "since the app booted", which by Act 3 is several
hundred kills. Per-step reset makes the term mean what the fiction means ("without touching anyone
*during this*") and makes it retry-safe. I have taken `damageDealt` out of the data for now
(`neutral.15.yard` is `unseen` instead), so this is not blocking — but the term is unusable until it
lands, and `failRetryErrors` will keep rejecting it.

### R3 — `js/game/questrunner.js` + `js/game/world.js`: a `flag` recover verb

**Behaviour:** special-case `['flag', key, value]` in `apply()`'s `recover` branch before the
`this.world[a[0]]` lookup, and add `flag` to `RECOVER` in `tools/lintQuests.mjs` (mine — I will do
that half). Note `js/game/wiring.test.js` parses that table to decide which verbs the world adapter
must implement, so the two have to move together; that coupling is why I could not add it alone.

**Why:** it is the only way a `fail` predicate on a flag can ever be retried out of, since `retry`
runs the first step's `recover` and nothing else. Without it, "if X happens you failed" is
unexpressible in data as anything but an event (`unseen`/`within`). `failRetryErrors` already reads
`RECOVER.flag` and will upgrade its own advice the day this lands.

### R4 — `js/sim/tables.js`: re-band `brood_mother`

```js
brood_mother:{ level: 16, hp: 4200, armour: 30, damage: 62, geo: 'rat',
               xp: { cull: 900, kindle: 300, ward: 120 }, drops: [['brood_sac', 1]], mk: 60, boss: true },
```

**Why:** at Neutral Act 4 levels it is currently **12 taps to kill and 31 hits to gutter you** — the
thing that has eaten two centuries of buried vermin dies in about five seconds and loses the race by
2.6×. The numbers above put it at roughly 62 taps and 10 bites, which is the same shape as
`champion_3` and is what a boss is for. This is the one thing in task 6 I could not fix from data:
no count or composition change can repair a boss whose stats are wrong.

### R5 — `js/sim/tables.js`: `rat_knot` should drop four tails

```js
rat_knot: { …, drops: [['rat_tail', 4]] },
```

**Why:** it is a *knot* — `pack: 4` already says four rats. With it, `dark.24` becomes
`mire_rat ×8 + rat_knot ×3` — twenty tails from **eleven** kills, which is the audit's design and
strictly better than the `mire_rat ×8 + rat_knot ×12` I had to ship to keep the arithmetic honest
against today's table. `neutral.02` becomes `grain_rat ×4 + rat_knot ×1` for eight. **If this lands,
those two `all` lists must move with it** or the quotas over-fill.

### R6 — `js/sim/tables.js` + `js/sim/campaign.js`: `dark.21` kills four of the player's own

`dark.21.climb` is `watchman ×6 + raider ×4`. The player is Blackstone, retaking Blackstone from the
Whitewall garrison — and `raider` is established by `tables.js:13-15` and by L18 as **Blackstone's
own robed black-staff casters**, the water party. No line acknowledges it.

The audit's swap to `hollow` is right (canonically nobody's, established feral by D18, and Cull-immune
so the retake becomes a Kindle/Ward fight — thematically exact for a town whose staffs Torr made).
**I could not make it**: D21's school column in `campaign.js` is `['kindle','cull','ward']`, and with
`raider` gone neither `watchman` nor the Cull-immune `hollow` pays Cull, so `schoolPayErrors` fires.
The pack and the column have to move together.

### R7 — `js/sim/tables.js`: Neutral has no band-appropriate trash

By N1 the player is Cull 13 and `power(13) = 79.5` one-shots **every rodent in the table** —
`grain_rat` (10 hp), `mire_rat` (52), `rat_knot` (80). The only non-`people` enemies that survive a
tap at Neutral levels are `creek_crab` (2 taps) and `blight_boar` (4). This is the actual cause of
the audit's "94 one-tap kills"; I got the corpus from 66 to 17 by substituting and cutting counts,
and the floor is set by the table, not by the packs. A level 10–14 vermin tier would let Neutral's
culls read as work again.

### R8 — `js/game/questrunner.js`: `rollBoard` never gets a town

`rollBoard(town = 'light')` is called from `questrunner.js:48` and `session.js:797` and **neither
passes a town**, so `boardRoll`'s `!d.town || d.town === town` filter drops every `neutral` and
`dark` sandbox entry on every roll, forever: `sandbox.03 .06 .08 .09 .10 .11 .12 .13 .17 .18 .20` —
**11 of 20**. With `BOARD_SIZE` 3 and `BOARD_ALWAYS` `['S02','S04']`, the player sees Fish Order,
Kitchen Order and one of seven Whitewall jobs, every day, for seven hours. STORY §8.4 promises "an
endless tail" from three boards. Roll all three boards on day change and let the board the player
walks up to choose which list to render.

### R9 — `js/game/save.js`: `once` is not persisted

`DialogueBox.seen` is an instance array and is not in the save document, so every `once` node
replays after a reload — Bel re-gives the "getting away with talent" speech, D22's short-rope
farewell replays. **Do this *with* an `unsee(node)` path, not before one:** while `seen` is
unpersisted, a reload is the escape hatch for any future once-node soft-lock, and persisting it
removes that hatch. The corpus is clean today (I re-checked: none of the eight `once` nodes on a
non-final step sits in a quest with a failable step after it), but `abandon` must not be exposed in
the UI without `unsee` — `quest.js:214` deletes the record, `offered()` re-offers, and re-accepting
starts at step 0 with the node burnt.

### R10 — `js/game/towns.js`: the two authored choices have no consequence

`light.ledger.published` (L24) and `neutral.posture.tend/.take/.keep` (N21) are written and read by
nothing. STORY §5 Act 5 promises "a world flag the other two campaigns reference"; §8.3 promises an
epilogue on the faction-select slate. `slate()` reads only `doc.campaign.done`. The cheapest real
payoff is the slate, and STORY §11 already specifies it:

```js
const EPILOGUE = {
  tend: 'They came and looked at it. Both towns. Nobody has dug yet.',
  take: 'Two armies broke on one bridge. The field was ploughed by autumn.',
  keep: 'Nothing happened that year, which took everything you had.',
};
const LEDGER = {
  true:  'The covenant was read out with the numbers in it.',
  false: 'The covenant is still read out the way it always was.',
};
```

Without it the ending of a seven-hour game has no variation at all, and judgement call **3** below
(all three N21 postures play identical steps) has no defence.

### R11 — `tools/soak.mjs` measures the spec, not the packs

Mine to fix, but it is a real piece of work and I have not done it. `soak.mjs` simulates the `work`
lists in `js/sim/campaign.js` and never opens `data/quests/`. Every combat, item and step change in
this pass left its output byte-identical. `lintQuests`' `schoolPayErrors` is currently the only thing
comparing the two representations, and it only checks which *schools* get paid — not counts, not
enemies, not items. Until soak reads the packs, "the economy closes" is a statement about the design
document.

---

# Judgement calls — for Aaron. Nothing below was implemented

Six from the audit, plus one this pass turned up. Each has the cost of both options.

1. **Contractions.** All 705 lines are contraction-free; every apostrophe in the corpus is a
   possessive. `STORY §10`'s own samples are full of them (*"Bell's at six. Don't be late for it."*
   against the shipped *"So it was written, so it is read."*). Three agents adopted the convention
   independently, so it is a house style now. It reads beautifully and makes the world feel old — and
   it **flattens the three faction rhythms §10 specifies**, because Blackstone's "short, flat" and
   Whitewall's "courteous, slightly formal" are indistinguishable when neither may contract.
   *Options:* keep it as house style (free); or let Blackstone and Longacre contract and leave
   **Whitewall as the only town that does not**, which makes the register itself carry the politics —
   very good, and about a two-hour edit across three files. **Recommend the third option.**

2. **D21 is the mirror of L23 at half the difficulty.** After this pass: L23 is 80 taps then 48 with
   a checkpoint at 10 and 8 bites; D21 is 64 taps at **18** bites. The Dark campaign's climactic
   retake of the same staircase is easier and twice as survivable, because the player levelled in
   between. That may be exactly the feeling — *"we held it for sixty years"*, you come back up and it
   is not close — or the Dark finale landing soft. *Options:* accept the asymmetry (free, and it is
   arguably the better story); or re-band D21's enemies, which needs R6 anyway since D21's
   composition is already wrong for other reasons. **Recommend fixing R6 and then deciding, because
   R6 changes D21's numbers regardless.**

3. **All three N21 postures play identical steps.** `NOTES §8.7.8` owns this honestly and argues the
   *choice* is the point. That argument only holds if the choice is shown somewhere, and today it is
   shown nowhere — see R10. *Options:* wire the slate epilogue (R10, small) so the choice at least
   *reads* differently at the end; or let **Keep** actually stop the battle by hand, which is the
   player's most likely expectation and **the single largest content addition remaining in the
   trilogy**. **Recommend R10 now and Keep-stops-the-battle as its own scoped piece of work, or not
   at all.**

4. **`watchman` is doing two jobs.** `CLAUDE.md` binds "the Watch" to the disguise-detecting enemy
   class and `faction.js:82-104` builds the whole suspicion model on `watchmen`; the corpus also uses
   `watchman` as generic town soldier for **both** towns — Blackstone's at the switchback in L23,
   Whitewall's at the same switchback in D21, and both towns' at Millbridge in N21, where the Neutral
   player kills ten of the class their entire campaign taught them to evade. It works (N21's `hold`
   step has no `worn`, so no suspicion accrues). *Options:* split it — one enemy entry and four steps;
   or keep it, on the grounds that killing ten of the thing you spent a campaign hiding from is
   arguably the point of the finale. **Mild preference for keeping it and adding one line of
   dialogue at N21 that says so.**

5. **The graft timer and the eighth-day skip run on different clocks.** `graftDuration = 180 + 30 ×
   glamour` is *real* seconds (~8.5 min at N08); `waitFor` fades up to eight game *days* in a 1.2 s
   crossfade, so the graft survives it. Mechanically fine, but N09 and N11 both graft in `lac.barn`
   and *then* fade to the eighth day, so in fiction the player wears a stolen face for a week. The
   audit suggests moving the graft after the timed step — **that does not work for N09**, whose timed
   `attend` step carries `worn: "light"` and so requires the face already on. *Options:* accept it;
   or have `waitFor` shorten a graft that is running, which is honest and is a runtime change.
   **Low priority either way.**

6. **`unlock` is inert, and this interacts with task 3 — read this one before the others.**
   `['unlock', id]` writes `doc.flags['unlocked.<id>']` and **nothing reads it**; `offered()` gates
   purely on `prereq`. Sixteen quests are unlocked by a quest their prereq does not name, so the two
   representations disagree and the next author will believe the wrong one.
   *Options:* **(a)** delete the `unlock` effects — makes the data honest, changes no gameplay, and is
   a large mechanical edit; **(b)** make `offered()` require `unlocked.<id>` — tightens the ladder,
   changes what is skippable for sixteen quests, and **would have fixed all four of task 3's broken
   Truth chains for free**.
   **On the interaction the brief asks about:** (b) would *not* make my task-3 fix redundant, and the
   two do not conflict. Task 3's `ansel.you → cousin` edge closes the chain topologically for a
   player who skips L16 or D14 in *any* world, including one where (b) has landed and those quests
   are still optional (nothing unlocks them from a quest the player must do — L16 is unlocked by L14,
   which also unlocks the mandatory L15). The two prereq additions (D18 → D19, N10 → N11) *would*
   become redundant under (b), because `dark.18` and `neutral.10` already appear in the `onDone`
   unlock lists of exactly those two quests — which is precisely why I chose them. So: adopt (b) and
   two lines of my task-3 fix become belt-and-braces rather than load-bearing; adopt (a) and all of
   it is required. **Recommend (b)**, and note that it is the only one of these six that pays for
   itself twice.

7. **New — the wagon chain and the count chain want to be one chain.** Task 3's clean multi-path fix
   for `count.never.holds` was to give `wagon.longacre` (N11, mandatory) a second parent of
   `count.never.holds`: the count does not hold *because* half the wagon is Longacre's. It reads
   well and it would have kept `neutral.10` optional. I backed it out because it merges two connected
   components, and `js/game/journal.test.js` asserts STORY §8.5's **eleven** chains. Whether the
   Truths tab should draw ten wider chains or eleven narrower ones is a decision about the shape of
   the payoff screen, not a defect. *Cost of taking it:* one line in `truths.json`, one assertion in
   `journal.test.js`, one number in STORY §8.5, and `neutral.10` goes back to optional.
