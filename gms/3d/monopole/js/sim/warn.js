// Standing danger flags. `state.warnings` is the current set for a live strip; a `warn` event
// fires when one appears, when its wording changes, and every `repeatWeeks` while it stands.

import content from './content.js';

const credits = n => `${Math.round(Math.abs(n)).toLocaleString('en-US')} credits`;
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

function standing(state) {
  const b = content.balance;
  const w = b.warn;
  const out = [];
  const burn = Math.max(1, state.lastCosts || b.costs.overheadWeekly);
  const room = state.cash + b.loan.debtLimit;
  const weeks = Math.floor(room / burn);

  if (room <= 0) {
    out.push({ id: 'runway', level: 'debt', body: 'You are past the overdraft the bank will tolerate. Another week like this one ends the company.' });
  } else if (weeks <= w.runwayWeeks) {
    out.push({
      id: 'runway', level: 'debt',
      body: `At ${credits(burn)} a week you have about ${weeks} ${weeks === 1 ? 'week' : 'weeks'} before the overdraft closes. Sell down the bond store or lay something up.`,
    });
  }

  if (state.debt >= b.start.debt + (b.loan.maxDraw - b.start.debt) * w.leverageFrac) {
    out.push({
      id: 'leverage', level: 'debt',
      body: `${credits(state.debt)} drawn against a line of ${credits(b.loan.maxDraw)}, costing ${credits(state.debt * b.loan.interestWeekly)} a week before you move a tonne. One bad quarter and the interest is the business.`,
    });
  }

  if (state.heat > b.heat.threshold) {
    out.push({
      id: 'heat', level: 'heat',
      body: 'The Reach Authority has enough to open a file. Every week you leave the tactic running is another roll of the dice you do not control.',
    });
  } else if (state.heat >= b.heat.threshold * w.heatFrac) {
    out.push({
      id: 'heat', level: 'heat',
      body: `Attention is at ${Math.round(state.heat)} against a threshold of ${b.heat.threshold}. Stop now and it decays; carry on and it will not.`,
    });
  }

  // a contract bills the shortfall clause every week it is not met, so the warning is about
  // this week's stock, not about the contract running out
  for (const c of state.contracts) {
    const have = Math.floor(state.sites.ledger?.stock?.[c.commodity] || 0);
    if (have >= c.units) continue;
    const short = c.units - have;
    out.push({
      id: `contract:${c.id}`, level: 'contract',
      body: `${cap(c.with)} takes ${c.units} a week and Ledger is holding ${have}. Every week you are ${short} short the break clause bills you ${credits(short * c.price * b.contract.shortfallFrac)}.`,
    });
  }

  return out;
}

export function update(state, emit) {
  const repeat = content.balance.warn.repeatWeeks;
  const seen = state.warned || (state.warned = {});
  const now = standing(state);
  state.warnings = now;

  for (const wn of now) {
    const prev = seen[wn.id];
    if (prev && prev.body === wn.body && state.week - prev.week < repeat) continue;
    seen[wn.id] = { body: wn.body, week: state.week };
    emit({ t: 'warn', id: wn.id, level: wn.level, body: wn.body });
  }
  for (const id of Object.keys(seen)) if (!now.some(wn => wn.id === id)) delete seen[id];
}

export default { update };
