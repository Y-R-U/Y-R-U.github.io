// Candy Land theme — small sweets built into Buckets: lollipops, cupcakes, gumdrops, candy canes,
// ice-cream cones, donuts, wrapped sweets, cotton-candy trees, marshmallows, chocolate bars.
// Every builder takes a Buckets `b` and a placement Matrix4 `M` (local Y up, facing +Z).
// Bucket keys: vc, gloss, frost, sugar, metal, candy (keeps uv), swirl (keeps uv + colour), cherry.
import * as THREE from 'three';
import { mat } from './util.js';

export const COLORS = {
  pink: 0xff7ab4, hotPink: 0xff4f9a, rose: 0xffb3d1, mint: 0x8fe3b8, lemon: 0xffe36e, sky: 0x8fd0ff,
  lilac: 0xc6a2ff, peach: 0xffb27a, cream: 0xfff1dc, white: 0xfffafc, choc: 0x5a2e1a, choc2: 0x7a4428,
  cone: 0xe0a45a, cone2: 0xc7843e, cherry: 0xe0204a, sponge: 0xf2c27a, stick: 0xfdf6f0, red: 0xe8304a,
  green: 0x3cc46a,
};
export const POP_COLS = [0xff4f9a, 0xffb02e, 0x4cc9f0, 0x7ae582, 0xb388ff, 0xff6b6b];
export const GUM_COLS = [0xff5c8a, 0xffc93c, 0x5ad1a0, 0x6aa8ff, 0xc77dff, 0xff8a3d, 0xff9ec7];
export const FROST_COLS = [0xffb3d1, 0xfff1dc, 0xc6e8ff, 0xd8c8ff, 0xb8f0d0, 0xffe0a8];
export const SPRINK = [0xff5c9a, 0xffd23f, 0x4cc9f0, 0x7ae582, 0xb388ff, 0xffffff];

const put = (b, key, geo, color, M, local, keepUv = false) => b.add(key, geo, color, local ? M.clone().multiply(local) : M, keepUv);

/** Re-map a geometry's uv: u *= ku, v *= kv (candy stripes spiral around tubes / cones). */
export function scaleUv(g, ku = 1, kv = 1) {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * ku, uv.getY(i) * kv);
  return g;
}

/** A pink/white candy-striped tube along `curve` (local space of M). */
export function candyTube(b, M, curve, radius, segs = 24, radial = 6, k = 12) {
  const g = new THREE.TubeGeometry(curve, segs, radius, radial, false);
  scaleUv(g, curve.getLength() * k, 1);
  put(b, 'candy', g, null, M, null, true);
}

/** Lollipop of height h, swirl disc radius r facing ±Z, colour c. Returns the disc centre (local). */
export function lollipop(b, M, h, r, c, opts = {}) {
  const seg = opts.lo ? 14 : 24;
  put(b, 'frost', new THREE.CylinderGeometry(r * 0.07, r * 0.08, h - r, 6), COLORS.stick, M, mat(0, (h - r) / 2, 0));
  const disc = new THREE.CylinderGeometry(r, r, r * 0.34, seg, 1);
  put(b, 'swirl', disc, c, M, mat(0, h, 0, Math.PI / 2, 0, 0), true);
  if (opts.bow !== false && !opts.lo) {
    for (const sx of [-1, 1]) put(b, 'gloss', new THREE.TorusGeometry(r * 0.16, r * 0.06, 4, 8), c, M, mat(sx * r * 0.16, h - r - r * 0.05, 0, 0, 0, sx * 0.6, [1, 0.6, 0.6]));
    put(b, 'gloss', new THREE.SphereGeometry(r * 0.07, 6, 4), c, M, mat(0, h - r - r * 0.04, 0));
  }
  return new THREE.Vector3(0, h, 0);
}

/** Fluted cupcake liner + swirled frosting + sprinkles + a cherry; total height ≈ h. */
export function cupcake(b, M, h, opts = {}) {
  const lo = !!opts.lo, rnd = opts.rnd || Math.random;
  const linerC = opts.liner ?? POP_COLS[(rnd() * POP_COLS.length) | 0];
  const frostC = opts.frost ?? FROST_COLS[(rnd() * FROST_COLS.length) | 0];
  const r0 = h * 0.3, r1 = h * 0.4, lh = h * 0.42;
  const seg = lo ? 10 : 16;
  const liner = new THREE.CylinderGeometry(r1, r0, lh, seg, 1, false);
  const p = liner.attributes.position;
  for (let i = 0; i < p.count; i++) {      // flutes
    const x = p.getX(i), z = p.getZ(i), a = Math.atan2(z, x), k = 1 + 0.06 * Math.cos(a * (seg / 2));
    p.setX(i, x * k); p.setZ(i, z * k);
  }
  liner.computeVertexNormals();
  put(b, 'gloss', liner, linerC, M, mat(0, lh / 2, 0));
  put(b, 'vc', new THREE.CylinderGeometry(r1 * 0.98, r1 * 0.98, h * 0.06, seg), COLORS.sponge, M, mat(0, lh + h * 0.02, 0));
  // frosting swirl: three stacked tori and a tip
  let y = lh + h * 0.08;
  const tiers = lo ? 2 : 3;
  for (let i = 0; i < tiers; i++) {
    const k = 1 - i / tiers, rr = r1 * (0.86 * k + 0.12), t = h * 0.1 * (0.7 + 0.5 * k);
    put(b, 'frost', new THREE.TorusGeometry(rr, t, lo ? 4 : 6, seg), frostC, M, mat(0, y, 0, Math.PI / 2, 0, i * 0.6));
    y += t * 1.25;
  }
  put(b, 'frost', new THREE.ConeGeometry(r1 * 0.32, h * 0.2, seg >> 1), frostC, M, mat(0, y + h * 0.04, 0));
  // sprinkles
  if (!lo) {
    for (let i = 0; i < 10; i++) {
      const a = rnd() * Math.PI * 2, rr = r1 * (0.3 + rnd() * 0.5), yy = lh + h * 0.12 + rnd() * h * 0.22;
      put(b, 'gloss', new THREE.BoxGeometry(h * 0.012, h * 0.012, h * 0.05), SPRINK[i % SPRINK.length], M, mat(Math.cos(a) * rr, yy, Math.sin(a) * rr, rnd() * 3, rnd() * 3, 0));
    }
  }
  // cherry
  const cy = y + h * 0.15;
  put(b, 'gloss', new THREE.SphereGeometry(h * 0.075, lo ? 8 : 12, lo ? 6 : 8), COLORS.cherry, M, mat(0, cy, 0));
  if (!lo) put(b, 'vc', new THREE.CylinderGeometry(h * 0.006, h * 0.008, h * 0.12, 4), 0x5a7a2a, M, mat(h * 0.02, cy + h * 0.1, 0, 0, 0, -0.35));
  return { height: cy + h * 0.08 };
}

/** A tiny gumdrop stud (a 30-triangle dome) for trims. */
export function gumStud(b, M, r, c, key = 'gloss') {
  put(b, key, new THREE.SphereGeometry(r, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2), c, M, mat(0, 0, 0, 0, 0, 0, [1, 1.1, 1]));
}

/** Gumdrop of radius r (a sugared dome, flat-ish top), colour c, sitting on y = 0. */
const gumLathe = new Map();
export function gumdrop(b, M, r, c, lo = false, key = 'sugar') {
  if (!gumLathe.has(lo ? 'lo' : 'hi')) {
    const N = lo ? 4 : 6;
    const pts = [new THREE.Vector2(0, 0)];
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI / 2;
      pts.push(new THREE.Vector2(Math.max(0.0001, Math.cos(a) * (1 - 0.12 * Math.sin(a * 2))), Math.sin(a) * 1.15));
    }
    gumLathe.set(lo ? 'lo' : 'hi', pts);
  }
  const g = new THREE.LatheGeometry(gumLathe.get(lo ? 'lo' : 'hi'), lo ? 8 : 12);
  put(b, key, g, c, M, mat(0, 0, 0, 0, 0, 0, r));
}

/** Candy cane of height h stuck in the ground, hook toward +X. */
const caneCurves = new Map();
export function candyCane(b, M, h, radius = h * 0.06, k = 12) {
  const key = h.toFixed(3);
  let curve = caneCurves.get(key);
  if (!curve) {
    const pts = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, h * 0.5, 0), new THREE.Vector3(0, h * 0.82, 0)];
    const hr = h * 0.17;
    for (let i = 1; i <= 6; i++) { const a = Math.PI - (i / 6) * Math.PI * 1.05; pts.push(new THREE.Vector3(hr + Math.cos(a) * hr, h * 0.82 + Math.sin(a) * hr, 0)); }
    curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    caneCurves.set(key, curve);
  }
  candyTube(b, M, curve, radius, 12, 6, k);
}

/** Ice-cream cone of height h: waffle cone, two scoops with a drip ring, a cherry. */
export function iceCream(b, M, h, opts = {}) {
  const rnd = opts.rnd || Math.random, lo = !!opts.lo;
  const seg = lo ? 8 : 12;
  const ch = h * 0.55, cr = h * 0.2;
  put(b, 'vc', new THREE.ConeGeometry(cr, ch, seg, 1, true), COLORS.cone, M, mat(0, ch / 2, 0, Math.PI, 0, 0));
  // waffle ribs: two rings
  for (const f of [0.45, 0.75]) put(b, 'vc', new THREE.TorusGeometry(cr * f * 1.02, h * 0.008, 3, seg), COLORS.cone2, M, mat(0, ch * f, 0, Math.PI / 2, 0, 0));
  const c1 = opts.c1 ?? FROST_COLS[(rnd() * FROST_COLS.length) | 0], c2 = opts.c2 ?? FROST_COLS[(rnd() * FROST_COLS.length) | 0];
  put(b, 'frost', new THREE.SphereGeometry(cr * 1.05, seg, seg >> 1), c1, M, mat(0, ch + cr * 0.4, 0));
  put(b, 'frost', new THREE.TorusGeometry(cr * 0.98, cr * 0.18, 5, seg), c1, M, mat(0, ch + cr * 0.05, 0, Math.PI / 2, 0, 0));
  put(b, 'frost', new THREE.SphereGeometry(cr * 0.9, seg, seg >> 1), c2, M, mat(0, ch + cr * 1.6, 0));
  put(b, 'gloss', new THREE.SphereGeometry(cr * 0.25, 8, 6), COLORS.cherry, M, mat(0, ch + cr * 2.55, 0));
  return { height: ch + cr * 2.8 };
}

/** Donut of outer radius R lying flat (opts.stand → standing on edge, facing +Z), pink icing + sprinkles. */
export function donut(b, M, R, opts = {}) {
  const lo = !!opts.lo, rnd = opts.rnd || Math.random;
  const tube = R * 0.38, rr = R - tube;
  const L = opts.stand ? mat(0, R, 0) : mat(0, tube, 0, Math.PI / 2, 0, 0);
  const Mx = M.clone().multiply(L);
  put(b, 'vc', new THREE.TorusGeometry(rr, tube, lo ? 6 : 10, lo ? 14 : 24), COLORS.cone, Mx, null);
  const icing = new THREE.TorusGeometry(rr, tube * 1.04, lo ? 6 : 10, lo ? 14 : 24);
  // keep only the front half (the "top" when lying flat: +Z in torus space)
  const p = icing.attributes.position;
  for (let i = 0; i < p.count; i++) if (p.getZ(i) < tube * 0.15) p.setZ(i, tube * 0.15 + (p.getZ(i) - tube * 0.15) * 0.0);
  icing.computeVertexNormals();
  put(b, 'frost', icing, opts.icing ?? COLORS.pink, Mx, mat(0, 0, 0.005));
  if (!lo) {
    for (let i = 0; i < 16; i++) {
      const a = rnd() * Math.PI * 2, d = rr + (rnd() - 0.5) * tube * 1.2;
      put(b, 'gloss', new THREE.BoxGeometry(R * 0.03, R * 0.03, R * 0.12), SPRINK[i % SPRINK.length], Mx, mat(Math.cos(a) * d, Math.sin(a) * d, tube * 1.05, 0, 0, rnd() * 3));
    }
  }
}

/** Wrapped sweet (round body + twisted wrapper ends along X), size s ≈ body diameter. */
export function wrappedSweet(b, M, s, c, c2 = 0xffffff) {
  put(b, 'gloss', new THREE.SphereGeometry(s * 0.5, 14, 10), c, M, mat(0, 0, 0, 0, 0, 0, [1.25, 1, 1]));
  // stripes on the wrapper body
  for (const x of [-0.25, 0, 0.25]) put(b, 'gloss', new THREE.TorusGeometry(s * 0.5 * Math.sqrt(1 - (x / 0.62) ** 2) * 1.01, s * 0.04, 4, 16), c2, M, mat(x * s * 1.25, 0, 0, 0, Math.PI / 2, 0));
  for (const sx of [-1, 1]) {
    put(b, 'gloss', new THREE.CylinderGeometry(s * 0.06, s * 0.1, s * 0.16, 8), c, M, mat(sx * s * 0.68, 0, 0, 0, 0, sx * Math.PI / 2));
    put(b, 'gloss', new THREE.ConeGeometry(s * 0.34, s * 0.34, 7, 1), c, M, mat(sx * s * 0.9, 0, 0, 0, 0, sx * Math.PI / 2));
  }
}

/** Cotton-candy tree: a striped stick with a fluffy pink or blue floss crown. Height h. */
export function cottonTree(b, M, h, c, rnd = Math.random, lo = false) {
  const stick = new THREE.CylinderGeometry(h * 0.025, h * 0.035, h * 0.6, 6, 1, true);
  scaleUv(stick, 1, 4);
  put(b, 'candy', stick, null, M, mat(0, h * 0.3, 0), true);
  const n = lo ? 3 : 4;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rnd(), d = i ? h * 0.13 : 0;
    put(b, 'sugar', new THREE.IcosahedronGeometry(h * (i ? 0.17 : 0.24), lo ? 0 : 1), c, M, mat(Math.cos(a) * d, h * (0.72 + (i ? 0.02 * rnd() : 0.08)), Math.sin(a) * d));
  }
}

/** Marshmallow (soft cylinder) of size s. */
export function marshmallow(b, M, s, c = COLORS.white) {
  put(b, 'frost', new THREE.CylinderGeometry(s * 0.5, s * 0.5, s * 0.8, 12), c, M, mat(0, s * 0.4, 0));
  put(b, 'frost', new THREE.TorusGeometry(s * 0.44, s * 0.06, 4, 12), c, M, mat(0, s * 0.8, 0, Math.PI / 2, 0, 0));
}

/** Chocolate bar w × h × d, sitting on y = 0, segmented on top; half wrapped in foil + a paper sleeve. */
export function chocolateBar(b, M, w, h, d, sleeve = COLORS.hotPink) {
  const base = h * 0.55;
  put(b, 'gloss', new THREE.BoxGeometry(w, base, d), COLORS.choc, M, mat(0, base / 2, 0));
  const nx = Math.max(2, Math.round(w / 0.08)), nz = Math.max(1, Math.round(d / 0.08));
  const cw = w / nx, cd = d / nz;
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const g = new THREE.CylinderGeometry(Math.SQRT1_2 * Math.min(cw, cd) * 0.82, Math.SQRT1_2 * Math.min(cw, cd) * 0.98, h - base, 4, 1);
    put(b, 'gloss', g, COLORS.choc2, M, mat(-w / 2 + cw * (i + 0.5), base + (h - base) / 2, -d / 2 + cd * (j + 0.5), 0, Math.PI / 4, 0, [cw / Math.min(cw, cd), 1, cd / Math.min(cw, cd)]));
  }
  // paper sleeve over the middle third, silver foil peeking out
  put(b, 'gloss', new THREE.BoxGeometry(w * 0.36, h * 1.08, d * 1.06), sleeve, M, mat(0, h * 0.54, 0));
  put(b, 'frost', new THREE.BoxGeometry(w * 0.36 + 0.002, h * 0.2, d * 1.08), COLORS.white, M, mat(0, h * 0.6, 0));
  for (const sx of [-1, 1]) put(b, 'metal', new THREE.BoxGeometry(w * 0.04, h * 1.03, d * 1.03), 0xd8d8e4, M, mat(sx * w * 0.2, h * 0.515, 0));
}
