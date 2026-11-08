// Star Station theme — backdrop set pieces (merged into Buckets; low segment counts, they sit 30-90 m away):
// the main orbital station (a hub with domed ends, a habitat ring on spokes, docking modules, two big
// solar wings, antenna dishes, lit windows, blinking beacons), a solar array farm (a long truss with
// panel pairs and a dish cluster) and small floating platforms with props.
// Builders return { glows: [{p, w, color, a}], blinks: [{p, w, color, phase}] } in world space.
import * as THREE from 'three';
import { mat, rng } from './util.js';
import { roundIsland, spikes } from './island.js';
import { COLORS as K, beaconPylon, crate, canisters, dish, antenna, solarPanel } from './props.js';

const RED = [1, 0.35, 0.3], TEAL = [0.4, 1, 0.95], AMBER = [1, 0.75, 0.35], WHITE = [0.9, 0.95, 1];
const W = (M, v) => v.clone().applyMatrix4(M);

/** Solar wing: a truss along +X of length L with `n` panel pairs (height h), at M. */
function solarWing(b, M, L, n, h, lo) {
  b.add('metal', new THREE.BoxGeometry(L, 0.25, 0.25), K.metal, M.clone().multiply(mat(L / 2, 0, 0)));
  const pw = L / n;
  for (let i = 0; i < n; i++) {
    for (const s of [1, -1]) {
      const P = M.clone().multiply(mat(pw * (i + 0.5), s * (h / 2 + 0.3), 0));
      b.add('metal', new THREE.BoxGeometry(pw * 0.94, h, 0.06), i % 2 ? K.cell : K.cell2, P);
      if (!lo) b.add('metal', new THREE.BoxGeometry(pw * 0.96, 0.08, 0.08), K.gold, P.clone().multiply(mat(0, s * h / 2, 0)));
    }
  }
}

/** The main station. M = placement (local Y up). Overall ~44 m across. */
export function buildStation(b, M, hi) {
  const glows = [], blinks = [];
  const seg = hi ? 16 : 10;
  // central hub: a vertical cylinder with domed ends and a band of lit windows
  b.add('panel', new THREE.CylinderGeometry(3.2, 3.2, 12, seg), K.white, M.clone().multiply(mat(0, 0, 0)));
  for (const s of [1, -1]) {
    b.add('panel', new THREE.SphereGeometry(3.2, seg, 4, 0, Math.PI * 2, 0, Math.PI / 2), K.white2, M.clone().multiply(mat(0, s * 6, 0, s < 0 ? Math.PI : 0, 0, 0)));
    b.add('vc', new THREE.CylinderGeometry(3.3, 3.3, 0.6, seg), K.teal, M.clone().multiply(mat(0, s * 4.5, 0)));
  }
  b.add('glow', new THREE.CylinderGeometry(3.25, 3.25, 0.35, seg, 1, true), 0xffe2a8, M.clone().multiply(mat(0, 1.5, 0)));
  b.add('glow', new THREE.CylinderGeometry(3.25, 3.25, 0.35, seg, 1, true), 0xffe2a8, M.clone().multiply(mat(0, -1.2, 0)));
  // a spire and a dish on top
  b.add('metal', new THREE.CylinderGeometry(0.25, 0.4, 6, 6), K.metal, M.clone().multiply(mat(0, 11.2, 0)));
  blinks.push({ p: W(M, new THREE.Vector3(0, 14.4, 0)), w: 2.4, color: RED, phase: 0 });
  // habitat ring on four spokes
  const ringR = 15;
  b.add('panel', new THREE.TorusGeometry(ringR, 1.4, hi ? 8 : 6, hi ? 40 : 24), K.white, M.clone().multiply(mat(0, 0, 0, Math.PI / 2, 0, 0)));
  b.add('glow', new THREE.TorusGeometry(ringR + 1.35, 0.18, 3, hi ? 40 : 24), 0x70fff0, M.clone().multiply(mat(0, 0, 0, Math.PI / 2, 0, 0)));
  for (let i = 0; i < 4; i++) {
    const a = i / 4 * Math.PI * 2 + Math.PI / 4;
    b.add('metal', new THREE.CylinderGeometry(0.45, 0.45, ringR - 3, 6), K.metal, M.clone().multiply(mat(Math.cos(a) * (ringR + 3) / 2, 0, Math.sin(a) * (ringR + 3) / 2, 0, -a, Math.PI / 2)));
  }
  for (let i = 0; i < (hi ? 8 : 4); i++) {
    const a = i / (hi ? 8 : 4) * Math.PI * 2;
    blinks.push({ p: W(M, new THREE.Vector3(Math.cos(a) * ringR, 1.5, Math.sin(a) * ringR)), w: 1.4, color: i % 2 ? TEAL : RED, phase: i / 8 });
  }
  // docking modules: capsules out along ±Z below the ring, with a docked shuttle
  for (const s of [1, -1]) {
    const C = M.clone().multiply(mat(0, -8.5, s * 6, Math.PI / 2, 0, 0));
    b.add('panel', new THREE.CylinderGeometry(1.4, 1.4, 6, hi ? 10 : 8), K.white2, C);
    b.add('vc', new THREE.CylinderGeometry(1.45, 1.45, 0.4, hi ? 10 : 8), K.orange, C.clone().multiply(mat(0, s * 2.2, 0)));
    b.add('panel', new THREE.SphereGeometry(1.4, hi ? 10 : 8, 3, 0, Math.PI * 2, 0, Math.PI / 2), K.white, C.clone().multiply(mat(0, s * 3, 0, s < 0 ? Math.PI : 0, 0, 0)));
    blinks.push({ p: W(M, new THREE.Vector3(0, -8.5, s * 9.6)), w: 1.6, color: AMBER, phase: 0.5 + s * 0.2 });
  }
  b.add('metal', new THREE.CylinderGeometry(0.8, 0.8, 4, 8), K.metal, M.clone().multiply(mat(0, -7, 0)));
  // shuttle docked at +Z: a wedge body, a cockpit visor, engine glow
  {
    const S = M.clone().multiply(mat(0, -8.5, 13.2));
    b.add('panel', new THREE.BoxGeometry(2.4, 1.2, 5), K.white, S);
    b.add('panel', new THREE.ConeGeometry(1.3, 2.4, 4), K.white2, S.clone().multiply(mat(0, 0, 3.6, Math.PI / 2, Math.PI / 4, 0)));
    b.add('panel', new THREE.BoxGeometry(6, 0.2, 2.2), K.white2, S.clone().multiply(mat(0, -0.3, -0.8)));
    b.add('gloss', new THREE.BoxGeometry(1.4, 0.4, 0.9), 0x203a5a, S.clone().multiply(mat(0, 0.55, 1.8, 0.4, 0, 0)));
    glows.push({ p: W(S, new THREE.Vector3(0, 0, -2.7)), w: 3.2, color: [0.5, 0.8, 1], a: 0.8 });
  }
  // two big solar wings out along ±X from the hub
  for (const s of [1, -1]) {
    const Wm = M.clone().multiply(mat(s * 3.2, 3, 0)).multiply(new THREE.Matrix4().makeRotationY(s > 0 ? 0 : Math.PI)).multiply(new THREE.Matrix4().makeRotationX(0.5));
    solarWing(b, Wm, 18, hi ? 5 : 3, 3.6, !hi);
    blinks.push({ p: W(Wm, new THREE.Vector3(18.5, 0, 0)), w: 1.6, color: s > 0 ? [0.4, 1, 0.5] : RED, phase: 0.25 });
  }
  // antenna dishes on the lower dome
  for (const [x, z, s] of [[2, 1.5, 4], [-1.8, -1.6, 3]]) {
    const D = M.clone().multiply(mat(x, -6.6, z, Math.PI, 0, 0));
    const tip = dish(b, D, s, !hi);
    glows.push({ p: W(D, tip), w: 1, color: RED, a: 0.7 });
  }
  glows.push({ p: W(M, new THREE.Vector3(0, 1.5, 0)), w: 12, color: [1, 0.85, 0.6], a: 0.18 });
  return { glows, blinks };
}

/** A solar array farm: a long truss with panel pairs both sides, a dish cluster and a control pod. */
export function buildArrayFarm(b, M, hi) {
  const glows = [], blinks = [];
  const L = 40;
  for (const s of [1, -1]) {
    const Wm = M.clone().multiply(mat(0, 0, 0)).multiply(new THREE.Matrix4().makeRotationY(s > 0 ? 0 : Math.PI)).multiply(new THREE.Matrix4().makeRotationX(-0.6));
    solarWing(b, Wm, L / 2, hi ? 5 : 3, 5, !hi);
    blinks.push({ p: W(Wm, new THREE.Vector3(L / 2 + 0.6, 0, 0)), w: 1.4, color: RED, phase: s > 0 ? 0.1 : 0.6 });
  }
  b.add('panel', new THREE.BoxGeometry(3, 2.4, 3), K.white, M);
  b.add('glow', new THREE.BoxGeometry(3.05, 0.3, 3.05), 0x70fff0, M.clone().multiply(mat(0, 0.6, 0)));
  for (let i = 0; i < 3; i++) {
    const D = M.clone().multiply(mat(-1 + i, 1.2, i === 1 ? 0.6 : -0.6, 0, i * 0.8, 0));
    const tip = dish(b, D, 2.2 - i * 0.4, !hi);
    glows.push({ p: W(D, tip), w: 0.8, color: RED, a: 0.7 });
  }
  return { glows, blinks };
}

/**
 * A small floating platform with a set of props. `basis` = view rotation (Matrix4). Adds its rock to `rocks`.
 * kind: 'dish' | 'crates' | 'beacons' | 'solar' | 'tower'.
 */
export function buildIsle(b, rocks, basis, p, R, D, kind, seed, hi) {
  const r = rng(seed);
  const glows = [], blinks = [];
  const { geometry } = roundIsland(R, D, seed, hi, hi ? 14 : 9);
  const IM = new THREE.Matrix4().makeTranslation(p.x, p.y, p.z).multiply(basis);
  geometry.applyMatrix4(IM);
  rocks.push(geometry);
  const sp = [];
  spikes(sp, 0, -D * 0.5, 0, R, D, hi ? 2 : 1, seed + 1);
  for (const g of sp) { g.applyMatrix4(IM); rocks.push(g); }
  const s = R / 2.5;   // props scale with the platform
  const Pm = (x, z, yaw = 0, k = s) => IM.clone().multiply(mat(x * R, -0.03, z * R, 0, yaw, 0, k));
  if (kind === 'dish') {
    const M2 = Pm(0, 0, r() * 6, s * 3);
    glows.push({ p: W(M2, dish(b, M2, 1, !hi)), w: 0.8 * s, color: RED, a: 0.8 });
  } else if (kind === 'crates') {
    for (let i = 0; i < 4; i++) crate(b, Pm((r() - 0.5) * 0.9, (r() - 0.5) * 0.9, r() * 6, s * (2 + r() * 1.5)), 0.3, i % 2);
    canisters(b, Pm(0.4, -0.3, 0, s * 2.5), 0.3, 3, !hi);
  } else if (kind === 'beacons') {
    for (let i = 0; i < 3; i++) {
      const a = i / 3 * Math.PI * 2, M2 = Pm(Math.cos(a) * 0.6, Math.sin(a) * 0.6, 0, s * 3);
      blinks.push({ p: W(M2, beaconPylon(b, M2, 0.5, !hi)), w: 0.7 * s, color: TEAL, phase: i / 3 });
    }
  } else if (kind === 'solar') {
    for (let i = 0; i < 3; i++) solarPanel(b, Pm(-0.5 + i * 0.5, 0.1 * (i - 1), 0.4, s * 3), 0.6, 0.4, 3);
  } else {
    const M2 = Pm(0, 0, 0, s * 3);
    blinks.push({ p: W(M2, antenna(b, M2, 1.4)), w: 0.8 * s, color: RED, phase: r() });
    crate(b, Pm(0.4, 0.3, 0.5, s * 2.5), 0.3, 1);
  }
  glows.push({ p: p.clone().add(new THREE.Vector3(0, -0.3, 0)), w: R * 1.8, color: WHITE, a: 0.05 });
  return { glows, blinks };
}
