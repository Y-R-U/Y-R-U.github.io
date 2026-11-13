// Special events on a shared calendar: a pure function of the UTC date, the same for everyone, no server.
import { CONFIG } from '../config.js';

const DAY = 86400000, HOUR = 3600000;
export const FEATURED = ['teams', 'koth', 'lcs', 'infection'];

// sim: CONFIG.SIM overrides (sim_test sweeps these). look: the renderer's suggested theme/weather.
export const EVENTS = {
  double: { name: 'Double Crowd Weekend', short: 'Double Crowd', icon: '×2', color: '#ffcc33', blurb: 'Every pedestrian you sweep up counts twice.', sim: { recruitValue: 2 }, look: { theme: 'festival', weather: 'clear' } },
  market: { name: 'Night Market', short: 'Night Market', icon: '★', color: '#c27bff', blurb: 'Power-ups on every corner, back in seconds.', sim: { pickupCount: 14, pickupRespawn: 5 }, look: { theme: 'night-neon', weather: 'clear' } },
  rush: { name: 'Rush Hour', short: 'Rush Hour', icon: '»', color: '#5cc8ff', blurb: 'Twice the pedestrians, and everyone is in a hurry.', sim: { neutralCap: 1000, neutralStart: 900, neutralRespawn: 52, neutralSpeedMin: 1.5, neutralSpeedMax: 2.8, speedBase: 9.4, pullSpeed: 8.5 }, look: { theme: 'sunny-day', weather: 'clear' } },
  slayer: { name: 'Giant Slayer', short: 'Giant Slayer', icon: '⚔', color: '#ff6b6b', blurb: '+30 coins for absorbing a crowd ranked above you.', bonus: 30, look: { theme: 'evening', weather: 'rain' } },
  motd: { name: 'Mode of the Day', short: 'Mode of the Day', icon: '◆', color: '#5fe0d0', blurb: 'Coins ×1.5 in the featured mode.', coinMul: 1.5 },
};

export const dayNo = (t) => Math.floor(t / DAY);
export const weekday = (d) => (d + 4) % 7;                 // 0 = Sunday (1970-01-01 was a Thursday)
const mondayWeek = (d) => Math.floor((d + 3) / 7);
export const monthKey = (t) => new Date(t).toISOString().slice(0, 7);
const monthIndex = (t) => { const x = new Date(t); return x.getUTCFullYear() * 12 + x.getUTCMonth(); };

export const featuredMode = (t = Date.now()) => FEATURED[((dayNo(t) % 4) + 4) % 4];
export const cupMode = (t = Date.now()) => FEATURED[(monthIndex(t) + 1) % 4];

function windowsOfDay(d) {
  const s = d * DAY, wd = weekday(d), out = [];
  if (wd === 6 || wd === 0) {
    const sat = wd === 6 ? d : d - 1;
    out.push({ id: mondayWeek(sat) % 2 === 0 ? 'double' : 'market', start: sat * DAY, end: (sat + 2) * DAY });
  }
  if (wd === 2 || wd === 4) out.push({ id: 'slayer', start: s, end: s + DAY });
  if (wd === 1 || wd === 3 || wd === 5) {
    out.push({ id: 'rush', start: s + 7 * HOUR, end: s + 9 * HOUR });
    out.push({ id: 'rush', start: s + 17 * HOUR, end: s + 19 * HOUR });
  }
  out.push({ id: 'motd', start: s, end: s + DAY, mode: FEATURED[((d % 4) + 4) % 4] });
  return out;
}

// Every event window overlapping [from, from + days), merged, in start order.
export function calendar(from, days = 30) {
  const d0 = dayNo(from), seen = new Set(), out = [];
  for (let d = d0 - 1; d <= d0 + days; d++) {
    for (const w of windowsOfDay(d)) {
      const k = w.id + ':' + w.start;
      if (seen.has(k) || w.end <= from || w.start >= from + days * DAY) continue;
      seen.add(k);
      out.push({ ...w, ...EVENTS[w.id] && { name: EVENTS[w.id].name } });
    }
  }
  return out.sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
}

export const liveEvents = (t = Date.now()) => calendar(t, 1).filter((w) => w.start <= t && t < w.end);
export const nextEvents = (t = Date.now(), n = 6) => calendar(t, 14).filter((w) => w.start > t && w.id !== 'motd').slice(0, n);

// Sim overrides of a set of live events (match-wide events only; Mode of the Day / Giant Slayer are meta).
export function eventSim(ids) {
  const out = {};
  for (const id of ids) if (EVENTS[id] && EVENTS[id].sim) Object.assign(out, EVENTS[id].sim);
  return out;
}

// Winter lights, 18 Dec – 6 Jan UTC: the snow theme (with its own falling snow) when no event has a look.
export function winterLook(t = Date.now()) {
  const x = new Date(t), m = x.getUTCMonth(), d = x.getUTCDate();
  return (m === 11 && d >= 18) || (m === 0 && d <= 6) ? { theme: 'snow', weather: null, event: 'winter' } : null;
}

export function eventLook(ids, t = Date.now()) {
  for (const id of ['market', 'rush', 'double', 'slayer']) if (ids.includes(id)) return { ...EVENTS[id].look, event: id };
  return winterLook(t);
}

// What a match started at `t` in `mode` gets: event ids, sim overrides, look, coin multiplier.
export function matchEvents(t = Date.now(), mode = 'classic') {
  const live = liveEvents(t);
  const ids = live.map((w) => w.id).filter((id) => id !== 'motd');
  const motd = live.find((w) => w.id === 'motd');
  const coinMul = motd && motd.mode === mode ? EVENTS.motd.coinMul : 1;
  return { ids, sim: eventSim(ids), look: eventLook(ids, t), coinMul, featured: motd ? motd.mode : null, slayer: ids.includes('slayer') ? EVENTS.slayer.bonus : 0 };
}

export function fmtCountdown(ms) {
  const m = Math.max(0, Math.floor(ms / 60000));
  if (m >= 1440) return `${Math.floor(m / 1440)}d ${Math.floor(m / 60) % 24}h`;
  if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60}m`;
  return `${m}m ${Math.max(0, Math.floor(ms / 1000) % 60)}s`;
}

// ---------------------------------------------------------------- monthly cup

export const CUP = {
  points: [10, 7, 5, 4, 3, 2, 1, 0],
  best: 5,
  tiers: [
    { id: 'bronze', name: 'Bronze Cup', pts: 15, coins: 200, color: '#c9824a' },
    { id: 'silver', name: 'Silver Cup', pts: 28, coins: 450, color: '#c9d3e0' },
    { id: 'gold', name: 'Gold Cup', pts: 40, coins: 900, color: '#ffcc33' },
  ],
};

export function cupView(save, t = Date.now()) {
  const key = monthKey(t), c = save.cup && save.cup.key === key ? save.cup : { key, results: [], claimed: [] };
  const top = c.results.slice().sort((a, b) => b - a).slice(0, CUP.best);
  const pts = top.reduce((a, b) => a + b, 0);
  const x = new Date(t), end = Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 1);
  return { key, mode: cupMode(t), results: c.results, top, pts, claimed: c.claimed, endsIn: end - t, tiers: CUP.tiers.map((r) => ({ ...r, got: c.claimed.includes(r.id), reached: pts >= r.pts })) };
}

// A finished ladder match in the cup mode. Returns the tiers newly reached (already paid into save.coins).
export function recordCup(save, place, mode, t = Date.now()) {
  if (mode !== cupMode(t)) return [];
  const key = monthKey(t);
  if (!save.cup || save.cup.key !== key) save.cup = { key, results: [], claimed: [] };
  save.cup.results.push(CUP.points[Math.max(0, Math.min(7, place - 1))]);
  if (save.cup.results.length > 60) save.cup.results = save.cup.results.sort((a, b) => b - a).slice(0, 20);
  const v = cupView(save, t), got = [];
  for (const tier of CUP.tiers) {
    if (v.pts >= tier.pts && !save.cup.claimed.includes(tier.id)) {
      save.cup.claimed.push(tier.id);
      got.push(tier);
      const tr = save.trophies.find((x) => x.kind === 'cup' && x.key === key);
      if (tr) tr.tier = tier.id; else save.trophies.push({ kind: 'cup', key, tier: tier.id, mode, at: t });
    }
  }
  return got;
}

export const modeName = (m) => (CONFIG.MODES[m] || CONFIG.MODES.classic).name;
