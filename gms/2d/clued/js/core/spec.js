// GameSpec -> questions. A spec fully describes a game; same spec + same packs = same questions.
import { rngFrom, sample, randomSeed } from './rng.js?v=202610130607';
import { loadIndex, loadPacks } from './packs.js?v=202610130607';
import { getFormat, supportsPack, defaultOpts } from '../formats/registry.js?v=202610130607';
import { isOn, loadTags, loadLocalGeo, loadNames, easeView, localView, mixRound, countryName, packHasLocal } from './local.js?v=202610130607';
import { homeQuestions, HOME_FORMATS, HOME_PACKS } from './localgeo.js?v=202610130607';
import { loadIndex as loadGeoIndex, geo as GEO } from '../geo/data.js?v=202610130607';
import { dupKey, freshRanker } from './fresh.js?v=202610130607';

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
// spec.local (js/core/local.js) mixes each round to its local share; `report` (an array) receives one row per round.
// FRESH (js/core/fresh.js): `fresh` (this device's seen history) ranks unseen questions first from a larger pool and
// returns `fresh`, a string that, kept as spec.fresh, makes any later build of the spec pick the same questions.
export async function buildQuestions(spec, { sparesRatio = 0.4, avoid = new Set(), report = null, fresh = null } = {}) {
  const index = await loadIndex();
  const L = isOn(spec.local) ? spec.local : null;
  const [, localGeo] = L ? await Promise.all([loadTags(), loadLocalGeo(), loadNames(), loadGeoIndex().catch(() => null)]) : [];
  const questions = [], spares = [];
  const used = new Set(avoid), seen = new Set();
  const F = fresh || typeof spec.fresh === 'string' ? freshRanker(fresh, fresh ? '' : spec.fresh) : null;
  let seenPicked = 0;
  for (let i = 0; i < spec.rounds.length; i++) {
    const r = spec.rounds[i];
    const fmt = getFormat(r.format);
    if (!fmt) throw new Error(`Unknown format "${r.format}"`);
    const rng = rngFrom(`${spec.seed}:${i}:${r.format}`);
    const opts = { ...defaultOpts(fmt), ...(r.opts || {}) };
    const kids = !!(spec.kids || r.kids || opts.kids);
    const ids = resolvePackIds(fmt, r.packs, index, rng, { kids });
    // "All themes" with a focus: also bring in packs that hold local questions for it
    if (L && !fmt.packless && (r.packs === 'all' || !Array.isArray(r.packs) || !r.packs.length)) {
      for (const id of supportedPackIds(fmt, index, { kids }).filter(id => !index.packs[id].virtual && !ids.includes(id) && packHasLocal(id, L.cc)).slice(0, 4)) ids.push(id);
    }
    let packs = await loadPacks(ids);
    if (L?.live) packs = packs.map(p => easeView(p, L.cc));
    if (kids) packs = packs.map(kidsView).filter(p => p.items.length + p.questions.length > 0);
    if (!packs.length && !fmt.packless) throw new Error(`No packs can play ${fmt.title}`);
    const want = r.count + Math.ceil(r.count * sparesRatio) + 1;
    const pool = F ? want * 2 + r.count : want;
    let list = [];
    try {
      list = fmt.generate({ rng, packs, count: pool, opts, difficulty: kids ? 1 : (r.difficulty || 0), kids, avoid: used, round: i, spec }) || [];
    } catch (e) {
      console.error('[clued] generate failed', r.format, e);
      throw new Error(`${fmt.title} could not make questions`);
    }
    if (L) {
      const lrng = rngFrom(`${spec.seed}:${i}:${r.format}:local`);
      const gen = { rng: lrng, count: Math.max(pool, 30), opts, difficulty: kids ? 1 : (r.difficulty || 0), kids, avoid: used, round: i, spec };
      const more = [];
      if (!fmt.packless) for (const p of packs) {
        const v = localView(p, L.cc, lrng);
        if (v) try { more.push(...(fmt.generate({ ...gen, packs: [v] }) || [])); } catch (e) { /* a tiny local view can't feed this format */ }
      }
      if (HOME_FORMATS.has(fmt.id) && (fmt.packless || !Array.isArray(r.packs) || !r.packs.length || r.packs.some(id => HOME_PACKS.has(id)))) {
        more.push(...homeQuestions({ ...gen, cc: L.cc, format: fmt.id, live: L.live, geo: localGeo, states: GEO.states, cname: countryName(L.cc) }));
      }
      // drop what the game already holds (same prompt + answer) before choosing, so the share survives the dedupe below
      const notDup = q => { const k = dupKey(q); return !k || !seen.has(k); };
      if (F) { F.note([list, more]); list = F.rank(list); }
      const mixed = mixRound({ full: list.filter(notDup), more: more.filter(notDup), count: r.count, level: L.level, cc: L.cc, seed: `${spec.seed}:${i}`, key: dupKey, rank: F?.rank });
      list = mixed.list;
      if (report) report.push({ round: i, count: r.count, target: mixed.target, pool: mixed.pool, local: 0 });
    } else if (F) { F.note([list]); list = F.rank(list); }
    // the same question lives in several packs (96 cross-pack copies): one per game, by prompt + answer
    list = list.filter(q => {
      const k = dupKey(q);
      if (k && seen.has(k)) return false;
      if (k) seen.add(k);
      return true;
    });
    if (F) { list = list.slice(0, Math.max(want, r.count)); seenPicked += F.seenIn(list.slice(0, r.count)); }
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
    if (L && report) { const row = report[report.length - 1]; row.got = Math.min(r.count, list.length); row.local = list.slice(0, r.count).filter(q => q.loc).length; }
  }
  return F ? { questions, spares, fresh: F.spec, seenPicked } : { questions, spares };
}

export const roundOf = (spec, q) => spec.rounds[q.round] || spec.rounds[0];
