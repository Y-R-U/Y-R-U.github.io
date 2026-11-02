// events3: the event calendar. Big events recur every year (data/*.js `recur: 'yearly'` + a `dates`
// rule), and short weekend events (data/weekends.js) fill the weekends between them. Pure (no DOM).
//
// Big-event `dates` rules (all local calendar days, `end` inclusive):
//   { from: 'MM-DD', to: 'MM-DD' }                 fixed window; `to` < `from` runs into the next year
//   { rule: 'easter', before: 8, after: 8 }         Easter Sunday −before … +after (Gregorian computus)
//   { rule: 'lunar', before: 10, after: 15 }        Lunar New Year −before … +after (table below)
//   { rule: 'between', after: 'a', before: 'b', gap: 3, max: 24, from, to }
//                                                   from (end of series a) + gap to (start of b) − gap,
//                                                   at most `max` days; from/to are used when a or b has
//                                                   no run that year
// A yearly run's id is `${series}-${year of its start}`, so the first runs keep their old ids
// ('spooky-open-2026', 'frost-fair-2026', 'lunar-lanterns-2027', …) and old saves still match.
// Each run has its own save entry (store.data.events[id]), ladder seed and pickups ledger.
import { SERIES } from './data/index.js';
import { WEEKEND_KINDS, WEEKEND_LADDER } from './data/weekends.js';
import { COURSES } from '../course/holes/index.js';
import { THEME_LIST } from '../app/menus.js';

export const DAY = 86400000;

// ---- plain calendar-day maths on 'YYYY-MM-DD' strings (UTC inside, so DST never shifts a day) ----
const pad = n => String(n).padStart(2, '0');
const toYmd = t => { const d = new Date(t); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };
const utc = ymd => { const [y, m, d] = ymd.split('-').map(Number); return Date.UTC(y, m - 1, d); };
export const addDays = (ymd, n) => toYmd(utc(ymd) + n * DAY);
export const weekday = ymd => new Date(utc(ymd)).getUTCDay();            // 0 Sun … 5 Fri, 6 Sat
export const daysBetween = (a, b) => Math.round((utc(b) - utc(a)) / DAY);
export function dayStart(ymd) { const [y, m, d] = ymd.split('-').map(Number); return new Date(y, m - 1, d).getTime(); }
export function localYmd(t) { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

// Easter Sunday (Anonymous Gregorian algorithm).
export function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${y}-${pad(month)}-${pad(day)}`;
}
// Lunar New Year (first day of the first lunar month). Years outside the table have no lunar run.
export const LUNAR_NEW_YEAR = {
  2026: '2026-02-17', 2027: '2027-02-06', 2028: '2028-01-26', 2029: '2029-02-13', 2030: '2030-02-03',
  2031: '2031-01-23', 2032: '2032-02-11', 2033: '2033-01-31', 2034: '2034-02-19', 2035: '2035-02-08',
  2036: '2036-01-28', 2037: '2037-02-15', 2038: '2038-02-04', 2039: '2039-01-24', 2040: '2040-02-12',
};
export const LAST_YEAR = 2040;   // the calendar is generated up to here (lunar table)

// ---- big events: one cached run per (series, year), so the same object comes back every call ----
const cache = new Map();
const seriesById = id => SERIES.find(s => s.series === id);

function datesFor(s, y) {
  const D = s.dates;
  if (!D) return null;
  if (D.rule === 'easter') { const e = easter(y); return [addDays(e, -(D.before ?? 0)), addDays(e, D.after ?? 0)]; }
  if (D.rule === 'lunar') { const e = LUNAR_NEW_YEAR[y]; return e ? [addDays(e, -(D.before ?? 0)), addDays(e, D.after ?? 0)] : null; }
  if (D.rule === 'between') {
    const a = run(seriesById(D.after), y), b = run(seriesById(D.before), y), gap = D.gap ?? 1;
    const start = a ? addDays(a.end, gap) : `${y}-${D.from}`;
    let end = b ? addDays(b.start, -gap) : `${y}-${D.to}`;
    if (D.max && daysBetween(start, end) >= D.max) end = addDays(start, D.max - 1);   // late Easter: weekends fill the rest
    return start <= end ? [start, end] : null;
  }
  return [`${y}-${D.from}`, `${D.to < D.from ? y + 1 : y}-${D.to}`];
}

// The run of series `s` that starts in year `y` (null before `since`, past LAST_YEAR, or with no window).
export function run(s, y) {
  if (!s || y < s.since || y > LAST_YEAR) return null;
  if (s.recur !== 'yearly' && y !== s.since) return null;
  const key = `${s.series}-${y}`;
  if (cache.has(key)) return cache.get(key);
  const w = datesFor(s, y);
  // Inherit everything (name, theme, goals …) from the series data; own the dated fields.
  const ev = w ? Object.assign(Object.create(s), {
    id: key, year: y, start: w[0], end: w[1], kind: 'big',
    // the first run keeps the original seed (same bots as before); later years get fresh ones
    ladder: { ...s.ladder, seed: (s.ladder.seed + (y - s.since) * 104729) >>> 0 },
  }) : null;
  cache.set(key, ev);
  return ev;
}
// Every big run that starts in years [y0, y1], by start date.
export function bigEvents(y0, y1) {
  const out = [];
  for (let y = y0; y <= y1; y++) for (const s of SERIES) { const r = run(s, y); if (r) out.push(r); }
  return out.sort((a, b) => (a.start < b.start ? -1 : 1));
}
// The big run covering calendar day `ymd`, if any.
export function bigOn(ymd) {
  const y = +ymd.slice(0, 4);
  return bigEvents(y - 1, y).find(e => e.start <= ymd && ymd <= e.end) || null;
}

// ---- weekend events: every Fri–Sun with no big event gets one; four kinds take turns ----
export const WEEKEND_EPOCH = '2026-01-02';   // a Friday; week n = n weeks after it
export const WEEKEND_FIRST = '2026-11-09';   // weekend events start after the 2026 Spooky Open (none before)
const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
function rand(seed) {   // same generator as events.js rng (kept local so this file has no cycle)
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const allHoles = () => Object.values(COURSES).flatMap(c => c.holes.map(h => ({ h, course: c.id })));
export const themeIds = () => THEME_LIST.map(t => t.id).filter(id => id !== 'greybox');
const pickups = holes => holes.reduce((a, h) => a + (h.features || []).filter(f => f.type === 'pickup').length, 0);

// Weekend slots, week by week from the epoch: the free span of each week (Fri–Sun if free, else
// Sat–Sun or Fri–Sat; never under 2 days, never touching a big event) and how many weekend runs came
// before it. Kinds take turns by that count, so a run of free weekends always cycles all four kinds.
const spans = [], ords = [];
function slot(week) {
  for (let w = spans.length; w <= week; w++) {
    const fri = addDays(WEEKEND_EPOCH, 7 * w), sat = addDays(fri, 1), sun = addDays(fri, 2);
    const free = d => !bigOn(d);
    spans[w] = [[fri, sun], [sat, sun], [fri, sat]].find(([a, b]) => free(a) && free(b) && free(addDays(a, 1))) || null;
    ords[w] = w ? ords[w - 1] + (spans[w - 1] ? 1 : 0) : 0;
  }
  return spans[week] ? { span: spans[week], ord: ords[week] } : null;
}

// The weekend run for the week whose Friday is `fri`, or null if a big event takes the weekend.
export function weekend(fri) {
  if (weekday(fri) !== 5) return null;
  const n = daysBetween(WEEKEND_EPOCH, fri);
  if (n < 0 || fri < WEEKEND_FIRST || +fri.slice(0, 4) > LAST_YEAR) return null;
  const week = n / 7, sl = slot(week);
  if (!sl) return null;
  const K = WEEKEND_KINDS[sl.ord % WEEKEND_KINDS.length], key = `weekend-${K.kind}-${fri}`;
  if (cache.has(key)) return cache.get(key);
  const seed = 50000 + week;
  // holes: every course in COURSES (read now, so new courses join in), ranked by a per-weekend hash
  const pool = allHoles().filter(x => K.pick(x.h)).map(x => ({ ...x, r: rand(hash(`${seed}:${x.h.id}`))() })).sort((a, b) => a.r - b.r);
  let picks = pool.slice(0, K.holes);
  if (K.must && !picks.some(x => K.must(x.h))) { const m = pool.find(x => K.must(x.h)); if (m) picks = [m, ...picks.slice(0, -1)]; }
  picks.sort((a, b) => a.h.par - b.h.par || a.r - b.r);   // shortest holes first
  const themes = themeIds(), holes = picks.map(x => x.h), round = Math.floor(sl.ord / WEEKEND_KINDS.length);
  const ev = {
    id: key, kind: 'weekend', weekendKind: K.kind, week, year: +sl.span[0].slice(0, 4),
    name: K.name, blurb: K.blurb, theme: themes[(sl.ord + round) % themes.length], themeFallback: 'sky',
    start: sl.span[0], end: sl.span[1], course: picks[0]?.course || 'sky', holes: holes.map(h => h.id),
    currency: K.currency, scoring: K.scoring, goals: K.goals(pickups(holes)), ladder: { ...WEEKEND_LADDER, seed }, rankRewards: K.rankRewards,
  };
  cache.set(key, ev);
  return ev;
}
const fridayOnOrBefore = ymd => addDays(ymd, -((weekday(ymd) + 2) % 7));
export function weekends(fromYmd, toYmd) {
  const out = [];
  for (let f = fridayOnOrBefore(fromYmd); f <= toYmd; f = addDays(f, 7)) { const w = weekend(f); if (w && w.end >= fromYmd) out.push(w); }
  return out;
}

// Everything (big + weekend) overlapping [fromYmd, toYmd], by start date.
export function calendar(fromYmd, toYmd) {
  const y0 = +fromYmd.slice(0, 4), y1 = +toYmd.slice(0, 4);
  return [...bigEvents(y0 - 1, y1).filter(e => e.end >= fromYmd && e.start <= toYmd), ...weekends(fromYmd, toYmd)]
    .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
}

// Rebuild an event from its id (save keys, links). Old fixed ids are the first yearly runs.
export function eventById(id) {
  let m = /^weekend-([a-z]+)-(\d{4}-\d{2}-\d{2})$/.exec(id || '');
  if (m) { const w = weekend(m[2]); return w && w.id === id ? w : null; }
  m = /^(.+)-(\d{4})$/.exec(id || '');
  if (m) return run(seriesById(m[1]), +m[2]);
  return null;
}
