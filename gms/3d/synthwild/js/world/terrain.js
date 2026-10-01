// Pure, deterministic terrain: everything is a function of (seed, world x/y/z), so features cross chunk borders.
// Climate (temperature/moisture) + continentalness + a ridge noise pick and blend the biomes.
import { makeNoise, seedToInt, hash2, rand2, rand3, hash3 } from './noise.js';
import { BLOCK } from '../data/blocks.js';
import { makeCaves } from './caves.js';
import { makeFeatures } from './features.js';

export const SEA = 32;
export const BIOMES = ['forest', 'shore', 'ocean', 'desert', 'mountains', 'plains', 'deep_ocean'];
export const BIO = { FOREST: 0, SHORE: 1, OCEAN: 2, DESERT: 3, MOUNTAINS: 4, PLAINS: 5, DEEP: 6 };
const { FOREST, SHORE, OCEAN, DESERT, MOUNTAINS, PLAINS, DEEP } = BIO;
const COL_H = 128;
const LAKE_GRID = 112;

const B = BLOCK;
export const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const band = (y, lo, peak, hi) => (y <= lo || y >= hi) ? 0 : y < peak ? (y - lo) / (peak - lo) : (hi - y) / (hi - peak);

export function makeTerrain(seed) {
  const S = seedToInt(seed);
  const nA = makeNoise(S), nB = makeNoise((S ^ 0x9e3779b9) >>> 0), nC = makeNoise((S + 7777) >>> 0);
  const nT = makeNoise((S ^ 0x7e3a11) >>> 0), nM = makeNoise((S ^ 0x3c0d1e) >>> 0), nE = makeNoise((S ^ 0x6a09e667) >>> 0);
  const nD = makeNoise((S ^ 0x1f83d9ab) >>> 0);
  const lakeCache = new Map();

  function base(x, z) {
    const dist = Math.sqrt(x * x + z * z);
    const near = 1 - ss(250, 550, dist); // keep forest + shore around the origin (spawn)
    const cont = nA.fbm2(x / 650, z / 650, 4) + 0.12;
    let t = nT.fbm2(x / 1100, z / 1100, 3), m = nM.fbm2(x / 900 + 100, z / 900, 3);
    m = m * (1 - near) + 0.25 * near;
    const dry = ss(-0.04, 0.08, -m), hot = ss(0.02, 0.14, t);
    const wF = 1 - dry, wD = dry * hot, wP = dry * (1 - hot);
    const wM = ss(0.16, 0.36, nE.fbm2(x / 700, z / 700, 3)) * ss(0.15, 0.32, cont) * (1 - near);
    let h;
    if (cont < 0) {
      const d = -cont;
      h = 31.2 - 5 * ss(0, 0.09, d) - 13 * ss(0.1, 0.28, d) - 8 * ss(0.3, 0.5, d) + nB.n2(x / 40, z / 40) * 1.2;
    } else {
      const ramp = ss(0, 0.14, cont);
      let land = 0;
      if (wF > 0.001) {
        const amp = 5 + 22 * ss(0.08, 0.5, cont);
        const hills = Math.pow(Math.max(0, nB.fbm2(x / 110, z / 110, 4) * 0.5 + 0.5), 1.35);
        land += wF * (amp * hills + nC.fbm2(x / 26, z / 26, 2) * 1.6);
      }
      if (wP > 0.001) land += wP * (1.4 + 1.0 * nC.n2(x / 70, z / 70) + 0.4 * nB.n2(x / 17, z / 17));
      if (wD > 0.001) {
        const warp = nD.n2(x / 200, z / 200) * 30;
        const dune = 1 - Math.abs(nD.n2((x + warp) / 34, z / 80));
        land += wD * (1.5 + 8 * dune * dune * (0.55 + 0.45 * nC.n2(x / 150, z / 150)) + nB.n2(x / 23, z / 23));
      }
      h = 32.6 + 1.6 * ss(0, 0.05, cont) + ramp * land;
      if (wM > 0.001) {
        const r1 = 1 - Math.abs(nE.n2(x / 230, z / 230)), r2 = 1 - Math.abs(nE.n2(x / 80 + 40, z / 80));
        const mm = r1 * r1 * 0.65 + r2 * r2 * 0.35;
        h += wM * (14 + 78 * mm * mm + 4 * nC.n2(x / 19, z / 19));
        const k = h / 7, f = k - Math.floor(k);
        h = h + (((Math.floor(k) + ss(0.3, 0.7, f)) * 7) - h) * 0.65 * wM; // terraces → cliffs
      }
    }
    return { h, cont, wF, wD, wP, wM };
  }

  function lake(gx, gz) {
    const k = gx * 100003 + gz;
    if (lakeCache.has(k)) return lakeCache.get(k);
    let L = null;
    const r = hash2(gx, gz, S ^ 0x1a4e5);
    if (r % 100 < 55) {
      const cx = gx * LAKE_GRID + 28 + ((r >>> 8) % 56), cz = gz * LAKE_GRID + 28 + ((r >>> 16) % 56);
      const b = base(cx, cz);
      if (b.cont > 0.17 && b.h >= 35.5 && b.h <= 56 && b.wM < 0.2)
        L = { cx, cz, r: 7 + ((r >>> 24) % 10), depth: 3 + ((r >>> 4) % 4), level: Math.floor(b.h) };
    }
    if (lakeCache.size > 4096) lakeCache.clear();
    lakeCache.set(k, L);
    return L;
  }

  // { h: surface (cells 0..h-1 solid), water: water top (0 = none), biome, cont, lake, mtn, desert }
  function column(x, z) {
    const b = base(x, z);
    let h = b.h, water = 0, inLake = false;
    const gx = Math.floor(x / LAKE_GRID), gz = Math.floor(z / LAKE_GRID);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const L = lake(gx + i, gz + j);
      if (!L) continue;
      const dx = x - L.cx, dz = z - L.cz;
      const d = Math.sqrt(dx * dx + dz * dz);
      const rr = L.r * (1 + 0.22 * nC.n2(x / 11, z / 11));
      if (d < rr) {
        const q = d / rr;
        h = Math.min(h, L.level - Math.max(1, L.depth * (1 - q * q)));
        water = L.level; inLake = true;
      } else if (d < rr + 6) {
        const t = ss(0, 1, (d - rr) / 6);
        h = Math.max(h, (L.level + 1.2) * (1 - t) + h * t);
      }
    }
    h = Math.max(4, Math.min(118, Math.floor(h)));
    if (h < SEA && !inLake) water = SEA;
    // dithered edges: per-column jitter on the comparisons turns crisp biome lines into a speckled band
    const jn = nC.n2(x / 6, z / 6) * 0.1;
    const jF = (rand2(x, z, S ^ 0xd1) - 0.5) * 0.32 + jn, jD = (rand2(x, z, S ^ 0xd2) - 0.5) * 0.32 - jn;
    const jP = (rand2(x, z, S ^ 0xd3) - 0.5) * 0.32, jM = (rand2(x, z, S ^ 0xd4) - 0.5) * 0.24 + jn;
    let biome;
    if (!inLake && h < 18) biome = DEEP;
    else if (!inLake && h < 27) biome = OCEAN;
    else if (!inLake && h < 36 && b.cont < 0.09 + jP * 0.08) biome = SHORE;
    else if (b.wM + jM > 0.45 && h >= 48) biome = MOUNTAINS;
    else {
      const f = b.wF + jF, d = b.wD + jD, p = b.wP + jP;
      biome = d >= f && d >= p ? DESERT : p > f ? PLAINS : FOREST;
    }
    return { h, water, biome, cont: b.cont, lake: inLake, mtn: b.wM, desert: b.wD };
  }

  const snowLine = (x, z) => 84 + nC.n2(x / 30, z / 30) * 5;

  function ore(x, y, z, stone) {
    const c = hash3(x >> 1, y >> 1, z >> 1, S ^ 0x0e0e), r = c % 10000;
    const q = 22 * band(y, 1, 6, 15), a = q + 60 * band(y, 2, 14, 34), f = a + 115 * band(y, 2, 30, 72), k = f + (y >= 5 ? 120 + 120 * band(y, 20, 70, 128) : 0);
    let m = stone, keep = 0.65;
    if (r < q) { m = B.ORE_QUBIT; keep = 0.45; }
    else if (r < a) m = B.ORE_AURUM;
    else if (r < f) m = B.ORE_FERRITE;
    else if (r < k) m = B.ORE_CARBON;
    if (m !== stone && rand3(x, y, z, S ^ 0x0f) > keep) m = stone;
    return m;
  }

  const caves = makeCaves(S);
  const features = makeFeatures(S, { column, snowLine, nB, nC, wormNear: caves.wormNear });

  function genColumn(cx, cz) {
    const x0 = cx * 16, z0 = cz * 16;
    const cells = new Uint16Array(16 * 16 * COL_H);
    const heights = new Uint8Array(256), waters = new Uint8Array(256), biomes = new Uint8Array(256);
    const ph = new Int16Array(18 * 18), pw = new Int16Array(18 * 18);
    const info = new Array(256);
    for (let z = -1; z <= 16; z++) for (let x = -1; x <= 16; x++) {
      const c = column(x0 + x, z0 + z);
      ph[(x + 1) + (z + 1) * 18] = c.h; pw[(x + 1) + (z + 1) * 18] = c.water;
      if (x >= 0 && x < 16 && z >= 0 && z < 16) info[x + z * 16] = c;
    }
    const mtn = new Float32Array(256), slopes = new Uint8Array(256);

    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const ci = x + z * 16, c = info[ci], wx = x0 + x, wz = z0 + z;
      const h = c.h;
      heights[ci] = h; waters[ci] = c.water; biomes[ci] = c.biome; mtn[ci] = c.mtn;
      const p = (x + 1) + (z + 1) * 18;
      const slope = Math.max(Math.abs(h - ph[p - 1]), Math.abs(h - ph[p + 1]), Math.abs(h - ph[p - 18]), Math.abs(h - ph[p + 18]));
      slopes[ci] = Math.min(255, slope);
      let top, soil, soilDepth, under2 = 0, under2Depth = 0;
      if (c.water > h) {
        const depth = c.water - h;
        if (c.lake) { top = depth <= 1 ? B.MIRROR_SAND : B.POLYMER_CLAY; soil = top; soilDepth = 2; }
        else if (depth <= 4) { top = soil = B.MIRROR_SAND; soilDepth = 3; }
        else { top = soil = nC.n2(wx / 23, wz / 23) > 0.15 ? B.POLYMER_CLAY : B.SHARD_GRAVEL; soilDepth = 3; }
      } else if (c.biome === SHORE) {
        top = soil = (h <= 34 && c.desert < 0.5 && nC.n2(wx / 9, wz / 9) > 0.35) ? B.CHROME_SHINGLE : B.MIRROR_SAND; soilDepth = 4;
      } else if (c.biome === DESERT) {
        top = soil = B.MIRROR_SAND; soilDepth = 4 + (hash2(wx, wz, S) % 3);
        under2 = B.MIRROR_SANDSTONE; under2Depth = 4;
      } else if (c.biome === MOUNTAINS || (c.mtn > 0.3 && h > 60)) {
        if (h > snowLine(wx, wz)) { top = B.FROST_LATTICE; soil = B.FIBRE_STONE; soilDepth = 2; }
        else if (slope >= 2 || h > 60) { top = soil = B.FIBRE_STONE; soilDepth = 0; }
        else { top = B.PHOTOMOSS; soil = B.LOAM_MESH; soilDepth = 2; }
      } else if (slope >= 3 && c.biome === FOREST) {
        top = soil = B.BASALT_MATRIX; soilDepth = 0;
      } else if (c.biome === PLAINS) {
        top = B.CRYSTAL_TURF; soil = B.LOAM_MESH; soilDepth = 3;
      } else {
        top = B.PHOTOMOSS; soil = B.LOAM_MESH; soilDepth = 3 + (hash2(wx, wz, S) & 1);
      }
      const fibreFrom = c.mtn > 0.3 ? 46 + Math.round(nC.n2(wx / 13, wz / 13) * 4) : 999;
      for (let y = 0; y < h; y++) {
        let m;
        if (y === 0 || (y === 1 && rand3(wx, 1, wz, S) < 0.5) || (y === 2 && rand3(wx, 2, wz, S) < 0.2)) m = B.COREPLATE;
        else if (y === h - 1) m = top;
        else if (y >= h - 1 - soilDepth) m = soil;
        else if (y >= h - 1 - soilDepth - under2Depth) m = under2;
        else m = ore(wx, y, wz, y >= fibreFrom ? B.FIBRE_STONE : B.BASALT_MATRIX);
        cells[x + z * 16 + y * 256] = m;
      }
      for (let y = h; y < c.water; y++) cells[x + z * 16 + y * 256] = B.WATER;
    }

    caves.carve(cells, x0, z0, heights, waters, ph, pw, mtn, slopes);
    features.groundFlora(cells, x0, z0, heights, waters, biomes);
    features.structures(cells, x0, z0);
    return { cells, heights, waters, biomes };
  }

  // land near the shore, as close to the origin as possible
  function spawnPoint() {
    for (let ring = 0; ring < 200; ring++) {
      const R = ring * 12;
      const n = Math.max(1, Math.round(ring * 6));
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        const x = Math.round(Math.cos(a) * R), z = Math.round(Math.sin(a) * R);
        const c = column(x, z);
        if (c.water || c.h < 33 || c.h > 36 || c.biome !== SHORE) continue;
        let sea = false, forest = false;
        for (let d = 0; d < 16 && !(sea && forest); d++) {
          const b = (d / 16) * Math.PI * 2;
          const o = column(x + Math.round(Math.cos(b) * 20), z + Math.round(Math.sin(b) * 20));
          if (o.water === SEA && !o.lake) sea = true;
          const f = column(x + Math.round(Math.cos(b) * 40), z + Math.round(Math.sin(b) * 40));
          if (f.biome === FOREST && !f.water) forest = true;
        }
        if (sea && forest) return [x + 0.5, c.h, z + 0.5];
      }
    }
    const c = column(0, 0);
    return [0.5, Math.max(c.h, c.water), 0.5];
  }

  return { seed: S, column, genColumn, spawnPoint, base, structuresNear: features.structuresNear };
}
