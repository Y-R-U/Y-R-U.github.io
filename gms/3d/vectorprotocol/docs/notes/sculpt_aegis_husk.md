# sculptor-10 — AEGIS + HUSK

Owns: `js/actors/models/aegis.js`, `js/actors/models/husk.js`, `js/fx/units/aegis.js`, `js/fx/units/husk.js`, this file,
and one line per unit in `js/actors/models/index.js` (`import aegis ...; register(aegis);`, same for husk) and `js/fx/units/index.js`.
Scratch (drivers + screens): `/private/tmp/claude-501/-Users-aaronair-cc-airon/9f0adda7-8cfb-4e58-acf3-950485f78a19/scratchpad/sculpt10/`
(`shot.mjs` gallery, `ab.sh tag model` = front/back/battle composite, `sheet.sh` anim contact sheets, `od.mjs` / `fxtest.mjs` / `multi.mjs`
battle_test captures, `up.sh` restarts the CDP browser). CDP port **9419**.

## Checkpoint 1 — DONE
- aegis.js: slender white biped (PATCH language: big single lens face, white rounded shells, blue bolted bands, bezel lamps), palm
  emitters at the gauntlet tips (muzzle / muzzleL), back disc R 0.4 on aux0 leaning back (TILT -0.55) so the battle camera sees its face.
  Disc driven in tick(): attached local transform blended with a body-space free target (overdrive overhead, victory halo,
  attack_alt frisbee throw, die = drops off and settles like a coin), via chest mesh-space matrix inverse. R4 twin disc on aux1.
  All 10 anims bespoke (cast alternates palms, side in `unit._aegisSide`; `unit.aegisDisc` = disc bone for FX).
- husk.js: hover prototype: black-glass barrel torso with an open cavity + floating core (aux3), boxy sensor head + bolted-on test
  camera, violet shoulder domes, segmented gorilla arms + gravity fists, grav emitter tail (aux2). Gaps driven in tick() (PHASE-style
  rest offsets) per action; idle has a periodic "left arm drifts off and snaps back" glitch. All 10 anims bespoke.
- FX: aegis (hex bolt + afterimages, hex shatter impact, Barrier Matrix disc flare + beams + per-ally hex lattice snap),
  husk (gravity well + pull motes, floor shock/cracks/chunks impact, Fold In collapse knot + burst + taunt ring).
- testAll 0 fails. dc/tris high (default rank c/r/e/l): aegis 6/12.8k 6/13.4k 7/13.6k 7/13.8k; husk 6/9.0k 6/9.3k 7/10.9k 7/11.0k.

## Checkpoint 2 — DONE (first full pass + review round)
- AEGIS: disc moved back on a boom (aux0 [0,0.36,-0.43], R 0.4) so the leaned disc clears the pack; disc face = blue `accent` with white
  spokes/hexes (dark `metal` face read maroon under the arena's warm key). Overdrive arms fixed (upArm z must be negative overhead or the
  arms cross in ZXY order): now a clear arms-up V holding the spinning disc overhead. Slimmer hip plates. OD flash toned down (screen flash 0.025).
- HUSK: whole unit x1.15 (K in husk.js scales DIMS + parts), violet `paint` shoulder domes + yoke over the shoulders, black/violet fist tops,
  glow rims on the domes, smaller gap glows (the pink joint balls read as mage orbs), tighter gaps (R0 .055 / R1 .042 / R2+ .028 m).
- Battle checks: both read at 412x915 (`shots/final_ranks_battle.png`: AEGIS R0..R5 left, HUSK R0..R5 right; ladder visible at battle size).
- testAll: 0 fails for aegis/husk (the run's 48 fails are all `citadel`, another sculptor's file).
- dc/tris high (default rank c/r/e/l): aegis 6/12.9k 6/13.5k 7/13.7k 7/13.9k; husk 6/10.0k 6/10.2k 7/11.9k 7/12.0k. q=low: aegis 6.9k, husk 5.1k.
- Screens (scratch shots/): final_aegis.png, final_husk.png (front / back / battle), final_ranks_battle.png, sh_aegis.png + sh_husk.png
  (all 10 anims x 5 times), sh_aod2.png (AEGIS overdrive), fa_sheet.png (Barrier Matrix FX isolated), fh_sheet.png (Fold In FX), fc.png (factions).

## Checkpoint 3 — battle-4 hooks adopted
- AEGIS FX: `shield(ctx)` (5 small hex cells snap round the ally + floor hex, ~0.3 s; covers Projector wave-start shields and Barrier
  Matrix), `shieldBreak(ctx)` (hex shatter shards), `buff(ctx)` (fortify: hex plate + climbing rings).
- HUSK FX: `heal(ctx)` (Reconstitute / Fold In: motes pulled into the core, core flash), `buff(ctx)` (violet hex ring), `deploy(ctx)`
  (materialize + debris converging). Model now `noDrop: true` (it assembles on its plate; the deploy anim converges the segments).
- Checked live with `battle_test ...&charge=p3:1,p0:1`: no console errors. testAll 0 fails (whole tree, incl. citadel now).
- Sideways reach: AEGIS disc throw x <= 0.25 m, HUSK slams forward only (pelvis z <= 0.24 m). Both within limits.
- Not adopted (not needed): `shot(ctx)` (single-shot attacks), glow2, bodyScale (HUSK scales itself via K), mirrorSide.

## Honest self-review
- AEGIS ~6.5/10 at battle size: the white body + hex halo disc is unmistakable; legs are still plain blocks in close-up.
- HUSK ~5.5/10: reads as a squat violet hover tank with floating fists, but busy/noisy and dark next to PHASE; the gap glows are small at battle size.

## NEXT (if more time)
1. HUSK: bigger, cleaner primary shapes (fewer small parts on the torso), a brighter violet seam line down the arms so the gaps read at 90 px.
2. AEGIS: leg detail (calf plates, knee lamps), a less boxy thigh; check the legendary tint's red lamp near the head.
3. Fold In timing in a real sim-driven OD capture (battle_test ODs chain together, hard to isolate; fxtest with nostart=1 looked right).

## Kit requests
- (done by battle-4: `shield(ctx)` hook.) None open.
