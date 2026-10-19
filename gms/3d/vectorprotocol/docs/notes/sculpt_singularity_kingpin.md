# sculptor-16: SINGULARITY + KINGPIN (legendary mages; SINGULARITY is also the final boss VECTOR PRIME)

Owns: `js/actors/models/singularity.js`, `js/actors/models/kingpin.js`, `js/fx/units/singularity.js`, `js/fx/units/kingpin.js`, this file,
and one line each per id in `js/actors/models/index.js` and `js/fx/units/index.js` (all four registered).
Scratch: `/private/tmp/claude-501/-Users-aaronair-cc-airon/9f0adda7-8cfb-4e58-acf3-950485f78a19/scratchpad/sculpt16/`. It holds the model working
copies and drivers from sculpt11 plus `od.mjs` from s14. Queries are relative to `tools/`, for example
`node shot.mjs out.png "gallery.html?view=single&model=singularity" 600 700 1 1500`. Set CDP_PORT=9427.
To change a model, edit the scratch copy, run `node --check`, then copy it into the tree.

## Checkpoint 2 (hand-back)
DONE
- **SINGULARITY** (hover, 1.75 m) reads as a floating eye.
  - Core: a black-hole core. True black comes from a lensing billboard (one extra draw call, `unit.extraDrawCalls`) with a photon
    ring and a swirling halo, at every rank.
  - Iris: a gold iris ring in the side plane, so the battle camera looks straight at it.
  - Eyelids: two crescent eyelid arms (upArm = upper lid, foreArm = lower lid, both re-parented to clav on one pivot). They part
    to fire and spread like wings in the overdrive.
  - Accretion disc: a horizontal disc on aux2 that spins, with a hot gold inner band, black plates and gold plates.
  - Inner gimbal: a ring on aux3 that also holds the core and is scaled in tick for swell, collapse and grow-in.
  - Other parts: a collapse engine at the back (aux0), a floating sensor crown (head, with its own bob) and a tail of floating
    segments (thighL chain, hipX 0).
  - Palette: gold paint, black-glass accent, pale lilac trim, violet glow, gold-white `eye` (hot bands). There is no `metal` slot,
    so the unit is 5 slots plus the lens.
  - `noDrop: true`: it blinks in from a point.
- **VECTOR PRIME** is SINGULARITY at rank 5. battle.js passes rank 5 for bosses, so a player's R5 also gets the Prime form.
  - The V: a great V of light rises from under the eye and frames it, so it reads as the arena logo. aux0 counter-yaws in tick,
    clamped to ±0.8 rad, so the V stays square to the side-on camera while the boss turns toward its targets.
  - Head: a pearl mask with a cyan V visor and a gold V-crown made of two crossed V sigils.
  - Colours: `glow2` cyan replaces the gold `eye` band, so the accretion band, lid tips and the V's strips are cyan, fading to
    violet toward the core ("corporate light turning to void"). The lens ring is cyan.
  - Extra parts: a dashed cyan Protocol HUD ring around the eye, black void shards on the outer edge of the disc, and data cables
    with cyan tips trailing from the keel.
- **KINGPIN** (hover, 2.0 m) is a fat crime-boss robot lounging on a gold throne-pod. The pelvis is the pod. He sits with legs
  forward and down.
  - Outfit: fedora (black, red band and gold band), a monocle on a chain, a cigar with a glowing tip, a gold jaw grille, gold
    epaulettes with fringe, a fat gold chain and medallion, a red cravat, and a spiked rogue collar.
  - Throne: a tufted red-velvet backrest, a crown crest with an orange gem, gold scroll armrests, exhaust stacks, three thruster
    bells and a footrest.
  - Hive racks: two racks behind the throne (aux2 and aux3, moved behind so the side camera still sees the boss). They have
    honeycomb cells, each with a parked drone, orange cell glow from R3, and side cells from R2.
  - Bodyguard drones: these sit on aux1 (re-parented to the pelvis). There are 3 hovering at R3–R4 and 6 orbiting at R5.
  - Trim is velvet: red for rogue, navy for corporate, purple for experimental. It is set per faction in `mats` (a faction entry
    replaces `mats.all.<slot>` wholesale, so the full slot options are repeated).
- **Rank tiers.** The full ladders are in each model's header comment. Both units step visibly R0→R5: battered, then base, then
  extra plates, then crest and glow, then the R4 silhouette change, then the R5 crown element.
- **All 10 anims are bespoke** for both units, with these events:
  - SINGULARITY:
    - cast: fire at 0.45. The lids part and the core pulses.
    - attack: fire at 0.4, a pincer snap.
    - attack_alt: fire at 0.32 (upper lid flick) and 0.58 (lower lid).
    - overdrive: cast at 0.05, fire at 0.17. It rises, the lids fly open into wings, the core swells to 1.8× and is hurled, then it
      recoils.
    - die: down at 0.62. The core collapses, the lids fall open, and it tips onto its side.
    - deploy: ready at 0.8. Lids sealed, the core grows from a point.
    - idle: blinks open every 7 s.
    - victory: lids wide open and a fast disc spin.
  - KINGPIN:
    - cast: fire at 0.42, a two-finger point.
    - attack: fire at 0.35 and 0.5, a two-hand "go".
    - attack_alt: fire at 0.3, 0.5 and 0.7, three finger snaps.
    - overdrive: cast at 0.05, then 10 fires from 0.2 to 0.605. He leans out with arms flung wide, the racks swing open and the
      drones whirl.
    - die: down at 0.58. The pod drops and lists, he slumps, the racks fall open and the drones drop.
    - deploy: land at 0.42, ready at 0.85. The racks unfold and he adjusts his hat.
    - idle: finger drumming and a cigar puff every 8 s.
    - victory: leans back laughing.
- **FX: SINGULARITY**
  - attack: a violet (Prime: cyan) bolt with a black pearl of darkCore discs riding it.
  - impact: an implosion of a dark disc, inward streaks, a gold or cyan ring snapping shut, and a star.
  - shot, overdrive index 0: light is drained from every enemy into the core.
  - shot, overdrive fire: a recoil ring.
  - deploy: rings contract into a black point, then a hex ring.
  - **Collapse:** `fx.dim(0.45)`. The core is thrown; a black-hole billboard (the same lens shader, world-space, at y 5.2) with a
    gold accretion disc forms over the enemies; tethers and streaks pull from each enemy; enemies lean in with `fx.lean`; then it
    implodes in a gold-white ring plus a floor shock.
- **FX: VECTOR PRIME Cataclysm** (keyed on `boss_cataclysm` or rank 5):
  - `fx.dim(0.8)`, slow-mo, cyan drain beams and hex rings under every enemy (the charge).
  - A giant V of cyan and white beams is drawn over the enemy board facing the camera, then folds into the hole.
  - The hole (y 6) has a cyan disc that burns violet, and light streams in from across the arena.
  - Hex locks stamp every enemy (the stun), with tethers and a hard lean.
  - A beat of black, then a white-cyan implosion and a shockwave that sweeps the board.
- **FX: KINGPIN**
  - attack and shot: hive puff, then a drone flies on an orange trail, hovers over the target, stings it with two red zaps and pops.
  - Swarm Contract:
    - cast shot: `fx.drones` cloud round the throne plus rack bursts.
    - overdrive: two drone sorties per pick (about 20 drones), some fly home, and a swarm cloud forms over the enemy side.
  - buff: overclock arrives as a gold drone that drops a coin-ring on each ally.
  - deploy: thruster ring and smoke, plus the default beam.
- testAll: 0 fails (whole roster), run twice.
- **Stats** (high quality, kit draw calls by rank R0–R5; tris):
  - singularity: dc 5 5 6 6 7 7; tris 9.3k 12.1k 14.7k **16.3k (R3)** 17.8k **21.1k (R5, Vector Prime)**. Plus 1 lens draw call
    at every rank, so 8 at R4–R5 including motes and aura. q=low: 6.1k–14.1k.
  - kingpin: dc 6 6 7 7 8 8; tris 11.7k 13.8k 16.9k **18.4k (R3)** 22.5k 23.9k. q=low: 5.4k–7.5k.
- **Screens** (scratch `shots/`):
  - final_vp_cataclysm.png: in battle_test, the V of light over the player board and Prime's own V wings.
  - vp_final_seq.png, holes3.png: Cataclysm and Collapse sequences.
  - so_sheet.png, ko_sheet.png, vp_sheet.png: overdrive sheets.
  - sh_sing.png, sh_king.png: anim contact sheets.
  - ranks.png (R0..R5 for both), s12.png (R3 and R5 close-ups), kk.png (kingpin side and 3/4), b3c.png (both units plus the boss in
    battle).

OPEN
1. The core's black disc reads as dark rather than pure black in the gallery, because bloom from the photon ring washes over it.
   In battle it is black. The world-space Collapse hole still reads dark-gold, not black, under bloom.
2. In battle, SINGULARITY at R0–R2 reads mostly as a "gold gyroscope". The black core and disc carry it; the eyelid motion is subtle
   at battle size.
3. KINGPIN is still gold-heavy at 3/4 views. At battle size it reads as a gold throne with racks, and the seated figure with the
   fedora is visible but small.
4. A player's R5 SINGULARITY looks like VECTOR PRIME. That is intentional (build() only gets rank, not "boss"); see request 1.
5. `fitBossFootprint` was not measured for Prime. The V spans about ±0.75 model m in z. It looked fine in battle_test at slot e1.

## Requests (kit / battle)
1. robots: pass a `boss` flag (or the def id) into `build()`'s `o`, so a boss form can differ from a player's R5.
2. battle: `fx.darkCore` and black billboards lose against bloom. A "no-bloom" or depth-based mask for dark FX would make black
   holes truly black.
