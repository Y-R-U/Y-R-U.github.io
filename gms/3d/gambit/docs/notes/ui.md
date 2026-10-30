# ui agent notes

Owner of `index.html`, `css/`, `js/app/` (except `net.js`), `tools/ui_*`.

## Done
- **Shell**: hash router (`js/app/main.js`), top bar (logo / back + title, fullscreen, settings),
  boot overlay + watchdog, screen enter transitions, toasts, dialogs, bottom sheets (centred
  modal on desktop). Portrait-first; desktop landscape puts the board left, panel right.
- **Art direction** (refs/README.md "UI cues"): midnight blue-black background, gold accent,
  thin gold borders on translucent dark panels, round crest medallions (lion SVG for the
  player, bot emoji in a hue-tinted medallion for bots: cool for beginners, red for the strong
  "dragon" end), Cinzel (Google Fonts) for titles/names, system sans for numbers and clocks.
- **Screens**: Home (continue-game card, Play Bots, Online, Puzzles, Ladder, Learn "soon",
  stats strip), Bot select (tiers, record vs each bot, "Win +N" preview, locked "Too strong for
  this device" via `botAvailable` + `benchmark()`), Game setup (bot card, win/draw/loss
  points, play as W/random/B, all D8 time controls incl. Unlimited), Game, Results sheet,
  Ladder (leaderboard + My stats tabs), Settings (theme cards with mini previews, battle speed
  Off/1×/2×/5×, board view Top/Default/Angled, sound, move confirmation, coordinates, reset),
  Online / Puzzles / Learn placeholders (Online shows the D10/D11 cheating warning and D12
  allowance).
- **Game**: player plates with medallion, name, rating, captured pieces as icon + count, material
  +N, clock (gold when running, red pulse under 20 s); move list (horizontal strip under the top
  bar in portrait, two-column table in landscape); actions: Resign/Abort, Draw, Undo, Hint,
  Flip, View (camera reset), battle-speed quick toggle (cycles). After the game the bar becomes
  Results / Rematch (colours swap) / New bot / Flip.
- **Clocks** (`js/app/clock.js`, UI-owned): the mover's clock is banked (+increment) on the move,
  then `await board.applyMove()` (incl. battle) and only then the side to move's clock starts
  (D6). White's first move is untimed. Flag vs a side that can't mate = draw. Clocks pause while
  the tab is hidden (bot games only). Low-time beep once under 10 s.
- **Bot games**: `think(fen, {startFen, moves, timeLeftMs, incMs})` (history-aware so bots see
  repetitions). A stale think (undo / resign / leaving) is discarded by a generation counter.
- **Draw offers**: bot asks the engine (`hint()` eval, 400 ms, material fallback). Declines before
  move 15, when ≥ +1.5 for itself; accepts when ≤ −2; otherwise accepts if roughly level and the
  bot is weaker than your ladder Elo, or very late in a level game. One offer per 10 plies.
- **Undo & hints (decision)**: allowed vs bots, but either one marks the game **assisted**:
  ladder points ×0.5, half-K Elo update, never a "best win", shown as an "assisted" tag. A
  confirm dialog explains this the first time in a game. Undo takes back to your turn.
- **Promotion**: board calls `board.onPromotion({color})`; ui shows a 4-piece picker over the
  board. **Move confirmation**: `onMoveAttempt` returns a Promise resolved by a ✓/✕ bar, the
  board holds the dropped piece meanwhile.
- **Resume**: `gambit.resume` (local only) saved after every move, on hide/pagehide and when
  leaving the game screen: bot, tc, colour, LAN moves, both clocks, assisted flag. Home shows
  "Game in progress · Continue / Discard". Starting a new game asks before discarding it.
- **Ladder** (`js/app/ladder.js`, D9/D20): 200 seeded rivals (seed in `gambit.ladder`, so
  stable and synced): 5 legends (~120k → ~1M), a lognormal body (median ~750), and 30
  newcomers (2–90) so first wins visibly climb. Rival scores grow slowly per day (pure function
  of days since creation, capped ×3). Player sits above rivals on a tie.
  Points (tuned D20):
  - win  = 40 × clamp(2^((bot − ladderElo)/200), 0.1, 64)
  - draw = 25 × same
  - loss = 10 × min(3, 1 + diff/400) vs stronger bots; 10 × max(0.1, 2^(diff/200)) vs weaker.
    **Change from D20**: as written D20 paid 10 for any loss, so losing to Pip (6 for a win)
    earned more than beating him. Verified win ≥ draw ≥ loss across 100–2600 × all bot Elos.
  - assisted ×0.5; min 1 point.
  Ladder Elo starts 800, Elo update vs bot Elo, K 48 → 32 → 20 by games played.
  Examples at 800: Pip win 6, equal bot win 40, 1200 bot win 160, 2400 bot win 2560 (cap).
- **Stats** (`gambit.stats`): games, W/D/L, per-bot W/D/L, best unassisted win, last 30 games.
- **Accounts** (`js/app/cloud.js`): `syncLocalKeys({gameId:'gambit', nudge:'callout', canPester})`
  dynamically imported with catch (skipped under `?test` / `?nocloud`); `matchFinished()` on
  results (not for aborted games); `canPester` = false only on the game screen while a game is
  live; top bar right side shifts by `--br8t-account-space`. **Synced keys = every `gambit.`
  key** (`gambit.puzzles` listed explicitly + any present at boot) **except local-only ones**:
  anything ending `.resume` or `.bench`, or starting `gambit.local.`. No dailies yet; if one is
  added follow the dailies rule (UTC date string, `last >= today`).
- **Fullscreen**: button hidden when `fullscreenEnabled` is false (iOS Safari). Wake lock while
  the game screen is up (re-acquired on visibility). Safe-area insets, `overscroll-behavior:none`,
  no double-tap zoom.
- **Plug-in screens**: `PLUGINS` in `js/app/main.js`. One line registers a route:
  `puzzles: () => import('../puzzles/screen.js'),` — module exports `mount(container, ctx)`
  returning an optional cleanup fn or `{leave()}`. `ctx = {app, deps, params:{rest}, go(hash),
  setTop({title, sub, back}), canPester(fn)}`. `#/puzzles/<anything>` passes `rest`. It
  overrides the built-in placeholder for that route. `app.deps.chess / .bots / .board` are the
  loaded modules (`createBoard` usable directly).
- **Shims** (`js/app/shim/`): chess (perft-checked), bots, flat DOM board — used only if a real
  module throws on import, or forced with `?shim=all` / `?shim=board,bots`. `deps.js` flags are
  now all real.

## How to test
```
~/.claude/bin/cdp start --port 9503
node tools/ui_cdp.mjs play     # full game vs Pip through the real UI path, checks ladder/stats/resume
node tools/ui_cdp.mjs shots    # every screen at 360×740, 412×915, 1440×900 (+resign, results, resume)
node tools/ui_cdp.mjs reload   # account layer ON: frameNavigated count over 12 s must be 1
```
`--out=DIR` for screenshots (default /tmp/gambit-ui). All modes exit 1 on any console error,
exception, failed resource, or `[gambit]` warning (that is how a silent shim fallback is caught).
`window.__gambitTest()` exposes `{ready, myTurn, over, plies, result, playAny(), playBest()}`.
**Start the test Chrome on the real GPU** or the 3D board runs at ~2 fps and games stall:
`~/.claude/bin/cdp start --port 9503 -- --use-angle=metal --use-gl=angle --ignore-gpu-blocklist`
(gives ANGLE Metal, 60 fps).

## Requests
- **board**: none blocking. Nice to have: `board.setTheme` resolving cleanly for an unknown id is
  already handled by your fallback. If you want a different promotion picker placement, the ui
  owns it (it draws centred over the board; `squareToScreen` could anchor it at the square).
- **core**: none blocking. `hint()` score is used for bot draw decisions (`score` cp from the side
  to move, `mate`).
- **manager**: D20 loss formula changed (see above) — please fold into DECISIONS. D24 (online
  battle cap) is for whoever builds the online game screen; bot games keep D6.
- **online agent**: `js/app/net.js` guide is in docs/notes/server.md; reuse `.pbar` plate markup,
  `fmtClock`, results sheet styles from `js/app/screens/game.js`.

## Open issues
- Learn is a placeholder (D14, last). Online screens left to a later agent (placeholder route kept).
- Move list is not clickable for reviewing earlier positions yet.
- No premoves.
- Lion crest is a simple procedural SVG; a proper heraldic lion would be nicer.

## ui-2 (2026-10-31)
Owner now also of `js/app/screens/online*.js`, `css/online.css`, `js/puzzles/` (puzzles agent done), fixes in `net.js`.

### Done
- **One shared WebGL board** — `js/app/boardhost.js`. Bot game, online game and puzzles all borrow the
  same `createBoard` instance (created on first use with the current settings). API:
  ```js
  import { acquire } from '../app/boardhost.js';
  const lease = acquire(container, { fen, orientation, animSpeed, labels, keyboard, legalMoves, onMoveAttempt,
                                     onPromotion, onRevoke() { board = null; } });
  lease.ready.then(b => { if (b) board = b; });   // null if another screen took the board first
  lease.on('view', fn);                            // board events, unsubscribed on release
  lease.track(onSettings(fn));                     // any cleanup fn, run on release
  lease.release();                                 // in leave(): detaches, keeps the board alive
  ```
  `acquire` moves the one `.board-host` div (canvas inside) into `container` and resets interactivity,
  handlers, highlights, arrows, name tag, orientation, position (no animation), labels/keyboard
  options and any running battle. `release` makes it inert (keyboard off so V / arrows don't act on a
  hidden board). Only one lease is live; a new acquire revokes the old one. The container must be
  `position: relative` with a size (`.board-square` / `.pz-board`). Verified: bot game → puzzle →
  online game → home → bot game → online game = **1 WebGL context** (`tools/ui2_cdp.mjs ctx`).
- **Portrait game layout**: `.screen.game` is the size container. Column = move box (flex, takes every
  spare pixel) / opponent bar / board (full width) / your bar / toolbar (anchored). Bars grow 50→64 px
  (`--bar-h`). Move box is a container (`moves`): short = one-line strip, ≥ 84 px = wrapped scoresheet
  with ◀ ▶ bottom-right; empty state shows the bot's blurb when ≥ 150 px. 360×740: moves 133 / bars 64 /
  board 360; 390×844: 207/64/390; 412×915: 256/64/412; zero gaps. Board sits low, near the thumb.
  Landscape unchanged (+ a short-landscape-phone rule: 44 px bars, narrower panel).
- **Move review** (`js/app/review.js`, used by game.js + online_game.js): tap any move → that position
  (setPosition, no animation, last-move + check highlight), gold frame round the board, ◀ ▶ and ← →
  (not in Free view, where arrows orbit) step, gold "Move N · Live ▸" chip returns. Board is
  non-interactive while reviewing. A new move (bot / opponent / server resync / undo) ends review and
  animates from the right position. Premoves: skipped.
- **Promotion**: shared `promotionPicker(stage, {color, to, board})` in ui.js, used by all three screens
  via `board.onPromotion`; anchored next to the target square (`squareToScreen`), so the dragged pawn
  stays visible hovering on it; tap outside cancels.
- **Online home on phones**: compact me card (small crest, one-row ratings, one-line allowance chip with
  "Sign in: 5/day"), Quick match as a 4-column chip grid (time + category) with Rated/Casual beside the
  heading: all chips above the fold at 360×740 (bottom 527 px). The D10/D11 warning sits right under the
  chips, full text (+ friends tip) until the first online game, then a one-line expandable summary
  (`onlineWarnSeen` setting / any rated games). Leaderboard warning unchanged.
- **No server → "Online play is coming soon"**: `net.js` `ONLINE_PUBLIC = false` (flip on deploy). Hosts
  other than localhost/LAN then have no server base at all: `net.available()` is false with **zero
  requests**, the Online screen shows a friendly coming-soon page (Play a bot / Puzzles), no websocket,
  no console errors. LAN with the dev server down: one /api/health probe → "Can't reach the online
  server" + Try again (no reconnect loop). Test hooks: `?server=none`, `?server=<base>`.
- **Home "online game in progress" card** from `gambit.local.online` (local-only key, net.js writes it on
  welcome / start / move / end; stale after 2×base+5 min for timed, 4 days for Unlimited). No
  connection at boot; hidden when no server is configured. Home Puzzles item shows "N solved · rating".
- **Puzzles**: PLUGINS line enabled; `play.js` on the shared board host; wrong move = `board.shake()`
  (new one-liner in board.js public API, camera shake via the rig) instead of the CSS shake.
  Cloud-sync `describe` line "N puzzles solved · rating R"; Settings → About credits the Lichess CC0 DB.
- **D24 battle cap (from battle agent)**: `board.applyMove(m, {battle, capMs})` — new option, board.js
  forwards `capMs` into the battle ctx (surgical edit in `doApplyMove`); `js/themes/battle_util.js` `prep()`
  compresses themed battles to fit. online_game.js passes `capMs: 1200` in timed games; the wall-clock
  `board.skip()` stays only as a safety net at 1.6 s.
- **Lion crest**: new heraldic lion (two-layer swirling mane, ears, gold face with dark detailing) in
  `ui.js` `LION`.

### How to test
```
tools/server_run.sh --bg
~/.claude/bin/cdp start --port 9518 -- --use-angle=metal --use-gl=angle --ignore-gpu-blocklist
node tools/ui2_cdp.mjs shots   # 360/390/412 portrait + 1440: layout gaps, review, online home above-the-fold
node tools/ui2_cdp.mjs ctx     # 2 tabs: bot → puzzle → online game → home card → bot: 1 WebGL context; online review
node tools/ui2_cdp.mjs soon    # ?server=none: coming soon, zero server requests; unreachable server card
```
Gotcha: a background tab gets no rAF in headless Chrome, so board animations never finish there —
`Page.bringToFront` the tab that plays. Last run: all three ALL PASS, plus ui_cdp shots/play,
board_game_test 14/14, online_cdp all, puzzles_cdp — zero console errors.

### Open
- The online server restarts now and then (another agent); a test running across a restart logs a
  websocket error — rerun.
- Online hint is per browser, so two tabs as two dev players share it (test artefact only).
