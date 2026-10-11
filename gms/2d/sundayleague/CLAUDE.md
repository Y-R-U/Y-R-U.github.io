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

## Landscape crowd stands (2026-10-11)
- Pitch stays vertical in landscape; the side margins are now big animated stands (`js/crowd.js`).
  Left stand wears the home kit, right stand the away kit. Portrait never draws them.
- Cheap by design: each band (2 seat rows, full stand width) is pre-baked per match into
  3 patterns × (4 bob + 2 arms-up) canvases (~40 ms at 4× CPU throttle, lazy: first landscape frame).
  Per frame it's one `drawImage` per visible band (~30–40), world-anchored so it scrolls with the pitch.
- `CROWD.surge(amount, side)` lifts a stand's excitement; bands with a random threshold below it
  switch to arms-up frames, then it decays (~0.28/s). Hooked in match.js: shot (0.4, shooter's side),
  save/parry (0.6), post (0.75), goal (1, scorer's side; other stand gets 15%), shootout miss (0.8, keeper's side).
- A Mexican wave runs along both stands every 16–40 s when the crowd is calm.
- Landscape HUD: when the stand margin is ≥130px, `#hud.side` stacks the scorebar in the right stand
  (under the hub avatar, above the kick button; it's pointer-events none, so no touch-zone change).
  Radar and kick button get darker backings so they read over the crowd.
- Test: `import('<game>/js/crowd.js').then(m => m.CROWD.surge(1, 0))` from CDP fires a cheer.
