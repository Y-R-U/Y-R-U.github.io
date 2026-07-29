# Sudoku Peer Review — Context & Todo

**Status:** Tiers 1–5 complete (2026-07-29). Deployed to games.br8t.com.
**Files:** `index.html`, `js/{engine,game,audio,panels,cloud,boot-cloud}.js`, `sw.js`, `manifest.json`

## How to resume in a fresh session

Read `ai.txt` first — it is the architecture doc and explains the graded
difficulty system, which is the part most likely to be "fixed" back into a bug.

## User preferences captured during review

- **Auto-place on tap is wanted.** The user solves by picking a number and
  finding all its homes. It only fires when the number is fully valid on row,
  column *and* box; otherwise the picker opens.
- **Standard pencil marks** (2026-07-29): digit n in slot n. The old
  position-then-number flow was dropped at the user's direction.
- Hint button, wrong-cell count, peer-note clearing and a mistakes counter were
  all asked for explicitly, plus a settings toggle to hide the hint button.
- **No commits / pushes** unless the user explicitly asks.

## Done

### Tier 1 — Bugs (2026-04-27)
- [x] T1.1 right-click/long-press on a given cell showed the previous selection's popup
- [x] T1.2 AudioContext leak — one shared lazy context
- [x] T1.3 auto-place used a box-only check; now full `isValid`, picker on failure
- [x] T1.4 `loadGame` validates shape before assigning
- [x] T1.5 `changeDifficulty` confirms before discarding progress
- [x] T1.6 win sound scheduled on the audio clock
- [x] T1.7 attack/release envelope on all SFX
- [x] T1.8 inline `onclick` replaced with a delegated listener

### Tier 2 — UX (2026-04-27)
- [x] T2.1 keyboard input  · [x] T2.2 related-cell highlight
- [x] T2.3 elapsed timer   · [x] T2.4 best time per difficulty

### 2026-07-29 — Opus 5 pass
- [x] **Long press was broken on mobile, two ways.** `preventDefault()` in the
      timeout is a no-op, and the release-click landed on a *number button* in
      the picker that had just opened under the finger — placing a digit nobody
      chose. Fixed with a deadline-bounded capture-phase click swallower.
- [x] **Difficulty was clue count, not difficulty.** Basic through Medium were
      all singles-only; Hard and Crazy were a coin toss. Engine now grades every
      puzzle by the hardest technique it forces (tiers 0–3) and generates into a
      band. Verified over 100 puzzles per level.
- [x] **Solver rewritten** with MRV + bitmasks: worst case 362ms → 49ms, so
      T3.4's Web Worker is no longer needed.
- [x] T3.1 saves debounced (250ms); solution no longer persisted — it is
      recovered with `engine.solve()` from the givens on load
- [x] T3.2 music HEAD-probe cached for 24h
- [x] T3.3 conflicts computed once per render, not 81 × 27
- [x] T3.5 SW caches audio/images cache-first — **and** was rewritten so it
      never touches `/lib/auth/` or cross-origin requests (see ai.txt)
- [x] T4.1 standard notes model
- [x] T4.2 wrong-cell count on a failed solution, with "Show me"
- [x] T4.3 win shows "Next puzzle" instead of wiping the board after 3s
- [x] T4.4 hint button (+ settings toggle; hinted wins don't set best times)
- [x] T4.5 mistakes counter (no cap — a tally, not a fail state)
- [x] T5.1–T5.4 aria labels, `role="grid"`/`gridcell`, `prefers-reduced-motion`,
      underline as a non-colour conflict signal
- [x] T6.1 `make9x9` helper · T6.2 `canPlaceNumber` deleted (unused) ·
      T6.3 stats config collapsed to one array · T6.5/T6.6 comments + history cap
- [x] Peer notes cleared when a digit is placed
- [x] Timer pauses when the tab is hidden — it was clocking up in the background
      and corrupting best times
- [x] br8t account layer wired (`js/cloud.js`, `js/boot-cloud.js`)

## Left undone (deliberate)

- **T3.4 Web Worker for generation** — unnecessary now that the worst case is
  49ms. Revisit only if a level below 20 clues is ever added.
- **T6.4 drop the global `game`** — the test harness drives it. Keep it.
- **Undo across reloads.** History is session-scoped; persisting 200 full note
  snapshots per puzzle isn't worth the localStorage.
- **Tier 2 as its own difficulty band** — see ai.txt for why this is a trap.

## Test harness

Headless Chrome + raw CDP from node, no puppeteer (see `/games/CLAUDE.md`).
Four suites were written for this pass — interaction, features, account layer,
Firestore round-trip — 71 checks, all passing, including the mandatory
reload-loop check. They live in the session scratchpad, not the repo.
