# AUDIT_CONTENT — a read-through of the quest corpus as a playthrough

Read-only audit. 99 quests / 399 steps / 175 dialogue nodes / 34 Truths, read in play order across
the Light → Dark → Neutral ladder. Nothing in this audit was edited; this file is the only write.

**Tool baseline reproduced.** `node tools/lintQuests.mjs` → 0 errors, 7 warnings.
`node tools/soak.mjs` → 7.02 h, economy closes, Grasp 152. `node tools/campaign.test.mjs` → 15/15
pass. None of the three models **travel time against the game clock**, **item balances between
quests**, or **taps-to-kill against the player's actual school levels**, and all three of those
produce findings below.

**Two constants everything here is measured against**

| | |
|---|---|
| Player speed | **5 m/s** walk, 8.5 m/s sprint (`js/player.js:44`, ×1.7) |
| Clock | 1 real minute = 1 game hour (`STORY.md` §4) |
| Therefore | **300 m of walking = 1 game hour.** 510 m sprinting = 1 game hour |
| Valley width | Whitewall (−520) to Blackstone (+520) = **1,040 m = 3.5 game hours on foot** |

That last row is the single most load-bearing number in this document. A cross-valley trip costs
15% of a game *day*, and eight of the corpus's fifteen time-gated steps sit at the far end of one.

---

## 1. Soft-locks and dead ends

### 1.1 L22's first step cannot be completed from where L21 leaves you — BLOCKER

**Where:** `data/quests/light.json` → `light.22.night`.

```json
{ "id": "night", "do": ["goto", "wwa.almonry"],
  "after": 1, "before": 4, "unseen": true, ... }
```

L22 is `self-directed` (no `giver`; `STORY.md` §8.1 line 781 confirms this is deliberate), so it is
accepted from the journal, from wherever the player is standing. The natural place is where L21 ends:
`stand.dry` on the Blackstone reach, because L21's last step is `talk fen` after `gather foul_water`
`in: reach.dark`.

The check:

| | |
|---|---|
| `stand.dry` (560, 108) → `wwa.almonry` (−457, −111) | **1,040 m** |
| Walking | 1,040 / 300 = **3.47 game hours** |
| Sprinting the entire way, no stops | 1,040 / 510 = **2.04 game hours** |
| Window `after: 1, before: 4` | **3.00 game hours** |

Accepting fires `['wait', 1, null]` (`js/game/quest.js:125`), the clock fades to 01:00, and the
player then walks into a window that closes at 04:00 while they are still 140 m short. `stepOpen`
(`quest.js:29`) simply stops crediting; nothing re-fires the wait, and `reset` does not call
`enterStep`, so there is no in-game path back to the window except standing still for 21 game
minutes ×21. On top of that, `unseen: true` is live from the moment of accept, so the player is
stealth-failable for the whole 1,040 m cross-valley run in the dark.

**Player consequence:** the campaign's best scene is unenterable on the natural route, and a
detection anywhere on a 17-minute round trip fails it outright. L22 gates L23 and L24, so this kills
the Light campaign and therefore the trilogy.

**Severity:** blocker. **Effort:** one-liner.

**Fix** — split the travel out of the gated step so the wait fires when the player is already in
Whitewall, and take `unseen` off the approach:

```json
{ "id": "home", "do": ["goto", "wwa.market"],
  "text": "Get back inside the walls",
  "recover": [["moveTo", "wwa.market"]] },

{ "id": "night", "do": ["goto", "wwa.almonry"],
  "after": 1, "before": 4,
  "text": "Get into the Almonry after one",
  "recover": [["moveTo", "wwa.market"]] },

{ "id": "ward", "do": ["interact", "wwa.almonry.door", 1], "in": "wwa.almonry",
  "verb": "ward", "unseen": true,
  "text": "Ward the door behind you",
  "recover": [["arm", "wwa.almonry.door"]] },
```

A companion runtime fix is worth having regardless: in `advance()`, when the current step has a
window and the window has closed with the step incomplete, re-push `['wait', s.after, s.onDay]`.
That makes every timed step in the corpus self-healing instead of only the ones you enter on time.

### 1.2 `neutral.06.met` is a monotonic fail flag with no reset — BLOCKER (latent)

**Where:** `data/quests/neutral.json` → `neutral.06.apart`, `"fail": ["flag", "neutral.06.met", true]`.

`NOTES_CONTENT.md` §8.7.7 already records that nothing sets this flag today, so the step is
currently a minute of standing still. That is the *safe* state. The bug is what happens when
someone wires it:

- `fail()` (`quest.js:179`) puts the quest in `failed`.
- The only way out is `retry` (`journalscreen.js:140`), which restarts at step 0 and runs
  `first.recover` only.
- Nothing anywhere clears `doc.flags['neutral.06.met']`. `recover` on the step is
  `[["moveTo","lac.square"]]`.
- So on retry, `advance()` evaluates the fail predicate on the very first event and fails again,
  forever.

N06 is a prereq of N07 (`["all", ["quest","neutral.05","done"], ["quest","neutral.06","done"]]`),
which grants Graft. **Neutral ends permanently at Act 1.**

**Severity:** blocker the moment the mechanic lands. **Effort:** one-liner.

**Fix** — clear the flag in the step's `recover` so both `reset` and `retry` unstick it:

```json
{ "id": "apart", "do": ["survive", "lac.square", 60],
  "fail": ["flag", "neutral.06.met", true],
  "text": "Keep them apart until they are done",
  "hint": "Slowly. A hurried tray moves people about.",
  "recover": [["flag", "neutral.06.met", false], ["moveTo", "lac.square"]] },
```

`recover` entries are dispatched through `this.world[a[0]]?.(...)` (`questrunner.js:103`), so the
world adapter also needs a `flag` handler — or, cheaper, special-case `flag` in `apply()` before the
world lookup. Either way the data above is the right shape.

### 1.3 `neutral.15.yard`'s `damageDealt > 0` is session-cumulative — BLOCKER (latent)

**Where:** `data/quests/neutral.json` → `neutral.15.yard`, `"fail": ["damageDealt", ">", 0]`.

`ctx.damageDealt` reads `QuestRunner.damage` (`questrunner.js:67`). That field is initialised once
in the constructor (`questrunner.js:29`) and **is never written or reset anywhere in the codebase** —
`grep -rn "\.damage" js/game` returns only the declaration, the read, and a unit test.

When combat is wired to increment it, the predicate becomes "has the player dealt any damage since
the app booted". By N15 the player has killed several hundred things. The step fails on its first
tick, retry restarts the quest, and the counter is still non-zero. **Neutral ends permanently at
Act 3.** N15 gates N16 and N24, which gate everything after them.

**Severity:** blocker the moment combat feeds the counter. **Effort:** one-liner (runtime).

**Fix** — zero the counter on `accept`, `retry` and `reset`, and scope it to the tracked quest.
The data does not need to change; add to `QuestRunner`:

```js
accept(id, force = false) { this.damage = 0; return this.emit({ t: 'accept', id, force }); }
retry(id)     { this.damage = 0; return this.emit({ t: 'retry', id }); }
resetStep(id) { this.damage = 0; return this.emit({ t: 'reset', id }); }
```

Better still, reset it in `enterStep`'s adapter path so it is per-*step*, which is what the fiction
means ("cross the yard without touching anyone"), not per-quest.

### 1.4 `once: true` nodes behind failable steps — CLEAN, with one near miss

I swept this exhaustively. `open()` (`js/game/dialogue.js:8`) returns `null` for a seen `once` node,
`DialogueBox.play()` then returns `false`, `onDone` never fires, and no `talk` event is emitted — so
a `talk` step naming an already-seen `once` node can never complete. That is the light.22-class
soft-lock.

There are 30 `once` nodes. Eight of them sit on a non-final step:

| quest | step (index) | node |
|---|---|---|
| light.06 | `read` (2/3) | `light.06.reading` |
| light.09 | `pell` (3/6) | `light.09.pell` |
| light.24 | `read` (2/4) | `light.24.reading` |
| dark.02 | `hear` (3/4) | `dark.02.robe` |
| dark.06 | `wall` (3/5) | `dark.06.wall` |
| dark.12 | `terms` (2/3) | `dark.12.terms` |
| neutral.04 | `why` (4/6) | `neutral.04.post` |
| neutral.17 | `seam` (3/4) | `neutral.17.seam` |

**None of those eight quests contains a failable step** (`unseen`, `fail` or `within`) after the
once-node, so no `retry` can ever replay past one. The light.22 fix held; the corpus is clean.

Two latent hazards worth writing down before someone edits:

1. **If `abandon` is ever exposed in the UI, all eight become traps.** `step()` handles
   `t: 'abandon'` (`quest.js:214`) by deleting the record; `offered()` then re-offers the quest and
   re-accepting starts at step 0 with the once-node burnt. Today `abandon` is unreachable — only
   `resetStep` is wired (`session.js:136`) — so this is a "do not wire abandon without an
   `unsee(node)`" note, not a live bug.
2. **Adding `unseen` to `neutral.04.boundary` or `light.09.carry` would create the bug.** Both are
   plausible future edits and both sit after a once-node.

### 1.5 `once` is not persisted, so every once-node replays after a reload — small

`DialogueBox.seen` is an instance array (`dialoguebox.js:23`) fed into `ctx.seen`
(`questrunner.js:69`). It is not in the save document — `grep -n "seen" js/game/save.js` is empty.
Quit and reload and Bel gives the "you have been getting away with talent" speech again, Pell
re-tells the schism, and D22's short-rope farewell replays.

**Player consequence:** the trilogy's most deliberately once-only moments become repeatable.
**Severity:** small. **Effort:** one-liner — add `seen: []` to the save doc and back
`DialogueBox.seen` onto it. (Note the perverse upside: while it stays unpersisted, a reload is the
escape hatch for any future once-node soft-lock. Fixing persistence removes that escape hatch, so
do it *with* an `unsee` path, not before one.)

### 1.6 The `unlock` effect is inert — informational, not a defect

`['unlock', id]` writes `doc.flags['unlocked.<id>']` (`questrunner.js:98`) and **nothing reads it** —
`grep -rn "unlocked\." js/` returns only the writer. `offered()` gates purely on `prereq`. So the
onDone unlock graph is documentation, and `prereq` is the real ladder.

I verified the real ladder separately: from `light.01`, `dark.01` and `neutral.01`, **every story
quest in each campaign is reachable via prereqs**, and the only terminal quest is `neutral.21`
(which correctly sets `trilogy.done`). No orphans, no dead ends in the graph itself.

Sixteen quests are unlocked by a quest their prereq does not name (full list in the appendix of my
working notes; e.g. `light.12` is unlocked by both L07 and L08 but prereqs only L07). That is
harmless while `unlock` is inert, but it means the two representations disagree and one of them will
be believed by the next author. Either delete the `unlock` effects or make `offered()` require
`unlocked.<id>` — the second choice would *change gameplay* (see §2.3), so this is a decision, not a
cleanup.

---

## 2. Ordering and gating errors

### 2.1 D20 spends the grain D25 needs to bake — medium

**Where:** `data/quests/dark.json` → `dark.20.carry` and `dark.25.bake`.

- D13 reward grants `wheatglass ×8`.
- `dark.20.carry` = `["deliver", "wheatglass", 8, "bst.levels"]` — delivers all eight below.
- D20's `onDone` unlocks D25. `dark.25.bake` = `["gather", "cooked_wheatglass", 6]` via craft, i.e.
  it needs **six raw wheatglass the player just gave away**.

Sell-path deliveries demonstrably consume (`session.js:663`, `addItem(this.doc, line.id, -line.n)`).
The non-sell `deliver` path is not implemented yet, but "carry the grain below" must consume or the
step is meaningless.

**Player consequence:** the player reaches Blackstone's deepest gallery, is told to bake, and has no
flour. Recovery is a 1,100 m round trip to Longacre to glean six `wheatglass` (FORAGE.longacre,
tier 1) — 7 game hours — or noticing that `reset` grants them via `recover`.

**Severity:** medium. **Effort:** one-liner.

**Fix** — bump D13's reward so eight go below and six remain, and say so in D25's brief:

```json
"reward": { "items": [["wheatglass", 14]] },
```

in `dark.13`, and change `dark.25.in`'s middle line to make the arithmetic diegetic:

```json
["sela", "Eight went down the ladder. Six did not.", "Somebody was thinking. Bake them."],
```

### 2.2 N25 asks the player to cook two ingredients it never gives them — medium

**Where:** `data/quests/neutral.json` → `neutral.25.supper` and `neutral.25.pot`.

```json
{ "id": "supper", "do": ["gather", "cooked_snowbarb", 3], "via": "craft", "in": "wwa.kitchen", ... }
{ "id": "pot",    "do": ["gather", "cooked_gravecap", 3], "via": "craft", "in": "bst.kitchen", ... }
```

There is no step, reward or prior quest that grants `snowbarb` or `gravecap`. `snowbarb` is
`CATCH.whitewall`, `req: 9` Line, weight 14 of 100 — the third-rarest thing in Whitewall's water. To
cook three the player must fish Whitewall's reach for roughly twenty catches, and nothing in the
quest text says so. `gravecap` (`FORAGE.blackstone`, tier 2) is easier but equally unsignposted.

Every other cook-and-serve quest in the corpus is well-formed — L26 and L28 both `catch → cook →
carry`; D10 `scrape → cook → serve`. N25 is the one that skipped the acquisition step, and it is the
campaign's marquee exercise.

**Severity:** medium (silent dead end; the player will assume the step is bugged).
**Effort:** one-liner.

**Fix** — add the two acquisition steps, which also makes the "knowing what a town eats is the work"
theme literal:

```json
{ "id": "catch", "do": ["gather", "snowbarb", 3], "in": "reach.light", "worn": "light",
  "text": "Take three snowbarb off the Whitewall reach",
  "hint": "Marrin will not cook with anything else.",
  "recover": [["moveTo", "wwa.fishsteps"]] },
```
before `supper`, and

```json
{ "id": "cut", "do": ["gather", "gravecap", 3], "in": "heath", "worn": "dark",
  "text": "Cut three caps off the heath on the way",
  "recover": [["moveTo", "heath.crag"]] },
```
before `pot`. (Placing the `cut` step after `swap` costs nothing in walking — `heath.crag` is
already on the ford→Blackstone line.)

### 2.3 D04 and D05 both spend D03's eight eels — medium

**Where:** `dark.03` unlocks **both** `dark.04` and `dark.05`.

- `dark.03.fish` → `["gather", "blackeel", 8]`.
- `dark.04.sell` → `["deliver", "blackeel", 8, "ossa"]` `via: "sell"` — consumes all eight.
- `dark.05.cook` → `["gather", "cooked_blackeel", 3]` via craft — needs three raw eels.

Do D04 first (the obvious order: Ossa is on the way up) and D05 has nothing to cook. The escape is
another night's fishing on `reach.dark` after 21:00, or `reset`.

**Severity:** medium. **Effort:** one-liner.

**Fix** — D03 catches eleven, and Sela says why:

```json
{ "id": "fish", "do": ["gather", "blackeel", 11], "in": "reach.dark",
  "after": 21, "before": 5,
  "text": "Take eleven eels off the reach",
  "hint": "Eight for the Reeve. Three are ours.",
  "recover": [["moveTo", "stand.dry"]] },
```

and add to `dark.03.out`:

```json
["sela", "Eight go up to the Board.", "Three stay down here. Do not mention it."],
```

which is also a better Blackstone line than the one it follows.

### 2.4 D11 requires iron the player may never have been asked to cut — medium

**Where:** `dark.11.sell` → `["deliver", "iron_shard", 5, "wick_ww"]`.

`iron_shard ×5` comes from `dark.07.cut`. But D11's prereq is `["quest","dark.09","done"]` only, and
the path D06 → D08 → D09 → D11 never touches D07. A player who takes that path arrives at the
Longacre cross with nothing to sell and no instruction to mine — `ROCK.iron_glass` needs Setting 5
(they have 11) but nothing has ever told them iron exists in the world as a node.

D11's own step before the sale is `["interact", "bst.board.yield", 3]` — "Weigh and load the yield" —
which is exactly the step that ought to hand over the goods and does not.

**Severity:** medium. **Effort:** one-liner.

**Fix** — make the load step grant the cargo:

```json
{ "id": "load", "do": ["interact", "bst.board.yield", 3], "in": "bst.board",
  "verb": "barter",
  "text": "Weigh and load the yield",
  "onDone": [["item", "iron_shard", 5]],
  "recover": [["arm", "bst.board.yield"], ["moveTo", "bst.board"]] },
```

(`quest.js:167` already pushes step-level `onDone` effects, and `questrunner.apply` handles
`['item', id, n]`.)

### 2.5 Two act exits are skippable, so `campaign.act` never reaches 3 — small

`light.12` sets `["act", 3]` and `dark.10` sets `["act", 3]`. Neither is named in any other quest's
prereq:

- `light.13`'s prereq is `light.11`, not `light.12`.
- `dark.11`'s prereq is `dark.09`, not `dark.10`.

So a player on the short path never triggers Act 3 in either campaign, and `light.act2.done` /
`dark.act2.done` stay false forever. Every other act exit (L06, L17, L21, D06, D15, D19, N07, N11,
N15, N20) is correctly load-bearing.

**Severity:** small (nothing reads `act` or those flags today — see §6.6 — but the act counter is on
the journal and in the save).

**Fix** — add the finale to the next quest's prereq:

```json
"prereq": ["all", ["quest", "light.11", "done"], ["quest", "light.12", "done"]],
```
in `light.13`, and

```json
"prereq": ["all", ["quest", "dark.09", "done"], ["quest", "dark.10", "done"]],
```
in `dark.11`.

### 2.6 Eleven of twenty board quests can never appear — medium

`QuestRunner.rollBoard(town = 'light')` (`questrunner.js:141`) is called from exactly two places
(`questrunner.js:48` on load, `session.js:797` on day roll) and **neither passes a town**.
`boardRoll` filters `!d.town || d.town === town` (`quest.js:268`), so every sandbox entry tagged
`neutral` or `dark` is filtered out on every roll, every day, forever:

`sandbox.03, .06, .08, .09, .10, .11, .12, .13, .17, .18, .20` — 11 of 20.

Worse, `BOARD_SIZE` is 3 and `BOARD_ALWAYS` is `['S02','S04']`, so two of the three slots are fixed.
**The player sees Fish Order, Kitchen Order, and one of seven Whitewall jobs, every day, for seven
hours of play.** `STORY.md` §8.4 promises "an endless tail" from three boards.

**Severity:** medium. **Effort:** one-liner.

**Fix** — roll per town and store per town:

```js
rollBoard(town = this.doc.campaign?.current === 'dark' ? 'dark'
              : this.doc.campaign?.current === 'neutral' ? 'neutral' : 'light') { ... }
```

or, better, roll all three boards on day change and let the board the player walks up to choose which
list to render.

### 2.7 Things that gate correctly (checks run, no finding)

Recorded so nobody re-derives them.

- **Graft ash supply is fine, despite `NOTES_CONTENT.md` §8.7.1.** A graft costs 1 `hearth_ash`
  unless `atHomeHearth()` (`session.js:467,576` — any `hearth: true` area with `town: 'neutral'`,
  i.e. `lac.barn`). Of the nine graft steps, **seven are `"in": "lac.barn"`** and therefore free.
  Only `neutral.13.graft` (`heath.blackspan`) and `neutral.25.swap` (`heath.ford`) cost ash, and the
  N07 + N12 rewards grant 5. Comfortable margin.
- **Nothing rots.** `freshness()` (`economy.js:14`) floors at 0.5 and only touches price. Grain held
  from D13 to D25 loses value, never quantity.
- **No school-level gate is unreachable.** `ROCK.iron_glass` req 5 vs Setting 7 at D2;
  `ROCK.obsidian` req 7 vs Setting 11 at D4 and 13 at N3; `CATCH.ford_eel` req 7 vs Line 15 at N1.
  All comfortable. `soak.mjs`'s own assertion "no Grasp or school gate on any act exit: PASS" holds.
- **Timed steps other than L22 are reachable.** Assuming acceptance happens at the giver
  (`RUNTIME.md` §1.5's offer diagram has a "giver out of range" transition), every other windowed
  step's travel fits: L06 ≤0.67 gh in a 2 h window, L11 0.64/4, D06 0.19/1, L23 3.1/8, D03 D16 D21
  L05 all ≪8, N11 1.82/4, N23 0.62/3.
- **N09 is the one that is merely tight, not broken.** `neutral.09.attend` is entered from
  `lac.barn` (the graft step): 521 m = **1.74 of its 2.00 game-hour window**. 87% of the window is
  consumed walking before the player does anything, and the whole thing rides on an `onDay: 8` gate
  they get one shot at per eight days. Widening it to `"after": 11, "before": 14` costs nothing and
  removes the risk.

---

## 3. Difficulty cliffs and level mismatches

Method: player school levels per act taken from `tools/soak.mjs`'s own per-act `levels` record
(dumped by instrumenting a copy), applied to `tapsToKill`, `hpMax` and `damageTaken` from
`js/sim/combat.js`. "Taps" is casts-to-kill at the better of Kindle/Cull; "bites" is enemy hits to
gutter the player.

### 3.1 L23 is the difficulty wall of the trilogy, and it is not the one that was flagged — medium

**Where:** `light.23.climb`.

```json
"all": [["kill","watchman",4], ["kill","hollow",4], ["kill","raider",4]], "in": "bst.switchback"
```

Player entering Light Act 5: Kindle 5, Ward 7, Cull 7, Hearth 6 → `hpMax` 156.

| enemy | level | taps each | × 4 | bites to gutter you |
|---|---|---|---|---|
| watchman | 12 | 12 | 48 | **8** |
| hollow | 10 (Cull-immune) | 13 | 52 | 10 |
| raider | 8 | 7 | 28 | 12 |
| | | | **128 taps** | |

**128 casts in one step, twelve enemies, no checkpoint**, at 0.40 s GCD and Focus-limited — then
`goto bst.keep`, then `survive bst.bailey 120`. Eight watchman connections end the run. The player is
level 5 in their offensive school fighting a level-12 enemy.

This is 2× L18 and it is the largest single combat step in the corpus.

**Severity:** medium (it is the campaign climax; it is *meant* to be hard — but 128 taps with no
checkpoint after a 924 m night march is a reload loop, not a climax).
**Effort:** one-liner.

**Fix** — split the ladder into two steps so the switchback has a landing, and drop the watchmen to
the top:

```json
{ "id": "climb",
  "all": [["kill", "hollow", 4], ["kill", "raider", 4]],
  "in": "bst.switchback",
  "text": "Fight up the switchback",
  "hint": "Lancet windows above you. Keep to the wall.",
  "recover": [["moveTo", "bst.westgate"], ["respawn", "hollow", 4], ["respawn", "raider", 4]] },

{ "id": "gate", "do": ["kill", "watchman", 4], "in": "bst.middle",
  "text": "Break the gate guard",
  "recover": [["moveTo", "bst.middle"], ["respawn", "watchman", 4]] },
```

80 taps then 48, with a checkpoint between them.

### 3.2 L18 is a real cliff, confirmed — small

**Where:** `light.18.fight`, `["kill","raider",4]` + `["kill","sour_crow",4]` in `reach.east`.

Player entering Light Act 4: Kindle 3, Ward 6, Cull 4 → `hpMax` 138.

- raider (level 8): **11 taps each**, 44 total, and **10 raider hits gutter you**.
- sour_crow (level 5): 5 taps each, 20 total.
- 64 taps, 8 enemies, one step, then `survive reach.east 60`.

The immediately preceding fight the player has had is `light.11.walk`'s four `rat_knot` at **4 taps
each** (16 taps total). So the step function is 16 → 64 taps and 5 → 11 taps per enemy, in one quest.

**`NOTES_CONTENT.md` §5.3 is stale on the cause.** It says "two `hollow` at level 10". The pack no
longer uses `hollow` in L18 — `js/sim/tables.js:15` records that a purpose-built `raider` at level 8
was added for exactly this reason. **The fix landed and the cliff survived it**, because 4 raiders is
still 44 taps.

**Severity:** small (it is an intended spike and it is survivable). **Effort:** one-liner.

**Fix** — three raiders, not four, and let the crows arrive first as the hint already promises:

```json
{ "id": "crows", "do": ["kill", "sour_crow", 4], "in": "reach.east",
  "text": "Break the crows off the stands",
  "recover": [["moveTo", "stand.east"], ["respawn", "sour_crow", 4]] },

{ "id": "fight", "do": ["kill", "raider", 3], "in": "reach.east",
  "text": "Drive the staffs off",
  "hint": "Their bolt is slow. Move between the stands.",
  "recover": [["moveTo", "stand.east"], ["respawn", "raider", 3]] },
```

### 3.3 D24 is confirmed exactly as suspected: tedium, not difficulty — medium

**Where:** `dark.24.cull`, `["kill","mire_rat",20]` in `bst.levels`.

Player at Dark Act 3: Kindle 10 → `power(10)` = 61.5, `mire_rat` armour 6 → 58 per tap vs 52 hp.
**One tap each. Twenty times.** `mire_rat` deals 10.3 raw; at Ward 11 that is 47 hits to gutter the
player. There is no threat and no decision — it is twenty button presses.

**Severity:** medium (it is the most joyless five minutes in Dark). **Effort:** one-liner.

**Fix** — keep the fiction (Blackstone posts a rate for vermin) and make the twenty tails a *rate*
problem rather than a kill count, which is also what D24's dialogue is about:

```json
{ "id": "cull", "all": [["kill", "mire_rat", 8], ["kill", "rat_knot", 3]], "in": "bst.levels",
  "text": "Cull in the workings until you have twenty tails",
  "hint": "The sumps on the third level. Knots come up with them.",
  "recover": [["moveTo", "bst.levels"], ["respawn", "mire_rat", 8], ["respawn", "rat_knot", 3]] },
```

with `rat_knot` (`pack: 4`) dropping the tails that make the count. 8 + 12 = 20 tails, 11 kills, and
the knots give it teeth.

### 3.4 There is no difficulty curve after Light Act 5 — there is a kill-count curve — medium

The general form of §3.3. Sweeping every kill step:

| step | kills asked | taps to clear all of them |
|---|---|---|
| `dark.01.clear` | 14 | **18** |
| `dark.23.clear` | 14 | **18** |
| `dark.24.cull` | 20 | **20** |
| `dark.19.clear` | 12 | 28 |
| `neutral.02.cull` | 14 | **14** |
| `neutral.18.voles` | 16 | **16** |
| `neutral.24.clear` | 16 | **16** |
| `neutral.24.mother` (boss) | 1 | **12** |

**Ninety-four one-tap kills across Dark and Neutral.** The counts rise from 8 (L01) to 20 (D24) while
the effort per kill falls to one press. Dark's opening quest — the first thing the player does in a
new campaign, immediately after the 128-tap L23 — is fourteen kills that cost eighteen taps.

**`neutral.24.mother` deserves its own line.** `brood_mother` is level 6, hp 900, armour 12, damage
26. At Neutral Act 4 (Cull 14, Ward 16) it is **12 taps to kill and needs 31 hits to gutter you** —
about five seconds. `NOTES_CONTENT.md` §8.7.5 predicted this; the arithmetic confirms it. The thing
that has eaten two hundred years of buried vermin dies faster than four crabs did in L27.

**Severity:** medium. **Effort:** medium (it is a re-band, not an edit).

**Fix** — two moves, both cheap:

1. Re-band `brood_mother` in `js/sim/tables.js` to sit where it is fought:
   ```js
   brood_mother:{ level: 16, hp: 4200, armour: 30, damage: 62, geo: 'rat',
                  xp: { cull: 900, kindle: 300, ward: 120 }, drops: [['brood_sac', 1]], mk: 60, boss: true },
   ```
   That is 62 taps and 10 bites at N4 levels — the same shape as `champion_3`, which is right for a
   boss.
2. Halve the trash counts in the Dark/Neutral culls and substitute the next tier up, as in §3.3.
   `neutral.02` should not be fourteen `grain_rat` at Cull 13; six `rat_knot` reads the same in
   fiction ("rodents in the seed store") and costs the same time with three times the interest.

### 3.5 D21 is the mirror of L23 and it is a walkover — informational

`dark.21.climb` is the same switchback, the same beat, the same "no checkpoint, then 120 s hold".
At Dark Act 5 levels (Kindle 11, Ward 13):

| | L23 | D21 |
|---|---|---|
| taps in the climb step | **128** | **64** |
| enemy hits to gutter you | 8 | 18 |

The scene the whole Dark campaign is built to deliver is half as hard and twice as survivable as its
Light counterpart. That is a **judgement call, not a defect** — see §8.

### 3.6 D21 has the player killing four of their own — small (also a continuity error)

`dark.21.climb` = `["kill","watchman",6]` + `["kill","raider",4]`. The player is Blackstone, retaking
Blackstone from the Whitewall garrison. `watchman` is the garrison, correct. But `raider` is
established by `tables.js:13-15` and by L18 as **Blackstone's own robed black-staff casters** — the
water party. There is no line acknowledging that the player is cutting through their own townsfolk.

**Fix** — swap them for the enemy that is canonically nobody's:

```json
"all": [["kill", "watchman", 6], ["kill", "hollow", 4]],
```

`hollow` is already established as feral (D18 "clear what is living up there now") and is Cull-immune,
which makes the retake a Kindle/Ward fight — thematically right for a town whose staffs Torr made.

---

## 4. Tedium and pacing

### 4.1 The headline number: 116 minutes of walking on the critical path

Chaining every step's location in play order across the 79 story quests (using `in`, then the `goto`
/ `deliver` / `escort` target, then the `recover` `moveTo` anchor) gives **34,843 m** on the critical
path. At 5 m/s that is **116 minutes of pure walking**.

`soak.mjs`'s overhead model allows `2 × 80 / 5 = 32 s` of walking per job (`soak.mjs:53`) — about
**50 minutes** across 94 jobs. **The soak understates travel by roughly a factor of two**, and
`STORY.md` §11's headline "7.01 hours" should be read as **≈8.2 hours**, with the extra hour and a
bit being walking that nobody chose.

### 4.2 Where it lands, by act

| act | walking | soak's act length | share |
|---|---|---|---|
| **neutral act 2** | **18.2 min** (5,467 m) | 32 min | **57%** |
| **neutral act 3** | **17.0 min** (5,109 m) | 34 min | **50%** |
| light act 4 | 13.1 min (3,923 m) | 32 min | 41% |
| light act 5 | 12.2 min (3,648 m) | 25 min | 49% |
| dark act 3 | 7.9 min | 32 min | 25% |
| light act 2 / act 3 | 6.8 / 6.7 min | | |
| neutral act 1 | 6.0 min over 8 quests | 35 min | 17% |
| light act 1 | **2.2 min** over 6 quests | 24 min | 9% |

Light Act 1 is exemplary — six quests inside one town, 672 m total. Neutral Acts 2 and 3 are the
opposite: more than half the elapsed time is holding forward.

### 4.3 The worst twenty minutes in the game: Neutral Act 2

**N08 → N23 → N09 → N10 → N11.** Five quests, 5,467 m, **18.2 minutes of walking in a 32-minute
act**, and the act's content in that time is: buy something badly, sell eight eels twice, count four
crates, load four crates. Every quest in the act starts at `lac.barn` (the graft) and ends at
Whitewall or Blackstone.

The single worst quest is **N23 "The Ford Run" — 2,149 m / 7.2 minutes of walking across 5 steps.**
The steps are: talk to Fen, catch 8 eels, sell 4 in Whitewall (554 m away), sell 4 in Blackstone
(1,041 m further), walk back to Fen. There is no encounter, no choice, no dialogue beat between the
two sales. It is the second-longest walk in the game and its entire mechanical content is two
transactions.

**Runner-up: N25 "Both Kitchens" — 2,157 m / 7.2 minutes over 8 steps**, and `STORY.md` §7 calls it
"the same day". It is: 7.2 game hours of walking on its own, plus two cooks and two services. It
does at least *use* the crossing — the whole point is that the Household knows both towns — so its
walking is earned in a way N23's is not.

**Third: Light Act 4's L20 → L26 → L21 → L22 chain, 4,325 m / 14.4 minutes across four quests.**
L20 sends you 1,051 m east to the ridge; L26 sends you 1,086 m back west for three fish; L21 sends
you 841 m east again; L22 sends you 1,001 m west again. **Four cross-valley traversals in four
quests, each one undoing the last.**

**Severity:** medium (it is the difference between a 7-hour game and an 8-hour one, and the extra
hour is the least interesting hour). **Effort:** medium.

**Fixes, in order of value for effort:**

1. **Re-order Light Act 4 so the two eastern quests are adjacent.** L20 (ridge), L21 (Blackstone
   reach) and L27 (east stands) are all east; L26 (fish steps → kitchen → east stands) is a
   west-then-east round trip inserted between them. Changing L21's prereq from `light.20` to
   `["all", ["quest","light.20","done"], ["quest","light.27","done"]]` and L26's to `light.21` groups
   the eastern work and saves ~1,100 m. No fiction changes.
2. **Give N23 something to do at the far end.** It is the only Neutral quest done in the player's
   own face and that is the point; make the point *cost* something. One extra step at the Blackstone
   leg — Ossa noticing the cart is Longacre's and the player having to hold their nerve — turns 7
   minutes of holding forward into a scene:
   ```json
   { "id": "ossa", "do": ["talk", "ossa", "neutral.23.ossa"], "worn": null,
     "text": "Let the Reeve look at your cart" },
   ```
   with a node that reuses D04's rate speech from the other side.
3. **Fen's ferry should be travel.** `light.21.in` has Fen say "I will row you down past the gorge";
   `FERRY = { adjacent: 12, endToEnd: 30, trustedMul: 0.5, swornMul: 0 }` already exists in
   `tables.js` and nothing uses it. Wiring the ferry as a fast-travel between `lac.millbridge`,
   `reach.dark` and `reach.light` cuts the four worst legs in half and pays off a character who
   currently exists to be counted at.
4. **`sandbox.04` "Kitchen Order" is always posted on the Whitewall board and delivers to
   `lac.barn`.** That is a 1,040 m round trip, every day, on the one repeatable the player will do
   most. Change its `serve` target to `wwa.kitchen` and its giver from `hana` to `marrin`, and let
   the Longacre board's copy deliver to the barn once §2.6 is fixed.

### 4.4 Fetch-and-return chains

Counting consecutive steps whose only verb is `gather`/`deliver`/`interact` with a `talk` at each
end: the corpus is generally disciplined — most quests are 3–6 steps with one location change. The
exceptions are `light.08` (three `gather weed` steps at three different stands, 632 m, no dialogue
between them) and `neutral.16` (dig 6 → gather 6 → interact 3, all in the same 34×34 m field, which
reads as one action stretched into three).

`light.08` is also fully skippable (§4.5), so it is the cheapest cut in the game if Act 2 needs
trimming.

### 4.5 Nineteen of 79 story quests are skippable, and four of them carry Truths

No other quest's prereq names them:

`light.08, light.12, light.16, light.25, light.26, light.27, light.28, dark.10, dark.14, dark.18,
dark.23, dark.24, dark.25, neutral.10, neutral.22, neutral.23, neutral.24, neutral.25, neutral.26`

Twelve of the nineteen are the revision-3 additions, which is by design. But **four carry Truths that
are load-bearing links in cross-campaign chains** — see §6.2, where this becomes a narrative finding
rather than a pacing one.

---

## 5. World contract — the build brief

This is the complete set of world objects the corpus names. It is grouped by town and is a
checklist.

**Current state of the world: none of this exists.** `js/main.js:96`'s `targets()` returns six
stand-in wandering NPCs answering to `bel, rell, wick_ww, marrin, sedge, alder` and nothing else.
There is no interactable-prop system, no `arm`/`moveTo`/`grant`/`respawn` world handler (so every
`recover` in the corpus is currently a no-op — `questrunner.js:103` looks them up on `this.world`,
which has `rev`, `groundAt`, `walkStep`, `targets`, `doorIndex`, `jumpDoor`). The world is the
generic three-district scene document from `forge_test`: houses, towers, wall runs, masses.

`NOTES_CONTENT.md` §5.7, §6.6.6 and §8.7.10 each list a partial set. This is the merged, verified
list extracted from the data, with the instance counts the steps actually demand.

### Areas — all 100 in `data/areas.json` are referenced correctly

Every `goto`, `survive`, step `in`, `deliver`-to-area and `escort` path resolves to an entry in
`areas.json`. **Zero missing areas.** The contract is internally consistent; it is entirely unbuilt.

30 areas are `goto`/`survive` targets and therefore need to be enterable and named:

- **Whitewall** `wwa.almonry` `wwa.cells` `wwa.market` `wwa.northgate` `wwa.temple` `reach.light`
- **Longacre** `lac.ashgate` `lac.barn` `lac.cotts` `lac.cross` `lac.mill` `lac.millbridge`
  `lac.moot` `lac.square` `lac.westfield`
- **Blackstone** `bst.alleys` `bst.bailey` `bst.board` `bst.intake` `bst.keep` `bst.kitchen`
  `bst.levels` `bst.northgate` `reach.dark` `ridge.dark`
- **Open world** `heath.blackspan` `heath.ford` `march.west` `reach.east` `road.spur.light`

### Interact props — 47 ids

`interact` credits on `event.id === o.id` (`quest.js:54`), so each of these is a literal prop id the
world must publish through `world.targets()`. "Needs N" is the highest count any single step asks
for, i.e. how many *distinct instances* must be placed and separately consumable.

#### WHITEWALL — 14 props

| host area | prop id | needs | school verb | used by |
|---|---|---|---|---|
| `wwa` | `wwa.fence.panel` | 2 | mend | `neutral.15.panel`, `sandbox.05.mend` |
| `wwa` | `wwa.lamp` | **9** | kindle | `sandbox.19.round` (nine, district-wide, timed) |
| `wwa.granary` | `wwa.granary.lamp` | 1 | kindle | `light.01.lamp` — **the first interact in the game** |
| `wwa.temple` | `wwa.temple.font` | **4** | —, ward, barter | `light.06.cord`, `light.09.lift`, `neutral.09.count` |
| `wwa.temple` | `wwa.temple.hand` | 3 | — | `light.04.feed` (three temple hands to feed) |
| `wwa.market` | `wwa.market.stall` | 2 | barter | `neutral.08.trade`, `sandbox.16.west` |
| `wwa.market` | `wwa.market.kerb` | **6** | setting | `sandbox.07.set` |
| `wwa.almonry` | `wwa.almonry.shelf` | **4** | setting, barter | `light.09.shelf`, `light.10.shelf` |
| `wwa.almonry` | `wwa.almonry.tally` | 1 | — | `light.10.tally` |
| `wwa.almonry` | `wwa.almonry.door` | 1 | ward | `light.22.ward` |
| `wwa.almonry` | `wwa.almonry.ledger` | **4** | — | `light.22.read` |
| `wwa.almonry` | `wwa.almonry.lock` | 1 | mend | `light.22.lock` |
| `wwa.cells` | `wwa.cells.hinge` | 3 | mend | `neutral.15.hinge` |
| `reach.light` | `reach.light.stand` | **6** | forage | `light.07.count` — six dry stands, spring to low water |
| `reach.east` | `reach.east.barrel` | **6** | ward | `dark.16.fill` |

**Missing from `areas.json`: the Whitewall notice board.** `sandbox.01/.05/.07/.15/.19` have
`giver: "board_ww"` and `sandbox.01.claim` delivers to `board_ww`, which is neither an NPC nor an
area (this is 5 of the 7 lint warnings, and the delivery one **is** a real gap). `STORY.md` §8.4
places it in Sanctum Yard. Add:

```json
{ "id": "wwa.board", "town": "light", "parent": "wwa.market", "label": "the Yard post",
  "shape": { "k": "circle", "x": -536, "z": -46, "r": 5 } },
```

and retarget `sandbox.01.claim` to `["deliver","rat_tail",6,"wwa.board"]`. Longacre's board is
`lac.cross` (already an area) and Blackstone's is `bst.board` (already an area), so only Whitewall's
is missing.

#### LONGACRE — 15 props

| host area | prop id | needs | school verb | used by |
|---|---|---|---|---|
| `lac.cross` | `lac.cross.post` | **4** | barter, glamour | `light.16.read`, `dark.14.watch`, `neutral.04.chalk`, `neutral.19.post`, `sandbox.16.middle` — **the most-used prop in the game (5 quests, 3 campaigns)** |
| `lac.leat` | `lac.leat` | **6** | —, forage | `light.15.chores`, `dark.13.leat`, `sandbox.10.clear` |
| `lac.mill` | `lac.mill.crate` | **4** | barter, setting | `light.15.chores`, `light.17.count`, `dark.13.crate`, `dark.15.count`, `neutral.10.off` |
| `lac.mill` | `lac.mill.hatch` | 2 | setting | `neutral.01.open` — hatch, then leat gate |
| `lac.mill` | `lac.mill.hurdle` | 3 | mend | `dark.13.hurdle` |
| `lac.millbridge` | `lac.millbridge.crate` | **4** | barter | `light.17.load`, `dark.15.load`, `neutral.10.load`, `sandbox.18.load` |
| `lac.barn` | `lac.barn.hearth` | 2 | hearth | `neutral.07.ash`, `neutral.12.burn` — **also the free-graft hearth (`session.js:467`)** |
| `lac.barn` | `lac.barn.table` | **4** | hearth | `neutral.22.lay` — four long tables |
| `lac.barn` | `lac.barn.crate` | **4** | barter | `neutral.11.load` |
| `lac.moot` | `lac.moot.ledger` | **4** | barter | `neutral.19.ledger` |
| `lac.stables` | `lac.stables.plot` | **4** | setting | `sandbox.08.raise` |
| `lac.westfield` | `lac.westfield.spit` | **6** | forage, setting | `neutral.02.dig`, `neutral.16.dig` |
| `lac.westfield` | `lac.westfield.post` | 2 | setting | `light.15.post`, `neutral.04.boundary` — **the same post, moved two paces, one campaign apart** |
| `lac.westfield` | `lac.westfield.thorn` | 2 | forage | `neutral.07.stock` |
| `lac.westfield` | `lac.westfield.pear` | 2 | forage | `neutral.07.scion` |
| `lac.westfield` | `lac.westfield.seam` | 3 | forage | `neutral.16.bare` — **the root of the Forge** |
| `lac.westfield` | `lac.westfield.mark` | 2 | kindle, cull | `neutral.18.bright`, `neutral.18.hollow` — one mark, hit twice, two schools |

**Note the id collision:** `lac.leat` is both an *area* (`areas.json:55`) and an *interact prop id*.
The world must publish a target whose id is literally `lac.leat` inside the area of the same name.
Legal but easy to get wrong; consider `lac.leat.weed` and a one-line data change in three quests.

#### BLACKSTONE — 12 props

| host area | prop id | needs | school verb | used by |
|---|---|---|---|---|
| `bst.board` | `bst.board.rate` | 1 | barter | `dark.04.read`, `sandbox.16.east` |
| `bst.board` | `bst.board.yield` | 3 | barter | `dark.11.load` |
| `bst.board` | `bst.board.crate` | **10** | barter | `dark.20.count` — ten crates weighed out |
| `bst.kitchen` | `bst.kitchen.bowl` | **8** | hearth | `dark.05.split` — eight bowls off three fish |
| `bst.chantry` | `bst.chantry.slate` | 5 | mend | `sandbox.06.slate` |
| `bst.intake` | `bst.intake.draw` | 3 | line | `dark.08.draw` |
| **`bst.levels`** | `bst.levels.mark` | 3 | setting | `dark.07.seam` |
| **`bst.levels`** | `bst.levels.fall` | 2 | setting | `dark.23.through` |
| **`bst.levels`** | `bst.levels.prop` | **6** | mend, setting | `dark.23.shore`, `dark.20.set`, `neutral.13.prop` |
| **`bst.levels`** | `bst.levels.floor` | **6** | setting | `dark.19.break` |
| **`bst.levels`** | `bst.levels.lamp` | 1 | kindle | `dark.22.lamp` |
| **`bst.levels`** | `bst.levels.chest` | 4 | barter | `sandbox.17.value` |
| `reach.dark` | `reach.dark.reading` | 3 | forage | `light.21.read` |
| `ridge.dark` | `ridge.dark.mark` | 3 | glamour, ward | `light.20.watch`, `dark.18.sign` — **the same mark, read by both sides** |

**`bst.levels` is the heaviest single location in the corpus and it is the one with no geometry
concept behind it at all.** It carries:

- **6 interact props** (18 individual instances)
- **5 fights** — `dark.01.clear` (14), `dark.23.clear` (14), `dark.24.cull` (20),
  `dark.19.clear` (12), plus the gallery must hold `mire_rat`, `creek_crab`, `rat_knot`,
  `blight_boar`
- **4 gathers** — `iron_shard ×5` (`dark.07`), `obsidian_core ×4` (`dark.19`), `×4` (`dark.22`),
  `×3` (`neutral.13`)
- **3 deliveries** — `wheatglass ×8` (`dark.20`), `cooked_wheatglass ×6` (`dark.25`)
- **3 `goto`s** across two campaigns
- and it must read as **four distinct depths**: the flooded store (D01), the fourth level running
  west (D07), the old gallery behind a fall (D23), and the bottom whose floor breaks (D19).

`grep -rn "cave\|underground\|undercroft" js/world` returns nothing. There is no subterranean support
in the engine. **This is the largest single build item the content depends on** and it should be
scoped before any more Dark content is written.

#### OPEN WORLD — 1 prop

| host area | prop id | needs | verb | used by |
|---|---|---|---|---|
| `heath.ford` | `heath.ford.reading` | 3 | forage | `dark.09.taste` |

#### THE PLAYER — 1 pseudo-target

`self` — 11 steps. Already implemented for graft (`session.js:585`) and needs a non-graft path for
`dark.02.robe` (take the white robe off, no verb) and `neutral.05.eat` (verb `hearth`).
`session.js:736`'s comment shows this is known.

### Escort actors — 4

| actor | route | used by | note |
|---|---|---|---|
| `hen` | → `lac.henhouse` | `light.15.chores`, `dark.13.hen`, `sandbox.12.drive` | a driveable fowl; `js/world/chicken.js` exists |
| `wagon` | → `road.drove` | `light.11.walk`, `neutral.11.ride` | must survive a 524 m escort with 4 `rat_knot` attacking |
| `cart` | → `heath.ford` | `sandbox.13.walk` | as above, 3 `rat_knot` |
| `fen` | → `reach.neutral` | `light.17.cross`, `dark.15.cross`, `sandbox.18.cross` | Fen is a *cast NPC* used as an escort target — he is the ferry |

### Non-sell delivery targets — 8 areas

`session.js:663` implements sell-deliveries only. These eight need a "set it down here" interaction:

`bst.barracks` (3 quests) · `bst.levels` (2) · `lac.barn` (3) · `lac.millbridge` (1) ·
`lac.westfield` (1) · `reach.east` (1) · `wwa.market` (1) · plus NPC hand-offs to `hana`
(`light.25`) and `marrin` (`neutral.25`, `sandbox.02`).

### Enemy spawning — unbound

`REGION_ENEMIES` and `BANDS` (`tables.js:151-169`) are **referenced by nothing** — `grep -rn` finds
no consumer. Every "kill X in area Y" step therefore depends on a spawner that does not exist. The
bindings the corpus needs, which the current table does not supply:

| area | must spawn | currently in `REGION_ENEMIES`? |
|---|---|---|
| `wwa.granary` | `grain_rat` | via `whitewall_low` ✓ |
| `wwa.northgate` | `mire_rat` | ✓ |
| `reach.east` | `raider`, `sour_crow`, `creek_crab` | `raider`/`sour_crow` via `whitewall_upper`; **`creek_crab` only in `river`** |
| `march.west` | `hollow` | ✓ via `blackstone_approach` |
| `bst.levels` | `mire_rat`, `creek_crab`, `rat_knot`, `blight_boar` | **none of the four are in `blackstone_town`** |
| `bst.switchback` | `watchman`, `hollow`, `raider` | `raider` **missing** from `blackstone_town` |
| `ridge.dark` | `hollow` | ✓ |
| `lac.granary` | `grain_rat` | **`grain_rat` is only in `whitewall_low`** |
| `lac.westfield` | `grain_rat`, `brood_mother` | **neither** |
| `fields` | `grain_rat`, `rat_knot` | `rat_knot` ✓, `grain_rat` **missing** |
| `lac.millbridge` | `watchman`, `champion_3` | **neither; `finale` is unmapped to any area** |

---

## 6. Narrative coherence

### 6.1 `sela.was.you` asserts something the player knows is false — medium (the biggest narrative defect)

**Where:** `data/truths.json` → `sela.was.you`, awarded by `neutral.14.out`.

> "You were the captive. The confession was the plan."

It supersedes `sela.face` ("Someone wore Sela's face on purpose", D17), which supersedes `shaft.dry`
(L19). That is the terminal of the trilogy's most-signposted three-campaign chain.

**The player was not the captive in L19. The player was the interrogator.** `light.19` has them go
down to `wwa.cells` with Alder and question her: `light.19.ask`, `light.19.more`, `light.19.out`.
N14 is a *second, later* capture — the player's own, wearing Sela — which `STORY.md` §7 Act 3 states
correctly: *"The player is on the other side of an interrogation they conducted."*

So the fiction is right and the Truth text collapses two events into one. A player who has held
`shaft.dry` since Light Act 4 reaches the payoff and is told a thing they can disprove from memory.
Worse, it leaves the actual question — who *was* in that cell in L19 — permanently unanswered, when
the corpus has an obvious answer standing right there (Dob, who was Ansel for eleven years and is
"the best grafter alive", `STORY.md` §9).

**Severity:** medium — no mechanical break, but it is the emotional load-bearing beat of the whole
ladder. **Effort:** one-liner.

**Fix** — change the Truth to be about the *technique*, which is what the scene actually earns, and
add one line to `neutral.14.out` naming the first wearer:

```json
"sela.was.you": {
  "text": "The Household has worn that face into that cell twice. This time it was you.",
  "campaign": "neutral", "story": "N14",
  "supersedes": "sela.face"
},
```

```json
"neutral.14.out": {
  "cam": "close",
  "once": true,
  "mark": "sela.was.you",
  "lines": [
    ["bel", "A quarter of an hour and she gave it up."],
    ["alder", "People do, when they are frightened."],
    ["alder", "Tell the muster. We move in the spring."],
    ["player", "A true thing, said on purpose."],
    ["player", "Dob sat in this chair. I asked him the questions."]
  ]
}
```

That last line is the whole reveal, it costs nothing, and it makes N20 ("Ask Dob who Dob is") land
harder because the player already owes him something.

### 6.2 Four skippable quests hold links in cross-campaign Truth chains — medium

Following §4.5. These four are named by no other quest's prereq, and each carries a Truth that a
*mandatory* later Truth supersedes:

| skippable quest | Truth it grants | what breaks if skipped |
|---|---|---|
| `light.16` A Cousin in the Crowd | `cousin` | the whole **cousin → ansel.nobody → ansel.you** chain has no head. D14's strike-through overturns nothing; N08's terminal is orphaned |
| `dark.14` The Face at the Cross | `ansel.nobody` | the same chain breaks in the middle |
| `dark.18` The Watcher on the Ridge | `sign.kept` | **`unseen` (L20, mandatory) is never struck.** The player finishes the trilogy still holding "You scouted the Black Keep and nobody saw you" — which the story exists to disprove |
| `neutral.10` A Crate Both Ways | `count.by.design` | `count.never.holds` (L17, mandatory) is never struck |

`journal.js truthChains()` groups by connected component, so a skipped head leaves a visibly
one-legged chain on the Truths tab. `dark.18` is the worst of the four: it is the *only* strike
against a Light Act 4 certainty, and `STORY.md` §8.5 explicitly calls the L18–L21 / D16–D18–D08
correspondence deliberate and says it "should survive editing". It does not survive a player who
does not fancy climbing the ridge again.

**Severity:** medium. **Effort:** one-liner each.

**Fix** — make the four Truth-bearing quests load-bearing by adding them to the next finale's prereq.
They are cheap quests and the chains are the trilogy's spine:

```json
"prereq": ["all", ["quest", "light.15", "done"], ["quest", "light.16", "done"]]
```
in `light.17` (act 3 exit),
```json
"prereq": ["all", ["quest", "dark.13", "done"], ["quest", "dark.14", "done"]]
```
in `dark.15` (act 3 exit),
```json
"prereq": ["all", ["quest", "dark.07", "done"], ["quest", "dark.17", "done"], ["quest", "dark.18", "done"]]
```
in `dark.19` (act 4 exit — and D19's `onDone` already lists D18 as an unlocker, so the data already
believes this),
```json
"prereq": ["all", ["quest", "neutral.09", "done"], ["quest", "neutral.10", "done"]]
```
in `neutral.11` (act 2 exit — again, N11 is already unlocked by both).

The remaining fifteen skippable quests carry no Truths and should stay optional.

### 6.3 "before Thursday" — the one named day in a world with no named days — small

**Where:** `data/dialogue/light.json:206`, `light.14.price`.

> `["hana", "I want the leat cleared before Thursday."]`

`STORY.md` §4: *"Week: eight days, numbered first to eighth. Nothing else is named."* It is the only
weekday name in 698 lines of dialogue (grep confirms), and its own mirror scene gets it right —
`dark.12.price` says *"I want the leat cleared before the eighth."*

**Severity:** small. **Effort:** one-liner.

**Fix:**

```json
["hana", "I want the leat cleared before the eighth."]
```

### 6.4 D11 sells the iron, then D12 offers it — small

`dark.11.sell` = *"Sell the month at the cross"* (`deliver iron_shard 5` via sell, at `lac.square`),
per Ossa's brief: *"Sell it, buy grain, come back."* The player then walks into `dark.12.price` and
says:

> `["player", "Iron for grain. An honest weight."]`

They have no iron. They have coin.

**Severity:** small. **Effort:** one-liner.

**Fix:**

```json
["player", "Blackstone coin for Longacre grain. An honest weight."]
```

### 6.5 Two "lad"s fix the protagonist's gender by accident — small

- `data/dialogue/neutral.json:243` — `["alder", "Good lad. You have a Sanctum voice."]`
- `data/dialogue/dark.json:273` — `["hana", "A Whitewall lad did these three last year."]`

Every other one of the 698 lines is gender-neutral about the player. `CLAUDE.md` calls them "a young
adult" and nothing in `STORY.md` assigns a gender. Two lines out of 698 is an accident, not a
decision, and Hana's is the more expensive one because she is the player's mother saying it.

**Severity:** small. **Effort:** one-liner.

**Fix:**

```json
["alder", "Good. You have a Sanctum voice."]
["hana", "A Whitewall apprentice did these three last year."]
```

(Alder's shortened line is also better — "Good." is more Whitewall than "Good lad.")

### 6.6 The two authored player choices have no consequence anywhere — medium

53 story flags are written and never read. Two of them are the trilogy's only real decisions:

- **`light.ledger.published`** — set by `light.24.choice`. `STORY.md` §5 Act 5: *"the choice sets the
  epilogue text and a world flag the other two campaigns reference."* `grep -rn "ledger.published"`
  returns the setter only. No Dark or Neutral quest, dialogue node, predicate or slate entry reads it.
- **`neutral.posture.tend` / `.take` / `.keep`** — set by `neutral.21.posture`. `STORY.md` §8.3:
  *"Epilogue — The Field at Harvest… Text over the Longacre panel on the faction-select slate,
  varying by posture."* `js/game/towns.js slate()` reads only `doc.campaign.done`. There is no
  epilogue text and no posture branch.
- Same for the choice flags in `light.03.haggled`, `light.19.pressed`, `dark.02.guessed`/`.hard`,
  `dark.12.took.work`/`.walked`, `dark.17.pressed`, `neutral.14.told`, `neutral.20.blunt`.

`NOTES_CONTENT.md` §8.7.8 already concedes that all three N21 postures play the same six steps and
argues the *choice* is the point. That argument only works if the choice is *shown* somewhere.

**Severity:** medium (the ending of a seven-hour game currently has no variation at all).
**Effort:** medium.

**Fix** — the cheapest real payoff is the slate, which `STORY.md` §11 already specifies. In
`js/game/towns.js`:

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

and surface them on the Whitewall and Longacre panels once `trilogy` is true. That is the whole
implementation and it makes both choices real.

### 6.7 Smaller continuity notes

- **`neutral.17.table` seats six and names five.** *"Sit. Sedge on your left, Wick opposite. Dob has
  the pot. That is all of us."* → *"Six chairs and a long table. Yes."* Present: Hana, Sedge, Wick,
  Dob, player = five. Fen is Household by every other measure (`neutral.10.out`: *"Because we load it
  that way"*) and is not at the table. Given that `RUNTIME.md` §4.4 still references a cut character
  called Kettle (§7.3), the sixth chair looks like residue from revision 3. **Fix:** either add
  `["hana", "Fen is on the water. He gets told after."]`, which is a good Longacre line, or change
  "Six chairs" to "Five chairs".
- **`wick_ww` is Longacre's clerk with a Whitewall id.** `STORY.md` §9 makes this deliberate — Wick
  is Longacre's market clerk who works all three crosses. But the id says `_ww`, and `dark.11.sell`
  has a Blackstone player selling iron to "Wick" at the Longacre cross, which reads as a Whitewall
  factor buying Blackstone's month. The character is right; the id will mislead the next author.
  **Fix:** rename to `wick` in `cast.json` and the six referencing steps, or leave it and add a note
  to `cast.json`. Low priority, but do it before the cast strip ships.
- **`watchman` is doing two jobs.** `CLAUDE.md` binds "the Watch" to the disguise-detecting enemy
  class, and `faction.js:82-104` builds the whole suspicion model on `watchmen`. The corpus also uses
  `watchman` as generic town soldier for **both** towns: Blackstone's at `bst.switchback` in L23,
  Whitewall's at the same switchback in D21, and both towns' at `lac.millbridge` in N21 — where the
  Neutral player kills ten of the class their entire campaign is built on evading. It works (N21's
  `hold` step has no `worn`, so no suspicion accrues) but the term is overloaded. Judgement call; see
  §8.
- **D02 does not acknowledge that the player interrogated Sela fifteen quests earlier.** `light.19`
  puts the player in a cell with a woman calling herself Sela; `dark.02` has them meet Sela in the
  alleys and neither mentions it. That is *deliberate* — D17 is where they work it out — but fifteen
  quests of working alongside her with no flicker of recognition is a long time to hold. One line in
  `dark.02.ask` would carry it: `["player", "I have met you. In a cell."]` / `["sela", "No."]`.
- **Voice compliance is otherwise good.** `tools/lintText.mjs` passes at 0 warnings. No dialect
  spelling; two lines maximum per bubble held throughout; the forbidden HUD vocabulary (Attunement,
  Focus, XP, level-as-stat, Glut, Freshness, Suspicion, Echo) appears nowhere — the four "level"
  hits are Blackstone's mine levels. Rule 7 ("nobody says magic unless teaching a beginner") is
  observed exactly once, by Rell, in L02, to a beginner.

---

## 7. Doc ↔ data staleness

Confirmed, plus three the brief did not have. **Data wins in every case below.**

### 7.1 The three campaign headline counts are all wrong — confirmed and extended

| doc | says | data | correct |
|---|---|---|---|
| `STORY.md` §5 line 314 | "Whitewall. Five acts, **24 quests**" | `light.json` = **28** | data |
| `STORY.md` §6 line 437 | "Blackstone. Five acts, **22 quests**" | `dark.json` = **25** | data |
| `STORY.md` §7 line 554 | "Longacre. Five acts, **21 quests** plus an epilogue screen" | `neutral.json` = **26** | data |
| `STORY.md` §11 pacing table | Light 28 · Dark 25 · Neutral 26 | same | **already correct** |

The brief flagged §7 only; §5 and §6 have the same problem. All three predate revision 3's twelve
additions, which §15 documents correctly. §11 and §8.1–8.3 are current — I verified the act splits
against the data: Light 6·6·6·6·4, Dark 6·5·6·4·4, Neutral 8·5·5·7·1, all exact.

**Fix:** three number edits.

### 7.2 §8.5's strike counts are wrong for both Dark and Neutral — confirmed

`STORY.md` §8.5, "Where the strikes land" and the prose above it:

> *"finishing Dark strikes seven Truths the player earned as Light, and finishing Neutral strikes
> seven more."*

Counting `supersedes` entries in `data/truths.json`:

| campaign | doc says | supersede entries in data | of which were *standing* |
|---|---|---|---|
| Light | 1 | 1 (`thirty.years` → `overdraw`) | 1 ✓ |
| Dark | 7 | **9** | **7 Light + 2 Dark's own** |
| Neutral | 7 | **13** | **10 standing + 3 Neutral's own** |

Dark's "7" is right under the reading "Truths from an earlier campaign"; the table's column header
is "Truths it strikes", which is 9. **Neutral's "7" is wrong under every reading** — the correct
numbers are 13 total or 10 standing, and `campaign.test.mjs` already asserts the latter:
*"✔ Neutral strikes ten Truths the first two campaigns left standing"*.

§8.5's own table below the prose lists all thirteen correctly, so it is the summary line and the
"Where the strikes land" table that are stale.

**Fix:**

| Campaign | Truths earned | Truths it strikes | of which stood at campaign start |
|---|---|---|---|
| Light | 10 | 1 | 1 |
| Dark | 12 | 9 | 7 |
| Neutral | 12 | 13 | 10 |

and the prose to *"finishing Dark strikes seven Truths the player earned as Light, and finishing
Neutral strikes ten more."*

The total — 34 Truths in 11 chains, Light 10 / Dark 12 / Neutral 12 — **is correct**, and
`RUNTIME.md` §4.3 has already been updated from 31 to 34 (line 872). No action there.

### 7.3 `RUNTIME.md` §4.4 names the wrong quest and a cut character — confirmed

`RUNTIME.md:929-931`:

> "When **N24** resolves, 'Cousin Ansel' and **'Kettle'** merge into one portrait…
> `['merge', 'ansel', 'kettle', 'dob']`"

Data (`neutral.json`, `neutral.20.onDone`): `["merge", "ansel", "dob"]`. **N20**, not N24 (N24 is
"What Feeds on It", the brood mother). `kettle` is in no cast, quest or dialogue file — cut in
revision 3. `STORY.md` §7 Act 4 has it right: *"N20: Dob was Ansel before you were."*

**Fix:**

> "When **N20** resolves, 'Cousin Ansel' merges into Dob's portrait with the old name struck
> through above the new one. That is the whole implementation, and it is one effect:
> `['merge', 'ansel', 'dob']`."

### 7.4 New: `NOTES_CONTENT.md` §5.3 attributes L18's cliff to an enemy the pack no longer uses

> "L18 is the difficulty cliff. **Two `hollow` at level 10** in an act banded 5–8…"

`light.18.fight` uses `raider ×4` + `sour_crow ×4`. `tables.js:13-15` records that `raider` was
created specifically to replace the substituted Hollow. The note predates the fix. The *conclusion*
still stands (§3.2) but the reason given is wrong, and someone reading it will go looking for a
Hollow that is not there.

### 7.5 New: `NOTES_CONTENT.md` §8.7.10 lists an object id the corpus does not use

`lac.cotts.slate` appears in Neutral's world-contract list. No `interact` objective anywhere names
it (`neutral.20.find` is a plain `goto lac.cotts`). Harmless, but it is one line of build brief
somebody will build.

### 7.6 New: `NOTES_CONTENT.md` §8.7.1's ash-supply risk is dismissed by the data

"The graft steps are a hard dependency on Hearth Ash… If ash is scarce… the whole of Acts 2 and 3 is
a supply problem." Seven of the nine grafts are in `lac.barn`, which is `hearth: true` +
`town: 'neutral'` and therefore free (`session.js:467,576`). Two cost ash; the rewards grant five.
**Not a risk.** Worth striking so it does not eat playtest attention.

### 7.7 New: `STORY.md` §4's S19/S20 timings do not match the data

- **S19 Lamp Round.** Doc: *"must finish before 21:00… accepted only between 18:00 and 20:00."*
  Data: `"after": 18, "before": 21, "within": 900`. `within` is in seconds, and 900 s = **15 game
  hours** — five times the length of the window it sits inside. The deadline the doc describes is
  the `before: 21`, which `stepOpen` enforces by refusing credit rather than by failing, so it is not
  a deadline at all.
- **S20 A Meal for the Bridge.** Doc: *"freshness timer."* Data: `"within": 600` = **10 game hours**
  for a `lac.barn` → `lac.millbridge` carry of about 180 m = 36 real seconds. The timer is roughly
  16× too generous to ever bite.

**Fix:** `S19` `"within": 180` (3 game hours, matching the window) and `S20` `"within": 90`.

---

## 8. Judgement calls — for Aaron, not the fix queue

These are places where the corpus does something consistently and deliberately, and I do not think a
content agent should decide whether it is right.

1. **The dialogue uses zero contractions. `STORY.md` §10's own samples are full of them.**
   All 698 lines across all three packs are contraction-free — every apostrophe in the corpus is a
   possessive. The doc's L06 sample reads *"Bell's at six. Don't be late for it."*; the shipped L06
   reads *"So it was written, so it is read."* The D02 sample reads *"You're Longacre. They put you
   in Whitewall as a baby."*; the shipped D02 reads *"Longacre. Fostered out as an infant."*
   The uniform register is genuinely handsome and it makes the world feel old. It also **flattens
   §10's three faction rhythms** — Blackstone's "short sentences, flat delivery" and Whitewall's
   "courteous, slightly formal" become indistinguishable when neither may contract. Three agents
   independently adopted the convention, so it is a house style now; the question is whether to keep
   it or to let Blackstone and Longacre contract and leave Whitewall as the only town that does not.
   That last option would make the register itself carry the politics, which is very good, and it is
   a two-hour edit across three files.

2. **D21 is the mirror of L23 at half the difficulty (§3.5).** 64 taps vs 128, 18 bites vs 8. The
   Dark campaign's climactic retake is easier than the Light campaign's assault on the same
   staircase, because the player has spent an act levelling in between. That may be exactly the
   feeling you want — *"we held it for sixty years"*, you come back up and it is not close — or it
   may be the Dark finale landing soft. It is a levelling-curve consequence, not a defect, and
   fixing it means either re-banding D21's enemies or accepting the asymmetry.

3. **All three N21 postures play identical steps.** `NOTES_CONTENT.md` §8.7.8 owns this honestly.
   With §6.6's slate epilogue wired, the choice at least *reads* differently at the end. Whether
   "Keep" should actually be able to stop the battle by hand — the player's most likely
   expectation — is a design question, and it is the single largest possible content addition
   remaining in the trilogy.

4. **`watchman` is both "the Watch" (the Glamour counter-mechanic) and "generic town soldier"
   (§6.7).** Splitting it costs one enemy entry and touches four steps. Keeping it means the enemy
   the Neutral campaign teaches you to evade is also the enemy you kill ten of in the finale, which
   is arguably the point.

5. **The graft timer and the time-skip run on different clocks.** `graftDuration = 180 + 30 ×
   glamour` is real seconds (~8.5 minutes at N08). `waitFor` fades up to eight game *days* in a 1.2 s
   crossfade (`worldclock.js:98`), so the graft survives it — mechanically fine. But `neutral.09`
   and `neutral.11` both graft in `lac.barn` and *then* fade to the eighth day, so in fiction the
   player wears a stolen face for a week. Moving the graft step after the timed step fixes the
   fiction and costs nothing. Whether it is worth caring about is yours.

6. **`unlock` is inert and `prereq` is the real ladder (§1.6).** Deleting the `unlock` effects makes
   the data honest. Making `offered()` honour them makes the ladder tighter and **would change what
   is skippable** — sixteen quests currently reachable by prereq alone would need their unlocker
   done first, which incidentally fixes §6.2's four broken Truth chains for free. That is the more
   interesting option and it is a gameplay decision, not a cleanup.

---

## Appendix — how the numbers were derived

- **Walk distances.** Every step assigned a location by, in order: `in`, the `goto`/`survive` target,
  the `deliver` target area, the `escort` path, the innermost area containing the `interact` prop id,
  the `recover` `moveTo` anchor. Area centres from `data/areas.json` (rect midpoint or circle
  centre). Distances chained in play order across the 79 story quests starting at `wwa.granary`.
  Euclidean, so real path lengths will be **higher**, not lower — the road meanders and the towns are
  walled.
- **Game-hours per metre.** `STORY.md` §4 (1 real min = 1 game hour) × `js/player.js:44` (5 m/s)
  = 300 m per game hour walking, 510 m sprinting.
- **Combat.** School levels per act taken from `tools/soak.mjs`'s own per-act `levels` record
  (`soak.mjs:387`), read at the *end* of the previous act, i.e. the level the player enters each act
  with. Taps from `tapsToKill(schoolLevel, enemy)`, using the better of Kindle and Cull and skipping
  Cull for `immune: ['cull']`. Bites-to-gutter from `hpMax(ward, hearth) / damageTaken(damage, ward)`.
  All from `js/sim/combat.js`; no house numbers.
- **Reachability.** Fixed-point closure over `prereq` from each campaign's entry quest, treating
  cross-campaign prereqs as satisfied.
- **Once-node sweep.** Every `once: true` node cross-referenced against every step's `talk`
  objectives and against every step in the same quest carrying `unseen`, `fail` or `within`.
- **World contract.** Every `interact` id, `goto`/`survive` area, step `in`, `deliver` target and
  `escort` route extracted from all four packs and resolved against `data/areas.json` and
  `data/cast.json`.
