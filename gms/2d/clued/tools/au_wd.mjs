// Wikidata facts for music acts: home country (ISO3) and act type. Cached in ~/.cache/clued-au/wd.json.
//   artists([{ name, link }]) -> Map(name -> { q, iso: ['GBR', 'AUS'], kind: 'human'|'group'|'', sex: 'm'|'f'|'' })
// Country: humans use citizenship (P27), the birth country first; groups use country of origin (P495), else the
// formation place's country (P740 -> P17). A Wikipedia link from the chart pages wins; bare names are tried as
// "Name", "Name (band)", "Name (singer)", … and accepted only when the entity looks like a music act.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const F = path.join(os.homedir(), '.cache/clued-au/wd.json');
const UA = 'CluedTriviaBuilder/1.0 (https://games.br8t.com/gms/2d/clued/)';
const db = fs.existsSync(F) ? JSON.parse(fs.readFileSync(F, 'utf8')) : {};
db.ent ||= {}; db.title ||= {}; db.iso ||= {}; db.place ||= {};
const save = () => fs.writeFileSync(F, JSON.stringify(db));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(u) {
  for (let i = 0; i < 6; i++) {
    try {
      const r = await fetch(u, { headers: { 'user-agent': UA } });
      if (r.ok) return r.json();
    } catch { /* retry */ }
    await sleep(1500 * (i + 1));
  }
  throw new Error('api failed ' + u.slice(0, 120));
}

// Wikipedia titles -> QIDs (redirects followed)
async function qids(titles) {
  const todo = [...new Set(titles.filter((t) => t && !(t in db.title)))];
  for (let i = 0; i < todo.length; i += 50) {
    const chunk = todo.slice(i, i + 50);
    const j = await api(`https://en.wikipedia.org/w/api.php?action=query&format=json&redirects=1&prop=pageprops&ppprop=wikibase_item&titles=${encodeURIComponent(chunk.join('|'))}`);
    const map = new Map(chunk.map((t) => [t, t]));
    for (const n of j.query?.normalized || []) for (const [k, v] of map) if (v === n.from) map.set(k, n.to);
    for (const r of j.query?.redirects || []) for (const [k, v] of map) if (v === r.from) map.set(k, r.to);
    const pages = Object.values(j.query?.pages || {});
    for (const [k, v] of map) { const p = pages.find((x) => x.title === v); db.title[k] = (p && !('missing' in p) && p.pageprops?.wikibase_item) || ''; }
    await sleep(150);
  }
}

const ids = (cl, p) => (cl[p] || []).filter((c) => c.rank !== 'deprecated' && c.mainsnak?.datavalue).sort((a, b) => (b.rank === 'preferred') - (a.rank === 'preferred')).map((c) => c.mainsnak.datavalue.value.id || c.mainsnak.datavalue.value);
async function entities(list, store, pick) {
  const todo = [...new Set(list.filter((q) => q && !(q in store)))];
  for (let i = 0; i < todo.length; i += 50) {
    const chunk = todo.slice(i, i + 50);
    const j = await api(`https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=claims&ids=${chunk.join('|')}`);
    for (const q of chunk) store[q] = pick(j.entities?.[q]?.claims || {});
    await sleep(150);
  }
}

const MUSIC = (cl) => ['P136', 'P264', 'P1303', 'P412', 'P358', 'P527', 'P463'].some((p) => cl[p]);
async function load(qs) {
  await entities(qs, db.ent, (cl) => ({
    p31: ids(cl, 'P31'), sex: ids(cl, 'P21')[0] || '', p27: ids(cl, 'P27'), p495: ids(cl, 'P495'), p740: ids(cl, 'P740'), p19: ids(cl, 'P19'), music: MUSIC(cl),
  }));
  const places = qs.flatMap((q) => [...(db.ent[q]?.p740 || []), ...(db.ent[q]?.p19 || [])]);
  await entities(places, db.place, (cl) => ids(cl, 'P17'));
  const countries = qs.flatMap((q) => { const e = db.ent[q] || {}; return [...e.p27 || [], ...e.p495 || [], ...[...e.p740 || [], ...e.p19 || []].flatMap((p) => db.place[p] || [])]; });
  await entities(countries, db.iso, (cl) => (cl.P298?.[0]?.mainsnak?.datavalue?.value) || '');
  save();
}

function info(q) {
  const e = db.ent[q];
  if (!e) return null;
  const human = e.p31.includes('Q5');
  const iso = (l) => [...new Set(l.map((c) => db.iso[c]).filter(Boolean))];
  let list;
  if (human) {
    const birth = iso((e.p19 || []).flatMap((p) => db.place[p] || []));
    const cit = iso(e.p27);
    list = cit.length ? [...cit.filter((c) => birth.includes(c)), ...cit.filter((c) => !birth.includes(c))] : birth;
  } else {
    list = iso(e.p495);
    if (!list.length) list = iso((e.p740 || []).flatMap((p) => db.place[p] || []));
  }
  return { q, iso: list, kind: human ? 'human' : e.music ? 'group' : '', sex: e.sex === 'Q6581097' ? 'm' : e.sex === 'Q6581072' ? 'f' : '' };
}

const SUFFIX = ['', ' (band)', ' (singer)', ' (musician)', ' (rapper)', ' (group)', ' (American band)', ' (British band)', ' (Australian band)', ' (entertainer)', ' (DJ)'];
const firstOf = (n) => n.split(/\s(?:&|and|x|vs\.?)\s|,\s/)[0].trim();
export async function artists(list) {
  const names = (n) => [...new Set([n, firstOf(n)])];
  const titles = list.flatMap(({ name, link }) => [...(link ? [link] : []), ...names(name).flatMap((nm) => SUFFIX.map((s) => nm + s))]);
  await qids(titles);
  const all = [...new Set(titles.map((t) => db.title[t]).filter(Boolean))];
  await load(all);
  const out = new Map();
  for (const { name, link } of list) {
    let hit = null;
    if (link && db.title[link]) hit = info(db.title[link]);
    if (!hit) {
      outer: for (const nm of names(name)) {
        for (const s of SUFFIX) {
          const q = db.title[nm + s];
          const i = q && info(q);
          if (i && (i.kind === 'group' || (i.kind === 'human' && db.ent[q].music))) { hit = i; break outer; }
        }
      }
    }
    out.set(name, hit);
  }
  return out;
}
