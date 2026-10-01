# Lane 7: QA / test harness notes

Owner of `tools/qa_*`, `docs/notes/qa.md` and `.gitignore` (which ignores `tools/qa_out/`). I never edit game code.
CDP ports: 9317 (local smoke), 9318 (live smoke). Both run through `~/.claude/bin/cdp start … -- --use-angle=metal`,
which wipes `/tmp/cdp-<port>` on each start, so every run uses a fresh profile. Each viewport also clears the origin's storage first.

## How to run (before every commit + deploy)
| command | what | time |
|---|---|---|
| `node tools/qa_unit.mjs [filter]` | runs every `tools/*_test.mjs` (except qa_*), summary table, exit 1 on any failure | ~45 s |
| `node tools/qa_smoke.mjs` | local smoke at 915×412 (mobile + touch) and 1280×720, exit 1 on FAIL | ~4–5 min |
| `node tools/qa_smoke.mjs --only mobile --quick` | fast loop: one viewport, no 10 s fps sample | ~1.5 min |
| `node tools/qa_live.mjs` | prod: api/health, api/me anon, api/worlds 401, **deploy parity** (every local client file + every vendored `gms/lib` file it imports must HEAD 200 on prod), then the same smoke in a fresh profile | ~5 min |
| `node tools/qa_live.mjs --no-browser` | API + deploy parity only | ~10 s |
| `QA_USER=<existing name> node tools/qa_live.mjs` | adds login → me → worlds → logout. It never creates users or worlds on prod | |

Flags (smoke and live): `--url U`, `--only mobile|desktop`, `--quick`, `--strict` (SKIP becomes FAIL, for the
release gate), `--keep` (leave Chrome up), `--falsify a,b`, `--out DIR`, `--port N`.
Output: screenshots `tools/qa_out/<smoke|live>/<vp>_NN_*.png`, `results.json`, and `<vp>_log.json` (console,
exceptions, every ≥400 response, failed loads, and foreign-origin requests, from the page **and its workers**).
Library: `tools/qa_cdp.mjs` exports `launch, open, stopBrowser, decodePNG, imageStats, sleep`. A page object has
`viewport, clearOrigin, goto, reload, eval, evalSafe, game(body), waitFor, shot, rect(sel,text)` (with a `covered`
hit-test), `tap, tapSel, touch, mouse, click, key`, and `log`.

## What the smoke checks (per viewport)
page loads (HTTP 200) · title screen `.sw-title` · settings: open via the title's Settings button, then Video → tap the
"Show FPS" toggle → localStorage · New World form (typed name, Survival card, "Plant the seed") · **intro skippable**
(the first play in a fresh profile must show `.sw-intro`, then Skip must close it within 3 s) · world plays (shell `playing`,
`world.isReady`, correct mode) · **chunks render** (screenshot with `#ui-root` hidden: luma std > 12, > 40 distinct
colours, lower-half edge density > 2%, < 20% near-black pixels) · **HUD controls reachable** (every visible HUD/touch control
is the top element at its own centre; on desktop the screen centre must be the canvas) · fps over 10 s (floor 30 mobile, 50
desktop; downgraded to WARN when the 1-min load average is above 60% of the cores) · **break** and **place** through real
touch-button or mouse input (aimed with a yaw/pitch hook, verified by `block:*` bus events and `world.getSub`) · the pause
button → "Save & quit" (falls back to `ui.shell.pause()`, which is reported as FAIL) · Build world: place + break · reload
→ showFps still on, the build world is in the list, and Play shows the placed and broken subs unchanged · no uncaught errors
(page + workers) · no console.error · no 4xx/5xx (locally, `api/*` 404s are expected because python http.server has no API) ·
no foreign origins (allowed: fonts.googleapis.com, fonts.gstatic.com, www.gstatic.com/firebasejs).
Desktop: headless Chrome never grants pointer lock, so after a real click the harness shims `document.pointerLockElement`.
The mouse events stay real, and the detail line says "(pointer-lock shim)".
Missing pieces are reported as SKIP with a reason (e.g. no index.html yet, no shell, so the `?play=1&nointro=1` hook route is used and marked WARN).

## Falsifying the instrument (2026-10-02, all done)
Every check was made to fail on purpose. `--falsify` sabotages exactly one thing per name:
| falsifier | sabotage | check that went FAIL (run) |
|---|---|---|
| `error` | `setTimeout(()=>{throw})` in the page | no uncaught errors (A) |
| `console` | `console.error(...)` | no console errors (A) |
| `404` | `fetch('qa_falsify_missing.js')` | no 4xx/5xx (A; listed in mobile_log.json) |
| `foreign` | `fetch('https://example.com/…')` | no foreign origins (A) |
| `render` | canvas `visibility:hidden` before the shot | chunks render: std 0, 1 colour (A) |
| `intro` | don't tap Skip | intro skippable: "still on screen 3 s after Skip" (A) |
| `settings` | wipe localStorage before reload | reload: settings persisted (A) |
| `break` / `place` | don't send the input | break / place / build place+break, 0 events (A) |
| `title` | wait for a selector that doesn't exist | title screen, and the flow falls back to the `?play` hook (B) |
| `persist` | delete IndexedDB `synthwild` before reload | reload: world persisted, "not in the worlds list" (C) |
| bad URL | `--url http://localhost:8861/gms/3d/synthwild_nope/` | page loads HTTP 404, exit 1 (D) |
| `fps` | 60 ms busy loop per rAF | fps 4.7 < 50 → FAIL (E; the contention WARN is disabled under this falsifier) |
The real bugs below falsified the rest: "HUD controls reachable" failed on the mobile touch-zone overlap and the desktop `.sw-layer`
cover, "chunks render" failed on the desktop black frame, and "deploy parity" failed on the undeployed files.
Commands: `node tools/qa_smoke.mjs --only mobile --quick --falsify error,console,404,foreign,render,intro,settings,persist,break,place`
(put `persist` in its own run, because a falsified place leaves nothing to look for), then `--falsify title`, `--falsify persist`, `--only desktop --falsify fps`.

## Results: final run 2026-10-02 ~02:00 (machine heavily contended: load avg 25–71 from other lanes' browsers)
Unit (`qa_unit`, 02:02): engine_mesher 11 ✓, game 609 ✓, player_sim 10 ✓, ui ✓; **player_test 60/61** ("real world tests:
readBox is not a function or its return value is not iterable"), **world_test 451/453** ("offset-origin gen matches aligned
chunks (2 mismatches of 5537792)", "structures identical across chunk borders: 7"). Both lanes were mid-edit, so re-run before committing.
(An earlier "mesher FAIL" was my parser matching "7/8"; that's fixed.)

Local smoke:
| check | mobile 915×412 | desktop 1280×720 |
|---|---|---|
| page loads / title / settings toggle / new survival world / intro skip / world plays | PASS | PASS |
| chunks render | PASS | **FAIL** (100% black frame, intermittent) |
| HUD controls reachable | PASS (fixed since run 1) | **FAIL** (screen centre is `div.sw-layer`) |
| fps (10 s) | PASS 59.9 fps | WARN 13.4 (contended, re-run quiet) |
| break / place (real input) | PASS/PASS earlier runs; break flaked under load in the final run | **FAIL** (clicks never reach the canvas) |
| save & quit | PASS | PASS |
| build place+break | PASS in 4/5 runs | **FAIL** (canvas covered) |
| reload: settings persisted | PASS | PASS |
| reload: world persisted | PASS (runs 4 and C) | SKIP (nothing placed) |
| no uncaught / console errors / foreign origins | PASS | PASS |
| no 4xx/5xx | **FAIL** (missing intro media + favicon) | **FAIL** (same) |

Live (`qa_live`): api/health PASS, api/me `{user:null}` PASS, api/worlds anon 401 PASS, login SKIP (no QA_USER).
Deploy parity FAIL: 3 files not deployed (`css/journal.css`, `js/game/farm.js`, `js/game/journal/ui.js`; these are new since
the last deploy). Live browser smoke: title, settings and intro PASS, then "world plays" took 33.6 s and the page stopped answering
(captureScreenshot timed out) at load avg ~70. **Re-run at 02:01 (load ~25), mobile: everything PASSES** (title, settings, intro skip,
render, HUD reach, break, place, save & quit, build place+break, reload → settings and world persisted, no errors, no foreign
origins) except no 4xx/5xx: the intro media and favicon are missing. Deploy parity on that run listed 8 files not deployed:
`assets/intro/{wake,night,vista}.webp`, `audio/vo/manifest.json`, `css/journal.css`, `js/data/difficulty.js`,
`js/game/farm.js`, `js/game/journal/ui.js`.

## Bugs: 2026-10-02 (per lane, with repro and evidence)

### Lane 2 (engine: index.html)
1. **Desktop: the mouse can never reach the canvas. Break, place, look and pointer lock are all impossible.** `index.html` has
   `#ui-root > * { pointer-events: auto; }` (specificity 1-0-0), which overrides lane 5's `.sw-layer { pointer-events: none }`
   (0-1-0). `.sw-layer` is a full-screen child of `#ui-root`, so `document.elementFromPoint(640,360)` is `div.sw-layer`, and
   input.js's `canvas.addEventListener('mousedown')` never fires. Repro: `node tools/qa_smoke.mjs --only desktop --quick` → "HUD
   controls reachable: screen centre → div.sw-layer", "break (real input): canvas centre is covered by div.sw-layer".
   Fix: drop that rule, or make it `#ui-root > *:not(.sw-layer)`. Lane 3's `.swp-touch` also relies on its own pointer-events.
2. **Desktop: an intermittent fully black frame after starting a survival world through the UI.** In 2 of 5 desktop UI runs,
   the frame was 76% and then 100% pure black (HUD fine, the dev overlay read "calls 1 tris 0k"), spawn [-5.5,35,-9.5]
   shore. It doesn't reproduce via `?play=1&nointro=1&seed=abc`. The eye cell is air and near = 0.05, so it's not a
   camera-in-block problem. Evidence: `tools/qa_out/evidence_desktop_black.png`, `evidence_desktop_black_noui.png`. Suspect
   a render-target or resize state after the intro → loading → playing transition at 1280×720. Repro: `node tools/qa_smoke.mjs --only desktop --quick`
   (check "chunks render").
3. `favicon.ico` 404 on every load: add `<link rel="icon" href="data:,">` or a real icon.
4. `renderer.info.render.calls` reads 1 on desktop while mobile reads 150–270. If `info.autoReset` is off or the info is read after a
   final blit pass, the dev overlay's "calls" figure is misleading. Low priority.

### Lane 3 (player/controls)
5. (FIXED during the session) On mobile, `.swp-zone` covered the HUD pause, the hotbar slots, the scale chip and the bag, so none could be tapped
   ("5 COVERED … under div.swp-zone" in run 4). Later runs show 17/17 reachable. The check stays in the smoke as a guard.
6. Survival hand-breaking under heavy frame times: chrome_shingle (hardness 0.7) wasn't broken by a 6 s hold at load avg ~70
   (run final_local). It broke fine in calmer runs. If dt is clamped per frame, break time stretches with frame time, so check
   that hardness × 1.5 s is wall-clock. The harness now holds for 10 s.

### Lane 5 (UI/audio/intro)
7. Intro media missing (404): `assets/intro/{quiet,wake,night,vista}.webp`, `audio/vo/manifest.json`, `audio/vo/i01.mp3`
   (presumably still generating). The intro still runs on text timing.
8. `?play=1` still plays the intro on a fresh profile (shell.js only skips it for `auto|shot|nointro`). Fine if intended. The harness
   uses `&nointro=1`.

### Lane 6 / manager (deploy)
9. Deploy parity: `css/journal.css`, `js/game/farm.js`, `js/game/journal/ui.js`, `js/data/difficulty.js` and new intro media exist locally but not on prod. Run
   `server/deploy.sh` after these land. `qa_live.mjs --no-browser` is the 10-second check.

### Lane 1 (world)
10. `tools/world_test.mjs` at 02:02: "offset-origin gen matches aligned chunks (2 mismatches)" and "structures identical across
    chunk borders: 7", which points to a chunk-border structure seam. Repro: `node tools/world_test.mjs`.

### Lane 3 (player) unit
11. `tools/player_test.mjs` at 02:02: "real world tests: readBox is not a function…". Probably an import against a changed world API.

### Lane 4
No bugs from the harness so far. Gameplay unit tests are green, and saves round-trip through IndexedDB.

## Notes for whoever runs this
- fps numbers are only meaningful when no other headless Chromes run (`~/.claude/bin/cdp list`). The table shows load average.
- If a run hangs at "Page.captureScreenshot: CDP timeout", the page's main thread stalled. That is a finding, not a harness
  bug. The viewport is reported as a `harness` FAIL and the run continues.
- Survival placing uses whatever the selected hotbar slot holds (currently a starter Fabricator).
