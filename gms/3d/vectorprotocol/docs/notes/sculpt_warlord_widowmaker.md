# sculptor-9 — WARLORD + WIDOWMAKER (bosses REDLINE + CORONA)

Owns: `js/actors/models/warlord.js`, `js/actors/models/widowmaker.js`, `js/fx/units/warlord.js`, `js/fx/units/widowmaker.js`, this file,
and one line per unit in `js/actors/models/index.js` + `js/fx/units/index.js`.
Scratch: `/private/tmp/claude-501/-Users-aaronair-cc-airon/9f0adda7-8cfb-4e58-acf3-950485f78a19/scratchpad/s9/` (`shot.mjs`, `v2.sh out model`
= front / 3/4 / back / battle crop, `sheet.sh` contact sheets, `od.mjs` frames after a named unit's overdrive, working copies
`warlord.js`, `widowmaker.js`, `fx_warlord.js`, `fx_widowmaker.js`: `node --check`, then copy into the tree). CDP port 9418.

## Checkpoint 1
DONE
- Both models built + registered, both FX files registered. Anims: all 10 bespoke for both.
- WARLORD: 2.15 m, horned helm (x1.28) sunk between huge spiked gold pauldrons, spiked crown circlet, throne back (twin
  gold-banded exhaust stacks + crest fan + backrest with glowing gang sigil), long arms, twin chainblades (blade axis
  Rx(BLADE_A=1.0)*z in the hand frame; `aimBlade/bladeIK/twin` IK), teeth on aux0 (handR) / aux2 (handL) slide along the bar in tick
  (rev speed 0.35 idle -> 9 m/s attacking). Trophy skulls on the belt + buckle. R4 trophy plates, R5 flame tips (aux1) + ember crown (aux3).
- WIDOWMAKER: 1.72 m, hooded head with one protruding gold scope-eye, tall cloak fins, tattered 2-row cloak (aux0/aux3),
  anti-materiel rifle (RIFLE_FRAME from a precomputed aim pose; `aimRifle()` orients it anywhere), bolt carrier aux1 cycles,
  bipod aux2 folds via quaternion, hourglass emblem, reticle crown R3+. Overdrive: vanishes (tick toggles unit.body.visible),
  reappears PRONE on the bipod, fires at 0.23 (= 0.6 s release), rises.

## Checkpoint 2
DONE
- testAll: 0 fails. Stats (high, dc incl. kit motes/aura): warlord R3 23.1k dc 7 · R5 25.3k dc 8; widowmaker R3 18.3k dc 7 · R5 19.3k dc 8.
- FX both units, verified in battle_test (isolated `p=-,warlord,...&e=bulwark,lancer,gunner`): Frenzy vortex (3 whirling rings of blade arcs,
  tangential sparks/scrap, two synced cleaves per target via `shot()` index 1/2, scorched rings), Blood Money `heal()` (gold coins streaming
  in). Last Light: dark screen flash, prone shot, gold/white/faction triple beam to 34 m past the target lingering 1.9 s, shock rings
  along it, exit spray, HP-bar shards, recoil dust. Basic: brake side jets + smoke + slug + faint line + casing; punch-through exit spray.
- Bosses: REDLINE (x1.35 rogue) = a towering gold/red warlord, CORONA (x1.35 corporate) = silver-white + gold champion with cyan
  lights (accent override 0xaeb7c4 for corporate). Eye stays gold in every tint.
- Contact sheets OK for all 10 anims (shots/ws1, ws2, ms1, ms2 in scratch).
- Note: the orange full-screen wash seen in some battle_test frames is the enemy SCRAPPER's overdrive, not these units.

## Checkpoint 3 (final for this run)
DONE
- testAll 0 fails. High-quality dc / tris: warlord R0 6/21.9k · R3 7/23.1k · R4 8/24.7k · R5 8/25.3k (low 13.8k);
  widowmaker R0 6/15.2k · R3 7/18.4k · R4 8/19.2k · R5 8/19.4k (low 11.5k). dc = 6 slots + kit motes (R2+) + aura (R4+).
- Events (gallery, 60 fps): warlord attack impact 0.43 s, alt 0.52, cast 0.58, OD cast 0.12 / impact 0.60 / 1.05; widowmaker attack
  fire 0.27, alt 0.55, cast 0.50, OD cast 0.12 / fire 0.60 (= sim overdrive windup 0.6 s). die down 1.65, deploy land 0.65 / ready 1.37.
- Widowmaker head reworked into a pointed hood (cowl peak over a dark face, smaller scope-eye). Scope objective lens = metal + small eye dot
  (the big emissive disc bloomed into a white square).
- Manager's reach rule (sideways <= ~0.5 model m): the prone pose was moved forward (pelvis z +0.12, hands z 0.92) so the body sits over its
  plate instead of trailing 1.25 m behind; the Frenzy spin holds the blades lower and closer (hand x 0.72, blade angled down).
  The spin still sweeps ~1.5 model m around him (it is a whirlwind); flag it if it clips the side buttons for REDLINE x1.35.
- Best screenshots: scratch `best/` (warlord_views, widowmaker_views, ranks_R0_R3_R4_R5, factions, battle_ranks, bosses_battle,
  warlord_frenzy, widowmaker_last_light, corona_last_light, redline_frenzy_and_corona, contact sheets ws1/ws2/ms1/ms2).
- In-game: `index.html?unlockall#/formation/m2_l14` opens the REDLINE deployment (boss in W3, behind the Field Manual popup);
  boss fights were judged in battle_test (`e=boss_redline,...` / `e=boss_corona,...`, `&charge=e1:0.85`), which uses the same battle scene.

OPEN / NEXT
1. Kit rarity rim (materials.js, legendary rim 0.75 gold) puts gold fresnel edges on every black plate, so both units lose some of the
   §9.1 dark-base value contrast. Kit owner's call; a per-slot rim override for `accent` would help dark legendaries.
2. legs() adds an orange shin glow strip at r >= 1 that reads loud on WIDOWMAKER's black legs; a `shinGlow: false` option would help.
3. Warlord is gold-heavy at battle size; more black on the thighs/shins could add contrast. Portrait framing includes the blades (head small).
4. The Last Light dark flash (screenFlash dark 0.6) is subtle under the beam bloom; a real `fx.dim()` hook would read better.

## Requests (kit / battle)
- (battle) createUnit in battle.js `spawn()` never passes `rank`, so every legendary shows R3 in fights. Please pass the unit's rank
  (and rank 5 for `boss: true` defs) so the R4/R5 tiers (and the bosses REDLINE / CORONA) show their full look.
- (kit) `M.motes.color` override (units.js createMotes uses gold for every legendary): WARLORD R5 wants orange embers.
- (kit) per-slot rim strength (or an `accent` rim opt-out) for dark legendaries; `legs({ shinGlow: false })`.
- (battle) Ghost Net (wave-start stealth) has no visual; a stealth status could call `unit.setPowerScale(0.4)` + a shimmer.
- (battle/fx) an `fx.dim(k, dur)` grade hook for "the battle dims" moments (Last Light uses a dark screenFlash as a workaround).
