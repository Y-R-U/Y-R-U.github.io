# sculptor-1 — GUNNER + SCRAPPER (starters)

Owns: `js/actors/models/gunner.js`, `js/actors/models/scrapper.js`, `js/fx/units/gunner.js`, `js/fx/units/scrapper.js`,
this file, and the two lines `gunner:` / `scrapper:` in `js/fx/units/index.js`.
Scratch (screens + drivers): `/private/tmp/claude-501/-Users-aaronair-cc-airon/9f0adda7-8cfb-4e58-acf3-950485f78a19/scratchpad/sculpt1/`
(`shot.mjs` gallery driver, `multi.mjs` battle_test frames, `od.mjs` = frames after a named unit's first overdrive, `tile.py`). CDP port 9410.

## Checkpoint 1 (first full pass)
DONE
- GUNNER model: IK hip-hold precomputed at module load (`stance()`), gun authored in root space via `poseFrame`, left hand on a side handle
  (`style.grip`), barrel cluster on aux1 (re-parented to handR) spinning about the gun axis in `tick()` (spin rate per action).
  Ammo belt = CatmullRom tube split across chest + handR (meets exactly in the hold pose) with cartridge links; R2 armoured cover.
  Low helm, mismatched twin eyes (big original + small replaced unit with scope ring), bent antenna, stencils "07"/"4"/"12", rivet patch plate, chips.
  Ranks: R2 belt cover + left shoulder lamp, R3 cyan heat rings on barrels, R4 hip ammo boxes + shin guards, R5 drum cooling fins.
  Rarity: rare+ extra pauldron plate + glow strips, epic+ thigh plates + vent lamps, legendary sensor crown + gold muzzle brake.
- GUNNER anims (all bespoke): idle (glances at + shakes the gun every 6.5 s), advance, attack (5-round burst, recoil per shot), attack_alt
  (sweeping burst), cast (vent/rack), overdrive (wide brace + far->near yaw sweep with shake, fire 0.22..0.92), hit, die (kneel then
  face-plant over the gun), victory (cannon hoisted skyward, barrels spinning), deploy (crouch landing + rack).
- SCRAPPER model: ape frame (long arms, fists to the knees, neck pitched forward so the small head sits low in front of the hump),
  barrel chest "13", two exhaust stacks; flames on aux2/aux3 (re-parented to aux0) scaled in `tick()`; piston fists = hand bones slide
  out in `tick()`. Ranks: R0-1 rust left pec + rivets, rust slab right shoulder, LEFT ARM BARE (struts, pistons, cables); R2 matched red +
  knuckle spikes; R3 glowing piston cores + idle stack flames; R4 chain sash + knuckle dusters; R5 third stack + helm ridge. Legendary gold roll cage.
- SCRAPPER anims (all bespoke): idle (shoulder roll + knuckle bump every 5.2 s), advance (knuckle-swing lumber), attack (piston hook, impact 0.39),
  attack_alt (double-fist hammer, impact 0.38), cast (chest pound + roar), overdrive (HAYMAKER: wind back, stacks belch, rocket lunge
  impact 0.3, follow-through), hit, die (sway, knees, slump onto fists, face down), victory (flex + chest beats), deploy (superhero landing + fist bump).
- FX: gunner attack = 5 tracer bolts + brass casings; impact sparks; overdrive = 30-round hose (beam stream + double tracers) along a
  path through the front-line targets (dips to the floor between them), impact bursts per target, vent smoke.
  scrapper attack = piston ring + sparks + small stack puff; impact = heavy hit + debris; overdrive = stack belch, rocket burn behind
  the fist, shockwave bolt + ground rings down the lane, explosion + hex ring, **target skids back** (offsets target `unit.body.z`).
- testAll: 0 fails. dc/tris (high, default rank): gunner 6/8.5k · 6/8.8k · 6/10.1k · 7/10.5k (legendary +1 kit aura);
  scrapper 6/6.4k · 6/6.6k · 6/7.2k · 7/7.5k.

## Checkpoint 2 (art-lead feedback round) — DONE
- Gunner: drum enlarged + raised (reads from the look-down) with a cyan band, glow end caps and top lamp; belt thicker with bigger links;
  cyan helm stripe + shoulder strips; lighter bare-metal frame (`mats.metal` 0x737b87) against matte black armour; light gunmetal pauldron domes.
  R2 now adds a riot gun-shield (silhouette) besides belt cover + lamp; R4 comms masts on the drum; R5 bigger cooling fins.
  Anim fixes: gun IK target follows pelvis offset + torso yaw (overdrive/sweep no longer points the gun at the sky); new victory (gun up, fist pump).
- Scrapper: accent rust -> dark gunmetal (0x3a3e46); hump top red + white stripe; rivet rows, hydraulic hoses, upper-arm pistons,
  dented gunmetal patch bolted on the right forearm at R0-1, knee bolts.
- Both: panel grooves softened on metal/accent (kit panel lines speckle at battle size).
- testAll 0 fails. Events verified: gunner attack 5x fire, attack_alt 8x fire, overdrive cast + 14 fire; scrapper attack/alt impact, OD cast+impact.
- dc/tris high default rank: gunner 6/8.9k · 6/9.3k · 6/10.8k · 7/11.2k; scrapper 6/7.1k · 6/7.4k · 6/7.9k · 7/8.2k. Gunner q=low 5.6k.
- Final screens (scratch): final_{gunner,scrapper}_{single,tiers,factions}.png, bt3_0.png (battle), odg2_sheet.png, ods_sheet.png, rk_g.png / rk_s.png.

NEXT (if more time)
1. Gunner rarity ladder is still subtle at battle size below legendary (rare vs common differ mostly in glow strips): add a bigger
   rare+ silhouette element (e.g. a second ammo box or shoulder armour fin).
2. Gunner body still dark from the battle camera; consider a lighter secondary panel on the chest top.
3. Overdrive FX was judged in busy fights; a clean isolated capture would help tune the hose width.

## Requests (kit)
- Panel-line shader speckles/aliases on small dark metal parts at battle size (visible on every unit); a stronger fwidth fade or lower
  default metal groove would help. I work around it with `mats.*.panel.groove` overrides.
- Panel/grime canvas textures per slot would let the starters' wear read; materials have no map hook today.
