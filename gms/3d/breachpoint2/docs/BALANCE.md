# BREACHPOINT II — balance analysis

Run before P5, from `scratchpad/balance.mjs` + `balance2.mjs` (pure numbers, no browser).
**APPLIED to `js/data.js` in P4c.** Measured in-game numbers are in `PIPELINE.md` under
"Verified numbers added by P4c"; where they differ from this file, PIPELINE wins.

## Model and its limits (read this before trusting any number below)

TTD = time to die under **sustained full exposure, no cover**. Assumes 4-round bursts every ~1.6 s and
`hit rate = tier accuracy x 0.6`. **That 0.6 is invented.** Real hit rate depends on cover, movement and
the AI's `err` cone, so the **absolute seconds are soft**. What is robust is the **shape** of the curve,
which does not depend on the constant: scaling the hit rate scales every level equally.

Player builds are chosen by a greedy optimiser maximising effective HP at each level's SP target. That is
itself a suspect instrument — see "the plating trap" below.

## The finding: as specced, the late game is unplayable

| level | build | effAbsorb | raw dmg/s | HP/s | **TTD** |
|---|---|---|---|---|---|
| L1 DOCK | P0V0M0 | 0.50 | 11.3 | 5.7 | **17.6 s** |
| L2 CONTAINER | P1V1M0 | 0.43 | 23.1 | 13.2 | 9.5 s |
| L3 OVERLOOK | P2V1M1 | 0.51 | 34.6 | 17.0 | 7.4 s |
| L4 NIGHTFALL | P3V2M0 | 0.44 | 56.4 | 31.6 | 4.7 s |
| L5 SUPPLY | P4V2M1 | 0.52 | 75.2 | 36.1 | 4.2 s |
| L6 SIEGE | P5V1M1 | 0.45 | 114 | 62.7 | 2.0 s |
| L7 BLACKOUT | P5V4M1 | 0.45 | 142.5 | 78.4 | 2.7 s |
| L8 BREACHPOINT | P5V5M3 | 0.30 | 244.8 | 171.4 | **1.5 s** |

Incoming damage grows **~20x** from L1 to L8 while effective HP grows **under 2x**. By L8 a fully
upgraded player dies in a second and a half of exposure. Levels 6–8 are not hard, they are broken.

### Root cause: apPen climbing to 0.60 destroys the thing the player just paid for
PLATING is the most expensive track and the one the threat readout points at. Taking `apPen` to 0.60 means
that at exactly the point the player finishes buying rank 5, their armour absorbs **less** than it did at
rank 0 against early enemies. The player's primary defensive investment stops scaling precisely when it is
fully paid off. That is the flaw, and it was mine — it came from wanting a dramatic gate spread.

## Recommended fix — "variant C"

**1. Pull `apPen` back so armour keeps scaling**

| tier | apPen was | **now** |
|---|---|---|
| militia | 0.00 | **0.00** (unchanged — L1 near-invulnerability is the headline feature) |
| regular | 0.15 | **0.10** |
| veteran | 0.30 | **0.18** |
| shock | 0.45 | **0.26** |
| praetor | 0.60 | **0.34** |

**2. Pull late-tier damage back**

| tier | dmg was | **now** |
|---|---|---|
| regular | 14 | **12** |
| veteran | 19 | **15** |
| shock | 25 | **18** |
| praetor | 32 | **22** |

**3. Cap simultaneous attackers at 4** (L5 4→3, L7 5→4, L8 6→4). Late levels escalate through
*quality* of threat — accuracy, flanking, boss presence — not through volume of simultaneous fire.
Three multiplicative escalations at once (more attackers x more damage x better accuracy) is what
produced the 20x.

### Result

| level | attackers | effAbsorb | raw dmg/s | HP/s | **TTD** |
|---|---|---|---|---|---|
| L1 DOCK | 2 | 0.50 | 11.3 | 5.7 | **17.6 s** |
| L2 CONTAINER | 2 | 0.48 | 19.8 | 10.3 | 12.1 s |
| L3 OVERLOOK | 3 | 0.56 | 29.7 | 13.1 | 9.6 s |
| L4 NIGHTFALL | 3 | 0.56 | 44.6 | 19.6 | 7.7 s |
| L5 SUPPLY | 3 | 0.64 | 44.6 | 16.0 | 9.4 s |
| L6 SIEGE | 4 | 0.64 | 82.1 | 29.5 | 4.2 s |
| L7 BLACKOUT | 4 | 0.64 | 82.1 | 29.5 | 7.3 s |
| L8 BREACHPOINT | 4 | 0.56 | 112.2 | 49.4 | **5.3 s** |

A smooth 17.6 → 5.3 s ramp instead of a collapse.

### The gate the user asked for SURVIVES this
At PLATING 5: militia still **0.9 HP per hit** (apPen 0 is untouched — L1 stays near-invulnerable), while
praetor becomes **9.7 HP per hit** and shock **6.5**. The spread narrows from 25x to ~11x, which is still
an emphatic gate, and it no longer comes at the cost of making armour pointless.

**These supersede the old verified numbers** (shock 13.750, praetor 22.400) once applied. militia 0.900
is unchanged.

## The plating trap (keep it, but make it legible)
The optimiser's L6 pick, P5V1 (plating maxed, vitality 1), gives **TTD 4.2 s** — worse than a balanced
P4V3 at **5.0 s**, despite costing the same. Dumping everything into the advertised defensive stat is
genuinely a mistake at L6. That is good texture and an argument for `IMPROVEMENTS.md` **D3** (fork the
tracks at rank 3), but the **threat readout must not mislead the player into it** — showing only HP-per-hit
implies plating is always the answer. Show effective survival time, not just absorption.

## SUPERSEDED IN P5a: the model below is the old flat one

P5a replaced `4 rounds / 1.6 s for everyone` with a per-tier cadence derived from §ENEMIES itself, and
added the armour pool. `HIT_RATE = 0.6` survives untouched and is **still invented** — it is now the
only invented constant left in the model. Every TTD figure in the tables above is the old model's;
PIPELINE's "Verified numbers added by P5a" has the current ones, measured against the real
`damagePlayer` pipeline (worst margin 4.0%). The *shape* argument this file makes still stands.

## What P5 must do
The model is a guide, not evidence. P5 measures in-game: put a bot-driven player at each level's soft SP
target, in the open, and record real time-to-die; then repeat in cover. If real TTD is uniformly higher
than this table, the hit-rate constant was low and the **shape** is what matters. If the shape differs from
this table, trust the game and re-derive.


---

## P5c — `spTarget` re-set against MEASURED earnings, and L5 gets a 4th attacker

A clean first playthrough was **driven** (every enemy killed through the real `onKill` award path,
every objective completed, every `end()` run). Career SP **on arrival** at each level:

| | L1 | L2 | L3 | L4 | L5 | L6 | L7 | L8 | after L8 |
|---|---|---|---|---|---|---|---|---|---|
| career SP | 300 | 700 | 1560 | 2830 | 4450 | 6570 | 9190 | 12400 | 16140 |

`spTarget` is now **~65% of that**: **0 · 0 · 450 · 1000 · 1800 · 2900 · 4300 · 4900 · 8000**
(ENDLESS copies L8). L7 is the exception at 53%, because L6 and L7 are the same tier with the same
attacker cap and any budget gap that crosses a rank-cost boundary would make L7 read *easier*.

`LEVELS[5].maxAttackers` **3 → 4**. `TIERS` untouched.
TTD at each target, greedy-optimised on the real `gateCalc`:
**12.81 · 9.38 · 8.43 · 6.09 · 5.09 · 3.00 · 3.00 · 2.50 s** — never gentler, 5.12x end to end,
L5 now strictly harder than L4, L6/L7 still flat.
