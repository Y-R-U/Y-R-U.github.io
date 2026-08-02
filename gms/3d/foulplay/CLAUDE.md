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

`STEWARD` in `config.js` owns those bands; `stewards.js:distanceFactor()` is the
curve. The attack button shows the verdict **before you press it**
(`hud.js:updateAttackButton` → `stewards.estimateRisk`), which is the entire
tutorial.

The counterweight is the crowd. `HYPE` fills from wrecks, air, flips, drifts and
overtakes, and at the verdict `resolveInvestigation()` rolls
`0.1 + hypeShield × crowd` for "no further action". Spectacular driving is not a
score bonus, it is legal defence.

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

`checkEdges()` decides bounce vs vault, and it weights **how** you arrive far
more than how fast: square-on is a scrape however sideways you are sliding,
`|psi|` over about a radian cuts the threshold by 46%, and a fresh shunt
(`car.slammed`) cuts it by a third more. That is what makes a slam next to a
barrier lethal and an ordinary rail scrape survivable.

---

## Cars come apart

`carfactory.js` builds every car from **separable part meshes** — nothing is
merged. `car.detachPart()` hands the *same object* that was bolted on a frame
ago to `debris.js`, which gives it velocity and spin. The car keeps driving
without it: losing a wheel adds `wheelPull`, losing the roof reveals the driver,
glass shatters instead of flying off in one piece.

**Wheels are the exception, and they are a ladder.** `CRASH.wheelSpeed` is
indexed by how many are gone — 1, 0.9, 0.74, 0.5, **0** — so the first is cheap
and funny and the fourth ends the drive: no throttle, no steering, the floorpan
scrubbing speed off until the truck comes for it. `CRASH.wheelResist` and
`wheelPickBias` make each successive wheel harder to take off than the last, in
both the roll that picks a panel and the damage that panel then soaks.

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
| prize money | most of it | the reason to finish well |
| crates, by finishing position | 1 / 2 / 3 / 4 | position matters more than volume |
| roadside crates | cash, nitro, rarely a crate | a racing decision, not a slot machine |
| the bookmaker | 1.8×–5.5× a stake | somewhere for a big pile to go |
| the team facility | a % of every prize | a long-term purchase that pays back |

**A crate is mostly an envelope of cash.** `CHEST_TIERS` in `arsenal.js` owns
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
| `ai.js` | racing line, braking to the grip limit, aggression, grudges |
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
?auto=1     the AI drives the player car (also suppresses the tutorial popup)
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
- **A frame-rate guard that fires on a stutter is worse than no guard**, because
  it removes a feature the player asked for. The attract-mode one needs six
  seconds under 20fps after a five-second warm-up.

- **A frozen page blocks `Page.navigate` too.** One hang poisons every later
  test on that tab, so restart the browser between runs when debugging.
- **`?wipe=1` re-arms the first-race tutorial**, which pauses the race. That is
  why `AUTO_MODE`/`SHOT_MODE` skip it.
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
