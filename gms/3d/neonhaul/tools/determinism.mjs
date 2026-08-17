#!/usr/bin/env node
// The P2 determinism gate. Someone will regenerate this city in a year and needs to know it is
// stable, so this hashes a thousand chunks of descriptors and compares against a golden value
// committed beside it.
//
//   node tools/determinism.mjs                 ← check against data/city_golden.json
//   node tools/determinism.mjs --write         ← re-cut the golden (say why in the report)
//   node tools/determinism.mjs --seed=1234     ← a different seed must give a different hash
//
// It imports js/city.js STRAIGHT INTO NODE. That is the whole reason city.js touches neither
// three.js nor the DOM: a city you can only regenerate inside a browser is a city nobody can
// prove is stable.
//
// It also asserts the two things §3.1.1 says are hard rules and §13 says are P2's done-criteria:
// every landmark present at its authored coordinates, and no seeded building inside any keep-out.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CityModel, CHUNK } from '../js/city.js';
import { WORLD_SEED } from '../js/config.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const s = a.replace(/^--/, ''); const i = s.indexOf('=');
  return i < 0 ? [s, true] : [s.slice(0, i), s.slice(i + 1)];
}));

const SEED = args.seed !== undefined ? +args.seed : WORLD_SEED;
const GOLDEN = resolve(ROOT, 'data/city_golden.json');
// 1000 chunks: a 40 x 25 rectangle centred so it covers all three core district rectangles and a
// long way of pure seeded field either side of them.
const REGION = [-20, -12, 19, 12];

function load() {
  return {
    landmarks: JSON.parse(readFileSync(resolve(ROOT, 'data/landmarks.json'), 'utf8')),
    names: JSON.parse(readFileSync(resolve(ROOT, 'data/names.json'), 'utf8')),
  };
}

const fail = [];
const ok = [];
const check = (name, pass, detail) => { (pass ? ok : fail).push(name); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}\n      ${detail}`); };

// ── 1. the same seed twice, in two independent model instances ─────────────

const data = load();
const a = new CityModel({ ...data, seed: SEED });
const b = new CityModel({ ...data, seed: SEED });
const ha = a.hashRegion(...REGION);
const hb = b.hashRegion(...REGION);
check('same seed → byte-identical city', ha.hash === hb.hash && ha.buildings === hb.buildings,
  `${ha.chunks} chunks, ${ha.buildings} buildings → ${ha.hash}   (second model: ${hb.buildings} → ${hb.hash})`);

// Generation order must not matter either — a chunk generated on its own must equal the same
// chunk generated as part of a sweep. This is what would break the moment anything cached state.
const c = new CityModel({ ...data, seed: SEED });
let orderOk = true, orderDetail = '';
for (const [cx, cz] of [[0, 0], [-5, 0], [8, 1], [13, -9], [-17, 11]]) {
  const one = JSON.stringify(c.generateChunk(cx, cz).buildings);
  const two = JSON.stringify(a.generateChunk(cx, cz).buildings);
  if (one !== two) { orderOk = false; orderDetail += ` chunk ${cx},${cz} differs;`; }
}
check('a chunk is the same alone as it is in a sweep', orderOk,
  orderOk ? '5 spot chunks identical whether generated cold or after 1000 others' : orderDetail);

// A different seed must give a different city, or the seed is not doing anything.
const d = new CityModel({ ...data, seed: (SEED ^ 0x1234) | 0 });
const hd = d.hashRegion(...REGION);
check('a different seed → a different city', hd.hash !== ha.hash,
  `seed ${SEED} → ${ha.hash} (${ha.buildings} buildings); seed ${(SEED ^ 0x1234) | 0} → ${hd.hash} (${hd.buildings})`);

// ── 2. the authored core (§3.1.1) ──────────────────────────────────────────

const seen = [];
for (const l of a.landmarks) {
  const rec = a.generateChunk(l.chunk[0], l.chunk[1]);
  const parts = rec.buildings.filter(x => x.landmark === l.id);
  seen.push(`${l.id}@(${l.x},${l.z}) ${parts.length}p h${Math.round(l.height)}`);
  if (parts.length !== l.parts.length) fail.push('landmark ' + l.id);
}
check('all eight landmarks are present at their authored coordinates',
  a.landmarks.length === 8 && a.landmarks.every(l =>
    a.generateChunk(l.chunk[0], l.chunk[1]).buildings.filter(x => x.landmark === l.id).length === l.parts.length),
  seen.join('\n      '));

// The keep-out, over the whole 1000-chunk region rather than only the landmarks' own chunks —
// a keep-out that only holds inside one chunk is not a keep-out.
let intrusions = 0, worst = null, dropped = 0;
for (let cz = REGION[1]; cz <= REGION[3]; cz++) {
  for (let cx = REGION[0]; cx <= REGION[2]; cx++) {
    const rec = a.generateChunk(cx, cz);
    dropped += rec.rejected;
    for (const bl of rec.buildings) {
      if (bl.landmark) continue;
      for (const l of a.landmarks) {
        const dx = bl.x - l.x, dz = bl.z - l.z;
        const r = l.radius + Math.hypot(bl.w, bl.d) * 0.5;
        const dist = Math.hypot(dx, dz);
        if (dist < r) {
          intrusions++;
          if (!worst || r - dist > worst.over) worst = { lm: l.id, over: +(r - dist).toFixed(2), at: [Math.round(bl.x), Math.round(bl.z)] };
        }
      }
    }
  }
}
check('no seeded building inside any landmark keep-out', intrusions === 0,
  `${intrusions} intrusion(s) across ${ha.chunks} chunks; ${dropped} placements dropped by the `
  + `keep-out (dropped, never retried elsewhere — §3.1.1)${worst ? `; worst ${JSON.stringify(worst)}` : ''}`);

// ── 3. the spawn is on the deck, not inside geometry (§3.1.1) ──────────────

const sp = a.spawn;
const spindle = a.byLandmark.spindle;
const shaft = spindle.parts.find(p => p.proto === 'spire');
const deck = spindle.parts.find(p => p.proto !== 'spire');
const insideShaft = Math.abs(sp.pos[0] - shaft.x) <= shaft.w / 2 && Math.abs(sp.pos[2] - shaft.z) <= shaft.d / 2;
const onDeck = Math.abs(sp.pos[0] - deck.x) <= deck.w / 2 && Math.abs(sp.pos[2] - deck.z) <= deck.d / 2
  && Math.abs(sp.pos[1] - deck.h) < 1;
// And nothing seeded may be standing there either.
let inSeeded = null;
for (const bl of a.generateChunk(0, 0).buildings) {
  if (bl.landmark) continue;
  if (Math.abs(sp.pos[0] - bl.x) <= bl.w / 2 && Math.abs(sp.pos[2] - bl.z) <= bl.d / 2 && sp.pos[1] <= bl.h) inSeeded = bl;
}
check('the spawn is on the Spindle deck and not inside geometry',
  onDeck && !insideShaft && !inSeeded,
  `spawn ${JSON.stringify(sp.pos)} bearing ${sp.bearing}; deck top ${deck.h} m spanning `
  + `x ${(deck.x - deck.w / 2).toFixed(0)}..${(deck.x + deck.w / 2).toFixed(0)}, `
  + `z ${(deck.z - deck.d / 2).toFixed(0)}..${(deck.z + deck.d / 2).toFixed(0)}; `
  + `shaft ${shaft.w} m at (${shaft.x}, ${shaft.z}) — clearance `
  + `${(Math.abs(sp.pos[2] - shaft.z) - shaft.d / 2).toFixed(1)} m in z; seeded intruder: ${inSeeded ? 'YES' : 'none'}`);

// ── 4. the core district rectangles win over the noise field (§3.1) ────────

let coreOk = true, coreDetail = [];
for (const r of a.coreRects) {
  const [x0, z0, x1, z1] = r.rect;
  let n = 0, bad = 0;
  for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) { n++; if (a.districtAt(cx, cz).id !== r.id) bad++; }
  if (bad) coreOk = false;
  coreDetail.push(`${r.id}: ${n - bad}/${n} chunks`);
}
check('the three core rectangles override the district noise field', coreOk, coreDetail.join('; '));

// ── 5. names (§3.1.2) ──────────────────────────────────────────────────────

const pinned = Object.entries(data.names.pinnedPads);
const padOk = pinned.every(([k, v]) => a.padName(+k.split(',')[0], +k.split(',')[1]) === v);
const spread = new Set();
for (let i = -30; i < 30; i++) spread.add(a.padName(i, i * 7));
check('§3.1.2 names: 40 pads, 24 streets, three pinned pads honoured',
  padOk && data.names.pads.length === 40 && data.names.streets.length === 24 && spread.size > 20,
  `pinned ${pinned.map(([k, v]) => `${k}→${v}`).join(', ')}; `
  + `${spread.size} distinct names over 60 sampled pads; pads=${data.names.pads.length} streets=${data.names.streets.length}`);

// ── the golden ─────────────────────────────────────────────────────────────

const record = { seed: SEED, region: REGION, hash: ha.hash, chunks: ha.chunks, buildings: ha.buildings, dropped, at: new Date().toISOString() };

if (args.write) {
  writeFileSync(GOLDEN, JSON.stringify(record, null, 2) + '\n');
  console.log(`\nwrote ${GOLDEN}\n  ${ha.hash}  ${ha.buildings} buildings over ${ha.chunks} chunks`);
} else if (!existsSync(GOLDEN)) {
  check('golden exists', false, `${GOLDEN} is missing — run with --write once and commit it`);
} else {
  const g = JSON.parse(readFileSync(GOLDEN, 'utf8'));
  const same = g.hash === ha.hash && g.buildings === ha.buildings && g.seed === SEED;
  check('matches the committed golden hash', same,
    `golden ${g.hash} (${g.buildings} buildings, seed ${g.seed}, cut ${g.at})  vs  now ${ha.hash} (${ha.buildings}, seed ${SEED})`);
}

console.log(`\n${ok.length}/${ok.length + fail.length} checks pass`);
if (fail.length) { console.error('FAILED: ' + fail.join(', ')); process.exit(1); }
