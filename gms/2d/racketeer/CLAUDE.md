# Racketeer

Silly tennis game: vanilla ES modules, no build step. Read `PLAN.md` for the feature history and the `racketeer` memory note for gotchas (2D short-ball interception, `?auto&mode=` soak hooks, `Network.setCacheDisabled` in CDP tests).

## Hub pass (2026-10-11)
- **Audio**: `audio.js` keeps unlock listeners (pointerdown/touchend/click/keydown) for the page's life, resumes whenever the context isn't running, sets `navigator.audioSession.type = "playback"`, and suspends while the tab is hidden. `noise()` plays slices of three cached 2 s white-noise buffers instead of allocating a buffer per call.
- **Silent menu match**: `suppressOutput(fn)` in `audio.js` is the one "no sound, no buzz" scope (sfx + crowd + haptics). The demo match is built and updated inside it, and `later(m, fn, ms)` in `match.js` re-enters it for deferred effects when `m.silent`. `silenceCrowd()` drops the murmur to 0 whenever a match ends or is quit. The demo also skips the serve box, timing ring and "SWIPE!".
- **Coach callout**: `UI.callout(html, {face, dur, key, done})` renders `#coach`, which is non-blocking (`pointer-events:none`). In landscape it sits in the left gutter. The swap hint uses it (only once 2+ slots exist and are full) and never pauses the match.
- **Level-1 tutorial**: `cfg.tutorial` (story level 1 while `!save.tutDone`) gives `m.tut = {beat}`. Ray coaches three beats (swipe serve / long swipe ≥ 0.6 depth / bent swipe |curve| ≥ 4), one beat per swipe, via `hooks.onCoach`. `save.tutDone` is set when all three are done. It's a normal story match otherwise.
- **Banana trail**: when your shot has |curve| > 1, `m.curveTrail` holds the predicted flight to the first bounce (`predictPath`), drawn dashed and fading over 1.2 s.
- **Input**: `input.js` tracks the gesture's `touch.identifier`, so other fingers are ignored. `touchcancel` calls `inputCancel(m)`, which drops the swipe without playing it.
- **Dock**: `onSkillDock` rebuilds only when `dockKey()` changes (it was 2×/s `innerHTML`).
- **Layout**: `#meters` clears `--br8t-account-space`. With landscape at ≥ 3:2, menu columns sit outside `--stage-w`, the skill dock stacks vertically in the right gutter (slot 1 at the bottom) and the meters move to the left gutter. Portrait is unchanged.
- **Boot watchdog**: an inline script in `index.html` shows a cache-busting Reload callout on a pre-boot error, a failed resource or a 12 s timeout. `main.js` sets `window.__booted`.
- Autopilot soaks are slow but not stalled: bot-vs-bot rallies often run 20–50 shots, so a 1-game quick match takes 1–3 minutes. Quick mode never touches `save.wins/losses`, so count matches by `__match` identity.
