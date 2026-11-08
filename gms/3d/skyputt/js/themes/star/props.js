// Star Station theme — small props built into Buckets: beacon pylons, light posts, cargo crates, fuel
// canisters, antenna dishes, antenna masts, solar panels, hazard bollards and console terminals.
// Every builder takes a Buckets `b` and a placement Matrix4 `M` (local Y up, facing +Z).
// Bucket keys: vc (plain), panel (white hull plating, flat shaded), metal (brushed metal / solar cells),
// gloss (dish faces, visors), glow (unlit emissive). Builders return local glow / beacon points.
import * as THREE from 'three';
import { mat } from './util.js';

export const COLORS = {
  white: 0xe8eef4, white2: 0xc8d2dc, grey: 0x8a96a4, dark: 0x3a4250, metal: 0xa8b2bc, teal: 0x2aa8b0,
  orange: 0xe8702a, amber: 0xf0b030, glow: 0x40f8f0, red: 0xff4a4a, cell: 0x1a2a5a, cell2: 0x24407a, gold: 0xd8a848,
};
const K = COLORS;
const at = (M, m) => M.clone().multiply(m);

/** A hexagonal beacon pylon: white post, teal band, dark cap, a glowing lamp. Returns the lamp point. */
export function beaconPylon(b, M, h = 0.5, lo = false) {
  b.add('panel', new THREE.CylinderGeometry(0.05, 0.065, h, 6), K.white, at(M, mat(0, h / 2, 0)));
  b.add('vc', new THREE.CylinderGeometry(0.068, 0.068, 0.05, 6), K.teal, at(M, mat(0, h * 0.35, 0)));
  b.add('metal', new THREE.CylinderGeometry(0.075, 0.085, 0.04, 6), K.dark, at(M, mat(0, 0.02, 0)));
  b.add('metal', new THREE.CylinderGeometry(0.04, 0.055, 0.04, 6), K.dark, at(M, mat(0, h + 0.02, 0)));
  b.add('glow', new THREE.SphereGeometry(0.035, lo ? 6 : 8, lo ? 4 : 5), K.glow, at(M, mat(0, h + 0.07, 0)));
  return new THREE.Vector3(0, h + 0.07, 0);
}

/** A slim light post: metal pole, an arm and a glowing light bar. Returns the light point. */
export function lightPost(b, M, h = 0.7) {
  b.add('metal', new THREE.CylinderGeometry(0.015, 0.022, h, 6), K.metal, at(M, mat(0, h / 2, 0)));
  b.add('metal', new THREE.BoxGeometry(0.06, 0.03, 0.06), K.dark, at(M, mat(0, 0.015, 0)));
  b.add('metal', new THREE.BoxGeometry(0.02, 0.02, 0.16), K.metal, at(M, mat(0, h, 0.07)));
  b.add('panel', new THREE.BoxGeometry(0.06, 0.03, 0.14), K.white, at(M, mat(0, h - 0.02, 0.12)));
  b.add('glow', new THREE.BoxGeometry(0.045, 0.006, 0.12), 0xd8fcff, at(M, mat(0, h - 0.037, 0.12)));
  return new THREE.Vector3(0, h - 0.06, 0.12);
}

/** A cargo container: white box, dark corner frame, teal stripe and a glowing status light. */
export function crate(b, M, s = 0.3, tone = 0) {
  const w = s, h = s * 0.8, d = s * 0.75;
  b.add('panel', new THREE.BoxGeometry(w, h, d), tone ? K.white2 : K.white, at(M, mat(0, h / 2, 0)));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add('metal', new THREE.BoxGeometry(0.025, h + 0.01, 0.025), K.dark, at(M, mat(sx * w / 2, h / 2, sz * d / 2)));
  b.add('vc', new THREE.BoxGeometry(w * 1.01, h * 0.14, d * 1.01), tone ? K.orange : K.teal, at(M, mat(0, h * 0.62, 0)));
  b.add('glow', new THREE.BoxGeometry(0.03, 0.03, 0.006), tone ? K.amber : K.glow, at(M, mat(w * 0.3, h * 0.82, d / 2 + 0.004)));
}

/** Two or three fuel canisters strapped together (orange / white, domed ends). */
export function canisters(b, M, s = 0.3, n = 3, lo = false) {
  const seg = lo ? 6 : 8;
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2, r = n > 1 ? s * 0.2 : 0, x = Math.cos(a) * r, z = Math.sin(a) * r;
    const hh = s * (0.8 + (i % 2) * 0.15);
    b.add('panel', new THREE.CylinderGeometry(s * 0.16, s * 0.16, hh, seg), i % 2 ? K.white : K.orange, at(M, mat(x, hh / 2, z)));
    b.add('panel', new THREE.SphereGeometry(s * 0.16, seg, 3, 0, Math.PI * 2, 0, Math.PI / 2), i % 2 ? K.white : K.orange, at(M, mat(x, hh, z)));
  }
  b.add('metal', new THREE.TorusGeometry(s * 0.37, 0.012, 3, 12), K.dark, at(M, mat(0, s * 0.45, 0, Math.PI / 2, 0, 0)));
}

/** A small antenna dish on a tripod, tilted up toward the sky. Returns the feed-horn tip point. */
export function dish(b, M, s = 0.4, lo = false) {
  for (let i = 0; i < 3; i++) {
    const a = i / 3 * Math.PI * 2;
    b.add('metal', new THREE.CylinderGeometry(0.008, 0.012, s * 0.6, 4), K.metal, at(M, mat(Math.cos(a) * s * 0.14, s * 0.28, Math.sin(a) * s * 0.14, Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35)));
  }
  const pts = [];
  for (let i = 0; i <= 6; i++) { const t = i / 6; pts.push(new THREE.Vector2(t * s * 0.5, t * t * s * 0.16)); }
  const tilt = mat(0, s * 0.58, 0, -0.75, 0, 0);
  b.add('gloss', new THREE.LatheGeometry(pts, lo ? 10 : 14), K.white, at(M, tilt));
  b.add('metal', new THREE.CylinderGeometry(0.006, 0.006, s * 0.3, 4), K.metal, at(M, tilt.clone().multiply(mat(0, s * 0.15, 0))));
  b.add('glow', new THREE.SphereGeometry(0.018, 6, 4), K.red, at(M, tilt.clone().multiply(mat(0, s * 0.31, 0))));
  return new THREE.Vector3(0, s * 0.31, 0).applyMatrix4(tilt);
}

/** A lattice antenna mast with cross bars and a red beacon on top. Returns the beacon point. */
export function antenna(b, M, h = 1.2) {
  b.add('metal', new THREE.CylinderGeometry(0.012, 0.02, h, 4), K.metal, at(M, mat(0, h / 2, 0)));
  for (let k = 1; k <= 3; k++) b.add('metal', new THREE.BoxGeometry(0.16 - k * 0.03, 0.008, 0.008), K.white2, at(M, mat(0, h * (0.45 + k * 0.15), 0)));
  b.add('metal', new THREE.BoxGeometry(0.1, 0.04, 0.1), K.dark, at(M, mat(0, 0.02, 0)));
  b.add('glow', new THREE.SphereGeometry(0.022, 6, 4), K.red, at(M, mat(0, h + 0.02, 0)));
  return new THREE.Vector3(0, h + 0.02, 0);
}

/** A solar panel on a post: dark blue cells in a grid, a metal frame, angled toward the sun. */
export function solarPanel(b, M, w = 0.6, h = 0.4, cells = 3) {
  b.add('metal', new THREE.CylinderGeometry(0.015, 0.02, 0.3, 5), K.metal, at(M, mat(0, 0.15, 0)));
  const P = mat(0, 0.32, 0, -0.9, 0, 0);
  b.add('metal', new THREE.BoxGeometry(w + 0.03, 0.02, h + 0.03), K.grey, at(M, P));
  for (let i = 0; i < cells; i++) for (let j = 0; j < 2; j++) {
    const cw = w / cells, ch = h / 2;
    b.add('metal', new THREE.BoxGeometry(cw * 0.92, 0.012, ch * 0.9), (i + j) % 2 ? K.cell : K.cell2,
      at(M, P.clone().multiply(mat(-w / 2 + cw * (i + 0.5), 0.012, -h / 2 + ch * (j + 0.5)))));
  }
}

/** A short hazard bollard: amber and dark bands, a lamp on top. Returns the lamp point. */
export function bollard(b, M, h = 0.2) {
  for (let k = 0; k < 4; k++) b.add('vc', new THREE.CylinderGeometry(0.035, 0.035, h / 4, 6), k % 2 ? K.dark : K.amber, at(M, mat(0, h / 8 + k * h / 4, 0)));
  b.add('glow', new THREE.CylinderGeometry(0.025, 0.03, 0.02, 6), K.amber, at(M, mat(0, h + 0.01, 0)));
  return new THREE.Vector3(0, h + 0.02, 0);
}

/** A console terminal: a slanted desk with a glowing screen. Returns the screen point. */
export function terminal(b, M, s = 0.3) {
  b.add('panel', new THREE.BoxGeometry(s * 0.7, s * 0.6, s * 0.4), K.white2, at(M, mat(0, s * 0.3, 0)));
  b.add('panel', new THREE.BoxGeometry(s * 0.72, s * 0.08, s * 0.5), K.white, at(M, mat(0, s * 0.64, 0.02, -0.5, 0, 0)));
  b.add('glow', new THREE.BoxGeometry(s * 0.55, s * 0.005, s * 0.3), 0x60e8ff, at(M, mat(0, s * 0.69, 0.03, -0.5, 0, 0)));
  return new THREE.Vector3(0, s * 0.68, 0.03);
}
