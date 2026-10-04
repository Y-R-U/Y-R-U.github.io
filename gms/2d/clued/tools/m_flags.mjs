// Flags for every country in data/geo/countries.json via Wikidata P41 (flag image) + Commons licence metadata.
// Writes data/geo/flags.json { ISO3: { src, w, h, page, license, credit } }. Run after m_build.mjs.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'tools/m_cache/flags-cache.json');
const UA = 'CluedTriviaBuilder/1.0 (https://y-r-u.github.io/gms/2d/clued/; lane M build script)';
const OK = /^(public domain|pd|cc0|cc by(-sa)? [0-9.]+|cc-by(-sa)?-[0-9.]+)/i;
const countries = JSON.parse(readFileSync(join(ROOT, 'data/geo/countries.json'), 'utf8'));
const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {};
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function getJSON(url) {
  if (cache[url]) return cache[url];
  for (let i = 0; i < 4; i++) {
    const r = await fetch(url, { headers: { 'User-Agent': UA } });
    if (r.ok) { const j = await r.json(); cache[url] = j; await sleep(200); return j; }
    await sleep(1500 * (i + 1));
  }
  throw new Error('fetch failed ' + url);
}
const chunks = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

const ids = Object.keys(countries).filter(id => countries[id].k !== 'x' && countries[id].q);
const byQ = Object.fromEntries(ids.map(id => [countries[id].q, id]));
const files = {};
for (const part of chunks(Object.keys(byQ), 50)) {
  const j = await getJSON(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${part.join('|')}&props=claims&format=json`);
  for (const [q, ent] of Object.entries(j.entities)) {
    const cs = (ent.claims?.P41 || []).filter(c => c.rank !== 'deprecated' && c.mainsnak.datavalue);
    const best = cs.find(c => c.rank === 'preferred') || cs[0];
    if (best) files[byQ[q]] = best.mainsnak.datavalue.value;
  }
}
const out = {};
for (const part of chunks(Object.entries(files), 40)) {
  const titles = part.map(([, f]) => 'File:' + f);
  const j = await getJSON('https://commons.wikimedia.org/w/api.php?action=query&prop=imageinfo&iiprop=url|size|extmetadata&iiurlwidth=320&format=json&formatversion=2&titles=' + encodeURIComponent(titles.join('|')));
  const norm = Object.fromEntries((j.query.normalized || []).map(n => [n.from, n.to]));
  const pages = Object.fromEntries(j.query.pages.map(p => [p.title, p]));
  for (const [iso, f] of part) {
    const p = pages[norm['File:' + f] || 'File:' + f];
    const ii = p?.imageinfo?.[0];
    if (!ii) { console.warn('no imageinfo', iso, f); continue; }
    const md = ii.extmetadata || {};
    const license = (md.LicenseShortName?.value || '').replace(/<[^>]+>/g, '').trim();
    if (!OK.test(license)) { console.warn('licence not allowed', iso, license); continue; }
    const credit = (md.Artist?.value || 'Wikimedia Commons').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 120);
    out[iso] = { src: ii.thumburl.replace(/[?].*$/, '').replace('//thumb.wikimedia.org/', '//upload.wikimedia.org/'), w: ii.thumbwidth, h: ii.thumbheight, page: ii.descriptionurl, license, credit };
  }
}
mkdirSync(dirname(CACHE), { recursive: true });
writeFileSync(CACHE, JSON.stringify(cache));
writeFileSync(join(ROOT, 'data/geo/flags.json'), JSON.stringify(out));
const missing = ids.filter(id => !out[id] && countries[id].k !== 't');
console.log('flags', Object.keys(out).length, '/', ids.length, missing.length ? 'missing states: ' + missing.join(' ') : '');
