// Per-format data checks for tools/f_test.mjs: each question is re-derived from the pack data it came from.
const vals = v => (v == null ? [] : [].concat(v).map(String));
const optText = (q, i) => (q.options[i]?.text ?? q.options[i]);

function oddCheck(q, { itemOf, ok }, tag) {
  const [, type, key] = q.id.split(':');
  const items = q.refs.map(itemOf);
  if (!ok(items.every(Boolean), `odd :: refs resolve (${tag}) ${q.id}`)) return;
  ok(optText(q, q.answer) === items[0].name, `odd :: answer is the odd item (${tag}) ${q.id}`);
  const v = it => (type === 'group' ? vals(it.group) : type === 'bool' ? [String(it.facts[key])] : vals(it.facts[key]));
  const byName = new Map(items.map(it => [it.name, it]));
  const opts = q.options.map(o => byName.get(o.text));
  ok(opts.every(Boolean), `odd :: options are the referenced items (${tag}) ${q.id}`);
  // exactly one option can be "the odd one" on this attribute
  let oddCount = 0;
  opts.forEach((it, j) => {
    const rest = opts.filter((_, k) => k !== j);
    const shared = v(rest[0]).filter(x => rest.every(r => v(r).includes(x)));
    if (shared.length && shared.every(x => !v(it).includes(x))) oddCount++;
  });
  ok(oddCount === 1, `odd :: exactly one odd one out (${tag}) ${q.id} (${oddCount})`);
}

function fakeCheck(q, { byId, norm, itemOf, ok }, tag) {
  const pack = byId.get(q.pack);
  const fake = optText(q, q.answer);
  ok((pack.fakes || []).includes(fake), `fake :: answer is in the pack fakes (${tag}) ${q.id}`);
  const real = new Set(pack.items.flatMap(it => [it.name, ...(it.alt || [])]).map(norm));
  ok(!real.has(norm(fake)), `fake :: fake is not a real item (${tag}) ${q.id}`);
  q.options.forEach((o, i) => { if (i !== q.answer) ok(real.has(norm(o.text)), `fake :: other options are real (${tag}) ${q.id} ${o.text}`); });
  ok(q.refs.every(r => itemOf(r)), `fake :: refs resolve (${tag})`);
}

function hiloCheck(q, { itemOf, byId, ok }, tag) {
  const key = q.id.split(':')[1];
  const [a, b] = q.refs.map(itemOf);
  if (!ok(a && b, `hilo :: refs resolve (${tag}) ${q.id}`)) return;
  const meta = byId.get(q.pack).factsMeta[key];
  const va = Number(a.facts[key]), vb = Number(b.facts[key]);
  ok(va !== vb, `hilo :: no ties (${tag}) ${q.id}`);
  const want = meta.type === 'year' ? (vb < va ? 0 : 1) : (vb > va ? 0 : 1);
  ok(q.answer === want, `hilo :: answer matches the data (${tag}) ${q.id}`);
  if (meta.type === 'year') ok(Math.abs(va - vb) >= 2, `hilo :: years far enough apart (${tag}) ${q.id}`);
  else if (va <= 0 || vb <= 0) ok(Math.abs(va - vb) >= 5, `hilo :: values far enough apart (${tag}) ${q.id}`);
  else ok(Math.max(va, vb) / Math.max(1e-9, Math.min(va, vb)) >= 1.19 || Math.sign(va) !== Math.sign(vb), `hilo :: values far enough apart (${tag}) ${q.id}`);
}

function lookCheck(q, { itemOf, ok }, tag) {
  const [t, ...w] = q.refs.map(itemOf);
  if (!ok(t && w.every(Boolean), `lookalike :: refs resolve (${tag}) ${q.id}`)) return;
  ok(optText(q, q.answer) === t.name, `lookalike :: answer is the target (${tag}) ${q.id}`);
  ok(w.every(x => (t.lookalikes || []).includes(x.id)), `lookalike :: wrong answers are real lookalikes (${tag}) ${q.id}`);
  ok(q.options.every(o => o.img?.src), `lookalike :: every option has a picture (${tag}) ${q.id}`);
}

function quoteCheck(q, { itemOf, norm, ok }, tag) {
  if (q.id.includes('/q:')) { ok(optText(q, q.answer) === q.answerText, `quote :: explicit answer (${tag}) ${q.id}`); return; }
  const [t, ...w] = q.refs.map(itemOf);
  if (!ok(t && w.every(Boolean), `quote :: refs resolve (${tag}) ${q.id}`)) return;
  ok(optText(q, q.answer) === t.name, `quote :: answer is the source (${tag}) ${q.id}`);
  const lineList = it => [it.quote, it.firstLine, ...(it.quotes || []).map(x => x?.text ?? x)].filter(Boolean);
  const lines = lineList(t).map(s => norm(s));
  const shown = norm(q.data.quote.replace(/…$/, ''));
  ok(lines.some(l => l.startsWith(shown)), `quote :: line belongs to the answer (${tag}) ${q.id}`);
  for (const x of w) ok(!lineList(x).some(l => norm(l).startsWith(shown)), `quote :: no other option owns the line (${tag}) ${q.id}`);
  ok(!shown.includes(norm(t.name)), `quote :: line does not name the answer (${tag}) ${q.id}`);
}

async function _fk() { return import('../js/formats/fkit.js'); }
const FK = await _fk();

function matchCheck(q, { itemOf, byId, norm, ok }, tag) {
  const d = q.data, items = q.refs.map(itemOf);
  if (!ok(items.every(Boolean) && Array.isArray(q.answer) && q.answer.length === d.left.length, `match :: shape (${tag}) ${q.id}`)) return;
  const rt = d.right.map(r => norm(r.text));
  ok(new Set(rt).size === rt.length, `match :: right column unique (${tag}) ${q.id}`);
  ok(new Set(d.left.map(l => norm(l.text))).size === d.left.length, `match :: left column unique (${tag}) ${q.id}`);
  const key = q.id.split(':')[1];
  const meta = byId.get(q.pack).factsMeta?.[key];
  const truth = items.map(it => (key === 'img' ? it.name : FK.fmtFact(meta, it.facts[key])));
  q.answer.forEach((j, i) => ok(d.right[j] && d.right[j].text === truth[i], `match :: pair ${i} correct (${tag}) ${q.id}`));
  if (!d.multi) ok(new Set(q.answer).size === q.answer.length, `match :: one-to-one (${tag}) ${q.id}`);
  d.right.forEach((r, j) => { if (!q.answer.includes(j)) ok(!truth.some(t => norm(t) === norm(r.text)), `match :: decoy is never right (${tag}) ${q.id}`); });
  if (key === 'img') ok(d.left.every(l => l.img?.src), `match :: pictures (${tag}) ${q.id}`);
}

import { readFileSync } from 'node:fs';
const ROOT = new URL('../', import.meta.url);
const { fuzzyMatch } = await import('../js/core/fuzzy.js');
const { FILMS } = await import('../js/formats/chain_data.js');
const { countryShape } = await import('../js/formats/f_shape.js');
const { scoreGuess } = await import('../js/formats/number.js');
const topo = JSON.parse(readFileSync(new URL('data/geo/world.json', ROOT)));

function ladderCheck(q, { itemOf, norm, ok }, tag) {
  const t = itemOf(q.refs[0]);
  if (!ok(t, `ladder :: refs resolve (${tag}) ${q.id}`)) return;
  ok(q.stages === q.data.clues.length && q.stages >= 5, `ladder :: stages = clues >= 5 (${tag}) ${q.id}`);
  ok(q.data.clues.every(c => (t.clues || []).includes(c)), `ladder :: clues are the item's (${tag}) ${q.id}`);
  ok(q.data.clues.every(c => !` ${norm(c)} `.includes(` ${norm(t.name)} `)), `ladder :: no clue names the answer (${tag}) ${q.id}`);
  ok(q.data.clues[q.data.clues.length - 1] === q.data.clues.at(-1) && t.clues.indexOf(q.data.clues[0]) <= t.clues.indexOf(q.data.clues.at(-1)), `ladder :: hard to easy (${tag}) ${q.id}`);
  if (q.options) ok(optText(q, q.answer) === t.name, `ladder :: answer option (${tag}) ${q.id}`);
  else ok(fuzzyMatch(t.name, q.data.accept).ok, `ladder :: typed answer accepted (${tag}) ${q.id}`);
}

function orderCheck(q, { itemOf, byId, ok }, tag) {
  const d = q.data;
  ok(Array.isArray(q.answer) && q.answer.length === d.items.length && new Set(q.answer).size === q.answer.length, `order :: answer is a permutation (${tag}) ${q.id}`);
  ok(q.answer.some((v, i) => v !== i), `order :: not already in order (${tag}) ${q.id}`);
  if (q.id.includes('/q:')) return;
  const key = q.id.split(':')[1];
  const meta = byId.get(q.pack).factsMeta[key];
  const byName = new Map(q.refs.map(itemOf).map(it => [it.name, it]));
  const vals = q.answer.map(i => Number(byName.get(d.items[i].text).facts[key]));
  const sorted = meta.type === 'year' ? vals.every((v, i) => i === 0 || v > vals[i - 1]) : vals.every((v, i) => i === 0 || v < vals[i - 1]);
  ok(sorted, `order :: answer order matches data, no ties (${tag}) ${q.id} ${vals}`);
}

function sortCheck(q, { itemOf, byId, norm, ok }, tag) {
  const d = q.data, [, type, key] = q.id.split(':');
  ok(q.answer.length === d.cards.length && q.answer.every(b => b >= 0 && b < d.bins.length), `sort :: answer shape (${tag}) ${q.id}`);
  ok(new Set(d.cards.map(c => norm(c.text))).size === d.cards.length, `sort :: unique cards (${tag}) ${q.id}`);
  const pack = byId.get(q.pack);
  d.cards.forEach((c, i) => {
    const it = pack.items.find(x => x.name === c.text);
    if (type === 'fake') ok(q.answer[i] === (it ? 0 : 1) && (it || pack.fakes.includes(c.text)), `sort :: real/fake bin (${tag}) ${q.id} ${c.text}`);
    else if (type === 'bool') ok(it && it.facts[key] === (q.answer[i] === 0), `sort :: bool bin (${tag}) ${q.id} ${c.text}`);
    else ok(it && String(it.facts[key]).toLowerCase() === d.bins[q.answer[i]].toLowerCase(), `sort :: cat bin (${tag}) ${q.id} ${c.text}`);
  });
}

function numberCheck(q, { itemOf, ok }, tag) {
  ok(Number.isFinite(q.answer), `number :: numeric answer (${tag}) ${q.id}`);
  ok(q.data.min < q.data.max && (q.data.log ? q.data.min > 0 : true), `number :: slider range (${tag}) ${q.id}`);
  ok(q.answer >= q.data.min && q.answer <= q.data.max, `number :: answer within slider (${tag}) ${q.id}`);
  ok(scoreGuess(q.answer, q.answer, q.data).correct && scoreGuess(q.answer, q.answer, q.data).points === 500, `number :: exact guess scores 500 (${tag}) ${q.id}`);
  const far = q.data.year ? q.answer + 200 : q.answer * 50 + 1e6;
  ok(!scoreGuess(far, q.answer, q.data).correct, `number :: far guess is wrong (${tag}) ${q.id}`);
  if (!q.id.includes('/q:')) { const it = itemOf(q.refs[0]); ok(it && Number(it.facts[q.id.split(':')[1]]) === q.answer, `number :: answer = data (${tag}) ${q.id}`); }
}

function connectCheck(q, { itemOf, byId, norm, ok }, tag) {
  const d = q.data, G = d.groups.length, S = d.size;
  ok(d.tiles.length === G * S && new Set(d.tiles.map(norm)).size === d.tiles.length, `connect :: unique tiles (${tag}) ${q.id}`);
  for (let g = 0; g < G; g++) ok(q.answer.filter(x => x === g).length === S, `connect :: group sizes (${tag}) ${q.id}`);
  // every tile matches its own group label and no other group's label
  const pack = byId.get(q.pack);
  const items = d.tiles.map(t => pack.items.find(it => it.name === t));
  const preds = d.groups.map(g => g.label);
  const fits = (it, label) => Object.entries(pack.factsMeta).some(([k, m]) => {
    const v = it.facts?.[k];
    if (v == null || Array.isArray(v)) return false;
    if (m.type === 'bool') return label === FK.fmtFact(m, v) && (label === (m.yes || 'Yes') || label === (m.no || 'No'));
    return m.type === 'cat' && label === `${m.label || k}: ${v}`;
  });
  items.forEach((it, i) => {
    if (!ok(it, `connect :: tile resolves (${tag}) ${q.id}`)) return;
    const own = preds.filter(l => fits(it, l));
    ok(own.length === 1 && own[0] === preds[q.answer[i]], `connect :: tile fits exactly its own group (${tag}) ${q.id} ${it.name}: ${own.join('|')}`);
  });
}

function blitzCheck(q, { byId, norm, ok }, tag) {
  const T = q.data.targets;
  ok(T.length >= 6 && q.answer === T.length, `blitz60 :: targets (${tag}) ${q.id}`);
  ok(new Set(T.map(t => norm(t.name))).size === T.length, `blitz60 :: unique targets (${tag}) ${q.id}`);
  ok(T.every(t => fuzzyMatch(t.name, t.accept).ok), `blitz60 :: names accepted (${tag}) ${q.id}`);
  const pack = byId.get(q.pack);
  ok(T.every(t => pack.items.some(it => it.name === t.name)), `blitz60 :: targets are pack items (${tag}) ${q.id}`);
}

function typeCheck(q, { itemOf, norm, ok }, tag) {
  ok(fuzzyMatch(String(q.answerText), q.data.accept).ok, `type :: answer accepted (${tag}) ${q.id}`);
  ok(!fuzzyMatch('qqqqqq', q.data.accept).ok, `type :: junk rejected (${tag}) ${q.id}`);
  if (q.id.startsWith('type:img') || q.id.startsWith('type:clue')) ok(itemOf(q.refs[0])?.name === q.answer, `type :: item answer (${tag}) ${q.id}`);
  if (q.data.clues) ok(q.data.clues.every(c => !` ${norm(c)} `.includes(` ${norm(q.answer)} `)), `type :: clues don't name it (${tag}) ${q.id}`);
}

function chainCheck(q, { ok }, tag) {
  const names = q.data.actors.map(a => a.name);
  ok(new Set(names).size === names.length, `chain :: no repeated actor (${tag}) ${q.id}`);
  const films = q.data.links.map((l, i) => l.options[q.answer[i]]);
  ok(new Set(films).size === films.length, `chain :: no repeated film (${tag}) ${q.id}`);
  q.data.links.forEach((l, i) => {
    const a = names[i], b = names[i + 1];
    ok(FILMS[films[i]]?.includes(a) && FILMS[films[i]]?.includes(b), `chain :: answer film has both (${tag}) ${q.id}`);
    l.options.forEach((t, j) => { if (j !== q.answer[i]) ok(!(FILMS[t]?.includes(a) && FILMS[t]?.includes(b)), `chain :: wrong film lacks the pair (${tag}) ${q.id} ${t}`); });
  });
}

function silCheck(q, { itemOf, ok }, tag) {
  const t = itemOf(q.refs[0]);
  if (!ok(t && t.iso3 === q.data.iso, `silhouette :: iso (${tag}) ${q.id}`)) return;
  ok(optText(q, q.answer) === t.name, `silhouette :: answer (${tag}) ${q.id}`);
  const s = countryShape(topo, q.data.iso);
  ok(s && s.frac >= 0.8 && s.main.length >= 200, `silhouette :: recognisable outline (${tag}) ${q.id} ${s && s.frac.toFixed(2)}`);
}

function revealCheck(q, { itemOf, ok }, tag) {
  const t = itemOf(q.refs[0]);
  ok(t && optText(q, q.answer) === t.name, `reveal :: answer (${tag}) ${q.id}`);
  ok(q.data.img?.src && t.media.img.some(m => m.src === q.data.img.src), `reveal :: image is the item's (${tag}) ${q.id}`);
  ok(!q.stages && ['full', 'zoom'].includes(q.data.mode), `reveal :: not progressive, mode full|zoom (${tag}) ${q.id}`);
  ok(q.data.mode === 'zoom' ? [50, 65, 80, 90].includes(q.data.fullAt) : q.data.fullAt === undefined, `reveal :: zoom carries fullAt (${tag}) ${q.id}`);
  for (const r of q.refs.slice(1)) ok(itemOf(r)?.name !== t.name, `reveal :: distractor differs (${tag})`);
}

export const VALIDATORS = { match: matchCheck, ladder: ladderCheck, order: orderCheck, sort: sortCheck, number: numberCheck, connect: connectCheck,
  blitz60: blitzCheck, type: typeCheck, chain: chainCheck, silhouette: silCheck, reveal: revealCheck, odd: oddCheck, fake: fakeCheck, hilo: hiloCheck, lookalike: lookCheck, quote: quoteCheck };
