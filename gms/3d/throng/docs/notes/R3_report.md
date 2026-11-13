# Lane R, wave 3: crowds over buildings, cosmetics, camera nudge, phone performance

Every number below was measured. The desktop numbers come from headless Chrome on Metal (`cdp start -- --use-angle=metal`) on the M5 Air. The Safari-engine numbers come from the iOS 26.5 Simulator.

Checks:
- Every capture had 0 console errors and 0 page errors. This covers the real game at `t=8`, `t=75` and `t=100`, the `shot=1` case, the menu, `?lite=1`, and every harness scene.
- `node tools/render_map_test.mjs 300` reports ALL PASS. Min spawn gap is 44.3 m and max obstacles is 21, both unchanged.
- `node tools/sim_test.mjs` passes.

Files touched:
- `js/render/`: `renderer.js`, `crowd.js`, `people.js`, `city.js`, `camera.js`, `fx.js`, `ground.js` and `geo.js`, plus the new `cosmetics.js`.
- `js/world/map.js`: one line, the obstacle grid padding.
- `tools/`: `render_harness.html`, and the new `render_ios.html`.
- `docs/CONTRACT.md`: renderer section only.
- `docs/notes/R_requests.md`.

## 1. Crowds over buildings

**The problem.** The old cutaway made every fragment between the camera and the focus disc translucent (alpha-to-coverage). With a big crowd next to a block, that turned a large wedge of roof into a see-through smear. The ring then showed through it, running under the building.

**What changed:**
- **Buildings in front of the player's crowd sink to their ground floor.** Each in-map building now has a per-vertex id (`aBld`, written by `GeoWriter`).
  - Every frame, `createCutaway` (in `city.js`) casts rays from 29 sample points of the focus disc, at body height, to the camera. Points inside the building's own footprint are skipped.
  - A building whose box is hit sinks. In the vertex shader, everything above the ground-floor cornice (4.45 m) is squashed to 3 % of its height, so the result reads as a one-storey shop row with its roof drawn flat on top.
  - The sink is opaque and crisp, with no translucency and no wedge. It takes about 0.3 s down and 0.45 s up, with hysteresis (the disc grows 15 % while a building is already sunk) so it does not flicker.
  - Only buildings actually between the camera and the disc sink. A first version also sank buildings *behind* a crowd that overlapped their footprint; the ray test fixed that.
  - The old alpha-to-coverage cutaway is removed, so the city is one plain opaque pass.
  - The reflection pass sinks with the city.
- **The ring dims under buildings.** The info texture's alpha channel (previously always 255) is now a footprint mask: 0 inside solid blocks and outside the map. The ring shader multiplies by `mix(0.08, 1, mask)`, so the glow, fill and ring line stop at the wall instead of running under the roof.
- **Figures are kept out of footprints.**
  - Follower push-out now uses the drawn body size (`0.34 · uFigScale · vScale`), not a fixed 0.25 m. Figures grow up to 1.5× when zoomed out, and the old radius let shoulders clip walls.
  - Absorbing (`F_ABSORB`) figures used to run straight through blocks to their new crowd. They are now pushed out too.
  - `map.js`'s obstacle grid now registers each obstacle with a 1.2 m margin, so a figure just across a grid-cell line still sees the wall. This is renderer-only: the sim has its own collider, and the map test still passes.

**Measured.** Drawn figures with their centre inside a footprint (`inside`), or within 0.15 m of one (`clip`):

| Case | Before | After |
|---|---|---|
| Real game `?shot=1&seed=7&t=80`, 6 samples over 6 s | inside 0, clip 0–7 | inside 0, clip 0 |
| Harness: 1,000–1,200 crowd pinned to 4 block corners | inside 0, clip 1 | inside 0, clip 1 (a pedestrian; sim-owned) |

Banding along walls already held before this wave. The fix that shows on screen is the sink and the ring mask.

**Shots:**
- `r3_overlap_corner0_before_after.png`: open block corner. The old wedge fade is gone, and a building behind the crowd no longer fades.
- `r3_overlap_corner6_before_after.png`: inner corner of the perimeter terrace. Before, there was a big translucent wedge. After, the two front buildings sink to shopfronts.
- `r3_before|after_shot80.png`: the manager's 1200×800 case.

## 2. Cosmetics through `setCrowds`

The schema is in CONTRACT.md, renderer section, "Crowd cosmetics (R3)". It is reproduced here:

```js
r.setCrowds([{ index, name, color,
  palette:       [0xRRGGBB, ...],   // 1–3 shirt colours mixed across followers
  hat:           'cap'|'tophat'|'beanie'|'crown'|'party'|'cowboy'|'hardhat'|'headband'|'chef'|'wizard'|'halo',
  hatShare:      0..1,              // default 0.5; the leader always wears it
  hatLeaderOnly: false,
  leader:        'caped'|'king'|'robot'|'mascot',          // aliases knight/hero → caped, astronaut → robot
  flag:          true | emblem id ('star','heart','bolt','crown','moon','diamond','skull','paw','flame','sun')
                 | '<1–3 chars or emoji>' | 'banner:<css colour>' | { emblem, color: 0xRRGGBB },
  trail:         'sparkle'|'petals'|'dust'|'lightning'|'confetti'|'hearts'|'smoke',
  ring:          'solid'|'dashed'|'double'|'flame'|'pulse',
}])
```

Unknown or missing values give today's look. G2 proposed a `viking` hat; it is not built and falls back to no hat.

How each piece is built (no per-crowd materials anywhere):
- **Hats: 11 shapes in 1 draw.**
  - One lathe template (7 rings × 10 segments, 120 triangles; 5 segments on lite). Each hat's profile (radius, height, forward offset, colour mode) and its spikes and oval come from an 11×8 float texture.
  - Hatted figures are written first in the shared people instance buffer. The hat id rides in the integer part of the `look` slot, and the people shader uses `fract(look)`, so the hat mesh draws instances `0..nh` of the same buffer with no copy.
  - Hats follow the head's lean, bob and breathing.
  - The hat's colour modes are team, team-dark, white, black, gold (glowing), yellow, leather, band and red.
- **Leaders and flags: 1 draw for all crowds** (`createHeroes`).
  - The body is the people.js body (`addBody`, now shared). Variant parts carry a per-vertex mask:
    - **caped**: a team cape that streams back with gait, plus a gold chest plate.
    - **king**: ermine collar, gold crown, gold belt and a royal-red cape.
    - **robot**: box head, glowing visor, antenna, metal limbs.
    - **mascot**: big team-coloured head with ears, eyes and a mouth, plus white gloves.
  - A leader variant is drawn at 2.0× follower size (plain leaders stay at 1.35×). That leader is skipped in the people mesh.
  - **Flag:** the pole is held in the right hand. The cloth waves in the vertex shader, has a darker hoist band and edges, and carries an emblem from a 4×4 per-crowd canvas atlas. The atlas has 10 vector emblems; any other text or emoji is drawn as a white silhouette.
  - The pole height scales with zoom, like the crown. When the flag carrier is rank 1, the crown rides on top of the pole.
- **Trails** use the existing particle pool, so there is no new draw.
  - The points shader gained a 6-sprite atlas (star, petal, heart, bolt, confetti, puff) and per-particle spin.
  - Particles are emitted along the trailing half of a moving crowd's edge, at about (12 + 2R)/s scaled by speed. Rates are halved on lite, and off-screen crowds emit nothing.
- **Ring styles** are a per-instance float in the existing ring draw. The styles:
  - **dashed**: dash count from the circumference, slowly rotating.
  - **double**: a second inner line.
  - **flame**: flickering outward tongues with an orange core, plus rising embers from the particle pool.
  - **pulse**: breathing intensity and radius, with a second outward ripple.
- **Palette**: `teamShade` picks per follower among the palette colours by `look`.
- **Harness params** (`tools/render_harness.html`):
  - Cosmetic fields: `hat`, `hatShare`, `hatLeaderOnly=1`, `leader`, `flag`, `flagColor=RRGGBB`, `trail`, `ring`, `palette=RRGGBB,RRGGBB`.
  - `cos=all` gives each crowd a different set.
  - Viewing aids: `close=d&pitch=deg` is a close camera that follows the player, and `drive=1` steers the player in circles so trails show.
  - Placement for overlap tests: `at=x,z` and `corner=k`.

**Shots:**
- `r3_cos_hats_close.png`: top hats plus the king leader and flag.
- `r3_cos_leaders.png`: caped, king, robot, mascot.
- `r3_cos_flags.png`: skull emblem, and an emoji flag with a custom cloth colour on a robot.
- `r3_cos_rings_trails.png`, one panel per ring/trail pair:
  - solid + sparkle
  - dashed + petals
  - double + dust
  - flame + lightning
  - pulse + confetti
  - solid + hearts
  - double + smoke
- `r3_cos_all_mid.png` and `r3_cos_all_late.png`: every crowd different, at mid and late zoom.
- `r3_ring_solid_vs_dashed.png`.

## 3. Camera

- `viewR(R)` changed from `max(12, 7 + 3.0R)` to `max(12, 6 + 2.4R)`. The early-game floor is unchanged.
- **Edge clamp.** After placing the camera, the renderer projects the four screen corners to the ground. If any corner lands beyond the built city (`map.outer − 4`, i.e. ±176 m), the look target slides inward by the overshoot. The slide is capped at half a view radius and smoothed.
  - The overshoot is measured from the *unshifted* camera, so the clamp converges and cannot oscillate.
  - Shots: `r3_edge_far_p_before_after.png` (the void at the top is gone) and `r3_edge_near_l_before_after.png`.

Camera table from `node tools/render_camtest.mjs --port 9276 --base http://127.0.0.1:8756/gms/3d/throng --counts 10,100,350,650,1000`. "Before" values are from R2's table, and the 650 row was re-measured on the wave-2 code.

| Layout | Count | R (m) | Ring % W (before → after) | Ring % H | Ground W (m) | Ahead (m) | Behind (m) | Pitch |
|---|---|---|---|---|---|---|---|---|
| portrait | 10 | 1.7 | 14 → 14 | 5 | 24 | 62 | 23 | 51° |
| portrait | 100 | 5.5 | 23 → 28 | 11 | 39 | 89 | 36 | 54° |
| portrait | 350 | 10.3 | 27 → **33** | 13 | 62 | 122 | 58 | 58° |
| portrait | 650 | 14 | 28 → **35** | 14 | 79 (was 98) | 150 | 75 | 60° |
| portrait | 1000 | 17.4 | 29 → **36** | 15 | 96 | 180 | 90 | 60° |
| landscape | 350 | 10.3 | 16 → 20 | 28 → 34 | 105 | 43 | 23 | 53° |
| landscape | 650 | 14 | 16 → 20 | 30 → 37 | 137 | 53 | 30 | 55° |
| landscape | 1000 | 17.4 | 17 → 21 | 31 → 38 | 167 | 61 | 37 | 57° |
| desktop | 350 | 10.3 | 21 → 27 | 28 → 34 | 77 | 44 | 23 | 53° |
| desktop | 650 | 14 | 22 → 28 | 30 → 37 | 100 | 54 | 30 | 55° |
| desktop | 1000 | 17.4 | 23 → 28 | 31 → 38 | 122 | 63 | 36 | 56° |

Portrait now shows 79 m of street across and 150 m ahead at 650. That is still about 2.5 crowd diameters each side, so close rivals stay on screen.

## 4. Phone performance

### (a) Mobile Safari engine (iOS 26.5 Simulator, iPhone 16 device `clued-test`)

Method:
- `tools/render_ios.html?page=<url>` loads the real game or the harness in a same-origin iframe.
- Every 4 s it POSTs the game's own `errors` list, renderer `stats()`, WebGL program diagnostics (`program.diagnostics.runnable === false` marks a failed shader compile or link) and `gl.getError()`.
- The POSTs went to a localhost-only log server in my scratchpad. Screenshots came from `xcrun simctl io screenshot`.

| Page | Booted | Errors | Shader programs (failed) | GL error | Quality / draws / tris |
|---|---|---|---|---|---|
| Real game `?auto=1&seed=7&t=75` | yes | 0 | 14 (0) | 0, WebGL 2.0, context not lost | medium (touch default), 17 draws, 0.53 M |
| Harness late, `cos=all`, high | yes | 0 | 28 (0) | 0 | high, 34, 2.15 M (2,494 hats, 8 heroes) |
| Harness late, `cos=all`, lite | yes | 0 | 12 (0) | 0 | lite, 12, 374 k |
| Close-up: cowboy, mascot, flag, confetti, flame, medium | yes | 0 | 18 (0) | 0 | medium, 19, 270 k |

Shots: `r3_ios_game75.png`, `r3_ios_cosall.png`, `r3_ios_coslite.png`, `r3_ios_close.png`. Every new shader compiles and renders in Safari's engine:
- the vertex-texture-fetch building sink
- `texelFetch` from a float texture for hats
- integer bit masks for hero variants
- the sprite atlas in point sprites

Simulator fps is the Mac GPU and is not a phone number.

### (b) CPU and upload costs, and what was cut

Late scene: player 1,200 plus rivals 1,100/900/780/640, 3 small crowds and 600 pedestrians. Viewport 390×844 at DSF 3, adaptive off, Metal.

Columns:
- **JS ms** is the harness's EMA of the whole `renderer.frame()` call.
- **update ms** is the crowd follower simulation.
- **Upload** is instance bytes per frame (48 per figure, 36 per particle, plus rings and heroes).

| Tier | Draws | Triangles | Figures drawn (culled) | JS ms | update ms | Upload |
|---|---|---|---|---|---|---|
| high, before | 32 | 1.98 M | 5,579 | 2.48 | (not instrumented) | ≈ 276 KB |
| high, after | 32 | 1.75 M | 4,812 (767) | 1.6–1.8 | 1.59 → **0.82** | 286 KB incl. particles |
| medium, before | 17 | 1.07 M | 5,004 | 2.28 | — | ≈ 248 KB |
| medium, after | 17 | **0.88 M** | 4,288 (715) | 1.9–2.1 | 2.28 → **0.98–1.15** | 262 KB |
| lite, before | 15 | 0.63 M | 3,002 | 1.72 | — | ≈ 150 KB |
| lite, after | **10** | **0.34–0.36 M** | 1,590–1,730 | 0.5–1.7 | 0.16–0.75 | 143 KB |
| lite, after, every cosmetic on | **12** | **0.37 M** | 1,540 + 625 hats + 7 heroes | 0.5–2.0 | — | 166 KB |

The "update ms" before → after pairs are the same build before and after the hot-loop rewrite. The wave-2 build has no stage timer.

What was cut:
- **Follower update hot loop** (`crowd.js`), about 2× faster:
  - Slot angles and the 3/7/12 edge harmonics come from precomputed tables, using angle-addition with per-frame sin/cos.
  - Jitter phases are cached per figure.
  - `Math.hypot` is replaced with `sqrt`, and the exp() constants are hoisted per crowd.
  - Push-out runs only for crowds whose disc reaches an obstacle. Most crowds in open plazas skip it entirely.
  - The result is no trig per figure, except one `atan2` for facing.
- **Off-screen culling before upload.** Each frame, the screen's ground quad (from the four corner rays, plus a 3.5 m × figScale margin) gates every figure in `write()`. Hats share that order, so they are culled too.
  - This cuts 13–15 % in the busy late scene and much more mid-game: in the real game at t=75, 735 figures are drawn where wave 2 drew 2,139.
- **Off-screen crowds integrate at half rate** (every other frame at 2·dt).
- **Cheaper reflections on medium.** The mirrored city now draws only the in-map buildings (`city.reflCheap`), not the props or the outer ring. Medium triangles drop 1.07 M → 0.88 M.
- **Lite is now truly lite:**
  - The city is drawn without the facade/roof detail pass (`city.liteGeometry`, 111 k instead of 202 k triangles).
  - The figure budget is 2,000 (was 3,000), with 5-segment hats.
  - No light shaft, pickup beams, pigeons (and their update), fountain jets or lamp halo sprites.
  - DPR is 1. Result: 0.34–0.37 M triangles and 10–12 draws, inside the ≤ 400 k, ≤ 12 draws, DPR ≤ 1.5 target. `r3_lite_before_after.png` shows it still reads as the same city.
- **Shader-heavy paths:** the ground fragment shader (procedural setts, puddles, alpha-blended reflection) and the city `surface()` pattern are unchanged; they are the heaviest per-pixel work. Measured overdraw sources and what changed:
  - The alpha-to-coverage cutaway is gone.
  - Lite drops all additive extras except rings and particles.
  - The ring quad grows 2.4× only for `flame`.
  - Bloom (high only) is still the biggest full-screen cost.

Caveat: the Mac JS times are 3–5× faster than a mid-range phone CPU. Chrome's `setCPUThrottlingRate` did not visibly move the numbers in wave 1, so I have not reported throttled numbers. Even so, the crowd update at 5,000 figures went from about 2.3 ms to about 1 ms on Mac, which is roughly 7–10 ms → 3–5 ms on a phone.

### (c) Adaptive quality

Before, it stepped down after 8 half-second windows in a row under 40 fps (4 s).

Now:
- There is a 2 s warm-up at start (1 s after each change) so shader compiles do not count.
- After that, 3 windows in a row under 45 fps (1.5 s) drop one tier.
- It only ever steps down, so it cannot oscillate.

Measured with the main thread forced to about 30 fps for 8 s (harness, high):

| | Before | After |
|---|---|---|
| high → medium | 4.8 s | **3.7 s** |
| medium → lite | (would be ≈ 8.8 s) | **6.3 s** |
| After the load stops | — | stays on lite at 60 fps (no step back up) |

### NaN check

A half-float scene readback with `cos=all` shows 0 NaN and 0 Inf at high, medium and lite, and also in the close-up with every cosmetic. Falsified: adding a `sqrt(-1)` plane gives 374–411 k NaN pixels in each case. Every new `pow()` has a `max(…, 0.0)` base. The reversed-edge `smoothstep` in the new code (cape, dashed ring, flag edge) is written as `1 − smoothstep(lo, hi, x)`. GLSL leaves reversed edges undefined; older render code still uses a few, and they render correctly in Chrome/ANGLE and in the Simulator.

## Shots (`docs/notes/shots/`, quantised PNGs, 6.9 MB total)

- **Real game and harness, before and after:** `r3_before_*` and `r3_after_*` for:
  - `game75_{p,l,d}`
  - `game8_{p,l,d}`
  - `shot80`
  - `late_{p,l,d}`

  Layouts: p = 390×844 dsf 2, l = 844×390 dsf 2, d = 1440×900.
  - The `game75` frames are the same match state (You 669 at 0:43), so they compare directly.
  - The `game8` frames differ in match state. Lane O changed the match start this wave, so the timer reads 1:50.
- **Overlap and edge:** `r3_overlap_corner{0,6}_before_after.png`, `r3_edge_{far,near}_{p,l}_before_after.png`.
- **Cosmetics:** `r3_cos_*.png`, `r3_ring_solid_vs_dashed.png`.
- **Lite:** `r3_lite_before_after.png`.
- **Simulator:** `r3_ios_*.png`.

## Still weakest (harsh)

1. **No real-phone numbers.** Simulator fps is the Mac GPU, and the JS ms are from an M5. The ground shader's per-pixel cost and medium's reflection pass are the unmeasured risk on a mid-range Android. Someone needs to load `?auto=1` on a real phone and read `renderer.stats()`.
2. **Sunk buildings.** The squashed roof is a flat roof painted on a one-storey box. Upper-floor balconies and frames collapse to slivers around the rim. The 0.3 s sink is deliberate but visible as motion, which some players may read as the city "popping".
   - Only the player's crowd triggers it. A rival behind a building is still hidden: in `shot80` the cyan crowd sits behind the dome block.
3. **Cosmetics at gameplay zoom:**
   - Hats read as coloured dots, and the shapes only read in close views.
   - Leader variants are 2× figures; the mascot and robot read mid-game, but the caped leader's cape is only visible from behind.
   - The king's head crown is hidden under the rank-1 crown when that crowd leads.
   - Trails are subtle at mid zoom. The particles are additive, so dust and smoke look like light rather than dirt.
4. **Edge clamp** puts the crowd up to half a view radius off-centre near the perimeter. The outer ring still has dark streets between its blocks.
5. **Item 5 was not reached:**
   - The big plain mansard roofs on perimeter and corner buildings are unchanged.
   - The fogged outer ring is unchanged.
   - Pigeons are still close-view only, and lite now has none.
   - Menu showcase polish was not done.
6. **Not seen in motion by a person:** flag waving, cape streaming, the building sink, and trail density in a real match.
