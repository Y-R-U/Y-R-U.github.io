# checkalert notes (2026-10-31)

Aaron: "Ensure when in check a check popup shows up to make it super obvious after a few seconds move it
above or below board and maybe show red square and the link to the piece forcing the check?"

## Done
- **Board visuals** (`js/board/board.js`, `js/board/overlays.js`): whenever `highlight({check})` names a king
  that is really attacked on the board's own placement, the board draws:
  - king square: solid red fill + thick red frame + the (now un-tone-mapped, stronger) radial glow;
  - each checking piece's square: lighter red fill + frame;
  - a red arrow with a dark edge from each checker to the king (two for a double check). Knights get a
    direct arrow (an L would cross the pieces next to the king). Arrows stop short of both pieces.
  - It all waits for the move animation / battle (`animCount` = 0) and re-checks on the last `animend`,
    so screens can set `check` before or after `applyMove`. A stale `check` (king moved / no longer
    attacked) draws nothing. Attackers are computed in the board (`attackersOf`), no core call.
  - Emits `check` → `{king, color, checkers[], double, key, popup}` or `null` when it changes.
  - `highlight({checkPopup:false})` (review mode) → event carries `popup:false`.
  - New API: `board.checkState()`, `board.placement()` (FEN placement field), `board.boardRect()`
    (8×8 area's screen bbox in container px).
- **Popup** (`js/app/checkalert.js`, attached once in `boardhost.js` → every screen with the shared
  board: bot game, online game, puzzles, lessons): a big gold-bordered Cinzel "CHECK" / "DOUBLE CHECK"
  card with a red glow pops in over the board centre (90 ms after the landing), holds 2 s, then flies
  to a badge on the top or bottom edge nearest the king: centred over the king's file in the gap
  outside the 8×8 area when the view leaves room (Tilt / 3D / Free), else a compact badge hugging the
  board's outer edge (over the frame) in the half away from the king (Top views). Stays until the
  check is resolved, then fades. pointer-events: none (taps go through). Re-placed on view / theme /
  resize / pointer-up.
  - Checkmate: no card, no badge (the result sheet / puzzle "Brilliant!" card own it; a CHECKMATE card
    collided with the puzzle celebration). The red king + link still show.
  - Same check again (back from move review) → badge only. Reviewing → badge only.
  - Reduced motion: app.css already zeroes transitions; the pop-in also skips its scale, and the dock
    is a plain swap.
- **Setting** "Check alerts" (default on, `checkAlerts` in `store.js` defaults, Gameplay section of the
  settings page / sheet). Off = no card/badge; red king square, checker tint and links always show.
- **Sound**: already there — `playMove` adds the `check` bell when the SAN has `+`/`#` (game, online,
  puzzles, learn). Nothing added.
- **Puzzles** (`js/puzzles/play.js`): `run.chess` is already past the opponent's reply when the board
  lands the player's move, so `syncCheck()` never showed a check given mid-line. It now passes
  `check: <opponent colour>` from the move's SAN; and the reply waits +650 ms after a checking move so
  the check registers before it is answered.
- `review.js`: passes `checkPopup:false`.

## Urgent bug (Aaron's laptop: sideways Plain icons + "The board could not load")
Not a code bug: Chrome on the laptop re-fetched `board.js` (17:23) but served its static imports
(`board/pieces.js`, `overlays.js`, …) from cache (last fetched 16:27; `pieces.js` changed 16:53).
`python3 -m http.server` sends no Cache-Control, so Chrome caches heuristically and shift-reload did
not revalidate the module graph. Old `pieces.js` ignores `facing.view`/`contact` (sideways icons +
contact blobs) and lacks `setView` → `setOrientation` threw → the online screen's board-ready chain
showed the error. Guards added: `pieces.setView?.()`, `overlays.setCheckers?.()`.
Recommended (manager): serve yru-site with `Cache-Control: no-cache`.

## How to test
Scratch scripts (not in the repo) drove: bot games resumed into check positions (`gambit.resume`) with
the bot's think stubbed; checks given via `board.onMoveAttempt`; puzzle `3qUz7` (Ra6+ then Rxc6#) via
`__puzzleTest().playExpected()`; lesson `check`. Note for CDP harnesses: navigating to a URL that only
differs in the hash does NOT reload modules — add a `&t=` query.

## Open / notes
- Top views have no free band above/below the board, so the compact badge overlaps the outer rim of
  the edge squares (~19 px) in the half away from the king.
- `isMate` builds a FEN from the board placement without castling / en-passant rights: an en-passant
  capture as the only escape would be (harmlessly) treated as mate → no card.
- Free view: the badge re-places on pointer-up / wheel, not every frame while orbiting.
