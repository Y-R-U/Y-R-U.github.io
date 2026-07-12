// LONGSHOT — profile persistence (localStorage), debounced.

const KEY = 'longshot.save.v1';
const NOSAVE = new URLSearchParams(location.search).has('nosave');

function defaults() {
  return {
    cash: 0,
    owned: { rifle: ['r700'], scope: ['mk2'], ammo: ['fmj'], gear: [] },
    loadout: { rifle: 'r700', scope: 'mk2', ammo: 'fmj' },
    missions: {},                 // id -> { score, medal, done }
    storyAt: 0,                   // index of next locked story mission
    daily: { date: '', score: 0, done: false, streak: 0, lastDate: '' },
    weekly: { week: '', score: 0 },
    endless: { best: 0 },
    stats: { shots: 0, hits: 0, heads: 0, kills: 0, longest: 0, cleared: 0 },
    settings: { sens: 1, invertY: false, quality: 'high', sfx: true, music: true, markers: true },
    seenIntro: false,
  };
}

export const save = load();

function load() {
  const d = defaults();
  if (NOSAVE) return d;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return d;
    const s = JSON.parse(raw);
    // deep-merge onto defaults so new fields appear on old saves
    for (const k of Object.keys(d)) {
      if (s[k] === undefined) continue;
      if (typeof d[k] === 'object' && d[k] && !Array.isArray(d[k])) Object.assign(d[k], s[k]);
      else d[k] = s[k];
    }
    if (s.owned) for (const k of Object.keys(d.owned)) if (s.owned[k]) d.owned[k] = s.owned[k];
    return d;
  } catch { return d; }
}

let timer = 0;
export function persist() {
  if (NOSAVE) return;
  clearTimeout(timer);
  timer = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch {} }, 300);
}

export function wipe() {
  try { localStorage.removeItem(KEY); } catch {}
  location.search = '';   // reload clean
}

export function grantCash(n) { save.cash = Math.max(0, Math.round(save.cash + n)); persist(); }
export const owns = (kind, id) => save.owned[kind] && save.owned[kind].includes(id);
