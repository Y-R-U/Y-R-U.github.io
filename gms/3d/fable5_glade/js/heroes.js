// Heroes 3 + 4 — mid-budget rigs (~1.5–2k tris with sword): rounder than
// box-Roland, far cheaper than Maeve (lower sphere/capsule segment counts,
// fewer accent meshes). Garrick is an armoured knight, Wren a hooded scout.
// Same rig contract as makeHumanoid/makeHeroine:
// { group, parts {lLeg,rLeg,lArm,rArm,elbowL,elbowR,torso,head}, animate(t, walk) → bob }

import * as THREE from 'three';
import { M, mesh } from './utils.js';

const GOLD = 0xcaa34a;
const goldM = () => M(GOLD, { metalness: 0.7, roughness: 0.35 });

// Shoulder pivot → upper capsule → elbow group → forearm + hand. Same joint
// spacing as Maeve so attachCombat's hand offset lines up unchanged.
function addArms(g, parts, { upper, fore, hand, shoulderX, pauldron }) {
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * shoulderX, 1.05, 0);
    if (pauldron) {
      const p = mesh(new THREE.SphereGeometry(0.068, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), pauldron, 0, 0.04, 0);
      p.rotation.z = side * 0.14;
      pivot.add(p);
    }
    pivot.add(mesh(new THREE.CapsuleGeometry(0.044, 0.13, 2, 7), upper, 0, -0.105, 0));
    const elbow = new THREE.Group();
    elbow.position.set(0, -0.215, 0);
    elbow.add(mesh(new THREE.CapsuleGeometry(0.04, 0.12, 2, 7), fore, 0, -0.08, 0));
    elbow.add(mesh(new THREE.SphereGeometry(0.046, 6, 4), hand, 0, -0.195, 0));
    pivot.add(elbow);
    g.add(pivot);
    parts[side < 0 ? 'lArm' : 'rArm'] = pivot;
    parts[side < 0 ? 'elbowL' : 'elbowR'] = elbow;
  }
}

function addLegs(g, parts, { thigh, boot, foot, hipX, bootTop }) {
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * hipX, 0.6, 0);
    pivot.add(mesh(new THREE.CapsuleGeometry(0.054, 0.28, 2, 7), thigh, 0, -0.23, 0));
    pivot.add(mesh(new THREE.CylinderGeometry(0.058, 0.068, 0.2, 8), boot, 0, -0.45, 0));
    if (bootTop) pivot.add(mesh(new THREE.CylinderGeometry(0.067, 0.072, 0.05, 8), bootTop, 0, -0.355, 0));
    const f = mesh(new THREE.SphereGeometry(0.055, 7, 4), foot, 0, -0.565, 0.035);
    f.scale.set(1, 0.55, 1.7);
    pivot.add(f);
    g.add(pivot);
    parts[side < 0 ? 'lLeg' : 'rLeg'] = pivot;
  }
}

// Eyes / brows / nose on a Maeve-proportioned skull (sphere r0.15 at y 0.155).
function addFace(head, { skin, eye = 0x2c2018, brow, browTilt = -0.15, lips }) {
  for (const side of [-1, 1]) {
    const e = mesh(new THREE.SphereGeometry(0.023, 6, 4), M(eye, { roughness: 0.3 }), side * 0.056, 0.166, 0.121, false);
    e.scale.set(1, 1.2, 0.5);
    head.add(e);
    const b = mesh(new THREE.BoxGeometry(0.05, 0.01, 0.012), M(brow), side * 0.057, 0.204, 0.127, false);
    b.rotation.z = side * browTilt;
    head.add(b);
  }
  const nose = mesh(new THREE.SphereGeometry(0.013, 5, 4), M(skin), 0, 0.133, 0.14, false);
  nose.scale.set(0.9, 1.3, 1);
  head.add(nose);
  if (lips) {
    const l = mesh(new THREE.SphereGeometry(0.02, 6, 4), M(lips, { roughness: 0.5 }), 0, 0.094, 0.132, false);
    l.scale.set(1.4, 0.5, 0.55);
    head.add(l);
  }
}

// ───────── Hero 3 — Garrick, the knight ─────────

export function makeKnight() {
  const g = new THREE.Group();
  const parts = {};
  const STEEL = () => M(0xb9c2cf, { metalness: 0.4, roughness: 0.42 });
  const STEEL_D = () => M(0x76808f, { metalness: 0.35, roughness: 0.5 });
  const CRIMSON = 0x96333a;
  const SKIN = 0xdfb08a;

  addLegs(g, parts, { hipX: 0.092, thigh: STEEL_D(), boot: STEEL(), bootTop: STEEL_D(), foot: STEEL() });

  // crimson tasset skirt + belt
  const skirt = mesh(new THREE.CylinderGeometry(0.155, 0.225, 0.18, 10, 1, true),
    M(CRIMSON, { side: THREE.DoubleSide }), 0, 0.585, 0);
  g.add(skirt);
  g.add(mesh(new THREE.CylinderGeometry(0.165, 0.165, 0.05, 10), M(0x4a3320), 0, 0.665, 0));
  g.add(mesh(new THREE.BoxGeometry(0.09, 0.08, 0.04), goldM(), 0, 0.665, 0.15));

  // cuirass: lathe profile, chest plate bulge, heraldic tabard stripe
  const torso = mesh(new THREE.LatheGeometry([
    new THREE.Vector2(0.15, 0), new THREE.Vector2(0.14, 0.07), new THREE.Vector2(0.125, 0.15),
    new THREE.Vector2(0.145, 0.25), new THREE.Vector2(0.16, 0.34), new THREE.Vector2(0.15, 0.42),
    new THREE.Vector2(0.105, 0.47), new THREE.Vector2(0.06, 0.5),
  ], 11), STEEL(), 0, 0.62, 0);
  g.add(torso);
  parts.torso = torso;
  const chest = mesh(new THREE.SphereGeometry(0.1, 7, 4), STEEL(), 0, 0.34, 0.075);
  chest.scale.set(1.35, 0.7, 0.6);
  torso.add(chest);
  const tabard = mesh(new THREE.BoxGeometry(0.12, 0.3, 0.02), M(CRIMSON), 0, 0.18, 0.135);
  tabard.rotation.x = 0.05;
  torso.add(tabard);
  torso.add(mesh(new THREE.BoxGeometry(0.05, 0.05, 0.018), goldM(), 0, 0.27, 0.148, false));

  addArms(g, parts, { shoulderX: 0.225, upper: STEEL_D(), fore: STEEL(), hand: STEEL_D(), pauldron: STEEL() });

  // gorget instead of a bare neck
  g.add(mesh(new THREE.CylinderGeometry(0.055, 0.078, 0.1, 8), STEEL_D(), 0, 1.115, 0));

  // head: skull + face + short beard, open-faced helm with crest
  const head = new THREE.Group();
  head.position.y = 1.16;
  const skull = mesh(new THREE.SphereGeometry(0.15, 11, 8), M(SKIN), 0, 0.155, 0);
  skull.scale.set(0.95, 1.05, 0.97);
  head.add(skull);
  addFace(head, { skin: SKIN, brow: 0x4a3526 });
  const beard = mesh(new THREE.SphereGeometry(0.08, 7, 4), M(0x6a4a32), 0, 0.06, 0.055, false);
  beard.scale.set(1.2, 0.85, 1.05);
  head.add(beard);

  const dome = mesh(new THREE.SphereGeometry(0.168, 11, 6, 0, Math.PI * 2, 0, 1.25), STEEL(), 0, 0.16, -0.005);
  head.add(dome);
  const guard = mesh(new THREE.SphereGeometry(0.168, 11, 5, Math.PI - 0.75, Math.PI + 1.5, 1.0, 1.3), STEEL(), 0, 0.16, -0.005);
  head.add(guard);
  head.add(mesh(new THREE.BoxGeometry(0.024, 0.1, 0.018), STEEL_D(), 0, 0.19, 0.15, false));
  head.add(mesh(new THREE.CylinderGeometry(0.172, 0.172, 0.03, 11, 1, true),
    M(GOLD, { metalness: 0.7, roughness: 0.35, side: THREE.DoubleSide }), 0, 0.21, -0.005));

  const crest = new THREE.Group();
  for (const [y, z, r] of [[0.34, 0.05, 0.05], [0.355, -0.02, 0.052], [0.33, -0.09, 0.046]]) {
    const c = mesh(new THREE.SphereGeometry(r, 5, 4), M(CRIMSON), 0, y, z);
    c.scale.set(0.36, 1.35, 1.7);
    crest.add(c);
  }
  head.add(crest);
  parts.crest = crest;
  g.add(head);
  parts.head = head;

  g.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });

  return {
    group: g, parts,
    animate(t, walk) {
      const swing = Math.sin(t * 7.6) * 0.5 * walk; // heavier, slower stride
      parts.lLeg.rotation.x = swing;
      parts.rLeg.rotation.x = -swing;
      parts.lArm.rotation.x = -swing * 0.7 + Math.sin(t * 1.5) * 0.04 * (1 - walk);
      parts.rArm.rotation.x = swing * 0.7 + Math.sin(t * 1.6 + 1) * 0.04 * (1 - walk);
      parts.lArm.rotation.z = 0.14;
      parts.rArm.rotation.z = -0.14;
      parts.elbowL.rotation.x = -0.12 - Math.abs(swing) * 0.25;
      parts.elbowR.rotation.x = -0.12 - Math.abs(swing) * 0.25;
      parts.head.rotation.y = Math.sin(t * 0.4) * 0.12 * (1 - walk);
      parts.crest.rotation.x = Math.sin(t * 7.6 - 0.5) * 0.05 * walk + Math.sin(t * 1.2) * 0.02;
      parts.torso.scale.x = 1 + Math.sin(t * 2.0) * 0.008 * (1 - walk);
      return Math.abs(Math.sin(t * 7.6)) * 0.055 * walk; // weighty bob
    },
  };
}

// ───────── Hero 4 — Wren, the hooded scout ─────────

export function makeScout() {
  const g = new THREE.Group();
  const parts = {};
  const HOOD = 0x5e7f47;  // moss green
  const HOOD_D = 0x49643a;
  const LEATHER = 0x7a5b3c; // warm mid-brown so she doesn't read as a silhouette
  const LEGGING = 0x5c5244;
  const SKIN = 0xead0ae;
  const HAIR = 0x4a3526;

  addLegs(g, parts, { hipX: 0.085, thigh: M(LEGGING), boot: M(0x4c3a28), foot: M(0x4c3a28) });
  // leather straps around the right thigh (scout kit)
  for (const y of [-0.16, -0.225])
    parts.rLeg.add(mesh(new THREE.CylinderGeometry(0.058, 0.058, 0.022, 8, 1, true), M(0x4c3a28), 0, y, 0));

  // utility belt: band, buckle, hip pouch
  g.add(mesh(new THREE.CylinderGeometry(0.148, 0.148, 0.045, 10), M(0x55402c), 0, 0.655, 0));
  g.add(mesh(new THREE.BoxGeometry(0.05, 0.045, 0.03), goldM(), 0, 0.655, 0.14));
  const pouch = mesh(new THREE.BoxGeometry(0.075, 0.085, 0.05), M(0x6b5138), -0.13, 0.6, 0.06);
  pouch.rotation.y = 0.4;
  g.add(pouch);

  // slim jerkin lathe + subtle chest
  const torso = mesh(new THREE.LatheGeometry([
    new THREE.Vector2(0.135, 0), new THREE.Vector2(0.12, 0.07), new THREE.Vector2(0.098, 0.16),
    new THREE.Vector2(0.115, 0.26), new THREE.Vector2(0.135, 0.33), new THREE.Vector2(0.125, 0.41),
    new THREE.Vector2(0.09, 0.47), new THREE.Vector2(0.05, 0.5),
  ], 11), M(LEATHER), 0, 0.62, 0);
  g.add(torso);
  parts.torso = torso;
  const chest = mesh(new THREE.SphereGeometry(0.08, 7, 4), M(LEATHER), 0, 0.32, 0.065);
  chest.scale.set(1.3, 0.6, 0.6);
  torso.add(chest);

  addArms(g, parts, { shoulderX: 0.195, upper: M(HOOD_D), fore: M(LEATHER), hand: M(SKIN) });

  // neck + shoulder mantle (short cape collar over the jerkin)
  g.add(mesh(new THREE.CylinderGeometry(0.04, 0.048, 0.09, 7), M(SKIN), 0, 1.12, 0));
  const mantle = mesh(new THREE.LatheGeometry([
    new THREE.Vector2(0.055, 0.05), new THREE.Vector2(0.15, -0.02), new THREE.Vector2(0.205, -0.13),
  ], 10), M(HOOD, { side: THREE.DoubleSide }), 0, 1.08, 0);
  g.add(mantle);
  g.add(mesh(new THREE.SphereGeometry(0.016, 6, 4), goldM(), 0, 1.08, 0.135, false)); // clasp

  // head: skull + feminine face, hood with open face window, fringe + braid
  const head = new THREE.Group();
  head.position.y = 1.16;
  const skull = mesh(new THREE.SphereGeometry(0.15, 11, 8), M(SKIN), 0, 0.155, 0);
  skull.scale.set(0.92, 1.04, 0.95);
  head.add(skull);
  addFace(head, { skin: SKIN, eye: 0x2f4a2c, brow: 0x2e231a, browTilt: -0.18, lips: 0xc4766a });

  const hoodMat = M(HOOD, { side: THREE.DoubleSide });
  // top scaled long in z so a lip overhangs the brow — reads "hood", not "haircut"
  const hoodTop = mesh(new THREE.SphereGeometry(0.17, 10, 5, 0, Math.PI * 2, 0, 1.0), hoodMat, 0, 0.165, 0.005);
  hoodTop.scale.set(0.98, 1.02, 1.16);
  head.add(hoodTop);
  const hoodSide = mesh(new THREE.SphereGeometry(0.17, 10, 5, Math.PI - 0.65, Math.PI + 1.3, 0.75, 1.55), hoodMat, 0, 0.16, -0.015);
  hoodSide.scale.set(0.98, 1.08, 1.05);
  head.add(hoodSide);
  const peak = mesh(new THREE.ConeGeometry(0.055, 0.2, 6), M(HOOD_D), 0, 0.24, -0.165);
  peak.rotation.x = -2.35; // folds back and down
  head.add(peak);
  // scout's feather pinned to the hood's right side
  const feather = mesh(new THREE.ConeGeometry(0.026, 0.24, 4), M(0xe4dcc2), 0.155, 0.3, -0.02, false);
  feather.scale.z = 0.4;
  feather.rotation.z = -0.7; feather.rotation.x = -0.55;
  head.add(feather);
  head.add(mesh(new THREE.SphereGeometry(0.016, 5, 4), goldM(), 0.148, 0.225, 0.04, false));
  // dark hair fringe peeking out under the hood rim
  const fringe = mesh(new THREE.SphereGeometry(0.05, 7, 4), M(HAIR), 0, 0.245, 0.105);
  fringe.scale.set(1.6, 0.5, 0.65);
  head.add(fringe);

  // braid falling over the right collarbone from under the hood
  const braid = new THREE.Group();
  braid.position.set(0.1, 0.08, 0.03);
  for (const [x, y, z, r] of [[0.012, -0.06, 0.045, 0.038], [0.024, -0.15, 0.078, 0.033], [0.033, -0.235, 0.105, 0.028]])
    braid.add(mesh(new THREE.SphereGeometry(r, 6, 4), M(HAIR), x, y, z));
  const tie = mesh(new THREE.ConeGeometry(0.018, 0.06, 5), M(HAIR), 0.038, -0.29, 0.12);
  tie.rotation.x = Math.PI;
  braid.add(tie);
  head.add(braid);
  parts.braid = braid;
  g.add(head);
  parts.head = head;

  g.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });

  return {
    group: g, parts,
    animate(t, walk) {
      const swing = Math.sin(t * 9.2) * 0.6 * walk; // quick, light stride
      parts.lLeg.rotation.x = swing;
      parts.rLeg.rotation.x = -swing;
      parts.lArm.rotation.x = -swing * 0.75 + Math.sin(t * 1.7) * 0.05 * (1 - walk);
      parts.rArm.rotation.x = swing * 0.75 + Math.sin(t * 1.8 + 1) * 0.05 * (1 - walk);
      parts.lArm.rotation.z = 0.1;
      parts.rArm.rotation.z = -0.1;
      parts.elbowL.rotation.x = -0.2 - Math.abs(swing) * 0.35;
      parts.elbowR.rotation.x = -0.2 - Math.abs(swing) * 0.35;
      parts.head.rotation.y = Math.sin(t * 0.5) * 0.16 * (1 - walk);
      parts.braid.rotation.x = Math.sin(t * 9.2 - 0.5) * 0.1 * walk + Math.sin(t * 1.4) * 0.03;
      parts.braid.rotation.z = Math.sin(t * 1.1) * 0.04;
      parts.torso.scale.x = 1 + Math.sin(t * 2.4) * 0.01 * (1 - walk);
      return Math.abs(Math.sin(t * 9.2)) * 0.04 * walk; // light bob
    },
  };
}
