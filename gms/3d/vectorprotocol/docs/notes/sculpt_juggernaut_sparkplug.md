# sculptor-8 — JUGGERNAUT + SPARKPLUG

Owns: `js/actors/models/juggernaut.js`, `js/actors/models/sparkplug.js`, `js/fx/units/juggernaut.js`, `js/fx/units/sparkplug.js`,
this file, one line each in `js/actors/models/index.js` and `js/fx/units/index.js` (both registered).
Scratch: `/private/tmp/claude-501/-Users-aaronair-cc-airon/9f0adda7-8cfb-4e58-acf3-950485f78a19/scratchpad/sculpt8/` (shot.mjs, sheet.mjs,
evt.mjs, multi.mjs from sculptor-4; CDP_PORT=9417 required). Edit the models in scratch, `node --check`, then copy them in.

## Checkpoint 2: both units complete
DONE
- **JUGGERNAUT** (tracked, XL 2.21 m, authored in design units then scaled by `G = 1.03` across dims, parts, sockets and pose
  offsets in post()). It has a rusted tread hull (36 links per side, road wheels, sprockets on aux0/aux1 that roll in tick), a curved
  hazard-striped plough on aux3 with lift rams, an engine house, a cab-head raised on a hydraulic lift (caged windshield,
  visor slit, red lamp bar, mirrors, antenna), twin exhaust stacks (flames on thighL/R) and a saw boom on the right arm. The
  saw disc is on aux2 and spins at a per-action rate. A custom `rustMap` detail texture is applied to paint and accent.
  - Ranks: R0 torn-off left skirt, bent short stack, patched plough · R1 plain · R2 hazard bands, roll cage, cab armour ·
    R3 plough spikes, ripper teeth, chains · R4 orange-hot saw teeth and rim, glowing guard vents, ram horns, taller
    flame-cut stacks · R5 flame vents and jets along the hull (shinL/R) and a spinning beacon crown (footR).
  - **BIG RUSTY boss look = legendary rarity (r >= 3)**, because `boss_big_rusty` is legendary. It adds a wrecking-ball crane
    between the stacks. The crane is built on the left arm chain: clavL is the jib and foreArmL is a spring pendulum driven by
    the hull's pitch and surge in tick, with the ball on handL. It also gets a skull plate on the plough, skull cab doors, a
    wider plough and the beacon, plus gold trim from the kit. The battle draws the red boss ring and applies the x1.35 scale.
  - All 10 anims are bespoke:
    - idle: rumble, cab glance, boom lift and rev every 6.6 s.
    - advance: plough up, saw spinning.
    - attack Saw Ram: rear, lurch 0.22, saw bite. Impact 0.42.
    - attack_alt overhead chop: impact 0.5.
    - cast engine-rev taunt: cast 0.35.
    - overdrive Ram Rush: 2.4 s. It rears up 0.28 rad, then crashes forward 0.36 at the release u = 0.167 (0.4 s), grinds, slams a
      second time at 0.45, then reverses.
    - hit, die (engine chokes, hull lists, saw drops; down 0.55), victory (wheelies), deploy (plough raised, crunch, plough slam).
- **JUGGERNAUT FX**:
  - attack: sparks fan off the blade over 0.2 s, stack puff, dust.
  - impact: a 0.3 s grinding spark stream plus steel chips; a crit also gets a slash.
  - overdrive: both stacks belch flame and black smoke, tread debris, a quake (rings, hex ring, dust, shake 0.55), then an
    orange wave of crack rings rolls down the enemy column. Each target gets an explosion, a hex ring, chips, a skid back and
    stun rings. A second quake fires 0.68 s later.
- **SPARKPLUG** (biped, M 1.62 m): a hunched rust-orange scrap body, a transformer backpack on aux0 with two copper tesla coils
  (toroid caps), jagged arcs between the coil tops (two arc sets on aux2/aux3, re-rolled every 30–80 ms in tick), jumper
  cables trailing to the floor with red and black clamps, a welding-goggle head (amber), copper-wound forearms and oversized
  forked electrodes (muzzle and muzzleL).
  - Ranks: R0 left coil snapped and taped, bare left shoulder · R1 base · R2 third centre coil · R3 constant idle arcs ·
    R4 taller coils plus spark-gap horns · R5 ball-lightning crown orb on aux1.
  - Rarity: rare+ forearm capacitor cans · epic+ shoulder insulator stacks.
  - All 10 anims are bespoke:
    - idle: twitchy, self-zap spasm every 4.4 s.
    - advance: hunched shuffle.
    - attack jab: fire 0.36.
    - attack_alt one-two: fire 0.32 / 0.46.
    - cast Arc Zap, its basic attack in battle: pulls the electrodes back to the coils, then thrusts. Fire 0.42.
    - overdrive Arc Surge: arms flung overhead, slammed forward at 0.18 (0.4 s), held out shaking.
    - hit, die (overload spasm, kneel, face-plant; down 0.8), victory (alternate fists up, jig), deploy (crouch landing, electrode clap).
- **SPARKPLUG FX**:
  - attack: coil crackle, charge runs down to the hand, then a forked jagged bolt (re-struck every 50 ms) from both electrodes.
  - impact: flash, sparks, crackle cage, and the target's lights stutter (`flickerPower`).
  - overdrive: three bolts discharge up from the coils, then the chain hops target to target every 0.11 s. Each hop makes a new
    bolt, a flash and a 0.7 s blackout; lingering crackles follow and the last target grounds out in a ring.
- testAll: 0 fails (whole roster).
- dc/tris at high quality, default rank per rarity (common / rare / epic / legendary):
  - juggernaut: 6/17.3k · 6/17.2k · 7/18.6k · 7/21.9k (boss). q=low ~9.8k.
  - sparkplug: 6/8.8k · 6/9.4k · 7/10.9k · 7/10.9k. q=low ~4.2k.
- Screens (scratch shots/):
  - final_battle.png (gallery battle view, 412x915)
  - bk_sheet.png (battle_test against BIG RUSTY)
  - bi_0.png, bt1_2.png (battle_test)
  - j3.png, jl.png (boss from behind)
  - jr.png (ranks), jt.png (tiers)
  - jsh1.png, jsh2.png, ssh1.png, ssh2.png (anim sheets)
  - s1.png, s2.png
  - so_sheet.png (Arc Surge in battle), final_spark_r.png

NEXT (polish if more time)
1. JUGGERNAUT R2 to R3 step is subtle at battle size: make the plough spikes and chains bigger.
2. SPARKPLUG idle arcs are thin (0.006 m) and barely visible at battle size: thicken them or add a glow sprite. The R5 orb
   needs a bigger read.
3. Sparkplug's floor cables are fixed to the pelvis, so they lift off the floor in the die face-plant.
4. Two front-mid juggernauts (player vs boss) still overlap their saws mid-attack. This is acceptable for melee, but the boss
   x1.35 hull reaches the centre line.

## Kit requests
- The battle passes no `rank` or `boss` flag to createUnit, so every boss renders at its rarity's default rank (legendary = R3).
  A `boss: true` option (or the def's rank) would let BIG RUSTY show R5 crown parts as well. I currently key the boss look off
  legendary rarity.
- Socket support for extra named points (coil tops) would save FX code from looking bones up by name (`unit.bones.find(name)`).
