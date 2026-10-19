# VECTOR PROTOCOL — Design (combat canon)

Owner: design agent. Data contract = `js/sim/SCHEMA.md` (sim-owned); this doc uses its field names.
The numbers live in `js/data/rules.js` (→ `DATA.rules`, overriding `js/sim/constants.js`).
**Measured harness results beat anything written here** — changes get logged in `docs/notes/design.md`.

---------------------------------------------------------------------------------------------------
## 1. Time
- Tick 100 ms (`TICKS_PER_SEC 10`). Data is in seconds.
- Battle = 1–3 waves (`ROUND n/3`). **Wave timeout 75 s = the battle is lost** (readable, punishes stall squads).
- **Overtime** (`rules.overtime`): from 45 s into a wave, everyone deals +4% damage per second and heals/shields at half strength, which kills tank+healer stalemates. The HUD shows OVERTIME.
- Wave gap 2 s; between waves living player units heal **10% max HP** (`waveHeal 0.10`), keep HP + charge, statuses (incl. shields) clear, dead stay dead.
- Deploy: units can't act for the first 1.0 s of a wave (deploy anim).

## 2. Stats (UnitDef.base)
| key | meaning | L1 common tank / archer / mage |
|---|---|---|
| `hp` | max HP | 1250 / 900 / 880 |
| `atk` | attack power — all damage, heal and shield numbers scale off it | 90 / 161 / 130 (template × `ATK_SCALE` 1.55) |
| `def` | armour; damage × `300/(300+def)` (`defK 300`) | 55 / 30 / 30 |
| `spd` | **attack interval in seconds** (lower = faster; `mods.spd +0.2` = 20% faster) | 1.6 / 1.2 / 1.5 |
| `crit` | crit chance (cap 0.75) | 0.05 / 0.10 / 0.05 |
| `critDmg` | extra crit damage (0.5 → ×1.5) | 0.5 |
`growth` per level (not compounding): hp 0.09, atk 0.08, def 0.06 (unit-specific tweaks allowed).
Rank multiplies hp/atk/def: `rankMult [1, 1.15, 1.32, 1.52, 1.75, 2.0]` for rank 0–5.
Rarity = **starting rank** (Common 0, Rare 1, Epic 2, Legendary 3) **plus a max rank** (Common 4, Rare/Epic/Legendary 5), see ECONOMY.md.
Base stats scale by rarity ×1.0 / 1.08 / 1.16 / 1.25 (`RB` in units.js), on top of start rank, ceiling and better abilities. Sim matchups at honest rank: common 17% · rare 35% · epic 48% · legendary 59%.
Derived in battle: `shield` (absorbs first; total ≤ 60% max HP), `charge` 0–100.

Power (UI, matchmaking): sim's `unitPower` (`√(EHP × DPS)/2 × ability-level factor`). Recommended power in MAPS.md is in that unit.

## 3. Damage
```
dmg = srcAtk × mult × 300/(300+def) × (1+dmg mods) × triangle × (1 − dr, cap 0.6) × crit × variance(±6%)
```
`pierce:true` ignores def. Burn ignores def. Heals = `srcAtk × mult × (1 + heal mods)` (or `pctMax` of target max HP). Shields same.

### Role triangle (D6)
**Archer > Mage > Tank > Archer.** Advantage +20% dealt; a defender with the advantage takes −15% (`triangle {adv 0.20, resist 0.15}`, softened from .25/.20 after sim matchups).
UI: small green ▲ / red ▼ next to the damage number.

## 4. Board & position bonuses (D4, D6)
Per side 6 slots `{col, lane}`: col 0 = **front** (centre line), 1 = **back**; lane 0 near / 1 mid / 2 far. Units never move.

| Role | Slot | Bonus |
|---|---|---|
| Tank | front | **Bulwark**: `dr 0.10` + **Guard** (taunt aura on its lane ±1) |
| Tank | back | **Out of reach**: `dmg −0.30` (melee from the back row) |
| Archer | back | **Overwatch**: `atk +0.20`, **+35% vs Tanks** (armour-piercing; this is how archers matter when the front row screens) |
| Archer | front | **Exposed**: `dr −0.15` |
| Mage | back | **Focus**: `atk +0.10, heal +0.15` |
| Mage | lane 0 or 2 (side) | **Flank Field**: `charge +0.15` (stacks with Focus — B-near / B-far is the mage seat) |

## 5. Targeting (lane-aware, front shields back)
Basic attacks (`pick:'lane'`):
1. **Taunt / Guard** — a living enemy with `taunt` in the attacker's lane ±1 is chosen first.
2. **Screen** — candidates = enemy front column; only when it's empty, the back column.
3. **Lane** — same lane first, then nearest lane; ties seeded-random.
4. `stealth` units are skipped while any other candidate exists.
5. **Marked** (`marked`) — takes +20% damage (`dr −0.2`); *proposed*: single picks prefer marked units after taunt (sim request).
A target is kept until it dies.
Ability picks: `backline` (snipers — ignores screen + taunt), `lowest_hp`, `highest_atk`, `random ×n`, `frontline`, `lane_all`, `column`, `adjacent`, `all`, `lowest_hp_ally`, `self`. `splash` hits neighbours at a fraction.

## 6. Overdrive (D5)
- `charge` 0→100 (`rules.charge`): **+10 per basic attack landed**, **+0.5 per 1% max HP lost** (`perHitTakenPctHp 50`), **+1.5/s** trickle, **+10 on kill**. × (1 + `charge` mods) × unit `chargeRate`.
- Slow attackers (tanks, interval 1.6–2.0) get `chargeRate 1.2–1.3` so everyone's first Overdrive lands at **~10–13 s**.
- **AUTO on**: fires when ready and able. **AUTO off**: player taps the charged portrait (recorded input `{t, unitId}`).
- Firing: wind-up 0.3 s (plate flash + name banner) → effect → `overdriveRecover 0.8` s busy. Charge → 0. Stun during wind-up: proposed cancel + refund 50 (sim request; optional).
- Charge **carries between waves**; death loses it.
- Readability: same-side Overdrives start ≥ 0.4 s apart (queue) — battle-renderer concern; sim may ignore.

## 7. Status effects (sim ids; `DATA.statuses` extends)
| id | UI name | effect | typical dur |
|---|---|---|---|
| `burn` | Burn | dot `srcAtk × 0.25`/s, ignores def, stacks ×3 | 4 s |
| `stun` | Stun | no attacks / Overdrive, charge frozen | 1.5 s |
| `shock` | Shock | = stun, applied by electric abilities (blue VFX) | 1 s |
| `slow` | Slow | `spd −0.3` | 3 s |
| `weaken` | Weaken | `atk −0.25` | 4 s |
| `expose` | Shred | `def −0.4, dr −0.15` | 4 s |
| `marked` | Marked | `dr −0.2` (+ preferred target, proposed) | 5 s |
| `emp` | EMP | charge gain ×0 | 3 s |
| `fortify` | Fortify | `dr +0.25` | 5 s |
| `haste` | Haste | `spd +0.35` | 5 s |
| `overclock` | Overclock | `atk +0.3, crit +0.15` | 5 s |
| `regen` | Repair Field | hot `srcAtk × 0.2`/s | 5 s |
| `taunt` | Taunt | enemies in lane ±1 must target me | 3 s |
| `stealth` | Cloak | skipped by single picks | 3 s |
EMP also drains charge on apply via a paired `{type:'charge', amount:-20}` effect.
Cleanse removes debuffs; dispel removes enemy buffs + shields.
UI: max 4 status icons above the HP bar (CC first); CC also rings the base plate (stun yellow, shock/EMP blue-white crackle, taunt red).

## 8. Waves, win, stars
- Win: all waves cleared. Lose: squad wiped, or a wave times out.
- **Mutual KO** (sim-4): if your last unit and the final wave's last enemy fall on the same tick, it's a **win** (0 survivors, so only the *win* goal). A wipe while waves are still to come is a loss: nobody is left to fight them.
- **Squad integrity** (top bars) = Σ hp / Σ max hp of that side (enemy bar resets each wave).
- Stars = **3 goals per level** (sim-2): goal 1 is always *win*; goals 2–3 are replay challenges (no unit lost, win in ≤ N s, win with ≤ K units, win without a role, win with 3+ units of a faction, finish with ≥ X% integrity). Each goal is earned **once and independently**, and each first completion pays a small reward (`goalRewards`). Every map has **3 star chests** at ~50/75/100% of its stars (chips, Overclock Cores, a card at 100%). Goals are generated in `js/data/maps.js` (`goalsFor`); time limits come from `node js/data/_gen_star_times.mjs`. Levels without `goals` fall back to the old rule (★ win, ★★ ≤ 1 lost, ★★★ no losses).

## 9. Synergies (D7) — counted at battle start, dead units still count
Legendaries (gold plate) count for their own faction.

### Faction (highest tier only; to = that faction's units)
| Faction | 2 | 4 | 6 (applies to all) |
|---|---|---|---|
| **Corporate** — *Compliance Grid* | hp +8%, def +15% | hp +15%, def +30%, heal +10% | hp +25%, def +45%, heal +20% |
| **Rogue** — *Street Rules* | crit +10% | crit +18%, critDmg +25% | crit +25%, critDmg +40%, atk +10% |
| **Experimental** — *Unstable Core* | charge +15% | charge +30%, dmg +5% | charge +35%, dmg +8% |

### Role mix (all that apply stack)
| Name | Condition | Bonus |
|---|---|---|
| **Triad Protocol** | ≥1 Tank, ≥1 Archer, ≥1 Mage | all: hp +6%, atk +6% |
| **Full Spectrum** | ≥2 of each role | all: another hp +6%, atk +6% (12% total) |
| **Iron Wall** | ≥3 Tanks | Tanks: hp +20%, dr +5% |
| **Firing Line** | ≥3 Archers | Archers: spd +12% |
| **Resonance** | ≥3 Mages | Mages: heal +20%, charge +10% |
Design intent: with 2–3 slots you pick *one* synergy (Lone 2-faction tier or Triad); at 6 slots, 4+2 faction splits, Full Spectrum vs. stacked-role builds become real choices.

## 10. Abilities
Each unit: `attack` (basic), `passive`, `overdrive` (SCHEMA AbilityDef). ROSTER.md has the human text; `js/data/abilities.js` the data.
Ability levels 1–5 (`perLevel`, ~+8–12% `mult` per level); level cap rises with rank (`capByRank [1,2,3,4,5,5]`).

## 11. Elites & bosses (enemy-only modifiers, `js/data/enemies.js`)
- **Elite** units: separate UnitDefs (`*_elite`) with ×1.6 hp, ×1.25 atk; red-gold plate ring.
- **Boss** units: UnitDefs in `enemies` with ×4 hp, ×1.5 atk, model scale 1.35, a `low_hp` 50% phase passive (enrage / summon-style buff), unique Overdrive. Usually slot F-mid.

## 12. Buffs (consumables; one per battle, chosen on the squad screen)
| id | name | mods |
|---|---|---|
| `stim_pack` | Stim Pack | atk +15% |
| `plating_kit` | Plating Kit | hp +15% |
| `capacitor` | Capacitor | charge +25% |
| `aegis_cell` | Aegis Cell | dr +10% |
| `targeting_suite` | Targeting Suite | crit +12%, critDmg +20% |
Bought in the Workshop for credits, dropped by events/arena shop (ECONOMY.md). XP/loot boosters are **not** buffs — they're event rewards applied on the results screen (proposed `rewardBoost`).

## 13. Readability (battle + UI)
- Damage numbers: white normal, yellow crit (bigger), green heal, cyan shield absorb, orange burn, purple pierce.
- Overdrive: 0.3 s plate flash in faction colour + banner (`BULWARK — AEGIS WALL`), then the spectacle (each Overdrive's VFX brief is in ROSTER.md).
- Shields: a hex-tiled bubble/plane in faction colour (`setShield(0..1)` = shield/maxHp ÷ 0.6).
