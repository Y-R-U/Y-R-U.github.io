# sculptor-3 — RIOT + BARB (rogue rares)

Owns: `js/actors/models/riot.js`, `js/actors/models/barb.js`, `js/fx/units/riot.js`, `js/fx/units/barb.js`, this file,
and the two lines `riot:` / `barb:` in `js/fx/units/index.js`.
Scratch (screens + drivers): `/private/tmp/claude-501/-Users-aaronair-cc-airon/9f0adda7-8cfb-4e58-acf3-950485f78a19/scratchpad/sculpt3/`
(`shot.mjs` gallery driver, `multi.mjs` battle_test frames, `od.mjs` frames after a named unit's first overdrive, `tile.py`). CDP port 9412.

## Checkpoint 2 (second pass, ~1h30 in) — both units complete, iterating on looks
DONE
- RIOT (riot.js): hold pose precomputed (stance()); slab shield on foreArmL authored in root space (poseFrame), notch on its inner
  edge where the shotgun barrel (handR frame) rests; shield face = off-white trim slot with red frame, gang skull, scraped POLICE band
  slashed in red, hazard band, rivets. Faceted red pauldrons with a white stripe, riot helmet (red dome, white crown stripe, orange
  visor slit, face cage), shell bandolier, battery pack. Pump fore-end on aux1 racks in tick() (attack, alt, OD, deploy, idle every 7.3 s, victory).
  Ranks: R0 mismatched dark right pauldron + bolted patch on the shield corner · R1 base · R2 steel spikes on shield rim + pauldron crests ·
  R3 shield heat-glow edges + hot notch + belly vents · R4 twin barrels + exhaust stacks · R5 police lightbar (aux2 beacon spins) + glowing skull eyes.
  Rarity: rare+ outer pauldron plate · epic+ thigh plates + spike knees · legendary horns (and gold trim = gold shield face, kit).
  Anims (all bespoke): idle (peeks over the shield, racks), advance, attack (brace + slug, fire 0.3), attack_alt (shield shove + point-blank, fire 0.33),
  cast (bangs the gun on the shield rim = taunt, cast 0.22), overdrive (hoists the shield overhead, slams the edge into the floor at 0.26 =
  the FX hook time for the sim's 0.6 s windup, crouches, blasts through the notch at 0.335, holds), hit, die (sags, kneels, topples onto the shield),
  victory (shotgun hoisted, racking), deploy (shield slam landing, rack).
- BARB (barb.js): crouched hunter aim pose (lancer pattern + CROUCH baked in), needle rifle in root space on handR (flechette drum,
  three-prong muzzle, bayonet spike, scope at epic+), style.grip foregrip; custom thin digitigrade legs (hunterLegs); venom vials on the hips.
  Spines: aux0 quills (rows + inner short row), aux2/aux3 blade fans (re-parented to chest) + side quills, static lower-back quills on spine/chest.
  tick(): fan curve per action (OD flare z ±1.2 + scale, deploy snap, cast rattle, victory 0.65, die droop), R4 ripple/flex.
  Ranks: R0 broken spines · R1 base · R2 more rows + 1.18x length + extra blade · R3 glowing tips (quills + blades) + rifle rail ·
  R4 flex + forearm blades + a second long blade pair · R5 hardlight thorn crown ring (9 glowing thorns) behind the head.
  Anims: idle (predator head-snap scan every 4.6 s), advance (low stalk: gait feet re-solved after the crouch), attack (3 twitches, fire
  0.3/0.37/0.44), attack_alt (drops to one knee, fire 0.33), cast (slaps a venom drum, spines rattle), overdrive (rises on its toes + arches
  while the spines flare, then hunches and storms, fire 0.27), hit, die (folds sideways, curls, spines droop), victory (stands tall,
  rifle on shoulder, fan half open), deploy (three-point landing, spines snap open).
- FX: js/fx/units/riot.js (pellet spread + muzzle bloom + ejected red shell; OD floor slam spark fan + hex ring + dust, then fire-tongue cone
  beams + 140 particles across the whole front, explosions + weaken auras, shield glow light); js/fx/units/barb.js (3 needles that stick
  in the target as glowing spikes, crit = burn; OD 46 arcing flechettes from the flared back, targets bristle with long glowing needles + burn).
- testAll 0 fails. dc/tris (high, default rank per rarity): riot 6/12.9k · 6/13.0k · 6/13.6k · 7/14.2k; barb 6/9.0k · 6/9.3k · 6/10.4k · 7/11.4k.
  q=low: riot 10.7k (probably ok), barb 6.1k.
- Best screenshots: /private/tmp/claude-501/-Users-aaronair-cc-airon/9f0adda7-8cfb-4e58-acf3-950485f78a19/scratchpad/sculpt3/shots/final_bt_1.png (battle_test 412x915), /private/tmp/claude-501/-Users-aaronair-cc-airon/9f0adda7-8cfb-4e58-acf3-950485f78a19/scratchpad/sculpt3/shots/final_battle.png + /private/tmp/claude-501/-Users-aaronair-cc-airon/9f0adda7-8cfb-4e58-acf3-950485f78a19/scratchpad/sculpt3/shots/bv3c.png (gallery battle),
  /private/tmp/claude-501/-Users-aaronair-cc-airon/9f0adda7-8cfb-4e58-acf3-950485f78a19/scratchpad/sculpt3/shots/c_r3.png / /private/tmp/claude-501/-Users-aaronair-cc-airon/9f0adda7-8cfb-4e58-acf3-950485f78a19/scratchpad/sculpt3/shots/c_b2.png (3/4 close), /private/tmp/claude-501/-Users-aaronair-cc-airon/9f0adda7-8cfb-4e58-acf3-950485f78a19/scratchpad/sculpt3/shots/r05.png (R0/R5/low), /private/tmp/claude-501/-Users-aaronair-cc-airon/9f0adda7-8cfb-4e58-acf3-950485f78a19/scratchpad/sculpt3/shots/tf.png (tiers + factions), /private/tmp/claude-501/-Users-aaronair-cc-airon/9f0adda7-8cfb-4e58-acf3-950485f78a19/scratchpad/sculpt3/shots/sh_riot_a.png sh_riot_b.png
  sh_barb_a.png sh_barb_b.png (anim sheets), /private/tmp/claude-501/-Users-aaronair-cc-airon/9f0adda7-8cfb-4e58-acf3-950485f78a19/scratchpad/sculpt3/shots/od2_sheet.png (RIOT OD in battle), /private/tmp/claude-501/-Users-aaronair-cc-airon/9f0adda7-8cfb-4e58-acf3-950485f78a19/scratchpad/sculpt3/shots/b_idod.png (BARB OD flare).
IN PROGRESS
- nothing half-done in files.
NEXT (if more time)
1. BARB rare is 9.3k tris (budget floor 10k): spend it on segmented quills (2-part with a joint ring) and a back pack.
2. RIOT reads shield-first from the battle camera; the ref shows more arm/leg. Consider a narrower shield (0.72) or turning it 0.1 more outward.
3. Fine-tune the RIOT OD cone visibility at x1 (bubble shields of the player squad hide some of it).

## Requests (kit / battle) — none blocking
- battle: an anim's FX hook only runs on its first fire/impact event; multi-shot units (BARB burst) self-schedule with fx.after. A per-event
  hook (e.g. `attackEvent(ctx, index)`) would let later shots follow the exact anim frames.
- kit `legs()` uses `accent` for outer thigh / shin side plates; on red-accent units that paints big red boxes on the legs (BARB uses its own legs).
