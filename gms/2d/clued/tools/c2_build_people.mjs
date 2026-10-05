// Builds people, leaders, explorers, artists and actors packs from hand lists + Wikidata (dates, portraits, cast checks).
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, wpQids, wdEntities, claims, wdYear, commonsImages, writePack, slug, leaks, rng, sample } from './c2_lib.mjs';
import { PEOPLE, LEADERS, EXPLORERS, ARTISTS } from './c2_src/people.mjs';
import { ACTORS } from './c2_src/actors.mjs';

const report = [];
const note = s => report.push(s);
const parse = (text, actors) => text.trim().split('\n').map(l => {
  const p = l.split('|');
  if (actors) { const [title, name, born, nat, d, films, clues, alt] = p; return { title, name, born: born ? +born : null, nat, field: 'acting', d: +d, films: films.split(';'), clues: clues.split(';'), alt: alt ? alt.split(';') : [] }; }
  const [title, name, born, nat, field, d, clues, alt] = p;
  return { title, name, born: born ? +born : null, nat, field, d: +d, clues: clues.split(';'), alt: alt ? alt.split(';') : [] };
});

async function enrich(rows) {
  const q = await wpQids(rows.map(r => r.title));
  const ents = await wdEntities(Object.values(q));
  const files = {};
  for (const r of rows) {
    r.qid = q[r.title];
    const e = ents[r.qid];
    if (!e) { note(`not found: ${r.title}`); continue; }
    const by = claims(e, 'P569').map(wdYear).filter(v => v != null);
    const dy = claims(e, 'P570').map(wdYear).filter(v => v != null);
    const tol = r.born != null && r.born < 0 ? 2 : 1;
    if (r.born != null) {
      if (!by.length) { note(`no birth date on Wikidata: ${r.title} (dropping born)`); r.born = null; }
      else if (!by.some(y => Math.abs(y - r.born) <= tol)) { note(`birth year mismatch ${r.title}: mine ${r.born}, wikidata ${by.join(',')} (dropping born)`); r.born = null; }
      else r.born = by.find(y => Math.abs(y - r.born) <= tol);
    }
    r.died = dy.length ? dy[0] : null;
    const img = claims(e, 'P18')[0];
    if (img) files[r.title] = img;
  }
  const imgs = await commonsImages(Object.values(files), { maxDim: 640 });
  for (const r of rows) {
    const m = imgs[files[r.title]?.replace(/_/g, ' ')];
    if (m?.rejected) note(`portrait licence rejected ${r.title}: ${m.rejected}`);
    r.img = m && !m.rejected ? [m] : [];
  }
  return rows;
}

async function castCheck(rows) {
  const titles = [...new Set(rows.flatMap(r => r.films))];
  const fq = await wpQids(titles);
  const fe = await wdEntities(Object.values(fq), 'claims|labels');
  for (const r of rows) {
    r.verifiedFilms = [];
    for (const t of r.films) {
      const e = fe[fq[t]];
      const cast = [...(e?.claims?.P161 || []), ...(e?.claims?.P725 || [])].map(c => c.mainsnak.datavalue?.value?.id);
      if (cast.includes(r.qid)) r.verifiedFilms.push(t.replace(/\s*\((\d{4} )?(Disney )?film\)$/, ''));
      else note(`cast not confirmed: ${r.name} in ${t}`);
    }
  }
}

const FIELD_LABEL = { science: 'science', literature: 'literature', music: 'music', film: 'film', sport: 'sport', activism: 'activism', religion: 'religion', history: 'history', philosophy: 'philosophy', business: 'business', leader: 'leadership', explorer: 'exploration', acting: 'acting' };
const era = y => y == null ? undefined : y < 500 ? 'ancient world' : y < 1500 ? 'Middle Ages' : y < 1800 ? '1500s to 1700s' : y < 1900 ? '1800s' : '1900s or later';
const yr = y => y < 0 ? `${-y} BC` : `${y}`;

function toItem(r, kind) {
  const names = [r.name, ...r.alt];
  const auto = [
    r.born != null && `Born in ${yr(r.born)}.`,
    r.nat && `Nationality: ${r.nat}.`,
    kind === 'artists' && `Style or movement: ${r.field}.`,
    r.verifiedFilms?.length >= 2 && `Films include ${r.verifiedFilms.slice(0, 2).join(' and ')}.`,
  ].filter(Boolean);
  const hand = r.clues.map(c => c + '.');
  const clues = [...hand.slice(0, -1), ...auto, hand[hand.length - 1]].filter(c => !leaks(c, names));
  if (clues.length < 5) note(`few clues ${kind}/${r.name}: ${clues.length}`);
  const facts = { born: r.born ?? undefined, died: r.died ?? undefined, nationality: r.nat, era: era(r.born) };
  if (kind === 'artists') facts.movement = r.field; else if (kind !== 'actors') facts.field = FIELD_LABEL[r.field] || r.field;
  if (kind === 'actors' && r.verifiedFilms.length) facts.films = r.verifiedFilms.join(', ');
  const life = r.born != null ? ` (${yr(r.born)}${r.died != null ? '–' + yr(r.died) : ''})` : '';
  return {
    id: slug(r.name), name: r.name, alt: r.alt, group: kind === 'artists' ? r.field : kind === 'actors' ? era(r.born) : FIELD_LABEL[r.field] || r.field,
    facts, blurb: `${r.name}${life}: ${r.clues[r.clues.length - 1].replace(/^(He|She|They) (was|is) /, '').replace(/^(He|She) /, '')}.`.replace(/: ([a-z])/, (m, c) => ': ' + c.toUpperCase()),
    clues, media: { img: r.img }, difficulty: r.d,
  };
}

function questions(items, kind) {
  const r = rng(kind);
  const qs = [];
  for (const it of items) {
    const last = it.clues[it.clues.length - 1];
    const pool = items.filter(x => x !== it && (x.group === it.group || r() < 0.3));
    qs.push({ id: `who-${it.id}`, kind: 'mc', prompt: `Who is this? ${last}`, answer: it.name, wrong: sample(r, pool, 3).map(x => x.name), explain: it.blurb, difficulty: it.difficulty, refs: [`${kind}/${it.id}`] });
    if (it.facts.born != null && it.facts.born > 0) {
      const wrong = sample(r, [-30, -20, -10, 10, 20, 30].map(d => it.facts.born + d).filter(y => y <= 2010), 3).map(String);
      qs.push({ id: `born-${it.id}`, kind: 'mc', prompt: `In which year was ${it.name} born?`, answer: String(it.facts.born), wrong, explain: it.blurb, difficulty: 3, refs: [`${kind}/${it.id}`] });
    }
  }
  return qs;
}

const common = {
  born: { type: 'year', label: 'Born', higherLabel: 'Born later', askHigh: 'Which of these people was born most recently?', askLow: 'Which of these people was born first?' },
  died: { type: 'year', label: 'Died', higherLabel: 'Died later', askHigh: 'Which of these people died most recently?', askLow: 'Which of these people died first?' },
  nationality: { type: 'cat', label: 'Nationality', exclusive: false, ask: 'What nationality is {name}?', stmt: '{name}’s nationality: {value}.' },
  era: { type: 'cat', label: 'Born in', ask: 'When was {name} born?', stmt: '{name} was born in the {value}.' },
};
const FIELD = { type: 'cat', label: 'Field', ask: 'What field is {name} best known for?', stmt: '{name} is best known for {value}.' };
const src = [{ name: 'Wikidata (birth/death dates, portraits)', url: 'https://www.wikidata.org' }, { name: 'Wikimedia Commons (portraits, licence-checked)', url: 'https://commons.wikimedia.org' }];
const packs = [
  ['people', 'Famous people', 'people', '🧑‍🔬', PEOPLE, { ...common, field: FIELD }],
  ['leaders', 'Leaders and rulers', 'people', '👑', LEADERS, { ...common, field: FIELD }],
  ['explorers', 'Explorers', 'people', '🧭', EXPLORERS, { ...common, field: FIELD }],
  ['artists', 'Artists', 'art', '🎨', ARTISTS, { ...common, movement: { type: 'cat', label: 'Movement', exclusive: false, ask: 'Which style or movement is {name} linked with?', stmt: '{name} is linked with {value}.' } }],
  ['actors', 'Actors', 'screen', '🎭', ACTORS, { ...common, films: { type: 'text', label: 'Known for' } }],
];
for (const [id, title, theme, icon, text, factsMeta] of packs) {
  const rows = await enrich(parse(text, id === 'actors'));
  if (id === 'actors') await castCheck(rows);
  const items = rows.filter(r => r.qid).map(r => toItem(r, id));
  const ids = new Set();
  for (const it of items) { if (ids.has(it.id)) throw new Error('dup id ' + it.id); ids.add(it.id); }
  writePack({ id, title, theme, icon, kids: false, version: 1, imgPrompt: 'Which of these is {name}?', nameImgPrompt: 'Who is this?', tfImgPrompt: 'This is {name}.', factsMeta, items, questions: questions(items, id), sources: src });
}
writeFileSync(join(ROOT, 'tools/c2_reports/people.txt'), report.join('\n') + '\n');
console.log(report.join('\n'));
