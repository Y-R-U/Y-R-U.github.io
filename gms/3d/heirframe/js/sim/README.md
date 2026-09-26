# HEIRFRAME sim API

Pure ES modules: no DOM, no three.js, all randomness seeded. Node-testable (`node tools/sim/test.mjs`).
Numbers live in `js/data/*` (ECONOMY/DESIGN/MISSIONS canon; `// sim:` marks a tuned constant, reasons in `docs/notes/finisher.md`).
**APIs are add-only.** Anything renamed or removed is listed under "Changes" at the bottom.

## Game state: `js/sim/game_state.js`

```js
import { createGame, loadGame, newState } from './sim/game_state.js';
const game = loadGame({ sites }) || createGame({ seed: Date.now(), sites, name: 'Wren' });
game.on('loot', ({ items }) => ui.loot(items.map(i => toUiItem(i))));
```
- `createGame({seed, state?, store?, sites?, name?})`. `sites` = `{districtId: [{id, tag, x, z}]}` from `world.sites` (or call `game.setSites(districtId, sites)` later). Without it, districts fall back to `data/districts.js` layouts.
- `loadGame({slot='main', store?, sites?})` → game or `null` (no/corrupt save; `.bak` is tried first).
- `game.state` is the whole save (plain JSON). Read it freely; change it only through actions. `game.noAutosave = true` for tests.
- `game.tick(dt, {moving})` every frame with ACTIVE play seconds (pause menus shouldn't tick). Drives shifts (24 min: rental fee, board + market refresh), heat decay, player energy/shield/status ticking, out-of-mission HP regen to 50%.

### Queries
`activeFrame()` `frameByUid(uid)` `itemByUid(uid)` `ownedFrames()` `frameStats(f?)` `frameSkills(f?)` `frameFR(f?)` `playerCombatant()` `lootQuality()` `currentThreat()` `board()` `storyCard()` `currentStep()` `hud()` `skillsHud()` `nextGoal()` `codex()` `features()` `threatsUnlocked()` `enemyStance(faction)` → `'hostile'|'neutral'|'friendly'` `freeStash()` `framePrice()` `validateMission(m)` `homes()` `paintsList()` `brokerPrice(matId, n)`

- `hud()` → `{hp, hpMax, shield, shieldMax, energy, energyMax, level, xp, xpMax, credits, frame:{name, kind, tier, tierName}, heat, district, mission:{title, objective, progress 0..1, count 'i/n', timer s|null}|null, buffs:[{id, icon, t, tMax, kind}], surcharge|null, goal:{id, label, cost, progress}|null, renewalDays}` — feeds `ui.hud.set` directly.
- `skillsHud()` → `[{id:'s1'|'s2'|'s3'|'heir', icon, label, cd, cdMax, ready, cost, key}]` — feeds `ui.skills.set`.

### Actions (all return `{ok, reason?, ...}`; failures never throw)
| area | actions |
|---|---|
| contracts | `refreshBoard()` `rerollBoard()` `acceptContract(id)` `completeStep({outcome?, choice?, captured?})` → `{done, step, index}` `fireTwist()` `reportAlarm()` `reportCollateral(cr)` `reportSpotted()` `finishContract({time?, raceFirst?})` `failContract(reason)` `abandonContract()` `playerWrecked()` |
| combat | `spawnEnemy(spawn)` → combatant, `hit(attacker, defender, skill, opts)` → hit result, `useSkill(c, skill)` (energy + cooldown; false if not ready), `kill(enemy)` → `{xp, credits, items, rep}` (idempotent) |
| items | `addItem(item)` `lootPickup(items)` `equip(itemUid, frameUid?)` `unequip(frameUid, slot)` `equipBest(frameUid?)` `salvage(uid)` `salvageAll(maxRarity='standard')` `tune(uid)` `recalibrate(uid, affixIndex)` |
| frames | `buyFrame('brawler'|'gunner'|'ghost')` `swapFrame(uid, {inCombat, bossFight, force})` `returnRental()` `upgradeMk(uid)` `chooseSyncMod(uid, rank, optionId)` `repair(uid?)` `payRental()` `payWardDebt()` |
| shop | `buyConsumable(id)` `useConsumable('repairKit'|'signalJammer'|'decoyDrone')` `cleanSlate()` `buyStash()` `refreshMarket()` `buyMarket(i)` `buyMaterial(matId, n)` (L15+) `buyHome(id)` `setHome(id)` `buyPaint(id)` `setPaint(frameUid, id)` |
| world | `travel(districtId)` `setThreat('calm'|'tense'|…|'overclock:n')` `unlockDistrict(id)` |
| endless | `spendLegacy(nodeId)` `succession(heirName, heirloomUid)` |
| misc | `addCredits(n, reason)` `giveXp(n, source)` `save(slot?)` `setSites(districtId, sites)` |

### Events (`game.on(name, fn)`, `'*'` gets `(payload, name)`)
`toast {text, kind}` · `credits {credits, delta, reason}` · `xp {xp, xpMax, gained, source}` · `levelUp {level, features}` · `sync {frame, sync, modUnlocked}` · `legacy` · `loot {items, credits?, from?}` · `autosalvage` · `stash:full` · `equip {frame, slot, item, prev}` · `salvage` · `tune {item, ok, ...}` · `recalibrate` · `materials` · `frame:buy|frame:swap|frame:mk|frame:mod` · `rental:fee|rental:return` · `repair` · `wreck {cost, checkpoint}` · `playerDown` (player combatant hit 0 from a DoT during `tick`) · `consumable` · `perk` · `board` · `contract:accept {mission}` · `contract:step {index, step, info|choice}` · `twist {twist}` · `contract:complete` (see below) · `contract:fail {mission, reason, rep, credits}` · `kill {enemy, defId, rank, xp, credits, items, rep}` · `heat {stars, ...}` · `clue {id}` · `story {id, title, clues, reveal, unlocks, grants, next}` · `district:unlock {id, name}` · `travel` · `shift {shift, fee}` · `succession` · `save` · `home` · `paint` · `paint:buy` · `overclock:unlock {n}`

`contract:complete` payload (`finishContract` also returns it): `{mission, credits, surcharge, bonuses:[{id, pct}], xp, items, rep, clue, story, levelFrom, levelTo, grade:'S'|'A'|'B'|'C', stiffed, overclockUnlocked?}`. `toUiComplete(out, game)` turns it into the results card.

### Runner contract (js/game/* drives the steps)
Mission: `{id, title, blurb, archetype, grade, level, district, client, faction, target, npcs, steps, enemies, twist, boss, timeLimit, parTime, modifiers, checkpoints, story?, payout}`.
- Step types (`STEP_TYPES`): `goto{site, radius}` `pickup{site, item}` `deliver{site}` `kill{target:'all'|'target'|'realTarget'|'boss', site?}` `killCount{n}` `destroy{objs:[{site}]}` `hack{sites, time}` `photo{site, shots, holdTime, target?}` `tail{duration, minD, maxD, endSite?}` `escort{npc, path}` `defend{site, duration, waves, spawns}` `race{checkpoints, par}` `capture{site?}` `exfil{site, radius}` `choose{options:[{label, outcome, fail?, payMult?}]}` `survive{seconds, orExfil?}`. Every step has `id` and usually `label`. Steps with `auto:true` are skipped by `completeStep`.
- `enemies: [{pack, faction, atStep, site, units:[{defId, rank, level, eliteMods?}]}]` — spawn a pack when the runner reaches `atStep`. `spawnEnemy(unit)` gives the combatant (`robotKind`, `paint`, `size`, `ai`, `bossBar`, `nameColor`, `move`, `skills`…).
- Twist: fire with `fireTwist()` when `stepIndex >= twist.atStep` (it may splice new steps/NPCs/enemies).
- Site ids resolve through the `sites` registry; `sitesFor(districtId, registry)` in `missions.js`.

## Other modules
- `missions.js`: `generateBoard(ctx)`, `generateContract(rng, ctx, opts)`, `validateMission(m, sites?)` → `{ok, errors}`, `missionPayout`, `completionRewards`, `missionLevel`, `threatDef`, `sitesFor`.
- `stats.js`: `computeStats({frameDef, sync, tier, level, items, extras})`, `resolveHit(attacker, defender, skill, rng, opts)` → `{hit, miss, crit, backstab, amount, shieldDmg, hullDmg, killed, element, statuses, blocked, chain?, thorns?, shieldBroke?}`. `opts`: `comboIndex`, `backstab`, `frontal`, `falloff`, `pellet`, `dryRun`. Also `enemyStats`, `armorDR`, `skillDps`, `effectiveHp`, `tickCombatant`, `useSkill`, `skillReady`, `addStatus`, `removeStatus`, `heal`.
- `loot.js`: `rollItem(rng, {ilvl, slot, rarity, q, rental, lootState, minRarity, forceAffixes, element, name})`, `rollKillLoot`, `rollCache`, `rollHeirloom`, `makeHeirCore`, `itemFR`, `isUpgrade`, `salvageYield`, `tuneCost`, `recalibrateCost`, `marketStock`, `affixLabel`.
- `enemies.js`: `createEnemy(spawn, {threat, riderLevel})`, `chooseEnemySkill(c, distanceM)`, `buildEnemies`, `enemyBudget`, `setSupportedRobotKinds(kinds)` (tell it which createRobot kinds exist; others use `fallbackKind`).
- `economy.js`: `xpNext`, `addXp`, `killXp`, `framePrice`, `mkUpgrade`, cost helpers, `legacyStats`, `nextGoal(state)`, `featuresAt(level)`.
- `factions.js`: rep tiers, `stance`, heat (`addHeat`, `heatStars`, `heatEffects`), `canHarm(faction)` (civilians are immune, D15).
- `story.js`: `storyReady`, `completeStory`, `buildStoryMission(id, ctx)`, `codexView`, `scriptBeats(sceneId, trigger)` → `[{speaker, text, vo, …, speakerInfo}]`, `scriptTriggers(sceneId)`, `rollEcho`.
- `save.js`: `createSaveStore(storage?)` → `{save, load, has, clear, exportText, importText}`, `serialize/deserialize/migrate`, `SAVE_VERSION` (2). Keys `heirframe.save.<slot>` + `.bak`.
- `rng.js`: `createRng(seed)` (`next int range chance pick weighted shuffle sample gauss split fork state`), `rngFor(...labels)`, `hashString`.
- `ui_adapt.js` (sim → `js/ui/README.md` shapes): `uiConfig()` (7 rarities for `ui.config`), `toUiItem(item, {compareTo})`, `toUiContract(m)`, `toUiBoard(game)`, `toUiWarehouse(game)`, `toUiCodex(game)`, `toUiComplete(out, game)`, `uiMats(materials)` (adds the UI's `scrap`/`shards` keys).

## Tools
- `node tools/sim/test.mjs [--quick]` — determinism, save round-trip/migration/backup, loot distributions, 10k generated contracts validated and played through the state machine, all 30 story missions in order, frames/broker/overclock, combat, ui_adapt.
- `node tools/sim/balance.mjs [--hours 60] [--seed n] [--quiet] [--rotate] [--json]` — bot plays Tense contracts; prints hourly curve, ECONOMY §9 milestones and the average-gear grunt TTK table.

## Changes
- v2 (finisher): save v2 (`homesOwned`), `overclock.unlocked` now advances; new actions listed above. Nothing renamed.
- ui_adapt: added fields only (items: `fr tune tuneMax tuneCost tuneChance salvage isNew better`; contracts: `badge suits`, `bonus` is now always null (it held the badge string, which the UI rendered as "+NaN bonus"), `location` is a site name not an id; board `threats` became `[{id, name, locked, unlock}]` (the old id list is `threatIds`); warehouse: `mk mkMax mkCost slotsAllowed shop invMax`, materials carry both key sets).
