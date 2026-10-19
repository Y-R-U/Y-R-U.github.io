# js/sim — VECTOR PROTOCOL simulation

Pure ES modules, no DOM, no three.js. Everything runs in node (`node tools/sim/test.mjs`)
and the browser. Deterministic: same inputs + seed ⇒ same events.

| file | what |
|---|---|
| `battle.js` | `createBattle`, `simulateBattle`, `autoSlots`, `prepareData`, `TICKS_PER_SEC` |
| `data.js` | `loadData()` → prepared DATA (`js/data/index.js` if present, else fixture) |
| `stats.js` | `unitStats`, `unitPower`, `squadPower`, `activeSynergies`, mod helpers |
| `rng.js` | `createRng(seed)` mulberry32 (`next/int/range/chance/pick/shuffle/weighted/fork`) |
| `constants.js` | default rules/statuses, roles, factions, rarities |
| `progression.js` | unit xp/levels, rank-up, ability levels, HQ skills, company level |
| `economy.js` | wallet, costs, rewards, recruit rolls |
| `arena.js`, `events.js`, `story.js` | arena ladder + rival generation, event rotation, story progress/stars |
| `save.js` | localStorage `vectorprotocol.save.v1` (+ in-memory fallback), versioned, migrations |
| `game_state.js` | **the facade the UI calls** (see below) |
| `fixture_data.js` | small complete example dataset (copy its shapes) |
| `SCHEMA.md` | data contract for `js/data/*` |

## Battle

```js
import { createBattle, simulateBattle, TICKS_PER_SEC } from './js/sim/battle.js';
const b = createBattle({
  data,                       // prepared DATA (loadData()); omit = fixture data
  player: { units: [{ def:'aegis', level:5, rank:1, slot:{col:0,lane:1}, abilityLevels:{attack:1,passive:1,overdrive:2}, uid:'u3' }],
            mods: {atk:0.05}, buffs:['stim_pack'] },
  enemyWaves: [ { units:[…] }, { units:[…] } ],   // alias: waves, or enemy (single squad)
  seed: 1234,
  auto: true,                 // AUTO on: player overdrives fire when ready
  inputs: [],                 // recorded inputs to replay (result.inputs from an earlier run)
});
const evts = b.step(n);       // advance n ticks (10 ticks = 1 s); returns the events produced
b.state; b.events; b.done; b.result;
b.fireOverdrive('p3');        // manual (AUTO off); false if not charged/alive. Recorded.
b.setAuto(false);             // recorded too, so replays are exact
b.forfeit();                  // ends now as a loss, reason 'forfeit'; returns the end event(s)
simulateBattle({...}) → result   // runs to the end, no event log (record:true → {result, events})
```
Game time is **ticks** (`TICKS_PER_SEC = 10`). Renderer pattern: keep a sim clock, call
`step(1)` whenever `simClock >= b.t + 1`, at speed ×1/×2/×4 just advance faster. To start an
attack animation *before* its fire frame, step a few ticks ahead and play events by `t`:
every attack/ability event carries `fireT` and `impactT`.

### Unit ids & slots
Player units `p{slotIndex}`, enemies `e{wave}_{slotIndex}`; `slotIndex = col*3 + lane`,
`col 0 = front (centre line), 1 = back`; `lane 0 near, 1 mid, 2 far`. Missing/duplicate
slots are auto-assigned (tanks front, mid lane first).

### Events (all have `t` = tick emitted)
| type | fields | renderer use |
|---|---|---|
| `wave` | `phase:'start'|'clear', wave (1-based), of, units[]` (start: enemy ids spawned) | deploy anim / ROUND n/N |
| `attack` | `src, dst, targets[], ability, delivery:'melee'|'projectile'|'beam'|'instant', fireT, impactT, shot, crit` | start attack anim at `t`, muzzle at `fireT`, projectile lands `impactT` |
| `ability` | `kind:'overdrive'|'passive', src, ability, targets[], delivery, fireT, impactT, impacts[] (per target, overdrive), shot, area:{side,pick}, trigger (passive)` | overdrive banner + VFX; passive proc popup |
| `hit` | `src, dst, amount (hp lost), absorbed (by shield), crit, adv:'adv'|'resist'|null, ability, shot, dot, status, hp, maxHp, shield, kill` | damage number, hitFlash, link to projectile by `shot` |
| `fizzle` | `src, dst, shot` | projectile reached a dead target |
| `heal` | `src, dst, amount, ability, hp, maxHp` | green number |
| `shield` | `src, dst, amount, shield (total), duration, broken?` | `setShield(shield/maxHp/0.6)` |
| `buff` / `debuff` | `src, dst, status, duration (s), stacks, ability` | status icon / plate ring |
| `status_end` | `dst, status, reason:'expire'|'cleanse'|'dispel'` | |
| `overdrive_ready` | `src` | portrait glow |
| `cancel` | `src, ability, shot, refund` | overdrive interrupted by stun during wind-up |
| `death` | `dst, src` | die anim |
| `revive` | `src, dst, hp, maxHp` | |
| `overtime` | `wave, dmgPerSec, healPenalty` | "OVERTIME" banner (wave ran past `rules.overtime.start` s; damage ramps, heals halved) |
| `end` | `win, reason:'victory'|'defeat'|'timeout'|'forfeit', stars, result` | results screen |

### `state` (stable object, updated in place after every `step`)
```js
{ t, time (s), tps, phase:'fight'|'gap'|'done', wave (1-based), waves, auto, seed, done, waveTimeLeft, overtime (bool), overtimeMult,
  player: { units:[UnitView], integrity (0..1), hp, maxHp, synergies:[{id,name,kind,tier,count,mods}] },
  enemy:  { units:[UnitView of current wave], integrity, hp, maxHp, synergies },
  units:  { [id]: UnitView } }   // every unit ever spawned
UnitView = { id, uid, side, wave, def, name, role, faction, rarity, model, level, rank,
  slot:{col,lane}, slotIndex, posBonus:['front'|'back'|'side'|'mid'],
  hp, maxHp, hpPct, shield, charge (0..100 int), chargePct (0..1), overdriveReady, alive, stunned,
  statuses:[{id, kind:'buff'|'debuff', icon, stacks, remaining (s)}],
  abilities:{ attack|passive|overdrive: {id, name, icon, level, kind} } }
```

### `result`
`{ win, reason, stars (0-3), seed, ticks, time, waves, wavesCleared, integrity, enemyIntegrity,
   survivors[], lost[], playerHp:{id:hp}, uids:{id:uid}, stats:{[id]:{dealt,taken,healed,shielded,kills,overdrives}},
   mvp, inputs[], auto }` — pass straight to `game.completeBattle(result)`.

Rules in force are `DEFAULT_RULES` (constants.js) overridden by `DATA.rules`; behaviour is
specified in `docs/DESIGN.md`.

## Game state facade (`game_state.js`)

```js
import { loadData } from './js/sim/data.js';
import { createGame } from './js/sim/game_state.js';
const data = await loadData();
const game = createGame({ data });          // opts: storage (false = memory only), now (ms clock), key, autosave
if (!game.load()) game.newGame({ name: 'Kestrel Contractors' });
const off = game.on('change', ({ what }) => render());   // also 'reward', 'unlock', 'rankup', 'recruit'
```
Every action returns `{ ok:true, … }` or `{ ok:false, reason }` (`cannot_afford`, `locked`,
`at_cap`, `not_at_cap`, `not_enough_shards`, `max_rank`, `ability_cap`, `too_many_units`,
`bad_slot`, `duplicate`, `empty_squad`, `not_active`, …) and autosaves.

| Query | Returns |
|---|---|
| `game.save` | the raw save (read-only by convention) |
| `game.wallet` | `{credits, scrap, chips, arena_tokens, event_marks}` |
| `game.units()` / `game.unit(uid)` | UnitCard: save fields + `name, role, faction, rarity, model, stats{hp,atk,def,spd,crit,critDmg}, power, levelCap, xpToNext, xpToCap, maxRank, shards, rankUpCost, canRankUp, abilityCap, abilities{attack,passive,overdrive ids}, inSquad` |
| `game.formation()` | `[{uid, slot:{col,lane}}]` · `game.slots` = unlocked squad size |
| `game.squadUnits()` / `game.power()` / `game.synergies()` | battle-ready squad, its power (with HQ + buff), active synergies |
| `game.maps()` | `[{id, name, levels, cleared, stars, maxStars, done, unlocked, chests:[Chest]}]` |
| `game.levels()` / `game.level(id)` / `game.nextLevel()` | story nodes with `unlocked, stars, power, boss`; `level(id)` also has `goals:[Goal]` |
| `game.goals(levelId)` | `[Goal]` — the level's 3 star goals (see **Star goals**) |
| `game.chests(mapId)` | `[Chest]` = `{index, stars (needed), rewards, ready, claimed}` |
| `game.bannerPool(bannerId)` | unit ids you can currently pull from that banner (Rift units appear as their levels are cleared) |
| `game.surplusShards(defId)` | shards beyond what the unit still needs to reach max rank (convertible) |
| `game.arenaRivals()` | 3 rivals `{name, rating, power, units, difficulty:'easy'|'even'|'hard'}` (regenerated after each match) |
| `game.arenaTier()` · `game.activeEvents()` · `game.day()` | |

| Action | |
|---|---|
| `setFormation([{uid, slot}])`, `autoFormation()` | ≤ `slots` units, unique slots |
| `feedScrap(uid, scrap?)` | pour scrap (+ credits) into xp, up to the level cap |
| `levelUp(uid, n=1)` | buy n levels with scrap + credits |
| `rankUp(uid)` | needs level cap + shards + credits; raises the cap |
| `upgradeAbility(uid, 'attack'|'passive'|'overdrive')` | capped by rank |
| `upgradeHq(id)` | company tech tree |
| `upgrade(kind, ...args)` | dispatcher: `'level'|'scrap'|'rank'|'ability'|'hq'` |
| `convertShards(defId, n?)` | surplus shards → chips (`economy.shardExchange`, per-shard by rarity) → `{shards, gained:{chips}}`; `no_surplus`, `not_owned` |
| `convertAllShards()` | every owned unit's surplus at once |
| `autoFormation(opts?)` | opts `{maxUnits, excludeRoles:[role], minRole:{role:n}, minFaction:{faction:n}, apply:false}` |
| `goalFormation(levelId, apply=true)` | auto formation that satisfies the level's still-open goals (e.g. ≤3 units, no Tanks) |
| `buyBuff(id, n)`, `selectBuff(id|null)` | the selected buff is consumed by the next battle |
| `recruit(bannerId, n=1)` | `{results:[{def, rarity, isNew, uid?|shards}]}` seeded from the save |
| `startLevel(id)` / `startArena(rivalIndex=1)` / `startEvent(eventId, tierId)` | → **battle config** `{ok, kind, data, seed, player, enemyWaves, level?|rival?|event?}` — pass to `createBattle(cfg)` / the battle scene |
| `completeBattle(result)` | applies rewards → `{win, stars, firstClear, newStars, currency{}, xp{uid:n}, levelups[], shards{}, cards[], buffs{}, unlocks[], rating?, companyLevel?}`; story also `goals:[bool×3]` (this run), `newGoals:[index]` (first completions), `chests:[{mapId, index, stars, rewards}]` (granted now) |
| `buyArena(itemId, choiceDefId?)` | arena shop |
| `advanceDay(n)` | dev/harness: shift the virtual day (event rotation) |

### Dev cheats (sim-4)
```js
createBattle({ ...cfg, cheats: { invulnerable: true, oneHit: true } })
// or, with no change to the battle scene / fallback stepper (both pass cfg.player through as `player`):
cfg.player = { ...cfg.player, cheats: { invulnerable: true, oneHit: true } };
```
- `invulnerable`: every hit on a player unit is applied as 0 (shields untouched, `hit` events still fire with
  `amount:0`, so on-damaged passives still proc). **The wave timer cannot lose**: the 75 s timeout is skipped while
  invulnerable; overtime still starts at 45 s and keeps ramping (+4%/s), so the player's damage grows until the
  wave falls. `state.waveTimeLeft` still counts down to 0 and then just sits there.
- `oneHit`: any damage a player unit deals to an enemy (basic, ability, splash, DoT tick) strips the target's shields
  and kills it. Heals/shields/buffs are unchanged.
- `state.cheats` = `{invulnerable, oneHit}` or `null`; `result.cheats` is present only on a cheated run (so a replay
  needs the same flags; `inputs` alone won't reproduce it). `completeBattle` treats it like any other result.
- **Dev-only by construction**: `game_state` never puts `cheats` in a battle config, the save has no field for it,
  and there are no rules/data switches. Only a module that edits the config (js/dev/dev.js under `?dev`) can turn
  them on. Drop the old `mods.hp += 999 / atk += 999` hack (it inflated the HUD HP to 1.9M and still lost on time).

### Focus shards (sim-4, late-map luck smoothing)
- Level `firstClear.focusShards: n` (generated from `MAP_SPEC[i].focusShards = [normal, elite, boss]` in js/data/maps.js; late maps)
  gives n shards to **one of your own deployed units**: the one fewest shards short of its next rank-up (then lower rank,
  then deploy order; a unit already holding its next rank-up's shards is skipped unless all are). Nobody eligible = none.
  (Highest-rank-first was tried: it made one R5 superstar next to an R2 squad and stalled m6 for 5 h.)
- They arrive in `completeBattle(...).shards` like any shard reward (`{defId: n}`), so reward screens need no change.
  **First clear only**: the generator never puts them in `rewards`, because story replays pay shards at full value and a
  targeted replay farm would out-earn the arena shop several times over. (Any reward bag may carry `focusShards`; game_state
  handles it the same everywhere.)
- `focusOnly: true` on a map spec drops the old "shards of an enemy unit in this level" reward (m7/m8 used to drop shards for
  units most players don't own, so they mostly banked uselessly).

### Star goals (sim-2)
Every story level has **3 goals**; goal 0 is always "win". Each goal is earned **once, independently**
(a later run can pick up the ones you missed); stars = goals done. Goals only count on a win.
```js
Goal = { type, index, text, done, reward /* first-completion rewards or null */, squad /* pre-battle rule or null */,
         ...params }   // e.g. {type:'time', max:35}, {type:'max_units', n:3}, {type:'no_role', role:'tank'}
// types: win · no_losses · max_lost{n} · time{max s} · max_units{n} · no_role{role} · min_role{role,n}
//        min_faction{faction,n} · integrity{min 0..1}
// squad: {maxUnits} | {excludeRoles:[r]} | {minRole:{r:n}} | {minFaction:{f:n}} — show on the squad screen;
//        game.goalFormation(levelId) builds a squad that satisfies all open ones.
```
- Battle: `startLevel()` puts `goals` into the battle config; the sim evaluates them at the end, so the
  `end` event / `result` carries `goals:[bool×3]` and `stars` = how many were met **this run**.
- Rewards: `level.goalRewards[i]` on the first completion of goal i (goal 0's reward is `firstClear`).
- Map chests: `MapDef.chests = [{stars, rewards}]` (3 per map: ~50%, 75%, 100% of the map's stars). Granted
  **automatically** by the `completeBattle` that reaches the threshold (`out.chests`), and an `unlock`
  event `{type:'chest', chests}` fires. `game.chests(mapId)` for the map screen.
- Helpers in `story.js`: `goalText(goal)`, `evalGoal(goal, ctx)`, `goalSquadRule(goal)`.

### Shards & the Rift banner (sim-2)
- `UnitCard.surplusShards` / `shardValue` (`{chips: per shard}`) for a "convert" button on max-rank (or near-max) units.
- `DATA.units` now includes the fantasy Rift recruits (`bannerOnly: true`, `realm: 'fantasy'`, `recruitable: levelId`).
  They never appear in `pool:'all'` banners or arena rivals; `recruit.rift` (chips) is their banner, `game.bannerPool('rift')`
  lists who is available. `recruit()` returns `empty_pool` before any is unlocked.

Save: `save.js` — key `vectorprotocol.save.v1` (key name is fixed, D18), `{v, …}` (now **v2**: `story.levels[id].goals`,
`story.chests`), `migrations[n]` upgrades v n→n+1;
falls back to an in-memory map when localStorage is missing/blocked (node, private mode).

## Tools
- `node tools/sim/test.mjs [--quick]` — tests (determinism, replay, invariants, targeting, progression, save, data validity).
- `node tools/sim/validate.mjs` — schema check of `js/data` (design: run this after edits).
- `node tools/sim/balance.mjs [--quick]` — player-simulation harness (see docs/notes/sim.md for findings).
  `--unitTrials=200` for a tighter per-unit table (reported vs the unit's rarity mean).
- `node tools/sim/curve.mjs [--squad=a,b,…]` — difficulty probe: the lowest uniform level at which a reference squad wins ≥50% of each story level (sim-3).
- `node js/data/_gen_star_times.mjs` — regenerates the per-level time-goal limits (`js/data/star_times.js`);
  re-run after changing waves, unit stats or rules.
