// Tiny in-memory stand-in for lane 1's World (same API subset), for player tests and the harness.
// Units x,z in [-32,32), y in [16,64). Ground top at y=32.
import { BLOCKS, BLOCK } from '../js/data/blocks.js';
export { BLOCKS };
const G = BLOCK.PHOTOMOSS, B = BLOCK.BASALT_MATRIX, W = BLOCK.WATER, P = BLOCK.LATTICE_PLANKS, L = BLOCK.LIGHT_PANEL;

const X0 = -128, Y0 = 64, Z0 = -128, NX = 256, NY = 192, NZ = 256;

export class StubWorld {
  constructor() {
    this.data = new Uint8Array(NX * NY * NZ);
    this.listeners = [];
    this.version = 0;
    this.fill([-32, 16, -32], [32, 32, 32], G);
    this.fill([-32, 16, -32], [32, 31, 32], B);
    this.fill([8, 28, 4], [20, 32, 16], 0);          // pool
    this.fill([8, 28, 4], [20, 31.5, 16], W);
    this.fill([0, 32, -6], [1, 32.25, -5], P);        // 0.25 step
    this.fill([1, 32, -6], [2, 32.5, -5], P);         // 0.5 step
    this.fill([2, 32, -6], [3, 33, -5], P);           // 1.0 step
    this.fill([3, 32, -6], [4, 34, -5], P);           // 2.0 wall
    this.fill([-6, 32, -4], [-2, 34, 4], B);          // ledge 2 high
    this.fill([-10, 32, 6], [-9, 36, 7], L);          // glow pillar
    this.fill([20, 32, -20], [21, 40, -19], BLOCK.DATA_VINE);   // free-hanging vine column
    this.fill([20, 40, -21], [23, 41, -18], B);                 // ledge the vine hangs from
    this.fill([18, 28, 14], [19, 31.5, 15], BLOCK.SERVER_KELP); // kelp in the pool
  }
  idx(sx, sy, sz) {
    const x = sx - X0, y = sy - Y0, z = sz - Z0;
    if (x < 0 || y < 0 || z < 0 || x >= NX || y >= NY || z >= NZ) return -1;
    return x + z * NX + y * NX * NZ;
  }
  fill(a, b, mat) {
    for (let y = a[1] * 4; y < b[1] * 4; y++) for (let z = a[2] * 4; z < b[2] * 4; z++)
      for (let x = a[0] * 4; x < b[0] * 4; x++) { const i = this.idx(x, y, z); if (i >= 0) this.data[i] = mat; }
  }
  getSub(sx, sy, sz) { const i = this.idx(sx, sy, sz); return i < 0 ? 0 : this.data[i]; }
  isSolidSub(sx, sy, sz) { return !!BLOCKS[this.getSub(sx, sy, sz)]?.solid; }
  blockAt(x, y, z) { return this.getSub(Math.floor(x * 4), Math.floor(y * 4), Math.floor(z * 4)); }
  getCell(x, y, z) {
    const m = this.getSub(x * 4, y * 4, z * 4);
    for (let i = 0; i < 64; i++) if (this.getSub(x * 4 + (i & 3), y * 4 + (i >> 4), z * 4 + ((i >> 2) & 3)) !== m) return -1;
    return m;
  }
  isReady() { return true; }
  update() {}
  surfaceY(x, z) {
    for (let y = 63; y >= 16; y--) if (this.isSolidSub(Math.floor(x * 4), y * 4, Math.floor(z * 4))) return y;
    return 32;
  }
  biomeAt() { return 'forest'; }
  onSectionDirty(cb) { this.listeners.push(cb); }

  // Sub-grid DDA. Skips air and liquids.
  raycast(origin, dir, maxDist) {
    const o = Array.isArray(origin) ? origin : [origin.x, origin.y, origin.z];
    const d0 = Array.isArray(dir) ? dir : [dir.x, dir.y, dir.z];
    const len = Math.hypot(d0[0], d0[1], d0[2]) || 1;
    const d = d0.map(v => v / len);
    const p = o.map(v => v * 4);
    const c = p.map(Math.floor);
    const step = d.map(v => (v > 0 ? 1 : v < 0 ? -1 : 0));
    const tDelta = d.map(v => (v ? Math.abs(1 / v) : Infinity));
    const tMax = d.map((v, i) => (v > 0 ? (c[i] + 1 - p[i]) / v : v < 0 ? (p[i] - c[i]) / -v : Infinity));
    let t = 0, normal = [0, 0, 0];
    const maxT = maxDist * 4;
    while (t <= maxT) {
      const m = this.getSub(c[0], c[1], c[2]);
      if (m && !BLOCKS[m]?.liquid) {
        const dist = t / 4;
        return { sub: c.slice(), normal, mat: m, dist, point: o.map((v, i) => v + d[i] * dist) };
      }
      const a = tMax[0] < tMax[1] ? (tMax[0] < tMax[2] ? 0 : 2) : (tMax[1] < tMax[2] ? 1 : 2);
      t = tMax[a]; c[a] += step[a]; tMax[a] += tDelta[a];
      normal = [0, 0, 0]; normal[a] = -step[a];
    }
    return null;
  }

  setBox(min, max, mat, mode = 'fill') {
    let changed = 0;
    const removed = new Map();
    for (let y = min[1]; y < max[1]; y++) for (let z = min[2]; z < max[2]; z++) for (let x = min[0]; x < max[0]; x++) {
      const i = this.idx(x, y, z); if (i < 0) continue;
      const edge = x === min[0] || y === min[1] || z === min[2] || x === max[0] - 1 || y === max[1] - 1 || z === max[2] - 1;
      const cur = this.data[i];
      let v = mat;
      if (mode === 'hollow' && !edge) v = 0;
      else if (mode === 'shell' && !edge) continue;
      else if (mode === 'replace' && !cur) continue;
      if (cur === v) continue;
      if (cur) removed.set(cur, (removed.get(cur) || 0) + 1);
      this.data[i] = v; changed++;
    }
    if (changed) { this.version++; for (const cb of this.listeners) cb('stub'); }
    return { changed, removed: [...removed].map(([mat, count]) => ({ mat, count })) };
  }
}
