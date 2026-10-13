#!/usr/bin/env node
// Pick all (js/formats/pickall.js): scoring edge cases (JS and the P2P host), every generated question re-derived
// from the raw pack data, the hand-written lists, shape rules, and leaks. Falsified: a validator that passes
// broken questions fails the run. Usage: node tools/pickall_test.mjs [--n=60] [--verbose]
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const imp = p => import(new URL(`../${p}`, import.meta.url).href);
const args = process.argv.slice(2);
const N = +(args.find(a => a.startsWith('--n=')) || '--n=60').slice(4);
const VERBOSE = args.includes('--verbose');
let pass = 0, fail = 0;
const shown = new Map();
const ok = (c, msg) => {
  if (c) { pass++; return true; }
  fail++;
  const k = msg.replace(/\s*\(.*$/, '');
  shown.set(k, (shown.get(k) || 0) + 1);
  if (shown.get(k) <= 3 || VERBOSE) console.log('FAIL', msg);
  return false;
};

const { rngFrom } = await imp('js/core/rng.js');
const { kidsView } = await imp('js/core/spec.js');
const reg = await imp('js/formats/registry.js');
const { pickScore, pickallCap } = await imp('js/formats/pickall_score.js');
const PA = await imp('js/formats/pickall.js');
const { RULES, rulesFor } = await imp('js/formats/pickall_rules.js');
const P2P = await imp('js/net/p2p_room.js');
const fmt = PA.default;
const { urlsOf } = await imp('js/core/media.js');
const { unfair } = PA;

/* ---------- scoring ---------- */
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const S = (g, a) => { const s = pickScore(g, a); return [s.hits, s.wrong, +s.frac.toFixed(3), s.correct]; };
ok(eq(S([4, 1, 6], [1, 4, 6]), [3, 0, 1, true]), 'all right, any order');
ok(eq(S([0, 1, 2, 3, 4, 5, 6], [1, 4, 6]), [3, 4, 0, false]), 'all tiles picked scores 0');
ok(eq(S([], [1, 4, 6]), [0, 0, 0, false]), 'none picked scores 0');
ok(eq(S(null, [1, 4, 6]), [0, 0, 0, false]), 'timeout (null) scores 0');
ok(eq(S([1, 4, 0], [1, 4, 6]), [2, 1, 0.667, false]), '2 of 3 found = 2/3');
ok(eq(S([1, 0, 2], [1, 4, 6]), [1, 2, 0.333, false]), '1 of 3 found = 1/3');
ok(eq(S([1, 0], [1, 4]), [1, 1, 0.5, false]), '1 of 2 found = 1/2');
ok(eq(S([1, 4, 6, 0], [1, 4, 6, 9]), [3, 1, 0.75, false]), '3 of 4 found = 3/4');
ok(eq(S([1, 1, 4, 4, 6], [1, 4, 6]), [3, 0, 1, true]), 'duplicates count once');
ok(S([1, 4, 6, 0], [1, 4, 6])[2] === 0, 'more picks than answers scores 0');
// picking every tile never pays for any size the format makes
for (const T of [4, 5, 6, 7, 8]) for (let n = 2; n <= Math.min(4, Math.floor(T / 2)); n++) {
  const all = [...Array(T).keys()];
  ok(pickScore(all, all.slice(0, n)).frac === 0, `all ${T} tiles with ${n} right scores 0`);
}
ok(pickallCap([0, 2], [0, 2]) === 500 && pickallCap([0, 2, 5], [0, 1, 2]) === 333 && pickallCap([0, 2], [1, 3]) === 0, 'pickallCap (mirrors scoring.go)');
// P2P host: verifies the pick and caps a client that over-claims
{
  const q = { format: 'pickall', answer: [0, 2] };
  ok(P2P.verifyCorrect(q, [2, 0], false) === true && P2P.verifyCorrect(q, [0, 1], true) === false, 'P2P verifies pick-all answers');
  ok(P2P.PARTIAL.has('pickall') && P2P.LONG.pickall === 30000, 'P2P partial + long limit');
}

/* ---------- packs ---------- */
const packFiles = [...readdirSync(join(ROOT, 'data/packs')).filter(f => f.endsWith('.json') && !f.startsWith('_')).map(f => `packs/${f}`),
  ...readdirSync(join(ROOT, 'data/music')).filter(f => /^(hits-|one-hit)/.test(f)).map(f => `music/${f}`)];
const packs = packFiles.map(f => { try { return JSON.parse(readFileSync(join(ROOT, 'data', f), 'utf8')); } catch (e) { return null; } }).filter(p => p?.id);
const byId = new Map(packs.map(p => [p.id, p]));
const itemOf = ref => { const [pid, iid] = String(ref).split('/'); return byId.get(pid)?.items?.find(it => it.id === iid) || null; };
const WORD = { 2: 'two', 3: 'three', 4: 'four' };

// The checks every question must pass; returns a list of problems (tested against broken questions below).
function problems(q, { kids = false } = {}) {
  const out = [];
  const T = q.options?.length || 0, A = q.answer || [], n = A.length;
  if (q.format !== 'pickall' || !String(q.id || '').startsWith('pickall:')) out.push('format/id');
  if (kids ? !(T >= 4 && T <= 5 && n === 2) : !(T >= 6 && T <= 8 && n >= 2 && n <= 4)) out.push(`size ${T}/${n}`);
  if (T < 2 * n) out.push('tiles < 2n');
  if (q.data?.need !== n) out.push('need');
  if (!eq([...A].sort((a, b) => a - b), A) || new Set(A).size !== n || A.some(i => !Number.isInteger(i) || i < 0 || i >= T)) out.push('answer indices');
  if (!new RegExp(`\\b${WORD[n]}\\b`, 'i').test(q.prompt) || /\{n\}|\{\w+\}/.test(q.prompt)) out.push('prompt count');
  const texts = (q.options || []).map(o => o.text);
  if (new Set(texts.map(t => String(t).toLowerCase().trim())).size !== T) out.push('duplicate options');
  if (q.answerText !== A.map(i => texts[i]).join(' · ')) out.push('answerText');
  if (unfair(q.prompt, texts, new Set(A)).length) out.push(`cue in prompt: ${unfair(q.prompt, texts, new Set(A)).map(i => texts[i]).join(', ')}`);
  for (const t of texts) if (String(q.prompt).toLowerCase().includes(String(t).toLowerCase()) && String(t).length > 3) out.push(`option in prompt: ${t}`);
  if (q.data?.from === 'rule') {
    const items = q.refs.map(itemOf);
    if (items.some(x => !x) || items.length !== T) out.push('refs');
    else {
      const rightSet = new Set(A.map(i => texts[i]));
      const { key, value } = q.data;
      for (const it of items) {
        const v = it.facts?.[key];
        const isRight = value === true ? v === true : String(v) === String(value) && !Array.isArray(v);
        if (isRight !== rightSet.has(it.name)) out.push(`${it.name}: ${key}=${JSON.stringify(v)} vs asked ${value}`);
        if (v == null) out.push(`${it.name}: no ${key}`);
      }
      if (!texts.every(t => items.some(it => it.name === t))) out.push('options are not the ref items');
    }
  } else if (q.data?.from === 'q') {
    const [pid, qid] = q.refs[0].replace('/q:', '\u0000').split('\u0000');
    const src = byId.get(pid)?.questions?.find(x => x.id === qid);
    if (!src) out.push('source list');
    else texts.forEach((t, i) => { if (!(A.includes(i) ? src.answer : src.wrong).includes(t)) out.push(`${t} on the wrong side`); });
  } else out.push('src');
  return out;
}

// falsify: the validator must catch broken questions
{
  const p = byId.get('countries');
  const good = fmt.generate({ rng: rngFrom('fals'), packs: [p], count: 1, opts: {}, difficulty: 0, avoid: new Set() })[0];
  ok(good && problems(good).length === 0, `validator passes a real question ${good && problems(good)}`);
  const swap = structuredClone(good); swap.answer = [...swap.answer.slice(1), swap.options.findIndex((o, i) => !good.answer.includes(i))].sort((a, b) => a - b);
  swap.answerText = swap.answer.map(i => swap.options[i].text).join(' · ');
  ok(problems(swap).some(x => /vs asked/.test(x)), 'validator catches a decoy marked right');
  const leak = structuredClone(good); leak.prompt = `${good.prompt.replace('?', '')} like ${good.options[good.answer[0]].text}?`;
  ok(problems(leak).some(x => /cue|option in prompt/.test(x)), 'validator catches an option named in the prompt');
  const many = structuredClone(good); many.options = many.options.concat(many.options.slice(0, 3).map(o => ({ text: o.text + ' X' })));
  ok(problems(many).some(x => /size/.test(x)), 'validator catches too many tiles');
  ok(unfair('Which three of these are external territories of Australia?', ['Australian Antarctic Territory', 'Norfolk Island', 'Kangaroo Island'], new Set([0, 1])).includes(0), 'unfair() flags a right option the prompt hints at');
  ok(unfair('Which two of these are Australian states?', ['Western Australia', 'Victoria', 'Australian Capital Territory', 'Gippsland'], new Set([0, 1])).length === 0, 'unfair() lets a cue both sides share through');
}

/* ---------- generated questions ---------- */
const counts = {};
const tally = (k, n) => { counts[k] = (counts[k] || 0) + n; };
for (const p of packs) {
  const rules = rulesFor(p.id), lists = (p.questions || []).filter(q => q.kind === 'pickall');
  if (!rules.length && !lists.length) continue;
  for (const [view, kids, d] of [[p, false, 0], [p, false, 1], [p, false, 3], [kidsView(p), true, 1]]) {
    if (kids && p.kidsSafe === false) continue;
    for (let s = 0; s < 3; s++) {
      const qs = fmt.generate({ rng: rngFrom(`pt:${p.id}:${kids}:${d}:${s}`), packs: [view], count: N, opts: { tiles: [6, 7, 8][s] }, difficulty: d, kids, avoid: new Set() });
      if (!kids && d === 0 && s === 0) tally(lists.length ? 'lists' : 'rules', qs.length);
      for (const q of qs) {
        const pr = problems(q, { kids });
        ok(!pr.length, `${p.id}${kids ? ' kids' : ''} d${d}: ${q.prompt} — ${pr.join('; ')}`);
        ok(JSON.stringify(JSON.parse(JSON.stringify(q))) === JSON.stringify(q), `${p.id}: JSON-safe`);
        ok(urlsOf([q]).every(u => /^https?:|^media\//.test(u)), `${p.id}: preflight sees only real media URLs (${urlsOf([q]).join(', ')})`);
        if (kids) ok(!q.data.rule || RULES.find(r => r.id === q.data.rule).kids, `${p.id}: kids only from kids rules (${q.data.rule})`);
      }
      // no list asked twice in a round, no rule value more than twice
      const keys = qs.map(q => (q.data.from === 'q' ? q.refs[0] : `${q.data.rule}:${q.data.value}`));
      const per = keys.reduce((m, k) => m.set(k, (m.get(k) || 0) + 1), new Map());
      ok([...per].every(([k, c]) => c <= (k.includes('/q:') ? 1 : 2)), `${p.id}: no repeats beyond the cap`);
    }
  }
  // every rule of this pack produces something
  for (const r of rules) {
    let got = 0;
    for (let s = 0; s < 40 && !got; s++) got = fmt.generate({ rng: rngFrom(`rule:${r.id}:${s}`), packs: [p], count: 30, opts: {}, difficulty: 0, avoid: new Set() }).filter(q => q.data.rule === r.id).length;
    ok(got > 0, `rule ${r.id} on ${p.id} generates`);
  }
}

/* ---------- hand-written lists ---------- */
let listN = 0;
const covered = new Set();
for (const p of packs) for (const q of (p.questions || []).filter(x => x.kind === 'pickall')) {
  listN++;
  ok(q.answer.length >= 2 && q.wrong.length >= 3, `${p.id}/${q.id}: 2+ right, 3+ decoys`);
  ok(!q.answer.some(a => q.wrong.includes(a)), `${p.id}/${q.id}: no option on both sides`);
  ok(/\{n\}/.test(q.prompt) && q.explain && q.explain.length <= 170, `${p.id}/${q.id}: {n} prompt + short explain`);
}
for (const p of packs.filter(p => (p.questions || []).some(q => q.kind === 'pickall'))) {
  for (const kids of [false, true]) for (let s = 0; s < 40; s++) {
    for (const q of fmt.generate({ rng: rngFrom(`cov:${p.id}:${kids}:${s}`), packs: [p], count: 200, opts: { tiles: [6, 7, 8][s % 3] }, difficulty: 0, kids, avoid: new Set() })) covered.add(q.refs[0]);
  }
}
const lists = packs.flatMap(p => (p.questions || []).filter(q => q.kind === 'pickall').map(q => `${p.id}/q:${q.id}`));
const never = lists.filter(r => !covered.has(r));
ok(!never.length, `every list question can be asked (never: ${never.join(', ')})`);

/* ---------- format wiring ---------- */
const idx = JSON.parse(readFileSync(join(ROOT, 'data/index.json'), 'utf8'));
const sup = Object.entries(idx.packs).filter(([id, info]) => reg.supportsPack(fmt, { id, ...info }) === true).map(([id]) => id);
ok(sup.includes('general') && sup.includes('countries') && !sup.includes('flags'), `supported packs: ${sup.length}`);
ok(Object.values(idx.packs).some(i => (i.caps?.formats?.pickall || 0) >= 5), 'index caps.formats.pickall written (rerun build_index)');
const san = await imp('js/net/sanitize.js');
const q0 = fmt.generate({ rng: rngFrom('san'), packs: [byId.get('general')], count: 1, opts: {}, avoid: new Set() })[0];
const cleaned = san.cleanQuestion(q0);
ok(cleaned && eq(cleaned.answer, q0.answer) && cleaned.options.length === q0.options.length, 'sanitize keeps pick-all questions playable');
const go = readFileSync(join(ROOT, 'server/scoring.go'), 'utf8');
ok(/"pickall": true/.test(go) && /"pickall": 30000/.test(go), 'server partialFormats + longFormats');

console.log(`pickall_test: ${pass} passed, ${fail} failed · generated per pack (default opts): ${counts.rules || 0} from facts, ${counts.lists || 0} from ${listN} lists · supported packs ${sup.length}`);
process.exit(fail ? 1 : 0);
