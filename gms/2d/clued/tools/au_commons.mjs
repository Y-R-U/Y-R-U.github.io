#!/usr/bin/env node
// Build the Wikimedia Commons audio packs: anthems, instruments, classical-recordings.
//   node tools/au_commons.mjs [anthems|instruments|classical]
// Every file's licence is read from Commons (extmetadata) and only PD / CC0 / CC BY / CC BY-SA are kept.
// Audio is hotlinked as Commons' MP3 transcode (plays everywhere, CORS-enabled); originals that are already MP3 are used as-is.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data/music');
const UA = { 'User-Agent': 'CluedBuild/1.0 (https://y-r-u.github.io; trivia game build script)' };
const API = 'https://commons.wikimedia.org/w/api.php';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const LICENCE_OK = /^(public domain|pd\b|pdm|cc0|cc[- ]by(-sa)?( [\d.]+)?( [a-z]{2,})?$|cc[- ]by(-sa)?-[\d.]+)/i;
const strip = (s) => String(s || '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/\s+/g, ' ').trim();
const slug = (s) => String(s).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function getJSON(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url, { headers: UA }); if (r.ok) return await r.json(); } catch {}
    await sleep(2000 * (i + 1));
  }
  throw new Error('fetch failed ' + url);
}

async function sparql(q) {
  const j = await getJSON('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(q));
  return j.results.bindings;
}

// title -> { src, page, license, credit, dur } for audio files
async function audioInfo(titles) {
  const out = {};
  for (let i = 0; i < titles.length; i += 40) {
    const batch = titles.slice(i, i + 40);
    const j = await getJSON(`${API}?action=query&format=json&prop=videoinfo&viprop=url|size|derivatives|extmetadata|mediatype&viextmetadatafilter=LicenseShortName|Artist|Credit|Categories&titles=${encodeURIComponent(batch.join('|'))}`);
    const norm = Object.fromEntries((j.query.normalized || []).map((n) => [n.to, n.from]));
    for (const p of Object.values(j.query.pages || {})) {
      const vi = p.videoinfo?.[0];
      if (!vi) continue;
      const em = vi.extmetadata || {};
      const lic = strip(em.LicenseShortName?.value);
      const mp3 = (vi.derivatives || []).find((d) => d.transcodekey === 'mp3')?.src || (/\.mp3$/i.test(p.title) ? vi.url.split('?')[0] : null);
      const cats = em.Categories?.value || '';
      let credit = strip(em.Artist?.value);
      if (/Navy Band/i.test(p.title + cats) && (!credit || /unknown/i.test(credit))) credit = 'United States Navy Band';
      if (/Marine Band/i.test(p.title) && !credit) credit = 'United States Marine Band';
      if (/Air Force/i.test(p.title) && !credit) credit = 'United States Air Force Band';
      out[norm[p.title] || p.title] = {
        title: p.title, src: mp3, page: vi.descriptionurl || `https://commons.wikimedia.org/wiki/${encodeURIComponent(p.title.replace(/ /g, '_'))}`,
        license: lic, credit: credit || 'Unknown (see source page)', dur: vi.duration ? Math.round(vi.duration * 10) / 10 : null, navy: /PD US Navy|Navy Band/i.test(cats + p.title),
      };
    }
    await sleep(500);
  }
  return out;
}

async function imageInfo(titles, width = 640) {
  const out = {};
  for (let i = 0; i < titles.length; i += 40) {
    const batch = titles.slice(i, i + 40);
    const j = await getJSON(`${API}?action=query&format=json&prop=imageinfo&iiprop=url|size|extmetadata&iiurlwidth=${width}&iiextmetadatafilter=LicenseShortName|Artist&titles=${encodeURIComponent(batch.join('|'))}`);
    const norm = Object.fromEntries((j.query.normalized || []).map((n) => [n.to, n.from]));
    for (const p of Object.values(j.query.pages || {})) {
      const ii = p.imageinfo?.[0];
      if (!ii) continue;
      const em = ii.extmetadata || {};
      out[norm[p.title] || p.title] = { src: ii.thumburl || ii.url, w: ii.thumbwidth || ii.width, h: ii.thumbheight || ii.height, credit: strip(em.Artist?.value) || 'See source page', license: strip(em.LicenseShortName?.value), page: ii.descriptionurl };
    }
    await sleep(500);
  }
  return out;
}

const fileTitle = (url) => 'File:' + decodeURIComponent(url.split('/').pop()).replace(/_/g, ' ');
const okLicence = (l) => LICENCE_OK.test(l || '');

async function headOk(url) {
  try { const r = await fetch(url, { method: 'HEAD', headers: UA }); return r.ok; } catch { return false; }
}

const audioObj = (a, extra = {}) => ({ src: a.src, credit: a.credit, license: a.license, page: a.page, dur: a.dur, ...extra });

// ---------- anthems ----------
const ANTHEM_OVERRIDE = {
  'United Kingdom': 'File:U.S. Navy Band - God Save the King.oga',
  Spain: 'File:Marcha Real-Royal March by US Navy Band.ogg',
  "People's Republic of China": 'File:March of the Volunteers instrumental.ogg',
  Portugal: 'File:A Portuguesa.ogg',
  Germany: 'File:German national anthem performed by the US Navy Band.ogg',
  Italy: 'File:National anthem of Italy - U.S. Navy Band (short version).ogg',
  'United States': 'File:"The Star-Spangled Banner" performed by the United States Navy Band.mp3',
  'Kingdom of the Netherlands': 'File:Dutch national anthem performed by the United States Navy Band.mp3',
  Ireland: 'File:United States Navy Band - Amhrán na bhFiann.ogg',
  Russia: 'File:National anthem of Russia, performed by the United States Navy Band.wav',
  'South Korea': 'File:National anthem of South Korea, performed by the United States Navy Band.wav',
  'New Zealand': 'File:New Zealand national anthem, performed by the United States Navy Band.wav',
  Denmark: 'File:United States Navy Band - Der er et yndigt land.ogg',
  Sweden: 'File:United States Navy Band - Sweden.ogg',
  Cuba: 'File:United States Navy Band - La Bayamesa.ogg',
  Mexico: 'File:Himno Nacional Mexicano instrumental.ogg',
  Jamaica: 'File:"Jamaica, Land We Love", performed by the United States Navy Band.oga',
  Ukraine: 'File:Ukrainian National Anthem played by U.S. Navy Band.mp3',
  Indonesia: 'File:Indonesia Raya instrumental.ogg',
  Moldova: 'File:Imnul Republicii Moldova US NAVY.ogg',
  Iraq: "File:Iraqi national anthem, performed by the U.S. Navy Band.wav",
  Kiribati: 'File:Kiribati Anthem Performed by US Navy Band.oga',
  'Burkina Faso': 'File:National anthem of Burkina Faso.oga',
  Senegal: 'File:National Anthem of Senegal.ogg',
  'The Gambia': 'File:For The Gambia Our Homeland (instrumental).ogg',
  Palau: 'File:Belau rekid (instrumental).oga',
  'Federated States of Micronesia': 'File:National anthem of the Federated States of Micronesia (one verse), performed by the U.S. Navy Band.ogg',
  'Antigua and Barbuda': 'File:Antigua and Barbuda National Anthem.ogg',
};
const ANTHEM_NAME = { Denmark: 'Der er et yndigt land', Mexico: 'Himno Nacional Mexicano', Jamaica: 'Jamaica, Land We Love', 'Federated States of Micronesia': 'Patriots of Micronesia', 'Antigua and Barbuda': 'Fair Antigua, We Salute Thee', 'New Zealand': 'God Defend New Zealand', 'United Kingdom': 'God Save the King', Germany: 'Deutschlandlied (third stanza)', Spain: 'Marcha Real', Portugal: 'A Portuguesa', Russia: 'State Anthem of the Russian Federation' };
const ISO_FIX = { Kosovo: 'XKX', Denmark: 'DNK', Netherlands: 'NLD', 'United Kingdom': 'GBR', China: 'CHN', France: 'FRA' };
const NAME_FIX = { "People's Republic of China": 'China', 'Kingdom of the Netherlands': 'Netherlands', 'Kingdom of Denmark': 'Denmark', 'The Bahamas': 'Bahamas' };
// same tune as another country's anthem, or a disputed/contested choice: leave out
const ANTHEM_SKIP = new Set(['Liechtenstein', 'Cyprus', 'Afghanistan', 'Kosovo', 'Palestine', 'Taiwan', 'Malawi']);
const EASY = new Set(['United States', 'United Kingdom', 'France', 'Germany', 'Italy', 'Canada', 'Australia', 'Japan', 'Brazil', 'Spain', 'Mexico', 'Russia', 'China', 'India', 'Ireland']);
const MEDIUM = new Set(['Netherlands', 'Sweden', 'Norway', 'Denmark', 'Finland', 'Poland', 'Portugal', 'Greece', 'Turkey', 'Israel', 'Egypt', 'New Zealand', 'Switzerland', 'Belgium', 'Austria',
  'Argentina', 'South Africa', 'South Korea', 'Nigeria', 'Kenya', 'Jamaica', 'Cuba', 'Chile', 'Colombia', 'Peru', 'Ukraine', 'Hungary', 'Czech Republic', 'Iceland', 'Scotland', 'Wales', 'Croatia', 'Romania', 'Saudi Arabia', 'Iran', 'Pakistan', 'Philippines', 'Vietnam', 'Thailand', 'Indonesia', 'Venezuela', 'Uruguay', 'Morocco', 'Ghana', 'Ethiopia']);

async function anthems() {
  const rows = await sparql(`SELECT ?c ?cLabel ?a ?aLabel ?audio ?cont ?contLabel ?iso WHERE { ?c wdt:P31 wd:Q3624078; wdt:P85 ?a. FILTER NOT EXISTS { ?c wdt:P576 [] }
    OPTIONAL { ?a wdt:P51 ?audio. } OPTIONAL { ?c wdt:P30 ?cont. } OPTIONAL { ?c wdt:P298 ?iso. } SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } }`);
  const byCountry = new Map();
  for (const r of rows) {
    const raw = r.cLabel.value, name = NAME_FIX[raw] || raw;
    if (ANTHEM_SKIP.has(name) || (/^Q\d+$/.test(r.aLabel.value) && !ANTHEM_NAME[name])) continue;
    const e = byCountry.get(name) || { name, raw, anthems: new Set(), files: new Set(), cont: new Set(), iso: new Set() };
    if (r.iso) e.iso.add(r.iso.value);
    e.anthems.add(r.aLabel.value);
    if (r.audio) e.files.add(fileTitle(r.audio.value));
    if (r.contLabel) e.cont.add(r.contLabel.value);
    byCountry.set(name, e);
  }
  if (!byCountry.has('Portugal')) byCountry.set('Portugal', { name: 'Portugal', raw: 'Portugal', anthems: new Set(['A Portuguesa']), files: new Set(), cont: new Set(['Europe']), iso: new Set(['PRT']) });
  for (const [raw, f] of Object.entries(ANTHEM_OVERRIDE)) {
    const name = NAME_FIX[raw] || raw;
    const e = byCountry.get(name);
    if (e) e.files = new Set([f]);
  }
  const all = [...new Set([...byCountry.values()].flatMap((e) => [...e.files]))];
  const info = await audioInfo(all);
  const items = [], dropped = [];
  for (const e of [...byCountry.values()].sort((a, b) => a.name.localeCompare(b.name))) {
    if (e.anthems.size > 1 && !ANTHEM_OVERRIDE[e.raw] && !ANTHEM_OVERRIDE[e.name] && !ANTHEM_NAME[e.name]) { dropped.push(`${e.name}: ${e.anthems.size} anthems listed`); continue; }
    const cands = [...e.files].map((f) => info[f]).filter(Boolean).filter((a) => okLicence(a.license) && a.src);
    cands.sort((a, b) => b.navy - a.navy);
    const a = cands[0];
    if (!a) { dropped.push(`${e.name}: no usable file (${[...e.files].map((f) => info[f]?.license || 'missing').join(', ') || 'none'})`); continue; }
    if (!(await headOk(a.src))) { dropped.push(`${e.name}: transcode not reachable`); continue; }
    const anthem = ANTHEM_NAME[e.name] || [...e.anthems][0];
    const iso3 = ISO_FIX[e.name] || ([...e.iso].length === 1 ? [...e.iso][0] : null);
    if (!/^[A-Z]{3}$/.test(iso3 || '')) { dropped.push(`${e.name}: no single ISO alpha-3 (${[...e.iso].join(',')})`); continue; }
    items.push({
      id: slug(e.name), name: e.name, iso3, group: [...e.cont][0] || undefined,
      facts: { iso3, anthem, ...(e.cont.size === 1 ? { continent: [...e.cont][0] } : {}) },
      blurb: anthem.toLowerCase().includes(e.name.toLowerCase().split(' ')[0]) || /^national anthem/i.test(anthem) ? `The national anthem of ${e.name}.` : `"${anthem}" is the national anthem of ${e.name}.`,
      media: { audio: [audioObj(a, { minStart: 1 })] },
      difficulty: EASY.has(e.name) ? 1 : MEDIUM.has(e.name) ? 2 : 3,
    });
  }
  write({
    id: 'anthems', title: 'National anthems', theme: 'music', icon: '🎺', kids: false, version: 1,
    listenPrompt: "Which country's national anthem is this?",
    factsMeta: { iso3: { type: 'text', label: 'ISO code' }, anthem: { type: 'text', label: 'Anthem' }, continent: { type: 'cat', label: 'Continent', ask: 'Which continent is {name} in?', askReverse: 'Which of these countries is in {value}?', stmt: '{name} is in {value}.' } },
    items, questions: [],
    sources: [{ name: 'Wikidata (country → anthem → audio)', url: 'https://www.wikidata.org' }, { name: 'Wikimedia Commons; most recordings by the United States Navy Band (US government work, public domain)', url: 'https://commons.wikimedia.org/wiki/Category:Audio_files_of_national_anthems_performed_by_the_United_States_Navy_Band' }],
  }, dropped);
}

// ---------- instruments ----------
const INSTRUMENTS = {
  Q6607: { d: 1 }, Q5994: { d: 1 }, Q8355: { d: 1 }, Q11404: { d: 1, name: 'Drum' }, Q11405: { d: 1 }, Q79838: { d: 1 }, Q8343: { d: 2 }, Q8371: { d: 1 },
  Q51290: { d: 1 }, Q81982: { d: 2 }, Q80284: { d: 3 }, Q8350: { d: 2 }, Q8377: { d: 2 }, Q78987: { d: 1 }, Q131168: { d: 2 }, Q8347: { d: 1, name: 'Bagpipes', plural: true },
  Q185003: { d: 3 }, Q159998: { d: 3 }, Q61285: { d: 2 }, Q258896: { d: 2 }, Q193666: { d: 2 }, Q190172: { d: 2 }, Q208320: { d: 2 }, Q191000: { d: 3 },
  Q83266: { d: 2 }, Q187851: { d: 2 }, Q187780: { d: 3 }, Q76239: { d: 3 }, Q202027: { d: 3 }, Q289037: { d: 3 }, Q737917: { d: 3 }, Q6685124: { d: 3 },
  Q320341: { d: 3 }, Q215032: { d: 3 }, Q752638: { d: 3 }, Q244976: { d: 3 }, Q105891: { d: 3 }, Q593050: { d: 3 }, Q1628293: { d: 2 }, Q512191: { d: 3 },
  Q524526: { d: 3 }, Q850118: { d: 3 }, Q775570: { d: 2 }, Q1144761: { d: 3 }, Q505174: { d: 3 }, Q145840: { d: 3 }, Q849052: { d: 3 }, Q723720: { d: 3 },
};
const FAMILY = { Q6607: 'strings', Q8355: 'strings', Q8371: 'strings', Q80284: 'strings', Q78987: 'strings', Q61285: 'strings', Q258896: 'strings', Q191000: 'strings', Q76239: 'strings', Q289037: 'strings', Q6685124: 'strings', Q145840: 'strings', Q723720: 'strings', Q1144761: 'other',
  Q11405: 'woodwind', Q8343: 'woodwind', Q8377: 'woodwind', Q159998: 'woodwind', Q187851: 'woodwind', Q187780: 'woodwind', Q737917: 'woodwind', Q524526: 'woodwind', Q8347: 'woodwind',
  Q8350: 'brass', Q131168: 'brass', Q202027: 'brass', Q1628293: 'brass', Q83266: 'brass',
  Q11404: 'percussion', Q193666: 'percussion', Q190172: 'percussion', Q208320: 'percussion', Q244976: 'percussion', Q850118: 'percussion', Q775570: 'percussion', Q505174: 'percussion',
  Q5994: 'keyboard', Q81982: 'keyboard', Q320341: 'keyboard', Q105891: 'keyboard', Q752638: 'keyboard',
  Q79838: 'free reed', Q51290: 'free reed', Q215032: 'free reed', Q593050: 'free reed', Q512191: 'free reed', Q849052: 'free reed', Q185003: 'other' };

async function instruments() {
  const ids = Object.keys(INSTRUMENTS);
  const rows = await sparql(`SELECT ?i ?iLabel ?audio ?img WHERE { VALUES ?i { ${ids.map((q) => 'wd:' + q).join(' ')} } ?i wdt:P51 ?audio. OPTIONAL { ?i wdt:P18 ?img } SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } }`);
  const by = new Map();
  for (const r of rows) {
    const q = r.i.value.split('/').pop();
    const e = by.get(q) || { q, name: r.iLabel.value, audio: [], img: null };
    const f = fileTitle(r.audio.value);
    if (!e.audio.includes(f)) e.audio.push(f);
    if (!e.img && r.img) e.img = fileTitle(r.img.value);
    by.set(q, e);
  }
  const ai = await audioInfo([...by.values()].flatMap((e) => e.audio));
  const ii = await imageInfo([...by.values()].map((e) => e.img).filter(Boolean));
  const items = [], dropped = [];
  for (const e of by.values()) {
    const auds = e.audio.map((f) => ai[f]).filter((a) => a && a.src && okLicence(a.license));
    if (!auds.length) { dropped.push(`${e.name}: no usable audio (${e.audio.map((f) => ai[f]?.license).join(', ')})`); continue; }
    if (!(await headOk(auds[0].src))) { dropped.push(`${e.name}: not reachable`); continue; }
    const img = e.img && ii[e.img] && okLicence(ii[e.img].license) ? ii[e.img] : null;
    const name = INSTRUMENTS[e.q].name || e.name.charAt(0).toUpperCase() + e.name.slice(1);
    items.push({
      id: slug(name), name, group: FAMILY[e.q] || 'other',
      ...(/^(Hammond|Jew)/.test(name) ? { lname: name } : {}),
      ...(INSTRUMENTS[e.q].plural ? { imgPrompt: 'Which of these shows {lname}?', tfImgPrompt: 'These are {lname}.' } : {}),
      // "other" is not an instrument family, so those few get no family fact
      facts: FAMILY[e.q] && FAMILY[e.q] !== 'other' ? { family: FAMILY[e.q] } : {},
      blurb: `The sound of the ${name.toLowerCase()}.`,
      media: { audio: auds.slice(0, 2).map((a) => audioObj(a)), ...(img ? { img: [img] } : {}) },
      difficulty: INSTRUMENTS[e.q].d,
    });
  }
  write({
    id: 'instruments', title: 'Musical instruments', theme: 'music', icon: '🎻', kids: false, version: 1,
    listenPrompt: 'Which instrument is this?',
    factsMeta: { family: { type: 'cat', label: 'Family', noun: 'instrument family', ask: 'Which family of instruments does the {lname} belong to?', askReverse: 'Which of these belongs to the {value} family?', stmt: 'The {lname} belongs to the {value} family.' } },
    items, questions: [],
    sources: [{ name: 'Wikidata (instrument → audio, image)', url: 'https://www.wikidata.org' }, { name: 'Wikimedia Commons', url: 'https://commons.wikimedia.org' }],
  }, dropped);
}

// ---------- classical recordings ----------
const CLASSICAL = [
  { file: 'File:Grieg - Peer Gynt Suite No. 1, Op. 46 - I. Morning Mood (Musopen Symphony).flac', title: 'Morning Mood (Peer Gynt)', alt: ['Morning Mood', 'Morning'], composer: 'Edvard Grieg', year: 1875, d: 1, maxStart: 40 },
  { file: 'File:Grieg - Peer Gynt Suite No. 1, Op. 46 - IV. In the Hall of the Mountain King (Musopen Symphony).flac', title: 'In the Hall of the Mountain King', composer: 'Edvard Grieg', year: 1875, d: 1, maxStart: 60 },
  { file: "File:Grieg - Peer Gynt Suite No. 1, Op. 46 - III. Anitra's Dance (Musopen Symphony).flac", title: "Anitra's Dance (Peer Gynt)", alt: ["Anitra's Dance"], composer: 'Edvard Grieg', year: 1875, d: 3, maxStart: 60 },
  { file: 'File:"An der schönen, blauen Donau", performed by the US Marine Band.mp3', title: 'The Blue Danube', alt: ['Blue Danube', 'An der schönen blauen Donau'], composer: 'Johann Strauss II', year: 1866, d: 1, minStart: 35, maxStart: 120 },
  { file: 'File:ELGAR Pomp and Circumstance in D, Opus 39, No. 1 - United States Marine Band.mp3', title: 'Pomp and Circumstance March No. 1', alt: ['Pomp and Circumstance', 'Land of Hope and Glory'], composer: 'Edward Elgar', year: 1901, d: 2, maxStart: 60 },
  { file: 'File:Clair de Lune - Wright Brass - United States Air Force Band of Flight.mp3', title: 'Clair de lune', composer: 'Claude Debussy', year: 1905, d: 2, maxStart: 40 },
  { file: 'File:Canon (2004) - Strolling Strings - United States Air Force Band.mp3', title: 'Canon in D', alt: ["Pachelbel's Canon"], composer: 'Johann Pachelbel', year: 1690, d: 1, minStart: 20, maxStart: 90 },
  { file: 'File:Mozart - Requiem (Krips) - VIII. Lacrimosa.flac', title: 'Requiem: Lacrimosa', alt: ['Lacrimosa', 'Requiem'], composer: 'Wolfgang Amadeus Mozart', year: 1791, d: 2, maxStart: 60 },
  { file: 'File:PDP-CH - Royal Choral Society - Malcolm Sargent - Messiah - Hallelujah Chorus - Electrola-ej39-04871.flac', title: 'Hallelujah Chorus (Messiah)', alt: ['Hallelujah Chorus', 'Hallelujah', 'Messiah'], composer: 'George Frideric Handel', year: 1741, d: 1, minStart: 5, maxStart: 60 },
  { file: 'File:Pyotr Ilyich Tchaikovsky- Swan Lake- Extract from Act 4.flac', title: 'Swan Lake', composer: 'Pyotr Ilyich Tchaikovsky', year: 1876, d: 2, maxStart: 60 },
  { file: 'File:Tchaikovsky - Nutcracker Suite - Russian Dance - Philip Milman - Lud and Schlatts Musical Emporium.wav', title: 'Russian Dance (The Nutcracker)', alt: ['Russian Dance', 'Trepak', 'The Nutcracker'], composer: 'Pyotr Ilyich Tchaikovsky', year: 1892, d: 2, maxStart: 40 },
  { file: 'File:PDP-CH - Philadelphia Orchestra - Leopold Stokowski - Nutcracker Suite, Opus 71A - Tchaikovsky - Waltz of the Flowers, Part 1 - Hmv-db2542-2a87004.flac', title: 'Waltz of the Flowers (The Nutcracker)', alt: ['Waltz of the Flowers'], composer: 'Pyotr Ilyich Tchaikovsky', year: 1892, d: 2, minStart: 60, maxStart: 150 },
  { file: 'File:Brandenburg Concerto No. 4 in G, Movement I (Allegro), BWV 1049 (ISRC USUAN1100303).mp3', title: 'Brandenburg Concerto No. 4', alt: ['Brandenburg Concerto'], composer: 'Johann Sebastian Bach', year: 1721, d: 3, maxStart: 60 },
  { file: 'File:Vivaldi The Four Seasons, Op. 8 - The Modena Chamber Orchestra - Violin Concerto in F major RV 293 Autumn.mp3', title: 'Autumn (The Four Seasons)', alt: ['Autumn', 'The Four Seasons'], composer: 'Antonio Vivaldi', year: 1725, d: 2, maxStart: 40 },
  { file: 'File:PDP-CH - Royal Albert Hall Orchestra - Landon Ronald - Symphony No. 9, in E minor, op. 95 - 2nd Movement, Largo, 3rd record - Antonín Dvořák - Hmv-d1252-5-0518.flac', title: 'Symphony No. 9 "From the New World": Largo', alt: ['New World Symphony', 'Largo'], composer: 'Antonín Dvořák', year: 1893, d: 3, maxStart: 60 },
  { file: 'File:Cello Suite -1 in G - Prelude (ISRC USUAN1100298).mp3', title: 'Cello Suite No. 1: Prelude', alt: ['Cello Suite No. 1', 'Cello Suite'], composer: 'Johann Sebastian Bach', year: 1720, yearNote: 'c.', d: 2, maxStart: 30 },
  { file: 'File:Habanera (ISRC USUAN1100656).mp3', title: 'Habanera (Carmen)', alt: ['Habanera', 'Carmen'], composer: 'Georges Bizet', year: 1875, d: 2, minStart: 10, maxStart: 60 },
  { file: 'File:Bach; Chaconne d-moll Heifetz.flac', title: 'Chaconne in D minor (Partita No. 2)', alt: ['Chaconne'], composer: 'Johann Sebastian Bach', year: 1720, d: 3, maxStart: 40 },
];

// textbook period of each composer; Debussy (impressionist) has none
const ERA = {
  'Johann Sebastian Bach': 'Baroque', 'George Frideric Handel': 'Baroque', 'Antonio Vivaldi': 'Baroque', 'Johann Pachelbel': 'Baroque',
  'Wolfgang Amadeus Mozart': 'Classical', 'Edvard Grieg': 'Romantic', 'Johann Strauss II': 'Romantic', 'Pyotr Ilyich Tchaikovsky': 'Romantic',
  'Antonín Dvořák': 'Romantic', 'Georges Bizet': 'Romantic', 'Edward Elgar': 'Romantic',
};

async function classical() {
  const info = await audioInfo(CLASSICAL.map((c) => c.file));
  const items = [], dropped = [];
  for (const c of CLASSICAL) {
    const a = info[c.file];
    if (!a || !a.src || !okLicence(a.license)) { dropped.push(`${c.title}: ${a ? a.license || 'no transcode' : 'missing'}`); continue; }
    if (!(await headOk(a.src))) { dropped.push(`${c.title}: not reachable`); continue; }
    items.push({
      id: slug(c.title).slice(0, 50), name: c.title, alt: c.alt, group: c.composer,
      facts: { composer: c.composer, year: c.year, ...(ERA[c.composer] ? { era: ERA[c.composer] } : {}) },
      blurb: `${c.title} by ${c.composer} (${c.yearNote ? c.yearNote + ' ' : ''}${c.year}). Recording: ${a.credit}.`,
      media: { audio: [audioObj(a, { minStart: c.minStart ?? 2, maxStart: c.maxStart })] },
      difficulty: c.d,
    });
  }
  write({
    id: 'classical-recordings', title: 'Classical recordings', theme: 'music', icon: '🎻', kids: false, version: 1,
    factsMeta: { composer: { type: 'cat', label: 'Composer', ask: 'Who composed {name}?', askReverse: 'Which of these pieces is by {value}?', stmt: '{name} was composed by {value}.' },
      year: { type: 'year', label: 'Written', higherLabel: 'Later', askHigh: 'Which of these pieces was written most recently?', askLow: 'Which of these pieces was written first?', askNumber: 'In what year was {name} written?' },
      era: { type: 'cat', label: 'Period', values: ['Baroque', 'Classical', 'Romantic'], ask: 'Which period of music is {name} from?', askReverse: 'Which of these is from the {value} period?', stmt: '{name} is from the {value} period.' } },
    items, questions: [],
    sources: [{ name: 'Wikimedia Commons (Musopen, US military bands, PDP-CH and CC BY recordings; licence per file)', url: 'https://commons.wikimedia.org' }],
  }, dropped);
}

function write(pack, dropped) {
  pack.built = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(path.join(OUT, pack.id + '.json'), JSON.stringify(pack, null, 1));
  console.log(`${pack.id}: ${pack.items.length} items`);
  dropped.forEach((d) => console.log('  DROP ' + d));
}

const which = process.argv[2];
if (!which || which === 'anthems') await anthems();
if (!which || which === 'instruments') await instruments();
if (!which || which === 'classical') await classical();
