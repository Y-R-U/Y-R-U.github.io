# Lane R, wave 2: camera and art pass

Every number below was measured in headless Chrome on Metal (`cdp start -- --use-angle=metal`), using the real game (`index.html?auto=1&seed=7&t=8|75`) and the render harness late scene. There were 0 console errors and 0 page errors in every capture. `node tools/render_map_test.mjs 300` passes (ALL PASS). `node tools/sim_test.mjs` passes.

**Map balance is unchanged.** `map.js` changes are visual only: building floor ranges, the facade and roof palettes, and the roof-type thresholds. Obstacles are still the whole-block footprints, and the rnd draw order is untouched, so spawns, plazas, fountain radii and streets are identical. Min spawn gap is still 44.3 m and max obstacles is still 21.

## What changed

### 1. Camera (`js/render/camera.js`, `renderer.js`)
- The camera now frames ground, not just the disc. The short screen axis must show a half-extent of `V = max(12, 7 + 3.0·R)` metres around the crowd, which is about three crowd radii of margin. On landscape and desktop the depth axis uses 0.88·V.
- Pitch goes from 50° when small to about 60° when big (`lerp(0.88, 1.04)` rad over camera distance 20–150), so buildings stand in the way less.
- Look-ahead is 0.9 s of velocity, capped at 0.35·V, so portrait shows plenty of street in the direction of travel.
- Figures grow up to 1.3× with camera distance (`uFigScale`; shadows too), so a big zoomed-out crowd still reads.
- The crown is capped smaller (max scale 3.4 instead of 4.5). `crownTop()` follows it.
- Fog starts later (`near = 1.15d + 10`, `far = 2.8d + 40`), so the close early camera is no longer washed in mauve haze.
- **Showcase** (`setCameraMode('showcase')`, which G already calls): frames the central plaza pulled 30 % toward the leader, at a lower 46° pitch, with a slow ±0.6 rad yaw drift. Before, it followed the leader to the map edge and showed mostly the fogged outer city. Checked in portrait and landscape menu shots.

### 2. Buildings (`js/render/city.js`, `js/world/map.js`)
- **Heights**: interior blocks are 2–4 floors (were 3–5) and the perimeter is 3–5 (was 4–6).
- **Palette**:
  - Facades: cream, warm stone, terracotta, ochre, slate blue, sage, dusty pink, pale stone.
  - Roofs: slate mansards, terracotta, copper-green and blue domes.
  - More flat roofs: 16 % now, up from 8 %.
- **Facades**: per-building style seeded from `b.seed`.
  - Always: window frames, glazing bars and stone sills.
  - Optional, varying by building: string courses between floors, pilasters, pediments over first-floor windows, arched first-floor windows, shutters (green, blue or oxblood).
  - Balconies with iron rails, in one of three patterns: first floor only, continuous on the top floor, or alternating.
  - Frieze under the cornice.
  - Shopfronts get dark pilasters, a stall riser and a coloured fascia sign with a lit gold lettering strip.
  - **Landmarks** (dome buildings): a colonnade of columns on the ground floor, arched lit windows, a balustrade with gold-capped corner posts, a drum with lit windows, and a lantern with a gold spire.
  - Party-wall sides (hidden between neighbours) now get plain glazing only, which saves triangles for the visible fronts.
- **Roofs**:
  - Pitched roofs are lower (0.3 instead of 0.42 of the depth), with gabled dormers on the long street slopes and two chimneys with caps.
  - Mansard caps are capped at 1.8 m. They carry brick chimney stacks with rows of pots along the party walls, and skylights (some lit).
  - Flat roofs became roof gardens: planters with shrubs, an occasional small tree, a skylight.
- **Procedural surface shading** (fragment shader, zero geometry): clay tile courses on pitched roofs, slate courses with seams on mansards, faint ashlar coursing on walls, and rusticated ground floors. Everything fades to its mean below pixel size, so it does not shimmer.
- **Outer (fogged) ring**: each facade now has real windows and lit shopfronts, but only on sides facing the map. Before, they had one window strip per floor, which looked like modern office blocks once the camera pulled back.
- **Cutaway**: the Bayer stipple is gone. Occluding upper floors now fade smoothly with alpha-to-coverage on the MSAA buffer: one opaque pass, no sorting, and no screen-door pattern. The fade ramps in over 3–6.5 m of height and over 0.75–1.15× the focus radius.
- **Reflections**: the mirrored city draws only the base geometry (`city.reflGeometry`, the same buffer with a `drawRange`). The new detail costs triangles once, not twice.
- **Ambient life**: about 8 % of lit windows switch off and on over 18–58 s cycles, and about 6 % flicker like a TV (an `aWin` attribute plus the vertex shader).

### 3. Ground (`js/render/ground.js`)
- **The pixelated checker is fixed.** Its cause was the per-tile random brightness, which never faded with distance, so sub-pixel tiles became a blocky checker. Now:
  - Roads are tile-free asphalt with fine grain and repair patches.
  - Sidewalk slabs and plaza flags keep crisp grout up close, and their per-tile variation fades out by pixel footprint.
- **Wet look**:
  - Road puddles are fewer, but darker and more reflective (reflect alpha up to 0.5). Plaza puddles are sparse and faint.
  - The road reflection base is higher, and lamp glints in puddles are stronger.
  - No puddles or noise outside the playable square (that area used to look like camo).
- Asphalt is cooler and darker, lamp pools are warmer and about 28 % weaker (they were blowing out to white), tree and statue shadows are softer, and the 8-point plaza star is at 45 % opacity.
- On lite, the puddle sky-sheen no longer turns into pale lilac blotches.

### 4. Crowd read (`js/render/people.js`, `crowd.js`)
- **Shape**: the torso is bigger (shoulders 0.52 to 0.60, deeper chest), sleeves are bigger, and the head is about 13 % smaller.
- **Caps**: about half of each team's members wear a team-colour cap. Caps only apply to saturated colours, so neutrals stay white and grey.
- **Glow**: shirts get an emissive lift of 0.1–0.3 scaled by colour saturation, stronger on top surfaces, plus a team-tinted rim. Neutrals get almost none.
- **Wall-hugging**: follower slots that land inside a building now fold back out into a loose band (60 % of their penetration plus jitter). Before, they were clamped onto the wall line.

### 5. Smaller items (`city.js`, `fx.js`)
- **Trees**: six smooth-shaded lumps per crown (per-vertex sphere normals and a vertical colour gradient) plus a branch stub. They are no longer faceted blobs.
- **Statue**: a winged angel with a fluted robe, real limbs, a raised laurel wreath, and three layers of feathers per wing with scalloped trailing edges.
- **Pickups**:
  - The beam is twice as tall.
  - A new floating billboard badge in the kind's colour shows the icon. It bobs, and scales with camera distance (`pickups.setView(d)`) so it stays readable when zoomed out. This is one extra draw call.
- **Pigeons**: a flock of 12 on each plaza (7 on lite), in one instanced draw. They peck and turn, and scatter into the air when a crowd's edge comes within 5 m, then land elsewhere on the plaza.

## Camera table (`node tools/render_camtest.mjs --port N`)

The ring is measured as the fraction of screen width and height it covers. Ground extents are in metres:
- **ground W**: width of ground visible across the screen at the crowd's row.
- **ahead / behind**: ground distance from the crowd to the top and bottom screen edges.

Each cell is before → after. Layouts are portrait 390×844, landscape 844×390 and desktop 1440×900.

| Layout | Count | R (m) | Ring % W | Ring % H | Ground W (m) | Ahead (m) | Behind (m) | Pitch |
|---|---|---|---|---|---|---|---|---|
| portrait | 10 | 1.7 | 22 → 14 | 8 → 5 | 16 → 25 | 45 → 63 | 15 → 23 | 50° → 51° |
| portrait | 100 | 5.5 | 39 → 23 | 14 → 9 | 28 → 47 | 70 → 102 | 26 → 44 | 52° → 56° |
| portrait | 350 | 10.3 | **47 → 27** | 18 → 11 | 43 → 76 | 94 → 143 | 41 → 71 | 56° → 60° |
| portrait | 1000 | 17.4 | 52 → 29 | 20 → 12 | 66 → 119 | 135 → 223 | 63 → 112 | 57° → 60° |
| landscape | 10 | 1.7 | 10 → 8 | 16 → 13 | 36 → 45 | 17 → 20 | 8 → 10 | 49° → 51° |
| landscape | 100 | 5.5 | 19 → 14 | 31 → 23 | 59 → 81 | 27 → 34 | 13 → 18 | 50° → 52° |
| landscape | 350 | 10.3 | 23 → 16 | **40 → 28** | 90 → 130 | 38 → 51 | 20 → 29 | 52° → 55° |
| landscape | 1000 | 17.4 | 25 → 17 | 45 → 31 | 140 → 210 | 53 → 73 | 31 → 46 | 56° → 59° |
| desktop | 10 | 1.7 | 13 → 10 | 16 → 13 | 27 → 33 | 18 → 21 | 8 → 10 | 49° → 50° |
| desktop | 100 | 5.5 | 25 → 18 | 31 → 23 | 43 → 60 | 28 → 36 | 13 → 18 | 50° → 51° |
| desktop | 350 | 10.3 | 31 → 21 | 40 → 28 | 66 → 96 | 39 → 53 | 20 → 29 | 52° → 54° |
| desktop | 1000 | 17.4 | 34 → 23 | 45 → 31 | 102 → 154 | 54 → 75 | 31 → 45 | 56° → 59° |

At 350, the portrait ring went from 47 % to 27 % of the width. Portrait now shows 76 m across and 143 m ahead.

## Perf table

Late scene: player 1,200 plus rivals 1,100/900/780/640, 3 small crowds and 600 pedestrians. 390×844 at DSF 3, adaptive off. fps is the vsync ceiling.

| Quality | fps | Draws (before → after) | Triangles (before → after) | Figures | DPR | JS ms/frame (renderer, EMA) |
|---|---|---|---|---|---|---|
| high | 60 | 30 → 32 | 1.87 M → 1.98 M (+6 %) | 5,579 | 2 | 2.6–3.6 |
| medium | 60 | 15 → 17 | **0.97 M → 1.07 M (+10 %)** | 5,004 | 1.5 | 2.2–3.4 |
| lite | 60 | 13 → 15 | 0.53 M → 0.63 M (+18 %) | 3,002 | 1 | 0.9–2.7 |
| early, high | 60 | 28 → 30 | 0.43 M → 0.55 M | 777 | 2 | 0.4 |

- The 2 extra draws are pickup badges and pigeons.
- City geometry grew from 317k to 606k vertices (202k triangles). Reflections still draw only the 334k-vertex base.
- Medium is +10 % in triangles, inside the 25 % allowance.
- JS ms is a noisy EMA. Repeated runs vary by about 1 ms, and the new per-frame work (about 80 pigeons) is negligible.

## Checks
- **NaN**: a half-float scene readback shows 0 NaN and 0 Inf pixels at high, medium and lite.
  - Falsified: adding a `sqrt(-1)` plane gives 860k NaN pixels at each quality (scratchpad driver).
  - The new shaders use no `pow`. The surface pattern guards near-horizontal normals before normalising.
- **Frame change vs the criticised frames**: 73–87 % of pixels changed by more than 25/255. Measured on late p/l/d, game75 p/l and game8 p (same URLs, before vs after).
- **Errors**: 0 console errors and 0 page errors across all r2 shots, the menu and lite.

## Shots (`docs/notes/shots/`)
- **`r2_before_*` / `r2_after_*`**:
  - `game75_{p,l,d}`: real game, `?auto=1&seed=7&t=75`.
  - `game8_{p,l,d}`: real game at t=8.
  - `late_{p,l,d}`: harness late scene at high.
  - Layouts: p = 390×844 dsf 2, l = 844×390 dsf 2, d = 1440×900.
- `r2_p1_*`, `r2_p2_*`, `r2_p3_*`: intermediate passes.
- Note: G's game changed between the before and after shots (new bots and names), so the real-game frames show different match states. The harness frames are directly comparable.

## Tools added
`tools/render_camtest.mjs` prints the camera table above. It uses the harness at fixed crowd sizes with the sim paused.

## Still weakest (harsh)
1. **Big mansard roofs** on perimeter and corner buildings are still the largest plain areas on screen. Slate coursing, chimney stacks and skylights help, but a 15 m slate pyramid is still a big grey-blue plane. The next step would be courtyard buildings (roof hole) or splitting the perimeter terrace into narrower houses.
2. **Crowds are flat discs.** They now read as solid team colour, but from far away they are discs with trees poking through. The reference crowds look denser and taller.
3. **The asphalt is still somewhat mauve and flat** next to the reference's blue-grey wet streets. On medium and high the mirrored city does most of the "wet" work; on lite the roads are dry-looking. The lighting hue (mauve fog, warm hemisphere) is the root cause, and I didn't retune global colour.
4. **The outer (fogged) ring** is more visible now the camera pulls back and the fog starts later. It has windows now but no roof detail or shopfront depth.
5. **Pigeons** are only legible in close views (early game and menu). From the mid-game camera they are a few pixels.
6. **Statue wings** are better but still faceted paper. The angel is small at gameplay zoom anyway.
7. **Unseen in motion**: window flicker, the pigeon scatter and the cutaway fade are verified in stills only.
8. The showcase yaw and pitch snap to the follow camera when a match starts. `setCrowds()` already snaps the rig, so this is hidden in practice, but there is no blended transition.
