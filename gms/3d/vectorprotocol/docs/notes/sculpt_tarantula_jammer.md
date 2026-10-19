# sculptor-4 — TARANTULA + JAMMER

Owns: `js/actors/models/tarantula.js`, `js/actors/models/jammer.js`, `js/fx/units/tarantula.js`, `js/fx/units/jammer.js`,
this file, and the lines `tarantula:` / `jammer:` in `js/fx/units/index.js`.
Scratch (drivers + screens): `/private/tmp/claude-501/-Users-aaronair-cc-airon/9f0adda7-8cfb-4e58-acf3-950485f78a19/scratchpad/s4/`
- `shot.mjs out.png "gallery.html?..." W H dpr` (also battle_test pages) · `multi.mjs` timed battle frames ·
  `evt.mjs prefix "battle_test.html?..." NAME attack|overdrive delays skip crop` = frames after a named unit's Nth attack/OD ·
  `sheet.mjs out.png model "anims" "us" "extra query"` = single-load contact sheet. CDP port 9413.
- Edit model files in scratch first (`node --check`), then copy into place (tree must boot, D19).

## Checkpoint 1 (TARANTULA first pass)
DONE
- TARANTULA model (quad): authored in design units, uniformly scaled by `G = 0.7` (rig dims, parts via `b.scope`, anim
  translations via `body()`/`plantAll()`) because the battle board is unitScale 1.9 with columns 2.15 m apart.
  Thorax hull + rounded armoured abdomen (segment bands, orange hourglass, spinneret exhaust, twin stacks), sensor head with an
  8-eye orange cluster + chelicerae, top turret on aux0 with twin long barrels on aux2/aux3 (re-parented to aux0) that recoil in
  tick(), ammo bins + feed chutes, antenna rack, R4 rear mortar, R5 holo ring. Legs: hip dome pods with lamps, tapered femur,
  two-bone knee hydraulic aligned at the home stance, knee drum + cap, tibia shell, level foot pads with claws (post() levels feet).
- Anims (all bespoke, own foot layout): idle (head twitches, turret scan, foot taps), advance (4-beat gait, duty 0.75),
  attack (R then L barrel, fire 0.32/0.47, body kicks), attack_alt (siege slug: hunker + both barrels 0.3 + rock back),
  cast (DUG IN: four outward stomps + belly drop, re-step home), overdrive (BOMBARD: splay/anchor, nose up, barrels to the sky,
  6 fire events from u=0.167 = the sim release at 0.4 s), hit, die (belly slam, legs splay then curl up like a dead spider),
  victory (rears up, front legs pawing, barrels high), deploy (legs tucked in the fall, slam + absorb, turret swing + scan).
- FX `js/fx/units/tarantula.js`: twin shells + muzzle smoke + casings + splash blast; impact blast; Bombard = skyward volleys
  (+mortar R4+) then 2-4 shells raining per enemy slot, scorch rings, smoke columns, expose aura. Registered in index.js.

## Checkpoint 2 (JAMMER first pass + fixes) — DONE
- TARANTULA: leg span narrowed for battle-2 (unitScale 1.9, narrower board): HOME feet 0.86/0.74 front, 0.88/-0.70 back
  (design units x G 0.7), radius 0.95*G. No forward lunges (body z offsets <= 0.16 design = 0.11 m).
- JAMMER model (tracked): leg bones re-used (bone order lets parents precede children): thighL = mast base on the chest,
  shinL = telescoping upper section (slides in tick, yaw = dish spin/aim), footL = dish pitch, thighR = R2 side dish,
  shinR = R4 beacon cluster (strobes via scale), footR = dish emitter core (pulses); aux0..3 = sprockets/idlers rolled in tick
  from ctx.move.v. Treads = 30 links/side on a stadium path + road wheels, orange skirts with chevrons (R0: left skirt
  stripped), loudspeaker horns, bent exhaust, radio-operator torso (VU meter, dials, chalk skull), headphone head with orange
  visor, hand mic + clamp, hazard-banded mast + swallowtail pennant, white parabolic dish (thick lathe) tilted skyward at rest
  (reads as a disc from the 49 deg camera), Yagi needle behind the dish. height 2.2 so the HP bar sits above the dish.
  Ranks: R2 second dish · R3 holo static rings · R4 mast +0.2 + blinking beacons · R5 ringed halo crown.
- JAMMER anims (all bespoke): idle (beat nod, dish scan, presses ear cup, fiddles dial), advance (wheels roll, mast lags),
  attack/attack_alt (dish snap / double broadcast), cast = STATIC BURST used in battle (mic to visor, dish locks, cast 0.25,
  mast whips + rings out), overdrive BLACKOUT (mast telescopes +0.5, dish spins up to ~25 rad/s, arms wide, release 0.167),
  hit (mast whip), die (hull sags, mast topples sideways, retracts, dish droops), victory (broadcast dance, beacons strobe),
  deploy (mast stowed + dish folded, suspension bounce, mast shoots up, dish unfolds).
- JAMMER FX: Static Burst = crackling static line + packet + radio-wave ring train; impact = discharge + drained charge motes;
  Blackout = dish ring burst + mast light column, ground shockwave rings, a rolling wall of static beams across the enemy side,
  per-target EMP + sparks + **enemy glow/eye emissives flicker off** (restored from userData.ei0), soft HUD-glitch flashes.
- testAll: 0 fails (whole roster). dc/tris high (default rank): tarantula 6/15.0k · 6/15.6k · 7/15.9k (epic) · 7/16.5k;
  jammer 6/11.8k · 6/11.9k (rare) · 7/13.0k · 7/13.4k.
- Screens (scratch): t6_s/t6_b (tarantula single), j2_a (jammer single), t4_sh*/j2_sh* (anim sheets), t_ranks/j_ranks,
  t8bt_0 (battle), ta_sheet (tarantula attack FX), ja_sheet (static burst), jo_sheet (blackout).

NEXT (if more time)
1. TARANTULA value contrast: accent is near-black; lift some top plates to mid gunmetal so it doesn't read as one dark mass.
2. TARANTULA R1->R2 step is subtle (ammo bins only); add a bigger R2 silhouette piece.
3. Capture an isolated Bombard (evt.mjs NAME=bombard overdrive) and tune shell count/shake.
4. The jammer R4 mast height step reads weakly in view=ranks.

## Kit requests
- Battle camera: back-near enemy slot sits under the speed/auto buttons and near the right screen edge on 412x915
  (battle agent); wide units there get clipped.
- A supported way to dim another unit's emissives (blackout/EMP debuffs). JAMMER FX scales the target's vp:glow/vp:eye
  material emissiveIntensity directly and restores it; a `unit.setPowerScale(k)` hook would be cleaner.
