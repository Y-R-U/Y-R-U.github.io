// HOMEBOUND — the five acts, and the two numbers that decide whether the game
// is fun.
//
// Everything else in this project is a machine. This file is the pacing: how
// hard the next level is (`reqPowerFor`) and how much the last one paid
// (`rewardFor`). Those two curves have to be walked against each other or the
// game either hands itself to you or stops dead at level 14.
//
// ---------------------------------------------------------------------------
// THE ARITHMETIC (walked, not guessed — dev/*.mjs re-derives it)
// ---------------------------------------------------------------------------
// `save.js:playerPower()` is `config.js:powerOf(upgrades)`:
//
//     10 + squad*6 + damage*7 + rate*5 + armour*4 + start*45 + income*1
//
// With every UPGRADES entry maxed (40/40/30/30/5/30) that is
//     10 + 240 + 280 + 150 + 120 + 225 + 30 = 1055.
// **1055 is the hard ceiling.** No level may ever ask for more, and chapter 4
// tops out at 900 so the last 155 points are pure comfort, never a requirement.
//
// Costs are geometric (`upgradeCost = base * growth^level`), so cumulative cost
// to level n of an upgrade is `base * (growth^n - 1) / (growth - 1)`:
//
//     squad  (90,  1.28)  →  n=5: 783    n=10: 3.5k   n=20: 44k    n=40: 6.3M
//     damage (110, 1.30)  →  n=5: 995    n=10: 4.7k   n=20: 156k   n=40: 13M
//
// A player buys greedily by power-per-cash, which at low levels ranks
// squad (6/90 = .067) > damage (7/110 = .064) > rate (.036) > armour (.031) >
// income (.006), with DEPLOY TIER (45/900 = .050) deferred until the cheap
// upgrades cost enough to make 900 look reasonable. `impliedUpgrades()` below
// runs exactly that buyer, so `powerCost(P)` is the honest cash price of power
// P and every curve here is checked against it rather than eyeballed.
//
// The rule I held to: **`reqPowerFor(n)` must be ≤ ~70% of the power a player
// can afford from the rewards of levels 1..n-1, played once each, at zero
// replay.** That makes the gate real (you cannot brute-force level 20 on turn
// one) but never a wall (a player who never replays anything still walks
// through it).
//
// Simulated over all 147 story levels, playing each one exactly once with a
// greedy run AI and a greedy shop, plus the chapter-2 debt grind in its proper
// place between c1l24 and c3l1:
//
//     chapter 1   margin 1.38x – 1.78x     0 losses
//     chapter 2   12 mission runs to clear ECON.debtTotal and open chapter 3
//     chapter 3   margin 1.09x – 1.13x     0 losses
//     chapter 4   margin 1.09x – 1.24x     0 losses
//     worst margin anywhere: 1.09x (c4l9)
//
// Chapter 4 pays far more than it costs on purpose — the surplus is what funds
// the house and its offline income, which is the only sink left once the base
// upgrades are maxed at power 1055.
//
// ---------------------------------------------------------------------------

import { UPGRADES, upgradeCost, powerOf, ECON } from './config.js';

// The acts. `levels` of 0 means the act has no levels of its own — chapter 2 is
// the debt grind (missions + events + the house store) and chapter 5 is endless.
export const CHAPTERS = [
  {
    n: 1, id: 'road', name: 'THE LONG ROAD HOME', sub: '400 KM, ON FOOT',
    levels: 24, bossEvery: 8, theme: 'front',
    // The walk home reads as a journey because the ground changes under it.
    themes: [[1, 'front'], [7, 'valley'], [15, 'town'], [23, 'home']],
    unlocks: ['home', 'store'],
  },
  {
    n: 2, id: 'debt', name: 'DEBT', sub: 'THE HOUSE IS MORTGAGED',
    levels: 0, bossEvery: 0, theme: 'home', themes: [[1, 'home']],
    unlocks: ['events'],
    // Chapter 2 is a *state*, not a list of levels: you grind missions and
    // events against ECON.debtTotal in the house store until it reads zero.
    goal: { kind: 'debt', amount: ECON.debtTotal },
  },
  {
    n: 3, id: 'contract', name: 'CONTRACT WORK', sub: 'YOUR NAME, YOUR PRICE',
    levels: 3, bossEvery: 3, theme: 'town', themes: [[1, 'town'], [3, 'desert']],
    unlocks: [],
  },
  {
    n: 4, id: 'tide', name: 'TURN OF THE TIDE', sub: 'LEAD THEM BACK',
    levels: 120, bossEvery: 10, theme: 'front',
    themes: [[1, 'front'], [21, 'desert'], [41, 'valley'], [61, 'front'], [81, 'town'], [101, 'front']],
    unlocks: [],
  },
  {
    n: 5, id: 'endless', name: 'NO FIXED ADDRESS', sub: 'MISSIONS AND EVENTS',
    levels: 0, bossEvery: 0, theme: 'desert', themes: [[1, 'desert']],
    unlocks: [],
  },
];

export const CHAPTER_BY_N = Object.fromEntries(CHAPTERS.map((c) => [c.n, c]));
export const chapterOf = (n) => CHAPTER_BY_N[n | 0] || CHAPTERS[0];
export const levelCount = (chapter) => chapterOf(chapter).levels;
export const lastChapter = () => CHAPTERS[CHAPTERS.length - 1].n;

// Total story levels — 147. Chapters 2 and 5 contribute none.
export const totalLevels = () => CHAPTERS.reduce((a, c) => a + c.levels, 0);

// The ceiling powerOf() can physically reach. Nothing may ask for more.
export const POWER_MAX = powerOf(Object.fromEntries(UPGRADES.map((u) => [u.id, u.max])));

export function isBoss(chapter, level) {
  const c = chapterOf(chapter);
  if (!c.bossEvery || !c.levels) return false;
  return level % c.bossEvery === 0 || level === c.levels;
}

// The last boss of a chapter is the one that ends it — bigger, named, and worth
// double. `bossRank` is 1-based so levels.js can scale hp without re-deriving.
export function bossRank(chapter, level) {
  const c = chapterOf(chapter);
  if (!isBoss(chapter, level)) return 0;
  return Math.ceil(level / (c.bossEvery || 1));
}
export const isChapterFinale = (chapter, level) => level === levelCount(chapter);

export function themeFor(chapter, level) {
  const c = chapterOf(chapter);
  let t = c.theme;
  for (const [from, name] of c.themes || []) if (level >= from) t = name;
  return t;
}

// --------------------------------------------------------------------------
// The buyer. Both curves below, the level generator's budget model, and the
// balance harness read this, so "what does a player at power P actually own"
// is computed the same way everywhere.
//
// Gain is measured by *calling* powerOf rather than duplicating its
// coefficients — if config.js re-weights power, this follows for free.
//
// THE AFFORDABILITY WINDOW is the part that matters. A pure power-per-cash
// ranking buys DEPLOY TIER almost immediately: 45 power for 900 cash beats
// everything except the first two squad levels. That is a spreadsheet, not a
// player — nobody sits on 900 cash while a 90-cash upgrade is on the shelf, and
// the resulting build (3 rangers, no firepower) reaches power 93 and cannot
// clear level 16. So the buyer only considers upgrades costing at most
// WINDOW times the cheapest thing available, which defers DEPLOY TIER until
// squad and damage have climbed to meet it — around squad 7 / damage 6, exactly
// where a real player starts eyeing it.
const WINDOW = 2.2;

const _implied = new Map();
export function impliedUpgrades(power) {
  const want = Math.max(0, Math.round(power));
  if (_implied.has(want)) return _implied.get(want);
  const up = {};
  let cash = 0, guard = 0;
  while (powerOf(up) < want && guard++ < 500) {
    let cheapest = Infinity;
    for (const u of UPGRADES) {
      const lv = up[u.id] || 0;
      if (lv < u.max) cheapest = Math.min(cheapest, upgradeCost(u, lv));
    }
    if (!isFinite(cheapest)) break;         // everything maxed
    let best = null, bestScore = 0, bestCost = 0;
    for (const u of UPGRADES) {
      const lv = up[u.id] || 0;
      if (lv >= u.max) continue;
      const cost = upgradeCost(u, lv);
      if (cost > cheapest * WINDOW) continue;
      const gain = powerOf({ ...up, [u.id]: lv + 1 }) - powerOf(up);
      const score = gain / cost;
      if (score > bestScore) { bestScore = score; best = u; bestCost = cost; }
    }
    if (!best) break;
    up[best.id] = (up[best.id] || 0) + 1;
    cash += bestCost;
  }
  const out = Object.freeze({ up: Object.freeze(up), cash, power: powerOf(up) });
  _implied.set(want, out);
  return out;
}

// Cash price of reaching `power` by the shortest route. This is the number
// every reward is checked against.
export const powerCost = (power) => impliedUpgrades(power).cash;

// --------------------------------------------------------------------------
// reqPowerFor — the gate
// --------------------------------------------------------------------------
// Chapter 1 is free for three levels (the tutorials must never be gated), then
// climbs on a gently convex curve to 160 at level 24. A player who has cleared
// 1..23 once has ~13.7k cash, which the greedy buyer turns into power 193 —
// so the finale asks for 83% of what an unhurried first-time player already
// has. That is the tightest point in the whole game and it is deliberate: the
// front gate of your own house should feel like the hardest door you opened.
//
// Chapter 3 asks 210/255/305 — unreachable on chapter-1 money alone (power 193
// costs 12.6k; power 305 costs ~52k). That gap IS chapter 2. You cannot buy
// your way past the debt grind, which is the whole point of the act.
//
// Chapter 4 runs 338 → 900 over 120 levels on a `^0.9` curve, so the steep part
// is early (where rewards are small and every upgrade is felt) and the late
// game flattens into content rather than arithmetic.
const CH1_STEP = 27, CH1_LIN = 9.0, CH1_FREE = 3;
const CH3_REQ = [370, 430, 490];
const CH4_LO = 560, CH4_HI = 900, CH4_SHAPE = 0.85;

export function reqPowerFor(chapter, level) {
  const l = Math.max(1, level | 0);
  let p;
  switch (chapter | 0) {
    case 1: {
      // Free for three levels (a tutorial must never be gated), then a step to
      // 36 and a straight 9 a level to 216. Straight, not curved: the simulated
      // walk shows base power climbing almost linearly across chapter 1, and a
      // gate that tracks the curve at a fixed 1.45x is a gate the player can
      // always see coming.
      const k = l - CH1_FREE;
      p = k <= 0 ? 0 : CH1_STEP + CH1_LIN * k;
      break;
    }
    case 2: p = 0; break;
    case 3: p = CH3_REQ[Math.min(CH3_REQ.length - 1, l - 1)]; break;
    case 4: p = CH4_LO + (CH4_HI - CH4_LO) * Math.pow(l / levelCount(4), CH4_SHAPE); break;
    // Chapter 5 is endless: the "level" is a mission rank, and rank 1 is
    // deliberately below the chapter-3 gate so a stuck player always has
    // something they can run.
    default: p = 150 + 55 * (l - 1); break;
  }
  return Math.min(POWER_MAX, Math.round(p));
}

// --------------------------------------------------------------------------
// rewardFor — the tap
// --------------------------------------------------------------------------
// game.js:payout() is `(reward + runCash + peakTroops*1.4) * incomeMul *
// replayFactor * winMul`, so this is only the floor of a clear; a good run adds
// its own troop pay on top. That is why the numbers below look low next to the
// upgrade costs — a level-16 clear with a 300-man peak pays 568 + 420 = ~990.
//
// Chapter 1: 70 + 16*l, boss levels doubled by ECON.bossBonus. Cumulative
// through 23 ≈ 13.7k against a 12.6k price for the power the finale wants.
//
// Chapter 3 pays in thousands — three contracts should visibly dent the debt
// without clearing it, so the player feels the transition from soldier to
// operator in the money and not in a text box.
//
// Chapter 4 grows at 1.066^l. Cumulative over 120 levels ≈ 26M against a 3.9M
// price for power 900, a 6.7x cushion — chapter 4 is content, not a treadmill,
// and the surplus is what funds the house.
const CH1_REW_BASE = 70, CH1_REW_PER = 16;
const CH3_REW = [9000, 13000, 20000];
const CH4_REW_BASE = 2600, CH4_REW_GROWTH = 1.052;

export function rewardFor(chapter, level) {
  const l = Math.max(1, level | 0);
  let base;
  switch (chapter | 0) {
    case 1: base = CH1_REW_BASE + CH1_REW_PER * l; break;
    case 2: base = 0; break;
    case 3: base = CH3_REW[Math.min(CH3_REW.length - 1, l - 1)]; break;
    case 4: base = CH4_REW_BASE * Math.pow(CH4_REW_GROWTH, l); break;
    default: base = 420 * Math.pow(1.09, l - 1); break;
  }
  if (isBoss(chapter, l)) base *= ECON.bossBonus;
  if (isChapterFinale(chapter, l)) base *= 1.5;   // the act break is a payday
  return Math.round(base);
}

// --------------------------------------------------------------------------
// Progression helpers menus.js will want
// --------------------------------------------------------------------------

// Where "next" goes when a level is cleared. Chapters with no levels of their
// own are skipped by the pointer but still gate progress through their unlocks.
export function nextOf(chapter, level) {
  const n = levelCount(chapter);
  if (level < n) return { chapter, level: level + 1 };
  for (let c = chapter + 1; c <= lastChapter(); c++) {
    if (levelCount(c) > 0) return { chapter: c, level: 1 };
  }
  return null;
}

export function chapterProgress(chapter, clearedCount) {
  const n = levelCount(chapter);
  return n ? Math.min(1, clearedCount / n) : 0;
}

// "You need 45 more power" beats "you cannot play this". menus.js renders it.
export function gateMessage(chapter, level, power) {
  const need = reqPowerFor(chapter, level);
  if (power >= need) return null;
  return { need, have: power, short: need - power };
}

// Rough cash the player is expected to hold entering a level, used by the level
// select to suggest "go buy something" instead of "go replay something".
export const expectedCashAt = (chapter, level) => powerCost(reqPowerFor(chapter, level));
