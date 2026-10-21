# FLIGHT lane

Owns `index.html`, `js/main.js`, `js/core/**`, `js/flight/**`, `css/game.css`, plus `tools/flight-sim.mjs` and
`tools/test-flight.mjs`.

## Files
| file | what |
|---|---|
| `index.html` | importmap (vendored three r180), no-zoom viewport + safe areas, classic boot watchdog (20 s / module load error → card with a cache-busting Reload) |
| `js/main.js` | boot (UI → renderer → world → attract traffic → loop), play/quit/pause, audio wiring, events → HUD, `window.__game` |
| `js/core/renderer.js` | WebGLRenderer (ACES, sRGB, PCF soft shadows), quality tiers, resize/orientation, context-lost card, fps governor, sun-shadow follow |
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

### Status for HUD / ATC
`ap.status()` → `{ engaged, overridden, phase, sub, leg, legIndex, label, route, recovering, done, target, speedKt, end }`;
`ap.events` (`phase`, `override`, `replan`, `goaround`, `recovery`, `landed`, `takeoffroll`, `waypoint`) — drained by main
for the player; ATC can drain them for AI. `traffic.modeOf(entry)` → AUTOPILOT / MANUAL / RESUMING; `entry.axis[k].mode`.

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
Touch (portrait + landscape): floating stick on the "stick hand" side (settings `hand`, default right), throttle slider +
FLAPS / BRAKE / ◀RUD / RUD▶ on the other. Lift a finger → that axis is released. Drag on empty screen = look around
(snaps back). Top: pause/settings (left), view toggle + fullscreen (right, offset by `--br8t-account-space`; fullscreen
hidden where unsupported, e.g. iPhone). Keyboard: arrows/WASD pitch+roll, Q/E rudder, Shift/Ctrl (or =/−) throttle,
F flaps, B brake, C/V view, P/Esc pause. Gamepad: left stick, LB/RB rudder, RT/LT throttle, A brake, X flaps, Y view,
Start pause. Default pitch: push up = nose up; `invertPitch` flips.

## Quality
`low` (DPR 1.25, no MSAA, 1024 shadow box 45 m), `medium` (1.75, MSAA, 2048), `high` (2, MSAA, 2048 / 90 m).
Settings `high` on a phone maps to medium; no setting → medium on mobile, high on desktop, with an fps governor that
drops a tier after ~4 s under 45 fps. `?lite=1` forces low; `?quality=` forces a tier.

## URL params / test hooks
`?auto=1` (player plane flies circuits forever, controls hidden), `?start=free` (skip menu), `?view=cockpit|chase`,
`?shot=1` (hide HUD/controls), `?lite=1`, `?quality=low|medium|high`, `?noaccount=1` (UI).
`window.__game`: `state()`, `setControls(c, ms)`, `release()`, `teleport({x,z,alt,heading,speedKt})`, `setView(v)`,
`start()`, `quit()`, `phase()`, `aircraft`, `log()`, `controlsRects()`, `traffic`, `renderer`.

## Tests
```
node tools/flight-sim.mjs            # node, ~10 s: circuit, override, cut-in on 27, stall recovery, 3-plane traffic
~/.claude/bin/cdp start --port 9431 -- --use-angle=metal
node tools/test-flight.mjs           # boot/attract, layout (390×844, 844×390 touch, 1280×800), circuit, override (~12 min)
node tools/test-flight.mjs --only=layout
~/.claude/bin/cdp stop 9431
```
Screenshots land in `docs/shots/flight/`.
