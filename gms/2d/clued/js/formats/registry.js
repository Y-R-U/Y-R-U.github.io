// Format registry + helpers shared by every format. See docs/notes/A.md "Format author guide".
import { pick, shuffle, sample, weightedPick } from '../core/rng.js?v=202610051408';

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

// {name} {lname} (item.lname overrides the lower-cased name) {aName} {value} {lvalue} {aValue} {label} {llabel} {unit}
export function fill(tpl, v = {}) {
  const name = v.name ?? '', value = v.value ?? '';
  const lc = s => String(s).charAt(0).toLowerCase() + String(s).slice(1);
  const map = {
    name, lname: v.lname || lc(name), aName: `${article(v.lname || name)} ${v.lname || lc(name)}`,
    value, lvalue: lc(value), aValue: `${article(value)} ${lc(value)}`,
    label: v.label ?? '', llabel: lc(v.label ?? ''), unit: v.unit ?? '',
  };
  const out = String(tpl).replace(/\{(\w+)\}/g, (m, k) => (k in map ? map[k] : m));
  return out.charAt(0).toUpperCase() + out.slice(1);
}

export function factText(meta, value) {
  if (value == null) return '';
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
