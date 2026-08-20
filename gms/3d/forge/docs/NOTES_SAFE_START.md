# NOTES_SAFE_START — the first two minutes

Aaron started a fresh game in an incognito window and was "straight away attacked by rats (and
killed?)". He was. Reproduced in the real browser on the first try: **guttered 6.6 s after the
world appeared, without touching a control.**

Three files changed, five lines of behaviour between them.

---

## 1 — what was actually wrong

### The aggro bug is real, and it is the whole of it

`js/sim/foes.js` `think()`:

```js
if (d > AI.leash || (!a.hostile && d > AI.notice)) return 0;
```

A **non-hostile** creature inside `AI.notice` (7 m) left idle and went alert → chase → attack.
`hostile` never decided *whether* to engage; it only widened the engage range from 7 m to 26 m.
`grain_rat` is not in `CHARGES`, so the comment eight lines above it —

> Vermin do not charge… they turn on you when you hurt one — which is what makes L01 a hunt in the
> dark rather than eight rats at once.

— described a game that did not exist. The first browser run says so exactly: **`hostile` stayed 0
for all eight rats the whole time they were eating the player.** They were never angry. They just
engaged.

### One correction to the brief

The brief says the player spawns at `wwa.kitchen`, 56 m from the granary, and is mauled on the
approach. That is not what happens.

`restorePosition()` does fall back to `spawnAtHearth()` → the kitchen, but `beginCampaign()` runs
straight afterwards and calls `placeAtArea(startAreaOf('light.01'), { far: true })`, and
`light.01`'s first step is `in: wwa.granary`. **A new game puts the player at the centre of the
granary, standing in the nest** — which is deliberate, and `session.js` says so ("RUNTIME §7: a new
game opens *inside* its first quest"). Measured: `at: {x:-547, z:-24}`, `dGranary: 0`,
`here: ["wwa","wwa.granary"]`.

The kitchen is where the brief's 56 m came from, but it is the *destination of the gutter*, not the
spawn. The very first run shows the player teleported there at t=6.6 s with a full bar — which is
also why the naive version of my own test passed with the bug still in (see §4).

There is no "approach". There is no warning shot. The mauling starts on frame one.

### The numbers

52 HP (`hpMax(1,1)`), 5.1 damage a bite, `damageTaken(5.1, ward 1)` = 4.64, one bite per rat per
~2.55 s (`ACT_T[attack]` 1.15 + `AI.gap` 1.4). Six of the eight were inside 7 m at spawn:

```
t=1.6s  hp 47.4/52   engaged 6/8   hostile 0/8   nearest 0.1 m
t=3.6s  hp 28.8/52
t=5.6s  hp  5.6/52
t=6.6s  GUTTERED — woken at wwa.kitchen, 56 m away, hp 52/52
```

---

## 2 — what changed

### `js/sim/foes.js` — `hostile` gates the fight, `notice` only times it

```js
if (!a.hostile || d > AI.notice) return 0;
```

A passive creature stays idle at any distance. A creature with a grudge engages at `notice` and
gives up at `leash`, which is what the comment ten lines below has always claimed:

> a creature that gives up goes back to wandering, but it stays hostile and picks the fight up
> again the moment you come back inside **its notice**.

That comment was a lie against `d > AI.leash`. It is now true.

**I considered the other shape** — gate on `hostile` but keep engaging at `leash` — and rejected
it. `AI.notice` is referenced in exactly two places: this line and the `foeNotice` /
"Creature sight (m)" knob. Keeping `leash` as the engage radius would make both the constant and
the shipped knob dead. Sight has to be what makes a thing come at you or it is not sight.

**The consequence to know about:** everything in `CHARGES` now charges from 7 m instead of 26 m.
That is a real change to boars, raiders, hollows, Watchmen and champions, not just to rats. Nothing
in the corpus regressed (535 tests, the end-to-end ladder in `tools/campaign.test.mjs` included),
and 7 m at `AI.chase` 0.85 × the rig's run is still 3–4 seconds of approach. If a boar reads as
short-sighted now, the fix is the knob, not the constant.

The paths that make L01 a fight are untouched and still work: `hurt()` sets `hostile` and drops
straight into `chase` regardless of distance, and `Spawner.hit()` still calls `aggro(AI.alarm)` so
the neighbours get the grudge.

### `js/game/onboard.js` + `js/game/session.js` — the granary teaches the tap

With the aggro fixed, **the only way to be hurt in L01 is to cast first**. So the question stopped
being "is the start safe" and became "is the player taught the one gesture that can hurt them,
before they use it". They were not:

```js
{ id: 'cast', text: 'Tap to cast.', when: c => c.target, … }
```

`c.target` is `!!this.context` — the **context button's** target: a prop, an NPC, a gather node.
The granary has none of those, and creatures are never in `world.targets()`. Measured in the
browser at spawn: `prompt: null, context: null`. **The room whose entire task is casting was the
one room in the game that never armed the cast prompt.**

`when: c => c.foe || c.target`, with `session.foeNear()` answering `foe` off the bolt's own
`range`, so the prompt cannot arm for something the cast could not reach. `c.target` is kept, so
nothing that armed the prompt before stops arming it.

---

## 3 — what I deliberately did not do

**No hearth spawn-suppression radius.** Measured before rejecting it. It fixes nothing here — the
player does not wake at a hearth on a new game, they wake in the granary — and it would do damage
elsewhere. The nearest planned area to a hearth is `wwa` itself at 47 m, and `wwa` is a 240 × 200 m
rect that *contains* `wwa.kitchen`; `sandbox.01` plans six `grain_rat` in it. A no-spawn bubble
round the hearth would quietly make a town vermin contract unfinishable while the player stands at
their own fire, because `place()` already requires a candidate within `SPAWN_RADIUS` of the player.
Cost, no benefit.

**No change to `AI.alarm`.** The brief asked what 4.5 m actually yields with eight bodies in the
granary's footprint. Over 400 real `Spawner` fills with the real areas and the real pack, tapping
the nearest rat:

| woken by the first tap | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|---|
| runs (of 400) | 86 | 156 | 104 | 37 | 15 | 1 | 1 | 0 |

Mean **2.37**, 87 % of the time three or fewer, never the whole nest. That is already "pull them a
few at a time". It needed no knob turned.

**No new quest beat before L01.** That is redesigning the campaign, which the brief ruled out and I
agree with.

**I did not wire the opening beat.** `ui.openingBeat()` is built and live-verified, and
`onboard.js` `OPENING` holds three beats, the third of which is literally "Cull what is in the
grain". `docs/NOTES_MOBILE_FIX.md` §7 says it is unwired only because session.js belonged to
another agent that pass, and gives the one line:

```js
if (opts.fresh) openingBeat(this.host, OPENING, { onDone: () => this.autosave.mark() });
```

I left it alone because the copy is marked **not signed off** and that is a content call, not a
safety one. It is the obvious next thing: it is the only remaining answer to "nothing tells the
player the granary is a fight". **Say the word and it is one line.**

---

## 4 — the evidence

### Revert the fix, per test

Every new test was re-run with its fix backed out of the source. All six of the following are new
or rewritten; the three fixes were reverted one at a time so no test could be carried by another.

| test | file | reverting | result |
|---|---|---|---|
| a rat you have not touched never starts a fight, at any distance | `sim/foes.test.js` | `foes.js` | **RED** — "a passive rat at 4 m left idle" |
| a rat that has been provoked closes and bites | `sim/foes.test.js` | `foes.js` | **RED** — "out of sight is out of mind" |
| standing in the nest costs nothing until the player starts the fight | `game/combat.test.js` | `foes.js` | **RED** — "a minute of standing in the grain cost 51.0 HP" |
| the granary arms `Tap to cast`, which it never used to | `game/combat.test.js` | `onboard.js` | **RED** |
| the granary arms `Tap to cast`, which it never used to | `game/combat.test.js` | `session.js` `foeNear` | **RED** — "eight rats in bolt range and nothing to cast at" |
| a creature in bolt range arms the cast prompt on its own | `game/onboard.test.js` | `onboard.js` | **RED** |

Two of the new tests stay green under every revert, and are labelled here rather than claimed as
defences:

- **a new game puts the player in the granary, which is where the rats are** — scaffolding. It
  fails if `beginCampaign` ever stops opening inside `light.01`, which would silently invalidate
  every other test in the group.
- **one bolt wakes the nest, and refusing to fight it still gutters you** — the guard on the other
  side. It fails if the fix is ever over-corrected into making the granary safe *after* you start
  the fight.

### The test that encoded the bug

`js/sim/foes.test.js`, "a rat ignores you until you are close, then closes and bites", walked an
**untouched** rat from idle to alert at 4 m and asserted that as correct. It was the bug, written
down as the specification. Split in two: a passive rat is now checked at 9 m, 4 m, 1.3 m and 0 m
and must stay idle and deal zero; the closing-and-biting half survives unchanged with the rat
provoked first.

### The near-miss, which is the part worth reading

The first draft of "standing in the nest costs nothing" **passed with the bug still in the
source.** It ran a minute of `session.update()` and asserted `g.vitals.hp === full` at the end. The
player was mauled to death at 5 s and `gutter()` handed him a full bar and a teleport to the
kitchen, so the final number was 52/52 and the suite was green over a game that was unplayable —
the exact failure `docs/` has been bitten by twice.

It now reads the **lowest** HP of the minute, counts `spawnAtHearth` calls, and asserts the player
never moved. With the bug back it says `cost 51.0 HP`.

### Driving the real path, not the model

`js/game/combat.test.js` gained a `newGameInTheGranary()` harness: a real `Session` with
`fresh: true`, its real `start()`, the real quest packs, the real `data/areas.json`, a real
`Spawner` armed with the real `light.01`, and `session.update(1/60)` turning the frame. Nothing is
positioned or armed by hand — `beginCampaign()` puts the player in the granary and the spawner
fills the nest around him.

One honest seam: `js/world/vermin.js` imports three and cannot be loaded in node, and it is what
walks a chasing body. The harness applies `carry()` from `foes.js` — the same four lines
`robed.js` and `chicken.js` call — so a chase closes there the way it closes in the game. That is
the rig's movement supplied, not the fix simulated; the fix is exercised through `think()` inside
the real `Spawner`. The browser runs below are what actually prove it.

### The browser, over raw CDP

Driven headlessly through `tools/shot.mjs`'s exported `open()`: real page, real slate click on
WHITEWALL, real game.

**Before (HEAD):** guttered at 6.6 s, untouched, 6 of 8 engaged, `hostile` 0/8 throughout.

**After, standing still for 60 s in the middle of the nest:**

```
t=0    hp 52/52   prompt "Drag to look."    engaged 0/8  hostile 0/8
       … a real mouse drag on the canvas …
       hp 52/52   prompt "Drag to move."
       … a real KeyW press …
       hp 52/52   prompt "Tap to cast."     ← never appeared before this pass
t=60s  hp 52/52   LOWEST HP OVER THE MINUTE: 52   engaged 0/8  hostile 0/8
```

Rats wandered to within 0.4 m over the minute and never touched him.

**After, provoking it — aim at the nearest rat, tap once, then do nothing:**

```
cast at 2.2 m → 8 damage, 3 of 8 woken
t=+2s   hp 42.7/52
t=+5s   hp 24.2/52
t=+9s   GUTTERED
```

One tap is 8 of a rat's 10 HP, so two taps a rat, exactly what `tapsToKill(1,'grain_rat')` says.
Provoke the nest and stand there refusing to fight and you still die in nine seconds. It is a
fight; it is just a fight you start.

Screenshots taken at 1280 × 720: the spawn reads as a lit stone room with rats scattered at 3–4 m
in front, not a mob on top of you, and the `Tap to cast.` plate sits clear of both thumbs.

### Suite

```
node --test              535 pass, 0 fail   (529 at HEAD, +6 new)
node tools/lintQuests.mjs  1 warning — light.06 apprentice_cord, pre-existing
node tools/lintText.mjs    0 warnings, 0 errors
```

---

## 5 — what I am not sure about

- **7 m for the charging enemies.** It is the right shape and it makes the shipped knob mean
  something, but nothing in the corpus tests the engage distance of a boar or a raider, so this is
  argued from the code and the comment rather than from a play-test of Act 2+. Worth one pass
  through a `blight_boar` fight with the panel open.
- **A hostile creature parked outside 7 m now waits.** Wake the far half of the granary with an
  alarm chain and those rats sit still until you walk back in. In an 18 × 20 m room that reads as a
  hunt. In a big outdoor area it may read as creatures ignoring you. I think that is correct and it
  is what the `leash`/`notice` comment always described, but it is a feel call.
- **The cast prompt still cannot jump the queue.** `next()` returns the first unretired prompt, so
  a player who never drags to look never sees "Tap to cast" — `look` is still what is armed, and
  after `HOLD` it simply stops being drawn. Pre-existing, not touched, and I do not think it is
  worth changing: nobody plays for four seconds without moving the camera. Flagging it because it
  means the teaching order is a chain, not a set.
- **`gutter()` at the granary is now reachable only by choice**, which makes the kitchen hearth the
  place you wake after a fight you picked. That is a better read than the current one, but it does
  mean a new player's first experience of the hearth is still a death. The opening beat is what
  would fix that, and it is Aaron's copy call.

---

# Pass 2 — applying REVIEW_SAFE_START

Everything above stands. The `!a.hostile` gate is unchanged and is still the fix. This pass is the
review's findings applied, plus two corrections to the review itself.

## What changed

`js/sim/foes.js`

- **`AI.charge = 26`**, a third radius beside `notice` and `leash`. Must stay ≤ `leash`, or a
  charger re-engages on the frame it gives up; the knob's max is `AI.leash` for that reason.
- **`PASSIVE = new Set(['grain_rat'])`**, and `arm()` now sets `a.charges = CHARGES.has(enemy)`
  and `a.hostile = !PASSIVE.has(enemy)`.
- The idle guard is `if (!a.hostile || d > (a.charges ? AI.charge : AI.notice)) return 0;`

`js/game/spawner.js` — a `foeCharge` / "Charge sight (m)" knob (1–26, default 26) beside `foeNotice`.

`js/game/session.js` — `this.rng = opts.rng || Math.random`, used by `strike()`'s `resolveHit` and
by the five other `Math.random` call sites in the file; `visibleFoes()` split out of `strike()` and
now also used by `foeNear()`; `obCtx()` stops asking for `foe` once the cast prompt is retired.

`js/game/combat.test.js` — "eight passive rats all engaged" → "six of the eight".

**Three classes, not two.** `charges` is a per-creature field set once in `arm()`, not a `CHARGES`
lookup in `think()` — the review's suggested shape. `think()` runs per creature per frame and the
class cannot change, so the Set belongs at arm time. It also gave the third state somewhere to
live: `hostile` alone can no longer say whether a creature hunts you or merely has a grudge.

**Provoked vs hostile-by-class.** They now get different radii, which is what Aaron asked for. A
rat you hit and outran re-engages at `notice` (7 m) — you can break off. A champion closes from
`charge` (26 m) — you cannot. The only behavioural difference from pre-change, for anything that is
not a grain rat, is exactly that: a provoked non-charger used to re-engage at 26 m and now
re-engages at 7 m.

## The `PASSIVE` decision — read this one, it is a design call

The review presented four `survive` steps as one regression. **They are two, with different
causes**, and only three of the four are fixed by the charge radius:

```
step                area             pre-change damage   by kind
light.18/hold       reach.east       489               raider 502, creek_crab 54, sour_crow 29
dark.16/hold        reach.east       769               raider 799, creek_crab 82, sour_crow 44
neutral.14/wait     reach.east       489               raider 502, creek_crab 54, sour_crow 29
light.05/watch      wwa.northgate    350               mire_rat 278            <- no CHARGES at all
```

`light.05` is 100 % vermin. Its two strays are `mire_rat`, which is not in `CHARGES` and never was.
No charge radius can bring it back — the only thing that zeroed it is the intended fix, vermin
being unprovokable. Its own hint is "Two strays come up the road. Turn them back."

So I narrowed `PASSIVE` to the one creature the argument for it actually covers. L01 stands a
level-1 player with 52 HP *inside* a nest of eight grain rats before teaching the tap; nothing else
in the game is met that way. Everything else defends its ground inside `notice` — which is exactly
what shipped before either pass. Measured across all eight `survive` steps, damage is now
**identical to pre-change, to the unit**, while the granary stays at 52/52.

If Aaron wants `mire_rat`, `rat_knot`, `creek_crab`, `sour_crow` unprovokable as well, it is one
line — add them to `PASSIVE` — and the price is `light.05`, `light.23`, `dark.21` and the Drove
Road escort going back to zero. I do not think that price is worth paying, but it is his call and
the code now makes it a one-line call instead of an emergent property of a Set that was written for
something else.

## The numbers

Real `Spawner`, real `data/areas.json`, real quest packs, all defs armed, player parked at the area
centre for the step's own duration doing nothing, 60 runs each. Raw damage, median / p90 / runs
that took nothing.

| step | as reviewed | **now** | pre-change |
|---|---|---|---|
| `light.05/watch` wwa.northgate 90 s | 0 / 0 / 60 of 60 | **350 / 711 / 22** | 350 / 711 / 22 |
| `light.18/hold` reach.east 60 s | 0 / 0 / 56 of 60 | **489 / 1048 / 12** | 489 / 1048 / 12 |
| `dark.16/hold` reach.east 90 s | 0 / 0 / 56 of 60 | **769 / 1608 / 12** | 769 / 1608 / 12 |
| `neutral.14/wait` reach.east 60 s | 0 / 0 / 56 of 60 | **489 / 1048 / 12** | 489 / 1048 / 12 |
| `neutral.21/stand` lac.millbridge 120 s | 6998 / 10250 / 0 | **16198 / 16299 / 0** | 16198 / 16299 / 0 |
| `light.23` + `dark.21` bst.bailey 120 s | 0 / 0 / 60 of 60 | **1541 / 2608 / 2** | 1541 / 2608 / 2 |
| `neutral.06/apart` lac.square 60 s | 0 | 0 | 0 — nothing is planned there at all |

**Standing in the nest.** Real page over CDP, fresh `localStorage`, clicked WHITEWALL, stood still
60 s, three separate runs: `hp 52/52` throughout, lowest HP over the minute 52, `engaged 0/8`,
`hostile 0/8`, rats wandering in to **0.4 m**, **0 console errors**.

**`light.11` — "Knots come off the moor at the milestones."** True again. Walking `road.drove` end
to end at 3 m/s, 60 seeded runs: as reviewed **0/60** runs had a knot leave idle and 0/60 took a
bite; now **59/60** and **48/60**, mean 22 damage. `rat_knot` is not in `CHARGES` and still is not —
they engage inside `notice` as they always did, which is what the hint describes.

**One raider, in the real browser, byte-identical setup, player never moves.** Placed at
`reach.east`, everything culled but one raider, parked idle at exactly 12 m, spawner plan emptied so
nothing refills:

```
with this pass       1s chase 9.7m   2s chase 6.0m   3s chase 2.2m   4s attack, hp 30.8
                     7s hp 9.6   →  guttered, woken at wwa.kitchen
as reviewed          1s idle 12.0m  …  12s idle 12.0m   hp 52/52 the whole time
```

**The knob.** Live in the real page's Combat group and settable
(`foeCharge · Charge sight (m) · 1–26 · default 26`). Damage over the same two holds:

```
foeNotice  7  foeCharge 26 | reach.east 505 | wwa.northgate 153   <- shipped
foeNotice  1  foeCharge 26 | reach.east 470 | wwa.northgate   0
foeNotice  7  foeCharge  1 | reach.east  35 | wwa.northgate 153
foeNotice  1  foeCharge  1 | reach.east   0 | wwa.northgate   0
foeNotice 20  foeCharge 26 | reach.east 773 | wwa.northgate 685
```

## Revert the fix, per test

Each fix backed out of the source on its own; `node --test` in full each time.

| revert | tests that go RED |
|---|---|
| the class radius → `d > AI.notice` for everything (the state the review reviewed) | `a creature that hunts you closes from `charge`…` (foes) · `a raider in the 7-26 m band still comes for you` · `holding the east water stands is still a fight` |
| `PASSIVE` → `a.hostile = CHARGES.has(enemy)` | `the grain is the one nest that waits to be provoked` |
| `strike()` back on the global `Math.random` | `the same opening bolt crits, and the rng that decides it is the session's…` |
| `foeNear()` back to range only | `the cast prompt and the bolt agree about a creature behind a wall` |
| a second prompt starts reading `ctx.foe` | `nothing but the cast prompt reads \`foe\`` |
| the original bug — `hostile` only widens the radius | five, including `standing in the nest costs nothing…` and `a rat you have not touched never starts a fight` |

The rng revert is deterministic, not probabilistic: the test counts draws on the injected rng across
the `strike()` call and asserts exactly one, so it goes red whether or not `Math.random` happens to
crit.

## The flaky test

`Session` now takes `rng` the way `Spawner` does, and the granary harness passes one. The test drives
the real `strike()`; it does not avoid it. Both branches are now cases rather than weather: the
gutter test runs a never-crit rng, and a new sibling runs an always-crit rng and asserts the opening
bolt kills outright and leaves seven rats — which is the exact mechanism of the flake, written down.

**60 consecutive runs of `node --test js/game/combat.test.js`: 0 failures** (3 before).

The other five `Math.random` call sites in `session.js` — fishing `strike`, `harvest`, `finish`,
`cookOne`, `tickRun` — went through `this.rng` in the same edit. No behaviour change with the
default, and the next test that needs a deterministic catch will not have to re-litigate this.

## The wrong comment — I made the code true

`foeNear()` now applies `world.sight()`, through the same `visibleFoes()` helper `strike()` uses, so
the two cannot drift. It does **not** apply the cone, and the comment says so and says why rather
than pretending. Measured over 40 real granary fills with the player turning slowly: range-only arms
**100 %** of frames, cone-gated arms **89.8 %** and flips on and off **six times per 30 s**. A
teaching prompt that blinks is worse than one that is occasionally one frame early, and learning to
aim is what the prompt is for.

The through-a-wall case is the one that was actually harmful — the player taps, `cast()` spends the
focus and sets `ob.cast` (retiring the prompt forever), and `strike()` returns `null`. That is now
impossible.

Cost: `sight()` is a real collider raycast and `obCtx()` runs every frame for the life of the
session. So `obCtx` stops asking for `foe` once the cast prompt is retired. That is only safe while
`cast` is the sole reader of `foe`, so there is a test that scans `PROMPTS` and fails if a second
one starts reading it.

## Judgement calls

**Hostile-but-idle creatures (finding 5) — texture, not a bug, and half of it was finding 1.** The
review's "mean 3.35 of 8" is reproduced (3.42 without the rig's wander). But the half that never
self-corrected was `robed.js`, which has no wander — and every robed enemy is in `CHARGES`, so after
this pass they engage from 26 m and the freeze is gone. What is left is vermin, and vermin drift:
with the rig's `ROAM` wander applied, still-idle drops from **2.29 of 8 at 10 s to 1.50 at 30 s**,
and the browser run shows rats reaching 0.4 m unaided. A rat that heard something and has not found
you yet is the correct read. No change.

**`foeNotice` as the single global combat switch (finding 7) — fixed, and that is what paid for the
knob.** The table above is the proof: at `foeNotice 1` the raiders still deal 470. It now takes both
sliders at the bottom to turn combat off, which is what a player who drags both is asking for. This
is the one new knob and `CLAUDE.md`'s rule is that a tunable is a knob; if Aaron would rather have
one slider, delete `foeCharge` and the constant still works.

**`onBreak`'s `aggroRadius: 30` (finding 6) — still inert, and this pass made it more so.** Not
fixed, deliberately. `Spawner.aggro()` skips anything already hostile, and after this pass that is
everything except an unprovoked grain rat — so the Graft Break's 30 m and the `AI.alarm` 4.5 m chain
now only do anything in the granary. In practice it changes nothing: a Break happens among Watchmen,
who are in `CHARGES` and already coming from 26 m. Making the alarm *pull* rather than merely anger
is one line in `Spawner.aggro()` (put idle creatures inside the radius into `alert`), and it would
make both call sites mean what their comments say — but it is a change to how loud a Graft Break is,
which is design, and `docs/REVIEW_ENEMIES.md` already owns the Watch/`CHARGES` question. Flagged, not
taken.

**Not done: hysteresis between `charge` and `leash`.** They are both 26, so a charger at exactly the
boundary flickers idle↔alert as the player strafes. It is invisible (`speed` is 0 in both states,
and it faces you either way) and it is pre-existing. Dropping `charge` to ~22 would remove it; that
is a feel change to every encounter in the game and not worth making blind.

## Where I think the review is wrong

1. **`bst.bailey` "has nothing planned at all. Pre-existing, not this change."** It is not
   pre-existing. Standing in the bailey with the world's quests armed, the spawner fills it with
   8 `mire_rat`, 4 `creek_crab` and 5 `rat_knot` from the neighbouring planned areas, and
   pre-change that dealt a median **1541** damage over `light.23`'s and `dark.21`'s 120 s. Both were
   zeroed by this change and the review scored them as a pre-existing blank. That is a **fifth and
   sixth** broken `survive` step, and they are fixed here. (`neutral.06` at `lac.square` really is
   blank — that row is right.)

2. **The four `survive` steps do not have one cause.** Three are `raider`, one is `mire_rat`, and
   the review's proposed fix — `CHARGES.has(a.enemy) ? AI.leash : AI.notice` — restores three of
   them and leaves `light.05` at zero. Applying it as written would have shipped a green suite over
   a step whose own hint promises an attack, which is the exact failure mode `docs/` keeps hitting.

3. **A caveat the review should have flagged and did not.** Its `survive` numbers (and mine) come
   from arming the spawner with *every* quest definition. The real spawner is armed with the
   player's **active** quests only, and `dark.16`, `neutral.14`, `light.23` and `dark.21` plan no
   enemies of their own in their own hold area — armed with only their own quest, all four fill an
   empty field and take 0 damage before *and* after any of this. That is a content gap, not an AI
   one, and it is untouched by this pass: those steps have always depended on another quest being
   active at the same time. Worth a `lintQuests` rule ("a `survive` step whose area is not in its
   own quest's plan"), which I have not written.

## Suite

```
node --test                548 pass, 0 fail   (541 baseline + 7 new)
                           60 consecutive runs of combat.test.js: 0 fail (3 before)
node tools/lintQuests.mjs  1 warning — light.06 apprentice_cord, pre-existing
node tools/lintText.mjs    0 warnings, 0 errors
```

The baseline is 541 rather than the 535 in §4: another pass's uncommitted portrait/FOV work
(`js/engine/fov.js`, `js/engine/app.js`, `js/game/game.css`, `js/scenarios.js`,
`session.js` `rotate()`) landed in this tree while this one was running and brings six tests of its
own. **The working diff holds two passes.** Nothing here touches those files.
