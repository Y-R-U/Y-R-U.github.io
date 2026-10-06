# js/core — engine + integration (owner: core)

Boot: `index.html` → `js/main.js`. Every lane is loaded with a dynamic `import()`; if a module is missing, throws,
or lacks its export, a stub from `stubs.js` is used and `?dev=1` shows `lane: stub (...)`. Force stubs with
`?stub=world,jon` (or `?stub=all`). A classic inline watchdog in index.html shows a Reload card if the boot makes no
progress for 20 s.

## URL hooks
`?level=N` straight into level N · `?skip=1` skip cutscenes · `?touch=1` touch UI · `?q=low|med|high` ·
`?dev=1` dev overlay (fps / calls / tris / pos / state / lanes + level buttons) · `?shot=1` adds `html.shot-mode` ·
`?nointro=1` skip the first-launch intro · `?stub=a,b`.

## Tests
`__game.sim([{t, x, y, jump}], {every})` runs the controller deterministically at 60 Hz (camera-relative: set
`__game.sys.camera.yaw = rotY + Math.PI` first) and returns a trace ending in `END x y z surfaceId`.
`__game.selfTest()` runs js/core/selftest.js (11 traversal routes in the real house) → {pass, total, rows}.
`__game.sys.timings` = {setup, toPlay} ms for the last level start. Quality `medium` has no bloom; the renderer
lowers its pixel ratio when fps < 42 for 2.5 s in play and recovers above 57 fps.

## window.__game
`state` ('boot'|'intro'|'menu'|'chapter'|'level'(opening)|'play'|'won'), `paused`, `level` (live module), `ctx`
(so `__game.ctx.jonAI`), `fps`, `info` {calls, tris, geos, tex, quality}, `pos`, `skipCutscene()`, `goLevel(n)`,
`menu()`, `chapter()`, `intro()`, `win()`, `teleport(x,y,z,rotY)`, `save`, `sys` (every system object), `lanes`.

## Level module (js/levels/lNN.js) and js/levels/index.js
`index.js` exports `levels` (object keyed 1..10), `playOpening(ctx)`, `playIntro(ctx)`.
Level: `export default {id, food, title, objectives:[text], hints, async intro(ctx)?, setup(ctx), update(ctx,dt), teardown(ctx)}`.

Flow: fade → `world.reset()` → `world.setFood(food)` → Garfield at `playerSpawn`, Jon at `jonSpawn` → ctx built →
`setObjectives(level.objectives)` → `await level.setup(ctx)` → (unless `?skip=1`) `await playOpening(ctx)` then
`await level.intro?.(ctx)` → HUD on, controls unlocked, state 'play' → `level.update(ctx, dt)` every frame while not
paused (also while `director.active`, e.g. Jon's catch cutscene) → `ctx.win()` → celebration + belly +0.15 + save +
`ui.complete` → next / replay / chapter menu. Restart / Exit / new level call `level.teardown(ctx)`.

## ctx
```
THREE, renderer, world, anchors, camera, controller, garfield, jon, director, input, interact, scratch, ui, audio,
save, names, levelN, level, quality, skip, events, time, paused,
objectives, setObjectives([text|{text,done}]), objective(i, done=true), win(), every(secs, fn),
jonAI / barks — set these yourself in setup (ctx.jonAI = createJonAI(ctx)).
```
- `ctx.events` is a per-level emitter (on/off/once/emit), cleared at teardown. Core forwards:
  `scratch` {hit:'jon'|'prop'|null, zone, propId, point}, `jump` {pos, surfaceId}, `land` {y, surfaceId, fallH},
  `bonk` {surfaceId, collider} (head hit the underside of something — L9's under-table jumps), `interact` {id},
  `idle` {secs} (every 8 s without input), `input`, `knockback` {dir, strength}, `cutscene` {on}, `highlight` {id}.
- `ctx.interact.register(def)` / `ctx.scratch.register(def)` return an unregister fn and are auto-cleared at teardown.
- `names.apply(text)` swaps Garfield/Jon (and `{garfield}`/`{jon}`) for the player's names.

## controller (js/core/controller.js)
`pos`, `vel`, `grounded`, `surfaceId`, `speed`, `belly`, `locked`, `lock(bool)`, `teleport(pos, rotY)`,
`knockback(dirVec3, strength≈4)`, `setBelly(t)`. Tuning in `TUNE` (run 3.3 m/s, jump apex 0.98 m, coyote 0.13 s,
buffer 0.16 s, step-up 0.27 m). Collision: every `world.colliders` box blocks from the sides and below and can be
stood on; `oneWay:true` lets you jump up through; `noWalk:true` prevents standing on it; `enabled:false` ignores it.

## interact
`register({id, pos|getPos(out), radius=0.6, heightTol=0.6, label, enabled(), onInteract, marker=true, markerHeight})`.
Nearest eligible (xz distance ≤ radius, |dy| ≤ heightTol vs Garfield's feet) is highlighted with a ring + bobbing marker
and `ui.hud.set({interactLabel})`. Triggered by E/F/Enter, Space (takes priority over jump, D9), the HUD prompt, the
touch Interact button, or a click/tap near the highlighted object.

## scratch
J/K, left click (short, not a drag) or the touch Scratch button. Cone ~0.58 m in front, claw at Garfield's
feet + 0.26 m. Jon: zone from `jon.hitZone(point)`. Registered targets: `register({id, getPos(out)|pos, radius=0.3,
heightTol=0.5, enabled(), onHit(info)})`. Cooldown 0.42 s.

## director
`await director.run(async (d) => {...}, {skip, letterbox=true, unlock=true, keepCamera, behind})` — nested runs are
fine; `director.active`, `director.skip()`. Steps (all resolve instantly once skipped; `walk` snaps to the end):
`d.cam(poseOrAnchorName, {dur, ease, fov})` (pose `{pos, look, fov}`; anchors `cam_*`), `d.cut`, `d.follow`,
`d.walk(actor, anchor|Vector3, {speed, run, rotY})` (uses `world.nav.path`), `d.face(actor, target)`,
`d.turn(actor, rotY)`, `d.place(actor, anchor, rotY)`, `d.play(actor, clip, {once})`, `d.say(who, key, {thought,
text, dur})` (text from `audio.voLines[key].text`, VO via `audio.vo`), `d.wait(s)`, `d.until(fn, timeout)`,
`d.tween(fn(k), dur)`, `d.parallel(...promises)`, `d.fade(toBlack, dur)`, `d.letterbox(on)`, `d.sfx`, `d.music`.

## camera
`cam.shot(pose, {dur, ease})`, `cam.cut(pose)`, `cam.follow({dur, behind})`, `cam.orbit({center, radius, height,
speed, look})`, `cam.shake(a)`, `cam.yaw/pitch/dist`. Collision pulls the camera in against `world.camBlockers`
(meshes) and tall `world.colliders` (`cam:false` to exclude, `cam:true` to include a short one).
