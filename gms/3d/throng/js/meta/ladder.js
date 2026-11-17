import { playerFor } from './names.js';
import { unit } from './hash.js';

// The ladder is a curve, not a table: a fixed population, rating ↔ rank through log10(rank), and only the
// rows on screen are ever built. Start rating 0 = dead last.
export const LADDER = {
  population: 287340,
  span: 5000,                // rating at rank 1
  // Expected placement (of 8) measured off RANK, as [log10(rank), par]. This is what slows the climb.
  par: [[5.46, 6.3], [4.3, 5.7], [3.3, 5.6], [2.0, 2.7], [1.0, 2.0], [0, 1.6]],
  k: 10,                     // rating per place beaten / missed against par
  lossMul: 1,
  winBonus: 4,
  maxGain: 60, maxLoss: 40,
};

const L_MAX = Math.log10(LADDER.population);

export function rankOf(rating, cfg = LADDER) {
  const lm = Math.log10(cfg.population);
  const l = lm * Math.max(0, 1 - Math.max(0, rating) / cfg.span);
  return Math.max(1, Math.min(cfg.population, Math.round(Math.pow(10, l))));
}

export function ratingAt(rank, cfg = LADDER) {
  const lm = Math.log10(cfg.population);
  const r = Math.max(1, Math.min(cfg.population, rank));
  return Math.round(cfg.span * (1 - Math.log10(r) / lm));
}

export function parAt(rating, cfg = LADDER) {
  const l = Math.log10(rankOf(rating, cfg));
  const P = cfg.par;
  if (l >= P[0][0]) return P[0][1];
  for (let i = 1; i < P.length; i++) {
    if (l >= P[i][0]) {
      const [l0, p0] = P[i - 1], [l1, p1] = P[i];
      return p1 + (p0 - p1) * (l - l1) / (l0 - l1);
    }
  }
  return P[P.length - 1][1];
}

// Modes that move the rating: [gain, loss] multipliers on Classic's points (D21). A Last Crowd Standing match lasts
// about 75 s against Classic's 120 and the ladder bot places a little worse in it; these make the expected gain per
// minute of play match Classic in every league, within the sweep noise (tools/mode_sweep.mjs --rating, G7 report).
export const RATED = { classic: [1, 1], lcs: [0.73, 0.65] };

// Rating change for finishing `place` (1 = won) out of 8. gainMul / lossMul: the mode's multipliers (RATED).
export function ratingDelta(rating, place, cfg = LADDER, gainMul = 1, lossMul = gainMul) {
  const par = parAt(rating, cfg);
  let d = cfg.k * (par - place);
  if (d < 0) d *= cfg.lossMul;
  if (place === 1) d += cfg.winBonus;
  d = Math.max(-cfg.maxLoss, Math.min(cfg.maxGain, d));
  d = Math.round(d * (d < 0 ? lossMul : gainMul));
  if (rating + d < 0) d = -rating;
  return d;
}

export function rowAt(rank) {
  const p = playerFor('rank:' + rank);
  return { rank, rating: ratingAt(rank), name: p.name, flag: p.flag };
}

// Rows around the player, built on demand. `me` is spliced in at its own rank.
export function around(rating, { above = 6, below = 5, name = 'You', flag = '' } = {}) {
  const r = rankOf(rating);
  const rows = [];
  for (let k = Math.max(1, r - above); k < r; k++) rows.push(rowAt(k));
  rows.push({ rank: r, rating, name, flag, me: true });
  for (let k = r + 1; k <= Math.min(LADDER.population, r + below); k++) rows.push(rowAt(k));
  return rows;
}

export function top(n = 3) { return Array.from({ length: n }, (_, i) => rowAt(i + 1)); }

// Opponents for a match: real ladder rows near the player's rank, so names you meet also appear on the ladder.
export function neighbours(rating, n, seed) {
  const r = rankOf(rating);
  const spread = Math.max(40, Math.round(r * 0.08));
  const out = [], used = new Set([r]), stems = new Set();
  const stem = (name) => name.replace(/^\[\w+\] /, '').replace(/^x/, '').slice(0, 4).toLowerCase();
  for (let i = 0; out.length < n && i < n * 40; i++) {
    const off = Math.round((unit(seed + ':nb:' + i) * 2 - 1) * spread);
    const k = Math.max(1, Math.min(LADDER.population, r + off));
    if (used.has(k)) continue;
    used.add(k);
    const row = rowAt(k), st = stem(row.name);
    if (stems.has(st) && i < n * 30) continue;
    stems.add(st);
    out.push(row);
  }
  return out;
}

export { L_MAX };
