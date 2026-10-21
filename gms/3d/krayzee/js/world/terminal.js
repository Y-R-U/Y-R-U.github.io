import * as THREE from 'three';
import { col, mat } from './util.js';
import { TERMINAL } from './layout.js';
import { uvQuad } from './textures.js';

const STONE = col('#e9e0cc'), STONE2 = col('#d8ccb2'), RENDER = col('#f1ece2'), MULL = col('#2f3338');
const ROOF = col('#6d7178'), PURPLE = col('#4b1f7a'), GOLD = col('#e2ac2c'), COPPER = col('#5f9e8a');


// Upright textured quad facing +z (or rotated by ry) from the decal atlas.
export function decalQuad(b, rect, x, y, z, w, h, ry = 0) {
  const c = Math.cos(ry), s = Math.sin(ry);
  const p = (lx, ly) => [x + lx * c, y + ly, z - lx * s];
  b.quad(p(-w / 2, -h / 2), p(w / 2, -h / 2), p(w / 2, h / 2), p(-w / 2, h / 2), [1, 1, 1], uvQuad(rect));
}

function glassWall(G, M, x0, x1, y0, y1, z, face, spacing, transoms, tint) {
  const fz = z;
  if (face > 0) G.quad([x0, y0, fz], [x1, y0, fz], [x1, y1, fz], [x0, y1, fz], tint);
  else G.quad([x1, y0, fz], [x0, y0, fz], [x0, y1, fz], [x1, y1, fz], tint);
  const n = Math.max(1, Math.round((x1 - x0) / spacing));
  for (let i = 0; i <= n; i++) M.box(x0 + (x1 - x0) * i / n, (y0 + y1) / 2, fz + face * 0.06, 0.12, y1 - y0, 0.16, MULL);
  for (const ty of transoms) M.box((x0 + x1) / 2, ty, fz + face * 0.06, x1 - x0, 0.1, 0.16, MULL);
}

function wing(B, x0, x1, zS, zN) {
  const { matte: M, glass: G } = B;
  const L = B.lit || M;
  const H = 11.6;
  const inset = 1.2;
  const zg = zS - inset;
  M.box((x0 + x1) / 2, H / 2, (zN + zg - 9) / 2, x1 - x0, H, zg - 9 - zN, RENDER);
  L.box((x0 + x1) / 2, 0.05, zg - 4.5, x1 - x0, 0.1, 9, col('#b9b2a4'));
  L.box((x0 + x1) / 2, H / 2, zg - 9.05, x1 - x0, H, 0.1, col('#cbb894'));
  L.box((x0 + x1) / 2, 5.75, zg - 4.5, x1 - x0, 0.5, 9, col('#efe9dc'));
  L.box((x0 + x1) / 2, 11.35, zg - 4.5, x1 - x0, 0.5, 9, col('#efe9dc'));
  for (let x = x0 + 3; x < x1 - 2; x += 6) for (const [y, z] of [[5.48, -2.5], [5.48, -6.5], [11.08, -2.5], [11.08, -6.5]]) L.box(x, y, zg + z, 3.2, 0.05, 0.5, col('#fffbe8', 1.4));
  for (let x = x0 + 6; x < x1 - 3; x += 12) {
    L.box(x, 2.0, zg - 8.4, 7, 4, 1.0, col(['#a8203e', '#3a64a8', '#f0bf3c', '#4f9a5e'][Math.abs(Math.round(x)) % 4]));
    L.box(x, 3.6, zg - 7.85, 6, 0.6, 0.1, col('#fff6dc', 1.3));
    L.box(x + 2, 1.0, zg - 3, 1.5, 2, 1.5, col('#8f8a80'));
  }
  for (let x = x0 + 9; x < x1 - 3; x += 12) L.box(x, 6.0 + 2.2, zg - 8.9, 5, 3, 0.1, col(['#4b1f7a', '#c4122f', '#1f4f8f'][Math.abs(Math.round(x)) % 3], 1.1));
  glassWall(G, M, x0, x1, 0.15, 5.5, zg, 1, 2.0, [2.9], col('#ffffff'));
  glassWall(G, M, x0, x1, 6.0, 11.1, zg, 1, 2.0, [8.6], col('#ffffff'));
  for (let x = x0; x <= x1 + 0.01; x += 8) M.box(Math.min(x1 - 0.3, Math.max(x0 + 0.3, x)), H / 2, zg + 0.35, 0.6, H, 0.7, STONE);
  M.box((x0 + x1) / 2, 5.75, zg + 0.25, x1 - x0, 0.7, 0.5, STONE2);
  M.box((x0 + x1) / 2, H + 0.4, (zN + zS) / 2 - 0.2, x1 - x0, 0.8, zS - zN + 0.4, col('#8f9295'));
  M.box((x0 + x1) / 2, H + 0.6, zN - 0.2, x1 - x0, 1.2, 0.5, STONE);
  M.box((x0 + x1) / 2, H + 0.6, zS - 0.2, x1 - x0, 1.2, 0.5, STONE);
  M.box((x0 + x1) / 2, H + 1.15, zS + 1.6, x1 - x0 + 1, 0.35, 4.2, ROOF);
  M.box((x0 + x1) / 2, H + 1.0, zS + 3.75, x1 - x0 + 1, 0.7, 0.18, PURPLE);
  M.box((x0 + x1) / 2, H + 1.38, zS + 3.85, x1 - x0 + 1, 0.12, 0.12, GOLD);
  for (let x = x0 + 4; x < x1; x += 16) M.box(x, H / 2, zS + 3.5, 0.3, H, 0.3, MULL);
  for (let x = x0 + 10; x < x1 - 8; x += 22) {
    M.box(x, H + 1.9, (zN + zS) / 2 - 3, 6, 1.8, 4, col('#a9adb2'));
    M.box(x + 2, H + 3.0, (zN + zS) / 2 - 3, 1.6, 0.4, 1.6, col('#6c7075'));
  }
  glassWall(G, M, x0 + 2, x1 - 2, 3.0, 4.6, zN - 0.02, -1, 3, [], col('#ffffff'));
  glassWall(G, M, x0 + 2, x1 - 2, 7.6, 9.4, zN - 0.02, -1, 3, [], col('#ffffff'));
}

export function buildTerminal(B, atlas) {
  const { matte: M, metal: T, glass: G, decal: D } = B;
  const [cx, , cz] = TERMINAL.center;
  const [w, d] = TERMINAL.size;
  const x0 = cx - w / 2, x1 = cx + w / 2, zS = cz + d / 2, zN = cz - d / 2;
  const pw = 70, px0 = cx - pw / 2, px1 = cx + pw / 2;
  wing(B, x0, px0 - 6, zS, zN);
  wing(B, px1 + 6, x1, zS, zN);
  M.box(x0 - 0.3, 6, cz, 0.6, 12.6, d + 0.6, STONE);
  M.box(x1 + 0.3, 6, cz, 0.6, 12.6, d + 0.6, STONE);

  // central royal pavilion
  const PH = 17;
  const zg = zS - 0.6;
  M.box(cx, PH / 2, zN + 4, pw, PH, 8, RENDER);
  for (const sx of [-1, 1]) M.box(cx + sx * (pw / 2 + 0.3), (PH + 0.4) / 2, cz, 0.6, PH + 0.4, d, STONE);
  M.box(cx, PH + 0.1, cz, pw, 0.4, d, col('#8f9295'));
  const L = B.lit || M;
  L.box(cx, 0.05, (zN + zg) / 2 + 4, pw, 0.1, zg - zN - 8, col('#d8d0c0'));
  L.box(cx, PH - 4.3, (zN + zg) / 2 + 4, pw, 0.4, zg - zN - 8, col('#f4eee2'));
  L.box(cx, 6, zg - 10, pw - 6, 0.4, 12, col('#f4eee2'));
  L.box(cx, PH / 2, zN + 8.05, pw, PH, 0.1, col('#d9c39a'));
  for (let x = px0 + 8; x < px1 - 5; x += 9) L.box(x, 0.6, zg - 22, 5, 1.2, 1.6, col('#9a7348'));
  for (const sx of [-1, 1]) {
    L.box(cx + sx * 14, 7, zg - 30, 6, 12, 0.2, col('#6a2fa6'));
    M.box(cx + sx * 14, 13.1, zg - 30, 6.4, 0.3, 0.3, GOLD);
  }
  for (let x = px0 + 6; x < px1 - 4; x += 8) L.box(x, 5.78, zg - 8, 4, 0.05, 1, col('#fffbe8', 1.4));
  for (const sx of [-14, 0, 14]) {
    T.geo(new THREE.SphereGeometry(1.1, 10, 6), mat(cx + sx, 10.5, zg - 14), GOLD);
    T.geo(new THREE.CylinderGeometry(0.04, 0.04, 2.3, 4), mat(cx + sx, 11.9, zg - 14), GOLD);
  }
  glassWall(G, M, px0, px1, 0.15, 12.6, zg, 1, 3.5, [3.2, 6.4, 9.6], col('#ffffff'));
  M.box(cx, 14.9, zS - 0.4, pw, 4.6, 1.0, STONE);
  M.box(cx, 12.75, zS, pw, 0.3, 0.5, GOLD);
  M.box(cx, 17.3, zS - 0.1, pw + 0.6, 0.6, 1.2, STONE2);
  decalQuad(D, atlas.uv.name, cx, 14.4, zS + 0.12, 46, 3.45);
  decalQuad(D, atlas.uv.name, cx, 14.4, zN - 0.12, 46, 3.45, Math.PI);
  M.box(cx, 14.9, zN + 0.4, pw, 4.6, 1.0, STONE);
  glassWall(G, M, px0 + 4, px1 - 4, 0.15, 11.5, zN + 1, -1, 3.5, [3.2, 6.4], col('#ffffff'));
  M.box(cx, 5.2, zN - 5, 40, 0.5, 11, ROOF);
  M.box(cx, 5.65, zN - 10.4, 40.4, 0.5, 0.2, PURPLE);
  for (const sx of [-18, -6, 6, 18]) M.box(cx + sx, 2.5, zN - 9.5, 0.4, 5, 0.4, MULL);

  // copper barrel vault
  const vault = new THREE.CylinderGeometry(d / 2 + 1, d / 2 + 1, pw + 2, 28, 1, true, 0, Math.PI);
  T.geo(vault, mat(cx, 17.4, cz, 0, 0, Math.PI / 2, 1, 1, 1).multiply(new THREE.Matrix4().makeScale(0.26, 1, 1)), COPPER);
  for (const sx of [-1, 1]) {
    const cap = new THREE.CircleGeometry(d / 2 + 1, 28, 0, Math.PI);
    M.geo(cap, mat(cx + sx * (pw / 2 + 1), 17.4, cz, 0, sx * Math.PI / 2, 0, 1, 0.26, 1), STONE);
  }
  for (let k = -3; k <= 3; k++) {
    const rib = new THREE.TorusGeometry(d / 2 + 1.15, 0.12, 4, 24, Math.PI);
    T.geo(rib, mat(cx + k * 10, 17.4, cz, 0, Math.PI / 2, 0).multiply(new THREE.Matrix4().makeScale(1, 0.26, 1)), GOLD);
  }

  // crown on the vault
  const ky = 17.4 + (d / 2 + 1) * 0.26;
  buildCrown(T, M, cx, ky, cz, 4.2);

  // pylons with flags each side of the pavilion
  for (const sx of [-1, 1]) {
    const x = cx + sx * (pw / 2 + 3);
    M.box(x, 11.5, zS - 4, 6, 23, 8.5, STONE);
    M.box(x, 23.2, zS - 4, 6.8, 0.6, 9.2, STONE2);
    for (let y = 3; y < 21; y += 3) M.box(x, y, zS + 0.25, 6.05, 0.12, 0.1, STONE2);
    decalQuad(D, atlas.uv.crest, x, 17.5, zS + 0.27, 5, 5);
    T.geo(new THREE.CylinderGeometry(0.12, 0.16, 9, 6), mat(x, 28, zS - 4), col('#e8e8e8'));
    T.geo(new THREE.SphereGeometry(0.35, 8, 6), mat(x, 32.6, zS - 4), GOLD);
    B.flags.push({ x: x + 0.1, y: 32.0, z: zS - 4, w: 5.4, h: 3.6, rect: sx < 0 ? atlas.uv.flag : atlas.uv.flag2, phase: sx });
  }
  decalQuad(D, atlas.uv.crest, cx, 17.0 + 3.4, zS + 0.35, 7, 7);

  const colliders = [
    { min: [x0, 0, zN], max: [x1, 13, zS + 4], kind: 'terminal' },
    { min: [px0 - 6, 0, zN - 11], max: [px1 + 6, 24, zS], kind: 'terminal' },
    { min: [px0, 0, zN], max: [px1, 17.4 + (d / 2 + 1) * 0.26, zS], kind: 'terminal' },
    { min: [cx - 5, 0, cz - 5], max: [cx + 5, ky + 8, cz + 5], kind: 'terminal' },
  ];
  return colliders;
}

export function buildCrown(T, M, x, y, z, r) {
  const GOLDC = GOLD, VEL = col('#8a1030'), ERM = col('#f5f2ea');
  T.geo(new THREE.CylinderGeometry(r, r * 0.95, r * 0.35, 24, 1, true), mat(x, y + r * 0.18, z), GOLDC);
  M.geo(new THREE.TorusGeometry(r * 0.98, r * 0.12, 6, 24), mat(x, y + 0.1, z, Math.PI / 2), ERM);
  M.geo(new THREE.SphereGeometry(r * 0.9, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(x, y + r * 0.3, z, 0, 0, 0, 1, 0.75, 1), VEL);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
    T.geo(new THREE.ConeGeometry(r * 0.22, r * 0.75, 4), mat(px, y + r * 0.7, pz, 0, -a + Math.PI / 4), GOLDC);
    M.geo(new THREE.SphereGeometry(r * 0.09, 6, 4), mat(px, y + r * 1.1, pz), ERM);
    const gem = ['#d61f45', '#2a7de1', '#1aa860'][k % 3];
    M.geo(new THREE.OctahedronGeometry(r * 0.1), mat(x + Math.cos(a + 0.39) * r * 1.01, y + r * 0.2, z + Math.sin(a + 0.39) * r * 1.01), col(gem, 1.3));
  }
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2;
    const arch = new THREE.TorusGeometry(r * 0.92, r * 0.05, 4, 12, Math.PI / 2);
    T.geo(arch, mat(x, y + r * 0.35, z, 0, a, 0).multiply(new THREE.Matrix4().makeScale(1, 1.05, 1)), GOLDC);
  }
  T.geo(new THREE.SphereGeometry(r * 0.2, 10, 8), mat(x, y + r * 1.35, z), GOLDC);
  T.geo(new THREE.BoxGeometry(r * 0.08, r * 0.45, r * 0.08), mat(x, y + r * 1.7, z), GOLDC);
  T.geo(new THREE.BoxGeometry(r * 0.3, r * 0.08, r * 0.08), mat(x, y + r * 1.72, z), GOLDC);
}

export function buildHangars(B) {
  const { matte: M, metal: T } = B;
  const out = [];
  const defs = [{ x: -385, open: true }, { x: -327, open: false }];
  for (const h of defs) {
    const W = 48, D = 40, H = 9, z0 = -302, z1 = z0 + D, cz = (z0 + z1) / 2;
    const wall = col('#aeb4ba'), door = col('#8e979f'), dark = col('#1c1e20');
    M.box(h.x, H / 2, cz, W, H, D, wall);
    const vault = new THREE.CylinderGeometry(W / 2, W / 2, D, 24, 1, true, 0, Math.PI);
    M.geo(vault, mat(h.x, H, cz, 0, Math.PI / 2, Math.PI / 2).multiply(new THREE.Matrix4().makeScale(0.3, 1, 1)), col('#8f979e'));
    for (let k = 1; k < 8; k++) M.geo(new THREE.TorusGeometry(W / 2 + 0.08, 0.1, 3, 16, Math.PI), mat(h.x, H, z0 + k * D / 8, 0, 0, 0, 1, 0.3, 1), col('#7b838a'));
    for (const zz of [z0, z1]) {
      const cap = new THREE.CircleGeometry(W / 2, 24, 0, Math.PI);
      M.geo(cap, mat(h.x, H, zz + (zz === z1 ? 0.01 : -0.01), 0, zz === z1 ? 0 : Math.PI, 0, 1, 0.3, 1), col('#9ea5ab'));
      for (let k = -5; k <= 5; k++) M.box(h.x + k * 4, H + 3.6 * Math.sqrt(Math.max(0, 1 - Math.pow(k * 4 / (W / 2), 2))), zz + (zz === z1 ? 0.08 : -0.08), 0.18, 7.2 * Math.sqrt(Math.max(0, 1 - Math.pow(k * 4 / (W / 2), 2))) * 0.98, 0.12, col('#8a9197'));
    }
    const nd = 6, dw = (W - 2) / nd;
    for (let k = 0; k < nd; k++) {
      const x = h.x - W / 2 + 1 + dw * (k + 0.5);
      const isOpen = h.open && (k === 2 || k === 3);
      if (isOpen) { M.box(x, 4.4, z1 + 0.06, dw, 8.8, 0.1, dark); continue; }
      M.box(x, 4.4, z1 + 0.25, dw - 0.15, 8.8, 0.3, door);
      for (let y = 1.2; y < 8.8; y += 1.6) M.box(x, y, z1 + 0.42, dw - 0.3, 0.08, 0.08, col('#7d858c'));
    }
    M.box(h.x, 9.4, z1 + 0.6, W + 0.5, 1.2, 0.8, col('#4b1f7a'));
    for (let k = 0; k <= 12; k++) M.box(h.x - W / 2 - 0.15, H / 2, z0 + k * D / 12, 0.2, H, 0.25, col('#a2a8ae'));
    for (let k = 0; k <= 12; k++) M.box(h.x + W / 2 + 0.15, H / 2, z0 + k * D / 12, 0.2, H, 0.25, col('#a2a8ae'));
    out.push({ min: [h.x - W / 2, 0, z0], max: [h.x + W / 2, H + W / 2 * 0.3, z1 + 1], kind: 'hangar' });
  }
  return out;
}
