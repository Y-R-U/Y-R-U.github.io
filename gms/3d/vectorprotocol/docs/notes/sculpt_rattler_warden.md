# sculptor-7 — RATTLER + WARDEN-3 (map-1 commons)

Owns: `js/actors/models/rattler.js`, `js/actors/models/warden.js`, `js/fx/units/rattler.js`, `js/fx/units/warden.js`, this file,
plus one line per unit in `js/actors/models/index.js` (`import x from './x.js'; register(x);` after the main register loop) and in `js/fx/units/index.js`.
Scratch (drivers + screens): `/private/tmp/claude-501/-Users-aaronair-cc-airon/9f0adda7-8cfb-4e58-acf3-950485f78a19/scratchpad/sculpt7/`
(`shot.mjs` gallery, `views.sh model out.png` 5-angle strip, `evalpage.mjs` eval on the gallery page, `multi.mjs` battle_test frames,
`od.mjs` frames after a unit's first overdrive, `sheet.mjs` + `tilesheet.py` anim contact sheets). CDP port 9416.

## Checkpoint 3 (final pass) — both units complete
DONE (since checkpoint 2)
- rattler: custom thin legs + sneakers (lanky read; kit legs() made fat black thighs), headphones over the hood, spray cans on the back,
  zip/pocket/drawstrings, knee pistons, guns scaled 1.2x (GS) so they read at battle size, height 1.2, rogue hood kept vivid on R0 primer
  (`mats.rogue.paint.color`), die rewritten as spin -> knees -> face-plant.
- warden: battery pack white with navy PROPERTY OF HALVORSEN band (player units are seen from behind), SECURITY band lifted onto the
  buckler dome, baton held forward-low (wrist + cant).
- FX: rattler OD heavier (48 rounds, thick orange tracers + bolts on the 8 hits, opening spark cones + floor ring). Verified in battle_test:
  the fan reads; Lockdown cage reads (it even stuns enemy RATTLER mid-OD: "INTERRUPTED").
- Events verified (`__gallery.events`): rattler attack 6x fire, alt 8x fire, cast 1, OD cast + 18x fire, die down, deploy land/ready;
  warden attack/alt impact, cast, OD cast + impact, die down, deploy land/ready.
- testAll 0 fails. q=low: rattler 4.3k / warden 6.2k, same read.

| model | rarity (default rank) | dc | tris high |
|---|---|---|---|
| warden | common R0 / rare R1 / epic R2 / legendary R3 | 6 / 6 / 7 / 7 | 10.5k / 10.9k / 11.4k / 11.9k |
| rattler | common R0 / rare R1 / epic R2 / legendary R3 | 6 / 6 / 7 / 7 | 8.5k / 8.6k / 9.1k / 9.5k |
(+1 dc from R2 = kit motes, R4+ = kit aura ring.)

Screens (412x915 dpr2): /private/tmp/claude-501/-Users-aaronair-cc-airon/9f0adda7-8cfb-4e58-acf3-950485f78a19/scratchpad/sculpt7/shots/final_rattler_single.png, final_warden_single.png, final_*_tiers.png, final_*_ranks.png,
final_battle.png (gallery battle, pranks 0..5 / eranks 5..0), final_bt_0..2.png (battle_test), final_warden_back.png, low.png (q=low),
odr7_sheet.png (RATTLER OD in battle), odw_sheet.png (WARDEN Lockdown), sw1/sw2/sr1/sr2.png (anim contact sheets).

Honest read vs ref_battle_02: both are clearly identifiable at battle size (orange-hooded lanky gunner; white/navy mall-cop tank with a
light bar) and humbler than the rares. Still below the ref's painterly density: the warden's buckler is hidden on player units (far side),
the rattler is small (S) and its R1-R3 steps are subtle at battle size.

NEXT (if more time)
1. RATTLER: R3 could add a glowing hood rim (now R4) so the ladder steps read at battle size.
2. WARDEN: rare+ silhouette element (e.g. a riot visor flip-down or shoulder lamp) so common vs rare reads at 120 px.
3. Tune Lockdown shock-ring speed vs the lunge so the ring visibly travels before the cage.

## Checkpoint 2 (~2 h)
DONE
- warden.js: light-scheme squat biped (off-white paint / navy accent / dark navy metal / amber emissive trim lamps), dome head + wrap visor,
  police light bar (amber strobes aux2, cyan strobes aux3, re-parented to the chest, scaled on/off in tick: idle alternates, cast/OD/victory
  double-flash, die flickers out), dark navy buckler with white rim + SECURITY band (left hand IK'd to a chest-space point so the forearm
  lies across the body; buckler authored in root space via poseFrame), stun baton (handR) with glowing tip + coil rings, battery pack
  "PROPERTY OF HALVORSEN", pistons at elbows/knees, utility belt, badge, walkie.
  Ranks: R0-1 dented buckler + bare-metal mismatched right pauldron + exposed side frame + "3" · R2 full panels + "03" · R3 buckler hardlight edge
  + baton coils glow · R4 hex hardlight frame round the buckler + bar masts · R5 floating holo badge crown (aux1 spins).
  Rarity: rare+ second pauldron layer + forehead lamp · epic+ thigh plates + knee lamps · legendary gold dome crest.
  Anims (all bespoke): idle (patrol head sweep, taps baton on buckler every 6.2 s), advance, attack (overhead baton chop, impact 0.42),
  attack_alt (buckler punch then shock jab, impact 0.52), cast (buckler + baton raised, strobing, cast 0.4), overdrive (Lockdown: baton
  overhead, slams the floor on one knee at 0.29 = sim 0.6 s windup, holds, rises), hit, die (staggers, sits down hard, tips onto its back,
  down 0.72), victory (baton twirls every 2.8 s, points it skyward), deploy (crouch landing, raps the buckler).
- rattler.js: slouched lanky S biped (black accent jacket, hazard-orange paint hood/guards, light gunmetal limbs, yellow trim tags/brass),
  deformed hood cowl (beaked brow, flared drape) over a dark faceplate with orange eye slits, headphones, bandolier, zip + drawstrings,
  custom thin legs + sneakers, spray cans on the back, dual SMGs (hands IK'd to chest-space points, wrists re-aimed exactly by aimHand),
  mags on aux2/aux3 drop out / slap back in during the reload.
  Ranks: R0-1 base · R2 extended stick mags + scarf · R3 tags/headphone caps/gun sights glow · R4 hood fins + glowing hood rim + 3rd SMG on the back
  · R5 floating graffiti crown (aux1 spins). Rarity: rare+ left shoulder pad + knee pads · epic+ thigh holster + monocle · legendary chain + gold.
  Anims (all bespoke): idle (head-nod to a beat, spins the right SMG every 5.5 s), advance (slouched jog), attack (6-round alternating
  burst 0.24..0.54), attack_alt (gangsta-rolled guns, crouch sweep, 8 rounds), cast (reload, cast 0.55), overdrive (Spray & Pray: hop,
  arms flung wide, full spin while firing 18 events 0.23..0.86), hit, die (spun, knees, face-plant, down 0.7), victory (fires into the air
  in turn, bouncing), deploy (landing with guns crossed, twirls both).
- FX: js/fx/units/warden.js (baton crackle arcs + shock ring + arcs crawling on the target; Lockdown = floor slam burst, shock rings racing
  down the lane, 2 s hex cage of beams + hex rings round the target). js/fx/units/rattler.js (6 alternating tracer bolts + brass from both
  guns; OD = 48-round fan: 8 scheduled hits on the sim's random targets, wild rounds ricochet off floor/walls, opening spark cones).
- Registered: models/index.js (2 lines after the register loop), fx/units/index.js (2 lines). testAll 0 fails.
- dc/tris (high, default rank per rarity): warden 6/10.5k · 6/10.9k · 7/11.4k · 7/11.9k; rattler ~6/8.5k (common R0).
IN PROGRESS
- polish rounds (battle_test reads, rank ladder visibility).
NEXT
- isolated OD captures; q=low check; final screenshots + table.

## Checkpoint 1 (~45 min)
DONE
- warden.js v1 registered: squat off-white biped, small dome + wrap visor, light bar (amber strobe aux2 / cyan strobe aux3 on the chest,
  scaled on/off in tick), buckler on foreArmL authored in root space (left hand IK'd to a chest-space point so the forearm lies across
  the body), stun baton on handR, battery pack with faux "PROPERTY OF HALVORSEN" lettering, rank ladder R0..R5, all 10 anims bespoke.
- rattler.js v1 registered: slouched lanky biped, orange hood cowl, bandolier, dual SMGs (hands IK'd to chest-space points + exact wrist
  aim via `aimHand`), mags on aux2/aux3 drop during the reload cast, graffiti tag scribbles (trim, glow at R3+), all 10 anims bespoke.
IN PROGRESS
- rattler hood shape (v3 = shell + brim band + back plate); judging in arena light.
NEXT
- FX files for both; battle_test review; testAll; tris (rattler ~7.6k, below the 8k floor).

## Kit requests
- A second emissive colour slot (or per-part emissive tint): WARDEN's amber light-bar strobes use `trim` with an emissive override, so every
  trim part glows amber (incl. the kit legs() thigh trim strips) and legendary GOLD trim also glows. An `amber`/`glow2` slot would fix it.
- battle_test: a `&charge=` (initial charge per unit) param would make isolated Overdrive captures easy; today the other squads' ODs and
  stuns get in the way (RATTLER was stunned out of its OD by an enemy WARDEN).
- battle (same as sculptor-3): attack FX hook only runs on the first fire event; RATTLER self-schedules its 6 rounds with fx.after.
