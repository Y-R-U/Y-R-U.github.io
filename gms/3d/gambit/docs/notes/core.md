# core — notes

Owner of `js/chess/`, `js/bots/`, `tools/core_*`. Nothing committed.

## Files
| file | what |
|---|---|
| `js/chess/chess.js` | rules core. `Position` (fast 0x88 board, int moves, make/unmake, Zobrist) + `Chess` (TEAM_BRIEF interface) + `Clock` |
| `js/chess/solve.js` | `solveMate(fen, n)` exact mate-in-N solver with uniqueness + dual detection; `isMateIn`; `checkUnique(fen,{ms,margin})` for tactics |
| `js/bots/engine.js` | search engine (pure, node + worker). `Engine`, `runBenchmark` |
| `js/bots/play.js` | opening book, time management, human-like move choice (`chooseMove`) |
| `js/bots/personas.js` | the ladder: 20 bots, their strength levers, measured `typNodes` |
| `js/bots/worker.js` | module Web Worker wrapping engine/play/solve |
| `js/bots/bots.js` | main-thread API: `BOTS, benchmark, botAvailable, createBot, hint, solveMate, expectedMoveMs, cachedBenchmark, sfBenchmark, stopHint` |
| `js/bots/stockfish/` | vendored Stockfish 19 lite single-threaded wasm (1.9 MB) + `Copying.txt` (GPL-3.0) |
| `tools/core_perft.mjs` | perft + rules/PGN/clock regression tests (`--quick`, `--full`) |
| `tools/core_tourney.mjs` | bot-vs-bot calibration tourney (worker_threads), Bradley-Terry Elo fit |
| `tools/core_candidates.mjs` | experimental personas for calibration runs (incl. `rand` = uniform random mover) |
| `tools/core_test.html` + `tools/core_cdp.mjs` | browser test: bots play in the worker, benchmark, gating table |
| `tools/core_tourney_results.jsonl` | final calibration games (one JSON per game, with moves) |
| `tools/core_tourney_round1_exploration.jsonl` | exploration round (old persona params; kept for the method notes) |

## How to test
```
node tools/core_perft.mjs            # perft (start d5, kiwipete d4, pos3 d5, pos4/4m/5/6 d4) + ~50 rules tests, ~1 s
node tools/core_perft.mjs --full     # one ply deeper everywhere (start d6 = 119,060,324), ~35 s
node tools/core_tourney.mjs --rate tools/core_tourney_results.jsonl     # ratings table from saved games
node tools/core_tourney.mjs --pairs pip:mabel --games 20               # a match
~/.claude/bin/cdp start --port 9501
node tools/core_cdp.mjs "auto&games=juno:bea,ada:viktor&fresh&sfbench"  # browser run
```
Browser page: http://192.168.0.236:8888/gms/3d/gambit/tools/core_test.html (interactive: pick two bots, Play).

## API notes for other agents (extensions beyond TEAM_BRIEF, all additive)
- `moves({verbose:true})` objects: `{color, from, to, piece, captured?, captureSquare?, promotion?,
  flags, san, lan, rookFrom?, rookTo?, check, mate, before}`; `move()` result also has `after`.
  `flags` is chess.js-style: `n` normal, `b` double push, `c` capture, `e` en passant, `k`/`q` castle, `p` promotion
  (combined, e.g. `cp`). En passant: `captureSquare` != `to`. Castling: animate `rookFrom -> rookTo` too.
- `move()` accepts SAN (lenient: `0-0`, missing `x`/`=`, over-disambiguated `Ng1f3`, trailing `+#!?`),
  LAN (`e2e4`, `e7e8q`; `e7e8` promotes to queen) or `{from,to,promotion}` (promotion defaults to queen).
- Results the board cannot know: `chess.timeout(color)` (draw if the winner has only K or K+minor),
  `chess.resign(color)`, `chess.setOutcome(result, reason)` (e.g. agreement). `undo()` clears them.
  `move()` returns null once the game is over.
- Also: `header(k,v)`, `isThreefoldRepetition()`, `isFiftyMoves()`, `isInsufficientMaterial()`,
  `Chess.validateFen(fen) -> {ok, error}`, `pgn(headers, {maxWidth})`. `loadPgn` returns false and
  leaves the game untouched on bad input; it tolerates comments, NAGs, nested variations.
- FEN output prints the en-passant square only when an en-passant capture is actually possible.
- `Clock({baseMs, incMs})`: `baseMs: Infinity` (or 0/null) = Unlimited. Extra: `resume()`, `stop()`,
  `set(color, ms)` (server sync), `running`, `flagged`, `dispose()`; `onFlag` returns an unsubscribe fn.
  UI: per D6, call `start(color)` for the side to move only after the battle animation ends.
- `createBot(id).think(fen, {timeLeftMs, incMs, startFen, moves, seed})` → `{move:'e2e4', score, mate,
  depth, nodes, pv, book, ms}` or `null` if `stop()`ped. Pass `startFen` + `moves` (LAN list) so the
  bot sees the game history (repetition). Bots below 2000 add a small human-like delay
  (`createBot(id, {humanDelay:false})` to disable). Each bot owns a worker: `dispose()` it.
- `hint(fen, ms, {startFen, moves})` → `{move, score, mate, pv, depth}`. `solveMate(fen, n)` (worker).
- `BOTS[i]` fields: `id, name, elo, avatar (emoji), color, blurb, style, engine ('js'|'sf'), minDeviceScore`.
- Puzzles agent: import `js/chess/solve.js` directly in node tools. `solveMate(fen, n)` returns every
  first move that forces mate in ≤ n (`unique` = exactly one) plus `duals` along the defence tree;
  `complete:false` means the node cap was hit. For non-mate tactics use `checkUnique(fen,{ms:1500, margin:150})`
  (best move, then best with it excluded; unique if the gap ≥ margin or only the best mates).
