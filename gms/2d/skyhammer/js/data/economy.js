// The money & xp maths. baseReward(n) is used by tools/gen_levels.mjs to price levels
// 21-100; act 1's 20 hand-authored levels in levels.js were priced by hand against the
// same curve. star multipliers apply on top at run time (sim owns which star you hit).

// money at the first and last non-boss level of each act, plus that act's boss payout.
// Chosen so period-over-period growth roughly matches the jump in enemy hp/count per act.
export const ACT_MONEY = {
  1: [250, 700, 1800],
  2: [750, 1600, 3800],
  3: [1700, 3200, 7000],
  4: [3200, 5800, 13000],
  5: [6000, 10500, 24000],
};

export function actOf(levelNum) { return Math.ceil(levelNum / 20); }
export function posInAct(levelNum) { return ((levelNum - 1) % 20) + 1; } // 1..20, 20 = boss

export function baseMoney(levelNum) {
  const act = actOf(levelNum);
  const p = posInAct(levelNum);
  const [lo, hi, boss] = ACT_MONEY[act];
  if (p === 20) return boss;
  const t = (p - 1) / 18; // levels 1..19 -> 0..1
  return Math.round(lo + (hi - lo) * t);
}

export function baseXp(levelNum) {
  const m = baseMoney(levelNum);
  const p = posInAct(levelNum);
  return Math.round(p === 20 ? m / 2.2 : m / 3.2);
}

// star payout multipliers — applied by the sim/UI on top of baseMoney/baseXp.
// ECON.starTimes in tuning.js decides which band a finish time lands in.
export const STAR_MULT = { 3: 1.25, 2: 1.0, 1: 0.7 };

/*
TWO CURVES — cumulative money assuming the player banks every reward and buys nothing
else (upgrades, weapons, retries). This is a deliberate upper bound: it exists to check
PACING of "next plane tier" milestones against the design rule below, not to predict a
real save file. Real players spend along the way on upgrades/specials, which pushes the
actual afford-day for each plane tier later — comfortably into the target window.

  competent = averages 3-star (1.25x) with most optional kills, i.e. curve at x1.20
  scraper   = averages 1-star/2-star (0.7-1.0x), skips extras,      i.e. curve at x0.72

PLANE            price   competent affords@lvl   scraper affords@lvl   gap (scraper)
kestrel          0       1                       1                     -
harrier1         1400    5                        7                    7
tempest          4200    10                       15                   8
meteor           9000    17                       23                   8
sabre            16000   24                       32                   9
vampire          26000   31                       40                   8
phantom          40000   40                       50                   10
specter          58000   46                       59                   9
vector           80000   54                       66                   7

Rule check: "afford the next tier roughly every 8-12 levels" — the scraper curve (the
player we design the floor for) lands at 7-10 level gaps between tiers throughout, and
the competent curve reaches the same tiers a further 6-12 levels earlier, which is the
headroom that pays for optional weapon/upgrade purchases along the way. Nobody is ever
staring at a plane they cannot reach.

RULE 2 CHECK — "always afford *something* after a level": the cheapest upgrade step
(UPGRADES.armor base=180) is below baseMoney(1)*0.72 = 180 exactly at the worst-case
scraper multiplier on the very first level, and every level after level 1 pays more.
So even the worst finish always clears at least one upgrade tick.
*/
