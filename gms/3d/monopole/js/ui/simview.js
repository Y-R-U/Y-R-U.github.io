// The seam between the pure sim and the UI. Holds one state, a queue of player actions and the
// speed setting. It does NOT own a clock — component 12 drives tick() from the tick clock.
// The UI reads `view.state` and `view.log`; it never calls into js/sim/ directly.

import content from '../sim/content.js';
import { newGame, clone } from '../sim/state.js';
import { step } from '../sim/step.js';
import { createRng } from '../sim/rng.js';

export function createSimView({ seed = 1, state = null } = {}) {
  const listeners = new Set();
  const view = {
    seed,
    state: state || newGame(seed),
    events: [],
    pending: [],
    speed: 0,
    speeds: content.balance.tick.speeds,
    tickSeconds: content.balance.tick.tickSeconds,
    rng: createRng(seed),
    content,

    get log() { return view.state.log; },
    get week() { return view.state.week; },
    get over() { return view.state.over; },

    on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    emit(kind, payload) { for (const fn of [...listeners]) fn(kind, payload, view); },

    setSpeed(n) {
      if (view.speed === n) return;
      view.speed = n;
      view.emit('speed', n);
    },

    act(action) {
      if (!action || !action.type) return false;
      view.pending.push(action);
      view.emit('act', action);
      return true;
    },

    // Same-tick undo for a panel's "cancel" — the sim has not seen it yet.
    unact(pred) {
      const before = view.pending.length;
      view.pending = view.pending.filter(a => !pred(a));
      if (view.pending.length !== before) view.emit('act', null);
      return before - view.pending.length;
    },

    queued(type) { return view.pending.filter(a => !type || a.type === type); },

    tick() {
      if (view.state.over) return { state: view.state, events: [] };
      const actions = view.pending;
      view.pending = [];
      const r = step(view.state, { actions, rng: view.rng });
      view.state = r.state;
      view.events = r.events;
      view.emit('tick', r);
      return r;
    },

    reset(newSeed = view.seed) {
      view.seed = newSeed;
      view.state = newGame(newSeed);
      view.rng = createRng(newSeed);
      view.pending = [];
      view.events = [];
      view.emit('reset', view.state);
      return view.state;
    },

    load(s) {
      view.state = clone(s);
      view.pending = [];
      view.events = [];
      view.emit('reset', view.state);
      return view.state;
    },

    // Derived reads the panels want and should not each re-derive.
    site(id) { return view.state.sites[id] || null; },
    ship(id) { return view.state.ships.find(s => s.id === id) || null; },
    shipDef(sh) { return content.get('ship', typeof sh === 'string' ? sh : sh.class); },
    stock(siteId, cid) { return view.state.sites[siteId]?.stock?.[cid] || 0; },

    // A tactic's full UI status in one call: the panel must never re-implement this.
    tacticStatus(id) {
      const def = content.get('tactic', id);
      const t = view.state.tactics;
      if (!def) return null;
      const active = t.active.find(a => a.id === id) || null;
      const missing = [];
      const u = def.unlock || {};
      if (u.share !== undefined && view.state.share.player < u.share) missing.push({ k: 'share', need: u.share, have: view.state.share.player });
      if (u.cash !== undefined && view.state.cash < u.cash) missing.push({ k: 'cash', need: u.cash, have: view.state.cash });
      for (const m of u.modules || []) {
        if (!view.state.sites.ledger.modules.includes(m)) missing.push({ k: 'module', need: m });
      }
      return {
        def, active,
        banned: t.banned.includes(id),
        owned: t.owned.includes(id),
        unlocked: t.unlocked.includes(id),
        offered: t.offered.includes(id),
        affordable: view.state.cash >= def.cost,
        missing,
      };
    },

    // Last `cost` / `share` / `quarter` event of each kind — the HUD and the results panel both
    // want "the most recent one" and the log is append-only.
    last(t, before = Infinity) {
      const log = view.state.log;
      for (let i = log.length - 1; i >= 0; i--) {
        if (log[i].t === t && log[i].week <= before) return log[i];
      }
      return null;
    },
    all(t) { return view.state.log.filter(e => e.t === t); },
  };

  return view;
}

export default createSimView;
