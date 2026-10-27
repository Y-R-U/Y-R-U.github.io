# ATC (lane ATC)

Pure, renderer-free, deterministic air-traffic control for Krayzee. No three.js, no `Date.now`, no `Math.random`.
Layout-agnostic: the airfield is an airport def (`data/airports/<id>.js`, docs/AIRPORTS.md §3). By default ATC uses the
active airport (`js/world/layout.js`, switched by `setAirport(id)`); `createATC({ geo: makeGeometry(def) })` pins one
(two towers in one world, test harnesses). Infraction ids, PP and outrage from DESIGN's `data/rules.js`.
Nothing in the logic knows runway or taxiway names: departure-capable ends are `runway.departures !== false` (and
`oneWay.depart`), runways start open unless `closed`, holds/entries/crossings/exits come from the taxi graph that
`js/flight/routes.js` builds (the same one the autopilots taxi on), and the field centre is `def.center`.

| file | what |
|---|---|
| `js/atc/index.js` | `createATC(opts)`: sequencing, clearances, detectors, outrage, event bus, serialise |
| `js/atc/geometry.js` | `makeGeometry(def)`: runway frames, surfaces, intersections, `JUNCTIONS` (every taxiway×runway node with its hold per side; entries vs crossings), `departurePoint`, `exitFor(end, fromA, toward)`, graph taxi routes + their `holdShort` crossings, `circuitFor(end)`, `circuitProgress`. Module exports = the active airport |
| `js/atc/rules.js` | every ATC threshold (`T`), infraction table (DESIGN's + ATC extras), routine line ids |
| `js/atc/outrage.js` | Outrage meter (DESIGN §1.3): tiers, hysteresis, decay, Royal Scandal |
| `js/atc/bridge.js` | `linkTraffic(atc, traffic)`: reference wiring to FLIGHT's `Traffic`/`Autopilot` |
| `tools/atc-sim.mjs` | node harness: kinematic planes that obey ATC, scripted crimes, `--falsify`, `--only=flight` |

## API
```js
import { createATC } from './atc/index.js';
const atc = createATC({
  wind: { from: 270, kt: 8 },     // picks the active end by headwind (default def.wind); or activeEnd: '27'
  open: { '04/22': false },       // default: every runway not `closed` in the def (C-Tower 1: 04/22 closed, DESIGN §1.1)
  geo: makeGeometry(def),         // optional: a specific airport (default: the active one); atc.geo exposes it
  surfaceAt: world.surfaceAt,     // optional (x, z) => 'runway'|'taxiway'|'apron'|'grass'|…; else ATC's own from layout
  detectCollisions: false,        // FLIGHT owns contact; report it with atc.report('collision', id, {victim})
  outrageGain: 1,                 // DIFFICULTY[...].outrageGain
  outragePerPlayer: false,        // online: one meter per player (DESIGN §1.3)
  authority: true, detectRemote: true, // online follower: false/false (see Online)
});
const events = atc.update(dt, states);  // or atc.step(dt, roomTime, states); returns this tick's events
atc.on('radio', (ev) => radio.handleEvent(ev));   // RADIO-shaped events, ready to forward
atc.on('event', fn) / on('<infraction id>', fn) / on('instruction', fn) / on('composure', fn) / on('scandal', fn)
atc.on('landed', fn) / on('strip', fn) / on('runwayChange', fn) / on('*', fn)   // on() returns an unsubscribe
atc.instructionsFor(id)   // standing commands, oldest first
atc.command(id, type)     // one standing command or null
atc.strip(id)             // { state, intent, landEnd, leg, remaining, number, follow, extend, stand, penalty }
atc.sequence(end?) / atc.departureQueue() / atc.activeRunway() / atc.composure(key?)
atc.setWind(from, kt) / atc.setRunwayOpen('04/22', true) / atc.report(type, actor, {victim, severity, data})
atc.addOutrage(n, actorId?) / atc.setLocal(id, bool) / atc.configure({...}) / atc.remove(id)
atc.serialize() / atc.restore(json)   // plain JSON, ~2–5 KB
atc.resetStrip(id, {lineUp, grace}) / atc.grace(id, secs)   // the game moved a plane (link.placed / skipToRunway)
atc.noteGoAroundRefused(id, apReason)  // LAND refused the standing go-around: marks it ignored (no ignored_instruction /
                                      // outrage from ATC; SCORE scores the refusal) + emits on('refused') {type:'refused',
                                      // instruction:'goAround', actor, ordered:true, seq, orderedAt, reason, cause, apReason, t}.
                                      // Idempotent; false if the tower never ordered one. bridge.js calls it itself.
```

### Aircraft state (input, every tick, every plane)
```js
{ id, callsign, isPlayer,             // player id is 'player' (RADIO convention)
  pos: [x, y, z] | {x,y,z}, vel: [vx, vy, vz] | {x,y,z},   // m, m/s; y up
  heading,                            // deg, 0 = north (-Z)
  onGround, agl,                      // agl optional (defaults to pos.y, 0 on the ground)
  intent,                             // 'circuits' | 'fullStop' | 'depart' | 'park'  (see below)
  runwayIntent,                       // optional end, e.g. '22' (only honoured if that runway is open)
  apOverridden,                       // player hands on the controls (blame + outrage decay)
  remote, crashed, stand, vrKt, touchdownFpm,
  speedScale,                         // type's cruise vs the C172 (Tiger 0.84, bathtub 0.63); bridge sends it. All optional
  landing }                           // LAND assist on a runway: { end, remaining } (metres along the plan); bridge sends it
```
Intents: `circuits` = touch-and-goes forever; `fullStop` = next landing is a full stop, taxi to a stand, then done;
`depart` = take off and leave; `park` = stay put. ATC never changes intent; the game does. A plane missing for 5 s is
dropped. Ground/air is debounced (a taxi bump is not a flight; liftoff needs 0.4 s clear of the ground above 0.8 m).

## Command vocabulary (output)
Commands are standing: each has `{type, seq, t, …}`; a newer command of the same type replaces it, some cancel others
(e.g. `goAround` kills landing clearances, `clearedTakeoff` kills `lineUpWait`). Act on a command when its `seq` is
new; keep obeying it while it stands.

| type | fields | autopilot does |
|---|---|---|
| `taxi` | `route:[[x,z]…]`, `holdShort:[{runway, at, beyond?, departure?}]`, `dest:'runway'\|'stand'`, `runwayEnd`/`stand`, `hold`, `lineUp`, `heading` | follow `route`; **stop at each `holdShort.at` in order** unless cleared for that runway (`crossRunway` for crossings, `lineUpWait`/`clearedTakeoff` for the departure hold) |
| `crossRunway` | `runway, at, beyond` | cross that runway at that hold; dropped once past `beyond` |
| `lineUpWait` | `runwayEnd, at, heading` | enter, stop on the threshold `at` facing `heading` |
| `clearedTakeoff` | `runwayEnd, at, heading, then:'circuit'\|'depart', circuit:{runwayEnd, side, alt}` | line up (if not already) and roll |
| `cancelTakeoff` | `runwayEnd, reason` | stop (only sent while < 20 m/s); wait for a new `clearedTakeoff` |
| `holdPosition` | `reason, runway` | stop now (players only, after an incursion) |
| `joinCircuit` | `runwayEnd, side:'left'\|'right', alt, leg` | fly that circuit (`geometry.circuitFor(end)` is the shape ATC assumes) |
| `sequence` | `number, follow, followCallsign, runwayEnd` | informational; follow that traffic |
| `extendDownwind` | `metres` (**total**, not incremental), `runwayEnd, follow, reason?` | move the base turn this far further out along the downwind (only while not yet on base) |
| `clearedLand` / `clearedTouchAndGo` | `runwayEnd, threshold, heading` | land (full stop) / touch and go |
| `goAround` | `reason:'spacing'\|'runwayOccupied'\|'traffic'\|'crossingTraffic'\|'runwayClosed'`, `cause` (culprit id or null), `runwayEnd, climbTo` | climb straight ahead to `climbTo`, rejoin the circuit; ATC re-sequences you when you are back on crosswind/downwind |
| `vacate` | `runway, via, at, route, clearAt` | leave the runway at `at` (exit `via`), stop at `clearAt`; a `taxi` follows |

No landing clearance by 500 m from the threshold → ATC sends you around. Takeoff requires `clearedTakeoff`.

## Sequencing model
- **Arrivals** per landing end: ordered by remaining along-track distance on `circuitFor(end, {extend})` (final corridor
  first, else nearest leg with heading agreement). Spacing is in **seconds at the threshold** (circuit 44 m/s, final
  34 m/s): 45 s behind a touch-and-go, 60 s behind a full stop, 65 s behind a human. Short before base → `extendDownwind`
  (cascades to followers); on final with < 22 s → `goAround`. Number 1 inside 2.6 km on base/final gets a landing
  clearance if the runway is empty, nobody is lined up/crossing/cleared on it, no uncleared plane is ahead in the cone, and
  the intersection is free.
  Spacing behind a full-stop lander is `T.spacingFull` (60 s), or `T.spacingFullType[type]` for slow types (Tiger 85 s,
  bathtub 75 s). At C-Tower 1, touchdown to clear of the runway measured 30 s for a C172, 72 s for a Tiger (it floats
  350 m, rolls past A3 and taxis to A2) and 62 s for the bathtub. The strip's `type` comes from bridge.js.
- **Jets (JETCORE)**: a strip whose type has `circuitScale` > 1 (jumbo ×2.3, herc ×1.3, f35 ×1.6) is tracked on its
  own stretched circuit (`circ(end, ext, type)` → `circuitFor(end, { off, up, fin })` from `routes.circuitOpts`), so
  its leg/remaining distance are right on a 2.6 km downwind. `spacingFullType` jumbo 95 / herc 70 / f35 65 s, plus
  `T.wakeSpacing` behind a heavy for anything of another type (jumbo +40 s, herc +15 s). A cleared jet already rolling
  faster than `T.committedGs` (jumbo 5, herc/f35 8 m/s) is never cancelled (a spooling jumbo spends 10 s under 20 m/s),
  and the AP refuses a reject above 0.35 Vr. Wake upsets themselves are physics (`traffic.js` WAKE, docs/FLIGHT.md).
- **Departures**: one queue per active end, ordered lined-up → at the hold (by arrival time) → approaching. First in
  queue is cleared when the runway and its reservations are clear, no arrival is inside 2.2 km, the previous
  departure/touch-and-go is 700 m down the runway, and the intersection is free; otherwise `lineUpWait` when the next
  arrival is > `T.lineUpArrivalClear` out **and** will still be outside `arrivalBlockLinedUp` (+ `T.lineUpSlack` s) once
  landers rolling/vacating along the runway are projected off it. Without that projection, a departure lined up behind a
  slow lander that taxis to a far exit sat on the runway until the next arrival was sent round. A departure waiting > 20 s gets a **slot**: the first arrival still before base is stretched 115 s.
- **Crossing runways** (09/27 × 04/22): one mutex per intersection. Any landing/touch-and-go/takeoff clearance on either
  runway takes it; it is released once that plane is 60 m past the intersection, above 150 m past the threshold, or off
  the runway. Requests queue first-come, but a lander joins the queue only when nothing else stops its clearance (a lander
  blocked by a lined-up departure used to hold the head of the queue that departure needed: deadlock, go-around). Taxiway crossings of 04/22 also need it free.
- **Re-plan on crimes**: an aircraft that gets closer to the threshold than one sequenced ahead (by 120 m) is
  re-sequenced ahead; in the final cone that is `cut_in_final` (a pass outside the cone is remembered for 90 s and
  confirmed when both are in the cone or when the victim must go around). The victim loses its landing clearance and is
  extended or sent around with `cause` = culprit (→ `forced_goaround`). The culprit gets no landing clearance for 60 s.
  A blocked runway or an uncleared plane ahead on short final sends the cleared lander around inside 1.5 km (else the
  clearance is revoked and re-issued later); a cleared departure still under 20 m/s gets `cancelTakeoff`. A plane that
  ignores a go-around and keeps descending in the cone stays sequenced (so cutting in after being sent round still counts).
- Active runway: headwind end among departure-capable ends (C-Tower 1: 09/27), 3 kt hysteresis. An arrivals-only runway
  (`departures: false`, C-Tower 1's 04/22 when opened): land, vacate at its taxiway crossing on the side nearer the active
  hold (`vacate.thenRunway`), taxi to the active hold.
- Departure slot and a busy runway: the slotted arrival (still before base) is stretched again while a lander is still
  rolling/vacating along the runway, so it lands `T.depAfterFree` (85 s) after the runway is projected free. Found by the
  first 09-active soaks: at C-Tower 1 a 09 lander's first reachable exit is A3, 850 m in, and the slot used to expire
  before it was off.
- **LAND assist** (`state.landing`): the plane is a committed full-stop arrival on `landing.end`, sequenced by
  `landing.remaining` (the plan's path, not the circuit), always wanted in the sequence (whatever its leg, region or
  go-around), cleared to land like any number 1. A LAND plane that refused a go-around gets no fresh clearance over it.
  Before: a LAND player off the circuit was invisible to departures (a departure was cleared with it 865 m out).
- **Placement** (`link.placed(e)`): a plane placed lined up on a departure end (≤ 250 m in, ±20°) is reset with
  `lineUp` → line-up-and-wait, first in the queue. For `T.placeGrace` (60 s) after any placement a plane on the ground is
  never the `cause` of a go-around (no `forced_goaround` against a spawn).
- **Line-up** does not need the intersection mutex (the line-up point is not at the intersection; only the takeoff roll
  crosses it). `runwayBusyFor` projects a rolling lander at no more than `T.vacateSpeed` (7 m/s × speedScale) + 
  `T.vacateTurn` (8 s): at its rollout speed it read 33 s for a Tiger that took 70 s to clear, and a departure lined up
  in front of the next arrival. Default mixed soak: holdMax 354 → 216 s.
- **Closed runway crossings** (04/22 at C-Tower 1): `crossRunway` comes with the taxi (no distance or occupancy check
  except someone actually on that runway's pavement): the 09/27 traffic through the intersection used to make planes
  wait at the taxiway A crossing.
- **Stopped on the runway**: the vacate exit may be up to 60 m behind (U-turn), e.g. 10 m past A3 → A3, not A2. The
  autopilot's taxi graph does the same (routes.js: a runway node < 60 m behind costs 150, not 2000): 140,0 → S4
  1395 → 615 m.
- **Runway change** (`setWind` picks a new end): the change is *pending* (`atc.pendingRunway`) until the old runway is
  quiet — nobody cleared/lined up on it, nobody on it, nobody on final inside 1.5 km — or `T.rwChangeMax` (180 s) passes
  (then cleared finals go around, `reason:'runwayChange'`, and lined-up planes get `cancelTakeoff`). No new departures
  are released while pending; landings carry on. On the switch every plane at/taxiing to the old hold gets a `taxi` to
  the new one, and `runwayChange {from, to, t}` fires; the bridge then calls `ap.changeRunway(to, from)` on every
  autopilot (FLIGHT.md). Soak: two wind shifts in 30 min, zero AI infractions, zero landings on the old end.
- ETA model: final flown at 75 kt (38.6 m/s) until 2.4 km, 65 kt (34 m/s) inside (`T.finalFastSpeed`,
  `T.finalSlowFrom`); circuit 44 m/s; all divided by the strip's `speedScale` (slow types; extensions and the
  touch-and-go/full-stop speed scale with it). A landing clearance needs base, or final *inside the aligned final cone*
  (a plane crossing the extended centreline is not "on final").

## aiMischief
`linkTraffic(atc, traffic, { mischief, rnd })` — `mischief` is a probability or a level from `MISCHIEF`
(`off` 0, `low` 0.12, `high` 0.4; export of bridge.js); `link.setMischief(v)` changes it live. One roll per AI taxi leg
(→ `ap.mischief = 'speed'`: ~32 kt down the next long straight → `taxi_speeding`) and per full-stop approach
(→ `'lowpass'`: a 4.5 m pass down its own cleared runway, then a go-around → `low_pass`). Both are mild, AI-only, and
safe for the traffic around them (soak: 11 speeding + 1 low pass in 30 min at `high`, zero other infractions, zero
separation losses). AI events don't move the outrage meter unless `aiOutrage`. Default for the game: `low`.


## Events
Every event: `{ id, type, t, actor, callsign, isPlayer, victim, victimCallsign, severity 1–3, pp, name, scold, controller:'tower', tier, tierName, outrage, frozen, at:[x,y,z], data }`.
Cooldown 30 s per (type, actor) (near_miss 10 s, separation_loss 20 s, collision 5 s) — keyed per victim for formation/near_miss/forced_goaround/collision/separation_loss.
Ids are DESIGN's `INFRACTIONS` keys plus ATC extras.

| type | detected when (thresholds in `js/atc/rules.js`) |
|---|---|
| `queue_jump` | on the ground, enters a runway rect (+30 m) without a clearance while others are holding/lined up for it; `data.jumped` |
| `unauth_takeoff` | ground speed crosses 35 kt on a runway without `clearedTakeoff` (or a touch-and-go within 40 s of a cleared touchdown); `data.outOfTurn`, `victim` = first in queue. Also liftoff off any runway (`data.offRunway`) |
| `cut_in_final` | in the final cone (≤ 3 km, track ±20°, AGL < 250) ahead of a plane sequenced before you that is also in the cone; `data.gap`, `close` < 400 m |
| `forced_goaround` | ATC sent `victim` around because of `actor` |
| `runway_steal` | enters a runway rect while another plane is rolling on it or on short final (< 1.2 km) |
| `runway_incursion` *(extra)* | enters a runway rect without a clearance when neither of the above applies |
| `taxiway_landing` / `grass_landing` / `apron_landing` | touchdown on that surface |
| `unauth_landing` *(extra)* | touchdown on a runway without a landing clearance for it |
| `wrong_way` | touchdown or takeoff roll on the active runway > 120° off the active direction; `data.op` |
| `closed_runway` | touchdown on a closed runway |
| `tower_buzz` | airborne < 80 m from `TOWER` and below tower height + 40 m; `data.close` < 30 m |
| `terminal_buzz` | airborne over the `TERMINAL` footprint below 40 m |
| `low_pass` | over a runway at 1–6 m AGL above 1.2·Vr for ≥ 400 m |
| `formation` | airborne within 40 m of another plane ≥ 3 s (reported on break-up or at 13 s); `data.seconds` |
| `near_miss` | both airborne, closest approach < 25 m and > 6 m (contact) |
| `separation_loss` *(extra)* | both airborne, < 150 m horizontally and < 60 m vertically (ATC failure metric; not sent to RADIO) |
| `collision` *(extra)* | < 6 m (only with `detectCollisions`); FLIGHT should `report()` real contact instead |
| `taxi_speeding` | > 30 kt on taxiway/apron for 2 s |
| `stand_steal` | stopped 3 s on a stand assigned to someone else |
| `ignored_instruction` | `goAround` still descending below 60 m (or landing) 8 s later, or `holdPosition`/`cancelTakeoff` still moving 8 s later |
| `double_occupancy` | two planes on one runway rect, one > 40 kt, neither climbing away |
| `intersection_dash` | enters the 09/27 × 04/22 intersection (25 m) without holding the mutex while another plane is on either runway |
| `hard_landing` *(extra)* | touchdown sink > 600 fpm (`data.fpm`); not scored |
| `impeccable` *(extra, good)* | cleared landing, ±5 m of centreline, first 450 m, < 300 fpm → −10 outrage |

Blame: when two planes are involved, the overridden/player one is the actor; AI-vs-AI pairs blame the faster. AI events
are ATC bugs — the 30-minute soak asserts there are none.

Other channels: `instruction {to, callsign, isPlayer, cmd, line, tier}` (`line` = DESIGN §5.5 routine id),
`composure {key, tier, from, tierName, outrage}`, `scandal`, `landed {actor, impeccable, fpm, surface, runway}`,
`strip {id, from, to}` (states: parked, taxi, holding, lineup, takeoff, climbout, circuit, final, landing, goAround,
rollout, vacating, departing, away, crashed), `runwayChange`.

### RADIO channel (`atc.on('radio', radio.handleEvent)`)
Shapes from docs/RADIO.md: `{type:'infraction', id, actor, victim, outrage, severity, data}` (all infraction ids except
hard_landing/separation_loss/impeccable), `{type:'collision', actor, victim}`, `{type:'goAround', actor, cause, reason}`,
`{type:'tower', intent, actor, runway}` for every other instruction (`taxi`, `hold_short`, `lineup`, `clear_takeoff`,
`clear_land`, `sequence_1..4`, `extend`, `vacate`), `{type:'phase', actor, phase:'taxi'|'hold'|'pattern'|'rotate'}`,
`{type:'landed', actor, impeccable}`, `{type:'outrage', value, tier}` (every 5 points), `{type:'scandal'}`.

## Tower Outrage (composure)
DESIGN §1.3: 0–100, tiers 1 Professional/calm (0) · 2 Strained (25) · 3 Cracking (50) · 4 Meltdown (80), 4-point
hysteresis on the way down. Each scoring event adds `INFRACTIONS[type].outrage × (0.8 + 0.2·severity) × outrageGain`.
Decay −1 per 3 s after 6 s with no new event while no player is overriding. 100 → Royal Scandal: `scandal` event, meter to
60, `frozen` (PP ×0) for 60 s. Only player actors move the meter unless `aiOutrage`. Every instruction carries the tier,
so tower lines pick tone.

## Online (docs/ONLINE.md §10)
State is plain JSON (`serialize`/`restore`); `step(dt, roomTime, states)` takes an injected clock; nothing random.
Host: `authority: true` runs everything. Follower replica: `createATC({ authority: false, detectRemote: false })`,
`restore(hostSnapshot)`, feed states with `remote: true` for others, and the follower's own plane local — it then runs the
rule-break detectors for its own plane only and issues nothing. `setLocal(id, bool)` switches at runtime.
`outragePerPlayer: true` keys the meter `tower:<playerId>`.

## Integration — what FLIGHT needs (main.js / js/flight)
1. `const atc = createATC({ wind, surfaceAt: world.surfaceAt, detectCollisions: false, outrageGain })`;
   `const link = linkTraffic(atc, traffic, { playerId: 'player' })` (js/atc/bridge.js); every frame, game time:
   `link.update(dt)`; `atc.on('radio', radio.handleEvent)`. Player entry must have `player: true`; give AI entries
   stable `ac.id`s and `name` = callsign.
2. Intent: the bridge derives it from the route name (`circuits*` → circuits, `arrival*` → fullStop, `departure*` →
   depart); pass `intentOf(entry)` for anything else (the player's choice, missions).
3. Hold gating already works through `ap.gate` (bridge: a `hold` leg releases only on `clearedTakeoff`). **Please also gate
   the `takeoff` leg's line-up** (routes that start with `takeoff`, and replans that land on it, enter the runway ungated —
   seen as `queue_jump` in the smoke run).
4. Go-arounds: the bridge calls `ap._goAround('ATC: …')` (deferred until the approach leg if ATC said it on base). A public
   `ap.goAround(reason)` would be nicer.
5. Please add (the bridge calls them if present): `ap.extendDownwind(metres, end)` (push the base turn out by `metres`
   total), `ap.rejectTakeoff(reason)`, `ap.holdPosition(reason)`, `ap.setTaxiRoute(cmd)` + `ap.clearCrossing(runway)`.
   Without `extendDownwind`, ATC spacing degrades into go-arounds (smoke run: ~4–6 per 15 min with 3 planes).
6. FLIGHT's taxi graph has no hold at the 04/22 crossing near A3/A (smoke run: AI flagged `runway_incursion` on 04/22 at
   ~(328, −57)); the ATC `taxi.holdShort` list has the points (taxiway A × 04/22: west hold (253, −110), east hold (384, −110)).
7. Collisions: call `atc.report('collision', id, { victim: otherId, severity })` from FLIGHT's contact code.
8. Circuit shape: ATC assumes `geometry.circuitFor(end)` (upwind to L+750, downwind offset 1150, base turn 1800 m out) —
   close to `circuitLegs`. If you change one, change the other (or have routes.js read `circuitFor`).

## Tests
```
node tools/atc-sim.mjs                 # 103 checks, ~3.5 min (+ landseq/placed/closedx/uturn/refusedga after the soaks): kinematic ATC scenarios (circuits, cut-ins, out-of-turn, buzz,
                                       # crossing, crimes, online), then the real Aircraft/Autopilot through bridge.js:
                                       # flight cut-in, gameplay (spawn rivals, demand takeoff, skip, rubber/partial/none
                                       # protection), see-and-avoid, play start (16 ?start=free starts, attract +
                                       # seedRivals: the player lands first circuit, no go-around), and five 30-min AI soaks (attract 5 / 4 + 2 circuits /
                                       # attract 6 / runway change ×2 / mischief high / mixed types
                                       # C172+Tiger+bathtub) on the rolling terrain + castle
node tools/atc-sim.mjs --only=flight "--run=jets among light traffic"   # JETCORE: 30 min, 3 in 11 spawns a jet, one at a time
node tools/atc-sim.mjs --only=flight "--run=herc + f35"            # JETCORE: the fast/short-field pair (seed 61)
node tools/atc-sim.mjs --only=flight --run=mixed [--seed=61] [--control]   # --control adds a C172-only run, same seed
node tools/atc-sim.mjs --falsify       # breaks each detector/fix in a temp copy of js/atc; all 32 must be CAUGHT
node tools/atc-sim.mjs --only=flight "--run=attract 6" [--minutes=30] [--watch=ac3,ac7 --from=600 --to=700] [--trace=name] [--dbgap]
node tools/atc-sim.mjs --only=circuits --dbg=goAround,clearedLand --dbgev --peek=600
node tools/atc-sim.mjs --airport=royal_rot37    # test airport (data/airports/tests.js): C-Tower 1 rotated 37° (13/31, 08/26,
                                               # taxiway K, stands G1–G8); royal_rot37m = mirrored first; royal_rot0 = control
node tools/atc-sim.mjs --airport=royal_rot37 --only=flight --seedOffset=3   # every soak seed + 3000
```
`--airport` runs the kinematic scenarios (still scripted in C-Tower 1's frame) against an ATC built on the test
airport's geometry through a frame adapter that maps positions, headings, end/runway/taxiway/stand names in and out, plus
`circuits 09`; then it switches the whole flight stack (`setAirport`) and flies five 30-min autopilot soaks natively
there (4 + 2 circuits on each end of the departure runway, attract 6, runway change ×2, mixed types). flightcut /
gameplay / avoid stay royal-only (royal-frame scripts for the real autopilot).
Soak AI ids are per world (`ac1…`), so `--run=x` alone flies exactly what x flies inside the full run (see-and-avoid
tie-breaks compare ids; a soak used to depend on how many planes earlier scenarios built).
Soak gates per run: zero AI infractions and separation losses; ≤ 1 go-around / 15 min (ATC + autopilot); nobody held at
the runway > 5 min or > 10 min from spawn to touchdown, nobody stopped on a taxiway 4 min; ≥ 1 movement / 2 min with
arrivals and departures both served; no crashes; ≥ 100 m terrain/castle clearance on fly legs > 1.5 km from the field.
**Known AI hold-short imprecision (autopilot/aircraft, not ATC).** The hold node is 50 m from the centreline, and ATC
counts the runway as occupied from 45 m (half-width 15 + `runwayMargin` 30). (a) A plane holding under full brake at
idle creeps forward: 1.3 m (C172), 1.9 m (Tiger) and 3.0 m (bathtub) per 150 s on flat ground in aircraft.js. After a
long hold it reaches 45 m and is scored `runway_incursion`/`runway_steal`, and an arrival is sent round. (b) When a
runway change re-routes a holding plane, its U-turn at the hold swings about 5 m forward. These cause the residual soak
infractions on some seeds. They happen at the same rate on `royal_rot37` and on the identity control, and the default
`mixed types` seed hits (a) at 1262 s.
The mixed-types run allows 2.5 go-arounds / 15 min: slow types cost runway capacity (seeds 53/61/77/89: 0 separation
losses everywhere, 2–5 go-arounds per 30 min vs 0–2 for the same seed C172-only, mostly `runwayOccupied` behind a slow
departure or lander; seed 61 holds one departure 582 s). Slow types fly a lower, tighter circuit inside the C172's
(FLIGHT.md), which is what took separation losses to zero.

2026-10-22 soak (before → after): separation losses 6 → 0 (4 + 2 circuits: an arrival merging onto a circuit plane's
downwind), go-arounds 2/30 min → 0 in all three base runs, starved departures 2 (342 s at the hold) → 0 (max 261 s;
an arrival crossing the field held a landing clearance for minutes), runway change and mischief soaks new.


## Deviations from DESIGN (for DESIGN/manager)
- Departures need arrivals > 2.2 km, not 3 km (3 km starved the queue in a 6-plane circuit). `T.arrivalBlockDep`.
- DESIGN §1.1 calls 27's pattern "right-hand" and 09's "left-hand"; layout `CIRCUIT` (27 L, 09 R) is what puts both south
  of the field. ATC follows `CIRCUIT`.
- Extras not in `INFRACTIONS`: `unauth_landing`, `runway_incursion` (PP 0, outrage 12/6 in `js/atc/rules.js`) — DESIGN may
  want PP for them; `hard_landing`, `separation_loss`, `collision`, `impeccable` are ATC-side.
