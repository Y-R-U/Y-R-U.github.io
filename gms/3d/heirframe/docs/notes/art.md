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
