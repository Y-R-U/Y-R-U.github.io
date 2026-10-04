#!/usr/bin/env node
// Resolves kids picture questions (img: '<Wikipedia article>') to the article's lead image on Wikimedia Commons:
// 640px thumbnail + credit + licence + page, from the Commons API extmetadata. Writes tools/c2c_media.json.
// Usage: node tools/c2c_media.mjs [--force]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import KIDS from './c2c_src/kids.mjs';
import { ALLOWED_LICENSE } from './c1_schema.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'tools/c2c_media.json');
const UA = { 'User-Agent': 'CluedQuizBuilder/1.0 (https://y-r-u.github.io/gms/2d/clued/)' };
const force = process.argv.includes('--force');
const cache = existsSync(OUT) && !force ? JSON.parse(readFileSync(OUT, 'utf8')) : {};
const strip = s => String(s || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

async function api(host, params) {
  const u = `https://${host}/w/api.php?` + new URLSearchParams({ format: 'json', formatversion: '2', ...params });
  for (let i = 0; i < 3; i++) {
    const r = await fetch(u, { headers: UA });
    if (r.ok) return r.json();
    await new Promise(res => setTimeout(res, 1500 * (i + 1)));
  }
  throw new Error(`HTTP fail ${u}`);
}

function normLicense(short) {
  const s = strip(short).replace(/^cc-by/i, 'CC BY').replace(/^CC-BY/i, 'CC BY');
  if (/^(public domain|pd)/i.test(s)) return 'Public domain';
  if (/^cc0/i.test(s)) return 'CC0';
  const m = s.match(/^CC BY(-SA)?[ -]?([1-4]\.[05])/i);
  return m ? `CC BY${m[1] ? '-SA' : ''} ${m[2]}` : s;
}

const titles = [...new Set(KIDS.filter(q => q.img).map(q => q.img))];
for (const title of titles) {
  if (cache[title]) continue;
  try {
    const p = await api('en.wikipedia.org', { action: 'query', titles: title, prop: 'pageimages', piprop: 'name', redirects: '1' });
    const file = p.query.pages[0]?.pageimage;
    if (!file) { console.warn(`no page image: ${title}`); continue; }
    const c = await api('commons.wikimedia.org', { action: 'query', titles: `File:${file}`, prop: 'imageinfo', iiprop: 'url|size|extmetadata', iiurlwidth: '640' });
    let ii = c.query.pages[0]?.imageinfo?.[0];
    if (ii && ii.height > ii.width) {
      const w = Math.floor(640 * ii.width / ii.height);
      const c2 = await api('commons.wikimedia.org', { action: 'query', titles: `File:${file}`, prop: 'imageinfo', iiprop: 'url|size|extmetadata', iiurlwidth: String(w) });
      ii = c2.query.pages[0]?.imageinfo?.[0] || ii;
    }
    if (!ii) { console.warn(`not on Commons (maybe local/non-free): ${title} → ${file}`); continue; }
    const md = ii.extmetadata || {};
    const license = normLicense(md.LicenseShortName?.value);
    if (!ALLOWED_LICENSE.test(license)) { console.warn(`licence not allowed (${license}): ${title} → ${file}`); continue; }
    const credit = (strip(md.Artist?.value) || strip(md.Credit?.value) || 'Unknown').replace(/\s*\S+@\S+/g, '');
    cache[title] = {
      src: ii.thumburl || ii.url, w: ii.thumbwidth || ii.width, h: ii.thumbheight || ii.height,
      credit: credit.slice(0, 120), license, page: ii.descriptionurl, file,
    };
    console.log(`ok ${title} → ${file} (${license}, ${credit.slice(0, 40)})`);
  } catch (e) { console.warn(`error ${title}: ${e.message}`); }
}
writeFileSync(OUT, JSON.stringify(cache, null, 1) + '\n');
console.log(`${Object.keys(cache).length}/${titles.length} images cached → tools/c2c_media.json`);
