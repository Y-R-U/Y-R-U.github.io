# ASSIST lane: HUD markers (D12) + LAND assist (D13)

Files: `js/assist/markers.js`, `js/assist/landahead.js` (planner, three-free, runs in node; re-exports
`createLandButton`), `js/assist/landbutton.js`, `css/assist.css`, `tools/assist.html` (bench),
`js/assist/test/landahead.test.mjs` (node), `js/assist/test/fakeworld.mjs`, `js/assist/test/cdp-bench.mjs` (CDP 9481).

## 1. Wiring in `js/main.js` (FLIGHT)

```html
<link rel="stylesheet" href="css/assist.css">
```
```js
import * as layout from './world/layout.js';
import { createMarkers } from './assist/markers.js';
import { planLandAhead, createLandButton, collectTrees } from './assist/landahead.js';

// after buildWorld():
world.trees = collectTrees(world);          // once; lets LAND avoid trees (reads the 'trees'/'conifers' instanced meshes)

// after controls exist (overlay = #krz-overlay):
const markers = createMarkers({ container: overlay, camera, units: ui.getSettings().units,
  traffic: ui.getSettings().trafficMarkers !== false, getOrigin: () => S.player?.ac.pos ?? camera.position });
const land = createLandButton({ container: overlay, stickRight: ui.getSettings().stickRight, onPress: onLandPress });
markers.setVisible(false); land.setVisible(false);          // show both in enterGameplay, hide in menus/pause
```

### Markers
Items are read by reference every `update()`: build the list when the roster changes, then just move the positions.
```js
// on spawn/despawn/target change:
markers.set([
  ...traffic.list.filter((e) => e !== S.player).map((e) => (e.marker ??= {
    id: e.id, kind: e.rival ? 'rival' : e.remote ? 'player' : 'traffic',   // 'player' = online human
    label: e.callsign /* "Earl Four-Two" */, color: e.livery?.primary, worldPos: [0, 0, 0] })),
  { id: 'target', kind: 'target', label: 'RWY 27', worldPos: [thrX, 2, thrZ] },    // objective; omit when none
]);
// every frame, AFTER the camera has moved (after renderer.render is fine):
for (const e of traffic.list) if (e.marker) { const p = e.ac.pos; e.marker.worldPos[0] = p.x; e.marker.worldPos[1] = p.y + 1.5; e.marker.worldPos[2] = p.z; }
markers.update();
// settings:
markers.setOptions({ units: s.units, traffic: s.trafficMarkers !== false });
```
- `kind`: `rival` / `player` (livery colour, label pill, emphasised) · `traffic` (small grey chevron, distance only
  within 2 km on screen, arrow only off screen) · `target` (gold diamond, "RWY 27 · 1.5 nm", bearing when off screen).
- Optional `distance` on an item overrides the computed one (metres). Labels are cut to 14 chars.
- Units: `aviation` → ft below 0.3 nm, else nm; `metric` → m / km.
- Edge arrows sit on a rectangle below `--krz-hud-top` and above the control band (portrait) or beside the side
  zones (landscape), and slide along the edge out of `.krz-r-btn`, `.krz-r-tower`, `.krz-land`, `.krz-top-l/r`
  (`setOptions({avoid:[selectors]})`). Label pills step out of those rects and out of each other.
- Behind the camera → arrow points the way to turn (directly behind = bottom edge). Works in chase/center/cockpit
  (it projects with whatever `camera` is). `setOptions({camera})` if the camera object changes.
- One canvas (`.krz-mk`, z 9 inside the overlay, `pointer-events:none`), redrawn each `update()`. No per-frame
  allocations once labels/distance buckets settle. Measured 0.07 ms JS (tight loop) / 0.14–0.30 ms in-loop for 12.
- Settings toggle for traffic markers: UI should add `settings.trafficMarkers` (default true) — not in UI yet.

### LAND button + planner
```js
const pEntry = () => traffic.list.find((e) => e.ac === S.player.ac);
function planNow() {
  const ac = S.player.ac;
  return planLandAhead({ pos: ac.pos, vel: ac.vel, heading: ac.heading, altitude: ac.alt, onGround: ac.onGround,
    world, layout, avoid: traffic.list.filter((e) => e.ac !== ac && e.ac.onGround).map((e) => [e.ac.pos.x, e.ac.pos.z, 20]) });
}
function onLandPress(state) {
  if (state === 'active') return cancelLand();                  // second tap cancels too
  const plan = planNow();
  if (plan.fail) return land.setState('unavailable', plan.hint);  // "GO LOWER" / "SLOW DOWN" / "NO FIELD AHEAD"
  S.player.ap.landAt(plan);
  land.setState('active');
  hud.flash(`LANDING · ${plan.label}`, 'info');
}
function cancelLand() { S.player.ap.cancelLand?.(); land.setState('idle'); }
// every frame while playing:
if (land.state === 'active' && traffic.modeOf(pEntry()) === 'MANUAL') cancelLand();   // any control input cancels
// availability, every 2 s while airborne and not active (≈1–7 ms warm, ≤ 50 ms the first time over new ground):
if (land.state !== 'active' && (landT -= dt) <= 0) { landT = 2; const p = planNow(); land.setState(p.fail ? 'unavailable' : 'idle', p.fail ? p.hint : ''); }
// on the ground: land.setVisible(false) (or keep it and let planNow() say 'ON THE GROUND').
// ap 'landed' event while active → land.setState('idle'); optionally restore the old route after ~3 s (see below).
land.setSide(s.stickRight);   // on settings change
```
The button sits by the stick zone (portrait: above it; landscape: just inboard of it at the bottom), because RADIO's
button now sits above BRAKE on the throttle side. z 39, so RADIO's open tray covers it. Taps stop propagation.

## 2. What the autopilot must add (`ap.landAt(plan)`) — FLIGHT / TRAFFIC

`plan.route` is an ordinary route: `fly` legs (`to:[x, alt, z]`, `speed` kt, `flaps`) then one
`{ kind:'approach', end, fafDist, label:'LAND', land:true }`, `loop:null`. `end` is the runway end id string
(`'27'`) for runways, or for fields/taxiways/apron a runway-end-shaped object
`{ id:'LAND', virtual:true, hdg, u:[ux,uz], thr:[x,z], far:[x,z], len, width, elev }` whose `thr` is 130 m
(`AIM_DIST`) before the touchdown point, so the existing approach/flare/rollout code aims at the right spot.

1. `landAt(plan)`: `this._landPrev = { route: this.route, i: this.i }; this.landing = plan; this.setRoute(plan.route);
   this._emit('replan', { to: 'land', label: plan.label });`
2. `cancelLand()`: if `_landPrev`, restore `route`/`i`, clear `landing`, `this._begin(true); this.replan();`.
3. Accept an object end: in `_begin` (approach) and `_buildFlyPath` use
   `const e = typeof leg.end === 'object' ? leg.end : runwayEnd(leg.end)` (also for `this.override?.end`).
4. Honour `leg.fafDist` in `_buildFlyPath`: `const fd = (leg.fafDist ?? FAF_DIST) + ext` (it is often 300–1300 m;
   without it the path doubles back to a 1900 m FAF behind the last fly waypoint).
5. In `_approach`, skip `traffic.landingClear(e.id …)` when `e.virtual` (it would `runwayEnd('LAND')` and throw), and
   skip the "not lined up / too high" go-arounds while `this.landing` is set only if you want it stubborn; otherwise on
   a `goaround` during `landing` main should call `planNow()` again and `landAt` the new plan, or `cancelLand()`.
6. After rollout the route ends (`done`, `_groundStop`): the plane stops. `landed` fires with `end:'LAND'` for virtual
   ends — anything calling `runwayEnd(ev.end)` (ATC/SCORE) must guard. To carry on afterwards: `cancelLand()` →
   `replan()` on the ground taxis to the old route's next ground leg.
7. Override: unchanged rules. Main cancels on MANUAL (above); if you prefer to keep the plan through a brief nudge,
   cancel only on MANUAL longer than ~0.5 s.

## 3. `planLandAhead(opts)` reference

`opts`: `pos` (`[x,y,z]` or `{x,y,z}`), `vel` (m/s; its ground track is used as the heading when > 15 m/s), `heading`,
`altitude` (m MSL, defaults to `pos.y`), `onGround`, `world` (`groundHeightAt`, `surfaceAt`, `colliders`, optional
`trees` `[[x,z,h]]` / `root`), `layout` (js/world/layout.js exports), optional `avoid` `[[x,z,r]]`, `speed`, `debug`.

Search: cone ±35° around the track, touchdown 300 m … `clamp(1500 + agl·9 + extra speed, 1800, 4000)` m.
1. **Runways** with any part in the cone; the end closest to the current heading.
2. **Taxiways** (segments ≥ 390 m, i.e. A) and the **apron** long axis — only if no runway works.
3. **Fields**: 15 rays (every 5°) + lines parallel to the track every 250 m, marched in 8 m steps with three lateral
   samples (centre, ±16 m). A run breaks on water/building (`surfaceAt`), any collider/tree cell (expanded by 6 m),
   > 0.8 m cross-slope, or grade > 1.5 % (whole run and every 48 m window, + 0.35 m bump allowance). Runs are
   trimmed 12 m at blocked ends; strips must be ≥ 350 m. The longest/closest/best aligned wins.
Each candidate's glide path (4°, 1.6 km back, ±40 m wide) must clear terrain and obstacles (the threshold may slide
up to 200 m in). Path: straight-in, join via an entry point, or downwind→base→final; too high → up to two descending
orbits (r 450 m) at ≤ 8 % gradient; more than that → `tooHigh` ("GO LOWER") / `tooFast` ("SLOW DOWN").

Returns `{ touchdown:[x,z], heading, rolloutLength, stripLength, surface, kind:'runway'|'taxiway'|'apron'|'grass',
label:'RWY 27'|'TWY A'|'APRON'|'FIELD', runway, elev, strip:{start,end,width}, approach:[{x,z,alt,agl,speed,flaps,
kind:'downwind'|'base'|'entry'|'orbit'|'faf'|'touchdown'|'rollout'}], pattern, end, route, feasibility:{orbits,
pathLength, required, excess}, distance, reason, ms }` or `{ fail:'tooHigh'|'tooFast'|'nothingAhead'|'onGround', hint }`.

Caching: obstacles are rasterised once per `world` (WeakMap); surface/height cells fill lazily (Float32 tiles).
Call `resetLandCache(world)` if colliders change at runtime. Known limit: 48 m dry-block shortcut means a water body
narrower than ~48 m could be missed (none exists today).

## 3b. FLIGHTFIX changes (PLAYTEST_2 B2)
- Ground traffic (`avoid`) no longer rules out a runway (it moves; the AP checks the touchdown zone on short final).
- Closed runways rank below open ones (only used when no open runway works).
- Straight-in accepts a sidestep (|l| < 50 + 0.22·d, ±30°) and a higher entry (`opts.sink`, m/s the type can sink on final, default 3).
- Joins/bases get a straight final of ≥ 2.6 / 3.5 turn radii, base point 1.4 r out (the old 63° cut onto a 600 m final went round "not lined up").
- Descending orbits are flown first, tangent to the current track 250 m ahead, then the planned path; `maxGrad` 0.12.
- Fly legs carry `clearance: 35` (the AP's default 120 m floor held the old orbits at ~155 m).
- `collectTrees(world)` reads AIRPORT's planted set `world.debug.trees {data, stride, count}` (the 'trees'/'conifers' meshes are gone: LAND saw no trees and landed in a wood).
- markers.js: traffic distance text steps clear of labels already drawn ("1500 ft" twice no longer overprints).

## 3c. LANDFIX2 (2026-10-23)
- **Low = straight ahead.** Below 120 m AGL (`LAND.lowAgl`) every rank is searched, straight-in plans (runway, field) beat
  any join/base/orbit (+5000), taxiway/apron straight-ins rank behind runway/field (+3000), touchdown may be 200 m out
  (`minD`), and a straight-in must be flyable: `distance > 12·lateral + 14·heading° + 100`. Too high for the near end of
  a long strip → the touchdown slides along it (200 m steps). Still nothing → a relaxed second pass (no line-up rule)
  before any circuit. Over a runway, aligned (< 25 m, < 12°): the rest of that runway ahead is a candidate.
- **LAND NOW** (Aaron): while LAND flies a non-straight pattern (`plan.pattern` not `straight` and the AP still on
  fly legs: `ap.landing.leg`), a second amber button shows directly under LAND (LAND moves up 58 px). It calls
  `onPress('now')`; `armLandNow()` makes main's next `planLandAhead()` straight-only (`opts.straight` does the same):
  straight ahead only (fields out to +1.5 km further); nothing straight (too high for any 4° straight-in ahead) → the
  normal plan with `nowFallback: true`, and the button keeps offering LAND NOW. The styles are injected by landbutton.js (`#krz-landnow-css`). LAND
  itself still toggles (second tap cancels). `land.nowShown`.
- Plans for a remaining-runway or slid touchdown use a virtual end object with the runway id (`virtual: true`).

## 3d. FLIGHTFIX3 (2026-10-23)
- **Home circuit = runway (PLAYTEST_3 #3).** `homeRunways()`: a runway within 2.3 km of the plane (downwind 0.8–1.15 km
  out, base ≤ 1.8 km past the threshold), ≥ 50 m AGL and not climbing out along its axis, is a candidate outside the
  ±35° cone, both ends. Low (< 120 m) such a runway's circuit beats a straight field (−4000 instead of +5000), and a
  straight field ranks +1200 behind a straight runway (was +300). The end whose own downwind the plane is on (its
  `layout.CIRCUIT` side, flying the reciprocal) gets −800, as does `opts.prefer` (an end id: main may pass the active
  end; not wired). Aaron's 5–15 m straight-ahead cases (flight-sim `aaron`) are unchanged (< 50 m: no home runways).
- **`takeoffRun(world, { x, z, heading, need, climb })`** → `{ heading, length, start, end, elev, turn }` or null: the
  field-takeoff scan for `ap.fieldTakeoff` (FLIGHT.md FLIGHTFIX3), same Field cache and run rules as the strip scan.
- **LAND NOW with nothing straight ahead**: a field plan (any pattern, home runways off) before the ordinary plan;
  either way the plan is marked `nowFallback` and LAND NOW is not offered again for it (it used to stay lit and do
  nothing — the loop suite's "no effect after 3 tries").
- **landbutton.js**: a LAND tap within 0.7 s of LAND going active, or of LAND moving (LAND NOW shows/hides and slides it
  58 px), is ignored — it was cancelling the plan (the finger that hit LAND NOW lands on LAND).
- For GAMEFIX: `ap.taxiIn({ stand })` / `ap.taxiingIn` (Hard taxi-in), `ap.fieldTakeoff({ world, end })` (main's
  `fieldHop` now calls it), `ap.resumeCircuit(end)`.
- Tests: landahead.test.mjs 36 (+15: circuit picks for 3 types × 4 legs, low short final, climb-out, takeoffRun runs
  clear); 13 of the new ones fail on the HEAD planner; `--falsify` still fails 5.

## 3e. JETCORE (2026-10-27): LAND for jets
- `landProfile(type)`: light types get `LAND` unchanged. Jets (`flight.jet`): **open runways long enough only** (no
  closed 04/22, no taxiway, apron or field candidates), turn radii from their own Vapp, `maxGrad` 0.075, `sink` 5.5 m/s, reach 9 km (×1.6 the light
  formula), every open runway within 12 km is a home runway (climbing away from it included: a jet's circuit is 2–3×
  wider and ATC stretches it; integration found LAND greyed on a herc's own downwind), a failure reads "NO RUNWAY IN REACH"
  (never "NO FIELD AHEAD"), `minLen` = book landing roll × 1.15 + 150 m.
- The type: `planLandAhead({ type })`, else the player's, set by `Traffic.add(player)` → `setLandAircraft(type)` (main.js
  needs no change).
- **LAND NOW** for a jet: straight onto a runway if it can; otherwise the runway's ordinary plan with `nowFallback` and
  `plan.quip` ("A field, Sire? Not in a Royal Jumbo. The runway it is."), which the LAND button shows for 6 s; nothing at
  all → `{ fail, hint: 'RUNWAY ONLY, SIRE', quip }`.
- `ap.fieldTakeoff()` refuses for jets (docs/FLIGHT.md). Tests: `node tools/flight-sim.mjs jets` (LAND ×3 per jet, LAND NOW).

## 3f. FLIGHTFIX4 (2026-10-30)
- **LAND on the home circuit picked a field** (loop c172 "LAND probe downwind", easy + hard). Two causes, both in
  `runwayCandidates` / `homeRunways`:
  - a home runway that was also *in the cone* lost its home status (`home = !hit && …`), so low (< 120 m) with the
    runway ahead but too close for a straight-in, its circuit cost +5000 and a straight field won. Home is now home in
    the cone too (the in-cone end filter and `pref` are unchanged). Real world sweep, c172, 45–150 m AGL around the
    field: field picks 1587 → 893 of 3888 (the rest < 50 m AGL or flying away, by design).
  - a downwind ATC had stretched (`extendDownwind`, up to ~4.5 km past the end) left `homeR` (2.3 km): from ~2.4 km out
    LAND chose `FIELD/straight` (seen live with a poller beside the loop). `homeRunways` also accepts the downwind band:
    0.4–2 km abeam the axis, ≤ 6 km past an end, track within 40° of the axis.
  - Not a planner bug, for the record: "downwind with LAND available never within 240 s" happened when the recovery after
    the loop's stick test rejoined at BASE (no DOWNWIND phase until the next circuit), or (before this fix) when LAND was
    greyed on that low early downwind.
- **Short runways** (WORLD's palace block kept): the touchdown aim is now `LAND.shortAim` (30 m, the AP's short-field
  aim) instead of up to 130 m, still capped so the type stops within roll × 1.25.
- **LAND NOW hysteresis** (landbutton.js): the pill is not flapping in node (fuzz: ≤ 2 changes in any 3 s); the loop's
  "covered by .krz-land-txt for 8 s" is the pill retiring when LAND reaches its final (plan.leg = 'approach') while the
  harness, under load, was still on its way to tap it: hiding slides LAND 58 px down onto the pill's spot. Now, once
  shown the pill stays ≥ `NOW_HOLD` (2.5 s) unless LAND ends or LAND NOW was tapped; once hidden it is not re-offered for
  `NOW_GAP` (1 s). A late LAND NOW tap plans straight ahead (harmless on final).
- Tests: landahead.test.mjs 39 (+3: extended downwind → runway, low near the home runway → runway, LAND NOW hysteresis
  with a stub DOM; the first two fail on the old planner, the third without the hysteresis). One old case moved: "grass
  east of the field heading east" was at (2600, 1400), which is an extended downwind of 27 (home since FIX4): now
  (2600, 2400).

## 4. Tests (2026-10-22, after WORLD r2)
```
node js/assist/test/landahead.test.mjs            # node, fake world with r2-style rolling ground + castle hill
node js/assist/test/landahead.test.mjs --falsify  # planner gets a flat world with no obstacles: checks MUST fail
~/.claude/bin/cdp start --port 9481 -- --use-angle=metal
node js/assist/test/cdp-bench.mjs                 # real buildWorld, 3 viewports × both hands × 3 views
~/.claude/bin/cdp stop 9481
```
- Node: 21/21 (FLIGHTFIX: + closed 04/22 → open runway, 200 m-north parallel with runway traffic → RWY 27) — aligned final 09/27 picks that runway; crosswise picks a runway with a base turn; 04 beats 09/27
  when it is closer to the heading; grass east of the field; built-up cone → `nothingAhead`; 1400 m over a field 1.2 km
  out → `tooHigh`/"GO LOWER"; a bit high → orbit; on ground → `onGround`; 300 random states: no strip crosses
  water/building/collider/tree or exceeds 2.5 % over 50 m (exact dense check, independent of the planner).
  `--falsify`: those checks fail (obstacle + grade violations) — exit 0 means "caught".
- CDP (real world r2): 80/80 — LAND clear of stick/throttle/pad/radio/tower and on screen in 390×844, 844×390,
  1280×800 for both stick sides; stick/throttle centres still hit the controls; edge arrows ≥ 12 px from every
  control/button and label pills clear of them in chase/center/cockpit; tapping LAND on final 27 → active, RWY 27;
  300 random plans on the real world: 295 found, 0 violations (incl. grade), avg ~6 ms, max ~45 ms; FALSIFY blind
  planner → 15 obstacle + 200 grade violations caught.
- Shots: `docs/shots/assist/markers_<w>x<h>_<view>.png`, `land_active_*`, `land_unavailable_*`,
  `planner_map_40.png` (40 random plans), `planner_map_debug.png` (one plan with scanned runs + rejects).
- Bench: `tools/assist.html?sc=final27|cross|field&view=chase|center|cockpit&hand=right&units=metric&freeze&shot=1`;
  "map" button → top-down planner view (tap/drag on the map to plan from there).

Not verified: the real autopilot flying a plan (needs the §2 changes), a real phone.
