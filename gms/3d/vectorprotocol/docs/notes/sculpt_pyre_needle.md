# sculptor-12 — PYRE + NEEDLE

Owns: `js/actors/models/pyre.js`, `js/actors/models/needle.js`, `js/fx/units/pyre.js`, `js/fx/units/needle.js`, this file,
one line each in `js/actors/models/index.js` and `js/fx/units/index.js`.
Scratch: `/private/tmp/claude-501/-Users-aaronair-cc-airon/9f0adda7-8cfb-4e58-acf3-950485f78a19/scratchpad/sculpt12/` (CDP_PORT=9422;
`up.sh` starts the browser; `shot.mjs out "gallery.html?..." W H dpr`; `od.mjs` battle OD frames; **`fxtest.mjs prefix "battle_test.html?..&auto=0" <id> <hook> ms,ms [one]`**
calls a unit FX hook directly in a live battle and pauses at each delay for frozen frames; `odsheet.py`, `hcat.py` tilers).

## Checkpoint 1
DONE
- PYRE model (`pyre.js`, registered): stocky biped 1.6 m, two big orange fuel tanks (charcoal caps, straps, brass valves, gauges),
  mortar-flamer right forearm (scaled 1.18: shrouded barrel, flared nozzle, pilot flame on aux1 scaled in tick, mortar tube on top),
  igniter left glove, welder gas-mask helmet with amber goggles, belly furnace grille, hazard stripes, soot detail texture (SOOT fn).
  Ranks: R0 jerry can + missing L pauldron · R1 no rack · R2 canister rack (aux2, swings up in OD) · R3 hip saddle tanks + rack of 5 +
  glowing gauges · R4 exhaust chimneys + pauldron heat fins + heat-haze shimmer mesh (+1 dc, `unit.extraDrawCalls = 1`) · R5 molten
  seams (eye-slot cracks) + spinning fire crown (aux3). All 10 anims bespoke (cast = Pyre Orb lob, battle basic).
- PYRE FX (`js/fx/units/pyre.js`, registered): attack = mortar thunk + soot + flamer spit + molten orb lob (flame/soot trail);
  impact = expanding fireball + droplets + soot + burning floor patch; overdrive = canister volley from the rack, fireballs +
  3.2 s burning zones at every target and fillers, a carpet of flame columns sweeping the enemy side, haze + soot; deploy = fire ring.
  Lesson: particle `size` is world metres and the soft glow shows ~half the quad; the board is ~25 m long, so FX need sizes 1.5–3.
IN PROGRESS: NEEDLE model next.

## Checkpoint 2
DONE
- NEEDLE model (`needle.js`, registered): S hover drone 1.2 m. Black-glass octahedron (a face looks forward) with violet facet inlays,
  cyan hardlight equator, chrome belt bands, facet light-dot rows, lower-facet vents; big front lens on the head bone (chrome barrel,
  stacked rings, focus rails, petal ring, cyan bezel, dark glass dome, violet ring, pink-white core, iris blades on aux1 spin when firing),
  eyelid hood; swept fin-wings on upArm bones (flap/flare/fold) with wingtip nacelles; tail stabiliser + thruster on aux0; thruster ring
  and crystal under the bottom point. Ranks: R0 dead facet + crack + taped antenna stub + wing patch · R1 base · R2 lower X-fins (foreArm)
  + tail spurs · R3 three orbiting mini-prisms (aux2) · R4 tilted gyro ring (aux3) · R5 triangle sigil crown (aux3). All 10 anims bespoke
  (idle "crush" lean/flutter, attack focus+recoil, attack_alt double tap + barrel roll, cast Overcharge spin, OD rise + 2 spins firing 4
  darts at 0.3/0.38/0.46/0.54, hit wobble, die spiral + tip over, victory hops + rolls, deploy tumble-in + catch + wings unfold).
- NEEDLE FX (`js/fx/units/needle.js`, registered): attack = lens flare + hair-thin needle tracer with white core + spectrum ghost line;
  shot = 2nd needle on attack_alt, and one bowed dart per OD fire frame fanned to the volley's targets; impact = stuck crystal shard +
  hex ring + 3-colour sparks; overdrive = spin ring + lens flash + radial streaks.
- testAll 0 fails. dc / tris (high, default rank per rarity common/rare/epic/legendary):
  pyre 6/11.3k · 6/13.4k · 7/14.1k · 7/15.2k (low ~5.9–7.8k; R4 16.1k +1 haze +1 aura ring);
  needle 6/7.6k · 6/7.8k · 7/8.6k · 7/9.0k (low 2.3–3.0k).
NEXT: final captures (gallery single/tiers/ranks/battle + battle_test 412x915), recheck NEEDLE OD in a real battle.

## Checkpoint 3: final for this run
DONE
- NEEDLE volley darts made brighter (0.6 bolts + lingering path lines); the fan reads in battle_test.
- PYRE: warmer charcoal accent (0x261d17) against the violet epic rim; R4 haze strengthened (faint wavering column over the stacks).
- battle_test 6v6 with both units on both sides: 60 fps (M5), 162 calls, 255k tris, no console errors.
- testAll 0 fails (last run after every model change).
- Final screens (scratch `shots/`): final_pyre_single.png, final_pyre_tiers.png, final_pyre_ranks.png, final_needle_single.png,
  final_needle_tiers.png, final_needle_ranks.png, final_battle.png (gallery battle, pranks 0..5), final_bt_0..3.png (battle_test, perf
  overlay), pod_sheet.png / fx_sheet.png (Inferno), nv_*.png / n_fx.png (Prism Volley), psh1/2.png + nsh1/2.png (anim sheets).

Open issues / honest scores vs ref_battle_02 (battle size): PYRE ~6/10 (silhouette strong: tanks + flamer; body reads violet-tinted
under the epic rim). NEEDLE ~5/10: an S drone is small at the battle camera; its lens faces sideways, so from above it mostly reads as
wings + a dark diamond. PYRE R4's heat haze is subtle by design (additive, no real refraction).

## Kit requests
1. `unit.drawCalls` (units.js getter) ignores per-instance `unit.extraDrawCalls`; PYRE adds its haze mesh only at R4+, so a static
   `def.extraDrawCalls` cannot express it. Please let the getter add `api.extraDrawCalls` (or accept `def.extraDrawCalls(rank)`).
   battle.unitStats already reads the instance value.
2. The rarity rim floor (epic 0.55 violet) noticeably tints dark-accent units violet. A per-model `rimTint` / `rimScale` override would let
   warm units (PYRE) keep a warm charcoal read while still showing the tier.
3. FX sizing note for the README: vfx particle `size` is world metres and the soft glow (kind 0) shows about half the quad, so on the
   ~25 m battle board flames/fireballs need sizes of 1.5–3 to read. A line in js/fx/README.md would save other sculptors iterations.
