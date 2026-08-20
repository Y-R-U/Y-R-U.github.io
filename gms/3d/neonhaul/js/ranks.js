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
// `LANE MARSHAL` and `SPIRE HAULIER` are tiers 7 and 8. S2-D shipped them with NO threshold and
// `opens: 'company'`, because the brief puts them behind the company layer and a number invented
// then would have been a number this phase had to fight.
//
// **§S2-I is that phase, and it gives them one — but NOT a `lifetime`.** They open on FLEET
// LIFETIME GROSS, which is `js/company.js`'s COMPANY_TIERS, for the reason `creditDelivery` states:
// a driver's earnings are deliberately kept out of `economy.lifetime`, so a player who could idle
// their way to HAULMASTER on somebody else's flying would make the licence ladder mean nothing.
// The top two rungs are what a FLEET has hauled, which is a different sentence about the same
// person and is why there are two rungs rather than a raised threshold on the sixth.
//
// `lifetime` therefore stays `null` on both rows and `courierRank(tier)` with ONE argument still
// cannot return them — `gates_s2d` A1 asserts `courierRank(99) === 'HAULMASTER'` and that assertion
// is still true and still worth having. The company rungs are reached through the second argument,
// which only a caller holding a company can supply.

import * as E from './economy.js';
import { byId } from './districts.js';
import { COMPANY_TIERS, companyTier } from './company.js';

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
})).concat(LICENCE_RESERVED.map((name, i) => {
  // The company tier that opens this rung, found by NAME rather than by index — COMPANY_TIERS is
  // company.js's table and its `opens` field is the only thing that says which rung it unlocks. A
  // positional lookup here would silently re-point both rungs the day a tier is inserted.
  const row = COMPANY_TIERS.find(t => t.opens === name) || null;
  return {
    tier: E.LADDER.length + i + 1,
    name,
    lifetime: null,                       // still no LIFETIME threshold — see the header
    fleet: row ? row.gross : null,        // …a FLEET GROSS one instead
    companyTier: row ? row.tier : null,
    blurb: row ? `${row.name} — ${row.blurb}` : 'opens with your own company',
    opens: 'company',
  };
}));

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
//   marked        §S2-J. The patrol has opened a file on a charter you hold — `company.exposure` crossed
//                 EXPOSURE.FLAG at least once. It is the only STANDING cost of running off the books,
//                 and it is here rather than in company.js because standing is what the CITY thinks
//                 of you and a charter under inspection is exactly that. It does not clear when the
//                 exposure does: the file is the record, not the temperature.
export const STANDING_FLAGS = {
  debt_cleared: 1,
  dad_favour: 1,
  car_seized: -1,
  crew_hook: 0,
  marked: -1,
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
// paid-off one. The NAMES are Aaron's, verbatim and in order; `SHADY_RANKS` is kept as the plain
// string list because `js/ui.js`'s sealed strip renders it and a surface that only wants the names
// should not have to know about thresholds.
export const SHADY_RANKS = ['SMOKE', 'EARNER', 'FIXER', 'BROKER', 'QUIET PARTNER', 'THE HOUSE'];

// §S2-J gives them an axis: OFF-BOOK GROSS across every charter the player holds
// (`company.groupShady`). Not `company.gross`, which is the legit charter ladder, and not
// `economy.lifetime`, which is the licence — three ladders, three quantities, and the whole point
// of the shady branch is that climbing this one does not climb the others.
//
// It is a GROUP quantity and not a per-charter one because the contact is a relationship with the
// PERSON. Running the work through a shell keeps the exposure off your legit charter; it does not make
// you a stranger to the people paying you.
//
// SWEPT, NOT PICKED — `node tools/sim_s2j.mjs`, committed at `docs/s2j_balance.json`. The rungs are
// set against how long a fleet running its viable off-book share takes to reach the next one, so
// each is roughly an hour of play past the last rather than a number that looked round.
export const SHADY_TIERS = [
  { rung: 1, name: 'SMOKE',         at: 0,      blurb: 'a face at a pad, no name on anything' },
  { rung: 2, name: 'EARNER',        at: 12000,  blurb: 'they call you when something has to move quietly' },
  { rung: 3, name: 'FIXER',         at: 45000,  blurb: 'you are the one who knows who to ask' },
  { rung: 4, name: 'BROKER',        at: 120000, blurb: 'other people’s runs go through your desk' },
  { rung: 5, name: 'QUIET PARTNER', at: 280000, blurb: 'a share of something you are never seen at' },
  { rung: 6, name: 'THE HOUSE',     at: 600000, blurb: 'the room takes its cut before anyone is paid' },
];

export function shadyRank(shadyGross) {
  let row = SHADY_TIERS[0];
  for (const r of SHADY_TIERS) if ((shadyGross || 0) >= r.at) row = r;
  return row;
}

// Everything a shady surface needs, in the same shape `rankState` returns for the other two, so the
// ladder renderer in `js/companyui.js` is the ladder renderer and not a third one.
export function shadyState(shadyGross, open = false) {
  const at = Math.max(0, Math.round(shadyGross || 0));
  const here = shadyRank(at);
  const next = SHADY_TIERS.find(r => r.rung > here.rung && at < r.at) || null;
  // `...here` comes FIRST and `at` after it. The other way round, the rung's own threshold — which
  // is also called `at` — overwrites the player's total, so a screen captioned
  // "45 000 CRD OFF THE BOOKS" would be printing the rung it had just reached rather than what the
  // player has actually earned. `gates_s2j` A5 caught exactly that.
  return {
    ...here, open: !!open, axis: 'shady', at,
    next: next ? { ...next, need: next.at - at } : null,
    frac: next ? clamp01((at - here.at) / Math.max(1, next.at - here.at)) : 1,
  };
}

// ── the two lookups ────────────────────────────────────────────────────────

// The licence rung for a tier. Never returns a reserved name: `opens` rungs have no threshold and
// cannot be reached until the company layer gives them one.
export function courierRank(tier, company = null) {
  const t = Math.max(1, Math.min(E.LADDER.length, tier | 0));
  const base = COURIER_RANKS[t - 1];
  // Without a company this is byte-for-byte what it was before S2-I, which is what keeps
  // `courierRank(99) === 'HAULMASTER'` true. A reserved rung is only reachable by a caller that
  // has one, and only once its fleet has actually hauled the gross.
  if (!company || t < E.LADDER.length) return base;
  let out = base;
  for (const r of COURIER_RANKS) {
    if (r.fleet !== null && r.fleet !== undefined && (company.gross || 0) >= r.fleet) out = r;
  }
  return out;
}

// The company rung the player currently holds, for a surface that wants to show the ladder without
// re-deriving it. Returns `null` when there is no company at all, which is a different thing from
// tier 1 and reads differently on the screen.
export function companyRank(company) {
  return company ? companyTier(company.gross || 0) : null;
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
export function rankState(state, company = null) {
  const worth = netWorth(state);
  const flags = state.flags || [];
  const co = company || state.company || null;
  const lic = courierRank(state.tier, co);
  const nextLic = E.nextTier(state.lifetime);
  const st = standingRank(worth, flags);
  const nextSt = STANDING_RANKS.find(r => r.rung > st.rung && worth < r.worth) || null;
  const onCompany = lic.opens === 'company';
  // The next COMPANY tier that opens a licence rung — not simply the next company tier, because
  // LANE HOUSE and SPIRE CONTRACT open rungs and TWO-HANDED does not.
  const nextCo = co ? COMPANY_TIERS.find(t => t.opens && (co.gross || 0) < t.gross) || null : null;
  return {
    worth,
    assets: assetValue(state),
    // §S2-I. On a COMPANY rung the axis changes under the reader's feet — `at` is fleet gross and
    // the next rung is a fleet threshold — so `axis` says which one it is rather than leaving a
    // surface to guess from the size of the number.
    licence: onCompany ? { ...lic, axis: 'fleet', at: co ? Math.round(co.gross || 0) : 0,
      next: nextCo ? { name: nextCo.opens || nextCo.name, at: nextCo.gross,
        need: nextCo.gross - (co ? co.gross : 0) } : null,
      frac: nextCo ? clamp01(((co ? co.gross : 0) - lic.fleet) / Math.max(1, nextCo.gross - lic.fleet)) : 1 }
      : { ...lic, axis: 'lifetime', at: state.lifetime,
        next: nextLic ? { ...courierRank(nextLic.tier), need: nextLic.lifetime - state.lifetime } : null,
        // 0..1 through the CURRENT rung. The top rung is full, not zero.
        frac: nextLic ? clamp01((state.lifetime - lic.lifetime) / Math.max(1, nextLic.lifetime - lic.lifetime)) : 1 },
    standing: { ...st, at: worth, bump: flagSteps(flags),
      next: nextSt ? { ...nextSt, need: nextSt.worth - worth } : null,
      frac: nextSt ? clamp01((worth - st.worth) / Math.max(1, nextSt.worth - st.worth)) : 1 },
  };
}

const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : +v.toFixed(4));
