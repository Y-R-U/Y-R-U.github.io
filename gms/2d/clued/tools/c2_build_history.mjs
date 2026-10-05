// Builds the history pack: dated events cross-checked against Wikidata dates on each article.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, wpQids, wdEntities, claims, wdYear, writePack, slug, rng, sample } from './c2_lib.mjs';
import { EVENTS, HAND_CHECKED } from './c2_src/history.mjs';

const report = [];
const note = s => report.push(s);
const rows = EVENTS.trim().split('\n').map(l => { const [title, name, year, d, blurb] = l.split('|'); return { title, name, year: +year, d: +d, blurb }; });
const q = await wpQids(rows.map(r => r.title));
const ents = await wdEntities(Object.values(q));
const DATE_PROPS = ['P585', 'P580', 'P571', 'P577', 'P1619', 'P582', 'P729', 'P619', 'P606', 'P575', 'P1191', 'P793'];
for (const r of rows) {
  const e = ents[q[r.title]];
  if (!e) { note(`not on Wikidata: ${r.title} (kept, unverified)`); r.unverified = true; continue; }
  const ys = DATE_PROPS.flatMap(p => claims(e, p).map(wdYear)).filter(y => y != null);
  const tol = r.year < 0 ? 2 : r.year < 1000 ? 1 : 0;
  if (!ys.length) { note(`no Wikidata date: ${r.name} ${r.year} (kept, checked by hand against Wikipedia)`); r.unverified = true; }
  else if (!ys.some(y => Math.abs(y - r.year) <= tol) && HAND_CHECKED[r.name]) note(`hand-checked ${r.name} ${r.year}: ${HAND_CHECKED[r.name]}`);
  else if (!ys.some(y => Math.abs(y - r.year) <= tol)) { note(`YEAR MISMATCH ${r.name}: mine ${r.year}, wikidata ${[...new Set(ys)].join(',')}`); r.mismatch = true; }
}
const fmtY = y => y < 0 ? `${-y} BC` : y < 1000 ? `AD ${y}` : String(y);
const century = y => { const c = y < 0 ? Math.floor((-y - 1) / 100) + 1 : Math.floor((y - 1) / 100) + 1; const s = c % 10 === 1 && c !== 11 ? 'st' : c % 10 === 2 && c !== 12 ? 'nd' : c % 10 === 3 && c !== 13 ? 'rd' : 'th'; return `${c}${s} century${y < 0 ? ' BC' : ''}`; };
const era = y => y < 500 ? 'Ancient' : y < 1500 ? 'Medieval' : y < 1800 ? 'Early modern' : y < 1900 ? '1800s' : y < 1946 ? '1900–1945' : 'Since 1945';
const items = rows.filter(r => !r.mismatch).map(r => ({
  id: slug(r.name), name: r.name, group: era(r.year),
  facts: { year: r.year, century: century(r.year), era: era(r.year) },
  blurb: `${r.name} (${fmtY(r.year)}). ${r.blurb}`, difficulty: r.d,
}));

const rr = rng('history');
const questions = [];
for (const it of items) {
  const y = it.facts.year;
  const step = y < 1000 ? 50 : y < 1800 ? 10 : y < 1900 ? 5 : 2;
  const wrong = sample(rr, [-3, -2, -1, 1, 2, 3].map(k => y + k * step).filter(v => v <= 2025 && v !== 0), 3).map(fmtY);
  questions.push({ id: `year-${it.id}`, kind: 'mc', prompt: `When did this happen? ${it.name}`, answer: fmtY(y), wrong, explain: it.blurb, difficulty: it.difficulty, refs: [`history/${it.id}`] });
  if (y > 1000 && it.difficulty <= 2) questions.push({ id: `num-${it.id}`, kind: 'number', prompt: `In what year? ${it.name}`, answer: y, unit: '', tolerance: y > 1900 ? 2 : 10, explain: it.blurb, difficulty: Math.min(3, it.difficulty + 1), refs: [`history/${it.id}`] });
}
// Timeline sets: 4 events at least 5 years apart, easier sets use easier events.
for (let k = 0; k < 40; k++) {
  const d = 1 + (k % 3);
  const pool = items.filter(i => i.difficulty <= d);
  const pick = [];
  for (const c of sample(rr, pool, pool.length)) { if (pick.every(p => Math.abs(p.facts.year - c.facts.year) >= (d === 1 ? 20 : 5))) pick.push(c); if (pick.length === 4) break; }
  if (pick.length < 4) continue;
  const ordered = pick.slice().sort((a, b) => a.facts.year - b.facts.year);
  const id = `order-${ordered.map(i => i.id.slice(0, 12)).join('-')}`;
  if (questions.some(x => x.id === id)) continue;
  questions.push({ id, kind: 'order', prompt: 'Put these in order, earliest first.', answer: ordered.map(i => i.name), orderLabel: 'Earliest → latest', explain: ordered.map(i => `${i.name}: ${fmtY(i.facts.year)}`).join(' · '), difficulty: d, refs: ordered.map(i => `history/${i.id}`) });
}
// Which came first?
for (let k = 0; k < 30; k++) {
  const [a, b] = sample(rr, items.filter(i => i.difficulty <= 2), 2);
  if (Math.abs(a.facts.year - b.facts.year) < 10) continue;
  const first = a.facts.year < b.facts.year ? a : b, second = first === a ? b : a;
  questions.push({ id: `first-${first.id}-${second.id}`, kind: 'mc', prompt: 'Which happened first?', answer: first.name, wrong: [second.name], explain: `${first.name}: ${fmtY(first.facts.year)}. ${second.name}: ${fmtY(second.facts.year)}.`, difficulty: Math.abs(a.facts.year - b.facts.year) > 150 ? 1 : 2, refs: [`history/${first.id}`, `history/${second.id}`] });
}
const seen = new Set();
writePack({
  id: 'history', title: 'History', theme: 'history', icon: '🏛️', kids: false, version: 1,
  factsMeta: {
    year: { type: 'year', label: 'Year', higherLabel: 'Later', askNumber: 'In what year did this happen: {name}?', askHigh: 'Which of these happened most recently?', askLow: 'Which of these happened first?' },
    century: { type: 'cat', label: 'Century', ask: 'In which century did this happen: {name}?', stmt: 'This happened in the {value}: {name}.' },
    era: { type: 'cat', label: 'Era', exclusive: false },
  },
  items, questions: questions.filter(x => !seen.has(x.id) && seen.add(x.id)),
  sources: [{ name: 'Wikidata (event dates)', url: 'https://www.wikidata.org' }, { name: 'Wikipedia articles for each event', url: 'https://en.wikipedia.org' }],
});
writeFileSync(join(ROOT, 'tools/c2_reports/history.txt'), report.join('\n') + '\n');
console.log(report.join('\n'));
