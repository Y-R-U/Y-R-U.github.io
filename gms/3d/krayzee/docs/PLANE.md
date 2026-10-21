# PLANE lane — Cessna 172 rig

Procedural C172 (exterior + full cockpit), no external assets. Test page: `tools/plane.html`
(orbit, livery pickers/text, chase/cockpit toggle, quality toggle, control + instrument sliders, Animate).

## Files (`js/plane/`)
| file | what |
|---|---|
| `index.js` | `createPlane()` → PlaneRig (contract API + extras below) |
| `spec.js` | all C172 dimensions: fuselage loft sections, wing/tail planform, gear, window outlines, eye, panel |
| `geom.js` | `Builder` (loft/sweep/merge into one BufferGeometry), NACA airfoils, monotone interpolation |
| `exterior.js` | lofted fuselage, wing panels + hinged flaps/ailerons, tail + hinged elevator/rudder, struts, gear + pants, cowl detail, antennas, lights, prop/spinner/disc |
| `cockpit.js` | linings with real window holes, headliner, floor, panel (static canvas), glareshield, seats, yokes, throttle, pedals, compass, visors |
| `instruments.js` | 8 live gauges drawn into one canvas atlas (ASI, AI, ALT, TC, DG, VSI, TACH, FUEL) |
| `livery.js` | one paint atlas canvas: fuselage L/R, fin L/R, wing top/bottom, colour swatches; text layout |
| `materials.js` | PBR materials, glow + prop-disc textures |

Build frame inside the rig: y = height above ground, z = station aft of the spinner tip; an inner group offsets it so the
root origin is the CG (station 2.45 m, 1.2 m above ground). Forward = -Z, up = +Y, right = +X as per contract.
Real proportions: length 8.28, span 11.0, height 2.72 (fin top), track 2.54, prop Ø1.9.

## API notes
- `createPlane({ quality, livery, cockpit, view, lightLevel })` — async, resolves immediately (no loading).
- `dims.gearHeight = 1.2` → put `root.position.y = groundY + 1.2` when sitting on the wheels.
- `setControls` sign conventions: `aileron +1` = roll right (right aileron up), `elevator +1` = pull / nose up
  (elevator TE up, yoke comes back), `rudder +1` = yaw right (rudder TE right, right pedal forward).
  `throttle` moves the throttle knob and, when no `rpm` has been passed to `updateInstruments`, drives prop speed.
  Surfaces ease (~14/s), flaps travel slowly like the real electric flaps (0→30° in ~3 s).
- `updateInstruments(s)` — values are eased per gauge (VSI lags like the real one); the canvas is redrawn at ≤20 Hz and only
  when something visibly changed. Turn coordinator rate comes from heading change; `slip` −1..1 moves the ball.
  Optional extras: `fuelL`, `fuelR` (0..1).
- `rpm` from `updateInstruments` spins the prop; blades fade into a subtle disc (with tip-stripe ring) above ~1100 rpm.
- `setView('cockpit')`: interior visible. The exterior shell is single-sided, so from the eye it is invisible and the
  real outside parts (cowl, wing root, struts, wheels) are seen through the windows — nothing needs hiding.
  `setView('chase')`: high = interior stays visible through the (real, alpha-cut) window holes; low = interior hidden,
  windows are painted glossy dark glass instead of holes.
- Extras (additive): `eyePitch` (rad, −0.09 ≈ −5°: recommended camera pitch for "panel fills lower third"),
  `setLightLevel(0..1)` (nav/strobe/beacon glow size: 0 day … 1 night), `quality`, `view`, `livery()`.
- Beacon (fin top, red) double-flashes ~1 Hz, strobes on wingtips; nav lights red left / green right / white tail.
- `dispose()` frees geometry, materials, canvases' textures and detaches the root.

### Livery
`company || name` (1–14 chars) is painted on both cowl/cabin sides and both sides of the fin (fin splits on a space into two
lines when that reads bigger); `registration` on the aft fuselage both sides, on top of the right wing and under the left
wing (ICAO-style, top of letters toward the leading edge). All text is laid out in metres and auto-fits, never mirrored.
Scheme: primary = base (fuselage, wings, tail surfaces, pants, struts), secondary = cheat line + fin + wingtips,
accent = pinstripes + text outline + spinner. Text colours are picked automatically for contrast.
`setLivery` only redraws the canvas (CPU < 1 ms measured; the GPU upload of the 2048² (high) / 1024² (low) atlas happens on the
next frame) — safe to call from a colour picker `input` event; consider throttling to ~10 Hz on mobile.

## Budgets (measured, whole rig, headless Chrome + ANGLE Metal)
| quality / view | draw calls | triangles |
|---|---|---|
| high, chase (interior visible through windows) | 23 | 57.8k |
| high, cockpit | 23 (15 after frustum culling) | 57.8k |
| low, chase (interior hidden) | 13 | 13.1k |
| low, cockpit | 22 (14 after frustum culling) | 30.9k |

Counts are mesh/points objects visible (upper bound, no culling); blades and disc are never both drawn, so real is −1.
Shadow pass adds one call per shadow-casting mesh. Textures: paint atlas 2048² / 1024², panel 2048×1024 / 1024×512,
gauges 1024×512 / 512×256 (only this one updates, ≤20 Hz).

## Screenshots (`docs/shots/plane/`)
plane_34_1280, plane_34_390, plane_front34_1280, plane_side_1280/390, plane_tail_1280/390, plane_top_1280/390,
plane_cockpit_1280/390/844x390, plane_cockpit_down_1280 (yokes/throttle/pedals), plane_cockpit_left_1280 (strut + wing from the seat),
plane_low_34_1280, plane_low_cockpit_390, plane_livery_red_1280, plane_livery_green_side (1-char name), plane_controls_1280,
plane_tool_ui_1280/390.

## Known gaps / ideas
- No pilot figure in the seats (chase view at high shows empty seats through the windows).
- Flaps rotate about a fixed hinge (real C172 flaps also slide aft); ailerons have no Frise nose gap.
- Yokes sit out of the default forward view in landscape (they are visible looking down, and in portrait with a tall FOV).
- Cockpit is daylight-only: no panel/flood lighting for night yet (gauges have a mild self-illumination).
- No damage/deformation states, no doors that open, no landing-light beam (FLIGHT/AIRPORT can add a SpotLight at
  the left-wing leading edge lens, build frame x −1.65, y ≈ 2.07, station ≈ 2.27).
- Low-quality windows are painted, so the chase camera cannot see inside at low (by design for the budget).
