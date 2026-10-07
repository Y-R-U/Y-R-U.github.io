// Format registry + helpers shared by every format. See docs/notes/A.md "Format author guide".
import { pick, shuffle, sample, weightedPick } from '../core/rng.js?v=202610071324';

const R = globalThis.__cluedFormats || (globalThis.__cluedFormats = { map: new Map(), listeners: new Set() });

export function register(fmt) {
  if (!fmt || !fmt.id || typeof fmt.generate !== 'function' || typeof fmt.render !== 'function') {
    console.warn('[clued] format rejected (needs id, generate, render)', fmt && fmt.id);
    return;
  }
  const f = { icon: '❓', blurb: '', options: [], tags: [], supports: () => true, ...fmt };
  R.map.set(f.id, f);
  R.listeners.forEach(fn => { try { fn(f); } catch (e) {} });
  return f;
}

export const getFormat = id => R.map.get(id) || null;
export const listFormats = () => [...R.map.values()];
export const onRegister = fn => (R.listeners.add(fn), () => R.listeners.delete(fn));

export const NOT_ENOUGH = 'Not enough for this game yet';

// supports() reads index caps; caps.formats (tools/build_index.mjs) then says how many questions generate() really made.
export function supportsPack(fmt, info, { kids = false } = {}) {
  if (!fmt || !info) return 'Not available';
  let r;
  try { r = fmt.supports(info); } catch (e) { r = false; }
  if (r !== true) return typeof r === 'string' && r ? r : 'Not enough data for this format';
  const counts = kids ? info.caps?.formatsKids : info.caps?.formats;
  if (fmt.packless || !counts || !(fmt.id in counts)) return true;
  return counts[fmt.id] >= (fmt.minPerPack || 5) ? true : NOT_ENOUGH;
}

export function defaultOpts(fmt) {
  const o = {};
  for (const opt of fmt?.options || []) o[opt.key] = opt.default;
  return o;
}

/* ---------- content helpers ---------- */

export const refOf = (pack, item) => `${pack.id}/${item.id}`;
export const article = w => (/^[aeiou]/i.test(String(w || '')) && !/^(uni|eu|one|use)/i.test(w) ? 'an' : 'a');
export const hasImg = it => !!it?.media?.img?.length;
export const hasAudio = it => !!it?.media?.audio?.length;
export const itemDifficulty = x => x?.difficulty || 2;

// Country names that take "the" mid-sentence ("comes from the United States").
const THE_RE = /^(United States|United Kingdom|United Arab Emirates|Netherlands|Czech Republic|Philippines|Bahamas|Gambia|Maldives|Dominican Republic|Central African Republic|Democratic Republic of the Congo|Republic of the Congo|Solomon Islands|Marshall Islands|Comoros|Vatican City|Isle of Man)$/;
export const theName = v => (THE_RE.test(String(v ?? '').trim()) ? `the ${String(v).trim()}` : String(v ?? ''));
// Lower-case the first letter only for an ordinary first word: "Southern stingray" → "southern stingray", but
// "United States", "Maine Coon" and "IUCN" keep their capitals.
const lc = s => {
  const t = String(s ?? '');
  const [w, w2] = t.split(/\s+/);
  if (!/^[A-Z][a-z'’-]*$/.test(w || '') || (w2 && /^[A-Z]/.test(w2))) return t;
  return t.charAt(0).toLowerCase() + t.slice(1);
};
export const lcLabel = lc;

// An item's name for the middle of a sentence: item.lname, else the lower-cased name; animals and plants get "the"
// ("the southern stingray"), countries that need it get "the" too.
const THE_PACKS = /^(animals|nature)$/;
export function midName(item, pack) {
  const n = item.lname || (pack && /^(animals|nature|science|food)$/.test(pack.theme || '') ? lc(item.name) : String(item.name || ''));
  if (THE_RE.test(n)) return `the ${n}`;
  return pack && THE_PACKS.test(pack.theme || '') && pack.id !== 'gems' && !/^the /i.test(n) ? `the ${n}` : n;
}
export const capFirst = s => String(s).charAt(0).toUpperCase() + String(s).slice(1);

// {name} {lname} (item.lname overrides the lower-cased name) {aName} {value} {lvalue} {aValue} {theValue} {label} {llabel} {unit}
// A country that needs "the" gets it wherever {value}/{name}/{lname} is used, unless the template already says "the".
export function fill(tpl, v = {}) {
  const name = v.name ?? '', value = v.value ?? '';
  const map = {
    name, lname: v.lname || lc(name), aName: `${article(v.lname || name)} ${v.lname || lc(name)}`,
    value, lvalue: lc(value), aValue: `${article(value)} ${lc(value)}`, theValue: theName(value),
    label: v.label ?? '', llabel: lc(v.label ?? ''), unit: v.unit ?? '',
  };
  const out = String(tpl).replace(/\{(\w+)\}/g, (m, k, at, all) => {
    if (!(k in map)) return m;
    const x = String(map[k]);
    if (['value', 'lvalue', 'name', 'lname'].includes(k) && THE_RE.test(x) && !/\bthe\s*$/i.test(all.slice(0, at))) return `the ${x}`;
    return x;
  });
  return out.charAt(0).toUpperCase() + out.slice(1);
}

// Conservation status (IUCN) is grown-up, hard trivia: never in kids mode, only at Hard.
export const isIucn = m => /conservation|iucn/i.test(`${m?.label || ''} ${m?.ask || ''}`);
export const factAllowed = (m, { kids = false, difficulty = 0 } = {}) => !(isIucn(m) && (kids || difficulty !== 3));

// "Jellyfish" sits inside "Box jellyfish": such values can't share a connect/odd question fairly.
export function nested(a, b) {
  const x = String(a ?? '').toLowerCase().trim(), y = String(b ?? '').toLowerCase().trim();
  if (!x || !y || x === y) return false;
  const inside = (s, t) => ` ${t.replace(/[^a-z0-9]+/g, ' ')} `.includes(` ${s.replace(/[^a-z0-9]+/g, ' ').trim()} `);
  return inside(x, y) || inside(y, x);
}

// Wording for comparing a number fact, from factsMeta.higherLabel: { hi, lo, sup, ask(b) } or null (use higher/lower).
const OPP = { bigger: 'smaller', longer: 'shorter', heavier: 'lighter', taller: 'shorter', wider: 'narrower', harder: 'softer', denser: 'less dense' };
const SUP = { bigger: 'biggest', longer: 'longest', heavier: 'heaviest', taller: 'tallest', wider: 'widest', harder: 'hardest', denser: 'densest' };
export function comparison(meta) {
  if (!meta || meta.type !== 'num') return null;
  if (/\bago\b/i.test(meta.unit || '')) {
    const lived = /lived/i.test(meta.label || '');
    return { hi: 'Longer ago', lo: 'More recently', sup: 'longest ago', ask: b => (lived ? `Did ${b} live longer ago or more recently?` : `Was ${b} longer ago or more recently?`), stmt: (a, v) => (lived ? `${a} lived ${v}.` : `${a}: ${v}.`) };
  }
  const w = String(meta.higherLabel || '').trim().toLowerCase();
  if (!OPP[w]) return null;
  return { hi: capFirst(w), lo: capFirst(OPP[w]), sup: SUP[w], ask: b => `Is ${b} ${w} or ${OPP[w]}?` };
}

export function factText(meta, value) {
  if (value == null) return '';
  if (meta?.type === 'year' && isFinite(Number(value))) return Number(value) < 0 ? `${-Number(value)} BC` : String(value);
  if (meta?.type === 'bool') return value ? (meta.yes || 'Yes') : (meta.no || 'No');
  if (meta?.type === 'num') {
    const n = Number(value);
    const s = Math.abs(n) >= 1000 ? n.toLocaleString('en-GB') : String(+n.toPrecision(4));
    return meta.unit ? `${s} ${meta.unit}` : s;
  }
  return Array.isArray(value) ? value.join(', ') : String(value);
}

// 0 = mixed, 1 easy, 2 medium, 3 hard. Widens the band when too few match.
export function byDifficulty(list, difficulty, min = 4, getD = itemDifficulty) {
  if (!difficulty) return list;
  const bands = [[difficulty], [difficulty, difficulty === 1 ? 2 : difficulty - 1], [1, 2, 3]];
  for (const b of bands) {
    const l = list.filter(x => b.includes(Math.min(3, Math.max(1, getD(x)))));
    if (l.length >= min) return l;
  }
  return list;
}

// Every item across packs as { pack, item, ref }, optionally filtered.
export function poolItems(packs, filter = () => true) {
  const out = [];
  for (const pack of packs) for (const item of pack.items || []) if (filter(item, pack)) out.push({ pack, item, ref: refOf(pack, item) });
  return out;
}

export function packQuestions(packs, kinds) {
  const ks = new Set([].concat(kinds));
  const out = [];
  for (const pack of packs) for (const q of pack.questions || []) if (ks.has(q.kind || 'mc')) out.push({ pack, q, ref: `${pack.id}/q:${q.id}` });
  return out;
}

export function pickPack(rng, packs, weight = p => Math.sqrt((p.items || []).length + (p.questions || []).length + 1)) {
  return weightedPick(rng, packs, weight);
}

// n distractor items for target from pool (both {item}). Prefers lookalikes, then the same group.
// keyFn(item) gives the text that must be unique among options; reject(item) excludes ones that would also be right.
export function distractors(rng, target, pool, n, { keyFn = it => it.name, reject = () => false } = {}) {
  const seen = new Set([norm(keyFn(target.item))]);
  const out = [];
  const take = list => {
    for (const c of shuffle(rng, list)) {
      if (out.length >= n) return;
      if (c.item === target.item || reject(c.item)) continue;
      const k = norm(keyFn(c.item));
      if (!k || seen.has(k)) continue;
      seen.add(k); out.push(c);
    }
  };
  const look = new Set(target.item.lookalikes || []);
  take(pool.filter(c => c.pack === target.pack && look.has(c.item.id)));
  if (target.item.group) take(pool.filter(c => c.pack === target.pack && c.item.group === target.item.group));
  take(pool.filter(c => c.pack === target.pack));
  if (out.length < n && !target.item.group) take(pool);
  return out.length >= n ? out : null;
}

const norm = s => String(s ?? '').trim().toLowerCase();

export const imageOf = (item, rng) => (hasImg(item) ? (rng ? pick(rng, item.media.img) : item.media.img[0]) : null);

// values must be pairwise apart by `ratio` so "which is biggest" is never a coin toss
export function spreadApart(cands, valueFn, n, ratio = 1.3, rng) {
  const out = [];
  for (const c of rng ? shuffle(rng, cands) : cands) {
    const v = Math.abs(Number(valueFn(c)));
    if (!isFinite(v)) continue;
    if (out.every(o => { const w = Math.abs(Number(valueFn(o))); const hi = Math.max(v, w), lo = Math.min(v, w); return lo === 0 ? hi > 0 : hi / lo >= ratio; })) out.push(c);
    if (out.length >= n) break;
  }
  return out.length >= n ? out : null;
}

// Put the right answer among the wrong ones; returns { options, answer }.
export function placeAnswer(rng, right, wrong) {
  const all = shuffle(rng, [right, ...wrong]);
  return { options: all, answer: all.indexOf(right) };
}

// Run `make(i)` until `count` distinct questions exist or attempts run out.
export function collect(count, make, avoid, attempts = count * 12) {
  const out = [], ids = new Set();
  for (let a = 0; a < attempts && out.length < count; a++) {
    const q = make(a);
    if (!q || ids.has(q.id) || (avoid && avoid.has(q.id))) continue;
    ids.add(q.id);
    out.push(q);
  }
  return out;
}

export { pick, shuffle, sample, weightedPick };
