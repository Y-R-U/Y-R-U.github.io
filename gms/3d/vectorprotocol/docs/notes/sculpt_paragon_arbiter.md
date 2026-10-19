# sculptor-20: PARAGON + ARBITER (and the boss AURELIAN)

Owns: `js/actors/models/paragon.js`, `js/actors/models/arbiter.js`, `js/fx/units/paragon.js`, `js/fx/units/arbiter.js`, this file,
one line per id in `js/actors/models/index.js` and `js/fx/units/index.js`.
Scratch: `/private/tmp/claude-501/-Users-aaronair-cc-airon/9f0adda7-8cfb-4e58-acf3-950485f78a19/scratchpad/s20/` (working copies,
shot.mjs / multi.mjs / od.mjs / sheet.sh / probe.mjs / ta.mjs, CDP_PORT=9431). Deploy with `./dep.sh <file> <tree path>`: it
syntax-checks as an ES module (plain `node --check` on .js misses duplicate declarations: that broke the tree for ~1 min once),
copies, and boots the gallery.

## Checkpoint 1
DONE
- paragon.js v1 (hover, 1.9 m): mask, mitre crest + uplink antenna (aux1), fan collar, shoulder mantle, two-tone lamellar robe with
  a navy front stole, bell sleeves, six hex mirror satellites on aux3 (spinning) inside a tilted gimbal aux2, R5 aureole on aux0.
  All 10 anims, ring driver in tick. Registered.
- arbiter.js v1 (biped, 1.78 m): node head, navy long-coat with white lapels + cyan tie, command antenna staff in the hold frame,
  drone ring on aux2 (kept level in body space), R4 org-chart panels on aux0. All 10 anims. Registered.
IN PROGRESS
- FX files (js/fx/units/paragon.js, arbiter.js) not written yet.
NEXT
- FX, battle_test boss_aurelian, look iteration (paragon sleeves/collar clutter; arbiter knees too bright), testAll.

## Checkpoint 2
DONE
- PARAGON palette remapped for value contrast: `paint` = polished gold (robe plates, frames, rays, cuffs), `accent` = white
  ceramic (mask, crest, collar, cuirass, sleeves, robe bands), `metal` = navy-black chrome (mirrors, robe core, lower panels,
  stole), `glow` cyan, `eye` warm white; no `trim` slot (5 dc base). Kit seam glow on the gold is capped (`seam 0.55,
  seamThr 0.86`) because at R4/R5 the default seams turned the gold robe teal. R4 tassets are gold with white edges.
- PARAGON die: the ring drops flat onto the floor (body-space target mapped into the pelvis frame), the bell topples face down.
- FX files written + registered: paragon (mirror-bounce ping, uplink + launch streaks, sweeping orbital column with scorch line,
  AURELIAN satellite lances, deploy uplink), arbiter (beacon -> drone relay pulse, order stamp impact, staff-stamp shock ring,
  overhead hub + order glyphs on allies, buff chevrons).
- testAll: 0 fails.
NEXT
- Close-up quality pass (3/4 singles, portraits, factions), arbiter readability at battle size, measure dc/tris, final notes.

## Checkpoint 3 (final for this run)
DONE
- Both units complete, registered (models + FX index lines), testAll 0 fails, browser closed.
- PARAGON look: gold lamellar bell robe (navy-chrome lower panels, white bands, navy stole), white ceramic upper body (mask,
  crest, cuirass, pauldrons, side-swept mantle blades, 5-7 plate collar), six gold-framed black-mirror hex satellites with cyan
  lenses (1.25x) on a tilted precessing gimbal. Rank ladder: R0 cracked mask, 5 satellites + one shattered, robe gaps, bent dark
  antenna; R1 plain; R2 solar wings, gold orbit track, fuller collar, pauldron layers; R3 lenses/seams/uplink light; R4 gold
  tassets, crest blades, second beaded track; R5 AURELIAN.
- AURELIAN (R5, also a player's R5): a 1.3x gold sunburst aureole (20 rays, warm-white ring + ray tips) tilted back behind the
  head so the battle camera sees its face, smiling crescent eyes + a thin smile on the mask, a gold sun on the chest and the stole,
  bigger satellites (1.38x) with gold/white comet trails. In battle it reads as a golden halo'd avatar, not a white blob.
  Lessons: (1) default kit seam glow + a cyan hardlight ring turned the boss into a crackling white ball under bloom; (2) a
  screenFlash with an HDR colour whites out the whole screen; the column alone carries the moment.
- ARBITER look: navy long-coat (0x24407e so it is not black under the arena), white lapels/shoulder boards/node head, cyan tie,
  coat tails, slim legs with white knee caps, command antenna staff with relay dishes, beacon and a cable wrap; 4 white drones
  (1.45x) orbiting at shoulder height; bodyScale [1.12, 1.03, 1.12]. R0 snapped antenna + 3 drones; R2 dishes, layered boards,
  pins, rear dish; R3 drone trails, staff light segments + glowing cable; R4 holo org-chart panels + head fins; R5 6 drones,
  gold crown ring on the beacon.
- Anims (all 10 bespoke for both). Measured events at 60 fps:
  - paragon: cast fire 0.40 s, attack fire 0.38/0.45, attack_alt 0.40/0.68, OD cast 0.10 / fire 0.43, die down 1.18,
    deploy land 0.72 / ready 1.35 (noDrop: descends from orbit).
  - arbiter: cast fire 0.42, attack 0.40, attack_alt 0.48, OD cast 0.08 / impact 0.28 (staff stamp) / fire 0.40, die down 1.60,
    deploy land 0.58 / ready 1.27.
- FX: paragon attack/shot/impact/overdrive/deploy; arbiter attack/shot/impact/overdrive/buff. Satellite Lance verified in
  battle_test (`e=riot,barb,scrapper,gunner,boss_aurelian,rattler&charge=e4:0.9`): dim + uplink at the cast frame, a gold column
  lands on the far end of the column and sweeps it in ~0.4 s, blasts + EMP per target, glowing scorch line ~1 s.
- Stats (dc / tris, high; dc counts kit motes + aura):
  | unit | R0 | R1 | R2 | R3 | R4 | R5 |
  |---|---|---|---|---|---|---|
  | paragon | 5 / 13.6k | 5 / 15.1k | 6 / 19.0k | 6 / 20.2k (default) | 7 / 22.3k | 7 / 24.9k |
  | arbiter | 6 / 12.6k | 6 / 14.0k | 7 / 14.8k (default) | 7 / 15.2k | 8 / 15.9k | 8 / 18.2k |
  q=low: paragon 6.7k-12.2k, arbiter 5.9k-8.0k (pre-detail-pass numbers for arbiter; slightly higher now).
- Screens (scratch `shots/`): final_battle_0.png (both + AURELIAN in battle_test), final_gal_battle.png (pranks 0-5 both),
  final_ranks_paragon.png, final_ranks_arbiter.png, final_tiers_arbiter.png, final_low.png, close2.png / close3.png / close4.png
  (3/4 close-ups incl. AURELIAN face), odE_t.png (Satellite Lance sweep sequence), odR_t.png (Executive Override), psheet1/2,
  pdie.png, asheet1/2 (anim sheets), fac.png / facA.png (factions), port.png (portraits).

OPEN / NEXT
1. ARBITER is still thin and dark at battle size (honest ~5.5/10 vs ref_battle_02); the drones and staff carry it. Its R1->R2->R3
   steps are subtle from the battle camera. A white coat yoke or larger shoulder boards would add read.
2. PARAGON (~6.5/10): the area round the head (collar + mantle + crest) is busy in close-ups; the bell sleeves still face the
   camera as cones in some poses. The gold robe reflects the arena's pink/green lights at close range.
3. The Satellite Lance beam is wide and bloomy; at x4 speed the sweep is short (T ~0.9 s battle time) — may want a minimum.
4. Not seen live: ARBITER buff chevrons (code runs without errors in battle_test), PARAGON multi-target column with 3 targets
   when a column has 3 live units (logic sorts by z and sweeps all).
5. Satellite ping relay picks the mirror most "on the way"; when the ring has launched during an overdrive, a basic attack would
   bounce off a satellite in the sky (rare; harmless).

## Requests (kit)
- none blocking. Nice-to-have: a way to cap the kit's seam glow per rank from the def (I had to fix `seam` / `seamThr` for all
  ranks on the gold paint, which also removes the rank ramp on that slot).
