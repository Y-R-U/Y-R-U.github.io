# engine — notes (M1 "First putt", M2 "Sky Isles front nine", M3 start)

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


## M2 (2026-11-02)
- **Holes 4–9** (`js/course/holes/sky4..9.js`), 9 holes, par 28:
  4 Sand Steps (terraces + sand traps, par 3) · 5 Glass Run (high tee → glass tube winding down, par 3) ·
  6 Boost Leap (boost pad → ramp → gap, par 3) · 7 The Shortcut (long U-bend or a wall-less plank across
  the void, par 4) · 8 Pusher Pass (two sliding blocks, par 3) · 9 Grand Isle (S-bend, windmill, loop,
  raised green — the ref-1 hole, par 4). Hole 3 was eased and lengthened (wider funnel, 0.42 m loop, longer green).
- **Difficulty** (`node tools/holes_test.mjs --human=8`: planner + 2.5° aim / 5% power noise; avg vs par):
  1 +0.6 · 2 +0.4 · 3 −0.25 · 4 0.0 · 5 +0.2 · 6 −0.2 · 7 +1.0 · 8 +0.4 · 9 +1.0. Small samples;
  the bot is far better than a person, so treat these as relative.
- **New mechanics**: `tube` piece (ring collider of GLASS, ball rolls inside; sky `tube` skin);
  surface patches `sand` / `ice` / `boost` / `sticky` as features (`at0`/`at1` or `s0`/`s1`, `u0`/`u1`)
  that re-tag floor cells + exact decal meshes; boost pads push along their arrow (BOOST_ACC 14 m/s²
  up to 5.2 m/s); `mover` kinematic (slides as a pure function of time) + new `mover` skin; static
  `block`; `branches` (extra tracks, e.g. the plank) swept 1.5 mm under the main floor; any feature
  can be placed with `at: [x, z]` instead of `s`.
- **Progress** (`js/app/store.js`, localStorage `skyputt.save.v1`, every access in try/catch):
  best + stars per hole (1 finished, 2 ≤ par, 3 < par; picked up = 0), coins (5 per crystal),
  helpers inventory (3 + 3 to start), settings, unlocks (finishing hole n opens n+1).
- **Course map** (`js/app/menus.js`): 3×3 tiles (5 wide / 9 wide in landscape) with stars, best and
  locks; "Play front nine" (round + scorecard) or tap a tile (single hole → next / map).
- **Fly-over**: cup → tee over 3.2 s, eases into the chase camera; tap to skip (`?noflyover` for tests).
- **Helpers v1**: tray (right side, left with left-handed HUD; vertical centre in landscape).
  Long Sight: before a shot, stacks to 3, each = `guideLevel`+1 (longer line + one more bounce).
  Mulligan: after a shot (incl. out of bounds), puts the ball back and refunds the stroke(s).
  A 3-star hole earns +1 of whichever you hold fewer of.
- **Settings sheet** (title gear + pause menu): sound, music, camera speed, quality (reload), left-handed.
- **Camera occlusion**: a ray from ball to camera every other frame against the course, skins and
  theme pieces near the hole; the camera pulls in fast and eases back out (glass/transparent ignored).
- **Loop exit drift**: loop floor tilt scaled to 0.8 (`LOOP_BANK`), exits now within ~7 cm of centre.
- **Audio wired** (`js/game/sfxbus.js` → `js/audio/` in main.js): unlock on every pointerdown/keydown,
  sky music, putt/aimTick, roll per frame with surface, wall/bumper/windmill, rim rattle, cup drop +
  result stinger, lip-out (ball dipped over the cup and left), fall, boost, pickup, stars/coins on the
  card, UI clicks; volumes from settings.
- **Spooky-agent fixes folded in**: occlusion ray sets `raycaster.camera` and skips sprites/points/
  lines/transparent; `mover` skin documented; boost UV is now u = metres from the *pad's* centre line
  (documented; sky's chevron texture got `repeat.x = 2, offset.x = 0.5` — the one edit in
  js/themes/sky/); new `info.viewDir` (initial camera heading); landscape pitch is now a touch
  flatter (−0.05 rad vs portrait) so backdrops aren't cropped.
- **M2 test results**: physics 25/25; `store_test` all pass (no storage / corrupt / throwing
  storage); holes_test 9/9 ≤ par; UI front-nine playthrough by touch drags (`play` + `--from=5`)
  scored 1 1 2 1 1 1 2 3 2 = 14 vs par 28, every card / star / coin / helper-reward shown, no console
  errors; Long Sight ×3 and Mulligan checked in page.
- **Contract**: see "Engine extensions, M2" in THEME_CONTRACT.md (`mover` skin, tube opts, patches,
  `info.voids`, `info.branches`). **Sky theme action needed:** keep ground/props out of `info.voids`
  (hole 7's U currently reads as solid island, which hides the shortcut's risk), keep lamps/props off
  every part of the track (hole 7 has a lamp standing on the outbound lane, no collider), and add a
  `mover` skin (greybox block is used for now).

### Known issues (M2)
- In `shots_cdp shots`, the held-touch "aim" screenshot sometimes shows the guide pointing backward
  at 85%; real drags (the `play` run, manual CDP drags, mouse in landscape) aim and draw correctly.
  Looks like a driver/touch-emulation artefact, not reproduced by hand.
- Headless is still ~10 fps (software GL): ~35–50 draw calls, ~40–50k triangles per hole with sky.
- Crystals respawn every play, so coins can be farmed (fine until the shop exists).

## M3 start (2026-11-02)
- **Theme picker** on the title: Sky Isles / Spooky Hollow chips with a CSS swatch; saved as
  `settings.theme`; `?theme=` still overrides at load. Switching disposes the old theme and rebuilds
  the title scene in place (no reload); music follows the theme id.
- **Sky theme fixes** (js/themes/sky/, sky agent done): the course rock, foliage, lanterns and
  waterfalls respect `info.voids` (hole 7's U is a real drop now) and keep off `info.branches`; the
  backdrop frame and tee lanterns use `info.viewDir` (hole 7 had a lamp on the fairway because tee→cup
  is sideways there); new sky `mover` skin (stone block, gold bands, blue runners); boost chevrons
  re-mapped to the pad-centred u.
- **Story "Nobody to Pro"** (`js/story/`):
  - `data/` is pure data: `chapters.js` (6 tours, ranks Nobody → Legend; only Muni has data, the
    rest show "Coming soon"), `ch1_muni.js` (intro/outro + 7 events), `characters.js` (Mags, Carl,
    you: portrait params), `golfers.js` (AI roster: personality + skill). Chapter 2 = one more file.
  - Muni events: 3 lessons (Aim and Putt; Long Sight, which grants 2 and requires using one;
    Mulligan, which grants 2 and requires using one), 2 rounds with star targets, rival vs Careful Carl
    (4 holes incl. the shortcut), the Muni Open (6 holes, 8 players, top 3). Coins + helpers on first
    pass. Events unlock in order; finishing all → chapter done → rank "Amateur" + rank card.
  - `portrait.js` draws SVG portraits from params; `dialogue.js` shows tap-through cards;
    `career.js` = profile (name entry), tour map with event rows, the event runner (dialogue → play →
    goal check → rewards → dialogue) and a result card with a leaderboard for rival/tournament.
  - Rounds for events reuse `Round` with `{ onComplete, opponents, tips, label }`; hole cards list
    the rival(s) hole + running total (top 4 for tournaments). `Round.result()` gives totals, stars, helper use.
  - Save: `store.data.story = { name, events: { id: { passed, best, tries } }, chapters, seen }`.
- **AI interface for the `ai` agent** (`js/story/opponents.js`, used through `playField()`):
  ```js
  // js/ai/index.js
  export async function simulateRound({ holes, golfer, seed })
  //   holes:  hole defs in play order; golfer: { id, name, personality: 'careful'|'power'|'banks'|'lucky'|'pro', skill: 0..1 }
  //   seed:   int, deterministic
  //   → { scores: [{ strokes, picked, shots?: [{ vx, vz, t0 }] }] }  one per hole, game rules (OOB +1, pick-up at par+4)
  ```
  Until it exists, a deterministic stub (par + skill/personality noise) plays the AI; the result card
  says "simulated". `shots` will let the game replay ghosts later (not wired yet). Note: until
  js/ai/index.js exists, the probe import logs one 404 in the console when a rival/tournament starts.
- **Tests**: `node tools/story_test.mjs` (data integrity: holes/speakers/golfers exist; goal checks;
  unlock + rank; stub determinism; the Pro beats a beginner); `node tools/shots_cdp.mjs story` drives
  name → intro → career → lesson 1 (played by drags) → result → rival hole card. All pass, no console
  errors besides the expected ai 404.

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
node tools/holes_test.mjs [id] [--human=N] [--verbose]   # builds each hole; a planner must hole out ≤ par; --human rates difficulty
~/.claude/bin/cdp start --port 9512
node tools/shots_cdp.mjs shots --out=/tmp/skyputt-shots [--holes=4,5] [--sizes=p,l]   # title, map, settings, each hole
node tools/shots_cdp.mjs play  --out=/tmp/skyputt-shots    # fresh save, Play front nine, all 9 holes by touch drags to the scorecard
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
- Capture is generous (~2.2 m/s arrival at the 2× ball scale); tune `RIM_KEEP`/`RIM_HOP` in physics.js.

## Proposals for DECISIONS
- P1: Cup capture speed and loop threshold are design knobs: keep loop entry ≥ ~77% power
  (current 0.45 m loop needs ~4.9 m/s of 6.4).
- P2: Hole data authoring: keep the cup on a straight, flat, constant-width stretch ≥ 0.85 m wide
  (the floor cut needs it). The builder enforces nothing yet; holes_test catches unbeatable holes.
