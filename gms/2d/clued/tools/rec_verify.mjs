#!/usr/bin/env node
// Fact-check tools/rec_src against each record's cited pages (network; pages cached in $REC_CACHE or the OS temp dir).
// A record passes when its holder AND its value appear on a cited page within WINDOW characters of each other.
// Anything else is printed for a human to check: it is a lead, not a verdict (pages word things differently).
// Usage: node tools/rec_verify.mjs [--only <text>] [--plant]   (--plant: also check a deliberately wrong copy of each
// value, which must FAIL; proves the instrument can say no)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadRecords, timeText } from './rec_build.mjs';

const CACHE = process.env.REC_CACHE || join(tmpdir(), 'clued_rec_cache');
mkdirSync(CACHE, { recursive: true });
const WINDOW = 1500;
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1].toLowerCase() : null;
const plant = process.argv.includes('--plant');
const UA = { 'user-agent': 'clued-records/1.0 (trivia fact-check script; https://yru.br8t.com/gms/2d/clued/)' };

const fold = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[‐-―−]/g, '-').replace(/[’‘]/g, "'").replace(/ | | /g, ' ').toLowerCase();

async function page(src) {
  const url = /^https?:/.test(src) ? src : null;
  const f = join(CACHE, encodeURIComponent(src).slice(0, 180) + '.txt');
  if (existsSync(f)) return readFileSync(f, 'utf8');
  let html = '';
  // Wikipedia rate-limits bursts (HTTP 429): go one page at a time and back off for a minute when told to
  for (let tryN = 0; tryN < 5 && !html; tryN++) {
    try {
      const r = await fetch(url || `https://en.wikipedia.org/api/rest_v1/page/html/${encodeURIComponent(src.replace(/ /g, '_'))}?redirect=true`, { headers: UA });
      if (r.status === 429) { console.error(`429, waiting 60 s (${src})`); await new Promise(ok => setTimeout(ok, 60000)); continue; }
      if (r.status === 404) break;
      html = await r.text();
    } catch (e) { html = ''; await new Promise(ok => setTimeout(ok, 5000)); }
  }
  await new Promise(ok => setTimeout(ok, 1500));
  const text = html.replace(/<sup[^>]*class="reference[\s\S]*?<\/sup>/g, ' ').replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16))).replace(/\s+/g, ' ');
  if (text.length > 200) writeFileSync(f, text);
  return text;
}

function valueForms(r, v = r.v) {
  if (typeof v !== 'number') return [];
  const out = new Set();
  const a = Math.abs(v), sign = v < 0 ? '-' : '';
  const plain = String(a), grouped = a.toLocaleString('en-US', { maximumFractionDigits: 6 });
  for (const s of [plain, grouped, grouped.replace(/,/g, ' ')]) out.add(sign + s);
  if (Number.isInteger(a) && a >= 1e6) { const m = a / 1e6; out.add(`${+m.toFixed(2)} million`); out.add(`${+m.toFixed(1)} million`); }
  if (r.u === 's' && a >= 60) { const t = timeText(a); out.add(t); out.add(t.replace(/\.00$/, '')); }
  if (!Number.isInteger(a)) out.add(sign + a.toFixed(2));
  return [...out];
}
const holderForms = r => [r.h, r.qa, ...(r.alt || []), String(r.h).replace(/\s*\([^)]*\)$/, '')].filter(Boolean).map(String);

const WORDS = 'zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty'.split(' ');
// every number written on the page, as { i, n }: "8,848.86" → 8848.86, "15 million" → 15000000, "eight" → 8
function numbers(T) {
  const out = [];
  for (const m of T.matchAll(/(-|−)?\d{1,3}(?:[, ]\d{3})+(?:\.\d+)?|(-|−)?\d+(?:\.\d+)?/g)) {
    let n = parseFloat(m[0].replace(/[, ]/g, '').replace('−', '-'));
    const after = T.slice(m.index + m[0].length, m.index + m[0].length + 10);
    if (/^ ?million/.test(after)) n *= 1e6; else if (/^ ?billion/.test(after)) n *= 1e9; else if (/^ ?trillion/.test(after)) n *= 1e12;
    out.push({ i: m.index, n });
  }
  for (const m of T.matchAll(new RegExp(`\\b(${WORDS.join('|')})\\b`, 'g'))) out.push({ i: m.index, n: WORDS.indexOf(m[1]) });
  return out;
}
function near(text, as, bs, num = null) {
  const T = fold(text);
  const pos = list => list.flatMap(x => { const n = fold(x); const out = []; if (n.length < 2) return out; let i = T.indexOf(n); while (i >= 0 && out.length < 400) { out.push(i); i = T.indexOf(n, i + 1); } return out; });
  const A = pos(as);
  let B = pos(bs);
  // a measured value passes when the page gives any figure within the record's stated spread (sp), or the same figure rounded
  if (num) B = B.concat(numbers(T).filter(x => Math.abs(x.n - num.v) <= num.tol).map(x => x.i));
  if (!A.length) return 'NOHOLDER';
  if (!bs.length) return 'OK';
  if (!B.length) return 'NOVALUE';
  return A.some(a => B.some(b => Math.abs(a - b) <= WINDOW)) ? 'OK' : 'FAR';
}

const recs = (await loadRecords()).filter(r => !only || r.t.toLowerCase().includes(only));
const tally = {};
const rows = [];
for (const r of recs) {
  const texts = await Promise.all([].concat(r.src).map(page));
  const vals = [...valueForms(r), ...(r.vs || []), ...(r.vt ? [r.vt] : [])];
  let best = 'NOPAGE';
  const rank = { OK: 0, NOSUPER: 1, FAR: 2, NOVALUE: 3, NOHOLDER: 4, NOPAGE: 5 };
  const num = typeof r.v === 'number' && !(r.u === 's' && r.v >= 60) ? { v: Math.abs(r.v) === r.v ? r.v : r.v, tol: Math.max(r.sp || 0, Math.abs(r.v) * 0.0005) } : null;
  // records with no number: the title's superlative ("largest", "oldest", "most"…) must sit close to the holder
  const sup = fold(r.t).match(/\b(\w+est|most|first|only|record|loudest|brightest)\b/g) || [];
  const supOk = t => { const T = fold(t); return holderForms(r).some(h => { const n = fold(h); let i = T.indexOf(n); let k = 0; while (i >= 0 && k++ < 300) { const win = T.slice(Math.max(0, i - 400), i + n.length + 400); if (sup.some(w => win.includes(w))) return true; i = T.indexOf(n, i + 1); } return false; }); };
  for (const t of texts) {
    if (!t) continue;
    let s = near(t, holderForms(r), vals, num);
    if (s === 'OK' && !vals.length && !num && sup.length && !supOk(t)) s = 'NOSUPER';
    if (rank[s] < rank[best]) best = s;
  }
  tally[best] = (tally[best] || 0) + 1;
  if (best !== 'OK') rows.push(`${best.padEnd(8)} ${r.file}: ${r.t} | ${r.h} | ${vals.slice(0, 3).join(' / ')} | ${[].concat(r.src).join(', ')}`);
  if (plant && typeof r.v === 'number' && best === 'OK') {
    const wrong = { ...r, v: r.v * 1.37 + (r.v < 10 ? 0.07 : 3) };
    const forms = valueForms(wrong).map(s => s.replace(/(\.\d{2})\d+/, '$1'));
    const p = texts.filter(Boolean).map(t => near(t, holderForms(r), forms, num && { v: wrong.v, tol: num.tol }));
    if (p.includes('OK')) rows.push(`PLANT-OK ${r.t}: a wrong value ${forms[0]} also passed (weak check)`);
    tally.planted = (tally.planted || 0) + 1;
  }
}
for (const x of rows) console.log(x);
console.log(JSON.stringify(tally));
