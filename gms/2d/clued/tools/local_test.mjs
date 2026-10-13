#!/usr/bin/env node
// Local focus unit tests (node): tagging precision on trap phrases, round shares hit their targets, "I live here"
// eases only the focus country, the room spec carries the focus and rebuilds identically, in-country questions are
// right, the geo validator passes and catches planted errors. Exit 1 on any failure.
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
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
const { makeSpec, buildQuestions } = await import(js('core/spec.js'));
const L = await import(js('core/local.js'));
const { homeQuestions } = await import(js('core/localgeo.js'));
const { cleanQuestion } = await import(js('net/sanitize.js'));
const { givesAway } = await import(js('formats/registry.js'));
const { rngFrom } = await import(js('core/rng.js'));
const { loadPack } = await import(js('core/packs.js'));
const geoData = await import(js('geo/data.js'));
const { textIsos, valueIsos } = await import(pathToFileURL(join(ROOT, 'tools/local_tags.mjs')).href + '?lib');
const { validate } = await import(pathToFileURL(join(ROOT, 'tools/local_geo_build.mjs')).href);
await Promise.all([L.loadTags(), L.loadLocalGeo(), L.loadNames(), L.loadPlaces(), geoData.loadIndex()]);

let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { fails++; console.log('FAIL', m); } };
const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

/* 1. tagging precision: traps never tag, real mentions do */
const CASES = [
  ['What bird do many families roast at Thanksgiving? Turkey', []],
  ['Which bird gobbles? Turkey', []],
  ['What is the capital of Turkey? Ankara', ['TUR']],
  ['Atlanta is the capital of which US state? Georgia', ['USA']],
  ['Tbilisi is the capital of which country? Georgia', ['GEO']],
  ['Which team did Michael Jordan win six titles with? Chicago Bulls', []],
  ['Amman is the capital of which country? Jordan', ['JOR']],
  ['Chad is a landlocked country in which continent? Africa', ['TCD']],
  ['Who was Chad Smith? A drummer', []],
  ['Which actor plays Spider-Man in Homecoming? Tom Holland', []],
  ['What is the French word for cat? Chat', []],
  ["'Danke' means 'thank you' in which language? German", []],
  ['Which is the warmest ocean? Indian Ocean', []],
  ['What is a five-sided shape called? Pentagon', []],
  ['What colour can a guinea pig be? Brown', []],
  ['Which English king sealed Magna Carta in 1215? King John', ['GBR']],
  ['In which country is Machu Picchu? Peru', ['PER']],
  ['Which country hosted the 1988 Summer Olympics? South Korea', ['KOR']],
  ['Which city is home to the Opera House with sail-shaped roofs? Sydney', ['AUS']],
  ['Which desert covers much of New Mexico? Chihuahuan', []],
  ['Who wrote Hamlet? William Shakespeare', []],
  ['How many players are on a cricket team? 11', []],
  ['Which country gifted the Statue of Liberty to the United States? France', ['FRA', 'USA']],
  ['Iceland is a member of the European Union. false', ['ISL']],
  ['Who lived in Paris with Helen of Troy? Paris', []],
];
for (const [t, want] of CASES) { const got = textIsos(t); ok(same(got, want), `tag "${t}" → ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); }
ok(same(valueIsos('Austrian-American'), ['AUT', 'USA']), 'nationality "Austrian-American" → AUT + USA');
ok(same(valueIsos('South Korea and Japan'), ['KOR', 'JPN']), 'host "South Korea and Japan" → both');
ok(valueIsos('many parts of the world').length === 0, 'vague region → no tag');

/* 2. the sidecar exists and covers the packs that have country facts */
const tags = L.loadTags && JSON.parse(readFileSync(join(ROOT, 'data/local/tags.json'), 'utf8'));
for (const id of ['capitals', 'countries', 'people', 'general', 'history', 'sport', 'snakes']) ok(Object.keys(tags.packs[id]?.i || {}).length + Object.keys(tags.packs[id]?.q || {}).length > 0, `tags.json has ${id}`);
ok(tags.packs.countries.i.australia === 'AUS' && tags.packs.capitals.i.canberra === 'AUS', 'Australia / Canberra tagged AUS');

/* 3. round shares: local count hits the target whenever the pool can */
const ROUNDS = [{ format: 'mc', packs: 'all', count: 10 }, { format: 'tf', packs: 'all', count: 10 }, { format: 'number', packs: 'all', count: 10 }, { format: 'mc', packs: ['general'], count: 10 }];
for (const [cc, level] of [['AUS', 'more'], ['AUS', 'most'], ['USA', 'all'], ['GBR', 'most'], ['JPN', 'more']]) {
  for (const seed of ['a', 'b']) {
    const report = [];
    const spec = makeSpec('quick', ROUNDS, `${cc}${level}${seed}`, { local: { cc, level, live: true } });
    const { questions } = await buildQuestions(spec, { report });
    for (const row of report) {
      const qs = questions.filter(q => q.round === row.round);
      const loc = qs.filter(q => q.loc).length;
      const target = L.targetOf(row.count, level);
      const reachable = Math.min(target, row.pool);
      ok(qs.length === row.count, `${cc} ${level} r${row.round}: ${qs.length}/${row.count} questions`);
      ok(Math.abs(loc - reachable) <= 1 || (level === 'all' && loc >= Math.min(row.count, row.pool) - 1), `${cc} ${level} r${row.round} (${ROUNDS[row.round].format} ${ROUNDS[row.round].packs}): ${loc} local, want ${reachable} (target ${target}, pool ${row.pool})`);
      ok(qs.filter(q => q.loc).every(q => L.isLocalQ(q, cc)), `${cc} r${row.round}: every flagged question is about ${cc}`);
    }
  }
}
// off = exactly the old behaviour
{
  const a = await buildQuestions(makeSpec('quick', ROUNDS, 'same'));
  const b = await buildQuestions(makeSpec('quick', ROUNDS, 'same', { local: { cc: 'AUS', level: 'off', live: true } }));
  ok(JSON.stringify(a.questions.map(q => q.id)) === JSON.stringify(b.questions.map(q => q.id)), 'level off builds the same questions as no focus');
  ok(!a.questions.some(q => q.loc), 'no focus → no local flags');
}

/* 4. "I live here" eases only the focus country */
{
  const snakes = await loadPack('snakes');
  const v = L.easeView(snakes, 'AUS');
  let eased = 0, other = 0, wrong = 0;
  snakes.items.forEach((it, i) => {
    const d0 = it.difficulty || 2, d1 = v.items[i].difficulty || 2;
    if (L.itemLocal(snakes, it, 'AUS')) { eased++; if (d1 !== Math.max(1, d0 - 1)) wrong++; } else { other++; if (d1 !== d0) wrong++; }
  });
  ok(eased > 5 && other > 5 && wrong === 0, `easeView: ${eased} Australian snakes one step easier, ${other} others unchanged (${wrong} wrong)`);
  const C = { rng: rngFrom('h'), cc: 'AUS', format: 'mc', count: 400, geo: { countries: { AUS: (await L.loadLocalGeo()).countries.AUS } }, states: geoData.geo.states, cname: 'Australia' };
  const plain = homeQuestions({ ...C, rng: rngFrom('h1'), difficulty: 1 }).length, home = homeQuestions({ ...C, rng: rngFrom('h1'), difficulty: 1, live: true }).length;
  ok(home > plain, `in-country easy pool grows with "I live here" (${plain} → ${home})`);
  // a focus on Japan never eases Australian items
  const vj = L.easeView(snakes, 'JPN');
  ok(snakes.items.every((it, i) => (vj.items[i].difficulty || 2) === (it.difficulty || 2)), 'focus JPN leaves every snake rating alone');
}

/* 5. the room spec carries the focus; the host's build is deterministic */
{
  const l = L.resolveLocal({ cc: 'JPN', level: 'most' }, 'AUS');
  ok(l.cc === 'JPN' && l.live === false, 'a picked country starts with "I live here" off');
  ok(L.resolveLocal({ level: 'more' }, 'AUS').live === true, 'the detected country starts with "I live here" on');
  const spec = makeSpec('online', [{ format: 'mc', packs: 'all', count: 10, opts: { online: true } }], 'room1', { local: L.specLocal(l) });
  const wire = JSON.parse(JSON.stringify(spec));
  ok(JSON.stringify(wire.local) === JSON.stringify({ cc: 'JPN', level: 'most', live: false }), 'spec.local survives JSON (server stores the spec as-is)');
  const a = await buildQuestions(spec), b = await buildQuestions(wire);
  ok(JSON.stringify(a.questions.map(q => q.prompt)) === JSON.stringify(b.questions.map(q => q.prompt)), 'same spec → same questions (play again / P2P resume)');
  ok(L.specLocal({ cc: 'JPN', level: 'off' }) === undefined, 'off is not written into the spec');
}

/* 6. in-country questions are right and survive the room sanitiser */
{
  const G = await L.loadLocalGeo();
  let n = 0;
  for (const cc of Object.keys(G.countries)) {
    for (const format of ['mc', 'tf', 'number', 'map-click']) {
      const qs = homeQuestions({ rng: rngFrom(`q${cc}${format}`), cc, format, count: 80, geo: G, states: geoData.geo.states, cname: L.countryName(cc) });
      for (const q of qs) {
        n++;
        ok(cleanQuestion(JSON.parse(JSON.stringify(q)))?.data?.local === cc, `${cc} ${q.id}: passes sanitize with data.local`);
        ok(L.isLocalQ(q, cc), `${cc} ${q.id}: counts as local`);
        if (Array.isArray(q.options)) {
          const texts = q.options.map(o => o.text);
          ok(new Set(texts).size === texts.length && q.answer >= 0 && q.answer < texts.length, `${cc} ${q.id}: options unique, answer in range`);
          ok(!givesAway(q.answerText, q.prompt, texts.filter((t, i) => i !== q.answer)), `${cc} ${q.id}: no giveaway in "${q.prompt}"`);
        }
        const m = /^What is the capital of (.+)\?$/.exec(q.prompt);
        if (m) { const st = Object.values(G.countries[cc].states).find(s => s.n === m[1]); ok(st && st.capital === q.answerText, `${cc}: capital of ${m[1]} = ${q.answerText}`); }
        const bm = /^Which has more people: (.+) or (.+)\?$/.exec(q.prompt);
        if (bm) { const p = x => G.countries[cc].cities.find(c => c.n === x).pop; const [x, y] = [p(bm[1]), p(bm[2])]; ok(Math.max(x, y) / Math.min(x, y) >= 1.5 && q.answerText === (x > y ? bm[1] : bm[2]), `${cc}: ${bm[1]} vs ${bm[2]}`); }
      }
    }
  }
  ok(n > 500, `in-country questions checked: ${n}`);
  ok(!homeQuestions({ rng: rngFrom('x'), cc: 'ITA', format: 'mc', count: 10, geo: G, states: geoData.geo.states, cname: 'Italy' }).length, 'no clean data (Italy) → no in-country questions');
}

/* 7. geo validator: committed file passes, planted errors are caught */
{
  const G = JSON.parse(readFileSync(join(ROOT, 'data/local/geo.json'), 'utf8'));
  const v = validate(G);
  ok(!v.errs.length, `geo.json validates (${v.errs.slice(0, 3).join('; ')})`);
  const bad = JSON.parse(JSON.stringify(G));
  bad.countries.AUS.states['AU-TAS'].capital = null;
  bad.countries.AUS.cities.push({ n: 'Cranbourne', st: 'AU-VIC', pop: 460000, year: 2020 });
  bad.countries.USA.cities[0].pop = 9e9;
  const e = validate(bad).errs.join(' | ');
  ok(/AU-TAS/.test(e) && /Cranbourne/.test(e) && /out of range/.test(e), 'validator catches a missing capital, a suburb and a crazy population');
}

/* 8. detection and the multi-ref rule */
{
  const places = { iso2: { NZ: 'NZL', AU: 'AUS' }, tz: {} };
  ok(L.detectCountry(places, { navigator: { languages: ['en-NZ'], language: 'en-NZ' } }) === 'NZL', 'no time-zone match → language region (en-NZ → NZL)');
  ok(L.isLocalQ({ format: 'order', refs: ['countries/australia', 'countries/japan', 'countries/france', 'countries/peru'] }, 'AUS') === false, 'order with 1 of 4 local refs is not local');
  ok(L.isLocalQ({ format: 'order', refs: ['countries/australia', 'capitals/canberra', 'countries/france', 'countries/peru'] }, 'AUS') === true, 'order with 2 of 4 local refs is local');
  ok(L.isLocalQ({ format: 'mc', refs: ['countries/australia', 'countries/japan'] }, 'AUS') === true, 'mc: the subject ref decides');
}

console.log(fails ? `${fails} of ${checks} checks FAILED` : `local_test: ${checks} checks ok`);
process.exit(fails ? 1 : 0);
