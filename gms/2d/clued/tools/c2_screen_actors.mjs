// Lane SCREEN: actors 84 → ~250. extendActors(pack) appends c2_src/actors_more.mjs with the same item shape and question
// templates as c2_build_people.mjs; birth year (Wikidata P569) and nationality (P27) must agree with the hand row or the
// actor is dropped. Portraits only from Commons with an allowed licence (c2_lib commonsImages). c2_gender runs afterwards.
import { wpQids, wdEntities, claims, wdYear, commonsImages, slug, leaks, rng, sample } from './c2_lib.mjs';
import { QID_ISO, demonymIsos } from './c2_screen_lib.mjs';
import { valueIsos } from './local_tags.mjs';
import { ACTORS_MORE } from './c2_src/actors_more.mjs';
import { ACTORS } from './c2_src/actors.mjs';

const OLD_IDS = new Set(ACTORS.trim().split('\n').map(l => slug(l.split('|')[1])));
// historical states → today's countries (citizenship check only)
const EXTRA = { Q174193: ['GBR', 'IRL'], Q161885: ['GBR'], Q179876: ['GBR'], Q28513: ['AUT', 'CZE', 'HUN'], Q15180: ['RUS'], Q8646: ['HKG', 'CHN'], Q148: ['CHN', 'HKG'], Q29999: ['NLD'], Q55: ['NLD'] };
const citIsos = ent => [...new Set(claims(ent, 'P27').flatMap(v => EXTRA[v.id] || [QID_ISO[v.id]]).filter(Boolean))];

export function stripActors(pack) {
  const gone = new Set(pack.items.filter(it => !OLD_IDS.has(it.id)).map(it => it.id));
  pack.items = pack.items.filter(it => !gone.has(it.id));
  pack.questions = pack.questions.filter(q => !(q.refs || []).some(r => gone.has(r.split('/')[1])));
  return pack;
}

export async function extendActors(pack, note = console.log) {
  const rows = ACTORS_MORE.trim().split('\n').map(l => {
    const [title, name, born, nat, d, films, clues, alt] = l.split('|');
    return { title, name, born: +born, nat, d: +d, films: films.split(';'), clues: clues.split(';'), alt: alt ? alt.split(';') : [] };
  });
  const q = await wpQids(rows.map(r => r.title));
  const ents = await wdEntities(Object.values(q).filter(Boolean));
  const ids = new Set(pack.items.map(i => i.id));
  const ok = [];
  for (const r of rows) {
    const drop = why => note(`DROPPED ${r.name}: ${why}`);
    r.qid = q[r.title];
    const e = ents[r.qid];
    if (!e) { drop('not on Wikidata'); continue; }
    const by = claims(e, 'P569').map(wdYear).filter(v => v != null);
    if (!by.includes(r.born)) { drop(`birth year: mine ${r.born}, Wikidata ${by.join(',') || '-'}`); continue; }
    const mine = [...new Set([...valueIsos(r.nat), ...demonymIsos(r.nat)])], wd = citIsos(e);
    const iso = mine.length ? mine : [];
    if (!iso.length || !iso.some(i => wd.includes(i) || (i === 'HKG' && wd.includes('CHN')))) { drop(`nationality: mine ${r.nat} (${iso.join(',') || '?'}), Wikidata ${wd.join(',') || '-'}`); continue; }
    if (!r.clues.at(-1).match(/^(He|She)\b/)) { drop('last clue has no He/She'); continue; }
    r.id = slug(r.name);
    if (ids.has(r.id)) { drop(`already in the pack (${r.id})`); continue; }
    ids.add(r.id);
    r.died = claims(e, 'P570').map(wdYear).filter(v => v != null)[0] ?? null;
    r.imgFile = claims(e, 'P18')[0];
    ok.push(r);
  }
  const imgs = await commonsImages(ok.map(r => r.imgFile).filter(Boolean), { maxDim: 640 });
  for (const r of ok) {
    const m = imgs[r.imgFile?.replace(/_/g, ' ')];
    if (m?.rejected) note(`portrait licence rejected ${r.name}: ${m.rejected}`);
    r.img = m && !m.rejected ? [m] : [];
    if (!r.img.length) note(`no portrait: ${r.name}`);
  }
  // films: the actor must be in the film's Wikidata cast (P161) or voice cast (P725)
  const fq = await wpQids([...new Set(ok.flatMap(r => r.films))]);
  const fe = await wdEntities(Object.values(fq).filter(Boolean), 'claims|labels');
  for (const r of ok) {
    r.verifiedFilms = [];
    for (const t of r.films) {
      const cast = [...(fe[fq[t]]?.claims?.P161 || []), ...(fe[fq[t]]?.claims?.P725 || [])].map(c => c.mainsnak.datavalue?.value?.id);
      if (cast.includes(r.qid)) r.verifiedFilms.push(t.replace(/\s*\((\d{4} )?(American |Disney |Hindi )?(film|miniseries|TV series)\)$/, ''));
      else note(`cast not confirmed: ${r.name} in ${t}`);
    }
  }
  const added = ok.map(r => toItem(r));
  pack.items.push(...added);
  note(`actors: ${pack.items.length - added.length} old + ${added.length} new (${rows.length - added.length} of ${rows.length} candidates dropped)`);
  for (const it of added) questions(pack, it);
  return pack;
}

// same shape as c2_build_people toItem(r, 'actors')
function toItem(r) {
  const names = [r.name, ...r.alt];
  const auto = [`Born in ${r.born}.`, r.nat && `Nationality: ${r.nat}.`, r.verifiedFilms.length >= 2 && `Films include ${r.verifiedFilms.slice(0, 2).join(' and ')}.`].filter(Boolean);
  const hand = r.clues.map(c => c + '.');
  const clues = [...hand.slice(0, -1), ...auto, hand[hand.length - 1]].filter(c => !leaks(c, names));
  const era = `${Math.floor(r.born / 10) * 10}s`;
  const facts = { born: r.born, died: r.died ?? undefined, nationality: r.nat, era };
  if (r.verifiedFilms.length) facts.films = r.verifiedFilms.join(', ');
  const life = ` (${r.born}${r.died != null ? '–' + r.died : ''})`;
  return {
    id: r.id, name: r.name, alt: r.alt, group: era, facts,
    blurb: `${r.name}${life}: ${r.clues[r.clues.length - 1].replace(/^(He|She|They) (was|is) /, '').replace(/^(He|She) /, '')}.`.replace(/: ([a-z])/, (m, c) => ': ' + c.toUpperCase()),
    clues, media: { img: r.img }, difficulty: r.d,
  };
}

function questions(pack, it) {
  const r = rng('actors+' + it.id);
  const last = it.clues[it.clues.length - 1];
  const pool = pack.items.filter(x => x !== it && (x.group === it.group || r() < 0.3));
  pack.questions.push({ id: `who-${it.id}`, kind: 'mc', prompt: `Who is this? ${last}`, answer: it.name, wrong: sample(r, pool, 3).map(x => x.name), explain: it.blurb, difficulty: it.difficulty, refs: [`actors/${it.id}`] });
  const wrong = sample(r, [-30, -20, -10, 10, 20, 30].map(d => it.facts.born + d).filter(y => y <= 2010), 3).map(String);
  pack.questions.push({ id: `born-${it.id}`, kind: 'mc', prompt: `In which year was ${it.name} born?`, answer: String(it.facts.born), wrong, explain: it.blurb, difficulty: 3, refs: [`actors/${it.id}`] });
}
