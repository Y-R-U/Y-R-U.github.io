# P10 — story-mode shell → FIRST PLAYABLE

**Resumable handoff. Written from the first working step and updated as things land.**

> **State at handoff: FIRST PLAYABLE, 5 of 6 on its own gate, every control RUN and RED.**
> `js/modes/story.js`, `js/main.js`'s eight scenes, the save's v3→v4 migration, the biplane rig, the
> menu chrome and `tools/p10gate.mjs` are all landed and falsified. **M2 is red and refused rather
> than tuned** (§5). **`worldgate` W4 is still red and D150 did NOT fix it on its own** (§1).
> Five REQUESTs need the manager (§7).
>
> Read `docs/MANAGER_STATE.md`, `DECISIONS.md` D123–D151 and `docs/P9_NOTES.md` first; this file
> assumes them.

Tuning target is **landscape** (D123); portrait is re-run as a regression.

## Status board

| # | item | state |
|---|---|---|
| 0 | baseline: `worldgate --w3runs 20` = 28/29, red is **W4 on a1-01** | measured, unchanged from P9 |
| 1 | D150 — act 1 ceiling 450 m; does W4 go green on its own? | **LANDED — §1. NO, it did not, and the reason is a second fault.** The lid is shipped and falsified; W4 is still red, now on `a1-04`, and that is a defect in the CRITERION — **REQUEST-1** |
| 2 | `js/modes/story.js` — the pure story run, the corridor, the summary | **LANDED — §2** |
| 3 | `js/main.js` — the eight scenes, `js/ui/screens.js` for the chrome | **LANDED — §3** |
| 4 | `js/core/save.js` — story model, v3→v4 migration, `kitehawk-i` → `kite_b1` | **LANDED — §4** |
| 5 | `js/gfx/rigs/plane.js` — the shipped biplane rig | **LANDED — §3** |
| 6 | `P.setTerrainQuery` registration (app layer) | **LANDED — §3** |
| 7 | `tools/p10gate.mjs` — M1–M6, every control RUN | **LANDED — §5. 5 of 6; M2 RED and refused rather than tuned. 6/6 controls RED** |
| 7b | the objective guide — the mode shell finally tells the pilot where the level is | **LANDED — §5.1.** M1 was flaky (150 s cap once in three); now 4 of 4 |
| 8 | screenshot `shots/p10/` at 844x390 landscape | **LANDED — §6**, mid-mission |
| 8b | portrait regression, `--portrait` | **LANDED — §5.** Every row identical to landscape; nothing moved |
| 9 | REQUESTs 1–5 for the manager | **§7** |

**Next concrete action:** nothing is half-written or mid-edit — every file compiles, every suite
RUNS, both gate records are written, and §9 lists how to re-run each one. The remaining work is the
manager's: rule on REQUESTs 1–5 (§7), then stage, commit and push per BUILD_PLAN §P10.

**Is it playable end to end? YES.** A person opens the page on a phone in landscape, taps FLY, is
shown a three-line brief for 3.6 s, flies `a1-01` with one thumb, shoots down two aeroplanes, sees
OBJECTIVE COMPLETE with three stars, and taps NEXT. Verified with real touches at 844x390 and at
390x844, with zero console errors. **The one thing that is not yet first-playable is the cut/deny
half of the crate mechanic — M2 — and it is red rather than tuned.**

## 0 — baseline, before anything was touched

`node tools/worldgate.mjs --w3runs 20` → **28 of 29**, the one red **W4 on a1-01**:
`4 occupied [mud,belt,floor,deck]` against D31's 2–3.

`node tools/sim.mjs --levelrun --levelfile data/levels/a1-01.json` gives the mechanism —
`timeInBand mud 13.5 · belt 32.3 · floor 24.6 · deck 26.7` over a 97.1 s traverse, against
transit costs (thickness / BEST_CLIMB_WU_S) of 7.78 / 11.11 / 14.44 / 22.22 s. **All four clear
their own transit cost**, so all four are "occupied" by the derived test.


## 1 — D150 and the ceiling. **W4 did NOT go green on its own.**

### The second fault, which is the answer to the manager's question

**Act 1's ceiling was not a quantity any shipped code read.** D150 moved a number in `DESIGN.md`
§8.2 — a document nothing executes. The generator has no ceiling column, `validate.js` has no
ceiling rule, and `js/sim/` has no altitude bound of any kind. `level.column.ceiling` **has** been
in the format since P9 and defaults to D28's playable ceiling, and **nothing anywhere read it.**
So on the ruling alone `worldgate` was byte-identical: W4 stayed red on `a1-01` at 4 occupied bands.

That is reported, not tuned around. What P10 then did is make the ruling **executable**, which is
this phase's own job — `sim.mjs`'s corridor comment already says the level's bounds are "the mode
shell's job and the mode shell is P10".

### What landed

1. **The ceiling is DERIVED, not typed.** `tools/genlevels.mjs`'s `actCeilingWu(a)` is the top of
   the act's own declared band slice: act 1 `['mud','belt','floor']` → Floor's `y1` = **-3,000 wu =
   450 m**, which is D150's number arrived at without writing it down; act 2
   `['floor','deck','lane']` → **-7,500 wu = 1,125 m**. The two statements can never disagree again.
2. It is carried in each level's own `column.ceiling` (the field P9 already built), so P11 can give
   one level a different lid — a forced climb — without an act-wide exception.
3. **`js/modes/story.js` owns the corridor** and both drivers call it: `containInLevel(world, e,
   lengthWu, ceilingWu, opts)`. `sim.mjs`'s local `keepInsideLevel` is deleted and delegates. One
   implementation, which is W5's rule one system over.
4. The lid **reflects** at the same 0.6 restitution as the side walls rather than clamping. Measured
   difference on `a1-01` seed 5: clamp leaves 15.1 s in Deck, reflect leaves **0.1 s**.

### The numbers, and every arm reports what it ACTUALLY did (D148)

`node tools/sim.mjs --levelrun --levelfile data/levels/a1-01.json [--break X]`:

| arm | `lidWu` reported | lid contacts | occupied | completed | t |
|---|---|---|---|---|---|
| baseline | **-3000** | 6 | **[mud,belt,floor] = 3** | true | 96.7 |
| `--break no-lid` | **0** | **0** | [mud,belt,floor,deck] = 4 | true | 97.1 |
| `--break no-corridor` | -3000 | 0 | [mud,belt,floor] | **false**, 254.3 s | — |
| `--break no-beats` | -3000 | 7 | [floor] | true | 51.6 |

`lidWu` and `lidHits` are in the run summary precisely so an arm cannot claim to have removed a lid
it never installed — three of P9's break-switches were green because they exited before running
(D148), and my own first attempt at this measurement was patched into the **wrong function** (the
crate mission's `keepInside`, not `keepInsideLevel`) and returned two bit-identical arms that read
like a clean null result. It was only visible because the arm counted its own calls: **0**.

### W4 is STILL RED, and the criterion is now the suspect — REQUEST-1

With the lid in, `worldgate` W4 reads:

```
a1-01: 3 occupied [mud,belt,floor]   <- was 4. FIXED.
a1-04: 1 occupied [floor]            <- was 2. NOW RED.
a1-12: 3 occupied, completed false   <- seed-5 chaos, see below
a2-05: 2 occupied [floor,deck]       <- unchanged; act 2's lid is 1,125 m and never bites
```

**Swept rather than sampled** — 12 seeds × 4 levels × 2 arms
(`scratchpad/lidsweep.mjs`, `node tools/sim.mjs --levelrun --seed N`):

| level | arm | completed | occupied min/max/mean | mean s in Deck |
|---|---|---|---|---|
| a1-01 | lid | **9/12** | 1 / 3 / 1.92 | **0.6** |
| a1-01 | no-lid | **9/12** | 1 / 4 / 2.25 | 13.5 |
| a1-04 | lid | **12/12** | 1 / 1 / 1.00 | **4.1** |
| a1-04 | no-lid | **12/12** | 1 / 2 / 1.92 | 24.7 |
| a1-12 | lid | **1/12** | 0 / 3 / 2.67 | **1.7** |
| a1-12 | no-lid | **1/12** | 0 / 4 / 2.83 | 11.3 |
| a2-05 | lid | **9/12** | 1 / 4 / 2.33 | 67.3 |
| a2-05 | no-lid | **9/12** | 1 / 4 / 2.33 | 67.3 |

Three things fall out, and the first two would both have been reported wrongly from seed 5 alone:

1. **The lid costs nothing in completion.** Every level's completion rate is *identical* between the
   arms. At seed 5 `a1-12` went from `98.1 s completed` to `300 s not completed` and looked like a
   hard regression; the sweep says **a1-12 completes 1 of 12 seeds with the lid AND 1 of 12
   without**. That is a pre-existing property of a1-12 and P11's, not the lid's. **One seed is not a
   measurement** (D141), and this is the second time on this project a plausible regression
   evaporated at the second seed.
2. **The lid does exactly what D150 asked.** Deck time falls 13.5 → 0.6 s (a1-01) and 24.7 → 4.1 s
   (a1-04), and act 2 is untouched to the decimal — its ceiling is above where anything flies.
3. **W4's bar is not D31's claim, and W4 is a single-seed instrument.** D31 says a mission occupies
   "a 2–3 band slice of the ladder, **not the whole column**" — an *upper* bound. W4 asserts
   `2 ≤ n ≤ 3`, and the `≥ 2` half condemns a level for being **more** confined than the design asks
   for. That is what `a1-04` at 1 band now is. And the minimum occupied count over 12 seeds is **1
   or 0 on every level in BOTH arms**, so the pass/fail was always one seed's draw.

**I have not touched W4's bar, and I have not moved a level.** REQUEST-1 below asks the manager to
re-specify it. This is the same shape as D27, D94, D101, D135 and D145: the arithmetic, not the
effort.

---

## 2 — `js/modes/story.js`, the mission as a pure object

Same shape as `duel.js` and for the same reason: no DOM, no clock, no `Math.random`, no camera and
no renderer, so **`tools/sim.mjs` and the browser drive the identical object**. `js/main.js`'s `play`
scene owns the picture and the thumb; everything about what a mission *is* lives here.

- `createStoryRun(ctx, level, opts)` → `{ world, field, terrain, spawner, player, step, setStick,
  summary, state }`. `opts.pilot` is `'human'` (a stick) or `'ai'` (the shipping AI flies it);
  `opts.advisor` additionally runs a competent pilot that publishes the axis it wants and **never
  applies it**, so a headless gate can put a real thumb there.
- `containInLevel(world, e, lengthWu, ceilingWu, opts)` — **the one corridor**, §1.
- `createHumanPilot(advisor)` — `hud.html`'s pilot shim, promoted to shipped code. `world.update`
  calls `e.pilot.update(dt, e.flight)` for every aircraft, so a human's aeroplane needs a pilot
  object that reads an axis instead of solving for one. **No file in `js/sim/` was modified to make
  the player controllable**; the seam P5 left is sufficient.
- The run summary is ARCHITECTURE §8.1's, plus `objectives`, `won`, `stars`, `repair`, `scrip`,
  `occupied`, `lidHits`. Every stat a star may name is still in `validate.js`'s `RUN_STATS`
  (`worldgate` W1b diffs the two on every run).

Three things it does that the level run does NOT, each declared rather than folded in:

1. **`player.cratePolicy = { run: true }`.** `sim.mjs` sets `false` because it is isolating the
   ladder; a mission is not isolating anything and a player is a pilot who wants the crate (D4).
   Inert for a human — only an AI reads it. Measured on `a1-12` over 24 seeds: crates the player
   banks go **1 of 123 → 87 of 123**, and the mission win rate 0/24 → 7/24.
2. **`engage: { 1: 'none', '-1': 'none' }`.** `sim.mjs` passes `-1: 'take'`, which is not one of the
   three documented modes (`cut`/`deny`/`none`) and falls through to the canopy branch — so every
   ordinary hostile was shooting parachutes, which §5.3 makes **one ace's** speciality.
3. **An objective this shell cannot score is NAMED, never dropped.** `run.unscored` carries
   `gates` (a1-04) and `destroy:boss` (a2-05); the debrief prints them and `console.warn`s each one.
   A mission that quietly ignored "destroy the zeppelin" and reported a win is D149's shape.

### Stars are gated on the objective, and that was a real bug

§7.1's FIRST star is "objective complete". The first build of the debrief showed
**"Not a scratch ★" and "Under 50 s ★" over SHOT DOWN** — `damageTaken == 0` and `time <= 50` are
both true of a mission that ended at five seconds. `summary.stars[i]` now carries **`met`** (what the
condition says) and **`got`** (`met && won`), because collapsing them is what hid it.

## 3 — the eight scenes, and what had to be built to have them

`js/main.js` grew from a scene machine with eight no-ops into `boot title hangar brief play pause
debrief map`. `input.releaseAll()` on every change was already there and stays.

Two new files, both **additions** rather than edits — no P1 or P7 file is touched, and both are
REQUEST-2:

| file | why |
|---|---|
| `js/gfx/rigs/plane.js` | the 16-part biplane lived only in `tools/pages/parts.html` and a JSON dump beside it, so **nothing in `js/` could draw an aeroplane.** Promoted, parameterised by a per-type palette, one cached rig per scheme. A literal, not a `fetch` — a rig that has to load is a rig the title screen waits for |
| `js/ui/screens.js` | the menu chrome, composed entirely out of `theme.js`'s exported marks and `layout.js`'s safe rect. No modal, no dialog, no rounded rectangle; a button is a rule and a word, hit-tested against **the same rect that was drawn** |

`P.setTerrainQuery(run.terrain.query)` is registered in `play.enter` and cleared in `exit` — the one
line P9 left for the app layer, because `js/sim/` may not import `js/gfx/` and nothing inside the sim
can hand the particle system the terrain it just generated.

### Three defects the first build had, all found by looking at the picture

1. **`R.poly` is convex-only and a skyline is the least convex thing in the game.** The terrain came
   out as a fan through the hill with sky wedges under every peak. Now two `R.tri` per span.
2. **`cam.update(null)` parks the camera at the world ORIGIN, which is the GROUND.** The title screen
   was a menu over a trench with a black lower half. The menus now drive a `MENU_CAM` that drifts
   east through Deck; the framing and the act were chosen by **looking at six candidates**, kept in
   `shots/p10/sky/`, not picked — act 1 at Belt is a flat grey wash with no cloud in frame at all.
3. **`window.__kh` was published before the atlases were awaited**, so `tools/orient.mjs` — which
   waits on `window.__kh && window.__kh.cam` and then writes `ctx.scenes.boot.update` — won the race
   against the scene table and died with `Cannot set properties of undefined`. It is published last
   now. **A harness seam that exists before the thing it is a seam for is worse than one that
   arrives late.**

### `?scene=boot` HOLDS, and three suites needed one word each

`boot` used to be a permanent no-op, which is what made it the harness seam: `ctx.player` and
`ctx.entities` were writable and nothing overwrote them. Now every scene the player ever sees drives
those two fields itself — the menus set `ctx.player` every frame — so a suite that scripts a world
has to be somewhere that does not. `?scene=boot` holds at boot; `orient.mjs`, `touch.mjs` and
`statecheck.mjs` gained `&scene=boot`, and nothing else in them changed.

`statecheck.mjs` also had `round.v === 3` as a literal. P10 bumps the save to v4, so a correct
migration would have read as a gate failure. It now reads `window.__kh.save.version` — **a harness
keeping its own copy of a constant the code under test also declares is testing itself** (D72).

## 4 — the save

`v3 → v4`, with a migration, never a wipe.

- `story.unlocked` is a **list of ids**, not a high-water index: P9 ships four levels of a hundred
  and they are not contiguous (`a1-01 a1-04 a1-12 a2-05`), and an index cannot express that without
  lying about the 96 that do not exist.
- `hangar.airframe` was **`"kitehawk-i"`**, which is not an id `js/data/tables.js` builds — the same
  defect D149 found in ARCHITECTURE §7.1's worked level, **in a second place nobody had looked**.
  `playerType()` returns the reference airframe for an unknown id silently, so a hangar furnished
  with an aeroplane that does not exist would have read clean. Now `kite_b1`, and the migration
  rewrites it in place while keeping every crate, star and Scrip.
- `save.recordRun(id, summary, nextId)` is the whole of §9.4: a failed run still banks what it
  caught, still records the attempt, and **never takes anything away** except the repair fee
  (1 Scrip per 4 structure, capped at 60).

## 5 — `tools/p10gate.mjs`. **5 of 6. M2 is RED and it is not tuned.**

`node tools/p10gate.mjs [--portrait] [--falsify] [--only M1,M6] [--shots]`.
Record at `shots/p10/gate.json` and `shots/p10/gate_portrait.json`.

| # | criterion | landscape 844x390 | portrait 390x844 |
|---|---|---|---|
| M1 | a human plays `a1-01` end to end | **PASS** — 1 touch, 681–1,632 real `touchMove`s, **40.8–98.8 s, completed, WON**, 2 down, **0 HP taken**, 2–3 stars, **0 console errors, 0 page errors** | **PASS** — 41.1 s, won, 3 stars |
| M2 | one caught, one cut, one denied (D4) | **FAIL** — 6 dropped, **5 CAUGHT, 0 cut, 0 denied** | **FAIL** — identical |
| M3 | `assets/audio/` absent | **PASS** | **PASS** |
| M4 | rotate 20x mid-flight | **PASS** — `tools/orient.mjs` 8/8, 4 controls RED | same suite |
| M5 | save round trip | **PASS** — writes, reloads identically, **a v3 save MIGRATES** (v4, `kite_b1`, 777 Scrip and best 61.2 s kept), corrupt JSON gives a fresh save + **1 console warning + 1 in-page callout + 0 alerts + 0 dialogs**, `?nosave` writes nothing | **PASS** |
| M6 | 1.2 s "again" card | **PASS** — opens at 1.200 s, **scene never leaves `play`**, no tap target while up, 0 alerts, 0 dialogs, **sim advances 0.000 s while held** | **PASS** |

**Portrait is a clean regression: every row reads the same as landscape**, to within M1's run-to-run
spread. Nothing moved.

### M2 is red, and the reason is the most interesting thing in this phase

M2 **passed twice** earlier in the run — at `a1-12` seed 207, `3 CAUGHT / 2 CUT / 1 DENIED`, in a
real browser session with the engagement policy changed by a real long press. It went red when the
objective guide landed (§5.1), and the mechanism is worth stating exactly:

**cutting is what you do to a crate you cannot reach.** Before the guide the reference pilot
wandered, spent 300 s in a 25,200 wu level and let crates fall all over it, so canopies were shot at
range and boxes were denied. With the guide he presses on, **catches 5 of the 6**, and finishes at
83.8 s — and a pilot who catches everything never needs to cut anything. **M2 was passing because
the pilot was bad**, which is exactly the shape this project keeps finding (D99's family, ninth
instance).

Swept rather than sampled, 36 seeds x 2 engage modes on `a1-12` with the guide in:

| level | engage | caught | canopies cut | denied | seeds showing any cut or deny |
|---|---|---|---|---|---|
| a1-12 | cut | 140 | 3 | 0 | **3 / 36** |
| a1-12 | deny | 140 | 2 | 0 | **2 / 36** |
| a2-05 | cut | 0* | 0 | 0 | 0 / 36 |

I searched seeds 200–259 for one giving all three under the guide: **there is none.**

**All three code paths work and all three have been observed firing in real sessions.** What is not
true is that an *assisted* pilot exercises them: the auto-fire assist switches targets and never
lands `CRATE.silkRounds = 6` on one canopy or `boxRounds = 12` on one box, because it is flying
through the crate instead. Cutting is a **deliberate** act — hold the pip on the silk — and the AI
is not deliberate. Add REQUEST-3 (a cut crate can never be *banked* in any shipped level) and the
whole 1.6x cut economy is not yet real.

**I did not move the bar, did not remove the guide, and did not fish for a seed.** M2 goes to the
manager with the arithmetic.

### 5.1 The objective guide — M1 was flaky and the cause was a hole in this phase's own remit

M1 passed at 64.2 s and 72.7 s, then **hit the 150 s cap and failed** on the third run: same seed,
same driver, same poll rate (16.5 moves/s in all three). The mission is a real-time thumb against a
fixed-step sim, so which tick a `touchMove` lands on is not reproducible and the run diverges.

But the underlying cause was not the driver. `tools/sim.mjs` states it in its own comment:

> PATROL holds the heading it inherits; it has no idea where the objective is, **because telling him
> is the mode shell's job and the mode shell is P10**.

**I had not told him.** The corridor says where the level ends; nothing said which way to go. So
`js/modes/story.js` now runs a guide inside the pilot wrapper — the only point after the dogfight
controller has spoken at which the mode shell can still speak — and it returns a POINT, so
`pilot.js`'s existing `point` intent does the flying and there is no second controller (W5's rule).

The rule is derived from the level's own objective list, and **two versions of it were wrong before
this one, both caught by measurement rather than by reading**:

| version | `a1-01` | `a1-04` | `a1-12` | `a2-05` |
|---|---|---|---|---|
| no guide | 9/12 won | 12/12, 48.1 s | 6/12 won, 1 death | 10/12 won |
| defer to KILL objectives only | 10/12 | 12/12, **31.2 s** | **0/12** — flew past every crate | 12/12 |
| defer while a CRATE OBJECTIVE is outstanding | 10/12 | 12/12 | 2/12 | 12/12, **0 of 58 crates caught** (a2-05 declares no crate objective) |
| **shipped: defer to any silk in the air** | **10/12** | **12/12** | 2/12, 5 deaths | **12/12**, crates caught again |

D4 settles the last step: crates are the **economy**, not a mission type, so a pilot wants one that
is in the air whatever the objective list says.

**The cost is named and not tuned away: `a1-12` goes 6/12 to 2/12 with 5 deaths instead of 1.** The
guide converts "wandered until the 300 s clock ran out" into "pressed on and sometimes died" — both
are losses, and the second is the honest one — but `a1-12` punishes pressing and that is a balance
property P11 owns. It is on the table above rather than hidden.

M1 after the guide: **4 of 4 runs pass**, 40.8 / 41.1 / 57.7 / 98.8 s, and the falsify baseline
came in at 41 s with **three stars**.

### The controls, and what each one caught

`node tools/p10gate.mjs --falsify`:

| arm | what it reported doing | verdict |
|---|---|---|
| M1 `still-thumb` | **1 touch, 0 real moves**, mean \|want\| 0.000 | RED — completes the traverse but `won false`, 1 down of 2, 0 stars |
| M1 `no-thumb` | **0 touches, 0 real moves** | RED — same |
| M2 `no-beats` | engage `none → deny` confirmed, **dropped 0** | RED |
| M2 `no-press` | **0 long presses, engage `none → none`** | RED — 4 caught, 0 cut, 0 denied |
| M3 `await` | reached title **false** | RED — the forbidden boot that waits on the manifest |
| M6 `no-card` | card opened at **0 s, 0 polls**, sim advanced **99.000 s** while "held" | RED |

**Every arm prints the state it observed, not the flag it was given** — touches dispatched, real
moves, the engage mode *the game* reports, crates *actually* dropped, the lid the corridor *used*.
That is not decoration. Three of P9's controls were green because they exited before running (D148),
a fourth was faked by zsh, and **my own first measurement in this phase was patched into the wrong
function** (`keepInside`, the crate mission's, instead of `keepInsideLevel`) and produced two
bit-identical arms that read exactly like a clean null result. It was caught only because the arm
counted its own calls and reported **0**.

**M1 is flown by a real thumb through the shipped input path**: one `Input.dispatchTouchEvent`
touchdown inside the shipped stick zone, then hundreds of real `touchMove`s to the point that
produces the axis a competent pilot wants under the **live** `stickRadius()` read back from the
game. The advisor computes that axis and never applies it. **The thumb is a DEGRADED copy of the
advisor** — CDP latency plus the rim clamp mean it does not reproduce the wanted axis exactly — so
M1 measures a pilot slightly worse than the reference, which is the safe direction. It also means
M1 is not bit-reproducible and never can be; three passes and a spread are the honest form.

### The whole loop, walked with real taps

`title → FLY → brief → GO → play (real thumb) → debrief → AGAIN/NEXT/MISSIONS`, every step a real
`Input.dispatchTouchEvent` at the rect the game drew: **navigates correctly, 0 console errors, 0 page
errors, on three separate walks.** All three ended in a LOSS at 15–20 s (flown into the ground once,
shot down twice) — which is the game being a game, and the debrief then offered AGAIN and MISSIONS.
The `NEXT` button appears only on a win, so those walks did not exercise it; M1's own debrief shot
(`shots/p10/m1-debrief.png`) does — **OBJECTIVE COMPLETE, three stars, +25 scrip, AGAIN / NEXT /
MISSIONS.**

### Every other suite, re-run after every change

| suite | before P10 | now |
|---|---|---|
| `tools/statecheck.mjs` | 15/15 | **15/15** (one literal `v === 3` replaced by the shipped `save.version`) |
| `tools/orient.mjs` | 7/7 | **8/8**, 4 controls RED |
| `tools/touch.mjs` | 15/15 | **15/15**, no page errors |
| `tools/corecheck.mjs` | PASS | **PASS** |
| `tools/sim.mjs --fixtures` | 9/9 | **9/9, blessed hashes unchanged** |
| `tools/p3guard.mjs` | GREEN | **GREEN** |
| `tools/sim.mjs --p6gates` | 9/10 (K6 deliberately red, P6_NOTES §3) | **9/10, K6, unmoved** |
| `tools/ladder.mjs` | 4/6 (P4a struck, D135) | **4/6, unmoved** |
| `tools/genlevels.mjs --check` | W6 SAME | **W6 SAME** on all six artefacts |
| `tools/worldgate.mjs` | 28/29, red = **W4 on a1-01** | **28/29, red = W4 on a1-04** (§1); `--falsify` **every control RED**, including the new lid control |
| `tools/gates_portrait.mjs` | P2 and P3c red (D121, D122, D129) | **runs, same rows**. Nothing P10 touched can reach it — no file in `js/core/camera.js`, `js/core/viewprofile.js` or P7's `js/ui/` was modified, and the new `screens.js` is never loaded by that harness |

## 6 — the screenshots

`shots/p10/`, all at **844x390 landscape** unless named otherwise:

| file | what it is |
|---|---|
| `m1-a1-01.png` | **the milestone shot** — `a1-01` being flown by a real thumb, MID-MISSION at 22 s |
| `m1-debrief.png` | the same run's debrief: OBJECTIVE COMPLETE, three stars, AGAIN / NEXT / MISSIONS |
| `m2-crates.png` | the crate mission, `CRATES 3/5` on the glass and the engagement policy reading `DENY` |
| `m6-again.png` | the 1.2 s "again" card |
| `01-title.png` `02-map.png` `03-brief.png` `04-play.png` | the loop a player walks: title → missions → brief → flying |
| `sky/*.png` | the six menu-backdrop candidates the framing was chosen from |
| `*_portrait.png` | the portrait regression's own captures |
| `gate.json` / `gate_portrait.json` | the gate records |

## 7 — REQUESTs for the manager

**REQUEST-1 — W4's bar is not D31's claim, and W4 is a single-seed instrument.** D31 says a mission
occupies "a 2–3 band slice of the ladder, **not the whole column**" — an *upper* bound. W4 asserts
`2 ≤ n ≤ 3` and the `≥ 2` half now condemns `a1-04` for being **more** confined than the design asks
for. Swept over 12 seeds, the minimum occupied count is **1 or 0 on every worked level in both the
lid and no-lid arms**, so the pass/fail was always one seed's draw. I have not touched the bar and
have not moved a level. Suggested re-specification, for the manager to rule on: `n ≤ 3`, evaluated
over a seed sweep and reported with its spread, the way K5 and C7 now are.

**REQUEST-2 — two new files outside P10's stated ownership, both additions, neither an edit.**
`js/gfx/rigs/plane.js` (nothing in `js/` could draw an aeroplane; the rig lived only in
`tools/pages/`) and `js/ui/screens.js` (the menu chrome, built entirely from `theme.js`'s exported
marks and `layout.js`'s safe rect). No P1 or P7 file is modified. Also declared: one word each added
to `tools/{orient,touch,statecheck}.mjs`'s URLs (`&scene=boot`), one literal replaced by
`save.version` in `statecheck.mjs`, and the corridor delegation + `no-lid` arm in `tools/sim.mjs`.

**REQUEST-3 — the crate economy's FRONT LINE has no home in the level format, and the 1.6x cut is
therefore unreachable in every shipped level.** `js/sim/crates.js` decides who banks a *landed*
crate by `x < lineX`, friendly to the west. The format has no field for it, so `sim.mjs`'s isolation
harness uses **0**. Measured, and the arm was proved to have run (`field.lineX` reads back 600 wu):
crates are dropped **1,328 wu AHEAD** of the player and the act-1 wind blows east, so over 6 seeds of
`a1-12` **the westernmost landing of any crate is 3,287 wu** — 5.5x beyond the line. Cuts genuinely
happen (2 of 7 landings) and **not one can ever be banked**: `stats.cutTaken` is structurally 0 and
§4.3's whole altitude structure — "cut it low over your own trenches for 1.6x" — cannot be exercised.
P10 ships `lineX = level.player.start.x` as the least-invented reading (the mission begins over your
own ground), derived rather than typed; **it is currently inert by geometry and I am saying so
rather than letting it look like a fix.** A front line is a design quantity and the format should own
it — either a `column.line` field, or a line that advances with the player.

**REQUEST-4 — two objective types are UNSCORED and say so out loud.** `gates` (`a1-04`, 8 pylons)
and `destroy:boss` (`a2-05`, the zeppelin) have no entity behind them; `run.unscored` carries them,
the debrief prints them and each one `console.warn`s. Both levels are still playable — they resolve
on `reach` + `survive` — but they cannot be *won* on their own terms. P11/P12's.

**Not a request, a note: D151 stands untouched.** The `quick` star is unreachable on every worked
level (`a1-01`'s bar is 50 s; a thumb-flown run comes in at 64–73 s and the AI's at 96.7 s), the
debrief shows it unearned, and **no multiplier was invented**. M1 scores 2 of 3.

## 8 — is it actually a game? The reference pilot's numbers

Not a gate row — a sanity reading for P11, taken with the shipping AI flying (`pilot: 'ai'`, which
is the guided pilot of §5.1), 12 seeds each, through the shipped `createStoryRun`
(`node tools/lab/winrate.mjs`):

| level | won | died | mean t | max t | mean stars | crates caught |
|---|---|---|---|---|---|---|
| `a1-01` | **10/12** | 0/12 | 71.8 s | 128.3 | 1.75 | — |
| `a1-04` | **12/12** | 0/12 | 31.2 s | 31.2 | 3.00 | — |
| `a1-12` | **2/12** | 5/12 | 79.4 s | 120.5 | 0.42 | 44 |
| `a2-05` | **12/12** | 0/12 | 129.0 s | 203.7 | 1.33 | 22 |

Against §7.1's 60–200 s target `a1-04` is short at 31.2 s and has **no variance at all** (31.2 to
31.2 over twelve seeds) because its `gates` objective does not exist — REQUEST-4 — so nothing in it
can go differently. **`a1-12` is the outlier at 2/12 with 5 deaths** and it is the crate level; §5.1
has the before/after and REQUEST-3 has the reason its economy is broken. **None of this was tuned;
it is the curve P11 inherits.**

**One data point against D151, offered rather than argued.** D151 deferred the `quick` star because
`length = t x cruise` spends the whole authored duration on the traverse, so `a1-01`'s 50 s bar
looked unreachable — the reference pilot needs 71.8 s and `sim.mjs`'s own level run took 97.1 s.
A **thumb-flown** run of `a1-01` came in at **40.8 s and scored three stars**, and the falsify
baseline at 41 s did the same. The ruling stands and no multiplier was invented; the number is here
because P11 sets that threshold from measured fight duration and now has one measurement of a level
being flown rather than patrolled.

## 9 — how to re-run everything P10 built, in the order a fresh agent should

```
node tools/p10gate.mjs                    M1-M6, landscape 844x390
node tools/p10gate.mjs --falsify          6 controls, all required RED
node tools/p10gate.mjs --portrait         the same six at 390x844 (D123 regression)
node tools/p10gate.mjs --only M1 --shots  one row, and write shots/p10/

node tools/statecheck.mjs                 15 asserts on __state, save and quality
node tools/orient.mjs                     8, rotate 20x mid-flight
node tools/orient.mjs --falsify           4 controls
node tools/touch.mjs                      15, real touches on the stick
node tools/corecheck.mjs                  the pure tier is node-importable

node tools/genlevels.mjs --check          W6: the table vs the files on disk
node tools/worldgate.mjs --w3runs 20      29 criteria
node tools/sim.mjs --fixtures             9 blessed hashes
node tools/sim.mjs --p6gates              K1-K10 (K6 deliberately red)
node tools/p3guard.mjs                    the 34.01 px guard
node tools/ladder.mjs                     P4/P4b (P4a struck, D135)

node tools/lab/lidsweep.mjs               §1's 12-seed lid vs no-lid table
node tools/lab/winrate.mjs                §8's reference-pilot win rates
node tools/sim.mjs --levelrun --levelfile data/levels/a1-01.json [--break no-lid]
```

**Play it:** serve the folder and open `index.html`. `?level=a1-12` picks the mission,
`?scene=play` skips the menus, `?auto=bot` lets the AI fly it, `?auto=thumb` runs the advisor for a
driver to follow, `?debug` opens the §8.2 overlay, `?nosave` turns persistence off,
`?levelseed=207` names the mission. `?scene=boot` holds at the harness seam.

## 10 — what is NOT good enough to ship, said plainly

The brief asks for a title screen and a level map "good enough to navigate four levels. Not good
enough to ship; say so." Saying so:

- **The map is a list of four rules and a word.** It is a list, not a map — there is no ladder, no
  act structure and no sense of a campaign, because with four non-contiguous levels of a hundred
  there is nothing yet to draw. P11 gives it something to be.
- **The hangar is a placeholder** and says so on screen: two lines of text and a BACK rule. P13's.
- **The brief is three lines and a 3.6 s timer.** There is no portrait, no voice, no radio. P12's.
- **`assets/audio/` does not exist**, so every line is a text card and there is no engine note, no
  guns and no wind. That is D7 working exactly as intended, and it is also why the game is silent.
- **The HUD's top row is clipped at the right edge in landscape** — the wind readout's numeral sits
  partly under the tape column at 844 px. P7's layout, cosmetic, not raised as a REQUEST because
  P16 owns the art pass and it costs nothing to leave.
- **Act 1's sky is a flat grey wash at Belt altitude.** Correct for "The Mud" and correct against
  P3's LUT; it is also the first thing a player sees inside a mission. Named for P16.

---

**REQUEST-5 — M2 fails and the criterion may be the thing that is wrong.** §5 has the arithmetic.
The three crate outcomes all fire in real sessions and all three were seen together at `a1-12`
seed 207 — but only while the reference pilot was wandering. An assisted pilot who presses on
catches 5 of 6 and never cuts anything, and cut/deny appear in **3 of 36 seeds** with the guide in.
Three ways out, none of which I took:

1. **Read M2 as "the mechanic exists and is exercisable"** rather than "one of each happened in one
   session", and evidence it with the sweep. Cheapest, and arguably what D4 is asking.
2. **Make DENY mean the assist stops chasing.** You cannot both deny a crate and take it, so
   `cratePolicy.run = engage !== 'deny'` is coherent — but it is a design statement about what the
   engagement button MEANS, and it changes the AI arm every gate in P11 will use.
3. **Leave it to P11**, which owns the crate balance and REQUEST-3's front line anyway.

I did not take (2) because it is a call about what the game *is*, which is D15's test for surfacing
rather than deciding.

---

## 11 — two small things worth carrying forward

**A locked mission was tappable.** `map` dimmed a locked row and then passed its id to the tap
handler anyway, so the lock was a decoration and any of the four could be entered from a fresh save.
A locked row now carries no id at all. Found by looking at `shots/p10/02-map.png` and asking what
happens if you tap the dim one — **which is the question a screenshot cannot answer and a tap can**
(the headless-CDP lesson this project already had). Also on the list: the locked rows are dimmed to
0.30 alpha and still read too similar to the live one at 844x390.

**D148's zsh trap fired again, on me, in this phase's own final sweep.** A loop of the form
`for c in "tools/genlevels.mjs --check"; do node $c; done` does **not** word-split in zsh, so it ran
`node "tools/genlevels.mjs --check"`, crashed, and reported `exit 1` for two suites that are green.
I nearly wrote that into the handoff as a regression. `eval "node $c"` is the fix, and the general
form is the one D148 already stated: **the shell can fake a red as convincingly as a green.**
