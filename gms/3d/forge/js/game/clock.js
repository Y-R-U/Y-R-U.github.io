// Pure world-clock arithmetic. `t` is game-hours since the save was created; hour, day and
// weekday are derived from it and never stored twice. No imports, no renderer, node-testable.

export const DAY_ROLL = 5;    // STORY.md §4: the day turns at 05:00, not midnight
export const DAWN = 5.5;
export const DUSK = 20.5;
export const WEEK = 8;

export const BELLS = [
  { id: 'rising', hour: 6 },
  { id: 'high', hour: 12 },
  { id: 'setting', hour: 18 },
  { id: 'low', hour: 21 },
];

// The obvious ((t % 24) + 24) % 24 is not exact — 11.9 comes back as 11.899999999999999, which
// puts a bell an epsilon into the future and it never rings.
export const hourOf = t => { const h = t % 24; return h < 0 ? h + 24 : h; };
export const dayOf = t => Math.floor((t - DAY_ROLL) / 24);
export const crossedDay = (a, b) => dayOf(b) > dayOf(a);
export const isNight = h => h >= DUSK || h < DAWN;
export const weekdayOf = t => ((dayOf(t) % WEEK) + WEEK) % WEEK;
export const isEighthDay = t => weekdayOf(t) === WEEK - 1;

export const hoursUntil = (t, hour) => {
  const d = hour - hourOf(t);
  return d > 0 ? d : d + 24;
};

// `rate` is game-hours per real minute, so 1.0 is the 24-real-minute day. Stepped at each
// dawn/dusk edge so one long frame cannot skip a rate change or a day roll.
export function advance(t, dtSeconds, rate = 1, nightRate = 1) {
  let left = dtSeconds / 60, cur = t;
  for (let guard = 0; left > 1e-9 && guard < 512; guard++) {
    const h = hourOf(cur);
    const r = rate * (isNight(h) ? nightRate : 1);
    if (r <= 0) break;
    const edge = isNight(h) ? (h < DAWN ? DAWN : 24) : DUSK;
    const step = Math.min(left, Math.max((edge - h) / r, 1e-9));
    cur += step * r;
    left -= step;
  }
  return cur;
}

// The bell the valley last heard. Before 06:00 that is yesterday's Low, which is why the chip
// reads `Low` at 04:00 on the granary's first morning rather than nothing at all.
export function lastBell(t) {
  const h = hourOf(t);
  let out = BELLS[BELLS.length - 1];
  for (const b of BELLS) if (b.hour <= h) out = b;
  return out;
}

// Every bell struck in (a, b], in order, each with the absolute `t` it struck at.
export function bellsBetween(a, b) {
  const out = [];
  if (!(b > a)) return out;
  for (const bell of BELLS) {
    let x = a - hourOf(a) + bell.hour;
    if (x <= a) x += 24;
    for (; x <= b; x += 24) out.push({ ...bell, t: x });
  }
  return out.sort((p, q) => p.t - q.t);
}
