// Pure section mesher. Runs in the worker (mesher.worker.js) and in node tests.
// Input: lane 1's meshPayload (padded 18^3 cells/light + flat subs) and a block table from blocktable.js.
// Positions are section-local in 1/64 block units ("q"): one sub = 16q, one cell = 64q.

export const K_AIR = 0, K_OPAQUE = 1, K_CUTOUT = 2, K_GLASS = 3, K_LIQUID = 4, K_PLANT = 5, K_HIDDEN = 6, K_RAIL = 7;
export const F_SWAY = 1, F_WET = 2, F_GLINT = 4;    // vertex flag bits (3 bits)
export const T_WATERLOGGED = 1, T_SWAY = 2, T_GLINT = 4; // block table flag bits

const P = 18, P2 = 324;
const AX_N = [0, 0, 1, 1, 2, 2];
const AX_U = [2, 2, 0, 0, 0, 0];
const AX_V = [1, 1, 2, 2, 1, 1];
const SIGN = [1, -1, 1, -1, 1, -1];
const POFF = [1, -1, P2, -P2, P, -P];
const STRIDE = [1, P2, P]; // padded index stride per axis x,y,z

class Builder {
  constructor(cap = 1024) {
    this.n = 0; // quads
    this.pos = new Int16Array(cap * 12);
    this.uv = new Int16Array(cap * 8);
    this.data = new Uint8Array(cap * 16);
    this.qf = new Uint8Array(cap); // bit0 reverse winding, bit1 alt diagonal
  }
  grow() {
    const cap = this.qf.length * 2;
    const g = (A, k) => { const b = new A.constructor(cap * k); b.set(A); return b; };
    this.pos = g(this.pos, 12); this.uv = g(this.uv, 8); this.data = g(this.data, 16); this.qf = g(this.qf, 1);
  }
  finish() {
    const n = this.n, vc = n * 4;
    if (!n) return null;
    const index = vc > 65535 ? new Uint32Array(n * 6) : new Uint16Array(n * 6);
    for (let q = 0; q < n; q++) {
      const b = q * 4, f = this.qf[q], o = q * 6;
      let a0, a1, a2, b0, b1, b2;
      if (f & 2) { a0 = b + 1; a1 = b + 2; a2 = b + 3; b0 = b + 1; b1 = b + 3; b2 = b; }
      else { a0 = b; a1 = b + 1; a2 = b + 2; b0 = b; b1 = b + 2; b2 = b + 3; }
      if (f & 1) { index[o] = a0; index[o + 1] = a2; index[o + 2] = a1; index[o + 3] = b0; index[o + 4] = b2; index[o + 5] = b1; }
      else { index[o] = a0; index[o + 1] = a1; index[o + 2] = a2; index[o + 3] = b0; index[o + 4] = b1; index[o + 5] = b2; }
    }
    return { pos: this.pos.slice(0, vc * 3), uv: this.uv.slice(0, vc * 2), data: this.data.slice(0, vc * 4), index, quads: n };
  }
}

// Winding: does cross(U,V) point along +N for direction d?
const REVERSE = [0, 1, 2, 3, 4, 5].map((d) => {
  const u = [0, 0, 0], v = [0, 0, 0];
  u[AX_U[d]] = 1; v[AX_V[d]] = 1;
  const c = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  return c[AX_N[d]] * SIGN[d] > 0 ? 0 : 1;
});

export function meshSection(pl, T) {
  const { cells, subs, light } = pl;
  const kindT = T.kind, flagT = T.flags, tiles = T.tiles;
  const kindOf = (m) => (m < 256 ? kindT[m] : K_HIDDEN);
  const out = [new Builder(2048), new Builder(256), new Builder(256)]; // opaque, cutout, water

  const subAt = (sx, sy, sz) => {
    const v = cells[((sx >> 2) + 1) + ((sz >> 2) + 1) * P + ((sy >> 2) + 1) * P2];
    return v & 0x8000 ? subs[(v & 0x7fff) * 64 + (sx & 3) + (sz & 3) * 4 + (sy & 3) * 16] : v;
  };
  const lightAtSub = (sx, sy, sz) => light[((sx >> 2) + 1) + ((sz >> 2) + 1) * P + ((sy >> 2) + 1) * P2];
  const blocks = (m) => { const k = kindOf(m); return k === K_OPAQUE || k === K_HIDDEN; };
  const isWet = (m) => { const k = kindOf(m); return k === K_LIQUID || (m < 256 && (flagT[m] & T_WATERLOGGED)); };

  const vis = (ka, ma, mb) => {
    const kb = kindOf(mb);
    if (kb === K_OPAQUE || kb === K_HIDDEN) return false;
    if (ka === K_OPAQUE) return true;
    if (ka === K_LIQUID) return !isWet(mb);
    return mb !== ma; // cutout + glass: cull against the same block
  };

  // Per-vertex AO (0..3, 3 = open) and smooth light at sub-lattice point (Lu, Lv) on front layer `fl`.
  const s3 = [0, 0, 0];
  const at = (d, fl, u, v) => { s3[AX_N[d]] = fl; s3[AX_U[d]] = u; s3[AX_V[d]] = v; return subAt(s3[0], s3[1], s3[2]); };
  const lat = (d, fl, u, v) => { s3[AX_N[d]] = fl; s3[AX_U[d]] = u; s3[AX_V[d]] = v; return lightAtSub(s3[0], s3[1], s3[2]); };
  const vAO = [0, 0, 0, 0], vL = [0, 0, 0, 0];
  // corner c: 0=(u0,v0) 1=(u1,v0) 2=(u1,v1) 3=(u0,v1). du/dv = direction toward the outside of the face.
  const CDU = [-1, 0, 0, -1], CDV = [-1, -1, 0, 0];
  function corner(d, fl, Lu, Lv, c, smoothLight) {
    const ou = CDU[c], ov = CDV[c], iu = ou === -1 ? 0 : -1, iv = ov === -1 ? 0 : -1;
    // the four subs around the lattice point: inward (iu,iv), side1 (ou,iv), side2 (iu,ov), diag (ou,ov)
    const m1 = at(d, fl, Lu + ou, Lv + iv), m2 = at(d, fl, Lu + iu, Lv + ov), m3 = at(d, fl, Lu + ou, Lv + ov);
    const b1 = blocks(m1) ? 1 : 0, b2 = blocks(m2) ? 1 : 0, b3 = blocks(m3) ? 1 : 0;
    vAO[c] = b1 && b2 ? 0 : 3 - (b1 + b2 + b3);
    let l0 = lat(d, fl, Lu + iu, Lv + iv);
    if (!smoothLight) { vL[c] = l0; return; }
    let sky = l0 >> 4, blk = l0 & 15, n = 1;
    if (!b1) { const l = lat(d, fl, Lu + ou, Lv + iv); sky += l >> 4; blk += l & 15; n++; }
    if (!b2) { const l = lat(d, fl, Lu + iu, Lv + ov); sky += l >> 4; blk += l & 15; n++; }
    if (!b3 && !(b1 && b2)) { const l = lat(d, fl, Lu + ou, Lv + ov); sky += l >> 4; blk += l & 15; n++; }
    vL[c] = (Math.round(sky / n) << 4) | Math.round(blk / n);
  }
  // bit0: values constant along u (may merge in u), bit1: constant along v
  const mergeBits = () =>
    (vAO[0] === vAO[1] && vAO[3] === vAO[2] && vL[0] === vL[1] && vL[3] === vL[2] ? 1 : 0) |
    (vAO[0] === vAO[3] && vAO[1] === vAO[2] && vL[0] === vL[3] && vL[1] === vL[2] ? 2 : 0);
  function faceCorners(d, fl, U0, V0, U1, V1) {
    corner(d, fl, U0, V0, 0, true); corner(d, fl, U1, V0, 1, true);
    corner(d, fl, U1, V1, 2, true); corner(d, fl, U0, V1, 3, true);
  }

  const P3 = [0, 0, 0];
  // Emit a quad. Coordinates in q units (1/64). plane = normal-axis coordinate, [u0,u1]×[v0,v1].
  function quad(B, d, plane, u0, v0, u1, v1, tile, flags, extra, ao, li) {
    if (B.n >= B.qf.length) B.grow();
    const q = B.n++, na = AX_N[d], ua = AX_U[d], va = AX_V[d];
    const nf = d | (flags << 5);
    for (let c = 0; c < 4; c++) {
      const u = c === 1 || c === 2 ? u1 : u0, v = c >= 2 ? v1 : v0;
      P3[na] = plane; P3[ua] = u; P3[va] = v;
      const o = (q * 4 + c);
      B.pos[o * 3] = P3[0]; B.pos[o * 3 + 1] = P3[1]; B.pos[o * 3 + 2] = P3[2];
      B.uv[o * 2] = u; B.uv[o * 2 + 1] = v;
      B.data[o * 4] = tile; B.data[o * 4 + 1] = nf | (ao[c] << 3); B.data[o * 4 + 2] = li[c]; B.data[o * 4 + 3] = extra;
    }
    let f = REVERSE[d];
    if (ao[0] + ao[2] < ao[1] + ao[3]) f |= 2;
    B.qf[q] = f;
  }

  function plantQuads(B, x0, y0, z0, size, tile, li, flags) {
    // two diagonal planes, both windings; x0.. in q units
    if (B.n + 4 > B.qf.length) B.grow();
    const a = Math.round(size * 0.15), b = size - a, h = size;
    const planes = [[x0 + a, z0 + a, x0 + b, z0 + b], [x0 + a, z0 + b, x0 + b, z0 + a]];
    for (const [ax, az, bx, bz] of planes) {
      for (let side = 0; side < 2; side++) {
        const q = B.n++;
        const vx = [ax, bx, bx, ax], vz = [az, bz, bz, az], vy = [y0, y0, y0 + h, y0 + h];
        for (let c = 0; c < 4; c++) {
          const o = q * 4 + c;
          B.pos[o * 3] = vx[c]; B.pos[o * 3 + 1] = vy[c]; B.pos[o * 3 + 2] = vz[c];
          B.uv[o * 2] = c === 1 || c === 2 ? 64 : 0; B.uv[o * 2 + 1] = c >= 2 ? 64 : 0;
          B.data[o * 4] = tile; B.data[o * 4 + 1] = 6 | (3 << 3) | (flags << 5); B.data[o * 4 + 2] = li;
          B.data[o * 4 + 3] = c >= 2 ? 255 : 0; // sway weight
        }
        B.qf[q] = side;
      }
    }
  }

  const tileFor = (m, d) => tiles[m * 3 + (d === 2 ? 0 : d === 3 ? 2 : 1)];
  const builderFor = (k) => (k === K_OPAQUE ? out[0] : k === K_LIQUID ? out[2] : out[1]);
  const vflags = (m, wetFront) => {
    const f = flagT[m];
    return ((f & T_SWAY) ? F_SWAY : 0) | (wetFront ? F_WET : 0) | ((f & T_GLINT) ? F_GLINT : 0);
  };
  const waterDepth = (x, y, z) => {
    let n = 0, i = (x + 1) + (z + 1) * P + (y + 1) * P2;
    while (y - n >= -1 && n < 15) { const v = cells[i - n * P2]; if (v & 0x8000 || !isWet(v)) break; n++; }
    return n;
  };
  const liquidTopQ = (x, y, z) => (isWet(subAt(x * 4, y * 4 + 4, z * 4)) ? 64 : 56);

  // ---- Sub-resolution faces, 4×4 greedy per direction/layer -----------------------------------------
  // Emits the faces of sub-region [sx0,sx0+4)^3 (a refined cell) or, with `only`, the face layer of a
  // uniform cell against a refined neighbour.
  const mk = new Int32Array(16), ml = new Int32Array(16), mt = new Int32Array(16), mx = new Int32Array(16);
  const aoTmp = [[0, 0, 0, 0]], liTmp = [[0, 0, 0, 0]];
  function subFaces(d, cellMin, layer, getMat) {
    // cellMin = [sx,sy,sz] sub coords of the owning cell, layer = 0..3 along the normal
    const na = AX_N[d], ua = AX_U[d], va = AX_V[d], sg = SIGN[d];
    let any = false;
    for (let v = 0; v < 4; v++) for (let u = 0; u < 4; u++) {
      const s = [0, 0, 0];
      s[na] = cellMin[na] + layer; s[ua] = cellMin[ua] + u; s[va] = cellMin[va] + v;
      const i = u + v * 4;
      mk[i] = -1;
      const m = getMat(s[0], s[1], s[2]);
      if (!m) continue;
      const ka = kindOf(m);
      if (ka === K_AIR || ka === K_PLANT || ka === K_HIDDEN || ka === K_RAIL) continue;
      const fl = s[na] + sg;
      const nb = at(d, fl, s[ua], s[va]);
      if (!vis(ka, m, nb)) continue;
      faceCorners(d, fl, s[ua], s[va], s[ua] + 1, s[va] + 1);
      let aoK = 0;
      for (let c = 0; c < 4; c++) aoK |= vAO[c] << (c * 2);
      const wet = isWet(nb);
      mk[i] = m | (vflags(m, wet) << 8) | (mergeBits() << 12);
      ml[i] = vL[0] | (vL[1] << 8) | (vL[2] << 16) | (vL[3] << 24);
      mt[i] = aoK;
      mx[i] = 0;
      any = true;
    }
    if (!any) return;
    const plane = (cellMin[na] + layer + (sg > 0 ? 1 : 0)) * 16;
    for (let v = 0; v < 4; v++) for (let u = 0; u < 4; ) {
      const i = u + v * 4, k = mk[i];
      if (k < 0 || mx[i]) { u++; continue; }
      const L = ml[i], A = mt[i];
      let w = 1;
      while ((k & 0x1000) && u + w < 4 && mk[i + w] === k && ml[i + w] === L && mt[i + w] === A && !mx[i + w]) w++;
      let h = 1;
      outer: while ((k & 0x2000) && v + h < 4) {
        for (let j = 0; j < w; j++) { const ii = u + j + (v + h) * 4; if (mk[ii] !== k || ml[ii] !== L || mt[ii] !== A || mx[ii]) break outer; }
        h++;
      }
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) mx[u + x + (v + y) * 4] = 1;
      const m = k & 255, fl = (k >> 8) & 7;
      for (let c = 0; c < 4; c++) { aoTmp[0][c] = (A >> (c * 2)) & 3; liTmp[0][c] = (L >>> (c * 8)) & 255; }
      const U0 = (cellMin[ua] + u) * 16, V0 = (cellMin[va] + v) * 16;
      quad(builderFor(kindOf(m)), d, plane, U0, V0, U0 + w * 16, V0 + h * 16, tileFor(m, d), fl, 0, aoTmp[0], liTmp[0]);
      u += w;
    }
  }

  // ---- Cell-resolution greedy faces ---------------------------------------------------------------
  const KEY = new Int32Array(256), LIT = new Int32Array(256), AOK = new Int32Array(256), EXT = new Int32Array(256);
  const DONE = new Uint8Array(256);
  const c3 = [0, 0, 0];
  const aoQ = [0, 0, 0, 0], liQ = [0, 0, 0, 0];
  for (let d = 0; d < 6; d++) {
    const na = AX_N[d], ua = AX_U[d], va = AX_V[d], sg = SIGN[d], po = POFF[d];
    for (let s = 0; s < 16; s++) {
      let any = false;
      for (let v = 0; v < 16; v++) for (let u = 0; u < 16; u++) {
        const i = u + v * 16;
        KEY[i] = -1; DONE[i] = 0;
        c3[na] = s; c3[ua] = u; c3[va] = v;
        const pi = (c3[0] + 1) + (c3[2] + 1) * P + (c3[1] + 1) * P2;
        const m = cells[pi];
        if (m & 0x8000 || m === 0) continue;
        const ka = kindOf(m);
        if (ka === K_AIR || ka === K_PLANT || ka === K_HIDDEN || ka === K_RAIL) continue;
        const nb = cells[pi + po];
        if (nb & 0x8000) {
          const cm = [c3[0] * 4, c3[1] * 4, c3[2] * 4];
          subFaces(d, cm, sg > 0 ? 3 : 0, () => m);
          continue;
        }
        if (!vis(ka, m, nb)) continue;
        // water beside open air (only player edits make this): no glassy side wall, the volume just ends
        if (ka === K_LIQUID && nb === 0 && na !== 1) continue;
        const fl = sg > 0 ? (s + 1) * 4 : s * 4 - 1;
        faceCorners(d, fl, u * 4, v * 4, u * 4 + 4, v * 4 + 4);
        let aoK = 0;
        for (let c = 0; c < 4; c++) aoK |= vAO[c] << (c * 2);
        let ext = 0, low = 0;
        if (ka === K_LIQUID) {
          if (d === 2) ext = waterDepth(c3[0], c3[1], c3[2]);
          if (liquidTopQ(c3[0], c3[1], c3[2]) < 64) low = 1;
        }
        KEY[i] = m | (vflags(m, isWet(nb)) << 8) | (low << 11) | (mergeBits() << 12);
        LIT[i] = vL[0] | (vL[1] << 8) | (vL[2] << 16) | (vL[3] << 24);
        AOK[i] = aoK; EXT[i] = ext;
        any = true;
      }
      if (!any) continue;
      for (let v = 0; v < 16; v++) for (let u = 0; u < 16; ) {
        const i = u + v * 16, k = KEY[i];
        if (k < 0 || DONE[i]) { u++; continue; }
        const L = LIT[i], A = AOK[i], E = EXT[i];
        const low = (k >> 11) & 1;
        let w = 1;
        while ((k & 0x1000) && u + w < 16 && KEY[i + w] === k && LIT[i + w] === L && AOK[i + w] === A && EXT[i + w] === E && !DONE[i + w]) w++;
        let h = 1;
        if ((k & 0x2000) && !(low && d !== 2 && d !== 3)) {
          outer: while (v + h < 16) {
            for (let j = 0; j < w; j++) { const ii = u + j + (v + h) * 16; if (KEY[ii] !== k || LIT[ii] !== L || AOK[ii] !== A || EXT[ii] !== E || DONE[ii]) break outer; }
            h++;
          }
        }
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) DONE[u + x + (v + y) * 16] = 1;
        const m = k & 255, fl = (k >> 8) & 7;
        for (let c = 0; c < 4; c++) { aoQ[c] = (A >> (c * 2)) & 3; liQ[c] = (L >>> (c * 8)) & 255; }
        let plane = (sg > 0 ? s + 1 : s) * 64;
        let V1 = (v + h) * 64;
        if (low) {
          if (d === 2) plane = s * 64 + 56;
          else if (va === 1) V1 = v * 64 + 56;
        }
        quad(builderFor(kindOf(m)), d, plane, u * 64, v * 64, (u + w) * 64, V1, tileFor(m, d), fl, E, aoQ, liQ);
        u += w;
      }
    }
  }

  // ---- Refined cells and plants -------------------------------------------------------------------
  const cellSub = (sx, sy, sz) => subAt(sx, sy, sz);
  for (let y = 0; y < 16; y++) for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
    const pi = (x + 1) + (z + 1) * P + (y + 1) * P2;
    const v = cells[pi];
    if (v === 0) continue;
    if (v & 0x8000) {
      const base = (v & 0x7fff) * 64;
      const cm = [x * 4, y * 4, z * 4];
      for (let d = 0; d < 6; d++) for (let l = 0; l < 4; l++) subFaces(d, cm, l, cellSub);
      for (let i = 0; i < 64; i++) {
        const m = subs[base + i];
        if (m && kindOf(m) === K_PLANT) {
          const sx = i & 3, sz = (i >> 2) & 3, sy = i >> 4;
          plantQuads(out[1], (x * 4 + sx) * 16, (y * 4 + sy) * 16, (z * 4 + sz) * 16, 16, tiles[m * 3 + 1], light[pi], vflags(m, false));
        }
      }
      continue;
    }
    if (kindOf(v) === K_RAIL) {
      // ladder panel flat against the first solid horizontal neighbour, drawn from both sides
      const li = light[pi], ao = [3, 3, 3, 3], L4 = [li, li, li, li], t = tiles[v * 3 + 1];
      const walls = [[1, -1], [0, 1], [5, -P], [4, P]]; // same order as world.railFace
      let d = 1;
      for (const [dd, off] of walls) if (blocks(cells[pi + off])) { d = dd; break; }
      const na = AX_N[d], inset = 4;
      const plane = (d === 0 || d === 4) ? (na === 0 ? x : z) * 64 + 64 - inset : (na === 0 ? x : z) * 64 + inset;
      const ua = AX_U[d], va = AX_V[d];
      const base = [x * 64, y * 64, z * 64];
      const opp = d ^ 1;
      quad(out[1], opp, plane, base[ua], base[va], base[ua] + 64, base[va] + 64, t, vflags(v, false), 0, ao, L4);
      quad(out[1], d, plane, base[ua], base[va], base[ua] + 64, base[va] + 64, t, vflags(v, false), 0, ao, L4);
      continue;
    }
    if (kindOf(v) === K_PLANT) {
      plantQuads(out[1], x * 64, y * 64, z * 64, 64, tiles[v * 3 + 1], light[pi], vflags(v, (flagT[v] & T_WATERLOGGED) !== 0));
      if (flagT[v] & T_WATERLOGGED) {
        // waterlogged plant (kelp): render the water surface above it if it is the top of the column
        const up = cells[pi + P2];
        if (!(up & 0x8000) && kindOf(up) !== K_LIQUID && !blocks(up) && !(flagT[up & 255] & T_WATERLOGGED)) {
          const W = T.water ?? 0;
          if (W) {
            const li = [light[pi + P2], light[pi + P2], light[pi + P2], light[pi + P2]];
            quad(out[2], 2, y * 64 + 56, x * 64, z * 64, x * 64 + 64, z * 64 + 64, tiles[W * 3], 0, waterDepth(x, y, z), [3, 3, 3, 3], li);
          }
        }
      }
    }
  }

  return { opaque: out[0].finish(), cutout: out[1].finish(), water: out[2].finish() };
}
