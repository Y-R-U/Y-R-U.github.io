// Events framework logic (PLAN 2.8): calendar, progress, goals and the local ladder. Pure functions
// (no DOM), so node tests and the screen share them. Event definitions live in ./data/.
import { EVENTS } from './data/index.js';

export { EVENTS };
const DAY = 86400000;

// ---- calendar (local time) ----
export function dayStart(ymd) { const [y, m, d] = ymd.split('-').map(Number); return new Date(y, m - 1, d).getTime(); }
export const startsAt = ev => dayStart(ev.start);
export const endsAt = ev => dayStart(ev.end) + DAY;            // end day is inclusive
// `?eventdate=YYYY-MM-DD` pins "now" to noon of that local day (testing)
export function nowFrom(search = typeof location !== 'undefined' ? location.search : '') {
  const q = new URLSearchParams(search).get('eventdate');
  if (q && /^\d{4}-\d{2}-\d{2}$/.test(q)) return dayStart(q) + DAY / 2;
  return Date.now();
}
export function status(ev, now) { return now < startsAt(ev) ? 'upcoming' : now >= endsAt(ev) ? 'ended' : 'live'; }
export function countdown(ms) {
  if (ms <= 0) return 'now';
  const d = Math.floor(ms / DAY), h = Math.floor((ms % DAY) / 3600000), m = Math.floor((ms % 3600000) / 60000);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
}
export function timeText(ev, now) {
  const st = status(ev, now);
  return st === 'live' ? `Ends in ${countdown(endsAt(ev) - now)}` : st === 'upcoming' ? `Starts in ${countdown(startsAt(ev) - now)}` : 'Ended';
}
// The event to feature on the title: live first (ending soonest), else the next upcoming, else the last one.
export function featured(now, list = EVENTS) {
  const live = list.filter(e => status(e, now) === 'live').sort((a, b) => endsAt(a) - endsAt(b));
  if (live.length) return live[0];
  const up = list.filter(e => status(e, now) === 'upcoming').sort((a, b) => startsAt(a) - startsAt(b));
  return up[0] || list[list.length - 1];
}

// ---- progress ----
export function freshProgress() { return { currency: 0, rounds: 0, aces: 0, bestUnder: null, points: 0, claimed: [], rankClaimed: false, pickups: {} }; }
// Event points for one finished round: steady play + under-par bonus + aces + new currency.
// More rounds = more points (D12: the more you play, the higher you go).
export function roundPoints({ total, par, aces, currency }) {
  return Math.max(10, 40 + 12 * (par - total)) + 25 * aces + 3 * currency;
}
export function applyRound(p, { total, par, aces, newCurrency }) {
  const pts = roundPoints({ total, par, aces, currency: newCurrency });
  p.rounds++; p.aces += aces; p.currency += newCurrency; p.points += pts;
  p.bestUnder = Math.max(p.bestUnder ?? -99, par - total);
  return pts;
}
export function goalValue(p, kind) {
  return { currency: p.currency, rounds: p.rounds, aces: p.aces, points: p.points, underPar: Math.max(0, p.bestUnder ?? 0) }[kind] ?? 0;
}
export function goalState(p, g) {
  const v = goalValue(p, g.kind);
  return { value: Math.min(v, g.target), done: v >= g.target, claimed: p.claimed.includes(g.id) };
}

// ---- ladder: generated players whose scores advance with the date, deterministically ----
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const FIRST = ['Bex', 'Ollie', 'Juno', 'Rafa', 'Mira', 'Tobi', 'Kit', 'Nell', 'Ash', 'Bo', 'Cass', 'Dex', 'Effie', 'Finn', 'Gigi', 'Hal',
  'Ivy', 'Jules', 'Kai', 'Lux', 'Mo', 'Nico', 'Odie', 'Pax', 'Quin', 'Remy', 'Sol', 'Tess', 'Uma', 'Vee', 'Wren', 'Zed'];
const LAST = ['Putter', 'Birdie', 'Fairway', 'Loop', 'Windmill', 'Cloud', 'Skyward', 'Bogey', 'Hollow', 'Lantern', 'Pike', 'Greene',
  'Holloway', 'Rattle', 'Cupps', 'Bramble', 'Frost', 'Ember', 'Glass', 'Sprocket'];

export function ladderPlayers(ev) {
  const L = ev.ladder || {}, r = rng(L.seed ?? 1);
  const used = new Set();
  return Array.from({ length: L.size ?? 29 }, (_, i) => {
    let name;
    do { name = `${FIRST[(r() * FIRST.length) | 0]} ${LAST[(r() * LAST.length) | 0]}`; } while (used.has(name));
    used.add(name);
    // activity: rounds per day; quality: points per round. A few grinders, many casuals.
    const activity = (0.08 + 0.95 * Math.pow(r(), 1.6)) * (L.pace ?? 1);
    const quality = 32 + 60 * r();
    return { id: `${ev.id}:${i}`, name, activity, quality, seed: (L.seed ?? 1) * 1000 + i };
  });
}
// A bot's points at time `now`: whole days played so far, plus the part of today already gone.
export function botPoints(bot, ev, now) {
  const t0 = startsAt(ev), t1 = Math.min(now, endsAt(ev));
  if (t1 <= t0) return 0;
  const days = (t1 - t0) / DAY;
  let pts = 0;
  for (let d = 0; d < Math.ceil(days); d++) {
    const r = rng(bot.seed * 7919 + d);
    const rounds = Math.floor(bot.activity * (0.4 + 1.2 * r()) + r());
    const today = rounds * bot.quality * (0.8 + 0.4 * r());
    pts += d < Math.floor(days) ? today : today * (days - Math.floor(days));
  }
  return Math.round(pts);
}
export function standings(ev, now, you) {
  const rows = ladderPlayers(ev).map(b => ({ name: b.name, points: botPoints(b, ev, now) }));
  rows.push({ name: you.name || 'You', points: you.points, you: true });
  rows.sort((a, b) => b.points - a.points || (b.you ? 1 : 0) - (a.you ? 1 : 0));
  rows.forEach((r, i) => { r.rank = i + 1; });
  return rows;
}
export function rankReward(ev, rank) { return (ev.rankRewards || []).find(t => rank <= t.top) || null; }
