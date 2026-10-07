// Builds the tv pack: famous long-running shows (start year cross-checked with Wikidata) + hand-written questions.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, wpQids, wdEntities, claims, wdYear, writePack, slug, rng, sample, parseQuestions, fetchJSON, wikiquoteCheck, leaks } from './c2_lib.mjs';
import { SHOWS, TV_QS, TV_QUOTES } from './c2_src/tv.mjs';

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
// Catchphrases: Wikiquote search for the exact line, then wikiquoteCheck on the hits that are the show's own pages
// (TV pages are often split by season: "Friends (season 1)", "The Simpsons/Season 4").
const wqBase = t => t.replace(/\s*\((US|UK)\)$/, '');
const WQ_PAGES = { 'Star Trek': ['Star Trek: The Original Series'], 'The Office (US)': ['The Office (American TV series)'] };
for (const it of items) {
  const line = TV_QUOTES[it.name];
  if (!line) continue;
  if (line.split(/\s+/).length > 10) { note(`tv quote too long ${it.name}`); continue; }
  if (leaks(line, [it.name, ...(it.alt || [])])) { note(`tv quote leaks the title ${it.name}: ${line}`); continue; }
  let hits = [];
  try {
    const j = await fetchJSON('https://en.wikiquote.org/w/api.php?action=query&list=search&format=json&srlimit=20&srsearch=' + encodeURIComponent(`"${line.replace(/[!?.]$/, '')}"`));
    hits = (j.query?.search || []).map(h => h.title);
  } catch (e) { note(`wikiquote search failed ${it.name}: ${e.message}`); }
  const base = wqBase(rows.find(r => r.name === it.name)?.title || it.name).toLowerCase();
  // the show's own pages only: "<base>", "<base> (season 3)", "<base>/Season 3", "<base> (TV series)"; never films or spin-offs
  const ownPage = t => { const l = t.toLowerCase(); return (WQ_PAGES[it.name] || []).includes(t) || l === base || (l.startsWith(base) && /^( \((season|series) \d+\)|\/season \d+| \(([a-z]+ )?tv series\))$/.test(l.slice(base.length))); };
  const own = hits.filter(ownPage);
  const res = own.length ? await wikiquoteCheck(own, line) : { ok: false };
  if (res.ok) { it.quote = line; it.quoteSource = res.url; } else note(`tv quote NOT verified ${it.name}: ${line} (search hits: ${hits.slice(0, 5).join(' / ') || 'none'})`);
}
const rr = rng('tv');
const questions = [];
for (const it of items) {
  const wrong = sample(rr, items.filter(x => x !== it && x.facts.kids === it.facts.kids), 3).map(x => x.name);
  questions.push({ id: `which-${it.id}`, kind: 'mc', prompt: `Which TV show is this? ${it.clues[it.clues.length - 1]}`, answer: it.name, wrong, explain: it.blurb, difficulty: it.difficulty, refs: [`tv/${it.id}`] });
  const wy = sample(rr, [-6, -4, -2, 2, 4, 6].map(k => it.facts.year + k).filter(y => y <= 2025), 3).map(String);
  questions.push({ id: `year-${it.id}`, kind: 'mc', prompt: `In which year was ${it.name} first shown?`, answer: String(it.facts.year), wrong: wy, explain: it.blurb, difficulty: 3, refs: [`tv/${it.id}`] });
}
writePack({
  id: 'tv', title: 'TV shows', theme: 'screen', icon: '📺', kids: false, version: 1, quotePrompt: 'Which TV show is this line from?',
  factsMeta: {
    year: { type: 'year', label: 'First shown', matchPrompt: 'Match each show to the year it was first shown', askNumber: 'In what year was {name} first shown?', higherLabel: 'Newer', askHigh: 'Which of these shows started most recently?', askLow: 'Which of these shows started first?' },
    country: { type: 'cat', label: 'Country of origin', ask: 'Which country does {name} come from?', stmt: 'Country of origin of {name}: {value}.' },
    decade: { type: 'cat', label: 'Decade', ask: 'In which decade did {name} start?', stmt: '{name} started in the {value}.' },
    kids: { type: 'bool', label: "Children's show", yes: "Children's show", no: 'Not a children’s show', askBool: "Which of these is a children's show?", stmt: "{name} is a children's show." },
  },
  items, questions: [...questions, ...parseQuestions(TV_QS, 'tvq')],
  sources: [{ name: 'Wikidata (start dates)', url: 'https://www.wikidata.org' }, { name: 'Wikipedia articles for each show', url: 'https://en.wikipedia.org' }, { name: 'Wikiquote (catchphrases)', url: 'https://en.wikiquote.org' }],
});
writeFileSync(join(ROOT, 'tools/c2_reports/tv.txt'), report.join('\n') + '\n');
console.log(report.join('\n'));
