# VECTOR PROTOCOL — Economy & progression

Owner: design. Data: `js/data/economy.js`, `hq.js`, `recruit.js`, `arena.js`, `events.js`, `buffs.js`, and the reward formulas in `maps.js`.
**No energy and no real money (D10).** Progress is gated only by power. **The balance harness (`node tools/sim/balance.mjs`) is authoritative**; see § Balance status at the end.

## Currencies
| id | name | what it's for | main sources | main sinks |
|---|---|---|---|---|
| `credits` | Credits | everything: levelling fee, rank-ups, abilities, HQ, Street Hire, buffs. Co-binds with shards (sim-3 harness): a capped unit usually waits on both | every battle, arena (tier-scaled), Vault Job, raid | levelling (0.3/xp), rank-up, ability, HQ, Street Hire 1500, buffs 400–800 |
| `scrap` | Scrap | **unit XP** (1 scrap = 1 xp) | every battle, **Salvage Run**, arena, raid, arena shop crate | feeding robots in the Workshop |
| `chips` | Chips | premium-feel currency, earned only by play | first clears (10 / elite 25 / boss 60), star goals (4+6, elite 8+10, boss 15+20), map star chests, **surplus-shard exchange**, trials, arena season, raid, arena shop | Corporate Contract 120, **Rift Gate 150**, ability levels 3–5, HQ tiers |
| `arena_tokens` | Arena Tokens | arena shop + League Draft | arena wins (4–15 by tier, 30% on a loss) | shards of your choice, scrap crates, buffs, chips, League Draft 250 |
| `event_marks` | Event Marks | faction drafts | faction trials (10–50 per tier) | Halvorsen Surplus / Ledger Black Market / Lattice Signal (100 each) |
| shards (per unit) | Shards | rank-ups | story rewards every level (map 6 drops Rift-recruit shards that bank until you recruit them), duplicates (10 per dupe), trials, arena shop (5 for 120 tokens) | rank-up; **surplus → chips** (below) |

Typical income per story battle at enemy level L: credits `80+30L`, scrap `15+6L`, unit xp `30+10L` **for each deployed unit**, plus 2 shards (4 on elite nodes, 8 on bosses). Credits and scrap are ×1.6 on elite nodes and ×2.5 on bosses. Replays pay 60%.

## Unit progression
- **XP curve**: xp to next level = `100 × 1.08^(L−1)`. For reference: L10 = 1.4k total, L20 = 4.6k, L30 = 11.3k, L40 = 26k, L50 = 57k, L60 = 116k.
- **Feeding scrap** costs 1 scrap + 0.3 credits per xp.
- **Rank** (0–5) multiplies hp/atk/def by `[1, 1.15, 1.32, 1.52, 1.75, 2.0]` and sets the **level cap** `[10, 20, 30, 40, 50, 60]`.
  - Rarity sets the start rank (Common 0 · Rare 1 · Epic 2 · Legendary 3) and the **max rank** (Common **4** / cap 50 · Rare, Epic and Legendary **5** / cap 60).
  - Rank-up to r+1 costs shards `[14, 34, 54, 74, 94]` and credits `[700, 4k, 13.5k, 27k, 40k]` (sim-3: ~3× the sim-2 values, see § Balance status). A duplicate recruit becomes 10 shards.
  - **Design intent**: commons are cheap to rank and carry maps 1–5. In maps 7–8 (enemy L41–55, rank 5) a common at cap 50 / ×1.75 falls behind, so you need rares and up at rank 5. (Harness run 4 showed that a common cap of 40 walled map 6.)
- **Ability levels** 1–5 per ability (attack / passive / overdrive). Each level adds +8–12% to the ability's values. Cost: credits `[300, 1.5k, 5k, 12k]` and chips `[0, 3, 8, 20]`. The level cap follows rank (`[1, 2, 3, 4, 5, 5]`).
- **Shard exchange** (`economy.shardExchange`, sim-2): shards beyond what a unit still needs to reach its max rank convert to chips at 1 / 1.5 / 2 / 3 per shard (common / rare / epic / legendary) — `game.convertShards(def)`. Shards of units you don't own are never convertible (they bank for a future recruit).
- **Losses** still pay 25% xp (`lossXp`), so a stalled player keeps inching forward.

## Squad slots & features
Squad slots: start with 2 → **3 at m1_l5**, **4 at m2_l7**, **5 at m3_l14**, **6 at m5_l8**.
Features unlock on the first clear of: workshop m1_l2 · street recruitment m1_l4 · rank-up m1_l8 · HQ m1_l12 · abilities + buffs m2_l3 · **arena m2_l4** · daily ops m2_l10 · corporate contracts m3_l1 · faction trials m3_l8 · weekly raid m4_l1 · League Draft m4_l8 · Rift recruitment m6_l16.

## Company (HQ) skills — `hq.js`
The company level rises +10 xp per battle (curve `200 × 1.2^(L−1)`). It grows the hub compound (D15) and gates HQ tiers.
| branch | skill | per level | max | requires |
|---|---|---|---|---|
| Offense | Weapons Bay | ATK +3% | 5 | — |
| | Targeting AI | crit +3% | 3 | Weapons Bay 2 |
| | Overcharge Rails | Overdrive charge +5% | 3 | Targeting AI 1, company 10 |
| Defense | Armor Lab | HP & DEF +3% | 5 | — |
| | Shield Tech | heal & shield +6% | 3 | Armor Lab 2 |
| | Reactive Plating | damage reduction +2% | 3 | Shield Tech 1, company 10 |
| Logistics | Salvage Crew | scrap +10% | 5 | — |
| | Contracts Desk | credits +8% | 5 | — |
| | Sim Pods | unit XP +8% | 5 | company 4 |
| Network | League Agent | arena tokens +10% | 3 | cleared m2_l4 |
| | Recruiter | recruitment cost −5% | 3 | company 8 |
Fully maxed, the tree adds +15% ATK, +15% HP/DEF, +9% crit, +15% charge, +18% heal and +6% DR. That's a big late-game lever, priced so it soaks up surplus credits.

## Recruitment — `recruit.js` (pity counters are per banner)
| banner | cost | common / rare / epic / legendary | pity | pool |
|---|---|---|---|---|
| Street Hire | 1,500 credits | 72 / 24 / 3.5 / 0.5 % | epic every 40 | all 36 |
| Corporate Contract | 120 chips | 0 / 70 / 25 / 5 % | legendary every 50 | all |
| League Draft | 250 arena tokens | 0 / 60 / 35 / 5 % | legendary every 40 | all |
| Faction drafts ×3 | 100 event marks | 30 / 50 / 17 / 3 % | epic every 20 | that faction's 12 |
| **Rift Gate** (m6_l16) | 150 chips | 25 / 50 / 25 / 0 % | epic every 12 | the 8 fantasy Rift recruits, each once its level is cleared (dire_wolf m6_l5 · elf_ranger m6_l8 · horde_shaman m6_l11 · frost_wolf m6_l12 · rift_knight, elf_sage m6_l16 · minotaur m7_l6 · treant m7_l12) |
Duplicates turn into shards, so even bad pulls feed rank-ups.

## Star goals & chests (sim-2)
Each story level has 3 goals (★ win + two replay challenges, earned independently, once). First completions pay chips + credits (goal 2) and chips + scrap (goal 3). Each map has 3 star chests at 50 / 75 / 100% of its stars: chips `10+10·map` + credits/scrap `800·map` · chips `20+15·map` + Overclock Cores · chips `30+20·map` + a unit card (riot, barb, tarantula, meridian, specter, treant, juggernaut, seraph). This is the replay layer that soaks up play time instead of extra levels; see § Balance status for what it does to the time split.

## Arena — `arena.js` (D11)
- Async PvP against **generated rival companies** (sim `generateRival`) at 0.9× / ~1.05× / 1.2× your power (easy / even / hard), Elo-style rating (start 1000, K 32).
- Tiers: Scrap League 0 · Bronze 1100 · Silver 1250 · Gold 1400 · Neon 1600 · Vector Elite 1850. A win pays the tier reward (tokens 4→15, credits 100→880, scrap 150→1.3k) **plus 260 unit xp**. A loss pays 30%.
- **Weekly season** (7 virtual days): chips by tier (20→240). Rating resets to tier floor − 100 (proposed: sim).
- Shop: 5 shards of an owned unit 120 · scrap crate (1.5k) 40 · Stim/Plating 15 · Overclock Core 45 · 20 chips 80.
- Unlimited matches, no energy. Rewards don't diminish (the matchmaking rating already self-limits). If the harness shows arena farming is too strong, add `diminish`.

## Events — `events.js`
Each event has 6 tiers at enemy level 10 / 20 / 30 / 40 / 50 / 60 (3→6 units, 1–2 waves). Rewards **diminish per tier per day**: ×1, 1, 1, 0.5, 0.5, 0.25.
| event | days | reward focus |
|---|---|---|
| **Salvage Run** | daily | scrap 900 → 21,000 |
| **Vault Job** | Sun Mon Wed Fri | credits 750 → 20k |
| **Sim Drills** | Sun Tue Thu Sat | unit xp ×2.5 of a story level |
| **Trial: Halvorsen Audit** (corporate enemies) | Mon Thu Sun | event marks 10→50, chips 3→15, faction shards |
| **Trial: Ledger Pit** (rogue) | Tue Fri Sun | same |
| **Trial: Lattice Echo** (experimental) | Wed Sat Sun | same |
| **Raid: Dreadnought** | always (weekly) | a 40k-base-HP boss you can't kill. Rewards scale with damage dealt: 5k → 300k (scrap/credits 1.5k→30k, chips up to 50, Overclock Cores) |
Faction trials field single-faction squads, so they reward counter-building (triangle + synergies), not just power.

## Buffs — `buffs.js` (one per battle, consumed on use)
Stim Pack (ATK +15%) and Plating Kit (HP +15%) for 400 credits · Capacitor (charge +25%) for 600 · Aegis Cell (DR +10%) and Targeting Suite (crit +12% / critDmg +20%) for 800 · Overclock Core (ATK +20%, HP +10%), raid and arena-shop only.
A buff is roughly +10–15% effective power: enough to tip an elite or boss node, not enough to skip a gate.

## Balance targets (D10)
- Maps 1–2 clear straight through (at most a couple of replays at bosses).
- **From map 3 on, story income alone stalls.** 25–40% of play time goes to arena and events. Whole story **15–25 h**.
- Knobs, in order of preference: `MAP_SPEC.lv` / `size` / `waves` / `rankBonus` (maps.js) → reward formulas (maps.js `buildMap`) → `xpCurve` / `rankUp` (economy.js) → event and arena payouts → `ATK_SCALE` (units.js, fight tempo only).

## Balance status
_(sim-3, 2026-10-19 — `node tools/sim/balance.mjs --only=progress --seed=N --hours=60` for N = 1, 2, 3 on the current data; run log in docs/notes/sim.md)_
Harness time model: ×2 speed, 15 s overhead per battle, 2 s per upgrade action, a virtual day per 1.5 h.

**The harness smart player was buggy before sim-3** (a star-goal squad of 3 units stayed in place for the next arena/event battles, it always picked the hard arena rival, retried lost event tiers, and spent every credit on HQ/Street Hire so rank-ups never got funded). Fixed, the old data finished in **5.6–6.7 h**, so sim-3 slowed the economy about 3× and reshaped the map curve:
rank-up shards/credits ↑ (see Unit progression), ability credits ↑, arena rivals 0.9–1.2× power, arena credits ×0.4 and tokens ×0.35, shop shards 120 tokens, Vault Job ×0.5, trial marks ×0.6,
`lv` m3 [17,26] · m4 [26,34] · m5 [33,40] · **m6 [40,45] + rankBonus 1** (its fantasy pool was far weaker than its level: the first half needed only L31–38) · m7 [45,49] · m8 [48,50].

| policy | seed | m1 | m2 | m3 | m4 | m5 | m6 | m7 | m8 | story h | arena+events | star replays | result |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| smart | 1 | 0.1 | 1.6 | 0.3 | 0.6 | 3.9 | 5.2 | 1.3 | 2.0 | **14.9** | 57% | 10% | finished |
| smart | 2 | 0.1 | 1.1 | 0.4 | 0.9 | 2.4 | 1.7 | 8.9 | 3.6 | **19.2** | 58% | 9% | finished |
| smart | 3 | 0.1 | 1.3 | 1.3 | 1.5 | 1.9 | 3.5 | 3.5 | 3.1 | **16.4** | 56% | 9% | finished |
| straight | 1/2/3 | 0.1 | 1.4–2.1 | 2.6–11 | 8.3–9.5 | – | – | – | – | 16.6 / 13.7 / 21.5 | 0% | 0% | walls m4_l10 / m4_l9 / m4_l10 |
| grinder (naive) | 1/2/3 | 0.1–0.2 | 0.9–6.1 | 5.6–8.8 | 8–10 | – | – | – | – | 15.0 / 16.2 / 18.7 | 71–73% | 0% | walls m3_l9 / m4_l8 / m4_l9 |

- ✔ Smart finishes all 3 seeds, **14.9–19.2 h** (mean 16.8). Stars at story end 82–83%.
- ✔ Straight-through stalls from m2/m3 (first 3-loss stall m2_l6) and hard-walls in m4.
- ✘ **One map per seed runs long** (m6 5.2 h, m7 8.9 h, m5/m6/m7 3.5–3.9 h). Which map it is depends on recruit luck (which epics/legendaries show up), not on one map being mistuned; the difficulty probe `node tools/sim/curve.mjs` shows a smooth required-level curve m3→m8.
- ✘ **Arena+events 56–58%** (51–53% if repeat grind is watched at ×4). Structural: story + stars cost ~7 h of battles under this time model, so any 15 h+ total puts arena+events near 50%+. Hitting 25–40% needs more story time per level (dialogue, longer fights) or a larger star layer.
- Credits vs shards: a capped smart-player unit waits on **both** 21–72% of the time, on shards alone 27–79%, on credits alone ~0%. Shards still run out first; credits run out close behind. Credits pile up again only after the story (completionist phase). The naive grinder is credit-bound (credits 37–57%): bad spending is punished hard now.
- Per-unit (matchups, `--unitTrials=200`, unit stats unchanged by sim-3): every unit is within ±10 pts of its rarity mean (bulwark +7, patch +6, prism +9; arbiter and singularity −10). Rarity at honest rank: common 20%, rare 30%, epic 54%, legendary 65%. 2/2/2 squads 63%.

Sensitivity to the pending owner decisions (current values kept; estimated from the income shares, not measured by separate runs):
- **Star rewards power vs cosmetic**: star replays and their chips (~1.2k chips/h, which become Contract recruits, i.e. dupe shards) are ~25–30% of shard income. Making them cosmetic would add roughly 3–5 h and push m7/m8 past 4 h.
- **Fantasy realm synergy**: affects Rift recruits only (Rift Gate m6_l16+); the smart player rarely fields them, so it's a small effect on the curve (<1 h). It mainly helps m7/m8 players with lucky Rift pulls.
- **Shard exchange rates**: conversion only applies to max-rank units, so it barely matters before m8. Most chips go to the completionist phase. Low sensitivity (<0.5 h).
