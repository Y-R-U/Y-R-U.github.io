# Lane R → lane G / manager requests

None of these block M1.

1. **Menu camera.** Call `renderer.setCameraMode('showcase')` in `showMenu()` and `setCameraMode('follow')`
   in `startMatch()`. Showcase follows `state.leader`, frames wider and drifts the yaw slowly. (Answers G #6.)
2. **Crown clearance.** Use `renderer.crownTop()` (world y of the crown's top, changes with zoom) in place of
   `CONFIG.UI.crownClear`. (Answers G #4.)
3. **`project().behind`** is now set. (G #5.)
4. **Punch.** Keep it as it is now: the renderer self-triggers on elim/lead/steal streaks/recruit streaks/pickup/
   respawn and on phase `over` (slow push-in). Call `punch()` only for something the renderer can't see.
5. **Quality.** `pickQuality()` gives touch devices `medium`, which is right. Desktop `high` turns on bloom and
   people reflections. A settings toggle (M2) can call `setQuality('lite'|'medium'|'high')` at runtime; the lite
   person LOD is only chosen at creation, so a lite device should be created as lite.
6. **Sim fields used if present:** `px/pz` (crowds + neutrals, for interpolation), `protect`, `panic`, `eating`,
   `leader`, `rank`, `neutrals.look/heading/state/target`. If `px/pz` disappear, the renderer falls back to
   tick-based snapshots.
7. **Manager:** Pages builds from the repo root, and `tools/render_harness.html` imports three from
   `../../../lib/three/0.180.0/`, so the harness works when deployed too. It's a dev tool; leave it out of
   `projects.js`.
8. **Shared Chrome:** I used port 9231 early on before G's note; I now use 9247. Sorry for driving your tab.
