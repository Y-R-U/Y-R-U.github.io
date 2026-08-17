// §3.1 — the chunk grid. Deterministic descriptor generation, the authored-core lookup and its
// keep-out, district assignment, names, and the collision AABB store.
//
// NOTHING IN THIS FILE IMPORTS three.js OR TOUCHES THE DOM. That is deliberate: the determinism
// gate (`tools/determinism.mjs`) imports this module straight into node, generates a thousand
// chunks and hashes them. A city you cannot regenerate outside a browser is a city nobody can
// prove is stable.
//
// The lookup order of §3.1.1 is the load-bearing part and nothing may reorder it:
//
//   1. landmarksIn(cx, cz)   — the 8-entry authored table
//   2. districtAt(cx, cz)    — the core rectangles win over the noise field
//   3. the seeded field at density x (landmarks present ? 0.4 : 1.0)
//   4. reject any placement inside a keep-out circle — rejected, never retried elsewhere,
//      so the keep-out reads as a plaza and not as a crowd pushed to the edges
//   5. zones, lanes, signage (P3a/P7a) — all subject to (4)

import { hash2i, xorshift32 } from './utils.js';
import { DISTRICTS, byId, districtAt as fieldDistrictAt, paint, farTint } from './districts.js';

// §3.3's eight silhouette families. The table lives here rather than in blocks.js because
// blocks.js imports three.js and this module must import cleanly into node — the determinism
// gate hashes a thousand chunks with no browser anywhere near it.
export const PROTO_IDS = ['slab', 'taper', 'stack', 'spire', 'drum', 'terrace', 'podium', 'bridged'];

// What P3a needs to know about a prototype without re-deriving it from geometry: which ones have
// a wide street-level base to hang blade signage off, which have a clean upper shaft for an L5
// hero billboard, which have a plant deck, which have a sky bridge.
export const PROTO_TRAITS = {
  slab:    { podium: false, hero: false, roofPlant: true,  bridge: false },
  taper:   { podium: false, hero: false, roofPlant: true,  bridge: false },
  stack:   { podium: false, hero: false, roofPlant: true,  bridge: false },
  spire:   { podium: true,  hero: true,  roofPlant: false, bridge: false },
  drum:    { podium: false, hero: false, roofPlant: true,  bridge: false },
  terrace: { podium: false, hero: false, roofPlant: true,  bridge: false },
  podium:  { podium: true,  hero: false, roofPlant: true,  bridge: false },
  bridged: { podium: false, hero: true,  roofPlant: true,  bridge: true },
};

export const CHUNK = 256;             // §3.1 near grid, metres
export const FAR_CHUNK = 1024;        // §3.1 far grid — exactly 4x4 near chunks
export const BASE_PER_CHUNK = 28;     // §3.1 "density scales buildings per chunk (base 28)"
export const PAD_SALT = 0x9d21;

const LOTS = 5;                       // 5x5 lots of 51.2 m
const LOT = CHUNK / LOTS;
const ROAD = 13.2;                    // the canyon between lots — this is what canyon_dive flies
const BUILDABLE = LOT - ROAD;         // 38 m
const SPLIT_CHANCE = 0.18;            // a lot occasionally holds two narrower masses

// §3.3's mix. `slab` is ~35 % of all buildings; `spire` is rare and is demoted to a slab if the
// height roll did not come out tall, so a 90 m spire never happens.
const PROTO_W = [
  ['slab', 0.35], ['taper', 0.14], ['stack', 0.12], ['terrace', 0.12],
  ['podium', 0.10], ['drum', 0.07], ['bridged', 0.06], ['spire', 0.04],
];

// Which window-atlas cells a district draws from. atlas.js bakes 0-3 office grids, 4-6
// residential, 7-8 ribbon, 9-10 banded, 11 mostly dead, 12-13 mechanical, 14-15 curtain wall.
const CELLS = {
  spine:   [0, 1, 2, 3, 9, 14, 15, 7],
  ribs:    [4, 5, 6, 8, 10, 11, 15],
  vault:   [2, 3, 7, 9, 14, 15],
  soot:    [4, 5, 6, 11, 12, 13],
  lantern: [0, 4, 5, 8, 10, 11, 15],
  cradle:  [1, 2, 6, 7, 9, 14],
  pale:    [3, 7, 9, 14, 15, 2],
  drown:   [5, 11, 11, 12, 13, 6],
};

// ── data loading ───────────────────────────────────────────────────────────
// The two files are §3.1.1's and §3.1.2's deliverables and they are read, not compiled in — a
// landmark move must not be a code change. node reads them off disk; the browser fetches them.

export async function loadCityData(base = './data/') {
  const [landmarks, names] = await Promise.all([
    fetch(base + 'landmarks.json').then(r => r.json()),
    fetch(base + 'names.json').then(r => r.json()),
  ]);
  return { landmarks, names };
}

// ── the model ──────────────────────────────────────────────────────────────

export class CityModel {
  constructor({ landmarks, names, seed = 0x4e454f4e }) {
    this.seed = seed | 0;
    this.names = names;
    this.spawn = landmarks.spawn;

    // The three core district rectangles, in chunk coordinates, inclusive.
    this.coreRects = landmarks.districts.map(d => ({ id: d.id, name: d.name, rect: d.rect }));

    // Flatten the authored table once. Everything downstream reads world coordinates.
    this.landmarks = landmarks.landmarks.map(l => {
      const wx = l.chunk[0] * CHUNK + l.off[0];
      const wz = l.chunk[1] * CHUNK + l.off[1];
      const parts = l.parts.map(p => ({
        proto: p.proto,
        x: wx + p.off[0], z: wz + p.off[1],
        w: p.scale[0], h: p.scale[1], d: p.scale[2],
        cell: p.cell === undefined ? l.cell : p.cell,
      }));
      return {
        id: l.id, name: l.name, district: l.district, chunk: l.chunk,
        x: wx, z: wz, radius: l.radius, cell: l.cell,
        tint: typeof l.tint === 'string' ? parseInt(l.tint, 16) : l.tint,
        signage: l.signage || [], parts,
        height: Math.max(...parts.map(p => p.h)),
      };
    });
    this.byLandmark = Object.fromEntries(this.landmarks.map(l => [l.id, l]));

    this._chunkCache = new Map();     // generateChunk memo, bounded — see the note at its cap
    // Diagnostics only, and they exist because P7b added a caller. `zones.js:_clearance()` asks
    // for neighbouring chunks when it sites a pad, which raises the pressure on a cache that
    // evicts WHOLESALE — and a wholesale eviction hands the renderer a cold cache on its next
    // stream-in, which is exactly what §3.2.3's `ms.gen` gate measures. Counted rather than
    // reasoned about; `__game.cityCache()` reports them.
    this.cacheGens = 0;               // generateChunk MISSES (a real generation)
    this.cacheHits = 0;
    this.cacheClears = 0;             // wholesale evictions
    this.cacheHigh = 0;               // high-water mark
    this.aabbCell = 64;
    this.aabbs = new Map();           // spatial-hash key -> array of AABBs, filled by the renderer
  }

  // ── 2. districts — the core rectangles win over the noise field ──────────
  districtAt(cx, cz) {
    for (const r of this.coreRects) {
      const [x0, z0, x1, z1] = r.rect;
      if (cx >= x0 && cx <= x1 && cz >= z0 && cz <= z1) return byId[r.id];
    }
    return fieldDistrictAt(cx, cz, this.seed);
  }

  districtName(id) { return this.names.districts[id] || byId[id]?.name || id; }

  // ── 1. the authored table ────────────────────────────────────────────────
  landmarksIn(cx, cz) {
    const out = [];
    for (const l of this.landmarks) if (l.chunk[0] === cx && l.chunk[1] === cz) out.push(l);
    return out;
  }

  // Every landmark whose keep-out circle touches this chunk's rectangle. Eight circle-vs-rect
  // tests per chunk; this is the whole cost of the core (§3.1.1).
  keepOutNear(cx, cz) {
    const x0 = cx * CHUNK, z0 = cz * CHUNK, x1 = x0 + CHUNK, z1 = z0 + CHUNK;
    const out = [];
    for (const l of this.landmarks) {
      const nx = l.x < x0 ? x0 : l.x > x1 ? x1 : l.x;
      const nz = l.z < z0 ? z0 : l.z > z1 ? z1 : l.z;
      const dx = l.x - nx, dz = l.z - nz;
      if (dx * dx + dz * dz <= l.radius * l.radius) out.push(l);
    }
    return out;
  }

  // ── 3-4. the seeded field ────────────────────────────────────────────────
  generateChunk(cx, cz) {
    const key = cx + ',' + cz;
    const hit = this._chunkCache.get(key);
    if (hit) { this.cacheHits++; return hit; }
    this.cacheGens++;

    const lms = this.landmarksIn(cx, cz);                 // 1
    const district = this.districtAt(cx, cz);             // 2
    const near = this.keepOutNear(cx, cz);
    const density = district.density * (near.length ? 0.4 : 1.0);   // 3

    const rng = xorshift32(hash2i(cx, cz, this.seed));
    const ox = cx * CHUNK, oz = cz * CHUNK;
    const cells = CELLS[district.id];
    const buildings = [];
    let rejected = 0;

    for (let lz = 0; lz < LOTS; lz++) {
      for (let lx = 0; lx < LOTS; lx++) {
        if (rng() >= density) continue;
        const split = rng() < SPLIT_CHANCE;
        const n = split ? 2 : 1;
        for (let k = 0; k < n; k++) {
          const maxW = split ? (BUILDABLE - 5) / 2 : BUILDABLE;
          const w = maxW * (0.62 + rng() * 0.38);
          const d = BUILDABLE * (0.60 + rng() * 0.40);
          const slot = split ? (k - 0.5) * (BUILDABLE / 2 + 2.5) : 0;
          const jx = (rng() - 0.5) * (BUILDABLE - w) * 0.8;
          const jz = (rng() - 0.5) * (BUILDABLE - d) * 0.8;
          const x = ox + (lx + 0.5) * LOT + slot + jx;
          const z = oz + (lz + 0.5) * LOT + jz;

          // pow(u, 2.2) bias — tall buildings are rare and the skyline has real peaks (§3.1).
          const u = rng();
          const h = district.h[0] + Math.pow(u, 2.2) * (district.h[1] - district.h[0]);

          // 4 — the keep-out. Rejected placements are DROPPED, never retried elsewhere.
          const fr = Math.hypot(w, d) * 0.5;
          let blocked = false;
          for (const l of near) {
            const dx = x - l.x, dz = z - l.z, r = l.radius + fr;
            if (dx * dx + dz * dz < r * r) { blocked = true; break; }
          }
          if (blocked) { rejected++; continue; }

          // §3.10 #7 — the ledge rhythm only reads as a ruler at the height the prototype was
          // drawn for. `stack` has six masses, so below 200 m its ledges close up into stripes;
          // `spire` below 260 m is a stub. Both demote rather than being redrawn.
          let proto = pickProto(rng());
          if (proto === 'spire' && h < 260) proto = 'slab';
          if (proto === 'stack' && h < 200) proto = 'taper';
          if (proto === 'bridged' && w < 26) proto = 'slab';

          const bld = {
            x, z, w, d, h, proto,
            cell: cells[(rng() * cells.length) | 0],
            tint: district.window,
            jitter: 0.86 + rng() * 0.28,
            seed: rng() * 100,
            district: district.id,
            landmark: null,
          };
          // P11 §1. DERIVED from a dedicated salt on (x, z) — it draws NOTHING from `rng`, so the
          // stream, and therefore every building in the world and the golden determinism hash,
          // is byte-identical to what it was before this call existed.
          paint(bld, district);
          buildings.push(bld);
        }
      }
    }

    // The landmarks themselves, appended after the field so their slots are stable and so a
    // landmark is never rejected by its own keep-out.
    for (const l of lms) {
      for (const p of l.parts) {
        const bld = {
          x: p.x, z: p.z, w: p.w, d: p.d, h: p.h, proto: p.proto,
          cell: p.cell, tint: l.tint, jitter: 1.0, seed: (hash2i(l.x | 0, l.z | 0, 7) % 1000) / 10,
          district: l.district, landmark: l.id,
        };
        // A landmark keeps its AUTHORED colour as the base zone — `spindle` is ice, `kiln` is
        // sodium, and §3.1.1 says so — but it still gets zones, a band and a crown, because a
        // 640 m tower lit as one flat swatch is the most visible instance of the problem P11
        // exists to fix.
        paint(bld, byId[l.district] || district);
        bld.tint = l.tint; bld.tintA = 1.0;
        buildings.push(bld);
      }
    }

    const rec = {
      cx, cz, key, district: district.id, density: +density.toFixed(4),
      landmarks: lms.map(l => l.id), rejected, buildings,
      cxWorld: ox + CHUNK / 2, czWorld: oz + CHUNK / 2,
    };
    // A cache, not stored chunk state (§3.1: "no chunk state is ever stored") — dropping it
    // wholesale is always safe because generateChunk is a pure function of (cx, cz, seed).
    if (this._chunkCache.size > 900) { this._chunkCache.clear(); this.cacheClears++; }
    this._chunkCache.set(key, rec);
    if (this._chunkCache.size > this.cacheHigh) this.cacheHigh = this._chunkCache.size;
    return rec;
  }

  // §3.2 — LOD1 carries only the tallest 40 % of a chunk. Returned as indices into `buildings`
  // so the two LODs address the same descriptors and can never disagree about a building.
  tallIndices(rec, frac = 0.4) {
    const idx = rec.buildings.map((b, i) => i);
    idx.sort((a, b) => rec.buildings[b].h - rec.buildings[a].h || a - b);
    const n = Math.max(1, Math.round(idx.length * frac));
    const keep = idx.slice(0, n);
    // Landmarks are never dropped from LOD1 — the Spindle has to survive to the horizon.
    for (const i of idx.slice(n)) if (rec.buildings[i].landmark) keep.push(i);
    keep.sort((a, b) => a - b);
    return keep;
  }

  // ── LOD2 — the fog-swallowed skyline ─────────────────────────────────────
  // Six towers per far chunk, taken from the TOP of the height distribution. Generating the 16
  // near chunks a far chunk contains would cost 16 full chunk generations; instead each near
  // chunk contributes three cheap hashed candidates, which is the same distribution sampled
  // rather than enumerated, and is deterministic in exactly the same way.
  farTowers(fx, fz, n = 6) {
    const cand = [];
    const base = fx * 4, baseZ = fz * 4;
    for (let i = 0; i < 16; i++) {
      const cx = base + (i & 3), cz = baseZ + (i >> 2);
      const d = this.districtAt(cx, cz);
      for (let k = 0; k < 3; k++) {
        const hh = hash2i(cx, cz, this.seed ^ (0x5bf0 + k * 977));
        const u = (hh >>> 8) / 16777216;
        const h = d.h[0] + Math.pow(u, 2.2) * (d.h[1] - d.h[0]);
        if (h < d.h[0] + (d.h[1] - d.h[0]) * 0.25) continue;
        cand.push({
          x: cx * CHUNK + ((hh & 255) / 255) * CHUNK,
          z: cz * CHUNK + (((hh >>> 16) & 255) / 255) * CHUNK,
          w: 26 + ((hh >>> 24) & 63) * 0.55, d: 26 + ((hh >>> 3) & 63) * 0.55,
          // P11 §1 — the far skyline is a third of `fog_city`'s frame and every one of its 460
          // towers was the same district swatch. Same pool, same salt, no extra hash: `hh` is
          // already computed here.
          h, tint: farTint(d.id, hh), landmark: null,
        });
      }
    }
    for (const l of this.landmarks) {
      if (Math.floor(l.x / FAR_CHUNK) !== fx || Math.floor(l.z / FAR_CHUNK) !== fz) continue;
      const p = l.parts.reduce((a, b) => (b.h > a.h ? b : a));
      cand.push({ x: p.x, z: p.z, w: p.w, d: p.d, h: p.h, tint: l.tint, landmark: l.id });
    }
    // Landmarks first, then the tallest of the sampled field — a far chunk holding the Spindle
    // shows the Spindle whatever the field rolled.
    cand.sort((a, b) => (b.landmark ? 1 : 0) - (a.landmark ? 1 : 0) || b.h - a.h || a.x - b.x);
    return cand.slice(0, n);
  }

  // ── §3.1.2 names ─────────────────────────────────────────────────────────
  padName(cx, cz) {
    const pin = this.names.pinnedPads[cx + ',' + cz];
    if (pin) return pin;
    return this.names.pads[hash2i(cx, cz, PAD_SALT) % this.names.pads.length];
  }

  streetName(cx, cz) {
    return this.names.streets[hash2i(cx, cz, PAD_SALT ^ 0x33) % this.names.streets.length];
  }

  // ── the determinism hash ─────────────────────────────────────────────────
  // FNV-1a over quantised descriptor fields. Quantised because a float printed at full precision
  // is a hash of the JS engine's rounding, not of the city.
  hashRegion(x0, z0, x1, z1) {
    let h = 0x811c9dc5 >>> 0;
    const mix = v => { h ^= v & 255; h = Math.imul(h, 0x01000193) >>> 0; h ^= (v >>> 8) & 255; h = Math.imul(h, 0x01000193) >>> 0; };
    let n = 0;
    for (let cz = z0; cz <= z1; cz++) {
      for (let cx = x0; cx <= x1; cx++) {
        const rec = this.generateChunk(cx, cz);
        mix(rec.buildings.length);
        mix(DISTRICTS.findIndex(d => d.id === rec.district));
        mix(rec.rejected);
        for (const b of rec.buildings) {
          mix(Math.round(b.x * 8)); mix(Math.round(b.z * 8)); mix(Math.round(b.w * 8));
          mix(Math.round(b.d * 8)); mix(Math.round(b.h * 8));
          mix(PROTO_IDS.indexOf(b.proto)); mix(b.cell); mix(Math.round(b.jitter * 1000));
          n++;
        }
      }
    }
    return {
      hash: ('00000000' + h.toString(16)).slice(-8),
      buildings: n, chunks: (x1 - x0 + 1) * (z1 - z0 + 1),
    };
  }

  clearCache() { this._chunkCache.clear(); }
}

function pickProto(u) {
  let a = 0;
  for (const [id, w] of PROTO_W) { a += w; if (u < a) return id; }
  return 'slab';
}
