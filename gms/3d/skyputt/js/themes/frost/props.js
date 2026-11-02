// Frost Fair theme — small props built into Buckets: decorated Christmas trees, snowmen, presents, candy
// canes, warm lanterns, wreaths, gingerbread houses, icicles. Every builder takes a Buckets `b` and a
// placement Matrix4 `M` (local Y up, facing +Z).
// Bucket keys: vc, gloss, metal, snow, candy (keeps uv), bulbA, bulbB, star, win, nose, ice.
import * as THREE from 'three';
import { mat } from './util.js';

export const COLORS = {
  pine: 0x1d5a36, pine2: 0x2a7044, snow: 0xe6eefc, trunk: 0x5a3a24, gold: 0xe8b84a, red: 0xc8202c,
  green: 0x1f8a46, coal: 0x16161c, carrot: 0xf07a1c, ginger: 0xa8642e, icing: 0xfbfbff, iron: 0x2a2e3a,
  hat: 0x1a1a22, white: 0xf4f4f0, ice: 0xbfe2ff,
};
export const BULB_COLS = [0xff5a4a, 0xffd36a, 0x7aff9a, 0x8ab8ff, 0xff8ae0];
export const ORN_COLS = [0xd8202c, 0xe8b84a, 0x2a6ad8, 0xc8c8d8, 0x1f9a4a, 0xd84aa0];

const put = (b, key, geo, color, M, local, keepUv = false) => b.add(key, geo, color, local ? M.clone().multiply(local) : M, keepUv);

/** Re-map a TubeGeometry's uv to u = metres × k along, v = 0..1 around (candy-cane helix stripes). */
export function candyUv(g, length, k = 12) {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * length * k);
  return g;
}

/** A candy-striped tube along `curve` (local space of M). */
export function candyTube(b, M, curve, radius, segs = 24, radial = 6, k = 12) {
  const g = new THREE.TubeGeometry(curve, segs, radius, radial, false);
  candyUv(g, curve.getLength(), k);
  put(b, 'candy', g, null, M, null, true);
}

/** Five-point star (extruded, thickness t), in the XY plane, radius s. */
function starGeo(s, t) {
  const sh = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? s * 0.45 : s;
    if (i) sh.lineTo(Math.cos(a) * r, Math.sin(a) * r); else sh.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const g = new THREE.ExtrudeGeometry(sh, { depth: t, bevelEnabled: false });
  g.translate(0, 0, -t / 2);
  return g;
}

/**
 * Decorated Christmas tree of height h standing on y = 0. opts: { detail = 1 (0 = backdrop), rnd, lights = true }
 * Returns world-ish glow points (in M's space → transformed) as Vector3[] (star first).
 */
export function christmasTree(b, M, h, opts = {}) {
  const detail = opts.detail ?? 1, rnd = opts.rnd || Math.random;
  const seg = detail ? 10 : 7;
  const tiers = 4, trunkH = h * 0.12, R = h * 0.36;
  put(b, 'vc', new THREE.CylinderGeometry(h * 0.035, h * 0.045, trunkH, 6), COLORS.trunk, M, mat(0, trunkH / 2, 0));
  const glows = [];
  let y = trunkH * 0.7;
  const tierH = (h - trunkH) / tiers * 1.35;
  for (let i = 0; i < tiers; i++) {
    const k = 1 - i / tiers;
    const r = R * (0.42 + 0.58 * k), th = tierH * (0.75 + 0.25 * k);
    put(b, 'vc', new THREE.ConeGeometry(r, th, seg), i % 2 ? COLORS.pine2 : COLORS.pine, M, mat(0, y + th / 2, 0, 0, i * 0.4, 0));
    // snow lying on the upper half of the tier
    put(b, 'snow', new THREE.ConeGeometry(r * 0.62, th * 0.5, seg), COLORS.snow, M, mat(0, y + th * 0.77, 0, 0, i * 0.4 + 0.2, 0));
    // ornaments and lights around the hem of the tier
    const nO = detail ? 3 + (i < 2 ? 2 : 0) : 0;
    for (let j = 0; j < nO; j++) {
      const a = (j / nO) * Math.PI * 2 + i * 1.3 + rnd() * 0.4;
      const rr = r * 0.78, oy = y + th * 0.18;
      put(b, 'gloss', new THREE.SphereGeometry(h * 0.034, 5, 3), ORN_COLS[(i * 3 + j) % ORN_COLS.length], M, mat(Math.cos(a) * rr, oy, Math.sin(a) * rr));
    }
    const nL = detail ? 6 + (i < 2 ? 2 : 0) : 3;
    for (let j = 0; j < nL; j++) {
      const a = (j / nL) * Math.PI * 2 + i * 0.7 + 0.3;
      const f = (j % 2) * 0.3 + 0.25;
      const rr = r * (1 - f) * 0.98, ly = y + th * f;
      const p = new THREE.Vector3(Math.cos(a) * rr, ly, Math.sin(a) * rr);
      put(b, j % 2 ? 'bulbA' : 'bulbB', new THREE.OctahedronGeometry(h * (detail ? 0.018 : 0.028), 0), BULB_COLS[(i + j) % BULB_COLS.length], M, mat(p.x, p.y, p.z));
      if (opts.lights !== false && (j % 3 === 0)) glows.push(p.applyMatrix4(M));
    }
    y += th * 0.55;
  }
  const top = y + tierH * 0.42;
  put(b, 'star', starGeo(h * 0.075, h * 0.025), null, M, mat(0, top + h * 0.06, 0));
  glows.unshift(new THREE.Vector3(0, top + h * 0.06, 0).applyMatrix4(M));
  return glows;
}

/** Simple snowy pine (no decorations), height h. */
export function snowyPine(b, M, h, seg = 7) {
  put(b, 'vc', new THREE.CylinderGeometry(h * 0.04, h * 0.05, h * 0.14, 5), COLORS.trunk, M, mat(0, h * 0.07, 0));
  let y = h * 0.1;
  for (let i = 0; i < 3; i++) {
    const k = 1 - i / 3, r = h * 0.3 * (0.45 + 0.55 * k), th = h * 0.42 * (0.75 + 0.25 * k);
    put(b, 'vc', new THREE.ConeGeometry(r, th, seg), COLORS.pine, M, mat(0, y + th / 2, 0, 0, i, 0));
    put(b, 'snow', new THREE.ConeGeometry(r * 0.66, th * 0.5, seg), COLORS.snow, M, mat(0, y + th * 0.76, 0, 0, i + 0.3, 0));
    y += th * 0.52;
  }
}

/** Snowman of height h (bottom ball radius ≈ 0.24 h), facing +Z. opts: { scarf, hat = true, detail = 1 } */
export function snowman(b, M, h, opts = {}) {
  const seg = (opts.detail ?? 1) ? 12 : 8;
  const r0 = h * 0.24, r1 = h * 0.18, r2 = h * 0.13;
  const y0 = r0 * 0.92, y1 = y0 + r0 * 0.8 + r1 * 0.8, y2 = y1 + r1 * 0.85 + r2 * 0.85;
  for (const [r, y] of [[r0, y0], [r1, y1], [r2, y2]]) put(b, 'snow', new THREE.SphereGeometry(r, seg, Math.round(seg * 0.6)), COLORS.snow, M, mat(0, y, 0));
  // coal eyes, mouth, buttons
  for (const sx of [-1, 1]) put(b, 'vc', new THREE.SphereGeometry(r2 * 0.13, 6, 4), COLORS.coal, M, mat(sx * r2 * 0.36, y2 + r2 * 0.25, r2 * 0.88));
  for (let i = -2; i <= 2; i++) {
    const a = i * 0.28;
    put(b, 'vc', new THREE.SphereGeometry(r2 * 0.07, 5, 3), COLORS.coal, M, mat(Math.sin(a) * r2 * 0.5, y2 - r2 * 0.3 + Math.abs(i) * r2 * 0.06, Math.cos(a) * r2 * 0.9));
  }
  for (let i = 0; i < 3; i++) put(b, 'vc', new THREE.SphereGeometry(r1 * 0.1, 6, 4), COLORS.coal, M, mat(0, y1 + r1 * (0.4 - i * 0.38), Math.sqrt(Math.max(0, 1 - (0.4 - i * 0.38) ** 2)) * r1 * 0.98));
  // carrot nose
  put(b, 'vc', new THREE.ConeGeometry(r2 * 0.14, r2 * 0.75, 6), COLORS.carrot, M, mat(0, y2, r2 * 1.2, Math.PI / 2, 0, 0));
  // top hat with a red band and holly
  if (opts.hat !== false) {
    const hy = y2 + r2 * 0.75;
    put(b, 'vc', new THREE.CylinderGeometry(r2 * 1.0, r2 * 1.0, r2 * 0.08, seg), COLORS.hat, M, mat(0, hy, 0, -0.08, 0, 0));
    put(b, 'vc', new THREE.CylinderGeometry(r2 * 0.66, r2 * 0.7, r2 * 0.9, seg), COLORS.hat, M, mat(0, hy + r2 * 0.45, -r2 * 0.03, -0.08, 0, 0));
    put(b, 'gloss', new THREE.CylinderGeometry(r2 * 0.715, r2 * 0.715, r2 * 0.18, seg), COLORS.red, M, mat(0, hy + r2 * 0.14, -r2 * 0.01, -0.08, 0, 0));
    for (const [x, c] of [[0.3, COLORS.green], [0.42, COLORS.red], [0.36, COLORS.red]]) put(b, 'gloss', new THREE.SphereGeometry(r2 * 0.09, 5, 4), c, M, mat(r2 * x, hy + r2 * 0.18, r2 * 0.6));
  }
  // red-and-white scarf
  if (opts.scarf !== false) {
    const sy = y1 + r1 * 0.72;
    put(b, 'gloss', new THREE.TorusGeometry(r1 * 0.72, r1 * 0.14, 6, seg), COLORS.red, M, mat(0, sy, 0, Math.PI / 2, 0, 0));
    put(b, 'gloss', new THREE.BoxGeometry(r1 * 0.26, r1 * 0.9, r1 * 0.08), COLORS.red, M, mat(r1 * 0.38, sy - r1 * 0.42, r1 * 0.7, -0.2, 0.3, 0.12));
    for (let i = 0; i < 2; i++) put(b, 'snow', new THREE.BoxGeometry(r1 * 0.27, r1 * 0.1, r1 * 0.09), COLORS.white, M, mat(r1 * 0.38 + i * 0.02, sy - r1 * (0.2 + i * 0.36), r1 * 0.72, -0.2, 0.3, 0.12));
  }
  // stick arms
  for (const sx of [-1, 1]) {
    const L = h * 0.32;
    put(b, 'vc', new THREE.CylinderGeometry(h * 0.008, h * 0.012, L, 4), COLORS.trunk, M, mat(sx * (r1 + L * 0.4), y1 + r1 * 0.3 + L * 0.2, 0, 0, 0, -sx * 1.0));
    put(b, 'vc', new THREE.CylinderGeometry(h * 0.006, h * 0.008, L * 0.3, 4), COLORS.trunk, M, mat(sx * (r1 + L * 0.72), y1 + r1 * 0.3 + L * 0.48, 0, 0, 0, -sx * 0.2));
  }
  return { headY: y2, height: y2 + r2 * 1.8 };
}

/** Gift box w × h × d on y = 0 with a crossed ribbon and a bow. */
export function present(b, M, w, h, d, color, ribbon = COLORS.gold, opts = {}) {
  put(b, 'gloss', new THREE.BoxGeometry(w, h, d), color, M, mat(0, h / 2, 0));
  const t = Math.min(w, d) * 0.16, e = Math.max(0.004, Math.min(w, d) * 0.02);
  put(b, 'gloss', new THREE.BoxGeometry(t, h + e, d + e), ribbon, M, mat(0, h / 2, 0));
  if (opts.bow === false) return;
  put(b, 'gloss', new THREE.BoxGeometry(w + e, h + e, t), ribbon, M, mat(0, h / 2, 0));
  const s = Math.min(w, d) * 0.22;
  for (const sx of [-1, 1]) put(b, 'gloss', new THREE.TorusGeometry(s, s * 0.32, 3, 7), ribbon, M, mat(sx * s * 0.85, h + s * 0.55, 0, 0, sx * 0.5, sx * 0.55));
  put(b, 'gloss', new THREE.OctahedronGeometry(s * 0.42, 0), ribbon, M, mat(0, h + s * 0.3, 0));
}

const GIFT = [[0xc8202c, 0xe8c25a], [0x1f8a46, 0xe8202c], [0x2a5ad0, 0xf4f4f4], [0xf0f0f4, 0xd8202c], [0xe8b84a, 0x1f7a3c], [0x8a3ac8, 0xe8c25a]];
/** A pile of 3–5 presents around the origin, size scale s (≈ biggest box edge). */
export function presentPile(b, M, s, rnd, n = 4, detail = 1) {
  const spots = [[0, 0, 1], [s * 0.85, s * 0.2, 0.7], [-s * 0.7, s * 0.35, 0.75], [s * 0.15, -s * 0.8, 0.6], [-s * 0.5, -s * 0.6, 0.55]];
  for (let i = 0; i < Math.min(n, spots.length); i++) {
    const [x, z, k] = spots[i];
    const [c, rb] = GIFT[(i + Math.floor(rnd() * GIFT.length)) % GIFT.length];
    const w = s * k * (0.85 + rnd() * 0.3), d = s * k * (0.8 + rnd() * 0.3), h = s * k * (0.7 + rnd() * 0.5);
    present(b, M.clone().multiply(mat(x, 0, z, 0, (rnd() - 0.5) * 0.9, 0)), w, h, d, c, rb, { bow: detail > 0 && i < 2 });
  }
  if (!detail) return;
  // a small one stacked on the biggest
  const [c, rb] = GIFT[Math.floor(rnd() * GIFT.length)];
  present(b, M.clone().multiply(mat(0, s * 0.85, 0, 0, 0.6, 0)), s * 0.5, s * 0.4, s * 0.5, c, rb, { bow: true });
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
  candyTube(b, M, curve, radius, 12, 5, k);
}

/** Warm lantern on a post (height ≈ 0.62), snow cap and a small wreath. Returns the light centre (local). */
export function lantern(b, M) {
  put(b, 'snow', new THREE.BoxGeometry(0.14, 0.06, 0.14), COLORS.snow, M, mat(0, 0.03, 0));
  put(b, 'metal', new THREE.CylinderGeometry(0.018, 0.024, 0.4, 6), COLORS.iron, M, mat(0, 0.26, 0));
  put(b, 'metal', new THREE.BoxGeometry(0.1, 0.02, 0.1), COLORS.gold, M, mat(0, 0.455, 0));
  put(b, 'win', new THREE.BoxGeometry(0.075, 0.1, 0.075), null, M, mat(0, 0.515, 0));
  for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) put(b, 'metal', new THREE.BoxGeometry(0.012, 0.11, 0.012), COLORS.gold, M, mat(x * 0.042, 0.515, z * 0.042));
  put(b, 'metal', new THREE.ConeGeometry(0.075, 0.06, 4), COLORS.gold, M, mat(0, 0.6, 0, 0, Math.PI / 4, 0));
  put(b, 'snow', new THREE.ConeGeometry(0.062, 0.035, 4), COLORS.snow, M, mat(0, 0.625, 0, 0, Math.PI / 4, 0));
  wreath(b, M.clone().multiply(mat(0, 0.3, 0.025)), 0.045, 5);
  return new THREE.Vector3(0, 0.515, 0);
}

/** Wreath of radius r in the XY plane (facing +Z): pine torus, red berries and a bow. */
export function wreath(b, M, r, seg = 10) {
  put(b, 'vc', new THREE.TorusGeometry(r, r * 0.32, 5, seg), COLORS.pine2, M, mat(0, 0, 0));
  for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2 + 0.4; put(b, 'gloss', new THREE.SphereGeometry(r * 0.12, 5, 3), COLORS.red, M, mat(Math.cos(a) * r, Math.sin(a) * r, r * 0.26)); }
  for (const sx of [-1, 1]) put(b, 'gloss', new THREE.ConeGeometry(r * 0.22, r * 0.5, 4), COLORS.red, M, mat(sx * r * 0.2, -r, r * 0.25, 0, 0, sx * Math.PI / 2));
}

/** Gingerbread house (footprint w × d, wall height h), door toward +Z, snowy roof. */
export function gingerbreadHouse(b, M, w, d, h, rnd) {
  put(b, 'vc', new THREE.BoxGeometry(w, h, d), COLORS.ginger, M, mat(0, h / 2, 0));
  // gable ends
  const gable = new THREE.Shape();
  gable.moveTo(-w / 2, 0); gable.lineTo(w / 2, 0); gable.lineTo(0, w * 0.45); gable.closePath();
  const gg = new THREE.ExtrudeGeometry(gable, { depth: d * 0.98, bevelEnabled: false });
  gg.translate(0, 0, -d * 0.49);
  put(b, 'vc', gg, COLORS.ginger, M, mat(0, h, 0));
  // snowy roof slabs
  const sl = Math.hypot(w / 2, w * 0.45) * 1.12, ang = Math.atan2(w * 0.45, w / 2);
  for (const sx of [-1, 1]) put(b, 'snow', new THREE.BoxGeometry(sl, w * 0.07, d * 1.14), COLORS.snow, M, mat(sx * w * 0.24, h + w * 0.25, 0, 0, 0, -sx * ang));
  // icing trims along the eaves and corners
  for (const sz of [-1, 1]) put(b, 'snow', new THREE.BoxGeometry(w * 1.02, h * 0.06, 0.02), COLORS.icing, M, mat(0, h * 0.97, sz * d / 2));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(b, 'snow', new THREE.BoxGeometry(w * 0.04, h, w * 0.04), COLORS.icing, M, mat(sx * w / 2, h / 2, sz * d / 2));
  // door + windows
  put(b, 'gloss', new THREE.BoxGeometry(w * 0.24, h * 0.55, 0.02), COLORS.red, M, mat(0, h * 0.28, d / 2 + 0.005));
  for (const sx of [-1, 1]) put(b, 'win', new THREE.BoxGeometry(w * 0.16, h * 0.22, 0.02), null, M, mat(sx * w * 0.3, h * 0.55, d / 2 + 0.005));
  put(b, 'win', new THREE.BoxGeometry(w * 0.14, w * 0.14, 0.02), null, M, mat(0, h + w * 0.15, d / 2 + 0.005));
  // gumdrops on the ridge
  for (let i = 0; i < 5; i++) put(b, 'gloss', new THREE.SphereGeometry(w * 0.05, 6, 4), ORN_COLS[(i + (rnd() * 6 | 0)) % ORN_COLS.length], M, mat(0, h + w * 0.48, (i / 4 - 0.5) * d * 0.9));
  // chimney
  put(b, 'vc', new THREE.BoxGeometry(w * 0.14, w * 0.3, w * 0.14), 0x8a3a2a, M, mat(w * 0.22, h + w * 0.38, -d * 0.2));
  put(b, 'snow', new THREE.BoxGeometry(w * 0.17, w * 0.04, w * 0.17), COLORS.snow, M, mat(w * 0.22, h + w * 0.54, -d * 0.2));
}

/** A cluster of icicles hanging from y = 0 (local), along X over `len`, max length L. */
export function icicleRow(b, M, len, L, n, rnd) {
  for (let i = 0; i < n; i++) {
    const x = (i + 0.5) / n * len - len / 2 + (rnd() - 0.5) * len / n * 0.5;
    const l = L * (0.35 + rnd() * 0.65), r = l * 0.13;
    put(b, 'ice', new THREE.ConeGeometry(r, l, 5, 1, true), COLORS.ice, M, mat(x, -l / 2, (rnd() - 0.5) * 0.04, Math.PI, 0, 0));
  }
}
