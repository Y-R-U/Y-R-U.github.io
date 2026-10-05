// GameSpec -> questions. A spec fully describes a game; same spec + same packs = same questions.
import { rngFrom, sample, randomSeed } from './rng.js?v=202610050144';
import { loadIndex, loadPacks } from './packs.js?v=202610050144';
import { getFormat, supportsPack, defaultOpts } from '../formats/registry.js?v=202610050144';

export const MAX_ALL_PACKS = 8;

export function makeSpec(structure, rounds, seed = randomSeed(), extra = {}) {
  return { v: 1, structure, rounds: rounds.map(r => ({ packs: 'all', count: 10, opts: {}, difficulty: 0, ...r })), seed: String(seed), ...extra };
}

// Kids mode: kids packs first; other packs only if not marked kidsSafe:false (their items get filtered to difficulty 1).
export function supportedPackIds(fmt, index, { kids = false } = {}) {
  const ids = Object.keys(index.packs).filter(id => supportsPack(fmt, index.packs[id], { kids }) === true);
  if (!kids) return ids;
  return ids.filter(id => index.packs[id].kidsSafe !== false);
}

// Map formats bring their own geo data (packless); the geography packs only add flags, landmarks and mastery refs.
export const formatAvailable = (fmt, index, opts) => !!fmt?.packless || supportedPackIds(fmt, index, opts).length > 0;

export const kidsOk = (x, pack) => x.facts?.kids === true || x.kids === true || (x.difficulty || 2) <= 1 || (pack.kids && !(x.difficulty > 1));

// A shallow copy of the pack holding only child-friendly items/questions, so every format respects kids mode for free.
export function kidsView(pack) {
  return { ...pack, items: (pack.items || []).filter(it => kidsOk(it, pack)), questions: (pack.questions || []).filter(q => kidsOk(q, pack)), kidsView: true };
}

export function resolvePackIds(fmt, packs, index, rng, opts = {}) {
  let ok = supportedPackIds(fmt, index, opts);
  if (fmt.packless) return ok.filter(id => index.packs[id].theme === 'geography' && !index.packs[id].virtual);
  if (packs === 'all' || !Array.isArray(packs) || !packs.length) {
    // virtual packs (general~science) are slices of `general`: never double-count them in "All"
    const real = ok.filter(id => !index.packs[id].virtual);
    if (real.length) ok = real;
    if (ok.length <= MAX_ALL_PACKS) return ok;
    if (!opts.kids) return sample(rng, ok.sort(), MAX_ALL_PACKS);
    const kp = ok.filter(id => index.packs[id].kids || index.packs[id].theme === 'kids').sort();
    const rest = ok.filter(id => !kp.includes(id)).sort();
    return [...sample(rng, kp, MAX_ALL_PACKS), ...sample(rng, rest, Math.max(2, MAX_ALL_PACKS - kp.length))];
  }
  return packs.filter(id => ok.includes(id));
}

// Returns { questions, spares }. Each question gets .round (index) and a unique .id.
export async function buildQuestions(spec, { sparesRatio = 0.4, avoid = new Set() } = {}) {
  const index = await loadIndex();
  const questions = [], spares = [];
  const used = new Set(avoid);
  for (let i = 0; i < spec.rounds.length; i++) {
    const r = spec.rounds[i];
    const fmt = getFormat(r.format);
    if (!fmt) throw new Error(`Unknown format "${r.format}"`);
    const rng = rngFrom(`${spec.seed}:${i}:${r.format}`);
    const opts = { ...defaultOpts(fmt), ...(r.opts || {}) };
    const kids = !!(spec.kids || r.kids || opts.kids);
    const ids = resolvePackIds(fmt, r.packs, index, rng, { kids });
    let packs = await loadPacks(ids);
    if (kids) packs = packs.map(kidsView).filter(p => p.items.length + p.questions.length > 0);
    if (!packs.length && !fmt.packless) throw new Error(`No packs can play ${fmt.title}`);
    const want = r.count + Math.ceil(r.count * sparesRatio) + 1;
    let list = [];
    try {
      list = fmt.generate({ rng, packs, count: want, opts, difficulty: kids ? 1 : (r.difficulty || 0), kids, avoid: used, round: i, spec }) || [];
    } catch (e) {
      console.error('[clued] generate failed', r.format, e);
      throw new Error(`${fmt.title} could not make questions`);
    }
    list.forEach(q => {
      q.format = q.format || fmt.id;
      if (kids) q.kids = true;
      q.round = i;
      let id = q.id || `${fmt.id}:${Math.floor(rng() * 1e9)}`;
      while (used.has(id)) id += '+';
      q.id = id;
      used.add(id);
    });
    questions.push(...list.slice(0, r.count));
    spares.push(...list.slice(r.count));
  }
  return { questions, spares };
}

export const roundOf = (spec, q) => spec.rounds[q.round] || spec.rounds[0];
