# Hub agent notes (hub = compound landing page + story map)

Owns: js/hub/*, js/map/*, tools/hub_test.html, assets/hub/*, assets/maps/*
Test: tools/hub_test.html?view=hub&level=1..4 (growth stage) [&q=low|med|high &unlock=a,b] | ?view=map&map=1..8 [&cleared=N &anim=1]
| ?view=map&select=1 (chapter list). `window.__hub {ready, stats, scene|map, lastSelect, lastLevel}`. Map view uses js/data maps (DEMO_MAPS fallback).
Scripts (scratchpad/hub): shot.mjs (CDP 9405 screenshot + eval), flux.mjs (mflux batch -> raw/<theme>_7.png), conv.sh (raw -> assets/maps/mN.jpg + _thumb).

## DONE
- js/hub: hub.js (entry for modules.js), hub_scene.js (createHubScene; camera framing + lens shift (setViewOffset) so sky/skyline show
  above the oblique compound; drift, one-finger pan w/ momentum + soft clamp; tap pick via boxes), compound.js (layout, baked ground
  canvas, platform slab, decor, 3-layer skyline with neon crowns + holo billboards, city plane below), buildings.js (7 features x 4 stages),
  kit.js (merge-per-material, locked material set), ambient.js (traffic, searchlights, beacons, steam, sparks, yard robots, dropship,
  light pools), labels.js (DOM labels + SVG leader lines, overlap relax), textures.js, features.js (STAGE_LEVELS, hintsFromFeatures).
- Planar mirror ground via battle's js/fx/reflection.js (layer 1 = features/decor/skyline/ambient; slab excluded or it kills the floor).
- Unlock hints come from js/data/maps.js FEATURE_UNLOCKS (dynamic import) unless `hints`/`features` passed. HQ sign = NIGHTSHIFT.
- js/map: story_map.js (createStoryMap + createMapSelect), themes.js (themes keyed by map id m1..m8; realm scifi|fantasy|rift),
  map_css.js (injected CSS + Cinzel link), demo_maps.js.
- Backdrops (Flux 9B 4bit, 2048x800, 6 steps, ~150-260 s each under load): m1 docks, m2 slums, m4 skyport, m5 lab, m6 forest;
  m3 league, m7 spirewar, m8 core: all 8 shipped (assets/maps/m1..m8.jpg ~300-570 KB + _thumb.jpg ~50-80 KB). Missing image ->
  procedural canvas fallback. Design's maps.js themes now match (m3 league, m7 spirewar, m8 core).
- Perf (M5, Flux idle): 60 fps at 412x915 dpr 1.75 all stages; stage 0: 193 calls / 22k tris, stage 3: 253 calls / 36k tris (incl. mirror
  pass), cpu ~2.5-3.5 ms. q=low: 114 calls, no mirror/bloom.

## NEXT / open
- Device check on the S22 (calls ~250 is the main risk; mirror could go to every other frame via R.skip if needed).
- Hub: buildings are still simple boxes; stage 0 reads sparse; city window texture a bit "confetti".

## API notes for ui
- createHubScene(engine, {companyLevel, unlocked:[ids], stage?, names?, subs?, badges?, hints?, features?(DATA.features), highlight?,
  container|overlay, margins?}) -> scene obj + on('select'|'locked', fn), setState({...same}), pick(x,y), stats().
  ids: story arena events squad workshop recruit hq. STAGE_LEVELS = [1,5,12,20].
- createStoryMap(container, {mapId, map, progress:{levelId:stars}, isOpen?(levelId), index?, showTitle=true, showBack=false, cta=true,
  animateUnlock?|justUnlocked?:levelId}) -> on('level'|'locked'|'back', fn), centerOn(id), setProgress(p,{animate}), state, dispose().
- createMapSelect(container, {maps, progress, isOpen?}) -> on('map', id).

## Requests
- ui: switch modules.js hub/map on (done per manager?). scr_map: pass showTitle:false or drop your own title row; cta:false if you keep
  your own sheet only. scr_hub: pass the real unlocked list.
- design: m3 theme 'league', m7 'spirewar', m8 'core' (sent by message).

---
# hub-2 (second-round hub agent)
Scripts now in scratchpad/hub2 (shot.mjs copied). Baseline shots: scratchpad/hub2/before_l1..4.png, before_game.png.
Baseline perf (M5, metal, 412x915 dpr1.75): 181/205/239/241 calls, 22k..36k tris, 60 fps.
## Plan
1. kit.js: collapse materials to metal/grit/win/glass/neon with vertex colours (≈4 calls per building).
2. skyline: world-space facade shader (calm floor-banded windows, distance AA) instead of noisy windowTex.
3. buildings.js rewrite: distinct silhouettes per brief; stage 0 = scrapyard outpost.
4. camera: compound fills the clear middle (in-game top bar ≈60 css px, dock+CONTINUE from ≈770 css px at 412x915).
5. motion polish; .vpm-back 44px; backdrop sharpen + grain.
## DONE (checkpoint 1)
- kit.js: palette keys -> materials metal/grit/win/glass/neon/facade/bay with baked vertex colours; Kit.panel/bands/edges/gable/sub.
- textures.js: calmer hullTex, interiorTex (4 lit panes per floor), bayTex (lit hangar interior), bladeTex (vertical NIGHTSHIFT), screenTex (arena VS).
- skyline: facade shader in kit.js (world-space floors/mullions/occupied floors, fwidth fade to average glow) + setback tiers; ads merged per texture.
- buildings.js rewritten (all 7 x 4 stages); compound.js: stage-dependent yard (container walls, salvage pile + crane + flickering SALVAGE sign, forklift, tarp prefab).
- ambient.js: robots instanced (2 calls), dropship via Kit, multi-emitter sparks, flickering free signs (fx.signs).
- camera: pitch 0.74, shift 0.08, tz -2 (opts.cam / hub_test ?pitch=&shift=&tz=&k=&fx= overrides; scene.debug).
## DONE (checkpoint 2)
- workshop sawtooth faces camera; ops = octagonal control tower (flared lit cab, cone dish); special-ops roof light strips;
  barracks stage 0 = tarp half pulled back, kneeling mech under a work lamp; festoon string lights + fire barrels (stage 0-1).
- lighting: hemi 0x8a7cc8/1.8, moon 1.6, warm front key 0xffa060/2.6 (warm facades vs cool roofs); metal metalness 0.3; locked dimming gentler.
- traffic = 5 skyway lanes (paired directions) + 10 loose loops. Mirror skips ground decals, pools, steam, sparks, robots.
- small fixes: .vpm-back 44x44; backdrops m1..m8 re-encoded from the raw PNGs at 2560x1006 lanczos + light unsharp (q4, 380-810 KB);
  film grain overlay .vpm-bg::after (svg feTurbulence, 9% overlay).
## DONE (checkpoint 3, final for hub-2)
- mirror.skip = 1 on the hub (refresh every other frame; camera only drifts). Draw calls alternate: stage 0 86/147, stage 3 120/212
  (avg ~116 / ~166). M5 metal, 412x915 dpr 1.75, with other agents on the GPU: 59 fps avg all stages, cpu ~3-4 ms.
- skyline: fewer/further flank towers, neon edge strips on ~70% of towers, windows brighter. HQ st0 anchor above the sign.
- workshop st0 mech is mustard + white work lamp. Ground textures disposed on rebuild.
- Final shots: scratchpad/hub2/after_l1..4.png, after390_l1..4.png, after_game412.png, after_game390.png (before_*.png = baseline).
## Building identities (local units; BSCALE 1.35)
- hq: st0 stacked portacabins + rooftop scaffold with flickering NIGHTSHIFT neon; st1+ podium + setback shaft, floor-banded lit
  windows, vertical NIGHTSHIFT blade sign; st2+ crown spire, rotating holo rings + logo.
- story (Operations): st0 container shack + awning + field holo table + dish; st1+ command block + octagonal control tower (flared
  lit cab), cone dish on top, terrace holo table; st2+ second dish + comms array.
- arena: st0 tyre ring + cage posts + dead screen; st1 pit + stands + light masts + VS screen; st2+ dome, eave light ring, orbit ring, VS screen over the gate.
- events (Special Ops): st0 rusted frame + tarp + VTOL under tarp; st1+ arched hangar, lit bay, VTOL on apron pad; st2+ rotors spin, VTOL hovers.
- workshop: st0 old mech in a scaffold, A-frame hoist, sparks; st1+ sawtooth shed (skylights face camera), outdoor gantry over a stripped mech; st2+ tower crane (jib swings).
- squad (Barracks): st0 tarp half off a frame, kneeling mech under a work lamp, container bunks; st1+ gabled hangar, recessed bays, open bays show a mech against the lit bay.
- recruit: st0 painted circle + cones + crashed pod; st1+ pad, landed drop pods, beacon mast with rotating head; st3 hovering holo rings.
## NEXT / open
- Device check on the S22 (CPU submit is the risk; q=med could drop the mirror).
- Stage 2 vs 3 differ modestly (taller HQ/crane, H pad, pylons); could add a second dropship / banners at stage 3.
- 390x844 stage 3: BARRACKS label sits over the recruit pad (labels relax, still readable).
- Backdrops not regenerated: mflux-queue caps at 2048 px (current 1792x704), so a regen gains ~14%; re-encode + grain instead.

---
# hub-3 (third-round hub agent)
Scripts: scratchpad/hub3 (shot.mjs, game.mjs <out> [w h] [companyLevel], perf.js = peak/min draw calls over 2.5 s,
count3.js = per-group draw-call breakdown, leak.js = rebuild stress). before_*.png / after_*.png there.
hub_test new params: `&squad=bulwark:epic:3,gunner,riot:rare` (model[:rarity[:rank]], `none` = no units), `&rift=1`, `&full=1`
(drop the 9:19.5 column, for landscape tests).
## DONE
- **Squad in the compound** (js/hub/squad.js): real `createUnit` models, quality 'low' (far LOD, no motes), scale 3.9, envMap
  handed in (hub has no scene.environment), `useProxy(MIRROR_ONLY_LAYER)` so each costs 1 dc in the mirror. Slot order: #1 parked
  in the barracks open bay (static mech stand-ins removed via `fx.liveBays` → `fx.bays`), #2 walks a yard route (advance anim,
  turns on the spot, idles at ends), #3+ second bay (stage 2+) / second walker / sentry posts. 3 units max below stage 2, 4 from 2.
  Contact shadow + glow pool in the unit's palette colour (2 instanced dc total). units.js is **dynamically imported**, so a broken
  model file can't take the hub down (D19); a model that throws falls back to gunner. Dispose-safe (guard if disposed before the
  import resolves). Leak test: 24 stage/squad rebuilds → geometries 75-77, textures 56, programs 45-46, stable.
- **Stage 3 flagship** (js/hub/flagship.js + compound/ambient): raised octagonal VIP pad (gold rings, 8 light posts, red carpet,
  rotating VIP decal, VIP holo sign) with a white-and-gold **VIP shuttle** on its own 48 s cycle (2nd dropship); dropship #1
  now alternates recruit pad / barracks roof H pad; 6 swaying company banners (1 merged shader dc: avenue to HQ + flanking the
  barracks parade ground); scrolling holo ticker ring around the HQ podium; arena crowd camera-flashes under the dome + two
  sweeping show beams. VTOL (all stages ≥1) is now light hull + hazard stripes + amber engine glow, ×1.25.
- **Labels**: barracks label hangs below-right of its anchor over its own roof (OFFSETS.squad [74, 52]) → no longer over the
  recruit pad at 390×844 on any stage. **Top-corner keep-out**: labels can't sit in the top 52 px below `margins.top` within
  130 px of either side (company badge left / login badge right). Override with `margins.corner = {w, h}`.
- **Fit by aspect**: camera dist = max(width fit, depth fit) (`cam.depthHalf` 54) instead of the portrait-only `min(a, 0.75)` cap.
  Portrait framing unchanged; landscape 915×412 shows the whole compound (labels crowd there; landscape layout is a later phase).
- **Rift** (js/hub/rift.js, `riftOpen`): lens-shaped violet tear with green churn, kept at a fixed upper-right direction from the
  camera (skybox-like, so it frames the same on any aspect), drawn over the far skyline. 1 dc.
- **Perf** (M5, metal, 412×915 dpr 1.75, 4 units + rift; peak = mirror frame): stage 0 144, 1 170, 2 184, 3 **200** (min 152),
  60 fps, cpu ~1.5-2 ms. Default squad (2 units) is ~12 lower. q=low stage 3: 129. Savings that paid for it: mirror only
  reflects building shells + big signs (dyn parts, holos, ship hulls, signs, cones excluded: ~-40), searchlights instanced
  (1 dc), holo-table bases merged into the static kit.
## API for ui (scr_hub)
- `createHubScene(engine, {..., squad?, riftOpen?})`; `setState({squad?, riftOpen?})` (squad swaps units without a rebuild).
  `squad: [{model, rarity, faction, rank}]` in formation order (first = parked hero). Omit → starters gunner + scrapper;
  `false` → none. Suggest: the formation's units, and `riftOpen: highest unlocked map >= 6`.
## NEXT / open
- ui-4: pass `squad` + `riftOpen` from the store (requested via manager).
- Landscape: framing fits, but label offsets/pitch are tuned for portrait; revisit with the landscape phase.
- Device check on the S22 still pending (stage 3 peak now 200 calls).

---
# hub-L (landscape hub/map agent, D24 / docs/LANDSCAPE.md package HUB-L)
Scripts: scratchpad/hubL (shot.mjs, camprobe.js portrait camera state, wprobe.js wide label/slab probe, mprobe.js map probe,
perf.js, rot.mjs live rotation). before_*/after_* = portrait regression pairs.
## Checkpoint 1
- DONE hub_scene.js: `wide = w/h >= 1` in resize(). Wide `fitWide()`: distance binary-searched so the slab corners + every
  feature anchor (+34 px label allowance) fit `[top, H-bottom]` x `[left, W-right]`, then a lens shift (setViewOffset x+y)
  centres it in the band. Pitch by aspect: 0.50 at >= 2:1 (phones), 0.66 at <= 1.45:1, linear between (0.66 at every
  aspect only reached 35% slab width at 915x412; 0.50 gives 45-56%). Slab width capped at `maxFrac` 0.55 of W so the
  flank skyline frames it on tablets/desktop. PAN.x 9 -> 14 in wide. Momentum dropped on a portrait<->landscape flip.
  `setMargins(m)` re-fits without rebuild. Portrait: camera state identical to 4 decimals (camprobe diff, 412/390 x 4 stages).
- DONE labels.js: OFFSETS_WIDE (side labels 64 px out from the anchor, bottom 18 px above it, side from anchor x vs band
  centre; HQ above), `setMargins({top,bottom,left,right,avoid:[rects],wide})`, avoid rects pushed out on the short axis,
  no corner keep-out in wide (unless `corner` passed). Portrait path unchanged.
- DONE story_map.js / map_css.js: `.wide` (+ `.short` < 400 px tall) on the root from the container aspect; sp
  clamp(96, VW*.12, 140); road band between head bottom+24 and CTA top-46; bg 1.25 VW, anchored 0.45; head slot
  `.vpm-slot` / `map.headSlot` (persistent across header re-renders; hidden in portrait); single-row 52 px CTA max 760;
  short nodes 46/51/67; chapter select grid minmax(340px) max 1180. `--vpm-head-r` CSS var lets ui reserve top-right room.
- DONE hub_test: `?wide=1` (full width + mock top bar / rail dock / CONTINUE, margins like scr_hub), `&chrome=0`,
  `?rot=SECONDS`, `&pitchWide= &nearCrop=` overrides.
- NEXT: verify in the real game with ui-L's scr_hub/scr_map.
## Checkpoint 2 (hub-L hand-back)
- Verified in the real game with ui-L (scr_hub calls setMargins with the rail dock + CTA avoid rect; scr_map mounts the chest
  bar in map.headSlot): 915x412, 844x340 hub + map OK, 412x915 unchanged.
- Map fix found in-game: design's maps carry l.x/l.y (portrait VH fractions, 0.5 +- 0.18); in wide l.y is remapped into the
  band. Band measured with offsetTop/offsetHeight (getBoundingClientRect picked up the screen's enter transform).
- Perf (M5 metal, dpr 2, 4 units + rift, peak = mirror frame): 412x915 st3 200; 915x412 / 844x390 / 1280x800 st3 201
  (min 155); 915x412 st0 144. 60 fps everywhere. Labels: no overlaps, none on rail/top bar/CTA, leaders <= 79 px.
- Slab width: 915x412 st3 45%, st0 56%; 915x360 45%; 844x390 45%; tablet/desktop capped at 55%.
- Rotation (CDP 412x915 <-> 915x412 x3): same scene object, no geometry growth, portrait dist/projection restored exactly.
- Test-script gotcha: Page.navigate to the same URL that only differs by #hash does not reload, so modules stay stale;
  navigate to about:blank first.
## Open
- ui-5 request Q3 (label tap target 44 px) not done: the label's clip-path also clips a pseudo-element hit area; needs a
  wrapper element. Labels are 36 px tall.
- Pitch deviates from the spec (0.66 -> 0.50 on phones) to reach the 45% width goal; Aaron may prefer less top-down.
- CTA (bottom-right) covers the near-right corner of the slab in landscape (allowed by spec; labels avoid it).

---
# hub-4 (round hub-4: label tap targets, chapter grid, quick qa items)
Scripts: scratchpad/hub4 (drv.mjs <prefix> <WxH,..> <route> [probeExpr] = dev save m2 open, lprobe.js = label visual/hit
rects, tap-edge elementFromPoint check, overlaps, chrome hits). before_*/after_* pairs.
## Checkpoint 1
- DONE labels.js (Q3/Q15): label = transparent positioned wrapper `.vp-hub-lab` + visual box `.b` (clip-path, border, bg,
  accent bar, pulse moved inside it). Wrapper `::after` band of `--hp` px above/below (`it.p` = ceil((44 - h)/2) = 4) makes the
  hit area 44 px; visual stays 36 px. Relax loop separates hit bands (not visual boxes); top/bottom/corner clamps and avoid
  rects include the band. Portrait rects identical before/after at 412x915 / 390x844; landscape moved <= 10 px. All 7 tap at
  the band edges, no hit-band overlaps, none on dock/CTA (844x340, 915x360, 915x412, 412x915, 390x844).
## Checkpoint 2 (hub-4 hand-back)
- Chapter select (ui-L request): no horizontal overflow at any tested size (scrollWidth == clientWidth at 844x340, 915x360,
  915x412, 412x915, 390x844); the real problem was a 2-col grid that scrolls vertically with no cue (~2.3 rows visible).
  createMapSelect now: `.short` (wide and < 400 px tall) -> 96 px cards (numeral 60, title 19/21); wide -> scroll-snap y
  proximity; sticky bottom fade + 44 px `MORE` chip (scrolls 60% of the view, hidden once the last card is in view, `.end`);
  opens scrolled to the in-progress chapter if it starts below the fold, with a 34 px peek of the row above (snap suspended
  until the first pointerdown/wheel so it doesn't eat the peek). Portrait: no visual change (pixel diff = image noise only).
- Story map wide CTA: DEPLOY 40 -> 44 px tall (was the only < 44 target in js/map at 844x340).
- hub_test.html boots, 7 labels, 0 errors. 0 console errors on /hub, /chapters, /map/2 at all sizes.
- Shots (scratchpad/hub4): before_/after_hub_<size>.png, before_/after_ch_<size>.png, m6_ch_844x340.png (auto-scroll),
  end_ch_844x340.png (MORE hidden at end), map2_844x340.png, hubtest_412.png.
## Open
- Pitch 0.50 on landscape phones (hub-L) still awaits Aaron's taste call.
- QA Q3 second half ("CONTINUE" vs "START" on a fresh save) is scr_hub (ui).
- ui: `.chest-mk` on the map head is 40x44 in landscape (ui-owned).

---
# hub-5 (round hub-5: QL3 map head insets, QL7 triage, QL13 spec)
Scripts/shots: scratchpad/hub5 (drv.mjs = hub-4 driver; before_/after_<size>.png, before_in_/after_in_ = `&insets=0,47,21,47`,
ch_/ch_in_ = chapter select). Backup of the old CSS: scratchpad/hub5/map_css.orig.js.
## Checkpoint 1 (hub-5 hand-back)
- QL3 DONE map_css.js: every `env(safe-area-inset-*)` -> `var(--sa*, env(safe-area-inset-*, 0px))`, so the story map + chapter
  select follow the app's `--sat/--sar/--sab/--sal` tokens (and `?insets=` emulation) like every other route. With insets 0,47,21,47:
  back 16 -> 63 px, stars/CLEARED right edge 899 -> 852 (915x412) / 828 -> 781 (844x340), rail inset both sides, CTA lifted 21 px and
  narrowed inside the safe area, chapter cards start at 61. Without insets: every probed rect identical before/after at 915x412,
  844x340, 412x915 (portrait unchanged). No h-scroll, zero console errors. Track end margins (90 / 120 px) already clear a 47 px notch.
- QL7 (Deploy floats mid-sheet with a bottom inset) is NOT hub: the level sheet `.lvl-sheet` / `#lvl-deploy` is built in
  js/ui/scr_map.js `showLevel()` and styled in css/landscape.css (~l.135). Stays with ui.
- QL13 DONE: docs/LANDSCAPE.md §9.2.4 step 4 now drags 1300 -> 900 -> 1300 (1000x900 = 1.11 sits in the 1.05-1.15 band).
- No other hub/map items open in QA-L.
## Open
- Pitch 0.50 on landscape phones (hub-L) still awaits Aaron's taste call.
