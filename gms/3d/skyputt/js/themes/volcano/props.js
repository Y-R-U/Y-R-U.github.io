// Volcano Forge theme — small props built into Buckets: braziers, brass lantern posts, anvils, obsidian
// crystal clusters, basalt columns, ember vents, giant hammers, brass gears, ingot stacks, a forge chimney.
// Every builder takes a Buckets `b` and a placement Matrix4 `M` (local Y up, facing +Z).
// Bucket keys: vc, stone (flat-shaded basalt), gloss (obsidian), metal (iron / brass / copper), ember (unlit glow),
// win (unlit window glow), lava (scrolling molten map, keeps uv).
import * as THREE from 'three';
import { mat } from './util.js';

export const COLORS = {
  iron: 0x4a4644, iron2: 0x33302e, brass: 0xc8923c, brass2: 0xa8742a, copper: 0xb8643a, basalt: 0x4c4c50,
  basalt2: 0x3a3a3e, ash: 0x6a6660, ember: 0xff6a1a, ember2: 0xffa040, coal: 0xd8401a, obsidian: 0x2a1e36,
  obsidian2: 0x3e2a50, leather: 0x5a3020, wood: 0x4a3020, char: 0x221c18,
};
export const CRYSTAL_COLS = [0x3a2a4a, 0x2a1e36, 0x4a3060, 0x30243e];

const put = (b, key, geo, color, M, local, keepUv = false) => b.add(key, geo, color, local ? M.clone().multiply(local) : M, keepUv);

/** Iron brazier on three legs with a bowl of glowing coals, height h. Returns the flame point (local). */
export function brazier(b, M, h, lo = false) {
  const r = h * 0.32;
  for (let i = 0; i < 3; i++) {
    const a = i / 3 * Math.PI * 2;
    put(b, 'metal', new THREE.CylinderGeometry(h * 0.025, h * 0.03, h * 0.82, 4), COLORS.iron2, M,
      mat(Math.cos(a) * r * 0.5, h * 0.38, Math.sin(a) * r * 0.5, Math.sin(a) * 0.32, 0, -Math.cos(a) * 0.32));
  }
  const bowl = new THREE.CylinderGeometry(r, r * 0.55, h * 0.24, lo ? 8 : 12, 1, true);
  put(b, 'metal', bowl, COLORS.iron, M, mat(0, h * 0.82, 0));
  put(b, 'metal', new THREE.TorusGeometry(r, h * 0.03, 4, lo ? 8 : 12), COLORS.brass, M, mat(0, h * 0.94, 0, Math.PI / 2, 0, 0));
  put(b, 'ember', new THREE.SphereGeometry(r * 0.9, lo ? 6 : 8, 3, 0, Math.PI * 2, 0, Math.PI / 2), COLORS.coal, M, mat(0, h * 0.86, 0, 0, 0, 0, [1, 0.45, 1]));
  // flame tongues
  for (let i = 0; i < (lo ? 2 : 3); i++) {
    const a = i * 2.1;
    put(b, 'ember', new THREE.ConeGeometry(r * 0.32, h * 0.32, 5), i ? COLORS.ember : COLORS.ember2, M, mat(Math.cos(a) * r * 0.3, h * 1.04, Math.sin(a) * r * 0.3));
  }
  return new THREE.Vector3(0, h * 1.05, 0);
}

/** Iron post with a brass cage lantern (glowing core), height h. Returns the glow point (local). */
export function lanternPost(b, M, h, lo = false) {
  put(b, 'metal', new THREE.CylinderGeometry(h * 0.025, h * 0.035, h, 6), COLORS.iron2, M, mat(0, h / 2, 0));
  put(b, 'metal', new THREE.CylinderGeometry(h * 0.07, h * 0.08, h * 0.05, 6), COLORS.brass, M, mat(0, h * 0.02, 0));
  // bracket arm
  put(b, 'metal', new THREE.BoxGeometry(h * 0.2, h * 0.025, h * 0.025), COLORS.iron2, M, mat(h * 0.09, h * 0.95, 0));
  const lx = h * 0.18, ly = h * 0.82, s = h * 0.09;
  put(b, 'win', new THREE.CylinderGeometry(s * 0.7, s * 0.7, s * 1.5, 6), null, M, mat(lx, ly, 0));
  put(b, 'metal', new THREE.ConeGeometry(s * 1.1, s * 0.9, 6), COLORS.brass, M, mat(lx, ly + s * 1.15, 0));
  put(b, 'metal', new THREE.CylinderGeometry(s * 1.0, s * 0.8, s * 0.3, 6), COLORS.brass, M, mat(lx, ly - s * 0.9, 0));
  if (!lo) for (let i = 0; i < 3; i++) {
    const a = i / 3 * Math.PI * 2 + 0.5;
    put(b, 'metal', new THREE.BoxGeometry(s * 0.12, s * 1.6, s * 0.12), COLORS.brass2, M, mat(lx + Math.cos(a) * s * 0.76, ly, Math.sin(a) * s * 0.76));
  }
  put(b, 'metal', new THREE.CylinderGeometry(h * 0.004, h * 0.004, s * 0.5, 3), COLORS.iron2, M, mat(lx, ly + s * 0.65 + h * 0.06, 0));
  return new THREE.Vector3(lx, ly, 0);
}

/** Anvil of length s (horn toward +X) on a stump-like basalt block. */
export function anvil(b, M, s, stand = true) {
  let y = 0;
  if (stand) {
    put(b, 'stone', new THREE.CylinderGeometry(s * 0.32, s * 0.38, s * 0.45, 7), COLORS.basalt, M, mat(0, s * 0.225, 0));
    y = s * 0.45;
  }
  put(b, 'metal', new THREE.BoxGeometry(s * 0.55, s * 0.1, s * 0.4), COLORS.iron, M, mat(-s * 0.05, y + s * 0.05, 0));
  put(b, 'metal', new THREE.BoxGeometry(s * 0.3, s * 0.16, s * 0.24), COLORS.iron, M, mat(-s * 0.05, y + s * 0.18, 0));
  put(b, 'metal', new THREE.BoxGeometry(s * 0.7, s * 0.14, s * 0.3), COLORS.iron2, M, mat(-s * 0.08, y + s * 0.33, 0));
  const horn = new THREE.ConeGeometry(s * 0.1, s * 0.4, 6);
  put(b, 'metal', horn, COLORS.iron2, M, mat(s * 0.47, y + s * 0.34, 0, 0, 0, -Math.PI / 2, [1, 1, 1]));
}

/** A cluster of obsidian crystals of size s. */
export function crystals(b, M, s, rnd = Math.random, n = 4) {
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2, d = i ? s * (0.15 + rnd() * 0.2) : 0, h = s * (i ? 0.45 + rnd() * 0.35 : 1);
    const g = new THREE.OctahedronGeometry(1, 0);
    g.scale(0.3, 1, 0.3); g.translate(0, 0.55, 0);
    put(b, 'gloss', g, CRYSTAL_COLS[i % CRYSTAL_COLS.length], M,
      mat(Math.cos(a) * d, 0, Math.sin(a) * d, Math.cos(a) * (i ? 0.45 : 0.1), rnd() * 3, Math.sin(a) * (i ? 0.45 : 0.1), h));
  }
}

/** A cluster of hexagonal basalt columns, tallest h. */
export function columns(b, M, h, rnd = Math.random, n = 5) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rnd(), d = i ? h * 0.16 : 0, hh = h * (i ? 0.4 + rnd() * 0.5 : 1);
    const r = h * 0.09;
    put(b, 'stone', new THREE.CylinderGeometry(r, r, hh, 6), [COLORS.basalt, COLORS.basalt2, 0x58585c][i % 3], M, mat(Math.cos(a) * d, hh / 2, Math.sin(a) * d, 0, rnd(), 0));
  }
}

/** Ember vent: a cracked basalt mound with a glowing mouth, size s. Returns the vent point (local). */
export function emberVent(b, M, s) {
  put(b, 'stone', new THREE.ConeGeometry(s * 0.5, s * 0.35, 7, 1, true), COLORS.basalt2, M, mat(0, s * 0.175, 0));
  put(b, 'ember', new THREE.CylinderGeometry(s * 0.14, s * 0.18, s * 0.02, 7), COLORS.ember, M, mat(0, s * 0.33, 0));
  return new THREE.Vector3(0, s * 0.36, 0);
}

/** Giant hammer stuck head-down at an angle, height h. */
export function hammer(b, M, h) {
  const L = mat(0, 0, 0, 0, 0, 0.32);
  const Mx = M.clone().multiply(L);
  put(b, 'metal', new THREE.BoxGeometry(h * 0.42, h * 0.26, h * 0.26), COLORS.iron2, Mx, mat(0, h * 0.11, 0));
  put(b, 'metal', new THREE.BoxGeometry(h * 0.44, h * 0.04, h * 0.28), COLORS.brass, Mx, mat(0, h * 0.2, 0));
  put(b, 'vc', new THREE.CylinderGeometry(h * 0.035, h * 0.04, h * 0.85, 6), COLORS.wood, Mx, mat(0, h * 0.62, 0));
  put(b, 'metal', new THREE.CylinderGeometry(h * 0.045, h * 0.045, h * 0.1, 6), COLORS.brass, Mx, mat(0, h * 0.95, 0));
}

/** Brass gear of radius R standing on edge, facing +Z, teeth n. */
export function gear(b, M, R, n = 10, color = COLORS.brass) {
  put(b, 'metal', new THREE.TorusGeometry(R * 0.82, R * 0.14, 4, n * 2), color, M, mat(0, R, 0));
  put(b, 'metal', new THREE.CylinderGeometry(R * 0.2, R * 0.2, R * 0.3, 8), color, M, mat(0, R, 0, Math.PI / 2, 0, 0));
  for (let i = 0; i < 4; i++) put(b, 'metal', new THREE.BoxGeometry(R * 1.5, R * 0.12, R * 0.12), color, M, mat(0, R, 0, 0, 0, i * Math.PI / 4));
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2;
    put(b, 'metal', new THREE.BoxGeometry(R * 0.22, R * 0.22, R * 0.26), color, M, mat(Math.cos(a) * R * 1.0, R + Math.sin(a) * R * 1.0, 0, 0, 0, a));
  }
}

/** A small stack of ingots (brass / copper / iron), size s. */
export function ingots(b, M, s) {
  const C = [COLORS.brass, COLORS.copper, COLORS.iron, COLORS.brass2];
  let k = 0;
  for (let row = 0; row < 3; row++) for (let i = 0; i < 3 - row; i++) {
    const g = new THREE.CylinderGeometry(s * 0.07 * Math.SQRT2, s * 0.1 * Math.SQRT2, s * 0.1, 4, 1);
    g.rotateY(Math.PI / 4);
    put(b, 'metal', g, C[k++ % C.length], M, mat((i - (2 - row) / 2) * s * 0.24, s * 0.05 + row * s * 0.1, 0, 0, 0, 0, [1, 1, 2.2]));
  }
}

/** Forge chimney stack of height h and radius r with brass bands and a glowing mouth. Returns the top (local). */
export function chimney(b, M, h, r, lo = false) {
  const seg = lo ? 6 : 8;
  put(b, 'stone', new THREE.CylinderGeometry(r * 0.8, r, h, seg), COLORS.basalt2, M, mat(0, h / 2, 0));
  for (const f of [0.25, 0.6, 0.95]) put(b, 'metal', new THREE.CylinderGeometry(r * (1 - f * 0.2) * 1.06, r * (1 - f * 0.2) * 1.06, r * 0.16, seg), COLORS.brass, M, mat(0, h * f, 0));
  put(b, 'ember', new THREE.CylinderGeometry(r * 0.66, r * 0.66, r * 0.05, seg), COLORS.ember, M, mat(0, h + 0.01, 0));
  return new THREE.Vector3(0, h, 0);
}
