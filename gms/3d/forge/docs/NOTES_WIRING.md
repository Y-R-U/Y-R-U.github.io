# NOTES_WIRING — the reducer↔world seam

The engineering record for the wiring pass: the pure quest reducer was green and the world it
drives was not connected to it. Owned files: `js/game/session.js`, `questrunner.js`, `quest.js`,
`save.js`, `towns.js`, `journalscreen.js`, `hud.js`, `dialoguebox.js`, `js/main.js`, `boot.js`,
`onboard.js` and the tests beside them. `js/world/*`, `js/engine/*`, `game.css`, `style.css`,
`index.html`, `data/**` belong to other agents this pass.

Baseline before any edit: `node --test` **312 pass / 0 fail**, `node tools/lintQuests.mjs`
**0 errors / 7 warnings**.

## The task list, in value order

1. **A player cannot accept a quest.** `offers` has no reader; `sceneFor` only walks active quests.
   Build the real path through the existing (non-modal) dialogue box.
2. **Cold start is in the wrong town**, 517 m from Bel — `reachable()`'s 400 m gate rejects the
   hearth anchor.
3. **`recover` is a no-op at all 326 sites.** `moveTo` / `respawn` / `grant` / `arm` have no
   handler. Implement them as far as the world allows, record the missing world hooks, and add the
   contract test plus a table-driven test of `apply()`.
4. **The unlock ladder is disconnected.** `unlocked.*` flags have no reader; `campaign.done` is
   never written, so `slate()` can never light Dark or Neutral.
5. **`grantXp` is orphaned** — quest XP is a raw `+=`, losing `tierMul` / `repMul` / `ASH_MUL` /
   affinity. Also wire `applyStanding`.
6. **`retry` restarts at step 0 but re-runs only step 0's `recover`**; the fixture hides it.
   `abandon` is wired to nothing.
7. **A quest that loses a step bricks in-progress saves** (`rec.i` clamped at the bottom only).
   `retry` on a non-failed quest silently wipes it, guarded only in the UI.
8. **Zero error handling.** No `onerror`, no `unhandledrejection`, no `.catch` on the pack load or
   on `play()`.
9. **(added mid-flight by the coordinator) `rollBoard` hard-codes Light**, so 11 of the 20 board
   quests can never be posted.

## What I found before touching anything

- The packs put the giver's brief in **step 0 as `["talk", <giver>, "<quest>.in"]`** for nearly
  every quest, so "talk to the giver" is already the authored accept moment. `light.01` is the
  exception: its first step is a kill, because RUNTIME §7 opens the game inside the granary.
- `data/dialogue/*.json` has **no authored accept/decline node anywhere**, so the offer choice has
  to be synthesised. RUNTIME describes the transition (§2.2) and the context button (§6.3) but
  specifies no offer UI beyond "`giver` drives the offer marker".
- Nothing consumes `doc.board.ids` yet — the posted set is rolled and never read.
- Node tests have no DOM. `ui.js` only touches `document` inside `el()`/`gameHost()`, so a tiny
  stub node installed by a test file is enough to construct a `QuestRunner`.

---

## Progress log

### 1 — a player can accept a quest ✅

`questrunner.js` grew three pure exports — `offerId(id)`, `briefOf(def)`, `offerNode(def)` — and
three methods: `buildOffers()`, `offerFrom(npc)`, `offerSceneFor(npc)`. `session.talk(npc)` now
reads `sceneFor(npc) || offerSceneFor(npc)`, and `apply()` gained `case 'accept'`.

**How it works.** At `load()` every def with a `giver` gets a synthetic dialogue node
`offer.<questId>` injected into the pack before it is handed to the dialogue box:

- no lines at all, which `dialogue.js` `settle()` already treats as a **pure branch point**, so the
  box opens straight on its choices and draws no bubble — no new UI, no modal;
- choice 1 `"<title> — take it on."` carries `sets: [["accept", id]]` and `goto` = the giver's
  brief node (`briefOf`), which is step 0's `talk` at the giver in nearly every pack quest;
- choice 2 `"Not now."` goes nowhere and leaves the quest offered.

So one conversation does the whole transition: pick → `apply(['accept', id])` → the reducer accepts
and tracks → the box plays the brief → the `talk` event at the end credits step 0. Declining
changes nothing.

**Why `accept` became an effect rather than a session callback.** The dialogue box already routes
`sets` to `quests.apply`, and RUNTIME §2.2 defines effects as "things the adapter must do". One
`case` is the whole change and it cannot recurse — the reducer never emits `accept`.

**Board templates.** `offerFrom` refuses a def with a `board` block unless its id is in
`doc.board.ids`, which is the first thing in the codebase to read the posted set. That makes task 9
(`rollBoard` hard-coding Light) load-bearing rather than academic.

**Longest choice string** is `"The Eighth Day, From the Cart — take it on."` at 43 chars, inside the
46-char bubble width; the test asserts it.

**Watch out.** `DialogueBox.pick()` sets `this.scene = null` before `play(goto)`, so `play` re-runs
`begin()` and resets `this.nodes` to just the brief. Harmless — the `talk` event still carries the
brief's node id, which is what the objective matches on — but it means the offer node id never
reaches a quest objective.

Tests: `js/game/wiring.test.js` (new, 4 tests) drives a real `QuestRunner` + real `DialogueBox`
against a tiny `document` stub — node has no DOM and `ui.js` only touches it inside `el()`, so a
`createElement` stub is enough. `installDom()` is exported from that file for reuse.

### 2 — the cold start is where the first quest is ✅

`session.js`: `spawnAtHearth()` and `jumpTo()` both had their own copy of "anchor → groundAt →
`player.pos.set`"; both now call one `placeAtArea(id, { far })`, and `startAreaOf(id)` names the
first non-optional step's area. New `beginCampaign()` runs from `start()` when
`towns.started(doc)` is false and no `?quest=` was given: it accepts the first offered quest of the
current campaign and places the player in that quest's start area.

For a fresh Light save that is **`light.01`, in `wwa.granary` at (−547, −24)** — the granary
interior RUNTIME §7 opens in — with the tracker already reading `THE GRANARY / Cull the rodent`.
Before, the player stood at the player-mesh default (1, 8, 22), inside Longacre's market square,
517 m from Bel.

Three deliberate decisions, all reversible, flagged for Aaron:

- **The opening quest is accepted, not offered.** RUNTIME §7's script has the player culling rats
  with a tracker before Bel is ever spoken to, and `light.01`'s step 0 is a `kill`, not the usual
  giver brief — so there is nobody to accept it from until it is already over. Every other quest
  goes through the task-1 offer path.
- **`far: true` bypasses `reachable()` for a new game and for `?quest=`.** The REACH gate is about
  a *stored* position from a world that has since moved (§5.3); it was never about a deliberate
  move, and it was the thing rejecting the hearth. `placeAtArea` still refuses to move anywhere
  `groundAt` cannot be sampled, so it cannot drop the player into the void.
- **`spawnAtHearth` prefers the hearth in the current campaign's town.** It took
  `Object.values(areas).find(a => a.hearth)` — file order, i.e. always Whitewall's temple kitchen,
  even for a Blackstone save.

`?quest=` also stopped being silently gated by REACH, which is what §2.6 promises it does.

### 9 — the board is the board you are standing at ✅ (done early: it feeds task 1)

`rollBoard(town = 'light')` was called once, from `load()`, with no argument. Now
`rollBoard(town = this.boardTown())`, where `boardTown()` reads the town off the innermost area the
player is in and falls back to `doc.campaign.current` out in the countryside. The posted set is
**keyed on `{ day, town }`**, not the day alone, so the early-return no longer serves Whitewall's
posts at Blackstone's board; `update()` re-rolls whenever the player's area list changes.
`boardRoll` is deterministic in (seed, town, day), so crossing back gives the identical board.

I chose **the board's own town, not the campaign** — `boardRoll` filters `d.town === town`, and a
Light player standing at Longacre's board should read Longacre's posts. The campaign is only the
fallback for "nowhere in particular".

Doc shape: `board` gained a `town` field (`blank()`, `clampAll()`, `rollDay()` in `save.js`).
Defaults to `null`, which reads as "not rolled yet" and simply re-rolls once on load — v1
behaviour, no migration.

### 3 — `recover` does something ✅ (two verbs still need a world that does not exist)

`session.js` gained an exported `questWorld(world, hooks)` — the one place the world handed to the
runner is assembled, so the contract test can prove it covers the linter's table. The runner's
one-liner `this.world[a[0]]?.(...)` became `recover(list)`, which warns on a verb this world has
never heard of instead of skipping it.

| verb | what it does now |
|---|---|
| `grant` | `session.regrant()` — **tops the stack up to `n`** rather than adding `n`. Resetting a step twice must not mint items; `["grant","silverling",5]` with 2 in the bag adds 3, with 8 in the bag adds nothing. |
| `moveTo` | `session.recoverTo()` → `placeAtArea(area, { far: true })`. Refuses, loudly, an area with no anchor or no sampleable ground. |
| `flag` | writes `doc.flags[key]`. **Not in the brief's table** — another agent added `flag: 'any'` to `lintQuests`'s RECOVER while I was working, and `neutral.06.brief` already authors `["flag","neutral.06.met",false]`. The contract test caught it within a minute of the data landing, which is exactly what it is for. |
| `respawn` | calls `world.respawn(kind, n)` if the world has one; otherwise `noHook`. |
| `arm` | calls `world.arm(id)` if the world has one; otherwise `noHook`. |
| `sound` | unchanged, `audio.play`. |

`session.noHook(verb, args)` is the "never a silent no-op" rule: it pushes to `session.gaps`,
`console.warn`s the missing hook by name, and tells the player one plain line
(`Nothing has come back yet.` / `It will not go back the way it was.`) so a Reset that cannot work
does not look like a Reset that did.

**The two world hooks still needed, precisely:**

- **`world.respawn(kind, n)`** — put `n` live `kind` (a `sim/tables.js` enemy id) back inside the
  step's area as killable entities. Nothing in `js/world/` can do this. `world/vermin.js` is
  *ambience*: three fixed nest sites chosen at construction from terrain footprints, a `POOL` of
  instances, `setCount(n)`, and no kill model and no per-area placement. This is the unstarted
  enemy-spawner work, not a missing line.
- **`world.arm(objectId)`** — put an interactable back to its pre-interaction state (the granary
  lamp unlit again) so `["interact", id]` can be satisfied a second time. There is no interactable
  registry at all; `world.targets()` in `main.js` is still the stand-in that fabricates six `talk`
  targets from the nearest wandering crowd figures.
- **Note for whoever writes the spawner:** the authored `recover` list carries no area —
  `["respawn","grain_rat",7]`. The step's `in` is the area it means. If the spawner needs it,
  `quest.js` should push `['recover', s.recover, s.in]` and `questrunner.recover()` pass it on;
  that is a two-line change and I have deliberately not made it speculatively.

Tests: `apply carries out every effect the reducer can emit` is the table-driven one the audit
asked for — every branch of the switch including the unknown-effect default. Plus the contract
test (reads the RECOVER table straight out of `lintQuests.mjs`'s source, since it is not exported
and that file is not mine to change), the whole-list `recover` dispatch, the top-up rule, and the
`noHook` triple-report.

### 4 — the unlock ladder is connected ✅

**The representation is `doc.campaign.done`.** It is what `towns.slate()` already reads and what
the save schema already carries; the `unlocked.*` flags stay written (the packs' own bookkeeping,
and the linter's "every non-terminal quest unlocks or is unlocked" rule leans on them) but they
gate nothing and nothing reads them — in code or in data. I checked: `grep -rn unlocked data js
tools` finds only the write.

`quest.js` gained one pure exported rule, so the runner and the harness cannot drift:

```js
finishes(effect, current)   // → the faction this effect finishes, or null
```

- **`["flag", "<faction>.done", true]` is the canonical signal.** The brief did not mention it, and
  it is better than the one it proposed: *every* campaign's last quest authors it — `light.24` →
  `light.done`, `dark.22` → `dark.done`, `neutral.21` → `neutral.done` (+ `trilogy.done`). Neutral
  really does have no `unlock`, so a rule keyed only on `unlock` would never close the trilogy;
  keyed on this one, all three close the same way. Act flags (`light.act1.done`) are not faction
  ids, so `FACTIONS.includes()` rejects them, and `["flag", x, false]` is not a finish.
- **`["unlock", "<faction>"]` is the same statement from the other side** — the campaign you are
  *currently in* has just handed the next one over — and is honoured too, so `light.24` and
  `dark.22` each report through both signals and agree.

`questrunner.finish(effect)` pushes into `doc.campaign.done`; `tools/campaign.test.mjs`'s harness
calls the same `finishes()` and now asserts the *slate*, not the mirror: Blackstone playable after
Light, Longacre after Dark, `trilogy` after Neutral. That is the assertion the old mirror could
never make.

**Two things the ladder needed beyond the flag, both flagged for Aaron:**

- `main.js` built the slate from `blank(0)` — a doc with no progress — and only ever showed it when
  there was **no save at all**. So finishing Light stranded the player: there is no chapter select
  in the pause menu either. It now loads the real doc and shows the slate when
  `doc.campaign.done.includes(doc.campaign.current)`, i.e. *between* chapters. Any other save still
  boots straight into the world.
- Picking a different town off the slate is now a real chapter switch: `session.switched` resets
  `campaign.act` to 1 and runs `beginCampaign()`, so Dark opens on `dark.01` standing in
  Blackstone rather than leaving the player in Whitewall at Act 5 with a quest 1,100 m away. Same
  character, full skill carry, which is `CLAUDE.md`'s protagonist rule.

### 5 — XP goes through `grantXp`, and Standing can go up ✅

Four producers, one rule. `quest.js` gained `xpFx(school, base, ctx)` (used by both `payout` and
the optional-step bonus) and `session.js` gained `gainXp(school, base, { sourceLevel, streak })`
(used by `unGraft` and `sell`). Both call `sim/xp.js` `grantXp`; `js/sim` is untouched and still
pure.

**What a turn-in actually picks up, and why it is only affinity.** `tierMul` needs a source to
out-level and `repMul` needs a streak of one repeated source key; a quest turn-in has neither, so
both are 1 *by construction* — I pass `sourceLevel: playerLevel` deliberately rather than passing
`null`, which would read as level 0 and wrongly penalise every player above level 4. What is left
is the affinity row, which is the ±15% that makes wearing another town's face pay, and `ASH_MUL`,
which nothing anywhere sets (see the open question below). Board XP already scales to the player's
current level inside `rewardFor`, so putting `tierMul` on top of it would double-dip.

**The soak did not move, and could not have.** Before and after are byte-identical
(`diff` clean; 7.02 h, Grasp 152, 439,068 XP, 11,467 mk, and the same §11 delta list). The brief
expected every published §11 number to change; it cannot, because **`tools/soak.mjs` does not
import `js/game/quest.js` at all** — it is a parallel model built on `campaign.js`/`xp.js`, and its
`award()` (line 114) *already* multiplies quest XP by `affinityXp(school, state.faction)` with no
tierMul and no repMul. So the direction of travel is the opposite of what the brief assumed: the
game was the thing disagreeing with the published balance, and it now agrees with it. Nothing in
`SYSTEMS.md §11` needs editing, which is the answer to "report the delta and I will decide".

The visible change is in `js/game/packs.test.js`: `Act 1 XP matches what STORY §8.1 publishes` was
asserting raw bases. Whitewall's own schools now pay 15% more of them — **Hearth 216 not 188**,
Ward 307 not 267 — and Cull/Line/Kindle/Barter, which Whitewall has no affinity for, are unchanged
at their published numbers. The test now runs the §8.1 bases through `grantXp` and keeps two
hard-coded numbers so a silent affinity change still fails it. `docs/STORY.md §8.1` itself is a
table of bases and is still correct as written.

**Standing.** `questrunner.standing(action, { faction, amount })` wraps `sim/faction.js`
`applyStanding`, keeping the daily caps on `doc.daily.standing` (which rolls with the day) and the
values on the flat `doc.standing`. Wired to the two producers that exist: a quest reaching `done`
(+8 to the quest's own town, −3.2 bleed to its opposite) and a sale (`sellPer100`, capped daily).
Before this, `applyStanding` was reachable only through `breakGraft` — Standing could only fall.

**Still not wired, and deliberately:**

- `'vermin'` standing needs kills, which need the enemy spawner (same gap as `recover`'s
  `respawn`).
- `enterCampaign(st, faction)` — SYSTEMS §7's "starting a campaign clamps that town's Standing to
  −20" — is still uncalled. It belongs in the chapter switch I added in task 4, but clamping a
  returning player's hard-won Standing down is a design call, not a wiring one. **Aaron's call.**
- **`ash` is never true anywhere.** `grantXp` takes it, `ASH_MUL = 0.85` exists, and neither
  `SYSTEMS.md` nor any caller says what earns the tax — the most likely reading is "XP banked while
  wearing an ash-bought Graft", but that double-counts against the worn affinity row, which already
  swaps. I have left it false everywhere rather than guess. **Aaron's call.**
- `unGraft` grants its Glamour XP *after* `wear(null)`, so it scores on the true faction's row, not
  the face that earned it. Left as it was; worth 30 seconds of thought if Glamour feels wrong.

### 6 — retry puts back everything, and there is a way out ✅

`quest.js`'s `retry` ran `required(def)[0].recover` only. It now runs the recover list of every
required step from the failed one back down to step 0 — **deepest first**, so step 0's own `moveTo`
is the last one applied and the player restarts where step 0 says, while steps 1..n still get their
items re-granted and their triggers re-armed. Steps the player never reached are not touched.

The fixture is fixed as the brief asked: `retry restarts a failed quest and puts back every step
the player walked through` is now a **four-step** quest that fails on step 3, and it asserts the
exact effect order. The old one-step fixture could not tell the two behaviours apart.

`abandon` was a reducer branch nothing called. `questrunner.abandon(id)` now exists and the journal
screen's action row has a **Give up** button on any live or failed quest.
`journalscreen.abandonSelected()` is a **two-tap confirm** — the first tap relabels the button
`Sure?`, the second drops the quest, and selecting another quest disarms it. No modal: Aaron does
not want a dialog box, and the pane never leaves the screen. The quest is deleted rather than
failed, so its giver offers it again through task 1's path.

**One of the brief's facts is wrong, and I have not worked around it.** Task 7 says *"`retry` on a
non-failed quest silently wipes it — the guard exists only in `journalscreen.js:140` and not in the
reducer"*. The reducer **does** guard it: `quest.js` has `if (def && quests[event.id]?.s ===
'failed')` and always has (it is in `git show HEAD`). Retry on an active, done or unknown quest is
already a no-op — nothing is wiped. Rather than invent a fix for a bug that is not there, I have
locked the real behaviour in with `retry is a no-op on a quest that has not failed`.

### 7 — a quest that loses a step no longer bricks the save ✅

The quest block came out of `clampAll` into an exported `clampQuests(raw, defs, warnings)`, which
clamps `rec.i` **at the top as well as the bottom**: an active quest pointing past its last
required step is moved back onto that step and the reason goes through the existing warnings
channel. Optional steps do not count towards the length. Non-active records keep their index —
nothing reads it.

**The reason it had to be split out.** `session.js` calls `store.load()` with **no options**, so
`normalise` never receives `defs` and *neither* definition-dependent check could ever fire — not
the new step clamp and not the existing "quest no longer exists, dropped". The packs are fetched
asynchronously after the document is built. So `session.reconcile()` runs `clampQuests` a second
time in `start()`, immediately after `await this.quests.load()`, with the real defs; it also drops
a `tracked` id that no longer resolves and pushes both warnings into `notices`, which the existing
"This save was made by an older build" line already reports.

`retry` on a non-failed quest: see task 6 — the guard was already in the reducer, and the brief's
claim that it was UI-only is wrong.

### 8 — the game says when it breaks ✅

New file **`js/game/failure.js`** (small, and the only file I added):

- `install()` registers `error` and `unhandledrejection`;
- `fail(text)` draws **one dismissible line across the top of the page** — inline styles, because
  this has to work before `game.css` is injected, in the editor, and on the boot screen, which
  share no stylesheet. Reused, not stacked. Not a modal.
- while `#boot` is still up it also replaces the `warming…` line, so the dead-screen case says
  something;
- `watchBoot(ready, seconds = 12)` is the CDN watchdog: if `window.__forge.ready` has not appeared
  in 12 s, the page says so instead of sitting on `warming…` for ever.

Wired in `main.js`: the handlers install before the app is constructed, but the **watchdog is armed
only in play mode** — under `?shot=` a bar appearing over a slow software render would end up in
the PNG, and §0 says the game layer does not exist there. Plus `play().catch(…)`. Also in
`session.start()`, where a pack that will not load is the one failure
that stops rather than degrades — it names the file, because the usual cause is a typo in one.
`questrunner.load()`'s fetch helper now throws `path (404)` instead of letting a 404 surface three
frames later as a JSON parse error naming nothing.

**The one case this cannot catch, for whoever owns `index.html`:** if `three` never arrives from
jsdelivr, the whole module graph fails to evaluate and `main.js` never runs — so no handler
registered from inside the graph can fire. Catching that needs four lines of classic script in
`index.html` before the module tag (a `setTimeout` checking `window.__forge?.ready`, calling the
same message). `index.html` was not mine this pass. Everything after `main.js` starts executing is
covered.

---

## Live check — the whole chain, in a real browser

Driven over CDP through `tools/shot.mjs`'s exported `open()` (play mode, fresh profile, Whitewall
picked off the slate). **Zero console errors or warnings.**

| | |
|---|---|
| cold start | player at **(−547, −24)**, `here: [wwa, wwa.granary]`, `accepted: ['light.01']`, tracker **`The Granary / Cull the rodent`**. Was: (1, 8, 22) in Longacre, nothing accepted, empty tracker. |
| board | `{ day: 0, town: 'light', ids: [sandbox.02, sandbox.04, sandbox.05] }` |
| finishing `light.01` | Kindle 157 · Cull 157 · 7 mk, Standing **light +8 / dark −3.2**, then `light.02` and `light.05` offered |
| talking to Rell | opens `offer.light.02`, choices `["Line and Water — take it on.", "Not now."]`; picking the first accepts it and hands straight off to `light.02.in`; tracker becomes `Line and Water / Catch five silverling 0/5` |
| Reset this step | `recover`'s `moveTo` put the player at the Fish Steps **(−512, 124)**; `session.gaps` empty (that step needs no verb the world lacks) |

---

## Where this leaves it

`node --test` **338 pass / 0 fail** (21 of them new). `node tools/lintQuests.mjs` **0 errors**.
`node tools/soak.mjs` **unchanged, byte for byte**.

**The baseline in the brief no longer matches, and none of it is this pass.** Other agents were
editing `data/quests/*`, `tools/lintQuests.mjs` and `tools/campaign.test.mjs` throughout: the step
count went 399 → 405, the warnings 7 → 1, `RECOVER` grew a `flag` verb, and `lintQuests` grew a
`failRetryErrors` check. Two of my test runs mid-pass failed on *their* half-written files and went
green again a minute later without me touching anything. Re-read the numbers, do not trust the
brief's.

**Still open, all of it flagged above and none of it started:**

- `world.respawn(kind, n)` and `world.arm(id)` — the enemy spawner and an interactable registry.
- `'vermin'` Standing, which needs the same kills.
- `enterCampaign()`'s −20 Standing clamp on a chapter switch. **Aaron's call.**
- What sets `ash: true` in `grantXp`. **Aaron's call.**
- The four lines of classic script in `index.html` for a `three` that never arrives.
- `js/game/audio.js` reads `window.AudioContext` at module scope, which is the only reason
  `session.js` cannot be imported in node. `globalThis.AudioContext` would let the contract test
  bind to the session the game really builds instead of to `questWorld()` directly. One word, in a
  file that was not mine.
