# GAMEPLAY lane

Owns `js/main.js`, `js/core/**`, `js/flight/{hud,controls,cameras}.js`, `js/hud/**`, `css/game.css`, `index.html`, this file
(+ granted: `css/radio.css`, `js/radio/hud.js`, `js/audio/**`, small additions to `js/ui/settings.js`, banking in `js/game/{score,index}.js`).
Test: `~/.claude/bin/cdp start --port 9491 -- --use-angle=metal` then `node tools/test-gameplay.mjs [--only=portrait,landscape,desktop,finish,ground] [--falsify]`
(real CDP touch at 390×844 / 844×390, mouse at 1280×800; shots in `docs/shots/gameplay/`). Keep `node tools/test-flight.mjs --port=9491` green.

## What is where
| thing | file | notes |
|---|---|---|
| score widget, PP popups, combo, banked toast, rank-up ceremony (+ `fx.celebrate` via `rankUp` game event), scandal frozen state | `js/hud/score.js` | hint line: TAKE OFF & LAND / LAND & STOP / DEMAND IT TO BANK |
| D24 headlines: newspaper counter on the score widget + "That'll hit the papers!" toast; reel after landing (Next / Skip all) | `js/hud/headlines.js` | big rule-breaks (one per rule per flight) + scandals; reel opens 1.6 s after `finished` or a ground `banked`, waits for the ceremony; reel is fixed z 29 (above STORY's card z 28, below js/ui popups z 30) |
| opportunity prompts from ATC state (rate-limited, dismissible, settings `hints`) | `js/hud/prompts.js` | |
| first-run coach marks (goal / stick / release / radio / bank), non-blocking | `js/hud/coach.js` | `krayzee.coach` in localStorage; `?coach=1` forces |
| D19 LANDED — DEMAND IT (ready / greyed + reason) | `js/hud/finish.js`, zone rules `js/game/finish.js` | Easy ≤300 m of any runway incl. grass; Medium runway or apron; Hard apron stands or the designated spot (gold ground ring + beam + FINISH HERE target marker). Free Flight keeps a 15 s stop auto-bank fallback |
| D21 DEMAND TAKEOFF, D22 Skip to runway, D19 difficulty chips | `js/hud/ground.js` | chips show on the ground in Free Flight until the first lift-off (pending 0); choosing rebuilds the game object and saves `settings.difficulty`. Settings "Free Flight difficulty" does the same |
| D20 fuel cell + low-fuel flash (≤15 %), out-of-fuel flash; DEMAND IT calls `ac.refuel()` | `js/flight/hud.js`, `js/main.js` | reads `ac.fuelFraction` |
| D22 next flight starts where the last DEMAND IT stopped | `main.js` `S.lastStop` | |
| controls: stick travel ~94 px phone / 110 desktop, expo, bank soft-limit ~60° (Easy/Medium), roll damping; ground: stick X steers the nosewheel | `js/flight/controls.js` | |
| cameras: inside views use `rig.viewEye(view, aspect)` (ART3 portrait framing); landscape 92° h-fov; chase frames the plane in the band clear of subtitles and the action slot | `js/flight/cameras.js` | |
| radio: button just above BRAKE (mirrors with stickRight), chip tray beside it, transparent pills, 3-line subtitles, dedupe of identical consecutive lines, tower label wraps, paused → radio stopped and hidden | `css/radio.css`, `js/radio/hud.js`, `main.js` pause() | |
| friendly ATC reasons (`CROSSINGTRAFFIC` → TRAFFIC ON THE CROSSING RUNWAY) | `main.js` `friendlyReason` | |
| D23/D25 stall horn | `js/audio/index.js` (soft 440/554 Hz pulsing hum, very quiet), `settings.stallHorn` default off (Settings → Sound → Stall warning), only within ~3 kt of the stall | all other sounds untouched |
| ASSIST markers + LAND button | `main.js` updateMarkers / onLandPress | target = mission target > opportunity > Hard spot > active runway |
| FX | `main.js` per docs/FX.md | player + AI tracked; AI events forwarded; `setQuality` through the R.setQuality wrapper (also world.setQuality) |
| STORY | `main.js` per docs/STORY.md | Story menu button is taken over in capture phase (UI's SOON badge removed at runtime), `?mission=1`, `?intro=1`; warp chip (D18) placed under the tower badge (portrait) / beside it (landscape); sim scale = TIMESCALE × story.simScale (held at 1× while paused or the reel is open) |

## STORY follow-ups
Intro plays by itself on the very first launch (no saved pilot, intro unseen; skipped headless and with `?intro=0`), then the menu
(and the creator). A "▶ Watch the intro" link is injected under the menu grid. Scandal grace: Easy/Medium story and careers under
1,500 PP get a HUD warning and −35 tower outrage instead of a Royal Scandal (Hard story and seasoned careers get the real thing).
LAND assist final is now 600–1200 m (dist × 0.3; was 600–1400 m, dist × 0.4); 500 m minimum failed ASSIST's terrain-clearance test.
Coach marks decide touch vs keyboard when shown (touch seen, `maxTouchPoints`, coarse pointer), not once at boot.

## Aircraft types + Online
Free Flight aircraft: `?plane=c172|tiger|bathtub`, else `settings.aircraft`, picked with the AIRCRAFT chips (Runabout / Moth /
Bathtub) parked before the first lift-off (rebuilds the player). The type goes to `createPlane`, `new Aircraft({type})`,
`circuitRoute(E, {type})`; attract flies `['c172','c172','tiger','bathtub']`. Story always flies the C172. A proper Hangar picker
(unlock ranks: Moth = Earl, Bathtub = story) belongs to the UI lane.
Online: `ui.setOnlineAvailable(!!?net=)`; `onOnline` lazy-loads `createNet` + `createLobby` and ticks `net` every frame; a started
room enters an 'online' session (no warp). Plane sync (`sendPlane`/`applyRemote`, remote rigs) and the account token are not wired yet.

## TRAFFIC wiring (docs/FLIGHT.md table)
`linkTraffic(atc, traffic, { playerId, mischief })` with `settings.aiMischief` ('off'|'low'|'high', default 'low'; `wiring.setMischief(s)` on change);
`traffic.setAIProtection` follows the difficulty's protection (rubber in the menu); `atc.on('runwayChange')` flashes the HUD and the
runway target marker shows `RWY 27 → 09 SOON` while `atc.pendingRunway` is set; DEMAND TAKEOFF / Skip use `link.demandTakeoff(P)` /
`link.skipToRunway(P)`; `link.placed(P, 8)` after every place/respawn/teleport; `attract.seedRivals()` on play start + respawn;
radio context runway = `ap.status().end` (an id, also during landAt).

## PERF items done (docs/PERF.md)
#3 controls cache the viewport on resize and write DOM only on change; markers read the viewport only after a resize and skip
clears when empty. #5 `checkShaderErrors` off unless `?debug=1`, `compileAsync` (4 s cap), boot yields between build steps.
#6 audio ramps skip while the context is suspended and skip ≤0.5 % re-sends; `updateAudio` returns until unlocked, no per-frame
Vector3s. #7 phones always build low content. #8 medium DPR 1.5, markers canvas DPR ≤1.5. Governor: frame CPU fed in; steps up at
≥50 fps when frame CPU < 60 % of the interval, steps down after ~10 s under 52 fps. Importmap → `three.module.min.js`.
Not done: deferring the radio's barks/script JSON (needs an option in js/radio/index.js, RADIO-owned).

## Settings keys used
`hints` (default true), `trafficMarkers` (true), `difficulty` ('easy'), `stallHorn` (false), `aiMischief` ('low'), `invertPitch`, `stickRight`, `views`, `view`, `units`.
main.js caches settings (`settings()`), refreshed by `onSettings`; it no longer parses localStorage every frame.
js/ui/** belongs to UI round 3 now: the Settings rows for `stallHorn` (added here before the hand-over) and `aiMischief` are theirs.

## Test notes
Headless Chrome intermittently swallows the first touchStart after the LAND tap (no DOM event at all); the ground test lands the thumbs 30 ms apart and retries up to 4×. The ground override itself passes in both orientations. The Hard finish test clears AI off the stand first (real metal: a stand collision crashes and respawns you).

## Test hooks
`window.__game`: `state()`, `S`, `hud` (score/prompts/coach state), `ghud` (`headlines.state`, `ground.state`, `finish`), `wiring`,
`teleport`, `setControls`, `release`, `log()`.

## Open / for other lanes
- UI lane: the Story button still says SOON in `js/ui/menu.js`; main.js strips it at runtime. Proper fix: route `story` through `hooks.onPlay`.
- Difficulty in Free Flight comes from `settings.difficulty`, mapped to protection (Easy=Rubber, Medium=Partial, Hard=Realistic) in `core/wiring.js`.
- Headlines only come from big infractions + scandals (HUD-side table in `headlines.js`); SCORE/DESIGN may want to own the copy.
