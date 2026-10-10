// Currency + language questions: distractors a country's name can't rule out, and a note on each wrong option.
//   node tools/c2_distract.mjs        rewrites data/packs/currencies.json + languages.json in place (c2_build_geo.mjs runs it too)
// Currency options are bare units ("Dinar", "Riyal") drawn from the same region, since "Kuwait → Kuwaiti dinar" is a
// giveaway whatever the distractors are. Languages take neighbours' and same-branch languages. A question whose answer
// still carries the country's name (Albania → Albanian, Afghanistan → afghani) is rated difficulty 1.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rng, sample, slug } from './c2_lib.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PACKS = join(ROOT, 'data/packs');
const read = id => JSON.parse(readFileSync(join(PACKS, id + '.json'), 'utf8'));
const write = pack => writeFileSync(join(PACKS, pack.id + '.json'), JSON.stringify(pack, null, 1) + '\n');

const EXEMPT = new Set('people peoples republic state states united islands island kingdom democratic federal federated saint new north south east west central great and the of'.split(' '));
const toks = s => (s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().match(/[a-z]+/g) || []).filter(t => t.length >= 3 && !EXEMPT.has(t));
// Demonyms a prefix can't see (Denmark/Danish, Rwanda/Kinyarwanda).
const IRREG = { denmark: ['danish'], poland: ['polish'], netherlands: ['dutch'], switzerland: ['swiss'], france: ['french'], spain: ['spanish'],
  ireland: ['irish'], finland: ['finnish'], philippines: ['filipino'], madagascar: ['malagasy'], burundi: ['kirundi'], eswatini: ['swazi', 'swati'],
  lesotho: ['sesotho'], botswana: ['setswana'], myanmar: ['burmese'], kingdom: ['british', 'english', 'sterling'], cambodia: ['khmer'], israel: ['israeli'] };
const stems = t => [t, ...(IRREG[t] || [])];
// true when the country's name gives the option away (Kuwait/Kuwaiti, Albania/Albanian, Laos/Lao, Denmark/Danish)
export function nameMatch(country, option) {
  const opt = toks(option);
  for (const t of toks(country.replace(/United Kingdom/, 'kingdom'))) for (const a of stems(t)) for (const b of opt) {
    const k = Math.min(a.length, b.length, 4);
    if ((k >= 3 && a.slice(0, k) === b.slice(0, k)) || (a.length >= 5 && b.includes(a))) return true;
  }
  return false;
}
// Languages widely used in a country though not one of its listed main languages: never offered as wrong there.
const AMBIG = { AND: ['Spanish', 'French'], DZA: ['French'], MAR: ['French'], TUN: ['French'], LBN: ['French', 'English'], MRT: ['French'],
  MCO: ['Italian', 'English'], UKR: ['Russian'], MDA: ['Russian'], LVA: ['Russian'], EST: ['Russian'], GEO: ['Russian'], TJK: ['Russian'],
  TKM: ['Russian'], UZB: ['Russian'], AZE: ['Russian'], ARM: ['Russian'], ISR: ['Arabic', 'English'], CYP: ['English'], NAM: ['Afrikaans', 'German'],
  MYS: ['English'], LKA: ['English'], ARE: ['English'], QAT: ['English'], BHR: ['English'], KWT: ['English'], OMN: ['English'], EGY: ['English'],
  ESP: ['Catalan', 'Basque', 'Galician'], FRA: ['Occitan', 'Breton'], BEL: ['English'], CHE: ['Romansh', 'English'], AUT: ['Hungarian'],
  SVK: ['Hungarian'], ROU: ['Hungarian'], RUS: ['Tatar'], CHN: ['Cantonese'], PRY: ['Portuguese'], URY: ['Portuguese'], ARG: ['Guaraní', 'Quechua'], PSE: ['Hebrew', 'English'], LTU: ['Russian', 'Polish'] };

const listAnd = a => (a.length <= 1 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]);
const some = (names, n = 4) => (names.length > n ? `${names.slice(0, n - 1).join(', ')} and ${names.length - n + 1} others` : listAnd(names));
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

const UNIT_FIX = { 'Renminbi (yuan)': 'yuan', 'Pound sterling': 'pound', 'Zimbabwe Gold (ZiG)': 'ZiG', Euro: 'euro' };
function unitName(name) {
  if (UNIT_FIX[name]) return UNIT_FIX[name];
  if (/CFA franc/.test(name)) return 'CFA franc';
  if (/convertible mark$/.test(name)) return 'convertible mark';
  return name.split(' ').pop();
}
// króna and krona read the same to a player: one unit, keyed without accents (krona/krone/koruna stay apart)
const unitKey = u => u.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const unitShown = {};
export const unitOf = name => { const u = unitName(name), k = unitKey(u); unitShown[k] ??= u; return unitShown[k]; };

export function run() {
  const countries = read('countries').items;
  const geo = JSON.parse(readFileSync(join(ROOT, 'data/geo/countries.json'), 'utf8'));
  const cont = c => [].concat(c.facts.continent)[0];
  const bySlug = Object.fromEntries(countries.map(c => [slug(c.name), c]));
  const byName = Object.fromEntries(countries.map(c => [c.name, c]));
  const byIso = Object.fromEntries(countries.map(c => [c.iso3, c]));
  const curOf = c => String(c.facts.currency || '').split(' and ').filter(Boolean);
  const langsOf = c => String(c.facts.languages || '').split(', ').filter(Boolean);
  const nbOf = c => (geo[c.iso3]?.nb || []).map(i => byIso[i]).filter(Boolean);

  /* ---------------- currencies ---------------- */
  const cur = read('currencies');
  const unitUsers = {}, curUsers = {}, unitRegions = {};
  for (const c of countries) for (const n of curOf(c)) {
    (curUsers[n] ??= []).push(c.name);
    (unitUsers[unitOf(n)] ??= new Set()).add(c.name);
  }
  for (const it of cur.items) (unitRegions[unitOf(it.name)] ??= new Set()).add(it.group);
  const units = Object.keys(unitRegions);
  const unitNote = u => `The ${u === 'ZiG' ? 'ZiG' : u} is used in ${some([...(unitUsers[u] || [])].sort())}.`;
  const ownUnits = c => new Set(curOf(c).map(unitOf));

  for (const q of cur.questions) {
    if (q.kind !== 'mc') continue;
    if (q.id.startsWith('cur-') && bySlug[q.id.slice(4)]) {
      const c = bySlug[q.id.slice(4)];
      const r = rng('distract:' + q.id);
      const u = unitOf(curOf(c)[0] || q.answer), own = ownUnits(c);
      const pool = units.filter(x => !own.has(x) && x !== u && !nameMatch(c.name, x));
      const near = sample(r, pool.filter(x => unitRegions[x].has(cont(c))), 3);
      const wrong = [...near, ...sample(r, pool.filter(x => !near.includes(x)), 3 - near.length)];
      q.answer = cap(u);
      q.wrong = wrong.map(cap);
      q.wrongNotes = Object.fromEntries(wrong.map(x => [cap(x), unitNote(x)]));
      if (nameMatch(c.name, u)) q.difficulty = 1;
    } else if (q.id.startsWith('curr-')) {
      const m = q.prompt.match(/^Which country uses the (.+)\?$/), c = byName[q.answer];
      if (!m || !c) continue;
      const u = unitOf(m[1]);
      if (nameMatch(c.name, m[1])) {
        if ((unitUsers[u]?.size || 0) === 1 && !nameMatch(c.name, u)) q.prompt = `Which country uses the ${u}?`;
        else q.difficulty = 1;
      }
      q.wrongNotes = Object.fromEntries(q.wrong.map(w => [w, byName[w] ? `${w} uses the ${listAnd(curOf(byName[w]))}.` : null]).filter(x => x[1]));
    }
  }
  write(cur);

  /* ---------------- languages ---------------- */
  const lang = read('languages');
  const langUsers = {};
  for (const c of countries) for (const l of langsOf(c)) (langUsers[l] ??= []).push(c.name);
  const langItem = Object.fromEntries(lang.items.map(l => [l.name, l]));
  const langNote = l => (langUsers[l] ? `${l} is a main language in ${some(langUsers[l])}.` : null);
  const known = l => langUsers[l]?.length;

  for (const q of lang.questions) {
    if (q.id.startsWith('lang-') && bySlug[q.id.slice(5)]) {
      const c = bySlug[q.id.slice(5)], L = langsOf(c);
      const r = rng('distract:' + q.id);
      const plain = L.filter(l => !nameMatch(c.name, l));
      const answer = plain.length ? plain[0] : L[0];
      const ok = l => !L.includes(l) && known(l) && !nameMatch(c.name, l) && !(AMBIG[c.iso3] || []).includes(l);
      const nb = [...new Set(nbOf(c).flatMap(langsOf))].filter(ok);
      const branch = langItem[answer]?.facts.branch;
      const kin = Object.keys(langUsers).filter(l => ok(l) && branch && langItem[l]?.facts.branch === branch);
      const region = [...new Set(countries.filter(x => cont(x) === cont(c)).flatMap(langsOf))].filter(ok);
      const wrong = [];
      for (const src of [nb, kin, region, Object.keys(langUsers).filter(ok)]) for (const l of sample(r, src, 3)) if (wrong.length < 3 && !wrong.includes(l)) wrong.push(l);
      q.answer = answer;
      q.wrong = wrong;
      q.wrongNotes = Object.fromEntries(wrong.map(l => [l, langNote(l)]));
      if (!plain.length) q.difficulty = 1;
    } else if (q.id.startsWith('langc-')) {
      const m = q.prompt.match(/^In which of these countries is (.+) a main language\?$/);
      const l = m?.[1], users = (langUsers[l] || []).map(n => byName[n]).filter(Boolean);
      if (!users.length) continue;
      const r = rng('distract:' + q.id);
      const plain = users.filter(u => !nameMatch(u.name, l));
      const ans = plain.find(u => u.name === q.answer) || plain[0] || users.find(u => u.name === q.answer) || users[0];
      const ok = x => !langsOf(x).includes(l) && !nameMatch(x.name, l) && !(AMBIG[x.iso3] || []).includes(l);
      const nb = nbOf(ans).filter(ok);
      const region = countries.filter(x => cont(x) === cont(ans) && ok(x));
      const wrong = [];
      for (const src of [nb, region, countries.filter(ok)]) for (const x of sample(r, src, 3)) if (wrong.length < 3 && !wrong.includes(x)) wrong.push(x);
      q.answer = ans.name;
      q.wrong = wrong.map(x => x.name);
      q.wrongNotes = Object.fromEntries(wrong.map(x => [x.name, `The main language${langsOf(x).length > 1 ? 's' : ''} of ${x.name}: ${listAnd(langsOf(x))}.`]));
      if (!plain.length) q.difficulty = 1;
    }
  }
  write(lang);
  console.log('c2_distract: currencies + languages rewritten');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) run();
