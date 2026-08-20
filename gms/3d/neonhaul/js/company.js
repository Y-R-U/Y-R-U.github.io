// §S2-I — the company layer: hired drivers, automatic wages, the ledger both earnings screens read.
//
// PURE, like economy.js, ranks.js and story.js and for the same reason: no three.js, no DOM, no
// Date.now(). Every clock is a sim time in SECONDS passed as an argument, so `tools/sim_s2i.mjs`
// runs whole fleets through this file in node and the wage table below is MEASURED. The live half —
// a driver's craft, its flight model and the pilot at its stick — is `js/fleet.js`; nothing here
// knows that a driver has a position.
//
// Aaron's words for the phase: *"hire more drivers — and you will be able to switch to their
// vehicle views, you will be paying wages (automatically) and there would be earnings screens."*
// Founding an actual company with legit/shady tabs is S2-J and is deliberately absent.
//
// ── WHAT A DRIVER ACTUALLY IS ──────────────────────────────────────────────
//
// `js/autopilot.js`'s `Courier` already flies a complete delivery loop: it takes jobs off real
// boards, navigates, docks, delivers. It is what `?courier=1` drives, and S2-E measured it against
// the analytic economy at an optimism ratio of **0.995**. So a hired driver is a `Courier` at the
// stick of a real `Flight`, running a real `Missions` board — the same code the soak pilot uses.
// Their earnings are not a formula that pretends to be a delivery; they are deliveries.
//
// ── COMPETENCE IS NOT A NEW NUMBER ─────────────────────────────────────────
//
// A grade's speed is `lanes.js` AUTO_LEVELS[n].speed and nothing else. That is the ladder S2-F
// measured over 4,000 trips — 0.32 / 0.50 / 0.70 / 0.88 of the hull's MAX_FWD — and inventing a
// second competence scale beside it would be a second set of numbers to keep honest. What this
// file adds is DWELL: a green driver reads the board slowly, and `tools/sim_p7a.mjs` already has
// a dwell multiplier because the player's own policies needed one.
//
// **The route is direct, not lane-following.** A driver is a `Courier`, which points itself at the
// target; `LanePilot`'s corridor detour is not applied. So the grade slowdown is the speed cap
// only, and a grade-3 driver is nearly as quick as a hand-flown hull. Stated because the S2-F
// ladder's headline figures (4.28x .. 1.48x slower than a thumb) include the detour and DO NOT
// describe a driver.
//
// ── THE ONE DESIGN RULE ────────────────────────────────────────────────────
//
// **A hire must be able to lose money.** A driver who always nets positive is a button that prints
// credits, not a decision. The wage table below is solved against that, and the lever that makes
// it bite is the HULL: the lease is a fraction of `story.js`'s already-swept hire block price, and
// the hulls are not equally productive. Measured over 6 world seeds x 30 minutes per pairing
// (`tools/sim_s2i.mjs`, committed at `docs/s2i_balance.json`), a grade-3 driver nets **+339
// CRD/min in a `lance` and −868 CRD/min in a `mammoth`** — the same driver, the same wage, the
// hull alone. There is no pairing table in the UI and there should not be one: the roster prints
// the live arithmetic per driver, so a losing hire is visible inside a minute.

import * as E from './economy.js';
import * as Story from './story.js';
import { AUTO_LEVELS } from './lanes.js';
import { CRAFT_SPEED } from './config.js';

// ── grades ─────────────────────────────────────────────────────────────────
//
// `speed` is DERIVED from AUTO_LEVELS — see the header. `wage` is the driver's own pay per minute
// and is swept; `dwell` is how long they spend on a pad reading the board, as a multiple of the
// player's own 1.4 s.
//
// **Every driver starts on a TIER 1 licence, whatever their grade**, and climbs it from their own
// lifetime gross because `missions.deliver` calls `economy.earn` on the driver's own state. An
// earlier draft gave the better grades a head start on the ladder; it was removed before it
// shipped, because `sim_p7a.runCareer` starts every career at tier 1 and cannot be told otherwise
// — so the sweep would have been describing a driver the game does not have, in the player's
// favour, on the one number the whole phase is balanced against. Grades differ in SPEED and in
// DWELL, both of which the sweep models exactly.
export const GRADES = [
  { g: 0, name: 'GREEN', auto: 0, dwell: 1.9, wage: 75,
    blurb: 'flies like the licence is new, because it is' },
  { g: 1, name: 'STEADY', auto: 1, dwell: 1.5, wage: 255,
    blurb: 'no flair, no incidents, turns up' },
  { g: 2, name: 'SEASONED', auto: 2, dwell: 1.2, wage: 405,
    blurb: 'knows which pads are worth the climb' },
  { g: 3, name: 'ACE', auto: 3, dwell: 1.0, wage: 515,
    blurb: 'flies it like they own it, and charges like it' },
];

export const gradeOf = g => GRADES[Math.max(0, Math.min(GRADES.length - 1, g | 0))];
// The one place competence becomes a number. Never restated.
export const gradeSpeed = g => AUTO_LEVELS[gradeOf(g).auto].speed;

// ── the lease ──────────────────────────────────────────────────────────────
//
// A driver needs a hull and the company does not own one, so it leases. There is ONE hull price in
// this game — `story.blockPrice()`, swept in S2-E against the player's own five-minute hire — and
// this is a standing fraction of it rather than a second table. 0.35: a fleet contract is cheaper
// per minute than walking up to a desk and asking for five minutes, which is why the retail number
// exists to be discounted from.
//
// It is NOT a rounding of the retail rate. At retail (285 CRD/min for a `wisp`) every grade below
// SEASONED loses money in every hull, and a wage table cannot fix that because the lease is larger
// than the whole margin. 0.35 is the largest fraction at which the lowest grade in the cheapest
// hull is still (barely) worth hiring — which is the property that makes the bottom of the ladder
// a decision instead of a trap.
export const LEASE_FRAC = 0.35;

export function leasePerMin(craftId) {
  return E.round5(Story.blockPrice(craftId) / (Story.HIRE.BLOCK_S / 60) * LEASE_FRAC);
}

// Everything the company pays for this driver, per minute. Two lines because the earnings screen
// shows two lines: what the person costs and what the vehicle costs are different decisions.
//
// §S2-J adds the second argument and NOTHING ELSE changes without it. `wageOf(driver)` is
// byte-for-byte the S2-I function, which is what keeps `gates_s2i` A1's lease identity and A6's
// 180-second walk-out true — a CLEAN company multiplies by exactly 1. The premium is the cost half
// of the shady trade-off: nobody good flies cheap for a charter the patrol has a file on.
export function wageOf(driver, co = null) {
  const m = co ? wageExposure(co) : 1;
  const base = E.round5(gradeOf(driver.grade).wage * m);
  const lease = E.round5(leasePerMin(driver.craft) * m);
  return { base, lease, total: base + lease, exposureMul: +m.toFixed(4) };
}
export const wagePerSec = (driver, co = null) => wageOf(driver, co).total / 60;

// The signing fee: five minutes of wage, so a hire that is immediately released has cost real
// money and a hire that works pays it back inside an hour. It is SUNK — `release()` refunds
// nothing, which is what stops the roster being a free slot machine the player re-rolls.
export const SIGNING_MINUTES = 5;
export function signingFee(grade, craftId) {
  return E.round5((gradeOf(grade).wage + leasePerMin(craftId)) * SIGNING_MINUTES);
}

// ── arrears ────────────────────────────────────────────────────────────────
//
// Wages are paid automatically and CONTINUOUSLY. When the account cannot cover them the shortfall
// becomes arrears rather than being skipped — a wage that quietly stops when you are broke is not
// a wage. There is still no fail state (DECISIONS 6): a driver who is owed more than
// ARREARS_MINUTES of their own wage walks, and walking is the whole penalty. The player keeps
// flying, keeps their hull, and has lost the signing fee and the driver.
export const ARREARS_MINUTES = 3;
export const arrearsLimit = (driver, co = null) => wageOf(driver, co).total * ARREARS_MINUTES;

// ── the company ladder ─────────────────────────────────────────────────────
//
// Four tiers on FLEET LIFETIME GROSS — what your drivers have hauled, which is the company's
// version of the quantity `economy.lifetime` already is for the player. It is gross and not profit
// on purpose: profit can go backwards, and a ladder that walks back down is a ladder nobody trusts.
//
// The cap is what each tier actually BUYS. Tiers 3 and 4 additionally open `js/ranks.js`'s two
// reserved courier rungs — LANE MARSHAL and SPIRE HAULIER — which have shipped since S2-D with
// `lifetime: null` precisely so this phase could give them a threshold that is not a lifetime.
//
// SWEPT, NOT PICKED — `node tools/sim_s2i.mjs`, committed at `docs/s2i_balance.json`. The
// thresholds are set against how long a fleet at each cap takes to reach the next one, so every
// tier is roughly an hour of fleet-minutes away from the last rather than a number that looked
// round. Do not hand-edit one without re-running the sweep.
export const COMPANY_TIERS = [
  { tier: 1, name: 'SOLE TRADER', gross: 0, cap: 1, opens: null,
    blurb: 'you, a hull you do not own, and one other pair of hands' },
  { tier: 2, name: 'TWO-HANDED', gross: 18000, cap: 2, opens: null,
    blurb: 'a second driver, and the first payroll that can hurt' },
  { tier: 3, name: 'LANE HOUSE', gross: 60000, cap: 3, opens: 'LANE MARSHAL',
    blurb: 'three hulls on the lanes with your name on the manifest' },
  { tier: 4, name: 'SPIRE CONTRACT', gross: 165000, cap: 4, opens: 'SPIRE HAULIER',
    blurb: 'the Spine returns your calls' },
];

export function companyTier(gross) {
  let row = COMPANY_TIERS[0];
  for (const r of COMPANY_TIERS) if ((gross || 0) >= r.gross) row = r;
  return row;
}
export function nextCompanyTier(gross) {
  return COMPANY_TIERS.find(r => (gross || 0) < r.gross) || null;
}
export const driverCap = co => companyTier(co ? co.gross : 0).cap;

// ── §S2-J — THE SHADY BRANCH ───────────────────────────────────────────────
//
// Aaron: *"the default side is legit/a transport business, but a shady business option may open up
// performing dodgy trades - it may be a tab to switch between them."*
//
// The brief's hard constraint on this phase is that **a dodgy trade must be a real trade-off and
// not a better payout**. If off-book work simply pays more then nobody ever runs the legit side and
// half the game dies. So an off-book delivery pays `EXPOSURE.PAY` times what the same parcel pays on
// the books, and it buys that with FOUR costs, every one of which is a number on the screen:
//
//   1. EXPOSURE.        Each run adds `PER_RUN` to the charter's file. Exposure decays exponentially with
//                   DECAY_S, so a charter that runs one driver off-book sits at a steady state and
//                   one that runs four saturates.
//   2. LEGIT PAY.   Above WATCH, the charter's LEGIT deliveries pay less — clients stop answering.
//                   This is the term that makes exposure hurt a fleet rather than a driver: it lands on
//                   every legit delivery the company makes, including ones by drivers who never
//                   went near a run.
//   3. WAGES.       Above WATCH, the whole payroll costs more. Risk pay, and it is charged on the
//                   drivers who are NOT running.
//   4. BUSTS.       Per run, `BUST_BASE + BUST_SLOPE x exposure`. A bust pays nothing, costs a fine of
//                   FINE_MULT times the run, and adds BUST_ADD on top. At exposure 1 the charter is
//                   SUSPENDED for SUSPEND_S: while suspended it earns NOTHING, legit or otherwise,
//                   and the payroll keeps running.
//
// And the fifth cost, which is the one that makes the shady ladder a genuinely different game:
// **off-book gross does not count on the CHARTER ladder.** `co.gross` is what opens the two
// reserved licence rungs (`js/ranks.js`), and a run does not touch it — it goes to `shadyGross`,
// which is the SMOKE → THE HOUSE ladder's axis and nothing else's. So a player who runs everything
// off-book climbs one ladder and stalls on the other.
//
// **Why multiple companies exist**, and it falls out of this rather than being bolted beside it:
// exposure is per CHARTER. Running the dodgy work through a second, disposable company keeps the file
// off the one with your licence rungs on it. That costs a founding fee, and the shell starts at
// SOLE TRADER with a cap of one — so laundering is real, priced, and slower than it looks.
//
// SWEPT, NOT PICKED — `node tools/sim_s2j.mjs`, committed at `docs/s2j_balance.json`. Twelve
// worlds x 90 minutes, seven policies, all of it through this file on a real one-second clock with
// the delivery logs `sim_p7a.runCareer` actually produced. Fleet net, CRD/min, p50:
//
//     clean   264.3  |  one_off  472.5  |  two_off   47.0  |  all_off  -635.8
//                    |  burst    420.9  |  shell    346.7  |  shell2   278.6
//
// That shape is the design: **one driver running is the sweet spot, two is roughly break-even, and
// running everybody is ruinous** — all_off suspends its charter twice in ninety minutes and pays
// 92,063 CRD of fines to do it. EXPOSURE.PAY was chosen against exactly that curve; at 1.9 one_off came
// out 2.5x clean, which is not a decision, and at 1.5 the branch was not worth the bust risk at all.
//
// The cost the net column CANNOT show, and it is the biggest one: `all_off`'s charter gross is
// **zero**, against `clean`'s 168,087. The driver cap is a company tier and company tiers are
// reached on charter gross, so a charter running off the books never grows. A second experiment in
// the same file starts every arm at SOLE TRADER and measures it: after 90 minutes `clean` is at
// charter tier 3 with three drivers and the naive policy is at **tier 1 with one, forever**.
export const EXPOSURE = {
  PER_RUN: 0.014,        // exposure per off-book delivery
  DECAY_S: 900,          // e-folding time of the charter's file
  WATCH: 0.20,           // above this the costs start
  FLAG: 0.55,            // above this they bite
  PAY: 1.70,              // an off-book parcel pays this much of the on-book rate
  BUST_BASE: 0.04,
  BUST_SLOPE: 0.26,      // bust chance = BASE + SLOPE x exposure
  BUST_ADD: 0.05,
  FINE_MULT: 2.5,        // a bust costs this many times the run's value
  SUSPEND_S: 240,        // the charter earns nothing at all for this long
  SUSPEND_RESET: 0.55,   // …and comes back with this much exposure still on the file
  LEGIT_FLOOR: 0.55,     // what a legit delivery pays at exposure 1
  WAGE_TOP: 1.30,        // what the payroll costs at exposure 1
};

export const EXPOSURE_BANDS = [
  { key: 'clean', at: 0, name: 'CLEAN', note: 'nobody is reading your manifests' },
  { key: 'watched', at: EXPOSURE.WATCH, name: 'WATCHED', note: 'a name on a list, nothing more' },
  { key: 'flagged', at: EXPOSURE.FLAG, name: 'FLAGGED', note: 'clients stop answering and crews charge for it' },
  { key: 'burning', at: 0.85, name: 'BURNING', note: 'one more run and the charter goes down' },
];

// The door. `js/story.js` decides WHEN it opens (two routes, one room — the seized branch has it
// from the first minute of act two, the paid-off branch earns it by pulling a thread); this is only
// whether it is open on this charter.
export const branchOpen = co => !!(co && co.shady);
export function openBranch(group, now = 0) {
  if (!group) return false;
  group.shady = true;
  group.shadyAt = now;
  for (const c of group.companies) c.shady = true;
  return true;
}

export function exposureBand(h) {
  let row = EXPOSURE_BANDS[0];
  for (const r of EXPOSURE_BANDS) if ((h || 0) >= r.at) row = r;
  return row;
}

// The two cost curves. Both are EXACTLY 1 below WATCH, which is what makes a company that has
// never run a job off the books indistinguishable from an S2-I company — the whole S2-I wage
// measurement stays valid because at exposure 0 nothing here is doing anything.
// Both take the EXPOSURE and not the company clock: suspension is a separate state and folding it in
// here would make a surface that wants to show "what exposure is costing you" show a zero it cannot
// explain. `payMultiplier` is the one that applies both.
const ramp = h => clamp01((h - EXPOSURE.WATCH) / (1 - EXPOSURE.WATCH));
export const legitMult = co => (co ? 1 - (1 - EXPOSURE.LEGIT_FLOOR) * ramp(co.exposure || 0) : 1);
export const wageExposure = co => (co ? 1 + (EXPOSURE.WAGE_TOP - 1) * ramp(co.exposure || 0) : 1);

// Suspension. Kept as seconds-remaining rather than a boolean so a surface can print the number
// instead of a state — "SUSPENDED" with no end in sight reads as a bug the first time it happens.
export function suspendedFor(co, now) {
  if (!co || !co.suspendUntil) return 0;
  return Math.max(0, co.suspendUntil - now);
}
export const suspended = (co, now) => suspendedFor(co, now) > 0;

// What a LEGIT delivery is actually worth to this charter right now. One function so the roster,
// the earnings screen and `creditDelivery` can never disagree about it.
export function payMultiplier(co, now, offBook = false) {
  if (!co) return 1;
  if (suspended(co, now)) return 0;
  return offBook ? EXPOSURE.PAY : legitMult(co);
}

// The bust roll. DETERMINISTIC on (seed, run ordinal) so `tools/sim_s2j.mjs` reproduces a career
// exactly and a gate can assert a specific run busts. `Math.random()` here would make the sweep
// unrepeatable and the falsification impossible to write.
export const bustChance = co => clamp01(EXPOSURE.BUST_BASE + EXPOSURE.BUST_SLOPE * (co ? co.exposure || 0 : 0));
export function bustRoll(co) {
  return h01((co.shadyJobs | 0) + 1, co.seed | 0, 0xb057) < bustChance(co);
}

// Exposure decays whether or not anything else happens, and a suspension ends on its own. Called from
// `payWages`, which is the one per-tick entry point the company has — a second timer would be a
// second clock to keep honest.
export function exposureTick(co, dt, now) {
  if (!co) return 0;
  if (co.suspendUntil && now >= co.suspendUntil) {
    co.suspendUntil = 0;
    co.exposure = Math.min(co.exposure || 0, EXPOSURE.SUSPEND_RESET);
  }
  if (!suspended(co, now)) co.exposure = Math.max(0, (co.exposure || 0) * Math.exp(-dt / EXPOSURE.DECAY_S));
  co.exposurePeak = Math.max(co.exposurePeak || 0, co.exposure || 0);
  return co.exposure;
}

// ── candidates ─────────────────────────────────────────────────────────────
//
// A deterministic pool, hashed from the company seed and a refresh ordinal, so the roster cannot
// be re-rolled by closing and reopening the panel — the same trap `missions.js` closes on the job
// board and for the same reason. `refreshCandidates()` is the only thing that advances it, and it
// is not free.
const FIRST = ['Ana', 'Beko', 'Cass', 'Dima', 'Esh', 'Fen', 'Gita', 'Halm', 'Ivo', 'Juno',
  'Kir', 'Lise', 'Mott', 'Nel', 'Oyo', 'Pav', 'Quin', 'Rhee', 'Sable', 'Tov',
  'Ude', 'Vess', 'Wren', 'Xio', 'Yara', 'Zeb'];
const LAST = ['Adler', 'Bray', 'Cortez', 'Dukes', 'Ekko', 'Farr', 'Gault', 'Hoshi', 'Ilm',
  'Jarreau', 'Kade', 'Lund', 'Marek', 'Nowak', 'Orsini', 'Pell', 'Quist', 'Roux',
  'Stavros', 'Tenn', 'Ubarra', 'Voss', 'Wexler', 'Yun'];

// The same integer hash the rest of the project uses, written here rather than imported so this
// file stays free of anything with a THREE import in its chain.
function hashi(a, b, salt) {
  let h = (a | 0) * 374761393 + (b | 0) * 668265263 + (salt | 0) * 2246822519;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}
const h01 = (a, b, salt) => hashi(a, b, salt) / 4294967296;

export const CANDIDATES = 4;

// The pool the HIRE tab shows. `gross` is what the sweep MEASURED this grade earn per minute in a
// `wisp` — it is a fact about the game, printed so the player can do the arithmetic against the
// wage rather than being told an outcome. See RATED_GROSS.
export function candidates(co) {
  const seed = (co && co.seed) | 0;
  const gen = (co && co.gen) | 0;
  const out = [];
  for (let i = 0; i < CANDIDATES; i++) {
    const r = h01(gen * 97 + i, seed, 0x5c11);
    // A pool that is all ACEs is a shop, not a labour market. Weighted toward the middle, with the
    // top grade genuinely scarce.
    const grade = r < 0.28 ? 0 : r < 0.62 ? 1 : r < 0.88 ? 2 : 3;
    const f = FIRST[hashi(gen * 31 + i, seed, 0x1f1) % FIRST.length];
    const l = LAST[hashi(gen * 71 + i, seed, 0x2e2) % LAST.length];
    out.push({ id: `c${gen}_${i}`, name: `${f} ${l}`, grade, slot: i });
  }
  return out;
}

// Refreshing the pool costs a fee. Without one the player re-rolls until an ACE appears and the
// grade weighting above means nothing.
export const REFRESH_FEE = 400;

export function refreshCandidates(co, econ) {
  if (!econ || econ.credits < REFRESH_FEE) {
    return { ok: false, why: 'credits', short: REFRESH_FEE - (econ ? econ.credits : 0) };
  }
  E.spend(econ, REFRESH_FEE);
  co.gen = (co.gen | 0) + 1;
  co.spentRefresh = (co.spentRefresh || 0) + REFRESH_FEE;
  return { ok: true, price: REFRESH_FEE, gen: co.gen };
}

// What each grade was MEASURED to gross per minute in a `wisp`, p50 over 6 world seeds x 30
// minutes (`docs/s2i_balance.json`). This is printed on the hire card beside the wage so the
// player can do the sum. It is a measurement of the base hull and it is labelled as one: a faster
// hull earns more and a `mammoth` earns much less, which is the decision the panel is for.
export const RATED_GROSS = [218, 338, 563, 729];

// ── the state ──────────────────────────────────────────────────────────────

export function newCompany(over = {}) {
  return {
    seed: 0x4e454f4e,
    gen: 0,                 // candidate pool ordinal
    // §S2-J. A charter is a NAMED thing the player founded — Aaron: *"you would need to start a
    // company for your employees to work under"*. `founded` is the sim second it was registered, 0
    // for a company that only exists because a save predates this phase.
    id: 'co1',
    name: '',
    founded: 0,
    fee: 0,                 // what registering this charter cost, for the books
    drivers: [],
    gross: 0,               // FLEET lifetime gross — the company ladder's axis
    wages: 0,               // wages paid, lifetime
    // The same money as `wages`, split the way the earnings screen prints it. Aaron's note on the
    // company screens is that they are where the player understands the business, so "what the
    // people cost" and "what the vehicles cost" are two lines and not one — and they are ACCRUED
    // separately rather than reconstructed at paint time, because a partial payment out of an
    // empty account does not divide the way the quoted rates do.
    wagesBase: 0, wagesLease: 0,
    fuel: 0,                // charge the drivers bought, lifetime
    signing: 0,             // signing fees paid, lifetime
    spentRefresh: 0,
    arrears: 0,             // total unpaid across the fleet, live
    quits: 0,               // drivers who walked over arrears
    released: 0,
    jobs: 0,                // deliveries the fleet has made
    t: 0,                   // seconds the company has existed, for the per-minute readouts
    // §S2-J — the shady branch. `shadyGross` is a SECOND ledger and is deliberately not folded into
    // `gross`: the charter ladder counts what you hauled on the books, and that is the whole cost
    // of running off them. `exposure` is the file the patrol keeps on this charter.
    // `shady` is the DOOR, not a preference: it goes true when the player opens the branch (either
    // act-one ending can reach it — see `js/story.js`) and it is set on every charter they hold,
    // because the contact is a relationship with the player and not with a registration number.
    shady: false,
    playerOffBook: false,   // the player's OWN deliveries run off the books through this charter
    exposure: 0, exposurePeak: 0, suspendUntil: 0, suspensions: 0,
    shadyGross: 0,          // what the runs paid, lifetime — the SMOKE → THE HOUSE axis
    shadyBonus: 0,          // the part of that which is the multiplier rather than the parcel
    shadyJobs: 0,           // runs attempted, including busted ones — the bust roll's ordinal
    busts: 0, fines: 0,
    lostLegit: 0,           // credits legit deliveries did NOT pay because of exposure. See the books.
    ...over,
  };
}

// ── §S2-J — the GROUP: owning more than one charter ────────────────────────
//
// Aaron: *"at some point it won't be just a single company - you may own multiple, so the layout
// for all these things will have to look good."*
//
// The layout answer is in `js/companyui.js` and it is one rule: **one screen that lists n charters
// beats n screens.** The state answer is here. A group is an ordered list plus which one the
// screens are currently showing; every company in it is exactly the object above, with its own
// ladder, its own cap, its own books and — the part that matters — **its own exposure**.
//
// GROUP_MAX is 3 because founding is priced to make the third one an event, and GROUP_LIVE is the
// real ceiling: six drivers in the sky is six `Flight.update`s and six `aabbsNear` queries a frame.
// S2-I measured four at +0.025 ms against a 1.304 ms within-arm spread, so six is the same
// statement with a margin on it — but it is a ceiling that exists, not one that was assumed away.
export const GROUP_MAX = 3;
export const GROUP_LIVE = 6;
// The first charter is priced at roughly two five-minute hire blocks — reachable in act two
// without a grind. Each one after that costs 2.4x the last, which is what stops a player founding
// three shells the minute the branch opens.
export const FOUND = { BASE: 3000, STEP: 2.4 };

export function foundFee(group) {
  const n = group ? group.companies.length : 0;
  return E.round5(FOUND.BASE * Math.pow(FOUND.STEP, n));
}

const CO_WORDS_A = ['MERIDIAN', 'SOOTLINE', 'HALLOW', 'VANE', 'TALLOW', 'QUAY', 'LANTERN',
  'RIVET', 'DRAY', 'NINEBAR', 'ASHFORD', 'BELLWEATHER'];
const CO_WORDS_B = ['HAULAGE', 'FREIGHT', 'CARRIERS', 'LOGISTICS', 'TRANSIT', 'CARTAGE',
  'DELIVERIES', 'LINES'];

// An auto-name, OFFERED and not imposed — the same rule S2-E's intro applies to the player's own
// name. Seeded off the group so pressing the key twice does not walk a list.
export function suggestName(group) {
  const n = group ? group.companies.length : 0;
  const s = group ? group.seed | 0 : 0;
  const a = CO_WORDS_A[hashi(n * 13 + 1, s, 0x9a1) % CO_WORDS_A.length];
  const b = CO_WORDS_B[hashi(n * 17 + 3, s, 0x9b2) % CO_WORDS_B.length];
  return `${a} ${b}`;
}

export function newGroup(over = {}) {
  return { seed: 0x4e454f4e, active: 0, companies: [], founded: 0,
    // the door, at the group level — a charter founded after it opens inherits it
    shady: false, shadyAt: 0, ...over };
}

export const activeCompany = g => (g && g.companies[g.active]) || null;
export const companyCount = g => (g ? g.companies.length : 0);
export const liveDrivers = g => (g ? g.companies.reduce((s, c) => s + c.drivers.length, 0) : 0);
export const groupGross = g => (g ? g.companies.reduce((s, c) => s + (c.gross || 0), 0) : 0);
export const groupShady = g => (g ? g.companies.reduce((s, c) => s + (c.shadyGross || 0), 0) : 0);
export const groupHeat = g => (g && g.companies.length
  ? Math.max(...g.companies.map(c => c.exposure || 0)) : 0);

// Found a charter. Mutates BOTH states for the same reason `hire()` does: it is a purchase and a
// registry change and the two cannot half-happen. Refusal is the `{ok:false, why}` shape every
// other transaction in this game uses, so the panel's refusal path is a greyed key with its reason
// on it and never an alert().
export function foundCompany(group, econ, name, now = 0) {
  if (!group || !econ) return { ok: false, why: 'nostate' };
  if (group.companies.length >= GROUP_MAX) return { ok: false, why: 'max', max: GROUP_MAX };
  const fee = foundFee(group);
  if (econ.credits < fee) return { ok: false, why: 'credits', short: fee - econ.credits };
  const clean = String(name || '').trim().slice(0, 22).toUpperCase() || suggestName(group);
  if (group.companies.some(c => c.name === clean)) return { ok: false, why: 'name' };
  E.spend(econ, fee);
  const co = newCompany({
    // Each charter gets its OWN seed, so two companies do not draw the same agency list and do not
    // share a bust sequence. Derived from the group seed so a save round-trips exactly.
    seed: hashi(group.companies.length + 1, group.seed | 0, 0x0c0),
    id: `co${group.companies.length + 1}`,
    name: clean, founded: now, fee,
    shady: !!group.shady,
  });
  group.companies.push(co);
  group.active = group.companies.length - 1;
  group.founded = (group.founded | 0) + 1;
  return { ok: true, company: co, fee, name: clean };
}

// Dissolving is deliberately NOT here. A charter with a file on it is a consequence, and letting
// the player delete the consequence for a fee would turn exposure into a toll. The shell strategy is
// meant to cost a FOUNDING fee and a driver cap, not a bin.

export function newDriver({ id, name, grade, craft, now = 0 }) {
  return {
    id, name, grade: grade | 0, craft,
    hiredAt: now,
    // Everything the earnings screen adds up. All of it is accumulated from real deliveries and
    // real charges; nothing here is a projection.
    gross: 0, fuel: 0, wages: 0, jobs: 0, arrears: 0,
    t: 0,
    // §S2-J. Whether this driver's next delivery goes on the books. It is a per-driver switch and
    // not a company mode, because "one of the four is running for them" is the interesting shape:
    // the exposure lands on the charter and therefore on the other three.
    offBook: false,
    shadyGross: 0, shadyJobs: 0, busts: 0,
    // Set by fleet.js each frame so the roster can say what they are doing without the panel
    // reaching into the live half.
    status: 'idle', leg: 'idle', dest: null, held: 0,
  };
}

export function driverCount(co) { return co ? co.drivers.length : 0; }
export function findDriver(co, id) { return co ? co.drivers.find(d => d.id === id) || null : null; }

// Hire. Mutates BOTH states, because a hire is a purchase and a roster change and the two cannot
// half-happen. Returns `{ok:false, why, ...}` in the same shape economy.js uses so the panel's
// refusal path is the existing greyed row with its reason on it and never an alert().
export function hire(co, econ, cand, craftId, now = 0, group = null) {
  if (!cand) return { ok: false, why: 'nobody' };
  if (!E.CRAFT[craftId]) return { ok: false, why: 'unknown' };
  if (co.drivers.length >= driverCap(co)) return { ok: false, why: 'cap', cap: driverCap(co) };
  // §S2-J. Three charters at four drivers each would be twelve craft in the sky; GROUP_LIVE is the
  // frame-cost ceiling and it is enforced through the same transaction a player uses, not in the
  // wiring, so a gate that hires through the hook meets it too. `group` is optional and a caller
  // without one behaves exactly as S2-I did.
  if (group && liveDrivers(group) >= GROUP_LIVE) {
    return { ok: false, why: 'fleetcap', cap: GROUP_LIVE };
  }
  if (co.drivers.some(d => d.id === cand.id)) return { ok: false, why: 'hired' };
  const fee = signingFee(cand.grade, craftId);
  if (econ.credits < fee) return { ok: false, why: 'credits', short: fee - econ.credits };
  E.spend(econ, fee);
  co.signing += fee;
  const d = newDriver({ id: cand.id, name: cand.name, grade: cand.grade, craft: craftId, now });
  co.drivers.push(d);
  return { ok: true, driver: d, fee, wage: wageOf(d) };
}

// Release. No refund, by design — see SIGNING_MINUTES. `why` distinguishes the player's decision
// from the driver's, because the earnings screen counts them differently and a player who was
// walked out on should be told so.
export function release(co, id, why = 'released') {
  const i = co.drivers.findIndex(d => d.id === id);
  if (i < 0) return { ok: false, why: 'nobody' };
  const [d] = co.drivers.splice(i, 1);
  if (why === 'quit') co.quits++; else co.released++;
  co.arrears = co.drivers.reduce((s, x) => s + x.arrears, 0);
  return { ok: true, driver: d, why };
}

// ── the money, per tick ────────────────────────────────────────────────────
//
// Wages come out of `credits` every frame, not on a timer: a payroll that fires once a minute can
// be dodged by spending in the gap, and the whole point of "paid automatically" is that it cannot.
// The shortfall becomes arrears; a driver owed more than ARREARS_MINUTES walks.
//
// Returns what happened, and speaks about none of it — main.js owns every surface.
export function payWages(co, econ, dt, now = 0) {
  const out = { paid: 0, owed: 0, quit: [] };
  if (!co || !econ || dt <= 0) return out;
  co.t += dt;
  // §S2-J. The company's ONE per-tick entry point, so the exposure file and the suspension clock cannot
  // drift onto a second timer. At exposure 0 this is a multiply by `exp(-dt/900)` on a zero and does
  // nothing at all, which is why every S2-I measurement through this function still holds.
  exposureTick(co, dt, now);
  for (const d of co.drivers.slice()) {
    d.t += dt;
    const w = wageOf(d, co);
    const due = (w.total / 60) * dt;
    const canPay = Math.min(due, Math.max(0, econ.credits));
    if (canPay > 0) {
      econ.credits -= canPay;
      d.wages += canPay;
      co.wages += canPay;
      // Split at the QUOTED ratio. When the account covers the whole payment this is exact; when
      // it does not, both lines are short by the same fraction, which is the only split that keeps
      // `wagesBase + wagesLease === wages` while the shortfall is still owed.
      const f = w.total > 0 ? w.base / w.total : 1;
      co.wagesBase += canPay * f;
      co.wagesLease += canPay * (1 - f);
      out.paid += canPay;
    }
    const short = due - canPay;
    if (short > 0) {
      d.arrears += short;
      out.owed += short;
      if (d.arrears >= arrearsLimit(d, co)) {
        release(co, d.id, 'quit');
        out.quit.push(d);
      }
    } else if (d.arrears > 0) {
      // Back pay comes out of the same purse and clears the debt before it clears the driver.
      const back = Math.min(d.arrears, Math.max(0, econ.credits));
      econ.credits -= back;
      d.arrears -= back;
      d.wages += back;
      co.wages += back;
      const fb = w.total > 0 ? w.base / w.total : 1;
      co.wagesBase += back * fb;
      co.wagesLease += back * (1 - fb);
      out.paid += back;
    }
  }
  co.arrears = co.drivers.reduce((s, d) => s + d.arrears, 0);
  return out;
}

// A driver delivered. The credits land in the player's account and in the fleet ledger, and
// **NOT in `economy.lifetime`** — `js/ranks.js` says in as many words that the licence ladder
// counts what YOU have hauled. A player who could idle their way to HAULMASTER on somebody else's
// flying would make that ladder mean nothing, which is exactly why the company gets its own axis
// and its own two rungs at the top of the licence.
// §S2-J made it the place a RUN resolves as well, because a run is a delivery — the same class,
// the same board, the same `economy.payout`, with a multiplier and a consequence. Nothing here
// invents a job. `out` names every term so the toast, the roster and the sweep read one answer.
export function creditDelivery(co, econ, driver, credits, jobs = 1, now = 0) {
  const raw = Math.max(0, Math.round(credits));
  const off = !!(driver && driver.offBook) && branchOpen(co) && !suspended(co, now);
  const mul = payMultiplier(co, now, off);

  if (off) {
    co.shadyJobs++;
    if (driver) driver.shadyJobs = (driver.shadyJobs | 0) + 1;
    // The bust is rolled on the ordinal AFTER the increment, so the first run of a charter is roll
    // 1 and a gate can name which run it is asserting about.
    const busted = bustRoll(co);
    // Exposure lands whether or not the run paid — being caught is not what puts you on the list.
    co.exposure = clamp01((co.exposure || 0) + EXPOSURE.PER_RUN + (busted ? EXPOSURE.BUST_ADD : 0));
    co.exposurePeak = Math.max(co.exposurePeak || 0, co.exposure);
    if (busted) {
      const fine = Math.round(raw * EXPOSURE.FINE_MULT);
      // `econ.credits` carries a fraction — `payWages` bills per frame — so the amount actually
      // taken is fractional and the amount REPORTED must not be: a toast reading "−72.167474999"
      // is a number nobody meant to print. The deduction is exact and the report is rounded, the
      // same split `crd()` makes everywhere else.
      const paid = Math.min(fine, Math.max(0, econ.credits));
      econ.credits -= paid;
      co.fines += paid;
      co.busts++;
      if (driver) driver.busts = (driver.busts | 0) + 1;
      const sus = co.exposure >= 1 ? _suspend(co, now) : 0;
      return { credits: 0, raw, mul: 0, offBook: true, busted: true, fine: Math.round(paid), suspended: sus,
        exposure: +co.exposure.toFixed(4) };
    }
    const n = Math.round(raw * EXPOSURE.PAY);
    econ.credits += n;
    // NOT `co.gross`. The charter ladder counts what you hauled on the books, and that is the whole
    // cost of running off them — see the branch header.
    co.shadyGross += n;
    co.shadyBonus += n - raw;
    co.jobs += jobs;
    if (driver) { driver.shadyGross = (driver.shadyGross | 0) + n; driver.jobs += jobs; }
    const sus = co.exposure >= 1 ? _suspend(co, now) : 0;
    return { credits: n, raw, mul: EXPOSURE.PAY, offBook: true, busted: false, fine: 0, suspended: sus,
      exposure: +co.exposure.toFixed(4) };
  }

  const n = Math.round(raw * mul);
  econ.credits += n;
  co.gross += n;
  co.jobs += jobs;
  // What exposure cost this delivery, banked as its own line so the earnings screen can print the
  // consequence rather than quietly paying less. A cost the player cannot see is not a trade-off.
  co.lostLegit += raw - n;
  if (driver) { driver.gross += n; driver.jobs += jobs; }
  return { credits: n, raw, mul: +mul.toFixed(4), offBook: false, busted: false, fine: 0,
    suspended: 0, exposure: +(co.exposure || 0).toFixed(4) };
}

function _suspend(co, now) {
  co.suspendUntil = now + EXPOSURE.SUSPEND_S;
  co.suspensions = (co.suspensions | 0) + 1;
  return EXPOSURE.SUSPEND_S;
}

// The PLAYER's own off-book work. Aaron's shady branch is a business, not a driver perk, and a
// player who reaches act two with no money to hire anybody must still be able to take a dodgy
// trade — otherwise the whole side of the game is gated behind the other one.
//
// The parcel has ALREADY been paid at the on-book rate by `economy.earn()`, which is the licence
// ladder's axis and must stay exactly what it was: running off the books does not make you a better
// courier. So this settles the DIFFERENCE — the bonus on a clean run, the claw-back and the fine on
// a busted one — and it is the only asymmetry between a player run and a driver run.
export function playerRun(co, econ, credits, now = 0) {
  if (!co || !econ) return null;
  if (!branchOpen(co) || !co.playerOffBook) return null;
  if (suspended(co, now)) return null;
  const raw = Math.max(0, Math.round(credits));
  co.shadyJobs++;
  const busted = bustRoll(co);
  co.exposure = clamp01((co.exposure || 0) + EXPOSURE.PER_RUN + (busted ? EXPOSURE.BUST_ADD : 0));
  co.exposurePeak = Math.max(co.exposurePeak || 0, co.exposure);
  if (busted) {
    // Seized at the pad: the payout goes back and a fine on top. `spend()` refuses to overdraw, so
    // a player with nothing loses nothing they do not have — there is no fail state (DECISIONS 6).
    const want = raw + Math.round(raw * EXPOSURE.FINE_MULT);
    const paid = Math.min(want, Math.max(0, econ.credits));
    econ.credits -= paid;
    co.fines += paid;
    co.busts++;
    const sus = co.exposure >= 1 ? _suspend(co, now) : 0;
    return { bonus: -Math.round(paid), raw, busted: true, fine: Math.round(paid), suspended: sus,
      exposure: +co.exposure.toFixed(4) };
  }
  const bonus = Math.round(raw * (EXPOSURE.PAY - 1));
  econ.credits += bonus;
  co.shadyGross += raw + bonus;
  co.shadyBonus += bonus;
  const sus = co.exposure >= 1 ? _suspend(co, now) : 0;
  return { bonus, raw, busted: false, fine: 0, suspended: sus, exposure: +co.exposure.toFixed(4) };
}

// A driver bought charge. It comes out of the same account the wages do, so the earnings screen
// can show it as its own line rather than folding it into the wage and making the sum unreadable.
export function chargeDriver(co, econ, driver, cost) {
  const n = Math.max(0, Math.round(cost));
  const paid = Math.min(n, Math.max(0, econ.credits));
  econ.credits -= paid;
  co.fuel += paid;
  driver.fuel += paid;
  return paid;
}

// ── the arithmetic the earnings screen SHOWS ───────────────────────────────
//
// Aaron's screens have to explain the business, so this returns every term and never a single
// "profit" number with the workings hidden. Rates are per MINUTE because that is the unit the
// wage is quoted in — mixing per-second wages with per-minute earnings is how a player concludes
// the panel is lying.
export function driverLedger(d, co = null) {
  const w = wageOf(d, co);
  const mins = Math.max(1 / 60, d.t / 60);
  // §S2-J. `d.gross` is on-book and `d.shadyGross` is off it, and NET is both minus everything —
  // a driver who has been running is earning real credits and the roster must show them, even
  // though only one of the two columns moves the charter ladder.
  const shady = d.shadyGross | 0;
  const net = d.gross + shady - d.fuel - d.wages;
  return {
    id: d.id, name: d.name, grade: d.grade, gradeName: gradeOf(d.grade).name, craft: d.craft,
    minutes: +mins.toFixed(2),
    gross: Math.round(d.gross), fuel: Math.round(d.fuel), wages: Math.round(d.wages),
    arrears: Math.round(d.arrears), jobs: d.jobs,
    net: Math.round(net),
    grossPerMin: Math.round((d.gross + shady) / mins),
    wagePerMin: w.total, base: w.base, lease: w.lease,
    fuelPerMin: Math.round(d.fuel / mins),
    netPerMin: Math.round(net / mins),
    // The one number that decides whether this hire was a mistake, and its sign is the whole point.
    profitable: net > 0,
    status: d.status, leg: d.leg, dest: d.dest, held: d.held,
    cruise: CRAFT_SPEED[d.craft] || CRAFT_SPEED.wisp,
    offBook: !!d.offBook, shadyGross: shady, shadyJobs: d.shadyJobs | 0, busts: d.busts | 0,
  };
}

export function ledger(co, now = 0) {
  const rows = co.drivers.map(d => driverLedger(d, co));
  const mins = Math.max(1 / 60, co.t / 60);
  const shadyGross = Math.round(co.shadyGross || 0);
  const fines = Math.round(co.fines || 0);
  const founding = Math.round(co.fee || 0);
  const outgoings = co.wages + co.fuel + co.signing + (co.spentRefresh || 0) + fines + founding;
  const net = co.gross + shadyGross - outgoings;
  const tier = companyTier(co.gross);
  const nx = nextCompanyTier(co.gross);
  const exposure = +(co.exposure || 0).toFixed(4);
  const susFor = suspendedFor(co, now);
  return {
    drivers: rows,
    id: co.id, name: co.name || '', founded: co.founded || 0, fee: founding,
    count: rows.length, cap: driverCap(co),
    minutes: +mins.toFixed(2),
    gross: Math.round(co.gross), wages: Math.round(co.wages), fuel: Math.round(co.fuel),
    wagesBase: Math.round(co.wagesBase || 0), wagesLease: Math.round(co.wagesLease || 0),
    signing: Math.round(co.signing), refresh: Math.round(co.spentRefresh || 0),
    outgoings: Math.round(outgoings),
    net: Math.round(net),
    grossPerMin: Math.round((co.gross + shadyGross) / mins),
    wagePerMin: rows.reduce((s, r) => s + r.wagePerMin, 0),
    netPerMin: Math.round(net / mins),
    arrears: Math.round(co.arrears), quits: co.quits, released: co.released, jobs: co.jobs,
    tier, next: nx ? { ...nx, need: nx.gross - co.gross } : null,
    // 0..1 through the current company tier, for the meter on the rail.
    frac: nx ? clamp01((co.gross - tier.gross) / Math.max(1, nx.gross - tier.gross)) : 1,
    // ── §S2-J — the other side of the books ──────────────────────────────
    // Every one of these is a COST of running off the books, and each is its own line on the
    // screen for the reason the earnings tab exists: show the arithmetic, not the total.
    shady: {
      open: branchOpen(co),
      playerOffBook: !!co.playerOffBook,
      gross: shadyGross, bonus: Math.round(co.shadyBonus || 0),
      jobs: co.shadyJobs | 0, busts: co.busts | 0, fines,
      lostLegit: Math.round(co.lostLegit || 0),
      running: rows.filter(r => r.offBook).length,
      exposure, band: exposureBand(exposure), peak: +(co.exposurePeak || 0).toFixed(4),
      bust: +bustChance(co).toFixed(4),
      legitMul: +legitMult(co).toFixed(4),
      wageMul: +wageExposure(co).toFixed(4),
      payMul: +payMultiplier(co, now, true).toFixed(4),
      suspended: susFor > 0, suspendFor: Math.round(susFor), suspensions: co.suspensions | 0,
      // The one number that says whether the branch is currently worth it: what a run pays after
      // the bust risk, against what the same parcel pays on the books right now.
      edge: +(((1 - bustChance(co)) * EXPOSURE.PAY - bustChance(co) * EXPOSURE.FINE_MULT)
        / Math.max(0.0001, legitMult(co))).toFixed(3),
    },
  };
}

// ── §S2-J — the GROUP ledger: ONE layout for n charters ────────────────────
//
// Aaron's *"the layout for all these things will have to look good"* has a design answer that is
// mostly a state answer: a screen that lists n companies never has to be redesigned when n changes,
// and n screens do. So this returns one row per charter in exactly the shape the chip strip and the
// group summary read, plus the totals — and `js/companyui.js` renders a list, not a case analysis.
export function groupLedger(group, now = 0) {
  const g = group || newGroup();
  const rows = g.companies.map((c, i) => {
    const L = ledger(c, now);
    return { i, id: c.id, name: c.name || `CHARTER ${i + 1}`, active: i === g.active,
      tier: L.tier, count: L.count, cap: L.cap, gross: L.gross, net: L.net,
      netPerMin: L.netPerMin, exposure: L.shady.exposure, band: L.shady.band,
      suspended: L.shady.suspended, suspendFor: L.shady.suspendFor,
      shadyGross: L.shady.gross, running: L.shady.running, drivers: L.count };
  });
  return {
    rows, count: rows.length, max: GROUP_MAX, active: g.active,
    live: liveDrivers(g), liveCap: GROUP_LIVE,
    gross: groupGross(g), shadyGross: groupShady(g),
    net: rows.reduce((s, r) => s + r.net, 0),
    exposure: +groupHeat(g).toFixed(4),
    fee: foundFee(g), open: !!g.shady,
    // A charter that is suspended is the one thing a player must never have to hunt for on a chip.
    anySuspended: rows.some(r => r.suspended),
  };
}

const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : +v.toFixed(4));

// ── save round-trip ────────────────────────────────────────────────────────
// Explicitly listed for the same reason `economy.toSave` is: a spread of the live object would
// persist whatever `fleet.js` happens to hang on a driver this frame.

export function toSave(co, now = 0) {
  if (!co) return null;
  return {
    seed: co.seed | 0, gen: co.gen | 0,
    id: co.id, name: co.name || '', founded: +(co.founded || 0).toFixed(1), fee: co.fee | 0,
    gross: Math.round(co.gross), wages: Math.round(co.wages), fuel: Math.round(co.fuel),
    wagesBase: Math.round(co.wagesBase || 0), wagesLease: Math.round(co.wagesLease || 0),
    signing: Math.round(co.signing), spentRefresh: Math.round(co.spentRefresh || 0),
    quits: co.quits | 0, released: co.released | 0, jobs: co.jobs | 0,
    t: +co.t.toFixed(1),
    // §S2-J. `suspendUntil` is an ABSOLUTE sim time and sim time restarts at zero on the next load,
    // so persisting it would hand the player either an expired suspension or an eternal one — the
    // same trap `story.toSave` records for the hire clock, and the same fix: persist what is LEFT.
    shady: !!co.shady, playerOffBook: !!co.playerOffBook,
    exposure: +(co.exposure || 0).toFixed(4), exposurePeak: +(co.exposurePeak || 0).toFixed(4),
    suspendLeft: Math.round(suspendedFor(co, now)), suspensions: co.suspensions | 0,
    shadyGross: Math.round(co.shadyGross || 0), shadyBonus: Math.round(co.shadyBonus || 0),
    shadyJobs: co.shadyJobs | 0, busts: co.busts | 0, fines: Math.round(co.fines || 0),
    lostLegit: Math.round(co.lostLegit || 0),
    drivers: co.drivers.map(d => ({
      id: d.id, name: d.name, grade: d.grade | 0, craft: d.craft,
      gross: Math.round(d.gross), fuel: Math.round(d.fuel), wages: Math.round(d.wages),
      arrears: Math.round(d.arrears), jobs: d.jobs | 0, t: +d.t.toFixed(1),
      offBook: !!d.offBook, shadyGross: Math.round(d.shadyGross || 0),
      shadyJobs: d.shadyJobs | 0, busts: d.busts | 0,
    })),
  };
}

export function fromSave(profile, now = 0) {
  const co = newCompany();
  const p = profile || {};
  for (const k of ['seed', 'gen', 'gross', 'wages', 'wagesBase', 'wagesLease', 'fuel', 'signing',
    'spentRefresh', 'quits', 'released', 'jobs', 't',
    'exposure', 'exposurePeak', 'suspensions', 'shadyGross', 'shadyBonus', 'shadyJobs', 'busts', 'fines',
    'lostLegit', 'founded', 'fee']) {
    if (typeof p[k] === 'number' && Number.isFinite(p[k])) co[k] = p[k];
  }
  if (typeof p.id === 'string') co.id = p.id;
  if (typeof p.name === 'string') co.name = p.name;
  co.shady = !!p.shady;
  co.playerOffBook = !!p.playerOffBook;
  co.suspendUntil = p.suspendLeft > 0 ? now + p.suspendLeft : 0;
  if (Array.isArray(p.drivers)) {
    for (const d of p.drivers) {
      if (!d || !d.id || !E.CRAFT[d.craft]) continue;      // a hull that no longer exists drops
      const nd = newDriver({ id: d.id, name: d.name || 'DRIVER', grade: d.grade, craft: d.craft });
      for (const k of ['gross', 'fuel', 'wages', 'arrears', 'jobs', 't',
        'shadyGross', 'shadyJobs', 'busts']) {
        if (typeof d[k] === 'number' && Number.isFinite(d[k])) nd[k] = d[k];
      }
      nd.offBook = !!d.offBook;
      co.drivers.push(nd);
    }
    // A cap that shrank (it cannot, gross never falls) or a hand-edited profile must not put six
    // drivers on a one-driver licence.
    co.drivers.length = Math.min(co.drivers.length, driverCap(co));
  }
  co.arrears = co.drivers.reduce((s, d) => s + d.arrears, 0);
  return co;
}

// The GROUP's save. `v` is present so a v1 profile — one company, written flat, by every build
// before this phase — is recognised by its ABSENCE and wrapped rather than dropped. A player who
// has a fleet in a S2-I save keeps it, as an unnamed founding charter; `name` empty is what
// `js/main.js` reads to decide whether the FOUND screen has already been through.
export function groupToSave(group, now = 0) {
  if (!group) return null;
  return { v: 2, seed: group.seed | 0, active: group.active | 0, founded: group.founded | 0,
    shady: !!group.shady, shadyAt: +(group.shadyAt || 0).toFixed(1),
    companies: group.companies.map(c => toSave(c, now)) };
}

export function groupFromSave(profile, now = 0) {
  const g = newGroup();
  const p = profile || null;
  if (!p) return g;
  if (p.v !== 2) {
    // v1: the profile IS a single company. It becomes charter one, unnamed — see above.
    const co = fromSave(p, now);
    if (co.drivers.length || co.gross > 0 || co.t > 0) g.companies.push(co);
    return g;
  }
  if (typeof p.seed === 'number' && Number.isFinite(p.seed)) g.seed = p.seed;
  g.founded = p.founded | 0;
  g.shady = !!p.shady;
  g.shadyAt = +p.shadyAt || 0;
  if (Array.isArray(p.companies)) {
    for (const c of p.companies.slice(0, GROUP_MAX)) g.companies.push(fromSave(c, now));
  }
  g.active = Math.max(0, Math.min(g.companies.length - 1, p.active | 0));
  return g;
}
