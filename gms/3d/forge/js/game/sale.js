// What the market panel shows and what a sale is worth. Pure — every price comes from
// sim/economy.js and every value from sim/tables.js.

import { sellStack, glut, glutFloor, freshness, HAGGLE } from '../sim/economy.js';
import { ITEM_VALUE, PERISHABLE } from '../sim/tables.js';
import { levelFor } from '../sim/xp.js';

export const PIPS = 5;
export const BARS = 5;
export const FRESH_CLAMP_MINUTES = 20;

export const itemName = id => id.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());

export function freshnessOf(entry, now) {
  if (!PERISHABLE.has(entry.id) || !entry.caught) return 1;
  return freshness(Math.min(FRESH_CLAMP_MINUTES, Math.max(0, (now - entry.caught) / 60000)));
}

// Five pips spanning the 0.5 floor to full, so a floored stack still reads as one pip rather
// than as nothing at all.
export const pipsOf = f => Math.max(1, Math.min(PIPS, 1 + Math.round((f - 0.5) * 8)));

// How full the stall is now and after each further four units. Glut moves 2% a unit against a
// floor 65% down, so a one-unit step would round to the same bar five times over — the step is
// four because that is the resolution the mechanic actually has.
export const BAR_STEP = 4;
export function barsOf(soldToday, barter) {
  const floor = glutFloor(barter);
  return Array.from({ length: BARS }, (_, i) =>
    Math.round((1 - glut(soldToday + i * BAR_STEP, barter)) / (1 - floor) * 4));
}

export function rows(doc, { district = 'light', now = 0 } = {}) {
  const barter = levelFor(doc.schools?.barter || 0);
  const sold = doc.ledger?.sold || {};
  return (doc.items || [])
    .filter(e => e.n > 0 && ITEM_VALUE[e.id] > 0)
    .map(e => {
      const f = freshnessOf(e, now);
      const soldToday = sold[`${district}:${e.id}`] || 0;
      return {
        id: e.id,
        name: itemName(e.id),
        n: e.n,
        value: ITEM_VALUE[e.id],
        perishable: PERISHABLE.has(e.id),
        freshness: f,
        pips: PERISHABLE.has(e.id) ? pipsOf(f) : null,
        bars: barsOf(soldToday, barter),
        sold: soldToday,
      };
    })
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
}

// Prices every ticked row against one shared ledger, in list order, so ticking the eighth rat
// tail visibly drops the unit price of the ones before it. Nothing is written back — the caller
// applies the returned ledger only when the sale is confirmed.
export function quote(list, picked, doc, { district = 'light', haggle = false } = {}) {
  const barter = levelFor(doc.schools?.barter || 0);
  let ledger = { day: doc.ledger?.day ?? 0, sold: { ...(doc.ledger?.sold || {}) } };
  const lines = [];
  let marks = 0, items = 0;

  for (const row of list) {
    if (!picked.includes(row.id)) continue;
    const r = sellStack(ledger, { item: row.id, value: row.value, n: row.n, barter,
      freshness: row.freshness, district });
    ledger = r.ledger;
    marks += r.marks;
    items += row.n;
    lines.push({ id: row.id, n: row.n, marks: r.marks, unit: r.marks / row.n, units: r.units });
  }

  const bonus = haggle ? Math.round(marks * HAGGLE.bonus) : 0;
  return { lines, items, marks: marks + bonus, bonus, ledger, barter };
}

// The live unit price a row shows: what it fetches given everything ticked above it.
export function unitOf(list, picked, doc, opts, id) {
  const upTo = list.slice(0, list.findIndex(r => r.id === id) + 1);
  const line = quote(upTo, [...picked.filter(p => p !== id), id], doc, opts).lines.find(l => l.id === id);
  return line ? line.units[0].price : 0;
}
