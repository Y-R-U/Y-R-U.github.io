# Review — the combat runtime seam

Adversarial review of the uncommitted combat wiring (`js/sim/foes.js`, `js/game/spawner.js`,
`js/world/roster.js`, three test files; edits to `js/world/vermin.js`, `js/game/session.js`,
`js/main.js`) against `docs/NOTES_COMBAT.md`.

Everything below was run. Node demos and the raw-CDP driver scripts live in the session scratchpad;
every number quoted is one I measured, not one I read.

---

## Verdict

**Not safe to commit as-is. One blocker.**

`js/main.js:131` reads a `const` that is still in its temporal dead zone on the load path that has
no `await` before it — which is **every load of an existing save**. The page throws on its first
frame, the exception unwinds out of `App.start()` and aborts the rest of `main.js`, so `vermin` and
`spawner` are never constructed, `__forge.ready` is never set and the boot overlay never lifts. The
game does not start. This is a one-line fix and it is not caught by any of the 373 tests.

With that fixed the rest is good work. The `assign()` pinning invariant genuinely holds — I tried to
break it with the real rig and could not. `kill` fires exactly once. The cost claims are real. The
three remaining defects are should-fix, not blockers.

---

## Demonstrated defects

### 1 — BLOCKER: loading an existing save does not boot at all

**What breaks.** `js/main.js:168` declares `const spawner`. `js/main.js:131` closes over it inside
the `world.tick` hook handed to the `Session`. `App.start()` (`js/engine/app.js:120`) calls `loop()`
**synchronously**, and that first frame runs every system, including the session
(`js/game/session.js:1004` → `combat(dt)` → `session.js:569` `this.world.tick?.(dt)`).

On a **new game** `play()` awaits the Slate click before `app.add(new Session(...))`, so no session
is in `app.systems` when that synchronous first frame runs. `main.js` runs to the bottom, `spawner`
is initialised, all is well. That is the only path the builder tested.

On a **resume** (`js/main.js:116-120`: `fresh` false, `between` false ⇒ `campaign = null`) there is
**no await at all** before `app.add(new Session(...))`. The session is in `app.systems` when
`app.start()` fires its synchronous frame, `world.tick` dereferences `spawner` in TDZ, and the
`ReferenceError` propagates out of `app.start()` at `js/main.js:158` — aborting module evaluation
before lines 165–171.

**Observed.** Fresh game, two rats killed through the real `strike()`, `autosave.flush()`, reload:

```
=== A. progress made in the new game ===
 {"kills":2,"i":1,"c":{"first":[1],"rest":[1]},"marks":4,"played":2.2,"cull":80,"savedBytes":1321}

=== B. reload on that save ===
  __forge.ready: false
  body text: "FORGE / A VALLEY, THREE TOWNS / Something broke: Uncaught ReferenceError:
              Cannot access 'spawner' before initialization. Reload the page to try again. ..."
  boot gone?: ""            ← the boot overlay never got .gone

  [throw] ReferenceError: Cannot access 'spawner' before initialization
    at Object.tick   (js/main.js:131:27)
    at Session.combat(js/game/session.js:569:22)
    at Session.update(js/game/session.js:1004:10)
    at loop          (js/engine/app.js:112:53)
    at App.start     (js/engine/app.js:120:5)
    at                js/main.js:158:5
  [error] forge: The game could not start: Cannot access 'spawner' before initialization.
```

Then the same throw every frame forever, because `requestAnimationFrame(loop)` was already queued at
the top of `loop`. Reproduced twice, in two independent driver scripts.

The save itself is fine — the HUD text in the crashed page still reads `THE GRANARY / Cull the
rodents / 1/7`, so the document loaded and the resume decision was correct. Nothing else boots.

**Note on `this.resumed`.** The constructor move at `js/game/session.js:107` is *correct in
isolation* — the save written above had `played: 2.22` and `questKeys: ["light.01"]`, so
`started(doc)` is true either way and a resume would not re-run `beginCampaign()`. I could not
observe it end to end because the page never gets that far. Fixing the TDZ is what makes the resume
path testable at all.

**Files:** `js/main.js:131`, `js/main.js:168`, `js/main.js:158`, `js/engine/app.js:120`.

---

### 2 — SHOULD-FIX: pausing the game does not stop the creatures moving

`docs/NOTES_COMBAT.md` §4 and the comment at `js/main.js:166-167` both claim that driving the
spawner from `session.update()` means everything that pauses the game stops the creatures.

Half true. `Session.update` returns early on `this.paused` (`js/game/session.js:993`) so
`foes.think()` stops and **bites correctly do not bank up**. But `Vermin` is its own entry in
`app.systems` and `app.start()`'s loop is not gated by session pause
(`js/engine/app.js:112`), so `js/world/vermin.js:916-927` keeps integrating `a.speed` along
`a.heading` every frame. A creature frozen in `STATE.chase` keeps its chase speed and keeps walking.

**Observed** — live session, one rat put into chase, then `game.pause('menu')`:

```
  chasing rat:      {"state":"chase","speed":1.61,"x":-544.361,"z":-21.361}
  after 2 s PAUSED: {"paused":true,"state":"chase","speed":1.61,"movedMetres":3.23}
```

3.23 m of travel in a 2 s pause, at the full 1.61 m/s chase speed, with the heading frozen at the
moment of the pause. A 30 s menu is 48 m — past `AI.leash` (26 m) and most of the way to
`DESPAWN_RADIUS` (70 m). Open the menu with a rat on you and you close it to find the rat has walked
through you and off across the field.

**Files:** `js/world/vermin.js:916-927`, `js/engine/app.js:112`, `js/game/session.js:993`.

---

### 3 — SHOULD-FIX: damage resolves through solid geometry, and the bolt's own raycast proves it

`§6` admits there is no line-of-sight test. Confirming severity: it is worse than "the rat dies
before the bolt arrives", because the bolt *visibly stops at the wall* while the damage lands
anyway. `Spells.reach()` (`js/world/spell.js:221-222`) asks `player.colliders.hit(...)` how far the
bolt gets; `session.strike()` (`js/game/session.js:519-529`) asks nothing.

**Observed** — one live rat, parked on the far side of the nearest building to the granary, player
on the near side, aimed straight at it, everything else moved 300 m away so `acquire()` had exactly
one candidate:

```
{"ratDistance":14.0, "boltRaycastStopsAt":2.8, "wallIsBetween":true,
 "strikeAcquiredIt":true, "hpBefore":10, "hpAfter":2}
```

The bolt the player sees terminates 2.8 m in front of them, against the wall. The rat 11 m beyond
that wall loses 8 of its 10 HP. `bolt_light` is cone 45°, range 26 m (`js/sim/spells.js:9-10`), so
the affected volume is a 26 m 90° wedge with no occlusion of any kind.

**How bad in the granary specifically: worse than §6 implies.** The building I used for this test is
not "nearby" — it stands **inside** `wwa.granary`. The granary rectangle is x −556…−538, z −34…−14;
the demo building occupies x −545.8…−538.6, z −29.5…−22.5, entirely within it, and it is the one
casting the shadow on the right of `death_close.png`. So a solid, collider-backed obstruction is
already sitting in the middle of the game's very first quest area, rats already spawn on both sides
of it, and the first fight in the game is already one you can win by shooting through a wall. Track
A8 will make it worse, not create it.

**Related and not in §6:** `strike()` calls `acquire()` once and applies damage to `r.target` only,
so every multi-target and area spell in the table silently resolves as a single-target hit —
`split_bolt` (`targets: 2`) is a straight downgrade at 0.60 coef, and `cinderfall` (`radius: 5`),
`bloom` (`radius: 8`) and `ember` (`ground: {radius:2,dps:6,seconds:4}`) lose their area entirely.
Not reachable at tier 1, so not urgent, but it belongs in §6 next to "charge does nothing".

---

### 4 — SHOULD-FIX: the act clock runs at double speed for an idle spawner creature, and the comment says the opposite

`js/world/vermin.js:895-896`:

> *A creature in a fight is driven from js/sim/foes.js — its act clock, heading and speed are
> already this frame's, so the ambient wander must not have another go at them.*

The guard is `const fighting = !!a.state && a.state !== STATE.idle` (`vermin.js:897`), so a
spawner-owned creature in `STATE.idle` takes the ambient branch at `vermin.js:903-914` — which does
`a.at += dt / ACT_T[a.act]`. But `foes.think()` calls `tickAct(a, dt)` unconditionally at the top for
any state that is not `dead` (`js/sim/foes.js:97`), including `idle`. Both run every frame.

`Vermin.choose()` rolls `a.act = ACT.attack` on about 10 % of ambient decisions
(`js/world/vermin.js:861`), so idle spawner rats do get an act to run.

**Observed** — live session, one spawner rat parked 200 m away so `think()` keeps it in `STATE.idle`,
`a.act = 1`, `a.at = 0`:

```
 after ~0.4 s: {"state":"idle","act":1,"at":0.696,"wallSeconds":0.404,
                "atIfDrivenOnce":0.351,"ratio":1.98}
```

**1.98×.** Cosmetic — an idle rat plays its lunge at double speed — but the comment above the guard
is confidently wrong about exactly this case, which is the worst kind of comment to leave in.

---

### 5 — MINOR: culling a live creature wipes a pending respawn timer

`Spawner.drop()` (`js/game/spawner.js:192-196`) writes `readyAt` to the **shared** `(area, enemy)`
slot. `cull()` (`js/game/spawner.js:184-190`) drops out-of-range creatures with
`isLive(f) ? 0 : now + wait` — so culling any *live* creature zeroes the timer a death just set.

```
  after a kill, slot readyAt = 39.3 (now = 5.0) => waits 34.3 s
  live now: 7 (one short of 8, waiting on the timer)
  after walking away, slot readyAt = 0.0   live: 0
  walk straight back: 8 rats — the 35 s respawn never ran
```

Small: the walk out past `DESPAWN_RADIUS` (70 m) and back is ~28 s at player speed against a 35 s
timer, so it buys very little. Worth knowing before anyone tunes `RESPAWN.common`, and worth knowing
that respawn is per-nest rather than per-creature (each kill resets the whole area's clock).

---

### 6 — MINOR: a rat that never entered the granary can tick the granary step

The `kill` event carries both the corpse's spawn area **and** the player's areas
(`js/game/session.js:kill()` → `{ area: target.area, areas: this.quests.here }`), and `inArea()`
(`js/game/quest.js:20-24`) unions them. §4 justifies this for "shot from the doorway" — but the
`areas` half is what creates the false positive, and the `area` half already covers the doorway case
on its own.

With `light.01` and `sandbox.01` both active — `sandbox.01` is `kill grain_rat ×6 in wwa`, the
town-wide rectangle — the plan is:

```
A. plan with light.01 + sandbox.01:
     wwa.granary [ [ 'grain_rat', 8 ] ]
     wwa         [ [ 'grain_rat', 6 ] ]

B. light.01 step index before: 0
   after killing a `wwa` rat while stood in the granary: step index 1, counts {"first":[1]}

C. same rat killed while stood in the street only: step index 0    ← correct
```

And the two areas overlap in world space, so it is not hypothetical — with a deterministic RNG, one
of the six `wwa` rats spawned physically **inside** the 18 × 20 m granary rectangle:

```
D. live: 14 | spawned for `wwa`: 6 | of those, standing INSIDE wwa.granary: 1
```

`planFrom` (`js/game/spawner.js:28-48`) makes no attempt to subtract a sub-area's quota from its
parent's. Bounded — the player still has to be standing in the granary — so minor, but the granary
quota can be filled without killing granary rats, and one kill double-credits both quests.

---

### 7 — MINOR (pre-existing, newly visible): the death pose sinks into the ground

The builder flagged this as unverified. Here is the picture. Live session, granary, rat killed
through the real `hit()`, death animation run to `at = 1`, camera parked 1.2 m away
(`scratchpad/death_close.png`):

The body is cut off by the ground plane at roughly the belly line, the contact-shadow decal paints a
dark smear across the middle of the corpse, and the ears have detached from the head. The controlled
dev shot on flat ground (`?dev=1&shot=vermin_die`) shows the same thing on all four rats, so it is
the shader pose (`js/world/vermin.js:512-514`, `uAct.w = 1.45` death roll about a pivot at
`y = K.hip[0] = 0.055`, plus the `-uKind.x * 0.55 * dead` drop) and **not** anything this pass
touched — I diffed the shader and it is untouched.

Reporting it anyway because it is the direct consequence of this change: before this pass nothing
could die, so nobody ever saw the pose in the game. It is now the most-seen animation.

---

## Suspicions I could not demonstrate

- **`planFrom` schedules enemies the rig can never place.** `light.18` (`sour_crow`, `raider`),
  `light.23` / `neutral.21` (`watchman`), `dark.18` / `sandbox.15` (`hollow`) are all `geo: 'people'`
  or `geo: 'chicken'`, so `Vermin.add()` answers `null`. `place()` returns null, `repopulate` breaks,
  and no `readyAt` is written — so the spawner retries every second, forever, for as long as the
  player is in that area. I did not measure the cost; I expect it to be negligible (one `pointIn`
  and one rejected `add` per second) but I did not prove that, and it is a silent permanent no-op.
- **The 35 s respawn at the intended pace.** `light.27` asks for 9 `creek_crab` in `reach.east` but
  `PER_AREA` caps the plan at 8, so that step *must* wait out a respawn. §6 says the intended pace was
  never felt; I did not feel it either.
- **Mobile.** Everything here is headless desktop Chrome. Not tested at 844×390 on a real device.

---

## What I verified as correct

Builder claims I confirmed with my own measurement, so you do not need to re-check them:

| | |
|---|---|
| `node --test` | **373 pass, 0 fail** |
| `node tools/lintQuests.mjs` | 99 quests · 405 steps · 175 nodes · **1 warning, 0 errors** (the pre-existing `light.06` one) |
| New game → granary | `light.01` active, `tracked` set, player at (−547, −24), `here = ['wwa','wwa.granary']`, **8 live grain rats** |
| `assign()` pinning, **real `vermin.js`** | knob → 0 and a forced camera re-assign: `count = 0`, `active = 8`, `everyLiveFoeInActive: true`, `everyLiveFoeSeated: true` |
| **More fighting bodies than `PER_MESH`** | force-placed 40 extra grain rats in one (kind, zone): **8 placed, 32 refused, live = 16, `liveNotSeated: 0`**. `Vermin.add()` refuses at the cap rather than spawning something undrawable, and the roster never drops a pinned body. I could not break this. Note the reachable maximum from shipped content is 14 rats in the light zone (8 granary + 6 town), so the refusal branch is not reached in play today |
| **`kill` fires exactly once** | 400 strikes into a nest of 8 with `tick()` running between each: `strikeSaidKilled: 8`, `killEventsEmitted: 8`, step 0 → 2, counts `{first:[1], rest:[7]}`. A second hit on a corpse answers `{killed:false, hit:false}` and `foes()` filters `isLive`, so a dying body cannot be re-acquired |
| **No resource leak** | 300 kill-and-respawn cycles: `live 8 → 8`, rig `agents 8 → 8`, `slots 1 → 1`, `blows 0 → 0`, rig `add 304 / remove 296` (difference = the 8 currently alive). Nothing grows |
| `?shot=` is inert | `spawnerArmed: false`, `live: 0`, `verminActive: 0`, no `game` object |
| **Gate profile, `--preset=medium --dpr=1 --w=844 --h=390`** | `wall_day` **64 calls / 145k main** (builder said 64 / 145k — exact), `street_dusk` **57 / 106k** (builder said 57 / 106k — exact), `gate_night` 38 / 96k, `town_night` 66 / 111k, `creek_day` 67 / 87k. All five well under the **350k** gate |
| `wall_day` 1280 × 720 | **77 calls / 187k main** — exactly the builder's figure, but at `--preset=high`, not medium. Their table row is under a "medium dpr 1" heading; the number is right, the label is wrong. At medium the same shot is 62 / 144k |
| **Busy fight cost** | 16 live fighting rats in-session at the gate profile: **54 main calls / 128k main triangles**, vermin contributing 3,168 + 336 in 2 draw calls. A fight cannot blow the budget — `POOL = 48` rats is 9,504 + 1,008 triangles, ~3 % of the gate |
| `js/sim/foes.js` purity | no `three`, no DOM, no `Math.random`, no `Date.now`, no `fetch`. Imports `./tables.js` only. Clean |
| `js/world/zones.js` | **unmodified** (`git status` clean on that path) |
| `roster()` / `buckets()` ordering | pinned-first and per-mesh seat allocation behave as documented under the real rig, not just in the unit test |

---

## Test quality

**The 31 new tests are mostly real, with one exception that matters.**

Genuinely at the seam — `js/game/combat.test.js` drives the real `Spawner`, the real shipped quest
packs via `lintAll()`, the real `data/areas.json`, the real `QuestRunner` reducer and the real
`Session.strike()` / `kill()` / `gutter()`. "bolting a rat until it dies ticks the step over exactly
once" and "eight rats is eight kills and a finished step" are the tests that would have caught the
original *"I never found any rats"*. `roster.test.js` is seven honest attempts to break the invariant.
`foes.test.js` asserts the state machine against the real `ENEMIES` table and cross-checks
`tapsToKill`.

Two fakes, both defensible:

- The **rig** (`combat.test.js:29-45`) is a stub. `vermin.js` imports `three` and cannot load in
  node, so this is forced. The cost is real, though: the stub's `add()` never refuses and always
  answers `kind:'rat', zi:0`, so **the `Vermin.add()` `PER_MESH` refusal and the roster/rig
  interaction are not covered by any test** — `roster.test.js` tests `roster()` and `buckets()` in
  isolation and never sees `add()`'s counting rule. I covered that gap by hand in the browser (see
  above, it holds), but nothing in CI does.
- The **session** (`combat.test.js:64-78`) is `Object.create(Session.prototype)` with fields poked
  in. Also forced — the constructor wants a DOM and an AudioContext.

**The one test that mocks the thing under test** is `combat.test.js:338-352`, *"frames burned loading
the packs do not make a new game look like a save in progress"*. It never constructs a `Session`. It
builds a bare prototype object, **manually executes the fix itself** —

```js
s.resumed = started(s.doc);
s.doc.played = 1.4;
assert.equal(s.switched || !s.resumed, true, ...);
```

— and then asserts on it. That is a test of `started()` plus a hand-copy of the two lines. Move
`this.resumed = started(this.doc)` back out of the constructor and into `start()` and this test still
passes; the bug it is named after comes straight back. It is the same shape as
`tools/campaign.test.mjs:20-25` manufacturing `kill` events, and it belongs on the list of things that
hid this class of bug for months. It also would not, and did not, catch defect 1 — which lives on
exactly the code path this test claims to cover.

If you want that invariant pinned for real, the assertion has to be on a constructed `Session` (or on
`main.js`'s boot ordering), not on a hand-rolled stand-in.

---

## Comment style

Mostly good — the new files are commented at the "why", not the "what", and `foes.js`'s notes on
`strikeAt` (verified against the shader's 0.28–0.56 lunge window) and on `hurt()` returning false for
a second hit are both accurate and both earn their place.

Two wrong comments:

- **`js/world/vermin.js:895-896`** — "the ambient wander must not have another go at them". It does,
  for `STATE.idle`, at 1.98× (defect 4). This is the confidently-wrong one.
- **`js/world/vermin.js:828-829`** — *"Default 0: nothing places vermin yet"*. Untouched by this pass,
  but this pass is precisely what makes it false: the spawner places vermin now, and the knob default
  of 0 no longer means an empty world. Whoever reads it next will draw the wrong conclusion about why
  the default is 0.

One new banner comment, `js/game/spawner.js:218` (`// ── the hooks the session reads ──`), in a new
file. `CLAUDE.md` bans these outright. `js/game/session.js:514` adds another, but that file already
had seven of them, so the new one is consistent with its surroundings rather than novel — call it a
pre-existing house-style problem, not a new one.

`js/world/roster.js` opens with a four-line file-top block where `CLAUDE.md` allows "a short file-top
line". It is good prose and it explains a genuinely non-obvious design choice; I would not cut it, but
it is over the stated budget and worth Aaron's call.
