// People packs: item.gender ('m' | 'f') from each item's own "Who is this? He/She …" clue, then same-gender distractors
// for those questions (a "She …" clue with three men offered gives it away). js/formats/registry.js distractors()
// also prefers the target's gender at runtime. c2_build_people.mjs runs this after writing the packs.
//   node tools/c2_gender.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rng, sample } from './c2_lib.mjs';

const PACKS = join(dirname(fileURLToPath(import.meta.url)), '..', 'data/packs');
const KNOWN = { 'Louis XIV': 'm', 'Peter the Great': 'm' };
export const PEOPLE_PACKS = ['actors', 'people', 'explorers', 'leaders', 'artists'];
const pron = p => { const m = String(p).match(/\b(he|she|his|her|him)\b/i); return m ? (/^(she|her)$/i.test(m[1]) ? 'f' : 'm') : null; };

export function run() {
  const report = [];
  for (const id of PEOPLE_PACKS) {
    const file = join(PACKS, id + '.json');
    const pack = JSON.parse(readFileSync(file, 'utf8'));
    const byName = new Map(pack.items.map(it => [it.name, it]));
    for (const q of pack.questions) {
      if (!q.id.startsWith('who-')) continue;
      const it = pack.items.find(i => i.id === q.id.slice(4)), g = pron(q.prompt.replace(/^Who is this\?\s*/, ''));
      if (it && g) it.gender = g;
    }
    for (const it of pack.items) if (!it.gender && KNOWN[it.name]) it.gender = KNOWN[it.name];
    let fixed = 0;
    for (const q of pack.questions) {
      const g = byName.get(q.answer)?.gender;
      if (!g || !Array.isArray(q.wrong) || !pron(q.prompt)) continue;
      const keep = q.wrong.filter(w => byName.get(w)?.gender === g);
      if (keep.length === q.wrong.length) continue;
      const pool = pack.items.filter(it => it.gender === g && it.name !== q.answer && !keep.includes(it.name)).map(it => it.name);
      const add = sample(rng('gender:' + q.id), pool, q.wrong.length - keep.length);
      if (keep.length + add.length < 2) { report.push(`${id}/${q.id}: too few ${g}`); continue; }
      q.wrong = [...keep, ...add];
      fixed++;
    }
    writeFileSync(file, JSON.stringify(pack, null, 1) + '\n');
    const n = g => pack.items.filter(it => it.gender === g).length;
    report.push(`${id}: ${n('m')} m, ${n('f')} f, ${pack.items.filter(it => !it.gender).length} unknown; ${fixed} questions re-picked`);
  }
  console.log(report.join('\n'));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) run();
