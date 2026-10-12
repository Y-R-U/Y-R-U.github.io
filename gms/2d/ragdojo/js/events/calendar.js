// Event definitions and their windows. Every boundary is UTC midnight, so two devices (and the
// server) agree on which event a battle belongs to wherever they are.

const DAY = 86400000;

/** Campaign fights cannot be verified by a server, so "any battle" events count at most
 * `perDay` of them per UTC day, each at least `gapMs` after the last one counted. */
export const CAMPAIGN_CAP = { perDay: 10, gapMs: 60000 };

/**
 * kind      'vines' | 'reveal'
 * cadence   'daily' | 'weekly' | 'monthly' | 'seasonal' (from/to are UTC 'MM-DD', to exclusive)
 * pass      true = Pass holders only
 * anyBattle true = campaign fights count too; false = arena battles only
 */
export const EVENT_DEFS = [
  { id: 'vines-day', kind: 'vines', cadence: 'daily', pass: false, anyBattle: true,
    title: 'VINES & LADDERS', theme: 'ink' },
  { id: 'reveal-week', kind: 'reveal', cadence: 'weekly', pass: false, anyBattle: true,
    title: 'PICTURE REVEAL', cost: 1, guessBonus: 2 },
  { id: 'vines-month', kind: 'vines', cadence: 'monthly', pass: true, anyBattle: false,
    title: 'SCROLLS & ROPES', theme: 'scrolls' },
  { id: 'reveal-month', kind: 'reveal', cadence: 'monthly', pass: true, anyBattle: false,
    title: 'MONTHLY PICTURE', cost: 2, guessBonus: 3 },
  { id: 'halloween', kind: 'reveal', cadence: 'seasonal', from: '10-24', to: '11-01', pass: true,
    anyBattle: true, title: 'SPOOKY WEEK', cost: 1, guessBonus: 2 },
];

export const defById = (id) => EVENT_DEFS.find((d) => d.id === id) || null;

export const utcDay = (ms) => new Date(ms).toISOString().slice(0, 10);
export const today = () => utcDay(Date.now());
export const dayStart = (day) => Date.parse(`${day}T00:00:00Z`);

/** ISO-8601 week: Monday start, week 1 holds the year's first Thursday. */
export function isoWeek(ms) {
  const d = new Date(ms);
  const day = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const dow = (new Date(day).getUTCDay() + 6) % 7;
  const thu = day + (3 - dow) * DAY;
  const year = new Date(thu).getUTCFullYear();
  const week = 1 + Math.floor((thu - Date.UTC(year, 0, 1)) / (7 * DAY));
  return { year, week, monday: day - dow * DAY };
}

/** The window of `def` that contains `ms`, or null when a seasonal event is not running. */
export function windowOf(def, ms) {
  const d = new Date(ms);
  const y = d.getUTCFullYear(), m = d.getUTCMonth();
  if (def.cadence === 'daily') {
    const start = Date.UTC(y, m, d.getUTCDate());
    return { key: utcDay(start), start, end: start + DAY };
  }
  if (def.cadence === 'weekly') {
    const w = isoWeek(ms);
    return { key: `${w.year}-W${String(w.week).padStart(2, '0')}`, start: w.monday, end: w.monday + 7 * DAY };
  }
  if (def.cadence === 'monthly') {
    const start = Date.UTC(y, m, 1);
    return { key: utcDay(start).slice(0, 7), start, end: Date.UTC(y, m + 1, 1) };
  }
  if (def.cadence === 'seasonal') {
    const at = (yy, md) => Date.UTC(yy, +md.slice(0, 2) - 1, +md.slice(3, 5));
    for (const yy of [y - 1, y]) {
      const start = at(yy, def.from);
      const end = def.to > def.from ? at(yy, def.to) : at(yy + 1, def.to);
      if (ms >= start && ms < end) return { key: String(yy), start, end };
    }
    return null;
  }
  throw new Error(`unknown cadence ${def.cadence}`);
}

export const eventIdOf = (def, win) => `${def.id}:${win.key}`;

/** Parse 'vines-day:2026-10-13' back into its definition and window. */
export function parseEventId(eventId) {
  const i = eventId.indexOf(':');
  const def = defById(eventId.slice(0, i));
  if (!def) return null;
  const key = eventId.slice(i + 1);
  let probe;
  if (def.cadence === 'daily' || def.cadence === 'monthly') probe = Date.parse(`${def.cadence === 'monthly' ? key + '-01' : key}T12:00:00Z`);
  else if (def.cadence === 'weekly') {
    const [yy, ww] = key.split('-W').map(Number);
    const jan4 = Date.UTC(yy, 0, 4);
    probe = isoWeek(jan4).monday + (ww - 1) * 7 * DAY + DAY / 2;
  } else probe = Date.UTC(+key, +def.from.slice(0, 2) - 1, +def.from.slice(3, 5)) + DAY / 2;
  const win = Number.isFinite(probe) ? windowOf(def, probe) : null;
  return win && win.key === key ? { def, win } : null;
}

/** Every event running at `ms`, with what this player may do in it. */
export function activeEvents(ms, { pass = false } = {}) {
  const out = [];
  for (const def of EVENT_DEFS) {
    const win = windowOf(def, ms);
    if (!win) continue;
    out.push({ def, win, id: eventIdOf(def, win), locked: def.pass && !pass });
  }
  return out;
}
