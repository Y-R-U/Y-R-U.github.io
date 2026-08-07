// newGame + clone. State is one plain serialisable object: no classes, no references into three.

import content from './content.js';

export const SAVE_VERSION = 1;

export function clone(state) {
  return typeof structuredClone === 'function'
    ? structuredClone(state)
    : JSON.parse(JSON.stringify(state));
}

export function serialise(state) {
  return JSON.stringify({ v: SAVE_VERSION, state });
}

export function deserialise(text) {
  const raw = JSON.parse(text);
  return migrate(raw.state, raw.v || 0);
}

export function migrate(state, from) {
  if (from === SAVE_VERSION) return state;
  return { ...state, _migratedFrom: from };
}

// The loan terms an origin bought. Reading them off the state rather than off content.balance is
// what lets three origins share one sim without a mutable global — and an old save with no
// `loan` on it still resolves.
export function loanOf(state) { return state?.loan || content.balance.loan; }

export function newGame(seed = 1, systemId = 'tamber', originId = null) {
  const base = content.balance;
  const origin = originId ? content.get('origin', originId) : null;
  const b = origin
    ? { ...base, start: { ...base.start, ...origin.start }, loan: { ...base.loan, ...origin.loan } }
    : base;
  const sys = content.get('system', systemId);
  if (!sys) throw new Error(`newGame: no system ${systemId}`);
  const prof = content.rival.profile;

  const ships = b.start.ships.map((classId, i) => {
    const def = content.get('ship', classId);
    if (!def) throw new Error(`newGame: no ship class ${classId}`);
    return {
      id: `${classId}-${i + 1}`, class: classId, at: 'ledger',
      leg: null, eta: 0, cargo: {}, route: null, routeIdx: 0, dwell: 0, arrived: false, laidUp: 0,
    };
  });

  const sites = {};
  for (const s of sys.sites) {
    const site = { id: s.id, kind: s.kind, owner: s.owner, stock: {} };
    if (s.kind === 'station') {
      const st = content.get('station', s.station);
      site.modules = st ? st.modules.slice() : [];
      site.hold = (site.modules || []).reduce((n, m) => n + (content.get('module', m)?.hold || 0), 0);
    }
    if (s.kind === 'belt') { site.yield = s.yield ?? 1; site.reserve = s.reserve ?? 1; site.worked = 0; }
    if (s.kind === 'market') site.buys = (s.buys || []).slice();
    sites[s.id] = site;
  }

  const market = {};
  for (const c of content.all('commodity')) {
    market[c.id] = { price: c.base, demand: c.baseDemand, supply: c.baseSupply, last: c.base };
  }

  return {
    v: SAVE_VERSION, seed, system: systemId, week: 0,
    origin: origin?.id || null,
    loan: Object.freeze({ ...b.loan }),
    startDebt: b.start.debt,
    tacticCost: Object.freeze({ ...(origin?.tacticCost || {}) }),
    tacticUnlock: Object.freeze({ ...(origin?.tacticUnlock || {}) }),
    cash: b.start.cash, debt: b.start.debt, rep: b.start.rep, heat: b.start.heat,
    ships, sites, market,
    contracts: [],
    tactics: { unlocked: [], active: [], owned: [], banned: [], offered: [] },
    rival: {
      cash: prof.cash, debt: prof.debt, ships: prof.ships, rep: prof.rep,
      mood: prof.mood, lastAction: null, cooldowns: {}, costMult: 1,
      undercutFor: 0, freightMult: 1, effects: [],
    },
    share: { player: b.start.share.player, rival: b.start.share.rival, other: b.start.share.other },
    locks: {},
    flow: {},
    // seeded with the freight the company was already doing, so week 1 does not collapse the
    // 4% the ticker just quoted
    hist: { player: new Array(b.share.window).fill(b.share.reachTotal * b.start.share.player) },
    loadOrder: content.all('commodity').slice().sort((a, c) => c.base - a.base).map(c => c.id),
    over: null,
    holdStreak: 0,
    investigateCooldown: 0,
    convictions: 0,
    shocks: [],
    shockCooldown: 0,
    lastCosts: b.costs.overheadWeekly,
    warnings: [],
    warned: {},
    log: [],
  };
}

export default { newGame, clone, serialise, deserialise, migrate, loanOf, SAVE_VERSION };
