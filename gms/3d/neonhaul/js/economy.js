// §7.4 — the cell, the payment formula, the fuel price, the licence ladder and the shop.
//
// PURE. No three.js, no DOM, no localStorage, no Date.now(). Every function takes state in and
// returns a number or a mutated plain object, and every clock is a sim time in SECONDS passed as an
// argument. `tools/sim_p7a.mjs` runs ten thousand careers through this file in a few seconds
// because of that, and the balance numbers in the P7a report come from those runs and not from
// anybody's judgement.
//
// §7.4.10 is binding: there is no heat, no pursuit, no impound and no fail state. Nothing in this
// file reads a threat, a pursuit level or a police entity, and `risk` (§7.4.2) is a fixed property
// of a job computed once at generation from three static conditions. If you are adding a term here
// that depends on something the world is DOING to the player, stop — that is the mechanic
// DECISIONS decision 6 deleted.

import { clamp } from './utils.js';
import { CRAFT_SPEED } from './config.js';

export const round5 = v => Math.round(v / 5) * 5;

// ── §7.4.1 the cell ────────────────────────────────────────────────────────
export const CELL = {
  CAP: 100,                 // units
  IDLE: 0.05,               // units/s at a standstill — 33 minutes of hover
  CRUISE_K: 0.27,           // + this x (speed / MAX_FWD)
  BOOST_K: 0.65,            // + this x (speed / MAX_BOOST) while boosting
  SLOT: 0.012,              // units/s per OCCUPIED cargo slot
  TOW_SPEED: 12,            // m/s limp
  TOW_FREE_UNITS: 15,       // §7.4.3 — the clause that closes target 4
};

// ── §7.4.2 payment ────────────────────────────────────────────────────────
export const PAY = {
  BASE: 180,
  PER_KM: 130,
  PER_RISK: 60,
  TIME_MAX: 0.45,           // +45 %
  TIME_SPAN: 0.35,          // saturates at 65 % of the limit
  CHAIN: 0.12,              // per ADDITIONAL parcel held at the moment of delivery
  RUSH_MUL: 2.2,
  // ── D1: the time limit, RE-DERIVED. The plan's own numbers made the bonus unlosable. ──────
  //
  // §7.4.6 pinned 1.8 km -> 200 s and §7.4.7 pinned 3.6 km -> 340 s, giving
  // `limit = 60 + 77.778 x km`. Measured over ~5,500 deliveries with those constants, the time
  // bonus was **saturated on 100 %** of them and `overdueRate` was **0.000**: a 1.8 km job is 29 s
  // of flight at §6.2's cruise and it was allowed 200 s, so the "bonus" was an unmissable +45 %
  // markup whose HUD row always read the same number. That is not a bonus, it is a price.
  //
  // These two constants are therefore NOT hand-picked and NOT taken from the plan. They were swept
  // by `tools/sim_p7a.mjs` against a target DISTRIBUTION — fully saturated on 50-60 % of
  // deliveries, fully lost on under 10 % — over ~13,100 deliveries across six policies, twelve
  // world seeds and a 0.72-skill "still learning" pilot. Measured at these values:
  //
  //     all deliveries   56.5 % saturated · 2.9 % fully lost · mean 0.383
  //     normal jobs      57.6 % saturated · 2.6 % fully lost
  //     RUSH jobs         6.7 % saturated · 18.4 % fully lost
  //     `dawdle` (0.72 skill, 2.4x dwell)  0 % saturated, 1 % lost — it sits ON the ramp
  //
  // The last line is the point of the whole change: the bonus is now a skill gradient rather than
  // a switch, and `chain` pays for it (13 % fully lost, because the second parcel waits in the
  // hold), which is exactly the routing decision §7.4.2 says the chain bonus exists to create.
  //
  // **Both worked examples' PAYOUTS survive unchanged** — 650 and 1,115 — because the saturated
  // bonus is still +45 %. What changes is the clock: §7.4.6's "limit 3:20, saturates 2:10,
  // delivered at 2:05" becomes "limit 1:05, saturates 0:42, delivered at 0:40", and §7.4.7's
  // "5:40 / 3:41 / 4:12" becomes "1:55 / 1:15 / 1:25". Those times derive from the broken premise;
  // the payouts do not. Gates T2/T3 assert the new clocks and the same two payouts.
  LIMIT_BASE: 20,
  LIMIT_PER_KM: 26,
  // NOT IN THE PLAN — derived, and re-derived with the above. §7.1 says a RUSH job "has a tight
  // timer" without giving one. P7a's 0.6 was solved against the OLD limits; against these it makes
  // a rush bonus **72 % fully lost and 0 % saturated**, which is the same defect wearing the
  // opposite sign. 0.85 measures 6.7 % saturated / 18.4 % lost: hard to earn in full, easy to
  // erode, and still worth chasing because the 2.2x multiplies.
  RUSH_LIMIT_MUL: 0.85,
};

export const RISK_LABELS = ['LOW', 'MED', 'HIGH', 'EXTREME'];

// ── §7.4.3 fuel ───────────────────────────────────────────────────────────
export const FUEL = { PRICE: 2.2 };      // CRD per unit at a CHARGE pad

// ── §7.4.4 the licence ladder ─────────────────────────────────────────────
// Thresholds are on LIFETIME GROSS credits, so spending in the shop never costs progress.
export const LADDER = [
  { tier: 1, lifetime: 0,     parcel: 'standard',  districts: ['spine', 'ribs'],   craft: null },
  { tier: 2, lifetime: 2400,  parcel: 'bulk',      districts: ['vault', 'soot'],   craft: 'kestrel' },
  { tier: 3, lifetime: 7000,  parcel: 'rush',      districts: ['lantern'],         craft: 'lance' },
  { tier: 4, lifetime: 16000, parcel: 'fragile',   districts: ['cradle'],          craft: 'drayman' },
  { tier: 5, lifetime: 36000, parcel: 'contested', districts: ['pale'],            craft: 'nocturne' },
  { tier: 6, lifetime: 80000, parcel: 'blackbox',  districts: ['drown'],           craft: 'mammoth' },
];

// ── §5.2's slots + §7.4.9's prices ────────────────────────────────────────
// The free tier-1 courier. Named rather than spelled 'wisp' at each site, because two places
// deciding what the starter hull is would agree until they did not.
export const STARTER_HULL = 'wisp';

export const CRAFT = {
  wisp:     { slots: 2, price: 0,     effMul: 1.00 },
  kestrel:  { slots: 3, price: 1800,  effMul: 1.00 },
  lance:    { slots: 2, price: 4500,  effMul: 1.00 },
  drayman:  { slots: 4, price: 9000,  effMul: 1.00 },
  // §7.4.9: "silent running" is retargeted to cell efficiency and `nocturne` carries an intrinsic
  // -15 % cruise drain on top of the upgrade line. It is the long-range hull.
  nocturne: { slots: 3, price: 20000, effMul: 0.85 },
  mammoth:  { slots: 6, price: 44000, effMul: 1.00 },
};

export const UPGRADES = {
  thrust: { steps: [0.08, 0.16, 0.24], label: 'THRUST' },
  cargo:  { steps: [1, 2, 3],          label: 'CARGO' },
  cell:   { steps: [0.15, 0.30, 0.50], label: 'CELL' },
  eff:    { steps: [0.12, 0.22, 0.30], label: 'SILENT RUNNING' },
  // S2-F. The one line whose LEVEL 0 already does something: every craft ships with the DRONE
  // autopilot, which flies the lanes at a third of the hull's speed. The steps are the ladder's
  // rungs 1-3 and are read through `lanes.js` AUTO_LEVELS — the numbers here would be a second
  // copy of that table, so this carries only the label and the level count the shop draws.
  auto:   { steps: [1, 2, 3],          label: 'AUTOPILOT' },
};
export const UPGRADE_FRAC = [0.15, 0.35, 0.70];   // of the CURRENT craft's list price
export const REPAIR_PRICE = 40;

// §7.4.9's upgrade price is a fraction of the current craft's list price — and `wisp` lists at 0,
// which would make every starter upgrade free. The starter is "owned", not worthless; its notional
// list price is the number the ladder is solved against, so an L1 upgrade on a wisp costs 15 % of
// this rather than 15 % of nothing.
export const WISP_NOTIONAL = 2000;

export function craftList(id) {
  const c = CRAFT[id];
  if (!c) return WISP_NOTIONAL;
  return c.price || WISP_NOTIONAL;
}

export function upgradePrice(state, line) {
  const lv = (state.upgrades && state.upgrades[line]) || 0;
  if (lv >= 3) return null;                       // maxed
  return round5(craftList(state.craft) * UPGRADE_FRAC[lv]);
}

// ── derived player numbers ────────────────────────────────────────────────

export function cargoSlots(state) {
  const base = (CRAFT[state.craft] || CRAFT.wisp).slots;
  const lv = (state.upgrades && state.upgrades.cargo) || 0;
  return base + (lv ? UPGRADES.cargo.steps[lv - 1] : 0);
}

export function cellMax(state) {
  const lv = (state.upgrades && state.upgrades.cell) || 0;
  return CELL.CAP * (1 + (lv ? UPGRADES.cell.steps[lv - 1] : 0));
}

export function maxFwd(state) {
  const base = CRAFT_SPEED[state.craft] || CRAFT_SPEED.wisp;
  const lv = (state.upgrades && state.upgrades.thrust) || 0;
  return base * (1 + (lv ? UPGRADES.thrust.steps[lv - 1] : 0));
}

// The efficiency multiplier applied to the CRUISE drain only. The upgrade line is named for cruise
// (§7.4.9 "-12/-22/-30 % cruise drain") and boosting deliberately stays expensive, otherwise the
// two curves collapse into one and boost stops being a choice.
export function effMul(state) {
  const lv = (state.upgrades && state.upgrades.eff) || 0;
  const up = lv ? 1 - UPGRADES.eff.steps[lv - 1] : 1;
  return up * (CRAFT[state.craft] || CRAFT.wisp).effMul;
}

// S2-F. The autopilot rung the player is on. There is no `if (bought)` anywhere in the game: the
// free rung is a rung, so the only question is ever WHICH pilot, never WHETHER.
export function autoLevel(state) {
  return clamp(((state.upgrades && state.upgrades.auto) || 0) | 0, 0, 3);
}

export function occupiedSlots(state) {
  return (state.cargo || []).reduce((s, p) => s + p.slots, 0);
}

// §7.4.1's two curves, verbatim, plus the cargo-mass term.
export function drainPerSec(state, { speed = 0, boosting = false } = {}) {
  const slots = occupiedSlots(state);
  const cargo = CELL.SLOT * slots;
  if (boosting) {
    const mb = maxFwd(state) * (105 / 62);       // §6.2 boost scales in wisp's 105/62 ratio
    return CELL.IDLE + CELL.BOOST_K * clamp(speed / mb, 0, 1) + cargo;
  }
  return (CELL.IDLE + CELL.CRUISE_K * clamp(speed / maxFwd(state), 0, 1)) * effMul(state) + cargo;
}

// Seconds of flight left at the current drain. This is what §8.3's cell-range panel wants and it
// replaces HUD.CELL_PER_MIN, which config.js labels a placeholder for exactly this.
export function secondsLeft(state, opts) {
  const d = drainPerSec(state, opts);
  return d <= 0 ? Infinity : state.cellUnits / d;
}
export function cruiseSeconds(state) {
  return secondsLeft(state, { speed: maxFwd(state), boosting: false });
}
export function cellFrac(state) { return clamp(state.cellUnits / cellMax(state), 0, 1); }

// ── §7.4.2 the formula ───────────────────────────────────────────────────

export function jobBase(km, risk) {
  return round5(PAY.BASE + PAY.PER_KM * km + PAY.PER_RISK * risk);
}

export function timeLimit(km, rush) {
  const s = PAY.LIMIT_BASE + PAY.LIMIT_PER_KM * km;
  return Math.round((rush ? s * PAY.RUSH_LIMIT_MUL : s) / 5) * 5;
}

export function timeBonus(limit, elapsed) {
  return PAY.TIME_MAX * clamp((limit - elapsed) / (PAY.TIME_SPAN * limit), 0, 1);
}

export function chainBonus(othersHeld) {
  return PAY.CHAIN * Math.max(0, othersHeld);
}

// The whole of §7.4.2. Bonuses are ADDITIVE percentages of base and the rush multiplier
// MULTIPLIES, so a chained rush job is worth chasing and the panel's arithmetic is arithmetic a
// player can do in their head.
export function payout({ base, limit, elapsed, othersHeld = 0, rush = false }) {
  const tb = timeBonus(limit, elapsed);
  const cb = chainBonus(othersHeld);
  const mul = rush ? PAY.RUSH_MUL : 1;
  return {
    timeBonus: tb, chainBonus: cb, rushMul: mul,
    credits: round5(base * (1 + tb + cb) * mul),
  };
}

// §7.4.2's three conditions, +1 each, capped at 3. It depends on NOTHING DYNAMIC — this is the
// function decision 6 is most likely to be violated in, so it takes only static job facts and
// there is deliberately no state parameter to reach a threat level through.
export const RISKY_PARCELS = new Set(['fragile', 'blackbox']);

export function riskOf({ dropDistrictTier, parcelType, dropY }) {
  let r = 0;
  if (dropDistrictTier >= 4) r++;
  if (RISKY_PARCELS.has(parcelType)) r++;
  if (dropY > 300 || dropY < 30) r++;
  return Math.min(3, r);
}
export const riskLabel = r => RISK_LABELS[clamp(r | 0, 0, 3)];

// ── §7.4.4 the ladder ────────────────────────────────────────────────────

export function tierFor(lifetime) {
  let t = 1;
  for (const row of LADDER) if (lifetime >= row.lifetime) t = row.tier;
  return t;
}
export function nextTier(lifetime) {
  for (const row of LADDER) if (lifetime < row.lifetime) return row;
  return null;
}
export function unlockedParcels(tier) {
  return LADDER.filter(r => r.tier <= tier).map(r => r.parcel);
}
export function unlockedDistricts(tier) {
  const out = [];
  for (const r of LADDER) if (r.tier <= tier) out.push(...r.districts);
  return out;
}
export function unlockedCraft(tier) {
  return ['wisp', ...LADDER.filter(r => r.tier <= tier && r.craft).map(r => r.craft)];
}

// ── the state object ─────────────────────────────────────────────────────
// This is the shape save.js must carry (see docs/P7A_WIRING.md — save.js is not P7a's file). It is
// deliberately a plain object with no methods so it round-trips through JSON unchanged.

export function newState(over = {}) {
  const s = {
    credits: 250,          // §3.1.1's spawn: 250 CRD, cell full, tier 1, no cargo
    lifetime: 0,
    tier: 1,
    craft: 'wisp',
    upgrades: { thrust: 0, cargo: 0, cell: 0, eff: 0, auto: 0 },
    cellUnits: 0,
    cargo: [],
    stats: { jobs: 0, delivered: 0, failed: 0, distance: 0, spentFuel: 0, tows: 0, haggles: 0 },
    ...over,
  };
  if (!over.cellUnits) s.cellUnits = cellMax(s);
  return s;
}

// Every credit the player earns goes through here, so `lifetime` can never drift from `credits`
// and the ladder can never be driven by the balance (§7.4.4).
export function earn(state, amount) {
  const n = Math.max(0, Math.round(amount));
  state.credits += n;
  state.lifetime += n;
  const t = tierFor(state.lifetime);
  const promoted = t > state.tier;
  state.tier = Math.max(state.tier, t);
  return { paid: n, tier: state.tier, promoted };
}

export function spend(state, amount) {
  const n = Math.max(0, Math.round(amount));
  if (state.credits < n) return false;
  state.credits -= n;
  return true;                                     // lifetime is untouched, by design
}

// ── §7.4.3 charging and the tow ──────────────────────────────────────────

export function chargeCost(units) { return round5(units * FUEL.PRICE); }

// Buy up to `units` (default: fill). Never partially charges without charging — if the player can
// only afford 3 units they get 3 units, because the alternative is a soft fail state.
export function buyCharge(state, units = Infinity) {
  const room = cellMax(state) - state.cellUnits;
  let want = Math.min(room, units);
  if (want <= 0) return { units: 0, cost: 0 };
  const affordable = state.credits / FUEL.PRICE;
  if (want > affordable) want = affordable;
  if (want <= 0) return { units: 0, cost: 0 };
  const cost = Math.min(state.credits, Math.round(want * FUEL.PRICE));
  state.credits -= cost;
  state.cellUnits += want;
  state.stats.spentFuel += cost;
  return { units: want, cost };
}

// §7.4.3's tow. Free, always available, and it hands back 15 units — which is the clause that makes
// "nothing can strand you" (§7.4.0 target 4) true rather than aspirational. A player at 0 credits
// and 0 charge is otherwise sitting at a pad they cannot afford to use, which is a fail state.
export function tow(state) {
  state.cellUnits = Math.min(cellMax(state), state.cellUnits + CELL.TOW_FREE_UNITS);
  state.stats.tows++;
  return { units: CELL.TOW_FREE_UNITS, cost: 0 };
}

// Advance the cell by dt seconds. Returns 'flat' on the frame the cell empties, so main.js can
// fire the toast and the tow exactly once.
export function tickCell(state, dt, opts) {
  if (state.cellUnits <= 0) return 'flat';
  state.cellUnits = Math.max(0, state.cellUnits - drainPerSec(state, opts) * dt);
  return state.cellUnits <= 0 ? 'flat' : 'ok';
}

// ── the shop ─────────────────────────────────────────────────────────────

export function canBuyCraft(state, id) {
  const c = CRAFT[id];
  if (!c) return { ok: false, why: 'unknown' };
  // `borrowed` is load-bearing here and was added after this line was written. Without it the shop
  // refuses to sell you the hull you are HIRING — which is the single most natural purchase in act
  // two — and refuses to sell a `kestrel` to a player who ended act one nominally sitting in their
  // parents' one, because `settle()` leaves `craft` where it was. Owning is what 'owned' means.
  if (state.craft === id && !state.borrowed) return { ok: false, why: 'owned' };
  // THE STARTER HULL IS NOT SOLD, and this is a rule about the shape of the game rather than about
  // pricing. `wisp` lists at 0 and unlocks at tier 1, so the shop would hand a grounded act-two
  // player a hull for nothing — which clears `borrowed`, ends the grounding, and deletes the hire
  // loop that S2_BRIEF calls the spine of the game, about ten seconds into act two. Nobody has a
  // legitimate claim on it either: since S2-E the player starts in a BORROWED `kestrel`, so no
  // career ever passes through a wisp and the free hull has no buyer it was meant for.
  //
  // It stays in CRAFT — it is a valid save value, it has a flight model and a hull, and
  // WISP_NOTIONAL exists downstream precisely because its list price is 0. It is simply off the lot.
  if (id === STARTER_HULL) return { ok: false, why: 'starter' };
  if (!unlockedCraft(state.tier).includes(id)) return { ok: false, why: 'licence' };
  if (state.credits < c.price) return { ok: false, why: 'credits', short: c.price - state.credits };
  return { ok: true, price: c.price };
}

export function buyCraft(state, id) {
  const chk = canBuyCraft(state, id);
  if (!chk.ok) return chk;
  spend(state, chk.price);
  state.craft = id;
  // Upgrades are per-hull: they were fitted to the old craft. Buying a hull resets the lines,
  // which is also what keeps `upgradePrice` honest (a 70 % L3 on a mammoth is not a wisp price).
  state.upgrades = { thrust: 0, cargo: 0, cell: 0, eff: 0 };
  state.cellUnits = Math.min(state.cellUnits, cellMax(state));
  return { ok: true, price: chk.price };
}

export function buyUpgrade(state, line) {
  if (!UPGRADES[line]) return { ok: false, why: 'unknown' };
  const price = upgradePrice(state, line);
  if (price === null) return { ok: false, why: 'maxed' };
  if (state.credits < price) return { ok: false, why: 'credits', short: price - state.credits };
  spend(state, price);
  state.upgrades[line] = (state.upgrades[line] || 0) + 1;
  if (line === 'cell') state.cellUnits = Math.min(cellMax(state), state.cellUnits);
  return { ok: true, price, level: state.upgrades[line] };
}

// §7.4.9: repair is 40 CRD flat and COSMETIC ONLY. There is no damage model, because damage with no
// repair budget is a fail state (§7.4.0 target 4) and damage with one is a heat system wearing a
// different hat.
export function buyRepair(state) {
  if (state.credits < REPAIR_PRICE) return { ok: false, why: 'credits' };
  spend(state, REPAIR_PRICE);
  return { ok: true, price: REPAIR_PRICE };
}

// ── save shape ───────────────────────────────────────────────────────────
// save.js is not P7a's file. These two functions are the contract the wiring note asks for: the
// persistent half of the economy is six keys and it merges into the existing profile rather than
// creating a parallel store (§2.4 bucket 1).

export function toSave(state) {
  return {
    credits: state.credits, lifetime: state.lifetime, tier: state.tier,
    craft: state.craft, upgrades: { ...state.upgrades },
    cellUnits: +state.cellUnits.toFixed(2),
    stats: { ...state.stats },
  };
}

export function fromSave(profile) {
  const s = newState({
    credits: profile.credits, lifetime: profile.lifetime,
    craft: profile.craft || 'wisp',
    upgrades: { thrust: 0, cargo: 0, cell: 0, eff: 0, auto: 0, ...(profile.upgrades || {}) },
    stats: { jobs: 0, delivered: 0, failed: 0, distance: 0, spentFuel: 0, tows: 0, haggles: 0, ...(profile.stats || {}) },
  });
  // The tier is DERIVED from lifetime, never trusted from disk — a hand-edited profile cannot
  // unlock a district, and a ladder change reprices every existing save automatically.
  s.tier = tierFor(s.lifetime);
  s.cellUnits = profile.cellUnits === undefined ? cellMax(s) : clamp(profile.cellUnits, 0, cellMax(s));
  return s;
}
