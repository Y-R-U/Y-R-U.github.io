# Combat — closing the seam between the rules and the world

`js/sim/combat.js` was complete and tested. `js/world/vermin.js` was complete and animated. Nothing
joined them: no enemy had hit points, nothing could be hit, and `{ t: 'kill' }` was emitted by zero
lines in the repo. `light.01` "The Granary" was unplayable and the play-test report was *"I never
found any rats"*.

It is joined now. **A new game opens in the granary with eight grain rats in it, a bolt kills one,
the step ticks, eight kills finish both cull steps.** Verified in a real browser, not asserted —
see §7.

**Tests: 342 before, 373 after. 0 failing.** Three new files, 31 new tests.

---

## 1. What was built, file by file

| File | | |
|---|---|---|
| `js/sim/foes.js` | **new** | Pure. A creature's hit points, its six AI states, the act clock and when a bite lands. No `three`, no DOM, no `Math.random`. |
| `js/sim/foes.test.js` | **new** | 7 tests. |
| `js/game/spawner.js` | **new** | Where creatures are, when they come back, `aggro`, `watch`, `respawn`. No `three` — the rig is an interface, which is what makes it node-testable against the real `data/areas.json`. |
| `js/game/combat.test.js` | **new** | 17 tests. The seam: spawner → area shape, cast → damage → death → `kill`, bite → Ward → gutter. |
| `js/world/roster.js` | **new** | Pure. Which agents the rig draws, and which mesh seat each gets. **This is the `assign()` fix** — §2. |
| `js/world/roster.test.js` | **new** | 7 tests, all of them the `assign()` trap. |
| `js/world/vermin.js` | edited | Grew `add()` / `remove()`; `assign()` now delegates to `roster.js`; a creature in a fight is exempt from the ambient wander and the `ROAM` turn-round. `ATTACK_T` / `HURT_T` / `DIE_T` and the local `ACT` enum deleted — both now come from `foes.js`, so the frame the bite lands on and the frame the lunge peaks on cannot drift apart. |
| `js/game/session.js` | edited | `strike()`, `kill()`, `combat()`, `gutter()`, `streakOf()`; the `beginCampaign` bug in §3. |
| `js/main.js` | edited | Seven world hooks; the spawner constructed and armed. |

### The flow, end to end

```
button → session.cast()   spends Focus, plays the bolt, emits `cast`   (all of this already existed)
       → session.strike() combat.acquire() over world.foes()
                          combat.resolveHit(power, coef, armour, crit)
       → world.hit()      foes.hurt() → hp, ACT.hurt, or ACT.die and hostile neighbours
       → session.kill()   every school in ENEMIES[id].xp, drops, marks, Standing
                          quests.emit({ t: 'kill', kind, area })     ← the line that did not exist

session.update → combat(dt) → spawner.tick()  foes.think() per creature: notice, close, lunge
                            → world.strikes() the bites it landed, drained and applied through
                              combat.damageTaken(raw, ward) → vitals.hurt → vitals.down → gutter()
```

Nothing in `sim/combat.js` or `sim/tables.js` was changed. `resolveHit`, `acquire`, `power`,
`critChance`, `damageTaken`, `mitigation`, `enemyDamage` and the whole `ENEMIES` table are used as
they were written.

---

## 2. The `assign()` trap, and how it is solved

`Vermin.assign()` re-sorted the whole agent pool by camera distance every 1.5 s and sliced it to the
`vermin` knob — which defaults to **0**. Three ways that kills a fight:

1. the creature you are fighting drops out of `active` and stops updating entirely;
2. instance indices shuffle under you between frames;
3. `PER_MESH = 16` silently drops the 17th body of a given (kind, zone).

**The fix is an ordering invariant, not a special case.** `js/world/roster.js`:

```js
export const pinned = a => !!a.state && a.state !== STATE.dead;

export function roster(agents, count, cam, cap) {
  const held = [], rest = [];
  for (const a of agents) (pinned(a) ? held : rest).push(a);
  if (cam) rest.sort(byCameraDistance);
  return held.concat(rest).slice(0, Math.min(cap, Math.max(count | 0, held.length)));
}
```

Three properties, each asserted:

- **Pinned agents are at the front.** Only a spawner-owned creature has a `state` field at all, so
  "pinned" and "in a fight or still being buried" are the same set. Ambient nests never have one.
- **The slice length is `max(knob, pinned.length)`.** The ambience budget cannot cut a fight; it
  rises to hold it. `POOL = 48` is still the hard ceiling.
- **`buckets()` fills mesh seats in roster order**, so pinned-first ordering also means a fight can
  never lose its `PER_MESH` seat to a wanderer standing nearer the camera. And `Vermin.add()`
  refuses outright once a (kind, zone) already holds `PER_MESH` fighting bodies, so the spawner is
  told "no" rather than placing something that cannot be drawn.

Instance-index shuffling is a non-issue once (1) holds: nothing outside `assign()` ever holds an
index, and `update()` rewrites the matrix and `aInst` for every seat from `mesh.userData.list`
each frame.

`update()`'s early-out changed from `if (!this.count)` to `if (!this.active.length)` — the old form
would have skipped the whole loop, pinning or not, whenever the knob was 0.

`roster.js` exists as a separate file **only so this can be tested.** `vermin.js` imports `three`
and cannot be loaded in node; this was the one piece of it that had to be provable. It is also
checked live: with a rat engaged, setting the `vermin` knob to 0 and forcing a re-assign with the
camera leaves `active = 8` and the wounded rat still in it, 120 frames later (§7, check 2).

---

## 3. The real reason there were no rats

Building the spawner was not enough. The first end-to-end run found `tracked: null`,
`doc.quests = {}` and the player standing in **Longacre**, 550 m from the granary — with `light.01`
sitting in `quests.offers` the whole time.

`Session.start()` asked `!started(this.doc)` before calling `beginCampaign()`, and
`started = doc.played > 0 || <has quests>`. But the session is added to `app.systems` and is
therefore **already in the frame loop while `start()` is still awaiting `cast.json` and five quest
packs.** `update()` runs `this.doc.played += dt` on every one of those frames, so by the time
`start()` got to the question, a brand-new save had 1.4 s on the clock and looked like a save in
progress. `beginCampaign()` never ran and the first quest was never accepted.

Fixed by reading it once, in the constructor, before any frame can tick:

```js
this.resumed = started(this.doc);      // session.js, constructor
...
else if (this.switched || !this.resumed) this.beginCampaign();
```

This is out of the brief's literal scope and squarely inside its intent — it is the bug the play-test
actually hit. `wiring.test.js` did not catch it because it calls `beginCampaign()` directly, which
always worked; the broken thing was the decision to call it. There is now a test that pins the
invariant, but **the honest proof is the headless run in §7.**

---

## 4. Decisions that could have gone the other way

**The spawn plan is read out of the quest packs, not authored.** A step that says
`kill grain_rat in wwa.granary` is the only authority on what belongs in the granary, so adding a
quest still adds no code and no data. The alternative — an authored area→enemy table — would be a
second place to keep in step with the packs, and would drift.

**Only quests you are *on* populate the world.** `sandbox.01` is a repeatable town vermin contract:
`kill grain_rat ×6 in wwa`. Planning from every definition put six extra rats in the streets of
Whitewall whether or not the player had ever taken the contract, and 13 rats round the granary.
The plan is rebuilt whenever the set of `active`/`turnin` quests changes. The cost is that the
open world has no wandering enemies of its own — off-quest life is the ambient `Vermin.spawn()`
nests, which are scenery. If that reads as empty in a playtest, the fix is a region-band spawner
driven off `REGION_ENEMIES` / `BANDS`, which already exist in `tables.js` and are still unconsumed.

**A quest's own steps add up; across quests it is the maximum.** `light.01` asks for one rat and
then seven. Taking the max gave seven live rats for eight required kills, so the last kill of the
first quest in the game meant standing about for a 35 s respawn — measured at 42 s of wall clock to
finish the step. Summing within the quest gives **eight**, which is also what Bel says is in the
grain, and the step now finishes in 1.5 s of casting. Across *different* quests it stays a maximum:
two contracts on the same barn is still one barn's worth of rats.

**Vermin do not charge; things with a grudge do.** `foes.js` has a `CHARGES` set —
boar, raider, hollow, watchman, brood mother, champions. Everything else notices you at 7 m, but
only turns hostile when you hurt it or when something within 4.5 m of it is hurt. Eight rats
charging a level-1 player on entry is 24 dps against 52 HP; eight rats in the grain that you pick
off one at a time is `RUNTIME.md` §'s own storyboard for the opening ("a grain rat is lit, 6 m away,
back turned, chewing"). Both the reactivity and the aggression list are one edit in a pure module.

**A kill is credited to the corpse's area as well as the player's.** The event carries
`area: <where the creature spawned>` and `areas: quests.here`, and `quest.js`'s `inArea` matches on
either. So a rat shot from the granary doorway counts, and a rat lured out of the granary and killed
in the street still counts. The alternative — the player's areas only — makes the leash a hidden
quest-failure mechanic.

**The spawner is ticked by the session, not by the frame loop.** It is passed to `app.add()` purely
so its knobs register; it deliberately has no `update()`. Everything that pauses the game — a menu,
`visibilitychange`, portrait — has to stop the creatures too, or a rat goes on biting behind an open
menu and hands over thirty seconds of damage on resume. Driving it from `session.update()` makes
`tick()` → `take()` adjacent, so bites can never bank up.

> **Corrected in §9.2.** That got the *sim* for free and nothing else: `Vermin` is its own entry in
> `app.systems` and the frame loop is not gated by `session.paused`, so a creature caught in
> `STATE.chase` went on walking at chase speed behind an open menu. Pause now freezes the rig too.

**The rig has the last word on what exists.** `sour_crow` is `geo: 'chicken'` and the five people-
rigged enemies are `geo: 'people'`; `Vermin.add()` answers `null` for all of them and the spawner
places nothing. An enemy you cannot see is worse than an enemy that is missing. **Consequence:
`watch()` returns `[]` in the game today** — see §6.

**`ACT_T` moved into `js/sim/foes.js`** and `vermin.js` imports it. It is art timing living in a sim
module, which is the wrong shelf on paper; the alternative is two copies of 1.15 / 0.45 / 1.30, and
the bite lands at a fraction of the attack duration. One copy wins.

**The gutter is `SYSTEMS.md` §5.3 minus the Ash.** The session did *nothing* at all when
`down(vitals)` — no death screen existed to respect. `gutter()` now uses the pieces that were
already there: `vitals.gutter()` for the 8 % marks figure, `spawnAtHearth()` (whose own comment
already says "waking at a hearth is already the gutter behaviour"), and half the unbanked
perishables from `PERISHABLE`. No XP loss, no corpse run, one `hud.say()` line, no modal.
The **−15 % XP for 90 s (`GUTTER.ashSeconds`) is not implemented** — see §6.

---

## 5. Cost

| | |
|---|---|
| One grain rat | **198 triangles** (unchanged — no geometry was touched) |
| Eight rats live | **1,584 triangles + 168 contact-disc**, in **2 extra draw calls** |
| In-session, granary, 8 rats, 844 × 390 medium dpr 1 | **41 calls / 83k main triangles** |
| Gate profile `street_dusk`, 844 × 390 medium dpr 1 | **57 calls / 106k** |
| Gate profile `wall_day`, same | **64 calls / 145k main** |
| `wall_day` at 1280 × 720 dpr 1, **`--preset=high`** | **77 calls / 187k main — byte-for-byte the figure in `NOTES_CREATURES.md` §2.** Not a gate-profile number; the gate is `--preset=medium --dpr=1 --w=844 --h=390`, where the same shot is the 64 / 145k in the row above |

`node tools/shot.mjs --all` main-pass counts are identical before and after this pass. Nothing
spawns under `?shot=`: the spawner is inert until `play()` arms it, and `play()` never runs in shot
mode or in the editor. No new textures.

Three knobs, group **Combat**: `foeNotice` (sight radius), `foeRespawn` (seconds), `foeCap` (live
creatures). `foeNotice` writes `AI.notice` in the pure module — the same mutable-config pattern
`spell.js` uses for `SHAPES.bolt.speed`.

---

## 6. What I could NOT verify, and what is still broken

Stated plainly. Everything in this section is a real gap, not a hedge.

**Still not true, in `light.01` itself:**

- **The quest cannot be finished.** Its two kill steps work. Step 3 is
  `interact wwa.granary.lamp` and there is **no lamp in the world** — `main.js`'s `targets()`
  produces `talk` targets off wandering `people` and nothing else, so no `interact` target with
  that id can ever exist. Step 4 is `talk bel`, and Bel is whichever wandering figure `targets()`
  happened to name first, not a placed NPC. Both are Track D placement work, not combat.
- **There is no granary.** Track A8 has not run, so `wwa.granary` is a rectangle of open field with
  demo buildings nearby. The rats are in the right place; the place is not built yet.

**Not implemented, and deliberately so:**

- **The bolt you see and the damage you deal do not agree.** `session.strike()` resolves the hit
  the instant the button is pressed, using `acquire()`'s cone-and-range with **no line-of-sight
  test**. `Spells.cast()` meanwhile raycasts the collider set and takes ~0.2 s of charge plus flight
  time. So you can shoot a rat through a wall, and the rat dies before the bolt arrives. Joining
  them means moving the resolve into the bolt's impact callback in `world/spell.js` — a clean piece
  of work, but it is the visual layer's, not the seam's.
- **Charge does nothing.** `resolveHit` is always called with `charge: 1`. `chargeMul(held)` and
  `CHANNEL` are still unused by anything.
- **No packs and no elites.** `packSize()`, `eliteChance()` and `ELITE` are unused.
- **`FIRST_OF_KIND_XP` is not awarded.** `tools/soak.mjs` models it; the session would need a
  persisted "kinds killed" set, which is a save-shape change with a migration.
- **Ward earns nothing for being bitten.** `WARD_XP_BRACED` / `WARD_XP_BARE` are unwired.
- **`GUTTER.ashSeconds`** (−15 % XP for 90 s after a gutter) is not implemented. Quest turn-in XP
  does not pass through `session.gainXp()`, so a half-implementation would apply to kills and not to
  turn-ins. Left out entirely rather than done inconsistently.
- **`watch()` is implemented and returns `[]` in the game.** It reads live foes whose enemy id is in
  `WATCHERS` (`watchman`), and the spawner cannot place a `geo: 'people'` enemy. The shape it
  returns — `{ id, kind: 'watch', x, z, weight }`, merged by `session.watch()` alongside
  `targets()` — is asserted in node with a planted watchman. **The Graft therefore behaves today
  exactly as it did before this pass**, confirmed live: `session.watch()` reports
  `{ n: 0, seen: false }` in the granary. It will light up the first time anything places a
  people-rigged enemy.
- **Creatures still walk through each other.** Pre-existing, `NOTES_CREATURES.md` §6.6.
- **You can outrun anything.** A rat chases at `1.9 × 0.85 = 1.6 m/s` against a player at ~5 m/s.
  Fine for vermin, wrong for a Watchman. Untuned.

**Verified less well than I would like:**

- **The in-combat death pose was not photographed at close range.** The state machine is asserted in
  node (`act = ACT.die`, `at` holding at 1, body reaped after 1.3 s + 3.0 s) and the pose itself was
  render-checked by the previous pass as `vermin_die`; my changes do not touch the shader. But I did
  not get a clean picture of a rat dying in a live fight — the camera fought the player rig and I
  stopped chasing it. **Treat "the death animation looks right in combat" as unproven.**
- **No phone.** Everything here is desktop Chrome, headless and software-rendered. Per
  `BUILD_PLAN.md`, the image is trustworthy and the timings are not. The triangle counts are real;
  the frame times are not.
- **Balance is untested.** `bitesToGutter(1, 1, 'grain_rat')` says 12 bites and the code agrees, but
  nobody has played it. Notice radius, chase speed, attack gap and respawn are all first guesses,
  all knobs.
- **The 35 s respawn was never felt at the intended pace,** because the plan now holds all eight
  rats and the quest never waits for one.

---

## 7. How it was checked

`node --test` — **373 pass, 0 fail** (342 before). `node tools/lintQuests.mjs` — 0 errors, 1
warning, pre-existing and untouched (`light.06` reward item). `node tools/lintText.mjs` — clean.
`node tools/shot.mjs --all` — five scenarios, main-pass counts unchanged.

Then a real session, driven over raw CDP against the real page — new game, slate clicked, no test
doubles anywhere in the path:

| | Checked | Result |
|---|---|---|
| 1 | new game → tracked quest, where the player is, what is in the granary | `light.01` active, player at `(-547, -24)` inside `['wwa', 'wwa.granary']`, **8 live grain rats** |
| 2 | **the `assign()` trap** — wound a rat, set the `vermin` knob to 0, force a re-assign with the camera | `count = 0`, `active = 8`, the wounded rat still in `active`; still drawn and still fighting 120 frames later |
| 3 | eight kills through `session.strike()` | step index 0 → 2, counts `{ first: [1], rest: [7] }`, Cull 320 · Kindle 96, 8 × `rat_tail`, 16 mk, Standing +4, **1.5 s** |
| 3b | the whole button path — `castRequest` → `update()` → `cast()` → `strike()` | Focus 70 → 1 across 12 taps, one kill, step 0 → 1, Cull +40. The misses are real: the next rat was outside the 45° cone |
| 4 | `Reset this step` → the `respawn` recover verb | `session.gaps` **empty** (it used to record `['respawn', …]` as a missing hook), counts cleared, nest back to 8 within 1.5 s |
| 5 | the gutter | teleported to the Whitewall hearth, HP full, Focus 0, marks 200 → 184 (8 %), silverling 7 → 3 (half, floored), **Cull unchanged** |
| 6 | `aggro(3, pos)` | flipped 2 of 8; `watch()` `[]`; `session.watch()` `{ n: 0, seen: false }` |
| 7 | cost in session | 41 calls / 83k main triangles, vermin 1,584 |

No console errors or warnings in any run.

A close-range render confirms a grain rat standing at the player's feet in `wwa.granary`, mid-chase:
recognisably a rat, pink tail, ears breaking the outline. That was the thing the play-test could not
find.

---

## 8. If you pick this up next

In the order I would do it:

1. **Place the lamp and Bel** so `light.01` can actually be finished. Two `targets()` entries.
2. **Move the hit resolve into the bolt's impact** so the visual and the damage stop disagreeing,
   and line of sight starts mattering.
3. **A region-band spawner** off `REGION_ENEMIES` / `BANDS` for enemies outside a live quest.
4. **A rig for `geo: 'people'` enemies**, which is what turns `watch()` on and makes the Graft's
   suspicion loop real.
5. **Play it and re-tune** `AI` — every number in it is a first guess.

---

# 9. Review fixes — `docs/REVIEW_COMBAT.md`, defects 1–7

Everything in §1–§8 above is the builder's record and stands. This section is the pass that
answered the review: what changed, how it was proved, and what is still open.

**Tests: 373 before, 383 after, 0 failing.** `node tools/lintQuests.mjs` — 0 errors, the same one
pre-existing `light.06` warning. `node tools/shot.mjs --all` at the gate profile is unchanged to the
call: `wall_day` **64 / 145k**, `street_dusk` **57 / 106k**, `gate_night` 38 / 96k, `town_night`
66 / 111k, `creek_day` 67 / 87k.

Every browser number below is from raw CDP against the real page, headless at 844 × 390,
`--preset=medium --dpr=1`. Per `BUILD_PLAN.md` the images and the counts are trustworthy and the
frame times are not, so no fps is quoted.

## 9.1 The blocker: a resume did not boot

`const vermin` / `const spawner` moved from the bottom of `js/main.js` to just after `spells`, above
every line that can start a frame. Nothing else about them changed: `app.add` is still only for the
knobs, the spawner still has no `update()` and is still inert until `play()` arms it, and the order
they sit in `app.systems` — after `spells`, before the `Session` — is the order the new-game path
already had. Registering their knobs before `buildPanel()` also means the trailing `refreshPanel()`
is gone, and `?vermin=8` on the URL now reaches the knob it names.

**Proved both ways, over CDP.** Fresh game → a rat killed through the real `strike()` →
`autosave.flush()` → reload:

```
with the declarations back at the bottom     with the fix
  ready:   false                               ready:   true
  boot:    ""      (overlay never lifted)      boot:    "gone"
  game:    false   spawner: false              game:    true   spawner: true  vermin: true
  body:    "Something broke: Uncaught          body:    "THE GRANARY / Cull the rodents 0/7 …"
            ReferenceError: Cannot access      tracked: light.01   step: 1 (the saved step)
            'vermin' before initialization"    live:    8          console: nothing
```

The broken run trips on `vermin` rather than `spawner` because this pass also moved the
`window.__forge.vermin` line up with the declaration; it is the same dead zone, the same
`ReferenceError` out of `app.start()`, and the same dead page.

**The node test is `nothing the world hooks close over is declared after the frame loop starts`**
(`js/game/combat.test.js`). It reads `js/main.js`, takes every identifier inside the `world: { … }`
block and asserts that any `const`/`let`/`class` of that name is declared before `app.start()`.
Confirmed to fail on the original ordering and pass on the new one. It is a source-shape test
because `main.js` cannot be imported in node — treat the CDP run above as the real evidence and the
test as the tripwire.

## 9.2 Pause now stops the creatures

`Session.pause()`/`resume()` call a new `world.freeze(v)` hook; `main.js` points it at
`vermin.frozen`; `Vermin.update` returns immediately when frozen. The rig is a separate entry in
`app.systems`, so nothing else could have reached it. `NOTES_COMBAT.md` §4's claim that the session
tick got this "for free" is corrected in place.

**Measured live**, one rat put into `STATE.chase` at the player's feet:

```
chase speed 1.615 m/s   ·   2 s running: 2.244 m moved   ·   2 s paused: 0.000 m moved
```

(The reviewer's 3.23 m over the same 2 s is the same defect measured on a faster frame budget.)
`pausing the game stops the rig, which the frame loop does not` in `combat.test.js` pins the hook
through a really-constructed `Session`, including that a second pause reason keeps it frozen.

Freezing is deliberately the whole rig, ambient nests included — a paused game with rats still
scurrying about is the same bug. **Not fixed:** `People` and `Chickens` still animate through a
pause. Pre-existing, untouched, and out of this scope.

## 9.3 Line of sight

**I did the line-of-sight test, not the move into the bolt's impact.** The reason is that the
session and `Spells` are not connected: the button sets `castRequest` on the session, and the bolt
is fired independently off `player.castEdge` inside `Spells.update`. Joining them means the session
owning the bolt spawn, a callback out of `world/spell.js`, and combat resolution moving into a
module that imports `three` and therefore cannot be loaded by any node test — the three tests that
today drive `strike()` → `kill()` → the quest step would all have to fire a fake bolt instead. That
is a real piece of work and it should still be done (§8 item 2); it is not a defect fix.

What changed: `session.strike()` filters the world's creatures through a new `world.sight(from, to)`
hook before `acquire()` sees them. `main.js` implements it as **the bolt's own question asked the
same way** — horizontal, from `pos.y + 1.35`, against `player.colliders` with the same 0.12 padding
`Spells.reach()` uses. Filtering rather than rejecting means the cone picks the nearest creature you
can actually hit, instead of missing because a rat behind a wall was nearer.

**Measured live**, against a real wall found by sweeping the collider set:

```
rat 8.8 m away, bolt's raycast stops at 2.77 m   → struck: false, hp 10 → 10
same rat moved to 1.8 m, this side of the wall   → struck: true,  hp 10 → 2
```

Still true and still wrong: **the damage lands on the button press, not on the bolt's arrival.**
Line of sight is now the same for both, but the timing is not.

**Multi-target is a known gap, now written down** — in a comment on `strike()` and here.
`strike()` applies damage to one target, so `split_bolt` (`targets: 2`) resolves as a single hit at
its reduced 0.60 coefficient, `cinderfall` (`radius: 5`) and `bloom` (`radius: 8`) lose their area,
and `ember`'s burning ground does not exist. I chose not to implement them: none is reachable at
tier 1, and area damage with no area *visual* would be a new instance of exactly the defect in this
section — damage landing where the player is shown nothing.

## 9.4 The act clock

`foes.think()` ticks the act clock for every state it owns, idle included, and `Vermin.update`'s
ambient branch was ticking it a second time. The ambient branch now advances `a.at` only for a
creature the spawner has never touched (`a.state` unset); it still owns the wander, the wait and
the act-finished bookkeeping for an idle spawner creature. `Vermin.choose()` now sets a `wait` when
it rolls an attack, because `foes.js` clears the act itself and without one the creature would pick
a new act on the very next frame. The comment above the guard says what is actually true.

**Measured live**, one spawner rat parked 200 m away in `STATE.idle` with `act = 1`, counting the
`dt` the session really ticked rather than wall clock:

```
36 frames · 0.600 s of sim · at = 0.522 · expected 0.600 / 1.15 = 0.522 · ratio 1.00   (was 1.98)
```

## 9.5 The three minors

**Culling no longer wipes a pending respawn.** The straight fix — leave the slot's clock alone when
culling a live creature — has a worse failure than the bug: `readyAt` gates the whole nest, so
walking away from a granary where one rat had died and coming back would have found it *empty* for
35 s. A slot now carries `owed` as well: how many of that nest are dead and waiting. Repopulation
fills to `want − owed`, culling a live creature costs nothing, and `respawn()` clears both.
Killing one of eight now holds back exactly one rat, whether or not you walk away in between —
`walking away from a nest does not hand back the rat you killed` asserts the whole sequence.

**A kill is credited to the corpse's area, not the player's.** The event now carries the creature's
own area plus that area's declared parents (a new `lineage()` in `js/game/areas.js`), so a granary
rat still pays a step that asks for the whole town, and a town rat can no longer tick a granary step
because the player happens to be standing in the granary. Only a creature with no area at all —
nothing the spawner placed — still falls back to `quests.here`. Two tests, both of which fail
against the old event shape.

**A rat planned for the town no longer spawns inside the granary.** `place()` rejects a candidate
point that falls inside a *planned* area nested under the one being filled. 200 forced `wwa`
placements at the granary's own doorstep, none of them inside it (it was ~1 in 8 before); live with
`light.01` and `sandbox.01` both active, 6 town rats and 0 in the granary.

## 9.6 The death pose and the contact decal

Both fixed, both in `js/world/vermin.js`, and both are art values rather than new machinery.

- **The sink**: the death drop `- uKind.x * 0.55 * dead` is `0.25` now. The 83° death roll about the
  hip pivot already brings the body down to rest; the extra 3 cm on a rat 11 cm tall was pushing its
  lower flank through the ground. At 0.25 the rat's body sits at ≈ 4.5 cm with its lowest point just
  above zero, which is where a body lying on its side belongs.
- **The smear**: the contact disc rides 3 cm off the ground so it cannot z-fight, and a body rolling
  onto its side comes down through that plane — so the disc, which draws after the bodies, painted a
  dark band across the corpse. It now settles to 4 mm over the same 0…0.42 window the shader rolls
  in.

Checked with `?dev=1` renders of `vermin_close`, `vermin_nest`, `vermin_boar` and `vermin_crab` in
the `die` pose (before/after, and against `verminContact = 0` to confirm the band was the disc), and
then **in a real fight**: a rat killed through the real `hit()`/`kill()` with the camera parked
0.9 m away shows the body lying on the ground, tail out, no band across it
(`scratchpad/death_live.png`). That is the picture the builder could not get.

**Not tuned individually:** the same coefficient carries the boar and the crab. The crab reads
correctly — shell down, legs up. The boar is much improved (it was 6 cm under) but now lies with its
snout in the ground; if a boar is ever a fight the player watches, that pose wants its own pass.
Nothing in the shader's structure changed, so the risk is confined to those two numbers.

## 9.7 Tests

**373 → 383.** The rewritten and new ones:

| | |
|---|---|
| `frames burned loading the packs …` | **rewritten.** Constructs a real `Session`, calls the real `start()`, and turns the real `update()` for 84 frames while `start()` is still awaiting the packs — the exact race — then asserts `light.01` is active and tracked. The old version hand-executed the fix on a bare prototype and passed either way; this one **fails** if `this.resumed = started(this.doc)` moves back into `start()` |
| `and a save in progress is not started over` | the other half, through a written save and a second real `Session`, with `beginCampaign` spied on rather than reimplemented. Honest note: this one passes with or without the fix — a real save is `started()` on either reading, which the review said too |
| `nothing the world hooks close over …` | the §9.1 tripwire |
| `pausing the game stops the rig …` | §9.2, on a constructed `Session` |
| `a creature behind a wall is not hit …` | §9.3, including that the cast then takes one it can see |
| `walking away from a nest does not hand back the rat you killed` | §9.5 |
| `a kill is credited to the corpse …` / `… still pays a step that asks for the whole town` | §9.5 |
| `a rat planned for the town does not stand in the granary inside it` | §9.5 |
| `a (kind, zone) mesh runs out of seats …` / `a corpse holds its seat …` | §9.7's `PER_MESH` gap |

Constructing a real `Session` in node needed about 40 lines of fake DOM at the top of
`combat.test.js` (append, classList, a `fetch` that reads the packs off disk). That is a real cost
and it buys the one thing the review asked for: an assertion on the thing under test.

**The `PER_MESH` refusal** was untestable because `Vermin.add()` counts seats inline and `vermin.js`
imports `three`. The rule moved to `roster.js` as `seatsLeft(agents, kind, zi)` — the same file and
the same reason the roster invariant lives there — and `PER_MESH` moved with it, so `roster.test.js`
tests the real number. `Vermin.add()` is now `if (seatsLeft(...) <= 0) return null`. The call site
itself is still only covered live: **8 placed, 32 refused, 16 live, 0 unseated, one mesh at 16**,
against the real rig.

**Not done:** `tools/campaign.test.mjs:20-25` still manufactures its own `kill` events. The review
lists it as the same failure shape and it is, but it is a soak model rather than the seam and it was
not in scope for this pass.

## 9.8 What I could not verify

- **No phone.** Everything is headless desktop Chrome at 844 × 390. Not tested on a device, and the
  frame times from a software renderer are not evidence of anything.
- **The gate under load.** 8 rats in session at the gate profile is **48 calls / 102k**, 16 fighting
  rats is **48 calls / 103k** (vermin 3,168 + 336 in 2 draw calls). Both well inside 350k, and the
  five scenario shots are unchanged — but all of it is software-rendered.
- **The pause fix on a real menu.** I called `pause('menu')`/`resume('menu')` directly. I did not
  open the menu with a finger and watch a rat.
- **`light.01` still cannot be finished** — step 3 wants a lamp that does not exist. Unchanged by
  this pass; see §6.
- **Balance is still untested by anyone playing it**, and the review's own list of things it could
  not demonstrate (`planFrom` scheduling enemies the rig refuses, the 35 s respawn at pace) is
  untouched here.
- **`js/world/roster.js`'s four-line file-top block** is over `CLAUDE.md`'s "short file-top line"
  budget. The review flagged it and said it would not cut it; I have left it for Aaron's call.
