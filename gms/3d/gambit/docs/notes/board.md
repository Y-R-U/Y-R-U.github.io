# Board agent notes

## Done
- `js/board/board.js` — `createBoard` per TEAM_BRIEF, plus `camera.js` (orbit rig), `pieces.js`
  (instanced pool + live clones), `overlays.js` (tints, dots, rings, check glow, arrows).
- `js/themes/kit.js` — shared toolkit (easings, Timeline, geometry, materials, FX, animators,
  studio environment). `js/themes/index.js` registry. `js/themes/MODEL_GUIDE.md` for sculptors.
- `js/themes/classic/` — gold vs black-chrome Staunton on polished marble with gold inlay
  (per refs/ref_gold_black_marble.jpg). 4 move anims (hop, slide, spin hop, knight leap),
  3 battle anims (clash & knock-over, shove off the board, stomp).
- `tools/board_gallery.html` — lineup / turntable / playground (uses the real `js/chess/chess.js`).
- `tools/board_cdp.mjs` — CDP screenshot harness (port 9502).

## How to test
- Gallery: http://192.168.0.236:8888/gms/3d/gambit/tools/board_gallery.html
  `?theme=classic&mode=lineup|turntable|play&view=all|top|default|angle&speed=off|1|2|5&auto=1`
- Headless: `~/.claude/bin/cdp start --port 9502`, then
  `node tools/board_cdp.mjs <outDir> '[{"name":"x","url":"…","w":360,"h":740,"mobile":true,"wait":4000}]'`.
  Swiftshader is very slow (≈25 s to first frame, ~1–2 s/frame with shadows at dpr 2) — that is
  software GL, not our code: building all 12 pieces takes ~60 ms and PMREM ~0.3 s.

## API notes for the ui agent
- `createBoard(container, opts)`: opts `{theme, fen, orientation, interactive, animSpeed, view,
  coords|coordinates, legalMoves(sq) -> [sq|{to}], onMoveAttempt, onPromotion, maxPixelRatio=2,
  keyboard=true, autoHighlight=true, shadows=true}`. Container needs a size; the board
  observes it (ResizeObserver) so `resize()` is optional.
- User moves: board calls `board.onMoveAttempt({from,to,promotion})` (may return a Promise).
  Return true **and call `board.applyMove(verbose)`** (inside the handler is fine — that is what
  game.js does). The board recognises the pending move: a drag-drop just settles instead of
  replaying the travel. If applyMove doesn't arrive within 2.5 s the piece snaps back.
  Return false → snap back.
- Promotion: if `board.onPromotion = ({from,to,color}) => Promise<'q'|'r'|'b'|'n'|null>` is set,
  the board asks it first (piece hovers on the target; null cancels) and passes the choice to
  onMoveAttempt. Place the picker with `board.squareToScreen(to)` (container CSS px). If not set,
  onMoveAttempt gets `promotion: undefined` (current game.js flow works). A `'promotion'` event fires either way.
- `applyMove(m, {battle})` queues; resolves after anims. It derives castling rook, en passant
  victim and promotion from its own position, so any verbose move works (`rookFrom/rookTo`,
  `promotion` and `after` are used when present; `after` resyncs if the board was out of step).
  `applyMove('e2e4')` also works. Battles run only when `battle` is true, the move captures and
  speed isn't 'off'. Tap on the board during a battle skips it (`board.skip()` too).
- `setPosition(fen, {animate})` — animate slides matching pieces (good for undo/takeback).
- `highlight({lastMove: {from,to}|[from,to]|null, check: 'e1'|'w'|'b'|null, legalTargets, hint: {from,to}|null})`
  — only keys present change. `autoHighlight` sets lastMove on every applyMove.
- `showArrows([{from,to,color?}])`, color may be a CSS colour or 'hint'|'good'|'bad'|'threat'.
- `setCoords(bool)`, `setOptions({coords, keyboard, autoHighlight, legalMoves, maxPixelRatio})`.
- Camera views: `camera.preset('top'|'tilt'|'angle'|'free')` ('default' = 'tilt'), `camera.cycle()`
  (Top → Tilt → Angle → Free), `camera.view`, `camera.label` ('Top'|'Tilt'|'3D'|'Free'), `camera.locked`,
  `camera.setLocked(bool)`, `camera.reset()`, `camera.orbit/zoom` (no-ops while locked), `camera.setAutoRotate`, `camera.state`.
  Emits `'view'` {view,label,locked} on every change (button, V key, preset). **Default is Top, locked.**
- Name tags: option `labels` (default true; `setOptions({labels:false})` for puzzles/learn),
  `showLabel(sq)` / `hideLabel()`. Themes may give `names: {p,n,b,r,q,k}`.
- Events: `board.on('select'|'promotion'|'animstart'|'animend'|'battlestart'|'battleend'|'theme', fn)` → unsubscribe fn.
- Also: `isAnimating()`, `whenIdle()`, `pieceAt(sq)`, `stats()` → {fps, frameMs, drawCalls, triangles, pieces}, `dispose()`.
- Keyboard: V cycles views; in Free view arrows/WASD orbit and +/- zoom; 0/Home reset. Ignored while typing in inputs; disable with `keyboard:false`.

## Change log
- 2026-10-31 (Aaron, via manager) **Camera modes**: presets top (straight overhead), tilt (13°),
  angle (48°, label "3D") are LOCKED (drag on empty space, arrows, wheel and pinch do nothing;
  piece tap/drag still works; battle focus/shake still play and return to the locked pose).
  free (32°) orbits/zooms as before. Default = top. The game toolbar "View" button now cycles
  Top → Tilt → 3D → Free with the current mode as its label + a toast, saved to the `view`
  setting; V key does the same. Settings offers the same four; saved 'default' loads as 'tilt'
  (store.js getSettings migrates it, DEFAULT_SETTINGS.view = 'top'). Edited ui files:
  js/app/screens/game.js, js/app/screens/settings.js, js/app/store.js (two lines).
- 2026-10-31 (Aaron) **Piece name tags** (`js/board/labels.js`): a DOM pill (dark translucent, gold
  border, Cinzel small caps) that tracks the piece's projected head every frame and stays inside
  the board container. Shown when you select your own piece (alongside the dots; hidden on
  deselect/move), when you tap any piece with nothing selected, and on a fine pointer after
  hovering a piece 250 ms (hides on leave). Every tag fades after `LABEL_MS = 4000`. Tapping an
  enemy with your piece selected is still a capture attempt (no tag). Theme `names` shows
  "Wizard" with "Bishop" underneath.
  Placement: above the piece along the camera's screen-up axis (so it clears the piece even in
  straight-overhead Top view); for your own selected piece it goes BELOW instead so it never covers
  the legal-move dots. Positioned with plain left/top (no CSS transforms: under emulated-mobile
  swiftshader a transformed overlay above the WebGL canvas didn't paint). Screens: 360×740
  `scratchpad/board/tags_360_pair.png`, 1440×900 hover `scratchpad/board/game_tag_hover_1440.png`.
  Headless gotchas: tags fade at 4 s, so screenshot within ~1.5 s; disable `.gb-tag` transitions
  in tests (swiftshader runs ~0.1 fps at dpr 2, so CSS fades never advance).
- 2026-10-31 (Aaron) **Black-on-dark contrast**: dark squares lifted to slate `#69717f` (were navy
  `#262b37`), light squares down a touch (`#d8d4cb`); black chrome is a deeper lacquer `#1c1d22`
  with a cool silver fresnel rim (0.26) and a new `rim.top` sheen (small bright cap on upward faces,
  world-space, from the kit shader), replacing the red rim; every resting piece gets an instanced
  contact blob (soft AO + faint light ring at the base edge, 1 draw call). Tuning lives only in
  `kit.metalLooks` and `kit.boardLooks.marble`. Before/after (top row before, bottom after;
  Top / Tilt / Angle at 360×740, phone scale):
  `scratchpad/board/contrast_before_after.png` (also contrast_before_*.png / contrast_after_*.png).
  Test position: `1n1k3r/p1p1p1p1/1p1p4/8/8/8/P1P1P1P1/1N1Q1K2 w - - 0 1`.
- Tests: `node tools/board_test.mjs <dir>` (input, special moves, camera lock),
  `node tools/board_game_test.mjs <dir>` (real game screen: view button cycle, tags tap/hover).

## Requests
- ui: the game screen could set `board.onPromotion` to show its picker over `squareToScreen(to)`
  instead of returning false and re-applying (keeps a dragged pawn hovering on the target).

## Open issues / ideas
- No planar reflections (by design, phones). Glossy board uses the studio env map only.
- Per-piece idle animation (flickering candles etc.) isn't supported by instancing yet.

---

# board-2 (2026-10-31)

## Done
- **Per-type facing** (`js/board/pieces.js` `facingYaw`): `pieces.facing = { w?, b?, byType?: { p|n|b|r|q|k: spec } }`,
  spec = `'side'` (default) | `'player'` | `'opponent'` | number (offset on the side yaw, + turns toward
  the owner) | `{w, b}`. `byType` is separate because `facing.b` already means black. Old `{w, b}` facing works
  unchanged. Halloween now turns imp/witch/countess/king toward their own player (knight stays sideways).
  MODEL_GUIDE §2 documents it, including how sci-fi's baked `YAW = 0.55` pawn would switch over (`byType: {p: 0.55}`).
- **Shared idle flicker**: `kit.ambient.time` (one uniform object). `kit.material({..., flicker})` /
  `kit.addFlicker(mat, opts)` modulate the emissive term; presets `candle`, `pulse`, `slow`, or
  `{mode, amount, speed, spread}`. Phase comes from the instance/model origin (works on InstancedMesh and
  live clones alike, no lockstep); `spread` adds per-vertex phase for merged meshes (board candles).
  Board: materials with `userData.ambient` make it re-render at a capped rate (`ambientFps` 24 → ≈20 fps
  after vsync) only when nothing else moves, the option `ambientAnim` is on (default; ui-2 already wired the
  setting, store key and settings toggle), the tab is visible (visibilitychange) and something visible uses
  it (env users only count while the env is shown). Ambient frames never update the shadow map.
  Classic/Fantasy (no opt-in) still render 0 frames at rest. Halloween opts in: candle flames (board),
  piece glow (amber candle flicker for white, slow ghost-green pulse for black).
- **`env.update(dt, t)` hook** (fantasy request, manager-approved): called per rendered frame only while
  the environment object is visible, only with `ambientAnim` on, never with the tab hidden; runs at the ambient
  cap at rest. A throwing hook is logged once and dropped.
- **Kit adoption** (kit.js, new sections only; FX untouched): `kit.vertexMaterial` (per-vertex metal = uv.y,
  glow = uv.x; folds in sci-fi's improvements: `dimGlow` keeps neon saturated, `sheenMask` limits the top sheen
  to bright non-glowing surfaces; optional `flicker` on the glow channel), `kit.vertexFinish`, `kit.paintFinish`,
  `kit.rgb`, `kit.colorize`, `kit.noise3`, `kit.deform` (welds first: fixes faceting after merge),
  `kit.loft`, `kit.flameTongue`, `kit.refine`, `kit.wrapDecal`, `kit.hsLathe`, `kit.fixWinding`,
  `kit.boardLooks.graveyard`. Theme files keep their local copies (fantasy/scifi common.js untouched,
  sculptors may be working there). Verified by building every helper into one vertexMaterial mesh
  (instanced + plain) in a live board: compiles, renders, console clean (`scratchpad/b2/kit/kitdemo_1440.png`).
- **Halloween environment** rebuilt (`halloween/board.js`, `build` now reads `kit.boardLooks.graveyard`):
  the 3D views look steeply down (even "3D" shows only a 2–5° strip above the board), so the sky is a
  skybox-style pass (`skyBackdrop`): drawn after the opaque scene at the far plane (only uncovered pixels shade),
  indigo→violet gradient, twinkling stars, a big moon with craters and a lavender halo, a tileable skyline strip
  (far hills, a manor with lit windows, a church spire in front of the moon, bare trees, crosses), a haze band.
  Its horizon is pinned each frame to the projected far rim of the ground plot and the composition scales with
  the visible strip, so it works in 3D, Free and both orientations. The ground shader cuts its far edge as a
  straight line across the screen (camera-relative) and fades into the horizon colour, so the seam disappears.
  Plus moonlit plot colours, headstones/pumpkins, near-black dead trees on the flanks only (never between the
  locked cameras and the board), GPU bats (camera-relative loop behind the board), fireflies (additive points)
  and instanced low mist (1 draw call). No scene fog any more. Env = 5 draw calls (was ~11), ~10k tris.
- **Gallery**: `?anim=<label|fn name>` (board option `forceAnim`) and `?ambient=0`; anim labels listed under the board.
- **Perf pass** (`tools/board_perf.mjs`, CDP CPU throttle 4×, 360×740 dpr 2, headless Metal):
  every scenario holds 60 fps (gap p95 ≤ 18.6 ms). renderer.render CPU avg / p95 ms, after:
  | theme | view | rest | animating | battle | draw calls |
  |---|---|---|---|---|---|
  | classic | top | 0 frames | 0.51 / 1.3 | 0.92 / 1.8 | 18–21 |
  | classic | 3D | 0 frames | 0.73 / 1.4 | 1.02 / 2.2 | 19–24 |
  | fantasy | top | 0 frames | 0.81 / 1.6 | 1.25 / 2.2 | 18–23 |
  | fantasy | 3D | 0 frames | 1.01 / 2.0 | 1.11 / 2.1 | 30–35 |
  | halloween | top | 20 fps, 0.47 / 1.2 | 0.89 / 1.8 | 1.15 / 1.9 | 30–40 |
  | halloween | 3D | 20 fps, 0.71 / 1.4 | 1.09 / 2.0 | 1.28 / 2.1 | 35–39 |
  GPU (timer query, 680² buffer): 1.5–4 ms per frame, shadow pass 0.2–1.9 ms; nothing over budget on this GPU.
  Fix applied: the shadow map re-rendered every frame while any piece moved; now refreshed at most ~30 Hz
  during animation, exact on every settle (animating render CPU −10–25%). Before/after logs:
  `scratchpad/b2/perf_before.txt`, `perf_after.txt`.

## How to test
- `CDP_PORT=9526 node tools/board_test.mjs <dir>` (18/18), `CDP_PORT=9526 node tools/board_game_test.mjs <dir>` (14/14),
  `CDP_PORT=9526 node tools/board_ambient_test.mjs` (13/13: ambient frame cap, off, hidden tab, resume, env.update
  visibility/off, classic idle 0 frames, `?anim=` forcing, facingYaw cases), `CDP_PORT=9526 node tools/board_perf.mjs`.
  All harnesses now clear the browser cache per run and take `CDP_PORT`.
- board_test "battle skippable" waited a fixed 2.5 s (tuned for swiftshader); with a real GPU the battle had
  already ended. It now waits for `isAnimating()`.
- Screens (scratchpad `b2/`): `env2/angle_360.png`, `env2/angle_1440.png`, `env2/angle_1440_black.png`,
  `env2/free_low_1440.png` (before: `before/hw_angle_*.png`); `final/facing_hw_lineup_angle_{360,1440}.png`,
  `final/graveyard_top_{360,1440}.png`, `final/anim_forced_{360,1440}.png`, `final/kitdemo_360.png`,
  `kit/kitdemo_1440.png`, `final/fantasy_angle_1440.png`, `final/scifi_lineup_angle_1440.png`, `final/hw_tilt_360.png`.

## Requests
- sculptors (fantasy/scifi): switch `common.js` `patch()` to `kit.vertexMaterial` when convenient (same vertex
  layout; pass your GLOW as `glow`, `dimGlow: 0` for fantasy's old look) and add `flicker` to the glow you
  want alive (gems, runes, light-lines). Sci-fi pawn: see MODEL_GUIDE §2 to replace the baked YAW.
- `tools/sculpt_halloween_closeup.html` (sculptor tool) still reads only `facing[color]`; use `facingYaw` from
  `js/board/pieces.js` if it should show the per-type facing.

## Open issues
- In the wide 3D view (1440×900) the sky strip is only ~2° tall, so the moon/skyline is small there; it opens up
  at 360 portrait, in Free, and when orbiting low.
- The moon and skyline follow the camera's yaw (they are painted relative to the view), so in Free orbit the
  moon stays put on screen while the 3D trees and stones rotate. Reads fine; a world-anchored panorama would need
  the moon to be behind the camera for black.
- Ambient frames are full-scene re-renders (~0.5–0.7 ms CPU here at 4× throttle); a phone with glow themes idles at
  20 fps instead of 0 unless the user turns Ambient animation off.
