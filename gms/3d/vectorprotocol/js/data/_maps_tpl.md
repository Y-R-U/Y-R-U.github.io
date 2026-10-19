# VECTOR PROTOCOL — Story maps

Owner: design. **Generated** from `js/data/maps.js` (`node js/data/_gen_maps.mjs`; prose lives in `js/data/_maps_tpl.md`).
To retune: edit `MAP_SPEC` (`lv`, `size`, `waves`, `rankBonus`, `pool`, `elites`) and regenerate. The levels are built deterministically, with no runtime RNG.

## How a map works
- **Map screen**: a road running left→right with numbered nodes (`level.x`, `level.y` in 0..1 give node positions; hub agent styles the road per backdrop). Boss nodes are bigger and use the boss's portrait. Elite nodes get a red-gold ring.
- **8 maps / 120 levels**: 12 + 14 + 14 + 15 + 16 + 16 + 18 + 15. Strictly linear (sim `isUnlocked`).
- **Waves**: early levels have 1 wave and later ones up to 3 (`ROUND n/3`). Each wave's units are placed tanks-front, others-back, mid lane first. Boss levels always have 3 waves, and the boss stands at **F-mid**.
- **Enemy level** ramps per map (`lv`). Enemy rank = the minimum its level needs + `rankBonus` (currently 0 everywhere except map 8 where level 51+ already forces rank 5; runs 3–4 showed +1 made maps 5–7 cliffs). Ability levels = 1 + ⌊level/12⌋.
- **Stars = 3 goals per level** (sim-2): ★ win, plus two replay challenges (no unit lost · win in ≤ N s · win with ≤ K units · win without a role · 3+ units of a faction · finish with ≥ X% integrity). Each goal is earned once, independently, on any winning run. First completions pay goal 2: chips 4 (elite 8, boss 15) + 50% of the level's credits; goal 3: chips 6 (10, 20) + the level's scrap. Bosses: no losses + time; elites: no losses + integrity. Time limits are measured by `node js/data/_gen_star_times.mjs` (a mirror squad at 1.3× the level's power, median win time × 0.95).
- **Star chests**: 3 per map at 50% / 75% / 100% of its stars; granted automatically by the winning run that reaches them.
- **Rewards**: credits `(80+30·L)`, scrap `(15+6·L)`, unit xp `(30+10·L)` each; ×1.6 elite, ×2.5 boss (xp ×1.5). Shards every level: 2 (elite 4, boss 8). Maps 1–2 rotate through the units you probably own; later maps use units from that level's waves. Replays pay 60% (`replay.rewardMult`).
- **Recommended power** = strongest wave's power × 1.05 (sim `unitPower`). The harness shows a squad at roughly that power wins normal nodes; elites and bosses want +15–25%.

## Unlock milestones
Squad slots: {{SLOTS}} (you start with 2).
Features (first clear): {{FEATURES}}.
Story units (first clear): m1_l3 patch · m1_l12 bulwark · m2_l14 jammer · m3_l14 lancer · m4_l15 prism · m5_l8 oracle · m5_l16 phase · m7_l18 paladin.

## Difficulty intent (D10)
- **Maps 1–2**: a straight-through player clears them, with at most a replay or two before the bosses. Arena unlocks at m2_l4 so the habit forms early.
- **Map 3 on**: the curve outruns story-only income, so arena, daily ops and trials supply the XP, scrap and shards. Target: **25–40% of play time in arena/events from map 3**, whole story **15–25 h**. These numbers are measured by `tools/sim/balance.mjs`; current results are in docs/ECONOMY.md § Balance status.
- **Map 6 (fantasy)** introduces a new enemy mix: wolves pounce the back row, treants heal, and minotaurs hit columns. It's a composition check, not just a stat check.

{{MAPS}}
