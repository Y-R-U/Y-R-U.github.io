#!/usr/bin/env node
// Lane DIRECTORS: people pack +writers, scientists & inventors, musicians, sport stars (c2_src/people_more.mjs), and the
// People sub-categories (pack.groupPacks → virtual packs people~<group>, see tools/build_index.mjs).
// Additive like c2_leaders_add: runs on the pack ON DISK and strips its own earlier additions first, so the builder's
// items are never regenerated. c2_build_people.mjs calls extendPeople() too.
//   node tools/c2_people_add.mjs     patch data/packs/people.json (then c2_gender runs; then build_index, local_tags)
// Checks: Wikipedia title → a human on Wikidata whose sex matches the last clue's He/She; born = Wikidata P569 (±1) and in
// the Wikipedia lead; died = P570 when the lead has it; portraits are Commons P18 with an allowed licence.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, PACKS, wpQids, wdEntities, claims, wdYear, commonsImages, writePack, slug, leaks, rng, sample } from './c2_lib.mjs';
import { wpLeads } from './c2_screen_lib.mjs';
import { PEOPLE } from './c2_src/people.mjs';
import { PEOPLE_MORE } from './c2_src/people_more.mjs';

const OLD_IDS = new Set(PEOPLE.trim().split('\n').map(l => slug(l.split('|')[1])));

// People › sub-categories. Only groups listed here become their own pack; the rest live in "All famous people".
export const GROUP_PACKS = {
  science: { title: 'Scientists & inventors', icon: '🔬' },
  literature: { title: 'Writers', icon: '✍️' },
  music: { title: 'Musicians', icon: '🎤' },
  sport: { title: 'Sport stars', icon: '🏅' },
};
// "All famous people": every people-theme pack, mixed (js/core/packs.js mergeView)
export const MERGE_PACK = { id: 'people~all', title: 'All famous people', icon: '🌟', of: ['people', 'actors', 'directors', 'leaders', 'explorers'] };

export function stripPeople(pack) {
  const gone = new Set(pack.items.filter(it => !OLD_IDS.has(it.id)).map(it => it.id));
  pack.items = pack.items.filter(it => !gone.has(it.id));
  pack.questions = pack.questions.filter(q => !(q.refs || []).some(r => gone.has(r.split('/')[1])));
  return pack;
}

const yr = y => (y < 0 ? `${-y} BC` : `${y}`);
const era = y => (y == null ? undefined : y < 500 ? 'ancient world' : y < 1500 ? 'Middle Ages' : y < 1800 ? '1500s to 1700s' : y < 1900 ? '1800s' : '1900s or later');
const hasYear = (text, y) => new RegExp(`(?<![\\d,.])${y}(?![\\d])`).test(text);

export async function extendPeople(pack, note = console.log) {
  pack.groupPacks = GROUP_PACKS;
  pack.mergePack = MERGE_PACK;
  const rows = PEOPLE_MORE.trim().split('\n').map(l => {
    const [title, name, born, nat, field, d, clues, alt] = l.split('|');
    return { title, name, born: born ? +born : null, nat, field, d: +d, clues: clues.split(';'), alt: alt ? alt.split(';') : [] };
  });
  const q = await wpQids(rows.map(r => r.title));
  const ents = await wdEntities(Object.values(q).filter(Boolean));
  const leads = await wpLeads(rows.map(r => r.title));
  const ids = new Set(pack.items.map(i => i.id));
  const ok = [];
  for (const r of rows) {
    const drop = why => note(`DROPPED ${r.name}: ${why}`);
    r.qid = q[r.title];
    const e = ents[r.qid];
    if (!e) { drop('not on Wikidata'); continue; }
    if (!claims(e, 'P31').some(v => v.id === 'Q5')) { drop(`not a human on Wikidata (P31 ${claims(e, 'P31').map(v => v.id).join(',')})`); continue; }
    const g = /^She\b/.test(r.clues.at(-1)) ? 'f' : /^He\b/.test(r.clues.at(-1)) ? 'm' : null;
    const sex = claims(e, 'P21').map(v => v.id);
    if (!g) { drop('last clue has no He/She'); continue; }
    if (sex.length && !sex.includes(g === 'f' ? 'Q6581072' : 'Q6581097')) { drop(`sex: clue ${g}, Wikidata ${sex.join(',')}`); continue; }
    r.id = slug(r.name);
    if (ids.has(r.id)) { drop(`already in the pack (${r.id})`); continue; }
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
    r.imgFile = claims(e, 'P18')[0];
    r.gender = g;
    ids.add(r.id);
    ok.push(r);
  }
  const imgs = await commonsImages(ok.map(r => r.imgFile).filter(Boolean), { maxDim: 640 });
  for (const r of ok) {
    const m = imgs[r.imgFile?.replace(/_/g, ' ')];
    if (m?.rejected) note(`portrait licence rejected ${r.name}: ${m.rejected}`);
    r.img = m && !m.rejected ? [m] : [];
    if (!r.img.length) note(`no portrait: ${r.name}`);
  }
  const added = ok.map(r => toItem(r, note));
  pack.items.push(...added);
  for (const it of added) questions(pack, it);
  const c = {};
  for (const it of pack.items) c[it.group] = (c[it.group] || 0) + 1;
  note(`people: ${pack.items.length - added.length} old + ${added.length} new; by group ${JSON.stringify(c)}`);
  return pack;
}

function toItem(r, note) {
  const names = [r.name, ...r.alt];
  const auto = [r.born != null && `Born in ${yr(r.born)}.`, r.nat && `Nationality: ${r.nat}.`].filter(Boolean);
  const hand = r.clues.map(c => c + '.');
  const clues = [...hand.slice(0, -1), ...auto, hand.at(-1)].filter(c => !leaks(c, names) || (note(`clue leaks the name, dropped ${r.name}: ${c}`), false));
  if (clues.at(-1) !== hand.at(-1)) note(`LAST CLUE LOST ${r.name}`);
  if (clues.length < 5) note(`few clues ${r.name}: ${clues.length}`);
  const life = r.born != null ? ` (${yr(r.born)}${r.died != null ? '–' + yr(r.died) : ''})` : r.died != null ? ` (died ${yr(r.died)})` : '';
  return {
    id: r.id, name: r.name, alt: r.alt, group: r.field,
    facts: { born: r.born ?? undefined, died: r.died ?? undefined, nationality: r.nat, era: era(r.born), field: r.field },
    blurb: `${r.name}${life}: ${r.clues.at(-1).replace(/^(He|She) (was|is) /, '').replace(/^(He|She) /, '')}.`.replace(/: ([a-z])/, (m, c) => ': ' + c.toUpperCase()),
    clues, media: { img: r.img }, difficulty: r.d, gender: r.gender,
  };
}

function questions(pack, it) {
  const r = rng('people+' + it.id);
  const pool = pack.items.filter(x => x !== it && x.group === it.group && x.gender === it.gender);
  const wrong = sample(r, pool.length >= 3 ? pool : pack.items.filter(x => x !== it && x.gender === it.gender), 3).map(x => x.name);
  pack.questions.push({ id: `who-${it.id}`, kind: 'mc', prompt: `Who is this? ${it.clues.at(-1)}`, answer: it.name, wrong, explain: it.blurb, difficulty: it.difficulty, refs: [`people/${it.id}`] });
  if (it.facts.born != null && it.facts.born > 0) {
    const w = sample(r, [-30, -20, -10, 10, 20, 30].map(d => it.facts.born + d).filter(y => y <= 2010), 3).map(String);
    pack.questions.push({ id: `born-${it.id}`, kind: 'mc', prompt: `In which year was ${it.name} born?`, answer: String(it.facts.born), wrong: w, explain: it.blurb, difficulty: 3, refs: [`people/${it.id}`] });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = [];
  const pack = stripPeople(JSON.parse(readFileSync(join(PACKS, 'people.json'), 'utf8')));
  await extendPeople(pack, s => report.push(s));
  writePack(pack);
  writeFileSync(join(ROOT, 'tools/c2_reports/people_more.txt'), report.join('\n') + '\n');
  (await import('./c2_gender.mjs')).run();
  console.log(report.join('\n'));
}
