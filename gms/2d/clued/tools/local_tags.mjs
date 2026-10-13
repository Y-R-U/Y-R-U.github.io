#!/usr/bin/env node
// Country tags for every pack item and question → data/local/tags.json (a sidecar: packs are never edited, so the
// CONTENT/C1/C2 builders can rerun freely; rerun this after any pack change). Deterministic, offline.
//   node tools/local_tags.mjs            write the sidecar + print a summary
//   node tools/local_tags.mjs --sample N print N random tagged hand-written questions (precision spot check)
// Tag value: an ISO3 string, or an array of up to 3 when a question is about several countries.
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALIASES, DEMONYMS, NATIONALITY_EXTRA, LANG_ORIGIN, PLACES, AMBIG, CONTEXT, STOP_PHRASES, LANG_USE, LANG_BEFORE, ENGLISH_NOUN } from './local_names.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const J = p => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const COUNTRIES = J('data/geo/countries.json');
const CITIES = J('data/geo/cities.json').c;

/* ---------------------------------------------------------------- value → ISO3 */
const NAME = new Map();   // exact name / alias / demonym → iso
for (const [iso, c] of Object.entries(COUNTRIES)) if (c.k === 's' || c.k === 'p' || c.k === 't') NAME.set(c.n, iso);
for (const [iso, l] of Object.entries(ALIASES)) for (const n of l) NAME.set(n, iso);
for (const [iso, l] of Object.entries(DEMONYMS)) for (const n of l) NAME.set(n, iso);
for (const [n, iso] of Object.entries(NATIONALITY_EXTRA)) NAME.set(n, iso);
NAME.set('Korea', 'KOR');
NAME.set('the Galápagos Islands', 'ECU');
const CITY = new Map();   // structured fields only (sport hosts): a city name found in exactly one country
for (const [iso, list] of Object.entries(CITIES)) for (const c of list) CITY.set(c[0], CITY.has(c[0]) && CITY.get(c[0]) !== iso ? null : iso);
for (const [iso, l] of Object.entries(PLACES)) for (const n of l) if (!CITY.get(n)) CITY.set(n, iso);
for (const [n, iso] of Object.entries({ 'St. Moritz': 'CHE', 'Lake Placid': 'USA', 'St. Louis': 'USA', 'Squaw Valley': 'USA', 'Chamonix': 'FRA', 'Garmisch-Partenkirchen': 'DEU',
  "Cortina d'Ampezzo": 'ITA', 'Albertville': 'FRA', 'Lillehammer': 'NOR', 'Nagano': 'JPN', 'Sarajevo': 'BIH', 'Innsbruck': 'AUT', 'Grenoble': 'FRA', 'Sapporo': 'JPN',
    'Calgary': 'CAN', 'Salt Lake City': 'USA', 'Turin': 'ITA', 'Antwerp': 'BEL', 'Atlanta': 'USA', 'Vancouver': 'CAN', 'Sochi': 'RUS', 'Pyeongchang': 'KOR', 'PyeongChang': 'KOR' })) CITY.set(n, iso);

// "Austrian-American" → both; "South Korea and Japan" → both; unknown → []
export function valueIsos(v) {
  if (v == null) return [];
  const out = new Set();
  for (const raw of [].concat(v)) {
    const s = String(raw).trim();
    if (NAME.has(s)) { out.add(NAME.get(s)); continue; }
    for (const part of s.split(/\s+and\s+|-(?=[A-Z])|,\s*/)) if (NAME.has(part.trim())) out.add(NAME.get(part.trim()));
  }
  return [...out];
}

/* ---------------------------------------------------------------- text → ISO3 */
const ENTRIES = [];
const add = (text, iso, kind) => { if (text && text.length >= 2) ENTRIES.push({ text, iso, kind, re: new RegExp(`(?<![\\p{L}\\p{N}'’-])${esc(text)}(?![\\p{L}\\p{N}-])`, 'gu') }); };
function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
for (const [iso, c] of Object.entries(COUNTRIES)) if (c.k === 's' || c.k === 'p') add(c.n, iso, 'name');
for (const [iso, l] of Object.entries(ALIASES)) for (const n of l) if (n !== 'America') add(n, iso, 'name');
for (const [iso, l] of Object.entries(DEMONYMS)) for (const n of l) add(n, iso, 'demonym');
for (const [iso, l] of Object.entries(PLACES)) for (const n of l) add(n, iso, 'place');
ENTRIES.sort((a, b) => b.text.length - a.text.length);
const STOPS = STOP_PHRASES.slice().sort((a, b) => b.length - a.length).map(s => new RegExp(`(?<![\\p{L}])${esc(s)}(?![\\p{L}])`, 'gu'));
const blank = (s, i, n) => s.slice(0, i) + ' '.repeat(n) + s.slice(i + n);
// Words allowed directly before a capitalised name without making it look like a person ("South Africa", "the UK").
const OK_BEFORE = /^(The|In|Of|From|Which|What|Who|Where|When|Why|How|Is|Was|Did|Does|Do|Name|North|South|East|West|New|Northern|Southern|Ancient|Modern|Imperial|Medieval|Old|Greater|Upper|Lower|Central|Is|Are|And|Or|A|An|To|For|By|On|At|True|False|Mainland|Rural|Colonial|Nazi|Communist|Feudal|Edo|Victorian|Tudor|Roman|Viking)$/;
const SPECIAL = {
  Georgia: { need: /Tbilisi|Caucasus|country of Georgia|Georgian (wine|alphabet|Orthodox)|Stalin/, not: /\b(state|US|USA|U\.S\.|Atlanta|American|Savannah)\b/ },
  Jordan: { need: /Amman|Petra|Dead Sea|Hashemite|\b(country|kingdom|capital|flag|Middle East)\b/, not: /basketball|Bulls|NBA|Michael|River|Air Jordan/ },
  Turkey: { not: /\b(bird|birds|gobble|gobbles|Thanksgiving|roast|feathers?|wattle|Christmas dinner|poultry)\b/ },
  Chad: { need: /\b(country|countries|capital|flag|Africa|African|Lake Chad|N'Djamena|landlocked)\b/ },
  Victoria: { need: /\bnever\b/ },
  Paris: { not: /Helen|Troy|Trojan|Hilton|Achilles/ },
  Indian: { not: /\b(Ocean|American|tribe|chief|reservation)\b/ },
  Jersey: { need: /Channel Islands|St Helier|\bisland\b/ },
};

// Countries a hand-written text is about. Case-sensitive; ambiguous names need context; person-like uses skipped.
const LANG_Q = /\b(language|languages|word|words|means?|meaning|speak|spoken|say|says|translat\w*)\b/i;
export function textIsos(text, { contextText = text, langQ = LANG_Q.test(text) } = {}) {
  let s = String(text ?? '');
  for (const re of STOPS) s = s.replace(re, m => ' '.repeat(m.length));
  const out = new Set();
  if (/(?<![\p{L}])English(?=\s)/u.test(s)) for (const m of s.matchAll(/(?<![\p{L}])English(?=\s)/gu)) if (ENGLISH_NOUN.test(s.slice(m.index + 7))) out.add('GBR');
  for (const e of ENTRIES) {
    e.re.lastIndex = 0;
    let m;
    while ((m = e.re.exec(s))) {
      const i = m.index, n = m[0].length;
      const before = s.slice(0, i), after = s.slice(i + n);
      if (e.kind === 'demonym' && (langQ || LANG_USE.test(after) || LANG_BEFORE.test(before))) { s = blank(s, i, n); e.re.lastIndex = 0; continue; }
      const ambig = AMBIG.has(e.text) || SPECIAL[e.text];
      if (ambig) {
        const sp = SPECIAL[e.text];
        const prev = /([A-Z][\p{L}'’.-]*)\s+$/u.exec(before), next = /^\s+([A-Z][\p{L}'’-]+)/u.exec(after);
        const personish = (prev && !OK_BEFORE.test(prev[1]) && !/[.!?:;"“]\s*$/.test(before.slice(0, prev.index))) || (next && !/^(City|Island|Islands|Sea|River|Republic|Empire|War|Cup|Grand|Olympics?)$/.test(next[1]));
        const okCtx = sp ? (!sp.need || sp.need.test(contextText)) && (!sp.not || !sp.not.test(contextText)) : CONTEXT.test(contextText);
        if (personish || !okCtx || (sp && !CONTEXT.test(contextText) && !sp.need)) { s = blank(s, i, n); e.re.lastIndex = 0; continue; }
      }
      out.add(e.iso);
      s = blank(s, i, n);
      e.re.lastIndex = 0;
    }
  }
  return [...out];
}

/* ---------------------------------------------------------------- packs */
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main();
function main() {
const PACK_FILES = [
  ...readdirSync(join(ROOT, 'data/packs')).filter(f => f.endsWith('.json') && !f.startsWith('_')).map(f => `data/packs/${f}`),
  ...readdirSync(join(ROOT, 'data/music')).filter(f => f.endsWith('.json')).map(f => `data/music/${f}`),
];
const PACKS = PACK_FILES.map(J).filter(p => p && p.id);
const byId = Object.fromEntries(PACKS.map(p => [p.id, p]));

// People → countries, from every pack that records nationality / origin of a person or act.
const PERSON = new Map();
for (const id of ['people', 'actors', 'artists', 'explorers', 'leaders', 'music-artists']) {
  for (const it of byId[id]?.items || []) {
    const isos = valueIsos(it.facts?.nationality ?? it.facts?.origin);
    if (isos.length) PERSON.set(it.name, isos);
  }
}
// countries pack: currency / language → the one country using it
const ONLY = (key, split) => {
  const m = new Map();
  for (const it of byId.countries?.items || []) {
    const iso = NAME.get(it.name); if (!iso) continue;
    for (const v of split ? String(it.facts?.[key] || '').split(/,\s*/) : [it.facts?.[key]]) if (v) m.set(v, m.has(v) ? null : iso);
  }
  return m;
};
const CURRENCY = ONLY('currency'), LANGUAGE = ONLY('languages', true);

const ITEM_FACTS = ['country', 'nationality', 'nation', 'wcHost', 'winner', 'iso3'];
const REGION_FACTS = ['region', 'found'];
function itemIsos(pack, it) {
  const f = it.facts || {};
  const out = new Set();
  const addAll = l => l.forEach(x => out.add(x));
  if (['countries', 'flags'].includes(pack.id) && NAME.has(it.name)) out.add(NAME.get(it.name));
  if (pack.id === 'anthems' && f.iso3 && COUNTRIES[f.iso3]) out.add(f.iso3);
  for (const k of ITEM_FACTS) if (k !== 'iso3') addAll(valueIsos(f[k]));
  if (f.origin != null) addAll(pack.id === 'words' ? (LANG_ORIGIN[f.origin] ? [LANG_ORIGIN[f.origin]] : []) : valueIsos(f.origin));
  for (const k of REGION_FACTS) if (typeof f[k] === 'string' && NAME.has(f[k]) && COUNTRIES[NAME.get(f[k])]?.k !== undefined) out.add(NAME.get(f[k]));
  if (typeof f.host === 'string' && CITY.get(f.host)) out.add(CITY.get(f.host));
  if (pack.id === 'currencies' && f.countries === 1 && CURRENCY.get(it.name)) out.add(CURRENCY.get(it.name));
  if (pack.id === 'languages' && LANGUAGE.get(it.name)) out.add(LANGUAGE.get(it.name));
  for (const k of ['author', 'artist', 'composer']) if (typeof f[k] === 'string' && PERSON.has(f[k])) addAll(PERSON.get(f[k]));
  if ((pack.id === 'quotes') && PERSON.has(it.name)) addAll(PERSON.get(it.name));
  if (['history'].includes(pack.id) || (!out.size && pack.theme === 'history')) addAll(textIsos(it.name));
  return [...out].slice(0, 3);
}

const flat = s => String(s ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
function questionIsos(pack, q, itemTags) {
  const out = new Set();
  const items = pack.items || [];
  const list = Array.isArray(q.answer);
  if ((q.refs || []).length === 1 && !list) { const [pid, iid] = String(q.refs[0]).split('/'); const t = TAGS[pid]?.i?.[iid]; if (t) [].concat(t).forEach(x => out.add(x)); }
  const ans = typeof q.answer === 'string' ? q.answer : '';
  if (!out.size && items.length && !list) {
    const hit = items.find(it => flat(it.name) === flat(ans));
    if (hit && itemTags[hit.id]) [].concat(itemTags[hit.id]).forEach(x => out.add(x));
    else {
      const p = ` ${flat(q.prompt)} `;
      const inPrompt = items.filter(it => flat(it.name).length >= 6 && p.includes(` ${flat(it.name)} `));
      if (inPrompt.length === 1 && itemTags[inPrompt[0].id]) [].concat(itemTags[inPrompt[0].id]).forEach(x => out.add(x));
    }
  }
  if (!out.size && typeof q.answer === 'string' && PERSON.has(q.answer)) PERSON.get(q.answer).forEach(x => out.add(x));
  // an order question's answer is a list of unrelated events: only its prompt can make it local
  const text = Array.isArray(q.answer) ? q.prompt : `${q.prompt} ${ans}`;
  const found = textIsos(text, { langQ: LANG_Q.test(q.prompt) });
  if (out.size + found.length <= 3) found.forEach(x => out.add(x));
  return out.size && out.size <= 3 ? [...out] : null;
}

const TAGS = {};
for (const pack of PACKS) {
  const i = {};
  for (const it of pack.items || []) { const t = itemIsos(pack, it); if (t.length) i[it.id] = t.length === 1 ? t[0] : t; }
  TAGS[pack.id] = { i, q: {} };
}
for (const pack of PACKS) {
  for (const q of pack.questions || []) {
    const t = questionIsos(pack, q, TAGS[pack.id].i);
    if (t) TAGS[pack.id].q[q.id] = t.length === 1 ? t[0] : t;
  }
}

const cont = {};
for (const [iso, c] of Object.entries(COUNTRIES)) if (c.c) cont[iso] = c.c;
const packsOut = {};
for (const [id, t] of Object.entries(TAGS)) if (Object.keys(t.i).length || Object.keys(t.q).length) packsOut[id] = t;
const out = { v: 1, note: 'Built by tools/local_tags.mjs. Do not hand-edit; rerun after pack changes.', cont, packs: packsOut };
mkdirSync(join(ROOT, 'data/local'), { recursive: true });
const argv = process.argv.slice(2);
if (!argv.includes('--dry')) writeFileSync(join(ROOT, 'data/local/tags.json'), JSON.stringify(out));

const HAND = ['general', 'history', 'sport', 'kids', 'kids-nature'];
if (argv.includes('--sample')) {
  const n = +argv[argv.indexOf('--sample') + 1] || 40;
  let seed = +(argv[argv.indexOf('--seed') + 1]) || 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const rows = [];
  for (const id of HAND) for (const q of byId[id]?.questions || []) if (TAGS[id].q[q.id]) rows.push([id, q, TAGS[id].q[q.id]]);
  for (let k = 0; k < n && rows.length; k++) {
    const [id, q, t] = rows.splice(Math.floor(rnd() * rows.length), 1)[0];
    console.log(`${[].concat(t).join('+').padEnd(11)} ${id.padEnd(8)} ${q.prompt} → ${Array.isArray(q.answer) ? q.answer.join(', ') : q.answer}`);
  }
} else {
  let ni = 0, nq = 0, ti = 0, tq = 0;
  for (const p of PACKS) { ni += (p.items || []).length; nq += (p.questions || []).length; ti += Object.keys(TAGS[p.id].i).length; tq += Object.keys(TAGS[p.id].q).length; }
  console.log(`items ${ti}/${ni} tagged, questions ${tq}/${nq} tagged, ${Object.keys(packsOut).length} packs → data/local/tags.json`);
  const by = {};
  for (const t of Object.values(TAGS)) for (const v of [...Object.values(t.i), ...Object.values(t.q)]) for (const c of [].concat(v)) by[c] = (by[c] || 0) + 1;
  console.log(Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([c, n]) => `${c} ${n}`).join(' · '));
}
}
