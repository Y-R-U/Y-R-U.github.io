#!/usr/bin/env node
// Detailed stats (js/core/stats.js): aggregation, migration, history cap, size budget, cloud-merge behaviour, room tracking.
// Usage: node tools/stats_test.mjs   (STATS_MODULE=js/core/x.js runs the same checks against a deliberately broken copy)
import { readFileSync } from 'node:fs';

const mem = new Map();
let writes = 0;
globalThis.localStorage = {
  getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { writes++; mem.set(k, String(v)); },
  removeItem: k => mem.delete(k), clear: () => mem.clear(),
};
const imp = p => import(new URL(`../${p}`, import.meta.url).href);
let fails = 0, passes = 0;
const ok = (c, msg) => { if (c) passes++; else { fails++; console.error('FAIL', msg); } };

const store = await imp('js/core/store.js');
const S = await imp(process.env.STATS_MODULE || 'js/core/stats.js');
const THEME = { snakes: 'animals', sharks: 'animals', capitals: 'geography', hits: 'music', paintings: 'art', general: 'general' };
const themeOf = p => THEME[p] || null;
const NOW = Date.parse('2026-10-08T15:00:00Z');
const raw = () => JSON.parse(mem.get('clued.stats') || '{}');

const q = (id, pack, format = 'mc') => ({ id, format, refs: [`${pack}/${id}`] });
function soloRes(spec, list) {
  const questions = list.map(([id, pack, fmt]) => q(id, pack, fmt));
  let streak = 0, best = 0, correct = 0, score = 0;
  const answers = list.map(([id, , fmt, c, pts = c ? 300 : 0, extra = {}], i) => {
    if (c) { streak++; best = Math.max(best, streak); correct++; score += pts; } else streak = 0;
    return { i, qid: id, format: fmt || 'mc', correct: !!c, points: pts, ms: 4000, ...extra };
  });
  return { score, correct, answered: answers.filter(a => !a.skipped).length, total: list.length, answers, bestStreak: best, questions, players: [{ name: 'You' }] };
}
const spec1 = { structure: 'quick', rounds: [{ format: 'mc', packs: ['snakes', 'capitals'], difficulty: 2 }], kids: false };

// ---- aggregation
{
  mem.clear();
  const res = soloRes(spec1, [['a', 'snakes', 'mc', 1], ['b', 'snakes', 'mc', 1], ['c', 'capitals', 'tf', 0], ['d', 'capitals', 'tf', 1], ['e', 'snakes', 'mc', 0, 0, { skipped: true }]]);
  const sum = S.summarize('quick', res, { spec: spec1, themeOf, secs: 95 });
  ok(sum.q === 4 && sum.c === 3, `skips don't count as answered (q ${sum.q}, c ${sum.c})`);
  ok(sum.streak === 2 && sum.pts === 900, 'best streak and points from the game');
  ok(sum.per.mc[0] === 2 && sum.per.tf[0] === 2 && sum.per.tf[1] === 1, 'per-format answered/correct');
  ok(sum.perPack.snakes[0] === 2 && sum.perPack.capitals[1] === 1, 'per-pack from question refs');
  ok(sum.perTheme.animals[0] === 2 && sum.perTheme.geography[0] === 2, 'per-theme via the pack theme');
  ok(sum.diff === 2 && sum.formats.includes('tf') && sum.packs.length === 2, 'difficulty, formats, packs');
  const e = S.recordGame(sum, { now: NOW });
  const s = raw();
  ok(e && e.m === 'quick' && e.q === 4 && e.c === 3 && e.du === 95 && e.p === 900, 'history entry');
  ok(s.games === 1 && s.answered === 4 && s.correct === 3 && s.bestStreak === 2, 'legacy totals kept up to date (cloud describe + old code)');
  ok(s.m.quick[0] === 1 && s.m.quick[1] === 4 && s.m.quick[2] === 3 && s.m.quick[4] === 900 && s.m.quick[6] === 95, 'mode row [g,q,c,p,best,streak,secs]');
  ok(s.f.mc[0] === 1 && s.f.mc[1] === 2 && s.th.animals[2] === 2 && s.pk.capitals[1] === 2, 'format/theme/pack rows');
  S.recordGame(S.summarize('quick', soloRes(spec1, [['f', 'snakes', 'mc', 1]]), { spec: spec1, themeOf, secs: 10 }), { now: NOW + 1000 });
  const s2 = raw();
  ok(s2.m.quick[0] === 2 && s2.m.quick[4] === 900 && s2.pk.snakes[0] === 2 && s2.pk.snakes[1] === 3, 'second game accumulates; best keeps the max');
  ok(s2.h[0].t > s2.h[1].t, 'history is newest first');
  const v = S.statsView(store.getStats(), NOW + 2000);
  ok(v.games === 2 && v.acc === 80 && v.earlier === null, `view totals (acc ${v.acc})`);
  ok(v.secs === 105, 'time played sums mode seconds');
}

// ---- party / pub quiz teams: only player 1 is "you"; duel never touches accuracy
{
  mem.clear();
  const res = soloRes(spec1, [['a', 'snakes', 'mc', 1], ['b', 'snakes', 'mc', 1], ['c', 'snakes', 'mc', 0], ['d', 'snakes', 'mc', 1]]);
  res.answers.forEach((a, i) => { a.player = i % 2; });
  res.players = [{ name: 'Me', score: 300, bestStreak: 1 }, { name: 'Sam', score: 600, bestStreak: 2 }];
  const sum = S.summarize('party', res, { spec: spec1, themeOf });
  ok(sum.q === 2 && sum.c === 1 && sum.pts === 300 && sum.placing === 2 && sum.n === 2, `party counts player 1 only (q ${sum.q} c ${sum.c} pl ${sum.placing})`);
  S.recordGame(sum, { now: NOW });
  const duel = { score: 4, correct: 7, answered: 10, total: 10, answers: [], duel: true, players: [{ name: 'Red', score: 4, correct: 4 }, { name: 'Teal', score: 3, correct: 3 }] };
  const ds = S.summarize('duel', duel, { spec: spec1, themeOf });
  ok(ds.counted === false && ds.placing === 1 && ds.c === 4, 'duel: Red is you, a win, not counted for accuracy');
  S.recordGame(ds, { now: NOW + 1 });
  const s = raw();
  ok(s.games === 2 && s.answered === 2 && s.correct === 1, 'duel adds a game but no answers');
  ok(s.m.duel[7] === 1 && s.m.party[7] === 0, 'duel win recorded');
}

// ---- migration of the old totals ("9 games · 105/128 right · best streak 14")
{
  mem.clear();
  const legacy = { games: 9, answered: 128, correct: 105, bestStreak: 14, best: { quick: 2400 }, daily: { last: '2026-10-06', results: { 'main:2026-10-06': { score: 1, correct: 8, total: 10, grid: '' } } }, kidsStars: 23 };
  mem.set('clued.stats', JSON.stringify(legacy));
  writes = 0;
  const v0 = S.statsView(store.getStats(), NOW);
  S.highlights(v0, { kids: false });
  ok(writes === 0, 'reading/migrating the view never writes (a boot write would beat a newer cloud save)');
  ok(v0.games === 9 && v0.earlier && v0.earlier.g === 9 && v0.earlier.q === 128 && v0.earlier.c === 105, 'old totals show as earlier games');
  ok(v0.bestStreak === 14 && v0.acc === 82, 'old best streak and accuracy survive');
  S.recordGame(S.summarize('blitz', soloRes(spec1, [['a', 'snakes', 'mc', 1], ['b', 'snakes', 'mc', 0]]), { spec: spec1, themeOf }), { now: NOW });
  const s = raw();
  ok(s.v === 2 && s.games === 10 && s.answered === 130 && s.correct === 106 && s.bestStreak === 14, 'first new game adds on top of the old totals');
  ok(s.kidsStars === 23 && s.daily.results['main:2026-10-06'] && s.best.quick === 2400, 'unrelated fields (stickers, daily, best) are preserved');
  const v = S.statsView(store.getStats(), NOW);
  ok(v.earlier.g === 9 && v.earlier.q === 128 && v.modes.find(r => r.id === 'blitz').g === 1, 'earlier row stays at the old 9 games');
}

// ---- history cap + size budget (500 varied games, Firestore doc shared with mastery/cards/favs/settings)
{
  mem.clear();
  const packs = Object.keys(THEME);
  const modes = ['quick', 'survival', 'blitz', 'ladder', 'daily', 'pubquiz', 'party', 'online', 'challenge', 'linkchallenge'];
  const fmts = ['mc', 'tf', 'odd', 'match', 'order', 'reveal', 'flag-map', 'listen', 'connect', 'type'];
  for (let g = 0; g < 500; g++) {
    const list = Array.from({ length: 10 }, (_, i) => [`q${g}-${i}`, packs[(g + i) % packs.length], fmts[(g * 3 + i) % fmts.length], (g + i) % 3 !== 0]);
    const mode = modes[g % modes.length];
    const sp = { structure: mode, rounds: [{ format: fmts[g % fmts.length], packs: [packs[g % packs.length]], difficulty: g % 4 }] };
    const day = new Date(NOW - (500 - g) * 864e5 / 3).toISOString().slice(0, 10);
    const sum = S.summarize(mode, soloRes(sp, list), { spec: sp, themeOf, secs: 120 + g, daily: mode === 'daily' ? 'main' : undefined, day, players: mode === 'online' ? 6 : undefined, placing: mode === 'online' ? 1 + (Math.floor(g / 10) % 6) : undefined, rk: mode === 'online' ? `r${g}` : undefined });
    S.recordGame(sum, { now: NOW - (500 - g) * 3600e3 });
  }
  for (let i = 0; i < 40; i++) S.recordStudy({ cards: 20, right: 15, packs: ['snakes', 'sharks'], secs: 300 });
  const st = S.recordStudy({ cards: 12, right: 9, packs: ['snakes'], secs: 120, mode: 'mc' });
  ok(st && st.m === 'study' && st.sm === 'mc' && st.q === 12 && st.c === 9 && st.du === 120, 'study session keeps cards, right, mode, time');
  const s = raw();
  const bytes = mem.get('clued.stats').length;
  console.log(`  size: ${bytes} bytes for 500 games + 40 study sessions (history ${s.h.length}, days ${Object.keys(s.dd || {}).length})`);
  ok(s.h.length === S.HISTORY_CAP, `history capped at ${S.HISTORY_CAP} (got ${s.h.length})`);
  ok(s.games === 500 && s.sd[0] === 41, 'totals keep counting past the cap; study is separate');
  ok(s.m.quick[0] === 50 && Object.values(s.m).reduce((a, r) => a + r[0], 0) === 500, 'mode rows add up to all 500 games');
  ok(Object.keys(s.dd).length <= S.DAYS_CAP, 'daily calendar capped');
  ok(bytes < 48 * 1024, `clued.stats under 48 KB (${bytes})`);
  const v = S.statsView(store.getStats(), NOW);
  ok(v.earlier === null, 'no phantom earlier games after only detailed play');
  ok(v.wins === s.m.online[7] && v.wins > 0 && v.podiums >= v.wins, 'online wins/podiums from the online row');
  ok(v.strongest.length === 3 && v.strongest[0].acc >= v.strongest[2].acc && (!v.weakest.length || v.weakest[0].acc <= v.strongest[2].acc), 'strongest/weakest topics ordered');
}

// ---- cloud merge behaviour (localsync mirrors raw strings; newest savedAt wins wholesale)
{
  mem.clear();
  S.recordGame(S.summarize('quick', soloRes(spec1, [['a', 'snakes', 'mc', 1], ['b', 'capitals', 'mc', 0]]), { spec: spec1, themeOf }), { now: NOW });
  const before = S.statsView(store.getStats(), NOW);
  // Firestore round trip reorders keys: the view must not care
  const reorder = o => (Array.isArray(o) ? o.map(reorder) : o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).reverse().map(([k, x]) => [k, reorder(x)])) : o);
  mem.set('clued.stats', JSON.stringify(reorder(raw())));
  const after = S.statsView(store.getStats(), NOW);
  ok(after.games === before.games && after.acc === before.acc && after.modes.length === before.modes.length && after.recent[0].t === before.recent[0].t, 'key order from a cloud round trip changes nothing');
  // an older Clued on another device adopted this save and played 3 games (old totals only)
  const old = raw(); old.games += 3; old.answered += 30; old.correct += 20;
  mem.set('clued.stats', JSON.stringify(old));
  const v = S.statsView(store.getStats(), NOW);
  ok(v.earlier && v.earlier.g === 3 && v.earlier.q === 30 && v.earlier.c === 20, 'games from an old client show as earlier games, not lost');
  // a cloud save with fewer totals than the detailed rows (never negative)
  const odd = raw(); odd.games = 0; odd.answered = 0; odd.correct = 0;
  mem.set('clued.stats', JSON.stringify(odd));
  ok(S.statsView(store.getStats(), NOW).earlier === null, 'earlier never goes negative');
  // adopting a pre-detail cloud save, then playing
  mem.set('clued.stats', JSON.stringify({ games: 4, answered: 40, correct: 30, bestStreak: 6, best: {}, daily: { last: '', results: {} } }));
  S.recordGame(S.summarize('quick', soloRes(spec1, [['z', 'snakes', 'mc', 1]]), { spec: spec1, themeOf }), { now: NOW });
  ok(raw().games === 5 && raw().h.length === 1, 'recording on top of an adopted old-format save works');
  // stickers write through updateStats and must keep the detailed fields
  const { addStars } = { addStars: n => store.updateStats(s => { s.kidsStars = (s.kidsStars || 0) + n; }) };
  addStars(3);
  ok(raw().h.length === 1 && raw().m.quick[0] === 1 && raw().kidsStars === 3, 'other writers (stickers) preserve history and rows');
  // the same room final seen twice (refresh, or a second tab) records once
  const sum = { mode: 'online', q: 5, c: 3, pts: 900, n: 3, placing: 1, rk: 'abc' };
  S.recordGame(sum, { now: NOW }); S.recordGame(sum, { now: NOW + 5 });
  ok(raw().m.online[0] === 1 && raw().m.online[7] === 1 && raw().m.online[8] === 1, 'room result de-duplicated by its hash; win + podium');
  const obj = {};
  S.applyGame(obj, sum, NOW); S.applyGame(obj, sum, NOW + 9);
  ok(obj.m.online[0] === 1 && obj.h.length === 1, 'applyGame itself refuses a room hash it already has');
}

// ---- daily streak + calendar
{
  mem.clear();
  const today = new Date(NOW).toISOString().slice(0, 10);
  const dayAgo = n => new Date(NOW - n * 864e5).toISOString().slice(0, 10);
  mem.set('clued.stats', JSON.stringify({ games: 3, daily: { last: dayAgo(1), results: { [`main:${dayAgo(1)}`]: {}, [`map:${dayAgo(2)}`]: {}, [`main:${dayAgo(4)}`]: {} } } }));
  let v = S.statsView(store.getStats(), NOW);
  ok(v.dailyStreak === 2, `streak runs to yesterday when today isn't played yet (${v.dailyStreak})`);
  S.recordGame(S.summarize('daily', soloRes(spec1, [['a', 'snakes', 'mc', 1]]), { spec: spec1, themeOf, daily: 'kids', day: today }), { now: NOW });
  v = S.statsView(store.getStats(), NOW);
  ok(v.dailyStreak === 3 && raw().dd[today] === S.DAILY_BITS.kids, 'playing today extends it; kinds kept as a bitmask');
  ok(v.calendar.length === 28 && v.calendar[27].day === today && v.calendar[27].mask === 2 && v.calendar[25].mask === 4, 'calendar strip ends today');
}

// ---- online room tracking (the podium path)
{
  mem.clear();
  const base = { game: 1, total: 4, roundSizes: [2, 2], spec: { rounds: [{ format: 'mc', packs: ['snakes'] }, { format: 'listen', packs: ['hits'] }] }, kids: false, difficulty: 0, answerSec: 10, gapSec: 5 };
  const you = { id: 'p1', joinedQ: 0, rank: 2 };
  const players = [{ id: 'p2', score: 1500, correct: 4, best: 4 }, { id: 'p1', score: 1100, correct: 3, best: 2 }, { id: 'p3', score: 200, correct: 1, best: 1 }];
  const st = (phase, qi, last, extra = {}) => ({ ...base, phase, q: qi, players, you: { ...you, ...(last ? { last } : {}) }, ...extra });
  ok(S.trackRoom(st('lobby', -1), 'ABCDE', 'server', NOW) === null, 'lobby records nothing');
  S.trackRoom(st('question', 0), 'ABCDE', 'server', NOW + 1000);
  S.trackRoom(st('reveal', 0, { correct: true, points: 400 }), 'ABCDE', 'server', NOW + 12000);
  S.trackRoom(st('reveal', 1, { correct: true, points: 450 }), 'ABCDE', 'server', NOW + 30000);
  S.trackRoom(st('reveal', 2, { correct: false, points: 0 }), 'ABCDE', 'server', NOW + 50000);
  const e = S.trackRoom(st('final', 3, { correct: true, points: 250 }), 'ABCDE', 'server', NOW + 71000);
  ok(e && e.m === 'online' && e.n === 3 && e.pl === 2 && e.q === 4 && e.c === 3 && e.p === 1100 && e.du === 70, `final records the room (pl ${e?.pl}, du ${e?.du})`);
  ok(e && e.rk && !JSON.stringify(e).includes('ABCDE'), 'room code stored only as a hash, no names');
  ok(S.trackRoom(st('final', 3, { correct: true, points: 250 }), 'ABCDE', 'server', NOW + 72000) === null && raw().m.online[0] === 1, 'repeated final states record once');
  const s = raw();
  ok(s.f.mc[1] === 2 && s.f.listen[1] === 2 && s.f.listen[2] === 1, 'per-format results from the reveal states and round sizes');
  ok(s.m.online[8] === 1 && s.m.online[7] === 0, '2nd of 3 is a podium, not a win');
  ok(S.trackRoom({ ...st('final', 3), game: 2, you: { id: 'p1', joinedQ: 4 } }, 'ABCDE', 'p2p', NOW) === null, 'a seat that joined after the last question records nothing');
  const e2 = S.trackRoom({ ...st('final', 3), game: 3, you: { id: 'p1', joinedQ: 1, rank: 1 } }, 'ABCDE', 'p2p', NOW);
  ok(e2 && e2.q === 3 && e2.v === 'p2p' && e2.pl === 1, 'late joiner: questions from their first; device-hosted rooms tagged');
}

// ---- highlights, reset
{
  mem.clear();
  ok(S.highlights(S.statsView(store.getStats(), NOW)).length === 0, 'no highlight before any game');
  mem.set('clued.stats', JSON.stringify({ games: 9, answered: 128, correct: 105, bestStreak: 14, kidsStars: 12, daily: { last: '', results: {} } }));
  const hl = S.highlights(S.statsView(store.getStats(), NOW));
  ok(hl.some(x => x.key === 'streak' && /14/.test(x.text)) && hl.some(x => x.key === 'acc' && /82%/.test(x.text)), 'highlights are real numbers');
  ok(S.highlights(S.statsView(store.getStats(), NOW), { kids: true }).some(x => /12 stars/.test(x.text)), 'kids highlights talk about stars');
  S.resetStats();
  const s = raw();
  ok(s.games === 0 && !s.h && s.kidsStars === 12 && s.daily, 'reset clears stats, keeps stickers and daily results');
  ok(S.statsView(store.getStats(), NOW).empty, 'empty after reset');
}

// ---- wiring: every mode end calls into stats
{
  const src = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
  ok(/recordGame\(summarize\(/.test(src('js/ui/results.js')), 'results screen (quick/survival/blitz/ladder/daily/party/pub quiz/duel) records');
  ok(/trackRoom\(st, code, via\)/.test(src('js/net/room.js')), 'room state (server + P2P) feeds trackRoom');
  ok(/recordGame\(summarize\('challenge'/.test(src('js/net/challenge.js')), 'server challenge records');
  ok(/recordGame\(summarize\('linkchallenge'/.test(src('js/net/linkchallenge.js')), 'link challenge records');
  ok(/recordStudy\(/.test(src('js/learn/cards.js')), 'flashcard sessions record study stats');
  ok(!/export function recordGame/.test(src('js/core/store.js')), 'the old totals-only recordGame is gone (one path)');
  ok(/structure: 'duel'/.test(src('js/structures/duel.js')), 'duel goes through the results screen');
}

console.log(`stats_test: ${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
