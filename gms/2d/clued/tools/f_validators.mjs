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
  if (meta.type === 'year') ok(Math.abs(va - vb) >= 3, `hilo :: years far enough apart (${tag}) ${q.id}`);
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
  const lines = [t.quote, t.firstLine, ...(t.quotes || [])].filter(Boolean).map(s => norm(s));
  const shown = norm(q.data.quote.replace(/…$/, ''));
  ok(lines.some(l => l.startsWith(shown)), `quote :: line belongs to the answer (${tag}) ${q.id}`);
  for (const x of w) ok(![x.quote, x.firstLine, ...(x.quotes || [])].filter(Boolean).some(l => norm(l).startsWith(shown)), `quote :: no other option owns the line (${tag}) ${q.id}`);
  ok(!shown.includes(norm(t.name)), `quote :: line does not name the answer (${tag}) ${q.id}`);
}

export const VALIDATORS = { odd: oddCheck, fake: fakeCheck, hilo: hiloCheck, lookalike: lookCheck, quote: quoteCheck };
