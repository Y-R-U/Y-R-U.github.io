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

## Camera controls (Aaron, 2026-09-26) — finished
- **Look:** one-finger drag on the canvas (anything outside the joystick zone and buttons) orbits: horizontal = yaw, full 360°
  (0.0075 rad/px, ~840 px per turn); vertical = pitch offset, effective pitch clamped 35°–70°. Smoothed (k=18) with fling inertia
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
  camera→player segment for any yaw. Horizon never shows (pitch ≥35°, zoom ≤13.8 m), so the skyline is safe.
- art/world: `world.billboards.show(key)` hook for T10 "Harmony Watching" / intro `billboards_face` (currently a sting banner).
- sim: `sim.hud().goal` is an object — fine now (finisher HUD renders it).

## Gotchas
- ui.interact.show rewrites innerHTML: game.js only calls it when the label changes.
- Story beats' text in story_a1.js is abbreviated with "…"; story.js uses `audio.voInfo(key).text` (full line) when present.
