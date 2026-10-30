# GAMBIT — Team brief (read this, then DECISIONS.md)

You are one of up to 4 agents working in parallel under a manager. Stay inside the files you
own; if you need a change in someone else's file, write it under "Requests" in your notes file
and keep going with a local shim. Never commit, push or deploy.

## Layout and ownership
```
gms/3d/gambit/
  index.html, css/, js/app/        ui      — shell, screens, settings, storage, auth, ladder
  js/chess/                        core    — rules, FEN/SAN/PGN, clocks, perft tests
  js/bots/                         core    — bot worker, search, eval, personalities, benchmark
  js/board/                        board   — Three.js scene, camera, input, animation system
  js/themes/<theme>/               board (kit + classic) / sculptors (other themes)
  js/puzzles/, assets/puzzles/     puzzles (later agent)
  server/                          server  — Go service
  tools/                           anyone, prefix files with your role (tools/core_*.mjs …)
  docs/notes/<role>.md             your log: what's done, how to test, Requests, open issues
```

## Interfaces (the contract between agents — keep these stable, extend don't break)

### core: `js/chess/chess.js`
```js
export class Chess {
  constructor(fen?)           // default start position
  fen(); load(fen); reset()
  turn()                      // 'w' | 'b'
  moves({square?, verbose?})  // verbose: {from,to,piece,captured?,promotion?,flags,san,lan}
  move(m)                     // m = 'e4' | 'e2e4' | {from,to,promotion}; returns verbose move or null
  undo()
  get(square)                 // {type:'p'|'n'|'b'|'r'|'q'|'k', color:'w'|'b'} | null
  board()                     // 8x8 array, [0] = rank 8
  inCheck(); isCheckmate(); isStalemate(); isDraw(); isGameOver()
  outcome()                   // {result:'1-0'|'0-1'|'1/2-1/2'|'*', reason:'checkmate'|'stalemate'|
                              //  'repetition'|'fifty'|'material'|'timeout'|'resign'|'agreement'}
  history({verbose?}); pgn(headers?); loadPgn(str)
}
export class Clock { constructor({baseMs, incMs}) start(color) press() pause() remainingMs(color) onFlag(cb) }
```
Verbose moves carry `flags` incl. capture, en-passant (captured square differs from `to`),
castling (the board needs the rook move too: `rookFrom`, `rookTo`), promotion.

### core: `js/bots/bots.js`
```js
export const BOTS = [ {id, name, elo, avatar, blurb, style, minDeviceScore}, ... ]  // ~15–25 bots
export async function benchmark()        // -> {score, nps}; cached in localStorage
export function botAvailable(bot, bench) // false if too slow on this device
export function createBot(id)            // -> {think(fen, {timeLeftMs, incMs}) -> Promise<{move:'e2e4', ...}>, stop(), dispose()}
export function hint(fen, ms)            // best move for hints / puzzle checks
```
Runs in a module Web Worker. Weaker bots must feel human (blunders, missed tactics) not random.

### board: `js/board/board.js`
```js
export async function createBoard(container, opts) -> board
board.setPosition(fen, {animate:false})
board.applyMove(verboseMove, {battle:true|false}) -> Promise   // resolves when animations end
board.setOrientation('w'|'b'); board.setTheme(themeId) -> Promise
board.setAnimSpeed('off'|1|2|5)        // battle speed; move anims always on but snappy
board.setInteractive(color|'both'|null)
board.onMoveAttempt = ({from,to,promotion}) => bool  // ui asks core; board snaps back if false
board.highlight({lastMove, check, legalTargets, hint}); board.showArrows([...])
board.camera.preset('top'|'default'|'angle'); board.camera.reset()
board.resize(); board.dispose()
```
Board shows legal-target dots when a piece is picked (ui passes them via `legalTargets` or board
calls `opts.legalMoves(square)`). Tap-tap and drag-drop both work.

### themes: `js/themes/<id>/index.js`
```js
export default {
  id, name, tags,
  board: { build(THREE, kit) -> Object3D, lightRig? },
  pieces: { p,n,b,r,q,k: (THREE, kit, {color}) -> Object3D },   // Y-up, base at y=0, fits 1 square
  moveAnims: [ (ctx) => Promise, ... ],     // random pick; ctx = {piece, from, to, path, speed, THREE, kit}
  battleAnims: [ (ctx) => Promise, ... ],   // ctx adds {attacker, victim, scene, camera, fx, speed}
  sounds?: { move, capture, check, ... }
}
```
Registry `js/themes/index.js` (board owns): `{classic: () => import('./classic/index.js'), …}`.
A sculptor adds one line for a new theme. `kit` (board owns, `js/themes/kit.js`) holds shared
helpers: lathe profiles, materials (side colours that read from above), bevels, emissive rims,
FX particles, tweens/easings, camera shake.

### ui
`js/app/main.js` boots, routes screens via hash (`#/home`, `#/play/bot`, `#/game`, `#/puzzles`,
`#/online`, `#/ladder`, `#/settings`, `#/learn`), wires core + board. Storage keys all prefixed
`gambit.` (that is what cloud sync mirrors). Until core/board land, ui uses a shim and swaps.

### server: see `server/README.md` (server agent writes it). Client module `js/app/net.js` is
owned by server agent so the protocol stays in one head.

## Quality bar
- chess.com-level clarity: board fills the width in portrait, clocks above/below, move list,
  big tap targets (≥ 44 px), no layout jumps, works at 360×740 and 1920×1080.
- Pieces readable from overhead at phone size: white vs black obvious at a glance; piece type
  obvious from the top (crown shapes, knight's head, rook battlements, bishop mitre slot).
- 60 fps on a mid phone in the default view; keep draw calls low (instancing / merged geometry),
  shadows cheap.

## Testing
Headless Chrome via `~/.claude/bin/cdp start --port <yours>` (raw CDP over WebSocket, see
`/games/CLAUDE.md` Testing). Ports: core 9501, board 9502, ui 9503, server 9504,
later agents 9510+. Screenshot to your scratch dir and LOOK at them. Zero console errors.
Site served at http://192.168.0.236:8888/ (already running). Node tests: `node tools/<role>_*.mjs`.

## Notes
Keep `docs/notes/<role>.md` current: done, how to test, Requests (to other roles / manager),
open issues. When finished, end with a short hand-back summary in your final message.
