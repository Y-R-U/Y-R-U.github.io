# GAMBIT — Decisions

Working title GAMBIT. A chess.com-style site/game: 3D themed pieces, fun move and battle
animations, bots with rankings, puzzles, online play. Folder `gms/3d/gambit/`.
The manager owns this file; agents propose changes in their notes.

## Product (from Aaron, 2026-10-31)
- D1 **Portrait, mobile-first**; also desktop landscape. Fullscreen toggle (shown where the
  Fullscreen API works: Android Chrome, desktop; hidden on iOS Safari).
- D2 **Three.js board**, default camera **almost directly overhead** (a "Top" preset can go fully
  overhead). Pieces must read well from overhead AND from angles: strong silhouettes, distinct
  crowns/tops, team colour visible from above.
- D3 **Look around**: arrow keys / WASD orbit, finger/mouse drag on empty space orbits, pinch /
  wheel zooms, a "reset view" button. Dragging a piece moves it (does not orbit).
- D4 **Themes (piece sets)**: Classic (Staunton-ish), Fantasy (wizards/witches/knights/dragons…),
  Halloween, Sci-fi. More later. Each theme = 6 piece models × 2 sides + a board style + move
  animations + battle animations + optional sounds.
- D5 **Move animations**: several per theme, picked at random; **snappy** (≤ ~350 ms at 1×).
- D6 **Battle (capture) animations**: longer, per theme, can be over the top. Speed setting
  **Off / 1× / 2× / 5×**. Off = a plain snappy capture. Tapping during a battle skips it.
  Battles never block clocks unfairly: in timed games the clock of the player to move starts
  only after the animation, and online games default battles to 2× unless the user changes it.
- D7 **Bots**: a ladder of named bots with an estimated Elo each (~250 → ~2400+). All AI runs
  in the browser in a Web Worker. A one-off device benchmark estimates speed; bots whose think
  time would be too long on this device are shown locked with "too strong for this device".
- D8 **Time controls**: Bullet 1+0, 2+1; Blitz 3+0, 3+2, 5+0, 5+3; Rapid 10+0, 10+5, 15+10;
  Classical 30+0; Daily-style **Unlimited**. Custom later.
- D9 **Bot ranking (personal / "global" ladder)**: a leaderboard of generated players with
  random names and scores, some very high, plus the player. Points for every bot game; win or
  draw vs stronger bots scales **heavily** (see D20). Local, no server needed.
- D10 **Online ranking**: Elo-style rating from online games, server leaderboard. Shown with a
  warning: "The server does not try to detect cheating yet — if you think an opponent cheated,
  try not to stress about it."
- D11 **Online play**: waiting rooms/lobby (public rooms + private room codes to play friends),
  quick-match by time control. Same cheating warning; suggest playing people you know.
- D12 **Online allowance**: no login 2 games/day, logged in 5/day, BR8T Pass unlimited.
  Bots and puzzles are unlimited for everyone.
- D13 **Puzzle mode**: a map (chain/tree) of many puzzles, easy → hard; mate-in-1 early, then
  2- and 3-move solutions, tactics; replayable; stars per puzzle. Mix of real-game puzzles and a
  few classic composed problems.
- D14 **Learn mode**: built LAST, after the rest of the game is done.
- D15 **Login**: the shared account layer `/lib/auth/` (read `/games/CLAUDE.md`). Cloud-sync
  progress (bot ladder, puzzles, settings, themes) with `syncLocalKeys`.

## Technical
- D16 Vanilla JS ES modules, no build step. Three.js **0.180.0** vendored at `/gms/lib/three/`
  (import map: `three` → `/gms/lib/three/0.180.0/three.module.js`, `three/addons/` →
  `/gms/lib/three/0.180.0/addons/`). Absolute paths so it works on games.br8t.com too.
- D17 Pieces are **procedural Three.js geometry** (lathe/extrude/merged primitives + materials),
  not downloaded models, so themes stay light and fast. Sculptor agents build 1–2 piece types
  per theme at a time against a shared kit + MODEL_GUIDE.
- D18 Chess rules: our own JS core (`js/chess/`), perft-tested. One source of truth for client,
  bots and puzzles.
- D19 Server: a Go + SQLite service for lobby/rooms/relay/clocks/ratings, modelled on
  `gms/2d/clued/server/` (Firebase ID-token verification, allowance via br8t-payments with
  `chess=5` signed-in; the server itself tracks the 2/day for anonymous uids). Lives in
  `gms/3d/gambit/server/`. **Not deployed until Aaron okays it.** Validates moves server-side.
- D20 Bot ladder points (initial, tune later): base = 10 for a loss, 25 draw, 40 win, then
  × 2^((botElo − playerLadderElo)/200) for draws/wins (capped ×64), losses vs much stronger bots
  still earn a little extra (× up to 3). Faster time controls don't change points.
- D21 Local dev URL: http://192.168.0.236:8888/gms/3d/gambit/ (yru-site server).
- D22 Git (Aaron, 2026-10-31): the **manager** commits + pushes on major milestones, staging
  only `gms/3d/gambit/` (+ `gms/lib` additions, `projects.js`, its screenshot) — the repo has
  hundreds of unrelated dirty files, never `git add -A`. Agents never commit. The projects.js
  entry goes in once the board looks good enough to show off. VPS deploys still need Aaron's OK.
- D23 Online server (server agent): Glicko-2 per category (bullet/blitz/rapid/classical/daily),
  provisional while RD>110; a game counts against the allowance once both sides have moved;
  Go rules in-house (perft-verified); loopback :8019 on the VPS, local dev :8094.
- D24 Online lag + animations (manager): server gives a lichess-style lag credit per move
  (up to min(measured round-trip lag, 1000 ms, quota); quota = 3×gain refilled by gain/move, gain 140–300 ms); in **online timed** games battle animations are
  capped to ~1.2 s total regardless of the speed setting (Off still allowed), so the receiving
  player's clock cost is small and equal for both. Bots/offline keep D6 (clock waits for anims).
- D25 Ladder loss points (ui, accepted by manager; amends D20): loss vs stronger bot =
  10 × min(3, 1 + diff/400); vs weaker = 10 × max(0.1, 2^(diff/200)), so win ≥ draw ≥ loss always.
  Undo/hint vs bots allowed but mark the game "assisted": ×0.5 ladder points, half Elo change,
  never a "best win".
- D26 Camera views (Aaron, 2026-10-31): default **Top, locked** (drag/arrows/pinch don't move
  the camera). The View button (and V key) cycles Top → Tilt (13°) → Angle (~48°) → Free; only
  Free orbits/zooms. Saved in the `view` setting; legacy 'default' = 'tilt'. Amends D2/D3.
- D27 Piece name tags (Aaron, 2026-10-31): tap an enemy piece with nothing selected, or select one of
  your own → elegant tag above its head, fades after ~4 s (Aaron: 3–5 s); desktop hover any piece ~250 ms → tag. DOM overlay, gold-bordered pill,
  Cinzel. Themes may supply `names` ("Wizard · Bishop"). Board option `labels` (default on).
- D28 Contrast (Aaron, 2026-10-31): black pieces must read on dark squares from overhead at phone
  size. Lighter dark squares (slate/walnut-grey, not near-black), stronger black-piece rim/spec,
  contact AO under pieces. A rule for every theme (MODEL_GUIDE).
