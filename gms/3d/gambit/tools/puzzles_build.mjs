#!/usr/bin/env node
// Builds assets/puzzles/ from the Lichess puzzle database + tools/puzzles_classics.mjs.
//
//   zstd -dc lichess_db_puzzle.csv.zst | awk -F, 'NR==1 || ($6+0>=88 && $7+0>=800 && $5+0<=85)' > cand.csv
//   node tools/puzzles_build.mjs cand.csv
//
// Lichess puzzles are CC0 (https://database.lichess.org/#puzzles). The raw download stays
// outside the repo; only the selected subset ships. Selection: high popularity, many plays,
// low rating deviation, one game per puzzle, rating-stratified inside each region with a
// theme rotation for variety. Every pick is validated with the core rules, and mate-in-1..3
// picks must be forced (and unique for 2..3) per js/chess/solve.js.
import { createReadStream, writeFileSync, mkdirSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Chess } from '../js/chess/chess.js';
import { solveMate } from '../js/chess/solve.js';
import { validatePuzzle } from '../js/puzzles/logic.js';
import { CLASSICS } from './puzzles_classics.mjs';
import { REGIONS } from '../js/puzzles/regions.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'assets/puzzles');
const src = process.argv[2];
if (!src) { console.error('usage: node tools/puzzles_build.mjs <candidates.csv>'); process.exit(1); }

// Selection spec per region (presentation lives in js/puzzles/regions.js).
const SPEC = {
  'first-steps': { n: 60, lo: 400, hi: 900, loose: true, f: c => (c.plies === 2 && c.t.has('mateIn1')) || (c.plies === 4 && !c.t.has('mate') && ['hangingPiece', 'fork', 'trappedPiece'].some(x => c.t.has(x))),
    rot: ['mateIn1', 'mateIn1', 'backRankMate', 'mateIn1', 'hangingPiece', 'mateIn1', 'fork', 'mateIn1'] },
  'forks-pins': { n: 80, lo: 850, hi: 1350, f: c => c.plies <= 4 && !c.t.has('mate') && ['fork', 'pin', 'skewer', 'trappedPiece', 'hangingPiece', 'doubleAttack'].some(x => c.t.has(x)),
    rot: ['fork', 'pin', 'skewer', 'fork', 'pin', 'trappedPiece', 'fork', 'skewer', 'hangingPiece'] },
  'mating-nets': { n: 80, lo: 900, hi: 1500, f: c => c.t.has('mateIn2'),
    rot: ['backRankMate', 'smotheredMate', 'hookMate', 'arabianMate', 'anastasiaMate', 'bodenMate', 'doubleBishopMate', 'dovetailMate', 'mateIn2', 'killBoxMate', 'vukovicMate', 'cornerMate', 'epauletteMate', 'swallowstailMate', 'balestraMate', 'pillsburysMate', 'morphysMate', 'operaMate'] },
  'hidden-blades': { n: 70, lo: 1150, hi: 1600, f: c => c.plies <= 6 && ['discoveredAttack', 'doubleCheck', 'deflection', 'attraction', 'xRayAttack', 'interference', 'intermezzo', 'capturingDefender', 'discoveredCheck'].some(x => c.t.has(x)),
    rot: ['discoveredAttack', 'doubleCheck', 'deflection', 'attraction', 'xRayAttack', 'interference', 'intermezzo', 'capturingDefender', 'discoveredCheck'] },
  'sacrifice-cliffs': { n: 80, lo: 1350, hi: 1800, f: c => c.t.has('sacrifice'),
    rot: ['mateIn3', 'sacrifice', 'clearance', 'attraction', 'mateIn2', 'kingsideAttack', 'queensideAttack', 'deflection', 'exposedKing'] },
  'endgame-vale': { n: 70, lo: 1300, hi: 1900, f: c => c.t.has('endgame') && !c.t.has('mateIn1'),
    rot: ['promotion', 'advancedPawn', 'rookEndgame', 'pawnEndgame', 'queenEndgame', 'bishopEndgame', 'knightEndgame', 'zugzwang', 'underPromotion', 'queenRookEndgame', 'equality'] },
  'storm-keep': { n: 80, lo: 1650, hi: 2100, f: c => c.plies >= 6,
    rot: ['long', 'quietMove', 'mateIn3', 'defensiveMove', 'mateIn4', 'veryLong', 'attackingF2F7', 'exposedKing', 'sacrifice', 'zugzwang'] },
  'gm-peaks': { n: 80, lo: 2000, hi: 2900, loose: true, f: c => c.plies >= 4,
    rot: ['veryLong', 'long', 'mateIn4', 'mateIn3', 'quietMove', 'sacrifice', 'zugzwang', 'defensiveMove', 'crushing', 'endgame'] },
};
const BINS = 8;

const strict = c => c.pop >= 94 && c.plays >= 1500 && c.rd <= 78;
const score = c => c.pop + 4 * Math.log10(c.plays) - c.rd / 8;

// ---------- read candidates ----------
const byRegion = Object.fromEntries(Object.keys(SPEC).map(k => [k, []]));
let total = 0;
const rl = createInterface({ input: createReadStream(src), crlfDelay: Infinity });
let header = null;
for await (const line of rl) {
  if (!header) { header = line.split(','); continue; }
  const f = line.split(',');
  const c = { id: f[0], fen: f[1], m: f[2], r: +f[3], rd: +f[4], pop: +f[5], plays: +f[6], th: f[7], g: (f[8] || '').replace('https://lichess.org/', '') };
  c.plies = c.m.split(' ').length;
  c.t = new Set(c.th.split(' '));
  c.game = c.g.split(/[/#]/)[0];
  total++;
  for (const [k, s] of Object.entries(SPEC)) {
    if (c.r < s.lo || c.r > s.hi) continue;
    if (!s.loose && !strict(c)) continue;
    if (!s.f(c)) continue;
    c.s = score(c) + (strict(c) ? 3 : 0);
    byRegion[k].push(c);
  }
}
console.log(`read ${total} candidates`);

// ---------- select ----------
const usedGames = new Set(), usedIds = new Set();
const rejects = {};
function accept(c) {
  if (usedIds.has(c.id) || usedGames.has(c.game)) return false;
  const p = { id: c.id, fen: c.fen, m: c.m, r: c.r, th: c.th };
  const v = validatePuzzle(p, { solveMate: (f, n) => solveMate(f, n, { maxNodes: 2e6 }), maxSolve: 3 });
  if (!v.ok) { rejects[v.errors[0].split(':')[0]] = (rejects[v.errors[0].split(':')[0]] || 0) + 1; return false; }
  usedIds.add(c.id); usedGames.add(c.game);
  return true;
}

const picked = {};
for (const [k, s] of Object.entries(SPEC)) {
  const pool = byRegion[k].sort((a, b) => b.s - a.s);
  const out = [];
  const w = (s.hi - s.lo) / BINS;
  let carry = 0;
  for (let b = 0; b < BINS; b++) {
    const want = Math.floor(s.n / BINS) + (b < s.n % BINS ? 1 : 0) + carry;
    const lo = s.lo + b * w, hi = b === BINS - 1 ? s.hi + 1 : lo + w;
    const bin = pool.filter(c => c.r >= lo && c.r < hi);
    let got = 0, slot = 0, misses = 0;
    while (got < want && misses < s.rot.length * 2) {
      const theme = s.rot[(out.length + slot) % s.rot.length]; slot++;
      const c = bin.find(x => x.t.has(theme) && !usedIds.has(x.id) && !usedGames.has(x.game) && !x.bad);
      if (c && accept(c)) { out.push(c); got++; misses = 0; } else { if (c) c.bad = true; misses++; }
    }
    for (const c of bin) { if (got >= want) break; if (!c.bad && accept(c)) { out.push(c); got++; } else c.bad = true; }
    carry = want - got;
  }
  if (carry) console.warn(`${k}: short by ${carry}`);
  picked[k] = out;
}

// ---------- classics ----------
const classicsByRegion = {};
for (const cl of CLASSICS) {
  const ch = new Chess(cl.fen);
  if (cl.pgn) for (const s of cl.pgn.split(' ')) if (!ch.move(s)) throw new Error(`${cl.id}: bad pgn move ${s}`);
  const fen = ch.fen();
  const lans = [];
  if (cl.setup) { const v = ch.move(cl.setup); if (!v) throw new Error(`${cl.id}: bad setup`); lans.push(v.lan); }
  for (const s of cl.line) { const v = ch.move(s); if (!v) throw new Error(`${cl.id}: bad line move ${s}`); lans.push(v.lan); }
  const p = { id: cl.id, fen, m: lans.join(' '), r: cl.r, th: cl.th, n: cl.name, st: cl.story };
  if (!cl.setup) p.pf = 1;
  if (cl.goal) p.goal = cl.goal;
  const v = validatePuzzle(p, { solveMate, maxSolve: 4 });
  if (!v.ok) throw new Error(`${cl.id}: ${v.errors.join('; ')}`);
  (classicsByRegion[cl.region] ||= []).push(p);
}

// ---------- write ----------
mkdirSync(OUT, { recursive: true });
const index = { v: 1, attribution: 'Puzzles from the Lichess.org open database (CC0). Classic positions: public domain.', regions: [] };
for (const reg of REGIONS) {
  const lich = (picked[reg.id] || []).map(c => ({ id: c.id, fen: c.fen, m: c.m, r: c.r, th: c.th, g: c.g }));
  const all = [...lich, ...(classicsByRegion[reg.id] || [])].sort((a, b) => a.r - b.r);
  writeFileSync(join(OUT, `${reg.id}.json`), JSON.stringify(all));
  index.regions.push({ id: reg.id, nodes: all.map(p => p.n ? [p.id, p.r, p.n] : [p.id, p.r]) });
  const mates = all.filter(p => /mateIn/.test(p.th)).length;
  console.log(`${reg.id.padEnd(17)} ${String(all.length).padStart(3)} puzzles  rating ${all[0]?.r}–${all[all.length - 1]?.r}  mates ${mates}  classics ${(classicsByRegion[reg.id] || []).length}`);
}
writeFileSync(join(OUT, 'index.json'), JSON.stringify(index));
console.log('rejects', rejects);
console.log('total', index.regions.reduce((s, r) => s + r.nodes.length, 0));
