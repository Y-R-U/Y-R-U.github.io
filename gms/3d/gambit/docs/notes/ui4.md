# ui-4 notes (2026-10-31)

Aaron's phone report: (1) Settings from a game/puzzle, then back → home (puzzle lost); (2) puzzles 1 and 3
"zoomed out", no way to change view / zoom.

## Root causes
1. **Settings**: `main.js` only opened the in-place sheet on the bot-game route (and online via
   `app.openSettingsHere`); puzzles and lessons went to the full `#/settings` page, whose back arrow was
   hard-wired to `#/home`. The sheet itself had no history entry, so Android back left the screen.
2. **Small puzzle boards**: the puzzle play layout sizes the board as `min(stage width, stage height − head − status)`,
   and the stage is whatever the bottom panel leaves. Classics (#1 Fool's Mate, #3 Scholar's Mate, all 18
   `c-*` puzzles) put a story card in that panel, plus theme chips (1 or 2 rows) and, when solved, the
   Lichess link — so the panel grew and the board shrank: 360×740 boards were 262–298 px for classics vs
   360 px for plain Lichess puzzles. The puzzle **View** button only called `camera.reset()` (no cycling),
   so Top-locked users could never reach Free to zoom.

## Changes
- `js/app/settingsheet.js` (new): shared Settings sheet. Pushes one same-URL history entry, so the hardware
  back button closes it; X / scrim close pops that entry again. game.js and online_game.js now delegate to it.
- `js/app/main.js`: the gear opens the sheet on **any screen with the shared board on show**
  (`#view .board-host`: bot game, online game, puzzle, lesson), else the full page. In-tab nav stack
  (`history.state.gn` + sessionStorage `gambit.nav`): `app.prevHash()`, `app.back()`; the top-bar back arrow
  becomes `history.back()` when it points at the previous screen (arrow and Android back agree, history
  doesn't grow). `render()` forgets an open sheet on route change.
- `js/app/screens/settings.js`: full page back → the screen you came from (home only after a deep link).
- `js/puzzles/play.js` + `puzzles.css`: head (64 px), status (48 px) and the bottom panel (score + actions)
  are fixed-height; story, chips and the source link moved to an **info card over the top of the board**:
  open ~4 s when a puzzle with a story starts (not on Restart/Retry), then slides up leaving a small tab
  that straddles the board's top edge. Tap or swipe the tab down to open; tap the tab or swipe the card up
  to close; a player-opened card stays until put away. View button cycles Top → Tilt → 3D → Free (D26),
  saved to settings, label follows.
- `js/learn/player.js` + `learn.css`: View button (right end of the status row), same cycling/saving.
  Lessons did **not** have the size problem (constant 360/390 across steps at 360×740 / 390×844) — the
  coach bubble is the lesson text, so it stays.
- `js/app/views.js` (new): `syncViewButton(btn, board, view)` — label + disabled when the theme fixes the
  camera (`board.camera.fixed`, Plain = top); re-synced on the board's `theme` event and on settings
  changes in game, online, puzzles, learn.
- `js/app/ui.js` + `css/app.css`: promotion picker shows the Plain set's own piece art
  (`pieceDataURL(type, color, 120)`) when `board.theme === 'plain'`.
- `js/board/overlays.js` `setStyle()` + `board.js`: highlight colours follow every theme switch (were read
  from the first theme only).
- `js/board/board.js` `setTheme`: same id returns the same promise; a different id waits for the previous
  switch. Every screen re-applied its theme on mount, rebuilding the whole scene, and a rebuild while the
  previous `compileAsync()` was polling threw `Cannot read properties of undefined (reading 'isReady')`
  inside three.js (seen: theme switch in a puzzle → map → back into a puzzle within a few seconds).

## How to test
```
~/.claude/bin/cdp start --port 9530 -- --use-angle=metal --use-gl=angle --ignore-gpu-blocklist
node tools/ui4_cdp.mjs all --out=DIR    # or: sizes | info | views | settings | theme | plain | desk
```
`sizes`: 7 puzzles (classics with long stories + Lichess) and 6 lessons at 390×844 and 360×740, DPR 3 —
every puzzle board 390 / 360 (was 366–390 / 262–360). The tool clears `gambit.settings` at the end
(board_game_test expects default settings in a shared profile).

Last run: ui4 sizes 6/6, info 8/8, views 6/6, settings 17/17, theme 1/1 (+0 errors), plain 7/7, desk 1/1;
puzzles_test ALL PASS (4760), learn_test 979/979, board_test 18/18, board_game_test 14/14,
puzzles_cdp no errors, ui2_cdp ctx + shots ALL PASS. learn_cdp not run (needs the qa_cdp daemon).

## Open / notes
- With the Plain theme (no board frame) the closed info tab covers ~13 px of the d8/e8 squares' top edge.
- A puzzle opened by deep link has no previous screen: back leaves the site (browser behaviour).
