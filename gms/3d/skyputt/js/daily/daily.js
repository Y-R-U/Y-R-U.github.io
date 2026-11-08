// Daily Challenge (daily agent): one hole a day, a theme and a twist, 3 tries (best counts), a
// streak with milestone rewards, and a seeded field of ghost AI scores for "today's board".
// Pure (no DOM, no THREE): tools/daily_test.mjs drives it with a fake store and a fixed clock.
//
// The day is the player's LOCAL calendar date (like the events and the weekly ladder), and
// `?eventdate=YYYY-MM-DD` pins it (nowFrom). Everything about a day's challenge is a pure function
// of that date string and the hole list, so every device shows the same hole, twist, theme and field.
//
// Hole pick = rendezvous hashing: every hole gets a score hash(day, hole id) and the lowest wins.
// A player who hasn't opened a course yet (`lockedBy`, e.g. Hollow Woods) just drops that course
// from the pool, so they get the best-scoring hole among the rest: the same hole as everyone else
// whenever the global winner is on a course they have, and the same fallback as every other player
// in their position otherwise. Adding a course only changes the days where one of its holes wins.
import { COURSES } from '../course/holes/index.js';
import { allHoles, themeIds, addDays, daysBetween, localYmd } from '../events/calendar.js';
import { quickScores, makeRng, hashStr, PERSONALITY_IDS } from '../ai/index.js';

export const DAILY_EPOCH = '2026-11-03';   // Daily #1
export const TRIES = 3;
export const RECENT = 6;                   // a hole is not picked again within this many days
export const KEEP_DAYS = 45;               // old day records are pruned after this
export const FIELD = 11;                   // ghost golfers on today's board (+ you = 12)
export const SHOT_CLOCK = 15;              // seconds, for the shot-clock twist

// ---- rewards (see docs/notes/daily.md "Balance": a whole day is ≤ 20 coins; a weekend is ≤ 185) ----
export const FINISH_REWARD = { coins: 8 };     // first hole-out of the day
export const GOAL_REWARD = { coins: 12 };      // first time today's twist goal is met
export const MILESTONES = {
  3: { coins: 20, helpers: { longSight: 1 } },
  7: { coins: 40, chest: 'wood' },
  14: { coins: 60, helpers: { mulligan: 1 }, chest: 'wood' },
  30: { coins: 100, chest: 'silver' },
};
// after 30, every further 30 days in a row pays the day-30 reward again
export const milestoneFor = n => MILESTONES[n] || (n > 30 && n % 30 === 0 ? MILESTONES[30] : null);
export const nextMilestone = n => { for (let k = n + 1; k < n + 32; k++) if (milestoneFor(k)) return k; return null; };

// ---- twists: only things the engine already does cleanly ----
const pickups = def => (def.features || []).filter(f => f.type === 'pickup').length;
export const TWISTS = [
  { id: 'par', name: 'Par or better', icon: '⛳', goal: 'par', helpers: 'own', clock: 0,
    text: def => `Finish in ${def.par} or fewer.`, ok: () => true },
  { id: 'birdie', name: 'Birdie hunt', icon: '🐦', goal: 'birdie', helpers: 'own', clock: 0,
    text: def => `Beat par: ${def.par - 1} or fewer.`, ok: def => def.par >= 3 },
  { id: 'nohelpers', name: 'No helpers', icon: '🚫', goal: 'par', helpers: 'off', clock: 0,
    text: def => `No helpers today. Finish in ${def.par} or fewer.`, ok: () => true },
  { id: 'kit', name: 'Fixed kit', icon: '🎒', goal: 'birdie', helpers: 'kit', clock: 0,
    text: def => `One of each helper (yours stay put). Beat par: ${def.par - 1} or fewer.`, ok: def => def.par >= 3 },
  { id: 'crystals', name: 'Crystal sweep', icon: '💎', goal: 'crystals', helpers: 'own', clock: 0,
    text: def => `Collect all ${pickups(def)} crystal${pickups(def) > 1 ? 's' : ''}, then hole out.`, ok: def => pickups(def) >= 1 },
  { id: 'clock', name: 'Shot clock', icon: '⏱', goal: 'par', helpers: 'own', clock: SHOT_CLOCK,
    text: def => `${SHOT_CLOCK} s per shot or it putts itself. Finish in ${def.par} or fewer.`, ok: () => true },
];
export const TWIST_BY_ID = Object.fromEntries(TWISTS.map(t => [t.id, t]));

// Did one try meet the twist's goal? try: { strokes, picked, gems }
export function goalMet(twist, def, t) {
  if (!t || t.picked || t.quit || !t.strokes) return false;
  if (twist.goal === 'birdie') return t.strokes < def.par;
  if (twist.goal === 'crystals') return (t.gems | 0) >= pickups(def);
  return t.strokes <= def.par;
}

// ---- the day's challenge ----
export const dayNumber = ymd => daysBetween(DAILY_EPOCH, ymd) + 1;
// a well-mixed uniform [0, 1) per string (FNV alone has weak low bits for small `mod`s)
const unit = str => makeRng(hashStr(str))();
const score = (ymd, id) => unit(`skyputt-daily:${ymd}:${id}`);
// Is a course open to this player? (`lockedBy` until its gate hole is finished, courses2)
export const courseOpen = store => c => !c.lockedBy || !!store?.data?.unlocked?.[c.lockedBy.hole];
function rawPick(ymd, pool, skip = null) {
  let best = null, bs = Infinity;
  for (const e of pool) { if (skip?.has(e.h.id)) continue; const s = score(ymd, e.h.id); if (s < bs) { bs = s; best = e; } }
  return best;
}
// The actual pick of `ymd`: walk WINDOW days up to it, each day skipping the picks of the RECENT days
// before it. Starting the walk from plain picks a few weeks back converges long before `ymd`, so the
// result is a pure function of (date, pool) and never repeats a hole within RECENT days.
const WINDOW = 28;
const pickCache = new Map();
function walkPick(ymd, pool, key) {
  const ck = `${key}|${ymd}`;
  if (pickCache.has(ck)) return pickCache.get(ck);
  const seq = [];
  for (let k = WINDOW; k >= 0; k--) {
    const d = addDays(ymd, -k), skip = new Set(seq.slice(-RECENT).map(e => e.h.id));
    seq.push((skip.size < pool.length && rawPick(d, pool, skip)) || rawPick(d, pool));
  }
  const e = seq[seq.length - 1];
  if (pickCache.size > 4000) pickCache.clear();
  pickCache.set(ck, e);
  return e;
}
// A restricted pool (a player with locked courses) follows the global sequence: every day whose global
// pick is open to them gets that same hole (shared board), and only days on a locked course get a
// fallback, chosen to avoid both their own last RECENT picks and the global picks of the next RECENT
// days, so they still never see a repeat within RECENT days. (An independent walk over the smaller
// pool drifted off the global hole on ~15% of open-course days because the skip histories differed.)
const fullKey = () => allHoles().map(x => x.h.id).join(',');
function pickFor(ymd, pool, key) {
  const all = allHoles(), fk = fullKey();
  if (key === fk) return walkPick(ymd, all, fk);
  const ck = `R:${key}|${ymd}`;
  if (pickCache.has(ck)) return pickCache.get(ck);
  const inPool = new Set(pool.map(e => e.h.id));
  const g = d => walkPick(d, all, fk);
  const seq = [];
  for (let k = WINDOW; k >= 0; k--) {
    const d = addDays(ymd, -k), gp = g(d);
    if (inPool.has(gp.h.id)) { seq.push(gp); continue; }
    const skip = new Set(seq.slice(-RECENT).map(e => e.h.id));
    for (let j = 1; j <= RECENT; j++) { const f = g(addDays(d, j)); if (inPool.has(f.h.id)) skip.add(f.h.id); }
    seq.push((skip.size < pool.length && rawPick(d, pool, skip)) || rawPick(d, pool));
  }
  const e = seq[seq.length - 1];
  if (pickCache.size > 4000) pickCache.clear();
  pickCache.set(ck, e);
  return e;
}
// → { ymd, n, hole (def), course (id), twist, theme }. `open(course)` filters the pool (default: all).
export function dailyFor(ymd, { open = () => true } = {}) {
  const pool = allHoles().filter(e => open(COURSES[e.course]));
  if (!pool.length) return null;
  const e = pickFor(ymd, pool, pool.map(x => x.h.id).join(','));
  const def = e.h;
  const tw = TWISTS.filter(t => t.ok(def));
  const twist = tw[Math.floor(unit(`skyputt-twist:${ymd}:${def.id}`) * tw.length)];
  const themes = themeIds();
  const theme = themes[Math.floor(unit(`skyputt-theme:${ymd}`) * themes.length)];
  return { ymd, n: dayNumber(ymd), hole: def, course: e.course, twist, theme };
}

// ---- today's board: a seeded field of ghost AIs (calibrated quick scores, js/ai calib) ----
const FIRST = ['Bex', 'Ollie', 'Juno', 'Rafa', 'Mira', 'Tobi', 'Kit', 'Nell', 'Ash', 'Bo', 'Cass', 'Dex', 'Effie', 'Finn', 'Gigi', 'Hal',
  'Ivy', 'Jules', 'Kai', 'Lux', 'Mo', 'Nico', 'Odie', 'Pax', 'Quin', 'Remy', 'Sol', 'Tess', 'Uma', 'Vee', 'Wren', 'Zed'];
const LAST = ['Putter', 'Birdie', 'Fairway', 'Loop', 'Windmill', 'Cloud', 'Skyward', 'Bogey', 'Hollow', 'Lantern', 'Pike', 'Greene',
  'Holloway', 'Rattle', 'Cupps', 'Bramble', 'Frost', 'Ember', 'Glass', 'Sprocket'];
export function field(ch) {
  const r = makeRng(`skyputt-field:${ch.ymd}:${ch.hole.id}`), used = new Set();
  return Array.from({ length: FIELD }, (_, i) => {
    let name;
    do { name = `${FIRST[(r() * FIRST.length) | 0]} ${LAST[(r() * LAST.length) | 0]}`; } while (used.has(name));
    used.add(name);
    const personality = PERSONALITY_IDS[(r() * PERSONALITY_IDS.length) | 0];
    const skill = Math.min(0.9, 0.2 + 0.68 * Math.pow(r(), 0.85));   // D14: never above 0.9
    const tries = 1 + ((r() * TRIES) | 0);
    const g = { id: `daily-${ch.ymd}-${i}`, name, personality, skill };
    const runs = Array.from({ length: tries }, (_, t) => quickScores([ch.hole], g, hashStr(`${ch.ymd}:${t}`))[0]);
    const done = runs.filter(x => !x.picked);
    return { name, personality, skill, tries, strokes: done.length ? Math.min(...done.map(x => x.strokes)) : null };
  });
}
// The board: the field plus you (your best finished try). Ties go to you. → rows sorted, with rank.
export function board(ch, best, you = 'You') {
  const rows = field(ch).map(g => ({ name: g.name, strokes: g.strokes, tries: g.tries }));
  if (best != null) rows.push({ name: you, strokes: best, you: true });
  const key = r => r.strokes ?? 99;
  rows.sort((a, b) => key(a) - key(b) || (b.you ? 1 : 0) - (a.you ? 1 : 0));
  rows.forEach((r, i) => { r.rank = i + 1; });
  return rows;
}

// ---- save state (store.data.daily; created on first use, so the v1 save needs no migration) ----
export function freshDaily() { return { v: 1, days: {}, streak: { count: 0, last: null, best: 0 }, log: [] }; }
function state(store) {
  const d = store.data;
  const ok = x => x && typeof x === 'object' && x.days && typeof x.days === 'object' && x.streak && typeof x.streak === 'object';
  if (!ok(d.daily)) d.daily = freshDaily();
  return d.daily;
}
// Grant a reward { coins, helpers, chest } straight into the save (same shape as the events/meta rewards).
function grant(store, r) {
  if (!r) return;
  const d = store.data;
  if (r.coins) d.coins = (d.coins | 0) + r.coins;
  for (const [k, n] of Object.entries(r.helpers || {})) d.helpers[k] = (d.helpers[k] | 0) + n;
  for (const k of [].concat(r.chest || [])) d.chests?.queue.push(k);
}

// createDaily(store, now) → the daily for this save. `now()` is ms (nowFrom(), so ?eventdate works).
export function createDaily(store, now = () => Date.now()) {
  const today = () => localYmd(now());
  const challenge = (ymd = today()) => dailyFor(ymd, { open: courseOpen(store) });
  const peek = ymd => state(store).days[ymd] || null;
  function rec(ymd, ch) {
    const S = state(store);
    if (!S.days[ymd]) {
      S.days[ymd] = { n: ch.n, hole: ch.hole.id, twist: ch.twist.id, theme: ch.theme, tries: [], paid: { finish: false, goal: false } };
      for (const k of Object.keys(S.days)) if (daysBetween(k, ymd) > KEEP_DAYS) delete S.days[k];
    }
    return S.days[ymd];
  }
  // A day's challenge is frozen once you start it: the hole you began on stays yours for the day
  // (even if you open Hollow Woods later and the pool changes).
  function current(ymd = today()) {
    const r = peek(ymd), ch = challenge(ymd);
    if (r && r.hole !== ch.hole.id) {
      const e = allHoles().find(x => x.h.id === r.hole);
      if (e) return { ...ch, hole: e.h, course: e.course, twist: TWIST_BY_ID[r.twist] || ch.twist, theme: r.theme || ch.theme };
    }
    return ch;
  }
  const triesUsed = (ymd = today()) => peek(ymd)?.tries.length || 0;
  const triesLeft = (ymd = today()) => Math.max(0, TRIES - triesUsed(ymd));
  function best(ymd = today()) {
    const done = (peek(ymd)?.tries || []).filter(t => !t.picked && !t.quit && t.strokes);
    return done.length ? Math.min(...done.map(t => t.strokes)) : null;
  }
  const cleared = (ymd = today()) => { const ch = current(ymd), r = peek(ymd); return !!r?.tries.some(t => goalMet(ch.twist, ch.hole, t)); };
  // The streak as it stands today: alive if the last completed day is today or yesterday.
  function streak(ymd = today()) {
    const s = state(store).streak;
    const alive = s.last === ymd || (s.last && addDays(s.last, 1) === ymd);
    return { count: alive ? s.count : 0, best: s.best | 0, last: s.last, today: s.last === ymd, atRisk: alive && s.last !== ymd };
  }

  // Start a try: it is used up now (saved before the round loads), so quitting or reloading can't
  // give it back. → { ymd, i, ch } or null when none are left.
  function start(ymd = today()) {
    if (triesLeft(ymd) <= 0) return null;
    const ch = current(ymd), r = rec(ymd, ch);
    r.tries.push({ strokes: null, picked: false, gems: 0, quit: true });   // a quit until finished
    store.save();
    return { ymd, i: r.tries.length - 1, ch };
  }
  // Finish a try with the round result (null = quit). Pays the day's rewards and the streak.
  // → { try, met, rewards: [{ why, reward }], streak, milestone }
  function finish(att, res) {
    const r = rec(att.ymd, att.ch), ch = att.ch, out = { rewards: [], milestone: null };
    const row = res?.rows?.[0];
    const t = row ? { strokes: row.strokes, picked: !!row.picked, gems: res.gems | 0, quit: false } : { strokes: null, picked: false, gems: 0, quit: true };
    r.tries[att.i] = t;
    out.try = t;
    out.met = goalMet(ch.twist, ch.hole, t);
    const holed = !t.quit && !t.picked && t.strokes > 0;
    if (holed && !r.paid.finish) { r.paid.finish = true; grant(store, FINISH_REWARD); out.rewards.push({ why: 'Daily finished', reward: FINISH_REWARD }); }
    if (out.met && !r.paid.goal) { r.paid.goal = true; grant(store, GOAL_REWARD); out.rewards.push({ why: `${ch.twist.name} cleared`, reward: GOAL_REWARD }); }
    // streak: a day counts when you hole out (any try). Only moves forward in time.
    const S = state(store), s = S.streak;
    if (holed && (!s.last || att.ymd > s.last)) {
      s.count = s.last && addDays(s.last, 1) === att.ymd ? (s.count | 0) + 1 : 1;
      s.last = att.ymd;
      s.best = Math.max(s.best | 0, s.count);
      const m = milestoneFor(s.count);
      if (m) {
        grant(store, m);
        out.milestone = { days: s.count, reward: m };
        out.rewards.push({ why: `${s.count}-day streak`, reward: m });
        S.log.unshift({ ymd: att.ymd, days: s.count });
        S.log.length = Math.min(S.log.length, 20);
      }
    }
    store.save();
    out.streak = streak(att.ymd);
    return out;
  }

  // "SKYPUTT Daily #N: ⛳ 2 strokes, streak 5" (+ the hole, twist and a link line).
  function shareText(ymd = today(), url = '') {
    const ch = current(ymd), b = best(ymd), st = streak(ymd), met = cleared(ymd);
    const head = `SKYPUTT Daily #${ch.n}: ⛳ ${b == null ? 'no finish' : `${b} stroke${b === 1 ? '' : 's'}`}, streak ${st.count}`;
    const line = `${ch.hole.name} (par ${ch.hole.par}) · ${ch.twist.icon} ${ch.twist.name} ${met ? '✅' : '❌'} · ${triesUsed(ymd)}/${TRIES} tries`;
    return [head, line, url].filter(Boolean).join('\n');
  }

  return { today, challenge, current, peek, triesUsed, triesLeft, best, cleared, streak, start, finish, shareText,
    board: (ymd = today(), you) => board(current(ymd), best(ymd), you), now };
}

// Max coins one day can pay outside the streak (balance tests + notes).
export const DAY_MAX_COINS = FINISH_REWARD.coins + GOAL_REWARD.coins;
