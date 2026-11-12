# Lane R report — render + world (M1)

Status: renderer, city and map are done and run against both the fake harness and lane G's real
game (`index.html?auto=1`). Zero console errors and zero page errors in every run below.

## Files

| File | What |
|---|---|
| `js/world/map.js` | `generateMap(seed, opts)`. Pure, node-runnable. 240 m district: 4×4 block grid, roads 16–23 m (+3 m sidewalks), central 2×2-block grand plaza (~85 m) with fountain + gold statue, 3–5 other open blocks (fountain plaza / obelisk square / park with bandstand), solid perimeter terrace, 16 farthest-point spawns. ≤ 21 obstacles. Renderer-private extras: `buildings` (incl. a fogged outer ring), `trees`, `lamps`, `fountains`, `statues`, `planters`, `crossings`, `roadsX/Z`, `blocks`, and `pushOut(x, z, r, out)` (bucketed obstacle push-out, used for followers). |
| `js/render/renderer.js` | Contract API + extras (below). Scene assembly, events → effects, self-triggered punches, quality tiers, adaptive drop, stats. |
| `js/render/people.js` | Person mesh (~150 tris, 5-sided-head LOD for lite) + instanced shader: per-instance x/y/z/yaw, phase, gait, look, flash, shirt RGB, scale in one interleaved buffer. Run/idle gait, lean, bob, breathing all in the vertex shader. Skin/hair/trouser variety from `look`. Second draw: blob shadows stretched away from the sun. Third (high only): mirrored copy for wet-street reflections. |
| `js/render/crowd.js` | Cosmetic followers. Vogel-spiral slots per crowd, swap-remove so one removal moves one figure, velocity feed-forward so the disc stays on the ring, ragged edge noise + stragglers, push-out from buildings and from trees/lamps. Recruit / steal / elim / respawn transfer real figures (colour lerp + flash + hop + sprint), budget allocator caps big crowds while keeping ≤150 1:1. |
| `js/render/city.js` | Whole static city merged into **one** vertex-coloured non-indexed geometry (~260k verts): buildings (shopfronts, awnings, framed lit windows, cornices, pilasters, mansards with hip caps and chimneys, banded terracotta hip roofs, domes with drums and gold finials), lamps with banners, trees, fountains, statue, obelisk, bandstand, flower planters, benches, kerbs. City shader: sun/hemi/lamp light, base AO, emissive windows, dithered cutaway of anything between the camera and the focus disc. |
| `js/render/ground.js` | Ground canvas (2048², 1024² lite) with roads, lane lines, crossings, plaza ring/star paving, park lawns, contact darkening; a 1024² info texture (R baked building/tree shadows, G surface kind, B lamp + shop-window light pools). Ground shader: procedural setts/slabs, puddles, wet sheen, lamp glints, alpha-blended over the mirrored city for reflections. |
| `js/render/fx.js` | Team rings (one instanced draw), crown + light shaft, pickup pads + beams (icon atlas rotated to read upright on screen), lamp halos (+ reflected halos), particle pool, fountain water + jets. |
| `js/render/camera.js` | Three-quarter rig, fit-to-disc on both FOVs, look-ahead, punch spring, end push-in, showcase drift. |
| `js/render/shared.js`, `geo.js` | Shared uniforms/GLSL; geometry writer. |
| `tools/render_harness.html` + `tools/render_fake.mjs` | Standalone renderer page with a contract-shaped fake sim. Params: `scene=late|early`, `player`, `rivals=1100,900,…`, `neutrals`, `q=high|medium|lite`, `seed`, `t` (fast-forward s), `move` (speed ×), `ai=0|1`, `fixed=x,z,d` (fixed camera), `pause=1`, `hud=0`, `adaptive=0`, `focus`. WASD/arrows steer. `window.__harness = { renderer, sim, frames, cpuMs, errors }`. |
| `tools/render_shot.mjs` | CDP screenshot/stats driver (cache disabled, viewport/DSF emulation, `--burst`, `--eval`, `--cpu`). |
| `tools/render_map_test.mjs` | Node map test (see below). |

### API extras beyond the contract (for lane G)
- `crownTop()` → world y of the crown's top (G request 4).
- `project()` sets `out.behind` (G request 5); `out.visible` is false when behind.
- `setCameraMode('showcase' | 'follow')`: showcase follows `state.leader`, frames wider and drifts the yaw slowly (G request 6). Not wired by G yet.
- `setFocus(i)` now blends instead of snapping. `setCrowds()` fully resets figures, crown, pickups and camera.
- Rings react to `protect` (flash), `panic` (wobble + pulse), `eating` (brighter) when the sim provides them (G request 1).
- `setFixedCamera({x, z, d, yaw?, pitch?} | null)`, `setAdaptive(bool)`, `three` (renderer/scene/camera), and `stats()` also returns `triangles`, `crowdFigures`, `neutralFigures`, `particles`, `quality`, `dpr`, `popIn/popOut/recruits/transfers`.
- `cameraYaw()`: camera sits at `target + (sin yaw, ·, cos yaw)·dist`. G confirmed its input matches.

## Verified (measured, not eyeballed)

- **Map**: `node tools/render_map_test.mjs 300` → ALL PASS. Asserts ≥12 spawns, each clear for 3 m; min spawn gap 44.3 m; streets ≥ 16 m; < 150 obstacles (max 21); perimeter closed; 1 m flood fill from spawn 0 reaches every spawn and ≥ 99.5 % of walkable cells; `pushOut` leaves < 2 % of points inside. **Falsified**: with a 2 m wall injected (`BREAK=1`) it fails 52 assertions over 5 seeds.
- **Transitions don't pop**: 30 s mid-match in the real game (seed 7): 694 people recruited across 636 recruit events → 636 figures converted in place; 282 people stolen → 280 figures transferred; 2 elims; only 99 pop-ins (respawn figures + x2 bonus people), **0 pop-outs**.
- **NaN**: a half-float scene render read back has 0 NaN / 0 Inf pixels at high, medium and lite. **Falsified**: the same counter reports 3.98 M NaN pixels when a `sqrt(-1)` plane is added. Every `pow()` in `js/render` has a non-negative base (two in the pickup shader didn't and were fixed).
- **Errors**: 0 console errors / exceptions over every harness and real-game capture.

## Perf (late scene: player 1,200 + rivals 1,100/900/780/640 + 3 small crowds + 600 pedestrians; 390×844 at DSF 3; headless Chrome on Metal, M-series Mac, adaptive off)

| Quality | fps | Draw calls | Triangles | Figures drawn | DPR | JS ms/frame (renderer only) |
|---|---|---|---|---|---|---|
| high (bloom, city + people reflections) | 60 (vsync) | 30 (~15 scene + bloom/output passes) | 1.87 M | 5,554 | 2 | 3.4 |
| medium (no bloom, city reflections) | 60 (vsync) | 15 | 0.97 M | 5,004 | 1.5 | 2.1 |
| lite (no bloom/reflections, low-poly heads) | 60 (vsync) | 13 | 0.53 M | 3,006 | 1 | 1.9 |
| early game, high (crowd ≈ 20) | 60 | 28 | 0.43 M | 730 | 2 | 1.3 |

All people are 1 draw (+1 blob shadows, +1 reflection on high); the whole static city is 1 draw (+1 mirrored).
Caveats, honestly: 60 fps here is the vsync ceiling on a desktop GPU and says nothing about a mid-range phone.
I tried `Emulation.setCPUThrottlingRate 4`; the JS ms did not move, so I don't trust that the throttle took
effect and am not reporting a throttled number. The triangle counts are the useful phone proxy: medium
(lane G's default for touch devices) is ~1 M tris + 5 k instances. Adaptive quality drops one tier after 4 s
under 40 fps (on by default; `?adaptive=0` in the harness).
Budgets: high 7,000 figures, medium 5,000, lite 3,000 (pedestrians always drawn; crowds ≤ 150 always 1:1, larger crowds scaled to fit, figures up to 16 % bigger to keep the disc dense).

## Art passes done (each one checked against `refs/reference.png` in screenshots)

1. Bloom threshold was 0.92 and bloomed the whole lit paving into haze → raised to 1.5 (only windows, lamps, water, rings bloom); cooler, darker ambient; crown sized and lifted.
2. Reflections were a full-strength mirror (a second building lying in the road) → much lower alpha, mirrored geometry fades to sky colour with height. Team colours were pastel because `setHSL` was working in linear space → fixed in sRGB; shirts lit by a desaturated light so hues stay true. Chunkier people (+28 %), lighter hair palette.
3. Wider FOV for more perspective (portrait 59°, landscape 40°), plaza tree rows, roof detail.
4. Crown: double-sided gold with sparkles and no ground wash. Pitched roofs tiled in bands with ridges.
5. Manager's list: warm, wet roads with bigger lamp pools and shop-window light spill reaching the carriageway plus lamp glints; ragged crowd edge + stragglers, figures step around trees and lamps; mansards get hipped zinc caps with chimney stacks, flat roofs replaced by parapet + low terracotta hip, warmer roof palette; the grey "hole" under the crown removed.

## What still looks weak against the reference (be harsh)

- **Buildings are boxes with windows.** No balconies, columns, arched windows, statues on rooftops. Near-camera buildings in portrait are big and plain; the reference's are ornate. Biggest remaining gap.
- **Roof hip caps** read as nested squares (tile bands); OK at distance, a bit graphic up close. Domes are low-poly.
- **People** are recognisable but blocky up close; from the high camera crowds read as speckled (heads/hair) more than as solid colour. The reference's figures are bigger relative to the street.
- **Cutaway** is a Bayer stipple, visible as a screen-door pattern on bright facades.
- **Trees** are faceted green blobs; no planters/hedges in streets; no banners strung across streets; few props in side plazas.
- **Statue** is crude (block body, flat wings). Obelisk/bandstand fine.
- **Reflections** only exist on medium/high; lite shows a flat sky sheen.
- **Leader figure** is only 35 % bigger; nothing else marks it (the DOM count badge does the job).
- **Recruit/steal transitions** are verified numerically, but I've only seen them in stills: their feel (timing of the colour flip, hop and sprint) needs a person watching in motion.
- **The fake harness** is not the real sim (my fake AI steals at a different rate), so harness shots show more stable layouts than real matches.

## Screenshots (`docs/notes/shots/`)

- `harness_late_{portrait,landscape,desktop}.png`: reference-like late game (1,200 vs 1,100/900/780/640) at high.
- `harness_late_portrait_{medium,lite}.png`: same at the lower tiers.
- `harness_early_{portrait,landscape,desktop}.png`: crowd ~20, camera close.
- `game_{portrait,landscape,desktop}.png`: real game with lane G's HUD (`?auto=1&t=80–95`).
- `game_early_portrait.png`, `game_menu_portrait.png`: real game start and the menu attract mode.

Re-run: serve `/Users/aaronair/cc/yru/site` (e.g. `python3 -m http.server 8731`), `~/.claude/bin/cdp start --port 9247 -- --use-angle=metal`, then
`node tools/render_shot.mjs --port 9247 --url "http://127.0.0.1:8731/gms/3d/throng/tools/render_harness.html?scene=late&q=high&hud=0" --out x.png --w 390 --h 844 --dsf 2`.
