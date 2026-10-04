#!/usr/bin/env node
// C1 pack tests: schema (c1_schema.mjs), fact sanity, known-answer spot checks, and a self-test proving the checks
// catch a deliberately broken pack. Usage: node tools/c1_test.mjs [packId…]
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { TOOLS, ROOT } from './c1_lib.mjs';
import { validatePack, ALLOWED_LICENSE } from './c1_schema.mjs';

const SRC = join(TOOLS, 'c1_src');
const C1 = readdirSync(SRC).filter(f => f.endsWith('.mjs') && !f.startsWith('_')).map(f => f.replace(/\.mjs$/, ''));
const only = process.argv.slice(2);
const ids = only.length ? only : C1;
let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { fails++; console.error('FAIL', msg); } };

// Fact sanity independent of the schema: ranges, plausible values, consistency.
export function sanity(pack, src = {}) {
  const errs = [];
  const fm = pack.factsMeta || {};
  for (const it of pack.items || []) {
    for (const [k, v] of Object.entries(it.facts || {})) {
      const r = src.ranges?.[k];
      if (r && typeof v === 'number' && (v < r[0] || v > r[1])) errs.push(`${it.id}: ${k}=${v} outside ${r}`);
      if (fm[k]?.type === 'num' && typeof v === 'number' && v < 0 && !/melting|C$/.test(k)) errs.push(`${it.id}: negative ${k}`);
      if (fm[k]?.values && typeof v === 'string' && !fm[k].values.includes(v)) errs.push(`${it.id}: ${k}="${v}" not in allowed values`);
    }
    for (const m of [...(it.media?.img || []), ...(it.media?.audio || [])]) {
      if (/\b(nc|nd)\b/i.test(m.license)) errs.push(`${it.id}: non-commercial/no-derivatives licence ${m.license}`);
      if (!ALLOWED_LICENSE.test(m.license || '')) errs.push(`${it.id}: licence "${m.license}"`);
      if (m.src?.startsWith('media/') && !existsSync(join(ROOT, m.src))) errs.push(`${it.id}: mirrored file missing ${m.src}`);
      if (/inaturalist/.test(m.src || '') && !/inaturalist-open-data/.test(m.src)) errs.push(`${it.id}: iNat photo not on the open-data bucket`);
    }
    if (it.clues) {
      if (it.clues.length < 8) errs.push(`${it.id}: only ${it.clues.length} clues (want 8-12)`);
      if (it.clues.length > 12) errs.push(`${it.id}: ${it.clues.length} clues (want 8-12)`);
    }
    if (it.blurb && it.blurb.split(/(?<=\.)\s/).length > 3) errs.push(`${it.id}: blurb longer than 3 sentences`);
    for (const l of it.lookalikes || []) if (l === it.id) errs.push(`${it.id}: lookalike of itself`);
    const ids = new Set((pack.items || []).map(i => i.id));
    for (const [o, t] of Object.entries(it.differences || {})) {
      if (!ids.has(o)) errs.push(`${it.id}: differences refers to unknown item ${o}`);
      else if (!pack.items.find(i => i.id === o).differences?.[it.id]) errs.push(`${it.id}: differences with ${o} not mirrored`);
      if (!t || t.length < 20) errs.push(`${it.id}: differences note for ${o} too short`);
    }
  }
  for (const q of pack.questions || []) {
    if (q.kind === 'mc' && q.wrong?.some(w => String(w).toLowerCase() === String(q.answer).toLowerCase())) errs.push(`q ${q.id}: answer among wrong`);
    if (q.kind === 'order' && new Set(q.answer).size !== q.answer.length) errs.push(`q ${q.id}: duplicate order entries`);
  }
  if (pack.kids) {
    const easy = (pack.items || []).filter(i => i.difficulty === 1);
    for (const i of easy) if ((pack.items || []).length && !i.media?.img?.length && pack.id !== 'elements') errs.push(`${i.id}: difficulty-1 item in a kids pack has no picture`);
  }
  return errs;
}

// Known answers that must survive any rebuild.
const KNOWN = {
  snakes: p => [['inland-taipan', 'venomous', true], ['carpet-python', 'venomous', false], ['king-cobra', 'region', 'Asia'], ['black-mamba', 'region', 'Africa'], ['eastern-brown-snake', 'region', 'Australia']],
  birds: p => [['emu', 'flightless', true], ['ostrich', 'flightless', true], ['emperor-penguin', 'flightless', true], ['bald-eagle', 'flightless', false]],
  dinosaurs: p => [['pteranodon', 'dinosaur', false], ['mosasaurus', 'dinosaur', false], ['tyrannosaurus-rex', 'period', 'Cretaceous'], ['stegosaurus', 'period', 'Jurassic'], ['woolly-mammoth', 'dinosaur', false]],
  space: p => [['mercury', 'fromSun', 1], ['earth', 'fromSun', 3], ['neptune', 'fromSun', 8], ['apollo-11', 'year', 1969], ['moon', 'orbits', 'Earth']],
  sea: p => [['blue-whale', 'kind', 'Mammal'], ['blue-whale', 'breathesAir', true], ['ocellaris-clownfish', 'breathesAir', false]],
  dogs: p => [['chihuahua', 'origin', 'Mexico'], ['dalmatian', 'origin', 'Croatia'], ['great-dane', 'size', 'Giant']],
  gems: p => [['diamond', 'mohs', 10], ['talc', 'mohs', 1], ['quartz', 'mohs', 7]],
  inventions: p => [['telephone', 'year', 1876], ['world-wide-web', 'year', 1989]],
  mammals: p => [['platypus', 'region', 'Australia'], ['lion', 'diet', 'Carnivore']],
  insects: p => [['seven-spot-ladybird', 'order', 'Beetles'], ['monarch-butterfly', 'complete', true], ['european-mantis', 'complete', false]],
  mushrooms: p => [['death-cap', 'edibility', 'Deadly'], ['button-mushroom', 'edibility', 'Edible']],
};

function elementChecks(p) {
  const items = p.items;
  ok(items.length === 118, `elements: ${items.length} items, expected 118`);
  const nums = items.map(i => i.facts.atomicNumber).sort((a, b) => a - b);
  ok(nums.every((n, i) => n === i + 1), 'elements: atomic numbers are not exactly 1..118');
  ok(new Set(items.map(i => i.facts.symbol)).size === 118, 'elements: symbols are not unique');
  const by = s => items.find(i => i.facts.symbol === s);
  ok(by('H')?.name === 'Hydrogen' && by('Au')?.name === 'Gold' && by('Fe')?.name === 'Iron' && by('Na')?.name === 'Sodium', 'elements: symbol spot checks');
  ok(by('Hg')?.facts.state === 'Liquid' && by('Br')?.facts.state === 'Liquid' && by('O')?.facts.state === 'Gas', 'elements: state spot checks');
  ok(by('He')?.facts.group === 18 && by('Na')?.facts.group === 1 && by('C')?.facts.group === 14 && by('Fe')?.facts.group === 8, 'elements: group positions');
  ok(by('Au')?.facts.period === 6 && by('H')?.facts.period === 1 && by('Og')?.facts.period === 7, 'elements: period positions');
  ok(Math.abs((by('W')?.facts.meltingC ?? 0) - 3414) < 30, 'elements: tungsten melting point');
  ok(by('Al')?.name === 'Aluminium' && by('Cs')?.name === 'Caesium', 'elements: IUPAC spellings');
}

async function testPack(id) {
  const file = join(ROOT, 'data/packs', id + '.json');
  if (!existsSync(file)) { ok(false, `${id}: data/packs/${id}.json missing (run c1_build.mjs)`); return; }
  const pack = JSON.parse(readFileSync(file, 'utf8'));
  const { errors } = validatePack(pack, id);
  for (const e of errors) ok(false, e);
  ok(true, `${id}: schema`);
  let src = {};
  try { src = (await import(pathToFileURL(join(SRC, id + '.mjs')).href)).default; } catch (e) { ok(false, `${id}: source import failed ${e.message}`); }
  for (const e of sanity(pack, src)) ok(false, `${id}: ${e}`);
  for (const [iid, k, v] of KNOWN[id]?.(pack) || []) {
    const it = pack.items.find(i => i.id === iid);
    ok(it && it.facts?.[k] === v, `${id}: known answer ${iid}.${k} should be ${JSON.stringify(v)}, got ${JSON.stringify(it?.facts?.[k])}`);
  }
  if (id === 'elements') elementChecks(pack);
  if (pack.notice || ['snakes', 'spiders', 'jellyfish', 'mushrooms'].includes(id)) ok(/identification|forage/i.test(pack.notice || ''), `${id}: danger pack needs its notice`);
  if (id === 'mushrooms') ok(/never use this to forage/i.test(pack.notice) && pack.kidsSafe === false, 'mushrooms: forage notice + kidsSafe false');
  const easy = (pack.items || []).filter(i => i.difficulty === 1).length + (pack.questions || []).filter(q => q.difficulty === 1).length;
  ok(easy >= 15, `${id}: only ${easy} difficulty-1 items/questions`);
}

// Self-test: a deliberately broken pack must trip every check family.
function selfTest() {
  const good = JSON.parse(readFileSync(join(ROOT, 'data/packs', existsSync(join(ROOT, 'data/packs/snakes.json')) ? 'snakes.json' : readdirSync(join(ROOT, 'data/packs'))[0]), 'utf8'));
  const breakers = {
    'duplicate id': p => { p.items[1].id = p.items[0].id; },
    'clue leaks name': p => { p.items[0].clues[0] = `It is the ${p.items[0].name.split(' ')[0]} one.`; },
    'NC licence': p => { p.items[0].media.img[0].license = 'CC BY-NC 4.0'; },
    'missing credit': p => { delete p.items[0].media.img[0].credit; },
    'fact out of range': p => { p.items[0].facts.lengthM = 99; },
    'mc answer in wrong': p => { p.questions[0].wrong[0] = p.questions[0].answer; },
    'unknown fact key': p => { p.items[0].facts.wingCount = 4; },
    'too few clues': p => { p.items[0].clues = p.items[0].clues.slice(0, 3); },
    'bad lookalike': p => { p.items[0].lookalikes = ['no-such-item']; },
    'bad template': p => { const k = Object.keys(p.factsMeta)[0]; p.factsMeta[k].ask = 'What is {nme}?'; },
  };
  for (const [name, brk] of Object.entries(breakers)) {
    const p = structuredClone(good);
    brk(p);
    const { errors } = validatePack(p, p.id);
    const s = sanity(p, { ranges: { lengthM: [0.2, 9] } });
    ok(errors.length + s.length > 0, `self-test: "${name}" was NOT caught`);
  }
  ok(validatePack(good, good.id).errors.length === 0, 'self-test: the unbroken pack should pass');
}

for (const id of ids) await testPack(id);
if (!only.length) selfTest();
console.log(`c1_test: ${checks} checks, ${fails} failure(s)`);
process.exit(fails ? 1 : 0);
