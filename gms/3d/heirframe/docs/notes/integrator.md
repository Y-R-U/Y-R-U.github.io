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

## IN PROGRESS
- Autopilot full pass (A1-M1 + 2 random + warehouse), then look/feel polish, ?q=low check.

## Edits outside my files (owners gone at the time)
- `js/world/crowd.js`: added `crowd.scare(x,z,r)` + flee movement (civilians get out of fights, D15).
- `index.html`: `<link rel="icon" href="data:,">` (favicon 404 was the only console error).

## Requests
- art/world: `world.billboards.show(key)` hook for T10 "Harmony Watching" / intro `billboards_face` (currently a sting banner).
- sim: `sim.hud().goal` is an object — fine now (finisher HUD renders it).

## Gotchas
- ui.interact.show rewrites innerHTML: game.js only calls it when the label changes.
- Story beats' text in story_a1.js is abbreviated with "…"; story.js uses `audio.voInfo(key).text` (full line) when present.
