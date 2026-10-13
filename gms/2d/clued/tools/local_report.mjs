#!/usr/bin/env node
// Local focus coverage → docs/notes/LOCAL_COVERAGE.md. For ~40 countries: local question pools per pack and format
// (real generate() pools, the same code the game runs), whether More / Most / ALL fill a 5×10 game, and the thinnest
// areas. Rerun after content or tag changes: node tools/local_tags.mjs && node tools/local_report.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const realFetch = globalThis.fetch;
globalThis.fetch = async (u, o) => {
  const s = String(u?.url || u);
  if (!s.startsWith('file:')) return realFetch(u, o);
  try { return new Response(await readFile(fileURLToPath(s.split(/[?#]/)[0])), { status: 200 }); } catch { return new Response('', { status: 404 }); }
};
const js = p => pathToFileURL(join(ROOT, 'js', p)).href;
const { MODULES } = await import(js('formats/index.js'));
for (const m of MODULES) await import(new URL(m, js('formats/index.js')).href);
const { getFormat, defaultOpts } = await import(js('formats/registry.js'));
const { loadIndex, loadPack } = await import(js('core/packs.js'));
const { makeSpec, buildQuestions, supportedPackIds } = await import(js('core/spec.js'));
const L = await import(js('core/local.js'));
const { homeQuestions } = await import(js('core/localgeo.js'));
const { rngFrom } = await import(js('core/rng.js'));
const geoData = await import(js('geo/data.js'));
const { SUGGESTED } = await import(js('net/suggested.js'));
const index = await loadIndex();
const [, G] = await Promise.all([L.loadTags(), L.loadLocalGeo(), L.loadNames(), geoData.loadIndex()]);

const TOP = 'USA GBR AUS CAN NZL IRL IND ZAF NGA KEN PHL SGP MYS JPN CHN KOR DEU FRA ITA ESP NLD BEL CHE AUT SWE NOR DNK FIN POL PRT GRC TUR RUS BRA ARG MEX EGY IDN THA VNM'.split(' ');
const FORMATS = ['mc', 'tf', 'number', 'type', 'order', 'reveal'];
const AREAS = { geography: 'Geography', people: 'People', sport: 'Sport', music: 'Music', screen: 'Screen', history: 'History', general: 'General', animals: 'Nature', nature: 'Nature', food: 'Food', science: 'Science', books: 'Books', art: 'Art', kids: 'Kids' };
const real = Object.keys(index.packs).filter(id => !index.packs[id].virtual);

// pool[cc][format][pack] = distinct local questions generate() can make (cap 200)
async function pools(cc) {
  const out = {};
  for (const f of FORMATS) {
    const fmt = getFormat(f);
    out[f] = {};
    for (const id of supportedPackIds(fmt, index).filter(id => real.includes(id))) {
      const pack = await loadPack(id);
      const rng = rngFrom(`rep:${cc}:${f}:${id}`);
      const v = L.localView(pack, cc, rng);
      if (!v) continue;
      const seen = new Set();
      for (let k = 0; k < 3; k++) try { for (const q of fmt.generate({ rng, packs: [v], count: 200, opts: defaultOpts(fmt), difficulty: 0 }) || []) if (L.isLocalQ(q, cc)) seen.add(q.id); } catch (e) {}
      if (seen.size) out[f][id] = seen.size;
    }
  }
  out.home = {};
  for (const f of ['mc', 'tf', 'number', 'map-click']) {
    const n = homeQuestions({ rng: rngFrom(`home:${cc}:${f}`), cc, format: f, count: 400, geo: G, states: geoData.geo.states, cname: L.countryName(cc) }).length;
    if (n) out.home[f] = n;
  }
  return out;
}

// Can a 5×10 game reach this level's share in every round? Worst of 2 seeds; returns { ok, local, of }.
async function fill(cc, level, rounds) {
  let worst = null;
  for (const seed of ['r1', 'r2']) {
    const report = [];
    await buildQuestions(makeSpec('report', rounds, `${cc}:${level}:${seed}`, { local: { cc, level, live: true } }), { report, sparesRatio: 0.2 });
    const local = report.reduce((a, r) => a + r.local, 0), of = report.reduce((a, r) => a + r.count, 0);
    const okAll = report.every(r => r.local >= r.target);
    if (!worst || local < worst.local) worst = { ok: okAll, local, of };
    if (!okAll) worst.ok = false;
  }
  return worst;
}
const PUB = SUGGESTED.find(s => s.id === 'pub').rounds.map(({ title, ...r }) => r);
const ALLTHEMES = [0, 1, 2, 3, 4].map(() => ({ format: 'mc', packs: 'all', count: 10, opts: {}, difficulty: 0 }));

const rows = [];
for (const cc of TOP) {
  const P = await pools(cc);
  const area = {};
  for (const [id, n] of Object.entries(P.mc)) { const a = AREAS[index.packs[id].theme] || 'Other'; area[a] = (area[a] || 0) + n; }
  if (P.home.mc) area.Geography = (area.Geography || 0) + P.home.mc;
  const fills = {};
  for (const level of ['more', 'most', 'all']) fills[level] = { pub: await fill(cc, level, PUB), any: await fill(cc, level, ALLTHEMES) };
  const sum = o => Object.values(o).reduce((a, b) => a + b, 0);
  rows.push({ cc, name: L.countryName(cc), P, area, fills, mc: sum(P.mc) + (P.home.mc || 0), total: FORMATS.reduce((a, f) => a + sum(P[f]), 0) + sum(P.home) });
  process.stdout.write(`${cc} `);
}
console.log();

const mark = f => (f.ok ? `✅ ${f.local}/${f.of}` : `❌ ${f.local}/${f.of}`);
const allPub = rows.filter(r => r.fills.all.pub.ok).map(r => r.name), allAny = rows.filter(r => r.fills.all.any.ok).map(r => r.name);
const mostPub = rows.filter(r => r.fills.most.pub.ok).map(r => r.name), moreAny = rows.filter(r => r.fills.more.any.ok).map(r => r.name);
const SHOW = ['Geography', 'People', 'Sport', 'Music', 'Screen', 'History', 'General', 'Nature', 'Food'];
// thinnest: per area, how many of the 40 have fewer than 10 local mc questions
const thin = SHOW.map(a => ({ a, n: rows.filter(r => (r.area[a] || 0) < 10).length, med: rows.map(r => r.area[a] || 0).sort((x, y) => x - y)[Math.floor(rows.length / 2)] })).sort((x, y) => y.n - x.n);
const today = new Date().toISOString().slice(0, 10);
const md = [];
md.push(`# Local focus coverage (${today})`, '',
  'Built by `tools/local_report.mjs` from the real question pools (`generate()` on each pack\'s local view, plus in-country',
  'geography from `data/local/geo.json`). Tags: `data/local/tags.json` (`tools/local_tags.mjs`). "I live here" on throughout.', '',
  '**Fill tests** (worst of two seeds, every round must reach its share): *Pub quiz* = the Classic Pub Quiz suggestion (general,',
  'history, map, sport, music & screen clips; 5×10). *All themes* = five multiple-choice rounds on All themes (5×10).', '',
  '## Headline', '',
  `- **ALL works for a whole pub quiz**: ${allPub.length ? allPub.join(', ') : 'nobody yet'}.`,
  `- **ALL works on All-themes rounds**: ${allAny.length ? allAny.join(', ') : 'nobody'} (${allAny.length} of ${rows.length}).`,
  `- **Most (≈60%) works for a pub quiz**: ${mostPub.length ? mostPub.join(', ') : 'nobody'}.`,
  `- **More (≈25%) works on All-themes rounds**: ${moreAny.length} of ${rows.length} countries${moreAny.length < rows.length ? ` (not: ${rows.filter(r => !r.fills.more.any.ok).map(r => r.name).join(', ')})` : ''}.`,
  `- **Thinnest areas** (countries of ${rows.length} with fewer than 10 local multiple-choice questions there; median count): ${thin.map(t => `${t.a} ${t.n} (median ${t.med})`).join(' · ')}.`,
  '- In-country geography (states, capitals, cities) exists for: ' + Object.keys(G.countries).map(c => L.countryName(c)).join(', ') + '.', '');
md.push('## Countries', '', `| Country | mc pool | ${SHOW.join(' | ')} | Pub More | Pub Most | Pub ALL | All-themes More | Most | ALL |`, `|${'---|'.repeat(SHOW.length + 8)}`);
for (const r of rows.sort((a, b) => b.mc - a.mc)) {
  md.push(`| ${r.name} | ${r.mc} | ${SHOW.map(a => r.area[a] || 0).join(' | ')} | ${mark(r.fills.more.pub)} | ${mark(r.fills.most.pub)} | ${mark(r.fills.all.pub)} | ${mark(r.fills.more.any)} | ${mark(r.fills.most.any)} | ${mark(r.fills.all.any)} |`);
}
md.push('', 'Area columns count local multiple-choice questions (pack pools by theme; Geography includes in-country questions).', '',
  '## Per pack and format', '', 'Local questions per format; packs listed by size (multiple choice), `home` = in-country geography.', '');
for (const r of rows) {
  const top = Object.entries(r.P.mc).sort((a, b) => b[1] - a[1]).map(([id, n]) => `${id} ${n}`).join(', ');
  const fm = FORMATS.map(f => `${f} ${Object.values(r.P[f]).reduce((a, b) => a + b, 0)}`).join(' · ');
  const home = Object.entries(r.P.home).map(([f, n]) => `${f} ${n}`).join(', ');
  md.push(`- **${r.name}** (${r.cc}): ${fm}${home ? ` · home: ${home}` : ''}. mc by pack: ${top || 'none'}.`);
}
md.push('', '## Reading it', '',
  '- A ❌ means at least one round fell short; the game still fills the round with normal questions and the host sees',
  '  "📍 only N of 10 local" on that round card.',
  '- Music and screen are mostly US/UK: the hits packs follow the US charts and the movies pack is Hollywood. The planned',
  '  music/screen wave (country charts, local films) is the fix there; this report decides which countries go first.',
  '- People: the people/actors/leaders packs are ~70% US/UK, so most countries have a handful of famous names at most.');
await writeFile(join(ROOT, 'docs/notes/LOCAL_COVERAGE.md'), md.join('\n') + '\n');
console.log(`wrote docs/notes/LOCAL_COVERAGE.md · ALL pub: ${allPub.join(', ') || 'none'} · ALL all-themes: ${allAny.join(', ') || 'none'}`);
