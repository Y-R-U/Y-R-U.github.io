#!/usr/bin/env node
// Fetch year-end singles charts (US Billboard Hot 100, UK best-sellers, Australian ARIA/Kent) into
// tools/au_lists/charts.json = { us|uk|au: { "1990": [[rank, title, artist], …] }, src: {…} }.
//   node tools/au_charts.mjs [--from 1960] [--to 2025] [--only us,uk,au]
// Raw pages are cached in ~/.cache/clued-au/charts/ (delete a file to refetch it).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'tools/au_lists/charts.json');
const CACHE = path.join(os.homedir(), '.cache/clued-au/charts');
fs.mkdirSync(CACHE, { recursive: true });
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const FROM = +arg('--from', 1960), TO = +arg('--to', 2025);
const ONLY = arg('--only', 'us,uk,au').split(',');
const UA = 'CluedTriviaBuilder/1.0 (https://games.br8t.com/gms/2d/clued/)';
const BROWSER = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, file, ua = UA) {
  const f = path.join(CACHE, file);
  if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8');
  for (let i = 0; i < 4; i++) {
    await sleep(700);
    try {
      const r = await fetch(url, { headers: { 'user-agent': ua } });
      if (r.status === 404) { fs.writeFileSync(f, ''); return ''; }
      if (!r.ok) { await sleep(3000 * (i + 1)); continue; }
      const t = await r.text();
      fs.writeFileSync(f, t);
      return t;
    } catch { await sleep(3000); }
  }
  return '';
}

export async function wiki(title) {
  const u = `https://en.wikipedia.org/w/api.php?action=query&prop=revisions&rvprop=content&rvslots=main&format=json&redirects=1&titles=${encodeURIComponent(title)}`;
  const raw = await get(u, 'wp-' + title.replace(/[^\w-]+/g, '_') + '.json');
  if (!raw) return '';
  try {
    const pages = JSON.parse(raw).query.pages;
    const p = Object.values(pages)[0];
    return p.revisions?.[0]?.slots?.main?.['*'] || '';
  } catch { return ''; }
}

// --- wikitext ---
export function clean(s) {
  let t = String(s);
  for (let i = 0; i < 3; i++) t = t.replace(/\{\{(?:sortname|Sortname)\|([^|}]*)\|([^|}]*)(?:\|[^}]*)?\}\}/g, '$1 $2');
  t = t.replace(/<ref[^>]*\/>/g, '').replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '')
    .replace(/\{\{(?:nowrap|nobr|sort|ntsh|abbr)\|(?:[^|}]*\|)?([^|}]*)\}\}/gi, '$1')
    .replace(/\{\{[^{}]*\}\}/g, '').replace(/\{\{[^{}]*\}\}/g, '')
    .replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, '$1').replace(/\[https?:[^\s\]]+\s*([^\]]*)\]/g, '$1')
    .replace(/'''?/g, '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ').trim();
  return t;
}
const cellText = (c) => { const m = c.match(/^(?:[^[|]*?(?:style|scope|align|rowspan|colspan|class|width|data-sort-value)\s*=[^|]*)\|(?!\|)([\s\S]*)$/i); return m ? m[1] : c; };

// every wikitable as { head: [..], rows: [[..]] }; rowspans are carried down
export function tables(wt) {
  const out = [];
  const re = /\{\|[^\n]*wikitable[\s\S]*?\n\|\}/g;
  for (const m of wt.match(re) || []) {
    const lines = m.split('\n').slice(1);
    const rows = []; let cur = null; let head = null;
    const flush = () => { if (cur && cur.cells.length) { if (cur.isHead && !head) head = cur.cells.map((c) => clean(c.text)); else rows.push(cur.cells); } cur = null; };
    for (const ln of lines) {
      if (/^\|-/.test(ln)) { flush(); cur = { cells: [], isHead: false }; continue; }
      if (/^\|\}/.test(ln) || /^\|\+/.test(ln)) continue;
      if (!cur) cur = { cells: [], isHead: false };
      if (/^!/.test(ln)) {
        const parts = ln.slice(1).split(/!!|\|\|/);
        if (!cur.cells.length && !rows.length && !head) cur.isHead = true;
        for (const p of parts) cur.cells.push(cell(p));
      } else if (/^\|/.test(ln)) {
        for (const p of ln.slice(1).split('||')) cur.cells.push(cell(p));
      } else if (cur.cells.length) cur.cells[cur.cells.length - 1].text += ' ' + ln;
    }
    flush();
    if (head) out.push({ head, rows: spread(rows) });
  }
  return out;
}
function cell(p) {
  const rs = +(p.match(/rowspan\s*=\s*"?(\d+)/i)?.[1] || 1);
  return { text: cellText(p.trim()), rs };
}
function spread(rows) {
  const out = []; const carry = [];
  for (const r of rows) {
    const row = []; let ci = 0, k = 0;
    while (k < r.length || carry[ci]) {
      if (carry[ci] && carry[ci].n > 0) { row.push(carry[ci].text); carry[ci].n--; ci++; continue; }
      if (k >= r.length) break;
      const c = r[k++];
      row.push(c.text);
      if (c.rs > 1) carry[ci] = { text: c.text, n: c.rs - 1 };
      ci++;
    }
    out.push(row);
  }
  return out;
}

function chartFrom(wt, minRows = 10) {
  for (const t of tables(wt)) {
    const h = t.head.map((x) => x.toLowerCase());
    const ri = h.findIndex((x) => /^(no\.?|#|number|pos\.?|position|rank|combined position|combined)$/.test(x) || /^no\.|number$/.test(x));
    const ti = h.findIndex((x) => /title|song|single/.test(x));
    const ai = h.findIndex((x) => /artist/.test(x));
    if (ti < 0 || ai < 0) continue;
    const rows = [];
    for (const raw of t.rows) {
      const r = raw.map(clean);
      const rank = parseInt(String(r[ri >= 0 ? ri : 0]).replace(/\D+/g, ''), 10);
      const title = (r[ti] || '').replace(/^"|"$/g, '').replace(/"\s*\/\s*"/g, ' / ').replace(/"/g, '').trim();
      const artist = (r[ai] || '').replace(/\s+\d{1,3}(,\d{3})+.*$/, '');
      if (rank > 0 && rank <= 100 && title && artist) rows.push(withLinks([rank, title, artist], raw[ti], raw[ai]));
    }
    if (rows.length >= minRows) return rows;
  }
  return null;
}

// first wiki link target of the title and artist cells: [rank, title, artist, titlePage?, artistPage?]
const linkOf = (raw) => { const m = String(raw || '').match(/\[\[([^|\]#]+)/); return m ? m[1].trim().replace(/_/g, ' ') : ''; };
function withLinks(row, rawT, rawA) {
  const lt = linkOf(rawT), la = linkOf(String(rawA || '').replace(/\{\{(?:sortname|Sortname)\|([^|}]*)\|([^|}]*)(?:\|([^}|]*))?[^}]*\}\}/g, (_, a, b, c) => `[[${c || (a + ' ' + b).trim()}]]`));
  if (lt || la) row.push(lt);
  if (la) row.push(la);
  return row;
}

// '# "Title" – Artist' lists (UK 1970-71)
function numbered(wt) {
  const rows = [];
  for (const ln of wt.split('\n')) {
    const m = ln.match(/^#\s*(.+?)\s+[–—-]\s+(.+)$/);
    if (m) rows.push(withLinks([rows.length + 1, clean(m[1]).replace(/"/g, '').trim(), clean(m[2]).replace(/\s+\d{1,3}(,\d{3})+.*$/, '')], m[1], m[2]));
  }
  return rows.length >= 10 ? rows : null;
}

// --- sources ---
async function us(y) {
  const wt = await wiki(`Billboard Year-End Hot 100 singles of ${y}`);
  return wt && chartFrom(wt, 50) ? { rows: chartFrom(wt, 50), src: `https://en.wikipedia.org/wiki/Billboard_Year-End_Hot_100_singles_of_${y}` } : null;
}

const OC_DATES = ['20050103', '20060108', '20070107', '20080106', '20090104', '20100110', '20110109', '20120108', '20130106', '20140105',
  '20160108', '20160101', '20180101', '20190101', '20200101', '20220101', '20230101', '20240101', '20250101'];
const decode = (s) => s.replace(/<wbr>/g, '').replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&#x2F;/g, '/');
async function officialCharts() {
  const byYear = {};
  for (const d of OC_DATES) {
    const html = await get(`https://www.officialcharts.com/charts/end-of-year-singles-chart/${d}/37501/`, `oc-${d}.html`, BROWSER);
    const y = +(decode(html.match(/<title>(.*?)<\/title>/)?.[1] || '').match(/Chart on \d+\/\d+\/(\d{4})/)?.[1] || 0);
    if (!y || byYear[y]) continue;
    const rows = [];
    const re = /<strong>(\d+)<\/strong>[\s\S]*?class="chart-name[^"]*"[^>]*>(?:(?!<\/a>)[\s\S])*?<span>([^<]*)<\/span><\/a>[\s\S]*?class="chart-artist[^"]*"[^>]*><span>([\s\S]*?)<\/span>/g;
    let m;
    while ((m = re.exec(html))) rows.push([+m[1], titleCase(decode(m[2])), titleCase(decode(m[3]))]);
    if (rows.length >= 50) byYear[y] = { rows, src: `https://www.officialcharts.com/charts/end-of-year-singles-chart/${d}/37501/` };
  }
  return byYear;
}
const SMALL = new Set(['a', 'an', 'the', 'and', 'of', 'in', 'on', 'to', 'for', 'ft', 'feat', 'vs', 'at', 'by', 'or']);
const titleCase = (s) => s.toLowerCase().split(' ').map((w, i) => (i && SMALL.has(w) ? w : w.replace(/^(\(?)(\p{L})/u, (_, p, c) => p + c.toUpperCase()))).join(' ');

async function uk(y, oc) {
  if (oc[y]) return oc[y];
  for (const t of [`${y} in British music`, `${y} in British music charts`]) {
    const wt = await wiki(t);
    if (!wt) continue;
    // only the year-end section, never the weekly top-ten tables
    const sec = wt.match(/\n==+\s*(?:Year[- ]end charts?|Best[- ]selling singles[^=]*|Top singles of the year|Year-end)\s*==+[\s\S]*?(?=\n==[^=]|$)/i);
    const sub = sec && sec[0].match(/\n===*\s*(?:Best[- ]selling singles[^=]*|Top singles of the year|Singles)\s*===*[\s\S]*?(?=\n===*[^=\n]+===*\n|$)/i);
    const part = (sub || sec || [''])[0];
    const rows = chartFrom(part, 10) || numbered(part);
    if (rows) return { rows, src: `https://en.wikipedia.org/wiki/${t.replace(/ /g, '_')}` };
  }
  return null;
}

async function au(y) {
  if (y >= 1988) {
    const html = await get(`https://www.aria.com.au/charts/${y}/singles-chart`, `aria-${y}.html`, BROWSER);
    const rows = [];
    const re = /c-chart-item__rank">\s*<span>(\d+)<\/span>[\s\S]*?c-chart-item__title">([\s\S]*?)<\/a>[\s\S]*?c-chart-item__artist">([\s\S]*?)<\/a>/g;
    let m;
    while ((m = re.exec(html))) rows.push([+m[1], decode(m[2].trim()), decode(m[3].trim())]);
    if (rows.length >= 25) return { rows, src: `https://www.aria.com.au/charts/${y}/singles-chart` };
  }
  for (const t of [`List of top 25 singles for ${y} in Australia`, `List of top 100 singles for ${y} in Australia`]) {
    const wt = await wiki(t);
    const rows = wt && chartFrom(wt, 10);
    if (rows) return { rows, src: `https://en.wikipedia.org/wiki/${t.replace(/ /g, '_')}` };
  }
  return null;
}

async function main() {
  const data = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
  data.src ||= {};
  const oc = ONLY.includes('uk') ? await officialCharts() : {};
  for (const c of ONLY) { data[c] ||= {}; data.src[c] ||= {}; }
  for (let y = FROM; y <= TO; y++) {
    const line = [y];
    for (const c of ONLY) {
      const r = c === 'us' ? await us(y) : c === 'uk' ? await uk(y, oc) : await au(y);
      if (r) { data[c][y] = r.rows; data.src[c][y] = r.src; }
      line.push(`${c}=${r ? r.rows.length : '-'}`);
    }
    console.log(line.join(' '));
  }
  // one row per line keeps the file diffable
  const body = ['us', 'uk', 'au'].filter((c) => data[c]).map((c) => `"${c}": {\n` + Object.keys(data[c]).sort().map((y) => ` "${y}": [\n` + data[c][y].map((r) => '  ' + JSON.stringify(r)).join(',\n') + '\n ]').join(',\n') + '\n}');
  fs.writeFileSync(OUT, '{\n' + body.join(',\n') + ',\n"src": ' + JSON.stringify(data.src, null, 1) + '\n}\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e); process.exit(1); });
