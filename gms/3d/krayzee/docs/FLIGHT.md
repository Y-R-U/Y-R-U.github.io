# FLIGHT lane

Owns `index.html`, `js/main.js`, `js/core/**`, `js/flight/**`, `css/game.css`, plus `tools/flight-sim.mjs` and
`tools/test-flight.mjs`.

## Files
| file | what |
|---|---|
| `index.html` | importmap (vendored three r180), no-zoom viewport + safe areas, classic boot watchdog (20 s / module load error → card with a cache-busting Reload) |
| `js/main.js` | boot (UI → renderer → world → attract traffic → loop), play/quit/pause, audio wiring, events → HUD, `window.__game` |
| `js/core/renderer.js` | WebGLRenderer (ACES, sRGB, PCF soft shadows), quality tiers, resize/orientation, context-lost card, adaptive tier governor (D6) |
| `js/core/wiring.js` | ATC (`createATC` + `linkTraffic`), radio (`createRadio`), score/career (`createGame`) around the flight core; every call guarded |
| `js/flight/vmath.js` | tiny V3/Quat so the whole flight core is **three-free and runs in node** |
| `js/flight/aircraft.js` | `class Aircraft` — the flight model (also `TYPES.c172`) |
| `js/flight/autopilot.js` | `class Autopilot` — route following, replanning, inner loops |
| `js/flight/routes.js` | runway-end geometry, taxi graph + Dijkstra, route builders |
| `js/flight/traffic.js` | `class Traffic` — fixed-step world, player/AP mixer (override), runway/stand/spacing queries |
| `js/flight/netstate.js` | `packState` (32 bytes) / `unpackState` / `applyRemote` (Hermite + dead reckoning) |
| `js/flight/controls.js` | touch stick + throttle + flaps/brake/rudder pad, keyboard, gamepad, look-around drag |
| `js/flight/cameras.js` | cockpit + chase cameras, FOV fitted to aspect |
| `js/flight/hud.js` | speed/alt/hdg/VS strip, AUTOPILOT/MANUAL/RESUMING pill + phase, per-axis chips, banner |
| `js/flight/attract.js` | AI traffic (also background traffic in play) + the menu's cinematic camera |

## Flight model (`Aircraft`)
Fixed 120 Hz (`Traffic.update` accumulates, `Aircraft.pose(alpha)` interpolates for rendering). Body frame: forward −Z.
- Lift/drag from AoA: `CL = CL0 + CLa·α + flaps·0.65`, stall at ~15.5° (less with flaps) with a lift break + drag rise,
  induced drag with ground effect. Stall speed ≈ 50 kt clean / 44 kt full flap; Vr 55, Vy 74, approach 65 kt.
- Thrust `2700 N · (idle + throttle) · (1 − V/115)` with a spool lag; ~110 kt cruise.
- Rotation is rate-tracking (arcade-leaning, stable): each axis chases what the surfaces ask for (scaled by airspeed,
  prop-wash on the ground) plus AoA/sideslip weathervane stability and a mild wing-leveller. Full back stick can stall.
- Gear: three spring/damper wheels with rolling/brake friction per surface (`surfaceAt`), lateral grip, nosewheel
  steering from rudder (less with speed). Rotation happens naturally at ~55 kt with back stick.
- Events (`ac.events`): `touchdown {fpm, grade butter|smooth|firm|hard|crash, bounce, surface}`, `hardlanding`,
  `tailstrike`, `crash {reason}` (gear collapse, hard landing, nose/wingtip/tail/belly into ground, collider AABBs,
  cartwheel, water/building surface).
- Conventions: `elevator +1` = stick back (nose up), `aileron +1` = roll right, `rudder +1` = yaw right.
- Impacts: without `ac.impactHandler` anything solid is a crash. With one (main sets SCORE's `reportImpact` on the
  player), ground / collider / aircraft / hard-touchdown hits ask it: `bounce`/`damage` reflect the velocity with the
  returned restitution (+ spin) — impossiRubber — and `destroyed` crashes. Event `impact {result, reason, kind}`.
- Aircraft contacts (`Traffic._contacts`, once per frame): planes within ~0.6 span horizontally and 2.6 m vertically.
  `traffic.onContact({a, b, relSpeed, remote})` (main reports it to ATC), `collision {other, remote, relSpeed}` events on
  both, then each local plane's impact path. Gentle ground bumps without a handler just push apart.

### Aircraft types (TRAFFIC round 3, docs/PLANES.md items 1–11)
`new Aircraft({ type: 'c172' | 'tiger' | 'bathtub', dims })`. `TYPES.tiger/bathtub` are the roster's `AIRCRAFT.<id>.flight`
blocks (bathtub + `rollDrag 0.06`: rubber-ball feet). The C172 path is unchanged (its 80/20 load split, gear, tach).
| | C172 | Tiger Moth | Royal Flying Bathtub |
|---|---|---|---|
| gear | tricycle | taildragger (`ac.taildragger`, `ac.tailDown`), steerable tail wheel | 4 feet: fixed rear pair + castoring front pair (`noseTrack`) |
| at rest | level, CG 1.20 | 3-point 11.6° (`groundPitch` 11.1°), CG 1.11 (`restHeight` 1.13) | level, CG 1.05 |
| AP takeoff run (book) | ~255 m @ 58 kt | 144 m @ 47 kt (160) | 134 m @ 48 kt (150) |
| technique | rotate at Vr 55 | stick back, tail up from 0.8 Vr (~36 kt), rotate gently at 45 | rotate at Vr 40 |
| circuit (alt / downwind offset) | 300 m / 1150 m | 217 m / 977 m | 147 m / 805 m |
| circuit speeds (leg kt × scale) | 74–95 kt | ×0.84: 62–80 kt, final 55 | ×0.63: 47–60 kt, final 45 |
| AP touchdown | ~157 fpm @ 52 kt | 3-point: 72 fpm @ 42 kt, 10.6° | 157 fpm @ 40 kt |
| AP circuit, roll to touchdown | ~3.5 min | ~5 min | ~6.3 min |
| tach idle–max | 650–2700 | 650–2350 | 700–2700 |
| fuel per tank / burn | 100 L / 6–50 L/h | 43 L / ×130/180 hp | 40 L / ×95/180 hp |
| quirks | — | ground-loops if you let it (hands-off 19° swing after a yaw kick at 30 kt; rudder holds it to 2°); lower wingtip scrapes at ~16° bank on the ground; prop strike on hard braking tail-up | wobbles in roll (0.45 Hz) in the air; narrow track: taxi turns at ≤ 1.6 m/s or it tips onto a wingtip |

Model changes (all additive): per-wheel heights (`gear.mainY/tailY`) + geometric static load split; tail-wheel steering
reversed (aft of the CG) and castoring (side grip 0.3–0.75·N with rudder) — front feet the same; on the ground a
taildragger's yaw rate-tracking is weak (`GL.track 0.2`, damping `GL.damp 0.5`) so the mains-ahead-of-CG instability
shows; `place()` on the ground sits a taildragger in its 3-point attitude; `P.tailSkid` / `P.hardPoints` (named
`left lower wingtip`, `propeller` …); no `tailstrike` while the tail wheel is down; touchdowns grade from the mains (a
3-point arrival counts; a few-cm skip while the tail settles is not a bounce — mains must leave > 0.6 s and > 0.4 m);
`rollWobble`; `instruments().rpm` from the roster's idle/max rpm; burn scales with hp. `ac.aglRef` = CG height at rest
(`restHeight ?? gearHeight`), used for `agl`. `typeSpeedScale(type)`, `typeInfo(type)` exported.

Autopilot per type: route/leg speeds are C172 knots scaled by `vcruise` (`ap._kt`, never below Vapp / 1.22 Vs0);
pursuit lookaheads scale too (fly legs ∝ 1/scale, the final ∝ scale²) so slow types still roll out on the centreline.
Taxi speed × roster `taxi/15` (not on a runway: vacate briskly), turns × tip-over stability (main half-track / CG
height vs the C172's). Taildragger: tail up at 0.8 Vr, rotate to 0.11 rad; flare holds off ~1 m until near Vs0 with
pitch rising to the 3-point attitude; rollout stick back once the tail is down, light braking only tail-down.
Taxi paths no longer hold short of a crossing runway in the middle of the runway the plane is still rolling along.

Routes per type: `circuitRoute(end, { type })`, `arrivalRoute(end, { type, ... })`, `circuitLegs(end, { type })`,
`circuitOpts(type)` → `{ alt, width }` (lower, tighter circuit inside the C172's: vertically clear on the downwinds; the
base is never below the 4° glide path). Routes remember `route.circ`, so `rerouteRunway` / runway changes keep it.
`aiSpawn(kind, end, { type })` (start speeds + circuit). `createAttract({ ..., types: ['c172', 'tiger', 'bathtub'] })`
draws AI from that list (default `['c172']`).

## Autopilot + override (the core mechanic)
Every aircraft (player and AI) has an `Autopilot` that outputs the same control set a player would.
`Traffic._mix` chooses per axis: **manual** (player input beyond the 0.08 dead-zone) → on release **wait 1.5 s** (neutral
stick, throttle held) → **blend 2 s** back to the AP → **auto**. At the start of the blend the AP calls `replan()`
(DESIGN §1 override spec). The HUD shows AUTOPILOT / MANUAL / RESUMING and per-axis chips (STICK THR RUD BRK FLP).
While overridden the AP keeps computing (so the blend is smooth) but suppresses go-arounds.

### Route model
A route is plain JSON `{ name, legs, loop }` — `loop` is the leg index to wrap to (or null). Leg kinds:
| kind | fields | behaviour |
|---|---|---|
| `taxi` | `dest: {hold:end} \| {threshold:end} \| {stand:id\|'auto'} \| {xz}` | taxi-graph path from wherever the plane is; slows for turns; stops behind traffic |
| `hold` | `end, seconds, untilClear` | brakes on; released when time is up and the runway is clear (`traffic.runwayClear`) and `ap.gate(leg, ap)` (ATC hook) says yes |
| `takeoff` | `end` | taxi to hold if far → line up → roll → rotate at Vr → climb runway heading to 110 m AGL |
| `fly` | `to: [x, alt, z], speed (kt), flaps` | consecutive fly legs (+ the next approach's FAF/aim point) form one pure-pursuit path, so turns are anticipated; altitude interpolates along each segment |
| `approach` | `end` | 4° glide path to an aim point 130 m in, full flap 65 kt → flare at 6.5 m → rollout → done < 9 m/s. Go-around if not lined up, too high, overshot or runway occupied |
| `park` | `seconds` | parked, then releases its stand |
| `despawn` | — | `ap.done`, phase `GONE` (attract removes it) |

Builders (`routes.js`): `circuitRoute(end)`, `circuitLegs(end)`, `departureRoute(end)`, `arrivalRoute(end, {stand, then})`,
`taxiPath(x, z, heading, dest)`, `holdPoint(end)`, `standInfo(id)`, `runwayEnd(id)`, `toRunway/fromRunway`, `onRunway`.
Circuit side comes from `layout.CIRCUIT`, hold distance from `layout.HOLD_OFFSET`.

### replan() — "carry on from the crime"
- **Airborne**: if the plane is pointing at any runway end (≤ 40° off, 250 m–6 km out, not wildly above the glide path)
  it joins that approach — cut in on someone's final and the AP lands you there. Otherwise it rejoins the cheapest
  fly leg (distance + heading + altitude), direct-to. If upset (bank > 60°, pitch extremes, stall) it first does a
  RECOVERY (wings level, nose down, full power) then replans.
- **On the ground**: fast on a runway and aligned → rollout; otherwise the current ground leg is re-pathed from here,
  or the next ground leg in the route is taken (landed on the grass → taxi to the route's next hold).

### ATC commands (called by `js/atc/bridge.js`)
`ap.gate(leg, ap)` gates `hold` legs **and** the takeoff leg's line-up / start of roll (`{kind:'hold', takeoff:true}`);
without a gate the AP uses `traffic.runwayClear`. `ap.goAround(reason)`, `ap.extendDownwind(metres, end)` (moves the
`ext`-tagged DOWNWIND end, BASE and the final-turn point out by `metres` total; 0 cancels; cleared when the approach
starts), `ap.rejectTakeoff(reason)` (brake to a stop, taxi back to the hold), `ap.holdPosition(reason, secs)`,
`ap.setTaxiRoute(cmd)` (uses `cmd.dest`/`stand`/`runwayEnd`; path is FLIGHT's own graph), `ap.clearCrossing(runway)`.
Taxi paths stop `HOLD_OFFSET` short of every runway they cross (04/22 on taxiway A: ≈(253,−110)/(384,−110)) and cross
when ATC clears it (or, ATC-linked, after 25 s with the runway free; unlinked, as soon as it is free).
`circuitLegs` matches ATC `circuitFor`: upwind to L+750, downwind offset 1150, final turn 1800 m out.

### TRAFFIC lane additions (2026-10-22)
| API | what |
|---|---|
| `ap.landAt(plan)` / `ap.cancelLand()` | ASSIST §2 LAND: fly `plan.route` (approach legs may carry a **virtual end object** `{id:'LAND', virtual:true, thr, far, hdg, u, len, width, elev}` and `leg.fafDist`) to a stop; any stick input > 0.5 s or `cancelLand()` restores the previous route + replans. Virtual ends skip `landingClear` and touch-and-go. `ap.landing` is the active plan. Event `replan {to:'land'}` / `landcancel`. |
| `ap.demandTakeoff({ends, prefer, minRun})` | D21: from anywhere on the ground, taxi straight to the nearest usable runway entry (≥ 600 m left; the preferred end wins ties) and go — no queue, no clearance, no hold lines. Returns the end id or false. Bridge: `link.demandTakeoff(entry)`. ATC is not told: it calls `queue_jump`/`unauth_takeoff`/`runway_steal` as they happen. |
| `ap.skipToRunway(end)` | D22: placed lined up 12 m past the threshold, phase LINED UP, waiting for the clearance. Bridge: `link.skipToRunway(entry)` also resets the ATC strip (line-up-and-wait + 10 s crime grace). `link.placed(entry, secs)` after any respawn/teleport. |
| `ap.changeRunway(end, oldEnd)` | active-runway change (bridge calls it on `atc.on('runwayChange')` for every AP on a circuits/arrival/departure route; the player only while on AUTOPILOT, `linkTraffic(..., {reroutePlayer:false})` to opt out). Rolling, flaring and rolling-out planes are left alone; airborne planes ignore the old end for 4 min so they never land on it. |
| `routes.rerouteRunway(route, i, {onGround,x,z}, end)` | the route half of the above (same kind of route for `end` + the leg index to resume) |
| `arrivalRoute(end, {from:[x,z]})` | from the far side of the circuit the arrival first crosses the extended centreline 1.5 km beyond the upwind end at pattern + 150 m (it used to fly straight across the field and the final approach) |
| `traffic.airConflict(ap)` | see-and-avoid for AI on `fly` legs: the closest airborne plane passed within 300 m in the next 45 s at ±160 m. The AI gives way to the player, to anyone not on a fly leg (final, climb-out) and to whoever is ahead on a common track (abeam: higher id gives way): offsets ±100 m from it and, if it is ahead on the same heading, slows to max(1.35 Vs, 64 kt). `ap.sep` shows the active resolution; `ap.noAvoid = true` disables it (tests). |
| `ap.mischief` | `'speed'` (≈ 32 kt down the next long straight of this taxi, braking in time for turns/crossings/the end) or `'lowpass'` (a 4.5 m, 74 kt pass down the runway instead of the landing, then a go-around). Set per taxi/approach by the bridge (`linkTraffic(..., { mischief: 'low', rnd })`). |
| `aircraft` fuel (D20) | `ac.fuel {cap, L, R}` litres per tank, burn 6 L/h idle … 50 L/h full × `ac.fuelBurnScale`; `instruments()` adds `fuelL, fuelR` (0–1), `fuel` (L), `lowFuel`, `engineOut`; events `lowfuel {litres, fraction}` once below 15 %, engine stops at empty (glide); `ac.refuel(fraction = 1)` refills and restarts (`refuel` event). |
| `impact` event | now `{ result, reason, kind, restitution, other, n:[x,y,z] }` — `n` is the unit contact normal: terrain normal (finite differences of `groundHeightAt`) for ground/touchdown/cartwheel hits, the face normal for collider AABBs, the separation direction for plane-to-plane. `groundNormal(env, x, z)` is exported. |
| `aiImpactHandler(mode)` / `traffic.setAIProtection(mode)` | AI under Rubber / Partial bounce like the player (Partial loses protection per hit, DESIGN PROTECTION table); `null`/realistic crashes. |

Player-override fixes (PLAYTEST_1): **#1** a released throttle stays LATCHED (`axis.throttle.mode === 'latched'`) — on the
ground until `resume()` or idle, in the air until every other axis has been back on AP for wait + blend; throttle
> 0.3 at a hold (> 0.15 at a stand/park) releases that leg and goes. **#3** releasing the stick at AGL < 150 m, sinking
> 3.6 m/s, banked > 60° or stalled skips the 1.5 s wait: 0.6 s blend + immediate RECOVERY. **#7** stick-only override
in the air: the AP holds the flaps/speed it had when the stick was taken (no stale-phase flap/idle schedule) and the
phase label is MANUAL. **#2** `ap.lastOverride` (game time of the last stick takeover): the bridge drops ATC go-arounds
for the player for 60 s after it, so a cut-in lands, the victim goes round and `cut_in_final` scores. **Ground (Aaron)**:
in flare/rollout/vacate/taxi/hold/park the player's throttle/steer/brake win — stick X steers the nosewheel when the
rudder buttons are idle, the AP never brakes against a player throttle, crossings/holds/parking never pin the plane, and
release replans from the ground position.

Terrain: AP `fly` legs keep `leg.clearance ?? 120` m above terrain and collider tops sampled 0–1.8 km ahead along the
track and the commanded heading (`_terrainFloor`); aircraft ground contact/crash uses `env.groundHeightAt` and
`env.colliders` (the castle box to 190 m).

### FLIGHTFIX (PLAYTEST_2, 2026-10-22)
| item | API / behaviour |
|---|---|
| B2 LAND | `ap.landAt(plan)` now owns the plan to a stop: fly legs keep 35 m terrain clearance (was 120 m: the "orbit that never descends"); any replan or go-around while landing goes back to the plan's touchdown (onto its final if set up, else `_landCircuit`: a tight circuit on the side the plane is on) — never a fly-away; the tower's go-around is refused while LAND is active (event `goaroundrefused`) unless the touchdown zone is physically occupied; the AP's own "runway occupied" check only looks at the first 700 m; flare sinks relative to the ground under it; a floating hold-off on a short strip is put down; rollout holds the strip heading to its end. |
| B3 stick override | stick-only override no longer speed-holds on the throttle: the throttle stays where it was at the grab (power added only below 1.25 Vs). |
| B4 throttle lever | a released throttle LATCHES in the air at any value until `traffic.autoThrottle(e)` (= `releaseThrottle(e)`, the lever's AUTO detent), `resume(e)`, `ap.landAt` / `demandTakeoff` / `skipToRunway`, or an upset recovery. On the ground a lever left at idle goes back to the AP. While latched the AP flies the path that power allows. `traffic.throttleState(e)` → `{ mode, player, value, auto }`: show `player` on the lever while `!auto`. |
| B5 upset | release in an upset: 0.25 s blend (was 0.6) then `_upsetOut`: unload past 90° of bank, roll the short way at full rate, pull at ~0.8 α-stall, idle when nose-low and fast; low down it climbs away instead of settling. A touchdown < 2.5 s after an impact counts as part of the smash (`touchdown.afterImpact`, refreshes `_lastImpact` for ATC). Airborne on a ground leg (a Rubber bounce) → replan. |
| B6 spawn | `traffic.spawnConflicts(x, z, r)` (used by `attract.clearAround`): placing the player on a runway also clears that runway's users (on it, final inside 3.2 km, going round). |
| B7 pacing | the player's AP turns base at `ap.finalLen` (default 1300 m, set per difficulty if wanted; `null` = published 1.8 km) when no-one else is in that runway's pattern and ATC has not extended the downwind. `ap.stableFinal` (also in `status()`): on a lined-up final within 20 m / 10° / 20 m of the glide path, > 350 m out — STORY's warp may run 2× while it is true. Player taxi runs up to 10 m/s (narrow types 8) on long straights; DEMAND TAKEOFF rolls from the entry without a full stop. |
| misc | `ap.isPlayer` (set by `traffic.add`); ATC `taxi` commands do not re-route the player's own taxi to a named stand; AI registrations unique per session (`randomLivery(taken)`); `_pursue` pads 1-point paths; braked + stopped at low power the wheels hold (no creep over hold lines); turning round from a stop pivots tight (≤ 0.8 m/s); `demandTakeoff()` defaults to the layout's open runway ends. |

### LANDFIX2 (Aaron's phone log aaron1.jsonl + PLAYTEST_3, 2026-10-23)
| item | behaviour |
|---|---|
| low LAND | Under 120 m AGL the planner (ASSIST §3c) wants straight ahead and down; on final a LAND never climbs back to the glide path (levels off and lets it come down; over the strip already: −1.2 m/s), never trades excess speed for height (`t.noClimb` keeps the speed term out of the minimum flight-path angle), and only lowers full flap below 1.2 Vapp. Banks to 15° low on a LAND final (taildraggers above 6 m) to line up. Lateral/heading go-arounds only above 5 m AGL; a LAND that has touched down never goes around. |
| upset + LAND | a LAND during an upset recovery ends the recovery as soon as wings are level and the nose is out of the dive (> −0.12 rad); the approach arrests the sink. `_begin` only starts an approach as a go-around when LAND is steeper than ~9°. |
| flare (LAND only; circuit flares unchanged) | entry at `clamp(−vs·1.3, 2 (taildragger 1.5), 4.5)` m; sink target `0.55·agl`, floor 0.95 m/s rising after 1.5 s, pitch floor relaxed after 0.8 s, so touchdown follows in ~1–3 s. Fast (> 1.12 Vapp, e.g. after a dive): flaps up, idle, nose may go 2° below level, never climbs (vy > 0.3 → sink ≥ 2 m/s). Taildragger 3-point hold-off fades out by 3 s; LAND taildragger final at min(Vapp, 1.25 Vs0). |
| bounce / rollout | ROLLOUT only with mains down and vy < 1 (a Rubber bounce pops ≥ 2 m/s: still FLARE); airborne again > 0.5 m → FLARE; a bounce in FINAL (touchdown < 3 s ago) → FLARE; down short of the aim point → ROLLOUT. LAND rollout: nose-wheel pitch hold (no rotating back into the air), flaps up after 0.3 s, brakes 0.6 (tailwheel 0.4 tail-down). |
| #2 loop wrap | `_fly` stepping past the last leg goes through `_next()` (wraps to `route.loop` or ends); `update` repairs an out-of-range `i`. Test: flight-sim `loopext`. |
| #8 throttle | stick grab: the throttle under the player is at least 0.55 (never an idle engine). Releasing the stick low/sinking keeps a latched lever unless it is a real upset/stall or the lever is < 0.3. |
| #9 low/slow takeback | player AP on a fly leg below 60 m: bank ≤ 15°; also slower than 1.4 Vs: wings level (≤ 5°), full power, climbing ≥ 1 m/s, no dive for speed. |
| #4 hand-flown bank | controls.js `pitchAssist` (GAMEPLAY file, minimal edit): with the stick off-centre in pitch by < 0.5 and bank > 8°, adds back-pressure for the bank plus a sink damper (Hard: half), none near the stall. |

Tests: `node tools/flight-sim.mjs aaron|loopext|throttle` (25 checks; all fail on the pre-LANDFIX2 autopilot). Real game: scratch `landcdp2.mjs` (see the LANDFIX2 report).

### Status for HUD / ATC
`ap.status()` → `{ engaged, overridden, phase, sub, leg, legIndex, label, route, recovering, done, target, speedKt, end }`;
`ap.events` (`phase`, `override`, `replan`, `goaround`, `recovery`, `landed`, `takeoffroll`, `waypoint`) — drained by main
for the player; ATC can drain them for AI. `traffic.modeOf(entry)` → AUTOPILOT / MANUAL / RESUMING; `entry.axis[k].mode`.

## Runtime wiring (main.js + core/wiring.js)
ATC is linked to all traffic (`linkTraffic`), the radio gets `atc.on('radio')`, and Free Flight creates SCORE's
`createGame` with the shared `loadCareer()` (also passed to `ui.initUI({career})`). The player's
`ac.impactHandler` = `game.reportImpact` (Free Flight is Rubber → bounces). Player and attract traffic use ATC's
**active runway** (`atc.activeRunway().end`, wind-picked — 27 with the default 240° wind). Left alone, the AP commits
no infractions; ATC still awards `impeccable` (+50) for a perfect landing.

## How ATC / AI plug in
- AI = `new Aircraft` + `new Autopilot` + `traffic.add({ aircraft, ap, rig })` + `ap.setRoute(...)` (see `attract.js`).
- Clearances: set `ap.gate = (leg, ap) => boolean` — `hold` legs wait for it. Replace or splice routes any time
  (`ap.setRoute(route, { start })`, then `ap.replan()` to join it from the current state).
- Runway knowledge used today (replaceable by ATC): `traffic.runwayClear(end, ac)`, `traffic.landingClear(end, ac)`,
  `traffic.trafficAhead(ac, range)`, `traffic.claimStand(ac)` / `releaseStand(ac)`.
- Online: `ac.packState({roomTimeMs, hull, overriding})` → `Uint8Array(32)` (layout in `netstate.js`);
  `ac.applyRemote(samples, renderMs)` interpolates (Hermite, slerp) or dead-reckons ≤ 600 ms; set `entry.remote = true`
  so `Traffic` skips simulating it. AP phase does not fit in the 32 bytes — send it on the reliable event channel.

## Controls
Touch (portrait + landscape): floating stick on the LEFT by default (D10; `settings.stickRight` swaps), throttle slider +
FLAPS / BRAKE / ◀RUD / RUD▶ on the other side. Pitch (D9): drag the stick DOWN = nose UP (keyboard ArrowDown/S too);
`settings.invertPitch` flips it. Lift a finger → that axis is released. Drag on empty screen = look around
(snaps back). Top: pause/settings (left), view toggle + fullscreen (right, offset by `--br8t-account-space`; fullscreen
hidden where unsupported, e.g. iPhone). Keyboard: arrows/WASD pitch+roll, Q/E rudder, Shift/Ctrl (or =/−) throttle,
F flaps, B brake, C/V view, P/Esc pause. Gamepad: left stick, LB/RB rudder, RT/LT throttle, A brake, X flaps, Y view,
Start pause. Views (D11): `chase`, `center` (rig.eyeCenter, centreline) and `cockpit` (left seat, rig.eye + eyePitch);
the view button and C cycle `settings.views` (default all three); a single entry hides the button.
RADIO safe-zone vars (`--krz-hud-top`, `--krz-tr-top`, `--krz-ctl-bottom/left/right/right-h`, `--krz-tr-w`) are measured
from the live control rects by `controls.publishSafeZones()`, so they follow side swaps and orientation.

## Quality (D6)
Tiers: `low` (DPR 1.25, 45 m shadow box), `medium` (DPR 1.75, 70 m), `high` (DPR 2, 90 m); MSAA unless forced low.
`settings.quality === 'auto'` (default) boots LOW; after 3 s warm-up the governor measures 2.5 s windows and steps up
while ≥ 56 fps with < 3 % slow frames, steps down after two windows < 47 fps (or > 15 % slow frames), and never
retries a tier it had to leave; 4 s minimum between changes. A forced tier disables it; `?lite=1` forces low,
`?quality=` forces a tier. Scene content (trees, plane detail) is built once: auto uses high content on desktop, low on
phones. `__game.quality` → `{ tier, auto, fps, history }`. The shadow box follows the player via `world.setShadowFocus`.

## URL params / test hooks
`?auto=1` (player plane flies circuits forever, controls hidden), `?start=free` (skip menu), `?view=chase|center|cockpit`,
`?timescale=N` (sim speed-up for tests, ≤ 8),
`?shot=1` (hide HUD/controls), `?lite=1`, `?quality=low|medium|high`, `?noaccount=1` (UI).
`window.__game`: `state()`, `setControls(c, ms)`, `release()`, `teleport({x,z,alt,heading,speedKt})`, `setView(v)`,
`start()`, `quit()`, `phase()`, `aircraft`, `log()`, `controlsRects()`, `traffic`, `renderer`.

## Tests
```
node tools/flight-sim.mjs            # node, ~3 min, 102 checks: landmany (LAND from 10 positions × 3 types + go-around return), feel (B3/B4/B5/B7, taxi guard, demand ends), spawn (B6, real ATC; --old falsifies), impact normals, fuel, landAt (runway + field plan to a stop),
                                     # ground override (hold/stand/rollout), handback, circuits 09/27, override, cut-in, stall, traffic,
                                     # types (Tiger + bathtub AP circuits 09/27: takeoff run ±25 % of book, no ground loop, 3-point
                                     # touchdown, centreline), typeoverride (hand-flown + release, low dive handback), typeground (rest
                                     # attitude, tail-wheel steering sign, ground loop lively/survivable, wobble, rpm, fuel)
node tools/flight-sim.mjs mixed      # opt-in: atc-sim's 30-min C172 + Tiger + bathtub soak through real ATC (~30 s)
node tools/flight-sim.mjs landat     # one scenario
~/.claude/bin/cdp start --port 9431 -- --use-angle=metal
node tools/test-flight.mjs           # boot/attract, layout (390×844, 844×390 touch, 1280×800), pitch sign (real touch drag
                                     # + ArrowDown), circuit, override — real time ~12 min; add --timescale=4 for ~4 min
node tools/test-flight.mjs --only=layout,pitch
node tools/atc-sim.mjs --only=flight # ATC lane's smoke with the real Aircraft/Autopilot
~/.claude/bin/cdp stop 9431
```
Screenshots land in `docs/shots/flight/`.
