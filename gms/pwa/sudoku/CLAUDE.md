# Sudoku — read `ai.txt` first

`ai.txt` is the architecture doc (graded difficulty, engine, storage keys, SW).
Live at https://games.br8t.com/gms/pwa/sudoku/ — deployed by `games/deploy.sh`
(rsync, `*.md` excluded). Bump `CACHE_NAME` in `sw.js` on every deploy.

## 2026-10-11 hub-review pass (what changed)
- Persistent number pad under the board replaces the modal picker; pad keys
  show digits left. Notes toggle beside Undo. Long press and its 700ms click
  swallower are retired (a long press is a slow tap).
- Solved board is locked (`locked()` guards every input path) — wins can't
  double-count.
- No `alert`/`confirm`/`prompt`: `armConfirm()` ("Tap again", 3s) for New,
  difficulty and Restart; a `#message` callout for the daily.
- Grader: tier 3 = XY-wing, swordfish, simple colouring; tier 4 = beyond.
  Hard 2..3 (always logic-solvable), Crazy 3..4. Carve oscillation fix
  (`kept.unshift`).
- Hints name the technique and highlight the pattern; the second tap places the
  digit (`engine.explainNext`).
- Auto-candidates button on Hard/Crazy. Daily puzzle (date-seeded, UTC) with a
  streak in `sudokuStats.daily`. Settings: Fast-fill (default on), Hide
  mistakes until the end (default off) in `sudokuPrefs` (synced).
- Generation in `js/gen-worker.js` + idle prefetch; "Generating…" state.
- SW v7: 3s network timeout → cache, query-stripped navigation keys.
- Landscape (≤560px tall): board left at full height, controls right.
- Audio: standard unlock (pointerdown/touchend/click/keydown, audioSession
  playback, suspend on hidden). Music row hidden while `music/tracks.json` is `[]`.

## Test hooks
- `?test` skips the account layer. `window.game` drives everything:
  `game.newGame()`, `game.padDigit(n)`, `game.selectCell(i)`, `game.useHint()`,
  `game.generating`, `game.spare`, `game.engine.explainNext(grid)`.
- Engine bench (node, vm-loads engine.js): 200 puzzles per level checking
  timing, band, uniqueness and soundness. Scripts live in the session
  scratchpad, not the repo.
- Older stats-only clients (pre-v7) rewrite `sudokuStats.daily` to a level-shaped
  object if they run once; harmless after the SW update lands.
