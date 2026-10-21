# ATC (lane ATC)

Pure, renderer-free, deterministic air-traffic control for Krayzee. No three.js, no `Date.now`, no `Math.random`.
World frame and airfield come from `js/world/layout.js` (incl. `HOLD_OFFSET`, `CIRCUIT`); infraction ids, PP and outrage
from DESIGN's `data/rules.js`.

| file | what |
|---|---|
| `js/atc/index.js` | `createATC(opts)`: sequencing, clearances, detectors, outrage, event bus, serialise |
| `js/atc/geometry.js` | runway frames, surfaces, intersections, hold points, taxi routes, `circuitFor(end)`, `circuitProgress` |
| `js/atc/rules.js` | every ATC threshold (`T`), infraction table (DESIGN's + ATC extras), routine line ids |
| `js/atc/outrage.js` | Outrage meter (DESIGN §1.3): tiers, hysteresis, decay, Royal Scandal |
| `js/atc/bridge.js` | `linkTraffic(atc, traffic)`: reference wiring to FLIGHT's `Traffic`/`Autopilot` |
| `tools/atc-sim.mjs` | node harness: kinematic planes that obey ATC, scripted crimes, `--falsify`, `--only=flight` |

## API
```js
import { createATC } from './atc/index.js';
const atc = createATC({
  wind: { from: 270, kt: 8 },     // picks the active end by headwind (27 by default); or activeEnd: '27'
  open: { '04/22': false },       // 04/22 is closed unless a mission opens it (DESIGN §1.1)
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
  remote, crashed, stand, vrKt, touchdownFpm }   // all optional
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
- **Departures**: one queue per active end, ordered lined-up → at the hold (by arrival time) → approaching. First in
  queue is cleared when the runway and its reservations are clear, no arrival is inside 2.2 km, the previous
  departure/touch-and-go is 700 m down the runway, and the intersection is free; otherwise `lineUpWait` when arrivals are
  > 4.2 km out. A departure waiting > 20 s gets a **slot**: the first arrival still before base is stretched 115 s.
- **Crossing runways** (09/27 × 04/22): one mutex per intersection. Any landing/touch-and-go/takeoff clearance on either
  runway takes it; it is released once that plane is 60 m past the intersection, above 150 m past the threshold, or off
  the runway. Requests queue first-come. Taxiway crossings of 04/22 also need it free.
- **Re-plan on crimes**: an aircraft that gets closer to the threshold than one sequenced ahead (by 120 m) is
  re-sequenced ahead; in the final cone that is `cut_in_final` (a pass outside the cone is remembered for 90 s and
  confirmed when both are in the cone or when the victim must go around). The victim loses its landing clearance and is
  extended or sent around with `cause` = culprit (→ `forced_goaround`). The culprit gets no landing clearance for 60 s.
  A blocked runway or an uncleared plane ahead on short final sends the cleared lander around inside 1.5 km (else the
  clearance is revoked and re-issued later); a cleared departure still under 20 m/s gets `cancelTakeoff`. A plane that
  ignores a go-around and keeps descending in the cone stays sequenced (so cutting in after being sent round still counts).
- Active runway: headwind end among departure-capable ends (09/27), 3 kt hysteresis. 04/22 is arrivals-only when opened
  (land, vacate east onto taxiway A, taxi to the active hold).

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
node tools/atc-sim.mjs                 # 49 checks, ~2 s: 6-plane 30-min soak, cut-ins, out-of-turn, buzz, crossing, crimes, online
node tools/atc-sim.mjs --falsify       # breaks each detector in a temp copy of js/atc; all 26 must be CAUGHT
node tools/atc-sim.mjs --only=flight [--minutes=30]   # informational: real FLIGHT Aircraft/Autopilot through bridge.js
node tools/atc-sim.mjs --only=circuits --dbg=goAround,clearedLand --dbgev --peek=600
```

## Deviations from DESIGN (for DESIGN/manager)
- Departures need arrivals > 2.2 km, not 3 km (3 km starved the queue in a 6-plane circuit). `T.arrivalBlockDep`.
- DESIGN §1.1 calls 27's pattern "right-hand" and 09's "left-hand"; layout `CIRCUIT` (27 L, 09 R) is what puts both south
  of the field. ATC follows `CIRCUIT`.
- Extras not in `INFRACTIONS`: `unauth_landing`, `runway_incursion` (PP 0, outrage 12/6 in `js/atc/rules.js`) — DESIGN may
  want PP for them; `hard_landing`, `separation_loss`, `collision`, `impeccable` are ATC-side.
