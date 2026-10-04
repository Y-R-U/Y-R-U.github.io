// Builds the paintings pack (public-domain works on Commons), cross-checked with Wikidata.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, wpQids, wdEntities, claims, wdYear, label, commonsImages, writePack, slug, leaks, rng, sample } from './c2_lib.mjs';
import { PAINTINGS } from './c2_src/paintings.mjs';

const report = [];
const note = s => report.push(s);
const rows = PAINTINGS.trim().split('\n').map(l => {
  const [title, name, artist, year, museum, d, clues, alt] = l.split('|');
  return { title, name, artist, year: +year, museum, d: +d, clues: clues.split(';'), alt: alt ? alt.split(';') : [] };
});
const q = await wpQids(rows.map(r => r.title));
const ents = await wdEntities(Object.values(q));
const refIds = new Set();
for (const r of rows) for (const p of ['P170', 'P195']) for (const v of claims(ents[q[r.title]], p)) refIds.add(v.id);
const refs = await wdEntities([...refIds], 'labels');
const files = {};
const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
for (const r of rows) {
  const e = ents[q[r.title]];
  if (!e) { note(`not found ${r.title}`); r.drop = true; continue; }
  const creators = claims(e, 'P170').map(v => label(refs[v.id]) || '');
  const last = norm(r.artist).split(' ').pop();
  if (!creators.some(c => norm(c).includes(last))) { note(`artist mismatch ${r.name}: mine ${r.artist}, wikidata ${creators.join(',')} -> dropped`); r.drop = true; }
  const ys = ['P571', 'P580', 'P582', 'P577'].flatMap(p => claims(e, p).map(wdYear)).filter(Boolean);
  if (!ys.some(y => Math.abs(y - r.year) <= 3)) { note(`year mismatch ${r.name}: mine ${r.year}, wikidata ${ys.join(',')} -> year dropped`); r.year = null; }
  const cols = claims(e, 'P195').map(v => label(refs[v.id]) || '');
  const mk = norm(r.museum).split(/[ ,]/).filter(w => w.length > 3);
  if (cols.length && !cols.some(c => mk.some(w => norm(c).includes(w)))) note(`collection differs ${r.name}: mine ${r.museum}, wikidata ${cols.join(' / ')}`);
  const img = claims(e, 'P18')[0];
  if (img) files[r.title] = img; else { note(`no image ${r.name} -> dropped`); r.drop = true; }
}
const imgs = await commonsImages(Object.values(files), { maxDim: 640 });
const items = [];
for (const r of rows) {
  if (r.drop) continue;
  const m = imgs[files[r.title].replace(/_/g, ' ')];
  if (!m || m.rejected) { note(`image licence rejected ${r.name}: ${m?.rejected} -> dropped`); continue; }
  const names = [r.name, ...r.alt];
  const auto = [r.year && `It was painted in ${r.year}.`, `It hangs in: ${r.museum}.`.replace('hangs in: Woodblock print (many copies)', 'is a woodblock print with many copies'), `It is by ${r.artist}.`].filter(Boolean);
  const h = r.clues.map(c => c + '.');
  const clues = [...h.slice(0, -1), ...auto, h[h.length - 1]].filter(c => !leaks(c, names, ['the', 'portrait', 'lady', 'young', 'night', 'boy', 'girl', 'with', 'over', 'woman']));
  if (clues.length < 5) note(`few clues ${r.name}: ${clues.length}`);
  items.push({
    id: slug(r.name), name: r.name, alt: r.alt, group: r.artist,
    facts: { artist: r.artist, year: r.year || undefined, museum: r.museum },
    blurb: `${r.name}${r.year ? ` (${r.year})` : ''} by ${r.artist}. ${r.clues[r.clues.length - 1]}.`,
    clues, media: { img: [m] }, difficulty: r.d,
  });
}
const rr = rng('paintings');
const questions = [];
for (const it of items) {
  const others = [...new Set(items.filter(x => x.facts.artist !== it.facts.artist).map(x => x.facts.artist))];
  questions.push({ id: `artist-${it.id}`, kind: 'mc', prompt: `Who painted ${it.name}?`, answer: it.facts.artist, wrong: sample(rr, others, 3), explain: it.blurb, difficulty: it.difficulty, media: it.media, refs: [`paintings/${it.id}`] });
  questions.push({ id: `name-${it.id}`, kind: 'mc', prompt: 'What is this painting called?', answer: it.name, wrong: sample(rr, items.filter(x => x !== it), 3).map(x => x.name), explain: it.blurb, difficulty: it.difficulty, media: it.media, refs: [`paintings/${it.id}`] });
}
writePack({
  id: 'paintings', title: 'Famous paintings', theme: 'art', icon: '🖼️', kids: false, version: 1,
  imgPrompt: 'Which of these is {name}?', nameImgPrompt: 'What is this painting called?', tfImgPrompt: 'This painting is {name}.',
  factsMeta: { artist: { type: 'cat', label: 'Artist', ask: 'Who painted {name}?', askReverse: 'Which of these was painted by {value}?', stmt: '{name} was painted by {value}.' }, year: { type: 'year', label: 'Painted', higherLabel: 'Later', askHigh: 'Which of these was painted most recently?', askLow: 'Which of these is the oldest painting?' }, museum: { type: 'text', label: 'Where it is' } },
  items, questions,
  sources: [{ name: 'Wikimedia Commons (public-domain reproductions)', url: 'https://commons.wikimedia.org' }, { name: 'Wikidata (creator, date, collection)', url: 'https://www.wikidata.org' }],
});
writeFileSync(join(ROOT, 'tools/c2_reports/art.txt'), report.join('\n') + '\n');
console.log(report.join('\n'));
