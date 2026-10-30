# puzzles — notes

Owner of `js/puzzles/`, `assets/puzzles/`, `tools/puzzles_*`.

## Requests
- **ui (one line, js/app/main.js)**: enable the plug-in —
  `puzzles: () => import('../puzzles/screen.js'),` in `PLUGINS`. Sub-routes used:
  `#/puzzles` (map) and `#/puzzles/p/<id>` (play) — both arrive via `params.rest`.
  The screen calls `ctx.setTop()` (map: back → `#/home`; play: back → `#/puzzles`) and
  `ctx.canPester(() => !midPuzzle)`.
  - The plug-in wrapper sets `body[data-route]` to `puzzles` for both views; the play view
    needs `#view` not to scroll, which puzzles.css does with `#view:has(> .pz-play)`. If you
    ever want a distinct route name for the play view, `mount()` returns `route: 'puzzle'`.
  - Home menu subtitle could show progress: `JSON.parse(localStorage['gambit.puzzles']).r`
    (rating) and `Object.keys(.s).length` (solved) — optional.
- **ui (cloud sync)**: confirmed `gambit.puzzles` is in `KNOWN_SYNCED` (store.js) and cloud.js
  mirrors every `gambit.` key. Nice-to-have: a `describe()` line, e.g.
  `` `${Object.keys(p.s).length} puzzles solved · rating ${p.r}` ``.
- **ui (credits)**: when a Settings → About / credits section exists, add
  "Puzzles from the Lichess.org open database (CC0)." (text also in
  `assets/puzzles/CREDITS.txt` and `index.json.attribution`; the map footer shows it already).
- **board (optional)**: a public `board.shake(amp, ms)` (camera shake) would be nicer than the
  CSS shake of the board container used for wrong moves.

## Done
- **Data** (`assets/puzzles/`, 618 puzzles, ~135 KB total, lazy per region):
  `index.json` (ids + ratings per region, attribution) + one chunk per region.
  600 from the Lichess open database (CC0) + 18 classics.
  Selection (`tools/puzzles_build.mjs`): popularity ≥ 94, ≥ 1500 plays, RD ≤ 78 (looser
  88/800/85 for the 400–900 band and 2000+ where strict ones are scarce), one puzzle per
  source game, rating-stratified into 8 bins per region, theme rotation per region.
- **Classics** (`tools/puzzles_classics.mjs`, each with a story line): Fool's mate, Scholar's
  mate, Arabian mate, Légal's mate, Boden's mate, Anastasia's mate, Philidor's legacy
  (smothered, mate in 4), Englund Gambit trap, Elephant trap, Blackburne Shilling trap, Lasker
  trap (…fxg1=N+), Opera Game, Réti–Tartakower 1910, Immortal Game, Evergreen Game (mate in 5),
  Ed. Lasker–Thomas 1912 (start of the king hunt), Réti's study 1921 (draw), Saavedra 1895
  (c8=R!). Built from move lists so FENs are exact; mates proved by the solver; for the
  non-forced lines every player move was checked with core's `checkUnique` (engine best,
  clear gap) except the deliberately "trappy" Englund moves (goal text says "Spring the trap").
- **Validation**: every puzzle validated with `js/chess/chess.js`; mate-in-1..3 (classics up
  to 4) proved with core's `solveMate`: key move forces mate in N, no faster mate, unique key
  for N ≥ 2. `node tools/puzzles_test.mjs` → ALL PASS (4.7k checks, ~45 s).
- **Lichess convention handled**: FEN is before the opponent's move; `m[0]` is played on the
  board as a quick animated setup move, then the player moves. Classics without a setup move
  carry `pf:1`.
- **Move checking** (`js/puzzles/logic.js` `PuzzleRun`): the line's move, or ANY move that
  checkmates (chess.com/Lichess behaviour). Opponent replies auto-play. Under-promotion is
  asked via a promotion picker (Saavedra / Lasker trap need R / N).
- **Map** (`js/puzzles/map.js`, `layout.js`, `art.js`): 8 chapters — First Steps, Forks &
  Pins, Mating Nets, Hidden Blades, Sacrifice Cliffs, Endgame Vale, Storm Keep, Grandmaster
  Peaks — a winding SVG trail top→bottom with banners (Cinzel, gold trim), region glow +
  margin silhouettes (pines, swords, nets, daggers, flames, crowns, bolts, peaks), all inline
  SVG/CSS. Rows of 1–3 nodes: 2-lane stretches are parallel side paths (stuck on one lane?
  take the other), they rejoin at single nodes. Classics are gold diamonds with their name.
  Locks: a node opens when a node leading to it is done; a chapter opens when the previous
  chapter's last node is done **or** the puzzle rating reaches the chapter's threshold
  (1050/1200/1350/1500/1600/1800/2050). Stars under solved nodes, PLAY tag on the next node,
  sticky HUD (rating + trend sparkline, solved x/618, stars), floating "Next puzzle", Puzzle
  Rush teaser card, attribution footer.
- **Play** (`js/puzzles/play.js`): the real board (`createBoard`, one persistent instance,
  theme/battle speed/view/coords follow settings). Wrong move = snap back + shake + red
  status, costs a star. Hint: 1st tap highlights the piece, 2nd shows the arrow (one star per
  move hinted). Solution button plays the rest (0 stars, still unlocks onward). Final move
  uses the battle animation if it captures; gold-burst celebration + stars; Retry / Map /
  Next puzzle; link to the source Lichess game after solving. Portrait: board full width,
  goal above, status + actions below. Landscape: side panel.
- **Stars**: 3 = first try, no hint; −1 per miss and per hinted move, min 1; reveal = 0.
  Best stars kept on replay.
- **Rating**: Elo vs the puzzle rating, start 800, K 40/32/20 (first 10 / 30 / after).
  Only the first attempt counts; the first miss/hint/reveal is charged immediately (so
  reloading does not dodge it). Replays never move it.
- **Storage** `gambit.puzzles`: `{v, s:{id:stars}, a:{id:attempts}, r, n, pk, h:[last 30
  ratings], last, savedAt}` — compact (≈15 bytes per solved puzzle).

## How to test
```sh
node tools/puzzles_test.mjs                 # validates every shipped puzzle + map graph
~/.claude/bin/cdp start --port 9510
node tools/puzzles_cdp.mjs --out=DIR        # via index.html once the PLUGINS line is in
node tools/puzzles_cdp.mjs --page=tools/puzzles_preview.html --out=DIR   # standalone harness
```
`tools/puzzles_preview.html` is a minimal copy of the shell that routes `#/puzzles…` to the
screen, so the screen can be tested before the ui hook lands.
Test hooks: `window.__puzzleTest()` → `{id, ready, finished, expected, playExpected(),
playWrong(), hint(), reveal(), result, next}`; `window.__puzzleBoard()`.

Rebuild data (raw DB stays out of the repo):
```sh
curl -LO https://database.lichess.org/lichess_db_puzzle.csv.zst      # ~300 MB, scratch dir
zstd -dc lichess_db_puzzle.csv.zst | awk -F, 'NR==1 || ($6+0>=88 && $7+0>=800 && $5+0<=85)' > cand.csv
node tools/puzzles_build.mjs cand.csv && node tools/puzzles_test.mjs
```
Bump `V` in `js/puzzles/data.js` when chunks change.

## Later
- **Puzzle Rush** (not built): 3-minute / 5-minute / survival modes drawing random puzzles
  from all chunks in rising rating order (start ~600, +~60 per solve), three strikes out,
  personal best in `gambit.puzzles.rush`. Teaser card is on the map footer. Could also be a
  daily puzzle (UTC date rule from games/CLAUDE.md).
- More classics (Lucena/Philidor rook endings need a "any winning move" checker — they have
  many equally good moves, so they don't fit the strict one-line format).
- Alternative non-mating moves are rejected even if they also win (as on Lichess); the
  Lichess set is generated to be unique so this is rare.

## Open issues
- Headless testing on this machine is slow while core's tourney runs (load ~47): board
  creation can take 20–40 s; the CDP script uses long timeouts.
