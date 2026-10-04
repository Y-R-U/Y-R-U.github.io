// Shared helpers for C2 pack builders: cached fetch, Wikidata, Wikipedia, Commons licence checks.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { leakStems, findLeak, ALLOWED_LICENSE } from './c1_schema.mjs';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const PACKS = join(ROOT, 'data/packs');
const CACHE = process.env.C2_CACHE || join(tmpdir(), 'clued-c2-cache');
mkdirSync(CACHE, { recursive: true });
const UA = 'CluedTriviaBuilder/1.0 (https://y-r-u.github.io/gms/2d/clued/; build script)';
const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function fetchText(url, { body, headers = {}, fresh = false } = {}) {
  const key = createHash('sha1').update(url + '\n' + (body || '')).digest('hex');
  const file = join(CACHE, key);
  if (!fresh && existsSync(file)) return readFileSync(file, 'utf8');
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await fetch(url, { method: body ? 'POST' : 'GET', body, headers: { 'User-Agent': UA, ...headers } });
      if (res.status === 429 || res.status >= 500) { await sleep(2000 * (attempt + 1)); continue; }
      if (!res.ok) throw new Error(`${res.status} ${url}`);
      const text = await res.text();
      writeFileSync(file, text);
      await sleep(150);
      return text;
    } catch (e) {
      if (attempt === 4) throw e;
      await sleep(1500 * (attempt + 1));
    }
  }
  throw new Error('fetch failed ' + url);
}
export const fetchJSON = async (url, o) => JSON.parse(await fetchText(url, o));

export async function sparql(query) {
  const j = await fetchJSON('https://query.wikidata.org/sparql', {
    body: 'query=' + encodeURIComponent(query),
    headers: { Accept: 'application/sparql-results+json', 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  return j.results.bindings.map(b => Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v.value])));
}

const chunks = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

// English Wikipedia titles -> Wikidata Q-ids (follows redirects).
export async function wpQids(titles) {
  const out = {};
  for (const part of chunks([...new Set(titles)], 50)) {
    const j = await fetchJSON('https://en.wikipedia.org/w/api.php?action=query&prop=pageprops&ppprop=wikibase_item&redirects=1&format=json&formatversion=2&titles=' + encodeURIComponent(part.join('|')));
    const map = {};
    for (const n of j.query.normalized || []) map[n.from] = n.to;
    const redir = {};
    for (const r of j.query.redirects || []) redir[r.from] = r.to;
    const byTitle = {};
    for (const p of j.query.pages) if (p.pageprops) byTitle[p.title] = p.pageprops.wikibase_item;
    for (const t of part) {
      let n = map[t] || t;
      n = redir[n] || n;
      out[t] = byTitle[n] || null;
    }
  }
  return out;
}

export async function wdEntities(qids, props = 'claims|labels|sitelinks') {
  const out = {};
  // Big entities (countries) overflow the API's response size and silently drop out of a batch; retry singly.
  const get = async ids => (await fetchJSON(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${ids.join('|')}&props=${props}&languages=en|mul&sitefilter=enwiki&format=json`)).entities || {};
  for (const part of chunks([...new Set(qids.filter(Boolean))], 25)) {
    Object.assign(out, await get(part));
    for (const id of part) if (!out[id]) Object.assign(out, await get([id]));
  }
  return out;
}

// Best-ranked claim values for a property (preferred if any, else normal; never deprecated).
export function claims(ent, prop) {
  const cs = (ent?.claims?.[prop] || []).filter(c => c.rank !== 'deprecated' && c.mainsnak.snaktype === 'value');
  const pref = cs.filter(c => c.rank === 'preferred');
  return (pref.length ? pref : cs).map(c => c.mainsnak.datavalue.value);
}
export const claim = (ent, prop) => claims(ent, prop)[0];
export function wdYear(v) {
  if (!v?.time) return null;
  const m = v.time.match(/^([+-])(\d+)-/);
  return m ? (m[1] === '-' ? -1 : 1) * parseInt(m[2], 10) : null;
}
export const label = ent => ent?.labels?.en?.value || ent?.labels?.mul?.value;

const ALLOWED = /^(cc0|public domain|pd\b|pd-|no restrictions|cc[ -]by(-sa)?[ -]\d|cc[ -]by(-sa)?$|attribution)/i;
export const licenceOk = s => !!s && ALLOWED.test(s.trim()) && !/\b(nc|nd)\b/i.test(s.replace(/^public domain.*/i, ''));
const strip = html => String(html || '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/\s+/g, ' ').trim();

// Commons file names -> { src, w, h, credit, license, page } with licence enforced and longest side <= maxDim.
export async function commonsImages(files, { maxDim = 640 } = {}) {
  const out = {};
  const clean = [...new Set(files.filter(Boolean).map(f => f.replace(/^File:/, '').replace(/_/g, ' ')))];
  const meta = {};
  for (const part of chunks(clean, 40)) {
    const url = 'https://commons.wikimedia.org/w/api.php?action=query&prop=imageinfo&iiprop=url|size|extmetadata&iiextmetadatafilter=LicenseShortName|Artist|Credit&format=json&formatversion=2&titles=' + encodeURIComponent(part.map(f => 'File:' + f).join('|'));
    const j = await fetchJSON(url);
    const norm = {};
    for (const n of j.query.normalized || []) norm[n.to] = n.from;
    for (const p of j.query.pages) {
      const ii = p.imageinfo?.[0];
      if (!ii) continue;
      const name = (norm[p.title] || p.title).replace(/^File:/, '');
      meta[name] = ii;
    }
  }
  for (const f of clean) {
    const ii = meta[f];
    if (!ii) { out[f] = null; continue; }
    const lic = ii.extmetadata?.LicenseShortName?.value || '';
    if (!licenceOk(lic)) { out[f] = { rejected: lic }; continue; }
    const { width, height } = ii;
    const steps = [500, 330, 250];
    let tw = steps.find(s => s <= width && Math.round(height * s / width) <= maxDim && s <= maxDim) || Math.min(width, 250);
    const th = Math.round(height * tw / width);
    const url = ii.url.split('?')[0];
    let base = url.replace('https://upload.wikimedia.org/wikipedia/commons/', '');
    const fname = base.split('/').pop();
    const isSvg = /\.svg$/i.test(fname);
    const src = tw >= width && !isSvg ? url
      : `https://upload.wikimedia.org/wikipedia/commons/thumb/${base}/${tw}px-${fname}${isSvg ? '.png' : /\.tiff?$/i.test(fname) ? '.jpg' : ''}`;
    let credit = strip(ii.extmetadata?.Artist?.value) || 'Unknown';
    if (credit.length > 90) credit = credit.slice(0, 87) + '…';
    out[f] = { src, w: tw, h: th, credit, license: lic, page: ii.descriptionurl.split('?')[0] };
  }
  return out;
}

// Final gate before writing, so every C2 pack passes C1's validator: clues that leak the name (by C1's stem
// rule) or repeat are dropped, an item left with < 5 clues loses its ladder, and images whose licence string
// C1 does not accept are removed.
export const gateLog = [];
export function gatePack(pack) {
  for (const it of pack.items || []) {
    if (it.clues) {
      const stems = leakStems([it.name, ...(it.alt || [])], pack.leakExempt || []);
      const kept = [...new Set(it.clues)].filter(c => { const s = findLeak(c, stems); if (s) gateLog.push(`${pack.id}/${it.id}: dropped clue leaking "${s}": ${c}`); return !s; });
      if (kept.length < 5) { gateLog.push(`${pack.id}/${it.id}: only ${kept.length} clean clues -> no ladder`); delete it.clues; }
      else it.clues = kept.slice(0, 20);
    }
    for (const kind of ['img', 'audio']) {
      const list = it.media?.[kind];
      if (!list) continue;
      it.media[kind] = list.filter(m => { const ok = ALLOWED_LICENSE.test(m.license); if (!ok) gateLog.push(`${pack.id}/${it.id}: dropped ${kind} with licence "${m.license}"`); return ok; });
    }
  }
  return pack;
}

export function writePack(pack) {
  const before = gateLog.length;
  gatePack(pack);
  const gl = gateLog.slice(before);
  mkdirSync(join(ROOT, 'tools/c2_reports/gate'), { recursive: true });
  writeFileSync(join(ROOT, 'tools/c2_reports/gate', pack.id + '.txt'), gl.join('\n') + '\n');
  mkdirSync(PACKS, { recursive: true });
  writeFileSync(join(PACKS, pack.id + '.json'), JSON.stringify(pack, null, 1) + '\n');
  console.log(`wrote ${pack.id}: ${pack.items?.length || 0} items, ${pack.questions?.length || 0} questions${gl.length ? ` (gate: ${gl.length} fixes, see tools/c2_reports/gate/${pack.id}.txt)` : ''}`);
}

export const slug = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// True if a clue gives away the answer name (or a 5-letter stem of any long word in it).
export function leaks(clue, names, extraStop = []) {
  const stop = new Set([...STOP, ...extraStop]);
  const c = clue.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  for (const name of names) {
    const n = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    if (c.includes(n)) return true;
    for (const w of n.split(/[^a-z0-9]+/)) {
      if (w.length >= 4 && !stop.has(w) && c.includes(w.slice(0, Math.max(5, w.length - 3)))) return true;
    }
  }
  return false;
}
const STOP = new Set(['the', 'and', 'saint', 'republic', 'united', 'state', 'states', 'kingdom', 'islands', 'island', 'great', 'with', 'from', 'city', 'king', 'queen', 'lord', 'mount', 'lake', 'river', 'north', 'south', 'east', 'west', 'central', 'democratic', 'people', 'federal', 'new', 'sir', 'john', 'of']);

// Deterministic shuffle/pick for question generation.
export function rng(seedStr) {
  let h = 2166136261;
  for (const ch of seedStr) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; };
}
export function sample(r, arr, n) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, n);
}

// Compact question DSL, one per line:
//   mc|d|prompt|answer|wrong1;wrong2;wrong3|explain
//   tf|d|prompt|true|explain
//   num|d|prompt|answer|unit|tolerance|explain
//   order|d|prompt|first;second;third;fourth|orderLabel|explain
export function parseQuestions(text, prefix) {
  const qs = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const p = line.split('|').map(s => s.trim());
    const kind = p[0], difficulty = +p[1];
    const q = { id: '', kind, prompt: p[2], difficulty };
    if (kind === 'mc') Object.assign(q, { answer: p[3], wrong: p[4].split(';').map(s => s.trim()), explain: p[5] });
    else if (kind === 'tf') Object.assign(q, { answer: p[3] === 'true', explain: p[4] });
    else if (kind === 'num') Object.assign(q, { kind: 'number', answer: +p[3], unit: p[4], tolerance: +p[5], explain: p[6] });
    else if (kind === 'order') Object.assign(q, { answer: p[3].split(';').map(s => s.trim()), orderLabel: p[4], explain: p[5] });
    else throw new Error('bad question line: ' + line);
    if (p.some(s => s === undefined) || !q.explain) throw new Error('incomplete question line: ' + line);
    q.id = prefix + '-' + createHash('sha1').update(q.prompt).digest('hex').slice(0, 8);
    qs.push(q);
  }
  return qs;
}

// Fallback photo: first Commons search hit whose title shares a distinctive word and whose licence passes.
export async function commonsSearchImage(query, mustWord, { maxDim = 640 } = {}) {
  const j = await fetchJSON('https://commons.wikimedia.org/w/api.php?action=query&list=search&srnamespace=6&srlimit=20&format=json&formatversion=2&srsearch=' + encodeURIComponent(query + ' filetype:bitmap'));
  const titles = j.query.search.map(x => x.title.replace(/^File:/, '')).filter(t => /\.jpe?g$/i.test(t) && t.toLowerCase().includes(mustWord.toLowerCase()));
  const imgs = await commonsImages(titles.slice(0, 10), { maxDim });
  for (const t of titles.slice(0, 10)) { const m = imgs[t]; if (m && !m.rejected && m.w >= 250) return { file: t, ...m }; }
  return null;
}

// Wikiquote check: does any candidate page contain this quote outside a misattributed/disputed section?
const normQ = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/<[^>]+>/g, ' ').replace(/'''?|\[\[([^|\]]*\|)?|\]\]/g, '').replace(/[’‘]/g, "'").replace(/[^a-z0-9']+/g, ' ').replace(/'/g, '').replace(/\s+/g, ' ').trim();
export async function wikiquoteCheck(pages, quote) {
  const q = normQ(quote);
  for (const page of pages) {
    let j;
    try { j = await fetchJSON('https://en.wikiquote.org/w/api.php?action=parse&prop=wikitext&redirects=1&format=json&formatversion=2&page=' + encodeURIComponent(page)); } catch { continue; }
    const text = j?.parse?.wikitext;
    if (!text) continue;
    const lines = text.split('\n');
    let heading = '';
    for (const line of lines) {
      const h = line.match(/^==+\s*(.*?)\s*==+\s*$/);
      if (h) { heading = h[1]; continue; }
      if (normQ(line).includes(q)) {
        if (/misattribut|disputed|attributed to others|about |quotes about/i.test(heading)) return { ok: false, page: j.parse.title, heading };
        return { ok: true, page: j.parse.title, url: 'https://en.wikiquote.org/wiki/' + encodeURIComponent(j.parse.title.replace(/ /g, '_')) };
      }
    }
  }
  return { ok: false };
}

export const parseHtmlTable = html => [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map(m => [...m[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map(c => ({
  text: c[1].replace(/<sup[\s\S]*?<\/sup>/g, '').replace(/<[^>]+>/g, '').replace(/&#160;|&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/†/g, '').trim(),
  href: (c[1].match(/href="\/wiki\/([^"#]+)"/) || [])[1],
})));
