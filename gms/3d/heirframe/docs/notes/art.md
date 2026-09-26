# art agent notes

Owns: `js/world/*`, `js/fx/*`, `js/actors/*`, `js/engine/{renderer,atmosphere,quality}.js`, `tools/robot_gallery.html`, `tools/artgate.py`, this file.
Integrator owns camera framing (`main.js` rig.keys) — art must look right at whatever zoom it picks.

## Gate tool
`python3 tools/artgate.py shot.png [--base old.png] [--crop x0,y0,x1,y1]` — luma mean/std/p5/p50/p95/range, dark% (<0.15), highlight% (>0.85),
saturation, detail (mean luma gradient), hue buckets, warm/cool %, % changed vs a base shot. `--refs` prints the ref crops the targets came from.
`--sbs a.png b.png out.png` builds a side-by-side for a blind critic (ffmpeg). PNG decode via macOS `sips` → BMP (stdlib only).

Ref floor crops (what the gameplay camera sees): plaza mean 0.38 range 0.71 dark 16% hi 2.5% sat 0.29 detail 0.064;
blue mean 0.24 range 0.51 dark 36% sat 0.32 detail 0.047.

## Baseline (shot=1, 915x412 MOBILE DPR2, high) — 1/8 gate
mean 0.64 std 0.078 p5 0.47 range 0.26 dark 0.1% hi 0% sat 0.20 detail 0.009. 228 calls / 558k tris.

## DONE
- artgate.py
- Env map (atmosphere.js `buildEnvironment`): procedural polished floor below the horizon (light/dark/black slabs, gold rings, dark
  building-base band) + a ring of 22 dark window-strip towers (sun azimuth left open) + blue holo cards. Chrome now reads chrome.
- Gold colours were orange (sRGB 0xf2b64c ≈ linear copper). Now physically-plausible yellow gold (0xffd27a family) in civ/PAINTS/
  frames GOLD_T/enforcer/security/world M.gold.
- Planar reflection (fx/reflection.js): mirror RT cleared to alpha 0; alpha marks reflected objects, which REPLACE the env specular
  there. New `sky` option scales env specular to the artistic fresnel elsewhere (desaturated 45%). `REFL_ZONE` define + `reflZone`
  float lets a material modulate per pixel. MSAA x4 on the mirror RT for high tier. Water uses sky=0 (unchanged look).
- Floor (ground.js): travertine (darker, 3 tones per 3 m cell) + nero black marble (sunburst segments 8.6–17 m, band at r 21.4, hub,
  0.5 m ribbons on a 6 m grid outside the ring) + steel slate (ring 25.8–28.6, boulevard). Anti-aliased zone weights; gold radial
  lines now sit on the segment boundaries; faint directional veins on nero; cyan guide-light rings (r 29.15, 8.25, boulevard edges).

## Session 2 (art agent #2, 2026-09-26)
Start measure `art/a0.png` (shot=1 MOBILE DPR2, zoom 0.35 dist 9.2): mean 0.40 std 0.223 p5 0.026 range 0.667 dark 19.2% hi 0.2% sat 0.334
detail 0.022 → 6/8 (fails hi%, detail). 303 calls / 656k tris, 60 fps. Crowd loiterers (talk groups + bench sitters) were already working.
Diagnosis: the gameplay frame is ~80% floor; big nero sunburst reads as blue stripes; trees are green blob spheres; fountain jets are dashes.

## DONE (session 2)
- Trees/shrubs (foliage.js): leaf-card canopies (768x256 canvas leaf atlas: broadleaf | hedge | blossom), ~70 alpha-tested cards per
  tree with spherical normals + vertex AO, sway + fade; shrubs as hedge/blossom cards. Static tris 197k → 106k (blob trees were 115k).
  batch.add gained `vcolor: true` (keep the geometry's colour attribute).
- furnish.js (new): 8 double-sided street ad totems at the avenue mouths (one poster-atlas draw, `HOLO_ART.posters()`), benches with
  chrome/gold back rails (`bench()` exported, plaza.js uses it), 3 cafés (canopy, lit counter, 2 tables × 2 stools), fountain bollards,
  south flower beds. Every seat/loiter spot is pushed to `ctx.gather`; crowd.js reads it (seats → 'sit' with seatHeight offset).
- Crowd: high 32 / med 14 / low 7; loiter spots 4–20 m from the player. **Crowd robots use `createRobot({..., merged: true})`**: all
  material slots baked into vertex attrs (colour + pbr vec4 metal/rough/glow/coat) → 1 draw per pass per civ (was 4–5). No eye alert/
  death fade on merged robots (civilians can't be hurt, D15).
- Floor (final): sunburst wedges are caramel travertine with twin gold hairlines (no black); nero only in the r21.4 band + hub; travertine hairline + cloud veins; tiles 3 m → 1.5 m; warm inset studs at tile
  corners; floor env reflection desaturated (`skySat` option on addPlanarReflection, floor 0.22) so nero reads black, not navy.
- `world.billboards` (holo.js `createBillboards`): `show('harmony_face', {line='HARMONY IS WATCHING', duration=0, fade=1.2})` wipes
  every registered billboard (NW curved BRIGHTER board, NE HARMONY panel, 3 holo pillars, 8 totems) to Harmony's face; `show('default')`
  wipes back; `duration` auto-restores; returns the count. `.current`, `.keys`, `.list`. Register more with `registerBillboard(ctx, mat, w, h)`.
- Shot driver: env `TP="x,z,yaw"`, `YAW=<deg>`, `ZOOM=<0..1>` (sets rig.yaw/zoom then snaps).

## Critic rounds (answer keys)
- R1 `critic/r1.png` = LEFT ref gold crop (x420 y380 1252x561), RIGHT game a1.png. Critic ID'd the game (high conf). Game 3/10, ref 9/10.
  Defects: floor reads as barcode stripes not marble; empty scene; weak lighting/no sun-hit. Floor-marble? no. Barcode? yes. Empty? yes.

- R2 `critic/r2.png` (2 rows): TOP = LEFT ref gold, RIGHT game g2a (2,14 default cam); BOTTOM = LEFT game g2b (-4,-8 yaw150 pitch-15),
  RIGHT ref blue crop (y334 1536x690). Critic ID'd both. Game 3/10 and 4/10. #1 the black nero wedges read as hard SHADOW BARS/barcode;
  #2 under-populated; #3 robots lack hot specular/env. Also flagged a sitter "floating on a bench".
  → acted: wedges now honey travertine, nero only as 0.4 m ribbons + band + hub; strollers cross the view (crowd.js strollGoal).

- R4 `critic/r4.png`: TOP = LEFT game g5a, RIGHT ref gold; BOTTOM = LEFT game g5b (-3,-12 yaw210 pitch-12), RIGHT ref blue.
  Both ID'd (camera angle alone gives it away). 4/10 and 4/10. #1 STILL "hard black diagonal bars" (the 0.4 m nero ribbons +
  long 30° sun shadows), #2 void background / sparse, #3 chrome reads pale. → acted: radial nero ribbons REMOVED (wedges =
  caramel travertine with twin gold hairlines on their edges; nero only in the r21.4 band + hub), hemi fill 0.15→0.3.
  Not re-judged after that change (g6b.png / final_s1.png are the post-fix frames).
- R3 `critic/r3.png`: TOP = LEFT game g3a (1,19), RIGHT ref gold; BOTTOM = LEFT ref blue, RIGHT game g3b (7,-6 yaw120 pitch-17).
  Both ID'd; game 4/10 and 4/10 (up from 3). Defects: floor still reads flat/vector (no sheen), under-populated (3–5 figures),
  player = flat orange blob. Fountain "reads believably — best element". → acted: travertine reflZone 0.75→1.15 (robots now mirror
  in the floor), crowd 32 on high, 45% walkers of which 3/4 stroll 3–10 m around the player (g4a: ~10 civs in view); bench
  seats moved 0.12 m back (sitters were perched on the front edge).

## Perf
- shot=1 high after merged crowd (26 civs): main 118 + shadow 71 + mirror 75 + post ~13 ≈ 277 calls (was 385 with 26 unmerged).
- Far sky (skyline instanced meshes, statue, traffic cars, monorail) is hidden in the MAIN pass whenever the view's top edge is below
  the horizon (`ctx.farSky`, world.render) — it still renders in the mirror. −19 calls / −60k tris at gameplay pitch.
  (Tried 60° skyline sectors: main −2, mirror +27. Reverted. Tried batch cell 28: same total as 56.)
- Crowd shadows/mirror only within 13 m (was 18).
- `?auto=1&speed=2` autopilot, high, final (32 civs): MAX calls with enemies on screen 337 / 547k tris (up to 6 enemies), min 60 fps;
  typical free roam 220–280 calls / 500–650k. med: max 281 / 323k. low shot=1: 93 calls / 91k. (M5 metal, 915x412 DPR2.)
  Driver: `art/perf.mjs "<query>" <secs> [shotPrefix]`.

## D16 free camera (findings)
- Floating signs (CONTRACT TERMINAL, WAREHOUSE LINK, NEXUS PARCEL, TRANSIT RELAY, holo pillars) now turn to face the camera
  (`faceCamera(ctx, mesh)` → ctx.faceCam, world.update). Kiosk screen + café menus are two-sided (`twoSided(mesh)`); totems FrontSide.
- Shadow box leads 6 m toward where the camera looks. Planar reflection is yaw-independent (checked).
- Occluder see-through fade now also on chrome/darkMetal/gold/stone/stoneUpper/glassRail/canopy/glows/facades (was foliage+bark only).
- Skyline had only 18 tries south/east; now 7 hero towers S/E/W + 60-try ring (81 towers). New `backdrop.js`: terraced residence
  crescent + 2 gold spires south of the terrace; vista.js far-bank buildings are now stepped `tiered()` towers + 3 east-bank towers.
- **REQUEST (integrator/camera):** at pitchMin 35° and fov 36 the top edge of the view is 17° BELOW the horizon, so no skyline,
  waterfall, statue or flying-car lane can ever be in frame (only within ~26 m of the camera). For looking around to pay off, let the
  pitch go to ~10–15° when zoomed out, raising the look target (e.g. look.y += (35 − pitch) × 0.2). Horizon vistas checked with a
  fixed camera at 7 m (`art/h4.png`, `h2.png`): N = BRIGHTER board + Concord Hall + HARMONY + falls; W = atrium; S = terrace + new
  residences/spires; E = basin, cascades, new towers.

## Robots (session 2)
- Civ sculpt (kinds_civ.js): the 4-ring "slinky" abdomen is now one continuous front shell pinched at the waist with 3 shallow
  grooves + centre line; fuller upper-arm / forearm pods. Affects every buildElegant kind (checked lineup gal4.png).
- `addRim()` in actors/materials.js: every mat() robot material gets a fresnel rim tinted by its colour (+ small neutral term);
  the merged crowd material has the same rim and envMapIntensity 1.25.
- Rental: clip-on amber beacon on the head + 4-bar battery gauge on the backpack (3 lit, 1 dead) so the player reads from behind/above.

## Gate numbers (shot=1 915x412 MOBILE DPR2 high)
- start a0.png: mean 0.40 std 0.223 p5 0.026 range 0.667 dark 19.2% hi 0.2% sat 0.334 detail 0.022 → 6/8; 303 calls / 656k tris.
- mid g3a.png (before ribbon removal): mean 0.42 std 0.222 range 0.68 dark 20.7% hi 0.1% sat 0.284 detail 0.018 → 6/8.
- end final_s1.png: mean 0.53 std 0.124 p5 0.34 range 0.39 dark 0.9% hi 0.5% sat 0.272 detail 0.0245 → 1/8; 278 calls / 622k tris.
  The gate now FAILS on contrast/dark% because the black wedges/ribbons it rewarded were exactly what all 4 critics called
  "barcode / shadow bars". The dark%/range targets come from eye-level ref crops; treat them as suspect for a 52° overhead frame.
  If contrast is wanted back, get it from reflections of dark objects, not floor paint.

## NEXT / gaps
1. Pitch floor (integrator): vistas need pitch ≤ ~15° when zoomed out (see D16 REQUEST). Everything to look at is built.
2. Title/wide views: ~495 calls / 860k tris (title drift cam sees the whole plaza + skyline + 32 civs). Gameplay ≤ ~340.
3. Floor still reads "glossy vinyl" to critics: needs broader sun sheen (dual-lobe spec) and more dark reflected mass.
4. Chrome civs read pale at distance: try a darker chrome base or stronger env contrast.
5. God-rays/light shafts not done. Water shows square sparkle aliasing at low pitch (sun spec on the normal map + bloom).
6. Merged crowd robots have no alert/death visuals (fine for D15 civilians; don't use merged for enemies).

## Screenshots
scratchpad `art/` (driver `art/shot.mjs`, PORT 9314, MOBILE=1 now also sets an Android UA so the tier/dpr match a phone).
Env: `TP="x,z,yaw" YAW=deg PITCH=offset ZOOM=0..1 PRE=file.js`. `art/gshot.mjs` = same for tools/robot_gallery.html (BASE=).
Key shots: a0 (start), g4a/final_s1 (end default cam), g6b (rotated end), v4 (4 yaws at min pitch), h4/h2 (horizon vistas),
f2 (fountain), sit2 (bench sitters), bb1 (billboard takeover), gal3/gal4 (robots), critic/r1..r4.png.

## Round 2 (art agent #3, 2026-09-26) — DONE
Brief: vista perf at pitch 12° (≥55 fps M5 every yaw), title ≤300 calls/650k, occlusion fade at any yaw, calmer floor + sun sheen,
chrome contrast at distance, water sparkle. Previous round-2 agent died without notes; its only work was the uber batching below.

1. **Uber-material batching (kept)** — `js/world/{batch,materials,world}.js`. Materials flagged `userData.uber` (stone, stoneUpper,
   gold, chrome, darkMetal, glassDark, warmGlow, blueGlow, bark, soil, dumpster, crate) are baked at batch time into vertex colour
   (× material colour, or × emissive·intensity for pure glows) plus a `pbr` vec4 attribute (metal, rough, glow flag, envMapIntensity),
   and every such bucket in a cell shares `M.uber` (contactAO + fade). `?nouber` disables it for A/B.
   Manager measure shot=1 915x412 DPR2: 171 calls / 717k tris (uber) vs 236 / 666k (nouber), 5% pixels changed.
   Verified: vista (-30,40) pitch 12 high: uber 257 calls / 589k vs nouber 368 / 536k, 6.3% px changed (crowd motion), looks
   identical side by side (`art/r2/u_stack.png`); low tier 121 vs 182 calls, 4.2% changed. Fade/dither works on uber (it's in the
   fade list); mirror shows uber cells normally.

2. **Measurement traps found:** `?noui` is broken right now (integrator's hud.js throws in startSession → runtime stuck in
   'title' → rig.fixed title cam), so any `?noui` "vista" is really the title view. Use `?shot=1` (rig follows the player,
   same 0.35 zoom key) or the real UI + `?auto=1&fresh` then `runtime.auto=null`. Driver `art/vp.mjs "<query>" base,nomirror,...`
   (env VIEWS="x,z,yaw;..." PITCH=12 SHOT=prefix FREE=1 TITLE=1) prints rAF fps, a synchronous 8-frame render+readPixels ms,
   and calls/tris per pass (renderer.render / shadowMap.render wrapped). `art/r2/top.js|named*.js` = per-object draw breakdown.
3. **Perf finding:** on M5 metal (915x412 DPR2 mobile → dpr 1.5) every vista yaw at pitch 12 runs at the 60 fps rAF cap, render
   cost ~4–10 ms (noisy: other agents' Chromes share the GPU). I could NOT reproduce 35–46 fps; with the real UI in free state
   also 60. Suspects for the integrator's number: GPU contention (2–3 headless Chromes) and/or the HUD's `backdrop-filter`
   blur on `.hf-glass` (css/ui.css:90, high tier) which re-blurs the canvas every frame — request to UI owner: test without it.
4. **Perf changes:** crowd far LOD — `createRobot({lod:'far', merged:true})` now also builds a `tiny` template (PartBuilder
   k 0.26, ~3.2k tris vs 5.6k) and `bot.setLod(0|1)` swaps geometry on the same skeleton; crowd.js swaps at camera distance
   >18 m (back <16). Crowd shadow/mirror now also require camera distance <25 m. Flying cars out of the mirror and ~45% fewer
   tris (sphere 14x7). Skyline tori 6x40 → 4x28, stone rings 32 → 20 segs.
   Title: 303 calls / 992k → 281 / 654k. Vistas (shot=1, pitch 12, 8 views): 177–281 calls / 568–803k (were 250–304 / 690–950k).
5. **Atrium end walls** (the integrator's "flat grey slab" at yaw 270 near (-30,40) — it's the 31 m atrium end wall at th1):
   both faces now have per-tier lit shopfront bands (shopGlow) with chrome mullions, stoneUpper slab bands + gold strips +
   warm reveal, gold corner pilasters. All batched (uber/shopGlow), ~0 extra calls.

6. **Occlusion fade rewritten (any yaw/pitch):** foliage.js `FADE_GLSL` — world-space capsule camera→player chest (radius 1.6 m
   at the lens → 2.7 m at the player, stops 0.3–0.9 m before the player) + everything within 1.5–3.5 m of the lens, ordered
   4x4 Bayer dither (was hash noise) up to 90%. Uniforms `uFadeA` (camera, set in world.render) / `uFadeB` (player, via the
   unchanged `world.setFadeTarget(p)`) / `uFadeOn` (off during the mirror pass and on frames nobody called setFadeTarget, e.g.
   title cam). Holo signs/posters (ShaderMaterial with uBright) get the same test as an alpha fade (patched in world.js after
   batch.build). Shots `art/r2/f_grid.png`: canopy at (0,20) yaw 90 now opens around the player.

### Aaron's S22 report (2026-09-26): crowd stuck on planters; 44–52 fps looking at the crowd (idle elsewhere ~56 = 60 Hz vsync
cap); governor must not read a 60 Hz cap as slow. D17: look-up to -45° is final (cheap views).
7. **Crowd navigation (crowd.js `walkTo`)**: A* on a lazily built 1 m walk grid (`createNav` imported read-only from
   js/game/nav.js, radius 0.42, own instance), string-pulled paths, ≤3 routes per frame; blocked steps try ±0.6/1.2/1.7 rad
   slides; a 1 s progress watchdog re-routes (and flips slide side), 3 strikes → new stroll goal / next loop point / snap home if
   off-screen; civilians spawned inside a prop footprint walk straight out to `nav.nearest`. Seats: last metre straight in.
   Flee also slides. **Harness `art/r2/stuck.js`** (eval in a `?shot=1` page: 120 s virtual clock at 30 Hz, focus hops
   across 12 plaza points every 10 s; stuck = wants to move but <0.25 m in 2 s): before 8 civs / 304 of 2641 samples stuck
   (spawned inside planters at (7,21), (-9,21); loops pinned at (1,-55)); after **0 / 2706**; 300 s soak (`stuck2.js`) 0 / 6385;
   med tier 0 / 1253.
8. **Crowd render cost:** shadows + mirror only for the nearest 8 (high) / 5 (med) civs within 13 m of the player and 22 m
   of the camera; far LOD (>18 m from camera) also swaps to the plain MeshStandard merged material (no clearcoat lobe, env 1.25).
   Crowd CPU on M5: 0.06 ms/frame for 32 civs (anim is not the problem). On M5 the whole crowd costs ~0.3 ms GPU — the S22
   crowd-view dip is most likely fill (dpr 1.5 → 1.0 cut M5 frame 28%), i.e. reflective floor + bloom + MSAA over a busy view.
9. **Governor:** judges a trimmed mean (slowest 10% frames dropped) per 1.5 s window; slow < 45, fast > 57, so a 60 Hz vsync
   cap (~59.9) never drops dpr and one-off hitches don't either.
   NOTE: GPU timer queries (EXT_disjoint_timer_query_webgl2) on ANGLE-Metal return garbage (bloom "60 ms"); and M5 timings
   were swamped for a while by qwen-tts (MLX) + replayd sharing the GPU — treat ms numbers from this session as ±50%.
10. **Floor (ground.js):** inlays cut from ~7 rings + 72 radial hairlines + 6 m grid to 5 bold rings, 12 gold spokes (every other
    wedge edge), a 12 m outer grid and one boulevard edge line; warm studs every 6 m (was 3). New **sun sheen**: a second,
    rough specular lobe (pow 40 ×0.28 + pow 8 ×0.06, warm tint) injected into the directional-light loop of
    lights_fragment_begin, so it respects shadows; zero on inlays, 0.6 on steel. Shots `art/r2/fl_cmp.png`, `sh_cmp.png`.
11. **Chrome contrast (actors):** `HORIZON_BAND` in actors/materials.js — env radiance ×(1 − 0.62·band·metalness) where the
    world-space reflection vector grazes the horizon (−0.35..0.24): the dark tower-base line chrome shows in the refs. Applied to
    every mat() robot material (via addRim) and the merged crowd material. `art/r2/ch_cmp2.png`.
12. **Water:** fountain/pool material got specular AA (ripples flatten with distance, roughness from fwidth of the ripple
    normal, capped 0.2). **The east lake is a new material** (`createLakeMaterial` in water.js, shore SDF from
    walls/discs passed by vista.js): turquoise shallows → teal → deep via shore distance + noise, broken foam line at stone and
    islands, caustic web in the shallows (fades with distance), world-space normals (2 scrolling ripple scales + 2-wave analytic
    swell → no tiling), churn + white water under the great falls and the lowest cascade, spec AA (roughness ≥ fwidth(ripple),
    foam rough 0.75). Cascade pools keep the old material. Cost A/B on M5 (same frame, material swapped, 3 reps):
    +0.05 ms (3.10 vs 3.05 ms) at (40,8) yaw 270 pitch 12; +0.08 at (44,-40) pitch 40. Shots `art/r2/lk_grid.png`, `lk2.png`.
13. Outer-plaza dark nero ribs 6 m → 12 m grid (matches the 12 m gold grid). Steel slate/boulevard roughness floor 0.14 (critic
    read the razor-sharp black mirror as an SSR glitch). Lake ripples modulated by a slow noise "wind" field (critic saw tiling).

### Final numbers (M5 metal, 915x412 DPR2 mobile → dpr 1.5, `art/vp.mjs "shot=1"`, pitch 12, rAF fps / sync render ms / calls / tris)
high: (10,-40)y180 60/4.0ms/252/665k · (-30,40)y270 60/2.5/253/604k · (0,20)y90 60/3.5/179/568k · (3,12)y0 60/4.0/230/615k ·
(-20,0)y45 60/3.8/173/578k · (30,0)y90 60/4.1/216/543k · (0,-60)y0 60/3.3/158/461k · (0,30)y180 60/3.0/167/536k.
Before this round (same views, pre-LOD): 177–304 calls / 568–950k tris. Integrator's 35–46 fps not reproducible (see 3).
med: 60 fps, 1.8–2.2 ms, 189–235 calls / 460–560k. Title (UI on): 268 calls / 619k (was 303 / 992k; 495 / 860k pre-uber).

### Critic rounds (answer keys) — both correctly ID'd the game (camera angle + low-poly figures give it away)
- R5 `critic/r5.png` = LEFT game `art/r2/g7a.png` (shot=1 default cam), RIGHT ref gold floor crop (420,380 1252x561).
  Game 3/10, ref 8.5. #1 floor still "flat tan vinyl with painted grid lines", wants veining/mirror falloff; #2 empty, props
  placeholder; #3 lighting a single gradient wash. (Taken before item 13.) Same verdict as R1–R4: the 52° frame is ~80% floor.
- R6 `critic/r6.png` 2x2: TOP-LEFT game vista `g7v` (10,-40 yaw180 pitch12), TOP-RIGHT ref gold (0,100 1672x753);
  BOTTOM-LEFT ref water crop (1000,540 672x302), BOTTOM-RIGHT game lake `g7l` (40,-20 yaw300 pitch14). Game 4/10 both, refs 8.5/7.5.
  Lake water 5.5 vs ref 7.5: "nice colour, reads as a pool; visible ripple tiling; foam only at the top; single glitter
  hotspot". Vista: "near-mirror floor reflects flat black silhouettes → SSR glitch" (→ item 13), mixed robot designs,
  greybox architecture, no atmospheric perspective.

## NEXT / gaps (round 3)
1. The gameplay frame's floor is still the weakest read (3/10 five rounds running). Needs mass, not more paint: long soft
   reflections of the tall architecture at gameplay pitch, contact shadows/AO under props, maybe a larger-scale veined slab.
2. Atmospheric perspective between near and far (critic, both vistas): stronger distance haze/aerial blue on the skyline.
3. Lake: falls-base foam/mist volume (the mist points exist but barely read), scattered glints; waterfall sheet shader is flat.
4. Phone perf is unmeasured: M5 can't stand in for the S22. Suspects in order: fill (reflective floor + MSAA×4 on half-float
   + UnrealBloom's 5 mips at dpr 1.5), then `.hf-glass` backdrop-filter blur (UI). Try bloom at quarter res, and MSAA 2 on high.
5. Near-lens fade dithers balconies/rails close to the camera into a visible Bayer pattern at the frame edge (lake views).
6. REQUEST integrator: `?noui` is broken (hud.js:64 null `ui.hud` in startSession → stuck in title).

## Round 3 (art agent #4, 2026-09-26) — DONE
Brief: phone fill-rate (per-pass cost table, dpr 2.5–3 forced on M5), atmospheric depth, falls mist/spray, floor grounding
(reflected mass + contact shadows), soften near-lens dither; 2 blind critic rounds.
- Harness `art/r3/cost.mjs "<query>"` (env DPRS, VIEWS="x,z,yaw,pitch;…", TOG=base,legacy,nobloom,bloom4,msaa2,msaa0,nomirror,
  mirror2,mirror0,noshadow,shbasic,shpcf,nofloor,notrans,nopost, REPS): interleaved toggles, median sync render+readPixels ms,
  dpr forced (3 = phone-fill stand-in: 915x412@3 = 3.4 Mpx, 4x the S22's 0.85 Mpx at dpr 1.5). Delta = cost of that pass.
- DONE post: `BloomLite` (renderer.js) folds UnrealBloom's final full-res additive blend into the grade pass (identical
  maths) — that blend reloaded + re-stored the 4x MSAA half-float target and forced a 2nd resolve. Composer rt1 (never
  drawn: RenderPass draws into rt2=readBuffer) now has no MSAA; resolveDepthBuffer=false on the scene + mirror targets.
  A/B vs an emulated legacy path: legacy +0.74 ms @dpr1.5 (+18%), +1.28 ms @dpr3.
- DONE floor (ground.js): the nero-vein / travertine-vein / steel-texture blocks only run where their zone has weight
  (coherent branches, textureGrad with derivatives taken outside). Floor cost (nofloor delta) 1.66→0.89 ms @1.5,
  6.44→3.90 ms @3; frame 3.4→2.3 ms @1.5. Pixel-identical floor (only moving robots differ).
  Then the floor's sin() hash → sine-free Hoskins hash (same value-noise character, veins land elsewhere): trav veins 1.16→0.76 ms @3.
- DONE bloom at quarter res (`tier.bloomDiv` 4 on high/med): side-by-side indistinguishable (`art/r3/bdcmp.png`), saves most of bloom.
- DONE mirror RT MSAA 4→0 on high (`tier.mirrorMsaa`): the floor blurs it with 5 taps anyway, crops identical (`mmcmp.png`).
- KEPT main MSAA 4: MSAA 2 shows stair-steps on rail tops / lamp poles at 4x zoom (`mscmp.png`) = a look loss (D18).
- On-device A/B URL overrides (quality.js): `?msaa=2 &mirrormsaa=4 &bloomdiv=2 &shadow=1024 &dpr=1.25` — Aaron can try msaa=2 on the S22.
- HUD backdrop-filter: at 915x412@4 (GPU-bound, ~42 fps) glass on vs off is within noise (1 visible .hf-glass element in
  the free/dialogue state). Headless M5 can't model the Android compositor, so: REQUEST (UI owner, low priority) — try
  `?`-gated or high-only removal of `.hf-glass` blur and compare on the S22 perf overlay; no evidence it matters on M5.
- DONE aerial perspective (atmosphere.js fog chunk, `AERIAL` 2.2): per-channel extinction exp(-(optical-25)·(1.1,1.4,1.9)e-3·k)
  + blue-grey in-scatter (sun-tinted toward the sun) before the existing exp2 fog. Far bank/towers go cooler and flatter,
  near stays crisp; no milk. `art/r3/aev.png` (before) vs `aev2.png`.
- DONE near-lens / capsule fade (foliage.js): opaque fade materials with MSAA on use alpha-to-coverage (`HF_A2C`) + a
  low-amplitude 2x2 alpha offset (16 levels) instead of the 4x4 Bayer discard → soft translucent fade, no grid
  (`dz.png` before, `dz2.png` after). Low/med (no MSAA), glass and alpha-tested leaves keep the Bayer path.
- DONE falls (water.js): sheet shader — sqrt(t) flow coordinate (water accelerates, streaks stretch), wobble growing with
  drop, uneven "rope" columns, glassy dark lip with a sun glint line, ragged side edges, white-water foot. Mist = billows
  (normal blend, lobed, sun-lit top) that boil up + roll out d m over the water, plus additive droplet spray; great falls
  d 16. Lake: foam plume downstream of each churn box (30 m falloff, advected scum lines, extra ripple).
  Free-camera shot helper `art/r3/cam.sh "px,py,pz,tx,ty,tz" out.png` (disables the fade). Views: fc*.png near, fw*.png wide.
  GOTCHA hit again: `pow(negative, 2.0)` in the lip glint = NaN → whole frame black via bloom. Use x*x.
- DONE floor grounding: `js/world/groundao.js` bakes contact AO once at load (ortho camera UNDER the floor looking up
  renders the lowest surface height of static, opaque, non-instanced meshes with bbox below 2.5 m on BAKE_LAYER 7, then a
  40-tap disk pass → 528x880 RGBA8 over LAYOUT.bounds, 0.2 m/texel). Floor samples it once (`groundOcc()` in ground.js,
  after aomap_fragment: indirect diffuse ×(1−.75o), indirect spec ×(1−.6o), direct ×(1−.3/.5o)). Plus live soft contact
  disks under the 12 grounded robots nearest the focus (`LIVE_ROBOTS` Set exported from actors/robots.js; hover kinds
  skipped; `uContacts[12]` = x, z, 2.2×radius). `?noao` disables. Cost ≈ 0 (within noise at dpr 3). `aocmp2.png`.
  Bake texture dump: `art/r3/aomap.png` (driver `/tmp/claude-501/aodump.js`, uses `ctx.groundAOBake`).
- Mist cost: ≈0.3 ms @dpr3 / 0.08 @1.5 in the lake view (new billows + spray), 0 elsewhere.
- FIXED black-frame bug (latent, pre-existing): a mirror-smooth sun glint on the lake overflowed the half-float scene
  target to Inf at dpr 2 (GGX D at roughness 0.0525 × sun 3.3 > 65504); Inf → bloom mips → ACES = NaN → a blocky black
  frame (`art/r3/l_r3.png` before the fix). Now clamped to 64 in BloomLite's high-pass input and in the grade input.
  Could explain any "black screen with HUD working" report on phones.

### Critic rounds R7/R8 (answer keys; sheets in `art/critic/`)
- R7 `critic/r7.png`: LEFT = ref gold crop (420,380 1252x561), RIGHT = game gameplay `art/r3/g_r3.png` (shot=1 default).
- R8 `critic/r8.png` 2x2: TOP-LEFT = game vista `v_r3.png` (10,-40 yaw180 pitch12), TOP-RIGHT = ref gold (0,100 1672x753);
  BOTTOM-LEFT = ref water crop (1000,540 672x302), BOTTOM-RIGHT = game falls/lake `l_r3.png` (cam.sh 25,12,-20 → 72,0,-100).
- R7 verdict: ID'd (95%). Game 3/10, ref 9. Floor 3/10 "vinyl": 80% of frame is bare floor, no mass reflected in it, no
  wear/roughness breakup; claims "no contact AO under feet" (the disks are there but subtle at this zoom); light wedges
  read as painted decals. Fix wanted: reflections of figures/props + roughness smudges + contact AO; less floor in frame
  (camera = integrator's).
- R8 verdict: both game panels ID'd. Vista 3/10 (overexposed/washed, mannequins, mirror floor sterile, atmos depth 3
  "distance only gets whiter, milky"). Falls/lake 3.5/10: falls 3 ("flat scrolling planes, hard edges"), mist "big white
  blob bleaching half the frame", water 4, atmos 2 "milky". Refs 8–8.5, atmos 8–9.
  → acted: aerial in-scatter darker/bluer (fogColor×(0.6,0.71,0.9), sun side ×0.85) = value falloff not whitening; exp2
  fog 0.0007→0.00055; great-falls mist d 16→9, rise 0.6→0.45×size, billow alpha 0.3→0.22 (`art/r3/lcmp.png`).
- R9 `critic/r9.png` (post-fix): TOP-LEFT = ref gold wide, TOP-RIGHT = game vista `v_r4.png`; BOTTOM-LEFT = ref water,
  BOTTOM-RIGHT = game falls `l_r4.png`.

### Per-pass cost table (M5 metal, 915x412 mobile UA, sync render+readPixels median ms; delta = cost of that pass)
BEFORE = round-2 code served from `art/r3/before/` on :8842; AFTER = current. REPS 5, interleaved. ±0.3 ms noise.
| view | dpr | frame B→A | bloom B→A | MSAA4 B→A | mirror B→A | floor B→A | post total B→A |
|---|---|---|---|---|---|---|---|
| (0,24) default | 1.5 | 3.65→(2.25–4.3, noisy run) | 0.36→~0 | 0.29→0.3 | 0.37→0.4 | 1.55→0.75–1.0 | 0.82→~0.2 |
| (0,24) default | 3 | 12.38→7.33 | 2.29→~0 | 1.50→0.48 | 0.70→0.28 | 6.07→4.30 | 3.85→0.77 |
| (4,10) crowd | 3 | 14.10→7.87 | 2.32→0.10 | 1.60→0.72 | 0.94→0.50 | 7.43→4.85 | 3.59→0.78 |
| (10,-40) vista | 3 | 18.72→7.29 | 3.19→0.10 | 2.18→0.81 | 1.34→0.53 | 6.93→3.08 | 5.34→0.75 |
| (40,-20) lake | 3 | 15.84→6.02 | 2.97→0.10 | 2.50→0.81 | 1.15→0.55 | 1.43→0.78 | 5.99→0.73 |
dpr 1.5 AFTER frames: 2.2–2.8 ms (one noisy 4.3). Shadow-map render ≈0–0.3; PCFSoft filtering ≈0.3–0.6 @3 (kept);
transparent layers ≈0 except the lake view (~1 ms @3: mist + falls + water). dpr 3 ≈ the S22's pixel load ×4.
Expected on the S22: the fill-bound part of the frame ~40–55% cheaper; the crowd view should clear 60 at dpr 1.5.
- R9 verdict: both game panels ID'd again. Vista 3/10 (atmos 3, "fades to the same pale white-blue, milky"), falls 3.5
  (falls 4 up from 3, mist now "soft blob at the base" not "bleaching half the frame"; water 4; atmos 2). Refs 8.
  The three critics AGREE the "milky" read is global: the whole frame is overexposed/washed with no dark far values,
  not the fog itself (my haze changes moved atmos scores 3→3, 2→2). Hypothesis, NOT acted on (Aaron likes the current
  look; D18 → ask first): exposure −0.5..−1 stop (renderer.toneMappingExposure 0.85, grade uContrast 1.14) + darker
  sky/env so far towers can go blue-grey DARK rather than pale.

## NEXT / gaps (round 4)
1. Ask Aaron/manager about a darker grade (above). Try it behind `?grade=dark` for an on-device A/B first.
2. Gameplay floor still 3/10: the critic wants mass reflected in the floor at the gameplay pitch and roughness wear
   breakup. The contact AO + robot disks exist now but read subtle at 0.35 zoom; could strengthen 0.8→1.0 and radius.
3. Falls: critics want a lip curl over the edge and a spreading foam ring at impact; sheets are still cards (no thickness).
4. On-device perf: ask Aaron to open `?perf` (overlay) on the S22 before/after this push; try `?msaa=2` there.
5. REQUEST (UI owner, low): measure `.hf-glass` backdrop blur on the S22 (not measurable on M5).

## P2b (world/art agent, 2026-09-27) — DONE
Brief: Brightline Boulevard district (ref_boulevard_blue), district API + relay transition, boss_kettle, drop-pod + courier,
Mk I/II tier reads, milky-haze carry-over, perf on high/med/low, 2+ blind critic rounds.

### P2b → API for gameplay
- `createWorld(canvas, {quality, district})` — `district` = `'aurum_plaza'` (default) | `'brightline'`; `?district=brightline`
  also works with no code change (read in createWorld). main.js needs nothing.
- `world.loadDistrict(id) → buildMs` (sync, ~100–150 ms on M5): disposes the old district (geometry, non-shared materials,
  textures, AO bake), builds the new one, then re-points `world.district` (`{id, name, city, bounds, layout, crowd}`),
  `world.sites`, `world.interactables`, `world.spawnPoints` (`player, kiosk, pad, relay` Vector3s), `world.billboards`,
  `world.breakables`, and applies the district's light (sun, hemi, fog, env, grade). `world.collision` is the SAME object
  (reset in place), so cached references stay valid. `world.ctx` is a getter (current district's ctx).
- `world.onDistrict(fn)` → unsubscribe; `fn(world, id)` runs after every swap. The crowd re-homes itself here.
  **Gameplay must, on swap:** teleport the player (`world.spawnPoints.player` or `.relay`), clear its enemies/mission props
  (they live in `world.scene`, not in the district group), rebuild its own nav grid (`createNav(world)` reads the new
  `world.district.bounds`), and re-read `world.sites` (game.js caches `{aurum_plaza: world.sites}` at start).
- `world.relayTransition(toId, {onSwap}) → Promise<{buildMs}>`: light tunnel (zoom blur + streaks) eases in 0.85 s, white-out,
  swap at the peak (`onSwap(world, toId)` → put the player at `world.spawnPoints.relay`), 0.15 s hold, eases out 0.9 s.
  Same id = tunnel only (use it for relay-to-relay hops). While it runs, keep calling world.update/render as normal.
- `world.districts` = ids. Both districts have a Transit Relay interactable `{id:'relay'}`, a `contracts` terminal and a
  `warehouse` link pad.
- `world.breakables` (every district; Aurum's is empty): `list` [{id, kind:'crate'|'vending'|'holo', x,y,z, r, hp, maxHp,
  value, broken}], `alive`, `near(x,z,r)`, `hit(prop|id, dmg) → broke?`, `splash(x,z,r,dmg) → broken[]`,
  `onBreak(fn(prop))`, `reset()`. Breaking hides the instance, removes its collision circle and throws debris.
  Values: crate 30, vending 90, holo 60 (use for collateral/loot as you like).
- Brightline sites (tags): plaza ×4, market ×2, locker ×3, alley ×2, rooftop ×2 (terrace y 2.4, deck y 2.0), lobby ×2, relay,
  spawn_edge ×4, vantage ×3, hide ×4, npc ×5, terminal, link_pad. ids prefixed `bl_`.

### Files (new): `js/world/brightline.js` (layout, furniture, sites, crowd loops, ambience), `bl_city.js` (canyon: arcade,
podium, towers, east drop, billboards, far towers, monorail, car lanes), `bl_ground.js` (wet slate floor shader),
`breakables.js`, `js/fx/relay.js` (tunnel timing; the effect itself is in the grade pass, renderer.js `uRelay`).
Refactors (Aurum pixel-identical, checked 2.6% = crowd motion): world.js district system; traffic.js → `addFlyingCars`,
`addMonorail`; skyline.js → `addTowerField`; plaza/sites/furnish helpers exported; collision `reset/remove`; ground.js
patches the shared marble once; crowd.js per-district loops/talk spots + `onDistrict` re-home.

### Robots (P2b)
- `boss_kettle` (kinds_boss.js): enforcer build ×1.08 + copper boiler on aux0 (brass bands, rivets, glowing firebox grille),
  chimney + whistle, steam vents over both shoulders, 2 boiler gauges + 1 chest gauge (canvas dial), brass knuckles,
  bowler hat. 7 slots = 7 draws. Height 2.75, radius 0.62. All biped anims (hit/attack_melee/attack_heavy/die…).
  `robot.steam(k=1)` = burst from sockets ventL/ventR/stack (any kind; no-op without vents). Auto bursts on
  attack_heavy (1.3), hit (0.6), die (2.5); a thin chimney wisp runs on its own. js/actors/steam.js (1 Points draw,
  parented to the robot's parent).
- `createDropPod()` (js/actors/droppod.js, re-exported from robots.js): `{root, pod, drone, slot, state, durations,
  play('land'|'open'|'close'|'leave') → Promise, update(dt), dispose()}`. land 2.6 s (courier drone lowers it from 45 m,
  retro flare, dust ring, drone lets go and hovers at 7 m), open 1.1 s (4 petals fold down, floor lights), close 0.9 s,
  leave 2.4 s (re-hook, haul up and away, root hides). Stand a robot on `pod.slot` (or next to root) for the swap.
  Gallery: `tools/robot_gallery.html?view=pod&kind=gunner&tier=1` loops the whole cycle.
- Mk II (tier 1) reads now: Bulwark gold helmet crest + lit core + gold pec edges; Longarm navy trim + navy left pauldron
  + carbine glow strip; Wisp cyan chest V seam + cowl fin + thicker limb seams (`art/p2b/tiers1.png`).

### Perf (M5 metal, 915x412 mobile UA DPR2 → dpr 1.5; shot.mjs calls / tris; after the cell fix below)
- high: gameplay (0,40) 141 / 397k · vista N (0,70 p12) 262 / 608k · look-up (0,40 p-20) 194 / 450k · vista S (0,-60 yaw180 p12)
  259 / 583k. Before the fix: 180 / 407k, 340 / 632k, 253 / 480k, 331 / 594k (vistas over the ~300 budget).
- med (pre-fix, so upper bounds): 171–320 calls / 356–527k. low (pre-fix): 43–153 calls / 64–212k.
- Fix: Brightline batches with 96 m cells (`def.batchCell`), far-canyon cells (|z| > 130) are out of the mirror,
  lower-avenue trees only near the play area. Vista N passes: main 173, mirror 76, shadow 32+13 (was 210/117/36).
- GPU sync render ms (cost.mjs, dpr 1.5 / 3): gameplay 1.93 / 5.41, vista N 2.33 / 5.69, vista S 2.19 / 5.58.
  Aurum on the same run: 2.02 / 5.85 (default), 2.26 / 5.84 (vista). Same range, as required.

### Haze carry-over (atmosphere.js; `?haze=old` restores the round-3 look for A/B)
- Distance now recedes into a mid blue-grey that is darker than the sky (in-scatter fogColor×(0.52,0.64,0.86), sun side
  weight 0.55→ was 1), the exp2 fog target is bluer, AERIAL 2.2→3.0, sky horizon (1.0,0.88,0.74)→(0.92,0.90,0.88).
  Gameplay-pitch frames unchanged (sunlit look kept; `art/p2b/hz2.png` bottom row). Brightline far band sat .316→.351.
  HONEST: Aurum's far band barely moves (mean .566→.564): its "milk" is sunlit cream stone at 60–100 m + exposure,
  not haze. A real fix there means darker/cooler distant materials or a darker grade (the round-3 hypothesis).
- HARMONY panel was invisible (holo coplanar with its backing box → failed depth test); moved 0.7 m forward.
  Mountain-lake art redrawn (layered ranges, snow, lake mirror); shared with Aurum's HARMONY panel.
- Brightline light: warmer, stronger sun (1,.9,.78 ×3.6), lower fill (hemi .26) after critic R1 "flat cold haze".

### Critic rounds (answer keys; sheets in `art/critic/`)
- P2b R1 `critic/p2b_r1.png` 2x2: TL = ref (crop 0,200 1536x690), TR = game eye-level north (0,20 yaw0 pitch -5),
  BL = game vista (-4,48 pitch 14), BR = ref (crop 250,420 1150x518). Verdict: both game panels ID'd (80/85%).
  Game 4/10 and 3.5/10, refs 7 and 8. Floor 6 (best game sub-score), architecture 5–6, billboards 4–5, figures 2,
  light 5. #1 figures are tiny unreadable blobs at vista distance (crowd far LOD, camera far from the crowd);
  #2 billboards read blank (HARMONY was invisible, see above); #3 flat cold haze, no sun contrast.

- P2b R2 `critic/p2b_r2.png` 2x2: TL = game eye-level among the crowd (cam.sh -6,1.9,34 → 4,6,-40), TR = ref (crop
  236,380 1300x585), BL = ref (crop 0,120 1536x690), BR = game north (0,20 pitch -5). After: HARMONY fix, new
  mountain art, warmer sun, haze. Verdict: both game panels ID'd (88/90%). Game 5/10 and 4.5/10 (R1: 4, 3.5), refs 8.5 / 8.
  Architecture 6, floor 6, light 5, billboards 2–3 ("blank white rectangles"), figures 3. #1 "blank white panels" =
  the shared facade shader's bright cool lit-window cells (1.6×4.2 m, emissive ×1.5) → dimmed to 0.25–0.45 with a
  split, 0.99 threshold (also changes Aurum's towers a little: 11% px vs the P2b start, incl. crowd motion). Not re-judged.
  #2 underpopulated: 32 civilians is the D20 cap; the ref's density needs cheap impostor crowds (not done).
- **P2 target ≥ 7/10 NOT met: best 5/10.** The gap the critics name every round: readable dense robot crowds at
  mid distance (ours go to the far LOD at 18 m and are sparse), billboard/sign content richness, and the refs'
  close-up hero robots (a composition the game camera rarely makes).

### Final checks
- `node --check` clean; full-UI boot of both districts → title, 0 exceptions; brightline: 34 sites, 18 breakables.
- Swap ×20 (10 round trips): programs flat at 84, geometries 89→92 and textures 58→63 then flat (first-use uploads).
- Relay transition verified end to end (`art/p2b/rl_grid.png`).

### NEXT / gaps
1. Crowd density for vistas: impostor/instanced background walkers on the boulevard (cheap, no AI) to reach the ref's
   density without breaking D20; hold the near LOD further out on eye-level views.
2. Billboard content: animated holo content (scrolling ads, face that blinks) on the big boards; more shop signage.
3. Aurum's "milky" distance is materials + exposure, not haze (see above); try cooler/darker far façades behind a flag.
4. Brightline's east lower avenue is thin (trees + lamps only near the play area); the drop reads fine at gameplay pitch.
5. `?haze=old` A/B flag for Aaron on the S22 (the haze change affects both districts).
6. Gameplay agent wiring (see API above): relay interactable → `relayTransition`, nav/sites/enemy cleanup on
   `onDistrict`, Kettle `steam()` on phase changes, drop-pod in the frame swap, breakables → collateral/loot.
