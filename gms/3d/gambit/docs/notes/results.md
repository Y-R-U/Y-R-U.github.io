# results-banner notes (2026-11-01)

Aaron: "When you win/lose, you want to see the board ... atm the popup covers everything, need a semi transparent
simple message that can be minimised ... default is you can still see board". Follow-up: the old "View board" link
was too small to notice; any control that hides/shows the results must be big (≥ 44 px) and clearly labelled.

## Done
- **`js/app/resultbanner.js`** (new, shared): `showResultBanner(stageEl, {board, kind, title, sub, short, actions, celebrate})`.
  Three reversible states:
  - **banner** (default): translucent dark strip (rgba ~.5 + 1 px blur, gold border, Cinzel title) on the board's
    top or bottom edge: in the empty band outside the 8×8 area when the view leaves room, else over the edge
    ranks that hide least: never over the mated king / checkers (board.checkState), then fewest pieces. Title
    ("Checkmate · You win", "You lost on time", "Draw by repetition", "You resigned", "Game aborted"...), key number
    (bot: `+N ladder pts · Rank #R ▲k`; online: `Blitz 1662? +162`), buttons 46 px: Rematch (or Accept / Sent… /
    New game / New bot), **Details**, **Hide**.
  - **pill**: Hide → a 44 px "🏆 You win ▴" pill in the corner of the same edge that hides least. Tap → banner.
  - **expanded**: Details (or the actions-bar Results button) opens the existing full results sheet. Its tiny
    "View board" link is gone; a full-width 48 px **Show board** button at the top of the sheet closes it (scrim tap /
    Results again also close it) → banner.
  - A win pops the banner in over the board centre with a gold glow for 1.5 s, then it docks. Loss/draw/resumed
    end: just fades in docked. Reduced motion: no pop, no transitions, no pulse.
  - Re-places on resize, view change (+480 ms), theme, pointer-up, and after Flip.
  - Action buttons carry `data-act`, so each screen's own delegated click handler runs them.
- **`js/app/screens/game.js`** (bot): `finish()` shows the banner (650 ms after the end, 0 for abort) instead of
  the sheet; `resultTitle/resultSub/showBanner`; `showResults()` toggles the sheet and drives banner state;
  game-over actions bar gains the **View** (camera) button; disposed on leave. Test hook: `banner`, `sheet`,
  `finish(result, reason)`, `play(uci)`.
- **`js/app/screens/online_game.js`**: same banner (rating ± with provisional `?`, "Casual · ratings unchanged",
  "Doesn’t count against your daily games" for aborts; sheet keeps the cheat warning and allowance text). Rematch
  state mirrors into the banner (Accept pulses); an opponent's rematch offer no longer pops the sheet over the
  board: it brings the banner back from the pill. A finished game opened later shows the banner. Game-over actions
  bar gains View. **Fix**: online games never set the check highlight after a move (only on resync), so the
  check / mate red king + arrow (and the CHECK popup) never showed online. `highlightLast()` now runs after every
  applied move.
- `css/app.css`: `.res-hide` (Show board button).
- **Lessons** (`js/learn/player.js`, `learn.css`): the lesson-complete card used to dim + cover the board for good.
  It now pops as before, then after 1.8 s docks to a translucent strip on the board's bottom edge
  (stars + title | Course | Next lesson, 44 px buttons). Replay stays in the panel.
- **Puzzles**: unchanged. The "Brilliant!/Solved!" card is transient (gone after 2.2 s, pointer-events none) and
  the result + Next puzzle live in the bottom panel, so the board is already clear.

## How to test
```
~/.claude/bin/cdp start --port 9540 -- --use-angle=metal --use-gl=angle --ignore-gpu-blocklist
node tools/results_cdp.mjs all --out=DIR [--sizes=390x844,360x740,1440x900]   # bot | puzzle | lesson
```
Bot games are set up via `gambit.resume` (no engine play): win by mate (Black, Fool's mate), loss by mate
(resumed finished game), draw by repetition (finish hook), resign (button), Rematch from banner, timeout
(1+0, 1.2 s left), abort. Checks states banner ⇄ sheet ⇄ pill, ≥ 44 px controls, banner ≤ 20 % of board height,
review ◀ / Live, View cycling, Flip with the banner up. `tools/online_cdp.mjs` now waits for `.rb-card`, checks
Details/Show board, and runs rematch through the banner.

Last run: results_cdp 90/90 (3 sizes); online_cdp quick / friend / extras ALL PASS; ui4_cdp all 46/46; ui2_cdp ALL PASS; board_test 18/18;
board_game_test 14/14; puzzles_test ALL PASS (4760); learn_test 979/979.

## Open / notes
- In Top view there's no band outside the 8×8, so the banner sits over ~1¼ edge ranks (translucent). Hide → pill
  shows the whole board.
- Desktop banner keeps phone-sized buttons (max 520 px wide, centred on the board edge).
- Online `allowance` / `disconnect` modes not re-run (the always-on :8094 server is unlimited; disconnect waits on
  the claim grace); they use the same `waitOver` helper.
