// GameSpec -> questions. A spec fully describes a game; same spec + same packs = same questions.
import { rngFrom, sample, shuffle, randomSeed } from './rng.js?v=202610171359';
import { loadIndex, loadPacks } from './packs.js?v=202610171359';
import { getFormat, supportsPack, defaultOpts } from '../formats/registry.js?v=202610171359';
import { isOn, loadTags, loadLocalGeo, loadNames, easeView, localView, mixRound, countryName, packHasLocal, isLocalQ, targetOf } from './local.js?v=202610171359';
import { homeQuestions, HOME_FORMATS, HOME_PACKS } from './localgeo.js?v=202610171359';
import { loadIndex as loadGeoIndex, geo as GEO } from '../geo/data.js?v=202610171359';
import { dupKey, freshRanker } from './fresh.js?v=202610171359';
import { BLEND, blendCounts, blendOn, levelMap, levelOf, loadGeoLevels, pickBlend } from './diffmix.js?v=202610171359';

export const MAX_ALL_PACKS = 8;

export function makeSpec(structure, rounds, seed = randomSeed(), extra = {}) {
  return { v: 1, structure, rounds: rounds.map(r => ({ packs: 'all', count: 10, opts: {}, difficulty: 0, ...r })), seed: String(seed), ...(structure === 'daily' ? {} : { blend: 1 }), ...extra };
}

// Kids mode: kids packs first; other packs only if not marked kidsSafe:false (their items get filtered to difficulty 1).
export function supportedPackIds(fmt, index, { kids = false } = {}) {
  const ids = Object.keys(index.packs).filter(id => supportsPack(fmt, index.packs[id], { kids }) === true);
  if (!kids) return ids;
  return ids.filter(id => index.packs[id].kidsSafe !== false);
}

// Map formats bring their own geo data (packless); the geography packs only add flags, landmarks and mastery refs.
export const formatAvailable = (fmt, index, opts) => !!fmt?.packless || supportedPackIds(fmt, index, opts).length > 0;

export const kidsOk = (x, pack) => x.kids !== false && x.facts?.kids !== false && (x.facts?.kids === true || x.kids === true || (x.difficulty || 2) <= 1 || (pack.kids && !(x.difficulty > 1)));

// A shallow copy of the pack holding only child-friendly items/questions, so every format respects kids mode for free.
export function kidsView(pack) {
  return { ...pack, items: (pack.items || []).filter(it => kidsOk(it, pack)), questions: (pack.questions || []).filter(q => kidsOk(q, pack)), kidsView: true };
}

// A genre part (movies~scifi) this format can make at least one question from; genre~scifi plays every such part
export function partOk(fmt, info, kids = false) {
  if (!fmt || !info || (kids && info.kidsSafe === false)) return false;
  let r;
  try { r = fmt.supports(info); } catch (e) { r = false; }
  const counts = kids ? info.caps?.formatsKids : info.caps?.formats;
  return r === true && (!counts || !(fmt.id in counts) || counts[fmt.id] > 0);
}
export const partsFor = (fmt, ids, index, { kids = false } = {}) => [...new Set(ids.flatMap(id => {
  const parts = index.packs[id]?.virtual?.parts;
  return parts ? parts.filter(p => partOk(fmt, index.packs[p], kids)) : [id];
}))];

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
    let packs = await loadPacks(partsFor(fmt, ids, index, { kids }));
    if (L?.live) packs = packs.map(p => easeView(p, L.cc));
    if (kids) packs = packs.map(kidsView).filter(p => p.items.length + p.questions.length > 0);
    if (!packs.length && !fmt.packless) throw new Error(`No packs can play ${fmt.title}`);
    const want = r.count + Math.ceil(r.count * sparesRatio) + 1;
    const pool = F ? want * 2 + r.count : want;
    let list = [];
    if (blendOn(spec, r, kids)) {
      list = await blendRound({ spec, r, i, fmt, packs, opts, pool, want, used, seen, F, L, localGeo });
      if (L && report) report.push({ round: i, count: r.count, target: list.localTarget, pool: list.localPool, local: 0 });
    } else {
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
    }
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

// DIFFMIX: generate each level (1–3) on its own stream, rate every question by its real level, then fill the round's
// blend (js/core/diffmix.js). LOCAL and FRESH compose: local share split across levels, unseen first within a level.
async function blendRound({ spec, r, i, fmt, packs, opts, pool, want, used, seen, F, L, localGeo }) {
  const d = r.difficulty, av = new Set(used);
  const ctx = { levels: levelMap(packs), packless: !!fmt.packless, geoL: fmt.packless ? await loadGeoLevels() : null };
  const per = BLEND[d].map(w => Math.ceil(pool * w / 10) + 2);
  const tag = (out, lv) => { for (const q of out) { q.lv = levelOf(q, lv, ctx); av.add(q.id); } return out; };
  const lists = [], mores = [];
  let fails = 0;
  const gen = (lv, n, k = '') => fmt.generate({ rng: rngFrom(`${spec.seed}:${i}:${r.format}:L${lv}${k}`), packs, count: n, opts, difficulty: lv, kids: false, avoid: av, round: i, spec }) || [];
  for (const lv of [1, 2, 3]) {
    try { lists.push(tag(gen(lv, per[lv - 1]), lv)); } catch (e) { fails++; console.error('[clued] generate failed', r.format, lv, e); lists.push([]); }
  }
  if (fails === 3) throw new Error(`${fmt.title} could not make questions`);
  // a level whose band is diluted (a hard map band is 1/3 hard) gets one bigger second pass
  const quotas = blendCounts(r.count, d);
  for (const lv of [1, 2, 3]) {
    const need = Math.ceil(quotas[lv - 1] * 1.4);
    if (need && lists.flat().filter(q => q.lv === lv).length < need) {
      try { lists.push(tag(gen(lv, per[lv - 1] * 3, '+'), lv)); } catch (e) { /* the first pass already failed or was enough */ }
    }
  }
  if (L) {
    for (const lv of [1, 2, 3]) {
      const lrng = rngFrom(`${spec.seed}:${i}:${r.format}:local:L${lv}`);
      const gen = { rng: lrng, count: Math.max(per[lv - 1], 10), opts, difficulty: lv, kids: false, avoid: av, round: i, spec };
      const more = [];
      if (!fmt.packless) for (const p of packs) {
        const v = localView(p, L.cc, lrng);
        if (v) try { more.push(...tag(fmt.generate({ ...gen, packs: [v] }) || [], lv)); } catch (e) { /* a tiny local view can't feed this format */ }
      }
      if (HOME_FORMATS.has(fmt.id) && (fmt.packless || !Array.isArray(r.packs) || !r.packs.length || r.packs.some(id => HOME_PACKS.has(id)))) {
        more.push(...tag(homeQuestions({ ...gen, cc: L.cc, format: fmt.id, live: L.live, geo: localGeo, states: GEO.states, cname: countryName(L.cc) }), lv));
      }
      mores.push(more);
    }
  }
  if (F) F.note([...lists, ...mores]);
  const ids = new Set(), keys = new Set(), cands = [];
  const isLoc = L ? q => isLocalQ(q, L.cc) : () => false;
  for (const [q, extra] of [...lists.flat().map(q => [q, false]), ...mores.flat().map(q => [q, true])]) {
    const k = dupKey(q), loc = isLoc(q);
    if (ids.has(q.id) || (k && (keys.has(k) || seen.has(k))) || (extra && !loc)) continue;
    ids.add(q.id); if (k) keys.add(k);
    cands.push({ q, lv: q.lv, loc });
  }
  // unseen first within each level; local ones shuffled first (packs arrive one after another), as mixRound does
  const lrng = rngFrom(`${spec.seed}:${i}:local`);
  const order = [];
  for (const lv of [1, 2, 3]) for (const loc of [false, true]) {
    let b = cands.filter(c => c.lv === lv && c.loc === loc).map(c => c.q);
    if (loc) b = shuffle(lrng, b);
    if (F) b = F.rank(b);
    order.push(...b.map(q => ({ q, lv, loc, seen: !!F?.seenIn([q]) })));
  }
  const target = L ? targetOf(r.count, L.level) : 0;
  const { head, tail } = pickBlend({ cands: order, count: r.count, difficulty: d, localTarget: target, seed: `${spec.seed}:${i}:${r.format}` });
  if (L) head.forEach(c => { if (c.loc) c.q.loc = 1; });
  return Object.assign([...head, ...tail].slice(0, Math.max(want, r.count)).map(c => c.q), { localTarget: target, localPool: order.filter(c => c.loc).length });
}

export const roundOf = (spec, q) => spec.rounds[q.round] || spec.rounds[0];
