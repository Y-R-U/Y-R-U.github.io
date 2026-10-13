#!/usr/bin/env node
// DIFFMIX unit test: blend counts per size, rounds never short, the mix hits its target, kids / ladder / daily / old
// (pre-blend) specs unchanged, same seed = same questions, spec.fresh replays identically, local shares still met,
// an Easy round never opens on a hard question. Exit 1 on any failure.
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const realFetch = globalThis.fetch;
globalThis.fetch = async (u, o) => {
  const s = String(u?.url || u);
  if (!s.startsWith('file:')) return realFetch(u, o);
  try { return new Response(await readFile(fileURLToPath(s.split(/[?#]/)[0])), { status: 200 }); }
  catch { return new Response('', { status: 404 }); }
};
const mem = new Map();
globalThis.localStorage = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) };
const js = p => pathToFileURL(join(ROOT, 'js', p)).href;
const { MODULES } = await import(js('formats/index.js'));
for (const m of MODULES) await import(new URL(m, js('formats/index.js')).href);
const { makeSpec, buildQuestions, kidsOk, kidsView } = await import(js('core/spec.js'));
const D = await import(js('core/diffmix.js'));
const F = await import(js('core/fresh.js'));
const { SUGGESTED } = await import(js('net/suggested.js'));

let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { fails++; console.log('FAIL', m); } };
const sig = qs => qs.map(q => `${q.round}:${q.id}:${F.dupKey(q)}`).join('\n');
const mixOf = qs => [1, 2, 3].map(l => qs.filter(q => q.lv === l).length);
const strip = s => { const c = JSON.parse(JSON.stringify(s)); delete c.blend; return c; };

// ---- counts
for (let n = 1; n <= 40; n++) for (const d of [1, 2, 3]) {
  const c = D.blendCounts(n, d);
  ok(c.reduce((a, b) => a + b, 0) === n && c.every(x => x >= 0), `blendCounts(${n}, ${d}) sums to ${n}: ${c}`);
  ok(c[d - 1] === Math.max(...c), `blendCounts(${n}, ${d}) favours its own level: ${c}`);
}
const exp = { '10:1': '6/3/1', '10:2': '2/6/2', '10:3': '1/3/6', '5:1': '3/2/0', '5:2': '1/3/1', '5:3': '0/2/3', '20:1': '12/6/2', '15:3': '1/5/9', '6:1': '4/2/0', '7:1': '4/2/1' };
for (const [k, v] of Object.entries(exp)) { const [n, d] = k.split(':').map(Number); ok(D.blendCounts(n, d).join('/') === v, `blendCounts(${n}, ${d}) = ${v} (got ${D.blendCounts(n, d).join('/')})`); }

// ---- pickBlend on synthetic pools: borrowing, never short, local split
const mk = (lv, n, loc = false, tag = '') => Array.from({ length: n }, (_, i) => ({ q: { id: `${tag}${lv}${loc ? 'L' : ''}${i}` }, lv, loc }));
let p = D.pickBlend({ cands: [...mk(1, 10), ...mk(2, 10), ...mk(3, 2)], count: 10, difficulty: 3, seed: 's' });
ok(p.head.length === 10 && p.head.filter(c => c.lv === 3).length === 2 && p.head.filter(c => c.lv === 2).length === 7, `hard short borrows medium first: ${mixOf(p.head.map(c => ({ lv: c.lv })))}`);
p = D.pickBlend({ cands: [...mk(2, 10), ...mk(3, 10)], count: 10, difficulty: 3, seed: 's' });
ok(mixOf(p.head.map(c => ({ lv: c.lv }))).join('/') === '0/4/6', `no easy in a Hard round: the easy slot goes to the nearest level, medium (${mixOf(p.head.map(c => ({ lv: c.lv })))})`);
p = D.pickBlend({ cands: [...mk(1, 3)], count: 10, difficulty: 3, seed: 's' });
ok(p.head.length === 3, 'a tiny pool gives all it has');
p = D.pickBlend({ cands: [...mk(1, 10), ...mk(2, 10), ...mk(3, 10), ...mk(1, 10, true), ...mk(2, 10, true), ...mk(3, 10, true)], count: 10, difficulty: 1, localTarget: 6, seed: 's' });
ok(p.head.filter(c => c.loc).length === 6 && mixOf(p.head.map(c => ({ lv: c.lv }))).join('/') === '6/3/1', 'local 6 of 10 and the blend both met');
ok(mixOf(p.head.filter(c => c.loc).map(c => ({ lv: c.lv }))).join('/') === '4/2/0' || mixOf(p.head.filter(c => c.loc).map(c => ({ lv: c.lv }))).join('/') === '4/1/1', 'local items follow the blend');
p = D.pickBlend({ cands: [...mk(1, 10), ...mk(2, 10), ...mk(3, 10), ...mk(3, 8, true)], count: 10, difficulty: 1, localTarget: 6, seed: 's' });
ok(p.head.filter(c => c.loc).length === 6 && p.head.length === 10, 'the local share beats the blend when local items are all hard (as before)');
for (let s = 0; s < 30; s++) {
  const h = D.pickBlend({ cands: [...mk(1, 6), ...mk(2, 6), ...mk(3, 6)], count: 10, difficulty: 1, seed: `o${s}` }).head;
  if (h[0].lv === 3) { ok(false, `Easy opens on hard (seed o${s})`); break; }
}

// ---- real builds: never short, mix on target, deterministic, no hard opener on Easy
const FORMATS = [['mc', {}], ['tf', {}], ['type', {}], ['number', {}], ['map-click', { ask: 'tap' }], ['map-click', { ask: 'name' }], ['listen', {}]];
for (const [f, opts] of FORMATS) for (const d of [1, 2, 3]) for (const seed of ['a', 'b', 'c']) {
  const spec = makeSpec('quick', [{ format: f, count: 10, difficulty: d, opts }], `t-${seed}`);
  const a = await buildQuestions(spec);
  const pure = await buildQuestions(strip(spec));
  ok(a.questions.length >= Math.min(10, pure.questions.length) && a.questions.length === 10, `${f}/${opts.ask || ''} d${d} ${seed}: full round (${a.questions.length})`);
  ok(mixOf(a.questions).join('/') === D.blendCounts(10, d).join('/'), `${f}/${opts.ask || ''} d${d} ${seed}: mix ${mixOf(a.questions)} = ${D.blendCounts(10, d)}`);
  ok(sig((await buildQuestions(spec)).questions) === sig(a.questions), `${f} d${d} ${seed}: same seed = same questions`);
  if (d === 1) ok(a.questions[0].lv !== 3, `${f} Easy ${seed}: opens on ${a.questions[0].lv}`);
  ok(pure.questions.every(q => q.lv === undefined), `${f} d${d}: a spec without blend takes the old path`);
}
// round sizes and a whole pub quiz at each level: never shorter than the pure build
const pub = SUGGESTED.find(s => s.id === 'pub');
for (const d of [1, 2, 3]) for (const n of [5, 7, 20]) {
  const rounds = pub.rounds.map(r => ({ ...r, count: n, difficulty: d }));
  const b = await buildQuestions(makeSpec('online', rounds, `pq${d}${n}`));
  const pure = await buildQuestions(strip(makeSpec('online', rounds, `pq${d}${n}`)));
  rounds.forEach((r, i) => {
    const got = b.questions.filter(q => q.round === i).length, was = pure.questions.filter(q => q.round === i).length;
    ok(got >= was, `pub round ${i} (${r.format}) d${d} ×${n}: ${got} vs pure ${was}`);
  });
}

// ---- kids:false (explicit songs) never reach kids mode, whatever their difficulty
const kpack = { id: 'kp', kids: true, items: [{ id: 'a', difficulty: 1, kids: false, explicit: true }, { id: 'b', difficulty: 1 }, { id: 'c', difficulty: 1, facts: { kids: false } }], questions: [{ id: 'q', difficulty: 1, kids: false }] };
ok(!kidsOk(kpack.items[0], kpack) && kidsOk(kpack.items[1], kpack) && !kidsOk(kpack.items[2], kpack) && !kidsOk(kpack.questions[0], kpack), 'kidsOk rejects kids:false at difficulty 1');
ok(kidsView(kpack).items.map(i => i.id).join() === 'b' && !kidsView(kpack).questions.length, 'kidsView drops kids:false items and questions');

// ---- exceptions
const same = async (spec, m) => ok(sig((await buildQuestions(spec)).questions) === sig((await buildQuestions(strip(spec))).questions), m);
await same(makeSpec('quick', [{ format: 'mc', count: 10, difficulty: 1 }], 'kids1', { kids: true }), 'kids mode stays pure');
await same(makeSpec('party', [{ format: 'mc', count: 10, difficulty: 1, kids: true }], 'kids2'), 'a kids player in party stays pure');
await same(makeSpec('ladder', [1, 2, 3].map(d => ({ format: 'mc', count: 5, difficulty: d })), 'lad'), 'ladder stages unchanged');
const daily = makeSpec('daily', [{ format: 'mc', count: 7, difficulty: 0 }, { format: 'tf', count: 3, difficulty: 0 }], 'daily:2026-10-13', { daily: 'main' });
ok(!('blend' in daily), 'daily spec carries no blend flag');
await same({ ...daily, blend: 1 }, 'daily unchanged even with the flag');
await same({ ...daily, rounds: daily.rounds.map(r => ({ ...r, difficulty: 2 })), blend: 1 }, 'daily ignores the blend at any difficulty');
await same(makeSpec('quick', [{ format: 'mc', count: 10, difficulty: 0 }], 'mixed'), 'Mixed (0) unchanged');
ok(makeSpec('quick', []).blend === 1, 'new specs carry blend: 1');

// ---- FRESH: unseen first per level, spec.fresh replays identically (plain + LOCAL)
F.resetSeen();
for (const local of [null, { cc: 'AUS', level: 'most', live: true }, { cc: 'USA', level: 'more', live: false }]) {
  const extra = local ? { local } : {};
  const rounds = [{ format: 'mc', count: 10, difficulty: 1 }, { format: 'tf', count: 10, difficulty: 3 }, { format: 'map-click', count: 10, difficulty: 2 }];
  const s0 = makeSpec('quick', rounds, 'fr0', extra), s1 = makeSpec('quick', rounds, 'fr1', extra);
  const repeats = async plain => {
    F.resetSeen();
    const g0 = await buildQuestions(plain ? strip(s0) : s0, { fresh: F.freshFrom() });
    F.recordSeen(g0.questions);
    const g1 = await buildQuestions(plain ? strip(s1) : s1, { fresh: F.freshFrom() });
    return [g1, g1.questions.filter(q => g0.questions.some(x => F.dupKey(x) === F.dupKey(q))).length];
  };
  const [, purer] = await repeats(true);
  const [g1, overlap] = await repeats(false);
  ok(overlap <= Math.max(1, purer + 1), `${local?.cc || 'plain'}: second game avoids the first (${overlap} repeats, pure ${purer})`);
  if (!local) ok(rounds.every((r, i) => mixOf(g1.questions.filter(q => q.round === i)).join('/') === D.blendCounts(10, r.difficulty).join('/')), 'FRESH keeps the blend');
  const re = await buildQuestions({ ...JSON.parse(JSON.stringify(s1)), fresh: g1.fresh });
  ok(sig(re.questions) === sig(g1.questions), `${local?.cc || 'plain'}: spec.fresh replay identical`);
  F.resetSeen();
}

// ---- LOCAL: shares still met
for (const [cc, level] of [['AUS', 'more'], ['AUS', 'most'], ['USA', 'all'], ['GBR', 'most'], ['JPN', 'more']]) for (const d of [1, 2, 3]) {
  const report = [];
  const rounds = [{ format: 'mc', count: 10, difficulty: d }, { format: 'tf', count: 10, difficulty: d }, { format: 'map-click', count: 10, difficulty: d }];
  const b = await buildQuestions(makeSpec('quick', rounds, `lc${cc}${level}${d}`, { local: { cc, level, live: true } }), { report });
  for (const row of report) {
    ok(row.local >= Math.min(row.target, row.pool) - 1, `${cc} ${level} d${d} round ${row.round}: local ${row.local} vs target ${row.target} (pool ${row.pool})`);
    ok(row.got === 10, `${cc} ${level} d${d} round ${row.round}: full (${row.got})`);
  }
  // the share beats the blend, so only "More" (25%) must still land within one of the target per level
  if (level === 'more') rounds.forEach((r, i) => {
    const m = mixOf(b.questions.filter(q => q.round === i)), t = D.blendCounts(10, d);
    ok(m.every((x, k) => Math.abs(x - t[k]) <= 1), `${cc} ${level} d${d} round ${i}: mix ${m} near ${t}`);
  });
}

console.log(`diffmix_test: ${checks - fails}/${checks} passed`);
process.exit(fails ? 1 : 0);
