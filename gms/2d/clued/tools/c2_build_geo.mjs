// Builds countries, flags, capitals, currencies, languages and landmarks packs.
// Hand table (c2_src/countries.mjs) + World Bank population/area + Wikidata cross-checks and flag images.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { commonsSearchImage, ROOT, sparql, fetchJSON, wdEntities, wpQids, claims, label, commonsImages, writePack, slug, leaks, rng, sample, wdYear } from './c2_lib.mjs';
import { COUNTRIES, CAPITAL_NOTES, TRANSCONTINENTAL, LEFT_DRIVING, CURRENCIES } from './c2_src/countries.mjs';
import { LANDMARKS } from './c2_src/landmarks.mjs';
import { LANGUAGES } from './c2_src/languages.mjs';

const CONT = { AF: 'Africa', AS: 'Asia', EU: 'Europe', NA: 'North America', SA: 'South America', OC: 'Oceania' };
const LANDLOCKED = 'AFG AND ARM AUT AZE BLR BTN BOL BWA BFA BDI CAF TCD CZE SWZ ETH HUN KAZ KGZ LAO LSO LIE LUX MWI MLI MDA MNG NPL NER MKD PRY RWA SMR SRB SVK SSD CHE TJK TKM UGA UZB VAT ZMB ZWE'.split(' ');
const FAMOUS = 'USA GBR FRA DEU ITA ESP CAN MEX BRA ARG AUS NZL JPN CHN IND RUS EGY ZAF KEN NGA GRC IRL NLD PRT SWE NOR CHE TUR THA JAM ISL PER CHL KOR BEL DNK FIN POL AUT CUB'.split(' ');
const GEO_EXEMPT = ['people', 'peoples', 'republic', 'state', 'states', 'united', 'islands', 'island', 'kingdom', 'democratic', 'federal', 'federated', 'saint', 'new', 'north', 'south', 'east', 'west', 'central', 'great'];
const NO_ARTICLE = ['Big Ben', 'Stonehenge', 'Machu Picchu', 'Christ the Redeemer', 'Petra', 'Angkor Wat', "Saint Basil's Cathedral", 'Neuschwanstein Castle', 'Chichen Itza', 'Uluru', 'Table Mountain', 'Notre-Dame de Paris', 'Mont-Saint-Michel', "St. Peter's Basilica", 'Marina Bay Sands', 'Borobudur', 'Ha Long Bay', 'Abu Simbel', 'Teotihuacan', 'Tikal', 'Salar de Uyuni', 'Sugarloaf Mountain', 'Edinburgh Castle', 'Buckingham Palace', 'Hallgrímskirkja', 'Bran Castle', 'Kinderdijk', 'Cologne Cathedral', 'Meteora', 'Pamukkale', 'Milford Sound', 'Fushimi Inari-taisha', 'Kinkaku-ji', 'Gyeongbokgung', 'Wat Arun', 'Bagan', 'Persepolis', 'Sigiriya', 'Carthage', 'Leptis Magna', 'Tower Bridge', 'Burj Khalifa', 'Hagia Sophia', 'Tokyo Skytree'];
const theLm = n => /^The /.test(n) ? 'the' + n.slice(3) : /^Mount /.test(n) || NO_ARTICLE.includes(n) ? n : 'the ' + n;
// Transcontinental countries: the second continent is also accepted (never offered as a 'wrong' answer).
const SECOND_CONT = { RUS: 'Asia', TUR: 'Europe', KAZ: 'Europe', AZE: 'Europe', GEO: 'Europe', ARM: 'Europe', CYP: 'Europe', EGY: 'Asia', IDN: 'Oceania', PAN: 'South America', TTO: 'South America', PNG: 'Asia', TLS: 'Oceania' };
const report = [];
const note = s => { report.push(s); };

const rows = COUNTRIES.trim().split('\n').map(line => {
  const [codes, name, cont, capital, cur, langs, alt] = line.split('|');
  const [iso3, iso2] = codes.split(' ');
  return { iso3, iso2, name, cont, capital, currencies: cur.split(';'), languages: langs.split(';'), alt: alt ? alt.split(';') : [] };
});
const byIso = Object.fromEntries(rows.map(r => [r.iso3, r]));

// ---- Wikidata ----
const qmap = { PSE: 'Q219060', NLD: 'Q55' };
const qr = await sparql(`SELECT ?c ?iso3 WHERE { VALUES ?iso3 { ${rows.map(r => `"${r.iso3}"`).join(' ')} } ?c wdt:P298 ?iso3 }`);
for (const x of qr) qmap[x.iso3] ??= x.c.split('/').pop();
const ents = await wdEntities(Object.values(qmap));
const current = (ent, prop) => {
  const cs = (ent?.claims?.[prop] || []).filter(c => c.rank !== 'deprecated' && c.mainsnak.snaktype === 'value' && !c.qualifiers?.P582);
  const pref = cs.filter(c => c.rank === 'preferred');
  return (pref.length ? pref : cs).map(c => c.mainsnak.datavalue.value);
};
const refIds = new Set();
for (const r of rows) {
  const e = ents[qmap[r.iso3]];
  for (const p of ['P36', 'P38', 'P37', 'P1622', 'P30']) for (const v of current(e, p)) refIds.add(v.id);
}
const refs = await wdEntities([...refIds]);
const lab = id => label(refs[id]) || id;

// ---- World Bank ----
async function wb(ind) {
  const j = await fetchJSON(`https://api.worldbank.org/v2/country/all/indicator/${ind}?format=json&per_page=20000&mrnev=1`);
  return Object.fromEntries(j[1].filter(x => x.value != null).map(x => [x.countryiso3code, { v: x.value, year: +x.date }]));
}
const wbPop = await wb('SP.POP.TOTL');
// World Bank surface area now includes territorial waters, so area comes from Wikipedia's list (total area).
const wpAreaText = (await fetchJSON('https://en.wikipedia.org/w/api.php?action=parse&page=List_of_countries_and_dependencies_by_area&prop=wikitext&format=json&formatversion=2')).parse.wikitext;
const wpArea = {};
for (const m of wpAreaText.matchAll(/\{\{flag[a-z]*\|([^}|]+)[^}]*\}\}[^\n|]*\|\|\s*\{\{km2 mi2\|([\d.,]+)/g)) {
  const n = { 'Czech Republic': 'Czechia', 'The Gambia': 'Gambia' }[m[1]] || m[1];
  wpArea[n] ??= +m[2].replace(/,/g, '');
}

function wdLatestPop(e) {
  let best = null;
  for (const c of e?.claims?.P1082 || []) {
    if (c.rank === 'deprecated' || c.mainsnak.snaktype !== 'value') continue;
    const y = wdYear(c.qualifiers?.P585?.[0]?.datavalue?.value) || 0;
    if (!best || y > best.y) best = { y, v: +c.mainsnak.datavalue.value.amount };
  }
  return best;
}

const flagFiles = {};
for (const r of rows) {
  const e = ents[qmap[r.iso3]];
  if (!e) { note(`NO WIKIDATA ENTITY ${r.iso3}`); continue; }
  r.qid = qmap[r.iso3];
  const wdCaps = current(e, 'P36').map(v => lab(v.id));
  if (!wdCaps.some(c => c.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes(r.capital.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/^st\. /, 'saint ').split(',')[0])))
    note(`capital ${r.iso3} mine=${r.capital} wd=${wdCaps.join(' / ')}`);
  const wdCont = current(e, 'P30').map(v => lab(v.id));
  if (!wdCont.some(c => c.includes(CONT[r.cont]) || (r.cont === 'OC' && /Australia|Oceania/.test(c)) || (r.cont === 'NA' && /North America/.test(c))))
    note(`continent ${r.iso3} mine=${CONT[r.cont]} wd=${wdCont.join(' / ')}`);
  const wdCurCodes = current(e, 'P38').map(v => refs[v.id]?.claims?.P498?.[0]?.mainsnak?.datavalue?.value).filter(Boolean);
  for (const c of r.currencies) if (!wdCurCodes.includes(c)) note(`currency ${r.iso3} mine=${c} wd=${wdCurCodes.join(',')}`);
  const wdLangs = current(e, 'P37').map(v => lab(v.id).toLowerCase());
  for (const l of r.languages) if (!wdLangs.some(w => w.includes(l.toLowerCase().split(' ')[0]) || l.toLowerCase().includes(w.split(' ')[0]))) note(`language ${r.iso3} mine=${l} wd=${wdLangs.join(',')}`);
  const drive = current(e, 'P1622').map(v => lab(v.id)).join(',');
  r.drivingSide = LEFT_DRIVING.includes(r.iso3) ? 'left' : 'right';
  if (!drive.includes(r.drivingSide)) note(`driving ${r.iso3} mine=${r.drivingSide} wd=${drive}`);
  const cc = current(e, 'P474')[0];
  r.callingCode = cc ? cc.replace(/[\s-]/g, '').replace(/^(\+?)/, '+').replace(/^\+\+/, '+') : null;
  if (!r.callingCode) note(`calling code missing ${r.iso3}`);
  const flag = current(e, 'P41')[0];
  if (flag) flagFiles[r.iso3] = flag; else note(`flag missing ${r.iso3}`);
  const wp = wdLatestPop(e);
  const b = wbPop[r.iso3];
  r.population = b ? Math.round(b.v) : wp?.v;
  r.popYear = b ? b.year : wp?.y;
  r.popSource = b ? 'World Bank' : 'Wikidata';
  if (b && wp && Math.abs(wp.v - b.v) / b.v > 0.15) note(`population ${r.iso3} wb=${b.v} (${b.year}) wd=${wp.v} (${wp.y})`);
  const wdArea = claims(e, 'P2046').map(v => +v.amount)[0];
  const a = wpArea[r.name];
  r.areaKm2 = a || wdArea;
  if (!a) note(`area ${r.iso3} not in Wikipedia list, using Wikidata ${wdArea}`);
  else if (wdArea && Math.abs(wdArea - a) / a > 0.1) note(`area ${r.iso3} wp=${a} wd=${wdArea}`);
  if (!r.population || !r.areaKm2) note(`MISSING pop/area ${r.iso3}`);
  r.landlocked = LANDLOCKED.includes(r.iso3);
  const isLL = (e.claims.P31 || []).some(c => c.mainsnak.datavalue?.value?.id === 'Q123480');
  if (isLL !== r.landlocked) note(`landlocked ${r.iso3} mine=${r.landlocked} wd=${isLL}`);
}
// Oman's main Commons file carries an Omani government licence C1 does not accept; this redraw is public domain.
const FLAG_OVERRIDE = { OMN: 'Flag of Oman (2-1).svg' };
Object.assign(flagFiles, FLAG_OVERRIDE);
// Contested national flags: shown on learn cards with both versions, never used in flag-identification questions.
const DISPUTED_FLAGS = {
  AFG: { files: ['Flag of the Taliban.svg', 'Flag of the Islamic Republic of Afghanistan.svg'], note: 'Afghanistan has two flags in use: the white Taliban flag of the de facto government since 2021, and the black, red and green tricolour of the former Islamic Republic, which the UN and many embassies abroad still used as of 2025.' },
};
const flags = await commonsImages([...Object.values(flagFiles), ...Object.values(DISPUTED_FLAGS).flatMap(d => d.files)], { maxDim: 330 });

// ---- Landmarks ----
const lmRows = LANDMARKS.trim().split('\n').map(l => {
  const [title, name, iso3, kind, year, alt, clues] = l.split('|');
  return { title, name, iso3, kind, year: year ? +year : null, alt: alt ? alt.split(';') : [], clues: clues.split(';').filter(Boolean) };
});
const lmQ = await wpQids(lmRows.map(r => r.title));
const lmEnts = await wdEntities(Object.values(lmQ));
const lmImgFiles = {};
for (const r of lmRows) {
  const e = lmEnts[lmQ[r.title]];
  if (!e) { note(`landmark not found ${r.title}`); continue; }
  r.qid = lmQ[r.title];
  const co = claims(e, 'P625')[0];
  const GEO = { Moai: { lat: -27.1213, lon: -109.2894 } }; // Rano Raraku quarry, Easter Island
  if (!co && GEO[r.title]) r.geo = GEO[r.title]; else if (co) r.geo = { lat: +co.latitude.toFixed(4), lon: +co.longitude.toFixed(4) }; else note(`landmark no coords ${r.title}`);
  const img = claims(e, 'P18')[0];
  if (img) lmImgFiles[r.title] = img; else note(`landmark no image ${r.title}`);
  const ctry = claims(e, 'P17').map(v => v.id);
  const wantQ = qmap[r.iso3];
  if (!ctry.includes(wantQ) && !(r.iso3 === 'NLD' && ctry.includes('Q29999')) && !(r.iso3 === 'DNK' && ctry.includes('Q756617'))) note(`landmark country ${r.title} mine=${r.iso3} wd=${ctry.join(',')}`);
  if (r.year) {
    const ys = ['P571', 'P1619', 'P580', 'P729'].flatMap(p => claims(e, p).map(wdYear)).filter(Boolean);
    if (!ys.some(y => Math.abs(y - r.year) <= 1)) { note(`landmark year ${r.title} mine=${r.year} wd=${ys.join(',')} -> dropped`); r.year = null; }
  }
}
const LM_FILE = {};
// lead photos that don't show the landmark (sunset silhouettes); no free replacement found yet, so no picture
const LM_NO_IMG = ['Sheikh Zayed Grand Mosque', 'Hassan II Mosque'];
for (const r of lmRows) if (LM_FILE[r.name]) lmImgFiles[r.title] = LM_FILE[r.name];
const lmImgs = await commonsImages(Object.values(lmImgFiles), { maxDim: 640 });
const LM_SEARCH = { 'Gateway of India': ['Gateway of India Port Mumbai', 'port mumbai'], 'Charles Bridge': ['Charles Bridge Prague', 'bridge'], Gyeongbokgung: ['Gyeongbokgung Geunjeongjeon', 'gyeongbok'], 'Lotus Temple': ['Lotus Temple Delhi', 'lotus'], 'Blue Mosque': ['Sultan Ahmed Mosque Istanbul', 'mosque'] };
for (const r of lmRows) {
  const m = lmImgs[lmImgFiles[r.title]?.replace(/_/g, ' ')];
  if ((!m || m.rejected) && LM_SEARCH[r.name]) {
    const f = await commonsSearchImage(...LM_SEARCH[r.name]);
    if (f) { lmImgFiles[r.title] = f.file; lmImgs[f.file] = f; note(`landmark fallback image ${r.name}: ${f.file}`); }
  }
}

// ---- formatting helpers ----
const fmtPop = n => n >= 1e9 ? `${(n / 1e9).toFixed(2).replace(/0$/, '')} billion` : n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e8 ? 0 : 1).replace(/\.0$/, '')} million` : n >= 1e4 ? `${Math.round(n / 1000).toLocaleString('en-US')},000` : `${Math.round(n / 10) * 10}`;
const sig = (n, d = 3) => { if (n < 1) return +n.toPrecision(2); const p = Math.pow(10, Math.max(0, Math.floor(Math.log10(n)) - d + 1)); return Math.round(n / p) * p; };
const theName = n => /^(United|Netherlands|Philippines|Bahamas|Gambia|Republic|Central African|Dominican|Marshall|Solomon|Maldives|Seychelles|Comoros|Democratic)/.test(n) ? 'the ' + n : n;
const TheName = n => { const t = theName(n); return t.charAt(0).toUpperCase() + t.slice(1); };
const listAnd = a => a.length <= 1 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
const curName = c => CURRENCIES[c]?.[0] || c;
const theCur = c => (/^(Euro|Pound sterling|Renminbi)/.test(curName(c)) ? 'the ' : 'the ') + curName(c);
const img = (m, page) => m && !m.rejected ? [{ ...m }] : [];

const usable = rows.filter(r => r.population && r.areaKm2);
const firstLm = {};
for (const l of lmRows) firstLm[l.iso3] ??= l.name;

// ---- countries pack ----
const countryItems = usable.map(r => {
  const names = [r.name, ...r.alt];
  const cont = CONT[r.cont];
  const flagImg = flags[flagFiles[r.iso3]?.replace(/_/g, ' ')];
  if (flagImg?.rejected) note(`flag licence rejected ${r.iso3}: ${flagImg.rejected}`);
  const capN = CAPITAL_NOTES[r.iso3];
  const raw = [
    r.callingCode && `Its international calling code is ${r.callingCode}.`,
    `It covers about ${sig(r.areaKm2).toLocaleString('en-US')} km².`,
    `Traffic drives on the ${r.drivingSide}.`,
    r.landlocked ? 'It has no coastline.' : null,
    `About ${fmtPop(r.population)} people lived there in ${r.popYear}.`,
    `Its currency is ${listAnd(r.currencies.map(theCur))}.`,
    firstLm[r.iso3] && `It is home to ${theLm(firstLm[r.iso3])}.`,
    `Main language${r.languages.length > 1 ? 's' : ''}: ${listAnd(r.languages)}.`,
    TRANSCONTINENTAL.includes(r.iso3) ? `It is usually counted as part of ${cont}, though it spans two continents.` : `It is in ${cont}.`,
    !capN?.skip && `Its capital is ${r.capital}.`,
  ].filter(Boolean);
  const clues = raw.filter(c => !leaks(c, names));
  const difficulty = FAMOUS.includes(r.iso3) ? 1 : (r.population < 3e6 ? 3 : 2);
  return {
    id: slug(r.name), name: r.name, lname: theName(r.name), alt: r.alt, iso2: r.iso2, iso3: r.iso3, group: cont,
    facts: {
      population: r.population, areaKm2: Math.round(r.areaKm2 * 100) / 100, continent: SECOND_CONT[r.iso3] ? [cont, SECOND_CONT[r.iso3]] : cont, capital: r.capital,
      currency: r.currencies.map(curName).join(' and '), languages: r.languages.join(', '), drivingSide: r.drivingSide,
      callingCode: r.callingCode || undefined, landlocked: r.landlocked, landmark: firstLm[r.iso3],
    },
    capitalNote: capN?.note, transcontinental: TRANSCONTINENTAL.includes(r.iso3) || undefined,
    blurb: `${r.name} is in ${cont}${capN?.skip ? '' : `, with ${r.capital} as its capital`}. About ${fmtPop(r.population)} people lived there in ${r.popYear}.`,
    clues,
    media: { img: DISPUTED_FLAGS[r.iso3] ? [] : img(flagImg) },
    ...(DISPUTED_FLAGS[r.iso3] ? { flagDisputed: true, flagNote: DISPUTED_FLAGS[r.iso3].note, flagImages: DISPUTED_FLAGS[r.iso3].files.map(f => flags[f]).filter(m => m && !m.rejected) } : {}),
    difficulty,
  };
});
for (const it of countryItems) if (it.clues.length < 5) note(`few clues ${it.id}: ${it.clues.length}`);

const geoSources = [
  { name: 'World Bank Open Data (SP.POP.TOTL)', url: 'https://data.worldbank.org' },
  { name: 'Wikipedia: List of countries and dependencies by area', url: 'https://en.wikipedia.org/wiki/List_of_countries_and_dependencies_by_area' },
  { name: 'Wikidata', url: 'https://www.wikidata.org' },
  { name: 'Wikimedia Commons', url: 'https://commons.wikimedia.org' },
  { name: 'UN M49 regions', url: 'https://unstats.un.org/unsd/methodology/m49/' },
];
const countryFactsMeta = {
  population: { type: 'num', label: 'Population', unit: 'people', higherLabel: 'More people', source: 'World Bank, latest year', askHigh: 'Which of these countries has the most people?', askLow: 'Which of these countries has the fewest people?' },
  areaKm2: { type: 'num', label: 'Area', unit: 'km²', higherLabel: 'Bigger', askHigh: 'Which of these countries is the biggest by area?', askLow: 'Which of these countries is the smallest by area?' },
  continent: { type: 'cat', label: 'Continent', ask: 'Which continent is {lname} in?', stmt: '{lname} is in {value}.' },
  drivingSide: { type: 'cat', label: 'Drives on', ask: 'On which side of the road do people drive in {lname}?', stmt: 'In {lname}, people drive on the {value}.' },
  landlocked: { type: 'bool', label: 'Landlocked', yes: 'Landlocked', no: 'Has a coast', askBool: 'Which of these countries has no coastline?', stmt: '{lname} has no coastline.' },
  capital: { type: 'text', label: 'Capital' },
  currency: { type: 'text', label: 'Currency' },
  languages: { type: 'text', label: 'Main languages' },
  callingCode: { type: 'text', label: 'Calling code' },
  landmark: { type: 'text', label: 'Landmark' },
};
const fakeCountries = ['Valdoria', 'Kesmeria', 'Ostravia', 'Marovia', 'Tarsonia', 'Eldoran', 'Pelagonia Republic', 'Norvania', 'Sumatoria', 'Belcastria', 'Quillandia', 'Drevonia', 'Corvalis', 'Zentharia', 'Lumbria'];
writePack({
  id: 'countries', title: 'Countries', theme: 'geography', icon: '🌍', kids: false, version: 1,
  notice: 'Covers the 193 UN member states plus the two observer states. Populations are World Bank estimates.',
  leakExempt: GEO_EXEMPT, imgPrompt: 'Which is the flag of {lname}?', nameImgPrompt: 'Which country has this flag?', tfImgPrompt: 'This is the flag of {lname}.',
  factsMeta: countryFactsMeta, items: countryItems, questions: countryQuestions(), fakes: fakeCountries, sources: geoSources,
});

function countryQuestions() {
  const r = rng('countries');
  const qs = [];
  const byCont = c => countryItems.filter(i => i.group === c);
  for (const it of countryItems) {
    if (it.transcontinental) continue;
    if (it.difficulty < 3 || r() < 0.4) {
      const wrong = sample(r, Object.values(CONT).filter(c => c !== it.group), 3);
      qs.push({ id: `cont-${it.id}`, kind: 'mc', prompt: `Which continent is ${it.lname} in?`, answer: it.group, wrong, explain: `${TheName(it.name)} is in ${it.group}.`, difficulty: it.difficulty, refs: [`countries/${it.id}`] });
    }
  }
  // biggest/smallest by population and area within a continent, from four
  for (const key of ['population', 'areaKm2']) {
    for (const c of Object.values(CONT)) {
      for (let k = 0; k < 4; k++) {
        const pool = byCont(c).filter(i => i.difficulty <= 2);
        const four = sample(r, pool, 4);
        if (four.length < 4) continue;
        four.sort((a, b) => b.facts[key] - a.facts[key]);
        if (four[0].facts[key] < four[1].facts[key] * 1.15) continue; // too close to call
        const what = key === 'population' ? 'the most people' : 'the largest area';
        qs.push({ id: `top-${key}-${slug(c)}-${k}`, kind: 'mc', prompt: `Which of these countries has ${what}?`, answer: four[0].name, wrong: four.slice(1).map(i => i.name),
          explain: key === 'population' ? `${four[0].name}: about ${fmtPop(four[0].facts.population)} people.` : `${four[0].name}: about ${sig(four[0].facts.areaKm2).toLocaleString('en-US')} km².`, difficulty: 2 });
      }
    }
  }
  const ll = countryItems.filter(i => i.facts.landlocked && i.difficulty <= 2);
  for (const it of sample(r, ll, 12)) {
    const wrong = sample(r, countryItems.filter(i => !i.facts.landlocked && i.group === it.group && i.difficulty <= 2), 3).map(i => i.name);
    if (wrong.length === 3) qs.push({ id: `ll-${it.id}`, kind: 'mc', prompt: 'Which of these countries has no coastline?', answer: it.name, wrong, explain: `${TheName(it.name)} is landlocked.`, difficulty: 2 });
  }
  const left = countryItems.filter(i => i.facts.drivingSide === 'left');
  for (const it of sample(r, left.filter(i => i.difficulty <= 2), 10)) {
    const wrong = sample(r, countryItems.filter(i => i.facts.drivingSide === 'right' && i.difficulty <= 2), 3).map(i => i.name);
    qs.push({ id: `drive-${it.id}`, kind: 'mc', prompt: 'In which of these countries do people drive on the left?', answer: it.name, wrong, explain: `${TheName(it.name)} drives on the left.`, difficulty: 2 });
  }
  return qs;
}

// ---- flags pack ----
writePack({
  id: 'flags', title: 'Flags', theme: 'geography', icon: '🏳️', version: 1,
  kids: true, notice: 'Afghanistan’s flag is contested (two flags in use), so it appears on its learn card but not in flag questions.',
  factsMeta: { continent: { type: 'cat', label: 'Continent', ask: 'Which continent is {lname} in?', stmt: '{lname} is in {value}.' }, flagDisputed: { type: 'bool', label: 'Flag contested', yes: 'Two flags in use', no: 'One national flag' } },
  imgPrompt: 'Which is the flag of {lname}?', nameImgPrompt: 'Which country has this flag?', tfImgPrompt: 'This is the flag of {lname}.',
  items: countryItems.filter(i => i.media.img.length || i.flagDisputed).map(i => ({ id: i.id, name: i.name, lname: i.lname, alt: i.alt, iso2: i.iso2, iso3: i.iso3, group: i.group,
    facts: { continent: i.facts.continent, ...(i.flagDisputed ? { flagDisputed: true } : {}) },
    blurb: i.flagDisputed ? i.flagNote : `The national flag of ${i.lname}.`, media: i.media,
    ...(i.flagDisputed ? { flagImages: i.flagImages } : {}), difficulty: i.difficulty })),
  questions: flagQuestions(),
  sources: [{ name: 'Wikimedia Commons national flags', url: 'https://commons.wikimedia.org/wiki/Category:SVG_flags_by_country' }],
});
function flagQuestions() {
  const T = (id, prompt, answer, explain, d = 2) => ({ id, kind: 'tf', prompt, answer, explain, difficulty: d });
  const M = (id, prompt, answer, wrong, explain, d = 2) => ({ id, kind: 'mc', prompt, answer, wrong, explain, difficulty: d });
  return [
    M('f-nepal', 'Which country has a national flag that is not a rectangle?', 'Nepal', ['Bhutan', 'Switzerland', 'Qatar'], "Nepal's flag is two stacked pennants.", 2),
    M('f-square', 'Which two countries have square national flags?', 'Switzerland and Vatican City', ['Denmark and Norway', 'Japan and South Korea', 'Austria and Monaco'], 'Switzerland and Vatican City both use square flags.', 2),
    M('f-dannebrog', 'Which country has the oldest national flag still in continuous use, according to tradition?', 'Denmark', ['Scotland', 'Austria', 'Netherlands'], 'The Danish Dannebrog is traditionally dated to 1219.', 3),
    M('f-maple', 'Which country has a red maple leaf on its flag?', 'Canada', ['Lebanon', 'Japan', 'Switzerland'], 'The maple leaf flag was adopted in 1965.', 1),
    M('f-cedar', 'Which country has a green cedar tree on its flag?', 'Lebanon', ['Canada', 'Cyprus', 'Israel'], 'The Lebanon cedar is the national emblem.', 2),
    M('f-ak47', 'Which country has an AK-47 rifle on its flag?', 'Mozambique', ['Angola', 'Zimbabwe', 'Eritrea'], "Mozambique's flag shows a rifle, a hoe and a book.", 3),
    M('f-cyprus', 'Which country shows a map of itself on its flag?', 'Cyprus', ['Malta', 'Iceland', 'Sri Lanka'], 'The flag of Cyprus shows the island in copper-orange.', 2),
    M('f-stars-us', 'How many stars are on the flag of the United States?', '50', ['48', '52', '13'], 'One star for each state; the 13 stripes are the original colonies.', 1),
    M('f-stripes-us', 'How many stripes are on the flag of the United States?', '13', ['50', '7', '12'], 'The 13 stripes stand for the original colonies.', 2),
    M('f-wheel', 'Which country has a 24-spoke wheel in the centre of its flag?', 'India', ['Sri Lanka', 'Bangladesh', 'Nepal'], 'The Ashoka Chakra sits on the white band.', 2),
    M('f-dragon-bt', 'Which country has a white dragon on its flag?', 'Bhutan', ['Wales', 'China', 'Malta'], "The Druk, or thunder dragon, appears on Bhutan's flag.", 2),
    M('f-sun-jp', 'Which country’s flag is a red disc on a white background?', 'Japan', ['Bangladesh', 'Palau', 'South Korea'], 'The Hinomaru represents the sun.', 1),
    M('f-bd', 'Which country’s flag is a red disc on a green background?', 'Bangladesh', ['Japan', 'Palau', 'Pakistan'], 'The disc is slightly off-centre towards the hoist.', 2),
    M('f-union', 'The Union Jack appears in the corner of the flag of which of these countries?', 'Australia', ['Canada', 'Ireland', 'South Africa'], 'Australia, New Zealand, Fiji and Tuvalu all carry it.', 1),
    M('f-tricolour-ie', 'Which country’s flag is a green, white and orange vertical tricolour?', 'Ireland', ['Italy', 'Ivory Coast', 'India'], 'Ivory Coast uses the same colours in the opposite order.', 2),
    M('f-ci', 'Which country’s flag is an orange, white and green vertical tricolour?', 'Ivory Coast', ['Ireland', 'Niger', 'India'], 'It is the mirror image of the Irish flag.', 3),
    M('f-saltire', 'Which country’s flag is a white diagonal cross on a blue field?', 'Scotland', ['Finland', 'Greece', 'Jamaica'], "The Saltire is St Andrew's cross.", 2),
    M('f-jm', 'Which country’s flag has a gold diagonal cross with green and black triangles?', 'Jamaica', ['Ghana', 'Brazil', 'Grenada'], "Jamaica's flag was adopted in 1962.", 2),
    M('f-br', 'Which country’s flag shows a blue globe of stars on a yellow diamond?', 'Brazil', ['Argentina', 'Colombia', 'Rwanda'], 'The night sky over Rio on 15 November 1889 is shown.', 1),
    M('f-ko', 'Which country’s flag has a red and blue yin-yang symbol and four black trigrams?', 'South Korea', ['North Korea', 'Mongolia', 'Japan'], 'The flag is called the Taegukgi.', 2),
    M('f-ca-leaf', 'What is the central symbol on the flag of Argentina?', 'A sun with a face', ['A star', 'An eagle', 'A condor'], 'The Sun of May.', 2),
    M('f-mx', 'What does the eagle on the flag of Mexico hold in its beak?', 'A snake', ['A fish', 'An olive branch', 'Arrows'], 'It stands on a cactus, from the Aztec founding legend.', 2),
    M('f-kh', 'Which country’s flag shows a temple?', 'Cambodia', ['Thailand', 'Myanmar', 'Laos'], 'Angkor Wat appears on the flag.', 2),
    M('f-ki', 'Which country’s flag shows a frigatebird flying over a rising sun?', 'Kiribati', ['Papua New Guinea', 'Fiji', 'Dominica'], 'The waves below stand for the Pacific Ocean.', 3),
    M('f-dm', 'Which country’s flag shows a parrot?', 'Dominica', ['Kiribati', 'Grenada', 'Saint Lucia'], 'The sisserou parrot is the national bird.', 3),
    T('f-tf-ch', 'The flags of Switzerland and Denmark both show a white cross on red.', true, 'Switzerland has a square flag with a centred cross; Denmark has a rectangle with an off-centre cross.', 2),
    T('f-tf-libya', 'The flag of Libya has been a plain green field since 2011.', false, 'The plain green flag was used from 1977 to 2011; Libya now uses a red, black and green flag with a crescent and star.', 3),
    T('f-tf-nordic', 'The flag of Finland has a blue cross on a white background.', true, 'It is a Nordic cross flag.', 2),
    T('f-tf-ru', 'The flag of Russia has horizontal stripes of white, blue and red.', true, 'White on top, blue in the middle, red at the bottom.', 2),
    T('f-tf-de', 'The flag of Germany has red at the top.', false, 'From top: black, red, gold.', 1),
    T('f-tf-it', 'The flag of Italy is a green, white and red vertical tricolour.', true, 'Green at the hoist, then white, then red.', 1),
    T('f-tf-gr', 'The flag of Greece has nine blue and white stripes.', true, 'They are often said to stand for the syllables of the motto "Freedom or Death".', 3),
  ];
}

// ---- capitals pack ----
const capRows = usable.filter(r => !CAPITAL_NOTES[r.iso3]?.skip);
const capItems = capRows.map(r => {
  const it = countryItems.find(i => i.iso3 === r.iso3);
  const cn = CAPITAL_NOTES[r.iso3];
  return {
    id: slug(r.capital) + (r.capital === r.name ? '-city' : ''), name: r.capital, alt: [...(cn?.alt || [])].filter(a => a !== r.capital),
    iso3: r.iso3, group: CONT[r.cont], facts: { country: r.name, continent: CONT[r.cont] },
    blurb: `${r.capital} is the capital of ${theName(r.name)}.${cn ? ' ' + cn.note : ''}`, difficulty: it.difficulty,
  };
});
// Capital named after the country shares a slug; make ids unique.
const seen = new Set();
for (const c of capItems) { while (seen.has(c.id)) c.id += '-2'; seen.add(c.id); }
function capitalQuestions() {
  const r = rng('capitals');
  const qs = [];
  for (const c of capItems) {
    const pool = capItems.filter(x => x !== c && x.group === c.group && x.name !== c.facts.country && !(c.alt || []).includes(x.name));
    const wrong = sample(r, pool, 3).map(x => x.name);
    const exp = c.blurb;
    qs.push({ id: `cap-${c.id}`, kind: 'mc', prompt: `What is the capital of ${theName(c.facts.country)}?`, answer: c.name, wrong, explain: exp, difficulty: c.difficulty, refs: [`capitals/${c.id}`] });
    if (c.name !== c.facts.country && c.difficulty <= 2) {
      const wrongC = sample(r, capItems.filter(x => x !== c && x.group === c.group), 3).map(x => x.facts.country);
      qs.push({ id: `capr-${c.id}`, kind: 'mc', prompt: `${c.name} is the capital of which country?`, answer: c.facts.country, wrong: wrongC, explain: exp, difficulty: c.difficulty, refs: [`capitals/${c.id}`] });
    }
  }
  // classic traps: capital is not the largest city
  const traps = [['Australia', 'Canberra', ['Sydney', 'Melbourne', 'Perth']], ['Canada', 'Ottawa', ['Toronto', 'Montreal', 'Vancouver']], ['Turkey', 'Ankara', ['Istanbul', 'Izmir', 'Antalya']],
    ['Brazil', 'Brasília', ['Rio de Janeiro', 'São Paulo', 'Salvador']], ['New Zealand', 'Wellington', ['Auckland', 'Christchurch', 'Queenstown']], ['Switzerland', 'Bern', ['Zurich', 'Geneva', 'Basel']],
    ['Nigeria', 'Abuja', ['Lagos', 'Kano', 'Ibadan']], ['Morocco', 'Rabat', ['Casablanca', 'Marrakesh', 'Fez']], ['Vietnam', 'Hanoi', ['Ho Chi Minh City', 'Da Nang', 'Hue']],
    ['Pakistan', 'Islamabad', ['Karachi', 'Lahore', 'Peshawar']], ['United States', 'Washington, D.C.', ['New York City', 'Los Angeles', 'Chicago']], ['Myanmar', 'Naypyidaw', ['Yangon', 'Mandalay', 'Bago']],
    ['Kazakhstan', 'Astana', ['Almaty', 'Shymkent', 'Karaganda']], ['Tanzania', 'Dodoma', ['Dar es Salaam', 'Zanzibar City', 'Arusha']], ['Ivory Coast', 'Yamoussoukro', ['Abidjan', 'Bouaké', 'San-Pédro']]];
  for (const [country, answer, wrong] of traps) qs.push({ id: `trap-${slug(country)}`, kind: 'mc', prompt: `Trick question: what is the capital of ${theName(country)}?`, answer, wrong, explain: `The capital of ${theName(country)} is ${answer}, not its largest or best-known city.`, difficulty: 2 });
  return qs;
}
writePack({
  id: 'capitals', title: 'Capitals', theme: 'geography', icon: '🏛️', kids: false, version: 1,
  notice: 'Contested capitals (Israel, Palestine, Yemen) and Nauru (no official capital) are left out.',
  leakExempt: GEO_EXEMPT, factsMeta: { country: { type: 'text', label: 'Country' }, continent: { type: 'cat', label: 'Continent', ask: 'Which continent is {name} in?', stmt: '{name} is in {value}.' } },
  items: capItems, questions: capitalQuestions(), sources: geoSources,
});

// ---- currencies pack ----
const curUsers = {};
for (const r of usable) for (const c of r.currencies) (curUsers[c] ??= []).push(r);
const curItems = Object.entries(curUsers).map(([code, users]) => {
  const [name, symbol] = CURRENCIES[code] || [code];
  const countries = users.map(u => u.name);
  const theCountries = countries.map(theName);
  const pop = users.reduce((a, u) => a + u.population, 0);
  const caps = users.filter(u => !CAPITAL_NOTES[u.iso3]?.skip).map(u => u.capital);
  const clues = [
    symbol && `Its symbol is ${symbol}.`,
    `About ${fmtPop(pop)} people live in the countries that use it.`,
    caps.length && `You could spend it in ${listAnd(caps.slice(0, 2))}.`,
    `It is used in ${countries.length} UN member or observer state${countries.length > 1 ? 's' : ''}.`,
    `It is used in ${listAnd([...new Set(users.map(u => CONT[u.cont]))])}.`,
    countries.length > 1 ? `Countries using it include ${listAnd(theCountries.slice(0, 3))}.` : `It is the currency of ${theCountries[0]}.`,
  ].filter(c => c && !leaks(c, [name]));
  return { id: slug(name), name, alt: [code], group: CONT[users[0].cont], facts: { code, countries: countries.length, symbol: symbol || undefined, continent: CONT[users[0].cont] },
    blurb: `The ${name} (${code}) is used in ${listAnd(theCountries.slice(0, 6))}${countries.length > 6 ? ' and others' : ''}.`, clues, difficulty: users.some(u => FAMOUS.includes(u.iso3)) ? 1 : 2 };
});
function currencyQuestions() {
  const r = rng('currencies');
  const qs = [];
  for (const u of usable) {
    if (u.currencies.length !== 1 || u.iso3 === 'PSE') continue;
    const code = u.currencies[0];
    const ci = countryItems.find(i => i.iso3 === u.iso3);
    const wrong = sample(r, curItems.filter(c => c.facts.code !== code), 3).map(c => c.name);
    qs.push({ id: `cur-${slug(u.name)}`, kind: 'mc', prompt: `What is the currency of ${theName(u.name)}?`, answer: curName(code), wrong, explain: `${TheName(u.name)} uses the ${curName(code)} (${code}).`, difficulty: ci.difficulty });
    if (curUsers[code].length === 1 && !leaks(curName(code), [u.name, ...u.alt])) {
      const wrongC = sample(r, usable.filter(x => x !== u && x.cont === u.cont), 3).map(x => x.name);
      qs.push({ id: `curr-${slug(u.name)}`, kind: 'mc', prompt: `Which country uses the ${curName(code)}?`, answer: u.name, wrong: wrongC, explain: `The ${curName(code)} is the currency of ${theName(u.name)}.`, difficulty: Math.min(3, ci.difficulty + 1) });
    }
  }
  qs.push({ id: 'cur-eurozone-2026', kind: 'number', prompt: 'In 2026, how many European Union countries use the euro?', answer: 21, unit: 'countries', tolerance: 2, explain: 'Bulgaria became the 21st when it adopted the euro on 1 January 2026.', difficulty: 3 });
  qs.push({ id: 'cur-bulgaria-euro', kind: 'tf', prompt: 'Bulgaria switched from the lev to the euro on 1 January 2026.', answer: true, explain: 'Bulgaria became the 21st eurozone country.', difficulty: 3 });
  qs.push({ id: 'cur-uk-euro', kind: 'tf', prompt: 'The United Kingdom has never used the euro as its currency.', answer: true, explain: 'The UK kept the pound sterling throughout its EU membership.', difficulty: 1 });
  qs.push({ id: 'cur-ecuador-usd', kind: 'tf', prompt: 'Ecuador uses the US dollar as its official currency.', answer: true, explain: 'Ecuador adopted the US dollar in 2000.', difficulty: 2 });
  qs.push({ id: 'cur-swiss-euro', kind: 'tf', prompt: 'Switzerland uses the euro.', answer: false, explain: 'Switzerland uses the Swiss franc.', difficulty: 1 });
  qs.push({ id: 'cur-yen-sym', kind: 'mc', prompt: 'Which currency uses the symbol ¥ along with the Chinese renminbi?', answer: 'Japanese yen', wrong: ['South Korean won', 'Thai baht', 'Indian rupee'], explain: 'Both the yen and the yuan are written with ¥.', difficulty: 2 });
  qs.push({ id: 'cur-rupee-sym', kind: 'mc', prompt: 'Which currency has the symbol ₹?', answer: 'Indian rupee', wrong: ['Russian ruble', 'Indonesian rupiah', 'Pakistani rupee'], explain: 'India adopted the ₹ sign in 2010.', difficulty: 2 });
  qs.push({ id: 'cur-ruble-sym', kind: 'mc', prompt: 'Which currency has the symbol ₽?', answer: 'Russian ruble', wrong: ['Philippine peso', 'Polish złoty', 'Peruvian sol'], explain: 'The ruble sign was adopted in 2013.', difficulty: 3 });
  // true/false "The currency of X is the <unit>." Only units whose word is unique (birr, pula, yen; not dollar, franc,
  // dinar…) and countries with a currency of their own; false ones name a same-region unit X doesn't use. The bare
  // unit is used because full names ("Ethiopian birr") give the answer away.
  const unit = n => n.replace(/\s*\(.*\)/, '').split(' ').pop();
  const unitText = n => ({ 'Renminbi (yuan)': 'renminbi (yuan)', 'Pound sterling': 'pound sterling' }[n] || unit(n));
  const unitCount = {};
  for (const c of curItems) unitCount[unit(c.name).toLowerCase()] = (unitCount[unit(c.name).toLowerCase()] || 0) + 1;
  const distinct = n => unitCount[unit(n).toLowerCase()] === 1;
  const rt = rng('currencies-tf');
  const singles = usable.filter(u => u.currencies.length === 1 && u.iso3 !== 'PSE' && curUsers[u.currencies[0]].length === 1 && distinct(curName(u.currencies[0])));
  sample(rt, singles, 40).forEach((u, i) => {
    const own = u.currencies[0], ci = countryItems.find(c => c.iso3 === u.iso3);
    const other = sample(rt, curItems.filter(c => !u.currencies.includes(c.facts.code) && c.group === CONT[u.cont] && distinct(c.name)), 1)[0];
    const truth = i % 2 === 0 || !other;
    const who = theName(u.name);
    qs.push({ id: `curtf-${slug(u.name)}`, kind: 'tf', prompt: `The currency of ${who} is the ${unitText(truth ? curName(own) : other.name)}.`, answer: truth,
      explain: `${who.charAt(0).toUpperCase() + who.slice(1)} uses the ${curName(own)} (${own}).`, difficulty: ci.difficulty });
  });
  return qs;
}
writePack({
  id: 'currencies', title: 'Currencies', theme: 'geography', icon: '💱', kids: false, version: 1,
  leakExempt: GEO_EXEMPT, factsMeta: { countries: { type: 'num', label: 'Countries using it', higherLabel: 'More countries', askNumber: 'How many countries use the {name}?', askHigh: 'Which of these currencies is used by the most countries?' }, continent: { type: 'cat', label: 'Main region', exclusive: false }, code: { type: 'text', label: 'ISO code', matchPrompt: 'Match each currency to its ISO code' }, symbol: { type: 'text', label: 'Symbol' } },
  items: curItems, questions: currencyQuestions(), sources: [{ name: 'ISO 4217 via Wikidata', url: 'https://www.wikidata.org/wiki/Property:P498' }],
});

// ---- languages pack ----
const langRows = LANGUAGES.trim().split('\n').map(l => { const [name, family, branch, script, native] = l.split('|'); return { name, family, branch, script, native }; });
const LANG_HARD = ['Kinyarwanda', 'Shona', 'Guaraní', 'Malagasy', 'Sinhala', 'Pashto', 'Lao', 'Khmer', 'Burmese', 'Maltese', 'Samoan', 'Quechua', 'Hausa', 'Xhosa', 'Somali', 'Amharic', 'Albanian', 'Armenian', 'Georgian', 'Azerbaijani', 'Uzbek', 'Mongolian', 'Nepali', 'Estonian', 'Slovak', 'Māori'];
const langUsers = {};
for (const r of usable) for (const l of r.languages) (langUsers[l] ??= []).push(r);
const langItems = langRows.map(l => {
  const users = langUsers[l.name] || [];
  if (!users.length) note(`language with no countries: ${l.name}`);
  const names = [l.name];
  const clues = [
    l.family !== l.branch ? `It belongs to the ${l.branch} branch of the ${l.family} family.` : `It belongs to the ${l.family} family.`,
    `It is written in the ${l.script} script.`,
    users.length && `It is a main language in ${users.length} countr${users.length > 1 ? 'ies' : 'y'}.`,
    users.length && `It is spoken in ${listAnd([...new Set(users.map(u => CONT[u.cont]))])}.`,
    l.native && l.native.toLowerCase() !== l.name.toLowerCase() && `Its speakers call it "${l.native}"${l.script === 'Latin' ? '' : ' (romanised)'}.`,
    users.length && `About ${fmtPop(users.reduce((a, u) => a + u.population, 0))} people live in the countries where it is a main language.`,
    users.length && `It is a main language of ${listAnd(users.slice(0, 3).map(u => u.name))}.`,
  ].filter(c => c && !leaks(c, names));
  return { id: slug(l.name), name: l.name, group: l.family, facts: { family: l.family, branch: l.branch, script: l.script, countries: users.length },
    blurb: `${l.name} is a${/^[AEIOU]/.test(l.family) ? 'n' : ''} ${l.family} language written in the ${l.script} script${users.length ? `, and a main language of ${listAnd(users.slice(0, 5).map(u => u.name))}${users.length > 5 ? ' and others' : ''}` : ''}.`,
    clues, difficulty: users.length >= 5 || ['Mandarin Chinese', 'Japanese', 'Russian', 'German', 'Italian', 'Hindi', 'Korean', 'Greek', 'Turkish', 'Dutch'].includes(l.name) ? 1 : LANG_HARD.includes(l.name) ? 3 : 2 };
});
function languageQuestions() {
  const r = rng('languages');
  const qs = [];
  const all = Object.keys(langUsers);
  for (const u of usable) {
    const ci = countryItems.find(i => i.iso3 === u.iso3);
    const sameContLangs = new Set(usable.filter(x => x.cont === u.cont).flatMap(x => x.languages));
    const pool = all.filter(l => !u.languages.includes(l) && !sameContLangs.has(l) && langUsers[l].length >= 1);
    const answer = u.languages[0];
    if (u.iso3 === 'USA' || u.iso3 === 'GBR') continue;
    qs.push({ id: `lang-${slug(u.name)}`, kind: 'mc', prompt: `Which of these is a main language of ${theName(u.name)}?`, answer, wrong: sample(r, pool, 3), explain: `Main language${u.languages.length > 1 ? 's' : ''} of ${theName(u.name)}: ${listAnd(u.languages)}.`, difficulty: ci.difficulty });
  }
  for (const l of langItems) {
    const users = langUsers[l.name] || [];
    if (!users.length) continue;
    const ans = users.find(u => FAMOUS.includes(u.iso3)) || users[0];
    const pool = usable.filter(x => !x.languages.includes(l.name) && x.cont !== ans.cont);
    qs.push({ id: `langc-${l.id}`, kind: 'mc', prompt: `In which of these countries is ${l.name} a main language?`, answer: ans.name, wrong: sample(r, pool, 3).map(x => x.name), explain: l.blurb, difficulty: l.difficulty });
    const wrongScripts = sample(r, [...new Set(langRows.map(x => x.script))].filter(s => s !== l.facts.script), 3);
    qs.push({ id: `langs-${l.id}`, kind: 'mc', prompt: `Which script is ${l.name} normally written in?`, answer: l.facts.script, wrong: wrongScripts, explain: l.blurb, difficulty: l.difficulty === 1 ? 2 : 3 });
  }
  return qs;
}
writePack({
  id: 'languages', title: 'Languages', theme: 'geography', icon: '🗣️', kids: false, version: 1,
  notice: '"Main languages" are the official or most widely used languages of each country, simplified.',
  factsMeta: { family: { type: 'cat', label: 'Language family', ask: 'Which language family does {name} belong to?', stmt: '{name} belongs to the {value} family.' }, branch: { type: 'cat', label: 'Branch', ask: 'Which branch of its family does {name} belong to?', stmt: '{name} belongs to the {value} branch of its language family.' }, script: { type: 'cat', label: 'Script', ask: 'Which script is {name} normally written in?', stmt: '{name} is normally written in the {value} script.' }, countries: { type: 'num', label: 'Countries where it is a main language', higherLabel: 'More countries', askNumber: 'In how many countries is {name} a main language?', askHigh: 'Which of these is a main language in the most countries?' } },
  items: langItems, questions: languageQuestions(), sources: geoSources,
});

// ---- landmarks pack ----
const LM_STOP = ['tower', 'bridge', 'mosque', 'temple', 'castle', 'palace', 'cathedral', 'basilica', 'mountain', 'mount', 'statue', 'gate', 'building', 'house', 'opera', 'grand', 'lakes', 'national', 'park', 'church', 'churches', 'glacier', 'falls', 'canal', 'pagoda', 'arch', 'sign', 'needle', 'towers', 'islands', 'crater', 'reef', 'barrier', 'canyon', 'wall', 'fountain', 'army', 'pyramid', 'conservation', 'area', 'salt', 'mine', 'temples', 'gateway', 'bay', 'giant', 'peter', 'little', 'white', 'golden', 'space', 'sound', 'rock', 'blue'];
const LM_HARD = ['Leptis Magna', 'Carthage', 'Lalibela churches', 'Great Mosque of Djenné', 'Sigiriya', 'Bagan', 'Persepolis', 'Kinderdijk', 'Hallgrímskirkja', 'Wieliczka Salt Mine', 'Meteora', 'Pamukkale', 'Plitvice Lakes', 'Atomium', 'Château Frontenac', 'Hassan II Mosque', 'Shwedagon Pagoda', 'Wat Arun', 'Gyeongbokgung', 'Kinkaku-ji', 'Fushimi Inari-taisha', 'Tokyo Skytree', 'Lotus Temple', 'Golden Temple', 'Borobudur', 'Tikal', 'Teotihuacan', 'Perito Moreno Glacier', 'Salar de Uyuni', 'Bran Castle', 'Cologne Cathedral', 'Winter Palace', 'Ngorongoro Crater', 'Milford Sound', 'Potala Palace', 'Sheikh Zayed Grand Mosque', 'Gateway of India', 'Abu Simbel', 'Charles Bridge'];
const lmItems = lmRows.filter(r => r.qid && r.geo).map(r => {
  const country = byIso[r.iso3];
  const im = lmImgs[lmImgFiles[r.title]?.replace(/_/g, ' ')];
  if (im?.rejected) note(`landmark licence rejected ${r.title}: ${im.rejected}`);
  const clues = [...r.clues];
  const last = clues.pop();
  clues.push(`It is in ${CONT[country.cont]}.`, `It is in ${theName(country.name)}.`, last);
  const names = [r.name, ...r.alt];
  return {
    id: slug(r.name), name: r.name, lname: theLm(r.name), alt: r.alt, iso3: r.iso3, group: r.kind, geo: r.geo,
    facts: { country: country.name, continent: CONT[country.cont], kind: r.kind, built: r.year || undefined },
    blurb: r.clues[r.clues.length - 1].replace(/^(It is|They are|It stands|It sits|It lies|It towers|It looks|It crosses|It spans|It rises|It overlooks|It guards|It faces|It snakes)/, m => m) + '.',
    clues: clues.map(c => /[.!?]$/.test(c) ? c : c + '.').filter(c => !leaks(c, names, LM_STOP)),
    media: LM_NO_IMG.includes(r.name) ? {} : { img: img(im) },
    difficulty: LM_HARD.includes(r.name) ? 3 : ['Eiffel Tower', 'Statue of Liberty', 'Great Wall of China', 'Taj Mahal', 'Colosseum', 'Great Pyramid of Giza', 'Sydney Opera House', 'Big Ben', 'Leaning Tower of Pisa', 'Christ the Redeemer', 'Mount Fuji', 'Golden Gate Bridge', 'Stonehenge', 'Burj Khalifa', 'Machu Picchu', 'Grand Canyon', 'Empire State Building', 'Mount Rushmore', 'White House', 'Tower Bridge', 'Great Sphinx of Giza'].includes(r.name) ? 1 : 2,
  };
});
for (const it of lmItems) {
  it.blurb = `${it.name}, ${it.facts.country}. ${r0(it)}`;
  if (it.clues.length < 5) note(`landmark few clues ${it.id}: ${it.clues.length}`);
}
function r0(it) { const row = lmRows.find(r => slug(r.name) === it.id); return row.clues[row.clues.length - 1] + '. ' + row.clues[row.clues.length - 2] + '.'; }
function landmarkQuestions() {
  const r = rng('landmarks');
  return lmItems.map(it => {
    const pool = [...new Set(lmItems.filter(x => x.facts.country !== it.facts.country).map(x => x.facts.country))];
    return { id: `lmc-${it.id}`, kind: 'mc', prompt: `In which country is ${it.lname}?`, answer: it.facts.country, wrong: sample(r, pool, 3), explain: it.blurb, difficulty: it.difficulty, refs: [`landmarks/${it.id}`] };
  });
}
writePack({
  id: 'landmarks', title: 'Landmarks', theme: 'geography', icon: '🗿', kids: true, version: 1, leakExempt: [...LM_STOP, ...GEO_EXEMPT],
  nameImgPrompt: 'Which landmark is this?', imgPrompt: 'Which of these is {lname}?', tfImgPrompt: 'This is {lname}.',
  factsMeta: { country: { type: 'cat', label: 'Country', ask: 'In which country is {lname}?', askReverse: 'Which of these is in {value}?', stmt: '{lname} is in {value}.' }, continent: { type: 'cat', label: 'Continent', ask: 'On which continent is {lname}?', stmt: '{lname} is in {value}.' }, kind: { type: 'cat', label: 'Type', exclusive: false }, built: { type: 'year', label: 'Completed', higherLabel: 'Newer', askHigh: 'Which of these was completed most recently?', askLow: 'Which of these is the oldest?' } },
  items: lmItems, questions: landmarkQuestions(), sources: [{ name: 'Wikidata (coordinates, dates)', url: 'https://www.wikidata.org' }, { name: 'Wikimedia Commons (photos)', url: 'https://commons.wikimedia.org' }],
});

(await import('./c2_distract.mjs')).run();

mkdirSync(join(ROOT, 'tools/c2_reports'), { recursive: true });
writeFileSync(join(ROOT, 'tools/c2_reports/geo.txt'), report.join('\n') + '\n');
console.log(`${report.length} report lines -> tools/c2_reports/geo.txt`);
