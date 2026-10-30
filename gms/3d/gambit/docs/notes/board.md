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
