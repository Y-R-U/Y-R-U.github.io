#!/usr/bin/env node
// Lane F format tests: for every F format and every pack, generate questions and check them against the data.
// Usage: node tools/f_test.mjs [format,...] [--n=200] [--verbose]
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const imp = p => import(new URL(`../${p}`, import.meta.url).href);
const args = process.argv.slice(2);
const N = +(args.find(a => a.startsWith('--n=')) || '--n=200').slice(4);
const VERBOSE = args.includes('--verbose');
const ONLY = (args.find(a => !a.startsWith('--')) || '').split(',').filter(Boolean);

export const F_FORMATS = ['match', 'ladder', 'hilo', 'order', 'odd', 'sort', 'fake', 'reveal', 'silhouette', 'number', 'connect',
  'blitz60', 'type', 'chain', 'lookalike', 'quote'];

let fails = 0, passes = 0;
const failMsgs = new Map();
const ok = (cond, msg) => {
  if (cond) { passes++; return true; }
  fails++;
  const k = msg.replace(/\s*\(.*$/, '');
  failMsgs.set(k, (failMsgs.get(k) || 0) + 1);
  if (failMsgs.get(k) <= 3 || VERBOSE) console.error('FAIL', msg);
  return false;
};

const { rngFrom } = await imp('js/core/rng.js');
const registry = await imp('js/formats/registry.js');
const { summarize } = await imp('js/core/packs.js');
const { kidsView } = await imp('js/core/spec.js');
const { norm } = await imp('js/formats/fkit.js');
const { VALIDATORS } = await imp('tools/f_validators.mjs');

const formats = ONLY.length ? ONLY : F_FORMATS;
const loaded = [];
for (const id of formats) {
  try { await imp(`js/formats/${id}.js`); } catch (e) { ok(false, `${id} :: module failed to import: ${e.message}`); continue; }
  const f = registry.getFormat(id);
  if (ok(!!f, `${id} :: registered`)) loaded.push(f);
}

const packs = readdirSync(join(ROOT, 'data/packs')).filter(f => f.endsWith('.json') && !f.startsWith('_'))
  .map(f => JSON.parse(readFileSync(join(ROOT, 'data/packs', f), 'utf8'))).filter(p => p && p.id);
// What the browser sees: data/index.json caps where present (it is what the picker uses), else computed caps.
let index = {};
try { index = JSON.parse(readFileSync(join(ROOT, 'data/index.json'), 'utf8')).packs || {}; } catch (e) {}
// caps.multi (exclusive:false cat facts) is requested from C1/A; simulated here until it lands.
const multiOf = p => Object.entries(p.factsMeta || {}).filter(([, m]) => m.type === 'cat' && m.exclusive === false).map(([k]) => k);
const infoOf = p => {
  const base = summarize(p);
  const caps = { ...base.caps, ...(index[p.id]?.caps || {}) };
  if (!caps.multi) caps.multi = multiOf(p);
  return { id: p.id, ...base, caps };
};

const jsonSafe = q => { try { return JSON.stringify(JSON.parse(JSON.stringify(q))) === JSON.stringify(q); } catch (e) { return false; } };
const hasFns = v => typeof v === 'function' || (v && typeof v === 'object' && Object.values(v).some(hasFns));

const disputed = packs.flatMap(p => (p.items || []).filter(it => it.facts?.flagDisputed).flatMap(it => (it.media?.img || []).map(m => m.src)));
function checkShape(f, q, tag) {
  const js = JSON.stringify(q);
  ok(!disputed.some(src => js.includes(src)), `${f.id} :: no disputed flag pictures (${tag}) ${q.id}`);
  ok(q && q.format === f.id, `${f.id} :: format field (${tag})`);
  ok(typeof q.id === 'string' && q.id.startsWith(f.id === 'lookalike' ? 'look' : f.id), `${f.id} :: id prefix (${tag}) ${q.id}`);
  ok(typeof q.prompt === 'string' && q.prompt.trim().length > 0, `${f.id} :: prompt (${tag})`);
  ok(!hasFns(q) && jsonSafe(q), `${f.id} :: JSON-serialisable (${tag})`);
  ok(Array.isArray(q.refs), `${f.id} :: refs array (${tag})`);
  if (Array.isArray(q.options) && Number.isInteger(q.answer)) {
    ok(q.answer >= 0 && q.answer < q.options.length, `${f.id} :: answer index in range (${tag}) ${q.id}`);
    const texts = q.options.map(o => norm(o.text ?? o));
    ok(new Set(texts).size === texts.length, `${f.id} :: duplicate options (${tag}) ${q.id}: ${texts.join(' | ')}`);
    const imgs = q.options.map(o => o.img?.src).filter(Boolean);
    ok(new Set(imgs).size === imgs.length, `${f.id} :: duplicate option images (${tag}) ${q.id}`);
  }
  if (q.answerText != null) ok(String(q.answerText).trim().length > 0, `${f.id} :: answerText (${tag})`);
  wordingCheck(f.id, q, tag);
}

const byId = new Map(packs.map(p => [p.id, p]));
const itemOf = ref => { const [pid, iid] = String(ref).split('/'); return byId.get(pid)?.items?.find(it => it.id === iid) || null; };
const ctx = { packs, byId, itemOf, norm, ok };

// Wording regressions from docs/notes/QF.md "For lane I" (all formats, incl. A's mc/tf below).
const THE_C = /\b(from|in|of|to|is|Is|was|Was|than) (United States|United Kingdom|United Arab Emirates|Netherlands|Philippines|Czech Republic|Bahamas|Gambia|Maldives|Dominican Republic)\b(?!\s+(dollar|pound|dirham|peso|sterling))/;
const BIN_ANS = /\bor later\b|\bMiddle Ages\b|\bancient world\b|\d0?s to \d|Least concern|threatened|endangered/i;
function wordingCheck(fid, q, tag) {
  const kids = /kids/.test(tag) || q.kids;
  const text = [q.prompt, q.explain, q.answerText, q.hint, JSON.stringify(q.data || {})].filter(Boolean).join(' \u2022 ');
  ok(!/(^|[\s(:])-\d{2,4}(?![\d.,]|\s*°)/.test([q.explain, q.answerText, q.prompt].join(' ')) || !/year|born|died|BC/i.test(text), `${fid} :: no raw negative years (${tag}) ${q.id}: ${q.explain}`);
  ok(!/\(iucn\)/.test(text), `${fid} :: acronyms keep capitals (${tag}) ${q.id}`);
  if (kids) ok(!/conservation status|\bIUCN\b/i.test(text), `${fid} :: no IUCN in kids mode (${tag}) ${q.id}`);
  if (!q.id.includes('/q:')) ok(!THE_C.test(q.prompt), `${fid} :: "the" before country names (${tag}) ${q.id}: ${q.prompt}`);
  ok(!/\b[Tt]he the\b/.test(q.prompt), `${fid} :: no "the the" (${tag}) ${q.id}`);
  const pack = byId.get(q.pack);
  if ((fid === 'hilo' || fid === 'number') && pack?.theme === 'animals') {
    for (const it of q.refs.map(itemOf).filter(Boolean)) {
      if (!it.lname && /^[A-Z][a-z]+ [a-z]/.test(it.name)) ok(!q.prompt.includes(` ${it.name}`), `${fid} :: lower-case name mid-sentence (${tag}) ${q.id}: ${q.prompt}`);
    }
  }
  if (fid === 'hilo' || fid === 'order') {
    const meta = pack?.factsMeta?.[q.id.split(':')[1]];
    if (meta && meta.type === 'num' && (/^(Bigger|Longer|Heavier|Taller|Wider|Harder|Denser)$/.test(meta.higherLabel || '') || /\bago\b/.test(meta.unit || ''))) ok(!/higher or lower|highest first/.test(q.prompt) && !/ is [\d.,]+ million years ago/.test(q.prompt), `${fid} :: size/age wording from higherLabel (${tag}) ${q.id}: ${q.prompt}`);
  }
  if (fid === 'sort' && (q.data?.bins || []).some(b => /\bor\b/i.test(b))) ok(q.prompt.includes(' / '), `${fid} :: bins containing "or" (${tag}) ${q.id}: ${q.prompt}`);
  if (fid === 'type' && /^type:[a-zA-Z]+:/.test(q.id) && !/^type:(img|clue):/.test(q.id)) ok(!BIN_ANS.test(q.answerText), `${fid} :: no bin labels as typed answers (${tag}) ${q.id}: ${q.answerText}`);
  if (fid === 'fake' && pack?.noun && !pack.nounPlural && !pack.fakePrompt) ok(!q.prompt.includes(`these ${pack.noun.toLowerCase()} is`), `${fid} :: plural noun (${tag}) ${q.id}`);
  if (fid === 'connect') {
    const ls = (q.data?.groups || []).map(g => g.label);
    ok(!ls.some((a, i) => ls.some((b, j) => j > i && a.split(': ')[0] === b.split(': ')[0] && registry.nested(a.split(': ')[1], b.split(': ')[1]))), `${fid} :: no nested group values (${tag}) ${q.id}: ${ls.join(' | ')}`);
  }
  if (fid === 'odd' && /^odd:cat:/.test(q.id)) {
    const [, , key] = q.id.split(':');
    const [odd, ...same] = q.refs.map(itemOf);
    if (odd && same.every(Boolean)) {
      const shared = vals(same[0].facts[key]).filter(x => same.every(s => vals(s.facts[key]).includes(x)));
      ok(!vals(odd.facts[key]).some(v => shared.some(x => registry.nested(v, x))), `${fid} :: odd value not nested in the shared one (${tag}) ${q.id}`);
    }
  }
}
const vals = v => (v == null ? [] : [].concat(v).map(String));

function gen(f, list, seed, extra = {}) {
  return f.generate({ rng: rngFrom(seed), packs: list, count: extra.count || N, opts: { ...registry.defaultOpts(f), ...(extra.opts || {}) },
    difficulty: extra.difficulty || 0, kids: !!extra.kids, avoid: new Set(), round: 0, spec: {} }) || [];
}

for (const f of loaded) {
  let total = 0, packsOk = 0;
  const empty = [];
  const validate = VALIDATORS[f.id];
  ok(!!validate, `${f.id} :: has a data validator in f_validators.mjs`);
  for (const p of packs) {
    const info = infoOf(p);
    const sup = registry.supportsPack(f, info);
    ok(sup === true || (typeof sup === 'string' && sup.length > 3), `${f.id} :: supports() returns true or a reason (${p.id})`);
    if (sup !== true) continue;
    packsOk++;
    const seed = `f:${f.id}:${p.id}`;
    const a = gen(f, [p], seed);
    const b = gen(f, [p], seed);
    ok(JSON.stringify(a) === JSON.stringify(b), `${f.id} :: deterministic (${p.id})`);
    // index caps can't see value spreads (e.g. every emblem unique), so a few empty packs are tolerated and listed
    if (!a.length) empty.push(p.id);
    const ids = new Set();
    for (const q of a) {
      checkShape(f, q, p.id);
      ok(!ids.has(q.id), `${f.id} :: unique ids (${p.id}) ${q.id}`);
      ids.add(q.id);
      if (validate) validate(q, ctx, p.id);
    }
    total += a.length;
    for (const d of [1, 2, 3]) {
      const qs = gen(f, [p], `${seed}:d${d}`, { difficulty: d, count: 30 });
      for (const q of qs) { checkShape(f, q, `${p.id} d${d}`); if (validate) validate(q, ctx, `${p.id} d${d}`); }
    }
    const kv = kidsView(p);
    if (f.kids && kv.items.length + kv.questions.length > 0) {
      const qs = gen(f, [kv], `${seed}:kids`, { kids: true, difficulty: 1, count: 30 });
      for (const q of qs) {
        checkShape(f, q, `${p.id} kids`);
        if (validate) validate(q, ctx, `${p.id} kids`);
        if (Array.isArray(q.options) && Number.isInteger(q.answer)) ok(q.options.length <= 3, `${f.id} :: kids has <= 3 answers (${p.id}) got ${q.options.length}`);
      }
    }
  }
  // connect needs 3+ values with 3+ items on one exclusive fact; caps can't show that until C1 adds caps.catBins
  const TOL = { connect: 0.2 }[f.id] || 0.15;
  ok(empty.length <= Math.max(1, Math.floor(packsOk * TOL)), `${f.id} :: too many supported packs generate nothing: ${empty.join(', ')}`);
  if (empty.length) console.warn(`  warn ${f.id}: supported but empty: ${empty.join(', ')}`);
  // all supported packs mixed, like 'all'
  const sup = packs.filter(p => registry.supportsPack(f, infoOf(p)) === true);
  if (sup.length) {
    const a = gen(f, sup, `f:${f.id}:all`), b = gen(f, sup, `f:${f.id}:all`);
    ok(JSON.stringify(a) === JSON.stringify(b), `${f.id} :: deterministic (all packs)`);
    for (const q of a) { checkShape(f, q, 'all'); if (validate) validate(q, ctx, 'all'); }
    total += a.length;
  }
  for (const o of f.options || []) {
    for (const v of o.values || []) {
      if (!sup.length) break;
      const qs = gen(f, sup, `f:${f.id}:opt:${o.key}:${v}`, { opts: { [o.key]: v }, count: 20 });
      ok(qs.length > 0, `${f.id} :: option ${o.key}=${v} generates`);
      for (const q of qs) { checkShape(f, q, `${o.key}=${v}`); if (validate) validate(q, ctx, `${o.key}=${v}`); }
    }
  }
  console.log(`${f.id.padEnd(11)} ${String(packsOk).padStart(2)} packs  ${String(total).padStart(5)} questions`);
}

// A's mc/tf: wording rules only (normal, hard and kids), not in F_FORMATS.
if (!ONLY.length || ONLY.some(x => x === 'mc' || x === 'tf')) for (const id of ['mc', 'tf']) {
  await imp(`js/formats/${id}.js`);
  const f = registry.getFormat(id);
  let n = 0;
  for (const p of packs) {
    if (registry.supportsPack(f, infoOf(p)) !== true) continue;
    for (const [d, kids] of [[0, false], [3, false], [1, true]]) {
      const src = kids ? kidsView(p) : p;
      if (kids && src.items.length + src.questions.length === 0) continue;
      for (const q of gen(f, [src], `f:${id}:${p.id}:${d}:${kids}`, { difficulty: d, kids, count: 60, opts: id === 'mc' ? { source: 'facts' } : {} })) {
        q.pack = q.pack || p.id; n++;
        wordingCheck(id, q, `${p.id}${kids ? ' kids' : ` d${d}`}`);
      }
    }
  }
  console.log(`${id.padEnd(11)} wording  ${String(n).padStart(5)} questions`);
}

console.log(`\nf_test: ${passes} passed, ${fails} failed`);
if (fails) { for (const [k, v] of failMsgs) console.log(`  ${v}× ${k}`); }
process.exit(fails ? 1 : 0);
