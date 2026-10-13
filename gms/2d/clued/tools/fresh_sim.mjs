#!/usr/bin/env node
// FRESH gain: one device hosts N Classic Pub Quiz games in a row (built as the host screen builds a room) and we count
// questions already asked in an earlier game, with and without the seen history. `node tools/fresh_sim.mjs [games...]`
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
const { freshFrom, recordSeen, resetSeen, dupKey } = await import(js('core/fresh.js'));
const { SUGGESTED } = await import(js('net/suggested.js'));

const set = SUGGESTED.find(s => s.id === 'pub');
const specOf = seed => makeSpec('online', set.rounds.map(r => ({ format: r.format, packs: r.packs, count: r.count, difficulty: r.difficulty || 0,
  opts: { ...(r.opts || {}), online: true }, title: r.title })), seed, {});

async function night(games, fresh) {
  resetSeen();
  const asked = new Set(), perGame = [], perRound = set.rounds.map(() => 0);
  let total = 0, short = 0, specChars = 0;
  for (let g = 0; g < games; g++) {
    const { questions, fresh: fs } = await buildQuestions(specOf(`night-${g}`), { sparesRatio: 0.8, fresh: fresh ? freshFrom() : null });
    if (fs) specChars = Math.max(specChars, fs.length);
    let rep = 0;
    for (const q of questions) { if (asked.has(dupKey(q))) { rep++; perRound[q.round]++; } }
    set.rounds.forEach((r, i) => { if (questions.filter(q => q.round === i).length < r.count) short++; });
    questions.forEach(q => asked.add(dupKey(q)));
    recordSeen(questions);
    perGame.push(rep);
    total += questions.length;
  }
  return { specChars, games, total, repeats: perGame.reduce((a, b) => a + b, 0), perGame, perRound, short };
}

const counts = process.argv.slice(2).map(Number).filter(n => n > 0);
for (const n of counts.length ? counts : [10, 30]) {
  for (const fresh of [false, true]) {
    const t0 = Date.now();
    const r = await night(n, fresh);
    console.log(`${n} games ${fresh ? 'FRESH' : 'before'}: ${r.repeats} repeats of ${r.total} asked (${(100 * r.repeats / r.total).toFixed(1)}%), short rounds ${r.short}, spec.fresh ≤ ${r.specChars} chars, ${((Date.now() - t0) / n).toFixed(0)} ms/game`);
    console.log(`   per game ${r.perGame.join(' ')} | per round ${set.rounds.map((x, i) => `${x.title.split(':')[0]} ${r.perRound[i]}`).join(', ')}`);
  }
}
