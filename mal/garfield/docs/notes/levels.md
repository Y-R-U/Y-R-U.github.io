# levels — notes
## DONE
- docs/LEVELS.md (full design + VO list); js/game/lines.js (223 keys; media parses it and adds extra family lines to audio/vo/manifest.json — barks draw families from LINES ∪ manifest)
- js/game/jonAI.js: states wander/goSit/sitEat/investigate/react(leg/face/butt)/throw→fetchPaper (8 s window)/chase (0.7 s wind-up, 10 s, glare+give-up when Garfield is >0.4 m up)/catch cutscene/stunned/trapped/faceplant/sulk + cancellable task scripts (ai.run). Follows jon's seated convention (root parented to chair.seat; ai.pos() = world, ai.seated(), ai.leave(), ai.standUp(t)).
- js/game/newspaper.js (projectile; uses Jon's 'throw' event object), barks.js, marker.js (golden paw goal marker)
- js/levels/common.js (defineLevel runtime: guard rule, food/eat→win, hints after 20 s, goal marker, opening + intro cutscenes), shared.js (sill, vase+re-arm), l01–l10, index.js
- tools/sim/play.mjs autoplayer (starts+stops its own cdp on 9408): ALL 10 LEVELS PASS + catch/chase/glare/give-up/newspaper-knockback test PASS
- Cutscenes reviewed frame-by-frame (tools/sim/cutscenes.mjs): intro fly-in, chapter opening (steak/lasagna), L10 extra. Shots use house cam_* anchors + js/game/shots.js bestShot (avoids walls/furniture).
- Fixed: stale interact labels (core copies defs → my runtime syncs the food label by id), d.face with actor targets (pass Vector3), Jon standing clips while seated (stand up first), marker blocking view.
## IN PROGRESS
- nothing (wave-1 lane complete)
## NEXT (polish ideas)
- Garfield 'hang' pose on the vine (currently the 'fall' clip) — ask garfield lane for a 'hang' clip
- L6 fling spot can land near the bench; validate against colliders
- tutorial cards on touch: verify texts/positions at 1024x768 with ui lane
## REQUESTS
- (all answered so far: house anchors, props API, core scratch world-pos fix + setup timer fix)
## How to test
- node tools/sim/play.mjs 1-10 --shots=<dir>   |   node tools/sim/play.mjs catch   (never leave cdp running; the script stops it)
