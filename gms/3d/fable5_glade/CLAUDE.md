# The Glade — Fable 5 ARPG graphics test area

Mobile-first Diablo/RuneScape-style test scene: a circular grass meadow with
a tap-to-move hero, villager NPC, attackable chickens, thatched cottage,
campfire, collidable props, and floating pickups. Three.js 0.160 via CDN
importmap, no build step, **no external assets** — every model is built from
three.js primitives in code and every texture is a procedural `<canvas>`.

Two heroes share one player controller: **Roland** (blocky boxes, default)
and **Maeve** (rounded low-poly: sphere head + sculpted face, lathe torso,
capsule limbs with elbows, swaying ponytail). Maeve exists only in the debug
panel until you press **Play** on her row — that swaps the active rig.
`?hero=maeve` spawns as her directly.

**Combat:** tap a chicken (invisible fat-finger hit proxy) → the hero draws
the back-scabbard sword while walking in (routing through the pen gate),
then loops an overhead slash inside `attackRange`. Each swing rolls
1..`dmgMax` damage at the hit frame; chickens have `chickenHp` (40), show a
health bar + red hit splats + feather bursts, flee between hits, tip over on
death and respawn after `rand(chickenRespawnMin, chickenRespawnMax)`s (30–60s). Sword auto-sheathes 4s after
combat ends. Both rigs share the same draw/sheathe/attack overlay
(`js/combat.js`), which runs after `animate()` and only overrides the right
arm/elbow/torso so locomotion blends underneath.

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
- `js/entities.js` — `makeHumanoid(opts)` factory (Roland + villager), player
  controller (movement, chase + gate routing, attack loop, hero switching),
  chickens (wander/peck/flee/dying/dead/respawn state machine), butterflies
- `js/heroine.js` — `makeHeroine()`: Maeve's model, same rig contract as
  `makeHumanoid` ({ group, parts, animate(t, walk) })
- `js/combat.js` — `makeHeroSword()`, `attachCombat(rig, opts)`: scabbard,
  hand sword, swing trail, draw/sheathe/attack state machine
- `js/fx.js` — hit splats, feather bursts, health bars
- `js/controls.js` — tap raycast (chicken proxies first, then ground), drag
  orbit, pinch/wheel zoom, WASD, camera follow + debug focus
- `js/ui.js` — inventory chips, toasts (styled popups only, never `alert()`)
- `js/debug.js` — the debug panel; entries may set `focusLabel` + `onFocus()`
  (used for the hero Play buttons), `object.userData.status` shows live in rows
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
- `?auto=1` AI-drives the hero (wander + collect + attack chickens); poll
  `window.__state` ({fps, pos, picked, pickupsLeft, hero, chickens, errors})
  — note Chrome's `--virtual-time-budget` does NOT advance the sim, use real
  waits, and at low headless fps the dt clamp (0.05s) dilates sim time
- `window.__game` ({player, chickens, controls, setHero}) + `window.__camera`
  for scripted tests; `controls._raycastTap(x, y)` probes the tap path
- After visual changes re-stage the thumbnail: `assets/screenshots/fable5-glade.jpg`
  (1280×800 jpg via `sips`)
