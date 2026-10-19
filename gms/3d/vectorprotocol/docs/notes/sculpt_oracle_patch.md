# sculptor-6 — ORACLE + PATCH

Owns: `js/actors/models/oracle.js`, `js/actors/models/patch.js`, `js/fx/units/oracle.js`, `js/fx/units/patch.js`, this file,
and the lines `oracle:` / `patch:` in `js/fx/units/index.js`.
Scratch (drivers + screens): `/private/tmp/claude-501/-Users-aaronair-cc-airon/9f0adda7-8cfb-4e58-acf3-950485f78a19/scratchpad/sculpt6/`
(`shot.mjs` gallery, `shot2.mjs` any tools page, `multi.mjs` battle_test frames, `od.mjs` frames after a named unit's overdrive,
`fxtest.mjs prefix query model hook delays` = calls a unit FX hook by hand in a live battle_test (clean FX judging, no other ODs),
`sheet.sh` anim contact sheets, `tile.py`). Working copies of the model files live there too (`node --check`, then copy into the tree). CDP port 9415.

## Key facts learned (battle integration)
- battle.js plays **`cast`** (not attack) for every mage basic attack; launch() fires on the first `fire`/`cast`/`impact` event.
  So `cast` = the basic attack anim for both units (Null Orb / Mend Beam). attack/attack_alt are still built (gallery + future use).
- Overdrive FX hook runs at fireT = 0.4 s after the anim starts (AREA windup) -> both release poses sit at u = 0.167 of a 2.4 s overdrive.
- Heals: sim `heal` events draw a generic fx.heal + short green beam; the `impact` hook is NOT called for heals. PATCH's
  signature heal visuals live in `attack` (Mend Beam to lowest-HP ally) and `overdrive` (Triage Field over all allies).
- Board units are 1.9x; ring `thick` in vfx rings is relative to the ring radius (big rings need thick ~0.01-0.02 or they white out).
- The HP bar anchors at height*1.08: PATCH reports height 1.45 (body is 1.1 m, the holo-cross floats above) so the bar clears the hologram.

## Checkpoint 1 (first full pass) — DONE
- ORACLE (biped per ROSTER, replaced the hover stub): slim masked head under two big swept horn fins (lilac hardlight inner blades),
  black bodice + violet V breastplate + sternum gem, wasp waist corset, flared 9-blade coat-skirt split at the front (alternating
  violet/black blades, lilac/violet hem bands, dark lining), slim legs on pointed heels, bell bracers, pauldron vanes, back blades.
  Null orbs (R 0.13) = violet core in a violet/black cage with radiating shards. Palette = HALO's (coherent with the experimental set).
  Ranks: R0 chipped left horn, no seams · R1 base · R2 horns grow + lower horn pair + orb hardlight rings · R3 orbs ORBIT the body in
  idle, horn edge + coat hem glow · R4 floor rune circle + third orb circling the head (aux1 re-parented to the pelvis and pinned to
  the floor in tick) · R5 halo + crown spikes behind the head. Epic+: second coat layer, longer back blades.
- ORACLE anims (all bespoke): idle (contrapposto weave + conducting flourish every 7.2 s), advance, cast = NULL ORB (alternating arm
  draw + thrust, fire 0.32, the thrown orb vanishes and re-forms), attack (twin push, fire 0.38/0.43), attack_alt (toe pirouette, fling
  at 0.6/0.64), overdrive ORB CASCADE (arms overhead, orbs swell 2.3x and merge, hurl at 0.167, then LEVITATES with pointed toes and
  conducts, orbs re-form at 0.92), hit, die (orbs drop and roll beside the feet, kneel + fold), victory (V arms, orbs circling overhead), deploy.
- PATCH: white beach-ball shell (R 0.29) with a raised red-cross cap, side crosses, mint equator band + bolts, dark belly with thruster
  glow + grille rings, ONE big lens on the head bone (swivels inside the shell) under a blinking eyelid (aux0 -> head), antenna, nanite
  canister on the back, stabiliser "ears", four thin repair arms (front: beam emitter = muzzle + claw; rear on the leg bones: syringe + scanner),
  3D glowing holo-cross (three bars: reads as a plus from any angle) floating above (aux1 -> pelvis).
  Ranks: R0 taped crack + dented belly plate · R1 clean · R2 extra arm pair (aux2/aux3 -> chest) + side lamps · R3 holo-cross ring with
  4 orbiting mini crosses · R4 hardlight stabiliser wings · R5 crown ring of 6 crosses. Rare+: glow equator seam; epic+: thruster ring + antenna.
- PATCH anims (all bespoke, hover): idle (bob, lens glances, blink every 3.7 s, happy wiggle + eye-smile every 6.1 s), advance (tilt + trailing
  arms), cast = MEND BEAM (lean in, emitter arm out, fire 0.3, holds), attack (twin emitters), attack_alt (scan spin + beam at 0.6),
  overdrive TRIAGE FIELD (crouch, pops up 0.45 m, starfish arms at 0.167, holo-cross swells 2.8x and spins fast), hit (knock + squint),
  die (thrusters sputter, drops, bounces, rolls on its side, cross fades), victory (bounce-spin, waving), deploy (curled drop, squash, eye opens).
- FX oracle: attack = thrown orb (white core, tail, two spiralling motes) from the palm that threw it (`unit._oracleSide`); impact =
  IMPLOSION (rings + motes collapse inward, then white star pop); overdrive = two big orbs arc to an apex over the enemy squad, spiral round
  each other over a floor void vortex, split one-per-enemy and dive -> implosion + violet floor cracks + hex ring.
- FX patch: attack = live mint beam (follows both ends) + white core + nanite motes streaming, plus-sign pop at the emitter, patient gets a
  heal ring + three rising plus-signs; overdrive = giant plus over PATCH, lances to every ally, wireframe dome of mint latitude rings, nanite
  rain, plus-signs + cleanse sparks on every ally.
- testAll: 0 fails for oracle/patch (32 fails in the run, all `prism`: "Cannot access 'ctr' before initialization" — sculptor-5's file).
- dc/tris (high, default rank per rarity; c/e/l approx = measured before the last detail pass + ~1k): oracle ~6/9.8k(c) · 6/10.3k(r, R1) · 7/11.6k(e) · 7/12.2k(l); patch 6/9.1k(c, R0) · 6/9.0k · 7/9.8k · 7/10.7k (+1 = kit motes).
- Best screens (scratch): `shots/op5.png` (both singles), `shots/o4c.png` (oracle front/back), `shots/bu_crop.png` (battle size),
  `shots/odp_sheet.png` + `shots/fp_sheet.png` (Triage Field), `shots/ft2_sheet.png` (Orb Cascade), `shots/os1.png` / `shots/ps1.png` (anim sheets),
  `shots/or_ranks.png` / `shots/pa_ranks.png`.

## NEXT (honest self-review, ~6/10 at battle size for both)
1. ORACLE orbs bloomed pink-white; applied robots' advice `mats.experimental.glow = { color: 0x9a3cff, ei: 2.6 }` -> more saturated, still a
   little magenta. Next: try 0x7a2cff / ei 2.0, or move non-orb glow parts to `eye` and push the orbs harder.
2. ORACLE upper body is still small next to the coat from the 49 deg camera; consider bigger pauldron vanes / longer horns at R1.
3. Orb Cascade is readable but busy fights bury it; the apex orbs could get a dark "void" core (needs a normal-blend pool, see requests).
4. PATCH R0 vs R1 differ only in small wear; fine for a common but could add a mismatched arm at R0.
5. Not checked yet: view=factions for both, `&q=low`, 390x844.

## Kit requests
- A second emissive tint slot (or per-part emissive colour via vertex colour) so ORACLE's orbs can be deep violet while seams stay faction glow.
- FX: a normal-blended (dark) particle kind for "void" cores; additive pools can't draw black.
- (from the battle) `impact` hook isn't called for heals; a `heal(ctx)` hook would let medics own their heal-landing effect instead of the generic one.
