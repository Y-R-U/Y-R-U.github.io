// Builds the movies pack: top film of each year 1975-2025 (Wikipedia year list) + decade top 10s.
import { writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, fetchJSON, wdEntities, wpQids, claims, label, writePack, slug, leaks, rng, sample, wikiquoteCheck, parseHtmlTable } from './c2_lib.mjs';
import { FILMS } from './c2_src/films.mjs';

const report = [];
const note = s => report.push(s);
const money = s => { const m = (s || '').match(/\$([\d,]+)/); return m ? +m[1].replace(/,/g, '') : null; };
const section = async (page, idx) => (await fetchJSON(`https://en.wikipedia.org/w/api.php?action=parse&page=${page}&prop=text&section=${idx}&format=json&formatversion=2`)).parse.text;
const sectionIndex = async (page, re) => (await fetchJSON(`https://en.wikipedia.org/w/api.php?action=parse&page=${page}&prop=sections&format=json&formatversion=2`)).parse.sections.find(s => re.test(s.line))?.index;

const raw = [];
const hrefTitle = h => h ? decodeURIComponent(h).replace(/_/g, ' ') : null;
// Year list: first figure is the lifetime worldwide gross (including re-releases).
const yearIdx = await sectionIndex('List_of_highest-grossing_films', /by year/i);
for (const r of parseHtmlTable(await section('List_of_highest-grossing_films', yearIdx))) {
  const y = +r[0]?.text;
  if (y >= 1975 && y <= 2025) raw.push({ title: r[1].text, href: hrefTitle(r[1].href), year: y, topOfYear: true, gross: money(r[2].text), src: 'Wikipedia: List of highest-grossing films (by year)' });
}
// Decade lists (1970s list is US/Canada only, so its figures are not used as worldwide gross).
for (const d of ['1970s', '1980s', '1990s', '2000s', '2010s', '2020s']) {
  const idx = await sectionIndex(`${d}_in_film`, /grossing/i);
  const rows = parseHtmlTable(await section(`${d}_in_film`, idx)).filter(r => /^\d+$/.test(r[0]?.text));
  let rank = 0;
  for (const r of rows) {
    const year = +r.find(c => /^(19|20)\d\d$/.test(c.text))?.text;
    if (year > 2025) continue; // decade still running: keep finished years only
    if (++rank > 10) break;
    raw.push({ title: r[1].text, href: hrefTitle(r[1].href), year, decadeRank: rank, decade: d, gross: d !== '1970s' ? money(r.find(c => c.text.startsWith('$'))?.text) : null, src: `Wikipedia: ${d} in film` });
  }
}
const rq = await wpQids(raw.map(r => r.href || r.title));
const films = {};
for (const r of raw) {
  const key = rq[r.href || r.title] || r.title;
  const f = films[key] ??= { title: r.title, href: r.href, year: r.year, qid: rq[r.href || r.title] };
  if (f.year !== r.year) note(`year mismatch ${f.title}: ${f.year} vs ${r.year} (${r.src})`);
  if (r.topOfYear) f.topOfYear = r.year;
  if (r.decadeRank) { f.decadeRank = r.decadeRank; f.decade = r.decade; }
  if (r.gross) {
    if (f.gross && Math.abs(f.gross - r.gross) / r.gross > 0.02) note(`gross differs ${f.title}: ${f.gross} (${f.grossSource}) vs ${r.gross} (${r.src}) -> keeping larger (lifetime)`);
    if (!f.gross || r.gross > f.gross) { f.gross = r.gross; f.grossSource = r.src; }
  }
}

// Hand details
const hand = Object.fromEntries(FILMS.trim().split('\n').map(l => {
  const [title, kids, difficulty, emoji, quote, clues] = l.split('|');
  return [title, { kids: kids === '1', difficulty: +difficulty, emoji, quote, clues: clues.split(';') }];
}));
// Same title, different films (The Lion King 1994/2019): the later one gets its year appended.
const byTitle = {};
for (const f of Object.values(films)) (byTitle[f.title] ??= []).push(f);
for (const fs of Object.values(byTitle)) if (fs.length > 1) fs.sort((x, y) => x.year - y.year).slice(1).forEach(f => { f.title = `${f.title} (${f.year})`; });
const list = Object.values(films);
for (const f of list) if (!hand[f.title]) note(`NO HAND DATA for ${f.title} (${f.year}) -> dropped`);
const usable = list.filter(f => hand[f.title]);

// Wikidata: director, cross-check year and box office.
const ents = await wdEntities(usable.map(f => f.qid));
const dirIds = new Set();
for (const f of usable) { f.ent = ents[f.qid]; for (const d of claims(f.ent, 'P57')) dirIds.add(d.id); }
const dirs = await wdEntities([...dirIds], 'labels');
for (const f of usable) {
  if (!f.ent) { note(`no wikidata for ${f.title}`); continue; }
  f.directors = claims(f.ent, 'P57').map(d => label(dirs[d.id])).filter(Boolean);
  const pubYears = claims(f.ent, 'P577').map(v => +v.time.slice(1, 5));
  if (pubYears.length && !pubYears.includes(f.year)) note(`release year ${f.title}: table ${f.year}, wikidata ${pubYears.join(',')}`);
  const wdBox = Math.max(0, ...(f.ent.claims.P2142 || []).map(c => +c.mainsnak.datavalue?.value?.amount || 0));
  if (wdBox && f.gross && Math.abs(wdBox - f.gross) / f.gross > 0.1) note(`box office ${f.title}: used ${f.gross}, wikidata max ${wdBox}`);
}

// Quotes: keep only those found on the film's Wikiquote page.
for (const f of usable) {
  const h = hand[f.title];
  if (!h.quote) continue;
  if (h.quote.split(/\s+/).length > 10) { note(`quote too long ${f.title}`); continue; }
  if (leaks(h.quote, [f.title.replace(/\s*\(\d{4}\)$/, '')], ['star', 'wars', 'king', 'story', 'harry', 'potter', 'lord', 'rings'])) { note(`quote leaks title ${f.title}`); }
  const base = f.href || f.title;
  const res = await wikiquoteCheck([base, f.title, `${f.title} (film)`, `${f.title} (${f.year} film)`], h.quote);
  if (res.ok) { f.quote = h.quote; f.quoteSource = res.url; } else note(`quote NOT verified ${f.title}: ${h.quote}${res.heading ? ' (in ' + res.heading + ')' : ''}`);
}

const fmtMoney = n => n >= 1e9 ? `$${(n / 1e9).toFixed(2)} billion` : `$${Math.round(n / 1e6)} million`;
const items = usable.filter(f => f.ent).map(f => {
  const h = hand[f.title];
  const name = f.title;
  const decade = `${Math.floor(f.year / 10) * 10}s`;
  const auto = [
    f.gross && `It took about ${fmtMoney(f.gross)} at the worldwide box office.`,
    `It was released in ${f.year}.`,
    f.topOfYear && `It was the highest-grossing film of ${f.year}.`,
    f.directors?.length && `It was directed by ${f.directors.join(' and ')}.`,
  ].filter(Boolean);
  const clues = [auto[0], ...h.clues.slice(0, -2).map(c => c + '.'), ...auto.slice(1), ...h.clues.slice(-2).map(c => c + '.')].filter(Boolean)
    .filter(c => !leaks(c, [name], ['star', 'wars', 'king', 'story', 'movie', 'part', 'the', 'and', 'kimetsu', 'yaiba']) || /directed by|released in|highest-grossing/.test(c));
  return {
    id: slug(f.title), name, alt: altNames(f.title), group: decade,
    facts: {
      year: f.year, boxOfficeUSD: f.gross || undefined, director: f.directors?.join(' and ') || undefined, decade,
      topOfYear: !!f.topOfYear, decadeRank: f.decade !== '1970s' ? f.decadeRank : undefined, kids: h.kids || undefined,
    },
    quote: f.quote, quoteSource: f.quoteSource, emoji: h.emoji,
    blurb: `${name} (${f.year})${f.directors?.length ? `, directed by ${f.directors.join(' and ')}` : ''}. ${h.clues[h.clues.length - 1]}.${f.gross ? ` Worldwide gross about ${fmtMoney(f.gross)}.` : ''}`,
    clues, grossSource: f.grossSource, difficulty: h.difficulty,
  };
});
function altNames(t) {
  const a = [];
  if (t.includes(':')) a.push(t.split(':').pop().trim());
  if (t === 'Star Wars') a.push('Star Wars: A New Hope', 'A New Hope');
  if (t.startsWith('Star Wars: Episode')) a.push('Phantom Menace');
  if (t === 'E.T. the Extra-Terrestrial') a.push('E.T.', 'ET');
  if (t === "Harry Potter and the Philosopher's Stone") a.push("Harry Potter and the Sorcerer's Stone");
  if (t === 'The Empire Strikes Back') a.push('Star Wars: The Empire Strikes Back', 'Empire Strikes Back');
  return a.filter(x => x !== t);
}
for (const it of items) if (it.clues.length < 5) note(`few clues ${it.id}: ${it.clues.length}`);

function questions() {
  const r = rng('movies');
  const qs = [];
  const tops = items.filter(i => i.facts.topOfYear).sort((a, b) => a.facts.year - b.facts.year);
  for (const t of tops) {
    const wrong = sample(r, tops.filter(x => x !== t && Math.abs(x.facts.year - t.facts.year) <= 6), 3).map(x => x.name);
    qs.push({ id: `top-${t.facts.year}`, kind: 'mc', prompt: `Which film took the most money worldwide of all films released in ${t.facts.year}?`, answer: t.name, wrong, explain: `${t.name} grossed about ${fmtMoney(t.facts.boxOfficeUSD)} (Wikipedia year list).`, difficulty: Math.max(2, t.difficulty), refs: [`movies/${t.id}`] });
  }
  for (const it of items) {
    const wrongY = sample(r, [-3, -2, -1, 1, 2, 3].map(d => it.facts.year + d).filter(y => y <= 2025), 3).map(String);
    qs.push({ id: `year-${it.id}`, kind: 'mc', prompt: `In which year was ${it.name} released?`, answer: String(it.facts.year), wrong: wrongY, explain: it.blurb, difficulty: Math.min(3, it.difficulty + 1), refs: [`movies/${it.id}`] });
    if (it.facts.director) {
      const others = [...new Set(items.filter(x => x.facts.director && x.facts.director !== it.facts.director && !it.facts.director.includes(x.facts.director) && !x.facts.director.includes(it.facts.director)).map(x => x.facts.director))];
      qs.push({ id: `dir-${it.id}`, kind: 'mc', prompt: `Who directed ${it.name} (${it.facts.year})?`, answer: it.facts.director, wrong: sample(r, others, 3), explain: it.blurb, difficulty: Math.min(3, it.difficulty + 1), refs: [`movies/${it.id}`] });
    }
    if (it.quote) {
      const wrongF = sample(r, items.filter(x => x !== it && x.group === it.group), 3).map(x => x.name);
      if (wrongF.length === 3) qs.push({ id: `quote-${it.id}`, kind: 'mc', prompt: `Which film has the line: "${it.quote}"`, answer: it.name, wrong: wrongF, explain: `From ${it.name} (${it.facts.year}).`, difficulty: it.difficulty, refs: [`movies/${it.id}`] });
    }
    const wrongE = sample(r, items.filter(x => x !== it && Math.abs(x.difficulty - it.difficulty) <= 1), 3).map(x => x.name);
    qs.push({ id: `emoji-${it.id}`, kind: 'mc', prompt: `Which film is this? ${it.emoji}`, answer: it.name, wrong: wrongE, explain: it.blurb, difficulty: it.difficulty, refs: [`movies/${it.id}`] });
  }
  for (const d of ['1980s', '1990s', '2000s', '2010s']) {
    const top = items.filter(i => i.facts.decadeRank && i.group === d).sort((a, b) => a.facts.decadeRank - b.facts.decadeRank);
    if (top.length < 4) continue;
    qs.push({ id: `dec-${d}`, kind: 'mc', prompt: `Which was the highest-grossing film released in the ${d}?`, answer: top[0].name, wrong: top.slice(1, 4).map(x => x.name), explain: `${top[0].name} tops Wikipedia's ${d} list.`, difficulty: 2 });
  }
  return qs;
}

writePack({
  id: 'movies', title: 'Movies', theme: 'screen', icon: '🎬', kids: false, version: 1,
  notice: 'Box office figures are worldwide grosses, not adjusted for inflation, as listed on Wikipedia in October 2026; they include re-releases where listed.',
  factsMeta: {
    year: { type: 'year', label: 'Released', higherLabel: 'Newer', askHigh: 'Which of these films came out most recently?', askLow: 'Which of these films came out first?' },
    boxOfficeUSD: { type: 'num', label: 'Worldwide box office', unit: 'USD', higherLabel: 'Earned more', askHigh: 'Which of these films took the most money worldwide?', askLow: 'Which of these films took the least money worldwide?' },
    decade: { type: 'cat', label: 'Decade', ask: 'In which decade was {name} released?', stmt: '{name} came out in the {value}.' },
    director: { type: 'text', label: 'Director' },
    topOfYear: { type: 'bool', label: 'Top film of its year', yes: 'Year’s top earner', no: 'Not the year’s top earner', askBool: 'Which of these films was the highest-grossing film of its release year?', stmt: '{name} was the highest-grossing film of its release year.' },
    decadeRank: { type: 'num', label: 'Rank in its decade', lowerIsBetter: true, askHigh: 'Which of these was furthest down its decade’s box-office top 10?', askLow: 'Which of these ranked highest in its decade’s box-office top 10?' },
    kids: { type: 'bool', label: 'Family film', yes: 'Family', no: 'Not specifically for children', askBool: 'Which of these is a family film?', stmt: '{name} is a family film.' },
  },
  items, questions: questions(),
  fakes: ['The Last Lighthouse Keeper', 'Starfall Protocol', 'Midnight at the Paradise Diner', 'Captain Comet and the Moon Pirates', 'The Glass Orchard', 'Return to Kettle Island', 'Operation Thunderbolt Rising', 'The Clockmaker’s Daughter', 'Velocity Zero', 'Penguins of the Lost Glacier'],
  sources: [
    { name: 'Wikipedia: List of highest-grossing films', url: 'https://en.wikipedia.org/wiki/List_of_highest-grossing_films' },
    { name: 'Wikipedia: decade "in film" articles', url: 'https://en.wikipedia.org/wiki/2010s_in_film' },
    { name: 'Wikidata (directors, release dates)', url: 'https://www.wikidata.org' },
    { name: 'Wikiquote (quotes)', url: 'https://en.wikiquote.org' },
  ],
});
writeFileSync(join(ROOT, 'tools/c2_reports/movies.txt'), report.join('\n') + '\n');
console.log(report.join('\n'));
