#!/usr/bin/env node
// §S2-R — which masses do the flying lanes actually run through, and how many are there?
//
// This is the measurement that decided the design. The in-browser sample at canyon_dive returned
// two span buckets repeated, which is the signature of one or two big masses beside THAT camera
// rather than of a city-wide problem — believing it would have sized the whole fix against a
// landmark that happens to stand near the spawn.
//
// Over a 17x17 chunk block: **196 lane crossings — 146 through ordinary seeded masses (widest span
// 38 m) and 50 through 8 landmarks (spans 80-210 m, up to 470 m tall)**. A 38 m mass can be steered
// round inside a street's width; a 190 m landmark cannot, and no climb that keeps §3.10 #2's
// altitudes goes over one. That split is why traffic.js steers sideways for the common case and
// withholds for the landmark case, and why gates_steer bounds the two separately.
//
// Node-side on purpose: no browser, no streaming, and far more ground than a camera can stand in.
// Cited from: docs/S2R_NOTES.md, docs/MANAGER_STATE.md's S2-R section.
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { CityModel } = await import(resolve(ROOT, 'js/city.js'));
const { ALT, CORR, lanePhase, laneCross, LANE_SEP } = await import(resolve(ROOT, 'js/lanes.js'));

const SEED = 1313165134;
const city = new CityModel({
  landmarks: JSON.parse(readFileSync(resolve(ROOT, 'data/landmarks.json'), 'utf8')),
  names: JSON.parse(readFileSync(resolve(ROOT, 'data/names.json'), 'utf8')),
  seed: SEED,
});
// traffic.js is built with the SALTED seed, so a lane lattice derived from the world seed would be
// a plausible lattice nowhere near the real one — lanes.js says so explicitly.
const { trafficSeed } = await import(resolve(ROOT, 'js/lanes.js'));
const tseed = trafficSeed(SEED);

const HALF = 1.6;             // widest civil hull half width plus clearance
const hits = new Map();
let boxes = 0, lmBoxes = 0, seededBoxes = 0;
for (let cz = -8; cz <= 8; cz++) for (let cx = -8; cx <= 8; cx++) {
  for (const b of city.generateChunk(cx, cz).buildings) {
    boxes++;
    const x0 = b.x - b.w / 2, x1 = b.x + b.w / 2, z0 = b.z - b.d / 2, z1 = b.z + b.d / 2;
    for (let a = 0; a < ALT.length; a++) {
      if (ALT[a] > b.h) continue;                      // the lane is over the roof: no crossing
      const axis = a & 1;
      const c0 = axis === 0 ? z0 : x0, c1 = axis === 0 ? z1 : x1;
      // every corridor of this family whose band touches the mass, both directions
      const p = lanePhase(a, tseed);
      for (let k = Math.ceil((c0 - HALF - p) / CORR); k <= Math.floor((c1 + HALF - p) / CORR); k++) {
        for (const dir of [-1, 1]) {
          const line = p + k * CORR + dir * LANE_SEP;
          if (line + HALF < c0 || line - HALF > c1) continue;
          const key = (b.landmark || 'seeded') + '|' + Math.round(b.x) + ',' + Math.round(b.z);
          const rec = hits.get(key) || { lm: b.landmark || null, w: +b.w.toFixed(0),
            d: +b.d.toFixed(0), h: +b.h.toFixed(0), lanes: 0, alts: new Set() };
          rec.lanes++; rec.alts.add(ALT[a]);
          hits.set(key, rec);
          if (b.landmark) lmBoxes++; else seededBoxes++;
        }
      }
    }
  }
}
const rows = [...hits.values()];
const lm = rows.filter(r => r.lm), sd = rows.filter(r => !r.lm);
console.log(JSON.stringify({
  boxesScanned: boxes,
  massesCrossed: rows.length, landmarkMasses: lm.length, seededMasses: sd.length,
  laneCrossings: lmBoxes + seededBoxes, viaLandmark: lmBoxes, viaSeeded: seededBoxes,
  widestSeededSpan: Math.max(0, ...sd.map(r => Math.max(r.w, r.d))),
  landmarksHit: [...new Set(lm.map(r => r.lm))],
  worstLandmarks: lm.sort((a, b) => b.lanes - a.lanes).slice(0, 6)
    .map(r => ({ lm: r.lm, w: r.w, d: r.d, h: r.h, lanes: r.lanes, alts: [...r.alts] })),
}, null, 1));
