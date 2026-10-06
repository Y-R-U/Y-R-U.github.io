import * as THREE from '../../vendor/three/three.module.js';
import { makeHalos, makePools } from './glow.js';
import { frameAt } from './houseBuild.js';
import { tree, bush, streetLamp } from './exterior.js';

// Intro dressing for the cul-de-sac (all in the far/street builder, so it is hidden during levels).
const GY = -0.3;
const FLOWERS = [0xe0543c, 0xf2b234, 0xf08aa0, 0xfbf3e2, 0xd04a7a, 0xffd25a];
let seed = 11;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

export function shrub(b, x, z, s = 1, col = 0x5d8f45) {
  const n = s > 0.8 ? 4 : 3;
  for (let i = 0; i < n; i++) {
    const a = i * 2.1 + rnd(), r = i ? 0.3 * s : 0;
    b.sphere('leaf', null, x + Math.cos(a) * r, GY + 0.42 * s + (i ? 0 : 0.12 * s), z + Math.sin(a) * r, (i ? 0.38 : 0.5) * s,
      i % 2 ? col : 0x6fa152, { scale: [1, 0.85, 1], ws: 9, hs: 7, cast: false });
  }
}

// Row of round shrubs from (x0,z0) to (x1,z1).
export function hedge(b, x0, z0, x1, z1, s = 0.7, gap = 0.75) {
  const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / (gap * s / 0.7)));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    shrub(b, x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, s * (0.85 + rnd() * 0.3), i % 3 ? 0x5d8f45 : 0x4f7f3c);
  }
}

// Soil strip with scattered flowers.
// Soil strip with scattered flowers; coordinates are local to frame f (world if omitted).
export function flowerBed(b, x0, z0, x1, z1, density = 9, f = null) {
  b.lbox('concrete', f, (x0 + x1) / 2, GY + 0.025, (z0 + z1) / 2, Math.abs(x1 - x0), 0.05, Math.abs(z1 - z0), 0x5a3a28, { cast: false });
  const n = Math.round(Math.abs((x1 - x0) * (z1 - z0)) * density);
  const p = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    p.set(x0 + (x1 - x0) * rnd(), 0, z0 + (z1 - z0) * rnd());
    if (f) p.applyMatrix4(f);
    const x = p.x, z = p.z;
    b.sphere('leaf', null, x, GY + 0.1, z, 0.1, 0x4f7f3c, { scale: [1, 0.6, 1], ws: 6, hs: 4, cast: false });
    b.sphere('leaf', null, x + 0.03, GY + 0.2 + rnd() * 0.06, z, 0.055 + rnd() * 0.02, FLOWERS[i % FLOWERS.length], { ws: 6, hs: 4, cast: false });
  }
}

export function mailbox(b, x, z, rot = 0, col = 0x3f6e9a) {
  const f = frameAt(x, GY, z, rot);
  b.lbox('wood', f, 0, 0.5, 0, 0.1, 1.0, 0.1, 0x8a5a36, { cast: false });
  b.lbox('gloss', f, 0, 1.12, 0.05, 0.28, 0.24, 0.48, col, { r: 0.08, cast: false });
  b.lbox('gloss', f, 0.16, 1.24, -0.05, 0.02, 0.24, 0.05, 0xd2513e, { cast: false });
}

// Rounded cartoon car; local +z = front.
export function car(b, x, z, rot, col) {
  const f = frameAt(x, GY, z, rot);
  b.lbox('gloss', f, 0, 0.62, 0, 1.8, 0.62, 4.1, col, { r: 0.22, seg: 2 });
  b.lbox('gloss', f, 0, 1.12, -0.25, 1.56, 0.5, 2.1, 0x2a3346, { r: 0.18, seg: 2, cast: false });
  b.lbox('gloss', f, 0, 1.39, -0.3, 1.5, 0.08, 1.8, col, { r: 0.04, cast: false });
  for (const sx of [-0.79, 0.79]) for (const sz of [-1.25, 1.3]) b.cyl('metal', f, sx, 0.33, sz, 0.33, 0.33, 0.24, 0x1d1d22, { rot: [0, 0, Math.PI / 2], radial: 14, cast: false });
  for (const sx of [-0.62, 0.62]) {
    b.lbox('glowWarm', f, sx, 0.72, 2.05, 0.3, 0.16, 0.04, 0xffffff, { cast: false });
    b.lbox('gloss', f, sx, 0.74, -2.05, 0.3, 0.14, 0.04, 0xc0302a, { cast: false });
  }
  b.lbox('metal', f, 0, 0.42, 2.07, 1.7, 0.14, 0.08, 0xc8c8cc, { cast: false });
  b.lbox('metal', f, 0, 0.42, -2.07, 1.7, 0.14, 0.08, 0xc8c8cc, { cast: false });
}

// Hero front yard + porch extras. Front lawn z -6.6..-0.2; porch x 5.4..8.8; driveway x -3.6..-0.6.
export function dressHero(b, glows) {
  seed = 11;
  hedge(b, -0.1, -0.6, 5.2, -0.6, 0.62);
  flowerBed(b, -0.1, -1.55, 5.2, -1.0, 8);
  hedge(b, 9.5, 2.0, 12.6, 2.0, 0.6);
  flowerBed(b, 9.5, 1.2, 12.6, 1.65, 8);
  for (const x of [6.22, 7.72]) flowerBed(b, x, -6.4, x + 0.26, -3.0, 10);
  // shrubs along the inside of the fence
  for (let x = -4.4; x < 14; x += 2.3) if (x < 5.5 || x > 8.6) shrub(b, x, -5.9 - rnd() * 0.3, 0.75 + rnd() * 0.3);
  for (let z = -4.5; z < 12; z += 2.6) { shrub(b, 14.0, z, 0.8); }
  tree(b, -4.3, -1.8, 0.75);
  tree(b, 11.5, -3.6, 0.85);
  // porch: planters, doormat, hanging baskets
  for (const x of [6.25, 7.95]) {
    b.cyl('ceramic', null, x, 0.17, -0.55, 0.19, 0.14, 0.34, 0xc4693e, { radial: 14, cast: false });
    for (let i = 0; i < 4; i++) b.sphere('leaf', null, x + Math.cos(i * 1.7) * 0.1, 0.48 + (i ? 0 : 0.08), -0.55 + Math.sin(i * 1.7) * 0.1, 0.16, i ? 0x5d8f45 : 0x6fa152, { ws: 8, hs: 6, cast: false });
    b.sphere('leaf', null, x, 0.62, -0.55, 0.06, 0xe0543c, { ws: 6, hs: 4, cast: false });
  }
  b.box('fabric', 6.75, 0.0, -1.05, 7.45, 0.015, -0.6, 0x8a4a3a, { cast: false });
  for (const x of [5.8, 8.4]) {
    b.cyl('metal', null, x, 2.38, -2.15, 0.006, 0.006, 0.4, 0x2f3a3a, { radial: 4, cast: false });
    b.sphere('wood', null, x, 2.12, -2.15, 0.13, 0x8a5a36, { scale: [1, 0.6, 1], ws: 10, hs: 6, cast: false });
    for (let i = 0; i < 7; i++) b.sphere('leaf', null, x + Math.cos(i) * 0.12, 2.12 - (i % 2) * 0.09, -2.15 + Math.sin(i) * 0.12, 0.055, [0x5d8f45, 0x6fa152, 0xd04a7a][i % 3], { ws: 6, hs: 5, cast: false });
  }
  // lamps flanking the front gate + Jon's car in the drive
  for (const x of [5.6, 8.6]) { streetLamp(b, x, -7.2, 0.72); glows.push([x, GY + 4.15 * 0.72, -7.2, 1]); }
  car(b, -2.1, -4.2, Math.PI, 0x6f9fc8);
  glows.push([7.82, 1.82, -0.42, 0.5]);
}

// Front-yard extras for a neighbour house (frame f: local +z faces the street, fz = front wall).
export function dressNeighbour(b, f, w, fz, nseed, glows) {
  seed = 100 + nseed * 7;
  const P = (x, z) => new THREE.Vector3(x, 0, z).applyMatrix4(f);
  const face = Math.atan2(f.elements[8], f.elements[10]);
  // flower bed under the front windows + fence along the front
  const fl = f.clone(); fl.elements[13] -= GY;
  flowerBed(b, -w / 2 + 0.3, fz + 0.9, -w * 0.02, fz + 1.4, 6, fl);
  if (nseed % 2 === 0) {
    for (let x = -w / 2 - 1; x < w / 2 - 0.2; x += 0.16) {
      if (Math.abs(x - w * 0.15) < 0.7) continue;
      const p = P(x, fz + 4.2);
      b.lbox('paint', frameAt(p.x, GY, p.z, face), 0, 0.42, 0, 0.07, 0.84, 0.025, 0xfbf6ea, { cast: false });
    }
    for (const y of [0.25, 0.62]) for (const [x0, x1] of [[-w / 2 - 1, w * 0.15 - 0.7], [w * 0.15 + 0.7, w / 2 - 0.2]]) {
      const p = P((x0 + x1) / 2, fz + 4.18);
      b.lbox('paint', frameAt(p.x, GY, p.z, face), 0, y, 0, x1 - x0, 0.06, 0.03, 0xf0e8d8, { cast: false });
    }
  } else {
    const p0 = P(-w / 2 - 0.8, fz + 4.0), p1 = P(w * 0.15 - 0.9, fz + 4.0);
    hedge(b, p0.x, p0.z, p1.x, p1.z, 0.6, 0.8);
  }
  const m = P(w / 2 + 0.2, fz + 4.4);
  mailbox(b, m.x, m.z, face, [0x3f6e9a, 0xd2513e, 0x4c7a3a][nseed % 3]);
  if (nseed % 3 !== 1) {
    const cp = P(w / 2 + 1.6, fz + 2.6);
    car(b, cp.x, cp.z, face, [0xd2513e, 0xf2c060, 0x8fb8d8, 0xe8e2d6, 0x6aa87a][nseed % 5]);
  }
  const pl = P(w * 0.15 + 0.7, fz + 0.06);
  glows.push([pl.x, 2.0 + GY, pl.z, 0.45]);
}

// Soft additive glow sprites round lamp bulbs + warm pools on the ground under street lamps: 2 draw calls total.
export function makeGlows(glows) {
  const group = new THREE.Group();
  group.name = 'lampGlows';
  group.add(makeHalos(glows.map(([x, y, z, s]) => [x, y, z, 2.6 * s])));
  group.add(makePools(glows.filter((g) => g[3] >= 0.7).map(([x, , z, s]) => [x, GY + 0.04, z, 5.5 * s])));
  return group;
}

// Shrubs + small trees scattered over open lawn so the neighbourhood doesn't read as bare turf.
export function scatter(b, bulb, lots) {
  seed = 777;
  const clear = (x, z) => {
    if (Math.hypot(x - bulb.x, z - bulb.z) < 13.5) return false;
    if (Math.abs(x - bulb.x) < 7.5 && z < bulb.z) return false;
    if (x > -6 && x < 16 && z > -8 && z < 27) return false;
    return !lots.some(([lx, lz]) => Math.hypot(x - lx, z - lz) < 8.5);
  };
  let placed = 0;
  for (let i = 0; i < 700 && placed < 110; i++) {
    const a = rnd() * Math.PI * 2, r = 13 + rnd() * 32;
    const x = bulb.x + Math.cos(a) * r, z = bulb.z + 6 + Math.sin(a) * r;
    if (!clear(x, z)) continue;
    placed++;
    if (placed % 5 === 0) tree(b, x, z, 0.7 + rnd() * 0.4, true);
    else shrub(b, x, z, 0.7 + rnd() * 0.5, rnd() < 0.5 ? 0x5d8f45 : 0x4f7f3c);
  }
}
