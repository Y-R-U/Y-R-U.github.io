// Sunken Reef theme — small props built into Buckets: glowing anemones, giant clams with pearls,
// amphorae, broken temple columns and fallen drums, ship lanterns on posts, barrels, anchors, treasure
// chests, starfish, brain corals and tube sponges.
// Every builder takes a Buckets `b` and a placement Matrix4 `M` (local Y up, facing +Z).
// Bucket keys: vc, stone (flat-shaded weathered stone), gloss (shell / pearl), metal (verdigris bronze /
// iron), glow (unlit, pulsing), win (unlit lantern glow), wood (the wreck's timbers), coral.
import * as THREE from 'three';
import { mat } from './util.js';

export const COLORS = {
  stone: 0xc8bc9a, stone2: 0xa89e80, stone3: 0x8a8670, moss: 0x6a8a50, bronze: 0x5aa890, bronze2: 0x3e7a6a,
  iron: 0x4a5450, wood: 0x8a6e52, wood2: 0x6a5640, wood3: 0x9a8264, shell: 0xf0dcd0, shell2: 0xd8b8b0,
  pearl: 0xf8f4ff, clay: 0xb8704a, clay2: 0x8a5034, gold: 0xe8c050,
  anemone: 0xff7ac0, anemone2: 0x7af0e0, anemone3: 0xffb060, star: 0xf07050, star2: 0xf0a040,
};

const put = (b, key, geo, color, M, local, keepUv = false) => b.add(key === 'coral' ? 'vc' : key, geo, color, local ? M.clone().multiply(local) : M, keepUv);

/** Glowing anemone: a short column with a ring of tentacles, size s. Returns the glow point (local). */
export function anemone(b, M, s, k = 0, lo = false) {
  const C = [COLORS.anemone, COLORS.anemone2, COLORS.anemone3][k % 3];
  put(b, 'coral', new THREE.CylinderGeometry(s * 0.2, s * 0.26, s * 0.3, lo ? 6 : 8), 0x8a5a70, M, mat(0, s * 0.15, 0));
  const n = lo ? 8 : 12;
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2, t = 0.5 + (i % 2) * 0.35;
    put(b, 'glow', new THREE.ConeGeometry(s * 0.045, s * 0.42, 4), C, M,
      mat(Math.cos(a) * s * 0.16, s * 0.48, Math.sin(a) * s * 0.16, Math.sin(a) * t, 0, -Math.cos(a) * t));
  }
  put(b, 'glow', new THREE.SphereGeometry(s * 0.12, 6, 3), 0xffffff, M, mat(0, s * 0.32, 0, 0, 0, 0, [1, 0.5, 1]));
  return new THREE.Vector3(0, s * 0.45, 0);
}

/** Giant clam half open with a pearl, size s. Returns the pearl point (local). */
export function clam(b, M, s, lo = false) {
  const seg = lo ? 8 : 12;
  const half = (up) => {
    const g = new THREE.SphereGeometry(s * 0.5, seg, 4, 0, Math.PI * 2, 0, Math.PI / 2);
    g.scale(1, 0.35, 0.8);
    if (!up) g.rotateX(Math.PI);
    return g;
  };
  put(b, 'gloss', half(false), COLORS.shell2, M, mat(0, s * 0.18, 0));
  put(b, 'gloss', half(true), COLORS.shell, M, mat(0, s * 0.2, -s * 0.36, -0.75, 0, 0).multiply(mat(0, 0, s * 0.36)));
  // scalloped ridge ribs on the lid
  for (let i = 0; i < (lo ? 3 : 5); i++) {
    const a = -0.7 + 1.4 * i / 4;
    put(b, 'gloss', new THREE.BoxGeometry(s * 0.04, s * 0.04, s * 0.7), COLORS.shell2, M,
      mat(Math.sin(a) * s * 0.3, s * 0.2, -s * 0.36, -0.75, a * 0.6, 0).multiply(mat(0, s * 0.17, s * 0.3)));
  }
  put(b, 'glow', new THREE.SphereGeometry(s * 0.1, 8, 6), COLORS.pearl, M, mat(0, s * 0.24, s * 0.05));
  return new THREE.Vector3(0, s * 0.24, s * 0.05);
}

/** Amphora of height h (clay), optionally tipped over on its side. */
export function amphora(b, M, h, tipped = false, lo = false) {
  const pts = [[0, 0], [0.12, 0.02], [0.22, 0.2], [0.26, 0.42], [0.2, 0.66], [0.09, 0.8], [0.08, 0.92], [0.12, 0.96], [0.1, 1]]
    .map(([x, y]) => new THREE.Vector2(x * h, y * h));
  const g = new THREE.LatheGeometry(pts, lo ? 7 : 10);
  const L = tipped ? mat(0, h * 0.22, 0, 0, 0, Math.PI / 2 - 0.15).multiply(mat(0, -h * 0.45, 0)) : mat();
  put(b, 'vc', g, COLORS.clay, M, L);
  for (const s of [-1, 1]) {
    const hd = new THREE.TorusGeometry(h * 0.08, h * 0.018, 3, 6, Math.PI);
    put(b, 'vc', hd, COLORS.clay2, M, L.clone().multiply(mat(s * h * 0.12, h * 0.76, 0, 0, 0, s * -Math.PI / 2)));
  }
}

/** Broken temple column of height h (fluted drum stack, jagged top), with a base block. */
export function brokenColumn(b, M, h, rnd = Math.random, lo = false) {
  const r = h * 0.13;
  put(b, 'stone', new THREE.BoxGeometry(r * 3, h * 0.08, r * 3), COLORS.stone2, M, mat(0, h * 0.04, 0));
  put(b, 'stone', new THREE.CylinderGeometry(r * 1.2, r * 1.3, h * 0.06, lo ? 8 : 12), COLORS.stone, M, mat(0, h * 0.11, 0));
  const drums = 3;
  for (let i = 0; i < drums; i++) {
    const dh = (h * 0.86) / drums, y = h * 0.14 + i * dh;
    const top = i === drums - 1;
    const g = new THREE.CylinderGeometry(r * (top ? 0.95 : 1.0), r, dh * (top ? 0.7 + rnd() * 0.3 : 0.98), lo ? 8 : 12);
    if (top) {   // jagged break
      const p = g.attributes.position;
      for (let k = 0; k < p.count; k++) if (p.getY(k) > 0) p.setY(k, p.getY(k) - rnd() * dh * 0.3);
    }
    g.translate(0, (dh * (top ? 0.85 : 0.98)) / 2, 0);
    put(b, 'stone', g, i % 2 ? COLORS.stone : COLORS.stone2, M, mat(0, y, 0, 0, rnd() * 0.4, (rnd() - 0.5) * 0.03));
  }
  // a mossy patch on the side
  put(b, 'coral', new THREE.SphereGeometry(r * 0.6, 5, 3), COLORS.moss, M, mat(r * 0.75, h * 0.35, 0, 0, 0, 0, [0.5, 1.4, 1]));
}

/** Fallen column drum lying on its side, length l. */
export function fallenDrum(b, M, l, lo = false) {
  const r = l * 0.32;
  put(b, 'stone', new THREE.CylinderGeometry(r, r, l, lo ? 8 : 12), COLORS.stone2, M, mat(0, r * 0.92, 0, 0, 0, Math.PI / 2));
  put(b, 'coral', new THREE.SphereGeometry(r * 0.35, 5, 3), COLORS.moss, M, mat(0, r * 1.8, 0, 0, 0, 0, [1.6, 0.5, 1.2]));
}

/** Ship lantern on a weathered post, height h (a glowing cage). Returns the glow point (local). */
export function lanternPost(b, M, h, lo = false) {
  put(b, 'wood', new THREE.CylinderGeometry(h * 0.03, h * 0.04, h, 6), COLORS.wood2, M, mat(0, h / 2, 0, 0.03, 0, 0.04));
  put(b, 'wood', new THREE.BoxGeometry(h * 0.22, h * 0.03, h * 0.03), COLORS.wood2, M, mat(h * 0.09, h * 0.95, 0));
  const lx = h * 0.18, ly = h * 0.8, s = h * 0.09;
  put(b, 'win', new THREE.CylinderGeometry(s * 0.7, s * 0.7, s * 1.5, 6), null, M, mat(lx, ly, 0));
  put(b, 'metal', new THREE.ConeGeometry(s * 1.1, s * 0.8, 6), COLORS.bronze2, M, mat(lx, ly + s * 1.1, 0));
  put(b, 'metal', new THREE.CylinderGeometry(s * 1.0, s * 0.8, s * 0.3, 6), COLORS.bronze2, M, mat(lx, ly - s * 0.9, 0));
  if (!lo) for (let i = 0; i < 3; i++) {
    const a = i / 3 * Math.PI * 2 + 0.5;
    put(b, 'metal', new THREE.BoxGeometry(s * 0.12, s * 1.6, s * 0.12), COLORS.bronze, M, mat(lx + Math.cos(a) * s * 0.76, ly, Math.sin(a) * s * 0.76));
  }
  put(b, 'metal', new THREE.TorusGeometry(s * 0.3, s * 0.08, 3, 6), COLORS.bronze, M, mat(lx, ly + s * 1.55, 0));
  return new THREE.Vector3(lx, ly, 0);
}

/** Barrel of height h on its end (or on its side). */
export function barrel(b, M, h, side = false, lo = false) {
  const pts = [[0, 0], [0.33, 0], [0.38, 0.2], [0.4, 0.5], [0.38, 0.8], [0.33, 1], [0, 1]].map(([x, y]) => new THREE.Vector2(x * h, y * h));
  const L = side ? mat(0, h * 0.38, 0, 0, 0, Math.PI / 2).multiply(mat(0, -h / 2, 0)) : mat();
  put(b, 'wood', new THREE.LatheGeometry(pts, lo ? 8 : 12), COLORS.wood, M, L);
  for (const y of [0.15, 0.85]) put(b, 'metal', new THREE.CylinderGeometry(h * 0.365, h * 0.365, h * 0.05, lo ? 8 : 12, 1, true), COLORS.iron, M, L.clone().multiply(mat(0, h * y, 0)));
}

/** Anchor of height h leaning against things, crusted. */
export function anchorProp(b, M, h) {
  const L = mat(0, 0, 0, 0, 0, 0.5);
  const Mx = M.clone().multiply(L);
  put(b, 'metal', new THREE.CylinderGeometry(h * 0.035, h * 0.035, h * 0.85, 6), COLORS.iron, Mx, mat(0, h * 0.5, 0));
  put(b, 'metal', new THREE.TorusGeometry(h * 0.09, h * 0.025, 4, 8), COLORS.iron, Mx, mat(0, h * 0.98, 0));
  put(b, 'metal', new THREE.BoxGeometry(h * 0.4, h * 0.04, h * 0.05), COLORS.iron, Mx, mat(0, h * 0.82, 0));
  put(b, 'metal', new THREE.TorusGeometry(h * 0.3, h * 0.035, 4, 10, Math.PI), COLORS.iron, Mx, mat(0, h * 0.38, 0, 0, 0, Math.PI));
  for (const s of [-1, 1]) put(b, 'metal', new THREE.ConeGeometry(h * 0.06, h * 0.14, 4), COLORS.iron, Mx, mat(s * h * 0.3, h * 0.42, 0, 0, 0, s * 0.6));
}

/** Treasure chest (lid ajar, a glint of gold), size s. Returns the glint point (local). */
export function chest(b, M, s) {
  put(b, 'wood', new THREE.BoxGeometry(s, s * 0.5, s * 0.6), COLORS.wood, M, mat(0, s * 0.25, 0));
  put(b, 'wood', new THREE.CylinderGeometry(s * 0.3, s * 0.3, s, 8, 1, false, 0, Math.PI), COLORS.wood3, M, mat(0, s * 0.52, -s * 0.06, -0.5, 0, Math.PI / 2));
  for (const x of [-0.4, 0, 0.4]) put(b, 'metal', new THREE.BoxGeometry(s * 0.06, s * 0.52, s * 0.62), COLORS.bronze2, M, mat(x * s, s * 0.25, 0));
  put(b, 'glow', new THREE.BoxGeometry(s * 0.8, s * 0.06, s * 0.4), COLORS.gold, M, mat(0, s * 0.52, s * 0.04));
  return new THREE.Vector3(0, s * 0.58, s * 0.05);
}

/** Starfish of radius s lying on the ground. */
export function starfish(b, M, s, color = COLORS.star) {
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * Math.PI * 2;
    const g = new THREE.ConeGeometry(s * 0.22, s, 4);
    g.rotateX(Math.PI / 2); g.translate(0, 0, s * 0.5);
    put(b, 'coral', g, color, M, mat(0, s * 0.06, 0, 0, a, 0, [1, 0.35, 1]));
  }
}

/** Brain coral dome of radius s. */
export function brainCoral(b, M, s, color = 0xd8a070, lo = false) {
  const g = new THREE.SphereGeometry(s, lo ? 8 : 12, lo ? 5 : 7, 0, Math.PI * 2, 0, Math.PI * 0.6);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + Math.sin(x / s * 9 + Math.sin(z / s * 6) * 2) * 0.04;
    p.setXYZ(i, x * k, y * k * 0.8, z * k);
  }
  put(b, 'coral', g, color, M, mat(0, -s * 0.2, 0));
}

/** Tube sponges: a cluster of open tubes, tallest h. */
export function tubeSponges(b, M, h, rnd = Math.random, n = 4, color = 0xb070c0) {
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2, d = i ? h * 0.12 : 0, hh = h * (i ? 0.5 + rnd() * 0.4 : 1);
    put(b, 'coral', new THREE.CylinderGeometry(h * 0.08, h * 0.06, hh, 7, 1, true), color, M, mat(Math.cos(a) * d, hh / 2, Math.sin(a) * d, (rnd() - 0.5) * 0.3, 0, (rnd() - 0.5) * 0.3));
    put(b, 'glow', new THREE.RingGeometry(h * 0.04, h * 0.08, 7), 0xff90e0, M, mat(Math.cos(a) * d, hh, Math.sin(a) * d, -Math.PI / 2, 0, 0));
  }
}
