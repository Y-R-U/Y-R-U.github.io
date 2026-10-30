# learn — notes

Owner of `js/learn/`, `tools/learn_*`, this file. One line in `js/app/main.js` PLUGINS:
`learn: () => import('../learn/screen.js'),` (routes `#/learn` = course map, `#/learn/<lessonId>` = lesson).

## Done
- **Course** (`js/learn/data.js`): 3 units, 27 lessons, 103 steps.
  - **The Basics** (14): The Board (files, ranks, square names + a 6-square coordinates game), The Rook, The Bishop,
    The Queen, The Knight (incl. "tap every square the knight reaches"), The King, The Pawn, Promotion, Check (give
    check; escape by capture / block / king move), Checkmate (3 mate-in-ones: back rank, queen + king, smothered),
    Stalemate (quiz + a mate-in-one with three stalemate traps), Castling (both sides; the can't-castle-through-attack
    rule as a quiz), En Passant (Black's double step is played, then you capture), Draws (insufficient material,
    threefold, 50-move, agreement).
  - **Fundamentals** (10): Piece Values (points, two trade quizzes, take the free piece), Opening Principles (tap the
    centre, a guided 1.e4 e5 2.Nf3 Nc6 3.Bc4 Bc5 4.O-O), Forks (knight, pawn, queen), Pins (pawn attacks a pinned
    knight; pin the queen to the king), Skewers (rook, bishop), Discovered Attacks (discovered check wins the queen;
    knight jumps with check, rook takes the queen), Mate with the Queen and Mate with the Rook (play the engine from
    a set position within 15 / 30 moves), The Square Rule (quiz + race), The Opposition (K+P vs K, only Ke4 wins).
  - **Next Steps** (3): Checks, Captures, Threats (one drill each; "safe:" goal = move the attacked queen anywhere
    safe), Ratings & the Ladder (how Elo / ladder points / bot ladder / puzzle rating work + a quiz), Where to Go
    Next (links to Puzzles, Play Pip, All bots).
- **Step types**: info (arrows, square zones, value tags, legal dots, name tag, animated demos with Replay), tap
  (coordinates game / find-all squares), stars (one piece on a practice field collects glowing stars and captures
  sleeping black pieces in ≤ N moves; a pawn that promotes becomes a queen), move (guided tasks, fixed replies,
  goal = LAN list or mate/check/promo/ep/castle/safe:<sq>), quiz, play (practice vs the engine via `hint()`, move
  limit; K+P tasks judged by an exact bitbase after every move), cta.
- **Player** (`js/learn/player.js`): coach crest + speech bubble (1–2 sentences, step progress bar) above the shared
  board (`js/app/boardhost.js` lease — one WebGL context with games/puzzles), status line, action panel (Hint ·
  Restart · move counter · Next / Try again, previous-step arrow). Immediate feedback: `correct`/`wrong`/`solved`
  sounds, camera shake, red status with the coach's gentle hint text; stalemating moves get their own message; after
  two misses the piece to move lights up automatically; Hint = piece, More hint = arrow. Star pick-ups fly off with
  a `sparkle`. Lesson end: gold burst card with 1–3 stars (3 = no misses/hints, 2 = ≤ 2, else 1), Course / Next
  lesson. Enter = Next on desktop. Battles at 2× in lessons (Off if the user set Off); theme / view / coordinates
  follow settings; name tags on.
- **Overlay** (`js/learn/overlay.js`): SVG zones, stars, value tags and the square-tap layer are placed by projecting
  the board's world squares through its camera every frame (only while something is shown), so they stick to the
  squares in Top / Tilt / 3D / Free. No changes to board.js.
- **Map** (`js/learn/map.js`): hero card (progress ring, stars), unit banners in the puzzle-map style, a dotted gold
  trail of lesson nodes (piece glyph / gold check when done, number badge, stars). All lessons are open (improving
  players can skip ahead); the first unfinished one pulses with START and a floating Continue button.
- **Progress** (`js/learn/progress.js`): `gambit.learn` = `{v:1, l:{lessonId: bestStars}, last, savedAt}`.
- **K+P bitbase** (`js/learn/kpk.js`): exact win/draw for K+P v K by retrograde iteration, built lazily (~0.2 s).
- **Practice field** (`js/learn/field.js`): lone-piece move generator, BFS solver and BFS hint.

## How to test
```
node tools/learn_test.mjs            # validates every lesson (~20 s); --quick skips the engine self-play
~/.claude/bin/cdp start --port 9531 -- --use-angle=metal --use-gl=angle --ignore-gpu-blocklist
node tools/qa_cdp.mjs serve --ports=9531 --http=9631 --out=DIR &          # (run in the background)
node tools/learn_cdp.mjs --http=9631 --size=360x740m --fresh --shots --lessons=board,forks,routine
node tools/learn_cdp.mjs --http=9631 --size=1440x900 --lessons=rook,pins,ratings
```
`learn_test.mjs` checks: legal FENs, legal demos / pre-moves / expected moves / replies along every accepted
branch, every mate task has a mate and accepts only mates, stalemate traps exist, tactic drills agree with the
engine (`checkUnique`, gap ≥ 150 for single-answer drills), star fields solvable in exactly `max` (BFS), tap
targets, K+P claims vs the bitbase and promotion forceable within `max` (exact minimax over the bitbase), K+Q / K+R
practice mated by the engine against its own best defence within `max`, coach text ≤ 230 chars.
`learn_cdp.mjs` plays lessons with real taps (touch on phones) using `window.__learnTest().expected()` /
`suggest()`, plays one deliberate wrong move + hint in the 2nd lesson, then checks stars saved, the map after a
reload, one shared renderer across lessons, one canvas, zero console errors.

## Requests
- **ui / qa (home.js)**: the Home menu still shows Learn as `muted` with a "Soon" badge. Suggest: drop `muted` and
  the badge, subtitle from progress, e.g.
  `const lp = JSON.parse(localStorage['gambit.learn'] || '{}'); const n = Object.keys(lp.l || {}).length;`
  → `n ? \`${n} of 27 lessons done\` : 'Lessons for new players'`.
- **ui / qa (store.js / cloud.js)**: add `'gambit.learn'` to `KNOWN_SYNCED` so a brand-new key syncs in the same
  session (today it is picked up from the next boot, like any `gambit.` key present at boot), and optionally a
  `describe()` line: `` `${Object.keys(l.l).length} lessons done` ``.
- The old `learn` placeholder page in `js/app/screens/placeholder.js` is now unreachable (the plug-in wins); can go.

## Last run (2026-10-31)
- `node tools/learn_test.mjs` → ALL PASS 979/979 (K+Q engine mates in 8–11 of 15, K+R in 13–15 of 30, square race
  forced in 4/4, opposition forced in 11/12 with Ke4 the only winning first move, all tactic gaps ≥ 150).
- `learn_cdp.mjs` 360×740 touch: board, checkmate (wrong move + hint → 2★), promotion (picker), castling, en passant,
  forks, kqk (beat the engine), opposition (bitbase-checked), routine, next — ALL PASS; values, discovered, krk —
  ALL PASS. 1440×900 mouse: rook, stalemate, pins, square, ratings; knight, opening, skewers, next — ALL PASS.
  Every run: progress persisted after reload, one renderer across lessons, 1 canvas, 0 console errors.
  Also lesson → puzzle → lesson keeps the same renderer (1 WebGL context).

## Open issues
- Overhead (Top view) phone screens show small pieces on a lone-piece board; fine, but a closer camera for
  practice fields would read better (needs a board camera zoom option — board-owned).
- Black's defence in the K+Q / K+R practice uses `hint()` at 450 ms; on a slow phone the reply takes ~0.5 s.
- Coach copy is ear-untested by a beginner; 230-char cap per step is enforced by the test.
