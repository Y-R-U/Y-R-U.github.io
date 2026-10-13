#!/usr/bin/env node
// FRESH unit test: the seen history (shape, cap, order), soft avoid (never shortens a round, unseen first, oldest seen
// next), spec.fresh replays the exact set (link challenges), local focus shares survive, and builds without `fresh`
// (daily, challenges) ignore the history. Exit 1 on any failure.
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const realFetch = globalThis.fetch;
globalThis.fetch = async (u, o) => {
  const s = String(u?.url || u);
  if (!s.startsWith('file:')) return realFetch(u, o);
  try { return new Response(await readFile(fileURLToPath(s.split(/[?#]/)[0])), { status: 200, headers: { 'content-type': 'application/json' } }); }
  catch { return new Response('', { status: 404 }); }
};
const mem = new Map();
globalThis.localStorage = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) };
const js = p => pathToFileURL(join(ROOT, 'js', p)).href;
const { MODULES } = await import(js('formats/index.js'));
for (const m of MODULES) await import(new URL(m, js('formats/index.js')).href);
const { makeSpec, buildQuestions } = await import(js('core/spec.js'));
const F = await import(js('core/fresh.js'));
const { KEYS, SYNCED } = await import(js('core/store.js'));
const { SUGGESTED, SUGGESTED_KIDS } = await import(js('net/suggested.js'));
const { isLocalQ } = await import(js('core/local.js'));

let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { fails++; console.log('FAIL', m); } };
const sig = qs => qs.map(q => `${q.round}:${q.id}:${F.dupKey(q)}`).join('\n');
const roomSpec = (rounds, seed, extra = {}) => makeSpec('online', rounds.map(r => ({ format: r.format, packs: r.packs, count: r.count, difficulty: r.kids ? 1 : (r.difficulty || 0),
  opts: { ...(r.opts || {}), online: true } })), seed, extra);
const perRound = (spec, qs) => spec.rounds.map((_, i) => qs.filter(q => q.round === i).length);

// ---- history store
F.resetSeen();
ok(SYNCED.includes(KEYS.seen) && KEYS.seen === 'clued.seen', 'clued.seen is a synced key');
const fake = n => Array.from({ length: n }, (_, i) => ({ prompt: `Question ${i}?`, answer: `A${i}` }));
F.recordSeen(fake(5000));
let raw = JSON.parse(localStorage.getItem(KEYS.seen));
ok(raw.v === 1 && typeof raw.h === 'string' && Array.isArray(raw.g), 'stored shape { v, h, g }');
ok(raw.h.length === F.SEEN_MAX * F.W && F.seenInfo().count === F.SEEN_MAX, `capped at ${F.SEEN_MAX} (${raw.h.length / F.W})`);
ok(localStorage.getItem(KEYS.seen).length < 20000, `compact: ${localStorage.getItem(KEYS.seen).length} bytes`);
const age = F.freshFrom();
ok(age.age(F.qTok(fake(5000)[4999])) === F.SEEN_MAX - 1 && age.age(F.qTok(fake(5000)[0])) === undefined, 'newest kept, oldest dropped');
F.recordSeen([fake(5000)[2500]]);
ok(F.freshFrom().age(F.qTok(fake(5000)[2500])) === F.SEEN_MAX - 1 && F.seenInfo().count === F.SEEN_MAX, 're-asked question moves to newest, no duplicate');
for (let i = 0; i < 12; i++) F.recordSeen(fake(3));
raw = JSON.parse(localStorage.getItem(KEYS.seen));
ok(raw.g.length === 10 && raw.g.at(-1)[0] === 0 && raw.g.at(-1)[1] === 3, 'per-game [new, total] keeps the last 10');
localStorage.setItem(KEYS.seen, JSON.stringify({ v: 1, h: 'ab<cd', g: 'x' }));
ok(F.seenInfo().count === 0 && F.recordSeen(fake(2)) === 2, 'corrupt history is ignored, not thrown');
localStorage.setItem(KEYS.seen, JSON.stringify({ v: 1, h: 'abcdefg' }));
ok(F.seenInfo().count === 1, 'a partial token is trimmed');
F.resetSeen();
ok(F.seenInfo().count === 0, 'reset empties it');

// ---- soft avoid on the Classic Pub Quiz: unseen first, never short
const pub = SUGGESTED.find(s => s.id === 'pub');
F.resetSeen();
const a = new Set();
for (let g = 0; g < 3; g++) {
  const prev = await buildQuestions(roomSpec(pub.rounds, `fr-${g}`), { sparesRatio: 0.8, fresh: F.freshFrom() });
  F.recordSeen(prev.questions);
  prev.questions.forEach(q => a.add(F.dupKey(q)));
}
const nonGeo = q => q.round !== 2;   // the easy world map has only ~38 countries
const spec2 = roomSpec(pub.rounds, 'fr-x');
const plainRep = (await buildQuestions(roomSpec(pub.rounds, 'fr-x'), { sparesRatio: 0.8 })).questions.filter(q => nonGeo(q) && a.has(F.dupKey(q))).length;
const second = await buildQuestions(spec2, { sparesRatio: 0.8, fresh: F.freshFrom() });
const rep = second.questions.filter(q => nonGeo(q) && a.has(F.dupKey(q)));
ok(plainRep > 0 && rep.length === 0, `4th game avoids the first three: ${rep.length} repeats (${plainRep} without FRESH)`);
ok(perRound(spec2, second.questions).every((n, i) => n === pub.rounds[i].count), 'second game rounds full');
ok(second.seenPicked === second.questions.filter(q => a.has(F.dupKey(q))).length, `seenPicked = ${second.seenPicked}`);

// replay: spec.fresh rebuilds the exact same set with no history (a link challenge on another device)
ok(typeof second.fresh === 'string' && second.fresh.length % F.SPEC_W === 0, `spec.fresh is a token string (${second.fresh.length} chars)`);
const replaySpec = JSON.parse(JSON.stringify({ ...spec2, fresh: second.fresh }));
F.resetSeen();
const replay = await buildQuestions(replaySpec, { sparesRatio: 0.8 });
ok(sig(replay.questions) === sig(second.questions), 'spec.fresh replays the identical questions without the history');
F.recordSeen(fake(50));
const replay2 = await buildQuestions(replaySpec, { sparesRatio: 0.8 });
ok(sig(replay2.questions) === sig(second.questions), 'replay ignores whatever history the receiver has');

// exhausted pool (easy world map has ~38 countries): never short, oldest seen come back first
F.resetSeen();
const geo = [{ format: 'map-click', packs: 'all', count: 10, opts: { region: 'world', ask: 'name' }, difficulty: 1 }];
const order = [];
for (let g = 0; g < 6; g++) {
  const s = roomSpec(geo, `geo-${g}`);
  delete s.blend;   // pure Easy keeps the 38-country pool exhausted (DIFFMIX's blend widens it)
  const r = await buildQuestions(s, { sparesRatio: 0.8, fresh: F.freshFrom() });
  ok(r.questions.length === 10, `geo game ${g}: full round (${r.questions.length})`);
  if (g === 4) {
    const oldest = new Set(order.slice(0, 20));
    const back = r.questions.filter(q => order.includes(F.dupKey(q)));
    ok(back.length > 0 && back.every(q => oldest.has(F.dupKey(q))), `geo game 4: repeats come from the oldest seen (${back.length})`);
  }
  r.questions.forEach(q => { const k = F.dupKey(q); const i = order.indexOf(k); if (i >= 0) order.splice(i, 1); order.push(k); });
  F.recordSeen(r.questions);
}

// a fully seen history never shortens any suggested round (both modes)
for (const [mode, list] of [['adult', SUGGESTED], ['kids', SUGGESTED_KIDS]]) {
  const kids = mode === 'kids';
  for (const set of list) {
    const rounds = set.rounds.map(r => ({ ...r, kids, opts: { ...(r.opts || {}), ...(kids ? { kids: true } : {}) } }));
    F.resetSeen();
    for (let g = 0; g < 3; g++) {
      const r = await buildQuestions(roomSpec(rounds, `${set.id}-${g}`, { kids }), { sparesRatio: 0.8 });
      F.recordSeen([...r.questions, ...r.spares]);
    }
    const s = roomSpec(rounds, `${set.id}-x`, { kids });
    const base = await buildQuestions(s, { sparesRatio: 0.8 });
    const r = await buildQuestions(roomSpec(rounds, `${set.id}-x`, { kids }), { sparesRatio: 0.8, fresh: F.freshFrom() });
    const nb = perRound(s, base.questions), nf = perRound(s, r.questions);
    ok(nf.every((n, i) => n >= Math.min(nb[i], s.rounds[i].count)), `${mode} ${set.id}: rounds ${nf} vs plain ${nb}`);
    ok(r.spares.length >= base.spares.length, `${mode} ${set.id}: spares ${r.spares.length} vs ${base.spares.length}`);
  }
}

// builds without `fresh` (daily, challenges, rooms' joiners) ignore the history entirely
F.resetSeen();
const daily = makeSpec('daily', [{ format: 'mc', packs: 'all', count: 10 }, { format: 'tf', packs: 'all', count: 10 }], 'daily:2026-10-13', { daily: 'main' });
const d1 = await buildQuestions(daily);
F.recordSeen([...d1.questions, ...d1.spares]);
const d2 = await buildQuestions(daily);
ok(sig(d1.questions) === sig(d2.questions) && !('fresh' in d2), 'daily: same questions whatever the history');

// local focus: shares hold with FRESH, and the replay matches
for (const local of [{ cc: 'JPN', level: 'most', live: false }, { cc: 'AUS', level: 'all', live: true }, { cc: 'GBR', level: 'more', live: true }]) {
  const rounds = [{ format: 'mc', packs: 'all', count: 10 }, { format: 'mc', packs: ['countries', 'capitals'], count: 10 }, { format: 'tf', packs: 'all', count: 10 }];
  F.resetSeen();
  const s0 = makeSpec('quick', rounds, `loc-${local.cc}-0`, { local });
  const g0 = await buildQuestions(s0, { sparesRatio: 0.8, fresh: F.freshFrom() });
  F.recordSeen(g0.questions);
  const r0 = []; await buildQuestions(makeSpec('quick', rounds, `loc-${local.cc}-1`, { local }), { sparesRatio: 0.8, report: r0 });
  const r1 = [], s1 = makeSpec('quick', rounds, `loc-${local.cc}-1`, { local });
  const g1 = await buildQuestions(s1, { sparesRatio: 0.8, fresh: F.freshFrom(), report: r1 });
  ok(perRound(s1, g1.questions).every(n => n === 10), `${local.cc} ${local.level}: rounds full`);
  ok(r1.every((row, i) => row.local >= Math.min(row.target, r0[i].local)), `${local.cc} ${local.level}: local share kept (${r1.map(x => `${x.local}/${x.target}`)} vs ${r0.map(x => x.local)})`);
  const seen0 = new Set(g0.questions.map(F.dupKey));
  const plainRep = (await buildQuestions(makeSpec('quick', rounds, `loc-${local.cc}-1`, { local }), { sparesRatio: 0.8 })).questions.filter(q => seen0.has(F.dupKey(q))).length;
  const freshRep = g1.questions.filter(q => seen0.has(F.dupKey(q))).length;
  ok(freshRep <= plainRep, `${local.cc}: repeats ${freshRep} ≤ ${plainRep} without FRESH`);
  F.resetSeen();
  const re = await buildQuestions({ ...JSON.parse(JSON.stringify(s1)), fresh: g1.fresh }, { sparesRatio: 0.8 });
  ok(sig(re.questions) === sig(g1.questions), `${local.cc}: replay identical`);
  ok(g1.questions.filter(q => q.loc).every(q => isLocalQ(q, local.cc)), `${local.cc}: loc marks real`);
}

// `recent` (a room's earlier games) is avoided even when the history is empty
F.resetSeen();
const roomA = await buildQuestions(roomSpec(pub.rounds.slice(0, 2), 'room-a'), { sparesRatio: 0.8, fresh: F.freshFrom() });
F.resetSeen();
const roomB = await buildQuestions(roomSpec(pub.rounds.slice(0, 2), 'room-b'), { sparesRatio: 0.8, fresh: F.freshFrom({ recent: roomA.questions }) });
const ra = new Set(roomA.questions.map(F.dupKey));
ok(roomB.questions.every(q => !ra.has(F.dupKey(q))), 'play again avoids the room’s last game');

console.log(`fresh_test: ${checks - fails}/${checks} passed`);
process.exit(fails ? 1 : 0);
