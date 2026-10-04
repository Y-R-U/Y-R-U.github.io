export const KEYS = {
  settings: 'clued.settings', stats: 'clued.stats', mastery: 'clued.mastery',
  cards: 'clued.cards', last: 'clued.last', name: 'clued.name',
};
export const SYNCED = [KEYS.settings, KEYS.stats, KEYS.mastery, KEYS.cards];

export const DEFAULT_SETTINGS = {
  sound: true, music: 0.5, haptics: true, timerSec: 10, reducedMotion: false, kids: false, readAloud: false,
};
export const DEFAULT_STATS = {
  games: 0, answered: 0, correct: 0, bestStreak: 0, best: {}, daily: { last: '', results: {} },
};

const listeners = new Set();

export function read(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw);
  } catch (e) { return fallback; }
}

export function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* private mode */ }
  listeners.forEach(fn => { try { fn(key, value); } catch (e) {} });
}

export const onChange = fn => (listeners.add(fn), () => listeners.delete(fn));

export const ANSWER_TIMES = [0, 3, 5, 10, 15, 20, 30];   // 0 = no timer
export function getSettings() {
  const s = { ...DEFAULT_SETTINGS, ...(read(KEYS.settings) || {}) };
  if (!ANSWER_TIMES.includes(s.timerSec)) s.timerSec = 10;
  s.timer = s.timerSec > 0;
  return s;
}
export function setSettings(patch) {
  const s = { ...getSettings(), ...patch };
  delete s.timer;
  write(KEYS.settings, s);
  return s;
}

export function getStats() {
  const s = read(KEYS.stats) || {};
  return { ...DEFAULT_STATS, ...s, best: { ...(s.best || {}) }, daily: { last: '', results: {}, ...(s.daily || {}) } };
}
export function updateStats(fn) {
  const s = getStats();
  fn(s);
  write(KEYS.stats, s);
  return s;
}

export function recordGame({ structure, score, answers = [] }) {
  return updateStats(s => {
    s.games++;
    s.answered += answers.length;
    let run = 0;
    for (const a of answers) {
      if (a.correct) { s.correct++; run++; s.bestStreak = Math.max(s.bestStreak, run); } else run = 0;
    }
    if (structure && score > (s.best[structure] || 0)) s.best[structure] = score;
  });
}

export const todayUTC = () => new Date().toISOString().slice(0, 10);

export function dailyDone(day = todayUTC(), kind = 'main') {
  const d = getStats().daily;
  const last = kind === 'main' ? d.last : (d[`last_${kind}`] || '');
  return last >= day;
}

export function recordDaily(day, kind, result) {
  return updateStats(s => {
    const k = kind === 'main' ? 'last' : `last_${kind}`;
    if (!(s.daily[k] >= day)) s.daily[k] = day;
    s.daily.results[`${kind}:${day}`] = result;
    const keys = Object.keys(s.daily.results).sort();
    while (keys.length > 60) delete s.daily.results[keys.shift()];
  });
}

export function getLast(formatId) { return (read(KEYS.last) || {})[formatId] || null; }
export function setLast(formatId, value) {
  const all = read(KEYS.last) || {};
  all[formatId] = value;
  write(KEYS.last, all);
}

export const getName = () => read(KEYS.name) || '';
export const setName = n => write(KEYS.name, String(n).slice(0, 24));
