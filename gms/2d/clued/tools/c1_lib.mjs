// Shared fetch/cache helpers for C1 pack building (iNaturalist, Wikidata, Commons, NASA).
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const TOOLS = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(TOOLS, '..');
const CACHE = join(TOOLS, '.c1cache');
mkdirSync(CACHE, { recursive: true });
export const UA = 'CluedBuilder/1.0 (https://y-r-u.github.io/gms/2d/clued/; trivia game content build)';

const lastHit = {};
const gap = { 'api.inaturalist.org': 1100, 'query.wikidata.org': 400, default: 150 };
const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function getJSON(url, { body, headers = {}, ttlDays = 60 } = {}) {
  const key = createHash('sha1').update(url + (body || '')).digest('hex');
  const file = join(CACHE, key + '.json');
  if (existsSync(file)) {
    try {
      const c = JSON.parse(readFileSync(file, 'utf8'));
      if (Date.now() - c.t < ttlDays * 864e5) return c.d;
    } catch {}
  }
  const host = new URL(url).host;
  for (let attempt = 0; attempt < 5; attempt++) {
    const wait = (lastHit[host] || 0) + (gap[host] || gap.default) - Date.now();
    if (wait > 0) await sleep(wait);
    lastHit[host] = Date.now();
    try {
      const res = await fetch(url, {
        method: body ? 'POST' : 'GET',
        headers: { 'User-Agent': UA, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}), ...headers },
        body,
      });
      if (res.status === 429 || res.status >= 500) { await sleep(3000 * (attempt + 1)); continue; }
      if (!res.ok) throw new Error(`${res.status} ${url.slice(0, 120)}`);
      const d = await res.json();
      writeFileSync(file, JSON.stringify({ t: Date.now(), d }));
      return d;
    } catch (e) {
      if (attempt === 4) throw e;
      await sleep(2000 * (attempt + 1));
    }
  }
}

export const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
export const slug = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// ---------- licences ----------
export const ALLOWED_LICENSE = /^(CC0( 1\.0)?|Public domain|PD|CC BY(-SA)? [1-4]\.[05]( [A-Za-z-]{2,})?)$/;
const INAT_LIC = { cc0: 'CC0 1.0', 'cc-by': 'CC BY 4.0', 'cc-by-sa': 'CC BY-SA 4.0' };

export function normLicense(short) {
  if (!short) return null;
  let s = short.trim().replace(/\s+/g, ' ');
  if (/^(public domain|pd\b|pd-|cc-pd|no restrictions)/i.test(s)) return 'Public domain';
  if (/^cc0/i.test(s) || /^cc-zero/i.test(s)) return 'CC0 1.0';
  s = s.replace(/^cc-by/i, 'CC BY').replace(/^CC BY-sa/i, 'CC BY-SA').replace(/-(\d)/, ' $1');
  const m = s.match(/^CC BY(-SA)?[ -]?([1-4]\.[05])(?:[ -]([A-Za-z-]{2,}))?$/i);
  if (!m) return null;
  return `CC BY${m[1] ? '-SA' : ''} ${m[2]}${m[3] ? ' ' + m[3].toLowerCase() : ''}`;
}

// ---------- iNaturalist ----------
const inatCache = new Map();
async function inatSearch(sci, rank) {
  const q = new URLSearchParams({ q: sci, per_page: '30', is_active: 'true' });
  if (rank) q.set('rank', rank);
  const d = await getJSON('https://api.inaturalist.org/v1/taxa?' + q);
  const hit = (d.results || []).find(r => r.name.toLowerCase() === sci.toLowerCase())
    || (d.results || []).find(r => (r.matched_term || '').toLowerCase() === sci.toLowerCase()) || null;
  if (!hit && !rank) {
    const r2 = sci.includes(' ') ? (sci.split(' ').length > 2 ? 'subspecies,variety,hybrid' : 'species') : 'genus,family,order,class,subfamily,tribe';
    return inatSearch(sci, r2);
  }
  return hit;
}
// Resolve many scientific names at once (search each, then fetch full records 30 at a time).
export async function inatPrefetch(scis) {
  const hits = [];
  for (const s of [...new Set(scis.filter(Boolean))]) {
    if (inatCache.has(s)) continue;
    const h = await inatSearch(s).catch(() => null);
    if (!h) inatCache.set(s, null); else hits.push([s, h.id]);
  }
  for (let i = 0; i < hits.length; i += 30) {
    const part = hits.slice(i, i + 30);
    const d = await getJSON('https://api.inaturalist.org/v1/taxa/' + part.map(p => p[1]).join(','));
    const byId = new Map((d.results || []).map(r => [r.id, r]));
    for (const [s, id] of part) inatCache.set(s, byId.get(id) || null);
  }
}
export async function inatTaxon(sci) {
  if (!inatCache.has(sci)) await inatPrefetch([sci]);
  return inatCache.get(sci);
}

function inatPhoto(p, taxonId) {
  const lic = INAT_LIC[p.license_code];
  if (!lic) return null;
  const base = (p.medium_url || p.url || '').replace(/\/(square|small|thumb|large|original)\./, '/medium.');
  if (!base.includes('inaturalist-open-data')) return null;
  const od = p.original_dimensions || {};
  const sc = od.width ? Math.min(1, 500 / Math.max(od.width, od.height)) : 1;
  const w = od.width ? Math.round(od.width * sc) : 500, h = od.height ? Math.round(od.height * sc) : 375;
  if (Math.max(w, h) < 400) return null;
  return {
    src: base, w, h,
    credit: (p.attribution_name || p.attribution || 'iNaturalist user').replace(/^\(c\)\s*/i, '').replace(/,? some rights reserved.*$/i, '').replace(/,? no rights reserved.*$/i, '').trim(),
    license: lic, page: `https://www.inaturalist.org/photos/${p.id}`, _id: p.id, _taxon: taxonId,
  };
}

export async function inatPhotos(taxon, want = 3, { skip = [] } = {}) {
  const out = [];
  const seen = new Set(skip.map(String));
  for (const tp of taxon.taxon_photos || []) {
    const ph = inatPhoto(tp.photo, taxon.id);
    if (ph && !seen.has(String(ph._id))) { out.push(ph); seen.add(String(ph._id)); }
    if (out.length >= want) return out;
  }
  const q = new URLSearchParams({ taxon_id: String(taxon.id), photo_license: 'cc0,cc-by,cc-by-sa', quality_grade: 'research', order_by: 'votes', per_page: '30', photos: 'true' });
  const d = await getJSON('https://api.inaturalist.org/v1/observations?' + q);
  for (const o of d.results || []) {
    const p = o.photos?.[0] || o.observation_photos?.[0]?.photo;
    if (!p) continue;
    const ph = inatPhoto(p, taxon.id);
    if (ph && !seen.has(String(ph._id))) { out.push(ph); seen.add(String(ph._id)); }
    if (out.length >= want) break;
  }
  return out;
}

export function inatRanks(taxon) {
  const r = {};
  for (const a of taxon.ancestors || []) r[a.rank] = a.name;
  r[taxon.rank] = taxon.name;
  return r;
}

// ---------- Wikidata ----------
export async function sparql(query) {
  const d = await getJSON('https://query.wikidata.org/sparql', {
    body: 'query=' + encodeURIComponent(query), headers: { Accept: 'application/sparql-results+json' },
  });
  return d.results.bindings.map(b => Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v.value])));
}

// enwiki titles -> { title: entity } (follows redirects; entity also gets ._pageimage)
export async function wdByEnwiki(titles) {
  const out = {}, qOf = {}, piOf = {};
  for (const part of chunk([...new Set(titles)], 40)) {
    const q = new URLSearchParams({ action: 'query', titles: part.join('|'), prop: 'pageprops|pageimages', ppprop: 'wikibase_item', piprop: 'name', format: 'json', redirects: '1' });
    const d = await getJSON('https://en.wikipedia.org/w/api.php?' + q);
    const back = {};
    for (const n of d.query?.normalized || []) back[n.to] = [...(back[n.to] || []), n.from];
    for (const r of d.query?.redirects || []) back[r.to] = [...(back[r.to] || []), r.from, ...(back[r.from] || [])];
    for (const p of Object.values(d.query?.pages || {})) {
      const qid = p.pageprops?.wikibase_item;
      if (!qid) continue;
      for (const t of [p.title, ...(back[p.title] || [])]) { qOf[t] = qid; if (p.pageimage) piOf[t] = p.pageimage; }
    }
  }
  const ents = await wdEntities(Object.values(qOf));
  for (const [t, qid] of Object.entries(qOf)) if (ents[qid]) out[t] = { ...ents[qid], _pageimage: piOf[t] };
  return out;
}

export async function wdEntities(ids) {
  const out = {};
  for (const part of chunk([...new Set(ids)], 50)) {
    const q = new URLSearchParams({ action: 'wbgetentities', ids: part.join('|'), props: 'claims|sitelinks|labels', languages: 'en', sitefilter: 'enwiki', format: 'json' });
    const d = await getJSON('https://www.wikidata.org/w/api.php?' + q);
    Object.assign(out, d.entities || {});
  }
  return out;
}

export const claimVals = (e, p) => (e?.claims?.[p] || []).filter(c => c.rank !== 'deprecated').map(c => c.mainsnak?.datavalue?.value).filter(v => v != null);

// ---------- Commons ----------
const stripUtm = u => u.replace(/\?utm_[^#]*$/, '');
const stripHtml = s => (s || '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/\s+/g, ' ').trim();

// File titles -> media objects (or null when licence not allowed)
export async function commonsInfo(files, width = 500) {
  const out = {};
  const titles = [...new Set(files.map(f => 'File:' + f.replace(/^File:/i, '').replace(/_/g, ' ')))];
  for (const part of chunk(titles, 40)) {
    const q = new URLSearchParams({ action: 'query', titles: part.join('|'), prop: 'imageinfo', iiprop: 'url|size|extmetadata|mime', iiurlwidth: String(width), format: 'json', redirects: '1' });
    const d = await getJSON('https://commons.wikimedia.org/w/api.php?' + q);
    const back = {};
    for (const n of d.query?.normalized || []) back[n.to] = n.from;
    for (const r of d.query?.redirects || []) back[r.to] = back[r.from] || r.from;
    for (const p of Object.values(d.query?.pages || {})) {
      const ii = p.imageinfo?.[0];
      const key = p.title.replace(/^File:/, '');
      if (!ii) { out[key] = null; continue; }
      const m = ii.extmetadata || {};
      const lic = normLicense(m.LicenseShortName?.value) || (m.License?.value === 'pd' ? 'Public domain' : null);
      const bad = /nc|nd|fair use|non-free/i.test((m.LicenseShortName?.value || '') + ' ' + (m.UsageTerms?.value || ''));
      let artist = stripHtml(m.Artist?.value) || stripHtml(m.Credit?.value) || 'Wikimedia Commons';
      if (artist.length > 90) artist = artist.slice(0, 87) + '…';
      const isAudio = /^(audio|application\/ogg)/.test(ii.mime || '');
      let src = stripUtm(isAudio ? ii.url : (ii.thumburl || ii.url)), w = ii.thumbwidth || ii.width, h = ii.thumbheight || ii.height;
      // tall images: drop to the next standard thumbnail step so the long side stays near 640
      if (!isAudio && h > 660 && /\/500px-/.test(src)) { src = src.replace('/500px-', '/330px-'); h = Math.round(h * 330 / w); w = 330; }
      const obj = (!lic || bad) ? null : {
        src, w, h,
        credit: artist, license: lic, page: ii.descriptionurl, _mime: ii.mime,
        _orig: { w: ii.width, h: ii.height }, _desc: stripHtml(m.ImageDescription?.value).slice(0, 200),
      };
      out[key] = obj;
      if (back[p.title]) out[back[p.title].replace(/^File:/, '')] = obj;
    }
  }
  return out;
}

// mp3 transcode of a Commons audio file, if available
export async function commonsAudioMp3(file) {
  const q = new URLSearchParams({ action: 'query', titles: 'File:' + file, prop: 'videoinfo', viprop: 'derivatives|url', format: 'json' });
  const d = await getJSON('https://commons.wikimedia.org/w/api.php?' + q);
  const p = Object.values(d.query?.pages || {})[0];
  const der = p?.videoinfo?.[0]?.derivatives || [];
  const mp3 = der.find(x => /mp3/.test(x.type || '') || /\.mp3$/.test(x.src));
  return mp3 ? stripUtm(mp3.src) : null;
}

export async function enwikiPageImages(titles) {
  const out = {};
  for (const part of chunk([...new Set(titles)], 40)) {
    const q = new URLSearchParams({ action: 'query', titles: part.join('|'), prop: 'pageimages', piprop: 'name', format: 'json', redirects: '1' });
    const d = await getJSON('https://en.wikipedia.org/w/api.php?' + q);
    const back = {};
    for (const n of d.query?.normalized || []) back[n.to] = n.from;
    for (const r of d.query?.redirects || []) back[r.to] = back[r.from] || r.from;
    for (const p of Object.values(d.query?.pages || {})) {
      if (!p.pageimage) continue;
      out[p.title] = p.pageimage;
      if (back[p.title]) out[back[p.title]] = p.pageimage;
    }
  }
  return out;
}

// Commons files that depict a Wikidata item (structured data), best-effort
export async function commonsDepicts(qid, limit = 6) {
  const q = new URLSearchParams({ action: 'query', list: 'search', srsearch: `haswbstatement:P180=${qid} filetype:bitmap`, srnamespace: '6', srlimit: String(limit), format: 'json' });
  const d = await getJSON('https://commons.wikimedia.org/w/api.php?' + q);
  return (d.query?.search || []).map(s => s.title.replace(/^File:/, ''));
}

// ---------- NASA ----------
export async function nasaSearch(q, n = 3) {
  const d = await getJSON('https://images-api.nasa.gov/search?' + new URLSearchParams({ q, media_type: 'image' }));
  const items = d.collection?.items || [];
  const out = [];
  for (const it of items) {
    const data = it.data?.[0] || {};
    const thumb = (it.links || []).find(l => l.rel === 'preview')?.href;
    if (!thumb) continue;
    out.push({ src: thumb, credit: data.secondary_creator || data.center ? `NASA${data.center ? ' / ' + data.center : ''}` : 'NASA', license: 'Public domain', page: `https://images.nasa.gov/details/${encodeURIComponent(data.nasa_id)}`, _title: data.title, _id: data.nasa_id });
    if (out.length >= n) break;
  }
  return out;
}

export function readJSON(p, dflt) { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return dflt; } }
export function writeJSON(p, d, pretty = 1) { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, JSON.stringify(d, null, pretty ? 1 : 0) + '\n'); }

// Commons audio files whose title contains the scientific name (xeno-canto uploads are named that way).
export async function commonsAudioSearch(sci, limit = 5) {
  const q = new URLSearchParams({ action: 'query', list: 'search', srsearch: `intitle:"${sci}" filetype:audio`, srnamespace: '6', srlimit: String(limit), format: 'json' });
  const d = await getJSON('https://commons.wikimedia.org/w/api.php?' + q);
  return (d.query?.search || []).map(s => s.title.replace(/^File:/, '')).filter(t => t.toLowerCase().includes(sci.toLowerCase()));
}
