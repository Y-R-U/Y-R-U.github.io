# Sudoku Peer Review — Context & Todo

**Status:** in progress (started 2026-04-27)
**Owner:** Claude (Opus 4.7)
**Files:** `index.html`, `js/{engine,game,audio,panels}.js`, `sw.js`, `manifest.json`

## How to resume in a fresh session

Paste this into Claude Code:

> Read `/Users/aaronair/cc/yru/site/gms/pwa/sudoku/REVIEW_TODO.md` and continue the sudoku peer-review work from where the previous session left off. Update task statuses in this file as you go.

That's it — this file is self-contained.

## User preferences captured during the review

- **Auto-place behavior (item 3 below):** the user *wants* the auto-place-on-tap flow because they solve by picking a number and finding all its homes. The fix is: if the auto-number would conflict on row, column, **or** box, fall back to opening the picker instead of placing it. Only place silently when the number is fully valid.
- **No commits / pushes** unless the user explicitly asks. Work locally on files only.
- **No new abstractions / refactors** beyond what each fix needs. Direct edits, minimal churn.

## Todo list (priority order)

Status: `[ ]` pending · `[~]` in progress · `[x]` done · `[-]` skipped

### Tier 1 — Bugs (small, high-value)
- [x] **T1.1** Right-click / long-press on a *given* cell shows popup for the *previous* selection. Bail in `showPopup()` when the target cell is given. (`game.js:88-101, 136, 151`)
- [x] **T1.2** AudioContext leak — `playSound()` creates a new `AudioContext` every call. Single shared lazy-init context. (`audio.js:106-149`)
- [x] **T1.3** Auto-place: switch from box-only `canPlaceNumber` to full `isValid`; when invalid, open picker instead. (`game.js:142-146`, engine already has `isValid`)
- [x] **T1.4** `loadGame` — validate shape (9×9 arrays, known level) before assigning; on failure call `newGame()`. (`game.js:462-485`)
- [x] **T1.5** `changeDifficulty` — confirm before discarding an in-progress game (skip confirm if grid is fresh / no history). (`game.js:125-131`)
- [x] **T1.6** `win` sound — schedule frequency changes on the audio clock with `setValueAtTime`, not `setTimeout`. (`audio.js:130-136`)
- [x] **T1.7** Audio click/pop — short attack/release envelope on `gain.gain` for all sounds. (`audio.js:106-149`)
- [x] **T1.8** Remove inline `onclick="game.confirmRestart()"` from message HTML; use a delegated listener. (`game.js:349`)

### Tier 2 — UX wins (medium effort, high impact)
- [x] **T2.1** Keyboard input on desktop: `1`-`9` places, `Backspace`/`Delete` clears, arrow keys move selection, `n` toggles notes mode, `Esc` closes popup.
- [x] **T2.2** Highlight related cells (row, column, 3×3 box) for the selected cell, in addition to the existing same-number highlight.
- [x] **T2.3** Add elapsed-time timer; show in header, persist in save, reset on new game, pause when popups/panels are open.
- [x] **T2.4** Track best time per difficulty in stats; show alongside wins.

### Tier 3 — Performance & polish
- [ ] **T3.1** Throttle/debounce `saveGame` (e.g. 250ms or `requestIdleCallback`); also stop persisting `solution` (anti-cheat — currently visible in localStorage).
- [ ] **T3.2** Cache `availableTracks` in localStorage so the 10× HEAD probe runs once, not every session. (`audio.js:36-51`)
- [ ] **T3.3** Render: compute conflict cell-set once per render pass instead of 81 × 27 lookups. (`game.js:render`)
- [ ] **T3.4** Move puzzle generation to a Web Worker so Hard/Crazy don't freeze the UI. Add bitmask-based solver inside the worker. (`engine.js`)
- [ ] **T3.5** Service worker — cache music files (or at least the first track) so offline play has audio.

### Tier 4 — Game design
- [ ] **T4.1** Rework notes UX to standard model (notes mode → tap 1-9 toggles digit in cell; engine picks the slot). Drop the position-then-number flow.
- [ ] **T4.2** "Incorrect solution" feedback — surface count of cells that differ from `solution`, optionally highlight them on demand.
- [ ] **T4.3** Win flow — replace 3-second auto-newGame with a "Next puzzle" button; show stats panel on win.
- [ ] **T4.4** Add a hint button (uses `solution` to fill one cell, costs a stat).
- [ ] **T4.5** Add a mistakes counter (configurable cap) — optional.

### Tier 5 — Accessibility
- [ ] **T5.1** `aria-label` on all icon-only buttons (stats, settings, panel close).
- [ ] **T5.2** `role="gridcell"` and `aria-label="Row r, column c, value v"` on cells; `role="grid"` on `.grid`.
- [ ] **T5.3** Respect `prefers-reduced-motion` — disable shake + panel slide-in.
- [ ] **T5.4** Add a non-color signal for conflicts (icon, underline, or pattern).

### Tier 6 — Code nits
- [ ] **T6.1** Extract `make9x9(value)` helper; replace 4× duplicated `Array(9).fill(...)` constructions.
- [ ] **T6.2** Rename `engine.canPlaceNumber` → `boxAllows` to disambiguate from `isValid`.
- [ ] **T6.3** `panels.renderStats` — collapse parallel `levels`/`labels`/`colors` arrays into a single config array.
- [ ] **T6.4** Drop the global `game` symbol once T1.8 lands.
- [ ] **T6.5** One-line comment on `engine.countSolutions` explaining the `limit - count` budgeting trick.
- [ ] **T6.6** Cap `history` stack length (e.g. last 200 moves).

## Notes / decisions log

- 2026-04-27: review delivered, todo file created. Starting Tier 1.
- 2026-04-27: T1.1–T1.8 complete. All Tier-1 bugs fixed in a single pass; verified by reading back the files. No commits made.
- 2026-04-27: T2.1–T2.4 complete. Keyboard input (1-9, arrows, Backspace, Esc, N), related-cell highlighting (row/col/box), elapsed-time timer (pauses on popup/panel, persists, resumes), and best-time tracking (stats schema migrated to `{wins, bestMs}`). SW cache bumped to v4. Help text updated. PanelManager now takes onOpen/onClose hooks so it can pause/resume the timer. Committed and pushed as part of this batch.
