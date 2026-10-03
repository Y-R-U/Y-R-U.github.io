import * as THREE from 'three';
import * as S from './shape.js?v=20261004a';
import { WORLD_LIGHT_HEAD, WORLD_LIGHT_FRAG, WORLD_POS_VERT } from './materials.js?v=20261004a';

// Caricature chibi townsfolk (Look A): one merged rig, one InstancedMesh per crowd, limbs posed in the vertex shader.
// Head ≈ 40% of height, big nose, thick brows, moustaches, hats and accessories are all inside the rig and picked per
// instance, so a crowd stays ONE draw (+ one blob-shadow draw) whatever it wears. See docs/ART.md "Characters".
// aPart = (limb, colourSlot, style). limb: 0 body 1/2 legs 3/4 arms (L/R) 5 head 6 carried item 8 hat.
// colourSlot: 0 baked 1 top 2 bottom 3 skin 4 hair 5 hat 6 hat shade. style: -1 always, 0..6 hair style,
// 10+n accessory bit n, 30+n moustache n, 50+n hat type n.
export const CLIP = {
  idle: 0, walk: 1, carry: 2, work: 3, cheer: 4, sit: 5, sip: 6, sweep: 7,
  flail: 8, slump: 9, duel: 10, draw: 11, point: 12, piano: 13, stagger: 14, hammer: 15, dizzy: 16, tiphat: 17,
  sprawl: 18, handsup: 19, cancan: 20, punch: 21,
};
export const SKIN = ['#f8cfae', '#efb98f', '#dc9c70', '#bd7b51', '#8f5838', '#fad6bd'];
export const HAIR = ['#5a3a2c', '#7c4a2c', '#b8743e', '#e8bc66', '#46343c', '#cc6440', '#e0dbd3', '#a09692', '#3c3a52', '#b8502a'];
export const CROWD_K = 1.22;
const STYLES = 7;
export const OUTFITS = ['#b5483a', '#d9a441', '#5e8f8c', '#7d8fa3', '#c98b7e', '#8fa27a', '#e9e4da', '#c98a4a', '#8a5a6e', '#e8776a', '#4f86a8', '#f2d08a'];
export const PANTS = ['#4a5878', '#6b5a7d', '#3f6b74', '#8a6a52', '#5b5f66', '#7a4f5a', '#2f4a66', '#c9b08a', '#5f7d4a', '#6e452d'];
// Hat types (index = rig style 50+n, and kit.hats.geometry(n)). Order matches lane S's cast HAT map for 0..7.
export const HAT_TYPES = ['derby', 'bowler', 'stetson', 'stovepipe', 'boater', 'feathered', 'droopy', 'bonnet', 'ten', 'cap', 'flat', 'thimble'];
export const HAT = Object.fromEntries(HAT_TYPES.map((k, i) => [k, i]));
export const HAT_SEAT = 1.13;
export const HAT_COLORS = { tan: '#c9a06a', brown: '#7a5236', dark: '#3b2a24', black: '#2b2230', cream: '#efe2c8', sand: '#dcc596', grey: '#7d7a80', purple: '#6b3f86', red: '#b5483a', straw: '#e8cf8a', teal: '#3f8f8a', white: '#f6f1e6', pink: '#e58fb0' };
// Accessory bits (look({ acc: ['apron', 'badge'] }) or a bitmask).
export const ACC = { apron: 0, badge: 1, vest: 2, tails: 3, duster: 4, overalls: 5, dress: 6, mask: 7, bottle: 8, monocle: 9, cigar: 10, scarf: 11, gunbelt: 12, bigbadge: 13, pistol: 14, lantern: 15, rollingpin: 16, pliers: 17, garters: 18, hammer: 19, longjohns: 20 };
export const STACHE = { none: -1, walrus: 0, handlebar: 1, pencil: 2, beard: 3, chops: 4 };

// ---------------------------------------------------------------- hats (shared with the standalone hat library)
function lathe(prof, seg = 18) {
  const g = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(Math.max(r, 0.0005), y)), seg);
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  return g;
}
// Hat parts are built indexed (smooth clay normals) and flattened once at the end.
function flat(g) {
  if (!g.index) return g;
  g.computeVertexNormals();
  const n = g.toNonIndexed();
  return n;
}
// Parametric hat (one lathe evaluated in the vertex shader from a per-type table, so 12 hat types cost ~900 rig
// vertices instead of ~25 k). Per type: [crownR, crownH, brimR, generic], [taper, round, flare, base], [curl, dip, crease, tiltX].
export const HAT_P = [
  [[0.25, 0.17, 0.36, 1], [0.92, 0.6, 1, 0.05], [0.03, 0, 0, 0]],
  [[0.26, 0.26, 0.38, 1], [0.9, 0.95, 1, 0.04], [0.07, 0.02, 0, 0]],
  [[0.25, 0.3, 0.56, 1], [0.86, 0.35, 1, 0.05], [0.15, 0.03, 0.07, 0]],
  [[0.23, 0.8, 0.37, 1], [1.0, 0.05, 1.07, 0.04], [0.06, 0, 0, 0]],
  [[0.25, 0.14, 0.5, 1], [1.0, 0.0, 1, 0.03], [0, 0, 0, 0]],
  [[0.24, 0.16, 0.64, 1], [0.95, 0.7, 1, 0.04], [0.12, -0.05, 0, -0.22]],
  [[0.25, 0.3, 0.52, 1], [0.82, 0.6, 1, 0.05], [-0.04, 0.13, 0.08, 0.06]],
  [[0, 0, 0, 0], [1, 0, 1, 0], [0, 0, 0, 0]],
  [[0.27, 0.5, 0.74, 1], [0.8, 0.7, 1, 0.05], [0.2, 0.04, 0.05, 0]],
  [[0, 0, 0, 0], [1, 0, 1, 0], [0, 0, 0, 0]],
  [[0.24, 0.2, 0.6, 1], [0.95, 0.1, 1, 0.04], [0.02, 0, 0.03, 0]],
  [[0, 0, 0, 0], [1, 0, 1, 0], [0, 0, 0, 0]],
];
const HAT_SEG = 16;
function hatProf(k, [p0, p1]) {
  const [cr, h, R] = p0, [taper, rnd, flare, base] = p1, th = 0.035;
  if (k >= 20) { const y0 = base - 0.01, bh = 0.055; return [[cr * 1.035, y0], [cr * 1.045, y0 + bh], [cr * 0.9, y0 + bh], [cr * 0.9, y0]][k - 20]; }
  return [[0, 0], [R * 0.97, 0], [R, th * 0.5], [R * 0.97, th], [cr, th * 1.3], [cr * 1.02, base], [cr, base + h * 0.2],
    [cr * taper * flare, base + h * (1 - rnd * 0.3)], [cr * taper * flare * 0.82, base + h], [0, base + h * 0.98]][k];
}
function hatVertex(k, c, sn, P) {
  const [p0, p1, p2] = P, [cr, h, R] = p0, [curl, dip, crease, tilt] = p2, top = p1[3] + h;
  let [r, y] = hatProf(k, P);
  const kn = k >= 20 ? Math.min(23, Math.max(20, k)) : k;
  const a = hatProf(Math.max(kn >= 20 ? 20 : 0, kn - 1), P), b = hatProf(Math.min(kn >= 20 ? 23 : 9, kn + 1), P);
  let nr = b[1] - a[1], ny = -(b[0] - a[0]);
  if (k === 0) { nr = 0; ny = -1; }
  if (k === 9) { nr = 0; ny = 1; }
  const L = Math.hypot(nr, ny) || 1;
  let x = r * c, z = r * sn;
  if (k >= 1 && k <= 3 && R > cr) {
    const t = Math.pow(Math.min(1, (r - cr) / (R - cr)), 1.5);
    y += curl * t * c * c - dip * t * sn * sn;
  }
  if (crease && k >= 7 && k < 20) y -= crease * Math.exp(-Math.pow(x / (cr * 0.45), 2)) * Math.max(0, (y - top * 0.7) / (top * 0.3));
  const ct = Math.cos(tilt), st = Math.sin(tilt);
  const n = [nr / L * c, ny / L, nr / L * sn];
  return { p: [x, y * ct - z * st, y * st + z * ct], n: [n[0], n[1] * ct - n[2] * st, n[1] * st + n[2] * ct] };
}
// Encoded lathe for the rig: position = (cos θ, k, sin θ); the shader rebuilds the shape from uHatP.
function hatLatheEncoded(k0, k1) {
  const pos = [];
  for (let k = k0; k < k1; k++) for (let i = 0; i < HAT_SEG; i++) {
    const a0 = (i / HAT_SEG) * Math.PI * 2, a1 = ((i + 1) / HAT_SEG) * Math.PI * 2;
    const A = [Math.cos(a0), k, Math.sin(a0)], B = [Math.cos(a1), k, Math.sin(a1)], C = [Math.cos(a1), k + 1, Math.sin(a1)], D = [Math.cos(a0), k + 1, Math.sin(a0)];
    pos.push(...A, ...C, ...B, ...A, ...D, ...C);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length), 3));
  return g;
}
function hatLatheCPU(t, k0, k1, seg = 18) {
  const P = HAT_P[t], pos = [], nor = [];
  for (let k = k0; k < k1; k++) for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
    const V = [[k, a0], [k + 1, a1], [k, a1], [k, a0], [k + 1, a0], [k + 1, a1]].map(([kk, an]) => hatVertex(kk, Math.cos(an), Math.sin(an), P));
    for (const v of V) { pos.push(...v.p); nor.push(...v.n); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return g;
}
// Special (non-parametric) hat parts in hat-local space (seat at y = 0): feathers, bonnet, cap, thimble.
function hatParts(type) {
  const P = [];
  const felt = (g) => P.push({ geo: flat(g), kind: 'felt' }), band = (g) => P.push({ geo: flat(g), kind: 'band' }), col = (g, c) => P.push({ geo: flat(g), kind: c });
  const blob = () => S.smooth(S.blob(1, 1, { jitter: 0, rng: () => 0.5 }));
  switch (HAT_TYPES[type]) {
    case 'feathered':
      [['#e58fb0', -0.1, 0.0, 0.25], ['#7a4a9a', 0.06, -0.08, -0.15], ['#f3e2c4', 0.16, 0.02, -0.45], ['#b5483a', -0.2, -0.06, 0.55]].forEach(([c, x, z, rz]) => {
        const f = S.smooth(S.blob(1, 0, { jitter: 0, rng: () => 0.5 }));
        f.scale(0.06, 0.34, 0.025); f.rotateZ(rz); f.translate(x, 0.42, z - 0.05); f.rotateX(-0.22);
        col(f, c);
      });
      break;
    case 'bonnet': {
      const sh = blob(); sh.scale(0.3, 0.29, 0.3); sh.translate(0, -0.05, -0.06); felt(sh);
      const brim = lathe([[0.0005, 0], [0.36, 0], [0.38, 0.02], [0.0005, 0.03]], 12); brim.rotateX(1.25); brim.translate(0, -0.07, 0.12); felt(brim);
      const rb = S.smooth(S.blob(1, 0, { jitter: 0, rng: () => 0.5 })); rb.scale(0.05, 0.16, 0.03); rb.translate(0.2, -0.32, 0.1); col(rb, '#b5483a');
      break;
    }
    case 'cap': {
      const sh = blob(); sh.scale(0.29, 0.14, 0.3); sh.translate(0, 0.06, -0.01); felt(sh);
      const v = blob(); v.scale(0.2, 0.025, 0.14); v.translate(0, 0.02, 0.26); band(v);
      break;
    }
    case 'thimble':
      col(lathe([[0.0005, 0], [0.13, 0], [0.135, 0.05], [0.12, 0.2], [0.09, 0.24], [0.0005, 0.25]], 12), '#c9ced4');
      break;
  }
  return P;
}

// Standalone hat geometry in hat-local space (seat at origin, +z = the wearer's front), felt painted white so an
// instance colour tints it; bands/feathers keep their own colour. Use with InstancedMesh + kit.materials.lambertVCInst.
const hatGeoCache = new Map();
export function hatGeometry(type) {
  const t = typeof type === 'string' ? HAT[type] : type;
  if (hatGeoCache.has(t)) return hatGeoCache.get(t);
  const parts = hatParts(t);
  if (HAT_P[t][0][3]) { parts.unshift({ geo: hatLatheCPU(t, 20, 23), kind: 'band' }); parts.unshift({ geo: hatLatheCPU(t, 0, 9), kind: 'felt' }); }
  const pos = [], nor = [], colr = [];
  for (const p of parts) {
    const c = S.rgb(p.kind === 'felt' ? '#ffffff' : p.kind === 'band' ? '#4a3a32' : p.kind);
    const A = p.geo.attributes;
    for (let i = 0; i < A.position.count; i++) {
      pos.push(A.position.getX(i), A.position.getY(i), A.position.getZ(i));
      nor.push(A.normal.getX(i), A.normal.getY(i), A.normal.getZ(i));
      colr.push(c[0], c[1], c[2]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
  g.computeBoundingSphere();
  S.setPbr(g, 0.85, t === HAT.thimble ? 0.8 : 0, 0);
  hatGeoCache.set(t, g);
  return g;
}
// Your hat tier (data/hats.js HATS row) → { type, scale, color }. Ten-gallon geometry is the base for the big ones.
export function hatForTier(def) {
  if (!def) return { type: HAT.derby, scale: 0.9, color: HAT_COLORS.brown };
  const id = def.id;
  if (id === 'derby') return { type: HAT.derby, scale: 1, color: HAT_COLORS.brown };
  if (id === 'bowler') return { type: HAT.bowler, scale: 1, color: HAT_COLORS.black };
  if (id === 'stetson') return { type: HAT.stetson, scale: 1, color: HAT_COLORS.tan };
  return { type: HAT.ten, scale: Math.max(1, (def.scale || 1.6) / 1.6), color: HAT_COLORS.cream };
}
// Pomfrey's tier (POMFREY_HATS row) → a top hat that shrinks to a thimble.
export function hatForPomfrey(def) {
  if (!def || def.id === 'thimble') return { type: HAT.thimble, scale: 1, color: '#c9ced4' };
  return { type: HAT.stovepipe, scale: Math.max(0.6, (def.scale || 1) * 0.75), color: HAT_COLORS.purple };
}

// ---------------------------------------------------------------- the rig
let baseGeo = null;
function rigGeometry() {
  if (baseGeo) return baseGeo;
  const parts = [];
  const P = (geo, m, limb, slot, style = -1, col = '#ffffff', glow = 0) => {
    if (!geo.attributes.color || col !== null) S.paint(geo, col || '#ffffff');
    if (m) geo.applyMatrix4(m);
    parts.push({ geo, limb, slot, style, glow });
  };
  const M = (x, y, z, sx = 1, sy = sx, sz = sx, rx = 0, ry = 0, rz = 0) => S.matrix({ pos: [x, y, z], scale: [sx, sy, sz], rx, ry, rz });
  const ball = (d = 1, j = 0.0) => S.smooth(S.blob(1, d, { jitter: j, rng: () => 0.5 }));
  const BOOT = '#4a3328', BELT = '#3a2a22', BRASS = '#e2b84a', DARK = '#241a2c';
  for (const sx of [-1, 1]) {
    const leg = sx < 0 ? 1 : 2, arm = sx < 0 ? 3 : 4;
    P(ball(1), M(sx * 0.08, 0.05, 0.04, 0.075, 0.06, 0.12), leg, 0, -1, BOOT);
    P(S.prism(7, 0.07, 0.068, 0.12), M(sx * 0.08, 0.04, 0), leg, 0, -1, BOOT);
    P(S.prism(7, 0.07, 0.075, 0.28), M(sx * 0.08, 0.13, 0), leg, 2);
    P(S.prism(7, 0.066, 0.074, 0.3), M(sx * 0.2, 0.38, 0, 1, 1, 1, 0, 0, -sx * 0.1), arm, 1);
    P(ball(1), M(sx * 0.22, 0.355, 0.005, 0.07), arm, 3);
  }
  P(S.smooth(S.prism(9, 0.17, 0.13, 0.4, { rings: 2, squash: 0.84 })), M(0, 0.33, 0), 0, 1);
  P(ball(1), M(0, 0.36, 0, 0.175, 0.095, 0.145), 0, 2);
  P(S.prism(9, 0.172, 0.17, 0.05, { squash: 0.84 }), M(0, 0.4, 0), 0, 0, -1, BELT);
  P(S.block(0.07, 0.055, 0.02, { cut: 0.01, taper: 0 }), M(0, 0.398, 0.146), 0, 0, -1, BRASS);
  P(S.prism(7, 0.055, 0.05, 0.08), M(0, 0.71, 0), 5, 3);
  // head: big round face, ears, eyes with catchlights, thick brows, a BIG nose, cheeks, a small mouth
  P(ball(2), M(0, 0.98, 0.01, 0.262, 0.245, 0.25), 5, 3);
  for (const sx of [-1, 1]) {
    P(ball(0), M(sx * 0.255, 0.96, -0.01, 0.05, 0.07, 0.04), 5, 3);
    P(ball(1), M(sx * 0.088, 0.985, 0.225, 0.042, 0.058, 0.03), 5, 0, -1, DARK);
    P(ball(0), M(sx * 0.088 + 0.014, 1.005, 0.25, 0.014, 0.017, 0.008), 5, 0, -1, '#ffffff');
    P(ball(0), M(sx * 0.165, 0.905, 0.2, 0.05, 0.03, 0.02), 5, 0, -1, '#f08a86');
    P(ball(0), M(sx * 0.09, 1.07, 0.222, 0.068, 0.024, 0.024, 0, 0, sx * -0.16), 5, 4, -1);
  }
  P(ball(1), M(0, 0.92, 0.27, 0.088, 0.08, 0.085), 5, 7);
  P(ball(0), M(0, 0.85, 0.232, 0.04, 0.012, 0.012), 5, 0, -1, '#7a3038');
  // hair styles 0..6 (hair colour)
  P(ball(1), M(0, 1.0, -0.06, 0.29, 0.29, 0.27), 5, 4, 5);
  P(ball(1), M(0, 0.78, -0.12, 0.24, 0.24, 0.16), 5, 4, 5);
  P(ball(1), M(0, 1.13, 0.1, 0.235, 0.1, 0.14, 0.35), 5, 4, 5);
  P(ball(1), M(0, 1.02, -0.04, 0.272, 0.23, 0.262), 5, 4, 6);
  P(ball(1), M(0, 1.15, 0.11, 0.21, 0.08, 0.13, 0.4), 5, 4, 6);
  for (const sx of [-1, 1]) P(ball(1), M(sx * 0.27, 0.92, -0.06, 0.09, 0.13, 0.09, 0, 0, sx * 0.3), 5, 4, 6);
  P(ball(1), M(0, 1.03, -0.035, 0.274, 0.235, 0.265), 5, 4, 0);
  P(ball(1), M(0, 1.14, 0.12, 0.2, 0.08, 0.13, 0.4), 5, 4, 0);
  P(ball(1), M(0, 1.0, -0.05, 0.287, 0.27, 0.28), 5, 4, 1);
  P(ball(1), M(0, 0.86, -0.08, 0.25, 0.14, 0.2), 5, 4, 1);
  P(ball(1), M(0, 1.14, 0.12, 0.22, 0.09, 0.13, 0.4), 5, 4, 1);
  P(ball(1), M(0, 1.04, -0.035, 0.272, 0.23, 0.262), 5, 4, 2);
  P(ball(1), M(0, 1.27, -0.04, 0.11), 5, 4, 2);
  P(ball(1), M(0, 1.035, -0.03, 0.267, 0.215, 0.26), 5, 4, 3);
  P(ball(1), M(0, 0.98, -0.25, 0.08, 0.16, 0.08, -0.4), 5, 4, 3);
  for (const sx of [-1, 1]) P(ball(1), M(sx * 0.2, 0.93, -0.12, 0.11, 0.1, 0.14), 5, 4, 4);
  // moustaches 30+n (hair colour)
  for (const sx of [-1, 1]) {
    P(ball(1), M(sx * 0.06, 0.875, 0.252, 0.085, 0.048, 0.04, 0, 0, sx * 0.35), 5, 4, 30);
    P(ball(0), M(sx * 0.07, 0.88, 0.248, 0.08, 0.026, 0.03, 0, 0, sx * -0.1), 5, 4, 31);
    P(ball(0), M(sx * 0.15, 0.905, 0.226, 0.03, 0.04, 0.026, 0, 0, sx * 0.4), 5, 4, 31);
    P(ball(0), M(sx * 0.04, 0.878, 0.258, 0.045, 0.012, 0.012), 5, 4, 32);
    P(ball(0), M(sx * 0.06, 0.875, 0.252, 0.075, 0.035, 0.035, 0, 0, sx * 0.25), 5, 4, 33);
    P(ball(0), M(sx * 0.21, 0.88, 0.1, 0.07, 0.12, 0.09), 5, 4, 34);
  }
  P(ball(1), M(0, 0.8, 0.14, 0.2, 0.15, 0.14), 5, 4, 33);
  P(ball(1), M(0, 0.86, 0.06, 0.25, 0.12, 0.2), 5, 4, 33);
  // accessories 10+n
  P(S.block(0.25, 0.36, 0.02, { cut: 0.03, taper: -0.1 }), M(0, 0.17, 0.15, 1, 1, 1, -0.08), 0, 0, 10 + ACC.apron, '#f3ede0');
  starGeo(P, M(-0.07, 0.6, 0.142, 0.05, 0.05, 1), 0, 10 + ACC.badge, BRASS);
  for (const sx of [-1, 1]) P(S.block(0.11, 0.3, 0.03, { cut: 0.02, taper: 0.1 }), M(sx * 0.085, 0.42, 0.13, 1, 1, 1, -0.08, sx * -0.25), 0, 2, 10 + ACC.vest);
  for (const sx of [-1, 1]) P(S.block(0.1, 0.34, 0.03, { cut: 0.02, taper: 0.25 }), M(sx * 0.06, 0.12, -0.15, 1, 1, 1, 0.2), 0, 1, 10 + ACC.tails);
  P(S.smooth(S.prism(10, 0.21, 0.17, 0.44, { rings: 2, squash: 0.9 })), M(0, 0.2, -0.01), 0, 0, 10 + ACC.duster, '#8a6a52');
  for (const sx of [-1, 1]) P(S.block(0.11, 0.34, 0.03, { cut: 0.02, taper: 0.1 }), M(sx * 0.1, 0.32, 0.142, 1, 1, 1, -0.06, sx * -0.3), 0, 0, 10 + ACC.duster, '#7a5a44');
  P(S.block(0.2, 0.2, 0.03, { cut: 0.02, taper: 0.05 }), M(0, 0.44, 0.14, 1, 1, 1, -0.08), 0, 2, 10 + ACC.overalls);
  for (const sx of [-1, 1]) P(S.block(0.035, 0.24, 0.02, { cut: 0.01, taper: 0 }), M(sx * 0.08, 0.55, 0.14, 1, 1, 1, -0.1), 0, 2, 10 + ACC.overalls);
  P(S.smooth(S.prism(12, 0.32, 0.16, 0.34, { rings: 3, squash: 0.95 })), M(0, 0.05, 0), 0, 1, 10 + ACC.dress);
  P(S.prism(12, 0.33, 0.33, 0.06), M(0, 0.05, 0), 0, 0, 10 + ACC.dress, '#f3ede0');
  P(ball(1), M(0, 0.86, 0.14, 0.24, 0.13, 0.16, 0.15), 5, 0, 10 + ACC.mask, DARK);
  P(S.prism(7, 0.04, 0.034, 0.16), M(0.235, 0.28, 0.07, 1, 1, 1, 0.3), 4, 0, 10 + ACC.bottle, '#4f8a4a');
  P(S.prism(6, 0.014, 0.014, 0.07), M(0.235, 0.43, 0.12, 1, 1, 1, 0.3), 4, 0, 10 + ACC.bottle, '#3a2a22');
  P(S.prism(10, 0.04, 0.04, 0.01), M(0.088, 0.985, 0.25, 1, 1, 1, Math.PI / 2), 5, 0, 10 + ACC.monocle, BRASS);
  P(S.prism(6, 0.015, 0.014, 0.12), M(0.06, 0.85, 0.24, 1, 1, 1, Math.PI / 2 - 0.2, 0.3), 5, 0, 10 + ACC.cigar, '#6e452d');
  P(S.block(0.2, 0.08, 0.03, { cut: 0.015, taper: 0.5 }), M(0, 0.62, 0.15, 1, 1, 1, -0.2), 0, 0, 10 + ACC.scarf, '#b5483a');
  P(S.prism(9, 0.18, 0.18, 0.045, { squash: 0.86 }), M(0, 0.33, 0), 0, 0, 10 + ACC.gunbelt, '#5a3a26');
  P(S.block(0.06, 0.15, 0.06, { cut: 0.015, taper: 0.1 }), M(0.17, 0.22, 0.03), 0, 0, 10 + ACC.gunbelt, '#5a3a26');
  P(S.block(0.03, 0.08, 0.04, { cut: 0.01, taper: 0 }), M(0.17, 0.34, 0.03), 0, 0, 10 + ACC.gunbelt, '#3a3a42');
  starGeo(P, M(-0.02, 0.55, 0.16, 0.17, 0.17, 1), 0, 10 + ACC.bigbadge, BRASS);
  P(S.block(0.035, 0.05, 0.16, { cut: 0.01, taper: 0 }), M(0.225, 0.33, 0.1), 4, 0, 10 + ACC.pistol, '#3a3a42');
  P(S.block(0.03, 0.08, 0.04, { cut: 0.01, taper: 0 }), M(0.225, 0.29, 0.04, 1, 1, 1, 0.3), 4, 0, 10 + ACC.pistol, '#6e452d');
  P(S.prism(6, 0.06, 0.07, 0.14), M(-0.225, 0.21, 0.04), 3, 0, 10 + ACC.lantern, '#ffc978', 1.2);
  P(S.prism(6, 0.07, 0.03, 0.05), M(-0.225, 0.35, 0.04), 3, 0, 10 + ACC.lantern, '#3a3a42');
  P(S.prism(8, 0.025, 0.025, 0.36), M(0.225, 0.35, -0.1, 1, 1, 1, Math.PI / 2), 4, 0, 10 + ACC.rollingpin, '#d9b07a');
  P(S.block(0.03, 0.03, 0.18, { cut: 0.005, taper: 0 }), M(0.225, 0.34, 0.1), 4, 0, 10 + ACC.pliers, '#9aa4b0');
  for (const sx of [-1, 1]) P(S.prism(7, 0.074, 0.074, 0.025), M(sx * 0.205, 0.53, 0, 1, 1, 1, 0, 0, -sx * 0.1), sx < 0 ? 3 : 4, 0, 10 + ACC.garters, '#b5483a');
  P(S.prism(6, 0.02, 0.02, 0.26), M(0.225, 0.35, -0.04, 1, 1, 1, Math.PI / 2), 4, 0, 10 + ACC.hammer, '#9a6c48');
  P(S.block(0.05, 0.05, 0.1, { cut: 0.01, taper: 0 }), M(0.225, 0.36, 0.17), 4, 0, 10 + ACC.hammer, '#5b5f66');
  for (let i = 0; i < 4; i++) P(ball(0), M(0, 0.62 - i * 0.07, 0.15, 0.014), 0, 0, 10 + ACC.longjohns, '#f3ede0');
  // carried cup (limb 6, shown in the carry clip)
  P(S.prism(7, 0.07, 0.085, 0.18), M(0, 0.47, 0.27), 6, 0, -1, '#fff6dc');
  P(S.prism(7, 0.07, 0.07, 0.02), M(0, 0.62, 0.27), 6, 0, -1, '#f4d64a');
  // hats 50+n, sat on the head (limb 8 follows the head and scales about the seat)
  P(hatLatheEncoded(0, 9), null, 8, 5, 90, '#ffffff');
  P(hatLatheEncoded(20, 23), null, 8, 6, 91, '#ffffff');
  HAT_TYPES.forEach((_, t) => {
    for (const p of hatParts(t)) {
      const slot = p.kind === 'felt' ? 5 : p.kind === 'band' ? 6 : 0;
      P(p.geo, M(0, HAT_SEAT, 0), 8, slot, 50 + t, slot ? '#ffffff' : p.kind);
    }
  });
  const pos = [], col = [], nor = [], part = [];
  for (const p of parts) {
    if (!p.geo.attributes.normal) p.geo.computeVertexNormals();
    const A = p.geo.attributes;
    for (let i = 0; i < A.position.count; i++) {
      pos.push(A.position.getX(i), A.position.getY(i), A.position.getZ(i));
      nor.push(A.normal.getX(i), A.normal.getY(i), A.normal.getZ(i));
      const g = p.glow;
      col.push(A.color.getX(i) * (1 + g), A.color.getY(i) * (1 + g), A.color.getZ(i) * (1 + g));
      part.push(p.limb, p.slot, p.style);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(part, 3));
  baseGeo = g;
  return g;
}
function starGeo(P, m, limb, style, col) {
  const pts = [];
  for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 0.45 : 1; pts.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r)); }
  let g = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: 0.25, bevelEnabled: false });
  if (g.index) g = g.toNonIndexed();
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  g.scale(1, 1, 0.08);
  P(g, m, limb, 0, style, col);
}

const lin = (hex) => new THREE.Color(hex);

export function crowdMaterial(shared) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0, envMapIntensity: 0.25 });
  const skins = SKIN.map(lin), hairs = HAIR.map(lin);
  m.userData.hair = hairs;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = shared.uTime;
    sh.uniforms.uRim = shared.uRimCrowd;
    sh.uniforms.uSkin = { value: skins };
    sh.uniforms.uHair = { value: hairs };
    sh.uniforms.uHatP = { value: HAT_P.flatMap((t) => t.map((v) => new THREE.Vector4(...v))) };
    for (const k of ['uBounce', 'uLamps', 'uLampCol', 'uLampK']) sh.uniforms[k] = shared[k];
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec3 aPart;
attribute vec3 aAnim;
attribute vec3 aTop;
attribute vec3 aBot;
attribute vec4 aLook;
attribute vec3 aBody;
attribute vec4 aHat;
uniform float uTime;
varying float vSkin;
varying vec3 vWP;
varying vec3 vWN;
uniform vec3 uSkin[${SKIN.length}];
uniform vec3 uHair[${HAIR.length}];
mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
mat3 rotZ(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }
float isClip(float c, float n) { return 1.0 - step(0.5, abs(c - n)); }
uniform vec4 uHatP[${HAT_P.length * 3}];
vec2 hatProf(float k, vec4 p0, vec4 p1) {
  float cr = p0.x, h = p0.y, R = p0.z, base = p1.w, th = 0.035, tf = p1.x * p1.z;
  if (k > 19.5) {
    float y0 = base - 0.01, bh = 0.055;
    if (k < 20.5) return vec2(cr * 1.035, y0);
    if (k < 21.5) return vec2(cr * 1.045, y0 + bh);
    if (k < 22.5) return vec2(cr * 0.9, y0 + bh);
    return vec2(cr * 0.9, y0);
  }
  if (k < 0.5) return vec2(0.0, 0.0);
  if (k < 1.5) return vec2(R * 0.97, 0.0);
  if (k < 2.5) return vec2(R, th * 0.5);
  if (k < 3.5) return vec2(R * 0.97, th);
  if (k < 4.5) return vec2(cr, th * 1.3);
  if (k < 5.5) return vec2(cr * 1.02, base);
  if (k < 6.5) return vec2(cr, base + h * 0.2);
  if (k < 7.5) return vec2(cr * tf, base + h * (1.0 - p1.y * 0.3));
  if (k < 8.5) return vec2(cr * tf * 0.82, base + h);
  return vec2(0.0, base + h * 0.98);
}
float bitOn(float mask, float n) { return mod(floor(mask / exp2(n) + 0.001), 2.0); }
vec3 unpackRGB(float f) { float r = floor(f / 65536.0); float g = floor((f - r * 65536.0) / 256.0); float b = f - r * 65536.0 - g * 256.0; return pow(vec3(r, g, b) / 255.0, vec3(2.2)); }`)
      .replace('#include <beginnormal_vertex>', `
float limb = aPart.x;
float clip = aAnim.x;
float t = uTime * aAnim.z + aAnim.y;
float sw = sin(t);
float isCarry = isClip(clip, 2.0), isWork = isClip(clip, 3.0), isCheer = isClip(clip, 4.0), isSip = isClip(clip, 6.0), isSweep = isClip(clip, 7.0);
float isFlail = isClip(clip, 8.0), isSlump = isClip(clip, 9.0), isDuel = isClip(clip, 10.0), isDraw = isClip(clip, 11.0), isPoint = isClip(clip, 12.0);
float isPiano = isClip(clip, 13.0), isStag = isClip(clip, 14.0), isHammer = isClip(clip, 15.0), isDizzy = isClip(clip, 16.0), isTip = isClip(clip, 17.0);
float isSprawl = isClip(clip, 18.0), isUp = isClip(clip, 19.0), isCan = isClip(clip, 20.0), isPunch = isClip(clip, 21.0);
float isSit = isClip(clip, 5.0) + isPiano;
float isWalk = isClip(clip, 1.0) + isCarry;
float walkK = isWalk + isStag * 0.6;
float vis = 1.0;
float st = aPart.z;
vec3 hatP = vec3(0.0), hatN = vec3(0.0, 1.0, 0.0);
if (st > 89.5) {
  int ti = int(max(0.0, aHat.x) + 0.5) * 3;
  vec4 p0 = uHatP[ti], p1 = uHatP[ti + 1], p2 = uHatP[ti + 2];
  vis = aHat.x > -0.5 ? p0.w : 0.0;
  float k = position.y, c = position.x, sn = position.z;
  vec2 pr = hatProf(k, p0, p1);
  float kmin = k > 19.5 ? 20.0 : 0.0, kmax = k > 19.5 ? 23.0 : 9.0;
  vec2 pa = hatProf(max(kmin, k - 1.0), p0, p1), pb = hatProf(min(kmax, k + 1.0), p0, p1);
  float nr = pb.y - pa.y, ny = -(pb.x - pa.x);
  if (k < 0.5) { nr = 0.0; ny = -1.0; }
  if (k > 8.5 && k < 9.5) { nr = 0.0; ny = 1.0; }
  float L = max(1e-4, length(vec2(nr, ny)));
  float r = pr.x, hy = pr.y, hx = r * c, hz = r * sn;
  if (k > 0.5 && k < 3.5 && p0.z > p0.x) { float tt = pow(min(1.0, (r - p0.x) / (p0.z - p0.x)), 1.5); hy += p2.x * tt * c * c - p2.y * tt * sn * sn; }
  float top = p1.w + p0.y;
  if (p2.z > 0.0 && k > 6.5 && k < 19.5) hy -= p2.z * exp(-pow(hx / (p0.x * 0.45), 2.0)) * max(0.0, (hy - top * 0.7) / (top * 0.3));
  float ct = cos(p2.w), stl = sin(p2.w);
  hatP = vec3(hx, hy * ct - hz * stl, hy * stl + hz * ct);
  vec3 nn = vec3(nr / L * c, ny / L, nr / L * sn);
  hatN = vec3(nn.x, nn.y * ct - nn.z * stl, nn.y * stl + nn.z * ct);
}
else if (st > 49.5) vis = float(abs(st - 50.0 - aHat.x) < 0.1);
else if (st > 29.5) vis = float(abs(st - 30.0 - aHat.w) < 0.1);
else if (st > 9.5) vis = bitOn(aLook.w, st - 10.0);
else if (st > -0.5) vis = float(abs(st - aLook.z) < 0.1);
if (limb > 5.5 && limb < 6.5) vis *= isCarry;
float headK = aBody.x, legK = aBody.y, girth = aBody.z;
vec3 piv = vec3(0.0);
float ang = 0.0, angZ = 0.0;
if (limb > 0.5 && limb < 2.5) {
  float sd = limb < 1.5 ? 1.0 : -1.0;
  piv = vec3(0.0, 0.4, 0.0);
  ang = sd * sw * 0.6 * walkK - 1.45 * isSit + isFlail * sd * sin(t * 1.7) * 0.9 - isCan * 1.6 * max(0.0, sin(t * 1.4 + sd * 1.5708));
  angZ = isSprawl * sd * 0.35 + isFlail * sd * 0.25;
} else if (limb > 2.5 && limb < 4.5) {
  float sd = limb < 3.5 ? 1.0 : -1.0;
  float right = limb > 3.5 ? 1.0 : 0.0;
  piv = vec3(sd * -(0.18 + (girth - 1.0) * 0.17), 0.68, 0.0);
  ang = -sd * sw * 0.55 * isWalk * (1.0 - isCarry) - isStag * sd * sw * 0.3;
  ang += -1.25 * isCarry;
  ang += isWork * mix(-0.55 + 0.15 * sw, -1.0 + 0.55 * sin(t * 2.0), right);
  ang += isSweep * (-0.7 + 0.35 * sin(t * 1.6) * sd);
  ang += isCheer * -(2.7 + 0.25 * sin(t * 2.0 + sd));
  ang += isSit * -0.35 * (1.0 - isPiano);
  ang += isSip * right * (-1.9 + 0.15 * sw) + isSip * (1.0 - right) * -0.2;
  ang += isFlail * (-1.6 + 1.5 * sin(t * 2.2 + sd * 1.5));
  ang += isSlump * 0.18;
  ang += isDuel * (0.12 + right * 0.05 * sin(t * 3.0));
  ang += isDraw * mix(0.1, -1.52, right);
  ang += isPoint * mix(0.25, -1.85, right);
  ang += isPiano * (-1.15 + 0.14 * sin(t * 2.0 + sd * 1.6));
  ang += isHammer * mix(-0.6, -2.3 + 1.5 * max(0.0, sin(t * 1.6)), right);
  ang += isDizzy * 0.1;
  ang += isTip * right * -2.75;
  ang += isUp * (-2.95 + 0.06 * sin(t * 6.0 + sd));
  ang += isCan * 0.25;
  ang += isPunch * (-1.45 + 0.85 * max(0.0, sin(t * 1.8 + right * 3.1416)));
  angZ = isCheer * sd * 0.35 - isFlail * sd * 0.45 - isDuel * sd * mix(0.18, 0.4, right) - isPoint * (1.0 - right) * sd * 0.9;
  angZ += -isStag * sd * 0.5 - isDizzy * sd * 0.35 * (0.6 + 0.4 * sin(t)) - isSprawl * sd * 1.35 - isCan * sd * 0.9 + isTip * right * 0.3 + isUp * sd * 0.15;
} else if ((limb > 4.5 && limb < 5.5) || limb > 7.5) {
  piv = vec3(0.0, 0.74, 0.0);
  ang = 0.08 * sin(t * 0.5) * (1.0 - isWalk) + isWork * 0.18 + isSlump * 0.45 + isFlail * 0.3 * sin(t * 2.0) - isDuel * 0.06 + isPiano * 0.1 * sin(t * 2.0) + isDizzy * 0.15 * cos(t * 1.3) + isStag * 0.12;
  angZ = 0.06 * sin(t * 0.37) + isDizzy * 0.22 * sin(t * 1.3) + isStag * 0.15 * sin(t * 0.7);
}
float lean = isSlump * 0.32 + isPunch * 0.12 + isPiano * 0.12 + isHammer * 0.15 * max(0.0, sin(t * 1.6));
float roll = isStag * 0.14 * sin(t * 0.9) + isDizzy * 0.1 * sin(t * 1.3) + isFlail * 0.2 * sin(t * 1.3);
mat3 R = rotX(ang) * rotZ(angZ);
mat3 RB = rotX(lean) * rotZ(roll);
float upper = (limb > 0.5 && limb < 2.5) ? 0.0 : 1.0;
vec3 objectNormal = R * (st > 89.5 ? hatN : vec3(normal));
if (upper > 0.5) objectNormal = RB * objectNormal;
#ifdef USE_TANGENT
vec3 objectTangent = vec3(tangent.xyz);
#endif`)
      .replace('#include <begin_vertex>', `vec3 transformed = st > 89.5 ? hatP + vec3(0.0, ${HAT_SEAT.toFixed(3)}, 0.0) : vec3(position);
if (limb > 7.5) transformed = (transformed - vec3(0.0, ${HAT_SEAT.toFixed(3)}, 0.0)) * aHat.y + vec3(0.0, ${HAT_SEAT.toFixed(3)}, 0.0);
if (limb < 0.5 || (limb > 6.5 && limb < 7.5)) transformed.xz *= girth;
if (limb > 2.5 && limb < 4.5) transformed.x += sign(transformed.x) * (girth - 1.0) * 0.17;
if (limb > 0.5 && limb < 2.5) transformed.x *= 1.0 + (girth - 1.0) * 0.6;
transformed = R * (transformed - piv) + piv;
if ((limb > 4.5 && limb < 5.5) || limb > 7.5) transformed = (transformed - vec3(0.0, 0.76, 0.0)) * headK + vec3(0.0, 0.76, 0.0);
if (upper > 0.5) transformed = RB * (transformed - vec3(0.0, 0.4, 0.0)) + vec3(0.0, 0.4, 0.0);
if (transformed.y > 0.4 || limb > 2.5) transformed.y += 0.4 * (legK - 1.0);
else transformed.y *= legK;
float bob = abs(sw) * 0.045 * isWalk + max(0.0, sin(t * 2.0)) * 0.13 * isCheer + abs(sin(t * 2.0)) * 0.02 * isWork + 0.012 * sin(t * 0.8) * (1.0 - isWalk) + isCan * 0.06 * abs(sin(t * 1.4)) + isUp * 0.02 * sin(t * 6.0);
transformed.y += bob - 0.22 * isSit * legK;
transformed.z += 0.12 * isSit;
transformed *= vis;`)
      .replace('#include <color_vertex>', `vColor = vec3(1.0);
float slot = aPart.y;
if (slot < 0.5) vColor = color;
else if (slot < 1.5) vColor = aTop;
else if (slot < 2.5) vColor = aBot;
else if (slot < 3.5) vColor = uSkin[int(aLook.x + 0.5)];
else if (slot < 4.5) vColor = uHair[int(aLook.y + 0.5)];
else if (slot < 6.5) vColor = unpackRGB(aHat.z) * (slot < 5.5 ? 1.0 : 0.45);
else vColor = uSkin[int(aLook.x + 0.5)] * vec3(1.03, 0.8, 0.76);
vSkin = float(abs(slot - 3.0) < 0.5 || slot > 6.5);`)
      .replace('#include <project_vertex>', WORLD_POS_VERT);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uRim;\nvarying float vSkin;\nvarying vec3 vWP;\nvarying vec3 vWN;\n' + WORLD_LIGHT_HEAD)
      .replace('#include <opaque_fragment>', `{
  float nv = saturate(dot(geometryNormal, geometryViewDir));
  float fr = pow(1.0 - nv, 2.2);
  outgoingLight += uRim * fr * (0.55 + 0.6 * diffuseColor.rgb);
  outgoingLight += vSkin * diffuseColor.rgb * vec3(0.16, 0.07, 0.04) * (0.6 + 0.4 * nv);
  outgoingLight += diffuseColor.rgb * max(0.0, max(diffuseColor.r, diffuseColor.g) - 1.05) * 0.8;
}
${WORLD_LIGHT_FRAG}
#include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'iw2-crowd4';
  return m;
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1),
  _y = new THREE.Vector3(0, 1, 0), _c = new THREE.Color(), _bm = new THREE.Matrix4(), _e = new THREE.Euler();
let blobGeo = null;
const packRGB = (hex) => { _c.set(hex); const r = Math.round(_c.r * 255), g = Math.round(_c.g * 255), b = Math.round(_c.b * 255); return r * 65536 + g * 256 + b; };
export function accMask(acc) {
  if (acc == null || acc === -1) return 0;
  if (Array.isArray(acc)) return acc.reduce((m, a) => m + (2 ** (typeof a === 'string' ? ACC[a] : a)), 0);
  if (typeof acc === 'string') return 2 ** ACC[acc];
  if (typeof acc === 'object' && acc.mask != null) return acc.mask;
  return 2 ** acc;
}

export function createCrowd(materials, { count = 8, colors = OUTFITS, scale = 1.25, seed = 1, radius = 22, center = [0, 1, 0], blobs = true, hats = true } = {}) {
  const base = rigGeometry();
  if (!materials.crowd) materials.crowd = crowdMaterial(materials.shared);
  const geo = new THREE.BufferGeometry();
  for (const k of ['position', 'normal', 'color', 'aPart']) geo.setAttribute(k, base.attributes[k]);
  const mk = (n) => new THREE.InstancedBufferAttribute(new Float32Array(count * n), n);
  const anim = mk(3), top = mk(3), bot = mk(3), look = mk(4), body = mk(3), hat = mk(4);
  geo.setAttribute('aAnim', anim);
  geo.setAttribute('aTop', top);
  geo.setAttribute('aBot', bot);
  geo.setAttribute('aLook', look);
  geo.setAttribute('aBody', body);
  geo.setAttribute('aHat', hat);
  const mesh = new THREE.InstancedMesh(geo, materials.crowd, count);
  mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(...center), radius);
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  let r = seed * 9301 + 49297;
  const rnd = () => { r = (r * 9301 + 49297) % 233280; return r / 233280; };
  const scales = new Float32Array(count).fill(1);
  const TOWN_HATS = [[HAT.stetson, 1, 'tan'], [HAT.stetson, 1.2, 'brown'], [HAT.bowler, 1, 'black'], [HAT.derby, 1, 'brown'], [HAT.ten, 0.9, 'cream'], [HAT.boater, 1, 'straw'], [HAT.flat, 1, 'dark'], [HAT.stetson, 1.35, 'grey'], [HAT.cap, 1, 'brown'], [HAT.bonnet, 1, 'white']];
  const staches = [-1, -1, 0, 1, 2, 3, 4, -1];
  for (let i = 0; i < count; i++) {
    _c.set(colors[i % colors.length]); top.setXYZ(i, _c.r, _c.g, _c.b);
    _c.set(PANTS[Math.floor(rnd() * PANTS.length)]); bot.setXYZ(i, _c.r, _c.g, _c.b);
    look.setXYZ(i, Math.floor(rnd() * 5), Math.floor(rnd() * HAIR.length), Math.floor(rnd() * STYLES));
    look.setW(i, rnd() < 0.3 ? 2 ** ACC.vest : rnd() < 0.2 ? 2 ** ACC.scarf : 0);
    body.setXYZ(i, 1.24, 0.95, 1);
    const h = hats ? TOWN_HATS[Math.floor(rnd() * TOWN_HATS.length)] : null;
    hat.setXYZW(i, h ? h[0] : -1, h ? h[1] * (0.9 + rnd() * 0.25) : 1, packRGB(HAT_COLORS[h ? h[2] : 'tan']), staches[Math.floor(rnd() * staches.length)]);
    anim.setXYZ(i, 0, rnd() * 6.28, 3.6 + rnd() * 1.6);
    scales[i] = 0.93 + rnd() * 0.14;
    mesh.setMatrixAt(i, _m.makeScale(0, 0, 0));
  }
  let blobMesh = null;
  if (blobs) {
    blobGeo ||= new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    blobMesh = new THREE.InstancedMesh(blobGeo, materials.basicBlob, count);
    blobMesh.boundingSphere = mesh.boundingSphere;
    blobMesh.renderOrder = 1;
    for (let i = 0; i < count; i++) blobMesh.setMatrixAt(i, _m.makeScale(0, 0, 0));
    mesh.add(blobMesh);
  }
  const api = {
    mesh, blobMesh, count,
    set(i, x, y, z, heading = 0, clip = 0, phase, speed) {
      _q.setFromAxisAngle(_y, heading);
      _m.compose(_p.set(x, y, z), _q, _s.setScalar(scale * CROWD_K * scales[i]));
      mesh.setMatrixAt(i, _m);
      if (blobMesh) {
        const k = scale * CROWD_K * scales[i] * (clip === CLIP.sit ? 0.3 : 0.56) * Math.max(0.3, 1 - Math.max(0, y - 0.1) / 5);
        _bm.makeScale(k, 1, k * 0.85).setPosition(x, Math.min(y, 0.02) + 0.09, z);
        blobMesh.setMatrixAt(i, _bm);
      }
      anim.setX(i, clip);
      if (phase !== undefined) anim.setY(i, phase);
      if (speed !== undefined) anim.setZ(i, speed);
      return api;
    },
    // Full pose: o = { x, y, z, heading, pitch, roll, clip, phase, speed, s (extra scale), ground (blob y) }.
    // pitch/roll pivot about the body centre so a thrown body tumbles in place.
    place(i, o) {
      const S0 = scale * CROWD_K * scales[i] * (o.s ?? 1), c = 0.62 * S0;
      _e.set(o.pitch || 0, o.heading || 0, o.roll || 0, 'YXZ');
      _q.setFromEuler(_e);
      _p.set(0, -c, 0).applyQuaternion(_q);
      _p.x += o.x; _p.y += (o.y || 0) + c; _p.z += o.z;
      _m.compose(_p, _q, _s.setScalar(S0));
      mesh.setMatrixAt(i, _m);
      if (blobMesh) {
        const air = Math.max(0, (o.y || 0) - 0.05), k = S0 * 0.56 * Math.max(0.25, 1 - air / 6) * (Math.abs(o.pitch || 0) > 1 ? 1.4 : 1);
        _bm.makeScale(k, 1, k * 0.85).setPosition(o.x, (o.ground ?? 0) + 0.09, o.z);
        blobMesh.setMatrixAt(i, _bm);
      }
      if (o.clip != null) anim.setX(i, o.clip);
      if (o.phase !== undefined) anim.setY(i, o.phase);
      if (o.speed !== undefined) anim.setZ(i, o.speed);
      return api;
    },
    hide(i) {
      _m.makeScale(0, 0, 0);
      mesh.setMatrixAt(i, _m);
      blobMesh?.setMatrixAt(i, _m);
      return api;
    },
    // Colours/looks. acc: index, name, array of names/indices, or { mask }. stache: STACHE name/index (-1 none).
    look(i, { top: t, bot: b, skin, hair, style, acc, stache, hat: h, hatScale, hatColor } = {}) {
      if (t != null) { _c.set(t); top.setXYZ(i, _c.r, _c.g, _c.b); }
      if (b != null) { _c.set(b); bot.setXYZ(i, _c.r, _c.g, _c.b); }
      if (skin != null) look.setX(i, skin);
      if (hair != null) look.setY(i, hair);
      if (style != null) look.setZ(i, style);
      if (acc !== undefined) look.setW(i, accMask(acc));
      if (stache !== undefined) hat.setW(i, typeof stache === 'string' ? STACHE[stache] : stache ?? -1);
      if (h !== undefined) hat.setX(i, h == null || h === -1 ? -1 : typeof h === 'string' ? HAT[h] : h);
      if (hatScale != null) hat.setY(i, hatScale);
      if (hatColor != null) hat.setZ(i, packRGB(HAT_COLORS[hatColor] || hatColor));
      top.needsUpdate = bot.needsUpdate = look.needsUpdate = hat.needsUpdate = true;
      return api;
    },
    hat(i, type, s = 1, color = null) { return api.look(i, { hat: type, hatScale: s, ...(color ? { hatColor: color } : {}) }); },
    // headK (head size), legK (leg length), s (overall scale), girth (torso width; Mabel ≈ 1.6).
    body(i, headK = 1, legK = 1, s = null, girth = null) {
      body.setXY(i, headK, legK);
      if (girth != null) body.setZ(i, girth);
      body.needsUpdate = true;
      if (s != null) scales[i] = s;
      return api;
    },
    // Dress instance i as a named character (CHARACTERS key) — colours, hat, moustache, accessories, body.
    dress(i, name) {
      const c = CHARACTERS[name];
      if (!c) return api;
      api.look(i, { top: c.top, bot: c.bot, skin: c.skin, hair: c.hair, style: c.style, acc: c.acc || [], stache: c.stache ?? -1, hat: c.hat ?? -1, hatScale: c.hatScale ?? 1, hatColor: c.hatColor || 'tan' });
      api.body(i, c.head ?? 1.24, c.legs ?? 0.95, c.s ?? 1.15, c.girth ?? 1);
      return api;
    },
    // World position of instance i's head top (bubbles, stars) for a standing pose.
    headTop(i, out = []) {
      mesh.getMatrixAt(i, _m);
      _p.set(0, 1.25 + 0.4 * (body.getY(i) - 1), 0).applyMatrix4(_m);
      out[0] = _p.x; out[1] = _p.y; out[2] = _p.z;
      return out;
    },
    commit() {
      mesh.instanceMatrix.needsUpdate = true;
      anim.needsUpdate = true;
      if (blobMesh) blobMesh.instanceMatrix.needsUpdate = true;
    },
  };
  return api;
}

// Named cast (DESIGN W5 characters). s = body scale (named read ≥ 1.15× the crowd), girth = torso width, head/legs =
// headK/legK. Avoid ethnic caricature: no sombrero-and-moustache bandits; the Stranger is a Leone duster, not a poncho.
export const CHARACTERS = {
  mabel: { top: '#b5483a', bot: '#6e452d', skin: 1, hair: 5, style: 2, acc: ['apron', 'garters'], stache: -1, hat: HAT.bowler, hatScale: 0.42, hatColor: 'dark', s: 1.7, girth: 1.65, head: 1.2, legs: 0.9 },
  wendell: { top: '#c9b08a', bot: '#4a5878', skin: 3, hair: 2, style: 0, acc: ['bigbadge', 'gunbelt', 'scarf'], stache: 'walrus', hat: HAT.ten, hatScale: 1.25, hatColor: 'sand', s: 1.15 },
  mortimer: { top: '#2b2230', bot: '#2b2230', skin: 5, hair: 4, style: 0, acc: ['tails'], stache: 'pencil', hat: HAT.stovepipe, hatScale: 1.15, hatColor: 'black', s: 1.2, girth: 0.78, legs: 1.35, head: 1.18 },
  lulu: { top: '#c98b7e', bot: '#7a4f5a', skin: 5, hair: 5, style: 3, acc: ['dress'], stache: -1, hat: HAT.feathered, hatScale: 1.3, hatColor: 'red', s: 1.15 },
  pickles: { top: '#8a6a52', bot: '#5b5f66', skin: 2, hair: 7, style: 1, acc: ['bottle', 'longjohns'], stache: 'chops', hat: HAT.droopy, hatScale: 1.05, hatColor: 'brown', s: 1.1 },
  pomfrey: { top: '#6b3f86', bot: '#2b2230', skin: 0, hair: 6, style: 0, acc: ['tails', 'monocle', 'vest'], stache: 'handlebar', hat: HAT.stovepipe, hatScale: 2.2, hatColor: 'purple', s: 1.2, girth: 1.15 },
  stranger: { top: '#7a6a5a', bot: '#4a5878', skin: 1, hair: 1, style: 0, acc: ['duster', 'cigar', 'gunbelt'], stache: -1, hat: HAT.flat, hatScale: 1.05, hatColor: 'dark', s: 1.15, legs: 1.05 },
  mulligan1: { top: '#d9a441', bot: '#3f6b74', skin: 3, hair: 9, style: 0, acc: ['overalls', 'hammer'], stache: 'beard', hat: HAT.cap, hatScale: 1, hatColor: 'brown', s: 1.1, girth: 1.2 },
  mulligan2: { top: '#b5483a', bot: '#3f6b74', skin: 3, hair: 9, style: 0, acc: ['overalls'], stache: 'beard', hat: HAT.derby, hatScale: 1, hatColor: 'brown', s: 1.0, girth: 1.0, legs: 0.85 },
  mulligan3: { top: '#8fa27a', bot: '#3f6b74', skin: 3, hair: 9, style: 0, acc: ['overalls', 'scarf'], stache: 'beard', hat: HAT.stetson, hatScale: 0.8, hatColor: 'brown', s: 1.25, girth: 0.9, legs: 1.2 },
  fingers: { top: '#e9e4da', bot: '#3c3a52', skin: 1, hair: 4, style: 2, acc: ['vest', 'garters'], stache: 'pencil', hat: HAT.bowler, hatScale: 0.9, hatColor: 'black', s: 1.1 },
  bart: { top: '#3c3a52', bot: '#2b2230', skin: 2, hair: 0, style: 0, acc: ['mask', 'gunbelt', 'duster'], stache: -1, hat: HAT.stetson, hatScale: 1.35, hatColor: 'black', s: 1.15 },
  nubbin: { top: '#5e8f8c', bot: '#8a6a52', skin: 0, hair: 2, style: 1, acc: ['scarf'], stache: -1, hat: HAT.cap, hatScale: 1.1, hatColor: 'grey', s: 0.85, head: 1.36, legs: 0.68 },
  pete: { top: '#f3ede0', bot: '#5b5f66', skin: 0, hair: 6, style: 0, acc: ['apron', 'pliers'], stache: 'handlebar', hat: -1, s: 1.1 },
  thrupp: { top: '#4a5878', bot: '#2b2230', skin: 5, hair: 7, style: 0, acc: ['vest', 'monocle'], stache: 'chops', hat: HAT.bowler, hatScale: 0.8, hatColor: 'black', s: 1.05, girth: 0.85 },
  hortense: { top: '#8fa27a', bot: '#6e452d', skin: 2, hair: 3, style: 3, acc: ['apron'], stache: -1, hat: HAT.stetson, hatScale: 1.1, hatColor: 'straw', s: 1.1 },
  wife: { top: '#8fa27a', bot: '#6b5a7d', skin: 1, hair: 3, style: 3, acc: ['dress', 'rollingpin'], stache: -1, hat: HAT.bonnet, hatScale: 1.05, hatColor: 'white', s: 1.1 },
  longjohns: { top: '#d9545e', bot: '#d9545e', skin: 0, hair: 7, style: 1, acc: ['longjohns'], stache: 'walrus', hat: -1, s: 1.05 },
  you: { top: '#5e8f8c', bot: '#4a5878', skin: 1, hair: 1, style: 0, acc: ['scarf', 'gunbelt'], stache: -1, hat: HAT.derby, hatScale: 1, hatColor: 'brown', s: 1.15 },
};
