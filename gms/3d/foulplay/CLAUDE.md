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

## Files

| file | what it owns |
|---|---|
| `config.js` | every tuning number, plus the URL test hooks |
| `track.js` | frames, parallel transport, `worldAt`/`quatAt`/`nearestS`, `loopAhead` |
| `trackgen.js` | the path builder and all 15 circuits |
| `trackmesh.js` | road ribbon, kerbs, rails, verges, stands, cameras, scenery |
| `car.js` | the driving model, damage, wrecks, respawns |
| `carfactory.js` | part-separable car meshes, five body styles |
| `ai.js` | racing line, braking to the grip limit, aggression, grudges |
| `attacks.js` | the fifteen dirty tricks, targeting, hazards |
| `stewards.js` | suspicion, camera coverage, hype, investigations, verdicts |
| `race.js` | grid, contact, pickups, positions, knockouts, results |
| `story.js` | 10 chapters × 10 levels, generated; 11 hand-written cutscenes |
| `events.js` | quick races, 10 special events, the daily |
| `highlights.js` | 20Hz ring buffer + ghost-car replay |
| `flow.js` | screen routing; the only module that acts on menu intent |
| `menus.js` | every screen; emits on the bus, never calls game systems |

Menus emit intentions, `flow.js` acts on them. That is what keeps the UI free of
game logic and the game free of DOM.

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
