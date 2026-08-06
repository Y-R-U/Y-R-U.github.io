// The redaction rule, in one place, applied on every exit that hands events out — fire(),
// eventsFor(), and nothing else. Having it in one function is the point: REVIEW_SIM BLOCK-3 was
// eventsFor() redacting correctly while fire() returned the raw delta out of the same call.

// Events are flat plain objects whose only nested values are Cell[] and the ship list. A
// structured clone would be correct and ~10x slower, and this runs after every shot in the soak.
export function clone(e) {
  const out = { ...e };
  if (Array.isArray(e.cells)) out.cells = e.cells.map(c => ({ r: c.r, c: c.c }));
  if (Array.isArray(e.ships)) out.ships = e.ships.map(s => ({ ...s }));
  if (e.anchor) out.anchor = { ...e.anchor };
  return out;
}

export function redact(e, viewer) {
  if (e.t === 'place' && e.side !== viewer) return { t: 'place', side: e.side, by: e.by, ships: null };
  if (e.t === 'result' && e.at !== viewer) { const c = clone(e); c.shipId = null; return c; }
  return clone(e);
}

export const redactEvents = (events, viewer) => events.map(e => redact(e, viewer));
