# integrator notes

Owns: `js/game/*`, `js/main.js`, `js/engine/{player,camera,input,devpad}.js`, this file. P1 "One Good Shift" first playable.

## Runtime map (js/game)
- `game.js` createGame(api) — orchestrator + state machine (`title → intro → free ⇄ results/down`), UI/audio/sim wiring, panels, loot, death, PA, autosave, `__game.runtime` (= G) and `__game.snapshot()`.
- `runner.js` mission step runner (goto/pickup/deliver/kill/destroy/photo/exfil/hack*/choose/survive; twists; scripted A1-M1 ambush; surveil stealth + lens). Virtual site ids (`plaza_1`) of unbuilt districts are remapped onto Aurum sites by tag.
- `enemies.js` robots + sim combatants + AI (swarm/rusher/striker/spotter, guard detection cone, alert groups, flee, leash). `combat.js` player baton (auto-target, auto-approach, combo, chain), Zap (hitscan tracer), Overclock, Sponsored Content (distract + holo ad), dodge (i-frames).
- `props.js` nests (destructible), carry items, beacons, loot beams by rarity (magnet pickup). `fx.js` pooled additive VFX. `nav.js` 1 m walk grid + A* (tap-to-move and autopilot use it). `hud.js` HUD sync/minimap/marker/projection. `story.js` STORY §8 script player (card/bark/dlg/action). `overlay.js` story cards + bark subtitles. `auto.js` ?auto=1 pilot.
- Flags: `?auto=1` (`&contracts=N`), `?speed=2` (time scale), `?shift=60` (60 s shifts), `?seed=`, `?fresh` (hide Continue).

## DONE
- Title (New/Continue) → intro cards + HIRA/Harmony barks + Mara dialogue (VO) → kiosk → board. A1-M1 plays end to end (pickup, 3-rat ambush gates delivery, heir-key dialogue, results, level 2).
- Random contracts run through the same runner; results screen; loot drops; warehouse wiring; save/continue (mid-contract saves restart the contract).
- Camera: closer Diablo framing via rig.keys override in main.js (zoom 0.35 = dist 9.2, pitch 52, fov 36).

## IN PROGRESS (integrator #2, 2026-09-26)
- Autopilot full pass GREEN: `?auto=1&speed=2` title → intro → A1-M1 (3 rats, heir-key dlg, L2) → courier → pest (L3) → warehouse auto-equip (FR 18→44), ~97 s wall, 0 console errors (the favicon 404 was the driver's /tools/ page, not the game).
- Finisher's "for the integrator" items were already wired by #1: setVoice→audio.vo, volumes→setVolumes, stopVo on dialogue:end, toUiCodex, bark subtitles suppressed under dialogue/panels.
- DONE since: goal chip (game.js nextGoal: kiosk → story card → first frame 1,500 cr → sim goal; hidden in contracts); fx.js truly pooled (+impact/slash/pop); knockback (enemies.knock), finisher/crit/kill hit-stop + shake, slash arcs, loot pop, removed per-frame Vector3 allocs (camera, title cam, hud).
- DONE: Aaron's camera look controls (see "Camera controls" below).
- Next: goal chip (showed "Stash 90 · 5,000 cr" at start), fx pooling / per-frame allocs, combat juice, death/save flows, perf, acceptance table.

## Integrator #3 (2026-09-26) — IN PROGRESS
- Plan: (1) speed-1 `?auto=1&contracts=3` regression + fps/hitch, (2) P1 acceptance table below, (3) real-touch CDP re-verify
  of look/zoom/tap/joystick/skills at 915x412 DPR2, (4) first-3-minutes context prompts + Warehouse first-visit pulse,
  (5) save/continue, death→redeploy, rental fee, results final pass. Then "P1 PLAYABLE" line on top.
- NEW `js/game/coach.js`: first-session lessons (move, look, interact, attack, dodge, skill, warehouse, board), one gold hint
  pill at a time (top centre) + pulse on the named control; each shows once (`sim.state.flags.coach`) and clears when done or
  times out; hidden under dialogue/panels/cards/story beats. First item drop → Warehouse button badge + pulse + hint.
  Story 'move'/'attack' toasts removed (coach replaces them). Free roam with no contract: marker/minimap → "Contract board".
- Regression driver: scratchpad `integrator/reg.mjs` (rAF frame-delta probe; hitches >100 ms after 10 s; NOSHOT=1).
- REGRESSION (speed 1, `?auto=1&contracts=3`, 915x412 MOBILE DPR2 high, M5 metal): ok, story + 3 random (courier/retrieve/pest,
  one bot death to a Popper → failed+retaken), L3, 690 cr, surcharge shown −22→−78, FR 18→42, 0 console errors.
  58.3 fps avg, p50 16.7 / p95 16.8 / p99 33.4 ms, max 67 ms, 0 hitches >100 ms, max 265 calls, dpr held 1.75.
  (1st run's 4 "hitches" at 60/121/182 s were the driver's own Page.captureScreenshot every 60 s.)
  A box-shadow pulse animation on the coach target cost ~3 fps and made the governor drop dpr to 1.39 → replaced by a
  separate transform/opacity ring element.
- Coach bug caught by the run: `ui.badge` is `ui.hud.badge` (threw every frame → runtime fell back). Fixed.
- REAL TOUCH (`integrator/touch.mjs`, Input.dispatchTouchEvent, 915x412 DPR2): 11/11 — orbit 86°/200 px, pitch drag,
  pinch 9.2→6.45 m, reset button, tap-to-move 3.7 m, joystick (dir·camFwd 1.000), dodge, attack, skills s1–s3,
  interact (kiosk → board), Warehouse HUD button. **Harness gotcha:** only the FIRST touch session on a headless Chrome
  gets touches; later sessions degrade to mouse-only (2/11, only click-driven buttons). Restart `cdp` before each touch run.
- auto.js: `step()` returns once `finished` (it used to keep closing panels opened by tests). combat.js: unknown sfx `holo`.

## Camera controls (Aaron, 2026-09-26) — finished
- **Look:** one-finger drag on the canvas (anything outside the joystick zone and buttons) orbits: horizontal = yaw, full 360°
  (0.0075 rad/px, ~840 px per turn); vertical = pitch offset, effective pitch clamped **12°–70° (D16)**. Below 30° the rig
  smoothsteps into a vista: look point +1.8 m, distance ×1.2, fov +6° → at 12° the horizon sits ~20% from the top. Smoothed (k=18) with fling inertia
  (decay 5/s; no fling if the finger rests >80 ms before lifting). Tap = <10 px and <250 ms (mouse clicks: any duration); longer
  or further = look-drag, never a tap. Mouse: right- or middle-drag orbits; Q/E rotate (E ignored while an interact prompt shows,
  since E = interact). Wheel and two-finger pinch zoom.
- **Zoom:** rig.zoom 0..1 → keys `[0, 6.45 m, 48°, fov 37] [0.35 default, 9.2 m, 52°, 36] [1, 13.8 m, 56°, 36]` = 0.7×–1.5× distance,
  pitch eases +/-4° with zoom. `?shot=` keeps the old keys, so art's reference framings don't move.
- **Reset:** `.hf-recenter` round 44 px button under the minimap/district label (js/ui/hud.js), fades in when yaw/pitch/zoom are
  off default, taps → `rig.reset(0.4)` (smoothstep, shortest yaw direction), then fades out. Event `recenter`, `ui.hud.recenter(on)`.
- **Follows yaw:** joystick/WASD are camera-relative (`rig.screenToWorld`, main.js tick), dodge direction too; minimap is
  heading-up (canvas rotated by yaw; the UI's `.me` arrow shows player facing; the "N" compass via `ui.hud.heading(-yaw)`);
  objective marker/off-screen arrow via projection; audio listener pans from the camera matrix; auto-target uses player yaw (world).
- Verified headless (cam.mjs): drag 200 px = 86°, joystick-up·camera-forward = 0.997, fling, pitch clamp 70°, tap still moves,
  pinch → 0.7×, reset → exactly default, button 44×44, 0 console errors.

## Also fixed this session (#2)
- Standoff bug: attack() picked targets out to reach+0.5 but release() only lands within reach → endless whiffs. One reach test
  (`combat.inReach`) now gates the swing; out of reach = auto-approach along a nav route (ctx.walkTo, re-routed every 0.35 s).
- Enemies chased in straight lines and pinned themselves behind planters: `chase()` uses nav.los / nav.route (refresh ~0.6 s).
- Sites inside geometry (fountain_plaza 7.8 m, fountain_falls 16.3 m, 6 others <2 m) are snapped to the nearest walkable cell in
  the runner (`nav.nearest`) — a surveil at fountain_falls soft-locked the autopilot. All 38 sites now route from spawn.
- Death: the Redeploy button showed "NaN cr" (string cost into fmt). Wrecked random contracts now fail with a toast (the sim
  failed them silently); checkpoint (story) contracts toast "Back on the job". Redeploy clears stray hostiles within 30 m of the
  kiosk, calms the rest, and gives 3 s spawn protection (a Rustkin pack parked at the kiosk killed the bot 14× in a row).
- audio.sfx minGap is ms; js/game passed seconds (0.05) so it never throttled. Fixed.

## Edits outside my files (owners gone at the time)
- `js/world/crowd.js`: added `crowd.scare(x,z,r)` + flee movement (civilians get out of fights, D15).
- `index.html`: `<link rel="icon" href="data:,">` (favicon 404 was the only console error).

- `index.html`: removed `#ui-root > * { pointer-events: auto; }` — the ID selector beat `.hf-root{pointer-events:none}` so the UI
  root ate EVERY touch/click: canvas tap-to-move and look-drag never reached the canvas (only joystick-zone taps worked).
- `js/ui/hud.js` + `ui.js` + `icons.js` + `css/hud.css`: reset-view button (`recenter` icon, event, `hud.recenter(on)`).

## Requests
- **art (camera yaw):** (1) tree canopies/planters sit between camera and player at yaw 90–180° (player hidden under leaves):
  please fade or cut out foliage on the camera→player segment like the building fade. (2) at yaw 270° near (-30, 40) a building's
  west side is a flat untextured grey slab filling a third of the screen and it is not faded; the fade target test should use the
  camera→player segment for any yaw. With D16 (pitch 12°) the tree canopy problem is worse: at yaw 90 from (0,20) the player
  is fully under leaves. (3) perf at the 12° vista, high tier, M5 metal, 915x412 DPR2: 35–46 fps (vs 60 top-down), e.g. from
  (10,-40) looking south 38 fps, (-30,40) looking west 35 fps.
- (done) `world.billboards.show('harmony_face', {line, duration})` now drives the intro `billboards_face` beat and T10 (sting fallback).
- sim: `sim.hud().goal` is an object — fine now (finisher HUD renders it).

## Gotchas
- ui.interact.show rewrites innerHTML: game.js only calls it when the label changes.
- Story beats' text in story_a1.js is abbreviated with "…"; story.js uses `audio.voInfo(key).text` (full line) when present.
