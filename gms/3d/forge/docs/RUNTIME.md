# FORGE — runtime and UI

The layer between the engine and the design. `STORY.md` says what happens, `SYSTEMS.md` says what
the numbers are, `WORLD.md` says where it is. This document says **what runs it and what the player
sees**, which `REVIEW.md` §5 correctly identifies as the largest completely unspecified system in
the project.

Scope: the world clock, the quest engine, dialogue, journal, save, HUD and menus, onboarding, audio,
accessibility, and the file plan.

**Terms are `REVIEW.md` §1's reconciliation table, which is binding.** Schools are Kindle, Ward,
Line, Forage, Cull, Hearth, Mend, Barter, Setting, Glamour. Currency is **Marks** (`mk`). Towns are
Whitewall / Longacre / Blackstone with permanent code ids `light` / `neutral` / `dark`.

**`STORY.md` and `SYSTEMS.md` were revised in parallel with this document, and both landed their
own clock and quest-primitive sections after it was drafted.** §11 is the full audit: what this
document deferred to them, what it settled against them and why, and what is still open. The short
version is that the clock and the eight primitives are theirs, and the runtime built on top is
this document's.

---

## 0. The three rules this layer is built against

| Rule | Consequence |
|---|---|
| **`?shot=` must stay deterministic** | The critic harness is the project's only quality gate. Nothing in this document may run while a scenario is being rendered. There is exactly one boot decision and it is made in `main.js` before any game module is constructed. |
| **No build step, no libraries** | Quests, dialogue and areas are JSON fetched over HTTP (the project is always served over HTTP — `tools/shot.mjs` line 39 starts a server). The same files are `readFileSync`-able by `node --test`, which is how the pure modules get tested. |
| **Pure where it can be pure** | Everything in `js/sim/` takes its inputs and returns a value: no `three`, no DOM, no `Math.random`, no `performance.now`, no `Date.now`. Everything in `js/game/` is a thin adapter with no numbers of its own. The split is stated per module in §10. |

Reference viewport is `quality.js` `MOBILE_PROFILE` — **844 × 390, dpr 1, preset medium**. Every
sketch below is drawn at that size: 84 columns × 20 rows, so one character is ~10 px wide and one
row is ~19.5 px tall.

---

## 1. The world clock

Eleven designed systems need one and there is none. `time` is a lighting slider
(`js/world/lighting.js:201`); scenarios set it with `app.quality.set('time', s.time)`
(`js/world/demo.js:56`) and nothing advances it.

### 1.1 What it is

**One float.** `SYSTEMS.md` §9.1 states the required interface and this document implements it
exactly; day and hour are derived, never stored twice.

```js
// js/game/clock.js — pure, no imports
export const DAY_ROLL = 5;                       // STORY.md §4: the day turns at 05:00, not midnight
export const hourOf = t => { const h = t % 24; return h < 0 ? h + 24 : h; };
export const dayOf  = t => Math.floor((t - DAY_ROLL) / 24);
export const crossedDay = (a, b) => dayOf(b) > dayOf(a);
```

**Built. Two corrections to what this section originally said.** The pure clock lives at
`js/game/clock.js`, not `js/sim/clock.js` — Track C owns `js/sim/` and deliberately left the clock
alone, so `js/game/` holds both halves. Throughout this document the naming rule is: **a bare noun
is the pure module (`clock`, `quest`, `dialogue`, `predicate`, `journal`, `save`, `areas`), a
compound is its adapter (`worldclock`, `questrunner`, `dialoguebox`, `journalscreen`,
`savestore`).** And `hourOf` is a single mod with a negative fix-up: `((t % 24) + 24) % 24` is not
exact — it returns `11.899999999999999` for `11.9`, which pushes a bell an epsilon into the future
so it never rings.

`t` is continuous game-hours since save creation. `hour` is the same 0–24 unit the `time` knob
already takes (`lighting.js:201`), so the lighting needs no conversion.

**The clock never reads the system clock.** It advances only from `dt` supplied by a running
session. This is not a purity nicety — it is the reason a phone call, a week away, or a device with
the wrong date cannot break anything, and it is why `SYSTEMS.md` §9.2 can price Reforge in game-days
with no clock-tampering surface.

Rolling the day at 05:00 rather than midnight is `STORY.md` §4's call and it is a good one: a night
session is never cut in half, so the glut ledger and the daily caps do not reset under a player who
is mid-shift in Blackstone at one in the morning.

### 1.2 Rate

**24 real minutes to the day, 1 real minute per game hour**, agreeing with `STORY.md` §4 and
`SYSTEMS.md` §9.1. A 12-minute session is half a day, which puts glut resets at roughly one per
session.

```js
export function advance(t, dtSeconds, rate = 1, nightRate = 1) {
  let left = dtSeconds / 60, cur = t;
  // stepped at the boundary so one long frame cannot skip a rate change or a day roll
  while (left > 1e-9) {
    const h = hourOf(cur);
    const r = rate * (isNight(h) ? nightRate : 1);
    const edge = isNight(h) ? (h < DAWN ? DAWN : 24) : DUSK;
    const step = Math.min(left, (edge - h) / r);
    cur += step * r; left -= step;
  }
  return cur;
}
```

| Knob | Range | Default | Meaning |
|---|---|---|---|
| `dayMinutes` | 0 – 120 | **24** | real minutes to the game day; **0 freezes the clock** |
| `nightRate` | 1 – 6 | **1.0 (off)** | extra multiplier between `DUSK` 20:30 and `DAWN` 05:30 |

**`dayMinutes` replaces the `clockRate` this section first specified.** Same quantity, reciprocal
units: "Day length 24 real min" reads on a panel slider in a way "game hours per real minute 1.0"
does not. `clock.rate` is still exposed as game-hours per real *second*, which is what
`SYSTEMS.md` §9.1 asks for, and `advance()` still takes game-hours-per-real-minute.

**`nightRate` is a mechanism offered, not a decision taken.** A uniform 24-minute day spends about a
third of every session in the dark, which is a lot on a phone; `nightRate 2.5` compresses the nine
night hours into 3.6 real minutes and makes the day 18.6 real minutes. It ships **off**, because
`STORY.md` §4 and `SYSTEMS.md` §9.1 both specify a uniform day and the hour-by-hour town schedules
in `STORY.md` §4 are written against it. It is one knob and one soak re-run if the first playable
proves the nights too long.

Walking Whitewall to Longacre (`WORLD.md` §1.1: 101 s) costs 1.7 game hours; the valley end to end
costs 3.6. Both read as journeys, which is what the walking-distance argument in `WORLD.md` was for.

`dayMinutes = 0` freezes the clock without pausing the game. That is the screenshot setting and
`?dayMinutes=0` gives the harness it for free.

### 1.3 How it drives the lighting knob

It writes the knob. It does not bypass it, shadow it, or add a second time value.

```js
// js/game/worldclock.js — adapter
tick(dt) {
  if (!this.player.enabled) return;            // scenario and editor mode: the knob stays authoritative
  const before = this.t;
  this.t = advance(this.t, dt, this.hoursPerMinute, q.get('nightRate'));
  if (crossedDay(before, this.t)) this.emit('day', dayOf(this.t));
  this.acc += dt;
  if (this.acc < PUSH) return;                 // PUSH = 0.25 s
  this.acc = 0;
  this.writing = true;
  q.set('time', +hourOf(this.t).toFixed(3));
  this.writing = false;
}
```

Four things make this safe:

- **4 Hz, not 60 Hz.** The sun moves 0.25°/s at the default rate, so a 0.25 s push is 0.06° of
  travel — invisible. `lighting.apply()` runs 4×/s instead of the ~60×/s it already survives during a
  slider drag, and the sky redraw is already coalesced to 8 Hz behind `this.dirty`
  (`lighting.js:509`). No change to `lighting.js`.
- **External writes rebase the clock, they never fight it.** The adapter subscribes to
  `quality.onChange`; a `time` change that did not come from the clock (`!this.writing`) sets
  `this.c.hour` to that value. Dragging the panel's Time of day slider therefore *is* setting the
  world clock, which is what a designer wants, and the panel needs no new UI.
- **The clock only exists inside a session.** `js/game/worldclock.js` is constructed by
  `js/game/session.js`, and `main.js` does not construct a session under `?shot=` or in the editor.
  A scenario's `app.quality.set('time', s.time)` is therefore the last word, exactly as today.
- **Belt and braces: the `player.enabled` guard.** `SYSTEMS.md` §9.1 asks for it explicitly. Even if
  a session were somehow alive during a shot, a disabled player stops the clock writing.

**Acceptance test:** `node tools/shot.mjs --all` before and after this lands produces the same
`shots/*.json` counts and PNGs that `tools/compare.mjs` reads as unchanged.

### 1.4 Pause

| Cause | Clock | Sim | Render |
|---|---|---|---|
| Pause menu, journal, character sheet, market | stopped | stopped | continues, dimmed |
| Dialogue bubble up | **running** | running | continues |
| `visibilitychange` → hidden | stopped, autosave fires | stopped | `cancelAnimationFrame` |
| Portrait orientation | stopped | stopped | continues behind the rotate card |
| Cutscene / door transition | running | running | continues |

Dialogue does not pause the clock. A bubble is a conversation, not a menu, and a scene that took
forty seconds of game time should have taken forty seconds of game time — otherwise "before the
bell" becomes free. Long scenes are the writer's problem, and `STORY.md`'s two-line rule already
solves it.

Backgrounding never accrues time. Resume continues from the stored `{day, hour}`.

### 1.5 Snapping

`STORY.md` §4 sets the hard rule — **no content is ever locked for more than 60 real seconds** — and
lists fifteen time-gated quests, thirteen of which resolve by "advance on accept". This is the
implementation.

```js
advanceTo(hour) {                   // SYSTEMS.md §9.1's required method; returns hours skipped
  const target = this.t - hourOf(this.t) + hour + (hour <= hourOf(this.t) ? 24 : 0);
  const skipped = target - this.t;
  this.fadeTo(target, 1.2);         // 1.2 s cross-fade, the clock runs the gap at 60×
  return skipped;
}
```

- A quest step declares `after: 21` or `before: 6`.
- Accepting a step outside its window shows **one card** — `STORY.md` §4's *"You wait for the
  dark."* — one button, a lighting cross-fade, and you are there. The player watched it happen; they
  did not wait for it.
- `S19 Lamp Round` is the exception `STORY.md` calls out: it is *accepted* only between 18:00 and
  20:00 and must finish before 21:00, so it is a real deadline rather than a snap. `S16 Price Round`
  is likewise a genuine 24-real-minute challenge.
- Waiting is refused while hostiles are within 40 m and during a channel. It is otherwise always
  available from the pause menu (`Wait until…`) because a player who has lost the thread of a night
  quest must not be stranded.
- Every advance is a save event.

### 1.6 Save and load

Stored as `{ "clock": { "t": 990.667 } }` — one float. `day` and `hour` are derived on load, so
they can never disagree. Nothing is recomputed from wall time.

`SYSTEMS.md` §9.2 owns the per-mechanic contract and this document implements it without
amendment. Its rule is the right one and worth restating: **anything on a combat timescale uses
real seconds and dies on load; anything on an economy timescale uses game-days and survives.**

| Reload behaviour | Mechanics |
|---|---|
| Survives, keyed on `dayOf(t)` | glut ledger, Standing daily caps, Mend's first-repair-per-day set, stall rent, Reforge, the sandbox board, scheduled and eighth-day quests |
| Reset to a clean state | node states (all → `ready`), `repMul` streaks, Ash, suspicion, cooked-food buffs, an active Graft |
| Not on the world clock at all | **freshness** — wall-clock delta from the item's `caught` epoch stamp |

Freshness staying on wall time was a live question and `SYSTEMS.md` §9.2 answers it: the value is
clamped at 20 minutes, at which point it is already at the 0.5 floor, so a week away costs half
value rather than a bag of rot. The save therefore keeps `"caught": 1786312790000` exactly as
`SYSTEMS.md` §9 has it, and this document does **not** change that field. It is the one place where
a wall-clock read is correct, and it is correct because it cannot fail badly.

### 1.7 Knobs

| Knob | Range | Default | Group |
|---|---|---|---|
| `dayMinutes` | 0 – 120 | 24 | World |
| `nightRate` | 1 – 6 | 1.0 | World |
| `startHour` | 0 – 24 | 4.0 | World |

`startHour` defaults to 04:00 because `STORY.md` §4 opens L01 The Granary in the dark at 04:00.
**It applies on `reset()` — a new game — not at boot.** At construction the clock seeds itself from
whatever the `time` knob currently holds, which keeps the dev page looking as it always has and is
the same "the knob is authoritative until the clock is running" rule the rebase implements.

`time` stays exactly as it is, owned by `lighting.js`. The clock is a writer of it, not a second
copy of it.

---

## 2. The quest engine

### 2.1 Eight primitives

`SYSTEMS.md` §10.1 and `STORY.md` §8.0 have both committed to `REVIEW.md` B8's eight, and
`STORY.md` states the rule plainly: *"if a designer finds a ninth, the quest is wrong, not the
primitive list."* This document implements those eight, with their signatures unchanged.

```js
kill(kind, n, area)          gather(kind, n)         deliver(item, n, npcId)
interact(objectId, n)        goto(areaId)            escort(npcId, pathId)
talk(npcId, nodeId)          survive(areaId, seconds)
```

Independently auditing the catalogue against them — the useful thing this document can add — the
eight hold, and the load is very unevenly distributed:

| Primitive | Quests | Covers |
|---|---|---|
| `interact` | **~26, the largest** | lamps, fence panels, kerb courses, dry stands, the Store shelf, water readings, the lock and the ledger, props, the leat, the boundary post, the market post, the roof, the chest, the dig, **and every cast-at-a-thing** |
| `gather` | ~22 | every catch, every forage, every rock, **and every cook** |
| `talk` | ~21 | every giver and turn-in, the readings, the haggles, the captive, the endings |
| `deliver` | ~19 | carrying, feeding, ferrying, **and every sale** |
| `kill` | ~14 | the granary, the raid, the strike, the road |
| `goto` | ~11 | the South Road, the ridge, upstream, into and out of custody |
| `survive` | ~6 | the night watch, holding the pit-head, keeping two guests apart |
| `escort` | ~5 | the wagon, the cart, the apprentice, the hen |

**Three verbs that look like they need a primitive and do not.** They were candidates for a ninth,
tenth and eleventh; each dresses down onto an existing primitive with one modifier, which is the
test `STORY.md` §8.0 sets.

| Candidate | Dresses down to | Why it holds |
|---|---|---|
| `sell(kind, n)` | `deliver(kind, n, marketId)` with `via: "sell"` | `SYSTEMS.md` §10.1's own comment lists "sell" under `deliver`. The market is an npc. The `via` tag is what tells the tracker to say *Sell* rather than *Take*. |
| `craft(item, n)` | `gather(item, n)` with `via: "craft"` | The objective is "have N of the cooked thing". Where it came from is the `via` tag, which also stops a player buying their way through a cooking quest. |
| `cast(spell, n)` | `interact(target, n)` with `verb: "graft"` | Every cast objective in the catalogue has a target — the pear and the thorn, Sedge's mark, your own face (`interact("self", 1)`). A cast with no target is not an objective anyone wrote. |

**The one genuine ninth in the catalogue is S08 "Raise a Shed"** — place a structure on a marked
plot — and it is the only quest whose primitive nothing else would use. `REVIEW.md` defers S08.
That is the correct call, and it is the test the eight pass.

**Other verbs that look new and are not:**

| Looks like | Actually |
|---|---|
| "attend the reading" | `goto(temple)` with `after`, then `talk` |
| "haggle" | `talk` with a choice; the price change is a flag the market panel reads |
| "count the crates / the dry stands / what passes" | `interact(target, n)` — the count *is* the interaction |
| "scout unseen" | `goto(area)` with `unseen: true` |
| "keep two guests apart" | `survive(area, seconds)` with a `fail` predicate |
| "break your captivity without marking anyone" | `goto(area)` with `fail: ["damageDealt", ">", 0]` |
| "bury them in the west field" | `deliver(rat_tail, 8, "west_field")` |

The difference between twenty authored verbs and eight primitives is entirely **modifiers**, and
modifiers are cheaper than primitives because they compose. `SYSTEMS.md` §10.1 names four
(`before`, `after`, `unseen`, `worn`); the full set this runtime needs is:

| Modifier | Type | Meaning |
|---|---|---|
| `in` | area id | the primitive only counts inside this area |
| `after` / `before` | hour 0–24 | window; outside it, the step advances the clock on accept (§1.5) |
| `onDay` | n | the last day of every n-day cycle. `onDay: 8` is the eighth-day gate |
| `within` | seconds | a deadline from step start; expiry fails the step |
| `via` | `sell` / `craft` / `gather` | how the count must be satisfied; also sets the tracker's verb |
| `verb` | school id | which school the interaction is cast with |
| `worn` | faction / `null` | the step requires that appearance |
| `unseen` | bool | failing is being seen, not being hit |
| `require` | predicate | the step cannot start until true |
| `fail` | predicate | the step fails the moment this becomes true |
| `optional` | bool | contributes to a bonus reward, never blocks. **Optional steps run in parallel with the required chain**, not in sequence — otherwise "sell the rest too" could only be done at one exact moment |
| `hidden` | bool | not shown in the tracker until active (used for reveals) |
| `recover` | action list | what "Reset this step" does — see §9.4 |

### 2.2 The state machine

Pure. `js/game/quest.js` exports one reducer.

```
                prereq true                accept                every step done
   hidden ──────────────────▶ offered ──────────────▶ active ──────────────────▶ turnin
      ▲                          │                     │  ▲                        │
      │ prereq false again       │ giver out of range  │  │ step advance           │ talk to giver
      └──────────────────────────┘                     │  └────────────────────────┘
                                                       │                            │
                                        fail predicate │                            ▼
                                          or `within`  └──────────▶ failed ────▶   done
                                                                      │  retry     (repeatable →
                                                                      └────────▶    cooling)
```

Six states: `hidden`, `offered`, `active`, `turnin`, `done`, `failed`. Repeatables add `cooling`
with a `readyOn` day.

```js
export function step(defs, state, event, ctx) { … }   // → { state, effects }
```

`event` is one of `{t:'kill', kind, area}`, `{t:'gather', kind, n, via}`,
`{t:'interact', id, verb}`, `{t:'deliver', item, n, to, via}`, `{t:'talk', npc, node}`,
`{t:'enter', area}`, `{t:'leave', area}`, `{t:'tick', dt}`, `{t:'day', day}`,
`{t:'seen', by}`, `{t:'damage', dealt}`. A sale raises `deliver` with `via:'sell'` and a cook
raises `gather` with `via:'craft'` — §2.1.

`effects` is a list of things the adapter must do: `['xp', school, n]`, `['mk', n]`,
`['item', id, n]`, `['truth', id]`, `['flag', k, v]`, `['unlock', questId]`, `['dialogue', node]`,
`['sound', id]`, `['act', n]`. The sim never touches the world; the adapter is what makes them
happen. This is what makes the whole 99-quest catalogue runnable in a `for` loop with a virtual
clock and no browser.

### 2.3 Predicates

One evaluator, four uses: quest `prereq`, step `require`, step `fail`, and dialogue `choices[].if`.
Arrays, never strings — nothing is ever `eval`'d and every predicate is machine-checkable by the
linter.

**One `TERMS` table in `js/game/predicate.js` drives evaluation, the linter's arity and enum
checking, and the ban below**, so a predicate that lints is the predicate that runs. `level` and
`attunement` carry a `level: true` flag and `findLevelTerms()` rejects them inside a quest prereq,
which is `SYSTEMS.md` §10.2's rule made mechanical.

```json
["all",
  ["quest", "light.01", "done"],
  ["level", "cull", 3],
  ["any", ["flag", "read.ledger"], ["truth", "overdraw"]],
  ["not", ["worn", "dark"]]]
```

| Term | Args | True when |
|---|---|---|
| `all` / `any` / `not` | predicates | — |
| `quest` | id, state | that quest is in that state |
| `flag` | key, value? | world flag equals value (default `true`) |
| `truth` | id | the Truth is in the journal, in any campaign |
| `level` | school, n | `levelFor(xp[school]) >= n` |
| `attunement` | n | sum of school levels ≥ n |
| `standing` | faction, n | ≥ n |
| `item` | id, n | carried count ≥ n |
| `mk` | n | carried marks ≥ n |
| `campaign` | id, state | `"light"`, `"done"` / `"current"` |
| `act` | n | current act ≥ n |
| `worn` | faction / null | current appearance |
| `day` | op, n | ops are `> >= < <= = != %`. `%` means the last day of an n-day cycle, so `["day", "%", 8]` is the eighth-day test |
| `hour` | lo, hi | world hour inside the window |
| `damageDealt` | op, n | since the step started |

### 2.4 The quest document

One JSON object per quest, in a pack. Adding a quest is appending an object; adding a pack is one
line in the index. **Neither requires a code change**, which is the constraint this format exists to
satisfy.

```
data/quests/index.json      ["light", "sandbox"]
data/quests/light.json      [ { … }, { … } ]
data/quests/sandbox.json    [ { … } ]
data/dialogue/light.json    { "<nodeId>": { … } }
data/truths.json            { "<truthId>": "one line of world fact" }
data/areas.json             [ { id, town, shape } ]
```

Schema:

| Field | Type | Notes |
|---|---|---|
| `id` | `"light.01"` | pack-prefixed, permanent, appears in the save |
| `turnin` | npc id | optional. Present, the quest waits in `turnin` for a `talk` to that npc; absent, the last step finishing completes it. The packs end with a `talk` step instead, and both paths work |
| `story` | `"L02"` | the `STORY.md` id, so renumbering the catalogue does not break saves ▸ |
| `campaign` | `light` / `dark` / `neutral` / `sandbox` | — |
| `act` | 1–5 | — |
| `title`, `summary` | string | summary is one line, ≤ 46 characters |
| `giver` | npc id | drives the offer marker |
| `town` | `light` / `neutral` / `dark` | which board posts it |
| `prereq` | predicate | default `["all"]`, i.e. always |
| `steps` | array | ordered; a step may hold parallel objectives (see `all:`) |
| `reward` | `{ items, truths, bonus }` | **`xp` and `mk` are not authored.** They are generated by `js/sim/campaign.js` from the quest's `story` id; `reward.xp` or `reward.mk` in a pack is a **lint error**. `bonus` pays when every `optional` step is also done |
| `onDone` | effect list | flags, unlocks, act transitions |
| `repeat` | `{ every: 8 }` | in days; absent means once |
| `board` | `{ weight, params }` | present on S-series templates only |

A step:

```json
{ "id": "cull", "do": ["kill", "grain_rat", 8], "in": "wwa.granary",
  "text": "Cull the rodents", "before": 6,
  "recover": [["moveTo", "wwa.granary.door"], ["respawn", "grain_rat", 8]] }
```

Parallel objectives inside one step, for "the leat, a crate and the hen":

```json
{ "id": "chores", "all": [
    ["interact", "lac.leat", 4],
    ["deliver", "crate", 1, "fen"],
    ["escort", "hen", "lac.henhouse"] ],
  "text": "Do Hana's three chores" }
```

`survive` and the clock modifiers combine for the night watch:

```json
{ "id": "watch", "do": ["survive", "wwa.northgate", 480],
  "after": 21, "text": "Hold the north gate", "recover": [["moveTo", "wwa.northgate"]] }
```

### 2.5 The first three Light quests, in the format

Ordered per `REVIEW.md` S2, which inverts L01 and L02 so the player's first input is a cast, and per
B7, which replaces the impossible chalk trout with silverling. ▸ `STORY.md` is being re-cut; the
`story` field carries the old ids so this survives renumbering.

**Reward numbers are gone from the packs.** They are read from `js/sim/campaign.js` via the `story`
id, and the shipped `data/quests/light.json` reproduces `STORY.md` §8.1 exactly: L01 pays Cull 157 ·
Kindle 157 · 7 mk, and Act 1's six quests sum to the 40 mk act budget. Both are asserted in
`js/game/packs.test.js`. **L01 has a lamp step**, which this section originally omitted though
`STORY.md` §8.1 and `campaign.js` both include it. **L05's watch is 90 seconds**, `campaign.js`'s
number, not the 480 an earlier draft of §2.4 used — the objective and the soak's duration have to
be the same number or the balance table lies.

```json
[
  {
    "id": "light.01",
    "story": "L01",
    "campaign": "light", "act": 1,
    "title": "The Granary",
    "summary": "Something is in the grain.",
    "giver": "bel",
    "town": "light",
    "prereq": ["all"],
    "steps": [
      { "id": "first",
        "do": ["kill", "grain_rat", 1],
        "in": "wwa.granary",
        "text": "Cull the rodent",
        "onDone": [["dialogue", "light.01.first"]] },

      { "id": "rest",
        "do": ["kill", "grain_rat", 7],
        "in": "wwa.granary",
        "text": "Cull the rodents",
        "recover": [["respawn", "grain_rat", 7]] },

      { "id": "lamp",
        "do": ["interact", "wwa.granary.lamp", 1],
        "verb": "kindle",
        "in": "wwa.granary",
        "text": "Relight the lamp",
        "recover": [["arm", "wwa.granary.lamp"]] },

      { "id": "out",
        "do": ["talk", "bel", "light.01.out"],
        "text": "Speak to Bel outside" }
    ],
    "reward": { "items": [["rat_tail", 8]] },
    "onDone": [["flag", "wwa.granary.clear", true], ["unlock", "light.02"], ["unlock", "light.05"]]
  },

  {
    "id": "light.02",
    "story": "L02",
    "campaign": "light", "act": 1,
    "title": "Line and Water",
    "summary": "Rell wants five silverling.",
    "giver": "rell",
    "town": "light",
    "prereq": ["quest", "light.01", "done"],
    "steps": [
      { "id": "brief", "do": ["talk", "rell", "light.02.in"],
        "text": "Speak to Rell at the Fish Steps" },

      { "id": "catch", "do": ["gather", "silverling", 5],
        "in": "reach.light",
        "text": "Catch five silverling",
        "hint": "The steps below the dock. Hold the work button.",
        "recover": [["moveTo", "wwa.fishsteps"]] },

      { "id": "back", "do": ["talk", "rell", "light.02.out"],
        "text": "Take them back to Rell" }
    ],
    "onDone": [["unlock", "light.03"]]
  },

  {
    "id": "light.03",
    "story": "L03",
    "campaign": "light", "act": 1,
    "title": "Market Day",
    "summary": "Sell the catch. Not at the first price.",
    "giver": "rell",
    "town": "light",
    "prereq": ["quest", "light.02", "done"],
    "steps": [
      { "id": "walk", "do": ["goto", "wwa.market"],
        "text": "Go up to the market" },

      { "id": "ask", "do": ["talk", "wick_ww", "light.03.price"],
        "text": "Ask what they are paying" },

      { "id": "sell", "do": ["deliver", "silverling", 5, "wick_ww"],
        "via": "sell", "in": "wwa.market",
        "text": "Sell five silverling",
        "recover": [["grant", "silverling", 5]] },

      { "id": "tails", "do": ["deliver", "rat_tail", 8, "wick_ww"],
        "via": "sell", "in": "wwa.market",
        "text": "Sell the tails",
        "optional": true }
    ],
    "reward": { "bonus": { "xp": { "barter": 40 } } },
    "onDone": [["flag", "sold.once", true], ["unlock", "light.04"]]
  }
]
```

Notes on what the format is doing here:

- **`light.01` splits its kill count into two steps.** The first rat is its own step so the tracker
  can read `Cull the rodent` (singular) and the onboarding script can hang the aim lesson on
  finishing it. Same primitive, zero special-casing.
- **`recover` on every step that can strand you.** `light.02` puts you back at the Fish Steps;
  `light.03` gives the fish back if you sold or lost them elsewhere. See §9.4.
- **`light.03`'s haggle is a dialogue choice**, not an objective. The choice writes a flag and the
  market panel reads it. "Do not take the first price" therefore cannot be failed by the player not
  understanding it — the worst case is a smaller sale.
- **The optional tails step** is how the format expresses "sell the rest too" without turning a
  four-minute opening into a checklist.

### 2.6 Authoring

1. Add the object to `data/quests/light.json`.
2. Add its dialogue nodes to `data/dialogue/light.json`.
3. Reload. `?quest=light.07` starts that quest with prereqs waived and the player moved to its
   first step's area.
4. `node tools/lintQuests.mjs` before committing.

The linter is what makes "no code change" true rather than merely permitted. It checks:

- every `id` is unique and pack-prefixed
- every `story` id appears at most once
- every predicate term is a known term with the right arity
- every `kind` / `item` / `spell` exists in `sim/tables.js` or `sim/spells.js`
- every `in` / `goto` / `to` area exists in `data/areas.json`
- every `npc` has at least one dialogue node
- every `talk` node id exists in a dialogue pack
- every `truth` id exists in `data/truths.json`
- the prereq graph is acyclic and every quest is reachable from a quest with no prereq
- every non-terminal quest `unlock`s or is `unlock`ed by something
- no quest prereq mentions `level` or `attunement` (`SYSTEMS.md` §10.2)
- no pack authors `reward.xp` or `reward.mk`
- every `supersedes` in `data/truths.json` resolves, and no supersession cycles

`tools/lintText.mjs` is the prose pass on top: unplayable dialogue nodes, markup in a format that
carries plain strings only, speakers with no name in `data/cast.json`, and scenes over eight
bubbles. `--worst` lists the twelve longest lines against the 46-character bubble width.

### 2.7 The board and the scheduler

`STORY.md` §7.4's twenty repeatables are templates with a `board` block. Once per day tick, each
town's board rolls its posted set from `rng(seed ^ day ^ townHash)` — deterministic, so a save
reloaded on the same day shows the same board, and the soak test can replay it.

"Every eighth day" (L14 / D13 / N14) is `"prereq": ["day", "%", 8]` plus `"repeat": { "every": 8 }`.
No scheduler, no timers, no background work: availability is a pure function of `clock.day`.

**A step gated on the eighth day uses the `onDay` modifier**, added because the modifier table had
no way to express it and `STORY.md` §4 gates four quests on it. The reducer emits
`['wait', hour, onDay]`; the adapter finds the next qualifying day and cross-fades to it. The
eighth day is a fiction, not a wait.

---

## 3. Dialogue

### 3.1 The data shape enforces the rule

`STORY.md` §9 rule 1 is two lines maximum per bubble. The format makes a third line **impossible to
write**, which is stronger than a review process:

```json
{
  "light.01.first": {
    "cam": "close",
    "lines": [
      ["bel", "That is one.", "There will be seven more in there."]
    ]
  },

  "light.03.price": {
    "lines": [
      ["wick_ww", "Five marks the lot.", "That is what the post says."],
      ["player", "The post is from Tuesday."]
    ],
    "choices": [
      { "say": "Five is fine.", "goto": "light.03.take" },
      { "say": "Seven.", "goto": "light.03.push" },
      { "say": "I will come back.", "goto": null }
    ]
  }
}
```

A line is `[speaker, first, second?]`. There is no third slot; a four-element line is an error at
normalise, and the save's `log` truncates to three on the way back in, so there is no route by which
a third line can reach the bubble.

**The haggle choice is ungated.** An earlier draft of this example gated it on
`["level", "barter", 1]`, which gates on nothing: `levelFor(0)` is 1, so every player passes it.
L03 is also where haggling is taught, and `STORY.md` is explicit that the worst case is a smaller
sale, never a locked branch.

`tools/lintText.mjs` additionally fails any line over **46 characters**, which is the measured fit for the bubble at 844 px with the
default UI scale, and warns at runtime in dev mode if a bubble wraps to three rendered lines at the
player's chosen text size.

| Field | Meaning |
|---|---|
| `lines` | ordered bubbles |
| `cam` | `close` / `two` / `wide` / `none` — camera preset, default `two` |
| `choices` | 0–3; `if` uses §2.3's evaluator; `goto: null` closes the scene |
| `once` | the node plays at most once ever |
| `sets` | effect list run when the node completes (flags, truths) |
| `mark` | a Truth id to award — Truths are earned in dialogue, not at turn-in, because that is where they land emotionally |

Speaker `"player"` renders as the player's chosen name. No dialect spelling is possible because
there is no markup — the format carries plain strings only.

### 3.2 Presentation at 844 × 390

```
┌────────────────────────────────────────────────────────────────────────────────────┐
│ ▓▓▓▓▓▓▓▓▓▓▓░░░  118/164                                       Day 3 · Rising    ⚙  │
│ ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒  92                                                            │
│                                                                                    │
│                                                                                    │
│                                                                                    │
│                    ╭──────╮                    ╭──────╮                            │
│                    │      │                    │      │                            │
│                    │ Bel  │                    │ you  │     two-shot framing:      │
│                    ╰──────╯                    ╰──────╯     camera eases, no cut   │
│                                                                                    │
│                                                                                    │
│                                                                                    │
│                                                                                    │
│  ┌──────────────────────────────────────────────────────────────────────────────┐  │
│  │ SISTER BEL                                                              1/3  │  │
│  │ That is one.                                                                 │  │
│  │ There will be seven more in there.                                      ▸    │  │
│  └──────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                    │
└────────────────────────────────────────────────────────────────────────────────────┘
```

With choices, the bubble sits one row higher and the options stack above it:

```
│  ┌──────────────────────────────────────────────────────────────────────────────┐  │
│  │  Five is fine.                                                               │  │
│  ├──────────────────────────────────────────────────────────────────────────────┤  │
│  │  Seven.                                                                      │  │
│  ├──────────────────────────────────────────────────────────────────────────────┤  │
│  │  I will come back.                                                           │  │
│  └──────────────────────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────────────────────┐  │
│  │ WICK                                                                    2/2  │  │
│  │ Five marks the lot.                                                          │  │
│  │ That is what the post says.                                                  │  │
│  └──────────────────────────────────────────────────────────────────────────────┘  │
```

Measurements: the bubble is `calc(100% - 32px)` wide, 78 px tall (three text rows at the default
scale), anchored 16 px above the safe-area bottom. Speaker name is 10 px, letter-spaced, 45%
opacity — the same treatment `style.css` already uses for `.grp h4`. Body text is 15 px at 1.45
line-height. Choice rows are 44 px tall, which is the minimum touch target the editor already uses
(`editor.css` `.ed-chips button`).

Three choices at 44 px plus a 78 px bubble is 210 px of a 390 px screen. Three is therefore the hard
maximum and the linter enforces it.

### 3.3 Controls while a bubble is up

Dialogue is **not modal**. This matters more on a phone than anywhere else: a modal that eats the
whole screen makes a seven-bubble scene (L09) feel like a loading screen.

| Input | During dialogue |
|---|---|
| Move stick | disabled, stick hidden |
| Look-drag | **live**, at 0.6× sensitivity, clamped to ±50° from the scene's framing |
| Tap on the right half | advance |
| Context button | advance (its glyph becomes `▸`) |
| Hold context 600 ms | skip to the end of the scene |
| School dial | disabled, dimmed |
| Back / pause | pause menu over the top; the scene resumes where it was |

Look-drag staying live is deliberate. It costs nothing, it keeps the world feeling alive, and it is
the difference between a conversation and a cutscene.

**How it is done, because §3.4's mechanism will not do it.** `player.driven` blanks the entire
command at `player.js:142`, look included, so dialogue cannot use it. `js/game/session.js` patches
`input.read()` on the instance instead: it zeroes `mx`/`my`, scales `lx`/`ly` by 0.6, and converts
the tap edge into an advance. The camera arm eases to the `cam` preset and `camYaw` is clamped to
±50° of the framing after the player updates. **Nothing in `player.js` or `input.js` changes.**

### 3.4 Camera

Dialogue borrows the mechanism `doors.js` already owns: `player.driven = true` hands position and
yaw to a script (`doors.js:211` `begin()`), and `player.indoor` blends the camera arm. Dialogue sets
`driven` and eases the camera over 0.5 s to one of four presets, then releases on scene end. **No
cuts** — the arm smoothing in `player.js:220` does the work and the transition reads as the player
turning to listen.

| `cam` | Framing |
|---|---|
| `close` | arm 2.4 m, speaker at frame-third, player shoulder in |
| `two` | arm 4.0 m, both at frame-thirds, yaw perpendicular to the line between them |
| `wide` | arm 7.0 m, used for the covenant reading and the Household table (six speakers) |
| `none` | camera untouched — barks and one-liners while walking |

Six seated speakers (N21) are staged standing round a table; `STORY.md` §11.7 already permits this
and nothing in the engine sits.

### 3.5 Re-reading and skipping

Every completed line is appended to a rolling transcript (last 200 lines) in the journal's **Log**
tab, grouped by scene with the day stamp. Skipping a scene appends the whole thing, so nothing is
ever lost by skipping — which is what makes skipping safe to offer.

---

## 4. Journal and quest tracking

### 4.1 The tracker

Top-left, under the vitals. Two lines maximum, always. Title in 11 px caps at 55% opacity, current
objective in 13 px with the count right-aligned.

```
│  THE GRANARY                                                                       │
│  Cull the rodents            5/8                                                   │
```

- Only one quest is tracked. Switching is one tap in the journal.
- On a step change the two lines cross-fade over 0.25 s. No pop-ups, no banners, no toast.
- The tracker hides entirely during dialogue, in menus, and for 3 s after the last combat hit.
- A step with `all:` shows the first incomplete objective, with `2/3` after the title.

### 4.2 The journal screen

Three tabs. Reachable from the pause menu and from a long-press on the tracker.

```
┌────────────────────────────────────────────────────────────────────────────────────┐
│  ✕     QUESTS          TRUTHS  (14)          LOG                    Day 3 · Rising │
├──────────────────────────────┬─────────────────────────────────────────────────────┤
│                              │                                                     │
│  ● The Granary          ACT 1│  THE GRANARY                                        │
│    Cull the rodents      5/8 │  Sister Bel · Whitewall                             │
│                              │                                                     │
│  ○ Line and Water            │  Something is in the grain.                         │
│    Speak to Rell             │                                                     │
│                              │  ▸ Cull the rodents                          5/8    │
│  ○ Kerb and Course     BOARD │    Speak to Bel outside                             │
│    Set six stones        0/6 │                                                     │
│                              │  Rewards   Cull · Kindle · 16 mk                    │
│  ✓ First Light               │                                                     │
│  ✓ A Course of Stone         │  ┌──────────────┐  ┌──────────────┐  ┌───────────┐  │
│                              │  │    Track     │  │   Show me    │  │  Reset    │  │
│                              │  └──────────────┘  └──────────────┘  └───────────┘  │
└──────────────────────────────┴─────────────────────────────────────────────────────┘
```

Left column scrolls; right pane is the selected quest. `●` tracked, `○` active, `✓` done, `✕`
failed. Board quests are labelled and sort last. Done quests collapse to one line.

### 4.3 Truths

`STORY.md` §10 calls Truths "the real carryover" and `SYSTEMS.md` §9 has no field for them. They are
**world-scope**: earned in any campaign, never reset, never lost.

```json
"truths": [
  { "id": "overdraw", "day": 22, "campaign": "light", "quest": "light.13" },
  { "id": "wagon.eighth", "day": 24, "campaign": "light", "quest": "light.14",
    "superseded": { "by": "wagon.longacre", "day": 96, "campaign": "neutral" } }
]
```

Text lives in `data/truths.json`, keyed by id, so a Truth's wording can be rewritten without
touching a single save. **The supersession relation is data too** — a Truth declares what it
overturns, and awarding it stamps the old one. There is no per-Truth code:

```json
"thirty.years": { "text": "Thirty years of overdraw, signed every year.",
                  "campaign": "light", "story": "L22", "supersedes": "overdraw" },
"root.longacre": { "text": "The root of the Forge is under Longacre.",
                   "campaign": "neutral", "story": "N16",
                   "supersedes": ["vermin.field", "seam.west"] }
```

`js/game/journal.js` `truthChains()` groups known Truths into **connected components**, not linear
chains: `supersedes` takes an array, so one Truth can overturn two and the block still renders once
with both struck lines above it. Within a block, struck lines come first in the order they were
learned and the line that still stands is last. A Truth is struck only when the Truth that overturns
it is actually in the journal — the catalogue never strikes anything on its own.

**Thirty-four Truths, in eleven chains.** `STORY.md` §8.5 is the catalogue and `data/truths.json`
carries it verbatim: Light 10, Dark 12, Neutral 12, of which **23 are overturned** across the
trilogy. The nine recontextualisation moments this section used to list as unwired (D06, D07, D16,
D18, D21, N08, N10, N14, N17) now all award a Truth. Two chains are three deep *and* three wide —
`prices.raids` strikes three at once and `root.longacre` strikes three, one of them already the head
of its own chain — and both render correctly (verified on screen at 844 × 390; the block is five and
six rows tall, which fits).

**Recontextualisation is a strikethrough, not a note in a design document.** `STORY.md` §5's
contract table becomes this screen, and it is the only place the player can see the trilogy's
structure:

```
┌────────────────────────────────────────────────────────────────────────────────────┐
│  ✕     QUESTS          TRUTHS  (14)          LOG                                   │
├────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                    │
│  ◐  A wagon leaves Whitewall every eighth day.                            Day 24   │
│                                                                                    │
│  ◐  ~~Blackstone attacked the water-stands unprovoked.~~                  Day 31   │
│  ◑  They came for water. The ones who ran were carrying buckets.          Day 78   │
│                                                                                    │
│  ○  Whitewall draws above the covenant.                                   Day 22   │
│                                                                                    │
│  ○  The Water is dead before it reaches Blackstone.                       Day 40   │
│                                                                                    │
│  ●  ~~A Delver broke and gave up the shaft.~~                             Day 33   │
│  ●  Someone let themselves be taken, and told the truth on purpose.       Day 81   │
│                                                                                    │
│  ────────────────────────────────────────────────────────────────────────────────  │
│  ○ Whitewall    ◐ Blackstone    ● Longacre        14 of 34 known                   │
└────────────────────────────────────────────────────────────────────────────────────┘
```

- The old Truth is **kept and struck through**, with the new one directly under it. Deleting it
  would erase the thing the mechanic is about.
- Campaign origin is a **filled/half/open ring**, not a colour — see §9.2.
- The count `14 of 34` is the only completionist pressure in the game and it is deliberate; a player
  who sees `14 of 34` after finishing Light knows there is a shape they have not seen.
- Tapping a Truth jumps the Log tab to the scene that granted it.

### 4.4 The one-portrait-two-names device

`REVIEW.md` §6.2 asks that Dob's reveal live in the UI rather than in a line of dialogue. The
journal's **cast** strip (bottom of the Truths tab, deferred with the Neutral campaign) shows one
portrait per known face. When N24 resolves, "Cousin Ansel" and "Kettle" merge into one portrait with
two struck-through names above the third. That is the whole implementation, and it is one effect:
`['merge', 'ansel', 'kettle', 'dob']`.

---

## 5. Save

### 5.1 It reuses `editor/store.js`, it does not reimplement it

`js/editor/store.js` already solves private-mode Safari, a full quota, corrupt bytes and the
`.broken` backup, and it solves them correctly — the boot probe at line 40 exists because both
failures throw on write and never on read. Reimplementing that for the save would be the second
place in the codebase where storage health is tracked, and one of them would rot.

**Done.** `read` / `write` / `drop` / the boot probe / `storageHealthy` / `storageError` live in
`js/kv.js`; `store.js` imports them and re-exports the two accessors, so its public API is
unchanged. The probe fires once for the whole app under the key `forge.probe`. `js/game/save.js`
supplies `normalise` and `js/game/savestore.js` is the twenty lines that look exactly like
`store.js`.

Keys, following the existing naming (`forge.scene`, `forge.slot.<name>`, `forge.slots`):

| Key | Contents |
|---|---|
| `forge.save` | the working save |
| `forge.save.broken` | verbatim bytes of the last save that failed to parse |
| `forge.save.slot.<name>` | manual copies |
| `forge.save.slots` | index array |

### 5.2 What is stored

Everything in `SYSTEMS.md` §9, plus five additions the review requires, minus the wall-clock stamps
(§1.6).

```json
{
  "v": 1,
  "seed": 2748193042,
  "created": 1786312800000,
  "played": 7382.4,

  "clock": { "t": 990.667 },

  "campaign": { "current": "light", "act": 2, "done": [], "echoes": [],
                "postures": {} },

  "faction": "light",
  "worn": null,

  "schools": { "kindle": 4210, "ward": 980, "line": 6640, "forage": 2210,
               "cull": 3880, "hearth": 1740, "mend": 320, "barter": 910,
               "setting": 460, "glamour": 0 },

  "vitals": { "hp": 48, "focus": 61 },
  "purse":  { "marks": 218, "banked": 1400 },
  "standing": { "light": 26, "neutral": 4, "dark": -12 },

  "items": [ { "id": "silverling", "n": 4, "caught": 1786312790000 },
             { "id": "thread", "n": 6 } ],
  "bank":  [ { "id": "chalk_trout", "n": 22 } ],

  "stave":  { "id": "ash_stave", "integrity": 71.4 },
  "charms": [ { "id": "coarse_line", "tier": 1, "school": "line",
                "mod": "bite", "mag": 0.04, "integrity": 96.0 }, null, null ],

  "pins": ["kindle", "line", "forage"],

  "known": { "recipes": ["cook_silverling"], "appraised": ["silverling", "rat_tail"] },
  "atlas": { "ferry": ["light", "neutral"], "nodes": [3, 7, 11, 12, 19] },

  "quests": {
    "light.01": { "s": "done" },
    "light.02": { "s": "active", "i": 1, "c": { "catch": [3] },
                  "t": 41.2, "e": 0, "scene": null }
  },
  "tracked": "light.02",
  "flags": { "sold.once": true },
  "truths": [ { "id": "overdraw", "day": 22, "campaign": "light", "quest": "light.13" } ],
  "log": [ … last 200 dialogue lines … ],

  "at": { "x": -63.2, "y": 4.9, "z": 18.4, "yaw": 1.92,
          "area": "wwa.market", "door": null, "rev": 12 },

  "ledger": { "day": 41, "sold": { "silverling": 14, "rat_tail": 8 } },
  "daily": { "day": 41, "standing": { "light": 2.5 }, "mended": ["fence.7"],
             "reforgeT": 964.0 },
  "board": { "day": 41, "ids": ["s.01#a3", "s.05#b1", "s.19#c7"] },

  "settings": { "flip": false, "haptics": true, "aimAssist": 1,
                "uiScale": 1.0, "holdAssist": false, "factionMarks": false,
                "motion": 1, "volume": 0.8 },

  "onboard": { "move": true, "look": true, "cast": true, "dial": false,
               "context": true, "channel": false }
}
```

The additions to `SYSTEMS.md` §9:

| Addition | Why |
|---|---|
| `clock` | §1. Nothing else can express "before the bell" across a reload. |
| `truths`, `flags` | `REVIEW.md` B8 / S12(j). The trilogy's carry-over had no field. |
| `at` | Mid-quest position. See §5.3. |
| `campaign.postures` | `REVIEW.md` S12(j) — L27's binary and N25's three postures were unstored. |
| `quests[].scene`, `quests[].t`, `quests[].e` | `REVIEW.md` S12(g) — N18 and N19 are location-states. `t` is the world-hour the step started; **`e` is elapsed real seconds in the step and is zeroed on load**, because `within` and `survive` are combat-timescale (`SYSTEMS.md` §9.2). `c` is keyed by **step id** and holds an array, one count per objective — two objectives in one `all` step can target the same kind, so a kind-keyed map would collide. |
| `faction` split from `worn` | `REVIEW.md` S10. `player.zoneId` is the true faction; appearance is separate. |
| `onboard` | Which gestures have been demonstrated. See §7. |
| `daily`, `board` | `SYSTEMS.md` §9.2 requires Standing caps, the Mend first-repair set, Reforge and the board to survive a reload and clear on the day boundary. One block, cleared by `crossedDay`. |

### 5.3 Position, and why `SYSTEMS.md` was right to be nervous

`SYSTEMS.md` §9 stores no position because "a save inside geometry that has since changed" is a real
failure. The brief requires position. Both are satisfied by **storing it with the evidence needed to
distrust it**:

```
at = { x, y, z, yaw, area, door, rev }
```

`rev` is the scene document revision (`demo.builder.doc.rev`, already tracked — `doors.js:169`
watches it). On load:

1. If `rev` does not match the current document → discard `at`, spawn at the town hearth for `area`.
2. If `door` is set, re-enter that interior through `doors.jump(i)` (`doors.js:67`) rather than
   trying to restore an interior-local position.
3. Otherwise sample the ground at `(x, z)`. If `|groundAt() - y| > 2` → discard, spawn at the
   hearth.
4. Otherwise restore, and run one `walkStep` against the collider set to push out of anything the
   player is inside.

A discarded position is not an error and is never reported to the player. Waking at the hearth is
already the gutter behaviour, so it reads as intended.

### 5.4 What is derived and never stored

| Derived | From |
|---|---|
| every school **level** | `levelFor(xp)` — a save can never disagree with itself |
| Attunement | sum of levels |
| `HpMax`, `FocusMax`, regen, power, crit | Ward / Hearth / school levels |
| quest **availability** | `prereq` predicates against the live state |
| board contents | `rng(seed ^ day ^ town)` |
| node state | reset to `ready` on load, per `SYSTEMS.md` §9.2 — cheaper and kinder than persisting 200 timers |
| freshness | wall-clock delta from `caught`, clamped at 20 minutes (`SYSTEMS.md` §9.2) |
| board contents, daily caps, glut | `dayOf(clock.t)` against the stored `day` |
| suspicion, Ash, streaks, glut *within* the day | session-scoped, reset on load by design |
| which gestures to teach | `onboard` flags plus the current quest |

### 5.5 Migrations

Exactly `editor/scene.js`'s shape (`scene.js:122–147`), not `SYSTEMS.md` §9's sketch, because
`scene.js` is the one that is actually working and it handles the newer-than-build case.

```js
export const SAVE_VERSION = 1;

const MIGRATIONS = {
  // 1 → 2, when it happens: worked example, kept in the file as the pattern
  // 1: raw => ({ ...raw, v: 2, schools: { ...DEFAULT_SCHOOLS, ...raw.schools } }),
};

export function normalise(raw) {
  const fail = error => ({ doc: null, error, warnings: [] });
  if (!raw || typeof raw !== 'object') return fail('not a save');

  const v = num(raw.v, 1);
  if (v > SAVE_VERSION) return fail(`saved by a newer build (v${v}; this one reads v${SAVE_VERSION})`);

  const warnings = [];
  for (let from = Math.max(1, v | 0); from < SAVE_VERSION; from++) {
    if (!MIGRATIONS[from]) return fail(`no migration from v${from}`);
    raw = MIGRATIONS[from](raw);
    warnings.push(`upgraded v${from} → v${from + 1}`);
  }
  return { doc: clampAll(raw, warnings), error: null, warnings };
}
```

`clampAll` does the untrusted-input pass, same discipline as `scene.js:131`:

| Case | Behaviour |
|---|---|
| unknown item id | dropped, one warning naming it. **Never throws.** A save from a build with a since-renamed item must still load. |
| unknown quest id | the entry is dropped and a warning names it; a quest that no longer exists cannot block a prereq |
| unknown truth id | **kept**, rendered as its raw id. Truths are the carry-over; losing one silently is worse than showing an ugly string. |
| number out of range | clamped, warning |
| missing school | filled from `DEFAULT_SCHOOLS` at 0 |
| `worn` set to a faction that no longer exists | `null` |
| corrupt JSON | `forge.save.broken` gets the verbatim bytes, `store.js` behaviour reused |

### 5.6 An older save, precisely

1. Bytes read. Parse fails → back up to `.broken`, offer New Game / Load a copy. Never overwrite the
   broken bytes.
2. Parse succeeds, `v < SAVE_VERSION` → migrate forward one step at a time. Each migration is a pure
   function of the previous shape.
3. `clampAll` fills defaults for every field the new version added. **A field added in v2 must have
   a default that produces v1 behaviour**, which is the rule that keeps migrations to one line.
4. Warnings accumulate. If any, a single calm line appears in the pause menu the first time it is
   opened: `This save was made by an older build. 2 things were adjusted.` — tapping shows the list.
   Never a modal, never on the boot screen.
5. The migrated save is not written back until the next normal autosave, so a migration bug does not
   destroy the original on the first frame.

### 5.7 When it writes

Every 10 s of unpaused play, and immediately on: step change, quest state change, act transition,
entering or leaving a building, scene end, market transaction, gutter, `visibilitychange → hidden`,
and `pagehide`. Never during a channel (the write is deferred to its release). Writes are skipped
when nothing has changed since the last one, which on a phone matters.

---

## 6. HUD and menus

### 6.1 The control layout, and a disagreement with `SYSTEMS.md` §3.3

`SYSTEMS.md` §3.3 puts the two buttons at "the bottom of the move-stick side so the casting thumb is
never covered". That is the wrong way round on the hardware this actually runs on:

- The move stick is a **floating** stick (`input.js:60`) — it appears wherever the left thumb lands,
  and the left thumb rests low and near the edge. A button in the bottom-left corner is under it.
- Move is the only *continuous* input. Cast, dial and context are all *discrete*. The only pair a
  player performs simultaneously is move + look/cast, never cast + context.

So: **left half is locomotion and nothing else. Every button is on the right, in the bottom-right
thumb arc.** `flip` mirrors the whole arrangement, and `index.html` already has `#fire` as the
right-half pad with a 66 px circle drawn at `right: 26px; bottom: 26px` (`style.css`) — the
affordance is in the file already.

```
┌────────────────────────────────────────────────────────────────────────────────────┐
│ ♥ ▓▓▓▓▓▓▓▓▓▓▓░░░░  118/164                                    Day 3 · Rising    ⚙  │
│ ◆ ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒░░░  92/164                                                    │
│                                                                                    │
│  THE GRANARY                                                                       │
│  Cull the rodents            5/8                                                   │
│                                                                                    │
│                                                                                    │
│                                                                                    │
│                                                                                    │
│                        the world. Nothing is drawn over it.                        │
│                                                                                    │
│                                                                                    │
│                                                                                    │
│                    ╭─────╮                                                         │
│                    │  ●  │  floating stick                            ╭───╮        │
│                    ╰─────╯  (left half, anywhere)              ╭────╮ │   │        │
│                                                                │KNDL│ │ ✦ │        │
│                                                                │ 8  │ │   │        │
│                                                                ╰────╯ ╰───╯        │
└────────────────────────────────────────────────────────────────────────────────────┘
```

| Element | Position | Size | Notes |
|---|---|---|---|
| Health | top-left, below `safe-area-inset-top` | 132 × 6 px | `♥` glyph, number only when below 100% |
| Focus | under health | 132 × 6 px | `◆` glyph; goes red at Guttered |
| Tracker | under Focus | 2 lines | §4.1 |
| Day / bell chip | top-right, left of `⚙` | 104 × 22 px | `Day 3 · Rising` — the **last bell**, never a digital hour. See below. |
| School dial | bottom-right, 106 px from the right edge | 60 × 60 | school name + Focus cost; doubles as the charge ring |
| Context button | bottom-right corner, 26 px inset | 76 × 76 | greyed when nothing is in range |
| Menu cog | top-right corner | 38 × 38 | **added.** The dev panel's own cog is hidden in play mode, so the corner was free and the pause menu needed a way in that is not a keyboard key |

**Built, in `js/game/hud.js`, exactly as drawn, with four notes.** `style.css`'s `#fire::after`
drew a 66 px circle at `right: 26px; bottom: 26px` — the same spot as the context button — so in
play mode that decoration is hidden; the real button is the affordance now. Every dimension on
this screen is `calc(N * var(--ui))`, including the tracker's top offset, so §9.1's text-size
slider moves the whole layout and not just the type. The buttons live inside `#game`, which is a
sibling of `#stage` and `#touch`, so a press on one never reaches `input.js`'s pointer handlers
and never starts a look-drag — **`input.js` needed no change for this**. And the two vitals bars
carry their numbers to the right of the bar rather than inside it, because at 132 × 6 px there is
no inside.

**There is no clock on the HUD.** `STORY.md` §4 makes Whitewall's Lantern Spire the valley's clock
and says the HUD never needs to show an hour, which is right — a digital readout would flatten the
best sound cue in the game. The chip shows the day and the name of the **last bell that rang**
(`Rising` 06:00, `High` 12:00, `Setting` 18:00, `Low` 21:00), which is exactly what a character in
that world knows. It pulses for 3 s as each bell lands, and that pulse is also the deaf player's
version of the bell (§9.3). Blackstone's shift horns update the same chip with `First` / `Second` /
`Third`; in Longacre, which rings nothing, the chip shows only the day.

Everything else — marks, standing, suspicion, buffs, integrity — is **not on the HUD**. Marks appear
in the market panel and for 2 s after a transaction. Buffs are a single 12 px pip beside the Focus
bar. Suspicion is a ring around the context button, drawn only above 10 (`SYSTEMS.md` §7.3 already
specifies this and it is the right call). This is the whole HUD. There is no minimap, no compass, no
hotbar and no damage numbers.

### 6.2 The school dial

Tap cycles the three pinned schools. Long-press (400 ms) opens a radial of every unlocked school;
drag to one, release to select; releasing on the centre pins the current three.

```
                      ╭─────────╮
                 ╭────┤  WARD   ├────╮
            ╭────┤    ╰─────────╯    ├────╮
            │ MEND│                  │KNDL │
            ╰────┤    ╭─────────╮    ├────╯
                 │    │  pin 3  │    │
            ╭────┤    ╰─────────╯    ├────╮
            │FORG │                  │CULL │
            ╰────┤    ╭─────────╮    ├────╯
                 ╰────┤  LINE   ├────╯
                      ╰─────────╯
```

Six unlocked schools in the first playable, so the radial is six segments of 60°, each 88 px across
at the ring radius — comfortably above the 44 px target. Ten schools is 36° segments, which is the
reason the radial is drag-and-release rather than tap: you never have to hit a small thing, you have
to *point* at it.

During a channel the dial's ring fills clockwise from the top and the school name is replaced by the
charge multiplier (`1.0×` → `1.8×`). That is the charge ring `SYSTEMS.md` §5.2 asks for, and it is on
the widget the player is already looking at rather than a new one in the middle of the screen.

**Built, with one correction found on screen.** A ring drawn around a bottom-corner button hangs
half of itself off the edge — at 844 × 390 three of six segments were unreachable. The radial is
therefore **drawn centred on the screen and aimed from the thumb**, which is still on the dial:
`origin` is the viewport centre, `aimFrom` is the pointer-down point, and `aimRadial` measures the
angle from `aimFrom`. The gesture is a *direction*, so the two origins can differ and it still
reads correctly — and it is the reason ten schools at 36° will work in the same widget. The dead
zone is 28 px, below which nothing is picked and releasing keeps the current school.

The unlocked set the radial offers is `sheet.js` `unlocked(doc)`: **a school is open the first time
it is trained or when a quest sets `flags['school.<id>']`, and Kindle is always open** because the
opening's first input is a cast. There is no separate unlock ledger to keep in step with the XP the
player already has.

### 6.3 The context button

One button, one meaning, driven by proximity. Never more than one thing is in range because the
picker takes the nearest by `angle + distance × 0.06`, the same cost function `SYSTEMS.md` §3.3 uses
for aim.

| Glyph | Meaning | Range |
|---|---|---|
| `✦` | work this node (fish, forage, break, mend, set, light) | 3.5 m |
| `❝` | talk | 4.0 m |
| `⇄` | sell / buy | 3.5 m |
| `▸` | advance dialogue | — |
| `↑` | climb (stairs — `climb.js` already owns this) | 2.0 m |
| — | greyed, no target | — |

**Doors are not on the context button.** `doors.js` already enters a building by walking at it
(`watchOutside`, line 191, requires the player to be moving *toward* the door), it works, and adding
a press to something that already happens is a regression. One fewer gesture to teach.

The button label shows the verb in 9 px caps under the glyph when there is room, e.g. `✦ FISH`.

**Built. Where the targets come from is the open end.** `session.retarget()` reads
`world.targets()` — a list of `{ id, kind, label, x, z, range }` supplied by `main.js` — and picks
the cheapest by `distance × 0.06`, the same cost term `combat.acquire` uses, so the button and the
bolt never disagree about which thing is nearest. `nodes.js` and `enemies.js` will supply the real
list. **Until then `main.js` supplies a stand-in: the nearest wandering crowd figures answer to the
first six ids in `data/cast.json`**, which makes `❝ TALK` real and lets `questrunner.sceneFor(npc)`
open exactly the dialogue node the tracked step is waiting for — and nothing else, so talking can
never get ahead of the quest it belongs to. Delete the stand-in when Track D places the cast.

The channel lives here (§11.2 decision 1): 350 ms of hold on the context button starts it, release
completes it, and `holdAssist` turns it into tap-to-start / tap-to-release. The charge ring is on
the dial either way.

### 6.4 The faction-select slate

`main.js` currently boots straight into the world. The boot decision moves into `js/game/boot.js`:
`?shot=` or `?editor=1` → no session, no slate, world as today. Otherwise: an existing save loads
straight into the world with a Continue; a new save shows the slate.

```
┌────────────────────────────────────────────────────────────────────────────────────┐
│                                                                                    │
│                                    F O R G E                                       │
│                                                                                    │
│   ╭──────────────────────╮  ╭──────────────────────╮  ╭──────────────────────╮     │
│   │░░░░░░░░░░░░░░░░░░░░░░│  │▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│  │██████████████████████│     │
│   │░░░  WHITEWALL   ░░░░░│  │▓▓▓   LONGACRE   ▓▓▓▓▓│  │███  BLACKSTONE   ████│     │
│   │░░░░░░░░░░░░░░░░░░░░░░│  │▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│  │██████████████████████│     │
│   │░░░░░░░ ( ) ░░░░░░░░░░│  │▓▓▓▓▓▓▓ [ ] ▓▓▓▓▓▓▓▓▓▓│  │███████ /\ ███████████│     │
│   │░░░░░░░░░░░░░░░░░░░░░░│  │▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│  │██████████████████████│     │
│   │                      │  │                      │  │                      │     │
│   │  Start here.         │  │                      │  │  Finish Whitewall.   │     │
│   │  Everyone does.      │  │                      │  │                      │     │
│   ╰──────────────────────╯  ╰──────────────────────╯  ╰──────────────────────╯     │
│         pale limestone             thatch                    slate                 │
│                                                                                    │
│                        Longacre has nothing to teach you yet.                      │
│                                                                                    │
└────────────────────────────────────────────────────────────────────────────────────┘
```

- Three slates west to east, matching the map. 240 × 200 px each, 24 px apart.
- **The Longacre slate is tappable from the very first launch and it answers.** It is not greyed, it
  is not disabled, and it does not have a lock on it. Tapping prints the line at the bottom of the
  screen for 3 s. `REVIEW.md` §7 calls this the single best piece of foreshadowing available for
  free; it is implemented as `onTap` on a normal button with no `disabled` attribute, and there is a
  node test asserting that.
- Blackstone is a silhouette at 30% until Light is complete.
- The three states after that are `STORY.md` §10's table verbatim, driven by `campaign.done`.
- The `( ) [ ] /\` marks are the faction shapes from §9.2 — round arch, square, lancet — and they are
  the reason this screen works without colour.
- The epilogue after N26 is delivered **over this screen**, per `REVIEW.md` §6.9.

**Built.** The state table is pure, in `js/game/towns.js` `slate(doc)`, and `js/game/slate.js` draws
it and resolves a promise with the chosen campaign. The boot decision moved into `js/game/boot.js`
as `bootMode(params) → 'shot' | 'editor' | 'play'`, which is three lines and node-testable; `?shot=`
wins over `?editor=1` so the harness can never be diverted. Panels are 200 × 178 px rather than
240 × 200 — three of the larger ones plus the title and the reply line did not leave a comfortable
margin at 390 px tall. The reply line is a permanent 20 px row under the panels, so the layout does
not jump when Longacre answers.

**`?editor=1` is new and Track A should know about it.** Play is now the default for a bare
`index.html`, which means `body.playing` hides the dev row (§10.4). `?editor=1` starts no session
at all: no `#game`, no `game.css`, no clock or audio knobs, orbit camera, and the perf readout,
editor toggle and audio-lab link all present exactly as before. Settings → Developer panel also
brings the knob panel back without leaving the game.

### 6.5 The market panel

Thirteen item types with per-item glut and freshness on 390 px is the hardest UI in the game.

```
┌────────────────────────────────────────────────────────────────────────────────────┐
│  ✕   WHITEWALL MARKET                                    Barter 4        218 mk    │
├────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                    │
│   Silverling            × 5      ●●●●○ ▁▁▁▁▁         7 mk ea            35 mk  [✓] │
│   Rat tail              × 8      ─     ▁▁▂▃▄         2 mk ea            16 mk  [✓] │
│   Chalk sage            × 2      ●●○○○ ▁▁▁▁▁        14 mk ea            28 mk  [ ] │
│   Weed                  × 3      ●○○○○ ▁▁▁▁▁         1 mk ea             3 mk  [ ] │
│   Stone chip            × 6      ─     ▁▁▁▁▁         2 mk ea            12 mk  [ ] │
│                                                                                    │
│                                                                                    │
├────────────────────────────────────────────────────────────────────────────────────┤
│   ●●●●○ fresh    ▁▄ market is full of these                                        │
│                                                                       ┌──────────┐ │
│   Selling 13 items                                          51 mk     │   SELL   │ │
│                                                                       └──────────┘ │
└────────────────────────────────────────────────────────────────────────────────────┘
```

| Rule | Reason |
|---|---|
| One row per stack, 34 px tall, whole row is the toggle | No stepper for the common case. Selling everything of a type is what players do. |
| Long-press a row → quantity stepper | The uncommon case gets the extra gesture, not the common one. |
| Freshness is five pips, glut is a five-bar sparkline | Two different shapes, so they cannot be confused, and neither needs colour |
| Non-perishables show `─` for freshness | Absence is clearer than a full bar |
| **Unit price updates live as rows are ticked** | Glut is per-type and cumulative; if the price only changed after the sale it would read as a cheat. Ticking the 8th rat tail visibly drops the unit price. |
| Total and Sell are pinned bottom-right | Thumb reach; the list scrolls under them |
| No buy tab in the first playable | The opening's one decision (`SYSTEMS.md` §6.4) is four items; that is a three-row sheet from the vendor's own `talk`, not a shop screen |

Every number comes from `sim/economy.js`. The panel contains no arithmetic.

**Built as two files: pure `sale.js`, adapter `market.js`.** `sale.quote()` prices every ticked row
against one shared ledger, in list order, and returns the ledger it *would* write — nothing is
committed until SELL, so the live price is exact rather than an estimate. Three things the sketch
did not settle:

- **The sparkline steps four units, not one.** Glut moves 2 % per unit against a floor 65 % down, so
  five one-unit samples round to the same bar five times over. Four is the resolution the mechanic
  actually has.
- **Freshness pips never read zero.** A stack at the 0.5 floor shows one pip, not none, because none
  reads as "worthless" when it is in fact half price.
- **The haggle key is `flags['haggle.<vendor>']`**, not the quest flag. `light.03.haggled` is L03's
  narrative branch and drives that quest; it is deliberately not what the market reads, or every
  vendor in Whitewall would honour a price Wick agreed once.

Items with `ITEM_VALUE` 0 (`hearth_ash`, `foul_water`) are not offered at all — a row nobody will
buy is noise.

### 6.6 The character sheet

One screen, no tabs, no scrolling at 844 × 390.

```
┌────────────────────────────────────────────────────────────────────────────────────┐
│  ✕   CHARACTER                                                   WHITEWALL  ( )    │
├────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                    │
│   GRASP  31                         Health   164        Focus   164   +12.5/s      │
│                                                                                    │
│   Kindle    4  ▓▓▓▓▓▓░░░░      Hearth    3  ▓▓▓░░░░░░░      Ash stave    71%       │
│   Ward      2  ▓▓░░░░░░░░      Mend      1  ▓░░░░░░░░░                             │
│   Line      6  ▓▓▓▓▓▓▓▓▓░      Barter    2  ▓▓▓▓░░░░░░      ◆ Coarse line  +4%     │
│   Forage    3  ▓▓░░░░░░░░      Setting   1  ▓░░░░░░░░░      ◇ empty                │
│   Cull      5  ▓▓▓▓▓▓▓░░░      Glamour   —  locked          ◇ empty                │
│                                                                                    │
│   ─────────────────────────────────────────────────────────────────────────────    │
│   Standing    Whitewall  Trusted      Longacre  Plain       Blackstone  Watched    │
│   Echoes      none yet                                                             │
│   Truths      14 of 34                            Played  2 h 03 m · Day 41        │
│                                                                                    │
└────────────────────────────────────────────────────────────────────────────────────┘
```

Two columns of five schools, each with level and a bar showing progress to the next level (not to
20 — the bar must always be moving). Locked schools show `—` and the word `locked`, never a level 0.
The faction mark `( )` is beside the town name in the header.

**Built, and the stat is `GRASP`, not Attunement.** `STORY.md` §12 asked the systems designer to
rename it and `CLAUDE.md`'s canonical-terms table has already retired Attunement; this sketch was
the last place it survived. The model is pure, in `sheet.js` `sheetOf(doc)`, so the sheet has no
arithmetic either. Layout as built is three columns — five schools, five schools, then the stave
and the three charm slots — which fits at 844 × 390 with room to spare and scrolls at `uiScale`
1.4. Marks are on this screen, which is where a player looks for them; they are still not on the
HUD.

### 6.7 The pause menu

```
┌────────────────────────────────────────────────────────────────────────────────────┐
│                                                                                    │
│                             ┌────────────────────────┐                             │
│                             │        RESUME          │                             │
│                             ├────────────────────────┤                             │
│                             │        Journal         │                             │
│                             │        Character       │                             │
│                             │        Settings        │                             │
│                             ├────────────────────────┤                             │
│                             │        Wait until…     │                             │
│                             │        I am stuck      │                             │
│                             └────────────────────────┘                             │
│                                                                                    │
│                       saved · Day 41, 06:40 · Whitewall                            │
│                                                                                    │
└────────────────────────────────────────────────────────────────────────────────────┘
```

Seven rows, 44 px each. Settings holds the accessibility knobs from §9 and a link to the developer
panel. `Wait until…` is §1.5. `I am stuck` is §9.4. The save line is the reassurance that replaces a
save button.

Opening the pause menu pauses the clock and the sim and dims the render to 40% — it does not stop
rendering, because a black screen on a phone reads as a crash.

---

## 7. Onboarding

Six gestures, zero teaching today: floating stick, look-drag, tap-to-cast, channel-hold, school
dial, context button. The method is **gate by insufficiency** — each control is introduced at the
moment the previous one stops being enough — and the text budget for the whole thing is **nine
lines of four to six words**, printed one at a time, bottom-centre, 12 px, 55% opacity, fading after
4 s or on first use.

The onboarding script is data (`js/game/onboard.js`, one array of `{ when, show, until }`), and every
prompt is suppressed forever once its `onboard` flag is set (§5.2), including across a New Game —
because a returning player teaching themselves the stick again is insulting.

### The first ninety seconds

Per `REVIEW.md` S2: it opens in the granary, at night, and the player's first input is a cast.

| Time | What happens | What is taught |
|---|---|---|
| 0:00 | Black. One line of audio: `stream` far off, then a scuff. Fade up over 1.5 s. | — |
| 0:03 | The granary interior. One lamp guttering, `time` 4.2, the room mostly dark. A grain rat is lit, 6 m away, back turned, chewing. It is the only bright thing. Nothing on screen. | the eye goes to the rat |
| 0:06 | Prompt: **Drag to look.** Only the right half responds. The move stick does not appear yet. | look-drag, in isolation |
| 0:09 | The player centres the rat. The prompt clears. New prompt: **Tap to cast.** | tap-to-cast |
| 0:11 | First bolt. Two taps kill it (`SYSTEMS.md` §4.2's most important number). `impactWood`, a small bloom, the rat is gone. Cull 2 and Kindle 2 arrive as two 11 px lines beside the Focus bar — no fanfare, no modal. | the loop |
| 0:14 | Bel, from outside, off-screen bark, no camera change: *"That is one."* / *"There will be seven more in there."* | the game has a voice; barks do not stop you |
| 0:16 | Seven more rats scatter from the far end and start running. Prompt: **Drag to move.** The left half activates. | the floating stick, with a *reason* to move |
| 0:20–0:55 | Seven rats in a dark room. They flee at 30% HP and return after 4 s (`SYSTEMS.md` §4.1), so the player is forced to walk, turn, and cast — all three at once, without being told to. Two of them run behind sacks, which teaches that the world blocks bolts. | move + look + cast, integrated |
| 0:57 | Last rat. The lamp gutters out. The room is dark except the doorway. | — |
| 1:00 | Prompt: **Walk at the door.** | doors are automatic — the one gesture that *is not* a gesture |
| 1:04 | Outside. Dawn, `time` 5.6, the clock starts. Whitewall's street, the Lantern Spire, the water bright. The first thing the player sees is the best-looking frame in the tutorial. | the world |
| 1:08 | Bel is eight metres away. Context button lights: `❝ TALK`. Prompt: **The button acts.** | context button |
| 1:12–1:30 | Three bubbles. She takes the tails, pays 16 mk, and says Rell wants five silverling. Quest complete; `light.02` offered. The marks counter appears for 2 s and then goes away, which is how the player learns the HUD is not going to shout. | dialogue, turn-in, the offer |

Deferred to their first use, not taught here:

| Gesture | Taught at |
|---|---|
| **Channel-hold** | `light.02` step 2, at the water. Prompt: **Hold to cast the line.** The prompt is on the context button, not the look half — `REVIEW.md` S4 is right that a 4.15 s drift-free hold on the look half is not a reliable input. |
| **School dial** | The moment a second school is unlocked (Line, at the end of `light.02`). The dial pulses once. Prompt: **Tap to change school.** |
| **The radial** | Never prompted. It is discovered by long-pressing the thing that already responds to a tap, which is the standard idiom. A one-line hint appears in Settings. |
| **Sprint** | Never prompted on touch. There is no sprint gesture on touch and there should not be one. |

**The left-handed flip.** `REVIEW.md` §5.6 correctly notes the `flipTouch` knob is buried in the
quality panel where a left-handed player will never find it. It is promoted to the top of Settings
*and* offered once, at 0:16, as a second line under **Drag to move**: `left-handed?` — a 44 px tap
target that sets the flag and mirrors the layout immediately. One tap, once, at the only moment it
is relevant.

---

## 8. Audio

### 8.1 How the lab plugs in

`audio/` is a complete, working synthesis stack: `audio/js/core.js` builds the graph (dry bus,
convolution reverb, DC cut, saturator, compressor, master, analyser) and `audio/js/sfx.js` has 51
one-shots behind a single call. Neither design document mentions sound once.

The bridge is one file and it imports rather than copies:

```js
// js/game/audio.js
import { createEngine } from '../../audio/js/core.js';
import { fire, SFX } from '../../audio/js/sfx.js';
```

| Concern | Answer |
|---|---|
| iOS autoplay | The engine is constructed lazily on the first real tap — the boot screen's Continue / slate tap. `audio/js/bench.js` already does exactly this (`ctx.resume()` plus a silent one-sample buffer to unlock iOS); reuse that function. |
| Positioning | **No `PannerNode`.** Every SFX already exposes a `level` param, so a world sound is `fire(eng, id, { level: base * atten(d) })` with `atten(d) = clamp(0, 1, 1 - d / range)²`. Two-dimensional, cheap, and correct enough for a third-person camera. Stereo panning is deferred; it is not free and it is not missed. |
| Voice budget | `eng.activeAt(t)` already counts live voices. Cap at 12; over the cap, drop the quietest pending one-shot. Footsteps and ambience are the first to go. |
| Garbage | `eng.reap()` once per second from the session tick. |
| Knobs | `volume` 0–1 (default 0.8), `mute` toggle, `ambience` 0–1. Registered in the `Audio` group, so the panel builds their UI for free. |

**The triage file is a contract.** `audio/js/triage.js` records Aaron's own verdicts from the first
listening session. `js/game/audio.js`'s sound map is checked against it by a node test: **using an
id in the `bad` bucket fails the test.** `pickupCoin`, `explosionBoom`, `explosionCrack` and
`impactThud` are rejected and the game may not use them.

### 8.2 The MVP sound list, and nothing more

Eighteen sounds. Every one is an existing id; nothing new is synthesised for the first playable.

| Event | Id | Bucket | Note |
|---|---|---|---|
| Cast, tap | `whooshFast` | keep | Aaron: *"sword swipe or magic effect… slower for magic"* — pitch down |
| Cast, charged | `whooshHeavy` | keep | |
| Impact | `spellHit` | unrated | `laser` (keep, *"a nice magical effect"*) is the fallback if the bench rejects it |
| Rat death | `impactWood` | keep | pitched down, per Aaron's note |
| Footstep | `footGrass` / `footGravel` / `footStone` / `footWood` | keep | by surface, `level` 0.35, every 0.42 s of walk |
| **The bell** | `impactMetal` | keep | Aaron: *"Kind of a bell, or a tubular bell."* This is the Lantern Spire, the valley's clock (`STORY.md` §4), and the thing several quests are timed against. It already exists and he already liked it. Struck 1–4 times, `level` falling with distance from Whitewall. |
| Shift horn | `impactMetal` | keep | same voice, pitched down and cut short. Blackstone answers the bell three times a day. Longacre rings nothing, and the silence is the point. |
| Lamp lit | `ignite` | keep | |
| Line cast | `bubble` | unrated | |
| Bite | `waterSplash` | keep | the fishing skill check's primary cue — see §9.3 |
| Ambience, water | `stream` | keep | looped near the creek, `level` by distance |
| Ambience, day | `bird` | keep | random 8–20 s, outdoors, `hour` 5.5–20.5 |
| Ambience, dusk | `insect` | keep | `hour` 18–22 |
| Ambience, hearth | `fireCrackle` | keep | indoors near a hearth |
| Door | `doorWood` | unrated | on `doors.begin()` |
| UI, navigate | `uiBlip` | keep | |
| UI, confirm | `uiConfirm` | keep | quest accept, sale, level-up (pitched up 4 semitones) |
| UI, refuse | `uiError` | keep | context button pressed with nothing in range |
| Wind | `windGust` | unrated | outdoors, above the wall line only |

Not in the MVP: music (the lab's music player was removed after the first listening session and
ambience beds do the job), combat voice, crowd, weather, and a coin sound (`pickupCoin` is rejected;
`coinsBag` is the candidate but is unrated — until it is, a sale plays `uiConfirm`).

`level`-only positioning means the whole audio layer is about 180 lines.

---

## 9. Accessibility and failure states

### 9.1 Text and motion

| Setting | Knob | Range | Mechanism |
|---|---|---|---|
| Text size | `uiScale` | 0.85 – 1.4, default 1.0 | sets `--ui` on `:root`; every UI dimension is `calc(N * var(--ui))`. **Tested at 1.4**: three dialogue choices plus a bubble is 294 px of 390, which fits. At 1.4 the market list shows four rows instead of six and scrolls. |
| Motion | `motion` | 0 – 1, default 1 | seeded from `prefers-reduced-motion`. At 0: no camera shake, no dial radial spin, no bloom pulse, dialogue camera eases become 0.15 s instead of 0.5 s, screen-edge vignette is static. The world keeps moving; only the *UI* stops. |
| Hold assist | `holdAssist` | toggle, off | every hold-to-channel becomes tap-to-start / tap-to-release. Required for the 3.0 s Graft channel and useful for the 1.2 s charge. The charge ring is identical either way. |
| Haptics | `haptics` | toggle, on | `navigator.vibrate` where it exists. It does not exist in Safari on iOS, so it is decoration — see §9.3. |
| Aim assist | `aimAssist` | 0 – 2, default 1 | scales the cone width in `acquire()` |
| Flip | `flip` | toggle | promoted out of the quality panel to the top of Settings (§7) |

### 9.2 Colour

The three factions are colour-coded and the entire disguise mechanic is about reading robe colour.
That is a real risk and it has three answers.

**1. Every faction has a shape, and the shape is already in the art.** `zones.js` gives Whitewall
round-arched windows, Longacre plain square ones and Blackstone tall lancets. That is a free,
diegetic, colour-independent alphabet:

| Faction | Mark | From |
|---|---|---|
| Whitewall / `light` | `( )` round arch | `zones.js` window head |
| Longacre / `neutral` | `[ ]` square | `zones.js` window head |
| Blackstone / `dark` | `/\` lancet | `zones.js` window head |

The mark appears on the slate screen, the character sheet header, Truth origin rings, standing rows,
market headers, and — behind a `factionMarks` toggle, default off — on NPC nameplates and on the
player's own robe as a small collar device. No addition to `zones.js`; the marks are UI glyphs.

**2. No mechanic may key on bolt colour.** `REVIEW.md` S11 measures neutral's core at luminance 0.905
against dark's 0.850 — a 6% difference on additive particles a few pixels across at 22 m/s. It is not
a tell for anyone, colourblind or not. Enforced as a review rule: if a system's only feedback is a
hue, it is broken.

**3. Every state that uses colour also uses a second channel.**

| State | Colour | Second channel |
|---|---|---|
| Health low | red | the bar pulses at 25%, and the vignette breathes |
| Focus guttered | red | the Focus glyph switches `◆` → `◇` |
| Freshness | none — pips | five filled/empty circles |
| Glut | none — sparkline | five-bar height |
| Suspicion | amber ring | ring *thickness*, and a tick sound at 40 / 70 / 90 |
| Elite enemy | rim tint | 1.35× scale, which the instance shader already carries |
| Quest state in the journal | none | `● ○ ✓ ✕` |

### 9.3 Audio-dependent mechanics get a visual

| Mechanic | Audio | Required visual |
|---|---|---|
| The bell (several timed quests) | `impactMetal` | the chip pulses and prints the bell name (`Rising`) for 3 s. Always on, not a setting. |
| Fishing bite (0.6 s window) | `waterSplash` | the charge ring **inverts** — filled becomes empty — and the context button grows 12%. `REVIEW.md` S4 widens the window to 0.9 s on touch, which this document adopts. |
| Enemy behind you | growl | a 40°-wide notch brightens on the screen edge in that direction. This is the only screen-edge indicator in the game. |
| Suspicion rising | tick | ring thickness (§9.2) |

Nothing in the game is discoverable by sound alone.

### 9.4 Failure states

**A level-3 player walks into a level-40 area.** `SYSTEMS.md` §4.4's `tierMul` answers XP and not
survival; at Ward 1 the player has 48 HP and a Watchman does 42.9. Four layers, cheapest first:

1. **Gate.** The two far towns are locked behind Standing `Trusted`, which `SYSTEMS.md` §7.1 already
   grants ("district gates unlocked"). The gate is a Watch patrol on the bridge who turns you back in
   dialogue — no damage, no invisible wall, and it is the same NPC class you later fight.
2. **Telegraph.** Crossing into a band more than 6 levels above `attunement / 10` prints one calm
   line, once per session: `The Watch keeps this road.` No skull icons, no red border.
3. **Band the countryside low.** The open ground and the creek between the towns carry band 1–12
   only, per `REVIEW.md` S6. Wandering is safe; the *towns* are the danger.
4. **The gutter is already gentle.** No XP loss, no corpse run (`SYSTEMS.md` §4.3). A player who
   ignores all three warnings loses 8% of carried marks and half their unbanked fish, and wakes at
   the hearth. That is a lesson, not a punishment.

**The player is stuck.** Three different problems, three different answers, all reachable from the
pause menu's `I am stuck`:

| Stuck | Detection | Fix |
|---|---|---|
| In geometry | position moved < 0.15 m for 4 s while the stick is > 0.5 | `Free yourself` — teleport to the nearest road or hearth anchor, no cost. Also offered automatically as a one-line prompt when detected, because a player wedged in a wall will not think to open a menu. |
| Cannot find the objective | 90 s active on a step with no progress event | the tracker gains a compass chevron pointing at the step's area. At 3 minutes, `Show me` appears in the journal and draws a ground line for 20 s. Neither is ever forced. |
| The quest itself is broken | the step's target does not exist in the world | `Reset this step` runs the step's `recover` action list (§2.4): move the player, respawn the kind, re-grant the item, re-arm the trigger. Every step that can strand a player is required to declare one, and `tools/lintQuests.mjs` warns on any `deliver` / `escort` / `goto` step without one. |

**A save cannot be read.** `.broken` backup, then New Game or Load a copy. Never a silent overwrite,
never a crash to a black screen.

**The phone rotates to portrait.** No `screen.orientation.lock` — it does not exist in Safari on
iOS. A full-screen card over the canvas, the session pauses, one line and a rotate glyph. Dismissed
only by rotating back. The editor and `?shot=` ignore orientation entirely.

**A phone call arrives mid-channel.** `visibilitychange → hidden` pauses everything and autosaves.
The channel is cancelled with a full Focus refund on resume — an interrupted 3 s Graft that ate 30
Focus and a Cinder Token because someone rang is exactly the kind of thing that gets a game deleted.

---

## 10. File plan

### 10.1 Pure — `js/game/`

No `three`, no DOM, no `Math.random`, no `performance.now`, no `Date.now`. They may import
`js/sim/` (Track C's balance modules) and nothing else. `node --test 'js/game/*.test.js'` runs
green with zero setup — there is no `package.json`, so the glob has to be quoted.

| Module | Owns | Public API |
|---|---|---|
| `game/clock.js` | continuous-`t` arithmetic and boundary detection, implementing `SYSTEMS.md` §9.1 | `advance(t, dt, rate, nightRate)`, `hourOf`, `dayOf`, `crossedDay`, `isNight`, `weekdayOf`, `isEighthDay`, `hoursUntil`, `bellsBetween`, `DAWN`, `DUSK`, `DAY_ROLL`, `WEEK`, `BELLS` |
| `game/quest.js` | the state machine, primitive evaluation, prereq gating | `step(defs, state, event, ctx) → {state, effects}`, `offered(defs, state, ctx)`, `progress(defs, state, id)`, `rewardFor(def, ctx)`, `boardRoll(defs, seed, day, town)`, `blankState()` |
| `game/predicate.js` | §2.3's evaluator, shared by quests and dialogue | `evalPred(pred, ctx)`, `validatePred(pred)`, `findLevelTerms(pred)`, `inWindow`, `TERMS`, `OPS` |
| `game/questdef.js` | validate + normalise quest, dialogue and area JSON | `normaliseQuests`, `normaliseDialogue`, `normaliseAreas`, `PRIMITIVES`, `STEP_MODIFIERS`, `MAX_LINE` |
| `game/dialogue.js` | scene walking, choice filtering | `open(pack, nodeId, ctx)`, `current`, `advance`, `skip`, `choose`, `visibleChoices`, `effectsOf`, `run` |
| `game/journal.js` | Truths, supersession chains, the log, the quest list | `award(journal, id, defs, stamp)`, `truthChains(journal, defs)`, `count`, `appendLog`, `logScenes`, `questList` |
| `game/areas.js` | containment | `contains(area, x, z)`, `areasAt(areas, x, z)`, `nearestAnchor(areas, x, z)` |
| `game/save.js` | `SAVE_VERSION`, `MIGRATIONS`, `normalise`, `clampAll`, `blank` | `normalise(raw, opts) → {doc, error, warnings}`, `blank(seed)`, `rollDay(doc, day)`, `checkPosition(at, world)`, `addItem`, `itemCount` |

Plus Track C's `js/sim/` modules, which these import and never reimplement: `rng`, `xp`, `schools`,
`spells`, `combat`, `tables`, `gather`, `economy`, `faction`, `campaign`. **`campaign.js` is the
only source of quest XP and marks.**

### 10.2 Adapters — `js/game/`

Impure, thin, no numbers of their own.

| Module | Owns | Public API |
|---|---|---|
| `game/session.js` | the run/pause state, tick order, autosave scheduling, visibility and orientation handling | `new Session(app, world)`, `start()`, `pause(reason)`, `resume(reason)`, `paused`, `on(evt, fn)` |
| `game/worldclock.js` | driving `game/clock` into the `time` knob, rebase-on-external-write, the advance/fade, the bells | `tick(dt)`, `t`, `hour`, `day`, `advanceTo(hour)`, `registerKnobs(q)` — the name is `SYSTEMS.md` §0.1's |
| `game/questrunner.js` | loading the packs, translating world events to `game/quest` events, applying effects, giver markers | `load()`, `emit(event)`, `accept(id)`, `track(id)`, `resetStep(id)`, `state` |
| `game/dialoguebox.js` | the bubble, the choice rows, the camera handoff, the transcript | `play(nodeId)`, `close()`, `active` |
| `game/journalscreen.js` | the journal screen | `show(tab)`, `close()`, `toggle()`, `showTruth(id)` |
| `game/hud.js` | vitals, tracker, dial, context button, charge ring, edge notch | `update(dt)`, `setContext(kind, label)`, `pulse(kind)` |
| `game/menu.js` | pause, settings, character sheet | `open()`, `close()` |
| `game/slate.js` | first run and faction select | `show()` → resolves the chosen campaign |
| `game/market.js` | the sell panel; every number from `sim/economy` | `open(marketId)`, `close()` |
| `game/audio.js` | the `audio/` bridge, the sound map, attenuation, the voice cap | `unlock()`, `play(id, {at, level})`, `ambience(id, on)`, `registerKnobs(q)` |
| `game/onboard.js` | the §7 script, one data array | `tick(ctx)`, `mark(id)` |
| `game/ui.js` | DOM helpers, `--ui` scale, safe areas, the sheet/overlay primitives | `el()`, `sheet()`, `overlay()`, `setScale(n)` |
| `game/savestore.js` | read/write/slots for the save, built on `js/kv.js`, plus the §5.7 write scheduler | `load()`, `save(doc)`, `slots()`, `saveSlot()`, `loadSlot()`, `deleteSlot()`, `new Autosave(snapshot)` |

Plus the adapters `SYSTEMS.md` §0.1 names: `cast.js`, `enemies.js`, `nodes.js`.

### 10.3 New non-code files

| Path | Contents |
|---|---|
| `js/kv.js` | `read` / `write` / `drop` / boot probe / `storageHealthy` / `storageError`, extracted from `editor/store.js` |
| `data/truths.json` | id → `{ text, campaign, story, supersedes? }` (§4.3) |
| `data/cast.json` | npc id → display name, for the bubble's speaker line |
| `js/game/game.css` | game UI, matching `editor/editor.css` conventions (dark sheet, `#b9721f` accent, 44 px targets, `env(safe-area-inset-*)`) |
| `data/quests/index.json` | pack list |
| `data/quests/light.json` | Light Acts 1–2 |
| `data/quests/sandbox.json` | S01, S02, S04, S05, S07, S12, S15, S19 |
| `data/dialogue/light.json` | dialogue nodes |
| `data/truths.json` | Truth id → text |
| `data/areas.json` | area ids and shapes |
| `tools/lintQuests.mjs` | §2.6 |
| `tools/lintText.mjs` | §3.1 |
| `tools/soak.mjs` | `SYSTEMS.md` §10's virtual-clock soak; the quest engine plugs straight in because `game/quest.step` is pure |

### 10.4 Changes to existing files

| File | Change | Risk |
|---|---|---|
| `index.html` | add `<link>` for `game.css`; add `<div id="game"></div>` as the UI host; add two `<button>`s inside `#fire` | none |
| `js/main.js` | replace `player.enabled = true` with the boot decision (§6.4): shot / editor → today's behaviour; otherwise construct `Session` | **the one place `?shot=` determinism is decided.** Guard it with a node test. |
| `js/input.js` | split `attackEdge` into `attackDown` / `attackUp` / `attackHeld`, keeping `attackEdge` as the derived tap; **delete the dead `this.attack`** (`REVIEW.md` S12i); add channel detection (350 ms inside 16 px); ignore pointer-downs that land on the two buttons so a press does not start a look-drag | medium — this is the file every control goes through |
| `js/player.js` | on cast, ease `yaw` toward `camYaw` over the swing (`REVIEW.md` S3 — the bolt currently fires along the walking direction); add `appearanceId` beside `zoneId` so a worn faction and a true faction can coexist (`REVIEW.md` S10) | medium — S3 changes how L02 plays and must be decided before combat is written |
| `js/editor/store.js` | import `read` / `write` / `drop` from `js/kv.js` instead of defining them | none — pure extraction |
| `js/world/doors.js` | one additive method: `lock(id, reason)` / `unlock(id)`, so L25 can keep Ivo's room shut until night | low |
| `style.css` | `body.playing` hides the dev row (`#audio-link`, `.ed-toggle`, `#perf`); right-side safe-area padding for the buttons | none |

### 10.6 What was actually built, and where

`js/sim/` is Track C's. Everything this document owns landed in `js/game/`, pure and adapter side by
side under the bare-noun / compound rule from §1.1.

| Pure | Adapter | Owns |
|---|---|---|
| `clock.js` | `worldclock.js` | §1 |
| `predicate.js`, `questdef.js`, `quest.js` | `questrunner.js` | §2 |
| `dialogue.js` | `dialoguebox.js` | §3 |
| `journal.js` | `journalscreen.js` | §4 |
| `save.js` | `savestore.js` | §5 |
| `areas.js` | — | containment |
| — | `session.js`, `ui.js` | boot, tick order, DOM host |

`data/cast.json` is one file beyond §10.3's list: a bubble needs a display name above it and there
was nowhere else for one. `game.css` and the `#game` host are **injected from `ui.js`** rather than
added to `index.html` — `index.html` belongs to no track, and injecting keeps the `?shot=` guarantee
provable (under `?shot=` there is no session, so there is no host, no stylesheet and no knobs).

**Deferred, deliberately:** `body.playing` hiding the dev row. §10.4 is right that `#perf`,
`.ed-toggle` and `#audio-link` should go in play mode, but hiding them now takes the editor toggle
and the perf readout away from Track A mid-build. It belongs with B6.

**Files that do not change, and that is the point:** `js/world/lighting.js` (the clock writes the
existing `time` knob), `js/world/zones.js` (frozen; the faction marks are UI glyphs),
`js/scenarios.js`, `js/world/demo.js`, `js/engine/*`, `js/editor/*` beyond the one import.

### 10.5 Update order inside the session tick

Order matters and it is the same discipline `main.js:31` already documents for doors and the player.

```
1  input.read()                     drained exactly once per frame
2  clock.tick(dt)                   may push the `time` knob (4 Hz)
3  quests.emit({t:'tick', dt})      deadlines, holds, day rollover
4  world systems                    doors → player → enemies → spells → nodes
5  quests.emit(...world events)     kills, gathers, area enters, casts
6  effects applied                  xp, marks, items, truths, flags, dialogue opens
7  hud.update(dt)                   reads, never writes
8  save scheduler                   at most once per 10 s, skipped if unchanged
```

Steps 2, 3, 5 and 6 are pure calls with the adapter supplying the clock — which is what lets
`tools/soak.mjs` run the whole 12-quest first playable in a `for` loop with a virtual clock and no
browser.

---

## 11. Reconciliation and open dependencies

`STORY.md` and `SYSTEMS.md` were revised in parallel with this document and both landed their own
clock and quest-primitive sections. This table is the audit against their revised text.

### 11.1 Resolved — this document deferred

| Question | Their answer | Where |
|---|---|---|
| Clock rate | 24 real minutes to the day, uniform, 1 real min = 1 game hour | `STORY.md` §4, `SYSTEMS.md` §9.1 — adopted; the night-compression `nightRate` ships **off** (§1.2) |
| Day rollover | **05:00**, not midnight | `STORY.md` §4 — adopted (§1.1) |
| Clock interface | `t` / `hour` / `day` / `rate` / `advanceTo(hour)`, adapter named `js/game/worldclock.js` | `SYSTEMS.md` §9.1 — adopted verbatim (§1.1, §10.2) |
| Freshness | **wall-clock**, not the world clock, clamped at 20 min | `SYSTEMS.md` §9.2 — adopted; this document's earlier objection is withdrawn and `caught` stays an epoch stamp (§1.6) |
| Per-mechanic reload rules | combat timescale dies on load, economy timescale survives | `SYSTEMS.md` §9.2 — adopted (§1.6, §5.4) |
| Quest primitives | **eight**, `REVIEW.md` B8's list, "a ninth means the quest is wrong" | `SYSTEMS.md` §10.1, `STORY.md` §8.0 — adopted; `sell` / `craft` / `cast` become `via` and `verb` modifiers rather than primitives (§2.1) |
| Act 1 re-cut and renumbering | new L01 The Granary, L02 Line and Water, L03 Market Day | `STORY.md` §15 — the worked quests in §2.5 carry the new `story` ids |
| No hour on the HUD | the Lantern Spire is the only diegetic clock | `STORY.md` §4 — adopted; the chip shows the **last bell**, not a time (§6.1) |
| Quest `xp` / `mk` | filled against the cap-20 curve, "meant to be re-scaled by the soak, not defended" | `STORY.md` §8.0 — §2.5's numbers should be replaced from the catalogue |

### 11.2 Settled here, flagged for overrule

| # | Decision | Against |
|---|---|---|
| 1 | The channel is on the **context button**, not a hold on the look half | `SYSTEMS.md` §5.2; taking `REVIEW.md` S4, which is right that a 4.15 s drift-free hold is not a reliable input (§6.3, §7) |
| 2 | Both buttons on the **right**, not the move side | `SYSTEMS.md` §3.3; move is the only continuous input and the stick floats to wherever the left thumb lands (§6.1) |
| 3 | **Doors stay walk-in**, and are never on the context button | `SYSTEMS.md` §3.3 lists "enter door" as a context action; `doors.js` already does it and adding a press to something that already happens is a regression (§6.3) |
| 4 | Position **is** saved, with a scene revision and a ground check that lets the loader distrust it | `SYSTEMS.md` §9's "no positions"; satisfies the brief without the failure mode §9 was avoiding (§5.3) |
| 5 | Dialogue does **not** pause the world clock | nothing — stated so it is not treated as an oversight (§1.4) |

### 11.3 Still open

| # | Needs | Owner |
|---|---|---|
| 1 | Truth ids and one-line texts for `data/truths.json`, and which Truth supersedes which — §4.3 renders the strikethrough, it does not author the pairs | `STORY.md` §5 / §7 |
| 2 | Area ids for `data/areas.json`. This document assumes `wwa.*`, `lac.*`, `bst.*`, `reach.light` | `WORLD.md` §3, once the town plans are authored |
| 3 | `WORLD.md` still calls the towns Lumen / Fallowmere / Umbral; canonical is Whitewall / Longacre / Blackstone, and `WORLD.md` §1.3's coordinates are what §5.3's spawn anchors need | `WORLD.md` §1.3 |
| 4 | Whether `nightRate` should be turned on after the first playable is measured | owner call, one knob |
| 5 | Which sound `spellHit` / `coinsBag` / `windGust` end up in — the game may not use anything in the bench's `bad` bucket and a node test enforces it | `audio/js/triage.js`, next listening session |
