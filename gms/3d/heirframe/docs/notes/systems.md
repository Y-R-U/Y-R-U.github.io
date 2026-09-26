# systems agent notes

Owns: `js/sim/*`, `js/data/*`, `tools/sim/*`, this file. Pure ES modules, no three.js/DOM, seeded RNG.
Source of truth for numbers: docs/DESIGN.md, MISSIONS.md, ECONOMY.md, STORY.md (planner). Deviations listed below.

## Status (2026-09-26 ~01:25)
DONE (smoke-tested via tools/sim/smoke.mjs, no formal tests yet):
- sim: rng.js, util.js, save.js, stats.js (computeStats/enemyStats/resolveHit/tick/useSkill), loot.js (rollItem, rarity bands, relic/heirloom, tune, recal, salvage, kill loot, cache, market),
  economy.js (xpNext, addXp, killXp, sync, costs, legacy, nextGoal), enemies.js (createEnemy, buildEnemies budget packs, chooseEnemySkill),
  factions.js (rep tiers, stance, heat stars), missions.js (generateBoard, generateContract, validateMission, missionPayout, completionRewards),
  story.js (state machine, codexView, buildStoryMission, scriptBeats, rollEcho)
- data: balance, frames (4 frames + Mk I–VI + sync mods), loot, economy, factions, districts, enemies, missions, story, codex, story_a1 (intro + A1-M1 scripts)
- All 30 story missions build + validate.

- sim/frames.js, sim/game_state.js (createGame: queries + actions + events; smoke2.mjs runs A1-M1 end to end), sim/ui_adapt.js (UI README shapes).

IN PROGRESS: tools/sim/balance.mjs (bot plays Tense contracts using the real game_state actions + resolveHit fights).

NEXT: balance tuning to ECONOMY §9 → tools/sim/test.mjs → js/sim/README.md → final notes.

## Deviations from planner docs (planner: copy back)
- Story missions: level = max(gate, rider-2) + threat.lvlOff (STORY §4 "gate level and a +2 level floor" was ambiguous).
- Mk tier multiplier applies fully to hp/shield/armor and at 50% to damage (MK_DAMAGE_SHARE) so Mk VI doesn't 5x TTK.
- New story archetypes 'walk' (goto chain) and 'confront' (goto → choose → leave). Boss fights = an inserted `kill {target:'boss'}` step + mission.boss.
- Weapon parts have no class restriction (frames' attacks are built in; weapon part = weaponDamage + element for the basic attack).
- Energy is NOT level-scaled (frame energy or item energy). ECONOMY §1 says "hp, shield, energy stay ×L", but skill energy costs are flat, so scaled energy would make skills free by level ~15.
- Weapon parts are not class-restricted: any weapon part fits any frame (the frame's attacks are built in; the part supplies weaponDamage + element).
- UI README rarity list has 6 tiers (Scrap/Common/Refined/Prototype/Relic/Heirloom); DESIGN has 7. Sim follows DESIGN; export `RARITIES` for `ui.config({rarities})`.
- Pacing: manager brief says first owned frame at 45-75 min; ECONOMY §9 says 30-45 min. Aiming ~45 min.

## Gotchas
- sfc32 state is 4×u32; `rng.state` get/set for persistence.
