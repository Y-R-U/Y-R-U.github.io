# sculptor-21 — ELF SAGE (`elf_sage`) + HUSK polish pass

Owns: `js/actors/models/elf_sage.js`, `js/actors/models/husk.js`, `js/fx/units/elf_sage.js`, `js/fx/units/husk.js`, this file,
one line in `js/fx/units/index.js` (`elf_sage`). CDP port 9432. Scratch: `<scratchpad>/s21/` (shot.mjs gallery driver, views.sh 3-view,
sheet.sh anim sheets, face.sh head close-up, bshot.mjs battle_test timed, odshot.mjs battle_test synced to an event (`TRIG` env = JS
predicate on `e`, default first overdrive), tile.py). Originals of HUSK kept as `s21/husk_orig.js`, `s21/husk_fx_orig.js`.

## Checkpoint 1 (DONE)
- elf_sage.js v1 live: floor-length robe (pelvis bell + one robe panel per thigh that swings with the leg + front tabard aux2 /
  back panel aux3 following the leading/trailing thigh in post), bell sleeves, leaf mantle (ranger language), long leaf-hemmed
  cloak + back hair on aux0, head x1.32 with big glowing eyes under dark lash lines, gold circlet + blue brow gem (R2), long ears.
  Staff on handR along +Z (rest frame), oriented with setHandQ (ranger technique) via `staff(P, ctx, grip, fwd, side)`;
  floating lumen crystal on aux1 (parented to handR) spins in post, bobs in tick. Rank ladder R0..R5 in the header.
  All 10 anims bespoke. NOTE battle plays `cast` for a mage's basic, so `cast` = LUMEN BOLT (fire 0.42); attack = sweeping
  arc bolt (fire 0.48); attack_alt = Verdant Bloom staff strike (cast 0.45); overdrive = staff lifted high (cast 0.14) then
  driven into the ground (impact 0.55), arms spread.
- fx/units/elf_sage.js: lumen bolt (blue orb + 2 spiralling sparks + light motes) and lumen burst impact; Verdant Bloom buff
  (light thread from the crystal + grass ring at the ally); regen heal ticks kept tiny (3 motes); Sanctuary Grove OD
  (dim 0.35, light pillar from the crystal, per ally: grass ring + 3 luminous trees + pillar + rings) + OD shot hooks
  (crystal flare on the cast frame, floor light ring + grass on the staff plant); OD heal = white column + leaves.
- HUSK polish: rebuilt the parts (anims/gaps/sockets/events untouched): fewer, bigger shapes; removed barcode, calibration
  markers, clamps, rib hoops, cable loom, vent slats; bright violet seam lines on the outer face of every arm segment + fist +
  breastplate V; **light spines** (glowing rods on the forearm/hand bones reaching up into the gap) so the floating-segment gaps
  read at 90 px; seams/spines/visor on the `eye` slot (ei 3.6+ even at R0, glow is only ~1.3 at R0); brighter violet paint on
  domes, black yoke for value contrast.
- testAll: 0 fails. dc/tris (high, default rank): elf_sage c/r/e/l 6/9.3k 6/11.9k 7/12.2k 7/12.6k; husk 6/7.9k 6/7.9k 7/9.2k 7/9.2k.
- Screens (scratch s21/shots): husk_before_views.png / husk_before_battle.png vs husk_a2_views.png / husk_a2_battle.png,
  husk_a3_ranks.png, sage_a2_views.png, sage_face2.png, sage_sheet1/2.png, sage_bt1_0.png (battle), sod_grid.png (OD), sbolt_grid.png.

## Checkpoint 2 (DONE)
- Sage: R4 = a 9-leaf gold fan behind the head (silhouette), gold leaf vines up the robe front (R1+), more lathe segments.
  Lumen bolt orb size up (0.75). OD lift/victory staff lowered so the crystal stays in frame.
- HUSK: paint deeper violet + less clearcoat/env, seams thinner (0.014). FX: particle sizes roughly doubled (chunks, sparks,
  heal motes, knot glow, rising motes) for phone scale. Anims, gaps, sockets and events are unchanged.
- testAll 0 fails. dc/tris (high, default rank): elf_sage c/r/e/l 6/9.5k 6/12.5k 7/12.9k 7/13.2k; husk 6/7.8k 6/7.9k 7/9.1k 7/9.2k
  (the +1 dc at epic+ is the kit motes).
- Final screens: sage_final_0.png (battle_test, fantasy ruins), sage_a3_views.png (R4), sage_ranks.png, sod_grid.png (OD),
  husk_before_after_battle.png, husk_before_views.png vs husk_after_views.png, husk_sheet.png.

## Honest self-review
- ELF SAGE about 6.5/10 against ref_fantasy_01: the white hair, green robe, gold hems and a staff taller than her with a blue crystal
  all read at battle size, and the face reads better than the ranger's (eyes, gem, ears). Weaker than the ref: the robe is
  smooth lathe cloth with no folds, the crystal blooms white-blue rather than deep blue, and the hands are simple.
- HUSK about 6/10 (up from 5.5): cleaner, brighter, and the seams and gap spines read at 90 px. The domes still go lavender
  under the arena env, so value contrast from the top camera is only moderate.

## Open issues / NEXT
- Sage: a fold/drape detail texture for the robe; a deeper blue crystal (it blooms to white); the regen heal hook fires once per
  second per ally, so it is kept to 3 motes.
- HUSK: dome finish (try the accent slot with a violet seam ring instead, if more contrast is wanted).

## Requests (kit)
- None yet.
