# battle agent notes (js/engine/*, js/battle/*, js/fx/*, tools/battle_test.html)

## Checkpoint (2026-10-19 #2)
- DONE
  - engine: js/engine/{engine,quality,post,env}.js. createEngine(canvas,{quality}) per contract + renderOnce/start/stop/dispose; scene object may add preRender(renderer) and look (post.set overrides). post = BloomLite + grade (ACES, vignette, pulse=zoom blur/chroma for Overdrive, flash). Governor drops dpr when slow.
  - D21 themeable arena: js/battle/arena.js composes a theme (js/battle/themes/scifi.js + scifi_backdrop.js) + shared board furniture (board.js: hex rings + raised pedestal plates + centre line), layout.js (BOARD, slotPos), camera.js (auto-fit framing to ref_02, lens shift, breathing, shake, push).
  - battle: js/battle/battle.js on the REAL sim (js/sim/battle.js); units from js/actors/units.js (placeholder_unit.js fallback if it fails to import). overlay.js = DOM numbers, HP bars, banners.
  - FX: js/fx/{vfx,toolkit,reflection,textures}.js + per-unit hooks js/fx/units/index.js registry (README.md). Manager informed.
  - tools/battle_test.html (?p=&e=&e2=&waves=&seed=&speed=&auto=0&hud=1&perf=1&q=). window.__battle {ready,state,stats(),battle,ended}.
  - Units are already scaled by role height (ROLE_H in battle.js, ~3 m displayed ≈ 11% of screen height) and all meshes enable REFLECT_LAYER.
- DONE (round 3): margin-aware camera fit (setMargins {top,bottom} CSS px; pitch searched so floor spans the gap, width fill 1.16);
  numbers: per-target rows, merge of rapid same-kind numbers, smaller non-crit font; floor: brick plates + normal map + etched hex,
  stronger mirror + streak blur + mirror-only ceiling light rig (MIRROR_ONLY_LAYER) for glossy light streaks; backdrop: 3 skyline
  depth bands + horizon mist + beacons, searchlights, 12 craft, bigger league screen; setPaused/forfeit.
- PERF BUG FIXED: lights were only on layers 0/3, so the mirror pass (layers 1/2) saw a different light set and every material
  switched programs twice a frame (getParameters/getProgram ~21% CPU). Lights now enableAll(). Rule: any light must be on all layers.
- PERF NUMBERS INVALID while mflux-queue is generating (GPU saturated; 2026-10-19 runs had min 16 ms / median 190 ms). Re-measure idle.
- IN PROGRESS: design requests (DESIGN.md §13): "UNIT — ABILITY" banner + 0.3 s plate flash, CC rings (stun yellow, shock/EMP blue-white,
  taunt red), boss scale, elite red-gold ring; then perf table when the GPU is idle.
- NEXT (open issues, honest look ~5/10 vs ref_02): units read smaller/darker than the ref's painterly mechs (scale is D23's
  call); crowd impostors read as a bar code up close; generic VFX per role are serviceable but plain (sculptors' js/fx/units/<id>.js
  hooks are the path to signature effects); melee front-liners overlap a little at the centre line when both lunge; S22 perf unmeasured;
  drones are in the toolkit but no generic unit uses them; OVERTIME state (if sim adds rules.overtime) has no battle-side treatment yet.
- Final shots: scratchpad battle/final_412.png, final_390.png, final_1280.png, low2.png (q=low, 2v1).

## Camera decision: two-layer render (Aaron feedback, option a)
- Chosen: **(a) two cameras**. The backdrop (sky, skyline, platforms, craft, stands + crowd, league screen tower, slogan screens, banners,
  high data panels) is only on BACKDROP_LAYER (3, js/battle/geo.js). engine post's DualRenderPass draws it with `rig.bgCamera`
  (near-level, eye 3 m, 10 m behind the near edge, lens-shifted), clears depth, then draws board + units + VFX with the elevated
  board camera (pitch ~57°, fov 58, auto-fit to ref_02 framing). Theme supplies `backdrop: {height, back, topAngle, seam}`;
  camera.js pins the backdrop horizon to where the board camera sees the back barrier top (`seam`), so the join hides behind it.
  Lights enable layer 3. The backdrop isn't in the planar mirror (the board-side barriers, posts and plates are).
- Why not (b): a level camera with lens shift turns the board edge-on (hexes squash, units side-on); the refs need both views.
- Backdrop parallax follows the breathing slightly (applyBg).
- Before/after: scratchpad battle/before_twocam_412.png, after_twocam_412.png.

## Readability round (manager list, done)
- Overdrive callout = compact plate under the top HUD (overlay.odPlate, slides in from the caster's side; top = margins.top + 8).
- Passive procs: only the first proc of each unit's passive per battle, as a tiny caption under its HP bar (overlay.barNote).
  Debuff names dropped (CC rings carry stun/shock/taunt). Numbers: max 3 live per target (overflow folds into the newest), life x0.78 at x2, x0.6 at x4.
- Overdrive look: no zoom blur any more; grade-pass spotlight (post.focus) keeps the caster sharp and desaturates/darkens the rest; flash 0.12.
- Front rim console along the near edge (lit lip + panel tiles + centre plaque). NB the band under it is the ui's 150 px portrait strip.
- Units idle in 3/4 view: yaw turned 0.45 rad toward the camera (attacks still face the target).
- robots' unit.useProxy(MIRROR_ONLY_LAYER) adopted (mirror + shadow via 1-draw proxy; `?proxy=0` to compare). Shadow camera sees layer 2.

## Perf (M5 metal, 412x915 mobile UA, dpr 1.5 unless noted; median sync render+readPixels ms incl. sim tick; GPU idle)
| config | ms | calls | tris | rAF |
|---|---|---|---|---|
| high (proxy) | 11.9 | 172 | 178k | 60 |
| high proxy=0 | 11.7 | 306 | 258k | 60 |
| high reflect=0 | 12.2 | 149 | 97k | 60* |
| med (dpr 1.25) | 16.6 | 172 | 154k | 52* |
| low (dpr 1) | 7.3 | 135 | 63k | 60 |
(* noisy: other agents share the GPU; a 2026-10-19 run while mflux was generating gave 40-190 ms medians, i.e. meaningless.)
dpr 2 costs the same as 1.5 on M5, so the frame is submit/CPU-bound, not fill-bound. The S22 is unmeasured: ask Aaron for `?perf=1` on tools/battle_test.html.

## Scratch
- driver: scratchpad battle/shot.mjs "<query>" out.png W H waitMs [evalExpr] (PORT 9404, MOBILE/DPR env).


## API additions (for ui)
- `setPaused(bool)` / `paused` getter: freezes sim, anims, VFX and numbers; engine keeps rendering. `state.paused`.
- `forfeit()`: ends as a defeat with reason 'forfeit' (banner WITHDRAWN, then 'end' fires with a synthesized result). Uses `sim.forfeit()` if the sim adds one.

## Requests
- sim: optional `forfeit()` on createBattle returning the end event(s) so the result (stats, mvp) comes from the sim; battle.js already calls it when present.

# battle-2 (second round)
## Checkpoint 1 (2026-10-19)
- DONE
  - Board scale (priority 1): BOARD.W 14.6 -> 11.6, colX [1.8, 3.95], laneZ [2.1,-3.0,-8.1], backShift -2.55 (even 6-row stagger),
    hexR 1.15, unitScale 1.6 -> 1.9. The camera auto-fit then sits closer and lower (pitch 64 -> ~50 deg), so units read ~1.5x bigger
    and more side-on. `?fov= &widthFill= &farY= ...` on battle_test overrides FRAME (opts.frame on createBattleScene).
  - Haze fix: the milky wash was the bloom (radius 0.55, threshold 0.9). Theme look now strength 0.5 / radius 0.16 / threshold 1.45.
    Floor plates brighter navy, floor metalness 0.75 -> 0.4, mirror strength 1.25, streak 0.04 (less vertical smear).
  - Shields (priority 2): battle no longer uses robots' unit.setShield / M.aura mesh (setShield(0) at spawn). Pooled fresnel bubbles
    (js/fx/vfx.js bubblePool, 1 draw for all, ellipsoid via `sy`): rim-only, faint hex lattice near the rim, ripple + rim flare on
    absorbed hits. setBubble(a, k, flare) in battle.js; permanent auras (halo) keep a faint one.
  - `battle._bounds()` test helper: per-unit screen rect (CSS px) + HP-bar y.
- NEXT: crowd impostors, OVERTIME, lunge offsets, deploy/victory moments, per-role VFX polish, in-game route, perf table.
## Checkpoint 2
- DONE since #1
  - colX widened again to [2.1, 4.15] (front-liners were touching at rest with the bigger units).
  - Crowd: new atlas (textures.js crowdTex 1024x256: varied silhouettes, hats/hoods, kids, 1-2 raised arms, light sticks + phone lights
    in G, flags/boards, clothing value in B) + shader (per-person hop, flickering coloured sticks, per-tier depth haze aInfo.w,
    stadium wave). theme.crowd.hype(k) on crits (0.25) / kills (0.6) / overtime (1); theme.crowd.wave() on Overdrive + victory.
  - OVERTIME: sim 'overtime' event -> red banner + crowd hype; per frame battle ramps otK from state.overtimeMult ->
    theme.setOvertime(k) (frame/wall strips, posts, holo barrier pulse red) + engine.post.tint() (new grade uTint) + overlay.overtime()
    plate at margins.top + 6 ("OVERTIME DMG x1.12 · HEALS 1/2"). state.overtime / state.overtimeMult are explicit. `&ot=secs` on
    battle_test starts overtime early.
  - OD callout plate centred (top = margins.top + 30), slides in from the caster's side (ui-2 request, relayed by the manager).
  - Melee lunge: stops on its own half (reach = |x| - 0.25 - 0.9 * radius * scale) and slides 0.75 m toward its own lane side.
  - Deploy drop-in: stagger 0.11 s per unit, plate lights 0.28 s before (fx.plateArm), beam drop, landing shockwave + dust
    (fx.land), HP bars hidden until landed (overlay.showBar). Victory: holo burst per winner (fx.holoBurst), confetti (fx.confetti),
    crowd wave, gold flash, gentle camera push; post-end VFX run at x1 speed; 'end' fires after 2.2 s (was 1.6).
  - Generic role flavour: mage cast rune (fx.rune), tank gun casings (fx.casings), melee slash crescent at impact (fx.slash).
- Perf (M5 metal, 412x915 dpr as tier, median sync ms): high 12.2 ms / 164 calls / 256k tris; med 15.1 / 164 / 222k; low 8.2 / 127 / 85k;
  high proxy=0 21.7 / 298 / 375k. Tris rose from 178k because the sculptors' models are heavier.
- NEXT: in-game route check, then more look rounds vs ref_02.
## Checkpoint 3 (battle-2 hand-back)
- DONE since #2: melee root lunge is now lateral only (sculpted anims already lunge ~1.4 m at board scale); camera widthFill 1.16 -> 1.1
  (back-column units were touching the screen edge at 390 px); OD plate no-wrap / max-width 94%; mirror-only light rig scaled to
  the narrower board and dimmed, mirror strength 0.95 / streak 0.018 (the vertical floor streaks and purple blocks were the rig).
- In-game route checked (?unlockall -> #/formation/m1_l1 -> battle -> results): no console errors; HUD margins are honoured.
- Final perf (M5 metal, idle GPU, median sync ms): high 7.7 ms / 164 calls / 261k tris; med 8.8 / 164 / 225k; low 3.0 / 127 / 85k. All at 60 rAF.
- Shots: scratchpad battle2/before_412.png, after_412.png, after_390.png, after_1280.png, before_after_ref.png, ot.png (overtime),
  win500.png / win1300.png (victory), dep.png (drop-in), g_b0..2.png (in-game).
- Honest look vs ref_02: ~6/10 (was ~5). Remaining gaps: the camera is still steeper (~50 deg) than the ref's ~40-45 deg, so units read
  from above; mid-fight clutter (numbers + impact rings) near the top rows; sculpted models are busier and less silhouetted than
  the ref's painted mechs; the near floor band under the console is plain.
- Requests
  - robots: battle no longer uses unit.setShield / M.aura (pooled bubbles in js/fx/vfx.js instead). The shieldMat look in the gallery
    still hides the unit (edge term over the whole shell): consider the same rim-only treatment, or drop it.
  - sculptors (via robots / MODEL_GUIDE): melee attack anims should keep their forward lunge at <= ~0.4 model m. Board scale is 1.9 now, and a
    0.75 m lunge carries a front-liner over the centre line.
  - manager: D23 constant is now 1.9 (+ BOARD.W 11.6). Nothing outside js/battle reads BOARD.

# battle-3 (third round: full-width board + lower camera, ref_02)
## Checkpoint 1
- DONE
  - Board/camera: BOARD W 11.6 -> 14, zNear 4.6 -> 5, zFar -14.2 -> -22 (deeper), laneZ [1.5,-5.5,-12.5], colX [2.3,4.9],
    backShift -3.5 (even stagger), hexR 1.2. FRAME fov 58 -> 40. The fit then solves pitch ~42 deg (was ~53), camera dist ~50 m.
    The pitch depends on the board's L/W ratio: a deeper board means a lower camera at the same screen span. Breathing and shake scale by dist/27.
    `configureBoard()` in layout.js + battle_test `?bW=&bzFar=&blaneZ=a,b,c&bcolX=&bbackShift=&bunitScale=` for experiments.
  - Floor (textures.js floorTextures): the brick plates are gone. Every lattice hex is one blue-grey panel (hexR 1.75), with dark seam
    grooves plus a lit bevel, a crisp thin emissive hex grid, and grit. Floor metalness 0.4 -> 0.2, envMapIntensity 0.9.
  - Side rails continuous + lit (inner and outer bezel strip); inner floor edge glow line wider.
  - Clutter: one live number per target (a new hit replaces it; a fresh crit is never replaced by a plain hit), fonts 12 px (crit 16).
    fx.impact ring r1 0.9 -> 0.55 and life 0.25 -> 0.16; shieldHit ring smaller. HP bars 36x4 px, 3 px segments, 11 px role icon.
  - Side buttons: manager moved `.hud-right` to top 25% (ref_02 position) after my proposal; battle_test #ctl matches.
  - Shadow camera widened to the new board (+-12 x, +-17, far 70).
- NEXT: near-lane footprint clamp, 390 + in-game check, clearance numbers, perf, before/after/ref.
## Checkpoint 2
- DONE since #1: the slots now sit on the floor's hex lattice (BOARD.gridR 1.533, lattice column 0 on the centre line, front = column 1,
  back = column 2, lanes 3 lattice rows apart = 7.97 m, backShift -3.98, zFar -24). colX [2.3, 4.5]: the back column is 0.1 m inside its
  lattice column, for HUD clearance. unitScale 1.9 -> 2.0, widthFill 1.1 -> 1.15. Pitch is now 39.7 deg at 390x844 and 41.9 deg at 412x915 (fit).
  Empty slot rings are dimmer (base 0.4 -> 0.28). In spawn(), near-lane units whose bbox hangs over zNear - 0.3 are nudged back (max 1.5 m).
- Side-button clearance (rail = `.hud-right` at top 25%, x >= W-56), measured on idle units with _bounds() bboxes:
  412x915: gap 3 px (default squad) / 6 px (all-wide squad); 390x844: 2 px / 4 px. No unit overlaps the rail band.
## Checkpoint 3 (battle-3 hand-back)
- DONE since #2
  - Floor reflection strength 0.95 -> 0.7, base 0.4 -> 0.3: the lower camera raises the Fresnel term, and the floor had gone milky.
  - Plate material roughness 0.32 -> 0.5. The orange/gold "discs" on player plates were sculptors' muzzle `fx.light`s, which made a
    hot spot on glossy metal. vfx.flash now ignores a non-finite pos: one pooled light was sitting at NaN, which some caller passes.
  - Near console: the front face is visible from the low camera, so it now has light bars, a lower step and a step strip (+0 draw calls, merged).
  - Star goals (sim-2): createBattleScene accepts opts.goals and passes it to createBattle. scr_battle.js still has to pass
    `goals: B.goals` (requested from manager; not my file).
- In-game route (?unlockall -> #/formation/m1_l1 -> battle) checked at 412 and 390: no console errors, real HUD margins and side buttons clear.
- Perf (M5 metal, 412x915; GPU contended by ~20 CDP/Chrome procs, so ms are noisy; A/B against the old layout via URL overrides was equal):
  | config | median ms | calls | tris | rAF |
  |---|---|---|---|---|
  | high | 13.2 | 162 | 282k | 58-60 |
  | med (dpr 1.25) | 13.0 | 162 | 242k | 60 |
  | low (dpr 1) | 5.5 | 125 | 90k | 60 |
  | high proxy=0 | 14.2 | 296 | 414k | 60 |
- Shots (scratchpad battle3/): before_after_ref.png (battle-2 | battle-3 | ref), after_412/390/1280.png, g_b1/g_b2.png (in-game),
  w412.png (all-wide squad), t6s.png (full vs sparse squad on the aligned lattice).
- Honest look vs ref_02: ~6.5/10 (was ~6). Better: board spans the width, lower camera (39.7-41.9 deg), units stand on separate hexes with floor
  between them, lighter floor with a crisp lattice that the plates sit on, one number per target, compact bars.
  Remaining: floor still has a blue haze/glow in the middle (bloom of the emissive grid + reflections) where the ref is crisp slate;
  the near console mostly sits under the HUD gradient; sculpted units read darker/busier than the ref's painted mechs; mid-fight
  crits from several targets still stack up (one each, but 5-6 at once); deep back rows sit close to the back barrier.
- Requests
  - ui/manager: js/ui/scr_battle.js:47 add `goals: B.goals` to createBattleScene options.
  - sculptors: some fx.light call passes a NaN position (now ignored); muzzle lights at plate height make hot spots, so keep them at muzzle height.
  - manager: D23 board scale is now 2.0 (BOARD.unitScale) and the board is 14 x 29 m.

# battle-4 (fourth round: sculptor hooks, audio context, look fixes)
## Checkpoint 1
- DONE: shot/heal/shield/shieldBreak/buff/deploy hooks (battle.js + js/fx/README.md), noDrop (= robots' `M.noDrop` / `unit.noDrop`, kit side already in),
  unit.extraDrawCalls + battle.unitStats(), audio context (fire_/hit/heal/death/deploy x, overdrive_fire, shield_break), battle_test `&charge=`,
  WARDEN mirrorSide, fx.darkCore + fx.materialize, bloom per-mip factors (post.set factors) + floor tint, zFar -26.66, farY 0.25, widthFill 1.06,
  camera nearRim (theme console lip kept above the bottom HUD).
- IN PROGRESS: screenshots (412/390/1280, in-game), OD plate vs league screen, perf.
## Checkpoint 2 (battle-4 hand-back)
- Hooks (js/fx/README.md documents all): `shot(ctx)` on every fire/cast/impact frame of the attack and overdrive anims (`ctx.shot.index/typeIndex/
  type/anim/phase/socket`); `heal`, `shield`, `shieldBreak`, `buff`, `deploy` hooks; flag `noDrop` (robots' kit already honours `M.noDrop`,
  exposed as `unit.noDrop`; battle reads `unit.def.noDrop || unit.noDrop`, skips the beam/drop/shake and plays `fx.materialize`);
  `unit.extraDrawCalls` (number or fn) summed by `battle.unitStats()` (battle_test perf readout shows it). `unit.mirrorSide === side` ->
  `unit.setMirror(true)` (WARDEN). New toolkit fx: `materialize`, `darkCore` (normal-blended dark core, sculptor-8's request).
  Verified live: BARB attack shot index 0..2, GUNNER 0..7, tarantula/gunner OD 0..6; heal/shield/buff hooks fire.
  Generic units (no file) now get an extra tracer per later fire frame of a burst.
- Audio: `fire_<delivery>` {ability, x} (also per extra burst shot), hit/hit_crit {x, melee, absorbed, amount} (absorbed-only hits too),
  heal/death/deploy {x}, `overdrive` {x, ability}, `overdrive_fire` on the release frame, `shield_break` {x} on `e.broken`.
- battle_test `&charge=` (manager / sculptor-7): `1` = all, `p2:1` / `e0:0.95` / `2:1` = one slot, comma-mixable.
- Look:
  - Floor haze = the two widest bloom mips (UnrealBloom default factors 1,.8,.6,.4,.2) summing every strip/plate/grid line into a milky wash.
    post.set now takes `factors`; scifi look = strength 0.55 / radius 0.1 / threshold 1.6 / factors [1,.55,.22,.06,0]. Floor albedo tinted
    (0.72,0.8,0.95). Other scenes get the default factors back (post.set resets).
  - Far rows vs back barrier: BOARD.zFar -24 -> -26.66 (one lattice row more behind the back row), FRAME.farY 0.30 -> 0.25. Pitch ~39 deg
    at 412x915 with the battle_test margins (was 37.6).
  - Near console: camera fit now keeps the theme's `nearRim` (console top lip, dz 1.35, y 0.66) above the bottom HUD instead of the bare floor
    edge, so the console sits between the floor and the portrait strip (checked in-game).
  - Side buttons: widthFill 1.15 -> 1.06 and colX back 4.5 -> 4.3. Sampled every 60 ms over 15 s of fighting (wide attack anims included):
    412x915 clear by 5 px (BARB worst), 390x844 by 3-4 px (was overlapping by 2 px mid-attack). Units ~6% smaller on screen (avg 13.4% of H).
  - OD callout: overlay.setPlateY(): centred in the dark deck band between the back barrier and the floor's far edge (projected each
    resize/setMargins), never above margins.top + 4. Checked in-game with the real HUD: clear of the league screen and the HUD.
- Perf (M5 metal, 412x915, median sync ms, GPU shared): high 5.5 ms / 162 calls / 282k tris; med 6.8 / 164 / 242k; low 8.8* / 126 / 89k
  (*contention); high mid-Overdrive (charge=1) 16.5 ms / 162 calls. All 60 rAF. Budget <= 180 calls holds.
- Shots (scratchpad battle4/): before_after_ref.png, after_412/390/1280.png, gbefore_b2.png vs gafter_b2.png (in-game), god_c.png (in-game OD plate),
  od_a.png (battle_test OD plate), bl_sheet.png (old vs new bloom).
- Honest look vs ref_02: ~6.5-7/10. Floor crisper, board framed with room behind the far row, console visible above the strip.
  Remaining: the floor is still bluer and brighter than the ref's slate (the planar mirror carries shield bubbles + posts); the console
  reads dark, not lit like the ref's; the band under the console (above the strip) is empty in battle_test; side-button clearance is only 3-5 px.
- Requests
  - manager -> robots: flag name confirmed `noDrop` (battle reads both `unit.def.noDrop` and `unit.noDrop`); mirrorSide wired.
  - robots / sculptors: wide attack anims (BARB) are what reach the side-button rail; keep sideways extents of attacks within ~0.5 model m.
  - sculptors: `shot(ctx)` replaces `fx.after(i * GAP)` burst guesses; `heal(ctx)` for PATCH/medics; `shield(ctx)` for AEGIS.
  - rarity plate trim/pips (robots' proposal using unit.rarityColor): not done this round; good next battle task.

# battle-5 (fifth round: boss footprints, rarity plates, fx.dim, Ghost Net, look)
## Checkpoint 1
- DONE
  - Boss footprints (battle.js `fitBossFootprint`): boss scale hint capped at 1.6 (BOSS_SCALE_MAX); every boss, and any front-column
    unit whose idle pose (union of 5 idle samples, precise bbox, weapons included) reaches over the line, is stepped back from its slot
    and, if still too wide, shrunk so the box spans [centre line (+0.35 m for regular units), x = 6.2]. The node/plate moves and grows
    with it (board.setPlace(side, slot, x, z, k), k = s / unitScale clamped 1..1.45; reset when the slot clears).
    Result (idle inner edge, m from the line, before -> after): DREADNOUGHT -3.41 -> +0.04 (scale 3.8 -> 2.28), REDLINE -2.33 -> +0.07
    (2.7, x 4.21), BIG RUSTY -0.91 -> -0.04, CORONA -2.02 -> 0, STORMCROW -1.91 -> +0.02, CITADEL/JUGGERNAUT/RIOT as regular front
    units 0.04/0.11/0.02 -> 0.31/0.39/0.37.
  - Rarity cue (board.js ring kind 4, same InstancedMesh, +0 draw calls): 1..4 diamond pips on the near edge of the node (steel/blue/
    violet/gold = RARITY_COLORS) + a trim hex outside the faction ring for rare+. `arena.setRarity(side, slot, ri, color)`; layout.js
    exports RARITY_INDEX / RARITY_COLORS (mirror of js/actors/materials.js). battle uses unit.rarityColor when the kit provides it.
  - MERIDIAN barrel (item 6): battle-side. Back-column units with a long forward reach (> 2.6 m at board scale) turn 0.18 rad toward
    the camera instead of 0.45, so the barrel runs across the board above the front unit instead of into it.
- IN PROGRESS: fx.dim, Ghost Net stealth shimmer, look (floor slate / console), in-game + perf.
## Checkpoint 2
- DONE since #1
  - `fx.dim(k, dur)` (toolkit -> battle hook -> engine `post.dim(k)`, grade uniform uDim): scene dims to a cold grey ~30% before bloom is
    added, so HDR beams/flashes cut through. Envelope in battle time. Reset on dispose. Manager told (for WIDOWMAKER Last Light).
  - Ghost Net / stealth (new js/fx/stealth.js): any unit with a `stealth` status (sim flag) gets every material slot swapped for one additive
    fresnel heat-haze shader (faint fill, rim, scan bands, slow glint), the mirror/shadow proxy hidden, sparks + `cloak`/`decloak` sfx on
    enter/exit. Same draw calls. Skipped for models with their own cloak (`unit.specterCloak`).
  - fx.darkCore bug (sculptor-13): it was a soft kind-0 glow fading linearly from spawn; bloom from the bright floor washed it out. Now particle
    kind 5 (solid disc, soft edge) holding full alpha for 60% of life + smoke skirt; particles got `hold`. Verified (scratch battle5/dc11.png).
  - `fx.lean(view|id, x, z, dur)`: battle-owned tilt via root.quaternion (world-axis radians, eased). The quaternion write leaks into
    rotation.x/z, so the root rotation is reset to (0, yaw, 0) each frame while leaning.
  - README: sizes are world metres, soft glow = middle half of the quad, flames need 1.5-3; dim / lean / darkCore / hold documented.
- NEXT: look (floor slate vs ref, console lit), in-game route, perf, final shots.
## Checkpoint 3 (battle-5 hand-back)
- DONE since #2
  - Look: floor albedo tint (0.72,0.8,0.95) -> (1.28,1.12,0.9) and grid emissive x0.85. Probes showed the blue came from the floor's albedo
    under the cool lights, NOT the mirror (reflection off / holo off / env off each moved the average < 4/255). Measured floor average
    (412x915, same frame): before 45,68,128 -> after 50,66,116; ref_02 63,78,119. It reads as slate now, still a little darker than the ref.
  - Console: own blue-steel material (lower metalness, faint emissive) instead of the dark frame metal, glowing inset tiles (tileMat, +1 draw
    call), and a thicker lit top edge. It now reads lit, not black.
- Perf (M5 metal, 412x915, median sync ms, GPU shared): high 12.4 ms / 165 calls / 282k tris; med 4.9 / 163 / 242k; low 4.6 / 127 / 89k;
  high charge=1 10.4 / 163; raid + 2 cloaked WIDOWMAKERs 9.5 / 118. 60 rAF throughout. Within the 180-call budget.
- In-game: ?unlockall -> #/formation/m1_l1 -> battle runs with no console errors (gm0_b1/b2.png). The boss levels (m1_l12, m2_l14) and the raid
  (event/weekly_raid/t4) would not start from formation in my drive script: ENGAGE did nothing and showed no toast, probably because
  they are locked even under ?unlockall. So the bosses were verified in battle_test, which goes through the same createBattleScene.
- Shots (scratchpad battle5/): bosses_before.png / bosses_after.png, bosses_before_after.png, red2.png (REDLINE frenzy), rar4_crop*.png
  (rarity pips), mer1_crop vs mer2_crop (MERIDIAN), dim_sheet.png, st2_crop.png (Ghost Net), dc11c.png (darkCore), before_after_ref.png,
  after_412/390/1280.png.
- Honest look vs ref_02: ~7/10. Remaining gaps: the floor still lacks the ref's soft light pools and gradient, and its lattice lines are
  the brightest thing on it; units are darker and busier than the painted mechs.
- Open issues
  - REDLINE frenzy (whirlwind): the chainblade still sweeps over the centre line and toward the right edge during the spin. The idle body
    is clear and the side buttons stayed clear in sampled frames.
  - DREADNOUGHT now fits at scale 2.28 (it was 3.8), which makes it only a bit larger than a regular tank. A bigger raid boss would need a
    longer anim-neutral footprint or a wider board.
  - Footprint fit is computed once at spawn from idle poses; attack anims can still reach over (melee is expected to).
  - PALADIN reads pale or translucent at times while it has `overclock` (no bubble, no stealth). It is probably model or sculptor side;
    unconfirmed.
- Requests
  - robots / sculptors: MERIDIAN hovers ~1 m above its plate (the plate reads as empty under it); its barrel fix is battle-side (0.18 rad turn).
  - MONOLITH sculptor: replace `body.rotation` writes (js/fx/units/monolith.js:34) with `fx.lean(t, x, z, dur)`.
  - WIDOWMAKER sculptor: Last Light can use `fx.dim(0.85, 1.2)` instead of the dark screenFlash.
  - SPECTER: the battle skips its generic stealth shimmer when `unit.specterCloak` exists (keep that method name).
  - audio: new sfx hooks `cloak` / `decloak` {x}.

# battle-6 (sixth round: fantasy arena theme, D21)
## Checkpoint 1
- DONE
  - js/battle/themes/fantasy.js + fantasy_backdrop.js (ruins arena, ref_fantasy_01) registered in arena.js THEMES; aliases forest/verdance/rift/ruins.
    Theme pick in battle.js: opts.theme | opts.arena | opts.realm | realmFromWaves (majority of enemies realm 'fantasy') | scifi.
    ui already passes `theme: level.realm || map.realm`, so m6 levels get the ruins with no ui change.
  - Textures: new js/fx/textures_fantasy.js (voronoi flagstone + cracks + moss joints, stone block, pedestal top, foliage atlas
    (dilated DataTexture: no dark alpha fringes), tree-line silhouettes). Env: engine/env.js buildForestEnv (theme.environment / envIntensity).
  - board.js options: plate.tint(color,out) (painted stone), ringShape 'oct', ringK {floor, top}, pipFace {y,z,s} (rarity pips as gems
    on the pedestal's front face). Plate y no longer scaled (top = plateH exactly).
  - Faction colours: order/horde/wild in layout FACTION_COLORS (ROSTER.md hex) + battle FCOL (palette.faction for sculptors' FX).
  - battle_test: &theme= / &realm=; with neither it loads data so the theme is derived from the enemy units.
- IN PROGRESS: look rounds vs ref, then REDLINE whirlwind clamp, PALADIN overclock, MERIDIAN hover shadow, cloak sfx check, perf.
- Gotcha: onBeforeCompile sees `#include <normal_fragment_begin>` unexpanded; patch THREE.ShaderChunk text, not the expanded string.
## Checkpoint 2 (battle-6 hand-back)
- DONE since #1
  - Look rounds vs ref_fantasy_01 (4): darker grey-brown flagstone (voronoi cell 1.1 m, ~0.9 cracks/m^2, dark soil/moss joints, lit centre pool,
    darker wild margin), olive moss (world-space `mossy()` shader on all stone), dark ivy/grass/fern cards (dilated atlas; double-sided
    cards keep their normal: patch `#include <normal_fragment_begin>` via THREE.ShaderChunk), canopy leaf cards over dark cores, three fogged
    tree-line bands, ruined towers + arch, god rays, ground mist, fireflies (board + backdrop), faint violet Rift tear with hex circuitry
    top-centre. Warm key from front-left, green-gold back light, cool fill, forest PMREM; grade vignette 0.75 / contrast 1.16 / sat 0.98.
    Pedestals: octagonal stone (0.5 m), painted per faction via plate.tint (hue kept, sat <= 0.85, L 0.36), faint octagon rune on top,
    rarity pips as gems on the front face. Flagstone canvas (~190 ms on M5 at high) is cached per module.
  - theme.crowd -> backdrop.stir(k): the Rift and fireflies flare on crits / kills / Overdrive / victory. setOvertime -> fireflies go ember.
  - REDLINE whirlwind (battle-side): `overdriveReach()` samples each front/boss unit's overdrive anim at spawn (16 precise bboxes, before onEvent
    is hooked); if it reaches past (line - 0.3 m) by <= 2.2 m, the root steps outward for the anim (`a.odShift`). REDLINE: push 1.52 m; inner
    blade edge during the spin stayed >= +0.3 m on its side in a sampled run (it crossed the line before, battle-5 open issue). Overshoots > 2.2 m are deliberate lunge strikes (PALADIN's
    Judgement Arc ~4 m) and are left alone.
  - PALADIN pale with overclock: battle-side. Oath of Steel grants the 20% shield together with overclock; under focus fire every absorbed hit
    flared the whole bubble (ripple lattice + fill) and washed the gold model out. setBubble now flares at most every 0.33 s (0.55 strength
    unless 1.5 s have passed) and the bubble's ripple/fill fade toward the shell centre. Verified (scratch pal_after_c.png): solid gold.
  - MERIDIAN hover: battle-side `makeHoverPad()` for any unit whose idle bbox floats > 0.45 m above the plate: soft contact shadow + faint
    faction-coloured lift beam with rising bands (2 draws per hovering unit, follows lunges, hidden when dead).
  - `debuff(ctx)` hook (sculptor-17 via manager): fires on sim `debuff` events (ctx.debuff, ctx.status, src = applier, target); replaces
    the generic debuffAura. README updated.
  - Audio: `cloak`/`decloak` can't 404: sfx are synthesized (sfx.js) and unknown names only console.warn('[audio] unknown sfx') with no fetch.
- In-game: ?dev&unlockall + patched dev save -> #/formation/m6_l1 -> battle runs on the ruins (theme = level.realm from scr_formation),
  real HUD margins honoured, no console errors (scratch g6_b1.png).
- Perf (M5 metal, 412x915, 12 units mid-fight; cpu = engine stat median): scifi high 163 calls / 2.5 ms; fantasy high 114 calls / 2.2 ms
  (no planar mirror); fantasy med 114; fantasy low 99; fantasy high charge=1 114. 60 fps. Well under the 180-call budget.
- Shots (scratch battle6/): before_after_ref.png (before = scifi fallback | after | ref), after_412/390/1280.png, f8_412.png (final look),
  f7_390.png (mid-fight), g6_b1.png (in-game m6), mer_c.png (MERIDIAN pad), pal_after_c.png.
- Honest look vs ref_fantasy_01: ~6/10. Mood, palette and plates are close; units read clearly. Gaps: stones still read as crazy paving
  (smaller, rounder) where the ref has big cracked slabs; the near ledge is a plain mossy band; the canopy cores are visibly low-poly at the
  very top; the Rift is faint; no hanging vines/roots on the ruins.
- Requests
  - audio: synth `cloak` / `decloak` (and BATTLE table entries) - today they only warn. Optional fantasy arena ambience (birds/wind) hook
    on theme id 'fantasy' if wanted; battle can emit `ambience` {theme} at start.
  - robots / MERIDIAN sculptor: the hover is now tied visually by the battle pad; a model-side thruster glow pointing down would match it.
  - sculptors: `debuff(ctx)` exists; ctx.palette.faction is now blue/red/green for order/horde/wild.
  - manager: arena.js imports themes/fantasy.js; new file js/fx/textures_fantasy.js. No new vendored addons.

# battle-7 (seventh round: fantasy arena polish, tube FX, dark-core bloom mask, REDLINE, audio)
## Checkpoint 1
- DONE
  - REDLINE (battle.js "reach guard"): the 0.3-0.56 m crossings were chainblade attack *lunges* that ran while odShift was still set (the old
    block skipped when `a.lunge`), plus the OD envelope fading before the spin's blend back to idle. Now the OD push holds to dur + 0.3 s and
    fades over 0.35 s, and while an overdrive or lunge plays, front-column units (slot < 3) and any unit with an odFit get a live bbox check
    each frame: if the inner edge is < 0.15 m from the line, `a.reach` steps the root outward by the shortfall (cap 2.5 m, decays 2.5 m/s after).
    4 seeds (scratch battle7/red.js): worst inner edge +0.37 m on its own side (was -0.56).
  - setSpeed accepts 8 (dev panel, ui-4).
  - Dark cores / bloom mask: new `vfx.dark` pool (kind-5 discs; no draw call while empty) + `markNoBloom(mat)` (vfx.js) / `fx.noBloom(mat|obj)`:
    colour blends as before, scene alpha becomes dst.a * (1 - src.a). The grade pass gates bloom, the screen flash and the lift by
    smoothstep(0.02, 0.45, alpha). fx.darkCore uses the dark pool. Measured (scratch battle7/dc.png): old core 17,3,65 -> new 0.6,1.2,4.4.
    VECTOR PRIME lens billboard with fx.noBloom applied at runtime: 0,5,32 -> 0,0,0, photon ring still glows (lens_ab.png).
    Mask debug view: `engine.post.grade.uniforms.uMaskDbg.value = 1` (white = bloom allowed). Fantasy + scifi scenes are fully white (no false masking).
  - Audio: `cloak` / `decloak` synthesized (sfx.js) + BATTLE entries (support group). `forestAmbience()` in sfx.js (wind + leaf rustles +
    sparse birds, all synth), started by battle `audio.sfx('ambience', {theme})` on start(), stopped on dispose / victory / defeat / leaving #/battle.
- NEXT: fantasy look (floor slabs, near ledge, canopies, rift, vines), fx.tube, unit size, shots, perf.
- Request (sculptor-16, SINGULARITY): call `fx.noBloom(material)` on the lens billboard material (model) and on the world-space blackHole()
  ShaderMaterial in js/fx/units/singularity.js. Battle can't do it from outside without guessing at materials.
## Checkpoint 2
- DONE since #1
  - `fx.tube(path, o)` / `fx.roots(from, to, o)` / `fx.entangle(pos, o)` (js/fx/vfx.js tubePool + js/fx/tube.js builder): lit MeshStandard tubes,
    one draw for all (hidden when none live), geometry written once per spawn, growth / tip taper / tip glow / wither in the vertex shader.
  - Floor (textures_fantasy.js flagstoneTextures): big flat slabs (voronoi on a low-jitter 2.05 m lattice, warped edges, true bisector distance
    so joints keep an even width), narrow dark soil joints with patchy moss/grass, chipped worn edges, grain + stains + lichen, and a fine
    sub-voronoi crack network inside each slab (~2/3 of edges), plus a few long cracks across slabs.
  - Near ledge: uneven ruined blocks (tall broken stacks, capping stones, gaps with big ferns, a back row, fallen stones), roots sweeping
    sideways over the block tops (a root running toward the camera reads as a sliver; the camera sees the ledge from the HUD side).
  - Vines: hanging strands + draped loops on the inner faces of every wall top > 1.1 m and the tall pillars, ivy cards along them (foliage
    instancing), roots from wall feet onto the margins. Vines + roots = 1 merged draw (vertex colours, mossy shader).
  - Canopies: coherent lumpy lobes on detail-3 spheres + world-space leaf mottling shader + 2x leaf cards. Rift: moved from under the top
    HUD into the visible sky gap (~85 m out, in front of the forest bands), dark void core + cyan circuitry + hot magenta lip + violet halo.
  - Units vs side buttons: wolves already overlapped the rail (bbox) at 0.45 rad. Quadrupeds (def.body 'quadruped') now turn 0.85 rad to the
    camera (as in the ref) and step 0.35 m inward in the back column: idle gap 2-19 px. A fantasy-realm scale hook exists (theme.unitScale,
    battle_test `&fk=`), left at 1: at 1.12 the minotaur and wolves reach the rail. Bigger units need a layout change (see Requests).
- NEXT: perf, scifi regression shot, final before/after/ref, in-game m6_l16 via ?dev=1.
## Checkpoint 3 (battle-7 hand-back)
- DONE since #2
  - PERF FIX: the reach guard first used precise bboxes (skins every vertex: ~13 ms per skinned unit under load, so CPU went 2.5 -> 25-37 ms).
    It now uses `fastBox` (battle.js): rigid parts = cached geometry box x matrixWorld, skinned meshes = ~400 strided skinned vertices (bones
    alone missed REDLINE's chainblade by 1.85 m), every 2nd frame, only while a front/odFit unit lunges or overdrives. 12 units: 0.9-2.9 ms
    for all; in practice ~0.1-0.3 ms. REDLINE re-verified: worst -0.02 m at the first OD frame (push ramping in), was -0.56.
  - README: dark pool / `fx.noBloom`, tubes (`fx.tube`, `fx.roots`, `fx.entangle`), tube.js builder, pool budgets.
  - Audio verified offline: cloak 0.5 s peak 0.14, decloak 0.45 s peak 0.13, forest bed peak 0.11 / rms 0.024 (quiet under the music).
- Perf (M5 metal, 412x915, 12 units mid-fight, engine cpu median; load avg ~26-58 from other agents):
  | config | cpu ms | calls | tris | fps |
  |---|---|---|---|---|
  | fantasy high | 4.2-4.5 | 115 | 234k | 60 |
  | fantasy med (dpr 1.25) | 5.6 | 115 | 206k | 60 |
  | fantasy low (dpr 1) | 3.9 | 99 | 117k | 60 |
  | fantasy high charge=1 | 4.4 | 115 | 234k | 60 |
  | scifi high | 5.1 | 166 | 300k | 60 |
  | scifi high charge=1 | 5.2 | 166 | 299k | 60 |
  Fantasy +1 call (vines/roots); dark + tube pools draw only while live. All under the 180-call budget.
- Shots (scratch battle7/): before_after_ref.png (battle-6 | battle-7 | ref), after_412/390/1280.png, scifi_land.png (scifi regression +
  915x412 landscape: fit works, the margins leave a small board), g7_b1/b2.png (in game, ?dev=1&fresh&god=1&onehit=1&level=m6_l16, no console
  errors), tube_c.png (roots + entangles), dc.png (darkCore old vs new), lens_ab.png (VECTOR PRIME lens with noBloom), floor_cmp.png.
- Honest look vs ref_fantasy_01: ~6.5/10 (was ~6). Better: big cracked slabs with dark joints, a real ruined ledge with roots + ferns, vines on
  every wall, smoother canopies, a Rift you can see. Gaps: units are still smaller than the ref's chunky heroes (layout-bound, below); the floor
  lacks the ref's gritty high-frequency texture and is lit flatter; the ledge is only ~25 CSS px tall between the floor and the strip; joints
  could carry more moss/grass; canopies sit mostly under the top HUD.
- Open issues
  - Unit size: the side-button rail is the limit. With the fantasy roster, wolves touched the rail even at 1x; after the quadruped turn and the
    0.35 m nudge, idle gaps are 2-19 px, but MINOTAUR's attack anims (sweep / leap to ~7.8 m) dip to -3..-12 px (p5 over a fight). Scaling fantasy
    units 1.12x costs another ~10 px. Hook is in (theme.unitScale, FANTASY_UNIT_K = 1, battle_test `&fk=`).
  - Tubes are not in the shadow map (they cast nothing) and not in the planar mirror (scifi); fine for roots and vines.
  - The forest ambience starts on battle start(); if audio is still locked (no gesture yet) it is skipped for that battle.
- Requests
  - manager / ui: to grow units on the fantasy board we need horizontal room, e.g. side buttons a little higher (above the back-lane rows) or
    narrower colX on fantasy. Then FANTASY_UNIT_K ~1.12 in themes/fantasy.js.
  - sculptor-16 (SINGULARITY / VECTOR PRIME): `fx.noBloom(mat)` (or `markNoBloom` from js/fx/vfx.js in the model) on the lens billboard and the
    blackHole() ShaderMaterial. Verified at runtime: core 0,5,32 -> 0,0,0 with the photon ring still glowing.
  - sculptor-19 (TREANT) and the wolf/minotaur sculptors: `fx.roots` / `fx.entangle` / `fx.tube` are ready (README). MINOTAUR: keep attack
    sweeps within ~0.5 model m sideways (they reach the side-button rail).
  - audio (if anyone owns it again): `ambience` is a battle hook {theme}; add other themes' beds to forestAmbience's sibling if wanted.
  - manager: new files js/fx/tube.js; battle.js `setSpeed` accepts 8 (ui-4).

# BATTLE-L (landscape package, docs/LANDSCAPE.md §2)
## Checkpoint 1
- DONE (all syntax-checked): layout.js `LANE_PROFILES` + `applyLaneProfile(name)` (BOARD.laneZ/backShift hold the active profile;
  scifi floor lattice pinned to the tall profile); camera.js `FRAME_WIDE` + `fitWide()` (w/h >= 1, pitch by aspect, slot-box fit,
  shiftX via elements[8], bg camera same shiftX, seam rule bumps pitch); board.js `setHome`; battle.js `setLaneProfile/laneProfile`,
  re-home tween, 4-side `setMargins`; overlay.js `setFrame` (--cx); engine `quality.maxPixels` cap; fantasy `wideUnitK` 1.12;
  battle_test `?wide=1`, `&hud=1` (landscape mock 52/190/74), `?rot=N`, `&lanes=tall|wide`, `&still=1`.
- Portrait proof: baseline tree (git show HEAD of my files) served from scratch :9414 vs current tree also served from :9414,
  `still=1` (time frozen, overlay hidden): scifi 412x915 max diff 1/255, fantasy 412/390 0 px; camera + bg matrices identical
  to 5 decimals. (8888 vs 9414 differ in MSAA edge resolve: an origin effect, not code.)
- NEXT: landscape shots (test page), in-game real HUD clearance, rotation soak, perf, Q11 retry, in-game cpu 9.2 ms.
## Checkpoint 2
- DONE since #1: fitWide verified at all landscape sizes; backdrop camera in wide caps its horizontal fov (bgHFov 96) and drops its horizon
  to 0.3 H (the seam is under the top HUD in landscape; the old formula gave a 125 deg smeared backdrop). Tall landscape (h 480..800)
  blends the fit box toward the whole arena ("roomy"; 1920x1080 units 374 -> 301 px, whole floor + stands visible like ref_02).
  D26 intro (camera.setIntro / battle playIntro, skipIntro, introActive, opts.intro; battle_test &nointro / &intro=0.5).
  Fantasy wide: units x1.12 (`wideUnitK`), `frameWide.boxTop` 5.6 (treant/elf sage heads cleared the top HUD), forest flanks
  (`theme.setWide`, 3 draws, hidden in portrait). Rotation soak (?rot=3, 16 s): same scene, sim tick never decreased, refit within the
  frame of the change, profile flips each time, rotation mid-intro OK.
- NEXT: Q11 import retry, in-game cpu 9.2 ms profile, final perf table, portrait re-diff, in-game 412/915 + nointro, report.
## Checkpoint 3 (BATTLE-L hand-back)
- DONE since #2
  - Q11: `unitsModule()` retries js/actors/units.js 3x (300 / 900 ms backoff, cache-busting query on retries); a placeholder fallback
    is not cached, so the next battle tries again.
  - Wave 1 is spawned in `ready` (same deploy delays) and unit shaders are precompiled (`compileAsync`) while the intro plays: the
    ~400 ms stall at the first frame / drop-in (precise-bbox fits in spawn) is gone (worst frame 440 -> 64 ms).
  - Fantasy flanks are now forest-floor planes only (tree-line cards read as giant hedge walls from the intro pose).
  - `skipIntro()` also has a 300 ms wall-clock deadline.
- APIs (as implemented)
  - `createBattleScene(engine, {..., margins:{top,bottom,left?,right?}, laneProfile?:'tall'|'wide' (pins it), intro?: true|{strength}})`
  - `scene.setMargins({top, bottom, left?, right?})`: CSS px; landscape fits between left/right bands, portrait ignores left/right.
  - `scene.setLaneProfile('tall'|'wide', {animate=true})`, `scene.laneProfile`. resize() flips it by aspect (w/h >= 1) unless pinned.
  - `scene.overlay.setFrame({left, right})`: OD callout / OVERTIME plate / banners centre on the board band (setMargins calls it).
  - D26: `scene.playIntro({strength})` -> Promise; `scene.skipIntro()` -> Promise (ends in ~0.25 s); `scene.introActive` (true from
    creation when opts.intro). No sim ticks or queued events during the intro; drop-ins overlap its last 0.5 s. Duration 2.6 + 0.8 *
    strength s (default strength 1 wide, 0.6 portrait). Survives rotation (pose is an offset from the refitted camera).
  - `engine.quality.maxPixels` (high 2.4e6 / med 1.6e6 / low 1.0e6; `?maxpx=`), applied in engine.resize.
  - camera.js: `FRAME_WIDE` (pitch(aspect), box, roomyH, bgHFov, bgHorizon, seam rule), `FRAME_INTRO`, rig.setIntro(k, s), rig.refit().
  - Themes may export `setWide(bool)`, `wideUnitK`, `frameWide: {boxTop}`.
  - battle_test: `?wide=1 [&hud=1]`, `&m=top,bottom,left,right`, `?rot=N`, `&lanes=`, `&nointro`, `&intro=0.5`, `&still=1`, `&boxTop=`,
    `&bgHorizon=`, `&bgHFov=`.
- Acceptance (battle_test 6v6 with the real HUD margins measured in game; idle; px CSS)
  | size | margins t/b/l/r | avg unit h | side gap idle L/R | mid-fight min L/R | far heads vs top |
  |---|---|---|---|---|---|
  | 915x412 scifi | 50/4/178/66 | 129 (portrait 122) | 137 / 111 | 22 / 52 | +15 |
  | 844x390 scifi | 50/4/167/66 | 121 (portrait 114) | 120 / 95 | 18 / 41 | +14 |
  | 915x360 | 50/4/153/66 | 111 | 180 / 158 | 85 / 109 | +14 |
  | 844x340 | 50/4/144/66 | 103 | 161 / 140 | 76 / 95 | +13 |
  | 960x412 | 50/4/178/66 | 129 | 160 / 134 | 46 / 74 | +15 |
  | 740x360 | 50/4/153/66 | 110 | 93 / 70 | -3 / 21 | +14 |
  | 915x412 fantasy (k 1.12, boxTop 5.6) | 50/4/178/66 | 139 | - | - | +7 |
  (the top intrusion during fights is the Overdrive camera push, by design.)
- Perf (M5 metal, 6v6 mid-fight, engine cpu): portrait scifi 2.4 ms / 162 calls; landscape 915x412 scifi 2.6 / 170; portrait fantasy
  2.4 / 115; landscape fantasy 2.6 / 118; 1280x800 2.9 / 170 (2.40 Mpx, dpr 1.53); 1920x1080 3.0 / 170 (2.40 Mpx, dpr 1.08);
  2560x1080 2.9 / 170 (dpr 0.93). In game m8_l15 412x915: 3.1 ms / 158 calls (QA's 9.2 ms did not reproduce; the profile shows
  three.js matrix updates + render, no HUD hot spot).
- Portrait proof: camera + backdrop matrices identical to baseline (5 decimals) at 412x915 and 390x844, both themes. Pixel diffs:
  0 px or max 1/255 in most runs; some runs show edge-only differences (MSAA resolve), which also appear between two runs of the
  identical baseline build. Interior pixels are identical.
- Shots (scratch battleL/): w2.png, hz.png (backdrop horizon), in_sheet.png (intro), d_1920.png (desktop), fl3.png / fi_sheet.png
  (fantasy wide + intro), game_sheet.png (in game: fantasy + scifi intro and fight at 915x412), g_m1_l3_*.png (all sizes, real HUD),
  gi_m1_l3_412x915.png (portrait intro), c_*.png (clearance runs).
- Open issues
  - Fantasy wide surroundings are plain: forest-floor flanks only; the intro shows a flat green ground to a misty horizon. A real
    forest flank (instanced trees beyond the side walls) is the next look task.
  - Landscape scifi draws +8 calls vs portrait (more stands/backdrop in view); spec said +5. Still under 180.
  - The OD callout can overlap far-lane heads in landscape (it sits right under the top cluster); short-lived.
  - Re-home tween peaks at ~0.48 m/frame for a back-far unit (6.6 m in 0.35 s); busy units wait up to 1.5 s.
- Requests
  - ui: none blocking. All APIs above are live; margins are honoured as measured from hud.margins().
  - manager: no new files or vendored addons this round.

# battle-8 (eighth round: fantasy landscape forest, intro composition, wide units, OD callout, scifi landscape calls)
## Checkpoint 1
- DONE (all syntax-checked)
  - New js/battle/themes/fantasy_forest.js: `buildFantasyForest(engine, {hw, fz0, fz1, bz0, seed, stone, foliage})`, board-camera geometry beyond
    the side walls: instanced trunks (flared, gnarled), lumpy canopies in the battle-7 style (welded icospheres -> smooth normals, dark
    underside vertex colour, world-space leaf mottling) in near (detail 2) and far (detail 1) LOD meshes, leaf-cluster cards on the crowns,
    bushes (far crown mesh), fern/grass cards, mossy rocks, merged ruin fragments (toppled drums, wall stubs, pillar + fallen lintel),
    hazed forest floor, two low mist sheets. Haze = mix toward 0x87917a by distance from the arena centre (stable during the intro).
    ~9 draws. Replaces BATTLE-L's flat flank planes. Per-tier instance budget K: high 1 / med 0.68 / low 0.42.
  - fantasy.js: forest visible when wide OR during the intro (`theme.setIntro(on)`, called by battle.js playIntro / endIntro). The
    portrait fight framing only sees a crown at the top-right corner under the HUD, so it is hidden there.
  - camera.js: wide intro start puts the backdrop horizon on the seam (as portrait), easing to the wide bgHorizon offset as the intro
    lands. Before, the wide intro dropped the backdrop horizon ~0.5 NDC below the back wall, so the arch / Rift / towers were hidden
    behind the wall and the gap showed blank sky. Portrait is unchanged (shift0 == seam0 there). Also `F.intro` / `F.introWide`
    overrides of FRAME_INTRO (theme frameWide or opts.frame).
  - fantasy_backdrop.js: giant tree canopy lobes welded before normals (were flat-shaded facets).
  - scifi_backdrop.js: sky below the horizon fades to a dark stadium floor (the intro in both orientations showed a pale lavender void
    under the stands).
  - battle_test: `&introAt=K` freezes the intro camera at pose K (0 = first frame); `&introPose=zoomOut,rise,lookUp,lookFar`.
- NEXT: wide fantasy unit size vs ref, OD callout placement, scifi landscape draw calls, perf per tier, before/after sheet, in-game check.
## Checkpoint 2
- DONE since #1
  - Wide fantasy units vs ref_fantasy_01 (6v6 fantasy roster, idle, 915x412 mock HUD): kept `wideUnitK` 1.12. Near-lane units already fill
    ~45% of the frame height (the ref's heroes are ~25%), the wide lanes are tight (neighbours overlap on screen) and at 1.12 the far-lane
    TREANT's HP bar already sits under the top HUD (head clears). 1.25 pushes far heads ~15 px into the HUD. Bigger would hurt, not help.
  - OD callout (overlay.js): in landscape (side bands set) it hugs the caster's edge of the board band (player left, enemy right) at
    top + 6 px, slightly smaller type (`.vpb-od.side`). 915x412: rect 198..354 / 671..833 x 58..95, no unit bbox overlap in 3 callouts
    (was centred over the far-lane heads). Portrait unchanged.
  - Scifi landscape calls: the 6 floating data panels were 6 meshes (landscape sees all of them; portrait culls some). Now one mesh
    (canvas atlas + per-panel bob in the vertex shader). Empty board, still=1: portrait 80 -> 76, landscape 86 -> 76 (delta 0, was +6).
- NEXT: perf per tier, before/after sheet, in-game m6_l16 + scifi landscape check, hand-back.
## Checkpoint 3 (battle-8 hand-back)
- Perf (M5 metal, 6v6 mid-fight, battle_test, engine cpu median over 7 s, tris median):
  | config | cpu ms | calls | tris | dpr |
  |---|---|---|---|---|
  | fantasy wide high | 2.9 | 126 (was 118) | 402k (was ~227k) | 1.5 |
  | fantasy wide med | 2.7 | 126 | 338k | 1.25 |
  | fantasy wide low | 2.0 | 110 | 187k | 1 |
  | fantasy portrait high / med / low | 2.3 / 2.5 / 2.5 | 117 / 117 / 101 | 229k / 208k / 126k | 1.5 / 1.25 / 1 |
  | scifi wide high / med / low | 2.8 / 2.8 / 2.3 | 160 / 160 / 124 | 300k / 257k / 94k | |
  | scifi portrait high / low | 2.7 / 2.2 | 160 / 124 | 300k / 94k | |
  Forest instances: high 188 trees, 69 near + 273 far crowns (incl. bushes), 1200 leaf cards, 520 undergrowth cards, 70 rocks; med x0.68,
  low x0.42 (low uses detail-1 near crowns). Intro start (no units, forest on): fantasy wide 48 calls / 260k tris.
  In game: m6_l16 915x412 120 calls, 412x915 fine; m1_l3 scifi landscape 95 calls = portrait 95. No console errors.
- Shots (scratch battle8/): before_after.png (rows: fantasy wide intro start, fantasy wide fight, scifi wide intro start; right
  columns portrait intro fantasy / scifi, before top, after bottom), g_sheet.png (in game m6_l16 intro + fight 915x412),
  gi_sheet.png (in-game intros), u_cmp.png (wide fantasy units vs ref), od_land_*.png (OD callout).
- Intro judgement: fantasy wide was the weak one (flat green flanks + a blank sky wedge; the backdrop hid behind the back wall). Now
  forest canopy on both sides, the Rift + arch in the opening, giant trees framing the top: ~6.5/10 vs ref mood. Scifi wide is good
  (now shows the VECTOR PROTOCOL screen; the pale void under the stands is gone). Portrait both fine; FRAME_INTRO left at defaults
  (variants with less look-up hid the Rift or exposed a void under the near ledge).
- Open issues
  - Fantasy wide high tris +175k from the forest (402k total). Fine on M5; on the S22 at ~1.5 dpr it should hold, but if QA sees
    drops, cut the far crown count / leaf cards first (fantasy_forest.js K, `near/far` lists).
  - The forest pops off in portrait at the end of the intro; only a crown under the top HUD at the top-right is affected.
  - Forest canopies are lit lobes + cards, still a little "soft cotton" up close in the intro's lower corners.
  - OD callout at narrow landscape (740x360) can still touch a back-column head; side gap there is ~93 px vs a ~156 px callout.
- Requests
  - manager: new file js/battle/themes/fantasy_forest.js (imported by fantasy.js). No new vendored addons (mergeVertices is in the
    existing BufferGeometryUtils).
  - ui: none. `theme.setIntro` is battle-internal.

# battle-9 (ninth round: fantasy fight lighting, QL5 XL spacing in wide, QL6 OD callout layering, intro backdrop edge, S22 guard)
## Checkpoint 1
- DONE (syntax-checked)
  - Fantasy lighting (themes/fantasy.js): key 0xffe2b4 x2.6 -> 0xffd49a x3.6, hemi 0xd4dccb/0x2a2e1e x0.8 -> 0xdcd6c4/0x30281c x0.9, rim
    0xd2e2a6 x1.6 -> 0xe6dcb0 x2.4, fill 0.55 -> 1.0, envIntensity 0.75 -> 1.05, ground material colour (1.1, 1.06, 1.3) (lifts the slabs and
    pulls them off yellow-green). Look per orientation via theme.setWide: wide vignette 0.5 / contrast 1.1, portrait 0.66 / 1.14 (was
    0.75 / 1.16). Floor between the lanes (915x412) 61,67,43 -> ~95,88,72 (ref ~84,75,64).
  - post.js: `vignetteAspect` look option (uVigAspect): caps the aspect used by the vignette so a wide frame's sides don't eat the board.
    Default 99 = old behaviour; fantasy uses 1.25 (portrait unaffected).
  - QL5 (battle.js `wideFit` / `refitWide`): in the wide profile, XL units x0.85 (x0.92 more beside an XL/boss), L units x0.92 only beside
    an XL/boss, bosses capped at 1.25x board scale; then a floor-footprint overlap pass (idle fastBox per unit, `a.foot`) shrinks the bigger
    of any pair overlapping > 30% (min 0.62). Runs after each wave's spawns and on profile switches (a.wk factor, tweened via rehome).
    Regular squads: no change. `scene._wideFit()` debug.
- NEXT: QL6 OD callout layering + 740x360, intro backdrop edge, S22 guard, in-game check (ui had a broken import at 1st try), perf, sheet.
## Checkpoint 2
- DONE since #1 (syntax-checked)
  - QL6 (overlay.js): z-order numbers < HP bars < OVERTIME (4) < OD callout (5) < banners (6); crits (z 2) and bars no longer draw over the
    callout. Landscape placement `placeSide()`: candidates down the caster's edge of the board band (top, 22/42/62% of the band), normal
    then a compact `.tight` size; picks the least coverage of HP bars + unit rects (`overlay.obstacles`, battle.js: fastBox projected, only
    when a callout fires). `overlay.setBottom(px)` from setMargins. 740x360: compact callout 162..284 x 56..88, clear of heads/bars.
  - QL11 intro edge (fantasy_backdrop.js): tree-line bands alpha-blended (soft mip edges), own haze toward the horizon colour instead of the
    scene fog (far bands were dark cut-outs), top 20% of each band fades (the canvas clipped crowns flat at its top row + wrap), arc ends
    fade. Ordered far -> near, no depth write. The flat dark hill with a hard top above the ruins wall is gone.
  - S22 guard (fantasy.js + fantasy_forest.js): `forest.trim(level)` 1 = far-crown leaf cards off + outer 40% far crowns, 2 = no cards,
    far crowns 35%, near crowns on the detail-1 mesh. Guard: 2 consecutive 1.5 s windows < 45 fps (p90) with the forest visible -> next
    level (one-way per battle, console.info). `?forestTrim=N` forces. Wide high: 407k tris -> L1 371k -> L2 308k (calls 127 -> 126).
  - Rotation soak (?rot=2.5, wave-2 XL squad): wk factors flip 1 <-> 0.85/0.92 with each profile change, scales return to 2.00 in tall.
- In game (?dev=1&fresh&god=1, 915x412 + 412x915): m6_l16 no console errors, 125 / 115 calls; m8_l15 wave 2 wideFit = juggernaut 0.85,
  paladin 0.83, kingpin 0.92.
- NEXT: before/after sheet, final perf table, hand-back.
## Checkpoint 3 (battle-9 hand-back)
- Perf (M5 metal, battle_test 6v6 mid-fight, engine cpu median over 7 s; budget 180 calls):
  | config | cpu ms | calls | tris | dpr |
  |---|---|---|---|---|
  | fantasy wide high | 2.5 | 127 | 407k | 1.5 |
  | fantasy wide high, forestTrim 1 / 2 | 2.6 / 2.8 | 127 / 126 | 371k / 308k | 1.5 |
  | fantasy wide med / low | 2.5 / 2.6 | 127 / 111 | 335k / 177k | 1.25 / 1 |
  | fantasy portrait high / low | 2.5 / 1.9 | 118 / 102 | 233k / 117k | 1.5 / 1 |
  | scifi wide high (m8 wave-2 squad) | 2.5 | 156 | 299k | 1.5 |
  | scifi portrait high | 2.9 | 160 | 300k | 1.5 |
  In game: m6_l16 915x412 125 calls / 2.1 ms, 412x915 115 / 2.1 ms; m8_l15 wave 2 915x412 166 calls / 3.2 ms. No console errors.
- Shots (scratch battle9/): before_after.png (rows: fantasy wide fight, fantasy wide intro, m8_l15 wave 2 [QA before], boss wave 3;
  bottom: portrait fantasy before|after, OD callout at 740x360), lit_ab.png / lit_p2.png (lighting A/B), xl_ab.png, in_edge_ab.png,
  dbg3_c.png (intro gap, both orientations), trim_ab.png (forest trim 0 vs 2), od_915_*.png / od_740_*.png.
- Honest look: fantasy fight ~7/10 vs ref_fantasy_01 (was ~6.5): warm key, floor reads as warm grey stone, units' colours readable and
  separated by rim + contact shadows. Still: dark-painted mechs (GUNNER navy) stay darkish; floor is now close to unit brightness in the
  near rows, so separation leans on the rim light.
- Open issues
  - m8_l15 wave 2/3 is better, not solved: the boss wave is still a big cluster (VECTOR PRIME at 1.19x board scale + LEVIATHAN in front).
    Next lever if wanted: WIDE_BOSS 1.25 -> 1.1, or move a boss's flank units back half a lane in wide.
  - m8_l15 in-game 915x412: a far unit (SERAPH wings) reaches ~16 px into the top HUD mid-fight (gapTop -16; likely OD camera push).
  - Intro gap is now hazy distance (soft tree silhouettes); the Rift's dark void reads a little weaker against the paler haze.
  - Forest guard is untested on a real S22 (only forced levels measured); it only acts after ~3 s under 45 fps.
- Requests
  - manager: no new files, no vendored addons. New public bits: post look `vignetteAspect`, overlay `obstacles` / `setBottom`,
    scene `_wideFit()` (debug), theme `forest.trim(level)` / `forestTrim`, battle_test-independent `?forestTrim=N`.
  - ui: none.

# battle-10 (tenth round: TOP PRIORITY load / drop-in hitches; then m8_l15 boss cluster, SERAPH wings vs top HUD, OD callout in game, navy units on fantasy floor)
## Checkpoint 1 (hitch work)
- Measured first (in game, PerformanceObserver longtask + per-frame rAF times + renderer.info.programs, CPU profiles; harness in
  scratch battle10/perf.mjs, attr.mjs, summ.mjs). Before, M5 nointro x1: m1_l3 load LT 212 ms; m3_l14 load 365 ms, wave 2/3 spawns
  242 / 250 ms; m6_l16 load 613 ms (worst frame 733), wave 2/3 392 / 290 ms. Attribution:
  - unit spawn: precise bboxes (overdriveReach 16 + fitBossFootprint 5 + misc) via three's expandByObject(precise): applyBoneTransform
    rebuilds bone x boneInverse per weight per vertex -> ~70% of spawn cost; every wave's units built in one task at the wave event.
  - fantasy flagstone textures ~350 ms in createTheme (sync, in the mount task).
  - compileAsync compiled the WRONG variants (canvas target: sRGB + tone mapping) while the post chain renders to a linear target, so
    all real programs (36-93) compiled synchronously in the first frames; unit programs again at drop-in.
  - first visible frame of each unit: SkinnedMesh.computeBoundingSphere (frustum culling) skins every vertex the slow way (x4: 70-80 ms
    per wave start).
- DONE (all syntax-checked, in-game smoke-tested both themes)
  - geo.js `expandPrecise(bb, o)`: inlined precise box (same objects + maths as expandByObject(o, true); verified max diff < 1e-4 on
    all units at several anim times, battle.js `_boxCheck`). `primeSkinnedBounds(root)`: sets SkinnedMesh boundingSphere/Box from the
    current pose at build time (box-derived sphere).
  - battle.js: spawn is a generator (`spawnSteps`, yields between createUnit / fits / every 4 overdrive samples / proxy); `spawn()` runs
    it in one go, `runSliced(gen, {budget, idle})` spreads it. Initial squad + wave 1: sliced at 10 ms/frame inside `ready`.
    Later waves are PREBUILT during wave 1 (`predictWaves` = sim's autoSlots + id scheme `e{w}_{slot}`; idle-callback slices of 8 ms;
    signature check on adoption, else rebuilt; discarded on mismatch / dispose), then precompiled. `opts.prebuild:false` disables.
  - Render hold: scene `holdRender` (engine.js skips update+render and clears once while true). Held until: arena precompiled, theme
    `ready` (sliced textures) landed, wave 1 built + precompiled, and `warmRender()` (one offscreen render with every unit visible:
    shadow-depth + mirror variants, geometry/texture uploads). HOLD_MAX 6 s safety. `opts.hold:false` disables. Sim/intro don't tick
    while held (engine skips update), so nothing is lost.
  - `precompile()` compiles against a 1x1 render target (linear, no tone mapping) = the variants the post chain really uses.
  - fantasy flagstones: `flagstoneTexturesAsync` (generator, frame-sliced) + placeholder 1x1 textures of the same kind (same program)
    swapped when ready; FT_CACHE holds result or in-flight promise.
  - memoTex (fx/textures.js): floor / crowd / window / banner and fantasy stone / pedestal / foliage / treeline textures cached per
    module (retries and prewarmed battles skip the canvas work). Fantasy backdrop giant-tree geometry cached per module (rng advanced
    by the same count, so the rest of the backdrop is unchanged).
  - `prewarmBattle(engine, {theme})` (battle.js export) -> theme `prewarm()` builds those textures in idle callbacks.
- Requests
  - ui (please): in `scr_formation` mount, once the level's theme is known:
    `load('battle').then((m) => m.prewarmBattle?.(engine, { theme: B.theme || level.realm || map.realm }))` (fire and forget; idle-time
    only, safe to call repeatedly, safe if the battle starts before it finishes). Saves ~0.3-1 s of black hold on a fantasy battle's
    first load and ~40 ms (x4: ~150 ms) from the ENGAGE tap task.
  - manager: no new files.
## Checkpoint 2 (battle-10 hand-back)
- ui landed the prewarm (scr_formation -> `prewarmBattle`). The matrix below goes through formation -> ENGAGE (1.5 s on formation
  unless noted), M5 metal, 412x915, speed 4. "visible" = from the first shown frame to 3 s after the last drop-in.
  | run | tap->first frame | pre-show worst LT | visible worst frame | visible max LT | progs compiled while visible | waves 2/3 worst frame / LT |
  |---|---|---|---|---|---|---|
  | m1_l3 nointro x1 (before: frame 200, LT 212, 66 progs) | 209 ms | 0 | 17 | 0 | 0 | - |
  | m1_l3 intro x1 (before: 183 / 191) | 162 | 0 | 17 | 0 | 0 | - |
  | m3_l14 nointro x1 (before: 350 / 365, waves 250 / 242-250) | 271 | 0 | 17 | 0 | 1 | 17 / 0 |
  | m3_l14 intro x1 | 219 | 0 | 17 | 0 | 1 | 17 / 0 |
  | m6_l16 nointro x1 (before: 733 / 613, waves 383 / 392) | 964 (361 with 5 s on formation) | 113 (81) | 17 | 0 | 0 | 17 / 0 |
  | m6_l16 intro x1 | 471 | 152 | 33 | 0 | 0 | 17 / 0 |
  | m1_l3 nointro / intro x4 throttle | 360 / 348 | 53 / 52 | 33 / 33 | 0 / 0 | 0 | - |
  | m3_l14 nointro / intro x4 | 567 / 568 | 52 / 0 | 50 / 50 | 52 / 0 | 1 | 17 / 0 |
  | m6_l16 nointro / intro x4 | 1079 / 1146 | 230 / 226 | 67 / 67 | 71 / 76 | 0 | 17-33 / 0 |
  "pre-show worst LT" is the ENGAGE tap task (createBattleScene arena geometry, sync, before the battle screen paints) — the formation
  screen freezes that long after the tap, nothing animates. Before numbers exist only for x1 (old code was not kept).
- Other battle-10 work (all syntax-checked, in game both themes, battle_test boots, no console errors)
  - QL m8_l15 boss: WIDE_BOSS 1.25 -> 1.1 (VECTOR PRIME 2.5 -> 2.2 scale in wide) + new WIDE_FRONT 0.82: a non-boss unit standing in a
    nearer lane right in front of a boss (|dx| < 1 m, dz < 5.4) shrinks a further step (LEVIATHAN 1.56 -> 1.28). Boss now reads as the
    centrepiece. Portrait unchanged (wideFit is wide-only; verified wk = 1 at 412x915 / 390x844). Dev overrides `?wideBoss=` `?wideFront=`.
  - Push guard (camera.js `setPushGuard(fn)`, `pushK`): during the Overdrive push the push amount is bisected down so every deployed
    unit's idle top (+10%, foot box `y1`) stays under the top margin (or no higher than unpushed). Far-lane SERAPH wings no longer go
    up with the push; at idle/attack they touch the bar's lower edge by ~2-3 px at 915x412 (not push-related).
  - OD callout in game (915x412, m8_l15): placed at the caster's edge under the top bar, clear of heads and HP bars in 3 of 3 callouts.
  - Fantasy navy units: fill light 1.0 -> 1.7 (low front light: lifts unit faces, floor only +4/255). GUNNER reads blue instead of black.
- Perf (in game): m6_l16 915x412 125 calls / 2.5 ms cpu, 412x915 115 calls / 2.4 ms; battle_test 6v6 160 calls / 3.1 ms. m8_l15
  915x412 peaks 179 (w2) / 190-194 (w3) during VFX bursts — over the 180 budget, but the pre-change run peaked at 180 / 204 (not from
  battle-10; hidden prebuilt units cost no calls).
- Shots (scratch battle10/): before_after.png (boss wave before/after, 844x390 + portrait, fantasy fill A/B, OD callout, m6 landscape),
  navy_ab.png, od_sheet.png, w3_*.png, g_915_gap_w*.png. Perf JSON: before/, after/ (summ.mjs prints the table).
- Open issues
  - ENGAGE-tap task still 50-150 ms on M5 (x4: 160-230) on a first battle: arena geometry is built synchronously in createBattleScene.
    Retries hit the texture / tree caches. Next step if needed: make theme builders generators and build inside the hold.
  - x4 visible frames up to 67-83 ms: post-processing programs compile on the first shown frame when the hub was never rendered
    (dev deep link); and prebuild steps on slow CPUs are one createUnit each (robots' build, ~45-60 ms at x4) in idle time.
  - Boss pylons at 915x412 reach the top bar's lower edge at drop-in (boss top y 40 vs margin 50 by bbox).
  - m8_l15 call peaks over 180 in VFX-heavy moments (see Perf).
