# REVIEW_SAFE_START — the aggro guard, the cast prompt, and what else moved

Adversarial review of the uncommitted change in `gms/3d/forge/` (`foes.js`, `onboard.js`,
`session.js` + three test files) against `docs/NOTES_SAFE_START.md`.

**Verdict: the fix Aaron asked for is correct, is the right shape, and is genuinely defended by the
tests. The first two minutes are safe — verified in the real browser, not only in node.** Nothing I
found breaks them.

But the guard change did not only change vermin. It also removed the 26 m engage radius from every
creature in `CHARGES`, and the builder's assessment of that ("acceptable, nothing in the corpus
regressed") is *untested and wrong for one whole quest verb*. Four `survive` steps and one escort
step now take **zero damage** where they previously took 350–2000. That is finding 1.

There is also a genuinely flaky new test (finding 2) and a factually wrong new comment
(finding 3) — the sixth review in a row to find one.

---

## Confirmed working — I tried to break these and could not

| claim | how I checked | result |
|---|---|---|
| the granary is safe on a cold start | real page over CDP, fresh `localStorage`, clicked WHITEWALL, stood still 60 s | `hp 52/52` the whole minute, rats wandered to **0.33 m**, `engaged 0/8`, `hostile 0/8`, **0 console errors** |
| `light.01` is still finishable and still a fight | real `Session`, real packs, real `Spawner`, cast every 0.5 s, never moved | both kill objectives complete (`first:1 rest:7`), **lowest HP 0.1 / 52**, no gutter. It is a fight |
| `Tap to cast.` really appears now | real drag on the canvas, then a real `KeyW` | `look` → `move` → **`Tap to cast.`** drawn in the granary. It did not exist before this change |
| `AI.alarm` 4.5 m yields "a few at a time" | 400 real `Spawner` fills of the real granary, tapping the nearest rat | mean **2.26** woken, 88 % ≤ 3, never more than 5. Builder said 2.37 / 87 % — reproduced, claim holds. **Hypothesis "the 2.37 was synthetic" is dead** |
| `foeNear()` cannot arm on a corpse | `main.js` `foes: () => spawner.foes()`; `Spawner.foes()` is `this.live.filter(isLive)` | dying and dead are already excluded. **Hypothesis dead** |
| `basicOf()` can throw, or return range 0 | enumerated all ten schools × five faction values | never throws, never 0. Only `kindle` (26 m) and `cull` (7 m) have a range; the other eight return `undefined` → `foeNear` is `false`. **Hypothesis dead** |
| `foeNear` could throw at boot | `this.world = opts.world \|\| {}` (session.js:84), and `this.player?.pos` is guarded | cannot throw. **Hypothesis dead** |
| "the granary has no prop, no NPC, no node" | intersected `props.json`, `gather.json`, `cast_at.json`, `escorts.json` against the real `wwa.granary` rect (−556,−34)→(−538,−14) | **empty on all four.** Comment is true |
| the revert-per-test table in NOTES §4 | reverted each of the three fixes in turn | every claimed RED goes red. Honest — see the correction under finding 2 |
| `openingBeat` / `OPENING` are unwired | grepped `js/`, `index.html` | `ui.js:48` exports it, `onboard.js:11` holds the copy, **nothing imports either into `session.js`.** Accurate, and nothing half-wires it |
| the suite and lints | `node --test`, `lintQuests`, `lintText` | 535/0 · 1 pre-existing `light.06` warning · 0/0. All three match NOTES exactly |
| the `foes.test.js` split | read both halves against the pre-change test | honest. The old test really did walk a **passive** rat idle→alert at 4 m; the new pair checks passive at 9/4/1.3/0 m and provoked separately, and neither restates the fix |

---

## Finding 1 — the guard also deleted the 26 m charge, and that silently disarms four `survive` steps and an escort

**Severity: high. Does not touch the first two minutes; guts Acts 2–3 encounters and one Act 1 step.**

The old idle guard carried two clauses. Removing `d > AI.leash` did not just change *whether*
non-hostiles engage — it moved the engage radius for everything in `CHARGES` from **26 m to 7 m**.
NOTES §2 names this and calls it acceptable. It is not, and nothing in the 535 tests can see it.

Two things make it worse than the note assumes:

1. **`robed.js` has no wander.** `raider`, `hollow`, `watchman` and all three champions are `geo:
   'people'` → `robed.js`, whose `walk()` is `carry()` and nothing else (`robed.js:308` says so in
   its own comment). An idle robed enemy has `speed 0` and **never moves at all**. Only `vermin.js`
   (rats, boar, brood mother) and `chicken.js` wander, within `ROAM` 4.5–5 m of home.
2. **Most spawns land in the dead band.** `place()` accepts any point in the area within
   `SPAWN_RADIUS` 45 m of the player, so 7–26 m is where the bulk of them go. Measured over 200
   real `Spawner` fills per area, player at the area centre:

```
area               enemy            <7m   7-26m   >26m   mean d
bst.levels         blight_boar      22%     79%     0%     9.8      <- the dead band
lac.westfield      brood_mother     23%     78%     0%    10.9      <- the boss
lac.westfield      blight_boar      20%     81%     0%    11.1
ridge.dark         hollow            8%     92%     0%    15.8
lac.millbridge     champion_3       57%     44%     0%     6.5
lac.millbridge     watchman         41%     59%     0%     7.3
bst.switchback     watchman          6%     42%    52%    25.8
reach.east         raider            2%     35%    63%    29.3
```

Everything in the `7-26m` column used to come at you and now stands still.

### The measurable damage: every `survive` step, played the way its own text tells you to

Real `Spawner`, real `data/areas.json`, real quest packs, player parked at the area centre for the
step's own duration, doing nothing — 60 runs each. Raw damage taken (player has 52 HP at level 1):

| step | text | **now** (median / p90 / zero-damage runs) | **before the change** |
|---|---|---|---|
| `light.05/watch` | *Hold the north gate* | **0 / 0 / 60 of 60** | 350 / 711 / 18 of 60 |
| `light.18/hold` | *Hold the stands until they break* | **0 / 0 / 56 of 60** | 536 / 1252 / 10 of 60 |
| `dark.16/hold` | *Wait out the picket's round* | **0 / 0 / 56 of 60** | 815 / 1995 / 10 of 60 |
| `neutral.14/wait` | *Wait for the picket to come* | **0 / 0 / 56 of 60** | 536 / 1252 / 10 of 60 |
| `neutral.21/stand` | *Stand on the bridge until it is over* | 7082 / 10183 / 0 of 60 | 16198 / 16299 / 0 of 60 |
| `light.23`, `dark.21` | *Hold the bailey* | 0 | 0 — **`bst.bailey` has nothing planned at all. Pre-existing, not this change** |
| `neutral.06/apart` | *Keep them apart* | 0 | 0 — **`lac.square` has nothing planned. Pre-existing** |

`neutral.14/wait` is the one to read twice. Its text is **"Wait for the picket to come."** The
picket no longer comes.

### The same thing in the real browser, A/B'd

`?quest=light.18`, real page, placed at `reach.east`, standing still. Seven foes: three `raider`
(in `CHARGES`, hostile from `arm()`) and four `sour_crow`.

```
AFTER  (working tree)     t0   hp 52  engaged 0  dists [11,25,27,30,30,36,36]
                        +15s   hp 52  engaged 0  dists [11,25,27,30,30,36,36]
                        +60s   hp 52  engaged 0  dists [11,25,27,30,30,36,36]   ← nothing moved. At all.

BEFORE (guard reverted)   t0   hp 52  engaged 1  dists [5,26,29,38,41,41,43]
                        +15s   GUTTERED — woken at wwa.kitchen
```

A raider standing 11 m away, facing you, for sixty seconds, with byte-identical coordinates.

### Also caught in the same net

`light.11/walk` — *"Walk it up the Drove Road"*, escort the wagon + kill 4 `rat_knot` in
`road.drove`. Its hint is **"Knots come off the moor at the milestones."** `rat_knot` is not in
`CHARGES`, so they now never come off the moor. Still finishable — as a turkey shoot on four
stationary bodies.

The five non-`CHARGES` enemies that are now fully passive are `grain_rat`, `mire_rat`, `rat_knot`,
`sour_crow` and `creek_crab` — levels 1 to 5, i.e. the whole of Act 1 and the river. That part is
arguably the intended design (the `CHARGES` comment has always said vermin turn on you when you
hurt one); the 26→7 m collapse for the other seven is not.

**How I would fix it (not applied).** Keep the `!a.hostile` gate — that is the actual fix and it is
right. Make the engage radius class-dependent rather than global:

```js
const reach = CHARGES.has(a.enemy) ? AI.leash : AI.notice;
if (!a.hostile || d > reach) return 0;
```

NOTES §2 rejected "keep `leash` as the engage radius" because it would leave `AI.notice` and the
shipped `foeNotice` knob dead. It would not, under this shape: `notice` still decides when a
provoked rat picks the fight back up, which is the majority of what the granary does. If a separate
knob is wanted, add `AI.charge = 26` and register it beside `foeNotice` — but that is a new knob and
`CLAUDE.md` says ask first.

---

## Finding 2 — `one bolt wakes the nest…` is flaky at exactly the crit rate

**Severity: medium. It will turn the suite red at random and it falsifies one row of NOTES §4.**

`js/game/combat.test.js:595`:

```js
assert.equal(hearth.length, 1, 'thirty seconds of standing still in a fight you started is a gutter');
```

**Measured on the unmodified working tree: 3 failures in 60 runs of `node --test
js/game/combat.test.js`** — always this assertion, always `0 !== 1`.

Cause, proven by pinning the RNG:

| `Math.random` | runs | failures |
|---|---|---|
| unpinned | 60 | **3** |
| `() => 0.99` — never crits | 12 | **0** |
| `() => 0.001` — always crits | 6 | **6** |

`newGameInTheGranary()` seeds the `Spawner` with a deterministic LCG, but `session.strike()` hard-
wires `rng: Math.random` into `resolveHit`. `critChance(1)` is **0.06** and a crit is 13 damage
against a `grain_rat`'s 10 HP — so 6 % of the time the opening bolt kills its target outright, one
fewer rat is on you, and thirty seconds is not enough to gutter. 3/60 ≈ 6 %.

**This also corrects NOTES §4.** The table lists this test under "stays green under every revert".
It does not: reverting `onboard.js` alone made it go red in my run, purely because a different
`Math.random` draw sequence produced a crit. Any conclusion drawn from a single green run of this
test is worth 94 %.

**How I would fix it (not applied):** stub `Math.random` for the body of the test (the file already
has a seeded LCG idiom to copy), or give `Session` an injectable `rng` the way `Spawner` already
takes one. Do not weaken the assertion to `>= 0` — the assertion is the right one.

---

## Finding 3 — the `foeNear()` comment claims a guarantee the code does not provide

**Severity: low–medium (a wrong comment in a codebase whose last six reviews each found one, and
this whole change exists because a comment described a game the code did not implement).**

`js/game/session.js:1311`:

```js
// Something to cast at, measured with the bolt's own range so the prompt cannot arm for a
// creature the cast could not reach.
```

`strike()` applies **two** gates the bolt actually has — `world.sight()` (main.js:161, a real
collider raycast from the chest) and `acquire()`'s cone — and `foeNear()` applies **neither**. Only
range.

Measured, real `Session` in the granary with eight rats in range:

```
world.sight = () => false     foeNear(): true      strike(): null
```

So the prompt arms for a creature behind a wall, the player taps, `cast()` spends the focus, sets
`this.ob.cast = true` (retiring the prompt forever) and `strike()` returns `null` — the bolt hits
nothing. The teaching prompt is satisfied by a cast that visibly does nothing. Reachable in the real
game: `kindle`'s range is **26 m**, `wwa` plans six `grain_rat` across the town, and the player is
frequently indoors (the kitchen hearth is where `gutter()` puts them).

Two honest options: add `.filter(f => this.world.sight?.(p, f) !== false)` to `foeNear` so the
comment becomes true, or delete the second half of the comment. It is a *teaching* prompt, so
either is defensible — what is not defensible is the sentence as written.

---

## Finding 4 — a second new comment contradicts the author's own measurement

`js/game/combat.test.js:555`:

> Guttered at 6.6 s, measured in the browser: **eight passive rats all engaged** on proximity…

`docs/NOTES_SAFE_START.md` §1, from the same browser run, twice:

> `t=1.6s  hp 47.4/52   engaged 6/8   hostile 0/8` … "**6 of 8 engaged**, `hostile` 0/8 throughout."

Six, not eight. One-word fix.

---

## Finding 5 — a creature with a grudge that stands perfectly still

**Severity: low (feel), but it is the visible face of finding 1 and it reaches Act 1.**

`Spawner.aggro()` sets `hostile` without touching state, and an idle hostile past 7 m now stays
idle. In the granary, with the whole nest angered (the worst case of the alarm chain), 200 real
fills:

> **mean 3.35 of 8 rats are hostile-but-idle 10 s later; 198 of 200 runs have at least one.**

For vermin this self-corrects — `vermin.js:911` wanders them within `ROAM` 4.5 m and they drift into
notice (the browser run above shows rats reaching 0.33 m unaided). For `robed.js` enemies it never
corrects, because there is no wander. NOTES §5 flags this as "a feel call"; it is a feel call for
rats and a hard freeze for raiders, hollows, Watchmen and champions.

Related, and **pre-existing, not in the diff**: `foes.js:126` says a creature that gives up "goes
back to **wandering**". That is true of `vermin.js` and `chicken.js` and false of `robed.js`, which
says so itself at `robed.js:308` ("No wander and no leash turn"). Worth one word next time that file
is touched.

---

## Finding 6 — `onBreak`'s `aggroRadius: 30` is now inert

`faction.js:131` gives a Graft Break `aggroRadius: 30` and `session.js:1134` spends it on
`world.aggro(30, pos)`. Two things now make it do nothing:

- `watchman` is in `CHARGES`, so `arm()` already set `hostile = true` and `Spawner.aggro()` skips
  anything already hostile — the Break only ever woke *vermin*.
- Anything it does wake between 7 m and 30 m now stands still until the player walks to it.

"They have you" is currently the standing hit and the free Graft, and nothing else. Not caused by
this change alone, but this change is what finished it off. Flagging, not proposing a fix — the
Watch/`CHARGES`/STORY §2 mismatch is already open business in `docs/REVIEW_ENEMIES.md`.

---

## Finding 7 — `foeNotice` is now the single global switch for whether combat exists

`AI.notice` is referenced in exactly two source places, as NOTES says — but it is now the *only*
engage radius in the game, for every creature. The shipped knob "Creature sight (m)" ranges 1–20.
At 1 m, nothing in FORGE can start a fight. Previously that knob only governed vermin proximity and
`AI.leash` still brought the charging enemies. Worth knowing before the panel gets handed to anyone.

---

## Things I checked that turned out fine — recording the dead hypotheses

- **"A provoked nest forgets on reload."** It does — but so did it before. Spawner state is not in
  `snapshot()`; `cull()` drops a live creature with `died = false` and `place()` → `arm()` resets
  `hostile` to `CHARGES.has(enemy)`. Measured: walk past `DESPAWN_RADIUS` and back → `hostile 0/8`;
  save and reload → `hostile 0/8`; kill the nest and wait out `RESPAWN.common` → `hostile 0/8`.
  Pre-existing architecture, untouched by this diff. The consequence is bigger now (a reload fully
  pacifies a nest instead of merely un-chasing it), but there is no new defect here.
- **"`foeNear` runs on dead bodies."** No — `Spawner.foes()` filters `isLive`.
- **"`obCtx()` at `start()` (session.js:248) will throw before the spawner is armed."** No —
  `this.world` is always an object and `main.js` arms the spawner after `start()`, so `foes()`
  simply returns `[]`.
- **"The cast prompt jumps the teaching queue."** It cannot — `next()` returns the first unretired
  prompt and `look`/`move` are `when: () => true`. Confirmed in the browser: the order is exactly
  `look` → `move` → `cast`. NOTES §5 already flags that a player who never drags never sees it.
- **"`c.foe` blocks `door` / `context` / `channel` behind an uncast player."** True as written
  (`cast` is now armed by any creature within 26 m, not only by a context target), but not reachable
  in `light.01`: `wwa.granary.clear` requires killing eight rats, which requires casting, which
  retires `cast`. Noting it only because the window is now much wider than the old `c.target` gate.
- **The harness's `carry()` substitution for `vermin.js`.** Disclosed in the test's own comment and
  fair — `robed.js:310` and `chicken.js:736` do call `carry`, and `vermin.js`'s inline version skips
  the `ROAM` turn while `fighting`, so a chase closes the same way. (`vermin.js` does *not* import
  `carry`, despite `foes.js:42`'s pre-existing comment saying all three rigs share it.)
- One mock worth naming: `one bolt wakes the nest` fires `g.strike({ coef: 1, cone: Math.PI, range:
  40 })` — a 360°, 40 m bolt. The real Kindle bolt is 45° and 26 m. Harmless for what the test is
  about (the alarm radius), but it is not the game's bolt.

---

## What I could not check

- **Whether Act 2+ still *plays* well at the right character level.** I measured spawn geometry and
  froze-or-not; I did not play a `blight_boar` or `brood_mother` fight at level 8 with the panel
  open. Finding 1 stands on the survive steps and the escort, which are unambiguous; the
  boss-encounter half is inferred from the distance table.
- **Mobile.** Every browser run here was 1280 × 720 desktop. The `Tap to cast.` plate's position
  under a thumb is the builder's claim and I did not re-shoot it.
- **Whether Aaron wants `mire_rat` / `rat_knot` / `sour_crow` / `creek_crab` fully passive.** That is
  a design call. The code has always said vermin do not charge; the change makes that literally true
  for the first time, and the four `survive` steps are the price. Someone other than me should
  decide whether the price is right.

---

### One-line summary

Ship the `!a.hostile` gate — it is the right fix and the browser proves it. Do not ship the loss of
`AI.leash` as the charge radius without a decision about the four `survive` steps and the Drove
Road; and seed the crit before `one bolt wakes the nest` goes red on someone else's machine.
