# sculptor-5 — PHASE + PRISM (experimental rares)

Owns: `js/actors/models/phase.js`, `js/actors/models/prism.js`, `js/fx/units/phase.js`, `js/fx/units/prism.js`, this file,
and the two lines `phase:` / `prism:` in `js/fx/units/index.js`.
Scratch (drivers + screens): `/private/tmp/claude-501/-Users-aaronair-cc-airon/9f0adda7-8cfb-4e58-acf3-950485f78a19/scratchpad/sculpt5/`
(`shot.mjs` gallery, `shot2.mjs` any tool page, `multi.mjs` battle_test frames, `od.mjs` frames after a named unit's overdrive). CDP port 9414.

## Checkpoint 1 (first full pass, testAll 0 fails)
DONE
- phase.js: hover wedge brawler (arrowhead hull in plan view, swept blade pauldrons, huge gauntlets + segmented fists,
  thruster skirt + chrome bell on aux2, floating chest core on aux3, phase-drive ring on aux0, R4 shard orbit on aux1).
  Floating segments: tick() offsets bone rest positions (SEG table) = idle breathing gap + scatter in hit/deploy/OD/die.
  Afterimages: 3 lazily-made ghost SkinnedMeshes (shared geometry, cloned skeleton, additive fresnel ShaderMaterial,
  parented to unit.root) -> echo() snapshots; R3+ keeps one lagging trail ghost (+1 dc). OD blink = body.position.z in tick,
  distance from `unit.phaseDist` (set by the FX hook), default 2.4. All 10 anims bespoke.
- prism.js: inverted 3-sided black-glass prism, core in the front face, diamond head, detached slim arms with crystal
  emitters, apex crystal. R2+ splits into 3 facets (aux0/2/3 re-parented to chest) yawed in post, pushed out in tick.
  R4 shard halo / R5 triangle crown on aux1. All 10 anims bespoke.
- FX: js/fx/units/phase.js + prism.js, registered in index.js.
- dc/tris (high, default rank): phase 6/10.2k 6/10.4k 7/11.0k 7/11.1k; prism 6/3.7k 6/3.7k 7/5.0k 7/5.2k (kit motes now from R2).
NEXT: PRISM tri density (below 10k budget), battle_test OD captures, look-polish rounds, contact sheets.

## Checkpoint 2 (polish round + art-lead WIP review) — DONE
- PHASE: arrowhead hull + chunkier 3-layer blade pauldrons, head x1.22, visible floating gaps (idle scatter 0.03 m),
  OD blink timed to the sim windup (out 0.23 / hit 0.38 / back 0.58 of 2.6 s), bigger R4 shards, scratch detail on paint.
  Lunges: attack 0.14 m and alt 0.12 m pelvis (under the 0.4 m limit). The OD body blink is the ROSTER teleport through
  the enemy line; the FX sets `unit.phaseDist` from the real front-line centroid, clamped 0.8 to 4 m.
- PRISM: violet inlay triangle on every face, core x1.5 with a glow ring, facets float 0.05 m apart with an inner violet
  layer, corner clamps and edge lamps, a core column with rings and sparks, thicker arms with a shoulder guard, fins,
  floating lens plates, an apex crystal cluster, top vents and pylon fins. Idle facet turn is a full revolution, so the
  core facet ends facing front.
- FX: the PRISM beam is now a white core that fans into 3 separate colour strands. Both OD flashes/lights are toned
  down (the earlier whiteouts came from my flash plus other units' FX). PHASE OD shows ghost streaks, staggered phase
  scars plus a debuff field, a return streak and a fortify shell.
- testAll 0 fails. dc/tris high (default rank, common/rare/epic/legendary): phase 6/10.2k 6/10.4k 7/11.0k 7/11.1k;
  prism 6/6.6k 6/6.6k 7/9.4k 7/9.7k (the +1 at epic+ is the kit's motes). q=low: phase 5.7k, prism ~2.8k.
- Last pass (art-lead ask): R2+ facets got raised cyan hardlight triangle frames, an inner glass plate, corner crystal spurs and
  rivet rows; the core got a tilted cage ring, a back plate and 6 satellite chips.
  PHASE R3+ adds 1 dc (trail ghost) not counted by unit.drawCalls; OD/hit echoes add up to 3 dc briefly.
- Screens (scratch shots/): final_phase_single.png, final_phase_tiers.png, final_phase_ranks.png, final_prism_single.png,
  final_prism_ranks.png, rk_battle.png (ranks in battle), bt2_c.png (battle crop), od2_sheet.png (PHASE OD),
  odp2_sheet.png (PRISM OD), sh_phase_a/b.png + sh_prism.png (anim sheets).

NEXT (if more time)
1. PRISM R1 (solid body) is still 6.6k against the 10–16k rare budget; R2+ is ~9.4k. Add face detail to the solid body.
2. PRISM's OD split only shows at R2+ (R1 has no facets). Consider a hardlight facet flash at R1.
3. PHASE could use more value contrast from the battle camera (a lighter chrome top-deck accent).
4. A clean isolated OD capture for both units (battle_test runs are busy, and a jammer blackout stalls charge).

## Kit requests
- unit.drawCalls does not count extra meshes a model adds (PHASE ghosts). A `unit.extraDrawCalls` hook would keep stats honest.
- The deploy drop is battle-level (root y) plus kit (body y). A model flag to opt out of both would let blink units materialise in place.
