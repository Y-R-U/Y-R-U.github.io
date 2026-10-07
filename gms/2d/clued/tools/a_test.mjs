#!/usr/bin/env node
// Lane A core tests: rng determinism, scoring, fuzzy matching, format generation, kids filtering.
// Usage: node tools/a_test.mjs
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const imp = p => import(new URL(`../${p}`, import.meta.url).href);
let fails = 0, passes = 0;
const ok = (cond, msg) => { if (cond) passes++; else { fails++; console.error('FAIL', msg); } };

const rng = await imp('js/core/rng.js');
const scoring = await imp('js/core/scoring.js');
const fuzzy = await imp('js/core/fuzzy.js');
const registry = await imp('js/formats/registry.js');
await imp('js/formats/mc.js');
await imp('js/formats/tf.js');
const spec = await imp('js/core/spec.js');

// rng
{
  const a = rng.mulberry32(rng.hashString('daily:2026-10-05')), b = rng.mulberry32(rng.hashString('daily:2026-10-05'));
  const xa = Array.from({ length: 50 }, a), xb = Array.from({ length: 50 }, b);
  ok(JSON.stringify(xa) === JSON.stringify(xb), 'rng is deterministic');
  ok(xa.every(x => x >= 0 && x < 1), 'rng range');
  ok(rng.hashString('a') !== rng.hashString('b'), 'hash differs');
  const c = rng.mulberry32(rng.hashString('daily:2026-10-06'));
  ok(c() !== xa[0], 'different seed differs');
  const s = rng.shuffle(rng.rngFrom('x'), [1, 2, 3, 4, 5, 6]);
  ok(s.slice().sort().join() === '1,2,3,4,5,6', 'shuffle keeps elements');
  ok(JSON.stringify(rng.shuffle(rng.rngFrom('x'), [1, 2, 3, 4, 5, 6])) === JSON.stringify(s), 'shuffle deterministic');
}

// scoring
{
  ok(scoring.basePoints({}) === 100, 'untimed = 100');
  ok(scoring.basePoints({ timed: true, remaining: 10, limit: 20 }) === 300, 'timed half = 300');
  ok(scoring.basePoints({ timed: true, remaining: 20, limit: 20 }) === 500, 'timed full = 500');
  ok(scoring.basePoints({ timed: true, remaining: 99, limit: 20 }) === 500, 'timed capped 500');
  ok(scoring.basePoints({ timed: true, remaining: 0, limit: 20 }) === 100, 'timed zero = 100');
  ok(scoring.streakMultiplier(1) === 1, 'first correct no bonus');
  ok(Math.abs(scoring.streakMultiplier(2) - 1.1) < 1e-9, 'streak 2 = +10%');
  ok(scoring.streakMultiplier(20) === 1.5, 'streak capped +50%');
  ok(scoring.withStreak(100, 3) === 120, 'withStreak');
  ok(scoring.pinDropPoints(0) === 500 && scoring.pinDropPoints(6000) === 0 && scoring.pinDropPoints(1000) === 400, 'pin drop');
  ok(scoring.clueLadderPoints(1, 5) === 500 && scoring.clueLadderPoints(3, 5) === 300 && scoring.clueLadderPoints(5, 5) === 100, 'clue ladder');
  ok(scoring.ladderBanked(4) === 0 && scoring.ladderBanked(5) === 1000 && scoring.ladderBanked(12) === 32000, 'ladder banked');
}

// fuzzy
{
  const m = (a, b) => fuzzy.fuzzyMatch(a, b).ok;
  ok(m('Brasilia', 'Brasília'), 'diacritics');
  ok(m('the beatles', 'Beatles'), 'leading article');
  ok(m('tigr', 'Tiger'), 'one typo');
  ok(m('Leonardo da vinchi', 'Leonardo da Vinci'), 'typo in long name');
  ok(!m('cat', 'Rat'), 'short words exact');
  ok(!m('1985', '1984'), 'numbers exact');
  ok(!m('Apollo 12', 'Apollo 11') && !m('World War 1', 'World War 2'), 'numbers inside names exact');
  ok(!m('Austria', 'Australia'), 'austria != australia');
  ok(m('fierce snake', ['Inland taipan', 'fierce snake']), 'alt answers');
  ok(!m('', 'x'), 'empty never matches');
  ok(m('St Lucia', 'Saint Lucia'), 'saint/st');
  ok(!m('Iran', 'Iraq') && !m('Niger', 'Nigeria'), 'near-miss countries rejected');
  ok(m('Mississipi river', 'Mississippi River'), 'long typo');
  ok(fuzzy.distance('ab', 'ba') === 1, 'transposition = 1');
}

// generation on real packs
const packs = readdirSync(join(ROOT, 'data/packs')).filter(f => f.endsWith('.json')).map(f => JSON.parse(readFileSync(join(ROOT, 'data/packs', f), 'utf8')));
const dev = packs.find(p => p.id === '_dev');
const genPacks = dev ? [dev] : packs.slice(0, 3);
for (const id of ['mc', 'tf']) {
  const f = registry.getFormat(id);
  ok(!!f, `${id} registered`);
  for (const answers of id === 'mc' ? [2, 3, 4, 6] : [4]) {
    const gen = s => f.generate({ rng: rng.rngFrom(s), packs: genPacks, count: 12, opts: { ...registry.defaultOpts(f), answers }, difficulty: 0 });
    const a = gen('seed1'), b = gen('seed1'), c = gen('seed2');
    ok(a.length >= 10, `${id}/${answers} makes questions (${a.length})`);
    ok(JSON.stringify(a) === JSON.stringify(b), `${id}/${answers} deterministic`);
    ok(JSON.stringify(a) !== JSON.stringify(c), `${id}/${answers} seed changes set`);
    ok(new Set(a.map(q => q.id)).size === a.length, `${id}/${answers} unique ids`);
    for (const q of a) {
      ok(JSON.parse(JSON.stringify(q)) && q.prompt && q.refs?.length, `${id} shape ${q.id}`);
      if (id === 'mc') {
        ok(q.options.length === Math.min(answers, q.options.length) && q.options.length >= 2, `mc option count ${q.id}`);
        ok(Number.isInteger(q.answer) && q.options[q.answer], `mc answer index ${q.id}`);
        const texts = q.options.map(o => o.text.toLowerCase());
        ok(new Set(texts).size === texts.length, `mc options distinct ${q.id}`);
        ok(q.options[q.answer].text === q.answerText, `mc answerText matches ${q.id}`);
      } else ok(typeof q.answer === 'boolean', `tf answer bool ${q.id}`);
    }
  }
}

// correctness spot checks on the dev pack
if (dev) {
  const mc = registry.getFormat('mc');
  const all = mc.generate({ rng: rng.rngFrom('cap'), packs: [dev], count: 200, opts: { answers: 4, source: 'facts' }, difficulty: 0 });
  const caps = Object.fromEntries(dev.items.filter(i => i.facts.capital).map(i => [i.name, i.facts.capital]));
  for (const q of all.filter(q => q.id.startsWith('mc:cat:capital'))) {
    const country = Object.keys(caps).find(n => q.prompt.includes(n));
    ok(caps[country] === q.answerText, `capital of ${country} = ${q.answerText}`);
    ok(q.options.filter(o => Object.values(caps).includes(o.text) && o.text === caps[country]).length === 1, 'one right capital');
  }
  for (const q of all.filter(q => q.id.startsWith('mc:num:'))) {
    const vals = q.options.map(o => dev.items.find(i => i.name === o.text).facts.massKg);
    const want = q.id.includes(':lo:') ? Math.min(...vals) : Math.max(...vals);
    ok(vals[q.answer] === want, `num answer is the extreme ${q.id}`);
  }
  ok(all.some(q => q.id.startsWith('mc:cat:')) && all.some(q => q.id.startsWith('mc:num:')) && all.some(q => q.id.startsWith('mc:bool:')), 'facts produce cat/num/bool');
  const tf = registry.getFormat('tf');
  for (const q of tf.generate({ rng: rng.rngFrom('tf'), packs: [dev], count: 80, opts: {}, difficulty: 0 }).filter(q => q.id.startsWith('tf:cat:capital'))) {
    const it = dev.items.find(i => q.prompt.includes(i.name));
    ok((q.prompt.includes(it.facts.capital + '.')) === q.answer, `tf capital truth ${q.prompt}`);
  }
  // kids view keeps only difficulty-1 content
  const kv = spec.kidsView(dev);
  ok(kv.items.length > 0 && kv.items.every(i => (i.difficulty || 2) <= 1), 'kidsView items are difficulty 1');
  const kq = mc.generate({ rng: rng.rngFrom('k'), packs: [kv], count: 10, opts: { answers: 6 }, kids: true, difficulty: 1 });
  ok(kq.length > 0 && kq.every(q => q.options.length <= 3), 'kids mc has at most 3 answers');
  // difficulty filter
  const easy = registry.byDifficulty(dev.items, 1, 4);
  ok(easy.every(i => i.difficulty === 1), 'byDifficulty easy');
  const hard = registry.byDifficulty(dev.items, 3, 1);
  ok(hard.every(i => i.difficulty === 3), 'byDifficulty hard');
}

// lane I: generated caps make supports() truthful, kids-bank fallback, virtual packs, packless, challenge replay scoring
{
  const mcF = registry.getFormat('mc');
  const info = { theme: 'animals', items: 20, questions: 0, caps: { img: 20, facts: {}, formats: { mc: 3 }, formatsKids: { mc: 12 } } };
  ok(registry.supportsPack(mcF, info) === registry.NOT_ENOUGH, 'supportsPack greys a pack whose generate() made < 5');
  ok(registry.supportsPack(mcF, info, { kids: true }) === true, 'supportsPack uses formatsKids in kids mode');
  ok(registry.supportsPack(mcF, { ...info, caps: { ...info.caps, formats: { mc: 20 } } }) === true, 'supportsPack passes with enough');
  ok(registry.supportsPack({ ...mcF, packless: true }, info) === true, 'packless formats skip the count');
  const kidsPack = { id: 'kb', title: 'K', theme: 'kids', kids: true, items: [], questions: Array.from({ length: 8 }, (_, i) => ({ id: 'q' + i, kind: 'mc', prompt: 'Q' + i, answer: 'A' + i, wrong: ['B' + i, 'C' + i], difficulty: 1 })) };
  const k4 = mcF.generate({ rng: rng.rngFrom('kb'), packs: [kidsPack], count: 5, opts: { answers: 4, source: 'questions' }, difficulty: 0 });
  ok(k4.length === 5 && k4.every(q => q.options.length === 3 && q.options[q.answer].text === q.answerText), 'mc with 4 answers falls back to 3 on 2-wrong questions');
  const idx = { packs: { general: { theme: 'general', items: 0, questions: 10, caps: { qkinds: { mc: 10 } } }, 'general~science': { theme: 'science', virtual: { of: 'general', tag: 'science' }, items: 0, questions: 5, caps: { qkinds: { mc: 5 } } }, snakes: { theme: 'animals', items: 20, questions: 0, caps: { img: 20, facts: {} } } } };
  const all = spec.resolvePackIds(mcF, 'all', idx, rng.rngFrom('v'));
  ok(all.includes('general') && !all.includes('general~science'), '"All" never double-counts virtual packs');
  ok(spec.resolvePackIds(mcF, ['general~science'], idx, rng.rngFrom('v')).join() === 'general~science', 'a virtual pack can be picked on its own');
  const { ladderResult } = await imp('js/structures/ladder.js');
  const ans = n => Array.from({ length: n }, () => ({ correct: true }));
  ok(ladderResult({ correct: 7, answers: [...ans(7), { correct: false }] }, false).score === scoring.ladderBanked(7), 'ladder replay banks on a fall');
  ok(ladderResult({ correct: 15, answers: ans(15) }, false).score === scoring.LADDER_RUNGS[14], 'ladder replay top score');
}

// template filling
ok(registry.fill('Which of these is {aName}?', { name: 'Axolotl' }) === 'Which of these is an axolotl?', 'fill aName');
ok(registry.fill('The {lname} is {aValue}.', { name: 'Tiger', value: 'Mammal' }) === 'The tiger is a mammal.', 'fill lvalue');

// lane FIN: picker hides packs a format can't use; preflight swaps; generator wording helpers
{
  const idx = JSON.parse(readFileSync(join(ROOT, 'data/index.json'), 'utf8'));
  const { hiddenPacks } = await imp('js/ui/picker.js');
  const fake = { id: 'fakefmt', supports: info => (info.caps?.fakes ? true : 'Needs a list of made-up names') };
  const why = id => (idx.packs[id] ? registry.supportsPack(fake, idx.packs[id]) : 'Missing');
  const hid = hiddenPacks(idx, why, false);
  const listed = hid.flatMap(g => g.packs.map(p => p.id));
  ok(hid.length && hid.every(g => g.reason && g.packs.length), 'hidden packs are grouped by reason');
  ok(listed.every(id => why(id) !== true) && new Set(listed).size === listed.length, 'only unusable packs are listed, once each');
  const usable = Object.keys(idx.packs).filter(id => why(id) === true);
  ok(usable.every(id => !listed.includes(id)), 'usable packs never listed as hidden');
  const unsafe = Object.keys(idx.packs).filter(id => idx.packs[id].kidsSafe === false);
  const kidsWhy = id => (idx.packs[id]?.kidsSafe === false ? 'Not in kids mode' : why(id));
  ok(!hiddenPacks(idx, kidsWhy, true).some(g => g.packs.some(p => unsafe.includes(p.id))), 'kids mode never lists grown-up packs');
  ok(String(hiddenPacks(idx, id => (id === 'mammals' ? registry.NOT_ENOUGH : true), true)[0]?.reason || '').includes('easy'), 'kids wording for "not enough"');

  const media = await imp('js/core/media.js');
  const q = (id, round, src, format = 'mc') => ({ id, round, format, media: src ? { img: [{ src }] } : undefined });
  const r = media.swapFailed([q('a', 0, 'bad1'), q('b', 0, 'ok1')], [q('s1', 1, 'ok2'), q('s2', 0, 'ok3', 'tf')], new Set(['bad1']));
  ok(r.questions.map(x => x.id).join() === 's2,b' && r.dropped === 0, 'swapFailed fills from the same round, any format');
  const { thinRounds } = await imp('js/structures/session.js');
  const sp = { rounds: [{ count: 10 }, { count: 5 }] };
  const qs = [...Array(6)].map((_, i) => ({ round: 0, id: 'x' + i })).concat([{ round: 1, id: 'y' }]);
  ok(thinRounds(sp, qs).join() === '1', 'a round under 60% is thin, 60% is not');

  ok(registry.factText({ type: 'year' }, -323) === '323 BC', 'BC years in factText');
  ok(registry.fill('The Persian breed comes from {value}.', { value: 'United States' }) === 'The Persian breed comes from the United States.', '"the" before country {value}');
  ok(registry.fill('Is it in the {value}?', { value: 'Netherlands' }) === 'Is it in the Netherlands?', 'no double "the"');
  ok(registry.lcLabel('Conservation status (IUCN)') === 'conservation status (IUCN)', 'labels keep acronyms');
  ok(registry.midName({ name: 'Southern stingray' }, { id: 'sea', theme: 'animals' }) === 'the southern stingray', 'animal names mid-sentence');
  ok(registry.midName({ name: 'United Kingdom', lname: 'United Kingdom' }, { theme: 'geography' }) === 'the United Kingdom', 'country names mid-sentence');
  ok(registry.fill('It is {aValue}.', { value: 'Duck, goose or swan' }) === 'It is a duck, goose or swan.', 'lower-cases a value with a comma');
  ok(registry.fill('Which one is {aName}?', { name: 'Sashimi' }) === 'Which one is sashimi?' && registry.fill('Which one is {aName}?', { name: 'Croissant' }) === 'Which one is a croissant?', 'mass nouns take no article');
  ok(registry.fill('Which is {aName}?', { name: 'Rice', mass: true }) === 'Which is rice?' && registry.fill('Which is {aName}?', { name: 'Gold', mass: false }) === 'Which is a gold?', 'item mass flag overrides the list');
  ok(registry.nested('Jellyfish', 'Box jellyfish') && !registry.nested('Asia', 'Eurasia'), 'nested values');
  ok(!registry.factAllowed({ label: 'Conservation status (IUCN)' }, { kids: true }) && registry.factAllowed({ label: 'Conservation status (IUCN)' }, { difficulty: 3 }), 'IUCN only at Hard, never kids');
}

console.log(`a_test: ${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
