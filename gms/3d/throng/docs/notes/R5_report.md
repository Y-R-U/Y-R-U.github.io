# Lane R, wave 5: art pass against refs/reference.png

All numbers come from headless Chrome on Metal (`cdp start -- --use-angle=metal`, M5 Air). Every shot is at **medium**
quality, adaptive off, dpr 1.5 (or 2 where noted). That is what the owner's phone runs. These are not phone numbers.

## Method

`scratchpad/r5/shoot.mjs` is a deterministic still driver. It is not committed, and the recipe below is all there is:
- It seeds `Math.random` before any page script runs.
- It freezes the game's own rAF loop from page start, so no real-time ticks happen.
- It forces the quality level.
- It then drives 90 frames itself, at a fixed dt of 1/60, with a sim step every second frame (`__game.stepSeconds(1/30)`).

Two baseline runs of the same build differ by **0.00 %** of pixels on every shot. The menu is the exception at 0.83 %,
because DOM animation moves. So any changed-pixel fraction below comes from the code change, not from timing.
"Changed" means a pixel whose max channel differs by more than 12/255.

The shot set has 22 shots:
- menu, early t=10, mid t=60 and late t=110, each at 384×692 dsf 2.8, 844×390 dsf 2 and 1440×900 dsf 1;
- the 5 themes at t=60 portrait, and rain;
- 5-minute matches: `mode=teams&len=300&t=280` at medium portrait and desktop, and lite portrait; `len=300&t=280`
  (classic, one crowd of **3,060**, 5,387 people);
- mid at medium@2.

Note: the live event today (Giant Slayer) makes the default look **evening + rain**, so every un-themed shot is rainy.

## Ranked critique of the baseline (harsh, phone-size, first 10 seconds)

1. **The whole frame is flat and greyed.**
   - ACES alone desaturates every theme.
   - Next to the reference, the crowds, roofs and lamps have no punch.
2. **The ground is one murky mauve-taupe.**
   - Road, pavement and plaza merge.
   - The evening "sky" that wet paving reflects is the mauve fog colour, so the mauve covers half the screen.
   - The puddles are soft dark smudges that read as dirt stains.
   - There is no kerb line anywhere.
3. **Cutaway lids read as holes.**
   - The buildings between the camera and the player sink to flat, dark, diagonally hatched slabs: brown in evening,
     near-black navy in night-neon, and violet under a ring.
   - In the mid shot one lid covers about 15 % of the screen right beside the player's crowd.
   - In the 3,000-crowd shot there are four of them.
4. **Big crowds are speckle, not a mass.**
   - Every non-cap figure in a team crowd had one of the three darkest hair colours, because of the `h3 < 0.5` index.
   - At far zoom a 1,500–3,000 crowd is a field of black and brown dots on its shirt colour.
   - Gold crowds read as polka dots even at mid zoom.
5. **Sunny-day roads are a big flat warm grey** that merges with the pavement.
6. **Festival is pink-mauve everywhere.** The cause is its ground paint and its sun, not its fog.
7. **Fog starts just past the crowd**, so the upper third of a portrait frame is hazed (small).
8. **Paving texture is invisible at phone zoom.** Tiles fade out below about 3 px.

Not observed in this shot set:
- night-neon "blocky tiles" (the spill pools look smooth at medium);
- the outer fog ring (no edge-of-map shot was taken);
- the festival canopy (not in frame at t=60).

## What changed (in order of the ranking)

Changed pixels are measured against the final build with that one fix taken out ("ablation"), or step to step where
noted. Every after shot was compared with its before at phone size.

| # | fix | files | changed pixels | verdict |
|---|---|---|---|---|
| 1 | **Colour grade.** `CustomToneMapping` = ACES then saturation ×1.25, clamped, with no `pow`. It is patched into `ShaderChunk.tonemapping_pars_fragment` at module load, and the renderer falls back to plain ACES if the stub string is missing. It works on medium (per-material) and on high (OutputPass supports `CUSTOM_TONE_MAPPING`). Zero cost. | renderer.js | ablation: mid 13.3 %, late 20.0 %, bigc 17.3 %, festival 17.2 %, sunny 11.2 %, snow 8.8 %, night-neon 8.5 %, menu 9.0 % | kept: crowds, roofs and awnings visibly more saturated |
| 2a | **Evening reflection sky and paint cooled.** Fog/reflSky 0x6e5562 → 0x5c5f7c / 0x565a78, skyRefl bluer, outer ring 0x34363e. Pavement, plaza and central-plaza paint shifted from warm tan to grey stone, and asphalt is a cooler blue-grey. Warm lamps on cool stone, as in the reference. | themes.js | step: mid 11.7 %, bigc 13.6 %, festival 4.8 % (festival inherits the paint) | kept |
| 2b | **Kerbs.** Every block, the central plaza and the perimeter get a dark gutter (0.7 m) on the road side and a light kerbstone line (0.32 m) on the pavement side, painted into the ground texture. There are per-theme `kerb`/`gutter` colours. | ground.js, themes.js | ablation: sunny 3.3 %, evening 1.9 %, mid 0.9 %, late 0.6 % | kept: small but crisp at phone size; the blocks now have edges |
| 2c | **Puddles.** Smaller (noise ×1.4 frequency) with crisp edges, darker base (road 0.8 → 0.62) and less mirror (0.5 → 0.4). They read as wet patches showing a blue sky instead of brown stains. | ground.js | step it3→final: mid 23.5 % + 14.4 % + 16.9 % (three tuning passes) | kept, but see "still weak" |
| 2d | **Evening fog pushed out:** fogNear 1.15 → 1.55 d, fogFar 2.8 → 3.5 d. | themes.js | step: mid 6.5 %, bigc 9.0 %; festival 0.02 % (clear-weather fog never reaches the frame at mid zoom) | kept for evening (visible at the frame top in rain) |
| 3 | **Cutaway lid as a paved roof terrace.** Mid-tone stone (the facade/cornice mix × 0.44, pulled 30 % toward slate so light themes do not read as a walkable plaza). The diagonal hatch is replaced by a 1.6 m slab grid with per-slab tone that fades below pixel size. | city.js | ablation: mid 12.9 %, night-neon 13.1 %, sunny 12.3 %, late_l 5.4 %, bigc 4.4 % | kept: no longer reads as a hole |
| 4 | **Crowd hair.** Hair picks from the whole palette, and on team crowds (saturated shirt) it is tinted toward a dark shade of the team colour: 25 % at normal zoom, up to 65 % when zoomed out. Caps are unchanged. | people.js | ablation: big_d 2.6 %, big_p 2.4 %, late 1.7 %, bigc 1.5 %, mid 1.1 % (crowds are a small share of the frame) | kept: at 1:1 the 1,500 and 3,060 crowds read as a solid team colour instead of a dotted field |
| 5 | **Sunny-day asphalt** '#6e665c' → '#5e5b58' (base '#646058'). The road now reads darker than the pale pavement, and the crowds pop off it. | themes.js | step: sunny 40 % | kept |

## Reverted (no visible change at phone size)

- **Larger paving tiles** (0.9 → 1.25 m sidewalk, 1.2×0.6 → 1.7×0.85 plaza). This changed 0.15 % of mid_p, because the
  tiles still fade out at that zoom. Reverted.
- **Festival fog/reflSky to violet-blue.** This changed 0.00 %: at mid zoom in clear weather the fog starts past the
  frame, and the mauve comes from the paint and the sun. Reverted.

## Performance (medium, adaptive off, the same deterministic frames)

Draw calls and triangles are **identical** on all 22 shots before and after: no geometry was added.

`frameMs` is mean wall time for `frame()` plus a 1-pixel `readPixels` (GPU sync), over 40 frames. `ms sum` is the sum of
the renderer's update, write, other and submit EMAs.

| shot | draws | tris | ms sum before → after | frameMs before → after |
|---|---|---|---|---|
| late_p (t=110, crowd 1,235) | 19 → 19 | 588,927 → 588,927 | 0.41 → 0.34 | 1.91 → 1.96 |
| late_d | 20 → 20 | 525,027 → 525,027 | 0.40 → 0.36 | 2.19 → 2.16 |
| big_p (teams, 5 min, t=280, 5,819 people) | 18 → 18 | 702,587 → 702,587 | 0.59 → 0.57 | 2.13 → 2.12 |
| bigc_p (classic, 5 min, crowd 3,060, 4,343 figures drawn) | 20 → 20 | 984,827 → 984,827 | 0.69 → 0.63 | 2.50 → 2.47 |
| big_lite_p | 11 → 11 | 252,091 → 252,091 | 0.27 → 0.26 | 1.06 → 1.08 |
| mid_p @ medium dpr 2 | 16 → 16 | 366,983 → 366,983 | 0.19 → 0.20 | 1.67 → 1.75 |

- Every shot is within ±5 %, which is run-to-run noise. Two outliers in the first after run were re-measured:
  - early_p 1.24 → 1.71: re-runs gave 1.25 / 1.23. The first two shots of a run are warm-up.
  - menu 1.83 → 2.12: re-runs gave 1.99 / 1.86.
- Budget (≤ +10 % draws, triangles and ms at medium on the late shot): **held**.
- The new fragment work is small:
  - a 2-op saturation in the tone map;
  - one extra grid and hash on lid fragments only (they exist only while a building is cut);
  - a few ALU ops in the people vertex shader.
- High quality was spot-checked (mid_p, late_d, night-neon): it renders correctly through the bloom → OutputPass path,
  with no black frame.

## Tests

| test | result |
|---|---|
| `node tools/sim_test.mjs` | PASS (86 s); the sim is untouched |
| `node tools/meta_test.mjs` | PASS |
| `node tools/render_map_test.mjs 100` | ALL PASS (min spawn gap 45.2 m, min street 16.0 m, max obstacles 21) |
| `node tools/threat_test.mjs` | PASS |
| `hud_nearby_test --port 9274 --base …` | PASS |
| `layout_test` | PASS |
| `quality_test` | PASS (ladder climbs to medium@2, ups 4, downs 3) |

The renderer contracts (`project`, `crownTop`, `stats`, adaptive ladder) were not touched.

## Still weak (honest)

1. **Puddles in rain** now show as grey-blue patches (the reflected sky). This is less dirt-like than before but still
   reads somewhat like camouflage blotches, not a glossy wet sheen with lamp glints like the reference.
2. **Paving pattern** is still invisible at phone zoom. The evening ground is better separated (kerbs, cooler stone)
   but is still mostly flat tone.
3. **Lids:** a 4.5 m flat terrace is still an odd object next to a crowd. In snow it is white, like a plaza. There are
   no rooftop props.
4. **Gold crowds** still show dark heads at mid zoom (the blend is only 25 % there).
5. **Not addressed:**
   - the festival canopy over the grand fountain;
   - festival's overall pink cast;
   - night-neon lamp-pool blockiness (not seen at medium);
   - the outer fog ring (not shot);
   - the 3D emote bubble (G2 ask 2, still open).
6. **Snow** was only checked in one portrait shot; the grade makes it a little more saturated.

## Not verified

- **Any real phone.** All numbers are Mac Metal headless.
- **Motion.** Lid slabs fading in and out, and puddles under rain ripples, were checked as stills only.
- **The iOS Simulator** (Safari engine) was not run this wave. The new GLSL is plain (`max`/`mix`/`fract`/`hash`, no
  loops), but it is unverified there.
- **NaN readback** was not re-run. No `pow` was added.
