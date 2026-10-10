# Outpace

"Run the gauntlet": a 3D deep-space sprint. You fly a route, then dock and spend credits.
Live at https://games.br8t.com/gms/3d/outpace/ (on the hub), and it's mirrored on GitHub Pages.

- `index.html`: markup, the boot error/watchdog script and the importmap. three 0.160.0 comes from `../../lib/three/0.160.0/`.
- `game.mjs`: everything else, in one monolith. Find things with `grep -n "^function"`.
- `cloud.mjs`: the hub account sync (`/lib/auth/localsync.js`), imported lazily. A failure is swallowed.
- `style.css`: the stylesheet. Bump `?v=` on **both** `style.css` and `game.mjs` in `index.html` when either changes.
- There is no build step. `games/deploy.sh` ships the folder as-is (minus `*.md`).

## URL flags
| flag | effect |
|---|---|
| `?probe` | exposes `window.__outpace` = `{THREE, renderer, scene, camera, state, materials, stationView, spawn:{asteroid,station,dock,drone}}`; also shows the Debug row |
| `?debug` | shows Settings > Debug (Skip To Depot, media library). Hidden otherwise |
| `?demo` | autopilot demo run that ends itself after about 18 s |
| `?demoDock` `?demoResult` `?demoTerminal` `?demoTab=<upgrades\|cargo\|briefing\|search\|achievements>` | jump to that screen |
| `?demoStory=` `?demoQuest=` `?demoSettings` `?demoDebug` | story, quest and modal demo states |
| `?test` `?soak` `?nocloud` | skip the cloud sync (any `demo*` flag skips it too) |

`<html data-game-ready="1">` is set when boot is done, and `data-game-state` holds menu/playing/station/result.
`data-paused="1"` is set while a run is background-paused, and `data-boot-stalled="1"` when the watchdog fired.

## Economy (all in game.mjs)
- `STARTING_DEBT` 2000, `DEBT_LIMIT` 10000, `DEBT_INTEREST_RATE` 0.02 per launch (`applyDebtInterest` in `resetGame`).
- Payout: `getDeliveryPayout` = (95 + route*26 + cargo*cargoRate) × station multiplier (mega 2.25 / large 1.58 / small 1) × broker bonus.
  - mega is every 10th route and large every 5th.
- Route length: `getRouteLength` = max(1180, 1680 + route*135 − engine*34).
- Death: `applyEscapePodRepair` bills (340 + route*74 + installedLevels*28), rounded to 5. Credits pay what they can and the rest becomes debt.
  - If debt goes over the limit, the ship is confiscated and "Sign New Hull" resets the ship (`claimNewHull`), but the career is kept.
- Upgrades: `UPGRADE_DEFS`, where cost = base × scale^level.
- **Score is not money.** Score only feeds best score and the results card. Credits come from payouts.
- The death-spiral balance (repair vs payout, interest, confiscation) is awaiting Aaron's decision. Leave it alone.

## Dock flow
1. The route fills, then `spawnObjects` clears the field and spawns `createDockStation`.
2. When the dock passes z > −18, `beginDockingTransition` runs: a fade, then `openStation` (payout is credited, the route advances, the save is written).
3. The station lounge is `#station`. Its window view is a separate three.js renderer, built on the first dock (`stationView`).
   - Tapping the terminal face (the hotspot is positioned by `layoutStationPlate`) opens the tabbed terminal.
4. "Launch Next Delivery" calls `resetGame`, which charges debt interest and may confiscate the ship.

## 2026-10-11 pass (hub review)
- **Terminal lists**: `.upgrade-list` scrolls (`overflow-y:auto`, `touch-action:pan-y`, `grid-auto-rows:max-content`) and cards no longer collapse to overlap.
  - Short landscape gives the console the full height and clamps the panel copy to one line.
- **HUD**: its width leaves room for the 42px settings gear, so HEAT no longer sits under it.
  - In flight, the HUD cells use a solid fill instead of `backdrop-filter`.
- **Terminal hint**: `fitTerminalHint()` shrinks the cycling hint, or wraps it to two lines, so it never clips on a narrow face.
- **Debug row**: only shows with `?debug` / `?probe` / `?demoDebug` (`DEBUG_TOOLS`).
- **Title card**: goes two-column under `(orientation: landscape) and (max-height: 500px)`, so Launch fits at 844×390 and 740×360.
- **Boot watchdog** (inline in index.html): after 12 s with no `gameReady`, it shows `#boot-error` with a Reload button.
  - Reload refetches game.mjs/cloud.mjs/style.css/three with `cache:'reload'`, then reloads with `?r=<ts>`.
  - If the game boots late anyway, it hides the panel.
- **Audio**: the context is unlocked on pointerdown/touchend/click/keydown (capture, kept for the page's lifetime) and resumes whenever it isn't `running`.
  - It sets `navigator.audioSession.type='playback'`, and suspends while the page is hidden, which silences the music oscillators.
- **Background pause**: hiding the tab mid-run sets `state.backgroundPaused`. A "Paused · tap to resume" pill (`#resume-callout`, not a modal) shows.
  - Any steer tap, the fire button, a key or the pill resumes the run.
- **Result title**: "Escape Pod Record" only when there was a previous best (> 0).
- **Shader pre-warm**: `prewarmShaders()` builds one of every flight object and compiles them, then clears the scene.
  - It runs right after the first menu frame (or at the first `resetGame` if that comes sooner).
  - Programs go from 2 at the menu, 4 at launch and 9 after the first fight, to 9 / 9 / 9.
- **Cockpit**: `assets/cockpit-alpha.webp` (331 KB) replaces the boot-time chroma key of `cockpit-chroma.png` (2.27 MB, kept as the source and no longer loaded).
  - `station-lounge-chroma.png` was unused and has been deleted.
- **Retry**: the result lock (`RESULT_LOCK_MS`) is now 1000 ms, down from 3200.
- **Overheat**: when guns are blocked by heat, there is a noise "vent" sfx, a red reticle and HEAT cell, and a haptic `[30,40,50]`.
  - The warning latches until heat is below 55%. The firing rules are unchanged.
- **Near misses**: an asteroid already gave a silent bonus when it passed just outside its hit radius, and drones now do too (within radius+4).
  - Both now chain into a combo: each one within 2.6 s adds +25%, up to ×5 (×2 bonus).
  - A small "Near miss x2 +35" popup rises on the side the object passed.
  - It is score only, so credits and the economy are untouched. A hit breaks the combo.
- **Menu achievements**: kills, pickups, docking and purchases only mark it dirty (`markMenuAchievementsDirty`). It is rebuilt when the menu is visible.
- **Landscape cockpit**: `drawCockpit` fits image rows `COCKPIT_LANDSCAPE_BAND` [0.33, 0.69] instead of a width-cover crop.
  - The dashboard screens show, the window bottom sits at about 63% of the height, and the side gaps are mirrored copies of the plate.

### Regenerating cockpit-alpha.webp
Run the old `processCockpitImage` key (in git history before 2026-10-11) on `cockpit-chroma.png` in Chrome, and dump the RGBA as a PNG.
Then encode it with `cwebp -q 92 -m 6 -sharp_yuv -alpha_q 100 keyed.png -o assets/cockpit-alpha.webp`.
This keeps the alpha lossless and gives 41 dB PSNR on colour against the keyed PNG.

## Testing
Serve the site root (`python3 -m http.server <port>` in `yru/site`).
Drive headless Chrome with `~/.claude/bin/cdp start --port <p> -- --use-angle=metal` and raw CDP, with touch emulation and `Network.setCacheDisabled`.
- Get to the dock fast: `?probe`, Launch, then `__outpace.state.shield=1e6; __outpace.state.routeDistance=__outpace.state.routeLength-5`.
- Die: `__outpace.state.shield=0.5` and wait for `data-game-state="result"`.
- Overheat: `__outpace.state.heat=999; __outpace.state.firing=true`, then expect `#reticle.overheated`.
- Near miss: `spawn.drone()` and set its position to `(playerX + radius + 2.5, playerY, 0.5)`.
- Background pause: override `document.visibilityState` to `'hidden'` and dispatch `visibilitychange`.
- Watchdog: `Fetch.enable` with the pattern `*three.module.js*` to hang the import, wait 12 s, then expect `#boot-error` with "Still Loading".
- Check 390×844, 844×390 and 740×360, with zero console errors.
