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

### FLIGHTFIX3 (test-loop findings, 2026-10-23)
| item | API / behaviour |
|---|---|
| #1 route after takeoff | `_takeoffRoute(end)`: this route's (or the pre-LAND route's) takeoff leg; the **player** never gets an AI `departureRoute` (it ends in `despawn` → GONE ~10 km out): with no usable takeoff leg (a LAND plan has none) it flies `circuitRoute(end, circ)`. Same for `skipToRunway`. `cancelLand()` never restores a despawn route for the player (circuits on its takeoff end instead). LAND "cancelled itself" in the climb-out = a second tap: LAND NOW showing/hiding slides LAND 58 px under the finger (and the loop suite re-taps); landbutton.js now ignores a LAND tap within 0.7 s of LAND going active or moving. |
| #3 taildragger rollout | aircraft.js: the weak on-ground yaw tracking (`GL.track`/`GL.damp`) applies only while the **tail wheel is down**; tail flying (wheel landing, takeoff roll) the fin/rudder work as in the air. A tail-up LAND rollout at 45–60 kt used to diverge against full opposite rudder onto a wingtip. LAND rollout elevator (taildragger): tail held up (pitch → 0.6°, no lift) until below Vs0, then lowered but never pulled past the 3-point attitude; full back stick below 0.85 Vs0 (a 44 kt tail-down pull hopped 0.9 m for 2.4 s = ATC "unauthorised takeoff" off a runway). |
| #4 `ap.fieldTakeoff({ world, end, need })` | on the ground: `takeoffRun()` (landahead.js, planner Field cache) scans every 10° for a clear, flat run starting under the plane (≥ `need`, default book roll × 1.35 + 40 m) with the climb-out clear at 6 %; the smallest turn wins (turns > 45° also need a clear 24 m circle). Route = `[takeoff {end: virtual 'FIELD' end}, ...circuitRoute(end)]`, `loop: 1`; it pivots onto the run (≤ 4 m/s × tip factor), rolls (demand, no clearance), rotates at 0.9 Vr, climbs at 0.17 rad, and at 60 m AGL `replan({ noLand: true })` joins the circuit. Returns the run or `false` (main falls back to the 500 m teleport hop, then `ap.resumeCircuit(end)`). Takeoff legs accept virtual end objects (`endOf`). |
| #5 `ap.taxiIn({ stand })` | from any stop on the ground: claims `stand`, route `taxi in` = taxi → park (until throttle); `ap.taxiingIn` true while taxiing. GAMEFIX's main.js `updateTaxiIn` calls it on Hard. |
| DEMAND TAKEOFF from the terminal (GAMEFIX) | a royal shortcut: straight across the grass onto the runway centreline (≤ 450 m, clear of colliders + 8 m, water, buildings, trees; runway left ≥ min(minRun, max(350, book roll × 1.8))) when it beats the taxiways — from stand S4 it is 230 m straight ahead: airborne C172 75 → 52 s, Tiger 107 → 55 s, bathtub (crashed) → 59 s. `ap.demandDirect`. |
| bathtub line-up | a narrow track (`_gnd.turn < 0.5`) arrives at the line-up at ≤ 1.4 m/s and brakes straight before turning (it entered at 6.6 m/s and put the left wingtip in at 3 m/s, Hard = destroyed); line-up turns > 20° are capped at 3.5 m/s × tip factor (field pivots 4×). |
| `ap.resumeCircuit(end)` | airborne: drop LAND, fly `end`'s circuit from here (`replan({ noLand: true })`). |
| #6 latched lever | a latched throttle flies the leg's path and lets the speed float (it zoom-climbed ~150 m at full power to hold the leg speed); only below 1.3 Vs or above 1.2 Vcruise does the path give way. |
| STORY2 stuck RECOVERY | a latched lever near the ground goes back to the AP: in a low RECOVERY not climbing for 2 s, and on a fly leg below 60 m when it cannot hold the path (slower than 1.3 Vs or sinking > 2 m/s). A low, slow hand-back with the lever latched at 0.35–0.5 sat in RECOVERY for minutes (C172 at ~70 m, bathtub at 1 m) or flew into the field at 0.2. |
| treeTop | `env.treeTop()` returns −Infinity for "no tree" (main.js); the DEMAND shortcut's clear check reads it that way. |
| virtual ends never leak | the field-takeoff leg (virtual `FIELD` end) is dropped from the route at the end of the climb; `routes.runwayEnd(obj)` returns an end object as-is (traffic.runwayFree read the player's takeoff leg and threw "no runway end [object Object]" every frame → FREEZE, tiger-hard); `rejectTakeoff` refuses a virtual end. |
| LAND vs an occupied runway | a LAND go-around for "runway occupied" (tower or own) means the next circuit lands long: the virtual end (runway id kept) starts 90 m past the furthest plane on the runway when ≥ 450 m is left. Two other go-arounds do the same. (A parked plane kept a Tiger LAND circling for 5 min.) |
| DEMAND line-up | a narrow track brakes firmly (0.8, idle) while straightening before the turn; after 20 s in LINE UP a DEMAND rolls from ±10 m / ±24° (a bathtub on RWY 04 crept along 27 for a minute without converging). |
| `replan({ noLand })` | `noLand: true` skips the "pointing at a runway → join its final" shortcut. |

Tests: `node tools/flight-sim.mjs fix3` (29 checks, + #2b LAND with a plane parked in the touchdown zone ≤ 300 s, + #4 runwayFree polled through a field takeoff; + #7 low slow hand-back with a latched lever × 18 and LAND from the story's PRESS LAND line-up × 3; + #5b DEMAND TAKEOFF from the terminal with no impact handler, ≤ 70 s; #1 route after DEMAND TAKEOFF / after a LAND cancel, #2 downwind/late downwind/base → RWY 27 flown to a stop, #3 field rollout no impact / no ≥ 0.4 s hop / ≤ 10° heading, #4 fieldTakeoff ≤ 34 s (50 s when it must turn > 45°) then circuits, #5 taxiIn to the Hard spot, #6 latched lever). 17/19 fail on HEAD 8369b0f1 (#3 C172/bathtub pass there: the bug is Tiger-only). Not changed: the circuit's size (C172 downwind ~156 s) — `circuitLegs` is shared with ATC's `circuitFor` and AI sequencing.

### FLIGHTFIX4 (lane bug reports, 2026-10-30)
| item | root cause → fix |
|---|---|
| #1/#2 `_pursue … reading 'length'` from `_takeoff`, `toRunway … reading 'thr'` from `_approach` | `update()` read `leg` before the RECOVERY block; a recovery that ended in `replan()` moved to another leg and rebuilt `this.cur` for it, then the **old** leg's step ran on the new cur (a fly cur has no `line` / `e`). Found by a node fuzz (LAND / LAND NOW / stick / DEMAND / ATC with mischief, 40 × 12 min) that threw it at royal with no swap. `update()` re-reads the leg after the recovery/attitude blocks. |
| #2 stale refs across a Kingdom Map swap | `ap.airportChanged()` (js/map/index.js `doSwap` calls it right after `layout.setAirport`): drops LAND (`landing`, `_landPrev` — `cancelLand()` restored the old airport's circuit and `_begin` threw "no runway end 27" at the farm/palace), `_stovlPrev`, DEMAND entry, `extendDW`, `_ignoreLand`, `_sf`, `crossClear`, `holdPos`, `tgo`, and the **old link's ATC gate** (`gate`, `__atcGate`: the new link never attached, the player asked a dead ATC for clearances). doSwap also clears an armed LAND NOW and, if the swap throws after the airport changed, re-places the player on the new runway. Palace ↔ royal goes through the same path. |
| #7 short-field landing (runways < 500 m: the 240 m Palace Lawn) | `_isShort(e)` (a real end under 500 m, or a LAND plan's virtual end on such a runway) / `_aim(e)`: aimed **30 m** in (`SHORT_AIM`, was `AIM_DIST` 130) for every approach/glide-path use; final at 1.2 Vs0 (a taildragger LAND keeps its own); the flare is the LAND flare (no float, put down by 30 % of the strip, go-around only past 65 %); on the rollout, under 1.5 × the book landing roll left, brakes 0.9 (taildragger: 0.8 tail up, 0.95 tail down, stick back 0.7–0.8). Circuit / LAND on the lawn: Moth touchdown 9–28 m, down to 9 m/s by 165–221 m; Cub 9–49 / 130–176; Bathtub 5–15 / 94–101; Throne 15–18 / 137–145 (no cartwheel in node). Take-off from a short strip: line up 10 m in (was 22), rotate at 0.9 Vr and climb out of ground effect at 0.17 rad (as off a field): without it a Moth departing the lawn was still under 0.8 m at the far end = ATC "unauth takeoff, off runway". `palace.aiTypes` = bathtub, **cub** (airport-check soak 4 arrivals, 0 infractions). The **Moth stays out**: in the ATC soak it touched down ~140 m in and drew "uninvited landing" ×3; open item. |
| #5 swap shader warm-up (js/map/index.js) | three's `compileAsync` polls every material it compiled until ready and cannot be stopped; the 3 s race returned but the poll ran on, and a material disposed later (next swap) threw "reading 'isReady'" from its timer. `warmShaders(renderer, scene, camera, { capMs, cancelled })`: `renderer.compile()` + our own poll, per-material guarded, capped (3 s) and cancelled by the next swap (`K.gen`). (main.js boot has the same 4 s race on three's compileAsync: before any dispose, so harmless today.) |
| #9 Kingdom Map (js/map/index.js) | `sameWorld(a, b)` (`def.world`): a trip between airports in one world (royal ↔ palace) flies straight at the destination's centre and hands over at 1.5 km (`TRAVEL.nearM`): no clouds, no teleport, the new tower's arrival route from where the plane is (mode `near`). The card says "(vertical landing)" when `canUse().vertical`. `JET_CHANCE.palace = 0`. |
| #8 STOVL DEMAND TAKEOFF | `demandTakeoff()` with no runway that fits returns `verticalTakeoff({ flyOn: true, end })` → `{ vto: true }` for a STOVL type (the F-35 on the lawn said NO RUNWAY OPEN). The throne fits the lawn by length and rolls. |

Tests: `node tools/flight-sim.mjs fix4` (7): #1/#2 recovery→replan leg switch (red: the exact two TypeErrors), #2 swap
state (red: "no runway end 27", old gate kept), #9 royal → palace trip handover (js/map/index.js, DOM stubbed), #5 swap
shader warm-up (`FIX4_WARM=three` runs three's own poll: red with "reading 'isReady'"), #8 STOVL demand at the lawn, #7
short-field circuit + LAND × 4 types × 2 ends (red with `_isShort` off: Moth goes round twice, Cub touches down at 252 m).

### FLIGHTFIX5 (manager's combined verify, 2026-10-31)
| item | root cause → fix |
|---|---|
| #1 loop jumbo-hard "DEMAND TAKEOFF: airborne again: not within 300 s" (jumbo at 0 kt on taxiway A, phase TAXI) | A ground **standoff**, not load: a jumbo DEMAND turning out of its heavy spot (S4) towards 09 met a C172 from S1/S2 coming down taxiway A towards 27. `Traffic.groundLimit` tests "on my path" by CG within 9 m: the jumbo's CG was 16 m off A, so it was not "on" the C172's path and the C172 gave way to it at their path crossing, while the jumbo stopped head-on for the C172 (on *its* path). Both at 0 kt for good. Now (traffic.js `opposedEntry`): two planes whose paths run the **opposite way along a shared stretch** — the corridor's width grows with the two spans — leave it to whoever reaches it first; the other stops body-clear short of it (`entry − length/2 − 5`). (A "don't yield to one yielding to you" breaker was tried first: it turned the standoff into a bump, because the jumbo was already across A.) |
| #2 roster throne-hard "field: LAND: ditched in the water" | LAND's field scan (landahead.js `Field.dirty`) skips `surfaceAt` per cell inside 48 m blocks whose 4 corners and centre are dry; the River Krumble (WORLD C3) is 17–32 m wide and slipped between the samples, so LAND NOW's field ran across it. Reproduced live (same spot, (−1852, −176)). The world now says where narrow water is: `world.waterNear(x, z, r)` (js/world/airport.js, from `riverDist`, +30 m for its 40 m-cell interpolation); a block near it is always checked cell by cell. Real-world sweep, 300 LAND/LAND NOW plans around the river: 2 strips across water before, 0 after. |
| #3 full-matrix c172-easy "DEMAND IT: AP done and stopped 40 s on grass; greyed 'Land nearer a runway'" | Not the home band. LAND was tapped on FINAL 27 (1.66 km, 122 m), the tower ordered a go-around, LAND refused it (the touchdown zone was clear) and flew into a slower plane ahead on the same final (`near_miss` 330, then bounces: on Easy contact is a rubber bounce). It fell onto the grass ~760 m short; the LAND rollout "stays down" and went DONE there, outside the Easy zone. The player's see-and-avoid on final (`_jetTrafficAhead`) was jets-only; it now covers the player's LAND in any type (collision course ≤ 600 m, closing): a go-around for "traffic ahead". Node: C172 on LAND 150–500 m behind a 45 kt Tiger/Bathtub/Cub was a mid-air every time; now 0. |
| #4 test-hud4 "GAMEFIX DEMAND TAKEOFF taxi … finish zone": bad samples `[633,280,0.1,"ready",false]` | **Test** timing, deterministic on an idle machine: DEMAND TAKEOFF ignores taps for 0.5 s after it appears or moves (HUDPOLISH, ground.js), the test tapped ~0.1 s after it showed, the tap was ignored, and the AP's own circuit taxi crossed the zone with no DEMAND (`ap.demand` undefined, `S.demandLive` false at the bad samples). Under load the poll was slower than 0.5 s, so it passed. The test now waits 0.65 s and checks the tap took. The pt3 "skip after DEMAND TAKEOFF keeps the demand" check had the same quick tap (`demandEnd` null, `rwHdg` null) and gets the same wait. Not landbutton.js or `airportChanged`. |
| #5 test-tasks crashed on startup | Its default `--url` is `:8889` (not running); Chrome's error page denied `localStorage` (SecurityError at `fresh`). Default is now `:8888` like test-loop, with a preflight that says "game not served at …". |
| #6 tower-audio farm / palace / airbase | Green 5/5, 6/6, 5/5 on a fresh `--autoplay-policy=no-user-gesture-required` Chrome. No change. |

Seen while reproducing #1 (not fixed, not a deadlock): a jumbo's *field* DEMAND TAKEOFF after landing long on 09 needs a 143° turn off the runway at ~1 kt (≈70 s sim), a taxi to A4, a queue behind an AI held at the hold for an arrival (≈85 s), then its "RUNWAY BUSY" wait while that AI lines up and rolls: once it ran past the loop's 300 s `fieldAirborne`. `demandTakeoff`'s `busy()` only looks at the entries when the DEMAND is made. Also open: a LAND rollout has no ground-traffic awareness (node: C172 on LAND 800 m behind a landing Bathtub bumped it on the runway; pre-existing).

Tests: `node tools/flight-sim.mjs fix5` (2): #3 player LAND behind slower traffic (red with the jets-only filter: 8 of 9 mid-airs), #1 jumbo DEMAND from S4 vs a C172 down A, 12 runs (red on the old traffic.js: 3 standoffs). `landahead.test.mjs` 40 (+1: an 18 m river exactly between the dry-block samples; red without `waterNear`: LAND NOW strips across it). test-hud4 gamefix 19 (+1 "the tap took").

### FLIGHTFIX6 (manager's verify, test-loop 67/72, 2026-10-31)
| item | root cause → fix |
|---|---|
| A f35-medium "DEMAND TAKEOFF: world froze, player static in the air" | **The instrument.** The F-35 was doing a perfectly good VTO, 0.2 m up 3.5 s after the tap. The FREEZE check compared "now" with the oldest sample in its window, and an 18 s sample gap (the previous step's failure screenshot) left that sample on the grass: 0.2 m of climb < 0.3 m → "static in the air". `tools/loop/freeze.mjs` (`freezeCheck`, used by test-loop's `watch()`): frozen = the player's own physics clock (`ac.time`, new in SNAP as `act`) stood still while the sim ran, or airborne **in every sample** of the window and within 0.3 m of all of them; never a wreck, never a jet-borne hover (`vtol`). `--falsify=freeze` still caught ("physics clock stopped"). |
| B tiger-medium "field: LAND: world froze" | Also not a freeze: the Tiger had **crashed** (DESTROYED after a Medium bounce chain) and the wreck hung 2.4 m up, because a crashed `Aircraft.step` returned without moving it. (1) `_wreckFall`: a wreck drops to its rest height and stays. (2) The crash: LAND NOW from the climb-out met its field fast (66 kt, Vapp 55, ~430 m left), tail up = no brakes, and rolled on into the River Krumble's bank at x ≈ −1930 (both tiger reds were there; reproduced live in the real world, then in node). A LAND rollout that will not stop inside its strip at this rate now brakes to the length left (`need` = v²/2(toEnd − 25) > 0.8 m/s²: nosewheel 0.5–1, tail-down 0.9, tail-up heel brakes 0.25–0.5 with the stick back against a nose-over). Real-world in-page sweep: 192 LAND/LAND NOW from climb-outs (6 types × 4 ends × 4 heights × 2), 1 river overrun before, 0 after. |
| C jumbo-hard "bumped into K-HECT" (and a solo f35 rerun: "bumped into K-PLUM") | The player's LAND ran into a plane that had just landed ahead: it refused the tower's go-around (touchdown zone clear: the other plane was still flaring / rolling away) and had no look down the strip after touchdown. `_stripAhead(e, p)`: the nearest plane on the strip ahead (on the ground or < 12 m, not a departure on its roll). Rollout: closing on it inside its stopping distance → full brakes (reversers on a jet). Final/flare (LAND, not yet down): `_rolloutBlocked` — its stop point (braking 1.5 m/s²), held ~15 s while it turns off, inside our touchdown + 1.3 × book landing roll when we get there → go-around 'runway occupied'. The land-long point (FLIGHTFIX3) now uses where planes ahead **will stop**, not where they are (a jumbo aimed past a Herc at s 187 that then stopped at s 580). A LAND go-around for traffic ahead / an occupied runway never rejoins the same final at once (`replan({ noLand })` → `_landReplan(noLand)`): the jets' LAND circuit went round, rejoined final the next frame, went round again — 12,000 go-around events in one approach — and flew on into the plane ahead. Node: 80 approaches (C172/Tiger/Jumbo/F-35 behind C172/Tiger/Bathtub/Herc at 250–2000 m): 6 contacts before, 0 after. |
| D f35-medium "DEMAND IT: AP done on grass" | The LAND went round for an occupied runway and landed long with 633 m left (land-long needed ≥ 450 m for anyone); the F-35's book landing roll is 700 m: off the end of 27 at x −805, onto the grass, DONE there. Land long only with ≥ max(450, book roll + 100) m left (jumbo/F-35 still land long past a plane parked 180 m in: 1000 m left). |
| E cub/bathtub-hard "field touchdown not within 240 s" | Go-arounds for "traffic ahead" (FLIGHTFIX5's player see-and-avoid) for planes that were not on our final: "within 150 m of the final's line now, ≤ 90 m up or down, closing" caught traffic crossing 04's final. `_cpaConflict(b)`: the 3-D closest approach in the next 20 s within 60 m + the spans and 30 m vertically. (The cub was 8.8 m up on final when its 240 s ran out; the bathtub went round twice.) FIX5 #3 (C172 behind slower traffic on the same final) still green. |
| atc-sim jetland (seen while verifying) | A ground deadlock: a Bathtub stopped on the jumbo's taxi line gave way to the jumbo at a crossing further on, while the jumbo held behind the Bathtub. `Traffic.groundLimit`: a plane sitting on another's path just ahead of it (≤ 220 m) never also gives way to it at a crossing / opposed stretch. |

Tests: `node tools/flight-sim.mjs fix6` (7): #C LAND behind landing traffic × 80 (red: 6 contacts) and no go-around loop (red: 328–787 go-arounds per approach), #D land-long with a plane parked 250/400/550 m in (red: F-35 stopped off the runway at x −755/−852), light types still land long, #E crossing traffic 50 m above/below vs at our height (red: went round for all six clear crossings), #B fast field arrival before a river (red: Tiger ditched ×2), #B wreck falls (red: hangs at 5 m). `node tools/loop/freeze-test.mjs` (8, recorded sample shapes; red with the old detector: 4 false freezes). atc-sim jetland is the deadlock's gate (red without the traffic.js breaker: 2 jumbo standoffs). test-loop `--log=N` keeps N game-log lines with a failing step.

### Jets (JETCORE, D33, 2026-10-27): `jumbo`, `herc`, `f35`
Roster: `data/aircraft.js` (`flight` blocks; geometry from JETMODELS-A/B, docs/PLANES.md "Jets geometry").
`TYPES.jumbo/herc/f35` are the blocks as-is; `isJet(type)`, `JET_TYPES`, `thrustFactor(P, V)`, `stallSpeed(P, flaps)` are
exported from `js/flight/aircraft.js`. Light types are untouched (every new field is optional).

| | Royal Jumbo (747-ish) | The Royal Wardrobe (C-130-ish) | Royal Tantrum (F-35B-ish, CTOL) |
|---|---|---|---|
| engine kind | `turbofan` ×4, spool 0→100 % ≈ 5 s | `turboprop` ×4, ≈ 1.8 s | `fighter`, ≈ 2.3 s, afterburner > 95 % throttle |
| mass / wing | 230 t / 525 m² | 42 t / 162 m² | 16.5 t / 42.7 m² |
| Vs0 / Vs1 / Vr / Vapp | 113 / 137 / 150 / 138 kt | 82 / 101 / 100 / 108 kt | 110 / 126 / 145 / 140 kt |
| AP takeoff roll (book) | 1142 m @ 155 kt of 1400 (1250) — "barely" | 514 m @ 105 kt (560) | 311 m @ 154 kt in AB (330) |
| circuit (scale / alt / downwind / final) | ×2.3 / 450 m / 2.6 km / 4.1 km | ×1.3 / 350 m / 1.5 km / 2.3 km | ×1.6 / 450 m / 1.8 km / 2.9 km |
| AP circuit touchdown | ~60 fpm, 225 m in, slowed to 9 m/s 950 m in | ~135 fpm, 180 m in, 580 m | ~265 fpm, 205 m in, 900 m |
| LAND from 6 km / downwind / 4 km out | 191 / 142 / 175 s | 190 / 121 / 170 s | 184 / 145 / 171 s |
| stand | **heavy spot** (two stands, see below) | ordinary stand (hook clears the terminal) | ordinary stand |
| wake | `super` | `heavy` | `medium` |

**Flight model additions** (`Aircraft`, all opt-in by field):
- `engineKind` + `thrustLapse`: jets hold thrust with speed (`thrustFactor`: `1 − lapse·V/thrustV0`, ≥ 0.05; props keep
  `1 − V/thrustV0`). `spool` (1/s): `eng` follows the throttle slowly from idle (rate × (0.35 + 0.65·eng)), 1.5× faster down.
- `abThrust` / `abFrom`: afterburner state `ac.ab` 0..1 (lights in ~0.3 s above `abFrom` with `eng` > 0.9, out in 0.2 s),
  adds `abThrust`·tf; fuel `burnLph[2]` per hour on top. `burnLph: [idle, full(, ab)]` replaces the hp-scaled burn.
- `reverse`: reversers deploy (`ac.rev`, ~1 s) on the ground, mains down, throttle < 0.08, brake > 0.25, rolling: the
  brake button reverses for the player too. `spoilers`: lift dump (`ac.spoil`, CL × 0.25, +0.08 CD) on the rollout at idle.
  `speedbrake`: auto in the air at idle throttle (+CD). `vWall`/`CDwall`: a drag wall (≈ 500 kt jumbo, 590 kt F-35 in AB).
- `aoaLimit` / `bankLimit` (F-35): fly-by-wire — the pitch command never takes alpha past 19.5°, and full stick holds 75° of
  bank instead of rolling inverted (the loop suite's 3–10 s stick hold rolled it into the ground on Hard). Twitchy (150°/s
  roll) but it won't stall or roll over.
- `flapRate` (jumbo 0.15/s), `gear.mainY/noseY`, geometric nose-load split for jets, engine/prop/tailplane hardPoints
  (`left outboard engine hit the ground` …). Jets ignore a rig's `dims` (a missing model falls back to a C172 rig).
- `place()` in the air: a jet is never placed below 1.1 Vapp (main's 78 kt field hop would stall it) and gets takeoff flap.

**Engine state for AUDIO / FX** (`ac.engineState()`; also `instruments().n1/ab/reverse/engineKind`):
`{ kind, spool (eng 0..1), n1 (0..1: N1 for turbofan/fighter, power for the turboprop, idle 0.22/0.30/0.30),
rpm (turbofan/fighter = N1 %, turboprop = prop rpm 735–1020), ab (0..1), afterburner (bool), reverse (0..1),
spoilers, speedbrake, thrust (N, negative in reverse), thrustFrac (of max dry), engineOut }`. JETSOUND takes `ac.n1 × 100`
and `ac.ab` (docs/AUDIO.md). In reverse `n1` reads ≥ 0.75 (the engines spool up).

**Autopilot** (per type, from the block): `rotPitch`, `toFlaps` (rolled and climbed with; `_minFlaps()` never lets flap
come in below 1.25 Vs of the next notch), `flareAgl` (flare starts at −vs × 3.2 s, capped), `brakeAP`, `apBankScale`
(F-35 45°), `maxPitchAP`. Climb and go-around accelerate on excess thrust, never by diving (a spooling jumbo used to dive
into the ground on a go-around). On final jets fly the glide path with the throttle only (`t.free`), flap 2/3 until
< 1.12 Vapp then full, never retracted on final. Fly-leg lookahead ≈ one turn radius; ground lookahead + 0.6 wheelbase;
speed-hold gain × spool/1.2 (no hunting). The player's short-final (B7) is off for jets.
Jets low down (< 400 m AGL) never ask for more than +3 m/s over their current speed (the path's speed-for-height trade
dived a spooling jumbo at the ground after a go-around). A jet's go-around sidesteps 300 m to the circuit side and
replans only above 220 m; its replan never rejoins legs that lie beyond a later takeoff (an arrival's appended departure).
A LAND that goes round (busy runway, not lined up) flies the type's own stretched circuit back (`_landCircuit` for jets;
the light-plane LAND circuit left a jumbo turning onto final at 50 m), landing long past a parked plane as before. Low on
final a wide jet banks ≤ 12° (≤ 5° below 12 m: the outboard pods touch at ~9°), and ≤ 4° in a go-around below 40 m.
AI see-and-avoid on final when a jet is involved (`_jetTrafficAhead`): closing on traffic ahead within 900 m / 90 m
vertical / 300 m lateral → go-around "traffic ahead" (once per 90 s). A jet past 0.35 Vr refuses `rejectTakeoff`.
`fieldTakeoff()` refuses for `noField` types (event `refused { what: 'fieldTakeoff', quip }`, returns false; main then
uses DEMAND TAKEOFF / its hop). `demandTakeoff()` default `minRun` (`ap._minRun()`) = max(600, book roll × 1.1): the jumbo
only goes from a threshold, and a takeoff leg begun lined up mid-runway with less than that left lines up at a threshold
first. An entry with someone waiting at its hold costs a jet +3000 (it cannot squeeze past: it takes the other end).

**Circuits** (`routes.circuitOpts(type)`, circuitScale > 1): downwind × k, upwind extension × k, final (`fin`) × k, base
leg out at 0.4 × the downwind offset (≈ one turn radius), approach `fafDist` = `faf` (where that turn rolls out). The FAF
altitude cap grows with it. `route.circ` keeps `up/fin/faf`. ATC tracks such a circuit on its own geometry (docs/ATC.md).

**Heavy stands** (span > 45 m: the jumbo; `routes.heavySpot(sid)`, `isHeavy(type)`): the stand hook would put a 70 m
jumbo's tail into the terminal, and its 64 m span covers three 48 m stands. A heavy claims stand k **and** k−1
(`traffic.claimStand` → `_claimHeavy`, east first) and parks on the apron in front of them, CG 40 m south of the stand row
(z −190), nose west; it leaves the inbound lane at stand k+1's node. Stands S2…S7 can take it (S1 would put the nose off the
apron; S8 has no k+1). Hard's finish zone is satisfied (on the apron, ≤ 45 m from stand k−1). `taxiIn({stand})`, ATC's
`setTaxiRoute` and AI `aiSpawn('parked')` all go through it. The Herc (40 m) and F-35 use ordinary stands.

**Wake turbulence** (`Traffic._wake`, 20 Hz, `WAKE` in traffic.js): a `super`/`heavy`/`medium` source drops a vortex
point every 0.5 s while airborne (life 70/50/30 s, sinking 0.6 m/s). A plane under half the source's mass within the core
radius (45/32/18 m) and −30…+30 m of it is rolled (up to 7 / 4 / 1.8 rad/s² at the core, fading with age and distance; the side of
the trail picks the direction) and pushed down. Event `wake { from, strength, cls }` on the victim (≤ 1 per 6 s). Arcade:
a C172 0.8 km behind a jumbo on final gets ~35° of bank and lands (1.6 km behind: ~15°; 2.6 km: the vortices have sunk away).

**Contacts**: light pairs keep ±2.6 m; with a jet the airframes' real height bands (wheels to fin top) must overlap: a
jumbo (CG 4.8 m up) cannot drive through a C172, and one climbing out 10 m over a plane lined up at the far threshold no
longer "collides" with it (integration's jumbo-hard "bumped into K-BUNT").
**A jet's DEMAND TAKEOFF waits at the hold line** (nose behind it, measured square off the centreline) while someone is
on the runway pavement ahead of its entry (or within 80 m behind it); its nose used to creep onto the runway, ATC then
held the lined-up plane for ever. After 40 s it goes past a stationary one sitting beyond its lift-off point
(roll + 100 m). Phase `HOLD SHORT · RUNWAY BUSY`. Test: atc-sim `jetland` (18 starts: LAND in the climb-out amid light
traffic under ATC, Realistic, then taxi in and DEMAND TAKEOFF with a rival at the hold) — 4 jumbo collisions on HEAD
7ab895e6's autopilot. Taxi spacing behind traffic is
measured nose to tail for long types.

**World boundary** (`routes.BOUNDARY`, `Traffic._boundary`, player only): terrain exists to ±14 km (`world/terrain.js`
EXTENT; hills to ~400 m beyond 7 km); a jet in afterburner covers 10 km in 35 s. Predicted position = now + 15 s of
outward speed + one turn radius. Past `warn` (8.5 km) → AP event `boundary { stage: 'warn', dist, quip }` (re-armed back
inside 7.5 km). Past `turn` (10 km) while heading out → `stage: 'turnback'` (quip at most every 30 s): the player's stick,
rudder and throttle are ignored ("the royal escort has the stick"), the AP resumes and `ap.homing` turns it for home at
its best bank. Released (`stage: 'clear'`) once inside 7.5 km or pointing home with wings level. Tests: max 12.8 km
(jumbo at 260 kt, full power, stick held), 9.6 km (herc), 9.4 km (F-35). **main.js needs to show the quips** (one line,
see the report): `for (const ev of P.ap.events) if (ev.type === 'boundary' && ev.quip) hud.flash(ev.quip, 'warn', 4)`.

**Cameras**: `chaseScale(ac)` = max(length, 0.8·span) / 9.5 (1 for the light types, ~7.4 jumbo, 1.6 F-35): chase distance,
height and look-ahead scale with it, + up to 25 m with speed above 70 m/s; the chase FOV widens up to 12° at jet speeds.

**AI**: `createAttract` draws a jet now and then (`AI_JETS`: 7 % of spawns, one at a time, herc 2 : f35 2 : jumbo 1)
only once `PLANE_TYPES` has its model. Never as the 'holding' rival.

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
node tools/flight-sim.mjs fix6       # FLIGHTFIX6: LAND behind landing traffic, land-long length, crossing traffic, fast field arrival, wreck falls
node tools/flight-sim.mjs fix5       # FLIGHTFIX5: player LAND behind slower traffic, jumbo vs C172 head-on on taxiway A
node tools/flight-sim.mjs fix4       # FLIGHTFIX4: stale-leg step, swap state, short field, STOVL demand, map handover, warm-up
node tools/flight-sim.mjs jets       # JETCORE: jumbo/herc/f35 × circuit, LAND ×3, LAND NOW, go-around, taxi-in + DEMAND
                                     # TAKEOFF, fieldTakeoff refusal, hand-flown upset, world edge; F-35 afterburner; wake (--only=f35)
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
