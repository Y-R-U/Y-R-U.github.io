# sculptor-2 — PALADIN + HALO

Owns: `js/actors/models/paladin.js`, `js/actors/models/halo.js`, `js/fx/units/paladin.js`, `js/fx/units/halo.js`, this file,
and the lines `paladin:` / `halo:` in `js/fx/units/index.js`.
Scratch: `/private/tmp/claude-501/-Users-aaronair-cc-airon/9f0adda7-8cfb-4e58-acf3-950485f78a19/scratchpad/s2/`
(`shot.mjs` gallery driver, `views.sh out model [extra]` = 3/4 front + back + battle crop (CROP=x0,y0,x1,y1 env), `sheet.sh` anim
contact sheet, `od.mjs prefix query NAME delays` = frames after a unit's first overdrive in battle_test, `multi.mjs`, `tile.py`).
Best screenshots in `best/`. CDP port 9411. Working copies `paladin.js` / `halo.js` live there too: `node --check`, then copy into the tree.

## Checkpoint 2 (both units complete, first polish round)
DONE
- testAll: 0 fails. Stats (high, dc / tris by rank R0..R5):
  - paladin: dc 6 (+1 motes at R3+) · 14.4k 15.0k 15.6k **16.3k (R3 default)** 17.3k 18.3k
  - halo: dc 6 (+1 aura bubble, +1 motes R3+) · 9.1k 9.9k **10.1k (R2 default)** 11.5k 13.0k 14.6k
- PALADIN (faction corporate, legendary, 2.1 m): gold `paint` forced via `mats.all` for every tint (the battle spawns it as
  corporate+legendary, which would otherwise be blue); black `accent` under-suit, platinum `trim` (2nd pauldron layer, thigh plates,
  alternate cape blades, blade body), white-gold `glow`, faction `eye` lamps (cyan). Helm x1.12 with swept crest + T visor,
  V breastplate + triangle emblem, layered pauldrons with ribs/vents, tassets, ribs, high collar, kite shield (poseFrame of the
  precomputed guard stance), feathered fin-cape (aux0 upper row / aux2 lower row sways in post), longsword blade on aux1.
  Ranks: R0 short cape, 2 pauldron layers, dull · R1 full cape · R2 3rd pauldron layer + pauldron crest fins + knee spikes + extra
  tassets · R3 blade edge lights, emblem/shield/pauldron light · R4 tall crest + crown spikes, outer wing blades, glow cape spines,
  rim strips · R5 big spinning gold sigil behind the head (aux3), hardlight blade fins, glowing cape ridges, light-trail motes on slashes.
- `aimBlade()` / `swordIK()` in paladin.js: hand IK + solve the hand rotation so the blade points along a root-space direction;
  every sword anim is a keyed path (`kv`). Guard stance itself uses it.
- Paladin anims: idle (oath salute every 8.5 s), advance (blade forward, cape streams), attack (diagonal cut, impact 0.42),
  attack_alt (lunge thrust, impact 0.42), cast (blade-upright oath), overdrive JUDGEMENT (crouch, leap with the blade over the
  head while it scales into a ~5 m greatsword (tick), slam at u 0.23 = the sim's 0.6 s release, kneel in the crack, rise),
  hit (shield snaps up), die (kneels on the planted sword, slumps, pitches forward; remapped dieB, down 0.82), deploy (one-knee
  landing on the planted sword, rises with a sweep), victory (blade to the sky, cape billows).
- HALO (experimental epic hover, 1.72 m): mantis head (compound eyes, antennae, mandibles, head halo), thin neck, slender
  thorax, tall shoulder vanes, praying-mantis arm fold with raptorial forearm blades, palm emitters, 1-3 pairs of folded wings,
  segmented curled abdomen with dorsal spines, coat-tail blades, needle legs. Stasis gyroscope rings on aux1 (re-parented to
  pelvis): precess in post, swell x2.15 in the overdrive, collapse on death. Orbs (aux2/aux3) = stasis "clocks".
  Ranks: R0 one wing pair, dull ring · R1 glow ring + head halo · R2 3 wing pairs, abdomen glow rings, ring hex nodes, forearm glow
  · R3 2nd ring, blade teeth, wing veins, orb inner ring · R4 3rd ring + orbiting motes, halo crown spikes · R5 outer lattice cage
  (second bubble layer). Kit aura bubble at 0.38 (bubble is the read-shape at battle size, matches the ref).
- Halo anims: idle (folded prayer, mantis head-cock every 6.3 s), advance, cast = Null Pulse (right arm unfolds, fire 0.48;
  this is what the battle plays for a mage's basic attack), attack (double palm push), attack_alt (sweep + clap, 2 fires),
  overdrive STASIS BUBBLE (curl, then star spread at 0.17 = release, rings swell, hold, settle), hit, die (curls like a dead
  insect, drops), deploy (curled drop, unfold), victory (pirouette, arms raised).
- FX `js/fx/units/paladin.js`: crescent cut (gold + white core) at the target, splash floor ring, R5 trail motes; overdrive =
  slam flash at the tip, standing gold crescent wave + floor wake rolling down the lane, lingering gold floor cracks, bursts +
  expose sparks on each lane target, gold ward on self. `js/fx/units/halo.js`: hex ring at the orb, pulse bolt with time-rings,
  stasis-shell impact with inward motes; overdrive = violet sphere shockwave + floor hex sweep, a bubble inflating on every ally
  as the wave reaches it, cleanse sparks, regen motes.

OPEN / NEXT
1. HALO tris (10k at R2) are below the epic 14-20k target; it reads fine at battle size, but spend more on wings/abdomen/head.
2. Paladin at battle size still reads a bit boxy (refrigerator torso); narrow the waist / taper the breastplate more.
3. Paladin OD normally happens in melee contact (units lunge to the centre), so the lane wave is short; consider starting the
   wave from the blade tip and running it 4-6 m past the last target regardless.
4. HALO overdrive in the gallery: the figure rises (0.2) inside the fixed kit bubble; fine, but the bubble does not scale.
5. `&q=low` not visually checked (builds/anim tests pass).

## Requests (kit)
- `setShield(v)` from the battle overrides a model's permanent `aura` (battle.js calls `setShield(shield / (0.6 maxHp))` on
  every hit, so HALO's bubble vanished after the first hit). Workaround in halo.js `tick()`: wraps `unit.setShield` once with
  `max(AURA, v)`. Proper fix: `shieldV = Math.max(M.aura || 0, v)` in units.js `setShield`.
- `b.sym()` on an off-centre bone with no L/R pair (aux bones re-parented to a hand, `handR` itself) mirrors across the body's
  x = 0 and leaves a stray copy on the other side. paladin.js has `addM()` (local mirror with scale [-1,1,1]); worth a kit helper or a doc note.
