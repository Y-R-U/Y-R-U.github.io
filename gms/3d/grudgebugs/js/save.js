// GRUDGE BUGS — profile persistence (localStorage). ?nosave disables writes.

const KEY = 'grudgebugs_v1';
const nosave = new URLSearchParams(location.search).has('nosave');

const DEFAULTS = {
  coins: 0,
  faction: 'ants',
  hat: 'none',
  hatsOwned: ['none'],
  story: {},              // chapterId -> stars (1..3)
  introSeen: false,
  daily: { last: '', streak: 0 },
  stats: { battles: 0, wins: 0, kills: 0, falls: 0 },
  opts: { sfx: true, music: true, shake: true, replays: true, lite: false },
};

let data = null;

export function load() {
  if (data) return data;
  try {
    const raw = localStorage.getItem(KEY);
    data = raw ? { ...structuredClone(DEFAULTS), ...JSON.parse(raw) } : structuredClone(DEFAULTS);
    data.opts = { ...DEFAULTS.opts, ...(data.opts || {}) };
  } catch { data = structuredClone(DEFAULTS); }
  return data;
}

export function save() {
  if (nosave) return;
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* private mode */ }
}

export function addCoins(n) { load().coins = Math.max(0, load().coins + n); save(); }

export function todayStr() { return new Date().toISOString().slice(0, 10); }

// returns {day, amount} if a daily chest is claimable today, else null
export function dailyAvailable() {
  const d = load().daily;
  return d.last === todayStr() ? null : true;
}
export function claimDaily(amounts) {
  const p = load();
  const today = todayStr();
  if (p.daily.last === today) return null;
  const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  p.daily.streak = p.daily.last === yesterday ? Math.min(7, p.daily.streak + 1) : 1;
  p.daily.last = today;
  const amt = amounts[p.daily.streak - 1];
  p.coins += amt;
  save();
  return { day: p.daily.streak, amount: amt };
}
