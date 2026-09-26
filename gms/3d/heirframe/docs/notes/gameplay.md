# gameplay notes (P2a "Own Your Frame")

Owns: js/game/*, js/main.js, js/engine/{player,camera,input,devpad}.js, js/sim/*, js/data/*, tools/sim/*, js/ui/*, css/*, js/audio/*, tools/vo/*, audio/vo/*, this file.

## DONE
- Frames: buy/swap/Mk via Warehouse → `js/game/frames.js` rebuilds the body (`createRobot({kind, tier})`) with a ~1.1 s beam-out/beam-in (player frozen, fx.beam + sparks + shake). `player.setActor()` in engine/player.js; everything reads `player.actor` now.
- Kits: `js/game/combat.js` (basic attacks: melee combos incl. Bulwark 3-hit + Wisp 2-hit backstab, Longarm auto-fire hitscan) + NEW `js/game/kits.js` (zap, overclock, sponsored, slam (+Aftershock/Magnetic), rocket charge, bulwark wall + taunt, scatter cone pellets, rail charge + pierce (+Overpenetrate/Quickcharge), drone turret (decoy/aggro), blink shadow-step behind target + decoy hologram (+Double Blink/Knife Decoy), veil cloak (see-through materials, enemies lose track), hack pulse (disable drones, convert a robot for 8 s)). Feel metrics recorded in `__game.runtime.combat.metrics[archetype]`.
- Enemies (`js/game/enemies.js` rewrite): decoy targets (addDecoy/removeDecoy), convert (ally), loseTrack (veil), taunt, telegraphed specials (stomp/crush/dash/lunge via sim chooseEnemySkill, red ground ring), multi-shot bursts, `brain` hook for boss scripts.
- UI: Warehouse tabs Skills (sync bar, skill list, sync-mod picker) + Market (6 parts, repair kits/jammer/decoy); Repair button on frame cards; repair-kit quick button in the action cluster (`ui.skills.kit(n)`, key R, event `kit`).
- `?skipintro` flag (fresh game straight to free roam; tests).

## IN PROGRESS
- 2. Act 1 M2–M5 story scripts + Kettle boss.

## NEXT
- 3 contracts (bounty/escort/sabotage/hack + mods + T2/T3/T9) + heat 5 responders, 4 family tree check, 5 VO, 6 balance/bots, 7 P1 regression.

## Requests (art)
- `boss_kettle` (enforcer with a boiler-tank back); Mk I–II visual tier differences if lacking; drop-pod courier drone.

## Gotchas
- `patchSkill` already applies `baseMult` to `base`; don't multiply again at runtime.
- Test driver scratchpad `gameplay/` (smoke.mjs, kits.mjs). CDP port 9311.
