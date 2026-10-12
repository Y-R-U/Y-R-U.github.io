// The events save. It follows the hub's dailies rule (games/CLAUDE.md): days are UTC date
// strings and "already today" is `last >= today`. Only FINISHED battles are ever recorded —
// an in-progress match never enters this state, so it never syncs.
//
//   { v: 1, seenDay: 'YYYY-MM-DD', ev: { [eventId]: { b: [[battleId, pts, src]], turns?, open?, ... } } }

import { activeEvents, parseEventId, utcDay } from './calendar.js';
import { pointsFor, counts } from './points.js';
import { fresh as freshReveal, CELLS } from './reveal.js';

const KEEP_ENDED = 7 * 86400000;

export const fresh = () => ({ v: 1, seenDay: '', ev: {} });

export function load(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  return { v: 1, seenDay: typeof s.seenDay === 'string' ? s.seenDay : '', ev: s.ev && typeof s.ev === 'object' ? s.ev : {} };
}

export function evState(state, eventId) {
  const parsed = parseEventId(eventId);
  const base = parsed?.def.kind === 'reveal' ? freshReveal() : { turns: 0 };
  return { b: [], ...base, ...(state.ev[eventId] || {}) };
}

export const pointsOf = (ev) => ev.b.reduce((s, x) => s + x[1], 0);

/** `last >= today`, never `===`: a save from a device whose clock runs ahead is still "today". */
export const seenToday = (state, day) => state.seenDay >= day;
export const markSeen = (state, day) => (seenToday(state, day) ? state : { ...state, seenDay: day });

/** Bank one finished battle into every running event it counts for. */
export function recordBattle(state, battle, { pass = false } = {}) {
  const ev = { ...state.ev };
  const pts = pointsFor(battle);
  for (const a of activeEvents(battle.at, { pass })) {
    if (a.locked || !counts(a.def, a.win, battle)) continue;
    const cur = evState(state, a.id);
    if (cur.b.some((x) => x[0] === battle.id)) continue;
    ev[a.id] = { ...cur, b: [...cur.b, [battle.id, pts, battle.src]] };
  }
  return { ...state, ev };
}

export const setEv = (state, eventId, ev) => ({ ...state, ev: { ...state.ev, [eventId]: ev } });

/** Drop events that ended more than a week before `now`. */
export function prune(state, now) {
  const ev = {};
  for (const [id, e] of Object.entries(state.ev)) {
    const p = parseEventId(id);
    if (p && p.win.end + KEEP_ENDED > now) ev[id] = e;
  }
  return { ...state, ev };
}

/**
 * Two devices' saves -> one. Battles union by id, turns take the max, reveal squares union and
 * are then clamped to what the merged points can pay for, so two devices spending the same
 * points offline cannot add up to more squares than were earned.
 */
export function merge(a, b) {
  a = load(a); b = load(b);
  const out = { v: 1, seenDay: a.seenDay >= b.seenDay ? a.seenDay : b.seenDay, ev: {} };
  for (const id of new Set([...Object.keys(a.ev), ...Object.keys(b.ev)])) {
    const x = evState(a, id), y = evState(b, id);
    const ids = new Set(x.b.map((r) => r[0]));
    const m = { ...x, b: [...x.b, ...y.b.filter((r) => !ids.has(r[0]))] };
    if ('turns' in x || 'turns' in y) m.turns = Math.max(x.turns | 0, y.turns | 0);
    if (Array.isArray(x.open)) {
      const def = parseEventId(id)?.def;
      const cap = def ? Math.min(CELLS, Math.floor(pointsOf(m) / def.cost)) : CELLS;
      const open = [...x.open, ...y.open.filter((c) => !x.open.includes(c))];
      m.open = open.slice(0, cap);
      m.guesses = [...x.guesses, ...y.guesses.filter((g) => !x.guesses.includes(g))];
      m.solved = x.solved || y.solved;
      m.bonus = Math.max(x.bonus | 0, y.bonus | 0);
      m.claimed = [...new Set([...x.claimed, ...y.claimed])];
    }
    out.ev[id] = m;
  }
  return out;
}

export { utcDay };
