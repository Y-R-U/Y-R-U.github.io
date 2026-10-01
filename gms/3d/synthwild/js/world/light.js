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

// --- world-level. W: { lget(x,y,z) -> byte | -1, lset(x,y,z,byte), opac(x,y,z) -> 0..15, emit(x,y,z) } ---

const SLICE = 2048; // queue pops between yields of a time-sliced relight
const run = (g) => { while (!g.next().done); };

function* addBfs(W, q, sh) {
  const keep = sh ? 0x0f : 0xf0;
  for (let h = 0; h < q.length; h += 3) {
    if (h % (SLICE * 3) === 0 && h) yield;
    const x = q[h], y = q[h + 1], z = q[h + 2];
    const lb = W.lget(x, y, z);
    if (lb < 0) continue;
    const L = (lb >> sh) & 15;
    if (L === 0 || (L === 1 && !sh)) continue;
    for (let d = 0; d < 6; d++) {
      const nx = x + DX[d], ny = y + DY[d], nz = z + DZ[d];
      const o = W.opac(nx, ny, nz);
      if (o >= 15) continue;
      const nb = W.lget(nx, ny, nz);
      if (nb < 0) continue;
      const nl = (sh && d === 3) ? L - o : L - 1 - o;
      if (nl > ((nb >> sh) & 15)) { W.lset(nx, ny, nz, (nb & keep) | (nl << sh)); q.push(nx, ny, nz); }
    }
  }
}

function* relightChannel(W, changed, sh) {
  const keep = sh ? 0x0f : 0xf0;
  const rem = [], add = [];
  for (let k = 0; k < changed.length; k += 3) {
    const x = changed[k], y = changed[k + 1], z = changed[k + 2];
    const lb = W.lget(x, y, z);
    if (lb < 0) continue;
    const L = (lb >> sh) & 15;
    if (L) { W.lset(x, y, z, lb & keep); rem.push(x, y, z, L); }
  }
  for (let h = 0; h < rem.length; h += 4) {
    if (h % (SLICE * 4) === 0 && h) yield;
    const x = rem[h], y = rem[h + 1], z = rem[h + 2], L = rem[h + 3];
    for (let d = 0; d < 6; d++) {
      const nx = x + DX[d], ny = y + DY[d], nz = z + DZ[d];
      const nb = W.lget(nx, ny, nz);
      if (nb < 0) continue;
      const nl = (nb >> sh) & 15;
      if (nl === 0) continue;
      if (nl < L || (sh && d === 3 && nl === L)) {
        W.lset(nx, ny, nz, nb & keep); rem.push(nx, ny, nz, nl);
        if (!sh) { const e = W.emit(nx, ny, nz); if (e) { W.lset(nx, ny, nz, (nb & keep) | e); add.push(nx, ny, nz); } }
      }
      else add.push(nx, ny, nz);
    }
  }
  for (let k = 0; k < changed.length; k += 3) {
    const x = changed[k], y = changed[k + 1], z = changed[k + 2];
    const lb = W.lget(x, y, z);
    if (lb < 0) continue;
    const o = W.opac(x, y, z);
    let seed = 0;
    if (sh) { if (y === 127 && o < 15) seed = 15 - o; }
    else seed = W.emit(x, y, z);
    if (seed > ((lb >> sh) & 15)) { W.lset(x, y, z, (lb & keep) | (seed << sh)); add.push(x, y, z); }
    for (let d = 0; d < 6; d++) add.push(x + DX[d], y + DY[d], z + DZ[d]);
  }
  yield* addBfs(W, add, sh);
}

// changed: flat [x,y,z, ...] cell coords whose material changed. The generator yields every SLICE steps so a
// huge edit can be relit over several frames; relight() runs it to completion.
export function* relightGen(W, changed) {
  yield* relightChannel(W, changed, 4);
  yield* relightChannel(W, changed, 0);
}
export function relight(W, changed) { run(relightGen(W, changed)); }

// push light across the 4 borders of a freshly loaded chunk, both directions
export function mergeBorders(W, cx, cz, loaded) {
  const qs = [], qb = [];
  const x0 = cx * 16, z0 = cz * 16;
  const sides = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  for (const [ox, oz] of sides) {
    if (!loaded(cx + ox, cz + oz)) continue;
    for (let t = 0; t < 16; t++) {
      let ax, az, bx, bz;
      if (ox) { ax = ox < 0 ? x0 : x0 + 15; bx = ax + ox; az = bz = z0 + t; }
      else { az = oz < 0 ? z0 : z0 + 15; bz = az + oz; ax = bx = x0 + t; }
      for (let y = 0; y < 128; y++) {
        const la = W.lget(ax, y, az), lb = W.lget(bx, y, bz);
        if (la < 0 || lb < 0 || la === lb) continue;
        const oa = W.opac(ax, y, az), ob = W.opac(bx, y, bz);
        const sa = la >> 4, sb = lb >> 4, ba = la & 15, bb = lb & 15;
        if (ob < 15 && sa - 1 - ob > sb) qs.push(ax, y, az);
        if (oa < 15 && sb - 1 - oa > sa) qs.push(bx, y, bz);
        if (ob < 15 && ba - 1 - ob > bb) qb.push(ax, y, az);
        if (oa < 15 && bb - 1 - oa > ba) qb.push(bx, y, bz);
      }
    }
  }
  run(addBfs(W, qs, 4));
  run(addBfs(W, qb, 0));
}
