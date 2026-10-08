# SIMPLE — simpler progressive formats after family playtests (2026-10-08)

Aaron: "For the image round, pixels and tiles are no good. Default should be show full image, with the only other option
as zoom. The reveal-more option didn't work for multiplayer again as it is too slow… so just full image or zoom is good."
Follow-ups: zoom reaches the whole picture at X% of the answer time (option, default 80%), then holds it; the timed
zoom-out is the one shared behaviour for every picture question that offers zoom.

## What changed
**Picture round (`js/formats/reveal.js`, title now "Picture round")**
- Modes: **Full image** (default; plain picture question, speed scoring) and **Zoom**. Pixels, tiles and mix are gone.
  Not progressive any more (no `stages`, no Show more, no meter).
- Old `mode: 'pixel'|'tiles'|'mix'` (favourites, `clued.last`, room specs) → Full: `generate` maps unknown modes to full,
  setup falls back to the default chip, `cleanFav` drops values no longer offered. Old stored room questions with
  `data.mode` pixel/tiles render as Full.
- Option **"Zoom: whole picture at" 50/65/80/90%** (default 80, shown only with Zoom, with a help line). Stored in the
  question as `data.fullAt`, so every online player zooms identically.
- Movie Moments, Book Moments, Song Pictures and every other picture pack get Zoom through this format; no other format
  had a pixel/tile/blur/zoom picture reveal (ladder's picture options don't zoom; listen's album-art blur is a separate
  listen option and was left alone).

**Shared timed zoom (`js/formats/fkit.js`)** — `timedZoom(box, img, src, api, { z0, fullAt, tag })`, `zoomOption(when)`,
`zoomStart(q, kids)`, `fullAtOf`, `focusOf`, `zoomTransform`, `zoomProgress`.
- Progress follows the runner's real answer ring (`api.timer.full` / `remaining`; new `full` + `running` getters in
  runner.js), so the timer setting, timeScale, the online room's answer time and the ready-gated start all count. Before
  the window opens (lead-in/hold) it stays fully zoomed in. No timer: a 10 s zoom. `zoomTransform` eases the zoom
  log-linearly from z0 to 1 while the focus drifts from the box centre back to its own place, never leaving a gap the
  picture could fill. After `fullAt` it shows the whole picture; on answer/timeout it settles to full with a 0.6 s ease.
- Focus: `focusOf` reads a 40-px thumbnail from a CORS copy (edges + colour distance from the border colour, Gaussian
  centre weight, best window of the starting zoom's size via an integral image). Unreadable pixels → centre. The picture
  stays hidden until the focus is known (≤ 700 ms) so it never jumps.
- Starting zoom 2.4 / 2.9 / 3.3 by difficulty, kids 2.2: the visible window is never under ~30% of the picture.
- Reduced motion (setting or OS) → plain Full image.

**No voting in online rooms, any format**
- room.js no longer passes `requestMore`; it passes `stagesAuto: true`. The runner then hides the Show-more button
  (and the HUD row it forced), never starts its local kids timer, and only mirrors the room's stage. Solo/party keep
  "Show more 👀" (instant advance, local time extension) and kids' 4 s auto-advance.
- Server (`rooms.go`, `scoring.go`) and P2P (`p2p_room.js`): non-kids progressive questions get
  `autoStages(format, N, answerMs)`: limit = min(90 s, max(answer×1.5, 10 s, (N−1)×pace + tail)), step =
  floor((limit − tail)/(N−1)); pace ladder 4.5 s, silhouette 5 s, others 4 s; tail = answer/2 clamped 5–8 s. Stage k is
  due at qStart + k×step (ticked every 250 ms, `dueStage`). Deadline fixed at open (moves only with the ready hold).
  Examples @10 s answer: ladder 5 clues 23 s (a clue every 4.5 s, last with 5 s left), 10 clues 45.5 s, 20 clues 90 s
  (4.47 s each); silhouette 15 s (5 s steps). This replaces ladder's 60 s long-format minimum in non-kids rooms.
- **An answer no longer locks the stage** (all rooms, kids too): players still thinking keep getting clues; each answer
  keeps the stage it was given at, so the multiplier still rewards answering early.
- Kids rooms keep the old pacing (4 s, with the deadline extension).
- Legacy: `/vote` and the P2P `vote` op stay for old clients; a unanimous vote still advances (no deadline change outside
  kids), and the schedule never moves backwards. `locked` is always false now.
- The ready gate, Next bound to its question and the ms clamp are untouched (their tests still pass; TestReadyHold's
  window literal moved 15 000 → 21 000 because its old Grow-listen question now gets the auto window).
- room.js: the "opening moved" deadline re-sync now also applies to progressive questions (fixed deadline now).

**Setup / favourites**: `optionsPanel` supports `showIf(opts)` and `help` on choice options. favmodel supports
`favLabels` and `favIf`, so a Zoom favourite reads "Picture: zoom · full at 80%" and Full adds nothing.

## Files
js/formats/reveal.js, js/formats/fkit.js, js/structures/runner.js, js/net/room.js, js/net/p2p_room.js, js/core/scoring.js,
js/ui/setup.js, js/ui/favmodel.js, server/rooms.go, server/scoring.go, server/server_test.go, server/timing_test.go,
tools/f_validators.mjs, tools/f_test.mjs, tools/fav_test.mjs, tools/p2p_test.mjs, tools/s_room_e2e.mjs (+`--ports`),
tools/p2p_e2e.mjs (+`--ports`); docs DESIGN.md, CONTRACT.md, notes F/S/P2P/FAV.

## Tests (all run 2026-10-08)
- Go `server/test.sh` ALL PASS. New `TestAutoStages` (window 18.5 s, clue 2 at 4.5 s for all three players, fixed deadline,
  ×0.8 at stage 1, no freeze after an answer, last clue with 5 s left, legacy vote jumps ahead without moving the
  deadline, schedule catches up), `TestAutoStageWindow` (table incl. 90 s cap), kids test now also checks no freeze.
  Falsified: re-adding the first-answer lock fails both TestAutoStages and TestKidsStagesAutoAdvance.
- `p2p_test` 141/0 (same scenarios + JS/Go `autoStages` parity table), `s_unit_test` ALL PASS, `a_test` 467/0,
  `fav_test` 52/0, `f_test` 2 384 190/0 (reveal validator: no stages, mode full|zoom, zoom carries fullAt; legacy
  pixel/tiles/mix/undefined → full; bad fullAt → 80).
- Headless Chrome (CDP 9490, metal, cache disabled), Movie Moments pack, 10 s timer, fullAt 80: Full at 384×854 and
  854×384 (no zoom, no Show more); Zoom scale 2.58 at 0.9 s → 1.62 at 4.2 s → `none` by 8.4 s, full on reveal, points
  scored; focus found on the subject (boy on the flying dog; the candy trail). Solo ladder: Show more visible and adds a
  clue instantly (answer recorded at stage 1).
- `node tools/s_room_e2e.mjs --ports 9491,9492,9493`: 58/0, incl. the new ladder round — no Show more/vote text on any of
  the three screens, 23 s window, clue 2 arrives by itself for everyone (~4.6 s), after Ann answers Bob still gets clue 3,
  Ann's earlier answer outscores Bob's.
- `node tools/p2p_e2e.mjs --ports 9491,9492,9493` (real broker): 41/0 with the auto-advance round.
- Server deployed with `deploy.sh`; `/api/health` OK; live probe: a 5-clue ladder room at 5 s → `limitMs: 23000`.

## Not done / for the manager
- Static client not shipped, BUILD not bumped. Until it is, live clients still show the vote button; their votes work
  with the new server, and stages now also auto-advance for them (no lock).
- A probe room or two (host "Probe") were created on the live server during verification; they expire on their own.
