# engine — notes (M1 "First putt")

Owner: `engine` agent. Status: **M1 playable** — title → 3 Sky Isles holes → scorecard, in portrait
and landscape, with the `sky` theme (or `?theme=greybox`).

## Built
- **Physics** (`js/engine/`, D5): own deterministic sphere-vs-world sim at a fixed 240 Hz.
  - Static triangles (built from the same sweep as the visuals) in a uniform 3D grid broadphase
    (`TriGrid`, 0.5 m cells, tris inserted padded by the ball radius → one cell lookup per step).
  - Contacts gathered, sorted deepest first, resolved one at a time with re-measurement (no seam
    bumps on coplanar triangles).
  - Rolling: rolling friction ∝ normal impulse (capped at 2.5 g so landings don't skid to a stop),
    a small speed-proportional drag, and the 5/7 slope factor of a rolling solid sphere. Static
    friction falls out of the clamp (a ball stops on gentle slopes, rolls back on steep ones).
  - **Curved floors keep speed:** while rolling (supported last step, grazing contact) the
    pre-gravity velocity is *rotated* onto the tangent plane instead of losing its normal part.
    Without this the loop's facets ate ~40% of the ball's speed.
  - Walls: restitution 0.72 + small tangential scrub. Bumpers 0.92. Windmill blades 0.55.
  - Kinematic bodies posed as a pure function of time (pivot + axis + omega + phase), box and
    vertical-cylinder shapes, surface velocity fed into the impulse (blades knock the ball).
  - Cup: the floor has a real hole (ring patch, collider material `RIM`), plus an analytic pot
    wall + bottom. On the lip the ball *pivots* (energy-preserving rotation, hop capped) so slow
    putts drop, ~2.2+ m/s arrivals skip over or lip out. Capture when the centre is below the rim.
  - Out of bounds: below `killY` → +1 stroke and back to the last rest spot (D9). Rest: supported
    and < 0.035 m/s for 0.2 s. Hard cap 10 m/s → at most 0.042 m/step < ball radius (no tunnelling).
  - Tunables in `js/engine/constants.js` (`BALL_R`, `SHOT_MAX` 6.4 m/s, `SURFACES` per material:
    grass, sand, ice, sticky, boost, bridge, wall, rim, cup, bumper, blade).
- **Course builder** (`js/course/`, D6): holes are pure data (`holes/sky*.js`). Pieces:
  `path` (centripetal Catmull-Rom through points with x/z/y/w/walls/gap/bank/surf, every value
  inheriting forward) and `loop` (radius, shift, width). Swept every 0.2 m into frames →
  floor (grass + fringe band near walls), walls (inner/top/outer + gold trim + end caps), slab
  skirts on open edges, gap end faces, end walls, the cup ring/pot/rim, plus matching colliders.
  Features: `windmill` (tower colliders with a tunnel + N kinematic blades), `bumper`, `pickup`;
  loops become a feature for the skin. Node-safe (no THREE) so tools/AI can build holes headless.
- **Holes** (`js/course/holes/`): 1 First Bend (S-bend, par 2), 2 The Windmill (tunnel + bend +
  bumper, par 3), 3 Loop and Leap (funnel → 0.45 m loop → ramp over a 0.7 m gap → green, par 3).
- **Game** (`js/game/`): `play.js` round/hole flow (ready → rolling → rest/cup/out, D10 pick-up at
  par+4, pickups, sink animation, hole card, scorecard), `aim.js` slingshot drag anywhere (D8) with
  a 24 px cancel zone, power = drag/(0.5·min(w,h)), mild power curve; guide ribbon of scrolling
  chevrons from the **real sim** (`traceGuide`), `guideLevel` already lengthens it and allows that
  many bounces (Long Sight); pinch + wheel zoom, look-around (eye toggle, or any one-finger/mouse
  drag while the ball is rolling). `camera.js` chase rig behind/above the ball looking down the
  fairway; follows the shot's heading; landscape frames wider (D13). `hud.js` DOM HUD + cards.
- **App** (`js/app/main.js`, `index.html`, `css/app.css`): boot watchdog (GAMBIT pattern), title
  with the hole orbiting behind it, Play + hole select 1–3, fullscreen toggle only where the API
  works (hidden on iOS Safari), live resize/orientation, portrait + landscape layouts.
- **Greybox theme** (`js/themes/greybox/index.js`): full THEME_CONTRACT fallback. Theme loading:
  `?theme=<id>`, default `sky`, falls back to greybox if the import/createTheme throws; per-material
  and per-skin fallback, and a throwing skin/environment falls back to greybox at runtime.

## Contract changes (THEME_CONTRACT.md, "Engine extensions" section)
windmill `gapHeight` opt + exact blade layout at rotation 0 (blade along +Y·k, sail on +X from
0.018) — the physics box matches the sky skin; loop track centre eases the side shift
(x = shift·(u − sin 2πu / 2π)) — **the sky loop rails currently use a linear helix, so they drift
up to ~12 cm off the track mid-loop; sky should switch to the eased formula**; `info.floor[]`;
engine draws the cup hole/rim and lifts the flag; placement frames for skins.

## Files
```
index.html, css/app.css, js/app/main.js
js/engine/constants.js shapes.js physics.js sim.js
js/course/frames.js builder.js features.js holes/{index,sky1,sky2,sky3}.js
js/game/play.js aim.js camera.js hud.js holeview.js
js/themes/greybox/index.js
tools/physics_test.mjs holes_test.mjs shots_cdp.mjs
```

## How to test
```
node tools/physics_test.mjs          # straight putt, wall bounce, cup capture/lip-out, tunnelling, loop, determinism
node tools/holes_test.mjs            # builds each hole, a greedy planner plays it with the real sim (must hole out ≤ par)
~/.claude/bin/cdp start --port 9512
node tools/shots_cdp.mjs shots --out=/tmp/skyputt-shots    # title + each hole (tee/aim/rolling/rest), 412x915 + 1440x900
node tools/shots_cdp.mjs play  --out=/tmp/skyputt-shots    # plays holes 1-3 through real touch drags to the scorecard
```
URL params: `?theme=greybox`, `?hole=2` (start on a hole), `?q=low` (smaller shadow maps).
Debug: `window.__skyputt` (`round`, `app`, `fps`, `startRound(i)`), `round.debugShoot(headingDeg, speed)`.

## Test results (2026-11-02)
- `physics_test`: 25/25. `holes_test`: all three hole out ≤ par with the planner (it finds aces).
- `shots_cdp play` (real touch drags, 412x915, sky theme): 1 / 3 / 2 vs par 2 / 3 / 3, no console errors.
  An earlier run exposed a slot between the windmill blades and the tower collider where the ball
  could get trapped (picked up at 7) — fixed: the tower collider's front face now sits just behind
  the blade plane.

## Known issues / next
- Headless Chrome is software GL (~10 fps), so real-phone frame rate is unmeasured. Draw calls are
  low (the hole is ~8 merged meshes + skins), physics costs well under 1 ms/frame. Check on a phone.
- No sound yet (M2). No hole fly-over yet (M2). Flag lifts but has no animation polish.
- Loop exit: the ball can leave the loop 0.1–0.2 m off-centre and kiss a wall; fine with walls.
- Capture is generous (~2.2 m/s arrival at the 2× ball scale); tune `RIM_KEEP`/`RIM_HOP` in physics.js.
- The camera does no occlusion check (a tall backdrop piece between camera and ball would hide it).

## Proposals for DECISIONS
- P1: Cup capture speed and loop threshold are design knobs: keep loop entry ≥ ~77% power
  (current 0.45 m loop needs ~4.9 m/s of 6.4).
- P2: Hole data authoring: keep the cup on a straight, flat, constant-width stretch ≥ 0.85 m wide
  (the floor cut needs it). The builder enforces nothing yet; holes_test catches unbeatable holes.
