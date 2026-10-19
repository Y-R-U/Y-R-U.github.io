# VECTOR PROTOCOL — data schema (sim-owned contract)

Design writes `js/data/*` to this schema; the sim reads it. Everything is plain JSON-able
objects (no functions) so it can be diffed, validated (`node tools/sim/validate.mjs`) and
tuned by the balance harness.

**Entry point:** `js/data/index.js` must `export default DATA` (and may also export named
parts). Until it exists the sim falls back to `js/sim/fixture_data.js`, which is a complete,
small, valid example of every shape below — **copy from it**.

```js
DATA = {
  version: 1,
  rules,        // combat constants (all optional; sim defaults in js/sim/constants.js)
  statuses,     // { [id]: StatusDef }
  abilities,    // { [id]: AbilityDef }
  units,        // { [id]: UnitDef }
  synergies,    // [ SynergyDef ]
  buffs,        // { [id]: BuffDef }        consumable pre-battle boosts
  enemies,      // { [id]: UnitDef }        optional; enemy-only units (bosses). units are also usable as enemies
  maps,         // [ MapDef ]               story maps in order
  economy,      // EconomyDef               xp curves, costs, caps, slot unlocks, rewards tables
  hq,           // { [id]: HqSkillDef }     company tech tree
  recruit,      // { [id]: BannerDef }      recruitment pools
  arena,        // ArenaDef
  events,       // { [id]: EventDef }
}
```

Conventions: ids are `snake_case`. Percent modifiers are **fractions** (`0.15` = +15%).
Time is in **seconds** in data; the sim converts to ticks (`TICKS_PER_SEC = 10`).
`role ∈ tank|archer|mage`, `faction ∈ corporate|rogue|experimental`,
`rarity ∈ common|rare|epic|legendary`.

---

## Board
Per side 2 columns × 3 lanes. A slot is `{col, lane}`: `col 0 = front` (next to the centre
line), `col 1 = back`; `lane 0 = near` (closest to camera), `1 = mid`, `2 = far`.
`slotIndex = col*3 + lane` (0..5). Abstract board coords used for distance/travel time:
player x = `-(col+1)`, enemy x = `+(col+1)`, z = `lane`; units are 1 board unit apart.

## Mods (shared stat-modifier bag)
Used by statuses, synergies, position bonuses, HQ skills, buffs, passives(aura).
All keys optional, additive within a bag, bags sum then apply as `stat*(1+sum)`.
```js
{ hp, atk, def, spd,          // fractions; spd = attack-speed (+0.2 => 20% faster)
  crit, critDmg,              // absolute adds (crit 0.1 = +10% chance; critDmg 0.5 = +50%)
  dr,                         // damage reduction fraction (capped by rules.drCap)
  dmg,                        // outgoing damage fraction
  heal,                       // outgoing heal/shield fraction
  charge,                     // overdrive charge gain fraction
  vs: { tank, archer, mage }  // outgoing damage vs role
}
```

## StatusDef
```js
{ id:'burn', name:'Burn', kind:'debuff'|'buff', icon:'burn',
  mods?: Mods,                 // while active
  dot?:  { mult },             // damage per second = srcAtk*mult (ignores def), ticks each 1s
  hot?:  { mult },             // heal per second = srcAtk*mult
  stun?: true,                 // no attacks / no overdrive, charge frozen
  taunt?: true,                // enemies in this lane ±1 must target this unit
  stealth?: true,              // can't be picked by single-target picks while others exist
  stack: 'refresh'|'stack'|'max', maxStacks?: 3 }   // refresh = reset duration (default)
```
The sim ships default statuses (burn, shock, stun, slow, weaken, expose, fortify, haste,
regen, taunt, overclock, marked); `DATA.statuses` overrides/extends them.

## AbilityDef — composable effect spec
Every unit has three: `attack` (basic, repeats on its attack interval), `passive`
(triggers), `overdrive` (fires at 100 charge).
```js
{ id:'rail_lance', name:'Rail Lance', icon:'rail', kind:'attack'|'passive'|'overdrive',
  desc:'Pierces the lane for {mult}% ATK.',              // {key} filled from effects for UI
  target: TargetSpec,                                     // attack/overdrive (passive: per trigger)
  delivery: { type:'melee'|'projectile'|'beam'|'instant'|'area',
              speed?: 8,          // projectile board-units/sec (travel = dist/speed)
              windup?: 0.3 },     // seconds from anim start to fire (default rules.windup)
  effects: [ EffectSpec ],
  // passive only:
  trigger?: 'battle_start'|'wave_start'|'aura'|'on_attack'|'on_hit'|'on_crit'|'on_kill'
           |'on_damaged'|'low_hp'|'ally_death'|'every_n'|'interval',
  n?: 3, every?: 5, threshold?: 0.4, chance?: 1, once?: true,
  aura?: { mods: Mods, to: TargetSpec },                  // trigger:'aura' only
  perLevel?: { mult?: 0.08, chance?: 0.02, duration?: 0.2, amount?: 0.05 } // ability levels
}
```

### TargetSpec
```js
{ side:'enemy'|'ally'|'self',
  pick:'lane'          // default for basic attacks: lane-aware front-first (see Targeting)
      |'lowest_hp'|'highest_hp'|'highest_atk'|'random'|'backline'|'frontline'
      |'all'|'lane_all'|'column'|'adjacent'|'self'|'lowest_hp_ally',
  count?: 1,           // for random / lowest_hp etc.
  splash?: 0.5 }       // also hits units adjacent (lane±1 same col, and behind) at 50%
```

### Targeting rules (lane-aware, front-first)
`pick:'lane'`: candidates = enemy front column alive; if empty, back column. Among
candidates prefer same lane, then nearest lane (ties → lower lane index? no: seeded random).
**Taunt** overrides: an alive enemy with `taunt` whose lane is within ±1 of the attacker's
lane is chosen first. `backline` prefers back column (snipers/assassins) and ignores taunt.
`stealth` units are skipped by single picks while any non-stealth candidate exists.

### EffectSpec
```js
{ type:'damage',  mult:1.0, flat?:0, pierce?:false /*ignore def*/, ignoreTriangle?:false, status?:StatusApply }
{ type:'heal',    mult:0.5 }                 // of src ATK (or pctMax: 0.1 of target maxHp)
{ type:'shield',  mult:0.8, duration:6 }     // absorb amount; or pctMax
{ type:'status',  status:'burn', duration:4, chance?:1, stacks?:1, mult?:0.3 } // mult feeds dot/hot
{ type:'cleanse', count:1 }                  // remove debuffs
{ type:'dispel',  count:1 }                  // remove enemy buffs/shield
{ type:'charge',  amount:25 }                // add overdrive charge (negative = drain)
{ type:'mods',    mods:Mods, duration:5 }    // ad-hoc timed buff/debuff (no named status)
{ type:'revive',  pctMax:0.3 }               // once per battle per target
// any effect may add  target: TargetSpec   to retarget (e.g. damage enemy + heal self)
```

## UnitDef
```js
{ id:'aegis', name:'AEGIS-7', role:'tank', faction:'corporate', rarity:'rare',
  model:'tank_bulwark',               // robots MODELS id
  title?:'Bulwark Frame', lore?:'…',
  base: { hp:900, atk:60, def:60, spd:1.6 /*attack interval s*/, crit:0.05, critDmg:0.5 },
  growth?: { hp:0.08, atk:0.07, def:0.06 },   // per level, compounding-free: base*(1+g*(lvl-1))
  attack:'shield_bash', passive:'bulwark', overdrive:'aegis_wall',  // AbilityDef ids (or inline objects)
  chargeRate?: 1.0 }                  // multiplier on overdrive charge gain
```
Rank multiplies stats: `rules.rankMult[rank]` (default `[1, 1.15, 1.32, 1.52, 1.75, 2.0]`).

## Squad / formation (battle input)
```js
player = { units: [ { def:'aegis' | UnitDef, level:12, rank:1, slot:{col:0,lane:1},
                      abilityLevels?:{ attack:1, passive:1, overdrive:1 }, uid?:'u17' } ],
           mods?: Mods,             // HQ skills + consumable buffs, pre-summed (game_state does it)
           buffs?: ['stim_pack'] }  // BuffDef ids (alternative to mods)
enemyWaves = [ { units:[ same shape ], mods?:Mods }, … ]   // 1–3 waves
```

## BuffDef (consumable)
`{ id:'stim_pack', name, icon, desc, mods:Mods, cost:{credits:200} | null, battles:1 }`

## SynergyDef
```js
{ id:'corp_link', name:'Corporate Link', kind:'faction', faction:'corporate',
  tiers:[ {count:2, mods:{def:0.10}}, {count:4, mods:{def:0.2, hp:0.1}}, {count:6, …} ],
  to?:'faction'|'all' }        // who receives it (default: units of that faction)
{ id:'triad', kind:'roles', need:{ tank:1, archer:1, mage:1 }, mods:{ atk:0.08 }, to:'all' }
{ id:'iron_wall', kind:'role', role:'tank', tiers:[{count:2, mods:{dr:0.08}}], to:'role' }
```

## rules (all optional)
```js
{ triangle:{ adv:0.25, resist:0.20 },        // Archer>Mage>Tank>Archer: +25% dealt, -20% taken
  position:{ tank:{ front:{ mods:{dr:0.15}, taunt:true } },
             archer:{ back:{ mods:{atk:0.20} } },
             mage:{ side:{ mods:{atk:0.10, heal:0.10} }, back:{ mods:{atk:0.10} } } },
  charge:{ perAttack:12, perHitTakenPctHp:60 /*charge per 100% maxHp lost*/, perSec:2, onKill:10 },
  defK: 300,          // dmg *= defK/(defK+def)
  drCap: 0.6, critCap: 0.75, variance: 0.06, windup: 0.3,
  waveGap: 2.0,       // seconds between waves
  waveTimeout: 75,    // seconds; wave not cleared => loss
  waveHeal: 0.0,      // fraction of maxHp healed between waves
  rankMult:[…], stars:{ three:'no_losses', two:0.4 } }
```

## MapDef / LevelDef (story)
```js
{ id:'m1', name:'Rust Docks', order:1, backdrop?:'assets/maps/m1.jpg',
  unlock?:{ map:'m0' },
  levels:[ { id:'m1_l1', name:'First Contract', node:1, x?:0.1, y?:0.5,  // map position 0..1
             power:120,                   // recommended power (UI only; sim computes real)
             waves:[ { units:[ { def:'scrap_drone', level:1, rank:0, slot:{col:0,lane:1} } ] } ],
             rewards:{ credits:120, xp:60, scrap:20, shards:{ aegis:1 }, cards?:['aegis'] },
             // firstClear.focusShards?: n (sim-4; any reward bag may carry it) = n shards for the deployed unit closest to its next rank (game_state picks; shows in out.shards)
             firstClear?:{ chips:10, unlockSlot?:3 },  // one-time
             starRewards?:{ 3:{ chips:5 } },
             story?:{ pre:'m1_l1_pre', post:'m1_l1_post' }, boss?:true } ] }
```

## EconomyDef
```js
{ currencies:['credits','scrap','chips','arena_tokens','event_marks'],
  start:{ credits:500, scrap:0, chips:50, units:[{def:'aegis',level:1}], slots:2 },
  xpCurve:{ base:100, growth:1.18 },          // xp to next level = base*growth^(lvl-1)
  scrapXp:1,                                   // 1 scrap = 1 unit xp
  levelCost:{ creditsPerXp:0.5 },              // credits spent alongside scrap
  levelCapByRank:[10,20,30,40,50,60],
  startRank:{ common:0, rare:1, epic:2, legendary:3 },
  rankUp:{ shards:[10,20,40,80,160], credits:[500,2000,6000,15000,40000] },  // to reach rank r+1
  dupeShards:{ common:10, rare:10, epic:10, legendary:10 },  // duplicate pull -> shards
  abilityLevel:{ max:5, cost:{ credits:[300,1200,4000,10000], chips:[0,5,15,40] }, capByRank?:[1,2,3,4,5,5] },
  slotUnlocks:{ 3:'m1_l10', 4:'m2_l10', 5:'m4_l5', 6:'m6_l5' },   // slot -> level id first clear
  battleXp:{ perLevel:1.0 }, // unit xp per battle = level.rewards.xp * this for each deployed unit
  replay:{ rewardMult:0.6 }, // story replay reward multiplier
  power:{ hp:0.1, atk:1.0, def:0.5 } }        // power rating weights (sim default formula)
```

## HqSkillDef
`{ id:'armor_lab', name, branch:'defense', max:5, cost:{credits:[…], chips:[…]}, requires?:{ hq:'x', level:2, companyLevel:3 }, mods:Mods /*per level*/, effect?:{ arenaTokens:0.1, recruitDiscount:0.05, scrapGain:0.1 } }`

## BannerDef (recruitment)
`{ id:'standard', name, cost:{ credits:1000 } | { chips:100 }, rates:{ common:0.7, rare:0.24, epic:0.055, legendary:0.005 }, pool:['aegis',…] | 'all', pity?:{ epic:30, legendary:120 }, featured?:['x'] }`

## ArenaDef
`{ tiers:[ { id:'bronze', minRating:0, reward:{ arena_tokens:20, credits:300 } }, … ], startRating:1000, k:32, ratingPowerScale?: 0.9 /*rival power ≈ yours*(0.85..1.15)*/, shop:[ { id, item:{shards:{x:5}}|{buff:'id', n:1}|{scrap:n}, cost:{arena_tokens:50} } ], seasonDays:7, matchesPerSession?:… }`
No energy (D10): matches unlimited; rewards shrink with repeats per "season-day" via `diminish:[1,1,1,0.5,...]` optional.

## EventDef
`{ id:'daily_scrap', name, kind:'daily'|'trial'|'raid', rotation:{ days:[0..6] }|{ everyDays:7 }, faction?:'rogue', tiers:[ { id, power, waves:[…], rewards:{…} } ], raid?:{ bossHp:…, rewardsByDamage:[…] } }`

## Extensions agreed with design (2026-10-19)
- `realm: 'scifi'|'fantasy'` on UnitDef / MapDef / LevelDef (D21). Combat ignores it.
- Fantasy NPC factions `order|wild|horde` are valid for enemy-only / `realm:'fantasy'` units (no faction synergies unless DATA.synergies defines them).
- `economy.maxRank: {common:3, rare:4, epic:5, legendary:5}`.
- Level `stars` override, merged over `rules.stars`: `{ twoMaxLost:1, threeMaxTime?: 40 /*s, with no losses*/ }`.
- Unknown keys on any def are ignored (visual, od_vfx, launch, boss, scale, …).
