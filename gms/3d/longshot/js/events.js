// LONGSHOT — date-driven contracts: a daily mark, a weekly gauntlet, and the
// endless NEST. Seeds derive from the calendar, so everyone gets the same
// board on the same day and records mean something.

import { dayKey, weekKey, rng } from './utils.js';
import { save, persist } from './save.js';

const DAY_FLAVOURS = [
  { name: 'SUNDAY SERVICE', kind: 'plaza', wind: [0, 2], time: 'day', par: 2600 },
  { name: 'MONDAY COMMUTE', kind: 'walk', wind: [1, 3], time: 'day', par: 3000 },
  { name: 'CORNER OFFICE TUESDAY', kind: 'room', wind: [1, 3], time: 'dusk', par: 3200 },
  { name: 'FACELESS WEDNESDAY', kind: 'identify', wind: [1, 2], time: 'dusk', par: 3400 },
  { name: 'DOUBLE THURSDAY', kind: 'double', wind: [1, 4], time: 'dusk', par: 4200 },
  { name: 'HIGH FRIDAY', kind: 'rooftop', wind: [3, 6], time: 'day', par: 3800 },
  { name: 'STORM SATURDAY', kind: 'walk', wind: [4, 7], time: 'rain', par: 4000, gusts: true },
];

export function dailyDef(date = new Date()) {
  const key = dayKey(date);
  const r = rng('daily:' + key);
  const f = DAY_FLAVOURS[date.getDay()];
  const dist = Math.round(r.range(220, 460) / 10) * 10;
  const def = {
    id: 'daily:' + key, act: 0, name: f.name, contract: 'daily',
    pay: 700, par: f.par,
    tagline: `Daily mark · ${key}`,
    brief: `One name on today's slate, Wren. ${dist} metres, ${f.time} light${f.gusts ? ', gusting wind' : ''}. Same contract for every rifle in the city — set a score they can't touch.`,
    intel: [`Seeded daily contract — <b>${key}</b>`, 'Best score is recorded', 'Streak grows one per day completed'],
    time: f.time, wind: f.wind, gusts: !!f.gusts,
    vantage: { dist, height: Math.round(r.range(32, 54)) },
    setup: { civs: r.int(6, 11) },
  };
  if (f.kind === 'identify') {
    def.setup.targets = [{ kind: 'plaza', anim: 'phone', label: 'THE DAILY MARK' }];
    def.setup.identify = { decoys: 3 };
  } else if (f.kind === 'double') {
    def.setup.targets = [{ kind: 'plaza', label: 'MARK A' }, { kind: r.pick(['bench', 'walk']), label: 'MARK B' }];
    def.setup.window = 22;
  } else {
    def.setup.targets = [{ kind: f.kind, label: 'THE DAILY MARK', anim: f.kind === 'rooftop' ? 'phone' : undefined }];
  }
  return def;
}

export function weeklyDef(date = new Date()) {
  const key = weekKey(date);
  const r = rng('weekly:' + key);
  const kinds = ['plaza', 'walk', 'bench', 'rooftop', 'room'];
  // five marks, no window — a marathon of varied shots
  const targets = [];
  for (let i = 0; i < 5; i++) targets.push({ kind: kinds[Math.floor(r() * kinds.length)], label: 'GAUNTLET ' + (i + 1) });
  return {
    id: 'weekly:' + key, act: 0, name: 'THE GAUNTLET', contract: 'weekly',
    pay: 2000, par: 8000,
    tagline: `Weekly gauntlet · ${key}`,
    brief: 'Five names, one insertion, one magazine at a time. The week\'s league table remembers exactly how clean you were.',
    intel: [`Seeded weekly — <b>${key}</b>`, 'FIVE targets, any order, no time window', 'Two counter-spotters watch the skyline'],
    time: r.pick(['day', 'dusk', 'night']), wind: [2, 5],
    vantage: { dist: Math.round(r.range(280, 420)), height: 46 },
    setup: { targets, civs: 9, guards: 2 },
  };
}

export function endlessDef() {
  const r = rng('nest:' + dayKey());
  return {
    id: 'endless', act: 0, name: 'THE NEST', contract: 'endless',
    pay: 0, par: 6000,
    tagline: 'Marks keep coming. Three escapes and you\'re done.',
    brief: 'No story tonight. The city keeps offering names and you keep answering, until three of them walk out of your world alive. See how deep the list goes.',
    intel: ['Endless marks, escalating pace', 'Each mark self-extracts if you\'re slow', '<b>3 escapes</b> ends the night', 'Score banks on the way — nothing is lost'],
    time: r.pick(['dusk', 'night']), wind: [1, 4],
    vantage: { dist: 260, height: 40 },
    special: 'endless', setup: { civs: 10 },
  };
}

// ── records ──────────────────────────────────────────────────────────────────
export function dailyState() {
  const today = dayKey();
  if (save.daily.date !== today) return { done: false, score: 0, streak: streakAlive() ? save.daily.streak : 0 };
  return { done: save.daily.done, score: save.daily.score, streak: save.daily.streak };
}
function streakAlive() {
  if (!save.daily.lastDate) return false;
  const y = new Date(); y.setDate(y.getDate() - 1);
  return save.daily.lastDate === dayKey(y) || save.daily.lastDate === dayKey();
}
export function recordDaily(score, won) {
  const today = dayKey();
  if (save.daily.date !== today) {
    save.daily.date = today; save.daily.done = false; save.daily.score = 0;
  }
  if (won) {
    if (!save.daily.done) {
      save.daily.streak = streakAlive() ? save.daily.streak + 1 : 1;
      save.daily.lastDate = today;
    }
    save.daily.done = true;
    save.daily.score = Math.max(save.daily.score, score);
  }
  persist();
}
export function recordWeekly(score, won) {
  const wk = weekKey();
  if (save.weekly.week !== wk) { save.weekly.week = wk; save.weekly.score = 0; }
  if (won || score > 0) save.weekly.score = Math.max(save.weekly.score, score);
  persist();
}
export function recordEndless(score) {
  save.endless.best = Math.max(save.endless.best, score);
  persist();
}
