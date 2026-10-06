# polish — notes (wave 2)
Owns finished lanes' files: js/actors/garfield*/jon*/shared, js/game, js/levels, js/core, js/main.js, index.html, js/ui, css, tools/{garfield,jon,ui_kit,play}.html, tools/sim, tools/sculpt. CDP port 9409.

## DONE
- tools/sim/play.mjs + cutscenes.mjs default to CDP port 9409 (`--port=` overrides)
- 1. Garfield 'hang' clip (garfield_anim.js): body nose-up, paws gripping overhead, hind legs/belly/tail dangling+swaying.
  L5 uses it: paws (GRIP offset) pinned to the vine tip, always faces the table (no 180° spin each turnaround),
  paws slide up the strand when his feet would sink into fridge/table (ceiling is low), side-on swing camera
  (bestShot), follow cam on landing. controller.animHold (new) stops the controller overriding a level-owned clip.
  Fixed: the grab key press immediately firing the 'too early' miss bark.
- 2. L6 flingSpot: samples 24 directions round the table; spot must have nothing overhead/nearby (R 0.45: not under
  the bench/chairs/table, not against walls/fridge), clear plate arc, and a nav path for Jon. Export for testing.
- 3. L2: Jon rocks the chair back upright (tween, rides it) instead of the chair snapping upright. core/game.js
  startLevel now fades to black BEFORE teardown, so restart/replay resets happen behind the fade.
- START GATE (Aaron, high): js/ui/gate.js + ui.gate.show({onGo}) + CSS `.ui-gate`; main.js shows it after boot on
  EVERY visit before game.start(); onGo (inside the gesture) = audio.unlock() + fullscreen/landscape lock on touch.
  Bypassed by ?level=N, ?skip=1, ?shot=1, ?nogate=1 (cutscenes.mjs intro uses nogate). Verified headless: ctx
  'none' → 'running' after the click, intro VO j_intro_1/g_intro_1/j_intro_2 all 'played' (not silent).
  NOTE: audio/music/ is empty, so music is silent until media delivers files.
- HUD: touch-specific tutorial texts (card.touchText, used when ui.isTouch); chase 'Run!' pill moved below the tip
  card (was hidden behind it); toasts lowered under a 4-row objectives box. Checked 1280x720, 1024x768/1180x820/844x390 touch.
- Jon nose (Aaron): ~2/3 the length, rounder bulb (jon_head.js; rebaked jon_head_data.js). Checked front/side/3q +
  cover_face/sit_eat/throw clips.
- 5. Garfield: belly@1 spikes fixed (lower-leg/paw morph deltas attenuated + outlier smoothing in garfield.js
  buildGeometry); ears = small rounded triangles (sculpt capsule shorter/rounder tip, rebaked garfield_mesh.js);
  bigger chomp (eat/chew mouth open + taller mouth lens + tongue); whacked = 3 orbiting stars (counter-squashed) +
  rolling eyes (new 'dizzy' ext channel); run stride 0.95→0.6 m (hind-foot slide at 3.3 m/s 0.62→0.17 m/s).
- 6. Jon: back of hair = two layers of soft overlapping tufts (jon_body.js) instead of a bowl-cut shell edge;
  opening cutscene: floor bowl hidden until Jon's give_bowl 'place' event (no second bowl waiting on the mat),
  deeper give_bowl squat (hand ~0.15 m at release), held bowl recoloured blue to match; L10 faceplant: fallDir()
  picks a clear 1.6 m direction and Jon hops to frag − 0.45·dir so he lands ON the shards, not through the
  radiator/wall.
- 7. Camera: js/core/fade.js — furniture meshes between camera and Garfield (3 rays, 10 Hz) fade to 0.28 via
  cloned materials (walls/floors = camBlockers never fade; merged batches >2.2 m radius skipped); camera.js also
  steps the lens out of any collider volume. Under-table views now show the cat. Toggle: camera.fadeOccluders=false.
- Regression after all of the above: play.mjs 1-10 all PASS, catch PASS, selfTest 11/11.
- Playthrough fixes: intro pounce + "GARFIELD!" now side-on two-shots (Jon no longer blocks with his back);
  intro exterior = one continuous Catmull-Rom glide (art2 request) + dining cut keeps anchor fov; opening: wide
  shot for Jon's walk to the table (he used to walk through the camera), front-3/4 shot for the bite+spit (head
  was cropped); win camera uses bestShot (was inside the ceiling/wall on the fridge top in L5).
- "Not yet" food prompts (guardLabel) are now a muted pill (hud interactHint), never the green touch button, and
  don't steal Space from jumping (main.js hasInteractable).
- Real-input checks (scratchpad walker): L1 at 1280x720 + 1024x768 touch (sofa, bench→table, face scratch, eat),
  L8 stairs→bedroom→bed scratch 3/3. No hard stuck spots; approaching the bench from under the table edge bonks
  the tabletop (kid has to step back), wall-sliding near (7.3,0,5.8) is slow.
- FINAL regression: play.mjs 1-10 PASS, catch PASS, selfTest 11/11.
- (a) breakLeg(i) and (b) vase 1.8 s race were already in place.

## IN PROGRESS
- nothing (wave-2 polish lane complete)

## NEXT
- a real iPad check (touch joystick feel, perf with art's grade); real-input runs of L2–L7, L9, L10
- Jon's sofa-arm-in-lens corner case (camera squeezed between sofa and wall); merged furniture batches never fade
- win close-up: first frames still behind Garfield during the 0.9 s dolly

## REQUESTS
- none
