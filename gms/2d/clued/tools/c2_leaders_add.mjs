#!/usr/bin/env node
// Lane LEADERS: leaders 34 → ~200 (c2_src/leaders_more.mjs), plus country / role / came-to-power facts on every leader.
// Additive like c2_screen_add: run on the pack ON DISK, it strips its own earlier additions first, so the 34 builder
// items (and their questions) are never regenerated. c2_build_people.mjs calls extendLeaders() too, so a rebuild
// yields the same pack.
//   node tools/c2_leaders_add.mjs            patch data/packs/leaders.json (then rerun c2_gender + build_index)
// Checks (a failed check drops the fact, or the leader when it is the identity):
//   - the Wikipedia title resolves to a human on Wikidata whose sex matches the He/She of the last clue
//   - born: Wikidata P569 within a year (2 for BC) AND the year in the Wikipedia lead
//   - died: Wikidata P570, kept only when the Wikipedia lead has the year too
//   - came to power: a Wikidata P39 (position held) start year, or the year in the infobox reign/term lines
//   - nationality: P27 citizenship agrees for anyone born after 1700 (reported, see tools/c2_reports/leaders.txt)
//   - clue years/numbers must appear in the article text (reported for a hand check)
// Difficulty = fame: Wikidata sitelinks + English Wikipedia pageviews (Sep 2025 – Aug 2026), as percentiles.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, PACKS, fetchJSON, wpQids, wdEntities, claims, wdYear, commonsImages, writePack, slug, leaks, rng, sample } from './c2_lib.mjs';
import { sitelinkCounts, wpLeads, wpInfobox, QID_ISO, demonymIsos } from './c2_screen_lib.mjs';
import { valueIsos } from './local_tags.mjs';
import { LEADERS_MORE, LEADERS_FACTS, LEADERS_IMG } from './c2_src/leaders_more.mjs';
import { LEADERS } from './c2_src/people.mjs';

const OLD_IDS = new Set(LEADERS.trim().split('\n').map(l => slug(l.split('|')[1])));
const ROLE = { M: 'Monarch', P: 'President', PM: 'Prime minister' };
const PV = ['2025090100', '2026083100'];

export const LEADER_META = {
  country: { type: 'cat', label: 'Country led', noun: 'country or empire led', ask: 'Which country or empire did {name} lead?', askReverse: 'Who led this country or empire: {value}?', stmt: '{name} led this country or empire: {value}.' },
  role: { type: 'cat', label: 'Role', noun: 'role', ask: 'Which role did {name} hold?', askReverse: 'Which of these leaders was a {lvalue}?', stmt: '{name} was a {lvalue}.' },
  start: { type: 'year', label: 'Came to power', noun: 'year they came to power', higherLabel: 'Came to power later', askHigh: 'Which of these leaders came to power most recently?', askLow: 'Which of these leaders came to power first?', askNumber: 'In what year did {name} first come to power?' },
};

export function stripLeaders(pack) {
  const gone = new Set(pack.items.filter(it => !OLD_IDS.has(it.id)).map(it => it.id));
  pack.items = pack.items.filter(it => !gone.has(it.id));
  pack.questions = pack.questions.filter(q => !(q.refs || []).some(r => gone.has(r.split('/')[1])));
  for (const it of pack.items) for (const k of Object.keys(LEADER_META)) delete it.facts[k];
  return pack;
}

const yrText = y => (y < 0 ? `${-y} BC` : String(y));
// "550 BC" / "c. 550 BC" / "1849" in plain text
const hasYear = (text, y) => (y < 0 ? new RegExp(`\\b${-y}\\s*(BC|BCE)\\b`).test(text) : new RegExp(`(?<![\\d,.])${y}(?![\\d])`).test(text));

const EXTRA = { Q174193: ['GBR', 'IRL'], Q161885: ['GBR'], Q179876: ['GBR'], Q15180: ['RUS', 'UKR', 'GEO'], Q34266: ['RUS'], Q28513: ['AUT', 'CZE', 'HUN'], Q131964: ['AUT'], Q83286: ['SRB'], Q33946: ['CZE'], Q16957: ['DEU'], Q713750: ['DEU'], Q43287: ['DEU'], Q12560: ['TUR'], Q13426199: ['ZAF'], Q29999: ['NLD'] };
const citIsos = ent => [...new Set(claims(ent, 'P27').flatMap(v => EXTRA[v.id] || [QID_ISO[v.id]]).filter(Boolean))];

async function pageviews(title) {
  try {
    const j = await fetchJSON(`https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia.org/all-access/user/${encodeURIComponent(title.replace(/ /g, '_'))}/monthly/${PV[0]}/${PV[1]}`);
    return (j.items || []).reduce((s, x) => s + x.views, 0);
  } catch { return 0; }
}
async function articleText(title) {
  const j = await fetchJSON('https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&redirects=1&format=json&formatversion=2&titles=' + encodeURIComponent(title));
  return j.query.pages[0]?.extract || '';
}

export function parseRows(text = LEADERS_MORE) {
  return text.trim().split('\n').map(l => {
    const [title, name, born, nat, country, role, start, clues, alt] = l.split('|');
    return { title, name, born: born === '' ? null : +born, nat, country: country || null, role: ROLE[role] || null, start: start === '' ? null : +start, clues: clues.split(';'), alt: alt ? alt.split(';') : [] };
  });
}

// Fame score per qid: mean percentile of log(sitelinks) and log(pageviews) across every leader.
async function fame(all) {
  const sl = await sitelinkCounts(all.map(x => x.qid));
  for (const x of all) { x.sl = sl[x.qid] || 0; x.pv = x.wpTitle ? await pageviews(x.wpTitle) : 0; }
  const pct = key => { const s = all.map(x => x[key]).sort((a, b) => a - b); return v => s.filter(y => y < v).length / Math.max(1, s.length - 1); };
  const ps = pct('sl'), pp = pct('pv');
  for (const x of all) x.score = (ps(x.sl) + pp(x.pv)) / 2;
}
// top ~quarter easy, the next third medium; the 34 hand-rated originals keep their levels (agreement in the report)
const T1 = 0.8, T2 = 0.45;
export const levelOf = score => (score >= T1 ? 1 : score >= T2 ? 2 : 3);

export async function extendLeaders(pack, note = console.log) {
  pack.factsMeta = { ...pack.factsMeta, ...LEADER_META };
  const rows = parseRows();
  const oldRows = pack.items.map(it => ({ title: null, id: it.id, name: it.name, old: it }));
  const q = await wpQids(rows.map(r => r.title));
  const ents = await wdEntities(Object.values(q).filter(Boolean));
  const ids = new Set(pack.items.map(i => i.id));
  const ok = [];
  const leads = await wpLeads(rows.map(r => r.title));
  for (const r of rows) {
    const drop = why => note(`DROPPED ${r.name}: ${why}`);
    r.qid = q[r.title];
    const e = ents[r.qid];
    if (!e) { drop('not on Wikidata'); continue; }
    if (!claims(e, 'P31').some(v => v.id === 'Q5')) { drop('not a human on Wikidata'); continue; }
    const g = /^She\b/.test(r.clues.at(-1)) ? 'f' : /^He\b/.test(r.clues.at(-1)) ? 'm' : null;
    if (!g) { drop('last clue has no He/She'); continue; }
    const sex = claims(e, 'P21').map(v => v.id);
    if (sex.length && !sex.includes(g === 'f' ? 'Q6581072' : 'Q6581097')) { drop(`sex: clue ${g}, Wikidata ${sex.join(',')}`); continue; }
    r.id = slug(r.name);
    if (ids.has(r.id)) { drop(`already in the pack (${r.id})`); continue; }
    r.wpTitle = e.sitelinks?.enwiki?.title || r.title;
    const lead = leads[r.title] || '';
    const by = claims(e, 'P569').map(wdYear).filter(v => v != null);
    if (r.born != null) {
      const tol = r.born < 0 ? 2 : 1;
      const wd = by.find(y => Math.abs(y - r.born) <= tol);
      if (wd == null) { note(`born dropped ${r.name}: mine ${yrText(r.born)}, Wikidata ${by.map(yrText).join(',') || '-'}`); r.born = null; }
      else if (!hasYear(lead.slice(0, 600), r.born)) { note(`born dropped ${r.name}: ${yrText(r.born)} not in the Wikipedia lead`); r.born = null; }
    }
    const dy = claims(e, 'P570').map(wdYear).filter(v => v != null);
    r.died = dy.length && hasYear(lead.slice(0, 600), dy[0]) ? dy[0] : null;
    // Bronze Age dates hang on which chronology is used (Hammurabi 1792 or 1696 BC): left out, as c2_test expects
    if (r.died != null && r.died < -800) { note(`died left out ${r.name}: ${yrText(r.died)} depends on the chronology`); r.died = null; }
    if (r.start != null && r.start < -800) { note(`start left out ${r.name}: ${yrText(r.start)} depends on the chronology`); r.start = null; }
    if (dy.length && r.died == null) note(`died left out ${r.name}: Wikidata ${dy.map(yrText).join(',')}, not in the Wikipedia lead`);
    if (r.start != null) {
      const p39 = (e.claims?.P39 || []).flatMap(c => (c.qualifiers?.P580 || []).map(s => wdYear(s.datavalue?.value))).filter(v => v != null);
      let okStart = p39.includes(r.start);
      if (!okStart) {
        const ib = (await wpInfobox(r.title)).split('\n').filter(l => /reign|term_start|term1|succession|rule|predecessor|_start|order/i.test(l)).join('\n');
        okStart = hasYear(ib.replace(/<[^>]+>|\[\[|\]\]|\{\{|\}\}/g, ' '), r.start) || (r.start < 0 && new RegExp(`\\b${-r.start}\\b`).test(ib));
        if (okStart) note(`start ${r.name} ${yrText(r.start)}: infobox only (Wikidata P39 starts ${[...new Set(p39)].map(yrText).join(',') || '-'})`);
      }
      if (!okStart) { note(`start dropped ${r.name}: ${yrText(r.start)} not confirmed`); r.start = null; }
    }
    if (r.born == null || r.born >= 1700) {
      const mine = [...new Set([...valueIsos(r.nat), ...demonymIsos(r.nat)])], wd = citIsos(e);
      if (mine.length && wd.length && !mine.some(i => wd.includes(i))) note(`nationality check ${r.name}: mine ${r.nat} (${mine.join(',')}), Wikidata ${wd.join(',')}`);
      if (!mine.length) note(`nationality unmapped for local tags: ${r.name} (${r.nat})`);
    }
    r.imgFile = r.id in LEADERS_IMG ? LEADERS_IMG[r.id] || null : claims(e, 'P18')[0];
    ids.add(r.id);
    ok.push(r);
  }
  // clue numbers must appear in the article (hand-check list, not a drop)
  for (const r of ok) {
    const text = await articleText(r.title);
    for (const c of r.clues) for (const n of c.match(/\b\d[\d,]*\b/g) || []) if (!text.includes(n) && !text.includes(n.replace(/,/g, ''))) note(`clue number not in article ${r.name}: "${n}" in: ${c}`);
  }
  const imgs = await commonsImages(ok.map(r => r.imgFile).filter(Boolean), { maxDim: 640 });
  for (const r of ok) {
    const m = imgs[r.imgFile?.replace(/_/g, ' ')];
    if (m?.rejected) note(`portrait licence rejected ${r.name}: ${m.rejected}`);
    r.img = m && !m.rejected ? [m] : [];
    if (!r.img.length) note(`no portrait: ${r.name}`);
  }
  // fame for new + old together, so the levels line up
  const oq = await wpQids(LEADERS.trim().split('\n').map(l => l.split('|')[0]));
  const oe = await wdEntities(Object.values(oq).filter(Boolean));
  for (const o of oldRows) {
    const t = LEADERS.trim().split('\n').find(l => slug(l.split('|')[1]) === o.id)?.split('|')[0];
    o.qid = oq[t]; o.wpTitle = oe[o.qid]?.sitelinks?.enwiki?.title || t;
  }
  await fame([...ok, ...oldRows]);
  let agree = 0;
  for (const o of oldRows) { const d = levelOf(o.score); if (d === o.old.difficulty) agree++; else note(`fame level differs (kept hand level) ${o.name}: hand ${o.old.difficulty}, fame ${d} (score ${o.score.toFixed(2)}, ${o.sl} sitelinks, ${o.pv} views)`); }
  note(`fame levels agree with ${agree}/${oldRows.length} hand-rated originals (T1 ${T1}, T2 ${T2})`);
  for (const r of ok) r.d = levelOf(r.score);
  // facts for the originals
  for (const it of pack.items) {
    const f = LEADERS_FACTS[it.id];
    if (f == null) continue;
    const [country, role, start] = f.split('|');
    if (country) it.facts.country = country;
    if (role) it.facts.role = ROLE[role];
    if (start) it.facts.start = +start;
  }
  const added = ok.map(r => toItem(r, note));
  pack.items.push(...added);
  note(`leaders: ${pack.items.length - added.length} old + ${added.length} new (${rows.length - added.length} of ${rows.length} candidates dropped)`);
  for (const it of added) questions(pack, it);
  for (const r of ok) note(`fame ${r.name}: d${r.d} score ${r.score.toFixed(2)} (${r.sl} sitelinks, ${r.pv} views)`);
  return pack;
}

const era = y => (y == null ? undefined : y < 500 ? 'ancient world' : y < 1500 ? 'Middle Ages' : y < 1800 ? '1500s to 1700s' : y < 1900 ? '1800s' : '1900s or later');

// same shape as c2_build_people toItem(r, 'leaders'), plus country / role / start
function toItem(r, note) {
  const names = [r.name, ...r.alt];
  const auto = [r.born != null && `Born in ${yrText(r.born)}.`, r.nat && `Nationality: ${r.nat}.`].filter(Boolean);
  const hand = r.clues.map(c => c + '.');
  const clues = [...hand.slice(0, -1), ...auto, hand[hand.length - 1]].filter(c => !leaks(c, names) || (note(`clue leaks the name, dropped ${r.name}: ${c}`), false));
  if (clues.at(-1) !== hand.at(-1)) note(`LAST CLUE LOST ${r.name}`);
  const facts = { born: r.born ?? undefined, died: r.died ?? undefined, nationality: r.nat, era: era(r.born), field: 'leadership' };
  if (r.country) facts.country = r.country;
  if (r.role) facts.role = r.role;
  if (r.start != null) facts.start = r.start;
  const life = r.born != null ? ` (${yrText(r.born)}${r.died != null ? '–' + yrText(r.died) : ''})` : r.died != null ? ` (died ${yrText(r.died)})` : '';
  return {
    id: r.id, name: r.name, alt: r.alt, group: 'leadership', facts,
    blurb: `${r.name}${life}: ${r.clues[r.clues.length - 1].replace(/^(He|She|They) (was|is) /, '').replace(/^(He|She) /, '')}.`.replace(/: ([a-z])/, (m, c) => ': ' + c.toUpperCase()),
    clues, media: { img: r.img }, difficulty: r.d,
  };
}

function questions(pack, it) {
  const r = rng('leaders+' + it.id);
  const last = it.clues[it.clues.length - 1];
  const pool = pack.items.filter(x => x !== it);
  pack.questions.push({ id: `who-${it.id}`, kind: 'mc', prompt: `Who is this? ${last}`, answer: it.name, wrong: sample(r, pool, 3).map(x => x.name), explain: it.blurb, difficulty: it.difficulty, refs: [`leaders/${it.id}`] });
  if (it.facts.born != null && it.facts.born > 0) {
    const wrong = sample(r, [-30, -20, -10, 10, 20, 30].map(d => it.facts.born + d).filter(y => y <= 2010), 3).map(String);
    pack.questions.push({ id: `born-${it.id}`, kind: 'mc', prompt: `In which year was ${it.name} born?`, answer: String(it.facts.born), wrong, explain: it.blurb, difficulty: 3, refs: [`leaders/${it.id}`] });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = [];
  const pack = stripLeaders(JSON.parse(readFileSync(join(PACKS, 'leaders.json'), 'utf8')));
  await extendLeaders(pack, s => report.push(s));
  writePack(pack);
  writeFileSync(join(ROOT, 'tools/c2_reports/leaders.txt'), report.join('\n') + '\n');
  (await import('./c2_gender.mjs')).run();
  console.log(report.filter(l => !/^fame /.test(l)).join('\n'));
}
