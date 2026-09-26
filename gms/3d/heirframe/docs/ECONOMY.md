# HEIRFRAME — Economy (planner-owned)

Status: v1, 2026-09-26. Systems implements this in `js/data/economy.js` and `js/sim/*`, and checks it with `tools/sim/`. Balance against the **pacing targets** in §9. When the sim shows a target being missed, systems tunes the constants and records the change in `docs/notes/systems.md`.

---

## 1. The level factor

```
L(lvl) = 1.09^(lvl − 1)
```
Every level-scaled number (enemy HP and damage, item flat stats, credits, repair and tuning costs) multiplies by `L`. At equal level, time-to-kill therefore stays constant and loot is the edge. Reference values: L(10)=2.17 · L(20)=5.14 · L(30)=12.2 · L(40)=28.8 · L(50)=68.2 · L(60)=161.5.

**Player stat assembly:**
```
stat = frameBase × L(riderLvl) × (1 + 0.02 × (sync − 1))       // hp, shield, energy stay ×L too
     + Σ item flat stats (each = slotBase × L(iLvl) × rarityMult × (1 + 0.06 × tune))
stat ×= (1 + Σ % affixes)                                       // % affixes are not level-scaled
damage = skillBase × L(riderLvl) × (1 + weaponDamage / (10 × L(riderLvl))) × (1 + dmgPct) × crit × elem
armor DR = armor / (armor + 50 × L(attackerLvl))                 // 50 armor ≈ 50% at equal level 1
```
- **Slot bases at iLvl 1:** chassis {armor 8, hp 20} · core {energy 10, shield 15} · weapon {weaponDamage 5} · optics {critChance 3%} (not level-scaled) · mobility {moveSpeed 4%} (not level-scaled) · chip {none}.
- **Soft caps:** crit chance 60% · crit damage 400% · CDR 40% · move speed +50% · dodge cooldown floor 0.8 s · detection mult floor 0.3 · lifeSteal 8%. `lootLuck` and `credits` affixes are summed, then `eff = x / (1 + x/150)`.

## 2. XP and levels

```
xpNext(n) = niceRound( (4 + 1.2·n) × 20 × L(n) )        // "minutes per level" × expected XP/min
kill XP   = 3 × L(enemyLvl) × rankXP     (grunt 1, veteran 3, elite 8, champion 25, boss 80)
contract XP = MISSIONS §7   (70 × L × arch × grade × threat)
over-level penalty (kills and contracts): × clamp(1 − 0.1 × (riderLvl − enemyLvl − 2), 0.1, 1)
```

| lvl | xpNext | cumulative | hours played (Tense) |
|---|---|---|---|
| 1 | 105 | 105 | 0.1 |
| 2 | 140 | 245 | 0.2 |
| 3 | 180 | 425 | 0.3 |
| 5 | 280 | 935 | 0.6 |
| 8 | 495 | 2,190 | 1.3 |
| 10 | 695 | 3,475 | 1.8 |
| 15 | 1,470 | 9,090 | 3.4 |
| 20 | 2,880 | 20,350 | 5.5 |
| 25 | 5,380 | 41,680 | 8.2 |
| 30 | 9,740 | 80,700 | 11.3 |
| 34 | 15,400 | 133,000 | 14.2 |
| 40 | 30,000 | 272,000 | 19.1 |
| 45 | 51,400 | 481,700 | 23.7 |
| 50 | 87,300 | 839,100 | 28.8 (the story ends here) |
| 60 | 245,500 | 2,453,300 | 40.6 (cap) |

`niceRound`: under 1,000 round to 5; under 10,000 round to 10; otherwise round to 100. The first contract (A1-M1, a fixed 120 XP) always gives level 2.

**Feature unlocks by level:** 1: board 6 slots, the Street grade · 3: Brightline · 5: the Pro grade, buying frames · 8: Recalibrate · 10: board 7 slots, Hostile threat, stash 90 · 15: the Elite grade, Relic drops · 20: board 8 slots · 25: Lethal · 40: Nightmare · 60: Overclock and Legacy.

**Frame Sync:** `syncNext(s) = 400 × 1.25^(s−1)` Sync XP; a frame gains Sync XP equal to the rider XP earned while deployed. The rental caps at sync 5.

## 3. Credits in

| source | amount |
|---|---|
| grunt kill | 40% chance of `3 × L` cr (±30%) |
| veteran | 60% × `6 × L` |
| elite | 100% × `15 × L` |
| champion | `40 × L` |
| boss | `120 × L` |
| contract | MISSIONS §7: `120 × L × arch × grade × threat × mods × rep`, then bonuses |
| salvage | materials only, never credits (so loot does not flood the economy) |
| Echo clue duplicate (T10) | `3×` that contract's credits |

**Expected net income at Tense**, after typical spending on repairs and consumables: about **`2,270 × L(lvl)` cr per hour played** (≈ 38 × L per minute). The sim should confirm ±20%.

| lvl | income/h | typical contract | full repair |
|---|---|---|---|
| 1 | 2,270 | 207 | 60 |
| 5 | 3,200 | 292 | 85 |
| 10 | 4,930 | 450 | 130 |
| 15 | 7,590 | 692 | 201 |
| 20 | 11,670 | 1,064 | 308 |
| 30 | 27,630 | 2,520 | 730 |
| 40 | 65,410 | 5,965 | 1,729 |
| 50 | 154,850 | 14,121 | 4,093 |
| 60 | 366,600 | 33,430 | 9,690 |

## 4. Credits out (sinks)

| sink | cost | notes |
|---|---|---|
| **Rental fee** | **100 cr per shift** (24 min of *active* play), flat | Charged at shift change while you are riding the rental (or still renting because you own no frame). If you can't pay: debt, no interest, and HIRA nags with a non-blocking toast. Returning the rental ends the fee (you can only return it once you own a frame). |
| **Limited Warranty** (rental passive) | 10% of mission credits | a red running total on the HUD ("HireFrame surcharge: 184 cr") |
| **Frame licence** | **1st frame 1,500 · 2nd 12,000 · 3rd 50,000** | Any archetype, in any order. A1-M4 gives a one-time 30% off the first (1,050). Targets: 1st at ~level 5, 2nd at ~15, 3rd at ~25. |
| **Frame Mk tier** (per frame) | Mk II 9,000 · III 45,000 · IV 180,000 · V 650,000 · VI 2,200,000 | gated by rider level 10/20/32/45/60 and Sync 4/8/12/16/20 (DESIGN §5.7); the main mid- and late-game sink, ×3 frames |
| Repair (owned frames) | `missingHPfrac × 60 × L(lvl)` | at a Warehouse or Nexus kiosk; HP regenerates only to 50% outside missions |
| Wreck recovery | `150 × L(lvl)` (owned frames); free for the rental | returns at 50% HP |
| Repair Kit | `20 × L` | carry 3 (5 at level 20) |
| Signal Jammer (−1 Heat) | `60 × L` | |
| Decoy Drone | `30 × L` | |
| Clean Slate (clears Heat) | `150 × L` | Unlinked vendor (Rook, Stacks) or Kettle after A1 |
| Board reroll | `25 × L` | |
| Market part | `60 × L(iLvl) × {standard 1, tuned 2, custom 4, prototype 10}` | 6 parts rotate each shift; plus "Sal's Special": 1 Relic per shift at `600 × L` |
| Tuning +k | `40 × L(iLvl) × 1.4^(k−1) × rarityCost` plus materials | rarityCost: scrap 0.5, standard 1, tuned 1.2, custom 1.5, prototype 2, relic 3, heirloom 4 |
| Recalibrate | `100 × L(iLvl) × (n + 1)` for the n-th reroll of that item, plus 2 Circuitry (plus 1 Flux for Prototype+) | |
| Stash expansion | 60 → 90: 5,000 · 120: 20,000 · 160: 60,000 · 200: 150,000 · 240: 400,000 | |
| Paint | presets 500–2,000 · faction paints 10,000 (needs Trusted) · "Harmony Holo" 100,000 · "Vael Starfield" (story reward) | cosmetic |
| Home | Brightline Apartment 25,000 (after A4-M1) · Vael Estate: free (after the finale) · Sky Penthouse 250,000 (endgame cosmetic) | |
| **Ward Debt** (optional) | 3,140 cr, paid at Mara's kiosk, any time | Paying it grants the permanent perk **Debt-Free: +5% credits** and a codex entry (your Ward file, which is also a light clue: "Account guarantor: [REDACTED — Office of the Chair]") |

**Tuning materials and success chance:**

| +k | success | Scrap Alloy | Circuitry | Flux | Heir Shard |
|---|---|---|---|---|---|
| +1…+3 | 100% | 3k | 0 | 0 | 0 |
| +4 | 90% | 12 | 2 | 0 | 0 |
| +5 | 80% | 15 | 4 | 0 | 0 |
| +6 | 70% | 18 | 6 | 0 | 0 |
| +7 | 60% | 21 | 8 | 1 | 0 |
| +8 | 50% | 24 | 10 | 2 | 0 |
| +9 | 40% | 27 | 12 | 3 | 0 |
| +10 | 30% | 30 | 14 | 4 | 1 |

A failed tune consumes the credits and materials, and the item is never lost or downgraded. **Pity:** each failure adds +10% to the next attempt at the same +k on that item.

## 5. Materials (from salvage)

| rarity | Scrap Alloy | Circuitry | Flux Cell | Heir Shard |
|---|---|---|---|---|
| scrap | 1–2 | 0 | 0 | 0 |
| standard | 2–3 | 0 | 0 | 0 |
| tuned | 3 | 0–1 | 0 | 0 |
| custom | 4 | 1–2 | 0 | 0 |
| prototype | 5 | 2 | 1 | 0 |
| relic | 6 | 3 | 2 | 1 |
| heirloom | 8 | 4 | 3 | 3 |

Salvaging a tuned item refunds 50% of the tuning materials spent on it.

## 6. Loot drops

**Item drops per kill** by rank (the roll chance and count): grunt 12% × 1 · veteran 35% × 1 · elite 100% × 1, plus 50% × 1 · champion 2 · boss 4 (one forced Prototype+). Threat and danger multiply the *chance* by `(1 + lootQuality/2)`, capped at 100%.

**Item level** = enemy or mission level, capped at `riderLvl + 2` (in Overclock, capped at `60 + n`).
**Slot** is chosen uniformly from the 6 slots. When the player uses the rental, weight weapon and chip ×3 so that drops stay useful.

**Rarity weights by enemy level band** (before loot quality):

| band | scrap | standard | tuned | custom | prototype | relic | heirloom |
|---|---|---|---|---|---|---|---|
| 1–2 | 30 | 50 | 18 | 2 | 0 | 0 | 0 |
| 3–7 | 20 | 45 | 25 | 9 | 1 | 0 | 0 |
| 8–14 | 12 | 38 | 30 | 16 | 4 | 0 | 0 |
| 15–24 | 8 | 30 | 32 | 22 | 7 | 1 | 0 |
| 25–39 | 5 | 25 | 32 | 26 | 10 | 2 | 0 |
| 40–50 | 3 | 20 | 30 | 30 | 13 | 3.5 | 0.15 |
| 51–60 | 2 | 15 | 30 | 33 | 15 | 5 | 0.25 |
| Overclock | 1 | 10 | 28 | 35 | 18 | 7 | 0.4 |

**Loot quality `q`** (threat bonus + danger × 3% + lootLuck affix eff + Generation × 10%): multiply the weights for custom and above by `(1 + q)^(tierIndex − 2)` (custom=3, prototype=4, relic=5, heirloom=6), and the scrap and standard weights by `1/(1 + q)`.

**Affix values:** uniform in range, then × a quality nudge `(1 + 0.1 × q)`, clamped to 1.25 × the range max.

**Bad-luck protection:** a counter increments on every kill without a Prototype+ drop (from level 8). At 150, force one.

**Uniques:** Relic uniques cannot duplicate within the last 5 Relics dropped. Heirloom set pieces drop the missing piece first (smart loot).

## 7. Credit spending shape (what a player does with money)

| level band | "big want" | cost | ~hours of income |
|---|---|---|---|
| 1–5 | first frame (escape the rental fee) | 1,050–1,500 | 0.5 |
| 5–15 | tuning +1…+5 on 6 slots; stash 90; Mk II; second frame | ~25,000 total | 3 |
| 15–25 | third frame; Mk III on the main frame; Recalibrates for Prototypes | ~110,000 | 6 |
| 25–40 | apartment 25k; Mk IV (180k); +6…+8 tunes; paints | ~450,000 | 10 |
| 40–60 | Mk V/VI (0.65M/2.2M per frame); +9/+10 Relic tunes (a +10 Relic at L50 ≈ 170k); stash 200/240 | ~5M | 20 |
| 60+ | Overclock gear tuning (costs keep scaling with iLvl), cosmetics, Legacy | endless | ∞ |

The rule of thumb: **one big purchase every 30–90 minutes of play.** The HUD shows a "next goal" chip (for example, "Brawler licence: 1,500 cr — 72%") computed from the cheapest unmet big want.

## 8. Endless: Legacy, Overclock, Succession

- **Legacy points:** after level 60, every **245,500 XP** (the level-60 requirement, fixed) = 1 Legacy point.
- **Legacy board** (12 nodes, ranks bought 1 point at a time): damage +1% · HP +1% · shield +1% · crit chance +0.2% · crit damage +2% · CDR +0.2% · credits +1% · lootLuck +1% · XP +1% · move +0.2% · repair cost −1% (cap 50%) · Heir Protocol damage +2%. **Diminishing returns:** ranks 1–50 full value, 51–150 half, 151+ a quarter. Uncapped.
- **Heir Core** gains +1 rank per 10 Legacy points total (+5% Heir Protocol damage per rank, and a new visual tier at ranks 5, 10 and 20).
- **Overclock n** (I–XXX, unlocked at 60): enemy level `66 + floor(n/3)`, HP `× 4.5 × 1.12^n`, damage `× 2.2 × 1.08^n`, credits `× 3.5 × 1.10^n`, XP `× 3.2 × 1.08^n`, loot quality `+45% + 2%·n`, item level cap `60 + n`. Clearing an Elite contract at Overclock n unlocks n+1.
- **Succession (prestige):** available at Legacy 20. Rider level → 1, frame syncs → 1, the story restarts as Echo runs, and Heat and danger reset. **You keep** your frames, stash, materials, paints, codex, Legacy board, Heir Core and credits (capped at 50,000, with the rest taxed as "estate duty" to stop snowballing). **One Heirloom** is handed down and gets +1 permanent tune above +10 (to +11). **Generation bonus:** +15% XP and +10% loot quality per generation, capped at Gen 10 (+150% / +100%). Each generation adds a family-tree node with the heir's chosen name.

## 9. Pacing targets (the sim must hit these ±20%)

| milestone | target play time |
|---|---|
| first contract complete, level 2 | 5 min |
| first loot upgrade equipped | ≤ 8 min |
| first frame bought (A1-M4, level 5) | 30–45 min |
| Act 1 complete (level 8) | 1.3 h |
| second frame | 3–4 h (level ~15) |
| third frame | 7–9 h (level ~25) |
| first Relic | 3–5 h |
| story finale (level 50) | 28–32 h |
| level 60 | ~40 h |
| first Succession possible | ~55 h |

**Sim checks** (`tools/sim/`): a bot plays Tense contracts with auto-equip-best, spends to the §7 shape, and logs level, credits, FR and hours. Assert the milestones above. Assert credits never sit above 3× the next big want for more than 2 h (the economy must keep giving things to buy). Assert time-to-kill for a grunt at equal level with average gear stays between 1.5 and 4 s at every level from 1 to 60.
