# clientfix notes (2026-11-01)

Fixes for the adversarial client review (review_client/REPORT.md, in the session scratchpad).

## 1. WebGL context restore lost the env reflections (3D themes ~18% darker)
`board.js`: the PMREM env map is a render target, so its texels die with the context. `applyTheme` now keeps
the env source scene (`envSrc`) and bakes it through `bakeEnv()`; the `webglcontextrestored` handler calls
`bakeEnv()` again before redrawing. Nothing else in the themes renders to a texture (CanvasTexture /
DataTexture re-upload from their CPU image; the shadow map redraws via `shadowDirty`).
Verified with the lose/restore script in all 5 themes: mean RGB before = after = after a move
(classic 66/63/62, previously 54/52/52 after restore).

## 2. Corrupt / legacy synced storage
Normalised on read, storage never rewritten (the next real save writes the clean shape):
- `store.js` `getStats` (counts, `perBot` object of {w,d,l}, `bestWin` or null, `recent` filtered to
  objects with a valid result, numbers coerced), `getLadder` (finite numbers, defaults), `getSettings`
  (booleans, 0..1 volumes, battleSpeed in off/1/2/5, theme string, lastTc format, lastColor), `getResume`
  (botId required, moves array of strings, tc format, colour, clocks finite or null).
- `puzzles/progress.js` (s/a objects of numbers, h numeric array, r/n/pk finite, last string),
  `learn/progress.js` (l object of 0..3 stars, last string).
- `main.js` `render()`: a screen that throws is logged and falls back to `#/home` (via `location.replace`,
  the hashchange renders); if home itself throws, a plain "could not load" view. Boot always clears.
The reviewer's 35-case × 10-route storage fuzz (t_store.mjs) now reports nothing.

## 3. Back button closes sheets / dialogs / promotion picker
`ui.js` `backClosable(close)` (generalised from the ui-4 settings sheet): each overlay pushes one history
entry numbered by depth (`history.state.gambitSheet`); popstate closes overlays deeper than the state's
depth as a cancel (confirm → false, promotion → null, sheet → its normal close/onClose). A non-back close
pops its entry with `history.back()` (counted in `skipPops` so it doesn't close anything else).
`openSheet` (all sheets: results, online, settings), `confirmDialog` and `promotionPicker` use it;
`settingsheet.js` no longer has its own history code. Extras that came with it:
- `whenHistorySettled(fn)`: `app.go()` waits for a pending overlay pop (results "New bot" / "Rematch"
  close the sheet then navigate; the late back would otherwise undo the navigation).
- A `#/` link clicked inside an open overlay drops the overlay entries first, then navigates (no dead
  back press left behind).
- Reopening an overlay while its predecessor's pop is pending defers the push (the reviewer's
  "X then reopen in one task closes the new sheet" — now stays open and back closes it).
- `closeAllOverlays()` (route change) forgets the stack without touching history.

## 4. Results tapped before the 650 ms banner
`game.js` finish timer skips when a banner or the results sheet already exists; same in `online_game.js`
(700 ms, `O.sheet`).

## 5. En-passant-only escape treated as mate by the check alert
`board.epSquare()` derives the ep target from the highlighted last move (pawn double push); checkalert's
`isMate()` puts it in the FEN it rebuilds. Every screen highlights the real last move, so no screen
changes were needed. Verified: FEN `8/8/4k3/3pP3/4K3/r7/4n3/8 w` with last move d7-d5 → CHECK card;
same placement without that last move → treated as mate as before.

## 6. Malformed lesson / puzzle deep links
`learn/screen.js` and `puzzles/screen.js` catch `decodeURIComponent` errors and use the raw id, which
then shows the normal not-found message. (No other route decodes params.)

## Takeback and increment (suspected; confirmed and fixed)
`undo()` left the increment banked for the undone plies. `GameClock.unpress(color)` takes it back
(never pushing the clock below 1 s, so a takeback can't flag you); `undo()` calls it for each undone ply.
Verified in a 5+3 game: after Nf3 + reply both clocks ~3:22, after the takeback both ~3:19.
