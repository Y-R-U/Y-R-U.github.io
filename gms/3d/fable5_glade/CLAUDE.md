# The Glade — Fable 5 ARPG graphics test area

Mobile-first Diablo/RuneScape-style test scene: a circular grass meadow with
a tap-to-move hero, villager NPC, chickens, thatched cottage, campfire,
collidable props, and floating pickups. Three.js 0.160 via CDN importmap, no
build step, **no external assets** — every model is built from three.js
primitives in code and every texture is a procedural `<canvas>`.

The point of this scene is to evaluate object quality, so the 🐞 debug button
(top right) lists every registered object with live position, triangle count,
a build note, and a Focus button that flies the camera to it. Toggles:
Wireframe / Colliders / Pause.

## Files

- `js/config.js` — tuning, site layout (`SITES`), `?shot` / `?lite` / `?auto` URL modes
- `js/registry.js` — object registry; **everything visible must `register()`**
  so it shows in the debug panel (name, category, icon, collider, pickup, note)
- `js/world.js` — sky shader + sun glow, polar-grid meadow disc (`groundHeight(x,z)`
  is THE height function — props/characters all sit on it), cliff skirt, water,
  instanced grass tufts + flowers, clouds, lighting
- `js/props.js` — house, trees, rocks, well, fence pen, barrels, crates,
  campfire, stone path, pickups. One `makeX()` builder per object returning a
  `THREE.Group` with origin at ground level; placed + registered in `buildProps()`
- `js/entities.js` — `makeHumanoid(opts)` factory (hero + villager), chickens
  (wander/peck/flee state machine), butterflies; procedural walk/idle animation
- `js/controls.js` — tap-to-move raycast, drag orbit, pinch/wheel zoom, WASD,
  camera follow + debug focus
- `js/ui.js` — inventory chips, toasts (styled popups only, never `alert()`)
- `js/debug.js` — the debug panel
- `js/main.js` — boot, loop, circle collision (`collider: {r}` dynamic or
  `{points:[{x,z,r}]}` static), pickup collection, `?shot` staging, `?auto` driver

## Improving / adding objects (focused sessions)

This scene is designed so a session can polish ONE OR TWO objects in isolation:

1. Find the builder in `js/props.js` (or `makeHumanoid`/`makeChickenMesh` in
   `js/entities.js`). Builders are self-contained — they take no scene refs and
   return a Group with origin at ground level, +z facing "forward".
2. Rebuild it with more love: more primitives, `LatheGeometry`/`ExtrudeGeometry`
   profiles, canvas textures, vertex colours, flat shading, small emissive
   accents. Keep it one Group so placement/registration code doesn't change.
3. Update the registry `note` to describe the techniques used.
4. Budget guide: hero-tier objects ≤ ~3k tris, props ≤ ~1.5k. Check the debug
   panel's per-object count. Whole scene currently ~23k tris / ~240 draw calls.
5. New object kinds: add a builder + `place()` + `register()` in `buildProps()`,
   pick a debug icon, give it a collider circle if solid.

## Testing

Headless Chrome + puppeteer-core (`--use-angle=swiftshader
--enable-unsafe-swiftshader`); scripts from previous runs live in `/tmp/pup/`
(`test_glade.mjs` view/shot/soak, `test_debug.mjs` panel interactions,
`mob.mjs` mobile touch). Serve with `python3 -m http.server 8765` from the
site root.

- `?shot=1` stages the thumbnail frame, sets `window.__shotReady` after 8 frames
- `?lite=1` disables shadows/fire-light, halves grass instances
- `?auto=1` AI-drives the hero (wander + collect); poll `window.__state`
  ({fps, pos, picked, pickupsLeft, errors}) — note Chrome's
  `--virtual-time-budget` does NOT advance the sim, use real waits
- After visual changes re-stage the thumbnail: `assets/screenshots/fable5-glade.jpg`
  (1280×800 jpg via `sips`)
