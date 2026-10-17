// DIFFMIX: an Easy/Medium/Hard round is a blend of levels, not one level (Aaron 2026-10-13). docs/notes/DIFFMIX.md
import { rngFrom, shuffle } from './rng.js?v=202610170738';

export const BLEND = { 1: [6, 3, 1], 2: [2, 6, 2], 3: [1, 3, 6] };

export const BLEND_NOTE = {
  0: 'Any level, picked at random',
  1: 'Mostly easy, with a few medium and one hard',
  2: 'Mostly medium, with a couple of easy and hard',
  3: 'Mostly hard, with a few medium and one easy',
};

// Kids, the Ladder's rising stages, the daily and specs made before the blend existed (no spec.blend) stay pure.
export const blendOn = (spec, r, kids) => !kids && spec.blend === 1 && [1, 2, 3].includes(r.difficulty)
  && spec.structure !== 'ladder' && spec.structure !== 'daily' && !spec.daily;

// Level counts for a round: largest remainder; a tie goes to the level nearest the round's own difficulty.
export function blendCounts(count, difficulty, weights = BLEND[difficulty]) {
  const total = weights.reduce((a, b) => a + b, 0);
  const out = weights.map(w => Math.floor(count * w / total));
  const rem = weights.map(w => (count * w) % total);
  const order = [0, 1, 2].sort((a, b) => rem[b] - rem[a] || Math.abs(a + 1 - difficulty) - Math.abs(b + 1 - difficulty));
  for (let k = 0, left = count - out.reduce((a, b) => a + b, 0); left > 0; k++, left--) out[order[k % 3]]++;
  return out;
}

// Levels to borrow from when level lv (1–3) runs short: nearest first, ties toward the round's difficulty.
export const nearest = (lv, difficulty) => [1, 2, 3].filter(x => x !== lv)
  .sort((a, b) => Math.abs(a - lv) - Math.abs(b - lv) || Math.abs(a - difficulty) - Math.abs(b - difficulty));

let geoP = null;
export const loadGeoLevels = () => (geoP ||= import('../geo/formats/common.js?v=202610170738').catch(() => null));

const clamp = d => Math.min(3, Math.max(1, Math.round(Number(d)) || 2));

// The real level of a generated question: map formats by the country/state, pack formats by refs[0]'s item or
// question (eased by LOCAL's "I live here" view), in-country questions by their own rating; else the level asked for.
export function levelOf(q, asked, { levels, packless = false, geoL = null } = {}) {
  if (q.lv) return q.lv;
  const d = q.data || {};
  if (packless && geoL) {
    const G = geoL.geo;
    if (d.kind === 'state' && G.states?.[d.region]) {
      const s = geoL.stateDifficulty(d.region)[d.iso || q.answer];
      if (s) return s;
    }
    const iso = d.kind === 'country' ? (d.iso || q.answer) : q.answer;
    if (typeof iso === 'string' && G.countries?.[iso]) return geoL.countryLevel(iso);
    return asked;
  }
  const ref = (q.refs || [])[0];
  if (ref && levels?.has(ref)) return levels.get(ref);
  return asked;
}

// ref -> level for every item and question of the (eased, kids-filtered) packs
export function levelMap(packs) {
  const m = new Map();
  for (const p of packs) {
    for (const it of p.items || []) m.set(`${p.id}/${it.id}`, clamp(it.difficulty || 2));
    for (const q of p.questions || []) m.set(`${p.id}/q:${q.id}`, clamp(q.difficulty || 2));
  }
  return m;
}

// cands = [{ q, lv, loc, seen? }] in preference order. The local share comes first (as before the blend, it beats the level
// mix): local picks follow the blend, split like the round, borrowing the nearest level. Normal questions then fill each
// level's room, the round's own level first; a level that runs short borrows from the nearest one. Never short.
export function pickBlend({ cands, count, difficulty, localTarget = 0, seed }) {
  const quotas = blendCounts(count, difficulty);
  const N = [[], [], []], Lc = [[], [], []];
  for (const c of cands) (c.loc ? Lc : N)[c.lv - 1].push(c);
  const picked = [], have = [0, 0, 0];
  const take = (src, n) => {
    let k = 0;
    while (k < n && src.length && picked.length < count) { const c = src.shift(); picked.push(c); have[c.lv - 1]++; k++; }
    return k;
  };
  const order = [difficulty, ...nearest(difficulty, difficulty)];
  // a short level borrows from the nearest levels; borrowed questions keep their own level
  const fill = (lv, n, srcs) => { for (const dv of nearest(lv, difficulty)) for (const src of srcs(dv - 1)) n -= take(src, n); };
  if (localTarget) {
    // local pools are small: unseen local at any level beats a seen one at the right level (FRESH), as in mixRound
    const want = Math.min(localTarget, count);
    let lq = blendCounts(want, difficulty, quotas);
    for (const tier of [false, true]) {
      const T = Lc.map(b => b.filter(c => !!c.seen === tier));
      const short = lq.map((n, l) => n - take(T[l], n));
      for (const lv of order) fill(lv, short[lv - 1], l => [T[l]]);
      Lc.forEach((b, l) => { Lc[l] = b.filter(c => !picked.includes(c)); });
      if (picked.length >= want) break;
      lq = blendCounts(want - picked.length, difficulty, quotas);
    }
  }
  for (const lv of order) take(N[lv - 1], quotas[lv - 1] - have[lv - 1]);
  const short = quotas.map((n, l) => Math.max(0, n - have[l]));
  for (const lv of order) fill(lv, short[lv - 1], l => [N[l], Lc[l]]);
  for (const lv of order) { take(N[lv - 1], count); take(Lc[lv - 1], count); }
  const rng = rngFrom(`${seed}:blend`);
  const head = shuffle(rng, picked);
  if (difficulty === 1 && head[0]?.lv === 3) {
    const j = head.findIndex(c => c.lv < 3);
    if (j > 0) [head[0], head[j]] = [head[j], head[0]];
  }
  const dist = c => Math.abs(c.lv - difficulty);
  const tail = [...N.flat(), ...Lc.flat()].map((c, i) => [c, i]).sort((a, b) => dist(a[0]) - dist(b[0]) || a[1] - b[1]).map(x => x[0]);
  return { head, tail, quotas };
}
