# Sunday League

Sensible Soccer-style mobile footy. Vanilla Canvas ES modules, no build step. Live on games.br8t.com
(deployed with `rsync -az --delete --exclude='*.md'`). Offside is default OFF (Aaron's preference).

## Test hooks
- `?auto=1` AI-vs-AI chained matches, `?play=1` instant quick match, `?half=N` seconds per half.
- `?auto`/`?play`/`?half` skip `cloud.js` (the account layer), so test HUD overlap with the avatar through the real menu flow.
- `window.__game` is the app facade, `window.__soak` has {frames, goals, states, errors}.
- `__game.resetTips()` clears the first-match control tips.

## Hub pass (2026-10-11)
- Pause button is top-left (the account avatar owns top-right; it used to cover the scorebar clock).
- "Best played in portrait" pill: once per session (sessionStorage), 3 s, fades, never during a match.
- Audio: unlock on pointerdown/touchend/click/keydown for the page's lifetime; `audioSession='playback'`;
  the context is suspended when the page is hidden.
- Android back: a `{slMatch:1}` history entry is pushed when a match begins; back pauses instead of leaving.
  `_endMatchUI` pops it (`backPopping` flag), so entries never stack across matches.
- `UI.hudTick` writes text only when the score or minute changes.
- Landscape (`w > h`): far zoom with the camera allowed to show dark stand margins either side
  (`Camera.resize(..., sideMargins)`); radar sits in the left margin under the pause button, kick button
  centred in the right margin, set-piece prompts move to the bottom strip. Portrait unchanged.
- First-match tips (`#coach`, main.js `coach`): tap, hold, curl, defend. Each is shown in open play only,
  once, and saved in `settings.tips` after it has been visible for 2.5 s.
- Half time is a 5 s auto-continue card (driven by `match.stateT`, so it waits while the tab is hidden);
  any tap after 0.5 s skips.
