#!/usr/bin/env node
// Lane DIRECTORS: data/packs/directors.json from tools/c2_src/directors.mjs, plus each movie-moments film's
// "who directed it" level (item.factLv.director, read by mc's picture question).
//   node tools/c2_directors.mjs     rebuild the pack + patch movie-moments.json (then build_index, local_tags)
// Checks (a failed check drops the fact, the film or the director):
//   - the Wikipedia title is a human on Wikidata whose sex matches the He/She of the last clue
//   - born: Wikidata P569 within a year AND the year in the Wikipedia lead; died: P570, kept when the lead has it
//   - films: a Wikidata film with this person as director (P57) whose English label or alias matches (year from P577)
//   - "Who directed X?" uses a movies.json film only when Wikidata agrees with the movies pack's director credit
//   - clue numbers must appear in the article text (hand-check list in tools/c2_reports/directors.txt)
// Difficulty = fame: English Wikipedia pageviews (Sep 2025 – Aug 2026) as a percentile, then DIRECTORS_LEVEL.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, PACKS, fetchJSON, sparql, wpQids, wdEntities, claims, wdYear, commonsImages, writePack, slug, leaks, rng, sample } from './c2_lib.mjs';
import { wpLeads, wpInfobox, ibField, QID_ISO, demonymIsos } from './c2_screen_lib.mjs';
import { valueIsos } from './local_tags.mjs';
import { DIRECTORS, DIRECTORS_IMG, DIRECTORS_LEVEL } from './c2_src/directors.mjs';

const PV = ['2025090100', '2026083100'];
const T1 = 0.7, T2 = 0.35;
const SPLIT = /\s*,\s*|\s+and\s+|\s*&\s*/i;
const credits = v => String(v || '').split(SPLIT).map(s => s.trim()).filter(Boolean);
const normT = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, 'and').replace(/^the\s+/, '').replace(/[^a-z0-9]+/g, '');
const normN = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]+/g, '');
const hasYear = (text, y) => new RegExp(`(?<![\\d,.])${y}(?![\\d])`).test(text);
const EXTRA = { Q174193: ['GBR', 'IRL'], Q161885: ['GBR'], Q179876: ['GBR'], Q15180: ['RUS', 'UKR', 'GEO', 'LVA'], Q28513: ['AUT', 'CZE', 'HUN', 'POL'], Q33946: ['CZE'], Q8646: ['HKG', 'CHN'], Q148: ['CHN', 'HKG'], Q865: ['TWN'], Q713750: ['DEU'], Q16957: ['DEU'], Q43287: ['DEU'] };
const citIsos = ent => [...new Set(claims(ent, 'P27').flatMap(v => EXTRA[v.id] || [QID_ISO[v.id]]).filter(Boolean))];

export const DIRECTOR_META = {
  born: { type: 'year', label: 'Born', higherLabel: 'Born later', askHigh: 'Which of these directors was born most recently?', askLow: 'Which of these directors was born first?' },
  died: { type: 'year', label: 'Died', higherLabel: 'Died later', askHigh: 'Which of these directors died most recently?', askLow: 'Which of these directors died first?' },
  nationality: { type: 'cat', label: 'Nationality', exclusive: false, ask: 'What nationality is {name}?', stmt: '{name}’s nationality: {value}.' },
  era: { type: 'cat', label: 'Born in', ask: 'When was {name} born?', stmt: '{name} was born in the {value}.', askReverse: 'Which of these directors was born in the {value}?' },
  films: { type: 'text', label: 'Known for' },
};

async function pageviews(title) {
  try {
    const j = await fetchJSON(`https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia.org/all-access/user/${encodeURIComponent(title.replace(/ /g, '_'))}/monthly/${PV[0]}/${PV[1]}`);
    return (j.items || []).reduce((s, x) => s + x.views, 0);
  } catch { return 0; }
}
async function articleText(title) {
  const j = await fetchJSON('https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&redirects=1&format=json&formatversion=2&titles=' + encodeURIComponent(title));
  return j.query.pages[0]?.extract || '';
}

export function parseRows(text = DIRECTORS) {
  return text.trim().split('\n').map(l => {
    const [title, name, born, nat, films, clues, alt] = l.split('|');
    return { title, name, born: born === '' ? null : +born, nat, films: films.split(';').map(s => s.trim()), clues: clues.split(';'), alt: alt ? alt.split(';') : [] };
  });
}

// Every film each director directed on Wikidata: qid -> [{ labels: Set(normalised), year }]
async function filmography(qids) {
  const out = {};
  for (let i = 0; i < qids.length; i += 40) {
    const rows = await sparql(`SELECT ?d ?film (SAMPLE(?l) AS ?label) (GROUP_CONCAT(DISTINCT ?a; separator="|") AS ?alts) (MIN(YEAR(?date)) AS ?y) WHERE {
      VALUES ?d { ${qids.slice(i, i + 40).map(q => 'wd:' + q).join(' ')} }
      ?film wdt:P57 ?d . ?film rdfs:label ?l . FILTER(LANG(?l) = "en")
      OPTIONAL { ?film skos:altLabel ?a . FILTER(LANG(?a) = "en") }
      OPTIONAL { ?film wdt:P577 ?date }
    } GROUP BY ?d ?film`);
    for (const r of rows) {
      const d = r.d.replace(/^.*\//, '');
      (out[d] ||= []).push({ qid: r.film.replace(/^.*\//, ''), label: r.label, labels: new Set([r.label, ...(r.alts ? r.alts.split('|') : [])].map(normT)), year: r.y ? +r.y : null });
    }
  }
  return out;
}
// Second source when Wikidata lacks the credit: the director line of the film's Wikipedia infobox.
async function infoboxSays(name, year, dir) {
  const last = normN(dir.split(' ').at(-1));
  for (const t of [`${name} (${year} film)`, `${name} (film)`, name]) {
    let wt = '';
    try { wt = await wpInfobox(t); } catch { continue; }
    if (!/\{\{\s*Infobox film/i.test(wt)) continue;
    const y = /released\s*=([\s\S]{0,400})/i.exec(wt)?.[1] || '';
    if (year != null && !new RegExp(`\\b(${year - 1}|${year}|${year + 1})\\b`).test(y)) continue;
    return normN(ibField(wt, 'director')).includes(last);
  }
  return false;
}
const findFilm = (list, name, year) => (list || []).find(f => f.labels.has(normT(name)) && (year == null || f.year == null || Math.abs(f.year - year) <= 1));

const levelOf = s => (s >= T1 ? 1 : s >= T2 ? 2 : 3);
const decade = y => `${Math.floor(y / 10) * 10}s`;

export async function buildDirectors(note = console.log) {
  const rows = parseRows();
  const q = await wpQids(rows.map(r => r.title));
  const ents = await wdEntities(Object.values(q).filter(Boolean));
  const leads = await wpLeads(rows.map(r => r.title));
  const ok = [];
  const ids = new Set();
  for (const r of rows) {
    const drop = why => note(`DROPPED ${r.name}: ${why}`);
    r.qid = q[r.title];
    const e = ents[r.qid];
    if (!e) { drop('not on Wikidata'); continue; }
    // Wikidata vandalism happens (Jeunet's P31 read "Nero Inc" in Oct 2026): a birth date plus a Wikipedia lead about a director will do
    if (!claims(e, 'P31').some(v => v.id === 'Q5')) {
      if (!claims(e, 'P569').length || !/\b(film ?maker|director)\b/i.test(leads[r.title] || '')) { drop('not a human on Wikidata'); continue; }
      note(`human by Wikipedia lead (Wikidata P31 is ${claims(e, 'P31').map(v => v.id).join(',')}): ${r.name}`);
    }
    const g = /^She\b/.test(r.clues.at(-1)) ? 'f' : /^He\b/.test(r.clues.at(-1)) ? 'm' : null;
    if (!g) { drop('last clue has no He/She'); continue; }
    const sex = claims(e, 'P21').map(v => v.id);
    if (sex.length && !sex.includes(g === 'f' ? 'Q6581072' : 'Q6581097')) { drop(`sex: clue ${g}, Wikidata ${sex.join(',')}`); continue; }
    r.id = slug(r.name);
    if (ids.has(r.id)) { drop(`duplicate id ${r.id}`); continue; }
    r.wpTitle = e.sitelinks?.enwiki?.title || r.title;
    const lead = (leads[r.title] || '').slice(0, 700);
    const by = claims(e, 'P569').map(wdYear).filter(v => v != null);
    if (r.born != null) {
      const wd = by.find(y => Math.abs(y - r.born) <= 1);
      if (wd == null) { note(`born dropped ${r.name}: mine ${r.born}, Wikidata ${by.join(',') || '-'}`); r.born = null; }
      else if (!hasYear(lead, r.born)) { note(`born dropped ${r.name}: ${r.born} not in the Wikipedia lead`); r.born = null; }
    }
    const dy = claims(e, 'P570').map(wdYear).filter(v => v != null);
    r.died = dy.length && hasYear(lead, dy[0]) ? dy[0] : null;
    if (dy.length && r.died == null) note(`died left out ${r.name}: Wikidata ${dy.join(',')}, not in the Wikipedia lead`);
    const mine = [...new Set([...valueIsos(r.nat), ...demonymIsos(r.nat)])], wd = citIsos(e);
    if (mine.length && wd.length && !mine.some(i => wd.includes(i))) note(`nationality check ${r.name}: mine ${r.nat} (${mine.join(',')}), Wikidata ${wd.join(',')}`);
    if (!mine.length) note(`nationality unmapped for local tags: ${r.name} (${r.nat})`);
    r.imgFile = r.id in DIRECTORS_IMG ? DIRECTORS_IMG[r.id] || null : claims(e, 'P18')[0];
    r.gender = g;
    ids.add(r.id);
    ok.push(r);
  }
  const films = await filmography(ok.map(r => r.qid));
  for (const r of ok) {
    r.filmog = films[r.qid] || [];
    r.verified = [];
    for (const t of r.films) {
      const f = findFilm(r.filmog, t);
      if (f) r.verified.push({ name: t, year: f.year, qid: f.qid });
      else if (await infoboxSays(t, null, r.name)) { note(`film confirmed by Wikipedia infobox only (not Wikidata P57): ${r.name} — ${t}`); r.verified.push({ name: t, year: null, qid: 'wp:' + normT(t), wpOnly: true }); }
      else note(`film not confirmed: ${r.name} — ${t}`);
    }
  }
  for (const r of ok) {
    const text = await articleText(r.title);
    for (const c of r.clues) for (const n of c.match(/\b\d[\d,]*\b/g) || []) if (!text.includes(n) && !text.includes(n.replace(/,/g, ''))) note(`clue number not in article ${r.name}: "${n}" in: ${c}`);
  }
  const imgs = await commonsImages(ok.map(r => r.imgFile).filter(Boolean), { maxDim: 640 });
  for (const r of ok) {
    const m = imgs[r.imgFile?.replace(/_/g, ' ')];
    if (m?.rejected) note(`portrait licence rejected ${r.name}: ${m.rejected}`);
    r.img = m && !m.rejected ? [m] : [];
    if (!r.img.length) note(`no portrait: ${r.name}`);
  }
  for (const r of ok) r.pv = await pageviews(r.wpTitle);
  const sorted = ok.map(r => r.pv).sort((a, b) => a - b);
  for (const r of ok) {
    r.score = sorted.filter(v => v < r.pv).length / Math.max(1, sorted.length - 1);
    r.d = levelOf(r.score);
    if (DIRECTORS_LEVEL[r.id] && DIRECTORS_LEVEL[r.id] !== r.d) { note(`level by hand ${r.name}: fame ${r.d} -> ${DIRECTORS_LEVEL[r.id]}`); r.d = DIRECTORS_LEVEL[r.id]; }
  }
  const items = ok.map(r => toItem(r, note));
  const pack = {
    id: 'directors', title: 'Directors', theme: 'people', icon: '🎥', kids: false, version: 1, noun: 'director',
    imgPrompt: 'Which of these is {name}?', nameImgPrompt: 'Who is this?', tfImgPrompt: 'This is {name}.',
    factsMeta: DIRECTOR_META, items, questions: [],
    sources: [
      { name: 'Wikidata (dates, filmographies, portraits)', url: 'https://www.wikidata.org' },
      { name: 'Wikimedia Commons (portraits, licence-checked)', url: 'https://commons.wikimedia.org' },
      { name: 'Wikipedia (birth years, clue checks)', url: 'https://en.wikipedia.org' },
    ],
  };
  const filmsAll = await filmTable(ok, note);
  for (const r of ok) personQuestions(pack, r, ok);
  directedQuestions(pack, ok, filmsAll, note);
  for (const r of ok) note(`fame ${r.name}: d${r.d} score ${r.score.toFixed(2)} (${r.pv} views)`);
  return { pack, rows: ok, films: filmsAll };
}

function toItem(r, note) {
  const names = [r.name, ...r.alt];
  const v = r.verified.map(f => f.name).filter(t => !leaks(t, names));
  const auto = [r.born != null && `Born in ${r.born}.`, r.nat && `Nationality: ${r.nat}.`, v.length >= 2 && `Films include ${v[0]} and ${v[1]}.`].filter(Boolean);
  const hand = r.clues.map(c => c + '.');
  const clues = [...hand.slice(0, -1), ...auto, hand.at(-1)].filter(c => !leaks(c, names) || (note(`clue leaks the name, dropped ${r.name}: ${c}`), false));
  if (clues.at(-1) !== hand.at(-1)) note(`LAST CLUE LOST ${r.name}`);
  if (clues.length < 5) note(`few clues ${r.name}: ${clues.length}`);
  const facts = { born: r.born ?? undefined, died: r.died ?? undefined, nationality: r.nat, era: r.born != null ? decade(r.born) : undefined };
  if (r.verified.length) facts.films = r.verified.map(f => f.name).join(', ');
  const life = r.born != null ? ` (${r.born}${r.died != null ? '–' + r.died : ''})` : '';
  return {
    id: r.id, name: r.name, alt: r.alt, group: facts.era || 'unknown', facts,
    blurb: `${r.name}${life}: ${r.clues.at(-1).replace(/^(He|She) (was|is) /, '').replace(/^(He|She) /, '')}.`.replace(/: ([a-z])/, (m, c) => ': ' + c.toUpperCase()),
    clues, media: { img: r.img }, difficulty: r.d, gender: r.gender,
  };
}

// Films for the "who directed" questions: movies.json films whose credited director (or co-director) is in the pack and
// Wikidata agrees, plus the hand-listed notable films (Wikidata-verified). One row per film.
async function filmTable(ok, note) {
  const movies = JSON.parse(readFileSync(join(PACKS, 'movies.json'), 'utf8'));
  const byName = new Map(ok.map(r => [normN(r.name), r]));
  const out = new Map();
  for (const m of movies.items) {
    const cs = credits(m.facts.director);
    const ds = cs.map(c => byName.get(normN(c))).filter(Boolean);
    if (!ds.length) continue;
    if (ds.length > 1) { note(`film skipped, two pack directors credited: ${m.name} (${m.facts.director})`); continue; }
    const r = ds[0];
    const f = findFilm(r.filmog, m.name, m.facts.year) || findFilm(r.filmog, m.name.replace(/\s*\(\d{4}\)$/, ''), m.facts.year);
    const key = f ? f.qid : 'wp:' + normT(m.name);
    if (!f) {
      if (!(await infoboxSays(m.name.replace(/\s*\(\d{4}\)$/, ''), m.facts.year, r.name))) { note(`movies.json credit NOT confirmed (Wikidata or Wikipedia): ${m.name} (${m.facts.year}) — ${r.name}`); continue; }
      note(`movies.json credit confirmed by Wikipedia infobox only: ${m.name} (${m.facts.year}) — ${r.name}`);
    }
    out.set(key, { name: m.name.replace(/\s*\(\d{4}\)$/, ''), year: m.facts.year, dir: r, co: cs.filter(c => normN(c) !== normN(r.name)), d: m.difficulty || 2, kids: m.facts.kids === true, ref: `movies/${m.id}`, movie: true });
  }
  for (const r of ok) for (const v of r.verified) {
    if (out.has(v.qid) || v.year == null) continue;
    out.set(v.qid, { name: v.name, year: v.year, dir: r, co: [], d: null, kids: false, movie: false });
  }
  return [...out.values()];
}

function personQuestions(pack, r, ok) {
  const R = rng('directors+' + r.id);
  const it = pack.items.find(i => i.id === r.id);
  const pool = ok.filter(x => x !== r && x.gender === r.gender && x.born != null && r.born != null && Math.abs(x.born - r.born) <= 25);
  const wrong = sample(R, pool.length >= 3 ? pool : ok.filter(x => x !== r && x.gender === r.gender), 3).map(x => x.name);
  pack.questions.push({ id: `who-${r.id}`, kind: 'mc', prompt: `Who is this? ${it.clues.at(-1)}`, answer: r.name, wrong, explain: it.blurb, difficulty: r.d, refs: [`directors/${r.id}`] });
  if (r.born != null) {
    const w = sample(R, [-30, -20, -10, 10, 20, 30].map(d => r.born + d).filter(y => y <= 2010), 3).map(String);
    pack.questions.push({ id: `born-${r.id}`, kind: 'mc', prompt: `In which year was ${r.name} born?`, answer: String(r.born), wrong: w, explain: it.blurb, difficulty: 3, refs: [`directors/${r.id}`] });
  }
}

// span of years a director was making the films we know
const spanOf = (r, films) => { const ys = films.filter(f => f.dir === r).map(f => f.year); return ys.length ? [Math.min(...ys), Math.max(...ys)] : r.born ? [r.born + 30, r.born + 60] : [1900, 2026]; };
const gap = ([a, b], y) => (y < a ? a - y : y > b ? y - b : 0);
// a famous director with a well-known film is easy; a famous film by a lesser-known director is not; else the average, rounded up
const filmLevel = f => (f.dir.d === 1 && (f.d ?? 2) <= 2 ? 1 : Math.ceil(((f.d ?? 2) + f.dir.d) / 2));
// film industries, so wrong names come from the same world (a Hollywood film gets Hollywood names)
const industry = nat => (/American|English|British|Scottish|Irish|Canadian|Australian|New Zealander|Mexican/.test(nat) ? 'en' : /Japanese|Chinese|Korean|Hong Kong|Taiwanese/.test(nat) ? 'asia' : /Indian/.test(nat) ? 'in' : 'eu');
const kidsFlag = f => (f.kids ? {} : { kids: false });

function directedQuestions(pack, ok, films, note) {
  const spans = new Map(ok.map(r => [r, spanOf(r, films)]));
  // family-film makers (Pixar, Disney, Ghibli) are offered for family films, and the rest for the rest
  const family = new Map(ok.map(r => { const fs = films.filter(f => f.dir === r && f.movie); return [r, fs.length > 0 && fs.filter(f => f.kids).length * 2 >= fs.length]; }));
  let nDir = 0, nFilm = 0;
  for (const f of films) {
    const R = rng('directed+' + f.name + f.year);
    const banned = new Set([f.dir, ...f.co.map(c => ok.find(r => normN(r.name) === normN(c))).filter(Boolean)]);
    const lv = filmLevel(f);
    // closest careers first; a well-known film gets well-known wrong names, a hard one any of the era
    const ind = industry(f.dir.nat);
    const cands = ok.filter(r => !banned.has(r)).map(r => ({ r, s: gap(spans.get(r), f.year) + (industry(r.nat) === ind ? 0 : 8) + (family.get(r) === f.kids ? 0 : 6) + (lv === 1 ? 4 * Math.max(0, r.d - 1) : 0) + R() * 3 }))
      .sort((a, b) => a.s - b.s).slice(0, 8);
    const wrong = sample(R, cands, 5).map(c => c.r.name);
    pack.questions.push({
      id: `dir-${slug(f.name)}-${f.year}`, kind: 'mc', prompt: `Who directed ${f.name} (${f.year})?`, answer: f.dir.name, wrong,
      explain: `${f.name} (${f.year}) was directed by ${f.dir.name}${f.co.length ? ` with ${f.co.join(' and ')}` : ''}.`,
      difficulty: lv, refs: [`directors/${f.dir.id}`], ...kidsFlag(f),
    });
    nDir++;
  }
  for (const r of ok) {
    const mine = films.filter(f => f.dir === r).sort((a, b) => filmLevel(a) - filmLevel(b) || (b.movie - a.movie));
    const own = new Set((r.filmog || []).flatMap(f => [...f.labels]));
    for (const f of mine.slice(0, 2)) {
      const R = rng('films+' + r.id + f.name);
      const lv = filmLevel(f), ind = industry(r.nat);
      let others = films.filter(o => o.dir !== r && !o.co.some(c => normN(c) === normN(r.name)) && !own.has(normT(o.name)) && Math.abs(o.year - f.year) <= 10 && o.name !== f.name);
      // an easy question offers well-known films; every level prefers films from the same industry
      const famous = others.filter(o => o.movie && filmLevel(o) <= lv + 1);
      if (famous.length >= 4) others = famous;
      const score = o => Math.abs(o.year - f.year) + (industry(o.dir.nat) === ind ? 0 : 6) + R() * 6;
      const near = others.map(o => [o, score(o)]).sort((a, b) => a[1] - b[1]).map(x => x[0]).slice(0, 10);
      if (near.length < 3) { note(`film question skipped (too few films of the era): ${r.name} — ${f.name}`); continue; }
      const wrong = [...new Set(sample(R, near, 5).map(o => o.name))];
      pack.questions.push({
        id: `films-${r.id}-${slug(f.name)}`, kind: 'mc', prompt: `Which of these films did ${r.name} direct?`, answer: f.name, wrong,
        explain: `${r.name} directed ${f.name} (${f.year}).`, difficulty: filmLevel(f), refs: [`directors/${r.id}`], ...kidsFlag(f),
      });
      nFilm++;
    }
  }
  note(`questions: ${nDir} who-directed, ${nFilm} which-film`);
}

// movie-moments: factLv.director = how hard "who directed this film?" is (filmLevel: the film's and the director's fame), only for
// films whose lead director is in the directors pack. mv_build.mjs calls this too.
export function directorLevels(items, dirPack = JSON.parse(readFileSync(join(PACKS, 'directors.json'), 'utf8'))) {
  const byName = new Map(dirPack.items.map(it => [normN(it.name), it]));
  let n = 0;
  for (const it of items) {
    delete it.factLv;
    const ds = credits(it.facts?.director).map(c => byName.get(normN(c))).filter(Boolean);
    if (ds.length !== 1) continue;
    it.factLv = { director: filmLevel({ d: it.difficulty || 2, dir: { d: ds[0].difficulty || 2 } }) };
    n++;
  }
  return n;
}
export const DIRECTOR_PICTURE = { askImg: 'Who directed this film?', near: 'year', levelled: true };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = [];
  const { pack } = await buildDirectors(s => report.push(s));
  writePack(pack);
  (await import('./c2_gender.mjs')).run();
  const mmFile = join(PACKS, 'movie-moments.json');
  const mm = JSON.parse(readFileSync(mmFile, 'utf8'));
  Object.assign(mm.factsMeta.director, DIRECTOR_PICTURE);
  const n = directorLevels(mm.items);
  writeFileSync(mmFile, JSON.stringify(mm, null, 1) + '\n');
  report.push(`movie-moments: ${n} of ${mm.items.length} films have a pack director (factLv.director)`);
  writeFileSync(join(ROOT, 'tools/c2_reports/directors.txt'), report.join('\n') + '\n');
  console.log(report.filter(l => !/^fame /.test(l)).join('\n'));
}
