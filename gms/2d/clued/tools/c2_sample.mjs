// Prints auto-generated mc/tf fact questions from C2 packs via lane A's generator, for reading the wording.
// Usage: node tools/c2_sample.mjs [packId ...] [--n=3]
import { readFileSync } from 'node:fs';
const imp = p => import(new URL(`../${p}`, import.meta.url).href);
const rng = await imp('js/core/rng.js');
const mc = (await imp('js/formats/mc.js')).default;
const tf = (await imp('js/formats/tf.js')).default;
const C2 = ['countries', 'capitals', 'currencies', 'flags', 'landmarks', 'languages', 'movies', 'actors', 'people', 'leaders', 'explorers', 'artists', 'paintings', 'books', 'quotes', 'words', 'history', 'tv'];
const args = process.argv.slice(2);
const n = +(args.find(a => a.startsWith('--n=')) || '--n=2').slice(4);
const ids = args.filter(a => !a.startsWith('--'));
for (const id of ids.length ? ids : C2) {
  let pack;
  try { pack = JSON.parse(readFileSync(new URL(`../data/packs/${id}.json`, import.meta.url))); } catch { continue; }
  const qs = [
    ...mc.generate({ rng: rng.rngFrom('s:' + id), packs: [pack], count: n, opts: { answers: 4, source: 'facts' }, difficulty: 0 }),
    ...mc.generate({ rng: rng.rngFrom('p:' + id), packs: [pack], count: 1, opts: { answers: 4, source: 'pictures' }, difficulty: 0 }),
    ...tf.generate({ rng: rng.rngFrom('t:' + id), packs: [pack], count: n, opts: {}, difficulty: 0 }),
  ];
  for (const q of qs) console.log(`[${id}] ${q.format}: ${q.prompt}${q.options ? '  {' + q.options.map(o => o.text).join(' | ') + '}' : ''}  => ${q.answerText}`);
}
