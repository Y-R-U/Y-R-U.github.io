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
const infoOf = p => ({ id: p.id, ...summarize(p), ...(index[p.id] ? { caps: { ...summarize(p).caps, ...index[p.id].caps } } : {}) });

const jsonSafe = q => { try { return JSON.stringify(JSON.parse(JSON.stringify(q))) === JSON.stringify(q); } catch (e) { return false; } };
const hasFns = v => typeof v === 'function' || (v && typeof v === 'object' && Object.values(v).some(hasFns));

function checkShape(f, q, tag) {
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
}

const byId = new Map(packs.map(p => [p.id, p]));
const itemOf = ref => { const [pid, iid] = String(ref).split('/'); return byId.get(pid)?.items?.find(it => it.id === iid) || null; };
const ctx = { packs, byId, itemOf, norm, ok };

function gen(f, list, seed, extra = {}) {
  return f.generate({ rng: rngFrom(seed), packs: list, count: extra.count || N, opts: { ...registry.defaultOpts(f), ...(extra.opts || {}) },
    difficulty: extra.difficulty || 0, kids: !!extra.kids, avoid: new Set(), round: 0, spec: {} }) || [];
}

for (const f of loaded) {
  let total = 0, packsOk = 0;
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
    ok(a.length > 0, `${f.id} :: supports() said yes but generated nothing (${p.id})`);
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

console.log(`\nf_test: ${passes} passed, ${fails} failed`);
if (fails) { for (const [k, v] of failMsgs) console.log(`  ${v}× ${k}`); }
process.exit(fails ? 1 : 0);
