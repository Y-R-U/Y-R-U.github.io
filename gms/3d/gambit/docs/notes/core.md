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

## Perft (node 24, Apple M5, idle)
| position | depth | nodes | ok |
|---|---|---|---|
| start | 5 / 6 | 4,865,609 / 119,060,324 | yes / yes |
| Kiwipete | 4 / 5 | 4,085,603 / 193,690,690 | yes / yes |
| pos 3 | 5 / 6 | 674,624 / 11,030,083 | yes / yes |
| pos 4 (+ mirrored) | 4 / 5 | 422,333 / 15,833,292 | yes / yes |
| pos 5 | 4 / 5 | 2,103,487 / 89,941,194 | yes / yes |
| pos 6 | 4 / 5 | 3,894,594 / 164,075,551 | yes / yes |
Perft speed ~18.5 M leaf nodes/s (legal-checked via make/unmake). All rules tests pass.

## Engine
PVS alpha-beta, iterative deepening + aspiration windows, quiescence (captures/queen promos,
delta pruning, losing-capture skip, check evasions), TT (2^20 entries, mate-distance adjusted),
killers + history, null move (R=2/3), LMR, reverse futility, futility + late-move pruning,
check extension, IIR. Eval: PeSTO-ish material + PSTs (tapered mg/eg), bishop pair, doubled /
isolated / passed pawns, rook (semi-)open files, mobility (minor mobility excludes squares hit by
pawns), king-zone attack units, pawn shield, tempo, mop-up for K+X v K, drawish-material scaling.
Every term has a weight (`evalW`) so personas can have styles (aggressive = more king attack,
greedy = materialScale, beginners = most terms off).
Speed: ~750 knps idle on the M5 (depth 13 from the start position in 1.3 s). Under heavy machine
load both node and headless Chrome measured ~210 knps.

## Calibration (method)
1. `tools/core_tourney.mjs` plays untimed, **node-limited** games (strength is device-independent),
   both colours from a shared random 2-6 ply book opening, 400-ply cap = draw.
2. Anchors: vendored Stockfish 19 lite with `UCI_LimitStrength` + `UCI_Elo` 1500…2700. I run it
   with `go depth 1+floor(level)` where level is Stockfish's own Elo→skill formula, which is exactly
   where SF makes its weakened pick — so the anchors are device independent too.
3. Every bot plays its two ladder neighbours above (`--ladder --span 2`, 24 games per pair), and the
   1500-2550 bots also play 2-3 SF anchors (16 games each). One Bradley-Terry max-likelihood fit
   over all games with the SF anchors held fixed (`--rate`).
4. **Label scale.** SF's UCI_Elo is CCRL-anchored; below ~1700 it says a *uniform random mover* is
   ~716, which is clearly not human-scale (on chess.com a random mover would sit below the 100
   floor). So labels = fitted Elo above 1700, and below 1700 the distance to 1700 is stretched so the
   random mover (`rand` candidate) lands at 0: x1.73 in the final fit. This is a judgement call; the
   ordering and the step sizes between neighbours are measured, the absolute bottom is the soft part
   (I'd call it ±100-150 below 1000, ±60 1000-2500, ±100+ for the top 3).
5. Exploration round (old params) is in `tools/core_tourney_round1_exploration.jsonl`; the final games
   are in `tools/core_tourney_results.jsonl` (~1,170 games).

Findings that shaped the ladder: human-mode (shallow root scoring + noise + blunders) tops out
around 2000; the full search with a node budget is very strong per node (3k nodes ≈ 2025, 8k ≈ 2225,
20k ≈ 2375, 57k ≈ 2550, 187k ≈ 2800), so the JS engine covers the ladder up to ~2900 and Stockfish is
only needed for the top bot.

## Stockfish decision
Vendored **Stockfish 19 lite single-threaded** (`stockfish-19-lite-single.js` + `.wasm`, 1.9 MB,
GPL-3.0, `Copying.txt` kept next to it). Why: tiny, no COOP/COEP needed (works on GitHub Pages and
the dev server), and ~3200+ at full strength, far beyond what our JS engine can honestly claim. It also
gave us the anchors for calibration. Only "The Machine" uses it in play (full strength, 1M nodes);
everything else is our engine because it calibrated stronger than expected. The full 94 MB net was
not worth it.

## Device gating
- `benchmark()` = 1 s search on 4 fixed positions after a JIT warm-up, in a worker; cached in
  `localStorage['gambit.bench']` `{score (kNPS), nps, v, at, cores}`. `benchmark({force:true})` re-runs.
- Strength is a node budget, so a slower device thinks longer, never weaker (Elo stays honest).
  A bot is locked when `typNodes / nps > THINK_LIMIT_MS (6.5 s)`: `minDeviceScore = ceil(typNodes/6500)`
  (Stockfish: divided by `SF_SPEED_RATIO` = 1.5, measured in Chrome: SF lite 322 knps vs our 206 knps
  on the same loaded machine).
- `expectedMoveMs(bot, bench)` gives the UI a "~2 s per move" figure.
- In timed games the time manager can cut the node budget (soft ≈ left/40 + 0.75·inc, hard ≤ 25 % of
  the clock), so very strong bots play a bit weaker in bullet on slow devices — same as humans.
- The benchmark is load-sensitive (745 knps idle vs ~210 under load here). Suggest the UI offers
  "re-test this device" in settings (calls `benchmark({force:true})`).

## The ladder (final, measured)
| bot | Elo | engine / levers | avg nodes/move | ~ms/move @745k nps (M5 idle) | @200k nps |
|---|---|---|---|---|---|
| Pip | 125 | human d1, no qsearch, noise 240, blunder 55 % | 30 | 0 | 0 |
| Mabel | 275 | human d1 q1, blunder 36 % | 60 | 0 | 0 |
| Otto | 425 | human d1 q2, aggressive eval | 70 | 0 | 0 |
| Juno | 725 | human d2 q1 | 800 | 1 | 4 |
| Ravi | 800 | human d2 q3 | 900 | 1 | 5 |
| Bea | 1000 | human d2, full qsearch, aggressive | 1.2k | 2 | 6 |
| Hugo | 1275 | human d3, bishop lover | 4.5k | 6 | 23 |
| Lena | 1425 | human d3, tricky | 4.8k | 6 | 24 |
| Marco | 1650 | human d4, pawn-structure heavy | 19k | 26 | 95 |
| Ines | 1725 | human d4, low noise | 19k | 26 | 95 |
| Tariq | 1900 | human d5, aggressive | 46k | 62 | 230 |
| Nadia | 2000 | human d5, very low noise | 53k | 71 | 265 |
| Ada | 2025 | search 3k nodes, evalNoise 40 | 3k | 4 | 15 |
| Viktor | 2225 | search 8k | 8k | 11 | 40 |
| Mei | 2375 | search 20k, aggressive | 20k | 27 | 100 |
| Orlov | 2550 | search 57k | 57k | 77 | 285 |
| Gideon | 2800 | search 200k | 187k | 251 | 935 |
| Seraphine | 3000* | search 700k | 650k | 870 | 3,250 |
| Oracle | 3150* | search 2M | 1.8M | 2,400 | 9,000 (locked) |
| The Machine | 3300* | Stockfish 19 lite, full strength, 1M nodes | 1M | ~900 | ~3,300 |

\* rough: Seraphine 3.5/4 v Gideon, Oracle 3/4 v Seraphine (fit said 3131 / 3322; I rounded down), The Machine
not measured (calibration match cut short for machine load). Treat the top three as "2900+".
Measured blunder rates (static-look moves): Pip 54 %, Mabel 35 %, Otto 30 %, Juno 23 %, Ravi 19 %,
Bea 12 %, Hugo 11 %, Lena 8 %, Marco 5 %, Ines 3 %, Tariq 3 %, Nadia 2 %; most of those still land on an
OK move by luck, the rest are the hung pieces and walked-into forks.
Benchmarks: headless Chrome on this M5 under heavy shared load 154-206 knps (node idle 745 knps); Stockfish
lite wasm 322 knps (MultiPV 4: 353 knps) in Chrome. On a ~200 knps device every bot except Oracle is available.

## Requests
- ui: show `expectedMoveMs` on bot cards, and give settings a "re-test this device" button (`benchmark({force:true})`).
  Pass `startFen` + `moves` to `think()`. Before the bot is asked to move, call `clock.start(botColor)`
  after the battle anim per D6 and pass `timeLeftMs: clock.remainingMs(botColor)`.
- manager: the Elo labels below 1700 rely on the random-mover stretch (see Calibration 4). If Aaron wants the
  bottom to read "250", it is a one-line change in `tools/core_tourney.mjs` (PIVOT / k) followed by re-labelling.

## Open issues
- Top three labels are rough (above), and so is the label stretch below 1700.
- Under heavy load the cached benchmark under-reads; it is only re-measured on `force`.
- `stop()` terminates the bot's worker (the search is synchronous), so the next `think()` starts with an empty TT. That's fine.
- Calibration runs are heavy: keep `--threads 3` on this shared Mac.
