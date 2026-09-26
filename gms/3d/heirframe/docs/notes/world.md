# world agent notes

## DONE (boots, 60 fps on M5 metal; see perf below)
- `index.html` — importmap to `../../lib/three/0.180.0/`, classic 20 s watchdog (#boot.failed + Reload), #ui-root, #perf.
- Vendored into `gms/lib/three/0.180.0/addons/` (from jsdelivr three@0.180.0): `utils/BufferGeometryUtils.js`, `postprocessing/OutputPass.js`, `shaders/OutputShader.js`, `objects/Reflector.js` (reference only).
- `js/engine/quality.js` tiers + GPU detection + fps governor; `renderer.js` (renderer, EffectComposer: RenderPass → UnrealBloom → Grade pass that does tonemap+sRGB+grade+vignette+dither);
  `atmosphere.js` (SUN_DIR/PLANET_DIR, sky shader w/ planet+clouds+far-city band, global height/sun fog patch of ShaderChunk fog_*, PMREM env from sky);
  `camera.js` (fixed-yaw rig, zoom drives dist/pitch/fov), `input.js` (tap→ground raycast, WASD, wheel/pinch), `devpad.js` (fallback joystick).
- `js/fx/reflection.js` planar mirror (layer 1 only) + `addPlanarReflection(material)` patch; `fx/effects.js` pad rings, fountain jets, motes.
- `js/world/*`: textures (canvas marble/slate/water), materials, batch (merge per material x 40 m cell), collision (circles/boxes/arcs/custom + height regions), geo helpers (theta convention: x=sin θ, z=cos θ),
  ground (single-draw zone shader floor with gold inlays), plaza (fountain, kiosk, warehouse pad, planters, lamps, benches, rails, south terrace+stairs), atrium (curved terraced building W), blocks (NW waterfall+BRIGHTER billboard, NE HARMONY panel, Concord Hall N), vista (east basin, great falls, cascades), skyline (instanced 4 archetypes + statue), traffic (flying cars + monorail), world.js (createWorld).

- `js/engine/player.js` (movement controller + placeholder), `js/world/crowd.js` (civ robots on loops, hidden >40 m), `js/world/sites.js` (lockers, market stalls, relay, NW lane, NE yard + `world.sites` list for missions), `js/main.js` (boot, flags, loop, `__game`, js/game hook).
- Flags: `?q=low|med|high`, `?shot=1..5` (UI hidden, fixed presets: 1 gameplay plaza, 2 low vista N, 3 east overlook/falls, 4 boulevard, 5 atrium), `?auto=1`, `?perf=1`, `?tm=agx`, `?noui`, `?norobots`.
- **js/game hook (D13):** main.js does `import('./game/game.js')` and, if it exports `createGame(api)`, awaits it with `api = {THREE, world, rig, input, player, crowd, ui, robots, flags, tier, marker}`; then each frame calls `runtime.update(dt, stick)` INSTEAD of `player.update(dt, stick)` (runtime should call player.update itself). `stick` = {x, y} with y = forward/up-screen.
- `world.sites` = [{id, tag, x, z, r, y, district:'aurum_plaza', indoor:false}] — tags: plaza, fountain, park, market, locker(3), alley(2), rooftop(2, south terrace y=2.4), warehouse, lobby, relay, spawn_edge(4), vantage, hide, npc, terminal, link_pad.
- `world.interactables` = [{id:'contracts'|'warehouse'|'relay', label, x, z, r}]; main.js shows `ui.interact` when near and opens `ui.panel.open(id)` on interact.

## IN PROGRESS
- Look iteration (lighting/reflection/haze vs refs), perf trimming.

## NEXT
1. More ground-level richness in gameplay view; tree look; statue refinement.
2. Perf: med/low tier checks, governor test.
3. Final screenshots + notes.

## Gotchas
- Default Diablo pitch (52°) means the skyline is NOT directly visible — it shows up in the floor reflections. Zooming in lowers pitch (34°) for vistas.
- Materials with `vertexColors:true` render BLACK on meshes without a color attribute: batch adds colours; standalone meshes use `*Solid` materials.
- Fog patch uses varying `vFogWorldPos` (also used by contactAO + facade shaders).

## Perf (M5 metal, 1280x720 dpr1, high)
- spawn: ~260 calls / 585k tris (main ~100, shadow ~77, mirror ~70, post ~13). Batch cells 56 m; small props skip mirror/shadow automatically (batch `reflect/cast: 'auto'`, per-material `userData.reflect/reflectMin`).

## Screenshots
scratchpad `world/` (see paths in final report). Driver: `world/shot.mjs <query> <out.png> [w h waitMs evalExpr]` (PORT=9302, MOBILE=1 DPR=2 for phone).
