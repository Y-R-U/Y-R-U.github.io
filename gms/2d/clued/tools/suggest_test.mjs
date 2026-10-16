#!/usr/bin/env node
// Suggested sets: every round of every suggestion (both modes) names real packs + formats, each pack/format pair is
// usable in that mode (the picker's rule), and the round builds at least `count` questions over several seeds,
// built exactly as the host screen builds a room. Also prints the geography pools. Exit 1 on any failure.
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
const js = p => pathToFileURL(join(ROOT, 'js', p)).href;
const { MODULES } = await import(js('formats/index.js'));
for (const m of MODULES) await import(new URL(m, js('formats/index.js')).href);
const { getFormat } = await import(js('formats/registry.js'));
const { loadIndex } = await import(js('core/packs.js'));
const { supportedPackIds, makeSpec, buildQuestions } = await import(js('core/spec.js'));
const { SUGGESTED, SUGGESTED_KIDS } = await import(js('net/suggested.js'));
const geoC = await import(js('geo/formats/common.js'));
const index = await loadIndex();

const SEEDS = ['s1', 's2', 's3', 's4', 's5'];
let fails = 0, checks = 0, built = 0;
const ok = (c, m) => { checks++; if (!c) { fails++; console.log('FAIL', m); } };

// Returns a list of problems with one round (empty = fine).
async function roundProblems(r, kids, { build = true } = {}) {
  const out = [];
  const fmt = getFormat(r.format);
  if (!fmt) return [`unknown format ${r.format}`];
  if (fmt.hidden) out.push(`format ${r.format} is hidden`);
  const usable = supportedPackIds(fmt, index, { kids });
  if (!fmt.packless && !usable.length) out.push(`${r.format} unusable in this mode`);
  if (r.packs !== 'all') {
    if (!Array.isArray(r.packs) || !r.packs.length) out.push('packs must be "all" or a list');
    else for (const id of r.packs) {
      if (!index.packs[id]) out.push(`unknown pack ${id}`);
      else if (!fmt.packless && !usable.includes(id)) out.push(`${r.format} × ${id} is not usable${kids ? ' in kids mode' : ''}`);
    }
  }
  for (const [k, v] of Object.entries(r.opts || {})) {
    const o = (fmt.options || []).find(x => x.key === k);
    if (!o) out.push(`${r.format} has no option ${k}`);
    else if (o.values && !o.values.includes(v)) out.push(`${r.format}.${k} = ${v} is not one of ${o.values}`);
  }
  if (out.length || !build) return out;
  for (const seed of SEEDS) {
    const spec = makeSpec('online', [{ format: r.format, packs: r.packs, count: r.count, difficulty: kids ? 1 : (r.difficulty || 0),
      opts: { ...(r.opts || {}), online: true, ...(kids ? { kids: true } : {}) } }], seed, { kids });
    try {
      const { questions } = await buildQuestions(spec, { sparesRatio: 0.8 });
      built += questions.length;
      if (questions.length < r.count) out.push(`seed ${seed}: built ${questions.length}/${r.count}`);
    } catch (e) { out.push(`seed ${seed}: ${e.message}`); }
  }
  return out;
}

// The validator must reject broken rounds, or a green run means nothing.
const bad = [
  [{ format: 'mc', packs: ['no-such-pack'], count: 10, opts: {} }, false],
  [{ format: 'no-such-format', packs: 'all', count: 10, opts: {} }, false],
  [{ format: 'quote', packs: ['flags'], count: 10, opts: {} }, false],
  [{ format: 'mc', packs: ['mushrooms'], count: 10, opts: {} }, true],
  [{ format: 'listen', packs: ['nursery-rhymes'], count: 40, opts: {} }, true],
  [{ format: 'mc', packs: ['general'], count: 10, opts: { answers: 7 } }, false],
];
for (const [r, kids] of bad) ok((await roundProblems(r, kids)).length > 0, `validator rejects ${JSON.stringify(r)}${kids ? ' (kids)' : ''}`);

{
  const mtv = SUGGESTED.find(s => s.id === 'screen');
  ok(mtv.rounds.length === 5 && mtv.rounds[0].format === 'trio' && !mtv.rounds.some(r => r.format === 'reveal' && r.packs.includes('movie-moments')), 'Movie & TV Night: the hat-trick replaces the movie-moments picture round');
  const music = SUGGESTED.find(s => s.id === 'music'), world = SUGGESTED.find(s => s.id === 'world');
  ok(music.rounds.some(r => r.format === 'trio') && world.rounds.some(r => r.format === 'trio'), 'music + world sets carry a hat-trick round');
}
for (const [list, kids] of [[SUGGESTED, false], [SUGGESTED_KIDS, true]]) {
  const ids = new Set();
  for (const s of list) {
    ok(s.id && !ids.has(s.id), `${s.name}: unique id`); ids.add(s.id);
    ok(s.name && s.blurb && s.blurb.length <= 80, `${s.name}: name + one-line blurb`);
    ok(s.rounds.length >= 3 && s.rounds.length <= 8, `${s.name}: 3–8 rounds`);
    // a picture pack feeds one round per set, so the same pictures never come back in a later round
    const pics = s.rounds.flatMap(r => (Array.isArray(r.packs) ? r.packs : []).filter(id => id === 'movie-moments'));
    ok(pics.length <= 1, `${s.name}: movie moments in one round at most`);
    ok([3, 5, 10, 15, 20, 30].includes(s.timing?.answerSec) && [3, 5, 10, 0].includes(s.timing?.gapSec), `${s.name}: timing values`);
    let n = 0;
    for (const r of s.rounds) {
      const p = await roundProblems(r, kids);
      ok(!p.length, `${kids ? 'kids ' : ''}${s.name} › ${r.title}: ${p.join('; ') || 'ok'}`);
      n += r.count;
    }
    console.log(`${p2(kids ? 'kids' : 'adult')} ${s.name}: ${s.rounds.length} rounds · ${n} questions · ${s.rounds.map(r => `${r.title} [${r.format}]`).join(' / ')}`);
  }
}

// Geography pools the suggestions draw from.
const { geo, countryIds, byLevel, cname } = geoC;
const world = countryIds();
const adult = byLevel(world, 1, undefined, 8);
const kidsPool = byLevel(world, 1, undefined, 8, true);
console.log(`\nmap (adult, level 1): ${adult.length} · ${adult.map(cname).sort().join(', ')}`);
console.log(`map (kids): ${kidsPool.length} · ${kidsPool.map(cname).sort().join(', ')} (+ Greenland in "tap" rounds)`);
ok(kidsPool.length >= 10 && kidsPool.length <= 20, 'kids map pool is the short easiest list');
ok(!adult.some(id => ['TCD', 'MRT', 'NER', 'MLI'].includes(id)) && adult.includes('ESP'), 'level 1 is fame, not size (no Chad/Mauritania, has Spain)');
const caps = (await (await fetch(pathToFileURL(join(ROOT, 'data/packs/capitals.json')))).json()).items.filter(i => i.difficulty === 1).map(i => i.name);
console.log(`capitals (difficulty 1): ${caps.length} · ${caps.join(', ')}`);

// Every generated map question must use the pool.
for (const kids of [false, true]) {
  for (const [fid, opts] of [['map-click', { region: 'world', ask: kids ? 'tap' : 'name' }], ['flag-map', { region: 'world' }], ['continent', { what: 'countries', answers: 3, map: 'yes' }]]) {
    if (!kids && fid !== 'map-click') continue;
    const spec = makeSpec('online', [{ format: fid, packs: 'all', count: 10, difficulty: 1, opts: { ...opts, online: true, ...(kids ? { kids: true } : {}) } }], 'pools', { kids });
    delete spec.blend;   // the pool itself; an adult Easy round blends in some medium/hard (DIFFMIX)
    const { questions } = await buildQuestions(spec, { sparesRatio: 0.8 });
    const pool = new Set([...(kids ? kidsPool : adult), ...(fid === 'map-click' && opts.ask === 'tap' ? ['GRL'] : [])]);
    const isoOf = q => q.data?.iso || (typeof q.answer === 'string' ? q.answer : null);
    const off = questions.map(isoOf).filter(iso => iso && !pool.has(iso));
    ok(!off.length && questions.length >= 10, `${kids ? 'kids ' : ''}${fid}: ${questions.length} questions, all from the pool${off.length ? ` (off: ${off})` : ''}`);
    if (fid === 'map-click' && !kids) ok(questions.every(q => q.options?.length === 4 && q.options[q.answer]?.text === q.answerText), 'name-the-country: 4 options, answer index right');
  }
}

function p2(s) { return s.padEnd(5); }
console.log(`\n${built} questions built; ${checks - fails}/${checks} checks passed`);
process.exit(fails ? 1 : 0);
