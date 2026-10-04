// Builds the tv pack: famous long-running shows (start year cross-checked with Wikidata) + hand-written questions.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, wpQids, wdEntities, claims, wdYear, writePack, slug, rng, sample, parseQuestions } from './c2_lib.mjs';
import { SHOWS, TV_QS } from './c2_src/tv.mjs';

const report = [];
const note = s => report.push(s);
const rows = SHOWS.trim().split('\n').map(l => { const [title, name, year, country, d, kids, clues, alt] = l.split('|'); return { title, name, year: +year, country, d: +d, kids: kids === '1', clues: clues.split(';'), alt: alt ? alt.split(';') : [] }; });
const q = await wpQids(rows.map(r => r.title));
const ents = await wdEntities(Object.values(q));
for (const r of rows) {
  const e = ents[q[r.title]];
  if (!e) { note(`not on Wikidata: ${r.title}`); r.drop = true; continue; }
  const ys = ['P580', 'P577', 'P571'].flatMap(p => claims(e, p).map(wdYear)).filter(Boolean);
  if (!ys.length) note(`no start year on Wikidata: ${r.name} (kept ${r.year})`);
  else if (!ys.includes(r.year)) { note(`START YEAR MISMATCH ${r.name}: mine ${r.year}, wikidata ${ys.join(',')} -> dropped`); r.drop = true; }
}
const items = rows.filter(r => !r.drop).map(r => {
  const h = r.clues.map(c => c + '.');
  return {
    id: slug(r.name), name: r.name, alt: r.alt, group: `${Math.floor(r.year / 10) * 10}s`,
    facts: { year: r.year, country: r.country, decade: `${Math.floor(r.year / 10) * 10}s`, kids: r.kids || undefined },
    blurb: `${r.name} (first shown ${r.year}, ${r.country}). ${r.clues[r.clues.length - 1]}.`,
    clues: [...h.slice(0, -1), `It first aired in ${r.year}.`, `It was made in ${r.country === 'United States' || r.country === 'United Kingdom' ? 'the ' + r.country : r.country}.`, h[h.length - 1]],
    difficulty: r.d,
  };
});
const rr = rng('tv');
const questions = [];
for (const it of items) {
  const wrong = sample(rr, items.filter(x => x !== it && x.facts.kids === it.facts.kids), 3).map(x => x.name);
  questions.push({ id: `which-${it.id}`, kind: 'mc', prompt: `Which TV show is this? ${it.clues[it.clues.length - 1]}`, answer: it.name, wrong, explain: it.blurb, difficulty: it.difficulty, refs: [`tv/${it.id}`] });
  const wy = sample(rr, [-6, -4, -2, 2, 4, 6].map(k => it.facts.year + k).filter(y => y <= 2025), 3).map(String);
  questions.push({ id: `year-${it.id}`, kind: 'mc', prompt: `In which year was ${it.name} first shown?`, answer: String(it.facts.year), wrong: wy, explain: it.blurb, difficulty: 3, refs: [`tv/${it.id}`] });
}
writePack({
  id: 'tv', title: 'TV shows', theme: 'screen', icon: '📺', kids: false, version: 1,
  factsMeta: {
    year: { type: 'year', label: 'First shown', higherLabel: 'Newer', askHigh: 'Which of these shows started most recently?', askLow: 'Which of these shows started first?' },
    country: { type: 'cat', label: 'Country of origin', ask: 'Which country does {name} come from?', stmt: 'Country of origin of {name}: {value}.' },
    decade: { type: 'cat', label: 'Decade', ask: 'In which decade did {name} start?', stmt: '{name} started in the {value}.' },
    kids: { type: 'bool', label: "Children's show", yes: "Children's show", no: 'Not a children’s show', askBool: "Which of these is a children's show?", stmt: "{name} is a children's show." },
  },
  items, questions: [...questions, ...parseQuestions(TV_QS, 'tvq')],
  sources: [{ name: 'Wikidata (start dates)', url: 'https://www.wikidata.org' }, { name: 'Wikipedia articles for each show', url: 'https://en.wikipedia.org' }],
});
writeFileSync(join(ROOT, 'tools/c2_reports/tv.txt'), report.join('\n') + '\n');
console.log(report.join('\n'));
