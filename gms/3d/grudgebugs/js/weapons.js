// GRUDGE BUGS — weapon visuals + strike choreography. Ballistics live in
// physics.js; this file makes the flying things look like things.

import * as THREE from 'three';
import { mat } from './bugs.js';
const T = THREE;

export function makeProjectile(weaponId) {
  const g = new T.Group();
  if (weaponId === 'bazooka') {
    const body = new T.Mesh(new T.SphereGeometry(0.14, 10, 8), mat(0x8a5a2a, { rough: 0.7 }));
    body.scale.z = 1.5;
    const cap = new T.Mesh(new T.SphereGeometry(0.1, 10, 8), mat(0x6a4218));
    cap.position.z = 0.14; cap.scale.z = 1.2;
    const fin1 = new T.Mesh(new T.BoxGeometry(0.02, 0.14, 0.1), mat(0xd94436));
    fin1.position.z = -0.16;
    const fin2 = fin1.clone(); fin2.rotation.z = Math.PI / 2;
    g.add(body, cap, fin1, fin2);
    g.userData.spin = 'z';
  } else if (weaponId === 'grenade') {
    const body = new T.Mesh(new T.SphereGeometry(0.15, 12, 10), mat(0xc42a3a, { rough: 0.4 }));
    const stem = new T.Mesh(new T.CylinderGeometry(0.025, 0.025, 0.09, 6), mat(0x4a7d3a));
    stem.position.y = 0.17;
    const leaf = new T.Mesh(new T.SphereGeometry(0.05, 6, 5), mat(0x5d9c46));
    leaf.scale.set(1.6, 0.4, 1); leaf.position.set(0.06, 0.2, 0);
    g.add(body, stem, leaf);
    g.userData.spin = 'x';
  } else if (weaponId === 'cluster') {
    const body = new T.Mesh(new T.SphereGeometry(0.16, 12, 10), mat(0x5a4a8a, { rough: 0.45 }));
    for (let i = 0; i < 5; i++) {
      const wart = new T.Mesh(new T.SphereGeometry(0.05, 6, 5), mat(0x7a68b5));
      const a = i * 2.4;
      wart.position.set(Math.cos(a) * 0.13, Math.sin(a * 1.7) * 0.1, Math.sin(a) * 0.13);
      g.add(wart);
    }
    g.add(body);
    g.userData.spin = 'x';
  } else if (weaponId === 'dungball') {
    const body = new T.Mesh(new T.SphereGeometry(0.24, 9, 7), mat(0x5a4327, { rough: 1, flat: true }));
    for (let i = 0; i < 6; i++) {
      const lump = new T.Mesh(new T.SphereGeometry(0.07, 5, 4), mat(0x6b5233, { rough: 1, flat: true }));
      const a = i * 1.9;
      lump.position.set(Math.cos(a) * 0.2, Math.sin(a * 1.3) * 0.18, Math.sin(a) * 0.2);
      g.add(lump);
    }
    g.add(body);
    g.userData.spin = 'roll';
  } else if (weaponId === 'loogie') {
    const body = new T.Mesh(new T.SphereGeometry(0.11, 8, 6),
      mat(0xb8e858, { rough: 0.15, opacity: 0.85 }));
    body.scale.z = 1.8;
    const drip = new T.Mesh(new T.SphereGeometry(0.05, 6, 5), mat(0xb8e858, { rough: 0.15, opacity: 0.7 }));
    drip.position.z = -0.2;
    g.add(body, drip);
  } else {
    g.add(new T.Mesh(new T.SphereGeometry(0.12, 8, 6), mat(0x333333)));
  }
  g.traverse(m => { if (m.isMesh) m.castShadow = true; });
  return g;
}

// fuse spark for bounce weapons
export function makeFuseGlow() {
  const s = new T.Mesh(new T.SphereGeometry(0.05, 6, 5),
    mat(0xffd94a, { emissive: 0xffb020, emissiveIntensity: 2 }));
  s.position.y = 0.2;
  return s;
}

// THE SHOE — one colossal flip-flop of judgement
export function makeShoe() {
  const g = new T.Group();
  const sole = new T.Mesh(new T.CylinderGeometry(1.15, 1.25, 0.5, 18), mat(0x2e6fd9, { rough: 0.6 }));
  sole.scale.set(1, 1, 1.9);
  const soleTop = new T.Mesh(new T.CylinderGeometry(1.05, 1.1, 0.12, 18), mat(0x7aa8f0, { rough: 0.6 }));
  soleTop.scale.set(1, 1, 1.85); soleTop.position.y = 0.3;
  for (const s of [-1, 1]) {
    const strap = new T.Mesh(new T.TorusGeometry(0.75, 0.13, 8, 14, Math.PI * 0.75), mat(0xf5f0e6));
    strap.position.set(0.1 * s, 0.3, 0.5);
    strap.rotation.set(0, s * 0.6, s * -0.5 + (s < 0 ? Math.PI : 0));
    g.add(strap);
  }
  g.add(sole, soleTop);
  g.traverse(m => { if (m.isMesh) m.castShadow = true; });
  return g;
}

// Bee-52 mini bomber (cheap wasp silhouette; three fly in formation)
export function makeBomber() {
  const g = new T.Group();
  const body = new T.Mesh(new T.SphereGeometry(0.22, 8, 6), mat(0xd9a514));
  body.scale.z = 1.7;
  const stripe = new T.Mesh(new T.SphereGeometry(0.225, 8, 6), mat(0x232323));
  stripe.scale.set(0.98, 0.98, 0.4); stripe.position.z = -0.14;
  const nose = new T.Mesh(new T.SphereGeometry(0.12, 8, 6), mat(0x232323));
  nose.position.z = 0.32;
  const wings = [];
  for (const s of [-1, 1]) {
    const w = new T.Mesh(new T.PlaneGeometry(0.5, 0.2),
      mat(0xcfe4ff, { opacity: 0.45, side: T.DoubleSide }));
    w.position.set(0.22 * s, 0.12, 0);
    w.rotation.z = s * 0.4;
    w.userData.side = s;
    g.add(w); wings.push(w);
  }
  const goggle = new T.Mesh(new T.TorusGeometry(0.07, 0.02, 6, 12), mat(0x8a5a2a));
  goggle.position.set(0, 0.1, 0.3);
  g.add(body, stripe, nose, goggle);
  g.userData.wings = wings;
  return g;
}

export function animateBomber(b, t) {
  for (const w of b.userData.wings) w.rotation.z = w.userData.side * (0.4 + Math.sin(t * 55) * 0.5);
  b.position.y += Math.sin(t * 9) * 0.004;
}

// little falling bee-bomb
export function makeBeeBomb() {
  const g = new T.Group();
  const body = new T.Mesh(new T.SphereGeometry(0.1, 8, 6), mat(0x38342c));
  body.scale.y = 1.4;
  const fin = new T.Mesh(new T.ConeGeometry(0.06, 0.08, 6), mat(0xd9a514));
  fin.position.y = 0.16; fin.rotation.x = Math.PI;
  g.add(body, fin);
  return g;
}

// aiming reticle for point/line strikes
export function makeReticle(color = 0xff5a3a) {
  const g = new T.Group();
  const ring = new T.Mesh(new T.TorusGeometry(0.7, 0.05, 8, 28),
    mat(color, { emissive: color, emissiveIntensity: 0.8 }));
  ring.rotation.x = Math.PI / 2;
  const dot = new T.Mesh(new T.SphereGeometry(0.09, 8, 6),
    mat(color, { emissive: color, emissiveIntensity: 1 }));
  g.add(ring, dot);
  g.userData.ring = ring;
  return g;
}

// dotted trajectory preview
export function makeTrajectory(n = 24) {
  const g = new T.Group();
  const geo = new T.SphereGeometry(0.05, 6, 5);
  const m = mat(0xffffff, { emissive: 0xffffff, emissiveIntensity: 0.6, opacity: 0.75 });
  for (let i = 0; i < n; i++) {
    const d = new T.Mesh(geo, m);
    d.visible = false;
    g.add(d);
  }
  return g;
}
export function setTrajectory(g, path, upTo = 1.0) {
  const dots = g.children;
  const tMax = Math.min(path[path.length - 1].t, upTo);
  for (let i = 0; i < dots.length; i++) {
    const t = (i / (dots.length - 1)) * tMax;
    let p = null;
    for (let k = 1; k < path.length; k++) if (path[k].t >= t) { p = path[k]; break; }
    if (!p) { dots[i].visible = false; continue; }
    dots[i].visible = true;
    dots[i].position.set(p.x, p.y, p.z);
    dots[i].scale.setScalar(1 - (i / dots.length) * 0.55);
  }
}
