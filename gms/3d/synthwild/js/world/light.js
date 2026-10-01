// Minecraft-style light at cell resolution: (sky << 4) | block. Refined cells are transparent.
// Sky light going straight down loses only the cell's opacity (no -1), so it stays bright under a canopy.
import { OPACITY, EMIT } from '../data/blocks.js';

const REF = 0x8000;
const DX = [1, -1, 0, 0, 0, 0], DY = [0, 0, 1, -1, 0, 0], DZ = [0, 0, 0, 0, 1, -1];

// emission of a refined cell = max over its subs
export function refinedEmit(subs) {
  let e = 0;
  for (let k = 0; k < 64; k++) { const m = EMIT[subs[k]]; if (m > e) e = m; }
  return e;
}

// --- column-local (worker): cells/light are 16x16x128, index x + z*16 + y*256 ---
export function lightColumn(cells, light, subsOf) {
  const opac = (v) => (v & REF) ? 0 : OPACITY[v];
  let top = 0;
  for (let i = cells.length - 1; i >= 0; i--) if (cells[i] !== 0) { top = (i >> 8) + 1; break; }
  light.fill(0xf0, top * 256);
  const q = [];
  const floor = new Int16Array(256);
  for (let i = 0; i < 256; i++) {
    let l = 15, f = top;
    for (let y = top - 1; y >= 0; y--) {
      const c = i + y * 256, o = opac(cells[c]);
      l = o >= 15 ? 0 : Math.max(0, l - o);
      light[c] = l << 4;
      if (l === 15 && f === y + 1) f = y;
      else if (l > 1 && l < 15) q.push(c);
    }
    floor[i] = f;
  }
  // sky seeds: full-sky cells beside a neighbour column whose full sky ends higher (cells under leaves/water
  // were queued above). Equivalent to scanning every lit cell, much cheaper on tall columns.
  for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
    const i = x + z * 16, f = floor[i];
    let hi = f;
    if (x > 0) hi = Math.max(hi, floor[i - 1]);
    if (x < 15) hi = Math.max(hi, floor[i + 1]);
    if (z > 0) hi = Math.max(hi, floor[i - 16]);
    if (z < 15) hi = Math.max(hi, floor[i + 16]);
    for (let y = f; y < hi; y++) q.push(i + y * 256);
  }
  bfsLocal(cells, light, q, 4, opac);
  for (let i = 0; i < cells.length; i++) {
    const v = cells[i];
    const e = (v & REF) ? (subsOf ? refinedEmit(subsOf(i, v & 0x7fff)) : 0) : EMIT[v];
    if (e) { light[i] = (light[i] & 0xf0) | e; q.push(i); }
  }
  bfsLocal(cells, light, q, 0, opac);
}

function bfsLocal(cells, light, q, sh, opac) {
  const keep = sh ? 0x0f : 0xf0;
  for (let h = 0; h < q.length; h++) {
    const i = q[h], L = (light[i] >> sh) & 15;
    if (L === 0 || (L === 1 && !sh)) continue;
    const x = i & 15, z = (i >> 4) & 15, y = i >> 8;
    for (let d = 0; d < 6; d++) {
      const nx = x + DX[d], ny = y + DY[d], nz = z + DZ[d];
      if (nx < 0 || nx > 15 || nz < 0 || nz > 15 || ny < 0 || ny > 127) continue;
      const n = nx + nz * 16 + ny * 256, o = opac(cells[n]);
      if (o >= 15) continue;
      const nl = (sh && d === 3) ? L - o : L - 1 - o;
      if (nl > ((light[n] >> sh) & 15)) { light[n] = (light[n] & keep) | (nl << sh); q.push(n); }
    }
  }
}

// --- world-level. W: { lget(x,y,z) -> byte | -1, lset(x,y,z,byte), opac(x,y,z) -> 0..15, emit(x,y,z) }, optionally
// { sec(cx,sy,cz) -> Section|null|undefined, markDirty(cx,sy,cz) } for the fast path below. ---

const SLICE = 2048; // queue pops between yields of a time-sliced relight
const run = (g) => { while (!g.next().done); };
const SKY_FULL = 0xf0;

// Growable typed queue of k-int records (no per-push allocation; reused across runs).
class Queue {
  constructor(k) { this.k = k; this.a = new Int32Array(4096 * k); this.n = 0; }
  grow() { const b = new Int32Array(this.a.length * 2); b.set(this.a); this.a = b; }
  push3(x, y, z) { if ((this.n + 1) * 3 > this.a.length) this.grow(); const i = this.n++ * 3, a = this.a; a[i] = x; a[i + 1] = y; a[i + 2] = z; }
  push4(x, y, z, w) { if ((this.n + 1) * 4 > this.a.length) this.grow(); const i = this.n++ * 4, a = this.a; a[i] = x; a[i + 1] = y; a[i + 2] = z; a[i + 3] = w; }
}

// Cached light view over W: remembers the last section, so neighbour reads don't hash a key each time. Writes keep
// the world's semantics (version++, dirty marks incl. border neighbours); null/missing sections go through W.lset.
// reset() must run after every yield: chunks can unload and the world flushes dirty sets between frames.
function view(W) {
  if (W._lv) return W._lv;
  if (!W.sec) {
    W._lv = { lget: W.lget, lset: W.lset, opac: W.opac, emit: W.emit, reset() {}, add: new Queue(3), rem: new Queue(4) };
    return W._lv;
  }
  let kx = NaN, ky = 0, kz = 0, ks, dirtyS = null;
  const S = (cx, sy, cz) => {
    if (cx === kx && sy === ky && cz === kz) return ks;
    kx = cx; ky = sy; kz = cz;
    return (ks = W.sec(cx, sy, cz));
  };
  const v = {
    add: new Queue(3), rem: new Queue(4),
    reset() { kx = NaN; ks = undefined; dirtyS = null; },
    lget(x, y, z) {
      if (y < 0) return -1;
      if (y > 127) return SKY_FULL;
      const s = S(x >> 4, y >> 4, z >> 4);
      if (s === undefined) return -1;
      if (s === null) return SKY_FULL;
      return s.light[(x & 15) + (z & 15) * 16 + (y & 15) * 256];
    },
    lset(x, y, z, val) {
      if (y < 0 || y > 127) return;
      const cx = x >> 4, sy = y >> 4, cz = z >> 4;
      const s = S(cx, sy, cz);
      if (!s) { W.lset(x, y, z, val); kx = NaN; dirtyS = null; return; }
      s.light[(x & 15) + (z & 15) * 16 + (y & 15) * 256] = val;
      s.version++;
      if (s !== dirtyS) { W.markDirty(cx, sy, cz); dirtyS = s; }
      const lx = x & 15, ly = y & 15, lz = z & 15;
      if (lx === 0) W.markDirty(cx - 1, sy, cz); else if (lx === 15) W.markDirty(cx + 1, sy, cz);
      if (lz === 0) W.markDirty(cx, sy, cz - 1); else if (lz === 15) W.markDirty(cx, sy, cz + 1);
      if (ly === 0) W.markDirty(cx, sy - 1, cz); else if (ly === 15) W.markDirty(cx, sy + 1, cz);
    },
    opac(x, y, z) {
      if (y < 0 || y > 127) return 15;
      const s = S(x >> 4, y >> 4, z >> 4);
      if (s === undefined) return 15;
      if (s === null) return 0;
      const c = s.cells[(x & 15) + (z & 15) * 16 + (y & 15) * 256];
      return (c & REF) ? 0 : OPACITY[c];
    },
    emit(x, y, z) {
      if (y < 0 || y > 127) return 0;
      const s = S(x >> 4, y >> 4, z >> 4);
      if (!s) return 0;
      const c = s.cells[(x & 15) + (z & 15) * 16 + (y & 15) * 256];
      return (c & REF) ? refinedEmit(s.subs[c & 0x7fff]) : EMIT[c];
    },
  };
  W._lv = v;
  return v;
}

function* addBfs(V, q, sh) {
  const keep = sh ? 0x0f : 0xf0;
  for (let h = 0; h < q.n; h++) {
    if (h % SLICE === 0 && h) { yield; V.reset(); }
    const a = q.a, x = a[h * 3], y = a[h * 3 + 1], z = a[h * 3 + 2];
    const lb = V.lget(x, y, z);
    if (lb < 0) continue;
    const L = (lb >> sh) & 15;
    if (L === 0 || (L === 1 && !sh)) continue;
    for (let d = 0; d < 6; d++) {
      const nx = x + DX[d], ny = y + DY[d], nz = z + DZ[d];
      const o = V.opac(nx, ny, nz);
      if (o >= 15) continue;
      const nb = V.lget(nx, ny, nz);
      if (nb < 0) continue;
      const nl = (sh && d === 3) ? L - o : L - 1 - o;
      if (nl > ((nb >> sh) & 15)) { V.lset(nx, ny, nz, (nb & keep) | (nl << sh)); q.push3(nx, ny, nz); }
    }
  }
}

function* relightChannel(V, changed, sh) {
  const keep = sh ? 0x0f : 0xf0;
  const rem = V.rem, add = V.add;
  rem.n = 0; add.n = 0;
  for (let k = 0; k < changed.length; k += 3) {
    const x = changed[k], y = changed[k + 1], z = changed[k + 2];
    const lb = V.lget(x, y, z);
    if (lb < 0) continue;
    const L = (lb >> sh) & 15;
    if (L) { V.lset(x, y, z, lb & keep); rem.push4(x, y, z, L); }
  }
  for (let h = 0; h < rem.n; h++) {
    if (h % SLICE === 0 && h) { yield; V.reset(); }
    const r = rem.a, x = r[h * 4], y = r[h * 4 + 1], z = r[h * 4 + 2], L = r[h * 4 + 3];
    for (let d = 0; d < 6; d++) {
      const nx = x + DX[d], ny = y + DY[d], nz = z + DZ[d];
      const nb = V.lget(nx, ny, nz);
      if (nb < 0) continue;
      const nl = (nb >> sh) & 15;
      if (nl === 0) continue;
      if (nl < L || (sh && d === 3 && nl === L)) {
        V.lset(nx, ny, nz, nb & keep); rem.push4(nx, ny, nz, nl);
        if (!sh) { const e = V.emit(nx, ny, nz); if (e) { V.lset(nx, ny, nz, (nb & keep) | e); add.push3(nx, ny, nz); } }
      }
      else add.push3(nx, ny, nz);
    }
  }
  for (let k = 0; k < changed.length; k += 3) {
    const x = changed[k], y = changed[k + 1], z = changed[k + 2];
    const lb = V.lget(x, y, z);
    if (lb < 0) continue;
    const o = V.opac(x, y, z);
    let seed = 0;
    if (sh) { if (y === 127 && o < 15) seed = 15 - o; }
    else seed = V.emit(x, y, z);
    if (seed > ((lb >> sh) & 15)) { V.lset(x, y, z, (lb & keep) | (seed << sh)); add.push3(x, y, z); }
    for (let d = 0; d < 6; d++) add.push3(x + DX[d], y + DY[d], z + DZ[d]);
  }
  yield* addBfs(V, add, sh);
}

// changed: flat [x,y,z, ...] cell coords whose material changed. The generator yields every SLICE steps so a
// huge edit can be relit over several frames; relight() runs it to completion.
export function* relightGen(W, changed) {
  const V = view(W);
  V.reset();
  yield* relightChannel(V, changed, 4);
  V.reset();
  yield* relightChannel(V, changed, 0);
  V.reset();
}
export function relight(W, changed) { run(relightGen(W, changed)); }

// push light across the 4 borders of a freshly loaded chunk, both directions
export function mergeBorders(W, cx, cz, loaded) {
  const V = view(W);
  V.reset();
  const qs = V.add; // borrowed: never runs while a relight is pending (the world guards that)
  qs.n = 0;
  const qbList = [];
  const x0 = cx * 16, z0 = cz * 16;
  const sides = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  for (const [ox, oz] of sides) {
    if (!loaded(cx + ox, cz + oz)) continue;
    for (let t = 0; t < 16; t++) {
      let ax, az, bx, bz;
      if (ox) { ax = ox < 0 ? x0 : x0 + 15; bx = ax + ox; az = bz = z0 + t; }
      else { az = oz < 0 ? z0 : z0 + 15; bz = az + oz; ax = bx = x0 + t; }
      for (let y = 0; y < 128; y++) {
        const la = V.lget(ax, y, az), lb = V.lget(bx, y, bz);
        if (la < 0 || lb < 0 || la === lb) continue;
        const oa = V.opac(ax, y, az), ob = V.opac(bx, y, bz);
        const sa = la >> 4, sb = lb >> 4, ba = la & 15, bb = lb & 15;
        if (ob < 15 && sa - 1 - ob > sb) qs.push3(ax, y, az);
        if (oa < 15 && sb - 1 - oa > sa) qs.push3(bx, y, bz);
        if (ob < 15 && ba - 1 - ob > bb) qbList.push(ax, y, az);
        if (oa < 15 && bb - 1 - oa > ba) qbList.push(bx, y, bz);
      }
    }
  }
  run(addBfs(V, qs, 4));
  V.reset();
  qs.n = 0;
  for (let i = 0; i < qbList.length; i += 3) qs.push3(qbList[i], qbList[i + 1], qbList[i + 2]);
  run(addBfs(V, qs, 0));
  V.reset();
}
