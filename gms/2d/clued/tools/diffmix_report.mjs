#!/usr/bin/env node
// DIFFMIX report: (1) each pack's real level distribution and what its Easy/Hard mc rounds actually get,
// (2) Easy/Medium/Hard × 10 over N seeds for the main formats: achieved mix vs the blend target.
// node tools/diffmix_report.mjs [seeds=50]
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
const { makeSpec, buildQuestions } = await import(js('core/spec.js'));
const { loadIndex, loadPacks } = await import(js('core/packs.js'));
const { getFormat, supportsPack } = await import(js('formats/registry.js'));
const { blendCounts } = await import(js('core/diffmix.js'));

const SEEDS = +(process.argv[2] || 50);
const index = await loadIndex();
const mixOf = qs => [1, 2, 3].map(l => qs.filter(q => q.lv === l).length);
const pct = (a, n) => a.map(x => Math.round(100 * x / Math.max(1, n)));

// ---- 1. per pack
const rows = [], cantHard = [], cantEasy = [];
const ids = Object.keys(index.packs).filter(id => !index.packs[id].virtual).sort();
for (const id of ids) {
  let pack;
  try { [pack] = await loadPacks([id]); } catch { continue; }
  if (!pack) continue;
  const lv = xs => [1, 2, 3].map(l => xs.filter(x => Math.min(3, Math.max(1, x.difficulty || 2)) === l).length);
  const it = lv(pack.items || []), q = lv(pack.questions || []);
  const fid = ['mc', 'listen', 'tf'].find(f => getFormat(f) && supportsPack(getFormat(f), index.packs[id]) === true);
  const got = {};
  if (fid) for (const d of [1, 3]) {
    const sum = [0, 0, 0]; let n = 0;
    for (let s = 0; s < 10; s++) {
      try {
        const { questions } = await buildQuestions(makeSpec('quick', [{ format: fid, packs: [id], count: 10, difficulty: d }], `pk${s}`), { sparesRatio: 0 });
        mixOf(questions).forEach((x, k) => { sum[k] += x; }); n += questions.length;
      } catch { /* pack can't make this format */ }
    }
    got[d] = n ? pct(sum, n) : null;
  }
  rows.push({ id, it, q, fid, got });
  if (got[3] && got[3][2] < 45) cantHard.push(`${id} (${fid}: ${got[3].join('/')}%)`);
  if (got[1] && got[1][0] < 45) cantEasy.push(`${id} (${fid}: ${got[1].join('/')}%)`);
}
console.log('## Pack levels (items e/m/h · questions e/m/h) and achieved % mix in 10 × 10-question rounds');
console.log('pack | items | questions | fmt | Easy (target 60/30/10) | Hard (target 10/30/60)');
for (const r of rows) console.log(`${r.id} | ${r.it.join('/')} | ${r.q.join('/')} | ${r.fid || '-'} | ${r.got[1]?.join('/') ?? '-'} | ${r.got[3]?.join('/') ?? '-'}`);
console.log(`\nCan't honour Hard (< 45% hard): ${cantHard.length}\n  ${cantHard.join('\n  ')}`);
console.log(`\nCan't honour Easy (< 45% easy): ${cantEasy.length}\n  ${cantEasy.join('\n  ')}`);

// ---- 2. main formats, all themes
const FORMATS = [['mc', {}], ['tf', {}], ['type', {}], ['number', {}], ['map-click tap', { ask: 'tap' }, 'map-click'], ['map-click name', { ask: 'name' }, 'map-click'], ['listen', {}]];
console.log(`\n## All themes, 10-question rounds × ${SEEDS} seeds: achieved e/m/h per round (mean) vs target; exact = rounds hitting the target`);
console.log('format | Easy 6/3/1 | Medium 2/6/2 | Hard 1/3/6');
for (const [name, opts, fid = name] of FORMATS) {
  const cells = [];
  for (const d of [1, 2, 3]) {
    const sum = [0, 0, 0]; let rounds = 0, exact = 0, short = 0, hardOpen = 0;
    const tgt = blendCounts(10, d);
    for (let s = 0; s < SEEDS; s++) {
      const { questions } = await buildQuestions(makeSpec('quick', [{ format: fid, count: 10, difficulty: d, opts }], `dm${s}`), { sparesRatio: 0 });
      const m = mixOf(questions);
      m.forEach((x, k) => { sum[k] += x; });
      rounds++;
      if (m.every((x, k) => x === tgt[k])) exact++;
      if (questions.length < 10) short++;
      if (d === 1 && questions[0]?.lv === 3) hardOpen++;
    }
    cells.push(`${sum.map(x => (x / rounds).toFixed(1)).join('/')} (exact ${Math.round(100 * exact / rounds)}%${short ? `, SHORT ${short}` : ''}${hardOpen ? `, opens hard ${hardOpen}` : ''})`);
  }
  console.log(`${name} | ${cells.join(' | ')}`);
}
