# sculptor-18 — RIFT KNIGHT (`knight`) + ELF RANGER (`elf_ranger`) (D21 fantasy)

Owns: `js/actors/models/knight.js`, `js/actors/models/elf_ranger.js`, `js/fx/units/knight.js`, `js/fx/units/elf_ranger.js`,
one line each in `js/fx/units/index.js`. CDP port 9429. Scratch: `<scratchpad>/s18/` (shot.mjs, sheet.sh, views.sh, bshot.mjs).
FX lookup is `[unit def id, model id]`, so `knight` covers `rift_knight`; `elf_ranger` is both ids.

## Checkpoint 1 (DONE)
- knight.js: crowned great-helm (eye slit, keel, breaths, gold crown points), ellipsoid barrel breastplate with gold inlay tubes
  following the curve + engraved filigree detail texture (`engrave()` canvas fn), frustum-stacked pauldrons, mail under-layer,
  couters/poleyns/greaves/sabatons, blue tabard flaps on aux1/aux3 (follow thighs in post), kite shield (poseFrame guard),
  longsword with rift-blue fuller (blade frame + aimBlade IK, paladin pattern), cape on aux0/aux2 from R2. Rank ladder R0..R5 in header.
  Anims: all 10 bespoke (idle shield-rap taunt, Longsword Cut, shield bash + rising backhand, Oathbound sword-plant cast,
  Shieldwall Charge OD with shield lead + rift smite, hit, die to a knee on the sword, deploy kneel+rise, victory sword raise).
- elf_ranger.js: real bow rig. Bow authored on handL in its aim frame; `setHandQ` puts the hand in that frame at any pitch.
  String = aux2/aux3 (re-parented to handL) aimed at the nock point in post() and stretched in tick(); nocked arrow on aux1
  (re-parented to handR), aimed at the arrow rest each frame, hidden after the loose until the hand returns from the quiver.
  `archer(P, ctx, {k aim, d draw, pitch, rh})` drives all anims. Hood, white hair, long ears, glowing eyes, leaf mantle, quiver,
  lathed leaf-hemmed cloak (aux0), tunic tails on the thighs. 6 slots (no `eye`; eyes on glow; metal = white hair/string).
- FX: knight = rift crescent cut + lingering tear, shield-bash ring, Shieldwall Charge (hardlight kite wall rams the lane, stun
  stars, wake rings) + rift smite pillar/floor crack on OD shot #2, Oathbound buff sigil. elf = arrow streak with leaf trail,
  leaf burst impact, alt second arrow, OD volleys up into the sky per loose + arrow rain per target + entangle roots coiling up.
- Measured (high, default rank R1): knight dc 6 / ~13.7k tris; elf dc 6 / ~10k tris.

## Checkpoint 2 (DONE)
- testAll 0 fails. Knight OD now leads with the shield shoulder; steel darkened (0x8e98a6, metal 0.7, env 0.65).
- Battle-verified on battle_test (fantasy ruins arena auto-applies for fantasy squads) and the sci-fi arena: Shieldwall wall + crash,
  rift smite, arrow trail, Arrow Rain volleys + rain + roots all fire; screen flashes cut to 0.05 / 0.03 (they washed the frame).
- dc/tris (high): knight R0..R5 dc 6,6,7,7,8,8 (motes R2+, aura ring R4+ are kit) · tris 12.9k / 13.7k / 14.7k / 15.6k / 15.9k / 16.3k.
  elf R0..R5 dc 6,6,7,7,8,8 · tris 9.7k / 10.7k / 11.1k / 11.5k / 12.1k / 13.2k.
- Screens (scratchpad s18/shots): final_knight.png, final_elf.png, final_battle_1.png, final_gbattle.png, ranks_*.png,
  k_sheet1/2.png, e_sheet1/2.png, bk_grid.png / be_grid.png (OD sequences).

## Open issues
- Knight: from the top-down camera the domed pauldrons + helm read as bright chrome balls. Next: matte them (lower env or put
  the domes on a darker slot) or engrave them more heavily.
- Elf: the face is small at battle size and reads as a pale mask; it could use a bigger head or stronger brows/eyes. The legs are plain tubes.
- Elf victory pose reads small (bow overhead); could add a flourish.
- paragon.js duplicate `function mantle` broke the whole tree for a few minutes (since fixed by its owner). node --check does not catch it;
  check modules with `node --input-type=module --check < file`.

## Requests (kit)
- A per-anim hook to hide/scale a bone without tick() (the arrow-visibility and string-stretch pattern), e.g. `def.scales(P, ctx)`.
- Fantasy faction colours in battle FCOL (`order/wild/horde`): fantasy units get cyan as `palette.faction` in FX ctx right now.
