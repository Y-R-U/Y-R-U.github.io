// QF audit sampler: prints a stratified sample of generated questions for a human fact-check.
// node tools/qf_sample.mjs [total=300] [seed=qf1]   (FMTS=mc,tf,... to limit formats)
import { readFileSync, readdirSync } from 'node:fs';
const ROOT = new URL('../', import.meta.url).pathname;
const imp = p => import(ROOT + p);
const TOTAL = +(process.argv[2] || 300);
const SEED = process.argv[3] || 'qf1';
const { rngFrom } = await imp('js/core/rng.js');
const registry = await imp('js/formats/registry.js');
const { summarize } = await imp('js/core/packs.js');
const { kidsView } = await imp('js/core/spec.js');
const FORMATS = (process.env.FMTS || 'mc,tf,hilo,odd,order,match,number,type,fake,quote,connect,sort,ladder,chain').split(',');
for (const f of FORMATS) await imp(`js/formats/${f}.js`);
const packs = readdirSync(ROOT + 'data/packs').filter(f => f.endsWith('.json') && !f.startsWith('_') && f !== 'movie-moments.json')
  .map(f => JSON.parse(readFileSync(ROOT + 'data/packs/' + f, 'utf8')));
let index = {};
try { index = JSON.parse(readFileSync(ROOT + 'data/index.json', 'utf8')).packs || {}; } catch (e) {}
const multiOf = p => Object.entries(p.factsMeta || {}).filter(([, m]) => m.type === 'cat' && m.exclusive === false).map(([k]) => k);
const infoOf = p => { const b = summarize(p); const caps = { ...b.caps, ...(index[p.id]?.caps || {}) }; if (!caps.multi) caps.multi = multiOf(p); return { id: p.id, ...b, caps }; };
const R = rngFrom(SEED);
const explicit = q => JSON.stringify(q.refs || []).includes('/q:');
const cells = [];
for (const fid of FORMATS) {
  const f = registry.getFormat(fid);
  for (const p of packs) {
    if (registry.supportsPack(f, infoOf(p)) !== true) continue;
    for (const d of [0, 1, 2, 3, 'kids']) {
      const kids = d === 'kids';
      const pk = kids ? kidsView(p) : p;
      if (kids && (!f.kids || !(pk.items.length + (pk.questions || []).length))) continue;
      const opts = { ...registry.defaultOpts(f) };
      if (fid === 'mc') opts.source = 'facts';
      let qs = [];
      try { qs = f.generate({ rng: rngFrom(`${SEED}:${fid}:${p.id}:${d}`), packs: [pk], count: 8, opts, difficulty: kids ? 1 : d, kids, avoid: new Set(), round: 0, spec: {} }) || []; } catch (e) { console.error('ERR', fid, p.id, e.message); }
      qs = qs.filter(q => !explicit(q));
      if (qs.length) cells.push({ fid, pack: p.id, d, qs });
    }
  }
}
// stratify: equal share per format, then round-robin packs within format
const byF = new Map();
for (const c of cells) { if (!byF.has(c.fid)) byF.set(c.fid, []); byF.get(c.fid).push(c); }
const out = [];
const per = Math.ceil(TOTAL / byF.size);
for (const [fid, cs] of byF) {
  const shuffled = cs.map(c => [R(), c]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
  let taken = 0, i = 0, guard = 0;
  const usedPack = new Map();
  while (taken < per && guard++ < 5000) {
    const c = shuffled[i++ % shuffled.length];
    if (!c.qs.length) continue;
    const q = c.qs.splice(Math.floor(R() * c.qs.length), 1)[0];
    out.push({ ...c, q }); taken++;
  }
}
const strip = o => JSON.parse(JSON.stringify(o, (k, v) => (k === 'img' || k === 'media' || k === 'audio' || k === 'hint' || k === 'refs') ? undefined : v));
out.slice(0, TOTAL).forEach((x, n) => {
  const q = strip(x.q);
  const opts = (q.options || []).map((o, i) => (i === q.answer ? '*' : '') + (o.text ?? (typeof o === 'object' ? JSON.stringify(o) : o)));
  delete q.options; delete q.format;
  console.log(`#${n + 1} [${x.fid} | ${x.pack} | d${x.d}] ${q.id}\n  P: ${q.prompt}${opts.length ? '\n  O: ' + opts.join(' | ') : ''}`);
  delete q.prompt; delete q.id;
  const rest = JSON.stringify(q);
  console.log('  ' + rest.slice(0, 900));
});
console.error('cells', cells.length, 'formats', byF.size);
