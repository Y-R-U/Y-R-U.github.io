// Maeve — the second hero. Still low-poly, but rounded: sphere head with
// sculpted face, lathe-profile fitted torso, capsule limbs with elbow joints,
// A-line leather skirt, copper ponytail that sways. Same rig contract as
// makeHumanoid: { group, parts, animate(t, walk) } so the combat layer and
// player controller treat both heroes identically.

import * as THREE from 'three';
import { M, mesh } from './utils.js';

const SKIN   = 0xeec9a4;
const TUNIC  = 0x2f6e5e; // deep teal-green
const LEATHER = 0x5a3d28;
const BRACER = 0x6e4a26;
const LEGGING = 0x43352b;
const HAIR   = 0xa14e26; // copper
const GOLD   = 0xcaa34a;
const LIP    = 0xc4766a;

export function makeHeroine() {
  const g = new THREE.Group();
  const parts = {};

  // ── legs: hip pivots, capsule leg + tall boots ──
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.088, 0.6, 0);
    pivot.add(mesh(new THREE.CapsuleGeometry(0.052, 0.3, 4, 8), M(LEGGING), 0, -0.24, 0));
    pivot.add(mesh(new THREE.CylinderGeometry(0.058, 0.066, 0.22, 10), M(LEATHER), 0, -0.45, 0));
    pivot.add(mesh(new THREE.TorusGeometry(0.06, 0.014, 6, 10).rotateX(Math.PI / 2), M(BRACER), 0, -0.345, 0));
    const foot = mesh(new THREE.SphereGeometry(0.055, 8, 6), M(LEATHER), 0, -0.575, 0.035);
    foot.scale.set(1, 0.5, 1.7);
    pivot.add(foot);
    g.add(pivot);
    parts[side < 0 ? 'lLeg' : 'rLeg'] = pivot;
  }

  // ── skirt + belt (on the body, not the legs) ──
  const skirt = mesh(new THREE.CylinderGeometry(0.15, 0.215, 0.17, 12, 1, true),
    M(LEATHER, { side: THREE.DoubleSide }), 0, 0.585, 0);
  g.add(skirt);
  const flap = mesh(new THREE.BoxGeometry(0.11, 0.19, 0.018), M(0x4a3220), 0, 0.55, 0.17);
  flap.rotation.x = 0.18; g.add(flap);
  g.add(mesh(new THREE.TorusGeometry(0.155, 0.02, 6, 14).rotateX(Math.PI / 2), M(0x3a2a1a), 0, 0.665, 0));
  g.add(mesh(new THREE.SphereGeometry(0.028, 8, 6), M(GOLD, { metalness: 0.7, roughness: 0.35 }), 0, 0.665, 0.155));

  // ── torso: lathe profile (hip → waist → chest → shoulders) ──
  const profile = [
    new THREE.Vector2(0.145, 0), new THREE.Vector2(0.13, 0.08), new THREE.Vector2(0.105, 0.16),
    new THREE.Vector2(0.12, 0.26), new THREE.Vector2(0.145, 0.33), new THREE.Vector2(0.135, 0.41),
    new THREE.Vector2(0.10, 0.47), new THREE.Vector2(0.055, 0.5),
  ];
  const torso = mesh(new THREE.LatheGeometry(profile, 12), M(TUNIC), 0, 0.62, 0);
  g.add(torso);
  parts.torso = torso;
  // subtle bust
  const chest = mesh(new THREE.SphereGeometry(0.085, 10, 8), M(TUNIC), 0, 0.33, 0.07);
  chest.scale.set(1.3, 0.6, 0.65);
  torso.add(chest);
  // leather bodice band + gold lacing
  const bodice = mesh(new THREE.LatheGeometry([
    new THREE.Vector2(0.152, 0.02), new THREE.Vector2(0.135, 0.08),
    new THREE.Vector2(0.112, 0.17), new THREE.Vector2(0.128, 0.25),
  ], 12), M(LEATHER), 0, 0, 0);
  torso.add(bodice);
  for (let i = 0; i < 4; i++)
    torso.add(mesh(new THREE.SphereGeometry(0.012, 6, 5),
      M(GOLD, { metalness: 0.7, roughness: 0.35 }), 0, 0.06 + i * 0.055, 0.128 + i * 0.004, false));

  // ── neck + collar ──
  g.add(mesh(new THREE.CylinderGeometry(0.042, 0.05, 0.09, 8), M(SKIN), 0, 1.12, 0));
  g.add(mesh(new THREE.TorusGeometry(0.055, 0.014, 6, 10).rotateX(Math.PI / 2), M(LEATHER), 0, 1.1, 0));

  // ── arms: shoulder pivot → upper capsule → elbow → bracer forearm + hand ──
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.205, 1.05, 0);
    const pauldron = mesh(new THREE.SphereGeometry(0.064, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), M(LEATHER), 0, 0.035, 0);
    pauldron.rotation.z = side * 0.12;
    pivot.add(pauldron);
    pivot.add(mesh(new THREE.CapsuleGeometry(0.042, 0.14, 4, 8), M(TUNIC), 0, -0.11, 0));
    const elbow = new THREE.Group();
    elbow.position.set(0, -0.215, 0);
    elbow.add(mesh(new THREE.CapsuleGeometry(0.04, 0.13, 4, 8), M(BRACER), 0, -0.085, 0));
    elbow.add(mesh(new THREE.SphereGeometry(0.046, 8, 6), M(SKIN), 0, -0.195, 0));
    pivot.add(elbow);
    g.add(pivot);
    parts[side < 0 ? 'lArm' : 'rArm'] = pivot;
    parts[side < 0 ? 'elbowL' : 'elbowR'] = elbow;
  }

  // ── head: sphere with sculpted face ──
  const head = new THREE.Group();
  head.position.y = 1.16;
  const skull = mesh(new THREE.SphereGeometry(0.15, 14, 11), M(SKIN), 0, 0.155, 0);
  skull.scale.set(0.92, 1.04, 0.95);
  head.add(skull);
  for (const side of [-1, 1]) {
    const eye = mesh(new THREE.SphereGeometry(0.024, 8, 6), M(0x35251c, { roughness: 0.3 }),
      side * 0.058, 0.168, 0.122, false);
    eye.scale.set(1, 1.25, 0.5);
    head.add(eye);
    const brow = mesh(new THREE.BoxGeometry(0.05, 0.009, 0.012), M(0x7a3a1c),
      side * 0.058, 0.207, 0.128, false);
    brow.rotation.z = side * -0.18;
    head.add(brow);
  }
  const nose = mesh(new THREE.SphereGeometry(0.013, 6, 5), M(SKIN), 0, 0.135, 0.142, false);
  nose.scale.set(0.9, 1.3, 1);
  head.add(nose);
  const lips = mesh(new THREE.SphereGeometry(0.021, 8, 5), M(LIP, { roughness: 0.5 }), 0, 0.094, 0.134, false);
  lips.scale.set(1.45, 0.5, 0.55);
  head.add(lips);

  // ── hair: open-faced cap (top + back/side curtain) + fringe + ponytail ──
  const hairMat = M(HAIR, { roughness: 0.8 });
  // top of the head — full circle down to brow level
  const capTop = mesh(new THREE.SphereGeometry(0.162, 14, 8, 0, Math.PI * 2, 0, 0.95), hairMat, 0, 0.165, -0.01);
  capTop.scale.set(0.96, 1.02, 1.02);
  head.add(capTop);
  // back + sides, leaving the face window open (φ wraps past the back)
  const curtain = mesh(new THREE.SphereGeometry(0.162, 14, 8, Math.PI - 0.6, Math.PI + 1.2, 0.7, 1.5), hairMat, 0, 0.165, -0.01);
  curtain.scale.set(0.96, 1.06, 1.02);
  head.add(curtain);
  // fringe hugging the cap rim above the brows
  const fringeMid = mesh(new THREE.SphereGeometry(0.052, 8, 6), hairMat, 0, 0.262, 0.098);
  fringeMid.scale.set(1.5, 0.55, 0.7);
  head.add(fringeMid);
  for (const side of [-1, 1]) {
    const f = mesh(new THREE.SphereGeometry(0.042, 8, 6), hairMat, side * 0.07, 0.255, 0.082);
    f.scale.set(1.0, 0.55, 0.75); f.rotation.z = side * 0.22;
    head.add(f);
    const lock = mesh(new THREE.CapsuleGeometry(0.027, 0.11, 4, 8), hairMat, side * 0.118, 0.105, 0.058);
    lock.rotation.z = side * 0.08; lock.rotation.x = 0.08;
    head.add(lock);
  }
  const pony = new THREE.Group();
  pony.position.set(0, 0.265, -0.13);
  pony.add(mesh(new THREE.TorusGeometry(0.035, 0.013, 6, 10), M(GOLD, { metalness: 0.7, roughness: 0.35 }), 0, 0, 0, false));
  pony.add(mesh(new THREE.SphereGeometry(0.065, 10, 8), hairMat, 0, -0.07, -0.02));
  pony.add(mesh(new THREE.SphereGeometry(0.054, 9, 7), hairMat, 0, -0.17, -0.05));
  pony.add(mesh(new THREE.SphereGeometry(0.044, 8, 6), hairMat, 0, -0.27, -0.075));
  const tip = mesh(new THREE.ConeGeometry(0.03, 0.13, 8), hairMat, 0, -0.36, -0.09);
  tip.rotation.x = Math.PI;
  pony.add(tip);
  head.add(pony);
  parts.pony = pony;
  g.add(head);
  parts.head = head;

  g.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });

  return {
    group: g, parts,
    animate(t, walk) {
      const swing = Math.sin(t * 8.4) * 0.55 * walk;
      parts.lLeg.rotation.x = swing;
      parts.rLeg.rotation.x = -swing;
      parts.lArm.rotation.x = -swing * 0.75 + Math.sin(t * 1.6) * 0.05 * (1 - walk);
      parts.rArm.rotation.x = swing * 0.75 + Math.sin(t * 1.7 + 1) * 0.05 * (1 - walk);
      parts.lArm.rotation.z = 0.1;
      parts.rArm.rotation.z = -0.1;
      parts.elbowL.rotation.x = -0.15 - Math.abs(swing) * 0.3;
      parts.elbowR.rotation.x = -0.15 - Math.abs(swing) * 0.3;
      parts.head.rotation.y = Math.sin(t * 0.45) * 0.15 * (1 - walk);
      parts.head.rotation.z = Math.sin(t * 8.4) * 0.02 * walk;
      parts.pony.rotation.x = 0.45 + Math.abs(Math.sin(t * 8.4)) * 0.12 * walk + Math.sin(t * 1.3) * 0.04;
      parts.pony.rotation.z = Math.sin(t * 8.4 - 0.6) * 0.14 * walk + Math.sin(t * 1.1) * 0.05 * (1 - walk);
      parts.torso.scale.x = 1 + Math.sin(t * 2.4) * 0.01 * (1 - walk);
      return Math.abs(Math.sin(t * 8.4)) * 0.045 * walk; // bob
    },
  };
}
