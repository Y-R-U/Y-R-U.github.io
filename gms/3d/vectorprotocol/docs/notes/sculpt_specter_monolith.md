# sculptor-13 — SPECTER + MONOLITH (experimental epics)

Owns: `js/actors/models/specter.js`, `js/actors/models/monolith.js`, `js/fx/units/specter.js`, `js/fx/units/monolith.js`, this file,
and the `specter` / `monolith` lines in `js/actors/models/index.js` and `js/fx/units/index.js`.
Scratch (drivers + screens): `/private/tmp/claude-501/-Users-aaronair-cc-airon/9f0adda7-8cfb-4e58-acf3-950485f78a19/scratchpad/sculpt13/`
(`shot.mjs`, `ev.mjs`, `multi.mjs`, `od.mjs`, `sheet.sh`, copied from sculpt5). CDP port 9424.

## Checkpoint 1
DONE
- specter.js first pass written + registered (model index). Stilt biped, heron aim (precomputed RIFLE_FRAME like lancer),
  null rifle, hood + lens, mantle slats on aux0/aux2/aux3, R5 orbs on aux1, hover 0.075 m in tick, cloak overlay mesh
  (cloned skeleton, additive fresnel shader) used for R3 shimmer, R4 idle ghost trail, cloak windows (OD 0.14..0.64, deploy <0.38, die >0.82),
  `unit.specterCloak(sec)` for the Null Shell stealth buff. 10 bespoke anims.
IN PROGRESS
- screenshots / tuning of specter; tris 8.1k (needs to reach 14k+).
NEXT
- js/fx/units/specter.js, monolith model + fx, testAll, battle captures.

## Checkpoint 2
DONE
- specter.js reworked (dark mantle of 7+6 raked slats with pale inlays, bodyScale [1.12,1,1.08], darker accent). Tris 10.2k (default R2).
- js/fx/units/specter.js: attack (null bolt + pale tracer + ghost echoes), impact (void pop), shot (OD decloak muzzle bloom),
  overdrive (arc over the front line, 16-step ghost trail, void detonation + expose crosshair), buff (stealth -> unit.specterCloak),
  deploy (shimmer column). Registered.
- monolith.js written + registered: 4 floating shafts (spike base, two shafts, pyramidion), eye + glancing pupil (aux0), glyph columns,
  2 gravity rings (aux2 / aux3), R3 glyph band (aux1), slabs on clav/thigh/upArm re-parented to the spine and placed in tick,
  debris on the feet bones, R5 lens mesh. Deploy fall decelerates (gravity brake). 10 bespoke anims.
- js/fx/units/monolith.js: rolling gravity rings (attack), implosion (impact), Event Horizon (temporary lens sphere mesh over the
  enemy centroid at y 2.9, rings, accretion motes, debris inflow, tethers, enemies lean via body.rotation, collapse pop),
  buff fortify/taunt, deploy (descending rings + floor ring). Registered.
- testAll: 48 fails, all `wisp` (another sculptor's WIP); 0 for specter/monolith.
NEXT: detail density (both ~9-10k, want 14k+), contact sheets, tiers/ranks views, polish.

## Kit requests
- `fx.darkCore` renders nothing in battle_test (tested: 6 calls, size 3, at y 1.5..2.9, nothing visible). MONOLITH OD works
  around it with its own temporary lens mesh; SPECTER impact still calls darkCore (harmless).

## Checkpoint 3 (end of first full pass) — DONE
- Detail pass: SPECTER rifle radiators/coolant line/scope rings, rib plates, shoulder cables, arm guards + pistons, hood ribs,
  second mantle layer, 4 side slats. MONOLITH recessed face frames, pilaster studs, eye lash fins, slab side ribs + rivets.
- testAll: 0 fails (all models). Contact sheets for 9 anims each look right (sh_specter.png / sh_monolith.png).
- dc / tris at high (default R2): specter 7 / 14.2k (6 slots + motes; +1 while the cloak overlay shows, R3+ always),
  monolith 7 / 14.5k (R4 17.3k with six slabs, R5 17.9k + 1 lens mesh). q=low: specter ~6.5k, monolith ~8.5k.
- Battle (`view=battle`, 412x915): 134 calls / 291k tris for 12 units incl. 2 of each of mine.
- Screens (scratch shots/): s3_single.png, m2_single.png, f_battle.png / f_bcrop.png, f_specter_ranks.png, f_monolith_ranks.png,
  sh_specter.png, sh_monolith.png, od2_sheet.png (SPECTER OD cloak), mod5_sheet.png + eh_test2.png (Event Horizon).
- Honest score vs ref_battle_02: SPECTER ~6/10 (unique stilt + mantle silhouette, long rifle line reads; still pale-ish and thin
  at battle size), MONOLITH ~6.5/10 (tallest, unmistakable; glyph columns a little busy, shafts still slightly crate-like).

NEXT (if more time)
1. SPECTER: more black, less pale at battle size (thigh/shoulder pale plates -> accent with pale inlay); make R3 shimmer more visible under arena light.
2. MONOLITH: shafts more monolithic (fewer face frames, one big inset per face), quieter glyphs on the lower shaft.
3. SPECTER OD arc: verify the round's arc lands on a backline target in a clean isolated capture.
4. Event Horizon lens sphere could be darker inside (bloom lifts it to violet).
