// Builds the books pack: hand list (c2_src/books.mjs) cross-checked with Wikidata (author, publication year);
// first lines only for pre-1930 books, verified against the Project Gutenberg text.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, fetchText, wpQids, wdEntities, claims, wdYear, label, writePack, slug, leaks, rng, sample, parseQuestions } from './c2_lib.mjs';
import { BOOKS, SUMMARIES, AUTHOR_QS } from './c2_src/books.mjs';

const report = [];
const note = s => report.push(s);
const PD_BEFORE = 1930;
const TRANSLATOR = { 996: 'John Ormsby', 1399: 'Constance Garnett', 2554: 'Constance Garnett', 2600: 'Louise and Aylmer Maude', 135: 'Isabel F. Hapgood', 1184: 'an anonymous 1846 translator', 164: 'an 1872 English translation' };
const rows = BOOKS.trim().split('\n').map(l => {
  const [title, name, author, year, genre, d, kids, gut, first, clues, alt] = l.split('|');
  return { title, name, author, year: +year, genre, d: +d, kids: kids === '1', gut: gut ? +gut : null, first, clues: clues.split(';'), alt: alt ? alt.split(';') : [] };
});
for (const r of rows) {
  if (!SUMMARIES[r.name]) throw new Error('no summary for ' + r.name);
  if (r.first && (r.year >= PD_BEFORE || !r.gut)) throw new Error(`first line not allowed on ${r.name} (${r.year}): public-domain Gutenberg books only`);
}

const q = await wpQids(rows.map(r => r.title));
const ents = await wdEntities(Object.values(q));
const authorIds = new Set();
for (const r of rows) for (const v of claims(ents[q[r.title]], 'P50')) authorIds.add(v.id);
const authors = await wdEntities([...authorIds], 'labels');
const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
for (const r of rows) {
  const e = ents[q[r.title]];
  if (!e) { note(`not on Wikidata: ${r.title}`); continue; }
  const as = claims(e, 'P50').map(v => label(authors[v.id]) || '');
  const last = norm(r.author).split(/[ .]+/).filter(Boolean).pop();
  if (!as.some(a => norm(a).includes(last))) note(`author check ${r.name}: mine ${r.author}, wikidata ${as.join(', ') || '(none)'}`);
  const ys = claims(e, 'P577').map(wdYear).filter(Boolean);
  if (ys.length && !ys.some(y => Math.abs(y - r.year) <= 1)) note(`year check ${r.name}: mine ${r.year}, wikidata ${ys.join(',')}`);
  if (!ys.length) note(`no publication year on Wikidata: ${r.name}`);
}

const flat = s => s.toLowerCase().replace(/\r/g, '').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/_/g, '').replace(/—|--/g, '—').replace(/\s+/g, ' ');
for (const r of rows.filter(r => r.first)) {
  const text = flat(await fetchText(`https://www.gutenberg.org/cache/epub/${r.gut}/pg${r.gut}.txt`));
  if (!text.includes(flat(r.first))) { note(`first line NOT found in Gutenberg #${r.gut} for ${r.name} -> dropped`); r.first = ''; }
  else r.firstSource = `https://www.gutenberg.org/ebooks/${r.gut}`;
}

const STOPS = ['the', 'and', 'adventures', 'story', 'book', 'tale', 'little', 'great', 'world', 'man', 'girl', 'boy', 'kid', 'diary', 'young', 'house', 'call'];
const items = rows.filter(r => ents[q[r.title]]).map(r => {
  const names = [r.name, ...r.alt];
  const tr = TRANSLATOR[r.gut];
  const fl = r.first && `It opens: “${r.first.replace(/[;:,]$/, '…')}”${tr ? ` (translation by ${tr})` : ''}`;
  const auto = [`Genre: ${r.genre}.`, `It was first published in ${r.year}.`, fl, `It was written by ${r.author}.`].filter(Boolean);
  const h = r.clues.map(c => c + '.');
  const clues = [...h.slice(0, -1), ...auto, h[h.length - 1]].filter(c => !leaks(c, names, STOPS) || /^It was written by|^It was first published/.test(c));
  if (clues.length < 5) note(`few clues ${r.name}: ${clues.length}`);
  const it = {
    id: slug(r.name), name: r.name, alt: r.alt, group: r.genre,
    facts: { author: r.author, year: r.year, genre: r.genre, century: centuryOf(r.year), kids: r.kids || undefined },
    blurb: `${r.name} (${r.year}) by ${r.author}. ${SUMMARIES[r.name]}`,
    summary: SUMMARIES[r.name], clues, difficulty: r.d,
  };
  if (r.first) Object.assign(it, { firstLine: r.first.replace(/[;:,]$/, '…'), firstLineSource: r.firstSource, ...(tr ? { translator: tr } : {}) });
  return it;
});
function centuryOf(y) { const c = Math.floor((y - 1) / 100) + 1; return `${c}${c % 10 === 1 && c !== 11 ? 'st' : c % 10 === 2 && c !== 12 ? 'nd' : c % 10 === 3 && c !== 13 ? 'rd' : 'th'} century`; }

function questions() {
  const r = rng('books');
  const qs = [];
  const allAuthors = [...new Set(items.map(i => i.facts.author))];
  for (const it of items) {
    const near = allAuthors.filter(a => a !== it.facts.author);
    const close = near.filter(a => items.some(x => x.facts.author === a && Math.abs(x.facts.year - it.facts.year) <= 60));
    const wrong = sample(r, close.length >= 3 ? close : near, 3);
    qs.push({ id: `author-${it.id}`, kind: 'mc', prompt: `Who wrote ${it.name}?`, answer: it.facts.author, wrong, explain: it.blurb, difficulty: it.difficulty, refs: [`books/${it.id}`] });
    const plotWrong = sample(r, items.filter(x => x !== it && Math.abs(x.difficulty - it.difficulty) <= 1 && x.facts.kids === it.facts.kids), 3).map(x => x.name);
    qs.push({ id: `plot-${it.id}`, kind: 'mc', prompt: `Which book is this? ${it.summary.replace(new RegExp(it.name, 'g'), 'the book')}`, answer: it.name, wrong: plotWrong, explain: it.blurb, difficulty: it.difficulty, refs: [`books/${it.id}`] });
    if (it.firstLine) {
      const fw = sample(r, items.filter(x => x !== it && x.facts.year < 1930), 3).map(x => x.name);
      qs.push({ id: `first-${it.id}`, kind: 'mc', prompt: `Which book begins: “${it.firstLine.replace(/[;:,]$/, '…')}”`, answer: it.name, wrong: fw, explain: `${it.blurb}${it.translator ? ` (Opening as translated by ${it.translator}.)` : ''}`, difficulty: Math.min(3, it.difficulty + 1), refs: [`books/${it.id}`] });
    }
    if (it.difficulty >= 2) {
      const wy = sample(r, [-30, -20, -10, 10, 20, 30].map(d => it.facts.year + d).filter(y => y <= 2025), 3).map(String);
      qs.push({ id: `year-${it.id}`, kind: 'mc', prompt: `Roughly when was ${it.name} first published?`, answer: String(it.facts.year), wrong: wy, explain: it.blurb, difficulty: 3, refs: [`books/${it.id}`] });
    }
  }
  const leak = qs.filter(x => x.id.startsWith('plot-') && leaks(x.prompt.replace(/^Which book is this\? /, ''), [items.find(i => 'plot-' + i.id === x.id).name], STOPS));
  for (const x of leak) note(`plot question names the book, dropped: ${x.id}`);
  return [...qs.filter(x => !leak.includes(x)), ...parseQuestions(AUTHOR_QS, 'auth')];
}
const qs = questions();
for (const it of items.filter(i => leaks(i.summary, [i.name], STOPS))) note(`summary mentions its own title (plot question dropped): ${it.name}`);

writePack({
  id: 'books', title: 'Famous books', theme: 'books', icon: '📚', kids: false, version: 1, leakExempt: ['adventures'],
  factsMeta: {
    author: { type: 'cat', label: 'Author', ask: 'Who wrote {name}?', askReverse: 'Which of these books was written by {value}?', stmt: '{name} was written by {value}.' },
    year: { type: 'year', label: 'First published', higherLabel: 'Newer', askHigh: 'Which of these books was published most recently?', askLow: 'Which of these books was published first?' },
    genre: { type: 'cat', label: 'Genre', exclusive: false },
    century: { type: 'cat', label: 'Century', ask: 'In which century was {name} first published?', stmt: '{name} was first published in the {value}.' },
    kids: { type: 'bool', label: "Children's book", yes: "Children's book", no: 'Not a children’s book', askBool: "Which of these is a children's book?", stmt: "{name} is a children's book." },
  },
  items, questions: qs,
  fakes: ['The Lantern of Wexmoor', 'A Map of Quiet Rivers', 'The Brass Orchard', 'Mrs Pemberton’s Umbrella', 'The Ninth Lighthouse', 'Children of the Salt Road', 'The Clockwork Duchess', 'Winter at Hollowmere'],
  sources: [
    { name: 'Wikidata (author, publication date)', url: 'https://www.wikidata.org' },
    { name: 'Project Gutenberg (public-domain first lines)', url: 'https://www.gutenberg.org' },
    { name: 'Wikipedia articles on each book (clues, summaries written in our own words)', url: 'https://en.wikipedia.org' },
  ],
});
writeFileSync(join(ROOT, 'tools/c2_reports/books.txt'), report.join('\n') + '\n');
console.log(report.join('\n'));
