// node tools/engine_mesher_test.mjs — sanity + perf checks for the pure mesher.
import { meshSection } from '../js/render/mesher_core.js';
import { buildBlockTable } from '../js/render/blocktable.js';
import { BLOCKS, TILES, BLOCK } from '../js/data/blocks.js';

const T = buildBlockTable(BLOCKS, TILES);
const P = 18, P2 = 324;
const pidx = (x, y, z) => (x + 1) + (z + 1) * P + (y + 1) * P2;
function payload(fill) {
  const cells = new Uint16Array(P * P * P), light = new Uint8Array(P * P * P).fill(0xf0);
  const subs = [];
  for (let y = -1; y <= 16; y++) for (let z = -1; z <= 16; z++) for (let x = -1; x <= 16; x++) {
    const r = fill(x, y, z);
    if (Array.isArray(r)) { cells[pidx(x, y, z)] = 0x8000 | (subs.length / 64); subs.push(...r); }
    else cells[pidx(x, y, z)] = r;
  }
  return { cells, subs: Uint8Array.from(subs), light };
}
let fails = 0;
const ok = (c, msg) => { if (!c) { fails++; console.log('FAIL', msg); } else console.log('ok  ', msg); };

// 1. flat ground: one greedy quad on top
let r = meshSection(payload((x, y) => (y < 4 ? BLOCK.PHOTOMOSS : 0)), T);
ok(r.opaque && r.opaque.quads === 1, `flat ground → 1 quad (got ${r.opaque?.quads})`);

// 2. single block in the air: 6 faces
r = meshSection(payload((x, y, z) => (x === 5 && y === 5 && z === 5 ? BLOCK.BASALT_MATRIX : 0)), T);
ok(r.opaque.quads === 6, `lone cube → 6 quads (got ${r.opaque.quads})`);

// 3. half-height refined slab on the ground: top of slab merged to one quad, ground top split around it
const slab = new Array(64).fill(0).map((_, i) => ((i >> 4) < 2 ? BLOCK.POLYMER_BRICK : 0));
r = meshSection(payload((x, y, z) => (y < 4 ? BLOCK.PHOTOMOSS : x === 8 && y === 4 && z === 8 ? slab : 0)), T);
ok(r.opaque.quads >= 5 && r.opaque.quads <= 24, `slab on ground → few quads (got ${r.opaque.quads})`);

// 4. water pool: top lowered, with depth in extra byte
r = meshSection(payload((x, y) => (y < 2 ? BLOCK.MIRROR_SAND : y < 6 ? BLOCK.WATER : 0)), T);
ok(r.water && r.water.quads === 1, `water surface → 1 quad (got ${r.water?.quads})`);
ok(r.water.pos[1] === 5 * 64 + 56, 'water top lowered to 7/8');
ok(r.water.data[3] === 4, `water depth byte = 4 (got ${r.water.data[3]})`);
ok(r.opaque.quads === 1 && (r.opaque.data[1] >> 5 & 2), 'sand under water flagged wet');

// 5. plants + leaves
r = meshSection(payload((x, y, z) => (y < 4 ? BLOCK.PHOTOMOSS : y === 4 && x === 3 && z === 3 ? BLOCK.LUMEN_BLOOM : y === 8 && x >= 0 && x < 3 && z >= 0 && z < 3 ? BLOCK.SOLAR_LEAVES : 0)), T);
ok(r.cutout && r.cutout.quads === 4 + 6, `bloom X + 3x3 leaf slab culled inside (got ${r.cutout?.quads})`);

// 6. face against a refined neighbour is split per sub
const half = new Array(64).fill(0).map((_, i) => ((i & 3) < 2 ? BLOCK.BASALT_MATRIX : 0));
r = meshSection(payload((x, y, z) => (x === 5 && y === 5 && z === 5 ? BLOCK.BASALT_MATRIX : x === 6 && y === 5 && z === 5 ? half : 0)), T);
ok(r.opaque.quads > 6, `cube beside refined half-cell (got ${r.opaque.quads})`);

// 7. climb rail against a wall: two panel quads, no cube faces
if (BLOCK.CLIMB_RAIL) {
  r = meshSection(payload((x, y, z) => (x === 5 && y === 5 && z === 5 ? BLOCK.BASALT_MATRIX : x === 6 && y === 5 && z === 5 ? BLOCK.CLIMB_RAIL : 0)), T);
  ok(r.cutout && r.cutout.quads === 2 && r.opaque.quads === 6, `rail → 2 panel quads (got ${r.cutout?.quads}, opaque ${r.opaque.quads})`);
  ok(r.cutout.pos[0] === 6 * 64 + 4, `rail sits against the wall at x=6+1/16 (got ${r.cutout.pos[0] / 64})`);
}

// perf: noisy terrain
const t0 = performance.now();
let quads = 0;
for (let k = 0; k < 20; k++) {
  const res = meshSection(payload((x, y, z) => {
    const h = 6 + Math.round(3 * Math.sin(x * 0.4 + k) + 2 * Math.cos(z * 0.5));
    if (y < h - 3) return BLOCK.BASALT_MATRIX;
    if (y < h) return BLOCK.LOAM_MESH;
    if (y === h) return BLOCK.PHOTOMOSS;
    if (y < 7) return BLOCK.WATER;
    if (y === h + 1 && (x * 7 + z * 3) % 11 === 0) return BLOCK.LUMEN_BLOOM;
    return 0;
  }), T);
  quads += res.opaque.quads;
}
console.log(`perf: ${((performance.now() - t0) / 20).toFixed(2)} ms/section, ${quads / 20} opaque quads avg`);
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
