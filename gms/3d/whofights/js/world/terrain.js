// The ground: a coarse heightfield with no river in it, the Vail's channel carried by an
// arc-length bank ribbon over the top, the water surface, the road ribbons, and the
// contact-occlusion decals that stop buildings floating. The field itself is in field.js.

import * as THREE from 'three';
import { ZONE_IDS, zone } from './zones.js';
import { getMaterial } from './materials.js';
import { waterMaterial, setObstacles, registerWaterKnobs } from './water.js';
import { clamp, lerp, smoothstep, hexRgb } from './textures/noise.js';
import {
  X0, X1, Z0, Z1, TOWNS, CENTERS, BOUNDS, PLAY, fbm, waterY, FLOOR, RIVER_CP, creekZ, creekHalf,
  creekBank, CHANNEL, DOWNS_X, MILL_X, FORD_X, SPAN_X, GORGE_X, landAt, carve, heightAt, depthAt,
  zoneMix, zoneAt, townAt, XS, ZS, NX, NZ, fcell, ROADS, roadPoints, roadLine, CROSSINGS,
  HAS_WATER, ROAD_Z,
} from './field.js';

export {
  TOWNS, CENTERS, BOUNDS, PLAY, fbm, waterY, FLOOR, RIVER_CP, creekZ, creekHalf, creekBank,
  CHANNEL, DOWNS_X, MILL_X, FORD_X, SPAN_X, GORGE_X, landAt, carve, heightAt, depthAt, zoneAt,
  ROADS, roadPoints, roadLine, CROSSINGS, HAS_WATER, ROAD_Z,
};

// Chunk seams in world metres. Culling wants small bounding spheres, so the split is by extent
// rather than by vertex count — a 12 m chunk holding the same number of vertices as a 3.4 m one
// would span a third of the map and never cull.
const CHX = [X0, -170, -60, 60, 170, X1];
const CHZ = [Z0, -170, -60, 60, 170, Z1];

// How far past the banks the world mesh stops and the ribbon takes over, and how far past *that*
// the ribbon runs. The overlap has to exceed one grid cell's diagonal or the two leave a hole you
// can see the sky through; `carve` is zero out there, so it is the same ground twice and the
// ribbon sinks a few centimetres to let the world mesh win the coincident pixels.
const RIB_HOLE = 16, RIB_OVER = 30;

// Cell size for the contact-AO decals and the run length of one road ribbon segment, both in
// metres. Coarser than the 60 m building blocks on purpose: these are one draw call each and a
// tighter grid buys culled triangles at a worse price in calls.
const AOC = 120, ROAD_SEG = 110;

// index of the axis node at (or just below) a chunk boundary — the boundaries are span endpoints,
// so this lands exactly on one
function span(arr, v) {
  let best = 0;
  for (let i = 0; i < arr.length; i++) if (arr[i] <= v + 1e-4) best = i;
  return best;
}

// Occupancy / contact-AO grid. At GS 1 over 1440 × 720 this is 1.04 M cells, a 4.2 MB Float32Array
// and a two-pass blur over a million cells at boot. 2 m is still four times finer than the ground
// vertices that read it. WORLD.md §6.5 wants this allocated per town patch at GS 1 instead, which
// is A4's to do once patches exist.
const GS = 2;
const GW = Math.round((X1 - X0) / GS) + 1;
const GH = Math.round((Z1 - Z0) / GS) + 1;

// Second bit of the occupancy grid: this cell is not merely blocked, it is a hard surface.
const PAVED = 2;


// Scenario cameras: position, keep-out radius, and the view direction. The scenarios are the
// critic's contract, so this is a hard constraint on the layout, not a hint. demo.js fills it
// from its own shot table via setCameras() before anything is placed.
export const CAMERAS = [[-108, -52, 13, 0.95, 0.31], [0, 44, 10, 0, -1], [52, -14, 11, 0.67, -0.74],
  [40, 46, 10, -0.54, -0.84], [-52, 80, 10, 0.9, -0.42]];

export function setCameras(list) {
  CAMERAS.length = 0;
  for (const { pos, look, keep = 10 } of list) {
    const dx = look[0] - pos[0], dz = look[2] - pos[2];
    const l = Math.hypot(dx, dz) || 1;
    CAMERAS.push([pos[0], pos[2], keep, dx / l, dz / l]);
  }
}

export function nearCamera(x, z, extra = 0) {
  for (const [cx, cz, r] of CAMERAS) {
    const d = r + extra;
    if ((x - cx) ** 2 + (z - cz) ** 2 < d * d) return true;
  }
  return false;
}

export function camDist(x, z) {
  let best = Infinity;
  for (const [cx, cz] of CAMERAS) best = Math.min(best, Math.hypot(x - cx, z - cz));
  return best;
}

// A tree that lands in the first few metres of a shot's sight line fills a third of the frame.
// Only foliage uses this — clearing buildings out of the corridor would gut the composition.
export function inCorridor(x, z, dist = 30, rad = 6) {
  for (const [cx, cz, , dx, dz] of CAMERAS) {
    const t = (x - cx) * dx + (z - cz) * dz;
    if (t < 0 || t > dist) continue;
    const px = x - (cx + dx * t), pz = z - (cz + dz * t);
    if (px * px + pz * pz < rad * rad) return true;
  }
  return false;
}

export class Terrain {
  constructor() {
    this.object3D = new THREE.Group();
    this.object3D.name = 'terrain';
    this.occ = new Uint8Array(GW * GH);
    this.aoSrc = new Float32Array(GW * GH);
    this.footprints = [];
    this.paths = [];
    this.patches = [];
    this.decalRings = [];
    this.propDecals = [];
    this.reflects = [];
  }

  mark(x, z, r) {
    for (let dz = -r; dz <= r; dz += GS) {
      for (let dx = -r; dx <= r; dx += GS) {
        if (dx * dx + dz * dz <= r * r) this.occ[this.gi(x + dx, z + dz)] |= 1;
      }
    }
  }

  addPropDecal(x, z, r, s) { this.propDecals.push({ x, z, r, s }); }

  gi(x, z) {
    const i = clamp(Math.round((x - X0) / GS), 0, GW - 1);
    const j = clamp(Math.round((z - Z0) / GS), 0, GH - 1);
    return j * GW + i;
  }

  // Building footprint: blocks scatter, drives the AO decal and darkens the ground around it.
  addFootprint(x, z, hw, hd, rot = 0, opts = {}) {
    // `hollow`: you can walk inside this one, so the footing pass must not grow inward.
    const fp = { x, z, hw, hd, rot, ao: opts.ao ?? 1, grow: opts.grow ?? 0.6, hollow: !!opts.hollow };
    this.footprints.push(fp);
    const c = Math.cos(-rot), s = Math.sin(-rot);
    const r = Math.hypot(hw, hd) + fp.grow + 5.25;
    for (let dz = -r; dz <= r; dz += GS) {
      for (let dx = -r; dx <= r; dx += GS) {
        const lx = dx * c - dz * s, lz = dx * s + dz * c;
        const ox = Math.abs(lx) - hw, oz = Math.abs(lz) - hd;
        const d = Math.hypot(Math.max(ox, 0), Math.max(oz, 0)) + Math.min(Math.max(ox, oz), 0);
        const k = this.gi(x + dx, z + dz);
        if (d < fp.grow) this.occ[k] |= 1;
        if (fp.ao) this.aoSrc[k] = Math.max(this.aoSrc[k], fp.ao * smoothstep(4.8, -0.3, d));
      }
    }
    if (fp.ao) this.decalRings.push(fp);
    return fp;
  }

  addPath(pts, halfWidth, zoneId) {
    this.paths.push({ pts, halfWidth, zoneId });
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const n = Math.max(1, Math.ceil(len / GS));
      for (let s = 0; s <= n; s++) {
        const x = lerp(a[0], b[0], s / n), z = lerp(a[1], b[1], s / n);
        for (let dz = -halfWidth; dz <= halfWidth; dz += GS) {
          for (let dx = -halfWidth; dx <= halfWidth; dx += GS) {
            if (dx * dx + dz * dz > halfWidth * halfWidth) continue;
            this.occ[this.gi(x + dx, z + dz)] |= 1;
          }
        }
      }
    }
  }

  // A town square or the floor of a walled room, surfaced in the zone's own road stone and kept
  // clear of scatter. It takes a surface, not a mask: groundColour() never reads `occ`, so masking
  // a rect can stop things growing on it but can never stop it being green.
  addPatch(r, zoneId, fade = 2.4) {
    this.patches.push({ ...r, zoneId, fade });
    for (let z = r.z0 - fade; z <= r.z1 + fade; z += GS) {
      for (let x = r.x0 - fade; x <= r.x1 + fade; x += GS) this.occ[this.gi(x, z)] |= 1 | PAVED;
    }
  }

  blocked(x, z) { return (this.occ[this.gi(x, z)] & 1) === 1; }

  // Inside a building you can walk into. Footprints overlap — the academy's corner towers reach
  // seven metres into the hall — so this asks every hollow one, not the nearest.
  hollowAt(x, z) {
    for (const f of this.footprints) {
      if (!f.hollow) continue;
      const dx = x - f.x, dz = z - f.z;
      const c = Math.cos(-f.rot), s = Math.sin(-f.rot);
      if (Math.abs(dx * c - dz * s) < f.hw && Math.abs(dx * s + dz * c) < f.hd) return true;
    }
    return false;
  }

  // Blocked *and* surfaced. The wall-footing scatter grows through `blocked` on purpose — that
  // ring is exactly where the anti-sticker tufts belong — but not through a paved floor.
  paved(x, z) { return (this.occ[this.gi(x, z)] & PAVED) !== 0; }

  // min / max ground under a rotated footprint — what a foundation has to span. Reads the built
  // grid once it exists, so a building is seated on what is drawn rather than on the field the
  // mesh is a sampling of.
  range(x, z, hw, hd, rot = 0) {
    const c = Math.cos(rot), s = Math.sin(rot);
    const at = this.hgrid ? (px, pz) => this.surfaceY(px, pz) : heightAt;
    let lo = Infinity, hi = -Infinity;
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const lx = i * hw, lz = j * hd;
        const h = at(x + lx * c - lz * s, z + lx * s + lz * c);
        if (h < lo) lo = h;
        if (h > hi) hi = h;
      }
    }
    return { lo, hi };
  }

  build() {
    // once only: it is a two-pass blur in place, so a rebuild would blur the blurred field again
    if (!this.aoBlurred) { this.aoBlurred = true; this.blurAO(); }
    this.buildGround();
    // No water in this world: field.js parks the channel outside BOUNDS and `carve` is zero, so
    // the bank ribbon, the surface and the reflection quads would all be built where nothing can
    // ever see them.
    if (HAS_WATER) { this.buildBanks(); this.buildWater(); this.buildReflections(); }
    this.buildRoads();
    this.buildPatches();
  }

  blurAO() {
    const tmp = new Float32Array(GW * GH);
    const R = 2;
    for (let pass = 0; pass < 2; pass++) {
      for (let j = 0; j < GH; j++) {
        for (let i = 0; i < GW; i++) {
          let s = 0, n = 0;
          for (let k = -R; k <= R; k++) {
            const ii = i + k;
            if (ii < 0 || ii >= GW) continue;
            s += this.aoSrc[j * GW + ii]; n++;
          }
          tmp[j * GW + i] = s / n;
        }
      }
      for (let i = 0; i < GW; i++) {
        for (let j = 0; j < GH; j++) {
          let s = 0, n = 0;
          for (let k = -R; k <= R; k++) {
            const jj = j + k;
            if (jj < 0 || jj >= GH) continue;
            s += tmp[jj * GW + i]; n++;
          }
          this.aoSrc[j * GW + i] = s / n;
        }
      }
    }
  }

  ao(x, z) {
    const fx = clamp((x - X0) / GS, 0, GW - 1.001), fz = clamp((z - Z0) / GS, 0, GH - 1.001);
    const i = fx | 0, j = fz | 0, tx = fx - i, tz = fz - j;
    const a = this.aoSrc[j * GW + i], b = this.aoSrc[j * GW + i + 1];
    const c = this.aoSrc[(j + 1) * GW + i], d = this.aoSrc[(j + 1) * GW + i + 1];
    return lerp(a + (b - a) * tx, c + (d - c) * tx, tz);
  }

  // Height of the rendered surface, not the analytic field — props sit on what you can see.
  // The grid holds the land with no river in it; `carve` is added back on top, exactly as the
  // bank ribbon's own vertices are built, so the two agree wherever they overlap and `heightAt`
  // differs from this only by the grid's interpolation error. See docs/NOTES_WORLD_A2-A5.md.
  landY(x, z) {
    const fx = fcell(XS, x), fz = fcell(ZS, z);
    const i = fx | 0, j = fz | 0, tx = fx - i, tz = fz - j;
    const h = this.hgrid;
    const a = h[j * NX + i], b = h[j * NX + i + 1];
    const c = h[(j + 1) * NX + i], d = h[(j + 1) * NX + i + 1];
    return lerp(a + (b - a) * tx, c + (d - c) * tx, tz);
  }

  surfaceY(x, z) { return this.landY(x, z) + carve(x, z); }

  // Off the built grid, not off heightAt. buildGround used to call this per vertex and it called
  // heightAt four more times, so every terrain vertex cost five field evaluations; over the new
  // world that is the difference between a 400 ms and a 100 ms boot.
  slopeAt(x, z) {
    const e = 1.4;
    const dx = this.surfaceY(x + e, z) - this.surfaceY(x - e, z);
    const dz = this.surfaceY(x, z + e) - this.surfaceY(x, z - e);
    return Math.hypot(dx, dz) / (2 * e);
  }

  // Ground vertex colour: zone blend, mottle, contact AO, the wet / shingle margin at the water
  // line and a slope lift. The bank ribbon runs the same function, or the seam between the two
  // meshes would be a colour edge even where the heights match exactly.
  groundColour(x, z, h, slope, out) {
    const tints = this.tints ??= ZONE_IDS.map(id => hexRgb(zone(id).groundTint).map(v => v / 255));
    const w = this.zw ??= [0, 0, 0];
    const zn = zoneMix(x, z, w);
    const base = tints[zn];
    let r = clamp((w[0] * tints[0][0] + w[1] * tints[1][0] + w[2] * tints[2][0]) / base[0], 0.5, 1.8);
    let g = clamp((w[0] * tints[0][1] + w[1] * tints[1][1] + w[2] * tints[2][1]) / base[1], 0.5, 1.8);
    let b = clamp((w[0] * tints[0][2] + w[1] * tints[1][2] + w[2] * tints[2][2]) / base[2], 0.5, 1.8);

    // Irrational phases. Value noise has zero gradient at every lattice node, so an integer
    // offset puts a node on x = 0 for every octave of every term at once and the flat spots line
    // up into a ridge the length of the map. That is the street_dusk seam, and the mottle here
    // was the last term still carrying one.
    const mot = 1 + 0.13 * fbm(x * 0.043 + 0.732, z * 0.043 + 1.618, 2, 5)
      + 0.07 * fbm(x * 0.17 + 2.236, z * 0.17 + 0.414, 2, 19);
    r *= mot; g *= mot; b *= mot;

    const a = clamp(this.ao(x, z), 0, 1);
    const k1 = 1 - 0.5 * a;
    r *= k1; g *= k1 * 1.01; b *= k1 * 1.04;

    // a dark saturated wet band right at the water line, a pale shingle strip just above it,
    // both confined to the channel so low ground elsewhere stays green
    const bank = creekBank(x);
    const near = smoothstep(bank * 2.4, bank * 1.1, Math.abs(z - creekZ(x)));
    const above = h - waterY(x);
    const wet = smoothstep(2.0, -0.05, above) * near;
    const shingle = smoothstep(3.4, 1.1, above) * smoothstep(0.4, 1.4, above) * near;
    r *= lerp(1, 0.32, wet) * lerp(1, 1.20, shingle);
    g *= lerp(1, 0.39, wet) * lerp(1, 1.14, shingle);
    b *= lerp(1, 0.53, wet) * lerp(1, 1.02, shingle);

    const sl = smoothstep(0.30, 0.85, slope);
    out[0] = r * lerp(1, 1.14, sl); out[1] = g * lerp(1, 1.08, sl); out[2] = b * lerp(1, 0.98, sl);
    return zn;
  }

  buildGround() {
    const n = NX * NZ;
    const pos = new Float32Array(n * 3);
    const nrm = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const hg = this.hgrid = new Float32Array(n);
    const zi = new Uint8Array(n);
    const rgb = [0, 0, 0];

    for (let j = 0; j < NZ; j++) {
      for (let i = 0; i < NX; i++) hg[j * NX + i] = landAt(XS[i], ZS[j]);
    }

    // Central differences on the grid rather than computeVertexNormals: the mesh is split into
    // chunks and a per-chunk normal pass has no neighbours across a seam, which lights every
    // chunk edge as a crease.
    for (let j = 0; j < NZ; j++) {
      for (let i = 0; i < NX; i++) {
        const k = j * NX + i;
        const i0 = Math.max(0, i - 1), i1 = Math.min(NX - 1, i + 1);
        const j0 = Math.max(0, j - 1), j1 = Math.min(NZ - 1, j + 1);
        const gx = (hg[j * NX + i0] - hg[j * NX + i1]) / (XS[i1] - XS[i0]);
        const gz = (hg[j0 * NX + i] - hg[j1 * NX + i]) / (ZS[j1] - ZS[j0]);
        const l = Math.hypot(gx, 1, gz);
        nrm[k * 3] = gx / l; nrm[k * 3 + 1] = 1 / l; nrm[k * 3 + 2] = gz / l;
      }
    }

    // A quad whose corners are all this near the centreline is left out: the bank ribbon covers
    // that ground at a resolution the 4–10 m grid cannot reach. The ribbon runs 30 m wider than
    // the hole so there is always overlap rather than a gap to fall through.
    const hole = new Uint8Array(n);
    for (let j = 0; j < NZ; j++) {
      for (let i = 0; i < NX; i++) {
        const w = (creekBank(XS[i]) + RIB_HOLE) * Math.min(1, this.ribbonK ?? 1);
        hole[j * NX + i] = Math.abs(ZS[j] - creekZ(XS[i])) < w ? 1 : 0;
      }
    }
    this.hole = hole;

    for (let j = 0; j < NZ; j++) {
      const z = ZS[j];
      for (let i = 0; i < NX; i++) {
        const x = XS[i];
        const k = j * NX + i;
        pos[k * 3] = x; pos[k * 3 + 1] = hg[k]; pos[k * 3 + 2] = z;
        const slope = Math.hypot(nrm[k * 3], nrm[k * 3 + 2]) / nrm[k * 3 + 1];
        zi[k] = this.groundColour(x, z, hg[k], slope, rgb);
        col[k * 3] = rgb[0]; col[k * 3 + 1] = rgb[1]; col[k * 3 + 2] = rgb[2];
      }
    }

    const mats = this.groundMats();

    // One mesh spanning the map has a bounding sphere that intersects every frustum, which is why
    // 301k of 301.8k resident triangles were drawn in wall_day. Chunks are the cheapest fix that
    // does not need a second resolution of ground: same grid, same heights, several meshes.
    this.chunks = [];
    this.ground = new THREE.Group();
    this.ground.name = 'groundChunks';
    this.object3D.add(this.ground);
    for (let cz = 0; cz < CHZ.length - 1; cz++) {
      for (let cx = 0; cx < CHX.length - 1; cx++) {
        const i0 = span(XS, CHX[cx]), i1 = span(XS, CHX[cx + 1]);
        const j0 = span(ZS, CHZ[cz]), j1 = span(ZS, CHZ[cz + 1]);
        if (i1 <= i0 || j1 <= j0) continue;
        const m = this.groundChunk(pos, nrm, col, zi, mats, i0, i1, j0, j1);
        if (m) this.chunks.push(m);
      }
    }
  }

  groundMats() {
    return ZONE_IDS.map(id => {
      const m = getMaterial(id, 'ground');
      m.vertexColors = true;
      m.needsUpdate = true;
      return m;
    });
  }

  // Vertices are re-emitted per chunk rather than shared, so a chunk's index buffer is dense and
  // the seam is exact: both sides read the same position and the same grid normal.
  groundChunk(pos, nrm, col, zi, mats, i0, i1, j0, j1) {
    const w = i1 - i0 + 1, d = j1 - j0 + 1;
    const p = new Float32Array(w * d * 3), n = new Float32Array(w * d * 3), c = new Float32Array(w * d * 3);
    for (let j = 0; j <= j1 - j0; j++) {
      for (let i = 0; i <= i1 - i0; i++) {
        const src = ((j + j0) * NX + i + i0) * 3, dst = (j * w + i) * 3;
        for (let k = 0; k < 3; k++) { p[dst + k] = pos[src + k]; n[dst + k] = nrm[src + k]; c[dst + k] = col[src + k]; }
      }
    }
    const idx = [[], [], []];
    const hole = this.hole;
    for (let j = 0; j < j1 - j0; j++) {
      for (let i = 0; i < i1 - i0; i++) {
        const g = (j + j0) * NX + i + i0;
        if (hole[g] && hole[g + 1] && hole[g + NX] && hole[g + NX + 1]) continue;
        const a = j * w + i, b = a + 1, cc = a + w, dd = cc + 1;
        idx[zi[g]].push(a, cc, b);
        idx[zi[g + NX + 1]].push(b, cc, dd);
      }
    }
    if (!idx[0].length && !idx[1].length && !idx[2].length) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(n, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
    const flat = [];
    let start = 0;
    for (let z = 0; z < 3; z++) {
      if (!idx[z].length) continue;
      for (const v of idx[z]) flat.push(v);
      geo.addGroup(start, idx[z].length, z);
      start += idx[z].length;
    }
    geo.setIndex(flat);
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, mats);
    mesh.name = 'ground';
    mesh.receiveShadow = true;
    this.ground.add(mesh);
    return mesh;
  }

  // Stations spaced along *arc length*, not along x. On a bend where dz/dx is 1.5 a 2.6 m x-step
  // is a 4.7 m real step and the bank goes faceted. Built once and shared by the bank ribbon and
  // the water surface, so their cross-sections line up exactly.
  stations(step) {
    if (this.st?.step === step) return this.st;
    const list = [];
    let x = X0, arc = 0, cz = creekZ(x);
    list.push({ x, cz, arc });
    while (x < X1) {
      const slope = (creekZ(x + 0.5) - creekZ(x - 0.5));
      const nx = Math.min(X1, x + step / Math.hypot(1, slope));
      const nz = creekZ(nx);
      arc += Math.hypot(nx - x, nz - cz);
      x = nx; cz = nz;
      list.push({ x, cz, arc });
    }
    list.step = step;
    this.st = list;
    this.creekArc = qx => {
      let lo = 0, hi = list.length - 1;
      if (qx <= list[0].x) return 0;
      if (qx >= list[hi].x) return list[hi].arc;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (list[m].x <= qx) lo = m; else hi = m; }
      const t = (qx - list[lo].x) / (list[hi].x - list[lo].x);
      return lerp(list[lo].arc, list[hi].arc, t);
    };
    return list;
  }

  // Cross offset for station `c` of `CROSS`, in three zones: uniform across the channel, uniform
  // up the bank, then a stretched apron out to where the world mesh takes over. A single power
  // curve put one station on the bank shoulder, which is the only part of the section with any
  // shape in it.
  crossOffset(c, CROSS, half, bank, out) {
    const u = c / CROSS * 2 - 1;
    const a = Math.abs(u), s = Math.sign(u) || 1;
    if (a <= 0.45) return s * half * (a / 0.45);
    if (a <= 0.75) return s * (half + (bank - half) * ((a - 0.45) / 0.30));
    return s * (bank + (out - bank) * Math.pow((a - 0.75) / 0.25, 1.5));
  }

  // The Vail's trench, as a ribbon in (arc length, cross offset) space. This is what carries the
  // channel: the world mesh is built from `landAt`, which has no river in it, because a 4–10 m
  // grid cannot hold a 13 m channel however carefully the field describes one. Vertices are
  // `landY + carve`, exactly what `surfaceY` returns, so the two agree by construction.
  buildBanks() {
    const CROSS = 28;
    const st = this.stations(this.riverStep ?? 5);
    const mats = this.groundMats();
    const rgb = [0, 0, 0];
    const SEG = 12;
    this.banks = new THREE.Group();
    this.banks.name = 'bankRibbon';
    this.object3D.add(this.banks);

    const per = Math.ceil((st.length - 1) / SEG);
    for (let s0 = 0; s0 < st.length - 1; s0 += per) {
      const s1 = Math.min(st.length - 1, s0 + per);
      const pos = [], nrm = [], col = [], zi = [];
      for (let i = s0; i <= s1; i++) {
        const { x, cz } = st[i];
        const half = creekHalf(x), bank = creekBank(x);
        for (let c = 0; c <= CROSS; c++) {
          const off = this.crossOffset(c, CROSS, half, bank, (bank + RIB_HOLE + RIB_OVER) * (this.ribbonK ?? 1));
          const z = cz + off;
          // The apron overlaps ground the world mesh still draws. Sinking it a few centimetres
          // out there lets the world mesh win every coincident pixel instead of z-fighting it,
          // and out there the ribbon is drawing the same ground anyway. Cloning the material for
          // a polygon offset does not work: Material.copy drops onBeforeCompile, and the whole
          // ground look is a shader graft (world-space triplanar, no uvs).
          const sink = 0.05 * smoothstep(bank, bank + 12, Math.abs(off));
          const y = this.surfaceY(x, z) - sink;
          const gx = (this.surfaceY(x - 1, z) - this.surfaceY(x + 1, z)) / 2;
          const gz = (this.surfaceY(x, z - 1) - this.surfaceY(x, z + 1)) / 2;
          const l = Math.hypot(gx, 1, gz);
          pos.push(x, y, z);
          nrm.push(gx / l, 1 / l, gz / l);
          zi.push(this.groundColour(x, z, y, Math.hypot(gx, gz), rgb));
          col.push(rgb[0], rgb[1], rgb[2]);
        }
      }
      const row = CROSS + 1;
      const idx = [[], [], []];
      for (let s = 0; s < s1 - s0; s++) {
        for (let c = 0; c < CROSS; c++) {
          const p = s * row + c;
          idx[zi[p]].push(p, p + 1, p + row);
          idx[zi[p + row + 1]].push(p + row, p + 1, p + row + 1);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      const flat = [];
      let start = 0;
      for (let z = 0; z < 3; z++) {
        if (!idx[z].length) continue;
        for (const v of idx[z]) flat.push(v);
        geo.addGroup(start, idx[z].length, z);
        start += idx[z].length;
      }
      geo.setIndex(flat);
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, mats);
      mesh.name = 'bank';
      mesh.receiveShadow = true;
      this.banks.add(mesh);
      this.chunks.push(mesh);
    }
  }

  // The surface is cut to the channel and parameterised in channel space (metres along the creek,
  // metres across it) so the shader can scroll ripples down a bend instead of across the world.
  // Cross stations bunch towards the shore so the depth ramp resolves; depth reaches 0 exactly at
  // the water line, which is what the foam lace and the alpha fade both key off.
  buildWater() {
    const CROSS = 10;
    const SEG = 10;
    const st = this.stations(this.riverStep ?? 5);
    const tints = ZONE_IDS.map(id => zone(id).water);
    const w = [0, 0, 0];
    const mat = waterMaterial();
    this.waterGroup = new THREE.Group();
    this.waterGroup.name = 'water';
    this.object3D.add(this.waterGroup);
    this.waterSegs = [];

    const per = Math.ceil((st.length - 1) / SEG);
    for (let s0 = 0; s0 < st.length - 1; s0 += per) {
      const s1 = Math.min(st.length - 1, s0 + per);
      const pos = [], chan = [], flow = [], depth = [], tint = [], idx = [];
      for (let i = s0; i <= s1; i++) {
        const { x, cz, arc } = st[i];
        const wy = waterY(x), half = creekHalf(x);
        // the channel drops to the east, so the flow tangent points along +x
        const dz = creekZ(x + 0.5) - creekZ(x - 0.5);
        const fl = 1 / Math.hypot(1, dz);
        for (let c = 0; c <= CROSS; c++) {
          const t = c / CROSS * 2 - 1;
          const off = Math.sign(t) * half * Math.pow(Math.abs(t), 0.62);
          const y = wy + 0.04 * Math.sin(x * 0.42 + off * 0.9) + 0.022 * Math.sin(off * 2.3 - x * 0.17);
          pos.push(x, y, cz + off);
          chan.push(arc, off);
          flow.push(fl, dz * fl);
          depth.push(clamp(wy - this.surfaceY(x, cz + off), 0, CHANNEL(x)) / CHANNEL(x));
          zoneMix(x, cz + off, w);
          for (let k = 0; k < 3; k++) {
            tint.push(w[0] * tints[0].tint[k] + w[1] * tints[1].tint[k] + w[2] * tints[2].tint[k]);
          }
          tint.push(w[0] * tints[0].foam + w[1] * tints[1].foam + w[2] * tints[2].foam);
        }
      }
      const row = CROSS + 1;
      for (let s = 0; s < s1 - s0; s++) {
        for (let c = 0; c < CROSS; c++) {
          const p = s * row + c;
          idx.push(p, p + 1, p + row, p + 1, p + row + 1, p + row);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('aChan', new THREE.Float32BufferAttribute(chan, 2));
      geo.setAttribute('aFlow', new THREE.Float32BufferAttribute(flow, 2));
      geo.setAttribute('aDepth', new THREE.Float32BufferAttribute(depth, 1));
      geo.setAttribute('aTint', new THREE.Float32BufferAttribute(tint, 4));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = 'water';
      mesh.renderOrder = 1;
      mesh.receiveShadow = true;
      this.waterGroup.add(mesh);
      this.waterSegs.push(mesh);
    }

    // no system owns Terrain's update, so the clock rides the draw. userData.freeze pins it for
    // a repeatable shot.
    const t0 = performance.now();
    this.waterSegs[0].onBeforeRender = () => {
      mat.uniforms.uTime.value = this.waterClock ?? (performance.now() - t0) / 1000;
    };
    this.waterGroup.userData.freeze = t => { this.waterClock = t; };
    this.water = this.waterGroup;
    this.waterMat = mat;
    this.applyObstacles();
  }

  // Anything standing in the channel throws a bow wave and a foam tail. The bridge registers a
  // reflection quad, not its piers, so the pier offset here mirrors bridge() in editor/build.js.
  applyObstacles() {
    if (!this.waterMat) return;
    const list = [];
    for (const { x, cz } of this.reflects) {
      for (const s of [-1, 1]) {
        const z = cz + s * 2.9;
        list.push({ s: this.creekArc(x), n: z - creekZ(x), r: 2.4, tail: 9 });
      }
    }
    setObstacles(this.waterMat, list);
  }

  addReflection(x, cz, w, h) { this.reflects.push({ x, cz, w, h }); }

  // A screen-cheap stand-in for a planar reflection: the mass above the water smeared towards
  // the near bank, broken by the same ripple frequency as the surface. Only creek_day sees it,
  // and creek_day looks from +z, so the smear runs that way.
  buildReflections() {
    if (!this.reflects.length) return;
    const pos = [], col = [], idx = [];
    for (const { x, cz, w, h } of this.reflects) {
      const NU = 6, NV = 7;
      const base0 = pos.length / 3;
      for (let v = 0; v <= NV; v++) {
        const fz = (v / NV) * h * 1.5;
        for (let u = 0; u <= NU; u++) {
          const px = x + (u / NU - 0.5) * w;
          const pz = cz + 2.0 + fz;
          pos.push(px, waterY(px) + 0.03, pz);
          const fade = (1 - smoothstep(0.15, 1, v / NV)) * (1 - smoothstep(0.6, 1, Math.abs(u / NU - 0.5) * 2));
          const ripple = 0.55 + 0.45 * Math.sin(pz * 1.5 + px * 0.4);
          col.push(0.10, 0.10, 0.11, fade * ripple * 0.62);
        }
      }
      for (let v = 0; v < NV; v++) {
        for (let u = 0; u < NU; u++) {
          const p = base0 + v * (NU + 1) + u;
          idx.push(p, p + 1, p + NU + 1, p + 1, p + NU + 2, p + NU + 1);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
    geo.setIndex(idx);
    const mat = new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, depthWrite: false, toneMapped: false, fog: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'waterReflect';
    mesh.renderOrder = 3;
    this.object3D.add(mesh);
  }

  // Registers the two roads and the spurs of WORLD.md §4.4. Called before build(), because
  // addPath rasterises into the occupancy grid and that has to happen before it is read.
  addRoads() {
    for (const r of ROADS) {
      const line = roadLine(roadPoints(r), 4);
      // split at the zone boundaries and register one ribbon per run: the King's Road is 1110 m
      // through all three zones, and a single material would surface it in one town's stone
      let run = [line[0]], zn = zoneAt(line[0][0], line[0][1]);
      for (let i = 1; i < line.length; i++) {
        const z = zoneAt(line[i][0], line[i][1]);
        run.push(line[i]);
        if (z !== zn || i === line.length - 1) {
          this.addPath(run, r.width / 2, ZONE_IDS[zn]);
          run = [line[i]];
          zn = z;
        }
      }
    }
  }

  buildRoads() {
    const CROSS = 6;
    // A bridge deck carries the road over the water, so the ground ribbon has to stop short of
    // it or it paints a road down the bank and across the river bed.
    const deckFade = (x, z) => {
      let a = 1;
      for (const c of CROSSINGS) {
        if (c.kind !== 'bridge') continue;
        const d = Math.hypot(x - c.x, z - creekZ(c.x));
        a = Math.min(a, smoothstep(c.halfSpan + 4, c.halfSpan + 14, d));
      }
      return a;
    };
    this.roadSegs = [];
    for (const { pts, halfWidth, zoneId } of this.paths) {
      const line = resample(pts, 2.2);
      // The King's Road is 1110 m in one mesh, so its bounding sphere caught every frustum. Cut
      // into ROAD_SEG runs sharing a station, which costs one duplicated row per join.
      const per = Math.max(2, Math.round(ROAD_SEG / 2.2));
      for (let a0 = 0; a0 < line.length - 1; a0 += per) {
        this.roadSeg(line.slice(a0, Math.min(line.length, a0 + per + 1)), a0, line.length, halfWidth, zoneId, deckFade);
      }
    }
  }

  roadSeg(line, i0, total, halfWidth, zoneId, deckFade) {
    const CROSS = 6;
    const pos = [], col = [], idx = [], nrm = [];
    for (let i = 0; i < line.length; i++) {
      const p = line[i];
      const q = line[Math.min(i + 1, line.length - 1)];
      const o = line[Math.max(i - 1, 0)];
      let nx = -(q[1] - o[1]), nz = q[0] - o[0];
      const l = Math.hypot(nx, nz) || 1;
      nx /= l; nz /= l;
      // WORLD.md §4.4's 9 m half-width is the open-country figure. Inside a town the King's
      // Road is the High Street, and an 18 m carriageway between two rows of frontages is a
      // motorway.
      const town = 1 - 0.55 * townAt(p[0], p[1]).m;
      const hwL = halfWidth * town * (1 + 0.17 * fbm(p[0] * 0.09 + 1.303, p[1] * 0.09 + 2.718, 2, 7));
      const hwR = halfWidth * town * (1 + 0.17 * fbm(p[0] * 0.09 + 41.71, p[1] * 0.09 + 0.905, 2, 7));
      for (let c = 0; c <= CROSS; c++) {
        const t = c / CROSS * 2 - 1;
        const hw = lerp(hwL, hwR, (t + 1) / 2);
        const x = p[0] + nx * t * hw, z = p[1] + nz * t * hw;
        pos.push(x, this.surfaceY(x, z) + 0.06, z);
        // The ribbon's own normals came from computeVertexNormals, which reads its centre
        // station column as a crease and lights a hairline down the middle of every road. It is
        // a decal on the ground; light it as the ground.
        const gx = (this.surfaceY(x - 1, z) - this.surfaceY(x + 1, z)) / 2;
        const gz = (this.surfaceY(x, z - 1) - this.surfaceY(x, z + 1)) / 2;
        const nl = Math.hypot(gx, 1, gz);
        nrm.push(gx / nl, 1 / nl, gz / nl);
        // ends fade out too, or the ribbon stops dead in a straight polygon edge; the fade
        // width is itself noisy so the margin is worn rather than a clean band. The index is the
        // one into the whole road, not into this segment, or every join would fade to nothing.
        const gi = i0 + i;
        const end = Math.min(smoothstep(0, 4, gi), smoothstep(0, 4, total - 1 - gi));
        const f0 = 0.30 + 0.16 * fbm(x * 0.22 + 3.606, z * 0.22 + 1.144, 2, 13);
        col.push(1, 1, 1, (1 - smoothstep(f0, 1.0, Math.abs(t))) * end * deckFade(x, z));
      }
    }
    const row = CROSS + 1;
    for (let s = 0; s < line.length - 1; s++) {
      for (let c = 0; c < CROSS; c++) {
        const p = s * row + c;
        idx.push(p, p + 1, p + row, p + 1, p + row + 1, p + row);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    geo.setIndex(idx);
    geo.computeBoundingSphere();

    const mat = getMaterial(zoneId, 'road');
    mat.vertexColors = true;
    mat.transparent = true;
    mat.depthWrite = false;
    mat.needsUpdate = true;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'road';
    mesh.renderOrder = 1;
    mesh.receiveShadow = true;
    this.object3D.add(mesh);
    this.roadSegs.push(mesh);
  }

  // Every patch of a zone in one mesh: a paved square is one draw call for the whole town, and it
  // rides in roadSegs so it culls on the same distance rule the ribbons do.
  buildPatches() {
    const byZone = new Map();
    for (const p of this.patches) {
      if (!byZone.has(p.zoneId)) byZone.set(p.zoneId, []);
      byZone.get(p.zoneId).push(p);
    }
    for (const [zoneId, list] of byZone) {
      const pos = [], col = [], nrm = [], idx = [];
      for (const p of list) this.patch(p, pos, col, nrm, idx);
      if (!idx.length) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
      geo.setIndex(idx);
      geo.computeBoundingSphere();

      const mat = getMaterial(zoneId, 'road');
      mat.vertexColors = true;
      mat.transparent = true;
      mat.depthWrite = false;
      mat.needsUpdate = true;
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = 'road';
      mesh.receiveShadow = true;
      this.object3D.add(mesh);
      this.roadSegs.push(mesh);
    }
  }

  // Sits 0.01 m under the road ribbon so a street crossing a square is the street, not a seam.
  patch(p, pos, col, nrm, idx) {
    const STEP = 3;
    const x0 = p.x0 - p.fade, x1 = p.x1 + p.fade, z0 = p.z0 - p.fade, z1 = p.z1 + p.fade;
    const nx = Math.max(2, Math.round((x1 - x0) / STEP)), nz = Math.max(2, Math.round((z1 - z0) / STEP));
    const base = pos.length / 3;
    for (let j = 0; j <= nz; j++) {
      for (let i = 0; i <= nx; i++) {
        const x = lerp(x0, x1, i / nx), z = lerp(z0, z1, j / nz);
        pos.push(x, this.surfaceY(x, z) + 0.05, z);
        const gx = (this.surfaceY(x - 1, z) - this.surfaceY(x + 1, z)) / 2;
        const gz = (this.surfaceY(x, z - 1) - this.surfaceY(x, z + 1)) / 2;
        const l = Math.hypot(gx, 1, gz);
        nrm.push(gx / l, 1 / l, gz / l);
        // the same noisy margin the ribbons wear, so a square stops in worn stone rather than on
        // the straight edge of the rect it came from
        const f = p.fade * (0.7 + 0.5 * fbm(x * 0.18 + 5.196, z * 0.18 + 2.449, 2, 23));
        const in0 = Math.min(x - x0, x1 - x, z - z0, z1 - z);
        col.push(1, 1, 1, smoothstep(0, f, in0));
      }
    }
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const a = base + j * (nx + 1) + i;
        idx.push(a, a + nx + 1, a + 1, a + 1, a + nx + 1, a + nx + 2);
      }
    }
  }

  // A soft dark collar on the ground at every base. This is the single thing that stops a
  // building reading as a sticker. Runs last, after scatter has registered its trees.
  // Split on AOC-metre cells: as one map-spanning mesh it was 20.1 k triangles drawn in every
  // scenario, never culled — the third largest line in the budget (WORLD.md §6.5).
  finish() {
    const old = this.decals;
    if (old) { this.object3D.remove(old); old.traverse(o => { if (o.isMesh) o.geometry.dispose(); }); }
    this.decals = new THREE.Group();
    this.decals.name = 'decalChunks';
    this.object3D.add(this.decals);
    this.decalChunks = [];

    const cells = new Map();
    const cell = (x, z) => {
      const k = `${Math.floor(x / AOC)},${Math.floor(z / AOC)}`;
      let c = cells.get(k);
      if (!c) cells.set(k, c = { pos: [], col: [], idx: [] });
      return c;
    };

    const push = (c, outline, strength, pad) => {
      const { pos, col, idx } = c;
      const n = outline.length;
      const base = pos.length / 3;
      let cx = 0, cz = 0;
      for (const p of outline) { cx += p[0] / n; cz += p[1] / n; }
      for (const p of outline) {
        let dx = p[0] - cx, dz = p[1] - cz;
        const l = Math.hypot(dx, dz) || 1;
        dx /= l; dz /= l;
        pos.push(p[0], this.surfaceY(p[0], p[1]) + 0.05, p[1]);
        col.push(0, 0, 0, strength);
        const ox = p[0] + dx * pad, oz = p[1] + dz * pad;
        pos.push(ox, this.surfaceY(ox, oz) + 0.05, oz);
        col.push(0, 0, 0, 0);
      }
      for (let i = 0; i < n; i++) {
        const a = base + i * 2, b = base + ((i + 1) % n) * 2;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    };

    for (const fp of this.decalRings) {
      const out = [];
      const c = Math.cos(fp.rot), s = Math.sin(fp.rot);
      const segs = 4;
      const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
      for (let i = 0; i < 4; i++) {
        const a = corners[i], b = corners[(i + 1) % 4];
        for (let k = 0; k < segs; k++) {
          const t = k / segs;
          const lx = lerp(a[0], b[0], t) * fp.hw, lz = lerp(a[1], b[1], t) * fp.hd;
          out.push([fp.x + lx * c - lz * s, fp.z + lx * s + lz * c]);
        }
      }
      push(cell(fp.x, fp.z), out, 0.55 * fp.ao, 2.85);
    }

    // props get a filled disc, not a ring — a tree trunk does not shade its own footprint
    for (const d of this.propDecals) {
      const { pos, col, idx } = cell(d.x, d.z);
      const n = 7, base = pos.length / 3;
      pos.push(d.x, this.surfaceY(d.x, d.z) + 0.05, d.z);
      col.push(0, 0, 0, d.s);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const ox = d.x + Math.cos(a) * d.r, oz = d.z + Math.sin(a) * d.r;
        pos.push(ox, this.surfaceY(ox, oz) + 0.05, oz);
        col.push(0, 0, 0, 0);
      }
      for (let i = 0; i < n; i++) idx.push(base, base + 1 + ((i + 1) % n), base + 1 + i);
    }

    // Straight multiplicative darkening: dst * (1 - srcAlpha). Immune to whatever the lit
    // pipeline would otherwise do to a "black quad with alpha".
    const mat = this.decalMat = new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, depthWrite: false, toneMapped: false, fog: false,
      blending: THREE.CustomBlending, blendSrc: THREE.ZeroFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor, blendEquation: THREE.AddEquation,
    });
    for (const c of cells.values()) {
      if (!c.idx.length) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(c.pos, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(c.col, 4));
      geo.setIndex(c.idx);
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = 'contactAO';
      mesh.renderOrder = 2;
      this.decals.add(mesh);
      this.decalChunks.push(mesh);
    }
    if (!this.decalChunks.length) this.decalMat = null;
  }

  registerKnobs(q) {
    q.register({ key: 'groundAO', label: 'Contact shade', type: 'range', min: 0, max: 1.6, step: 0.05, default: 1, group: 'World' },
      v => { if (this.decalMat) this.decalMat.opacity = v; });
    // The two knobs that change vertex counts rather than shader constants, so they cannot take
    // effect without rebuilding. `rebuild: true` is what tells main.js to.
    q.register({ key: 'riverRes', label: 'River station spacing (m)', type: 'range', min: 2, max: 14, step: 0.5, default: 5, group: 'World', rebuild: true },
      v => { this.riverStep = v; });
    q.register({ key: 'riverWidth', label: 'Bank ribbon width ×', type: 'range', min: 0.6, max: 2, step: 0.05, default: 1, group: 'World', rebuild: true },
      v => { this.ribbonK = v; });
    if (this.waterMat) registerWaterKnobs(q, this.waterMat);
  }

  // Everything build() added, back out again, so main.js can build it a second time with new
  // knobs. The occupancy grid and the footprints survive: they come from the scene document,
  // not from the terrain, and re-rasterising them would need the whole scene rebuilt too.
  teardown() {
    for (const o of [...this.object3D.children]) {
      this.object3D.remove(o);
      o.traverse(c => { if (c.isMesh) c.geometry.dispose(); });
    }
    this.chunks = null;
    this.roadSegs = null;
    this.decalChunks = null;
    this.st = null;
    this.hgrid = null;
    this.ground = this.banks = this.waterGroup = this.water = this.decals = null;
  }
}

function resample(pts, step) {
  const out = [pts[0]];
  let carry = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let t = carry;
    while (t < len) {
      out.push([lerp(a[0], b[0], t / len), lerp(a[1], b[1], t / len)]);
      t += step;
    }
    carry = t - len;
  }
  out.push(pts[pts.length - 1]);
  return out;
}
