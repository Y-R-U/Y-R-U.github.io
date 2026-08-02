# FOUL PLAY — a racing series where cheating is the point

Mobile-first Three.js (0.160 via CDN importmap, **no build step**). Two buttons,
a thumb, fifteen circuits with banked corners and vertical loops, cars that come
apart panel by panel, and a stewards' office you are trying to work around.

---

## The one idea everything hangs off

**Hitting people with your car is legal. Using the equipment is not — but the
stewards can only act on what the cameras caught.** So the whole game is a
distance judgement:

| where you fired from | what it reads as | suspicion |
|---|---|---|
| touching paint (<5.2m) | "we were side by side, stewards" | ×0.16 |
| 5–12m | arguable | ×0.16 → ×1 |
| across the circuit | exactly what it is | up to ×1.75 |
| any of the above, on camera | worse | ×2.05 |

`susp = (base × distanceFactor + foulFloor) × camMul × stealth`, then a soft knee
above `softKnee`. **The floor is what stops contact fouls being free** — the
multiplier alone was doing double duty as "looks like racing" *and* "costs
nothing", and the starter loadout could not outrun the decay at all. The knee
stops a long-range trick going 0 → over 100 in a single press while leaving the
ordering between tricks intact.

`STEWARD` in `config.js` owns those bands; `stewards.js:distanceFactor()` is the
curve. The attack button shows the verdict **before you press it**
(`hud.js:updateAttackButton` → `stewards.estimateRisk`), which is the entire
tutorial.

**Which is why the loadout is three slots and the HUD is three buttons.** The
verdict was a coin toss in a pack: `previewAttack` showed the FIRST ready trick
and `fireAttack` fired a RANDOM one. Loadout order is now button order, bottom
up — **slot 0 is the manual button and fires exactly what it previewed**
(`attacks.js:previewSlot`/`fireSlot`, one skill, one cooldown, no pick), and
slots 1 and 2 are auto: `updateAutoSlots` fires them the moment `autoWants`
says the trick has the shot it wants. That condition is derived from what the
trick *does*, not from its id — a drop needs somebody within `AUTOFIRE.dropRange`
behind and in your lane, a ring needs two targets or one close one, a lunge
needs somebody square in front, a long shot needs a clear line. Firing on
cooldown alone would put a scatter gun through empty air with a camera live.

**An auto is never suppressed to protect you from the stewards** — one going off
at the worst possible moment is the trouble this game is about. It only has to
be legible: the pill flashes, and the feed row says `⚙ AUTO ·` so the suspicion
that follows has a cause attached. The two autos are also tappable, to bring one
forward before its condition arrives.

The counterweight is the crowd. `HYPE` fills from wrecks, air, flips, drifts and
overtakes, and at the verdict `resolveInvestigation()` rolls `letOffChance()` for
"no further action" — **read live off `state.hype` when the timer expires**, so
the crowd you build during the review decides it. The meter shows that number
while it runs, and hype does not decay at all inside the window. Spectacular
driving is not a score bonus, it is legal defence.

---

## The coordinate system is the architecture

A car's authoritative position is **(s, t, h)** — distance along the centreline,
offset across it, height above the surface — plus a heading `psi` measured
against the tangent. `track.js` builds frames by parallel transport along a
Catmull-Rom spline, so the road carries its own up vector around.

That one decision buys almost everything:

- **Loops need no special case.** At the top of a loop the road's frame is
  upside down and the car just follows it. Nothing in the physics knows.
- **Barriers are a clamp on `|t|`.**
- **"Steer yourself straight again"** is a decay on `psi` toward zero
  (`DRIVE.autoSteer*`), which is the promise in the brief.
- **The AI's racing line is a function that returns a `t`.**

### What makes a corner a corner

`car.js:drive()` advances `s`, then rotates the velocity vector by
`phi = curv × ds` because *the frame turned underneath the car*. That single
step produces understeer, the pull to the outside, and drift — there is no
separate cornering code. The tyres pull the side-slip back toward the heading at
`DRIVE.grip`, **capped at `MAX_LAT` m/s²**. That cap is why the
straightening assist cannot drive the car around a corner for you: it can point
the car, it cannot generate grip that is not there.

### One formula for crests, jumps and loops

```js
N = v²·κ  +  g·(road up)·(world down)  +  downforce
```

`κ` is `track.pitch[i]`, the normal curvature. `N < 0` means the road has fallen
away and the car goes airborne. Flat road → glued. Crest at speed → launched.
Top of a loop → you need `v ≥ √(gR)`, the real condition, for free.

Loops would demand a suicidal entry speed at true gravity, so `LOOP.gravity`
turns along-track gravity down to 0.55 inside one and `LOOP.downforce` adds
stick. `track.loopAhead()` reports the entry speed that implies; the AI refuses
to lift for it and the HUD shouts `MORE SPEED` below it.

### Leaving the circuit

Three modes: `track` → `air` (same coordinates, road gone from under you) →
`wreck` (full world-space rigid body, tumbling and shedding panels until the
recovery truck arrives, then `rejoin()` puts you back on at the nearest `s`).

**A wreck is still an obstacle.** `race.js:resolveWreckHits` is the one place
the two coordinate systems meet: a world-space circle test, with the separation
normal decomposed onto the running car's own track frame so the racer is shoved
in the coordinates it drives in while the wreck takes a world-space punt. Clamp
the closing speed before it reaches the physics (`CRASH.wreckHitMax`) — a
stationary wreck and a boosting car close at over 90 m/s.

**Leaving the circuit is the only thing that really costs you.**
`Car.wreckOffTrack()` lists the wrecks that happened ON the tarmac; those get a
third of the car off, `homeMinTime`/`homeMaxTime` of downtime and a
`FRAME AUTO-REPAIR` banner. Off it you lose almost all of the car, are down for
twice as long, and it says `WIPEOUT`. Nothing here ever retires a car — the only
elimination in the game is the knockout event type.

**And there is an invisible bumper, admitted openly.** `Car.keepOnTrack` does
nothing for the first 2.5m off the racing surface, then pushes inward, harder
the further out you are, and past the band it eats outward speed outright. It is
capped as an inward SPEED rather than acting as a wall, so you can still leave
deliberately — it just takes longer — and a car that was put there by somebody
else gets the corner back. It matters most where there is no barrier at all
(`saltflats`, `quarry`, half of `carverpass`), which is exactly where the
circuit used to stop being forgiving.

`checkEdges()` decides bounce vs vault, and it weights **how** you arrive far
more than how fast: square-on is a scrape however sideways you are sliding,
`|psi|` over about a radian cuts the threshold by 46%, and a fresh shunt
(`car.slammed`) cuts it by a third more. That is what makes a slam next to a
barrier lethal and an ordinary rail scrape survivable.

**Running up the back of somebody is not "somebody put you there".** A rear-end
contact arms `car.contactGuard` on both cars for `CRASH.contactGuard` seconds,
and that closes the vault door and puts the bumper at full strength — so a shunt
ends with both cars still racing. A SIDE slam beside the steel is untouched by
this and stays lethal, because it is the one way to put a rival out with the car
alone. Ramming also pays: `rammerTake`/`rammedTake` give the car that chose the
impact about a third of what the car in front takes, `rearBias`/`rearSteal` send
most of the impulse forward, and `Car.kick()` puts a visible lurch on the pitch
axis so the shunt looks like it landed.

---

## Cars come apart

`carfactory.js` builds every car from **separable part meshes** — nothing is
merged. `car.detachPart()` hands the *same object* that was bolted on a frame
ago to `debris.js`, which gives it velocity and spin. The car keeps driving
without it: losing a wheel adds `wheelPull`, losing the roof reveals the driver,
glass shatters instead of flying off in one piece.

**Wheels are the exception, and they are a ladder.** `CRASH.wheelSpeed` is
indexed by how many are gone — 1, 0.9, 0.74, 0.5 — so the first is cheap and
funny and the third makes the car a liability. `CRASH.wheelResist` and
`wheelPickBias` make each successive wheel harder to take off than the last, in
both the roll that picks a panel and the damage that panel then soaks.

**And a wheel never simply comes off.** It goes onto its hub and wobbles for a
measured distance of ROAD — `CRASH.wheelWobbleLaps`, in laps, so "a whole lap"
means a whole lap on a 2km circuit and on a 1.3km one. The first takes 0.75–1.25
laps, the second and third 1–2, and **there is no fourth entry: the last wheel
wobbles for the rest of the race and never leaves**, because a car with nothing
to roll on is a car you cannot drive, and taking the drive away is the one thing
this game does not do to you. A lap of grinding sparks and a steering pull that
comes and goes is something you watch coming and drive around, rather than
something that happens to you between corners.

**But damage is not allowed to end your race.** Hand-driven telemetry went P1 at
8.4s to P8 at 25 km/h by 26.4s with two laps still to run. The terms compound —
missing wheels, wobbling wheels, a shredded tyre — and each had been tuned
against a whole car, so `drive()` now sums every damage-derived drag into one
`dmgDrag` and puts ONE clamp on it: below `CRASH.damageFloor` of the clean top
end, none of it bites. A term added later joins the clamp for free, which is the
point of doing it once. Measured, that floors a car with three wheels gone, one
wobbling and a shredded tyre at **92% of a whole car's pace** (was 85%), and a
boost still adds 82–90% on top of that. `beachedDrag` is deliberately *outside*
the clamp: with nothing left to roll on the drive is over, not merely slower.
The visuals, sparks, wobble and part loss are untouched — a wrecked car still
looks wrecked and still handles like it, it just is not too slow to catch
anybody.

`p.dangleUnit` is `'m'` for a wheel and `'s'` for everything else, and
`dangleForever` takes the last one off the clock entirely. **Every route to
taking a wheel off has to respect that or it does nothing** — `flailHit`,
CALTROPS, `stripDown`, a hit landing on something already dangling and
`breakPart` itself have each been the one that quietly bypassed it. `detachPart`
is the choke point: it refuses a wheel that is mid-wobble unless the wobble's own
clock is calling (`opts.wobbled`).

**A detached wheel is stowed, not destroyed.** `rejoin()` has always said
`wheelsLost = 0; // the truck bolts something on` — and bolted nothing on,
because `debris.js` had taken the hub away and eventually deleted it, so a car
came back from the truck with no wheels at all and full speed. Debris gets a
*clone* now and `restoreWheels()` puts the original back.

**A car also knows how big it is.** `carfactory:measureHull` measures the built
mesh and every collision reads that, because the style table's nominal size is
not what comes out of the factory — a stock car is nominally 4.3 x 1.95 and
builds at 4.96 x 2.50 once its bumpers and wheels are on.

`PART_SPEC` in `carfactory.js` maps each panel to a region (`front`/`rear`/
`left`/`right`/`top`), and `damage(amount, region)` spreads a hit over the panels
facing it. `CHASSIS_HP` is deliberately huge — the brief is "takes a lot of
punishment on track but sheds pieces the whole way" — and hitting zero forces a
wreck plus a 35% rebuild rather than elimination.

---

## Circuits close by construction

`trackgen.js` is turtle graphics: `straight`, `turn`, `ramp`, `hill`, `chicane`,
`loop`, `corkscrew`. The trap is closure — an open path handed to the auto-closer
comes back as a 3-metre-radius hairpin, which is what the first fifteen circuits
all did.

**Every circuit is `repeat(n, fn)` where one repetition turns exactly 360/n° and
ends level.** Repetition k starts in a frame rotated by k×(360/n), so the
displacements sum to zero and the loop closes with `gap 0.00`. Variation between
repetitions is allowed as long as net displacement matches: a chicane instead of
a straight of the same length, a crest instead of flat, a loop plus a shortened
straight. Every circuit currently closes exactly.

`decorate()` then places boost pads on corner exits, crates deliberately *off*
the racing line, and broadcast cameras that **sweep** — each covers its stretch
only part of the time, so there is always a window. Learning a circuit's camera
rhythm is the skill the game is really teaching.

---

## The economy is a set of taps, and each one is deliberate

Money is the main road through the game. Almost everything is buyable and
almost everything is expensive, which is what makes a race worth running.

| tap | pays | why |
|---|---|---|
| prize money | most of a clean race | the reason to finish well |
| the crowd | can rival a win, off peak hype + what you actually did | spectacle has to be a living, or the game's title is a lie |
| crates, by finishing position | 1 / 2 / 3 / 4 | position matters more than volume |
| roadside crates | cash, nitro, rarely a crate | a racing decision, not a slot machine |
| the bookmaker | 1.8×–5.5× a stake | somewhere for a big pile to go |
| the team facility | a % of every prize | a long-term purchase that pays back |

**A crate is mostly an envelope of cash, and a duplicate is a mark.** A second
copy of something you own upgrades it (`save.markUp`) instead of paying a
consolation payout; only an item already at `MAX_LEVEL` falls back to cash.
`flow.js` accumulates a **haul** across however many crates were opened at once
— `{crates, cash, fresh[], marks{}}` — so one screen serves one crate and
twenty: all the money on one row, everything new listed once, and the marks with
their counts (`DUPLICATE ×2 · I → III`). `CHEST_TIERS` in `arsenal.js` owns
the rates: a scrap crate cannot produce a legendary at all, and the good tiers
only come from winning. Nine crates in a row with nothing in them arms a pity
roll (`flow.js:openChest`), because a long dry run stops reading as bad luck
and starts reading as a bug.

**Every item carries its own `src`** — `shop` / `crate` / `prize` / `start` —
so the shop, the crate roller and the prize checker read one list and cannot
disagree. Two parts per slot are not for sale at any price. `PRIZE_ITEMS` and
`save.js:checkPrizes()` hand the prize ones over the moment their condition
becomes true, wherever that happens.

**Marks** are the cheap route up: `upgradeCost` starts around $1,200 and
multiplies by 2.7 each time, so a fully upgraded tier 3 costs about what a
tier 4 does and gets you most of the way there.

## Every padlock says what would open it

`progress.js` owns all three gates — the team facility, the season, and things
you have actually won — and returns a *reason* alongside the boolean.
`conditionText()` turns any gate into a sentence, so no screen ever shows a
lock it cannot explain. Circuits and events list several gates and satisfying
**any one** opens them; most also offer a cash licence as the impatient route.

## Files

| file | what it owns |
|---|---|
| `config.js` | every tuning number, plus the URL test hooks |
| `track.js` | frames, parallel transport, `worldAt`/`quatAt`/`nearestS`, `loopAhead` |
| `trackgen.js` | the path builder and all 15 circuits |
| `trackmesh.js` | road ribbon, kerbs, rails, verges, stands, cameras, scenery |
| `car.js` | the driving model, damage, dangling panels, wrecks, respawns |
| `carfactory.js` | part-separable car meshes, five body styles |
| `cars.js` | the eight chassis you can own — static data only |
| `arsenal.js` | parts, tricks, prices, sources, marks, crate tables |
| `progress.js` | the team, circuit gates, gate *reasons*, the trophy list |
| `ai.js` | racing line, braking to the grip limit, aggression, grudges, the catch-up handicap |
| `attacks.js` | the fifteen dirty tricks, targeting, hazards |
| `stewards.js` | suspicion, camera coverage, hype, investigations, verdicts |
| `race.js` | grid, contact, pickups, positions, knockouts, results |
| `story.js` | 10 chapters × 10 levels, generated; 11 hand-written cutscenes |
| `events.js` | quick races, 13 special events, the daily |
| `titles.js` | three single-elimination brackets |
| `highlights.js` | 20Hz ring buffer, ghost-car replay, saved memories |
| `rooms.js` | the modelled 3D rooms behind the garage, showroom and career |
| `haptics.js` | vibration; a pure bus listener, knows nothing about the game |
| `flow.js` | screen routing, attract mode; the only module that acts on menu intent |
| `menus.js` | every screen; emits on the bus, never calls game systems |
| `cloud.js` | br8t account + cloud save; optional, imported dynamically |

`cloud.js` mirrors the one save key to the player's br8t account through
`/lib/auth/localsync.js`. `main.js` imports it with a `.catch()` and skips it
under `?auto`, `?shot` and `?wipe`, so a failed load — or a harness run — is
just a local save. It counts finished races off the bus (`race:done`) and vetoes
the sign-in callout whenever `state.screen` is a race, replay, cutscene or the
results card. The avatar floats top-right and publishes its width as
`--br8t-account-space`; `.hud-top`, `.screen-head`, `.title-stage` and
`#btn-pause` all move out from under it with a `0px` fallback.

Menus emit intentions, `flow.js` acts on them. That is what keeps the UI free of
game logic and the game free of DOM.

## Menus

`paint(html, acts, opts)` is the whole contract. Two rules came out of watching
somebody use this on a phone:

1. **The header does not scroll.** `.screen` is `overflow:hidden` with a fixed
   `.screen-head` and a scrolling `.screen-body`, so the title and the way back
   stay under your thumb however long the list is.
2. **Re-rendering the same screen keeps its scroll position.** `opts.key`
   defines "the same screen" and *includes the open tab*, so switching tab
   starts at the top while equipping a part halfway down a list does not.
3. **`opts.stage` is a third band that does not scroll.** The showroom puts the
   turntable, the car switcher and the one contextual button there, so tapping
   a car at the bottom of the list still shows you the car and the answer.
   Anything pinned costs the list height, which is why only one screen uses it.

The browsing screens run a real race behind them (`flow.js:startAttract`) — the
same race loop with the AI on the player's car and the HUD off. Screens with
their own 3D room do not, because two WebGL contexts fighting is a bad trade.

## Rooms are modelled, not painted

The garage, the showroom and the career cabinet are Three scenes in a small
second renderer, not backdrop images. Three reasons, all of which turned out to
matter: the camera moves, so a flat photo would slide against the car; the
cabinet fills up as you win things, so it cannot be baked; and a photographic
backdrop behind flat-shaded low-poly cars looks like a cut-out. A modelled room
lights the car with the lights that lit the room.

---

## Test hooks

```
?dev=1      window.__game = { state, profile, tel } — tel samples speed/position
            /suspicion/hype 4× a second and records wreck reasons by cause
?auto=1     the AI drives the player car (also suppresses the teaching callouts)
?shot=1     races for `?at=` seconds, then drops the UI for a clean thumbnail
?lite=1     no shadows, fewer props, lower pixel ratio
?speed=N    time scale — soak a 3-lap race in a third of the time
?track=id   &laps=N &cars=N &mode=knockout &level=N &wipe=1
```

`dev.html` is a standalone harness: it builds all fifteen circuits, prints
length / minimum radius / radius percentiles / closure gap / inverted-frame count
for each, and flies a camera around one of them (`?t=circus`). Run it after any
change to `trackgen.js` — **every circuit must report `gap 0`**, and a p2 radius
under about 30m means a corner nobody can take.

Headless testing: launch Chrome with `--remote-debugging-port` and drive it over
a raw CDP WebSocket (no puppeteer needed). **Pass eval scripts from a file, not
inline** — backticks and `${}` get expanded by bash before node ever sees them,
which produces silent nonsense.

## Gotchas earned the hard way

- **A solid box is not a cabinet.** The first trophy case was a `BoxGeometry`
  with shelves inside it, so the camera saw its front face and the collection
  looked empty. Anything you are meant to see *into* has to be built from
  slabs, not from a block with things buried in it.
- **Point lights are in candela.** A `PointLight` parked a metre off a panel
  washes it to a white blob. Everything in `rooms.js` is lit from well in front
  of what it is lighting.
- **Promoting a highlight has to promote its presentation.** The dedup path
  upgraded a clip's label but not its shot, so wrecks were coming out with a
  chase camera and no slow motion — the one thing the reel exists to show.
- **Resolve a bracket round from one snapshot.** Eliminating the player's
  opponent and then re-reading the alive list makes the count odd, which drifts
  the pairing and leaves a seed with no match — a three-round bracket that
  plays two finals.
- **Two multipliers on the top end, not one.** The AI's catch-up handicap used to
  write `car.slowMul` with a token `slowT`, which `tickEffects` zeroed later the
  same frame — so it had *never once run*, and it also overwrote whatever an
  attack had put there, quietly halving DRAG ANCHOR against an AI car. It writes
  `car.rubberMul` now (`RACE.rubberGap`/`rubberSpan`) and `drive()` reads both.
- **A frame-rate guard that fires on a stutter is worse than no guard**, because
  it removes a feature the player asked for. The attract-mode one needs six
  seconds under 20fps after a five-second warm-up.

- **A frozen page blocks `Page.navigate` too.** One hang poisons every later
  test on that tab, so restart the browser between runs when debugging.
- **`?wipe=1` re-arms the first-race teaching**, which is now three non-blocking
  callouts rather than the modal that used to pause the grid.
- **`hud.js:updateHud` rewrites `#btn-attack`'s className every 100ms.** Anything
  decorating that button has to hang off an ancestor — `#btn-pad` — or be wiped.
- **Non-finite car state used to hang the tab**, because `loopAhead`/
  `speedLimitAhead` derived loop bounds from speed and `for (k = 0; k < Infinity)`
  never ends. Both clamp now, and `Car.sanity()` catches the state itself.
- **`v²` drag needs no per-frame multiplier.** A stray `× 60` capped every car
  in the game at 90 km/h and read as "the AI is too cautious".
- **Tracks are cached between races.** Anything a race consumes — crate
  `taken` flags, pad hit maps, camera on/off overrides — must be reset in
  `startRace`, and `cam.baseOn/basePeriod/baseAlways` exist for exactly that.
- **`buildCar` parts live in `mesh.userData.parts` and go null when detached.**
  `animateCarMesh` checks `w.parent !== mesh`, because a detached wheel still
  has a parent — the scene.
