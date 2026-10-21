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
| `trim.js` | interior atlas canvas (door/sidewall upholstery, map pocket, seams, AO; perforated headliner; pleated seat leather; carpet). uv [0,0] = white patch |
| `pilot.js` | royal pilot (+ corgi passenger at high): ONE dynamic mesh, parts re-posed on the CPU (head look, 2-bone arm IK to the yoke grips) |

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

## Round 2 (2026-10-21)
- **Pilot**: left seat, seated eye = `EYE` (the cockpit camera *is* the pilot's head). Navy tunic, red sash, gold
  epaulettes, white silk scarf, cream jodhpurs + riding boots, tan gauntlets, green David-Clark-style headset with boom mic,
  gold-rimmed aviators, and a small jewelled crown worn jauntily over the headset. `gender:'m'` = handlebar moustache,
  `'f'` = fuller hair + chignon + lipstick. Head looks into turns (rudder/aileron) with slow idle glances. Both gloved hands
  are on the left yoke horns and follow it (IK arms; the forearm stretches ≤ ~8 % at full forward yoke).
  `opts.pilot = { gender:'m'|'f', skin:'light'|'fair'|'tan'|'brown'|'dark'|'#hex', hair:'#hex', passenger:true }`,
  `opts.pilot = false` → no pilot. `setPilot({...})` rebuilds (≈2 ms), `pilot()` returns the config.
  Cockpit view hides torso + head (legs, arms and gloves stay — you see your own hands and knees); center view shows all.
- **Passenger** (high only): a royal corgi with goggles pushed up, sitting on two velvet cushions with gold tassels so it
  can see out; head wanders and leans into turns. `passenger:false` removes it.
- Front seats moved forward to station 2.55 (real C172 pilot position for this eye point; the arms reach the yoke).
- **Prop disc**: new polar shimmer texture — ~4–9 % haze, two soft blade bands drifting slowly (stroboscopic beat),
  faint radial banding, tip stripes at ~2–4 %. Same in all views.
- **Cockpit interior**: textured atlas on the interior material (no extra calls): door + rear sidewall fabric inserts with
  pleats and stitching, map pocket (with a chart in it) + 3D flap, moulded armrests, door handle (escutcheon + lever),
  window latch, door shut line + seams + screws, kick-panel vent, baked AO (floor, firewall, window reveals, under armrests),
  perforated headliner with transverse bows, overhead console (dome light, 2 eyeball vents, speaker), wing-root fresh-air
  vents, carpet, pleated caramel leather seats, seat rails. The A-pillar is now one moulded post with a black windscreen
  seal (door-window front edge moved 1.5 cm forward in `WINDOWS.door`, shared with the livery holes).
- **Flaps**: Fowler-ish track motion — 0→30° rotation plus up to 12 cm aft (mostly in the first 2/3 of travel) and 3 cm down.
- **Night**: `setLightLevel(k)` now also drives the panel backlight (smoothstep 0.45→0.9): labels/scales/displays of the
  panel art glow (mask built lazily on first use, ~10 ms once) and gauge self-illumination rises. `setPanelLight(v|null)`
  forces it (null = follow light level); `opts.panelLight` same at creation.
- **Center view (D11)**: `setView('center')`, `eyeCenter` (Vector3 root-local, x = 0, same height/station as `eye`),
  `eyeCenterPitch` (= eyePitch). Nothing pokes up between the seats; both yokes visible either side.
- **Low quality now has real window holes** whenever `cockpit !== false` (so the pilot is visible in chase at low too).
  `cockpit:false` rigs (attract/AI traffic) now get painted dark glass at both qualities instead of see-through empty cabins.
- In chase view the gauges, throttle and pedals are hidden (unseeable; saves 4 calls).

## Budgets (measured r2, whole rig incl. pilot/corgi, headless Chrome + ANGLE Metal)
| quality / view | draw calls (no culling) | rendered calls (default camera) | triangles |
|---|---|---|---|
| high, chase | 19 | 20* | 66.1k |
| high, cockpit / center | 23 | 16 | 66.6k |
| low, chase | 18 | 19* | 34.8k |
| low, cockpit / center | 22 | 15 | 35.4k |

*renderer.info counts include the prop/disc pair. Pilot = 1 call (7.4k tris high incl. corgi, 1.7k low); shadow pass +1.
Pilot CPU: re-poses ~1–2.5k vertices per frame (head, arms, gloves, corgi head) — well under 0.1 ms.
Textures added: interior atlas 1024² (high) / 512² (low), panel glow mask (only once night is used).

## Round 3 (ART3, playtest 1 item 10)
- **Glareshield**: no longer a black slab. Padded vinyl coaming, crowned across the width with the trailing edge bowed aft,
  rolled lip with a stitched seam, grain + worn lip + defroster slots in the interior atlas; dark brown-grey vinyl that reads as a shape, not a black hole.
- **Centre-view "black disc"**: it was the wet compass seen edge-on. Now a proper compass on a bracket, tilted toward the
  pilots so the card reads. In portrait (without `viewEye`) it peeks in at the top edge; with `viewEye` it sits in the
  windscreen as on the real aircraft.
- **Cabin bounce light**: the hemisphere/ground bounce keeps its brightness but loses most of its tint inside the cabin
  (the grass-green bounce no longer paints the headliner green).
- **Corgi** moved to the rear bench, right side: a look to the right from the front seats shows the door and the wing
  strut, not a dog (`p1_cockpit_right_1280x800`).
- **Portrait framing (for GAMEPLAY, who owns `cameras.js`)** — additive rig fields, nothing changes until cameras.js uses them:
  - `rig.viewEye(view, aspect, out?) → { eye: Vector3 (root-local), pitch: rad, fov: deg | null }` for `'cockpit'`/`'center'`.
    `aspect ≥ 1` returns the stock `eye`/`eyeCenter` + pitch and `fov: null` (keep your own fov). Below 1 it blends
    (full at aspect ≤ 0.55) toward a seat-back eye: centre slides 0.26 m aft and 0.09 m up, cockpit 0.30 m aft,
    0.05 m up, 0.05 m inboard; fov eases 80° → 92° (vertical), pitch → −0.12 rad. Result at 390×844: the whole panel
    fits, ASI and the right-hand gauges included (`after_center_390x844_viewEye`, `after_cockpit_390x844_viewEye`).
  - Raw constants if you'd rather blend yourself: `eyePortraitOffset`, `eyePortraitOffsetCockpit` (Vector3),
    `eyePortraitFov` (deg), `eyePortraitPitch` (rad).
  - Suggested wiring, every frame or on resize: `const v = rig.viewEye(view, cam.aspect); eye.copy(v.eye); pitch = v.pitch;
    if (v.fov) cam.fov = v.fov;` (that is what `after.mjs` simulates for the `_viewEye` shots).
- **Distance LOD** (`THREE.LOD` named `plane-lod` inside `root`): level 0 = the full rig (`plane-near`), level 1
  (`plane-far`, from `lodDistance`, default 150 m low / 260 m high) = static airframe at ~half the low tessellation,
  level 2 (`plane-far2`, from `lodDistance2`, default 3.5 × lodDistance) = ~a third, no small parts (steps, nose-gear
  links, cowl inlet/exhaust, antennas, pitot, landing-light lenses, hub caps). Far levels share materials and the livery
  texture; control surfaces are neutral, the prop shows a disc above ~1100 rpm. `opts.lodDistance` / `opts.lodDistance2`
  override. The camera inside the cockpit is always level 0. Renderer auto-updates `THREE.LOD` (`autoUpdate` true).
- **Low-tier shadow proxy** (`opts.shadowProxy`, default on at low): the near rig's meshes are pinned out of the shadow
  pass (castShadow is a no-op getter, so callers that set castShadow on every mesh can't re-add them) and one merged
  position-only copy of the level-2 airframe (`plane-shadow`) casts instead. It is skipped in the colour pass (empty draw
  range in `onBeforeRender`), so it costs one shadow-pass call and ~2.6k tris. Pilot + cockpit never cast at low.

### Budgets (round 3, triangles per rig, excluding shadow pass)
| level | low | high |
|---|---|---|
| near: exterior | 14.1k | 37.1k |
| near: cockpit + pilot (+corgi high) | 13.5k | 29.7k |
| far (`plane-far`) | 5.0k | 5.0k |
| far2 (`plane-far2`) | 2.9k | 2.9k |
| shadow pass at low | 2.6k (1 call) | full rig |
An AI plane at 150–525 m now costs 5k tris instead of ~14k (low) / ~37k (high); beyond 525 m (low) / 910 m (high), 2.9k.

## Known gaps / ideas
- Ailerons have no Frise nose gap; the flap slot shows the wing's blunt rear spar face (no cove/shroud lip).
- Yokes sit out of the default forward view in landscape (they are visible looking down, and in portrait with a tall FOV).
- Night: panel backlight only — no red flood/dome light pool, GPS screen background does not glow.
- No damage/deformation states, no doors that open, no landing-light beam (FLIGHT/AIRPORT can add a SpotLight at
  the left-wing leading edge lens, build frame x −1.65, y ≈ 2.07, station ≈ 2.27).
- `cockpit:false` rigs have painted windows at both qualities (no cabin behind them).
- Rear seats empty (butler idea skipped); pilot has no seat belt/harness; feet don't follow pedal travel (±4.5 cm).
- r2 screenshots: `r2_chase34_pilot_1280/390`, `r2_chase34_low_1280`, `r2_pilot_m_close`, `r2_pilot_f_close`, `r2_pilot_corgi`,
  `r2_cockpit_1280/390x844/844x390`, `r2_cockpit_door_1280`, `r2_cockpit_right_1280`, `r2_cockpit_up_1280`,
  `r2_cockpit_low_390x844`, `r2_center_1280/390x844/844x390`, `r2_flaps_down_1280`, `r2_night_center_1280`.
  Cockpit FOVs used: 69° (1280×800), 80° (390×844), 55° (844×390, FLIGHT's fitFov clamp).
