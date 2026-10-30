# qa — notes

Owner (for fixes): `js/app/`, `css/` (ui agents done); small surgical fixes in `js/puzzles/`, `js/board/`.
Tools: `tools/qa_cdp.mjs` (persistent CDP driver, real touch/mouse input, continuous console-error capture).

## How to test
```
~/.claude/bin/cdp start --port 9528 -- --use-angle=metal --use-gl=angle --ignore-gpu-blocklist
~/.claude/bin/cdp start --port 9583 -- --use-angle=metal --use-gl=angle --ignore-gpu-blocklist   # 2nd browser (online)
node tools/qa_cdp.mjs serve --ports=9528,9583 --http=9628 --out=DIR &
Q="node tools/qa_cdp.mjs do"
$Q A size 360 740 m , nav '#/home' , tap '.menu-item.primary' , tap '.bot-card' 0 , tap '[data-act=play]' , \
     until "window.__gambitTest().myTurn" , mv e2 e4 , shot g1 , errs
```
Commands (comma separated, `A`/`B` switches browser): `size W H [m]`, `nav HASH`, `reload`, `tap SEL [i]`,
`tapt TEXT`, `sq e4`, `mv e2 e4` (tap-tap), `drag e2 e4`, `key v`, `eval JS`, `until JS [ms]`, `wait ms`,
`shot NAME`, `errs`, `navs [reset]`, `throttle N`. `nav` clears the browser cache and cache-busts the URL.
Phone sizes use `m` (dpr 2, touch emulation): every tap/drag is a CDP touch event; desktop uses mouse events.
`window.__gambitTest()` now also exposes `chess`, `fen`, `assisted`.

## Bug list
Severity: H = breaks a feature / wrong result, M = wrong behaviour with a workaround / visible glitch, L = polish / copy.

| # | Sev | Area | Bug / repro | Status |
|---|---|---|---|---|
| 1 | **H** | Touch promotion (bot game, puzzles, online) | Phone: tap a pawn, tap the 8th/1st rank (or drag there). The picker opens inside the board's `pointerup`; the browser then synthesizes the tap's `click` at the same point, which lands on the new `.promo` scrim → cancelled instantly. In bot games `pickPromotion` then never called `setInteractive()`, so **the board stayed locked for the rest of the game** (found in a real 3+2 game: 150 taps ignored at ply 65 until I flagged). Online restored interactivity but promotion was still impossible on touch; puzzles (Saavedra c8=R, Lasker …=N) same. | FIXED: `ui.js promotionPicker` only acts on clicks whose pointerdown started inside it; `game.js pickPromotion` restores interactivity on cancel. Verified: touch tap-tap c2→c1 → picker → Knight plays `c1=N`; tap outside cancels and the next move works. |
| 2 | **H** | Settings | Settings click handler used `e.target.closest('[data-theme]')`, which matches `<html data-theme="…">` for **every** click in the panel. Result: **"Reset ladder & stats" did nothing**, the new Re-test button did nothing, and any segmented/toggle click un-highlighted the selected theme card. | FIXED (`.theme-card`). Verified Reset dialog opens, Re-test runs, highlight stays. |
| 3 | M | Confirm moves (bot + online) | With "Confirm moves" on, on touch: the ✓/✕ bar is inserted inside `pointerup` too, so the ghost click lands on it when the target square lies under the bar (rank 1/8 middle files). Logged: tap Be2→f1 → click target `BAR:Play` → move **auto-played without confirmation**; under ✕ it auto-cancels (move unplayable). | FIXED (same pointerdown guard) in `game.js` + `online_game.js`. Verified Bf1 / Ke1 now wait for ✓. |
| 4 | M | Bot clocks, hidden tab | Hide the tab while the bot thinks; if its move + animation complete in the background, `nextTurn()` started **your** clock while hidden, and on return `onVis` restarted the **bot's** clock (stale `pausedColor`) during your turn: the bot is charged for your thinking time and you get free time. | FIXED: `nextTurn` defers the start while hidden; `onVis` only resumes the side to move. (Code review; headless can't reproduce rAF in hidden tabs.) |
| 5 | L | Results sheet (bot + online) | Score printed White–Black between "You" and the opponent: "You **1–0** Pip" when Pip won as White. | FIXED: score reads left→right (You–them). |
| 6 | L | Game, before the first move (ui-3) | Desktop: bot blurb clipped mid-word ("…Will grab anything yo"); 360: title left-aligned; dead ◀ ▶ buttons. | FIXED: centred intro card (title, blurb, "You play White · No clock · Win +6"); title-only on short strips; nav hidden until a move exists. Screens: `qa/p360-intro.png`, `p412-intro.png`, `d1440-intro.png`. |
| 7 | L | Settings theme picker | Previews/blurbs didn't match the boards ("Staunton pieces on warm walnut" brown preview vs gold/black chrome on marble; Sci-fi dark navy preview vs pale panel grid). | FIXED: colours sampled from the real boards, blurbs updated (`themes-meta.js`). |
| 8 | L | Puzzles | "Solution" revealed instantly on a clean first attempt and charged the rating (one stray tap = −34). | FIXED: confirm dialog only when it would cost rating (`js/puzzles/play.js reveal`). |
| 9 | L | Online game bars | After a rated game the player bars kept the pre-game rating ("1500?") while the sheet said 1338?. | FIXED (`online_game.js barRating`). |
| 10 | L | Toasts | Toasts sit over the move list (e.g. "Pip: Too early for that…"). By design, short-lived. | FIXED (polish-3): toast docks inside the move box away from the newest moves (`ui.js dockToast`) |
| 11 | L | Online desktop | The "Opponent disconnected… claim in 28s" banner covers rank 8 of the board. | FIXED (polish-3): side-panel layouts show banners at the top of the panel; portrait unchanged |
| 12 | L | Bot game resume | A resume whose moves already end the game (e.g. threefold already reached) isn't checked on load; `makeGame` → `nextTurn` would ask the bot to move in a finished game. Only reachable by a crash between the final move and `clearResume`. | FIXED (polish-3): finished resumes are scored on load instead of starting the bot |
| 13 | info | Test infra | Other agents' scripts attached to my Chromes on 9529/9530 (pages from the sculptor benches appeared in them), and mine briefly to theirs. Agents should use `cdp start` with a unique port and not reuse a port they didn't start. | manager |

## ui-3 items (manager) — done
- **Bot think time on cards**: `screens/bots.js thinkMs/thinkLabel` = max(`expectedMoveMs(bot, bench)`, the human-like
  pause bots < 2000 take (~0.9 s, ×0.7 from 1200)) → "~1 s a move", "~6 s a move"; on every bot card, the
  locked note ("Too strong for this device (~9 s a move)") and the Game setup card.
- **Settings → This device → Bot speed test · Re-test**: `benchmark({force:true})`, then `resetBench()` so Play Bots
  re-reads it; shows "747k positions a second · 20 of 20 bots available".
- **Ambient animation toggle** (Settings → Board view, also in the in-game sheet): setting `ambientAnim` (default true,
  `store.js`); `boardhost.js` passes it to `createBoard` and forwards changes with `board.setOptions({ambientAnim})` for
  every screen. Measured on the idle Halloween board: 40 frames / 2 s on, 0 off.
- **Intro card** before the first move (bug 6).
- **Bots disposed when leaving a game**: `suspend()` already disposed the bot; `leave()` now also `stopHint()`s (an
  in-flight hint / draw-offer search kept a worker busy). CDP worker targets: 2 in game (bot + hint) → 0 on Home.

## Playthrough coverage (2026-10-31, real taps on 360×740 / 412×915, mouse on 1440×900)
- First visit → home → bots → setup → games: win by mate vs Pip (tap-tap, 360) and vs Juno (drag, 412); loss on time
  (1+0 vs Mabel, flag + red low clock) and on time at 3+2 vs Juno; resign (assisted, halved points); draws by stalemate
  (Loyd's 10-move line), threefold repetition and agreement (bot accepts when ≥2 down after ply 30; "too early" before);
  Unlimited, bullet, blitz, rapid. Rematch (colours swap) from sheet and toolbar; resume after reload (position, turn,
  assisted flag); home "Game in progress" card; ladder rank/points/Elo movement; stats tab W/D/L per bot.
- Undo / Hint: first use asks, then "assisted" tag; hint arrow. Draw offers. Promotion (incl. under-promotion) on touch.
- Themes: all four switched live from the in-game sheet; view cycle Top→Tilt→3D→Free (button + V), only Free orbits;
  name tags (tap enemy, own piece, desktop hover "Queen"); battle speeds measured 1× 2.65 s, 2× 1.32 s, 5× 0.33 s,
  Off none; tap-to-skip ends a 1× battle at ~1 s; fullscreen button present and toggles (desktop Chrome).
- Puzzles: map, Fool's mate with a miss + both hint taps (1★, −36), Next, Solution (0★), Retry, chapter 2 opened by
  rating ("Opened early by your rating").
- Online (two browsers, Pass dev ids): quick match 3+2 → Scholar's mate by taps on both sides, ratings ±162 provisional;
  rematch (colours swap); phone tab closed → desktop "away" banner + 30 s claim countdown → home "Online game in
  progress" card → resume at the same ply; resign; private room (code typed on desktop, join preview) → Unlimited game
  → draw offer accepted. `?server=none`: coming-soon page, zero server requests.
- Settings persist across reload (theme, battle speed, ambient). Reload loop (account layer ON): 1 top-level navigation
  in 12 s, `--br8t-account-space` 52px.
- Zero console errors / exceptions in every run.

## Perf (CPU throttle 4×, 360×740, Classic, battles 1×)
- Full game vs Lena (39 plies, 86 s): 2 long tasks — 67 ms at the start of a capture animation, 51 ms at game end
  (results sheet) — **none while the bot was thinking**; one 67 ms frame gap (same capture).
- 16 plies vs Gideon (~200k nodes a move): no long tasks, no frame gaps > 50 ms.
- Bot search runs entirely in the worker; the UI stays responsive.

## Regression suites run after the fixes
`ui_cdp play` + `shots`, `ui2_cdp shots/ctx/soon` (ALL PASS), `online_cdp all` (ALL PASS, run on ports 9528/9583 via a
port-substituted copy), `puzzles_cdp --only=phone` — all with zero console errors.

## Notes for others
- No `?fen=` for bot games: positions were set up by writing `gambit.resume` (`{botId, tc, color, moves:[lan…]}`) from
  `#/home` (not from `#/game`, whose pagehide re-saves the live game over it).
- Test hook `__puzzleTest().reveal()` skips the new Solution confirm (`reveal({ask:false})`).
