#!/usr/bin/env node
// Builds C1 packs: tools/c1_src/<id>.mjs (hand-checked content) + iNaturalist/Wikidata/Commons media → data/packs/<id>.json
// Usage: node tools/c1_build.mjs [packId…]   (no args = every source)
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  TOOLS, ROOT, slug, inatTaxon, inatPrefetch, inatPhotos, inatRanks, sparql, wdByEnwiki, wdEntities, claimVals,
  commonsInfo, commonsAudioMp3, commonsDepicts, commonsAudioSearch, nasaSearch, readJSON, writeJSON,
} from './c1_lib.mjs';
import { validatePack, leakStems, findLeak } from './c1_schema.mjs';

const SRC = join(TOOLS, 'c1_src');
const MIRROR = readJSON(join(ROOT, 'media/mirror.json'), {});
const SKIP = readJSON(join(TOOLS, 'c1_src/_skip.json'), {});
const mir = m => (MIRROR[m.src] ? { ...m, src: MIRROR[m.src] } : m);
const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const ids = (args.length ? args : readdirSync(SRC).filter(f => f.endsWith('.mjs') && !f.startsWith('_')).map(f => f.replace(/\.mjs$/, '')))
  .sort((a, b) => (a === 'kids-nature') - (b === 'kids-nature')); // kids-nature reuses media from the others

const LABEL_ALIAS = { "People's Republic of China": 'China', England: 'United Kingdom', Scotland: 'United Kingdom', Wales: 'United Kingdom', 'Kingdom of Great Britain': 'United Kingdom', 'Great Britain': 'United Kingdom', 'United States of America': 'United States', Alaska: 'United States', Rhodesia: 'Zimbabwe', 'Arabian Peninsula': 'Middle East', 'Empire of Japan': 'Japan', 'Russian Empire': 'Russia', 'Soviet Union': 'Russia' };
// First words that must stay capitalised mid-sentence (lane A lowers only the first letter by default).
const PROPER = /^(\p{Lu}[\p{L}-]*'s|Australian|African|Asian|American|European|Eurasian|Indian|Egyptian|Japanese|Chinese|German|French|English|Scottish|Irish|Welsh|British|Siberian|Mexican|Brazilian|Chilean|Malayan|Burmese|Bornean|Tasmanian|Sydney|Mozambique|Cape|Gaboon|Nile|Atlantic|Pacific|Arctic|Galápagos|Greenland|Port|Moreton|Norway|Norfolk|Canada|California|Colorado|Virginia|Ulysses|Christmas|St|Saint|Komodo|Gila|Goliath|Hercules|Atlas|Bogong|Wollemi|Joshua|Gouldian|Andean|Darwin|Lego|Velcro|Benz|Watt|Rubik's|Hills|Post-it|London|Monterey|Mediterranean|Bactrian|Malagasy|Old|Major|Kodiak|Venus|Indo-Pacific|Sturt's|Moorish|Spanish)$/u;
function lnameOf(S, it) {
  if (it.ln) return it.ln;
  if (S.lname === 'asis') return it.n;
  const first = it.n.split(/\s+/)[0];
  if (PROPER.test(first)) return it.n;
  return null;
}
const fmtNum = v => (v >= 100 ? Math.round(v).toLocaleString('en-GB') : String(+v.toPrecision(2)));
const STATUS = {
  Q211005: 'Least concern', Q719675: 'Near threatened', Q278113: 'Vulnerable', Q11394: 'Endangered',
  Q219127: 'Critically endangered', Q239509: 'Extinct in the wild', Q237350: 'Extinct', Q3245245: 'Data deficient',
};

export function factClues(pack, facts) {
  const out = [];
  for (const [k, v] of Object.entries(facts || {})) {
    const m = pack.factsMeta?.[k];
    if (!m || m.noClue || v == null) continue;
    if (m.clue) { const c = m.clue(v); if (c) out.push(c); continue; }
    if (m.type === 'bool') out.push(v ? (m.yesClue || m.yes || m.label) : (m.noClue2 || m.no || 'Not ' + m.label.toLowerCase()));
    else if (m.type === 'num') out.push(`${m.label}: about ${fmtNum(v)}${m.unit ? (m.unit.length > 2 ? ' ' : ' ') + m.unit : ''}.`);
    else if (m.type === 'year') out.push(`${m.label}: ${v < 0 ? -v + ' BC' : v}.`);
    else if (m.type === 'cat') out.push(`${m.label}: ${Array.isArray(v) ? v.join(', ') : v}.`);
  }
  return out;
}

function letterClue(name) {
  const words = name.replace(/[()]/g, '').split(/[\s-]+/).filter(Boolean);
  if (words.length === 1) return `The answer is one word of ${words[0].replace(/[^\p{L}\p{N}]/gu, '').length} letters.`;
  return `The answer has ${words.length} words (${words.map(w => w.replace(/[^\p{L}\p{N}]/gu, '').length).join(', ')} letters).`;
}

async function wdTaxa(names) {
  const out = {};
  const uniq = [...new Set(names.filter(Boolean))];
  for (let i = 0; i < uniq.length; i += 60) {
    const part = uniq.slice(i, i + 60);
    const vals = part.map(n => JSON.stringify(n)).join(' ');
    const rows = await sparql(`SELECT ?item ?name ?status ?audio ?len ?mass ?life WHERE {
      VALUES ?name { ${vals} } ?item wdt:P225 ?name .
      OPTIONAL { ?item wdt:P141 ?status } OPTIONAL { ?item wdt:P51 ?audio }
      OPTIONAL { ?item p:P2043/psn:P2043/wikibase:quantityAmount ?len }
      OPTIONAL { ?item p:P2067/psn:P2067/wikibase:quantityAmount ?mass }
      OPTIONAL { ?item p:P2250/psn:P2250/wikibase:quantityAmount ?life } }`);
    for (const r of rows) {
      const o = out[r.name] ||= { qid: r.item.split('/').pop(), status: new Set(), audio: new Set(), len: [], mass: [], life: [] };
      if (r.status) o.status.add(r.status.split('/').pop());
      if (r.audio) o.audio.add(decodeURIComponent(r.audio.split('/').pop()).replace(/_/g, ' '));
      if (r.len) o.len.push(+r.len); if (r.mass) o.mass.push(+r.mass); if (r.life) o.life.push(+r.life / 31557600);
    }
  }
  return out;
}

async function buildPack(id) {
  const mod = await import(pathToFileURL(join(SRC, id + '.mjs')).href + '?t=' + Date.now());
  const S = mod.default;
  const warn = [];
  const items = [];
  const photosWanted = S.photos ?? 3;
  const mediaMode = S.media || 'inat';
  const idOf = it => it.id || slug(it.n);
  const nameToId = new Map(S.items.map(it => [it.n.toLowerCase(), idOf(it)]));
  for (const it of S.items) for (const a of it.alt || []) if (!nameToId.has(a.toLowerCase())) nameToId.set(a.toLowerCase(), idOf(it));

  await inatPrefetch(S.items.filter(it => (it.media || mediaMode) === 'inat' || (S.autoTaxo && it.sci)).map(it => it.inat || it.sci));
  const wd = (S.status || S.audio || S.wdCheck) ? await wdTaxa(S.items.map(it => it.sci)) : {};
  // Kids-level items in iNat packs get the curated Wikipedia lead photo first (wikiD1), then iNat photos.
  const wikiFirst = it => (it.media || mediaMode) === 'wiki' || (S.wikiD1 && it.d === 1) || S.wikiAll || it.wikiFirst;
  const wikiTitles = S.items.filter(it => wikiFirst(it) || it.wp || it.files).map(it => it.wp || it.n);
  const wdWiki = wikiTitles.length ? await wdByEnwiki(wikiTitles) : {};
  const pageImgs = {};
  if (S.pageImage !== false) for (const [t, e] of Object.entries(wdWiki)) if (e._pageimage) pageImgs[t] = e._pageimage;
  // labels for Wikidata label cross-checks
  const labelIds = new Set();
  for (const e of Object.values(wdWiki)) for (const p of Object.values(S.wdCheckLabel || {})) for (const v of claimVals(e, p)) if (v.id) labelIds.add(v.id);
  const labelEnts = labelIds.size ? await wdEntities([...labelIds]) : {};
  const labelOf = q => labelEnts[q]?.labels?.en?.value;
  const qidEnt = await wdEntities(S.items.filter(it => it.qid).map(it => it.qid));

  // collect commons files first, then one batched licence lookup
  const plan = [];
  for (const it of S.items) {
    const mode = it.media || mediaMode;
    const files = [...(it.files || [])];
    let ent = null;
    if (it.qid) ent = qidEnt[it.qid];
    else if (wikiFirst(it) || it.wp) {
      ent = wdWiki[it.wp || it.n];
      if (!ent) warn.push(`${idOf(it)}: no Wikidata entity for enwiki "${it.wp || it.n}"`);
    }
    if (S.depicts && mode === 'wiki' && ent?.id && !it.noAutoImg) {
      it._depicts = (await commonsDepicts(ent.id, 8).catch(() => [])).slice(0, S.depicts + 2);
    }
    if (wikiFirst(it) && !it.noAutoImg) {
      for (const f of claimVals(ent, 'P18')) files.push(f);
      const pi = pageImgs[it.wp || it.n]; if (pi) files.push(pi.replace(/_/g, ' '));
    }
    for (const d of it._depicts || []) files.push(d);
    plan.push({ it, mode, files: [...new Set(files.map(f => f.replace(/_/g, ' ')))], ent });
  }
  const allFiles = plan.flatMap(p => p.files);
  const audioFiles = S.audio ? S.items.flatMap(it => [...(it.audio || []), ...((wd[it.sci]?.audio) ? [...wd[it.sci].audio] : [])]) : [];
  const info = await commonsInfo([...allFiles, ...audioFiles]);

  for (const { it, mode, files, ent } of plan) {
    const iid = idOf(it);
    const item = { id: iid, name: it.n };
    let ln = lnameOf(S, it);
    if (!it.ln && S.lnamePrefix) ln = S.lnamePrefix + (ln || it.n.charAt(0).toLowerCase() + it.n.slice(1));
    if (ln && ln !== it.n.charAt(0).toLowerCase() + it.n.slice(1)) item.lname = ln;
    for (const k of ['imgPrompt', 'nameImgPrompt', 'tfImgPrompt']) if (it[k]) item[k] = it[k];
    if (it.alt?.length) item.alt = it.alt;
    if (it.sci) item.sci = it.sci;
    if (it.g) item.group = it.g;
    const facts = { ...(it.f || {}) };
    let taxon = null, ranks = {};
    if (mode === 'inat' || (S.autoTaxo && it.sci)) {
      taxon = await inatTaxon(it.inat || it.sci).catch(e => (warn.push(`${iid}: iNat error ${e.message}`), null));
      if (!taxon) warn.push(`${iid}: iNat taxon not found for "${it.inat || it.sci}"`);
      else ranks = inatRanks(taxon);
    }
    const w = wd[it.sci];
    if (S.status && w && !('status' in facts)) {
      const st = [...w.status].map(q => STATUS[q]).filter(Boolean);
      if (st.length === 1) facts.status = st[0];
    }
    if (S.wdCheck && w) {
      for (const [k, prop] of Object.entries(S.wdCheck)) {
        const vals = { P2043: w.len, P2067: w.mass, P2250: w.life }[prop] || [];
        if (!vals.length || facts[k] == null) continue;
        const ok = vals.some(v => v > 0 && facts[k] / v < 3 && v / facts[k] < 3);
        if (!ok) warn.push(`${iid}: ${k}=${facts[k]} disagrees with Wikidata ${prop} ${vals.map(v => +v.toPrecision(3)).join('/')}`);
      }
    }
    if (S.wdP31 && ent && !claimVals(ent, 'P31').some(v => S.wdP31.includes(v.id))) warn.push(`${iid}: Wikidata ${ent.id} is not an instance of ${S.wdP31.join('/')} (wrong article?)`);
    for (const [k, prop] of Object.entries(S.wdCheckNum || {})) {
      if (facts[k] == null || !ent) continue;
      const vals = claimVals(ent, prop).map(v => parseFloat(v.amount ?? v)).filter(isFinite);
      const ups = claimVals(ent, prop).map(v => parseFloat(v.upperBound)).filter(isFinite), los = claimVals(ent, prop).map(v => parseFloat(v.lowerBound)).filter(isFinite);
      if (!vals.length) { warn.push(`${iid}: no Wikidata ${prop} to check ${k}`); continue; }
      const tol = S.wdCheckTol?.[k] ?? 0.5;
      const ok = vals.some(v => Math.abs(v - facts[k]) <= tol) || ups.some((u, i) => facts[k] <= u + tol && facts[k] >= (los[i] ?? u) - tol);
      if (!ok) warn.push(`${iid}: ${k}=${facts[k]} vs Wikidata ${prop} ${vals.join('/')}`);
    }
    for (const [k, prop] of Object.entries(S.wdCheckLabel || {})) {
      if (facts[k] == null || !ent) continue;
      const labels = claimVals(ent, prop).map(v => labelOf(v.id)).filter(Boolean).map(l => LABEL_ALIAS[l] || l);
      const mine = [].concat(facts[k]).map(x => String(x).toLowerCase());
      if (labels.length && !labels.some(l => mine.includes(l.toLowerCase()))) warn.push(`${iid}: ${k}="${facts[k]}" vs Wikidata ${prop}: ${labels.join(' / ')}`);
      if (!labels.length) warn.push(`${iid}: no Wikidata ${prop} to check ${k}`);
    }
    for (const [k, [lo, hi]] of Object.entries(S.ranges || {})) {
      if (facts[k] != null && (facts[k] < lo || facts[k] > hi)) throw new Error(`${id}/${iid}: ${k}=${facts[k]} outside [${lo},${hi}]`);
    }
    if (Object.keys(facts).length) item.facts = facts;
    if (it.look?.length) item.lookalikes = it.look.map(l => nameToId.get(l.toLowerCase()) || l);
    if (it.b) item.blurb = it.b;

    // clue ladder: taxonomy (hardest) → hand clues with fact clues mid-way → letters → initial
    const stems = leakStems([it.n, ...(it.alt || [])], S.leakExempt || []);
    const hand = it.c || [];
    if (hand.length || S.clueAlways) {
      const taxo = [];
      for (const r of S.autoTaxo || []) {
        const v = ranks[r] || (r === 'genus' && it.sci ? it.sci.split(' ')[0] : null);
        if (v && !(r === 'genus' && it.sci && !it.sci.includes(' '))) taxo.push(`${r[0].toUpperCase() + r.slice(1)}: ${v}.`);
      }
      const hardF = Object.fromEntries(Object.entries(facts).filter(([k]) => S.factsMeta?.[k]?.hard));
      const midF = Object.fromEntries(Object.entries(facts).filter(([k]) => !S.factsMeta?.[k]?.hard));
      const fcHard = S.noFactClues ? [] : factClues(S, hardF);
      const fc = S.noFactClues ? [] : [...(S.factClue ? S.factClue(facts, it) : factClues(S, midF)), ...fcHard];
      const half = Math.ceil(hand.length / 2);
      let clues = [...fcHard, ...taxo, ...hand.slice(0, half), ...fc.filter(c => !fcHard.includes(c)), ...hand.slice(half)];
      clues = clues.filter(c => { const s = findLeak(c, stems); if (s && hand.includes(c)) warn.push(`${iid}: hand clue leaks "${s}": ${c}`); return !s; });
      clues = [...new Set(clues)];
      const tail = [letterClue(it.n), `Its first letter is ${it.n.trim()[0].toUpperCase()}.`];
      const max = 12 - tail.length;
      while (clues.length > max) {
        // drop fact clues first (from the middle), then the hardest taxonomy clue
        const fi = clues.findIndex(c => fc.includes(c));
        clues.splice(fi >= 0 ? fi : 0, 1);
      }
      clues.push(...tail);
      if (clues.length < 8) warn.push(`${iid}: only ${clues.length} clues`);
      item.clues = clues;
    }

    // media
    const skipPages = SKIP[id]?.[iid] || [];
    const img = [];
    for (const f of files) {
      const m = info[f];
      if (m === null) { warn.push(`${iid}: rejected Commons file (licence) ${f}`); continue; }
      if (!m) { warn.push(`${iid}: Commons file not found ${f}`); continue; }
      if (/svg|gif/.test(m._mime) && !it.allowSvg) continue;
      if (skipPages.includes(m.page)) continue;
      if (!img.some(x => x.src === m.src)) img.push(m);
    }
    if (it.nasa) img.push(...(await nasaSearch(it.nasa, photosWanted)));
    if ((mode === 'inat' || it.inatPhotos) && taxon) {
      const ph = await inatPhotos(taxon, photosWanted, { skip: [...(it.skip || []), ...skipPages.map(u => (u.match(/inaturalist\.org\/photos\/(\d+)/) || [])[1]).filter(Boolean)] });
      img.push(...ph);
    }
    if (it.skipFiles) for (const s of it.skipFiles) { const i = img.findIndex(x => x.page?.includes(encodeURIComponent(s.replace(/ /g, '_'))) || x.src.includes(s)); if (i >= 0) img.splice(i, 1); }
    const media = {};
    const cap = SKIP[id]?._max?.[iid] ?? photosWanted;
    if (img.length) media.img = img.slice(0, cap).map(({ src, w, h, credit, license, page }) => mir({ src, w, h, credit, license, page }));
    else if (!S.noImages) warn.push(`${iid}: no images`);
    if (S.audio) {
      // Wikidata sometimes links a generic soundscape; keep only files whose title names this species
      const words = [...(it.sci || '').toLowerCase().split(' '), ...it.n.toLowerCase().split(/[\s'-]+/).filter(x => x.length >= 4)];
      const named = f => words.some(wd => wd && f.toLowerCase().replace(/_/g, ' ').includes(wd));
      let af = [...(it.audio || []), ...(w?.audio ? [...w.audio].filter(named) : [])].slice(0, 2);
      if (!af.length && it.sci && !it.noAudio) {
        const found = await commonsAudioSearch(it.sci).catch(() => []);
        if (found.length) { Object.assign(info, await commonsInfo(found.slice(0, 3))); af = found.slice(0, 3); }
      }
      const aud = [];
      for (const f of af) {
        const m = info[f];
        if (!m) continue;
        const mp3 = /mpeg/.test(m._mime) ? m.src : await commonsAudioMp3(f).catch(() => null);
        aud.push({ src: mp3 || m.src, credit: m.credit, license: m.license, page: m.page, start: 0 });
      }
      if (aud.length) media.audio = aud.slice(0, 1).map(mir);
    }
    if (Object.keys(media).length) item.media = media;
    item.difficulty = it.d || 2;
    items.push(item);
  }

  const pack = {
    id: S.id, title: S.title, theme: S.theme, icon: S.icon, kids: !!S.kids, version: S.version || 1,
    ...(S.notice ? { notice: S.notice } : {}),
    ...(S.kidsSafe === false ? { kidsSafe: false } : {}),
    ...Object.fromEntries(['imgPrompt', 'nameImgPrompt', 'tfImgPrompt'].filter(k => S[k]).map(k => [k, S[k]])),
    ...(S.leakExempt ? { leakExempt: S.leakExempt } : {}),
    factsMeta: Object.fromEntries(Object.entries(S.factsMeta || {}).map(([k, m]) => [k, { ...m, ...(S.tpl?.[k] || {}) }]).map(([k, m]) => [k, Object.fromEntries(Object.entries(m).filter(([kk, v]) => typeof v !== 'function' && !['noClue', 'yesClue', 'noClue2', 'hard'].includes(kk)))])),
    items,
    ...(S.questions?.length ? { questions: S.questions.map((q, i) => ({ id: q.id || `q${i + 1}`, ...q })) } : {}),
    ...(S.fakes?.length ? { fakes: S.fakes } : {}),
    sources: S.sources || [],
  };
  const { errors, warnings } = validatePack(pack, id);
  for (const w2 of warn) console.warn(`  warn ${id}: ${w2}`);
  for (const w2 of warnings.slice(0, 15)) console.warn(`  schema-warn: ${w2}`);
  if (errors.length) { for (const e of errors) console.error('  ERROR', e); throw new Error(`${id}: ${errors.length} schema errors; not written`); }
  writeJSON(join(ROOT, 'data/packs', id + '.json'), pack);
  const nImg = items.filter(i => i.media?.img?.length).length, nAud = items.filter(i => i.media?.audio).length;
  console.log(`${id}: ${items.length} items (${nImg} with images, ${nAud} with audio), ${pack.questions?.length || 0} questions, ${warn.length} warnings`);
}

let failed = 0;
for (const id of ids) {
  try { await buildPack(id); } catch (e) { failed++; console.error(`FAILED ${id}: ${e.stack || e.message}`); }
}
process.exit(failed ? 1 : 0);
