# sky agent: Sky Isles theme

Status 2026-11-02: **Sky Isles theme built** and implements THEME_CONTRACT. It has been checked in the preview at
412x915 portrait and 1440x900 landscape (D13). It has not yet been run inside the engine, because the engine was not ready when this was written.

## What is built (`js/themes/sky/`)
| file | contents |
|---|---|
| `index.js` | `createTheme(ctx)` → `{ id:'sky', name:'Sky Isles', materials, buildEnvironment, skins, dispose }` |
| `materials.js` | every contract material plus the internal ones (gold, vertex-colour props, island rock, glass, crystal, glows). Also the shared `uTime` uniform and the water/boost texture scrolling |
| `textures.js` | canvas textures: striped green, fringe, stone blocks, marble cap, rock, sand, planks, ice, chevrons, tee-pad inlay, cloud atlas, waterfall streaks, ferns, glow |
| `sky.js` | the painted sky dome (gradient, sun glow, stars on the night side, a big pale planet), an animated cloud-sea plane, fog, key/rim/hemi lights, and a PMREM env map of the sky for reflections on gold and glass |
| `island.js` | the craggy rock swept under `info.path`/`widths` (rounded end caps, inner side limited on tight bends, mossy rim, grass top, hanging spikes). Also round floating rocks, waterfalls (one merged mesh with UV scroll and mist), and bushes and ferns (instanced) |
| `backdrop.js` | fairy-tale castle (about 22 m) on its own island, small islands (temple, ruins, arch, tower, trees) and a stone arch bridge |
| `flyers.js` | an airship that circles slowly with a spinning propeller, and hot-air balloons (instanced, bobbing, burner flicker) |
| `billboards.js` | a one-draw-call camera-facing billboard shader with fog and modes static, sparkle, flicker and mist. It draws the clouds, lantern and castle glows, fireflies and waterfall mist |
| `env.js` | `buildEnvironment`: course frame, then sky, island, waterfalls, lanterns, foliage, backdrop, flyers and billboards. Returns `{ update(dt,t), dispose() }` |
| `skins.js` | skins: windmill (stone tower with a tunnel cut along Z, gold frames, slate roof, wooden lattice sails on `rotor`), loop (gold rails, bronze outer band with glowing studs, crest), tube (fresnel glass, glowing rings, gold end collars), flag (waving cloth, beacon beam, gold ring), pickup (blue faceted crystal that bobs and spins, with a glow sprite), bumper (marble, gold bands, glowing cap), teePad (stone and gold inlay disc, compass star, pulsing blue ring) |

Tools: `tools/theme_preview.html` + `tools/theme_preview.js` (preview), `tools/theme_preview_cdp.mjs` (headless screenshots and stats).

## How to preview
- Phone or desktop: http://192.168.0.236:8888/gms/3d/skyputt/tools/theme_preview.html
  - Parameters: `view=hole|row|wide|top`, `q=low`, `hud=0`, `t=<seconds>` (freezes time), `theme=<id>` (works for any theme, e.g. greybox)
  - Drag to orbit, pinch or wheel to zoom. The HUD shows fps, draw calls and triangles.
- Headless: `~/.claude/bin/cdp start --port 9531` and then
  `node tools/theme_preview_cdp.mjs <outDir> '[{"name":"p","q":"view=hole&hud=0","w":412,"h":915},{"name":"l","q":"view=hole&hud=0","w":1440,"h":900}]'`
- Final shots are in `docs/notes/sky_shots/`: `final_portrait_412x915.png`, `final_landscape_1440x900.png`, `final_skins_row.png`, `final_wide.png`, `final_portrait_low.png`.

## Performance (renderer.info, preview hole, headless SwiftShader)
| | draw calls | triangles |
|---|---|---|
| whole preview frame, high | 85 | 58k |
| whole preview frame, low | 84 | 36k |
| theme environment only, high | 24 meshes | 38k |
| theme environment only, low | 23 meshes | 19k |

- About 35 of the 85 calls are the preview's stand-in course: separate strips for each wall face, trim and cap. The engine's merged builder should need far fewer.
- Triangles per skin, with draw calls in brackets: windmill 1476 (7), loop about 2.7k (4), tube 1452 (3, for a 3 m tube), flag 396 (5), pickup 50 (2), bumper 704 (3), teePad 1776 (4). Every skin is under 3k.
- Shadows: one directional light. The shadow map is 2048 on high and 1024 on low, and its ortho camera is fitted to `info.bounds` in light space. Backdrop pieces never cast shadows.
- Low quality halves the texture sizes and the cloud, sparkle and island counts, uses a coarser island sweep, drops ferns and the bridge, and uses fewer waterfalls and balloons.
- I did not measure fps on a real phone; headless fps is meaningless. **Check this on a mid-range Android.** The largest costs are fill: the full-screen sky, the cloud sea and the transparent cloud billboards.

## Aligned with the "Engine extensions" section of THEME_CONTRACT (2026-11-02, second pass)
- **windmill:**
  - uses `gapHeight` (default 0.24) as the tunnel ceiling
  - at `rotation.z = 0`, blade k lies along +Y rotated by 2πk/n
  - the spar sits on that radial line; the sail spans x ∈ [0.018, 0.018+bladeWidth] and radius 0.06 → bladeLength, within ±0.022 in Z, which matches the physics box
  - the preview drives `rotor.rotation.z = +omega·t`
- **loop:** the rails, bronze band and studs follow the eased shift x(u) = sideShift·(u − sin 2πu / 2π). The engine's slight floor tilt is not mirrored.
- **`info.floor[]`:** the course rock is split into one mass for each solid run. Each mass is trimmed back about (w/2 + 0.6)·0.9 m from each gap edge, so its end cap stops near the edge and the gap reads as a drop. No lanterns are placed on gap samples. Preview: `?gap=1` (see `v2_gap_wide.png`).
- **flag:** only the pole and the waving cloth. The theme no longer draws a cup ring. The vertical light beam moved into `buildEnvironment` at `info.cup`, so it stays put while the engine lifts the flag.
- **teePad:** placed with `{radius: 0.32}` and local +Z toward the tee. The compass star now points to +Z, behind the ball as in the ref. Ring, rim and stud sizes scale with the radius; the second glow ring appears only when the radius is at least 0.5.
- **Orientation:** the preview now places the windmill, bumper, pickup and teePad with local +Z toward the tee. It places the loop with +Z along travel and +X on the shift side.
- New shots: `sky_shots/v2_portrait_412x915.png`, `v2_landscape_1440x900.png`, `v2_gap_wide.png`, `v2_skins_row.png`.

## Contract notes and proposals (manager: please consider these for DECISIONS / THEME_CONTRACT)
1. **UV conventions (proposal).** The floor/fringe/sand/ice/bridge textures expect **u = lateral metres and v = metres along the path**. The green has 1 m tiles with mowing stripes along v. The wall textures expect **u = metres along the wall and v = metres up**; the stone map repeats twice in v. The `boost` material expects u across the pad (0..1) and v along it in metres (two chevrons per unit). The chevrons point toward +v and scroll.
2. **Renderer setup (proposal).** Use ACESFilmic tone mapping at exposure 1.0 with SRGB output, which is what the preview uses. If shadows are off, the theme turns on `renderer.shadowMap` (PCFSoft). The engine should set `castShadow`/`receiveShadow` on its own meshes.
3. **Theme changes to the scene.** The theme sets `scene.fog`, `scene.background`, `scene.environment` and `scene.environmentIntensity`. `dispose()` restores the previous values.
4. **`update(dt, t)` must be called each frame.** It moves the dome and cloud sea with `info.camera`, scrolls the water, boost and waterfalls, animates the airship and balloons, and ticks the shared `uTime`. The tee and flag glow rings use `uTime`.
5. **Extension: `theme.dispose()`.** It frees the shared materials and textures. Skin objects belong to the engine, so the engine disposes their geometry.
6. **Loop:** now follows the engine's eased x(u); see above.
7. **Tee pad.** Its top sits at y = +0.006 and the compass star points to +Z, toward the tee.
8. **Pickup.** The crystal centre floats 0.12 m above the origin.
9. **Wishlist for `info`.** Gaps are handled through `info.floor`. A `cameraHint` direction would still help, because waterfalls currently face away from the tee on the assumption that the camera starts behind it.

## D13 (desktop landscape)
- Backdrop islands sit on both sides and behind the course, and clouds ring all 360°. A 1440x900 frame has no empty edges.
- The dome and the far fade of the cloud sea call the same `skyColor(dir)` GLSL function. This removed the horizon seam that showed in an earlier landscape shot. The dome is drawn at the far plane (`xyww`) and recentred on the camera every frame, so it never shows an edge.
- The preview uses a separate camera for landscape (higher, FOV 50) and portrait (FOV 64). The engine's camera should do the same.

## Known issues / next
- The rock texture reads slightly cartoonish (cell blotches) up close. It is fine at play distance.
- Bushes are smooth icosahedra and could become clustered blobs or tiny flowers.
- On hole data with bends tighter than the island margin, the sweep can fold on the inner side. Curvature limiting hides most of this; check it on real holes.
- The windmill tunnel is rectangular and `gapHeight` tall, which matches the engine.
- I have not tested against the real engine. Once it lands, compare its floor UVs with point 1.

## Ideas for the next themes (reuse this structure: swap the palette, the decor and a few skins)
**Spooky Hollow (Halloween)**
- Sky and light: purple-black zenith, green-teal horizon haze and a big amber moon in place of the planet. The key light is cold moonlight with an orange rim from jack-o-lanterns. Fog is denser and green.
- Island and water: the island rock becomes dark basalt with glowing lava cracks, using an emissive crack map through the same `vcRock` hook. The waterfalls become lava falls (orange, additive, same UV-scroll mesh), plus a skull-cliff set piece.
- Backdrop: a haunted castle silhouette (reuse `buildCastle` with dark stone, purple roofs and orange windows), dead trees (bare branches), fences and gravestones near the course.
- Moving and lit details: lanterns become candles or pumpkins. Bats replace the balloons, as instanced flapping quads. The airship becomes a ghost ship, translucent and green. Sparkles become ghost wisps and fireflies are green.
- Skins: the windmill gets a skull hub and ragged sails, and the loop gets pumpkin studs (ref).

**Frost Fair (Christmas / winter)**
- Sky and light: deep blue night, an aurora ribbon (animated shader band), a full moon and falling snow (sparkle billboards with downward drift).
- Island: snow caps on the grass top (white vertex colour above some height or noise), icicle spikes under the island, frozen waterfalls (static ice material with a slow shimmer) and snow-dusted walls.
- Backdrop: a gingerbread or ice castle with warm windows, decorated pine trees and present boxes, plus a giant snowman set piece.
- Skins and course: walls get candy-cane trim (a red and white stripe texture on `trim` and the loop rails), lanterns get wreaths, the flying sleigh replaces the airship, and the tee pad uses a snowflake inlay.
