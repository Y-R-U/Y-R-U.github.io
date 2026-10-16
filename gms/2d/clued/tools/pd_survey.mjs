#!/usr/bin/env node
// Classic posters/covers pilot, step 1: for every film (data/packs/movies.json) and book (data/packs/books.json), find the
// English Wikipedia lead image and check whether it is a Wikimedia Commons file under a public-domain licence.
// Non-free posters/covers live on enwiki only (fair use) and are skipped. Results: tools/pd_survey.json (cached; rerun resumes).
// Usage: node tools/pd_survey.mjs [--pick 20 | --ids film/jaws,book/dune]   downloads PD files (--pick: half films, half
// books, most famous first; --ids: those) to tools/pd_cache/<kind>-<id>.jpg + picked.json for tools/pd_mask.py.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(ROOT, 'tools/pd_survey.json');
const UA = { 'User-Agent': 'CluedTriviaPilot/0.1 (https://y-r-u.github.io/gms/2d/clued/)' };
const res = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
const save = () => fs.writeFileSync(OUT, JSON.stringify(res, null, 1));
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function api(host, params) {
  const u = `https://${host}/w/api.php?` + new URLSearchParams({ format: 'json', formatversion: '2', ...params });
  for (let i = 0; i < 4; i++) {
    const r = await fetch(u, { headers: UA });
    if (r.ok) return r.json();
    await sleep(2000 * (i + 1));
  }
  throw new Error('api failed ' + u);
}

const load = f => JSON.parse(fs.readFileSync(path.join(ROOT, 'data/packs', f), 'utf8')).items;
const films = load('movies.json').map(i => ({ kind: 'film', id: i.id, name: i.name, year: i.facts.year, d: i.difficulty, by: i.facts.director,
  tries: [`${i.name} (${i.facts.year} film)`, `${i.name} (film)`, i.name] }));
const books = load('books.json').map(i => ({ kind: 'book', id: i.id, name: i.name, year: i.facts.year, d: i.difficulty, by: i.facts.author,
  tries: [`${i.name} (novel)`, `${i.name} (book)`, i.name] }));

// lead image per title; first title that exists and is not a disambiguation page wins
async function leadImages(titles) {
  const out = new Map();
  for (let k = 0; k < titles.length; k += 40) {
    const j = await api('en.wikipedia.org', { action: 'query', titles: titles.slice(k, k + 40).join('|'), redirects: '1', prop: 'pageimages|pageprops', piprop: 'name', ppprop: 'disambiguation' });
    const back = new Map();
    for (const r of [...(j.query.normalized || []), ...(j.query.redirects || [])]) back.set(r.to, [...(back.get(r.to) || []), r.from]);
    for (const p of j.query.pages || []) {
      if (p.missing || p.pageprops?.disambiguation !== undefined) continue;
      const v = { page: p.title, image: p.pageimage || null };
      const names = [p.title, ...(back.get(p.title) || [])];
      for (const n of names) { out.set(n, v); for (const m of back.get(n) || []) out.set(m, v); }
    }
  }
  return out;
}

const PD = /^(PD|Public domain|CC0)/i;
async function commonsInfo(files) {
  const out = new Map();
  for (let k = 0; k < files.length; k += 40) {
    const j = await api('commons.wikimedia.org', { action: 'query', titles: files.slice(k, k + 40).map(f => 'File:' + f).join('|'), prop: 'imageinfo', iiprop: 'url|extmetadata|size', iiurlwidth: '900' });
    for (const p of j.query.pages || []) {
      const name = p.title.replace(/^File:/, '');
      if (p.missing || !p.imageinfo) { out.set(name, null); continue; }
      const ii = p.imageinfo[0], m = ii.extmetadata || {};
      const lic = m.LicenseShortName?.value || '';
      out.set(name, { license: lic, pd: PD.test(lic) || m.Copyrighted?.value === 'False', url: ii.url, thumb: ii.thumburl, page: ii.descriptionurl,
        w: ii.width, h: ii.height, artist: (m.Artist?.value || '').replace(/<[^>]+>/g, '').trim().slice(0, 200) });
    }
  }
  return out;
}

const all = [...films, ...books].filter(x => !res[`${x.kind}/${x.id}`]);
if (all.length) {
  const leads = await leadImages([...new Set(all.flatMap(x => x.tries))]);
  const files = [...new Set([...leads.values()].map(v => v.image).filter(Boolean))];
  const info = await commonsInfo(files);
  for (const x of all) {
    const hit = x.tries.map(t => leads.get(t)).find(Boolean);
    const ci = hit?.image ? info.get(hit.image.replace(/_/g, ' ')) ?? info.get(hit.image) : undefined;
    res[`${x.kind}/${x.id}`] = { kind: x.kind, id: x.id, name: x.name, year: x.year, d: x.d, by: x.by, wiki: hit?.page || null, image: hit?.image || null,
      where: !hit ? 'no article' : !hit.image ? 'no image' : ci ? 'commons' : 'enwiki only (non-free)', ...(ci || {}) };
  }
  save();
}

const rows = Object.values(res);
for (const kind of ['film', 'book']) {
  const r = rows.filter(x => x.kind === kind), c = {};
  for (const x of r) { const k = x.where === 'commons' ? (x.pd ? 'commons PD' : `commons ${x.license}`) : x.where; c[k] = (c[k] || 0) + 1; }
  console.log(kind, r.length, JSON.stringify(c));
  const pd = r.filter(x => x.pd);
  const dec = {};
  for (const x of pd) { const k = Math.floor(x.year / 10) * 10; dec[k] = (dec[k] || 0) + 1; }
  console.log('  PD by decade', JSON.stringify(dec));
}

const pick = process.argv.includes('--pick') ? +process.argv[process.argv.indexOf('--pick') + 1] : 0;
const ids = process.argv.includes('--ids') ? process.argv[process.argv.indexOf('--ids') + 1].split(',') : null;
if (pick || ids) {
  const dir = path.join(ROOT, 'tools/pd_cache');
  fs.mkdirSync(dir, { recursive: true });
  const chosen = ids ? ids.map(k => res[k]).filter(x => x?.pd && x.thumb) : [];
  if (!ids) for (const kind of ['film', 'book']) chosen.push(...rows.filter(x => x.kind === kind && x.pd && x.thumb).sort((a, b) => a.d - b.d || a.year - b.year).slice(0, Math.ceil(pick / 2)));
  for (const x of chosen) {
    const f = path.join(dir, `${x.kind}-${x.id}.jpg`);
    if (!fs.existsSync(f)) {
      const r = await fetch(x.thumb, { headers: UA });
      fs.writeFileSync(f, Buffer.from(await r.arrayBuffer()));
      await sleep(500);
    }
    console.log('picked', x.kind, x.id, x.license, x.page);
  }
  fs.writeFileSync(path.join(dir, 'picked.json'), JSON.stringify(chosen, null, 1));
}
