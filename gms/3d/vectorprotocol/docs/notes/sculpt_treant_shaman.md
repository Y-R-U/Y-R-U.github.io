# sculptor-19: TREANT (+ boss ELDERBARK) + HORDE SHAMAN

Owns: `js/actors/models/treant.js`, `js/actors/models/shaman.js`, `js/fx/units/treant.js`, `js/fx/units/shaman.js`, one line each
(`treant`, `shaman`) in `js/fx/units/index.js`. CDP port 9430. Scratch: `<scratchpad>/s19/` (shot.mjs gallery driver, bshot.mjs
battle_test driver, sheet.mjs per-frame contact sheets, odshot.mjs = frames timed from a named overdrive event; best/ = screenshots).

## Status: DONE (v1). testAll 0 fails.

### TREANT, "Old Growth" (wild epic tank, XL 2.45 m)
- Own geometry helpers in the file: `ridged` (twisting-groove bark trunk, smooth shaded), `slab` (flattened ridged bark plate), `barkRing`
  (layered slabs around a body section), tapered `branch` tubes, `bundle` (twisted vine limbs), `clump` (faceted leaf masses).
- Hunched walking oak: face set low in the trunk (V brow, glowing eyes, knot nose, jaw on aux3 with a heartwood glow), heartwood split in
  the chest, mossy boulder shoulders, moss mantle on the back (the battle camera sees tops), twig crown on aux1 (sways in tick), long
  vine-bundle arms with twig claws, root-flared shins with coiling roots, splayed root feet.
- Slots: paint = bark, metal = pale lichen/weathered wood (overridden to non-metal grey-green), accent = moss/leaves, trim = amber
  (mushrooms, blossoms), glow = sap, eye. 6 slots.
- Ranks: R0 bare twigs + stripped right shoulder · R1 base · R2 extra slab layers, mushrooms, hanging moss · R3 glowing heart crack, sap
  veins, forearm knot runes · R4 antler canopy on aux0 (silhouette) + blossoms · R5 floating halo of glowing leaves (aux2, spins).
- **ELDERBARK boss = o.r >= 3** (legendary; battle also passes rank 5): upper body x1.12 bulk and grey lichen bark (whole upper trunk on
  the pale slot, dark-bark limbs), 1.35x towering canopy with willow moss curtains, long lichen beard, a glowing Warden rune ring around the
  heart, Novaline's broken shackles + chain on both wrists and a snapped chain across the chest (story: "wrapped its roots in their
  chains"), runestones in the R5 halo. In battle it stays clear of the right button column in the far and mid back slots.
- Anims (all 10 bespoke): idle (creaking sway, shoulder roll + claw flex every 7 s), advance (heavy gait, rolling torso, swinging arms),
  attack ROOT SLAM (overhead double hammer, impact 0.5), attack_alt BRANCH SWEEP (backhand, impact 0.46), cast DEEP ROOTS (dig in, cast
  0.5), overdrive GRASP OF AGES (rears up arms wide + roar cast 0.1, claws plunge impact 0.52, heave impact 0.74), hit, die TIMBER
  (topples backwards like a felled tree, down 0.62), victory (arms pumping in a V, roaring), deploy (**noDrop**: grows out of the plate
  from a curled stump via pelvis scale in tick; land 0.3, ready 0.85).
- FX (`js/fx/units/treant.js`, also used by ELDERBARK via the model key): attack = claws quake + 3 roots race to the target + thorn burst;
  impact = splinters + entangle ring (crit: thorns); overdrive = rune circle + leaf storm, thick roots to every frontline target, coiling
  entangle (held ~2 s for the stun), thorns; shot = OD anim frames (roar leaves, plunge quake, heave dust); heal = regrowth grove (light
  saplings + leaf spiral) for Deep Roots and the OD self-heal; deploy = roots claw out, dirt + leaves. Roots = soft dark cords (alpha pool)
  with a growing green sap beam so they read on stone or the sci-fi floor.

### HORDE SHAMAN, "Bone-Drum Caller" (horde rare mage, M 1.72 m)
- Hunched pot-bellied orc caller (minotaur-kin horns + tusks, big ears), horned beast-skull headdress with a red feather fan (aux1), fur
  mantle + back cloak, bone necklace with a skull, red loincloth, war paint, hide frame drum on the left hip (spine), femur drumstick in
  the right fist, gnarled totem staff in the left fist (modelled upright with poseFrame for the hunched hold) with a horned skull,
  fetish strings and a spirit flame.
- Slots: skin (olive), paint (fur/wood/leather), accent (red), metal (bone), trim (bronze), glow (fire; eyes too, no eye slot). 6 slots.
- Ranks: R0 bare skull cap, small drum · R1 skull headdress + 3 feathers · R2 bigger mantle, shoulder skull, fetishes, necklace · R3 war
  paint/drum sigil/eyes glow, staff skull burns · R4 back totem pole with skulls + banner · R5 orbiting ring of spirit flames (aux2).
- Anims (all bespoke): `beat()` IKs the femur knob onto the drum head; `staffArm()` keeps the staff upright (wrist cancels arm pitch) and
  `thrust` tips the skull at the target. cast = HEX BOLT (the battle's mage basic: drum strike cast 0.3, staff thrust fire 0.58), attack
  (totem jab, fire 0.42), attack_alt (double beat 0.22/0.38 + skull swing fire 0.62), overdrive BLOOD TOTEM (staff slam impact 0.22, drum
  roll casts 0.4/0.5/0.6/0.7, roar 0.86), idle (muttered drum taps every ~5 s), advance (staff as walking stick), hit, die (knees then
  face-down, down 0.8), victory (war dance + drumming), deploy (**noDrop**, rises from red smoke; land 0.3, ready 0.8).
- FX (`js/fx/units/shaman.js`, keyed `shaman`; horde_shaman falls through to it): drum-beat pulse rings from the drum socket, spirit-flame
  bolt with burning trail + red smoke, impact fire + hex (weaken) sigil, OD fire pillar at the staff foot, blood pulses over the squad per
  drum beat, red flames on every ally (buff hook: overclock/haste/War Drums), red-smoke deploy.

### Numbers (high quality; dc includes kit motes R2+ and aura ring R4+)
| unit | R0 common | R1 rare | R2 epic | R4 | R5 | boss (leg R5) | low q |
|---|---|---|---|---|---|---|---|
| treant | 5 / 10.3k | 5 / 11.4k | 7 / 13.9k | 8 / 15.6k | 8 / 15.9k | 8 / 18.3k | 6 / 5.1k (boss) |
| shaman | 6 / 9.1k | 6 / 9.5k | 7 / 10.6k | 8 / 11.8k | 8 / 12.4k | - | 6 / 4.8k |
Battle 6v6 with treant + shaman + boss: 60 fps, ~117 calls.

### Screenshots (`<scratchpad>/s19/best/`)
treant_single, treant_ranks, elderbark_single, elderbark_battle (far slot / mid slot / mid in OD), treant_grasp_battle, shaman_single,
shaman_ranks, shaman_bloodtotem_battle, battle_gallery, anim sheets tsh1-3 (treant), ssh3-4 (shaman).

### Open issues
- Leaf clumps are faceted low-poly balls: they read as foliage at battle size, but up close they are more toy-like than the painterly ref.
- The shaman is a little under the rare tri target (9.5k vs 10-16k); the extra budget could go into feathers/fur cards.
- The entangle coils (soft dark particles) are subtle on the dark stone floor; the green sap beams and rings carry the read.
- The big boss in a mid slot covers its neighbours (acceptable for a boss, layout question).
- The arena light is warm on the new fantasy theme and lifts the bark to a tan. If the fantasy theme is final, the bark could go a step darker.

### Requests (kit / battle)
- A per-rarity palette override (e.g. `paint: { wild: {...}, legendary: {...} }` keyed by rarity) would let the boss swap bark tone without
  moving geometry to another slot.
- A "root"/ribbon primitive in the FX toolkit (a lit, normal-blended tube or strip that grows along a curve) would make vines and roots
  much more solid than particle chains.
