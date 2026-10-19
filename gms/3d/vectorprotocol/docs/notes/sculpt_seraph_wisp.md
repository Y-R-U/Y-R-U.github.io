# sculptor-14: SERAPH + WISP (and the boss THE CHOIR)

Owns: `js/actors/models/seraph.js`, `js/actors/models/wisp.js`, `js/fx/units/seraph.js`, `js/fx/units/wisp.js`, this file, plus one line
per id in `js/actors/models/index.js` and `js/fx/units/index.js` (all four are registered).
Scratch: `/private/tmp/claude-501/-Users-aaronair-cc-airon/9f0adda7-8cfb-4e58-acf3-950485f78a19/scratchpad/s14/`. It holds the working
copies (seraph.js, wisp.js, fx_seraph.js, fx_wisp.js) and the scripts shot.mjs, sheet.sh, od.mjs, tile.py and multi.mjs (CDP port
9425 is the default). Edit in scratch, run `node --check`, then copy into the tree.

## Checkpoint 1
DONE
- SERAPH model (hover, L 2.05 m):
  - Pearl mask under a tilted gold halo (aux1), a gold cuirass with a violet core, and a robe of gold organ pipes whose mouths glow
    at R3+. A small organ of pipes sits on the back.
  - Four wing fans of pearl blade-feathers. Each feather has a dark-glass under-blade (for value contrast) and a hardlight core
    (glow2) at R3+. The fans are swept back so the side-on battle camera sees their faces.
  - The legs are the wings: thigh = upper, shin = lower, foot = R5 crown pair. All three joints sit at one point on the back via
    dims.offsets with zero lengths. `wings()` writes the relative angles.
  - Lyre-bow on handL, authored in the precomputed draw pose (`HARP_FRAME`). The light lance is on aux2 (re-parented to handR).
    `aimLance()` in post() points it along leftHand-minus-rightHand; tick() grows and hides it.
  - noDrop: true. The deploy anim descends from 1.6 m and the deploy FX hook draws a pillar of light.
- WISP model (hover, S 0.95 m):
  - A white-hot orb (glow2) with two dark eyes on the head bone, which sits at the orb centre so the eyes slide over the surface
    when it glances. The eyes blink by scaling the head bone.
  - An acorn cap with a sprout on the neck bone, ear fins on upArm, and a bead tail on the thighL chain.
  - A nested gimbal: aux1 (outer, chest) -> aux2 -> aux3. aux bones can only parent to EARLIER bones, or makeRig crashes.
  - Squash and stretch by scaling the chest bone in tick.
- All 10 anims are bespoke for both units. Events:
  - seraph: attack fire 0.34, attack_alt fire 0.44, cast 0.5, OD cast 0.04 / fire 0.17, die down 0.62, deploy land 0.45 / ready 0.85.
  - wisp: cast fire 0.42, attack fire 0.3 / 0.45 / 0.6, attack_alt fire 0.55, OD fire 0.17, die down 0.55.
- FX:
  - seraph: attack (lance segment + rail + chimes; the javelin leaves from the hand), impact, overdrive (halo of 12 lances raining
    plus pillars), buff and deploy hooks.
  - wisp: attack, impact, heal (Tether thread + motes), overdrive (Flicker motes streaming into allies + purple plate flares) and buff
    hooks.
- Boss THE CHOIR verified in battle_test (`e=riot,barb,scrapper,halo,boss_the_choir,rattler&charge=e4:0.95`): the overdrive works.
- testAll: 0 fails.

## Checkpoint 2 (final for this run)
DONE
- Detail pass and size fixes:
  - WISP is scaled to S class (bodyScale 1.22, height 1.15). Its core is brighter and its eyes bigger.
  - SERAPH has 7-feather upper fans and less back-sweep, so the boss's wings stay clear of the right button column. Verified with
    the boss in the back-far slot during its overdrive (best/choir_od_rightcolumn.png).
- **THE CHOIR boss look = R5** (battle passes rank 5 for `boss_*`). The feathers turn black-violet glass with gold outlines and
  violet light cores. It also gets a crown pair of tall blades arching over the halo, a sunburst crown of 14 pipes on the halo,
  6 violet glass shards orbiting behind it (aux3), and Novaline's shackles with broken chains on both wrists. It reads as a dark
  violet angel against the pearl R0–R4 Seraphs. A player's R5 Seraph shares this look ("freed Choir").
- testAll: 0 fails. Stats (high / low tris, dc includes kit motes from R2 and the aura from R4):

  | unit | R0 | R1 | R2 | R3 | R4 | R5 |
  |---|---|---|---|---|---|---|
  | seraph | 6 dc, 13.9k / 7.9k | 6 dc, 15.2k / 8.9k | 7 dc, 18.9k / 11.1k | 7 dc, 18.9k / 11.1k | 8 dc, 20.0k / 12.0k | 8 dc, 23.1k / 14.2k |
  | wisp | 6 dc, 9.7k / 2.1k | 6 dc, 9.7k / 2.1k | 7 dc, 12.1k / 2.5k | 7 dc, 12.6k / 2.6k | 8 dc, 12.9k / 2.9k | 8 dc, 13.5k / 3.1k |

- Measured events at 60 fps:
  - seraph: attack fire 0.33 s, attack_alt fire 0.50, cast 0.58, OD cast 0.08 / fire 0.40 (= sim AREA windup 0.4), die down 1.23,
    deploy land 0.72 / ready 1.35.
  - wisp: cast fire 0.42, attack 0.28 / 0.45 / 0.58, attack_alt 0.60, OD fire 0.37, die down 0.87.
- Screens in scratch `best/`: seraph_single, seraph_R5_choir, ranks_factions (seraph ranks, seraph factions, wisp),
  seraph_sheet1/2, wisp_single, wisp_sheet1/2, battle_gallery_and_R5, battle_test_boss, choir_overdrive, choir_od_rightcolumn.

OPEN / NEXT
1. SERAPH's pearl wings are the brightest thing on the board under bloom. They read well, but a slightly darker pearl (or a lower
   rim) would help the value contrast. The R5 Choir wings are deliberately very emissive (boss state).
2. WISP is still small at battle size, and its eyes only read in close views. At `q=low` the tori drop to ~2k tris (ring segments
   scale hard), so it looks faceted there.
3. The idle lyre-bow hangs out to the left side (~0.6 m); it reads, but it widens the footprint.
4. Not seen live yet: the Tether heal thread (the heal hook is wired and the code runs without errors in battle_test), Halo Choir
   buff and the deploy pillar.
5. Story layout puts the boss in a back slot, where the top HUD/banner can cover it. That is a layout question, not a model one.

## Requests
- (kit) `dims.parents` only works when the parent comes earlier in BONES (aux1 cannot parent to aux3). A one-line guard or note in
  MODEL_GUIDE §3 would save the next sculptor a broken tree.
