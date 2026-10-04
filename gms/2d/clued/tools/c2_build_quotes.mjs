// Builds the quotes pack: each item is a speaker with Wikiquote-verified quotes; misattributions become true/false questions.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, writePack, slug, rng, sample, wikiquoteCheck, parseQuestions } from './c2_lib.mjs';
import { QUOTES, MISQUOTES } from './c2_src/quotes.mjs';

const report = [];
const note = s => report.push(s);
const rows = QUOTES.trim().split('\n').map(l => {
  const [speaker, pages, group, d, text, context] = l.split('|');
  return { speaker, pages: pages.split(';'), group, d: +d, text, context };
});
for (const r of rows) {
  if (/\b(lyric|song)\b/i.test(r.context)) throw new Error('no song lyrics: ' + r.text);
  const res = await wikiquoteCheck(r.pages, r.text);
  if (res.ok) r.source = res.url;
  else note(`NOT verified, dropped: ${r.speaker}: ${r.text}${res.heading ? ` (found under "${res.heading}")` : ''}`);
}
const ok = rows.filter(r => r.source);
const tidy = t => t.replace(/[,;:]$/, '…').replace(/^[a-z]/, c => c.toUpperCase());
const bySpeaker = new Map();
for (const r of ok) (bySpeaker.get(r.speaker) || bySpeaker.set(r.speaker, []).get(r.speaker)).push(r);
const items = [...bySpeaker].map(([speaker, qs]) => ({
  id: slug(speaker), name: speaker, group: qs[0].group,
  facts: { field: qs[0].group },
  quote: tidy(qs[0].text),
  quotes: qs.map(q => ({ text: tidy(q.text), context: q.context, source: q.source, difficulty: q.d })),
  blurb: `${speaker}: “${tidy(qs[0].text)}” (${qs[0].context}).`,
  difficulty: Math.min(...qs.map(q => q.d)),
}));

const r = rng('quotes');
const questions = [];
for (const it of items) {
  for (const [i, q] of it.quotes.entries()) {
    const same = items.filter(x => x !== it && x.group === it.group);
    const pool = same.length >= 3 ? same : items.filter(x => x !== it);
    questions.push({ id: `who-${it.id}-${i}`, kind: 'mc', prompt: `Who said or wrote: “${q.text}”`, answer: it.name, wrong: sample(r, pool, 3).map(x => x.name), explain: `${it.name}: ${q.context}.`, difficulty: q.difficulty, refs: [`quotes/${it.id}`] });
  }
}
const mis = parseQuestions(MISQUOTES, 'mis');
writePack({
  id: 'quotes', title: 'Famous quotes', theme: 'books', icon: '💬', kids: false, version: 1,
  notice: 'Every quote is checked against Wikiquote. Famous misquotes appear as true-or-false questions.',
  factsMeta: { field: { type: 'cat', label: 'Known for', exclusive: false } },
  items, questions: [...questions, ...mis],
  sources: [{ name: 'Wikiquote', url: 'https://en.wikiquote.org' }, { name: 'Quote Investigator (misattributions)', url: 'https://quoteinvestigator.com' }],
});
writeFileSync(join(ROOT, 'tools/c2_reports/quotes.txt'), report.join('\n') + '\n');
console.log(`${ok.length}/${rows.length} quotes verified\n` + report.join('\n'));
