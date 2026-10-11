// Builds the words pack (word origins). Each loanword's language and each eponym's person must appear in the
// English entry's Etymology on Wiktionary, or the row is dropped.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, fetchJSON, writePack, slug, rng, sample, parseQuestions } from './c2_lib.mjs';
import { LOANWORDS, EPONYMS, WORD_QS, EPONYM_DESC } from './c2_src/words.mjs';

const report = [];
const note = s => report.push(s);
async function etymology(word) {
  let j;
  try { j = await fetchJSON('https://en.wiktionary.org/w/api.php?action=parse&prop=wikitext&redirects=1&format=json&formatversion=2&page=' + encodeURIComponent(word)); } catch { return ''; }
  const t = j?.parse?.wikitext || '';
  const en = ('\n' + t).split(/\n==(?!=)/).find(s => s.startsWith('English==')) || '';
  return en.split(/\n(?====)/).filter(s => /^===+\s*Etymology/.test(s)).join('\n');
}
const loans = LOANWORDS.trim().split('\n').map(l => { const [word, lang, codes, d, story] = l.split('|'); return { word, lang, codes: codes.split(';'), d: +d, story }; });
const epos = EPONYMS.trim().split('\n').map(l => { const [word, who, wrong, d, kw, story] = l.split('|'); return { word, who, wrong: wrong.split(';'), d: +d, kw, story }; });
for (const r of loans) {
  const e = await etymology(r.word);
  const names = r.lang.split(/ and /);
  r.ok = r.codes.some(c => e.includes(`|${c}|`)) || names.some(n => e.toLowerCase().includes(n.toLowerCase()));
  if (!r.ok) note(`loanword NOT verified on Wiktionary, dropped: ${r.word} (${r.lang})`);
}
for (const r of epos) {
  const e = await etymology(r.word);
  r.ok = e.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes(r.kw.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase());
  if (!r.ok) note(`eponym NOT verified on Wiktionary, dropped: ${r.word} (${r.kw})`);
}
const quoteW = w => `“${w}”`;
export const eponymDesc = x => EPONYM_DESC[x.word] || x.story.charAt(0).toLowerCase() + x.story.slice(1);
const items = [
  ...loans.filter(r => r.ok).map(r => ({ id: slug(r.word), name: r.word, group: 'loanword', facts: { origin: r.lang, kind: 'Borrowed from another language' }, blurb: `${quoteW(r.word)} comes from ${r.lang}. ${r.story}.`, difficulty: r.d })),
  ...epos.filter(r => r.ok).map(r => ({ id: slug(r.word), name: r.word, group: 'eponym', facts: { namedAfter: r.who, kind: 'Named after a person' }, blurb: `${quoteW(r.word)} is named after ${r.who.replace(/^The /, 'the ')}. ${r.story}.`, difficulty: r.d })),
];
const r = rng('words');
const LANGS = [...new Set(loans.map(x => x.lang))];
const questions = [];
for (const x of loans.filter(x => x.ok)) {
  const it = items.find(i => i.name === x.word);
  const mentioned = l => x.story.includes(l) || x.lang.includes(l) || l.includes(x.lang) || (x.lang.includes('Hindi') && /Urdu|Hindi/.test(l)) || (x.lang === 'Old Norse' && l === 'Norwegian') || (x.lang === 'Norwegian' && l === 'Old Norse');
  const wrong = sample(r, LANGS.filter(l => !mentioned(l)), 3);
  questions.push({ id: `origin-${it.id}`, kind: 'mc', prompt: `The English word ${quoteW(x.word)} comes from which language?`, answer: x.lang, wrong, explain: it.blurb, difficulty: x.d, refs: [`words/${it.id}`] });
}
// "Is named after whom?" is a giveaway (the word is the surname), so ask the other way round.
const re = rng('words-eponyms');
for (const x of epos.filter(x => x.ok)) {
  const it = items.find(i => i.name === x.word);
  const wrong = sample(re, epos.filter(y => y.ok && y.word !== x.word).map(y => y.word), 3);
  questions.push({ id: `named-${it.id}`, kind: 'mc', prompt: `Which word is named after ${eponymDesc(x)}?`, answer: x.word, wrong, explain: it.blurb, difficulty: x.d, refs: [`words/${it.id}`] });
}
writePack({
  id: 'words', title: 'Word origins', theme: 'books', icon: '🔤', kids: false, version: 1,
  notice: 'Origins are checked against Wiktionary etymologies; many words passed through other languages on the way to English.',
  factsMeta: {
    origin: { type: 'cat', label: 'Language of origin', matchPrompt: 'Match each word to the language it comes from', ask: 'The English word “{name}” comes from which language?', askReverse: 'Which of these English words comes from {value}?', stmt: 'The English word “{name}” comes from {value}.' },
    namedAfter: { type: 'text', label: 'Named after', matchPrompt: 'Match each word to the person it is named after' },
    kind: { type: 'cat', label: 'Kind of word', exclusive: false },
  },
  items, questions: [...questions, ...parseQuestions(WORD_QS, 'wq')],
  sources: [{ name: 'Wiktionary (etymologies)', url: 'https://en.wiktionary.org' }, { name: 'Online Etymology Dictionary', url: 'https://www.etymonline.com' }],
});
writeFileSync(join(ROOT, 'tools/c2_reports/words.txt'), report.join('\n') + '\n');
console.log(report.join('\n'));
