// Surface features: flora, kelp, seabed nodes, trees, glass spires; structures come from structures.js.
// A structure's existence depends only on pure column data, so a structure cut by a chunk border is always whole.
import { hash2, hash3, rand2, rand3, seedToInt } from './noise.js';
import { BLOCK } from '../data/blocks.js';
import { BIO, ss } from './terrain.js';
import { makeStructures } from './structures.js';

const B = BLOCK;
const COL_H = 128;

export function makeFeatures(S, T) {
  const { column, snowLine, nB, nC, wormNear, solidAt } = T;
  // ground two cells deep (not an overhang lip that the fragment cleanup may remove); pure, so chunk-consistent
  const firmGround = (x, z, h) => solidAt(x, h - 1, z) === 1 && solidAt(x, h - 2, z) === 1;
  const S2 = makeStructures(S, column, T.spawn);
  const ruinCovers = (x, z) => S2.covers(x, z, 2);

  function groundFlora(cells, x0, z0, heights, waters, biomes) {
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const ci = x + z * 16, h = heights[ci], w = waters[ci], wx = x0 + x, wz = z0 + z, bio = biomes[ci];
      if (h >= COL_H - 1) continue;
      const below = cells[ci + (h - 1) * 256];
      if (w > h) {
        const depth = w - h;
        if (below === B.WATER || below === 0) continue;
        if (bio === BIO.DEEP && rand2(wx, wz, S ^ 0x5eed) < 0.012) { cells[ci + h * 256] = B.SEABED_NODE; continue; }
        if (depth < 3) continue;
        const k = nB.n2(wx / 14, wz / 14);
        const deep = bio === BIO.DEEP;
        if (rand2(wx, wz, S ^ 0x6e1f) < (deep ? 0.16 : 0.08) + 0.25 * Math.max(0, k)) {
          const maxLen = deep ? Math.min(depth - 2, 20) : depth - 1;
          const len = 1 + (hash2(wx, wz, S ^ 0x3) % Math.max(1, maxLen));
          for (let y = h; y < h + len; y++) cells[ci + y * 256] = B.SERVER_KELP;
          if (deep && len >= 4) cells[ci + (h + len - 1) * 256] = B.KELP_BULB;
        }
      } else if (cells[ci + h * 256] === 0) {
        if (bio === BIO.FOREST && below === B.PHOTOMOSS) {
          if (rand2(wx, wz, S ^ 0xb100) < 0.03) cells[ci + h * 256] = B.LUMEN_BLOOM;
        } else if (bio === BIO.PLAINS && below === B.CRYSTAL_TURF) {
          const patch = nC.n2(wx / 12, wz / 12);
          const r = rand2(wx, wz, S ^ 0x9715);
          if (r < 0.02 + 0.12 * Math.max(0, patch)) cells[ci + h * 256] = B.PRISM_FLOWER;
          else if (r > 0.9975) { cells[ci + h * 256] = B.CLEARGLASS; if (r > 0.9990) cells[ci + (h + 1) * 256] = B.CLEARGLASS; }
        }
      }
    }
  }

  function structures(cells, x0, z0) {
    const put = (x, y, z, m, rule) => {
      const lx = x - x0, lz = z - z0;
      if (lx < 0 || lx > 15 || lz < 0 || lz > 15 || y < 1 || y >= COL_H) return;
      const i = lx + lz * 16 + y * 256, cur = cells[i];
      if (rule === 0) { if (cur !== B.COREPLATE) cells[i] = m; }                                                // force
      else if (rule === 1) { if (cur === 0 || cur === B.LUMEN_BLOOM || cur === B.DATA_VINE || cur === B.PRISM_FLOWER) cells[i] = m; } // soft
      else if (rule === 3) { if (cur === B.SERVER_KELP || cur === B.KELP_BULB) cells[i] = m; }                   // kelp only
      else if (cur === 0) cells[i] = m;                                                                         // air only
    };
    scan(x0, z0, 7, 6, 0x7ee5, (gx, gz, r) => tree(put, gx, gz, r));
    scan(x0, z0, 6, 2, 0xcac7, (gx, gz, r) => spire(put, gx, gz, r));
    S2.build(put, x0, z0);
  }

  // candidate grid: one jittered candidate per cell, visited in global order
  function scan(x0, z0, grid, margin, salt, fn) {
    const g0x = Math.floor((x0 - margin) / grid), g1x = Math.floor((x0 + 15 + margin) / grid);
    const g0z = Math.floor((z0 - margin) / grid), g1z = Math.floor((z0 + 15 + margin) / grid);
    for (let gz = g0z; gz <= g1z; gz++) for (let gx = g0x; gx <= g1x; gx++) fn(gx, gz, hash2(gx, gz, S ^ salt), grid);
  }

  // ---- trees ----
  function tree(put, gx, gz, r) {
    const tx = gx * 7 + (r % 7), tz = gz * 7 + ((r >>> 3) % 7);
    const c = column(tx, tz);
    if (c.water > 0 || c.h > 100) return;
    let chance, kindBias = 0;
    if (c.biome === BIO.FOREST) chance = (0.12 + 0.68 * (0.5 + 0.5 * nB.n2(tx / 90 + 50, tz / 90))) * ss(0.09, 0.16, c.cont);
    else if (c.biome === BIO.PLAINS) chance = 0.035;
    else if (c.biome === BIO.MOUNTAINS || c.mtn > 0.3) { if (c.h > 66) return; chance = 0.18; kindBias = 1; }
    else return;
    if (((r >>> 8) % 1000) / 1000 >= chance) return;
    if (ruinCovers(tx, tz)) return;
    if (wormNear(tx, tz, c.h - 6, 2) || !firmGround(tx, tz, c.h)) return;
    const type = (r >>> 18) % 100;
    const kind = kindBias ? (type < 80 ? 1 : 0) : type < 64 ? 0 : type < 90 ? 1 : 2;
    buildTree(put, tx, c.h, tz, kind, hash2(tx, tz, S ^ 0x77), S);
  }

  // ---- desert: glass spires (saguaro-like) ----
  function spire(put, gx, gz, r) {
    const tx = gx * 6 + (r % 6), tz = gz * 6 + ((r >>> 3) % 6);
    if (((r >>> 8) % 100) >= 32) return;
    const c = column(tx, tz);
    if (c.biome !== BIO.DESERT || c.water || ruinCovers(tx, tz) || !firmGround(tx, tz, c.h)) return;
    const y = c.h, ht = 2 + ((r >>> 16) % 4);
    for (let k = 0; k < ht; k++) put(tx, y + k, tz, B.GLASS_SPIRE, 2);
    if (ht >= 3 && ((r >>> 20) % 100) < 45) {
      const d = (r >>> 24) & 3, ax = [1, -1, 0, 0][d], az = [0, 0, 1, -1][d];
      const ay = y + 1 + ((r >>> 26) & 1);
      put(tx + ax, ay, tz + az, B.GLASS_SPIRE, 2);
      put(tx + ax, ay + 1, tz + az, B.GLASS_SPIRE, 2);
      if ((r >>> 28) & 1) put(tx + ax, ay + 2, tz + az, B.GLASS_SPIRE, 2);
    }
  }

  return { groundFlora, structures, structuresNear: S2.near };
}

// put(x,y,z,mat,rule): rule 0 = trunk (force), 1 = leaf (air/soft plants), 2 = vine (air only)
function buildTree(put, x, y, z, kind, r, S) {
  const LOG = B.CARBON_LOG, LEAF = B.SOLAR_LEAVES, VINE = B.DATA_VINE;
  const leafAt = (lx, ly, lz) => { if (rand3(lx, ly, lz, S ^ 0x1eaf) >= 0.06) put(lx, ly, lz, LEAF, 1); };
  const vine = (vx, vy, vz, maxLen) => {
    const len = 1 + (hash3(vx, vy, vz, S ^ 0x5) % maxLen);
    for (let k = 1; k <= len; k++) put(vx, vy - k, vz, VINE, 2);
  };
  if (kind === 0) {
    const th = 4 + (r % 3), rx = 2.4 + ((r >>> 4) % 3) * 0.3, ry = 2.1, cy = y + th;
    for (let dy = -2; dy <= 2; dy++) for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
      const q = (dx * dx + dz * dz) / (rx * rx) + ((dy - 0.3) * (dy - 0.3)) / (ry * ry);
      if (q > 1 || (q > 0.65 && rand3(x + dx, cy + dy, z + dz, S ^ 0xa1) < 0.25)) continue;
      leafAt(x + dx, cy + dy, z + dz);
      if (dy === -1 && dx * dx + dz * dz >= 4 && rand3(x + dx, cy, z + dz, S ^ 0x7) < 0.3) vine(x + dx, cy - 1, z + dz, 4);
    }
    for (let k = 0; k < th + 1; k++) put(x, y + k, z, LOG, 0);
  } else if (kind === 1) {
    const th = 7 + (r % 3), top = y + th + 1;
    for (let ly = y + 3; ly <= top; ly++) {
      const fromTop = top - ly;
      let rad = 0.8 + fromTop * 0.42;
      if (fromTop % 2 === 1) rad -= 0.9;
      rad = Math.max(0.6, Math.min(3.2, rad));
      const ir = Math.ceil(rad);
      for (let dz = -ir; dz <= ir; dz++) for (let dx = -ir; dx <= ir; dx++) {
        if (dx * dx + dz * dz > rad * rad + 0.3) continue;
        leafAt(x + dx, ly, z + dz);
        if (ly === y + 3 && dx * dx + dz * dz >= 4 && rand3(x + dx, ly, z + dz, S ^ 0x8) < 0.35) vine(x + dx, ly, z + dz, 3);
      }
    }
    for (let k = 0; k < th; k++) put(x, y + k, z, LOG, 0);
  } else {
    const th = 9 + (r % 4), cy = y + th, rx = 4.3, ry = 2.8;
    for (let dy = -3; dy <= 3; dy++) for (let dz = -5; dz <= 5; dz++) for (let dx = -5; dx <= 5; dx++) {
      const ex = dx - 0.5, ez = dz - 0.5;
      const q = (ex * ex + ez * ez) / (rx * rx) + ((dy - 0.4) * (dy - 0.4)) / (ry * ry);
      if (q > 1 || (q > 0.6 && rand3(x + dx, cy + dy, z + dz, S ^ 0xa2) < 0.3)) continue;
      leafAt(x + dx, cy + dy, z + dz);
      if (dy === -2 && ex * ex + ez * ez >= 6 && rand3(x + dx, cy, z + dz, S ^ 0x9) < 0.45) vine(x + dx, cy - 2, z + dz, 6);
    }
    for (let k = 0; k < th; k++) for (let o = 0; o < 4; o++) put(x + (o & 1), y + k, z + (o >> 1), LOG, 0);
    // root flare: face-adjacent to the 2x2 trunk, sunk one cell into the ground
    for (const [rx, rz] of [[-1, 0], [2, 1], [1, -1], [0, 2]]) { put(x + rx, y, z + rz, LOG, 0); put(x + rx, y - 1, z + rz, LOG, 0); }
  }
}

// Grow a forest tree at runtime (saplings). The trunk starts at (x,y,z), which may hold the sapling.
// Never overwrites player blocks: logs and leaves only go into air or soft plants. Returns cells placed, or 0 if the
// trunk has no room (then nothing changes).
export function growTree(world, x, y, z, seed = 0) {
  const S = (seedToInt(seed) ^ hash3(x, y, z, 0x5a9)) >>> 0;
  const r = hash2(x, z, S ^ 0x77), type = (r >>> 18) % 100;
  const kind = type < 70 ? 0 : 1;
  const soft = (v) => v === 0 || v === B.LUMEN_BLOOM || v === B.PRISM_FLOWER || v === B.BIO_SAPLING || v === B.DATA_VINE;
  const trunkH = kind === 0 ? 5 + (r % 3) : 7 + (r % 3);
  for (let k = 0; k < trunkH; k++) if (!soft(world.getCell(x, y + k, z))) return 0;
  const writes = new Map();
  const put = (px, py, pz, m, rule) => {
    if (py < 1 || py > 127) return;
    const key = px + ',' + py + ',' + pz, cur = writes.has(key) ? writes.get(key)[3] : world.getCell(px, py, pz);
    if (rule === 0 ? soft(cur) || cur === B.SOLAR_LEAVES : rule === 1 ? soft(cur) : cur === 0)
      writes.set(key, [px, py, pz, m]);
  };
  buildTree(put, x, y, z, kind, r, S);
  return world._placeCells([...writes.values()]);
}
