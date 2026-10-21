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
node tools/flight-sim.mjs            # node, ~10 s: circuit, override, cut-in on 27, stall recovery, 3-plane traffic
~/.claude/bin/cdp start --port 9431 -- --use-angle=metal
node tools/test-flight.mjs           # boot/attract, layout (390×844, 844×390 touch, 1280×800), pitch sign (real touch drag
                                     # + ArrowDown), circuit, override — real time ~12 min; add --timescale=4 for ~4 min
node tools/test-flight.mjs --only=layout,pitch
node tools/atc-sim.mjs --only=flight # ATC lane's smoke with the real Aircraft/Autopilot
~/.claude/bin/cdp stop 9431
```
Screenshots land in `docs/shots/flight/`.
