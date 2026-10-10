// Detailed play stats, kept inside clued.stats next to the old totals (games/answered/correct/bestStreak/best).
// The cloud layer syncs the whole key as one raw string in one Firestore doc, so everything here is compact:
//   m  { mode:  [games, answered, correct, points, bestScore, bestStreak, seconds, wins, podiums] }
//   f  { format: [games, answered, correct, points] }   th { theme: … }   pk { pack: … }   (same 4-number rows)
//   kt { theme: games } (kids games)   sd [sessions, cards, remembered, seconds] (Learn flashcards)
//   dd { 'YYYY-MM-DD': daily kinds bitmask }   h [newest-first game entries, capped]
// Games recorded before this existed only live in the old totals; the difference shows as "earlier games".
// Reading never writes: a write moves the cloud savedAt stamp, and a boot-time write would beat a newer account save.
import { getStats, updateStats } from './store.js?v=202610101826';
import { hashString } from './rng.js?v=202610101826';
import { getIndex } from './packs.js?v=202610101826';

export const HISTORY_CAP = 200;
export const DAYS_CAP = 120;
export const DAILY_BITS = { main: 1, kids: 2, map: 4, music: 8 };
const LIST_CAP = 3;
const G = 0, Q = 1, C = 2, P = 3, BEST = 4, STREAK = 5, SECS = 6, WIN = 7, POD = 8;

export const MODE_INFO = {
  quick: ['▶️', 'Quick game'], survival: ['❤️', 'Survival'], blitz: ['⚡', 'Blitz'], ladder: ['🪜', 'Ladder'],
  daily: ['🔎', 'Daily'], pubquiz: ['🍻', 'Pub quiz'], party: ['🎉', 'Party'], duel: ['⚔️', 'Duel'],
  online: ['🌐', 'Online room'], challenge: ['🎯', 'Challenge'], linkchallenge: ['🔗', 'Link challenge'], study: ['📖', 'Flashcards'],
};

const defaultTheme = pack => getIndex()?.packs?.[pack]?.theme || null;
const packOfRef = r => (typeof r === 'string' && r.includes('/') ? r.slice(0, r.indexOf('/')) : null);
const top = (counts, n = LIST_CAP) => Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, n).map(e => e[0]);
const bump = (map, key, q, c, p) => { const r = map[key] || (map[key] = [0, 0, 0]); r[0] += q; r[1] += c; r[2] += p; };
const num = v => (Number.isFinite(+v) ? +v : 0);

// The "you" of a multi-player game on one device is player 1 (party, pub quiz teams, duel's first side).
export function summarize(mode, res = {}, x = {}) {
  const spec = x.spec || {};
  const themeOf = x.themeOf || defaultTheme;
  const players = res.players || [];
  const multi = players.length > 1;
  const me = x.me ?? 0;
  const qs = new Map((res.questions || []).map(q => [q.id, q]));
  const answers = (res.answers || []).filter(a => !multi || (a.player ?? 0) === me);
  const per = {}, perPack = {};
  for (const a of answers) {
    if (a.skipped) continue;
    const q = qs.get(a.qid);
    const fmt = a.format || q?.format;
    const pts = num(a.points), c = a.correct ? 1 : 0;
    if (fmt) bump(per, fmt, 1, c, pts);
    const pack = q?.pack || packOfRef(q?.refs?.[0]);
    if (pack) bump(perPack, pack, 1, c, pts);
    else if (fmt && x.fmtTheme?.(fmt)) bump(perPack, `@${x.fmtTheme(fmt)}`, 1, c, pts);
  }
  let q, c, pts, streak, counted = true, placing = x.placing, n = x.players;
  if (res.duel) {
    q = num(res.total); c = num(players[me]?.correct); pts = num(players[me]?.score); streak = 0; counted = false;
  } else if (multi) {
    const done = answers.filter(a => !a.skipped);
    q = done.length; c = done.filter(a => a.correct).length; pts = num(players[me]?.score); streak = num(players[me]?.bestStreak);
  } else {
    q = num(res.answered ?? answers.filter(a => !a.skipped).length); c = num(res.correct); pts = num(res.score); streak = num(res.bestStreak);
  }
  if (multi) {
    n = players.length;
    placing = 1 + players.filter(p => num(p.score) > num(players[me]?.score)).length;
  }
  const perTheme = {};
  for (const [pk, r] of Object.entries(perPack)) {
    const t = pk.startsWith('@') ? pk.slice(1) : themeOf(pk);
    if (t) bump(perTheme, t, r[0], r[1], r[2]);
  }
  for (const k of Object.keys(perPack)) if (k.startsWith('@')) delete perPack[k];
  const rounds = spec.rounds || [];
  const specPacks = rounds.flatMap(r => (Array.isArray(r.packs) ? r.packs : []));
  const packCounts = Object.keys(perPack).length ? Object.fromEntries(Object.entries(perPack).map(([k, r]) => [k, r[0]])) : Object.fromEntries(specPacks.map(p => [p, 1]));
  const themeCounts = Object.keys(perTheme).length ? Object.fromEntries(Object.entries(perTheme).map(([k, r]) => [k, r[0]]))
    : Object.fromEntries(specPacks.map(themeOf).filter(Boolean).map(t => [t, 1]));
  return {
    mode, via: x.via, dk: x.daily, day: x.day, replay: x.replay,
    formats: [...new Set([...rounds.map(r => r.format).filter(Boolean), ...Object.keys(per)])],
    packs: top(packCounts), themes: top(themeCounts),
    kids: !!(x.kids ?? spec.kids), diff: num(rounds[0]?.difficulty),
    q, c, pts: Math.round(pts), streak, counted,
    secs: Math.round(x.secs ?? answers.reduce((s, a) => s + num(a.ms), 0) / 1000),
    n, placing, rk: x.rk, per, perPack, perTheme,
  };
}

// Applies one finished game to a stats object in place (pure: no storage). Returns the history entry or null.
export function applyGame(s, sum, now = Date.now()) {
  if (!sum || !MODE_INFO[sum.mode]) return null;
  s.h = Array.isArray(s.h) ? s.h : [];
  if (sum.rk && s.h.some(e => e.rk === sum.rk)) return null;
  s.v = 2;
  const q = num(sum.q), c = Math.min(num(sum.c), q || num(sum.c)), pts = num(sum.pts), secs = Math.max(0, Math.min(4 * 3600, num(sum.secs)));
  const e = { t: Math.round(now / 1000), m: sum.mode };
  if (sum.mode === 'study') {
    s.sd = Array.isArray(s.sd) ? s.sd : [0, 0, 0, 0];
    s.sd[0]++; s.sd[1] += q; s.sd[2] += c; s.sd[3] += secs;
  } else {
    const counted = sum.counted !== false;
    s.games = num(s.games) + 1;
    if (counted) { s.answered = num(s.answered) + q; s.correct = num(s.correct) + c; }
    s.bestStreak = Math.max(num(s.bestStreak), num(sum.streak));
    s.best = s.best || {};
    if (pts > num(s.best[sum.mode])) s.best[sum.mode] = pts;
    const m = s.m || (s.m = {});
    const r = m[sum.mode] || (m[sum.mode] = [0, 0, 0, 0, 0, 0, 0, 0, 0]);
    while (r.length < 9) r.push(0);
    r[G]++; if (counted) { r[Q] += q; r[C] += c; } r[P] += pts;
    r[BEST] = Math.max(r[BEST], pts); r[STREAK] = Math.max(r[STREAK], num(sum.streak)); r[SECS] += secs;
    const n = num(sum.n), pl = num(sum.placing);
    if (n > 1 && pl === 1) r[WIN]++;
    if (n > 2 && pl >= 1 && pl <= 3) r[POD]++;
    for (const [key, src] of [['f', sum.per], ['pk', sum.perPack], ['th', sum.perTheme]]) {
      const agg = s[key] || (s[key] = {});
      for (const [id, v] of Object.entries(src || {})) {
        const a = agg[id] || (agg[id] = [0, 0, 0, 0]);
        a[G]++; a[Q] += num(v[0]); a[C] += num(v[1]); a[P] += Math.round(num(v[2]));
      }
    }
    if (sum.kids) { const kt = s.kt || (s.kt = {}); for (const t of sum.themes || []) kt[t] = num(kt[t]) + 1; }
    if (sum.mode === 'daily' && sum.day && DAILY_BITS[sum.dk]) {
      const dd = s.dd || (s.dd = {});
      dd[sum.day] = num(dd[sum.day]) | DAILY_BITS[sum.dk];
      const days = Object.keys(dd).sort();
      while (days.length > DAYS_CAP) delete dd[days.shift()];
    }
    if (sum.formats?.length) e.f = sum.formats.slice(0, 4);
    if (sum.packs?.length) e.pk = sum.packs.slice(0, LIST_CAP);
    if (sum.themes?.length) e.th = sum.themes.slice(0, LIST_CAP);
    if (sum.diff) e.d = sum.diff;
    if (!counted) e.x = 1;
    e.p = pts; e.s = num(sum.streak);
    if (n > 1) { e.n = n; e.pl = pl; }
    if (sum.via && sum.via !== 'server') e.v = sum.via;
    if (sum.dk) e.dk = sum.dk;
    if (sum.replay) e.r = 1;
    if (sum.rk) e.rk = sum.rk;
  }
  if (sum.kids) e.k = 1;
  e.q = q; e.c = c; e.du = secs;
  if (sum.mode === 'study' && sum.packs?.length) e.pk = sum.packs.slice(0, LIST_CAP);
  if (sum.mode === 'study' && sum.study) e.sm = sum.study;
  s.h.unshift(e);
  if (s.h.length > HISTORY_CAP) s.h.length = HISTORY_CAP;
  return e;
}

export function recordGame(sum, { now = Date.now() } = {}) {
  let e = null;
  try {
    const peek = getStats();
    if (sum?.rk && (peek.h || []).some(x => x.rk === sum.rk)) return null;
    updateStats(s => { e = applyGame(s, sum, now); });
  } catch (err) { console.warn('[clued] stats not recorded', err); }
  return e;
}

export function recordStudy({ cards = 0, right = 0, packs = [], kids = false, secs, mode } = {}) {
  if (!cards) return null;
  return recordGame({ mode: 'study', q: cards, c: right, packs, kids, secs: secs ?? playSecs(), study: mode === 'mc' || mode === 'flip' ? mode : undefined });
}

export function resetStats() {
  updateStats(s => {
    for (const k of ['m', 'f', 'th', 'pk', 'kt', 'sd', 'h']) delete s[k];
    Object.assign(s, { v: 2, games: 0, answered: 0, correct: 0, bestStreak: 0, best: {} });
  });
}

// Wall-clock of the current game: the shell marks it as a play screen opens (js/ui/statsline.js).
let playAt = 0;
export const markPlay = (t = Date.now()) => { playAt = t; };
export function playSecs(now = Date.now()) {
  const s = playAt ? (now - playAt) / 1000 : 0;
  return s > 0 && s < 4 * 3600 ? Math.round(s) : undefined;
}

// Online rooms (server and device-hosted): js/net/room.js passes every room state here; the final state records once.
const rooms = new Map();
export function trackRoom(st, code, via = 'server', now = Date.now()) {
  try { return track(st, code, via, now); } catch (e) { console.warn('[clued] room stats', e); return null; }
}
function track(st, code, via, now) {
  if (!st || !code || !st.you) return null;
  const key = `${code}:${st.game ?? 0}`;
  let r = rooms.get(key);
  if (!r) rooms.set(key, r = { t0: 0, qs: {}, done: false });
  if (!r.t0 && (st.phase === 'question' || st.phase === 'reveal')) r.t0 = now;
  if ((st.phase === 'reveal' || st.phase === 'final') && st.you.last && st.q >= 0) r.qs[st.q] = st.you.last;
  if (st.phase !== 'final' || r.done) return null;
  r.done = true;
  const sum = roomSummary(st, code, via, r, now);
  return sum ? recordGame(sum, { now }) : null;
}

function roundFormat(st, a) {
  const sizes = st.roundSizes, rounds = st.spec?.rounds || [];
  let ord = 0;
  if (Array.isArray(sizes) && sizes.length > 1) {
    for (let start = 0; ord < sizes.length; ord++) { if (a < start + sizes[ord]) break; start += sizes[ord]; }
  }
  const r = rounds[st.roundSpec?.[ord] ?? ord] || rounds[0];
  return r || null;
}

export function roomSummary(st, code, via, tracked = { t0: 0, qs: {} }, now = Date.now(), themeOf = defaultTheme) {
  const meRow = (st.players || []).find(p => p.id === st.you.id);
  const total = num(st.total);
  const joined = Math.max(0, num(st.you.joinedQ));
  if (!meRow || !total || joined >= total) return null;
  const per = {}, perPack = {}, perTheme = {};
  for (const [qi, last] of Object.entries(tracked.qs || {})) {
    const r = roundFormat(st, +qi);
    const c = last.correct ? 1 : 0, p = num(last.points);
    if (r?.format) bump(per, r.format, 1, c, p);
    const packs = Array.isArray(r?.packs) ? r.packs : [];
    if (packs.length === 1) bump(perPack, packs[0], 1, c, p);
    const ts = [...new Set(packs.map(themeOf).filter(Boolean))];
    if (ts.length === 1) bump(perTheme, ts[0], 1, c, p);
  }
  const rounds = st.spec?.rounds || [];
  const specPacks = rounds.flatMap(r => (Array.isArray(r.packs) ? r.packs : []));
  const counts = {};
  for (const p of specPacks) counts[p] = (counts[p] || 0) + 1;
  const tcounts = {};
  for (const t of specPacks.map(themeOf).filter(Boolean)) tcounts[t] = (tcounts[t] || 0) + 1;
  const players = st.players.length;
  const q = total - joined;
  return {
    mode: 'online', via, formats: [...new Set(rounds.map(r => r.format).filter(Boolean))], packs: top(counts), themes: top(tcounts),
    kids: !!st.kids, diff: num(st.difficulty), q, c: Math.min(q, num(meRow.correct)), pts: num(meRow.score), streak: num(meRow.best),
    secs: tracked.t0 ? Math.round((now - tracked.t0) / 1000) : Math.round(q * (num(st.answerSec || 10) + num(st.gapSec || 5) + 3)),
    n: players, placing: num(st.you.rank) || 1 + st.players.filter(p => num(p.score) > num(meRow.score)).length,
    rk: hashString(`${code}:${st.game ?? 0}:${st.you.id}`).toString(36), per, perPack, perTheme,
  };
}

/* ------------------------------------------------------------------ view */

const day = t => new Date(t).toISOString().slice(0, 10);
export const acc = (c, q) => (q > 0 ? Math.round((100 * c) / q) : 0);

export function dailyDays(s) {
  const out = {};
  for (const [d, mask] of Object.entries(s.dd || {})) out[d] = num(mask);
  for (const k of Object.keys(s.daily?.results || {})) {
    const [kind, d] = k.split(':');
    if (d && DAILY_BITS[kind]) out[d] = (out[d] || 0) | DAILY_BITS[kind];
  }
  return out;
}

export function dailyStreak(days, now = Date.now()) {
  let t = Date.parse(`${day(now)}T12:00:00Z`);
  if (!days[day(t)]) t -= 864e5;
  let n = 0;
  while (days[day(t)]) { n++; t -= 864e5; }
  return n;
}

const rowsOf = (agg, extra) => Object.entries(agg || {}).map(([id, r]) => ({
  id, g: num(r[G]), q: num(r[Q]), c: num(r[C]), p: num(r[P]), acc: acc(num(r[C]), num(r[Q])), ...(extra ? extra(r) : {}),
}));

export function statsView(s = getStats(), now = Date.now()) {
  const m = rowsOf(s.m, r => ({ best: num(r[BEST]), streak: num(r[STREAK]), secs: num(r[SECS]), wins: num(r[WIN]), pod: num(r[POD]) }));
  const sum = k => m.reduce((a, r) => a + r[k], 0);
  const countedQ = m.reduce((a, r) => a + r.q, 0), countedC = m.reduce((a, r) => a + r.c, 0);
  const earlier = { g: Math.max(0, num(s.games) - sum('g')), q: Math.max(0, num(s.answered) - countedQ), c: Math.max(0, num(s.correct) - countedC) };
  const days = dailyDays(s);
  const online = m.find(r => r.id === 'online');
  const h = Array.isArray(s.h) ? s.h : [];
  const week = now / 1000 - 7 * 86400;
  const thisWeek = h.filter(e => e.t >= week && e.m !== 'study');
  const packs = rowsOf(s.pk), themes = rowsOf(s.th);
  const ranked = (rows, min) => rows.filter(r => r.q >= min).sort((a, b) => b.acc - a.acc || b.q - a.q);
  const minQ = num(s.answered) > 200 ? 15 : 8;
  const strong = ranked(packs, minQ);
  const cal = [];
  for (let i = 27; i >= 0; i--) { const d = day(now - i * 864e5); cal.push({ day: d, mask: days[d] || 0 }); }
  return {
    empty: !num(s.games) && !h.length,
    games: num(s.games), answered: num(s.answered), correct: num(s.correct), acc: acc(num(s.correct), num(s.answered)),
    bestStreak: num(s.bestStreak), dailyStreak: dailyStreak(days, now), dailyDays: Object.keys(days).length,
    wins: online?.wins || 0, podiums: online?.pod || 0, onlineGames: online?.g || 0,
    secs: sum('secs') + num(s.sd?.[3]), since: h.length ? h[h.length - 1].t : 0,
    earlier: earlier.g || earlier.q ? earlier : null,
    modes: m, formats: rowsOf(s.f), themes, packs,
    strongest: strong.slice(0, 3), weakest: strong.slice(3).reverse().slice(0, 3).filter(r => r.acc < (strong[0]?.acc ?? 0) - 5),
    recent: h, thisWeek, calendar: cal,
    study: { sessions: num(s.sd?.[0]), cards: num(s.sd?.[1]), right: num(s.sd?.[2]), secs: num(s.sd?.[3]) },
    kidsStars: num(s.kidsStars), kidsThemes: Object.entries(s.kt || {}).sort((a, b) => b[1] - a[1]).map(([id, g]) => ({ id, g })),
    kidsGames: h.filter(e => e.k && e.m !== 'study').length,
  };
}

// Real, interesting one-liners for the home screen, each with a stable key so the shell can rotate through them.
export function highlights(v, { title = id => id, kids = false } = {}) {
  if (v.empty) return [];
  const out = [];
  const add = (key, text) => out.push({ key, text });
  if (kids) {
    if (v.kidsStars) add('stars', `⭐ ${v.kidsStars} stars collected`);
    if (v.kidsThemes[0]) add('fav', `💛 Your favourite: ${title(v.kidsThemes[0].id, 'theme')}`);
    if (v.bestStreak >= 3) add('streak', `🔥 ${v.bestStreak} right in a row!`);
    add('games', `🎈 ${v.games} game${v.games === 1 ? '' : 's'} played`);
    return out;
  }
  if (v.bestStreak >= 3) add('streak', `🔥 Best streak ${v.bestStreak}`);
  if (v.strongest[0]?.acc >= 60) add('strong', `🏅 You're ${v.strongest[0].acc}% on ${title(v.strongest[0].id, 'pack')}`);
  const wk = v.thisWeek;
  const wins = wk.filter(e => e.m === 'online' && e.pl === 1 && e.n > 1).length;
  if (wins) add('wins', `🏆 ${wins} online win${wins === 1 ? '' : 's'} this week`);
  if (v.dailyStreak >= 2) add('daily', `📅 ${v.dailyStreak}-day daily streak`);
  if (wk.length >= 2) {
    const q = wk.reduce((a, e) => a + (e.x ? 0 : e.q), 0), c = wk.reduce((a, e) => a + (e.x ? 0 : e.c), 0);
    add('week', q ? `📈 ${wk.length} games this week · ${acc(c, q)}% right` : `📈 ${wk.length} games this week`);
  }
  const fav = [...v.formats].sort((a, b) => b.g - a.g)[0];
  if (fav && fav.g >= 3) add('fav', `❤️ Most played: ${title(fav.id, 'format')} (${fav.g} games)`);
  if (v.secs >= 600) add('time', `⏱️ ${Math.round(v.secs / 3600) >= 2 ? `${Math.round(v.secs / 3600)} hours` : `${Math.round(v.secs / 60)} minutes`} of Clued played`);
  if (v.answered) add('acc', `🎯 ${v.correct.toLocaleString('en')} right answers · ${v.acc}%`);
  return out;
}
