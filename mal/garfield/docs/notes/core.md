# core notes

## DONE
- vendor/three 0.180.0 (+ addons; bare 'three' imports rewritten relative; SkeletonUtils from 0.160 copy — API compatible)
- index.html (classic boot watchdog → Reload card, loading bar via window.__boot.progress, landscape/no-zoom meta, rotate card, D1 disclaimer)
- js/main.js: lanes load via dynamic import with stub fallback (js/core/stubs.js); ?stub=a,b forces stubs
- js/core: renderer, post (half-res Unreal bloom, MSAA RT on high, none on low), quality, camera (orbit, wall pull-in
  vs world.camBlockers + tall colliders, auto-recenter, shots/blend/orbit), controller (AABB, step-up, coyote,
  buffer, variable jump, knockback, belly), input, interact, scratch, director, game (state machine), save, names, dev, events
- js/core/README.md = the contract for levels (ctx, director API, events)
- Verified headless: fresh launch → intro → menu (chapter unlock anim) → chapter → L1 opening → play → table jump → eat → Level Complete

- Timeouts on every lane import/create (stub fallback, reason shown in ?dev=1); ?level=N&skip=1 boots with all lanes real
- Controller: depenetration, step-up support nudge, forgiving overhead edges, landing assist (air-brake over higher tops)
- __game.sim(steps) deterministic controller harness; route suite passes (table, chair→table, counter, microwave→fridge, sill, sofa, stairs)
- Seated-Jon scratch fix (world transforms); jon.leaveSeat on level start; world.update(dt, cam, focus); audio.setListener

- Camera: lift-over-Garfield near walls, roomy-yaw pick after cutscenes/spawn; adaptive resolution; medium = no bloom
- css/ui.css (now core-owned for small fixes): tip card moved beside objectives
- Perf: props cut tris/calls; house added storey culling (my 'street visible' report was a counting error, it is hidden). Measured medium 1024x768: ~174 calls / 242k tris (incl. shadow pass), 50–60 fps headless

- Camera furniture-occlusion test (counters/sofa/table tops hide the cat → camera lifts or pulls in)
- interact def.prop → prop.highlight(on) outline; jump/land/bonk/knockback sfx
- Smoke: all 10 levels reach 'play' via goLevel with correct food/objectives; pause Start Over/Exit/Resume OK;
  live settings (camSens/invertY/quality) OK; context-loss card OK

- L10 win → level complete → (replay | chapter complete w/ 'fanfare' music → Menu=main menu); mouse right/left-drag look,
  short click = scratch (drag never scratches), wheel zoom verified

## IN PROGRESS
- nothing mid-edit

## NEXT (ideas, none blocking)
- Garfield draw calls (19) could be merged by garfield lane; house medium simplification if real iPad < 45 fps
- Camera: optional fade of furniture between camera and cat instead of lifting
- Regression: __game.selfTest() (js/core/selftest.js) = 11/11 traversal routes; run after any controller/collider change

## REQUESTS
- none open (house camBlockers delivered; ui extras delivered; props perf delivered)
