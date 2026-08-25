#!/usr/bin/env node
// §S2-R — how much of this city actually stands on the road that used to be painted under it.
//
// This produced the number that deleted the carriageway: **502 of 4,132 seeded footprints — 12.15 %
// — the worst reaching 8.36 m into it**, and 89 crossing the street centreline outright. Aaron,
// looking at the shipped build: *"Roads are part of the problem, they don't match up to buildings
// so look silly."* He was reading this figure off the screen.
//
// gates_p11 P1 had asserted that figure was ZERO, and passed for two phases: its test was
// `Math.min(half - (dx - w/2), half - (dz - w/2))`, which demands a footprint encroach on BOTH
// axes at once. P1 now measures it correctly and uses the operator itself as its falsification.
// This file is kept as the independent re-derivation — it reads city.js's own output and shares no
// code with the gate, so the two agreeing means something.
//
// Cited from: js/materials.js ROAD_BODY, docs/S2R_NOTES.md, docs/DECISIONS.md 16, gates_steer S8.
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { CityModel } = await import(resolve(ROOT, 'js/city.js'));

const city = new CityModel({
  landmarks: JSON.parse(readFileSync(resolve(ROOT, 'data/landmarks.json'), 'utf8')),
  names: JSON.parse(readFileSync(resolve(ROOT, 'data/names.json'), 'utf8')),
  seed: 1313165134,
});
const LOT = 51.2;
const d2line = v => Math.abs((((v / LOT) % 1) + 1.5) % 1 - 0.5) * LOT;

let n = 0, over = 0, worstOver = 0, half66 = 0, worst66 = 0;
const hist = {};
for (let cz = -6; cz <= 6; cz++) for (let cx = -6; cx <= 6; cx++) {
  for (const b of city.generateChunk(cx, cz).buildings) {
    if (b.landmark) continue;
    n++;
    // How far the footprint reaches PAST the street centreline, on each axis independently.
    const ex = b.w / 2 - d2line(b.x), ez = b.d / 2 - d2line(b.z);
    const e = Math.max(ex, ez);
    if (e > 0) { over++; worstOver = Math.max(worstOver, e); }
    // The gate's own test: near edge inside the 6.6 m half-carriageway.
    const enc = Math.max(6.6 - (d2line(b.x) - b.w / 2), 6.6 - (d2line(b.z) - b.d / 2));
    if (enc > 0) { half66++; worst66 = Math.max(worst66, enc);
      const k = Math.ceil(enc); hist[k] = (hist[k] || 0) + 1; }
  }
}
console.log(JSON.stringify({ n,
  pastCentreline: over, worstPastCentreline: +worstOver.toFixed(2),
  encroachCarriageway: half66, worstEncroach: +worst66.toFixed(2),
  encroachPct: +((100 * half66) / n).toFixed(2), hist }, null, 1));
