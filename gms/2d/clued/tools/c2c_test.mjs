#!/usr/bin/env node
// Checks the C2c packs (general, kids, sport): schema (c1_schema), ids, tags, option sanity, near-duplicates
// across all three packs, and difficulty spread. Also runs itself on a deliberately broken pack and fails if
// that pack passes. Usage: node tools/c2c_test.mjs [--dups] (prints every near-duplicate candidate)
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePack, THEMES } from './c1_schema.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PACK_IDS = ['general', 'kids', 'sport'];
const showDups = process.argv.includes('--dups');
const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9.]+/g, ' ').trim();
const STOP = new Set('the a an of in on to is was which what who how many much does do did this these that for by at as with from its it are be his her their one most and or into has have'.split(' '));
const words = s => new Set(norm(s).split(' ').filter(w => w && !STOP.has(w)));
const jaccard = (a, b) => { let i = 0; for (const x of a) if (b.has(x)) i++; return i / (a.size + b.size - i || 1); };
const inText = (needle, hay) => { const n = norm(needle); return n.length > 2 && (' ' + norm(hay) + ' ').includes(' ' + n + ' '); };
const optKey = s => norm(s) || String(s).trim();
const ALLOW = new Set(existsSync(join(ROOT, 'tools/c2c_dup_ok.json')) ? JSON.parse(readFileSync(join(ROOT, 'tools/c2c_dup_ok.json'), 'utf8')).map(p => p.slice().sort().join('|')) : []);
const isNum = s => /^[−-]?\d[\d,.]*$/.test(String(s).trim());

export function checkPacks(packs) {
  const errors = [], warnings = [], dupCands = [];
  const allIds = new Map();
  const all = [];
  for (const pack of packs) {
    const { errors: e, warnings: w } = validatePack(pack, pack.id);
    errors.push(...e);
    warnings.push(...w.filter(x => !(pack.kids && /only 2 wrong answers/.test(x))));
    const P = pack.id;
    const maxOpts = pack.kids ? 3 : 4;
    for (const q of pack.questions || []) {
      const W = `${P}/${q.id}`;
      if (allIds.has(q.id)) errors.push(`${W}: id also used in ${allIds.get(q.id)}`); else allIds.set(q.id, P);
      if (!Array.isArray(q.tags) || !q.tags.length || q.tags.some(t => !THEMES.includes(t))) errors.push(`${W}: tags must be theme ids`);
      if (!q.explain || q.explain.length > 170) errors.push(`${W}: explain missing or over 170 chars`);
      if (pack.kids && q.prompt.length > 95) errors.push(`${W}: kids prompt too long for read-aloud (${q.prompt.length})`);
      if (pack.kids && q.difficulty === 3) errors.push(`${W}: kids questions should be difficulty 1–2`);
      if (q.kind === 'mc') {
        const opts = [q.answer, ...(q.wrong || [])];
        if (opts.length !== maxOpts) errors.push(`${W}: needs exactly ${maxOpts} options, has ${opts.length}`);
        if (opts.some(o => typeof o !== 'string' || !o.trim())) errors.push(`${W}: empty option`);
        if (new Set(opts.map(optKey)).size !== opts.length) errors.push(`${W}: options not distinct after normalising`);
        if (isNum(q.answer) !== (q.wrong || []).every(isNum)) errors.push(`${W}: numeric answer mixed with non-numeric options`);
        // a 'which of A or B' prompt names every option, which is fine; naming only the answer gives it away
        const wrongNamed = (q.wrong || []).some(w => inText(w, q.prompt));
        if (inText(q.answer, q.prompt) && !wrongNamed) errors.push(`${W}: answer appears in the prompt`);
      }
      if (q.kind === 'number') {
        if (typeof q.unit !== 'string') errors.push(`${W}: number needs a unit string ('' if none)`);
        if (typeof q.tolerance !== 'number' || q.tolerance < 0) errors.push(`${W}: number needs tolerance ≥ 0`);
        if (q.tolerance > Math.abs(q.answer) * 0.1 && q.tolerance > 1) warnings.push(`${W}: tolerance over 10% of answer`);
      }
      if (q.kind === 'order') {
        if (!q.orderLabel) errors.push(`${W}: order needs orderLabel`);
        if (new Set(q.answer.map(norm)).size !== q.answer.length) errors.push(`${W}: order items repeat`);
      }
      all.push({ P, q, w: words(q.prompt), key: norm(q.prompt) + '|' + (q.media?.img?.[0]?.src || '') });
    }
  }
  // exact and near duplicates across all packs
  const seen = new Map();
  for (const x of all) {
    if (seen.has(x.key)) errors.push(`duplicate question: ${x.P}/${x.q.id} = ${seen.get(x.key)}`); else seen.set(x.key, `${x.P}/${x.q.id}`);
  }
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    const a = all[i], b = all[j];
    if (a.q.media?.img || b.q.media?.img) continue;
    const sim = jaccard(a.w, b.w);
    const sameAns = norm(JSON.stringify(a.q.answer)) === norm(JSON.stringify(b.q.answer));
    const allowed = ALLOW.has([a.q.id, b.q.id].sort().join('|'));
    if (allowed) continue;
    if ((sameAns && sim >= 0.6) || sim >= 0.85) errors.push(`near-duplicate (${sim.toFixed(2)}): ${a.P}/${a.q.id} "${a.q.prompt}" ~ ${b.P}/${b.q.id} "${b.q.prompt}"`);
    else if ((sameAns && sim >= 0.3) || sim >= 0.6) dupCands.push(`(${sim.toFixed(2)}${sameAns ? ', same answer' : ''}) ${a.P}: ${a.q.prompt}  ~  ${b.P}: ${b.q.prompt}`);
  }
  // difficulty spread (general: ~35/40/25) and true/false balance
  for (const pack of packs) {
    const qs = pack.questions || [];
    if (pack.id === 'general') {
      const f = d => qs.filter(q => q.difficulty === d).length / qs.length;
      const want = { 1: 0.35, 2: 0.4, 3: 0.25 };
      for (const d of [1, 2, 3]) if (Math.abs(f(d) - want[d]) > 0.08) errors.push(`general: difficulty ${d} is ${(f(d) * 100).toFixed(0)}% (want ~${want[d] * 100}%)`);
    }
    const tf = qs.filter(q => q.kind === 'tf');
    if (tf.length >= 10 && tf.filter(q => q.answer).length / tf.length > 0.8) warnings.push(`${pack.id}: ${tf.length} tf questions are over 80% true`);
    if (pack.id !== 'kids' && qs.length && qs.filter(q => q.difficulty === 1).length < 15) errors.push(`${pack.id}: fewer than 15 easy questions`);
  }
  return { errors, warnings, dupCands };
}

function brokenPack() {
  const good = { id: 'general', kind: 'mc', prompt: 'Which planet is known for its rings?', answer: 'Saturn', wrong: ['Mars', 'Venus', 'Mercury'], explain: 'x', difficulty: 1, tags: ['science'] };
  return {
    id: 'general', title: 'Broken', theme: 'general', icon: 'x', kids: false, version: 1,
    questions: [
      { ...good, id: 'b1' },
      { ...good, id: 'b1', prompt: 'Which planet is well known for its rings?' },                     // duplicate id + near-duplicate
      { ...good, id: 'b3', prompt: 'Name a gas giant', wrong: ['Saturn', 'Mars', 'Venus'] }, // answer repeated in wrong
      { ...good, id: 'b4', prompt: 'What year?', answer: '1969', wrong: ['1970', 'Mars', '1971'] }, // mixed types
      { ...good, id: 'b5', prompt: 'Is Saturn big?', difficulty: 4, tags: ['planets'] },  // bad difficulty and tag; answer in prompt
      { id: 'b6', kind: 'number', prompt: 'How many moons?', answer: 2, explain: 'x', difficulty: 1, tags: ['science'] }, // no unit/tolerance
    ],
  };
}

const self = checkPacks([brokenPack()]);
const expect = ['duplicate id', 'near-duplicate', 'answer repeated', 'numeric answer mixed', 'difficulty must be 1-3', 'tags must be theme ids', 'answer appears in the prompt', 'needs a unit', 'difficulty 1 is'];
const missed = expect.filter(e => !self.errors.some(x => x.includes(e)));
if (missed.length) { console.error('SELF-TEST FAILED: broken pack not caught for:', missed.join('; ')); process.exit(1); }

const packs = PACK_IDS.map(id => JSON.parse(readFileSync(join(ROOT, 'data/packs', `${id}.json`), 'utf8')));
const { errors, warnings, dupCands } = checkPacks(packs);
for (const w of warnings) console.warn('warn:', w);
if (showDups) for (const d of dupCands) console.log('dup?', d);
for (const e of errors) console.error('ERROR:', e);
const counts = packs.map(p => `${p.id} ${p.questions.length}q${p.items ? `/${p.items.length}i` : ''}`).join(', ');
const g = packs[0].questions, pct = d => Math.round(100 * g.filter(q => q.difficulty === d).length / g.length);
console.log(`c2c_test: ${counts}; general difficulty ${pct(1)}/${pct(2)}/${pct(3)}%; ${dupCands.length} near-dup candidates (--dups); self-test ok; ${errors.length} error(s), ${warnings.length} warning(s)`);
process.exit(errors.length ? 1 : 0);
