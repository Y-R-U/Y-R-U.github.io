// One canned game, thirteen weeks in, so every panel has something real to draw in the showroom
// without anyone having to play to that point. Built from the same sim and the same content pack
// as a live run — a fixture that is not real state is a fixture that hides bugs.

import content from '../sim/content.js';
import { createSimView } from './simview.js';

const SEED = 1001;
const WEEKS = 13;
let cached = null;

function policy(state) {
  const acts = [];
  if (state.week === 0) {
    for (const sh of state.ships) {
      const def = content.get('ship', sh.class);
      acts.push({ type: 'route', ship: sh.id, legs: def.mine > 0 ? ['ledger', 'kestrel'] : ['ledger', 'ossian'] });
    }
    return acts;
  }
  const mods = state.sites.ledger.modules;
  const coil = content.get('module', 'coilline');
  if (!mods.includes('coilline') && state.week >= 5 && state.cash >= coil.cost + 3000) {
    return [{ type: 'buyModule', module: 'coilline', site: 'ledger' }];
  }
  const want = state.tactics.offered.find(id => !state.tactics.owned.includes(id));
  if (want) {
    const t = content.get('tactic', want);
    const need = Math.max(t.cost + 3000, t.unlock.cash || 0);
    if (state.cash < need && state.debt < content.balance.loan.maxDraw) {
      acts.push({ type: 'loan', amount: need - state.cash });
    }
  }
  for (const id of state.tactics.unlocked) {
    if (state.tactics.owned.includes(id)) continue;
    const t = content.get('tactic', id);
    if (t.band !== 'legal') continue;
    if (state.cash < t.cost + 3000) continue;
    acts.push({ type: 'tactic', tactic: id });
    break;
  }
  return acts;
}

export function fixtureView() {
  if (cached) return cached;
  const view = createSimView({ seed: SEED });
  for (let w = 0; w < WEEKS && !view.state.over; w++) {
    for (const a of policy(view.state)) view.act(a);
    view.tick();
  }
  view.setSpeed(2);
  view.fixture = true;
  cached = view;
  return view;
}

export function resetFixture() { cached = null; }

// Per-panel props. A panel may override with its own `fixture(view, content)`.
const PROPS = {
  assign: v => ({ ship: (v.state.ships.find(s => v.shipDef(s).mine > 0) || v.state.ships[0]).id }),
  refinery: () => ({ site: 'ledger' }),
  market: () => ({ commodity: 'filament' }),
  quarterly: v => ({ event: v.last('quarter') }),
  tactics: () => ({ focus: 'exclusive_supply' }),
  story: () => ({ story: 'bunnings_ryobi', tactic: 'exclusive_supply' }),
};

export function fixtureProps(id, view) {
  return PROPS[id] ? PROPS[id](view, content) : {};
}

export default { fixtureView, fixtureProps, resetFixture };
