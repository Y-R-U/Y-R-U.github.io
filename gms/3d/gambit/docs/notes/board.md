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
- `camera.preset('top'|'default'|'angle')`, `camera.reset()`, `camera.orbit(dθ,dφ)`, `camera.zoom(f)`,
  `camera.setAutoRotate(rad/s)`, `camera.state`.
- Events: `board.on('select'|'promotion'|'animstart'|'animend'|'battlestart'|'battleend'|'theme', fn)` → unsubscribe fn.
- Also: `isAnimating()`, `whenIdle()`, `pieceAt(sq)`, `stats()` → {fps, frameMs, drawCalls, triangles, pieces}, `dispose()`.
- Keyboard: arrows/WASD orbit, +/- zoom, 0/Home reset. Ignored while typing in inputs; disable with `keyboard:false`.

## Requests
- ui: the game screen could set `board.onPromotion` to show its picker over `squareToScreen(to)`
  instead of returning false and re-applying (keeps a dragged pawn hovering on the target).

## Open issues / ideas
- Black chrome from straight overhead on the dark marble relies on a faint red rim; acceptable at
  360 px but the weakest contrast case. A tunable if Aaron wants more pop: `kit.metalLooks.b.rim.strength`.
- No planar reflections (by design, phones). Glossy board uses the studio env map only.
- Per-piece idle animation (flickering candles etc.) isn't supported by instancing yet.
