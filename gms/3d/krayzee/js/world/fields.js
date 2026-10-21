// Field patchwork shared by the terrain shader and the CPU (tree/hedge placement). Both sides use the same integer
// hash, so a hedge painted by the GPU and the trees planted along it on the CPU always agree.
// Layout: the world is domain-warped, cut into rotated blocks (~one farm each), and each block is split
// recursively into rectangular fields. Natural woods are a separate noise field laid over the top.
export const BLOCK = 470;
export const WARP = 36;
export const FIELD_SEED = 0x1234567;
export const TOWN_SEED = 0x2b0f3c1;
export const WOOD_T = 0.655;

export function hsh(x) {
  x >>>= 0;
  x ^= x >>> 16; x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15; x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
}
export const cellHash = (cx, cz) => hsh(Math.imul(cx, 0x8da6b343) ^ hsh(Math.imul(cz, 0xd8163841) + 0x9e3779b9));
const u16 = (h) => (h & 0xffff) / 65535;

export function vnoise(x, z, seed) {
  const ix = Math.floor(x), iz = Math.floor(z);
  let fx = x - ix, fz = z - iz;
  fx = fx * fx * (3 - 2 * fx); fz = fz * fz * (3 - 2 * fz);
  const h = (a, b) => u16(hsh(cellHash(a, b) ^ seed));
  const a = h(ix, iz), b = h(ix + 1, iz), c = h(ix, iz + 1), d = h(ix + 1, iz + 1);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}
export function warpOff(x, z, out) {
  out[0] = (vnoise(x / 1100, z / 1100, 0x51) * 2 - 1) * WARP;
  out[1] = (vnoise(x / 1100, z / 1100, 0x93) * 2 - 1) * WARP;
  return out;
}
const _o = [0, 0];
export function unwarp(qx, qz, out) {
  let x = qx, z = qz;
  for (let k = 0; k < 4; k++) { warpOff(x, z, _o); x = qx - _o[0]; z = qz - _o[1]; }
  out[0] = x; out[1] = z;
  return out;
}
export const woods = (x, z) => vnoise(x / 700, z / 700, 0x5a5) * 0.65 + vnoise(x / 210, z / 210, 0x6b6) * 0.35;

// Field kinds. PLANT = conifer plantation (a whole field of rows).
export const K = { PASTURE: 0, MEADOW: 1, WHEAT: 2, BARLEY: 3, PLOUGH: 4, RAPE: 5, LEY: 6, PLANT: 7 };
export function leafKind(h) {
  const t = hsh(h ^ 0x51ed27);
  const r0 = u16(t), r1 = (t >>> 16) / 65535;
  if (r0 < 0.045) return K.PLANT;
  if (r1 < 0.40) return K.PASTURE;
  if (r1 < 0.54) return K.MEADOW;
  if (r1 < 0.68) return K.WHEAT;
  if (r1 < 0.76) return K.BARLEY;
  if (r1 < 0.89) return K.PLOUGH;
  if (r1 < 0.94) return K.RAPE;
  return K.LEY;
}
export const hedgeOf = (sh) => ({ hedge: (sh & 0xff) < 210, trees: (() => { const d = ((sh >>> 8) & 0xff) / 255; return d < 0.3 ? 0 : d < 0.8 ? 1 : 2; })(), width: 1.5 + 1.5 * ((sh >>> 16) & 0xff) / 255 });

function blockFrame(bx, bz, B, seed) {
  const bh = hsh(cellHash(bx, bz) ^ seed);
  const ang = (u16(bh) - 0.5) * 0.7;
  const ca = Math.cos(ang), sa = Math.sin(ang);
  return { bh, ca, sa, cx: (bx + 0.5) * B, cz: (bz + 0.5) * B, R: B / 2 * (Math.abs(ca) + Math.abs(sa)) };
}
const stopAt = (lv, w, d, t, minSize) => lv >= 5 || (lv >= 2 && (Math.min(w, d) < minSize || ((t >>> 4) & 0xff) < 50));
const splitAxisX = (w, d, t) => (w > d * 1.3 ? true : d > w * 1.3 ? false : (t & 1) === 1);
const splitF = (t) => 0.3 + 0.4 * ((t >>> 12) & 0xffff) / 65535;

// Field containing warped point (qx,qz): leaf hash, distance to its nearest border and that border's hash.
export function leafAt(qx, qz, B, seed, minSize, out = {}) {
  const bx = Math.floor(qx / B), bz = Math.floor(qz / B);
  const F = blockFrame(bx, bz, B, seed);
  const dx = qx - F.cx, dz = qz - F.cz;
  const lx = F.ca * dx + F.sa * dz, lz = -F.sa * dx + F.ca * dz;
  let x0 = -F.R, x1 = F.R, z0 = -F.R, z1 = F.R, h0x = 0, h1x = 0, h0z = 0, h1z = 0, nh = F.bh;
  for (let lv = 0; lv < 5; lv++) {
    const t = hsh(nh), w = x1 - x0, d = z1 - z0;
    if (stopAt(lv, w, d, t, minSize)) break;
    const sh = hsh(t ^ 0xa511e9);
    if (splitAxisX(w, d, t)) { const s = x0 + w * splitF(t); if (lx < s) { x1 = s; h1x = sh; nh = hsh(t + 1); } else { x0 = s; h0x = sh; nh = hsh(t + 2); } }
    else { const s = z0 + d * splitF(t); if (lz < s) { z1 = s; h1z = sh; nh = hsh(t + 3); } else { z0 = s; h0z = sh; nh = hsh(t + 4); } }
  }
  let e = 1e9, side = 0;
  const c = (dist, h) => { if (dist < e) { e = dist; side = h; } };
  if (h0x) c(lx - x0, h0x);
  if (h1x) c(x1 - lx, h1x);
  if (h0z) c(lz - z0, h0z);
  if (h1z) c(z1 - lz, h1z);
  c(qx - bx * B, hsh(cellHash(bx, bz) ^ seed ^ 0x77));
  c((bx + 1) * B - qx, hsh(cellHash(bx + 1, bz) ^ seed ^ 0x77));
  c(qz - bz * B, hsh(cellHash(bx, bz) ^ seed ^ 0x99));
  c((bz + 1) * B - qz, hsh(cellHash(bx, bz + 1) ^ seed ^ 0x99));
  out.leaf = nh; out.edge = e; out.side = side;
  return out;
}
const _q = [0, 0];
export function fieldAt(x, z, out = {}) {
  warpOff(x, z, _q);
  leafAt(x + _q[0], z + _q[1], BLOCK, FIELD_SEED, 120, out);
  out.kind = leafKind(out.leaf);
  return out;
}

// Walks every split line (and the block's west/north borders) of one block, and every leaf.
// onLine(pts: [[qx,qz],...] in warped space, borderHash); onLeaf(leafHash, toWarped(lx,lz), [x0,z0,x1,z1], inBlock(qx,qz)).
export function walkBlock(bx, bz, B, seed, minSize, step, onLine, onLeaf) {
  const F = blockFrame(bx, bz, B, seed);
  const toQ = (lx, lz) => [F.cx + F.ca * lx - F.sa * lz, F.cz + F.sa * lx + F.ca * lz];
  const inBlock = (q) => q[0] >= bx * B && q[0] < (bx + 1) * B && q[1] >= bz * B && q[1] < (bz + 1) * B;
  const rec = (x0, z0, x1, z1, nh, lv) => {
    const t = hsh(nh), w = x1 - x0, d = z1 - z0;
    if (stopAt(lv, w, d, t, minSize)) { onLeaf?.(nh, toQ, [x0, z0, x1, z1], inBlock); return; }
    const sh = hsh(t ^ 0xa511e9);
    const pts = [];
    if (splitAxisX(w, d, t)) {
      const s = x0 + w * splitF(t);
      for (let z = z0 + step / 2; z < z1; z += step) { const q = toQ(s, z); if (inBlock(q)) pts.push(q); }
      onLine(pts, sh);
      rec(x0, z0, s, z1, hsh(t + 1), lv + 1); rec(s, z0, x1, z1, hsh(t + 2), lv + 1);
    } else {
      const s = z0 + d * splitF(t);
      for (let x = x0 + step / 2; x < x1; x += step) { const q = toQ(x, s); if (inBlock(q)) pts.push(q); }
      onLine(pts, sh);
      rec(x0, z0, x1, s, hsh(t + 3), lv + 1); rec(x0, s, x1, z1, hsh(t + 4), lv + 1);
    }
  };
  rec(-F.R, -F.R, F.R, F.R, F.bh, 0);
  const west = [], north = [];
  for (let s = step / 2; s < B; s += step) { west.push([bx * B, bz * B + s]); north.push([bx * B + s, bz * B]); }
  onLine(west, hsh(cellHash(bx, bz) ^ seed ^ 0x77));
  onLine(north, hsh(cellHash(bx, bz) ^ seed ^ 0x99));
}

export const FIELD_GLSL = /* glsl */`
uint hsh(uint x) { x ^= x >> 16; x *= 0x7feb352du; x ^= x >> 15; x *= 0x846ca68bu; x ^= x >> 16; return x; }
uint cellHash(ivec2 c) { return hsh((uint(c.x) * 0x8da6b343u) ^ hsh(uint(c.y) * 0xd8163841u + 0x9e3779b9u)); }
float u16(uint h) { return float(h & 0xffffu) / 65535.0; }
float vnoiseU(vec2 p, uint seed) {
  vec2 i = floor(p), f = p - i; f = f * f * (3.0 - 2.0 * f);
  ivec2 c = ivec2(i);
  float a = u16(hsh(cellHash(c) ^ seed)), b = u16(hsh(cellHash(c + ivec2(1, 0)) ^ seed));
  float d = u16(hsh(cellHash(c + ivec2(0, 1)) ^ seed)), e = u16(hsh(cellHash(c + ivec2(1, 1)) ^ seed));
  return a + (b - a) * f.x + (d - a) * f.y + (a - b - d + e) * f.x * f.y;
}
vec2 warpOff(vec2 w) { return (vec2(vnoiseU(w / 1100.0, 0x51u), vnoiseU(w / 1100.0, 0x93u)) * 2.0 - 1.0) * ${WARP.toFixed(1)}; }
float woodsN(vec2 w) { return vnoiseU(w / 700.0, 0x5a5u) * 0.65 + vnoiseU(w / 210.0, 0x6b6u) * 0.35; }
int leafKind(uint h) {
  uint t = hsh(h ^ 0x51ed27u);
  float r0 = float(t & 0xffffu) / 65535.0, r1 = float(t >> 16) / 65535.0;
  if (r0 < 0.045) return 7;
  if (r1 < 0.40) return 0; if (r1 < 0.54) return 1; if (r1 < 0.68) return 2; if (r1 < 0.76) return 3;
  if (r1 < 0.89) return 4; if (r1 < 0.94) return 5; return 6;
}
// q: warped point. Returns border distance; leaf/side hashes out. lp = point in the field's local (rotated) frame.
float leafAt(vec2 q, float B, uint seed, float minSize, out uint leaf, out uint side, out vec2 lp) {
  ivec2 bc = ivec2(floor(q / B));
  uint bh = hsh(cellHash(bc) ^ seed);
  float ang = (u16(bh) - 0.5) * 0.7, ca = cos(ang), sa = sin(ang);
  vec2 d = q - (vec2(bc) + 0.5) * B;
  vec2 l = vec2(ca * d.x + sa * d.y, -sa * d.x + ca * d.y);
  float R = B * 0.5 * (abs(ca) + abs(sa));
  vec4 r = vec4(-R, -R, R, R);
  uvec4 hs = uvec4(0u);
  uint nh = bh;
  for (int lv = 0; lv < 5; lv++) {
    uint t = hsh(nh); float w = r.z - r.x, dd = r.w - r.y;
    if (lv >= 2 && (min(w, dd) < minSize || ((t >> 4) & 0xffu) < 50u)) break;
    uint sh = hsh(t ^ 0xa511e9u);
    bool ax = w > dd * 1.3 ? true : dd > w * 1.3 ? false : (t & 1u) == 1u;
    float f = 0.3 + 0.4 * float((t >> 12) & 0xffffu) / 65535.0;
    if (ax) { float s = r.x + w * f; if (l.x < s) { r.z = s; hs.z = sh; nh = hsh(t + 1u); } else { r.x = s; hs.x = sh; nh = hsh(t + 2u); } }
    else { float s = r.y + dd * f; if (l.y < s) { r.w = s; hs.w = sh; nh = hsh(t + 3u); } else { r.y = s; hs.y = sh; nh = hsh(t + 4u); } }
  }
  float e = 1e9; side = 0u;
  if (hs.x != 0u && l.x - r.x < e) { e = l.x - r.x; side = hs.x; }
  if (hs.z != 0u && r.z - l.x < e) { e = r.z - l.x; side = hs.z; }
  if (hs.y != 0u && l.y - r.y < e) { e = l.y - r.y; side = hs.y; }
  if (hs.w != 0u && r.w - l.y < e) { e = r.w - l.y; side = hs.w; }
  vec2 b0 = vec2(bc) * B, b1 = b0 + B;
  if (q.x - b0.x < e) { e = q.x - b0.x; side = hsh(cellHash(bc) ^ seed ^ 0x77u); }
  if (b1.x - q.x < e) { e = b1.x - q.x; side = hsh(cellHash(bc + ivec2(1, 0)) ^ seed ^ 0x77u); }
  if (q.y - b0.y < e) { e = q.y - b0.y; side = hsh(cellHash(bc) ^ seed ^ 0x99u); }
  if (b1.y - q.y < e) { e = b1.y - q.y; side = hsh(cellHash(bc + ivec2(0, 1)) ^ seed ^ 0x99u); }
  leaf = nh; lp = l;
  return e;
}
`;
