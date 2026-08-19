// §S2-D — the two rank ladders.
//
// PURE, like economy.js and for the same reason: no three.js, no DOM, no clock. Everything takes
// an economy state in and returns a plain object, so `tools/sim_s2d.mjs` can run ten thousand
// careers through it in node and the thresholds below are measured rather than picked.
//
// ── why there are two of them ───────────────────────────────────────────────
//
// Aaron's design note: *"a HAULMASTER who is still a TENANT is a story, and so is the reverse."*
// That only happens if the two axes can genuinely diverge, so they read different quantities:
//
//   LICENCE   what you have HAULED.  Lifetime GROSS credits — economy.js's `lifetime`, which
//             `earn()` increments and `spend()` never touches. It is a record of work done and it
//             cannot go down. It is also already load-bearing: `LADDER` gates parcel types,
//             districts and hulls on it. This file NAMES those six tiers; it does not invent a
//             progression system and it does not change a single threshold.
//
//   STANDING  what you are WORTH.  Liquid credits plus what your hull and its fitted upgrades
//             would fetch back, at ASSET_RECOVERY. It goes DOWN when you buy — which is the whole
//             point. A pilot who ploughs every credit into a mammoth is a HAULMASTER living like a
//             TENANT; a pilot who hoards in a wisp is the reverse. If assets counted at list price
//             the two ladders would be the same number wearing two hats.
//
// Standing also reads STORY FLAGS. The mechanism is here and proven by the gates; the registry is
// deliberately EMPTY because S2-E owns the story and a flag invented here would be a flag S2-E has
// to either honour or delete. Adding one is a line in STANDING_FLAGS.
//
// ── the last two licence names ─────────────────────────────────────────────
// `LANE MARSHAL` and `SPIRE HAULIER` are tiers 7 and 8. They have NO threshold and are marked
// `opens: 'company'` — the brief puts them behind the company layer (pass 2-B), and a threshold
// invented now would be a number that phase has to fight. They are present so the surface can show
// the ladder does not stop at HAULMASTER, and `courierRank()` can never return one.

import * as E from './economy.js';
import { byId } from './districts.js';

// The six licence names, in Aaron's words. Index 0 is tier 1.
const LICENCE_NAMES = ['UNLISTED', 'RUNNER', 'BONDED COURIER', 'LANEWRIGHT', 'ROUTEMASTER', 'HAULMASTER'];
// The two that open with the company layer.
const LICENCE_RESERVED = ['LANE MARSHAL', 'SPIRE HAULIER'];

// What each rung actually buys you, DERIVED from the row rather than written out beside it. The
// district names and the parcel type both live somewhere else already, and a hand-written
// "the Vault and the Sootfields open" is a promise that goes stale the day LADDER moves — this
// project's obligation T8 in miniature.
function blurbFor(row) {
  const ds = (row.districts || []).map(id => (byId[id] ? byId[id].name : id));
  const parcel = row.parcel ? `${row.parcel} parcels` : '';
  const hull = row.craft ? `${row.craft.toUpperCase()} hull` : '';
  return [parcel, ds.join(' · '), hull].filter(Boolean).join(' — ');
}

// The licence ladder, DERIVED from economy.js's LADDER. Nothing here restates a threshold: if the
// two ever disagree the surface would be lying about when a promotion arrives, and `LADDER_SYNC`
// below is the assertion that they cannot.
export const COURIER_RANKS = E.LADDER.map((row, i) => ({
  tier: row.tier,
  name: LICENCE_NAMES[i] || `TIER ${row.tier}`,
  lifetime: row.lifetime,
  blurb: blurbFor(row),
  opens: null,
})).concat(LICENCE_RESERVED.map((name, i) => ({
  tier: E.LADDER.length + i + 1,
  name,
  lifetime: null,                       // no threshold — see the header
  blurb: 'opens with your own company',
  opens: 'company',
})));

// True only if every live tier got a name. A seventh row added to LADDER would otherwise show up
// on the board as "TIER 7" beside six named ones, which reads as a bug and is one.
export const LADDER_SYNC = E.LADDER.length === LICENCE_NAMES.length;

// ── standing ───────────────────────────────────────────────────────────────

// What a hull and its fitted upgrades fetch back. NOT 1.0 — see the header: at 1.0 net worth is
// lifetime gross minus fuel, the two ladders stop being independent, and buying the thing the
// licence just unlocked costs you nothing on the other axis. 0.55 is a haircut a player can feel
// (a 20,000 nocturne is a 9,000 hit) without making equipment a trap.
export const ASSET_RECOVERY = 0.55;

// What the hull and everything bolted to it is worth on the second-hand market. Upgrades are
// priced by economy.js as a fraction of the CURRENT hull's list, so they are re-derived here at
// the same fractions rather than remembered — a hull change reprices them exactly as `buyCraft`
// already resets them.
export function assetValue(state) {
  // A BORROWED hull is not an asset. S2-E opens the game in a hull above the player's licence tier
  // that belongs to their parents — at recovery value a `nocturne` would hand a brand-new player
  // 11,000 of net worth and boot them in at NAMEHOLDER, which is the opposite of the story. The
  // flag lives on the state so S2-E sets one field and nothing else has to know.
  if (state.borrowed) return 0;
  const list = E.craftList(state.craft);
  // `wisp` lists at 0 and `craftList` substitutes its notional 2,000 so upgrades are not free.
  // The HULL itself is still worth its real price, which for the free starter is nothing.
  const hull = (E.CRAFT[state.craft] || E.CRAFT.wisp).price || 0;
  let fitted = 0;
  for (const line of Object.keys(E.UPGRADES)) {
    const lv = (state.upgrades && state.upgrades[line]) || 0;
    for (let i = 0; i < lv; i++) fitted += E.round5(list * E.UPGRADE_FRAC[i]);
  }
  return Math.round((hull + fitted) * ASSET_RECOVERY);
}

export function netWorth(state) {
  return Math.round((state.credits || 0) + assetValue(state));
}

// Story flags that move standing, as { flag: rungs }. S2-D shipped this EMPTY and proved the
// mechanism with a fixture; S2-E owns the story and these are its four flags. Only flags that
// change what the CITY thinks of you belong here — a flag that is a plot bookmark and nothing else
// (`intro_seen`) is deliberately absent, because a registry that carries both stops meaning
// anything and every rung it hands out is then a rung somebody has to argue about.
//
//   debt_cleared  you settled a 50,000 debt with a crew nobody settles with. That is a reference.
//   dad_favour    the paid branch's concrete asset. Aaron's note: the good ending must be paid in
//                 something, not in gratitude — *"Dad owes you"*, and a name that owes you is
//                 exactly what the STANDING axis measures.
//   car_seized    a repossession on the record. It is the ONLY negative here, and it is what makes
//                 the seized branch's climb back real rather than cosmetic: you start act two a
//                 rung below where the same net worth would otherwise put you.
//   crew_hook     they have a hook in you. It is worth nothing to the legitimate city — 0 rungs —
//                 and it is present so `flagSteps` sees it and the shady ladder in pass 2-B has a
//                 flag to open on. A zero is a real answer here, not a placeholder.
export const STANDING_FLAGS = {
  debt_cleared: 1,
  dad_favour: 1,
  car_seized: -1,
  crew_hook: 0,
};

export function flagSteps(flags) {
  if (!flags) return 0;
  let n = 0;
  for (const f of flags) n += STANDING_FLAGS[f] || 0;
  return n;
}

// The ten rungs. `worth` is NET worth in credits.
//
// SWEPT, NOT PICKED — `node tools/sim_s2d.mjs`, output committed at `docs/s2d_balance.json`.
// 72 careers (hop/chain/greedy x 8 world seeds) of 90 minutes each are run through the real
// economy under THREE spending profiles that gross identically, so any spread between them is
// this axis working rather than a difference in earning:
//
//   hoard  buys nothing            fit  buys upgrades        spend  buys upgrades and every hull
//
// median NET WORTH at the mark, against the licence tier the same careers hold:
//
//     min   licence          hoard     fit    spend        standing hoard / fit / spend
//      10   BONDED COURIER    8407    6146     5864        TENANT      TENANT     TENANT
//      20   LANEWRIGHT       15919   14988     2367        CARDHOLDER  TENANT     REGISTERED
//      45   ROUTEMASTER      35274   39165     2381        NAMEHOLDER  NAMEHOLDER REGISTERED
//      90   HAULMASTER       69891   82449     2344        SHAREHOLDER SHAREHOLDER REGISTERED
//
// Two things were being solved for and both are in that table. The ladder is **slower**: 90
// minutes takes the licence to 6 of 6 and standing to 6 of 10. And the ladders genuinely
// **diverge**: the `spend` pilot ends a ninety-minute career a HAULMASTER who is still barely
// REGISTERED, which is Aaron's design note back out of the simulation rather than asserted at it.
// Rungs 7-10 are deliberately past a ninety-minute career — they belong to the company layer.
//
// Do not hand-edit one of these without re-running the sweep.
export const STANDING_RANKS = [
  { rung: 1,  name: 'NONPERSON',   worth: 0,       blurb: 'no address, no account, no record' },
  { rung: 2,  name: 'REGISTERED',  worth: 1200,    blurb: 'a name in the ledger' },
  { rung: 3,  name: 'TENANT',      worth: 5000,    blurb: 'a bunk that is yours until it is not' },
  { rung: 4,  name: 'CARDHOLDER',  worth: 15000,   blurb: 'credit, at a price' },
  { rung: 5,  name: 'NAMEHOLDER',  worth: 34000,   blurb: 'doors open on the name alone' },
  { rung: 6,  name: 'SHAREHOLDER', worth: 68000,   blurb: 'a slice of somebody else’s tower' },
  { rung: 7,  name: 'PATRON',      worth: 130000,  blurb: 'people wait on your call' },
  { rung: 8,  name: 'MAGNATE',     worth: 260000,  blurb: 'a floor of the Spine with your name on it' },
  { rung: 9,  name: 'DIRECTOR',    worth: 550000,  blurb: 'you sit on the boards that write the lanes' },
  { rung: 10, name: 'ASCENDANT',   worth: 1200000, blurb: 'above the smog, and above the law' },
];

// The shady ladder. It opens in pass 2-B — either immediately on the seized branch or later on the
// paid-off one — and is listed here so the surface can show it exists without claiming a rung.
export const SHADY_RANKS = ['SMOKE', 'EARNER', 'FIXER', 'BROKER', 'QUIET PARTNER', 'THE HOUSE'];

// ── the two lookups ────────────────────────────────────────────────────────

// The licence rung for a tier. Never returns a reserved name: `opens` rungs have no threshold and
// cannot be reached until the company layer gives them one.
export function courierRank(tier) {
  const t = Math.max(1, Math.min(E.LADDER.length, tier | 0));
  return COURIER_RANKS[t - 1];
}

export function standingRank(worth, flags) {
  const bump = flagSteps(flags);
  let i = 0;
  for (let k = 0; k < STANDING_RANKS.length; k++) if (worth >= STANDING_RANKS[k].worth) i = k;
  i = Math.max(0, Math.min(STANDING_RANKS.length - 1, i + bump));
  return STANDING_RANKS[i];
}

// Everything a rank surface needs, computed once. `flags` is the story-flag array S2-E will own;
// it is read from `state.flags` when present so nothing has to thread it through a call chain.
export function rankState(state) {
  const worth = netWorth(state);
  const flags = state.flags || [];
  const lic = courierRank(state.tier);
  const nextLic = E.nextTier(state.lifetime);
  const st = standingRank(worth, flags);
  const nextSt = STANDING_RANKS.find(r => r.rung > st.rung && worth < r.worth) || null;
  return {
    worth,
    assets: assetValue(state),
    licence: { ...lic, at: state.lifetime,
      next: nextLic ? { ...courierRank(nextLic.tier), need: nextLic.lifetime - state.lifetime } : null,
      // 0..1 through the CURRENT rung. The top rung is full, not zero.
      frac: nextLic ? clamp01((state.lifetime - lic.lifetime) / Math.max(1, nextLic.lifetime - lic.lifetime)) : 1 },
    standing: { ...st, at: worth, bump: flagSteps(flags),
      next: nextSt ? { ...nextSt, need: nextSt.worth - worth } : null,
      frac: nextSt ? clamp01((worth - st.worth) / Math.max(1, nextSt.worth - st.worth)) : 1 },
  };
}

const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : +v.toFixed(4));
