#!/usr/bin/env node
// Builds data/packs/records.json from tools/rec_src/*.mjs (deterministic, offline). Docs: docs/notes/RECORDS.md.
// Usage: node tools/rec_build.mjs [--check]   (--check: validate only, write nothing)
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { GROUPS, AS_OF } from './rec_src/lib.mjs';
import { dropGiveaways } from './q_giveaway.mjs';
import { givesAway } from '../js/formats/registry.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'tools/rec_src');
const check = process.argv.includes('--check');
const hash = s => createHash('sha1').update(s).digest('hex').slice(0, 6);
export const slug = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export async function loadRecords() {
  const out = [];
  for (const f of readdirSync(SRC).filter(f => f.endsWith('.mjs') && f !== 'lib.mjs').sort()) {
    const mod = await import(pathToFileURL(join(SRC, f)).href);
    for (const r of mod.default) out.push({ ...r, file: f });
  }
  return out;
}

// ---------- value text ----------
const UNIT_WORD = {
  m: 'metres', km: 'kilometres', cm: 'centimetres', mm: 'millimetres', s: 'seconds', kg: 'kilograms', t: 'tonnes', g: 'grams',
  'km/h': 'km/h', 'km²': 'square kilometres', '°C': 'degrees Celsius', K: 'kelvin', 'm³/s': 'cubic metres per second',
};
const pad = (n, w = 2) => String(n).padStart(w, '0');
export function timeText(sec) {
  const neg = sec < 0; sec = Math.abs(sec);
  const dec = (String(sec).split('.')[1] || '').length;
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = +(sec % 60).toFixed(dec);
  const sTxt = dec ? s.toFixed(dec).padStart(3 + dec, '0') : pad(s);
  return (neg ? '−' : '') + (h ? `${h}:${pad(m)}:${sTxt}` : `${m}:${sTxt}`);
}
const num = v => (Math.abs(v) >= 10000 || (Math.abs(v) >= 1000 && Number.isInteger(v)) ? v.toLocaleString('en-GB') : String(v)).replace(/^-/, '−');
export function valueText(v, u, r = {}) {
  if (typeof v === 'string') return v;
  if (u === 's' && Math.abs(v) >= 60) return timeText(v);
  if (u === 's') return `${v} s`;
  if (!u) return num(v);
  if (u === '$') return `$${num(v)}`;
  if (u === 'carats' && v === 1) return '1 carat';
  return `${num(v)} ${u}`;
}

// ---------- range bands ----------
const NICE = [];
for (let e = -3; e <= 13; e++) for (const k of [1, 2, 5]) NICE.push(+(k * 10 ** e).toPrecision(3));
// edges e0<e1<e2 → bands [<e0, e0–e1, e1–e2, ≥e2]; p = wanted band index of v; sp = measurement spread (±)
export function bandsFor(v, sp, p) {
  const i = NICE.findIndex((x, k) => x <= v && v < NICE[k + 1]);
  if (i < 0) return null;
  for (const g of [1, 2, 3]) {
    for (const lo of [i + 1, i, i - 1, i - 2]) {
      const j = lo - (p - 1) * g;
      const E = [0, 1, 2].map(k => NICE[j + k * g]);
      if (E.some(x => x == null) || j < 0) continue;
      const L = p === 0 ? -Infinity : E[p - 1], H = p === 3 ? Infinity : E[p];
      if (v - sp >= L && v + sp < H && v >= L * 1.08 && v * 1.08 <= H) return E;
    }
  }
  return null;
}
export function bandLabels(E, unit) {
  const n = x => num(x), u = unit ? ` ${unit}` : '';
  return [`Under ${n(E[0])}${u}`, `${n(E[0])}–${n(E[1])}${u}`, `${n(E[1])}–${n(E[2])}${u}`, `Over ${n(E[2])}${u}`];
}

// ---------- build ----------
const META = {
  holder: { type: 'cat', label: 'Record holder', ask: false, stmt: false, exclusive: false, hard: true },
  country: { type: 'cat', label: 'Country', ask: false, stmt: false, exclusive: false, hard: true },
  heightM: { type: 'num', label: 'Height', unit: 'm', higherLabel: 'Taller', askNumber: 'How tall is {name}, in metres?', askHigh: 'Which of these is the tallest?', askLow: 'Which of these is the lowest?' },
  lengthKm: { type: 'num', label: 'Length', unit: 'km', higherLabel: 'Longer', askNumber: 'How long is {name}, in kilometres?', askHigh: 'Which of these is the longest?', askLow: 'Which of these is the shortest?' },
  areaKm2: { type: 'num', label: 'Area', unit: 'km²', higherLabel: 'Bigger', askNumber: 'What is the area of {name}, in square kilometres?', askHigh: 'Which of these covers the biggest area?', askLow: 'Which of these covers the smallest area?' },
  depthM: { type: 'num', label: 'Depth', unit: 'm', higherLabel: 'Deeper', askNumber: 'How deep is {name}, in metres?', askHigh: 'Which of these is the deepest?', askLow: 'Which of these is the shallowest?' },
  speedKmh: { type: 'num', label: 'Record speed', unit: 'km/h', higherLabel: 'Faster', askNumber: 'What record speed did {name} reach, in km/h?', askHigh: 'Which of these reached the highest speed?', askLow: false },
  diameterKm: { type: 'num', label: 'Diameter', unit: 'km', higherLabel: 'Wider', askNumber: 'About how wide is {name}, in kilometres?', askHigh: 'Which of these is the widest?', askLow: 'Which of these is the narrowest?' },
};

export async function build(records) {
  const errors = [], items = [], questions = [];
  const names = new Map(), ids = new Set();
  let bandPos = 0;
  const countries = Object.fromEntries(JSON.parse(readFileSync(join(ROOT, 'data/packs/countries.json'), 'utf8')).items.map(it => [it.iso3, it.name]));
  const extra = { GBR: 'United Kingdom', USA: 'United States', TWN: 'Taiwan', XKX: 'Kosovo', VAT: 'Vatican City', HKG: 'Hong Kong', GRL: 'Greenland' };
  const qOut = (r, item, kind, base) => {
    const q = { id: `rec-${item.id}-${kind}-${hash(base.prompt + JSON.stringify(base.answer))}`, ...base, explain: base.explain || item.blurb, difficulty: Math.min(3, base.difficulty), refs: [`records/${item.id}`], topic: item.sub };
    if (r.kids && kind === 'h') q.kids = true;
    if (r.asOf && !/as of \d{4}/i.test(q.prompt)) errors.push(`${item.id}: asOf record prompt lacks "As of ${r.asOf}": ${q.prompt}`);
    questions.push(q);
  };
  for (const r of records) {
    const W = `${r.file}:${r.t}`;
    for (const k of ['g', 's', 't', 'h', 'b', 'd', 'src']) if (r[k] == null) errors.push(`${W}: missing ${k}`);
    if (!GROUPS[r.g]) errors.push(`${W}: unknown group ${r.g}`);
    let name = r.n || (r.ent ? r.h : r.t);
    if (!r.n && r.ent && names.has(name.toLowerCase())) name = r.t;
    let id = slug(r.id || r.t);
    if (ids.has(id)) { errors.push(`${W}: duplicate id ${id}`); continue; }
    ids.add(id);
    if (names.has(name.toLowerCase())) { errors.push(`${W}: duplicate item name "${name}" (also ${names.get(name.toLowerCase())})`); continue; }
    names.set(name.toLowerCase(), id);
    // an item named after its holder needs no holder fact (the mc hint would print the answer)
    const facts = name.toLowerCase() === String(r.h).toLowerCase() ? {} : { holder: r.h };
    const cn = r.c && (countries[r.c] || extra[r.c]);
    if (r.c && !cn) errors.push(`${W}: unknown ISO3 ${r.c}`);
    if (cn && !givesAway(name, cn) && !givesAway(cn, name)) facts.country = cn;   // else the mc hint "Country: Russia" names it
    if (r.dim) { if (!META[r.dim]) errors.push(`${W}: unknown dim ${r.dim}`); else if (typeof r.dv === 'number' || typeof r.v === 'number') facts[r.dim] = r.dv ?? r.v; }
    const vText = r.v != null ? (r.vt || valueText(r.v, r.u, r)) : null;
    const item = {
      id, name, ...(r.lname ? { lname: r.lname } : {}), ...(r.alt ? { alt: r.alt } : {}),
      group: GROUPS[r.g], sub: r.s, record: r.t, facts,
      ...(r.v != null ? { value: r.v, unit: r.u || '', valueText: vText } : {}),
      ...(r.y ? { year: r.y } : {}), ...(r.c ? { iso3: r.c } : {}), ...(r.asOf ? { asOf: r.asOf } : {}),
      blurb: r.b, difficulty: r.d, ...(r.kids ? { kids: true } : {}),
      sources: [].concat(r.src).map(s => (/^https?:/.test(s) ? s : `https://en.wikipedia.org/wiki/${s}`)),
    };
    if (r.asOf && !new RegExp(`as of ${r.asOf}`, 'i').test(r.b)) errors.push(`${W}: asOf record blurb lacks "as of ${r.asOf}"`);
    items.push(item);
    // 1. who/what holds it
    if (r.q !== false && r.q) {
      const wrong = r.w || [];
      if (wrong.length < 3) errors.push(`${W}: holder question needs 3+ wrong options`);
      if (wrong.some(x => x.toLowerCase() === (r.qa || r.h).toLowerCase())) errors.push(`${W}: holder repeated in wrong`);
      const ans = r.qa || r.h;
      // mc may show only 2 of the wrong options (3-answer and kids games): no pair may leave the answer exposed
      for (let i = 0; i < wrong.length; i++) for (let j = i + 1; j < wrong.length; j++) if (givesAway(ans, r.q, [wrong[i], wrong[j]])) errors.push(`${W}: prompt gives "${ans}" away when only ${wrong[i]} / ${wrong[j]} are shown`);
      // typed with no options to compare, a word shared by prompt and answer ("tallest statue" → Statue of Unity) gives it away
      qOut(r, item, 'h', { kind: 'mc', prompt: r.q, answer: ans, wrong, ...(givesAway(ans, r.q, []) ? { typeable: false } : {}), difficulty: r.d });
    }
    // 2. the value, with close realistic options
    if (r.vq && r.wv) {
      // bare numbers written as strings get the unit too, so every option reads alike ("800 wickets", "708 wickets")
      const withUnit = x => (r.u && !r.vt && /^[\d.,−-]+$/.test(x) ? `${x} ${r.u}` : x);
      const wv = r.wv.map(x => (typeof x === 'string' ? withUnit(x) : valueText(x, r.u, r)));
      if (wv.length < 3) errors.push(`${W}: value question needs 3+ wrong values`);
      if (wv.includes(vText)) errors.push(`${W}: value repeated in wrong values`);
      if (typeof r.v === 'number' && r.sp) for (const x of r.wv) if (typeof x === 'number' && Math.abs(x - r.v) <= r.sp) errors.push(`${W}: wrong value ${x} sits inside the measurement spread ±${r.sp}`);
      const numeric = typeof r.v === 'number' && r.wv.every(x => typeof x === 'number');
      const ordered = numeric ? [[r.v, vText], ...r.wv.map((x, i) => [x, wv[i]])].sort((a, b) => a[0] - b[0]).map(x => x[1]) : undefined;
      qOut(r, item, 'v', { kind: 'mc', prompt: r.vq, answer: vText, wrong: wv, ...(ordered ? { ordered } : {}), typeable: false, difficulty: r.d + (r.vd ?? 1) });
    }
    // 3. closest guess
    // dim records already get a closest-guess question from the number format itself
    if (r.tol != null && typeof r.v === 'number' && !(r.dim && r.ent && item.facts[r.dim] != null)) {
      if (r.u === 's' && r.v >= 60) errors.push(`${W}: no number questions for clock times`);
      if (r.sp && r.tol < r.sp) errors.push(`${W}: tolerance ${r.tol} narrower than the measurement spread ±${r.sp}`);
      const word = UNIT_WORD[r.u];
      const prompt = r.nq || (word ? r.vq.replace(/\?$/, `, in ${word}?`) : r.vq);
      if (!prompt) errors.push(`${W}: number question needs vq or nq`);
      else {
        const lo = r.v - Math.max(r.tol * 6, Math.abs(r.v) * 0.3), hi = r.v + Math.max(r.tol * 6, Math.abs(r.v) * 0.3);
        const nice = x => +x.toPrecision(2);
        qOut(r, item, 'n', { kind: 'number', prompt, answer: r.v, answerText: vText, unit: r.u || '', tolerance: r.tol, min: nice(Math.max(r.v > 0 ? 0 : lo, lo)), max: nice(hi), difficulty: r.d + (r.nd ?? 1) });
      }
    }
    // 4. range band
    if (r.bq) {
      const bv = r.bv ?? r.v, bu = r.bu ?? r.u;
      let E = null, p;
      // bp pins the answer's position (e.g. last, so no band is older than the universe); otherwise rotate positions
      for (let k = 0; k < 4 && !E; k++) { p = r.bp ?? (bandPos + k) % 4; E = bandsFor(bv, r.bsp ?? r.sp ?? 0, p); }
      if (!E) errors.push(`${W}: no spread-safe bands for ${bv}`);
      else {
        if (r.bp == null) bandPos = p + 1;
        const labels = bandLabels(E, bu);
        qOut(r, item, 'b', { kind: 'mc', prompt: r.bq, answer: labels[p], wrong: labels.filter((_, i) => i !== p), difficulty: r.bd ?? 3, ordered: labels, typeable: false, band: p });
      }
    }
    for (const x of r.more || []) qOut(r, item, `x${hash(x.p)}`, { kind: x.kind || 'mc', prompt: x.p, answer: x.a, ...(x.w ? { wrong: x.w } : {}), ...(x.kind === 'pickall' || x.kind === 'order' ? {} : {}), ...(x.label ? { orderLabel: x.label } : {}), ...(x.e ? { explain: x.e } : {}), difficulty: x.d ?? r.d });
  }
  const pack = {
    id: 'records', title: 'World records', theme: 'general', icon: '🏆', kids: true, version: 1,
    notice: `Records change: anything marked "as of ${AS_OF}" was checked against the official list for ${AS_OF}.`,
    noun: 'record', blitzAll: false, factsMeta: META, items, questions,
    sources: [
      { name: 'Wikipedia (record lists; each item lists its pages)', url: 'https://en.wikipedia.org' },
      { name: 'World Athletics records', url: 'https://worldathletics.org/records/by-category/world-records' },
      { name: 'World Aquatics records', url: 'https://www.worldaquatics.com/swimming/records' },
      { name: 'Guinness World Records', url: 'https://www.guinnessworldrecords.com' },
      { name: 'WMO Weather and Climate Extremes Archive', url: 'https://wmo.asu.edu' },
      { name: 'NASA planetary fact sheets', url: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/' },
    ],
  };
  return { pack, errors };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const records = await loadRecords();
  const { pack, errors } = await build(records);
  for (const e of errors) console.error('ERROR:', e);
  const gone = dropGiveaways(pack);
  for (const q of gone) console.error(`ERROR: giveaway ${q.id}: ${q.prompt} → ${q.answer}`);
  const by = {};
  for (const it of pack.items) { const k = `${it.group} › ${it.sub}`; by[k] = (by[k] || 0) + 1; }
  const kinds = {};
  for (const q of pack.questions) { const k = q.band != null ? 'band' : q.kind; kinds[k] = (kinds[k] || 0) + 1; }
  console.log(`records: ${pack.items.length} items, ${pack.questions.length} questions ${JSON.stringify(kinds)}`);
  if (process.argv.includes('--subs')) for (const [k, n] of Object.entries(by)) console.log(`  ${k}: ${n}`);
  if (errors.length || gone.length) process.exit(1);
  if (!check) writeFileSync(join(ROOT, 'data/packs/records.json'), JSON.stringify(pack, null, 1) + '\n');
}
