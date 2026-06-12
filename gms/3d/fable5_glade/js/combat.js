// Weapons + combat animation layer shared by all heroes. attachCombat() gives
// a rig back-carried weapons (scabbard / bow / staff), in-hand versions, a
// swing trail, and per-style draw / sheathe / attack overlays that run AFTER
// rig.animate() each frame (they override arms / torso, so locomotion keeps
// working underneath). Styles: 'sword' (melee), 'bow' (arrow), 'staff'
// (fireball) — ranged styles fire their projectile from rig.muzzle().

import * as THREE from 'three';
import { M, mesh } from './utils.js';

const GOLD = 0xcaa34a;

export function makeHeroSword() {
  const g = new THREE.Group(); // origin at grip centre, blade up +y
  const steel = M(0xe9eef5, { metalness: 0.5, roughness: 0.3 });
  const gold = M(GOLD, { metalness: 0.6, roughness: 0.35 });
  g.add(mesh(new THREE.BoxGeometry(0.095, 0.48, 0.026), steel, 0, 0.32, 0));
  g.add(mesh(new THREE.BoxGeometry(0.022, 0.44, 0.03), M(0x9aa6b8, { metalness: 0.5, roughness: 0.4 }), 0, 0.3, 0)); // fuller
  const tip = mesh(new THREE.ConeGeometry(0.067, 0.14, 4), steel, 0, 0.63, 0);
  tip.rotation.y = Math.PI / 4; tip.scale.z = 0.28; g.add(tip);
  g.add(mesh(new THREE.BoxGeometry(0.27, 0.055, 0.06), gold, 0, 0.07, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.028, 0.034, 0.16, 8), M(0x4a3320), 0, -0.03, 0));
  g.add(mesh(new THREE.SphereGeometry(0.042, 8, 6), gold, 0, -0.13, 0));
  return g;
}

// Recurve bow: origin at the riser (grip), limbs along ±y, string on -x side.
export function makeBow() {
  const g = new THREE.Group();
  const wood = M(0x6e4a26, { roughness: 0.7 });
  const limbs = mesh(new THREE.TorusGeometry(0.42, 0.021, 5, 12, 2.4).rotateZ(-1.2), wood, -0.42, 0, 0);
  g.add(limbs);
  // string between the limb tips
  const tipY = Math.sin(1.2) * 0.42, tipX = Math.cos(1.2) * 0.42 - 0.42;
  g.add(mesh(new THREE.CylinderGeometry(0.006, 0.006, tipY * 2, 4, 1, true), M(0xe8e2d0, { roughness: 0.5 }), tipX, 0, 0));
  // leather grip wrap + gold nocks
  g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.15, 6), M(0x4a3320), 0, 0, 0));
  for (const sy of [-1, 1]) g.add(mesh(new THREE.SphereGeometry(0.018, 5, 4), M(GOLD, { metalness: 0.6, roughness: 0.4 }), tipX, sy * tipY, 0, false));
  const tip = new THREE.Object3D();
  tip.position.set(-0.1, 0, 0);
  g.add(tip);
  g.userData.tip = tip;
  return g;
}

// Mage staff: origin at the grip (lower third), shaft up +y, crystal on top.
export function makeStaff() {
  const g = new THREE.Group();
  const wood = M(0x5a3d28, { roughness: 0.75 });
  g.add(mesh(new THREE.CylinderGeometry(0.02, 0.03, 1.3, 6), wood, 0, 0.2, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.16, 6), M(0x3a2a1a), 0, 0, 0));          // grip wrap
  g.add(mesh(new THREE.CylinderGeometry(0.034, 0.026, 0.05, 6), M(GOLD, { metalness: 0.7, roughness: 0.35 }), 0, 0.78, 0));
  // claw prongs cradling the crystal
  for (let i = 0; i < 3; i++) {
    const p = mesh(new THREE.ConeGeometry(0.014, 0.13, 4), wood,
      Math.cos(i * 2.1) * 0.045, 0.87, Math.sin(i * 2.1) * 0.045);
    p.rotation.x = Math.sin(i * 2.1) * 0.35; p.rotation.z = -Math.cos(i * 2.1) * 0.35;
    g.add(p);
  }
  const orb = mesh(new THREE.SphereGeometry(0.062, 8, 6), new THREE.MeshStandardMaterial({
    color: 0x8fd8ff, emissive: 0x3aa8e8, emissiveIntensity: 1.1, roughness: 0.2,
  }), 0, 0.92, 0);
  g.add(orb);
  const tip = new THREE.Object3D();
  tip.position.set(0, 0.92, 0);
  g.add(tip);
  g.userData.tip = tip;
  return g;
}

function makeBackScabbard() {
  const group = new THREE.Group();
  group.add(mesh(new THREE.BoxGeometry(0.085, 0.62, 0.045), M(0x4a3320), 0, -0.1, 0));
  group.add(mesh(new THREE.BoxGeometry(0.1, 0.05, 0.055), M(0x77736a, { metalness: 0.5, roughness: 0.5 }), 0, 0.16, 0));
  const hilt = new THREE.Group(); // hidden while the sword is in hand
  hilt.add(mesh(new THREE.BoxGeometry(0.2, 0.045, 0.05), M(GOLD, { metalness: 0.7, roughness: 0.35 }), 0, 0.22, 0));
  hilt.add(mesh(new THREE.CylinderGeometry(0.026, 0.032, 0.15, 8), M(0x2e2118), 0, 0.32, 0));
  hilt.add(mesh(new THREE.SphereGeometry(0.04, 8, 6), M(GOLD, { metalness: 0.7, roughness: 0.35 }), 0, 0.41, 0));
  group.add(hilt);
  return { group, hilt };
}

// opts: handAttach (right-hand Object3D weapons parent to), handAttachL
//       (left, for the bow), handOffset {x,y,z}, backPos {x,y,z},
//       backRot (z-lean), scale
export function attachCombat(rig, opts) {
  const scale = opts.scale ?? 1;

  const placeBack = (obj, lean) => {
    obj.position.set(opts.backPos.x, opts.backPos.y, opts.backPos.z);
    obj.rotation.z = lean;
    obj.scale.setScalar(scale);
    obj.userData.gear = true;
    rig.group.add(obj);
  };
  const placeHand = (obj, attach) => {
    const o = opts.handOffset;
    obj.position.set(o.x, o.y, o.z);
    obj.rotation.x = Math.PI / 2; // perpendicular to the forearm
    obj.scale.setScalar(scale);
    obj.visible = false;
    obj.userData.gear = true;
    attach.add(obj);
  };

  const back = makeBackScabbard();
  placeBack(back.group, opts.backRot);
  rig.backHilt = back.hilt;
  const bowBack = makeBow();
  bowBack.rotation.y = Math.PI / 2; // flat against the back
  placeBack(bowBack, opts.backRot + 0.35);
  const staffBack = makeStaff();
  placeBack(staffBack, -opts.backRot);

  const handSword = makeHeroSword();
  placeHand(handSword, opts.handAttach);
  rig.handSword = handSword;
  const handStaff = makeStaff();
  placeHand(handStaff, opts.handAttach);
  const handBow = makeBow();
  placeHand(handBow, opts.handAttachL || opts.handAttach);
  const handItems = { sword: handSword, bow: handBow, staff: handStaff };

  const trailMat = new THREE.MeshBasicMaterial({
    color: 0xffe6a0, transparent: true, opacity: 0, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  trailMat.userData.noWire = true;
  const trail = new THREE.Mesh(
    new THREE.RingGeometry(0.22, 0.72, 14, 1, -0.35, 2.4).rotateY(-Math.PI / 2),
    trailMat
  );
  trail.position.set(0.2, 1.0, 0.22);
  trail.userData.gear = true;
  rig.group.add(trail);
  rig.trail = trail;

  const c = rig.combat = {
    armed: false, state: 'none', style: 'sword',
    t: 0, dur: 0, onHit: null, hitDone: false, swapped: false,
  };

  // back item shows when sheathed, hand item when armed; the scabbard shell
  // stays on the back in sword style (only its hilt swaps with the hand sword)
  function applyVis(armed) {
    back.group.visible = c.style === 'sword';
    back.hilt.visible = c.style === 'sword' && !armed;
    bowBack.visible = c.style === 'bow' && !armed;
    staffBack.visible = c.style === 'staff' && !armed;
    for (const [s, item] of Object.entries(handItems)) item.visible = c.style === s && armed;
  }
  applyVis(false);

  const ATTACK_DUR = { sword: 0.55, bow: 0.85, staff: 0.7 };

  rig.draw = () => { if (c.state === 'none' && !c.armed) { c.state = 'draw'; c.t = 0; c.dur = 0.4; c.swapped = false; } };
  rig.sheathe = () => { if (c.state === 'none' && c.armed) { c.state = 'sheathe'; c.t = 0; c.dur = 0.4; c.swapped = false; } };
  rig.attack = (onHit) => {
    if (c.armed && c.state === 'none') {
      c.state = 'attack'; c.t = 0; c.dur = ATTACK_DUR[c.style]; c.hitDone = false; c.onHit = onHit;
    }
  };
  rig.isBusy = () => c.state !== 'none';
  rig.setStyle = (s) => {
    if (!handItems[s] || s === c.style) return;
    rig.forceSheathe();
    c.style = s;
    applyVis(false);
  };
  rig.muzzle = () => {
    const item = handItems[c.style];
    return (item.userData.tip || item).getWorldPosition(new THREE.Vector3());
  };
  rig.forceSheathe = () => {
    c.state = 'none'; c.armed = false;
    applyVis(false);
    trail.material.opacity = 0;
    rig.parts.rArm.rotation.z = 0;
    rig.parts.lArm.rotation.z = 0;
    rig.parts.torso.rotation.y = 0;
  };

  const S = (p) => THREE.MathUtils.smoothstep(p, 0, 1);
  const READY = -0.5, REACH = -3.1, UP = -3.3, END = -0.3;

  rig.tickCombat = (dt, t, walk) => {
    const A = rig.parts.rArm, E = rig.parts.elbowR, T = rig.parts.torso;
    const L = rig.parts.lArm, EL = rig.parts.elbowL;
    let twist = 0;
    if (c.state === 'none') {
      if (c.armed) {
        const bob = Math.sin(t * 8.4) * 0.1 * walk;
        if (c.style === 'sword') {
          A.rotation.x = READY + bob;
          A.rotation.z = -0.22;
          if (E) E.rotation.x = -0.7;
        } else if (c.style === 'staff') { // upright like a mage's walking staff
          A.rotation.x = -0.4 + bob * 0.5;
          A.rotation.z = -0.15;
          if (E) E.rotation.x = -0.85;
        } else {                          // bow carried in the left hand
          L.rotation.x = -0.45 + bob * 0.5;
          L.rotation.z = 0.15;
          if (EL) EL.rotation.x = -0.5;
        }
      }
    } else {
      c.t += dt;
      const k = Math.min(c.t / c.dur, 1);

      if (c.state === 'draw' || c.state === 'sheathe') {
        // right hand reaches over the shoulder for every style
        const drawing = c.state === 'draw';
        const from = drawing ? 0 : READY, to = drawing ? READY : 0;
        if (k < 0.5) {
          const p = S(k / 0.5);
          A.rotation.x = from + (REACH - from) * p;
          A.rotation.z = -0.12 * p;
        } else {
          if (!c.swapped) { c.swapped = true; applyVis(drawing); }
          const p = S((k - 0.5) / 0.5);
          A.rotation.x = REACH + (to - REACH) * p;
          A.rotation.z = drawing ? -0.22 * p : -0.12 * (1 - p);
        }
        if (E) E.rotation.x = -0.7 * (drawing ? k : 1 - k);
        if (k >= 1) {
          c.armed = drawing;
          c.state = 'none';
          if (!c.armed) { A.rotation.z = 0; L.rotation.z = 0; }
        }
      } else if (c.state === 'attack' && c.style === 'sword') {
        if (k < 0.32) {            // wind up overhead
          const p = S(k / 0.32);
          A.rotation.x = READY + (UP - READY) * p;
          A.rotation.z = -0.22 + 0.34 * p;
          twist = 0.35 * p;
          if (E) E.rotation.x = -0.7 - 0.6 * p;
        } else if (k < 0.62) {     // slash down
          const p = S((k - 0.32) / 0.3);
          A.rotation.x = UP + (END - UP) * p;
          A.rotation.z = 0.12 - 0.34 * p;
          twist = 0.35 - 0.8 * p;
          if (E) E.rotation.x = -1.3 + 1.2 * p;
          trail.material.opacity = Math.sin(p * Math.PI) * 0.55;
          if (p > 0.5 && !c.hitDone) { c.hitDone = true; c.onHit?.(); }
        } else {                   // recover to ready
          const p = S((k - 0.62) / 0.38);
          A.rotation.x = END + (READY - END) * p;
          A.rotation.z = -0.22;
          twist = -0.45 * (1 - p);
          if (E) E.rotation.x = -0.1 - 0.6 * p;
          trail.material.opacity = 0;
        }
        if (k >= 1) { c.state = 'none'; trail.material.opacity = 0; }
      } else if (c.state === 'attack' && c.style === 'staff') {
        if (k < 0.4) {             // raise the staff overhead
          const p = S(k / 0.4);
          A.rotation.x = -0.4 + (-2.6 + 0.4) * p;
          A.rotation.z = -0.15 + 0.25 * p;
          twist = 0.3 * p;
          if (E) E.rotation.x = -0.85 - 0.35 * p;
        } else if (k < 0.65) {     // sweep forward — fireball releases mid-sweep
          const p = S((k - 0.4) / 0.25);
          A.rotation.x = -2.6 + (-1.3 + 2.6) * p;
          A.rotation.z = 0.1 - 0.25 * p;
          twist = 0.3 - 0.65 * p;
          if (E) E.rotation.x = -1.2 + 0.85 * p;
          if (p > 0.5 && !c.hitDone) { c.hitDone = true; c.onHit?.(); }
        } else {                   // settle back to the carry pose
          const p = S((k - 0.65) / 0.35);
          A.rotation.x = -1.3 + (-0.4 + 1.3) * p;
          A.rotation.z = -0.15;
          twist = -0.35 * (1 - p);
          if (E) E.rotation.x = -0.35 - 0.5 * p;
        }
        if (k >= 1) c.state = 'none';
      } else if (c.state === 'attack' && c.style === 'bow') {
        twist = 0.45 * S(Math.min(k / 0.25, (1 - k) / 0.2)); // side-on stance
        if (k < 0.4) {             // raise bow, right hand finds the string
          const p = S(k / 0.4);
          L.rotation.x = -0.45 + (-1.5 + 0.45) * p;
          L.rotation.z = 0.15 * (1 - p);
          if (EL) EL.rotation.x = -0.5 + 0.35 * p;
          A.rotation.x = -1.1 * p;
          A.rotation.z = 0.2 * p;
          if (E) E.rotation.x = -0.5 * p;
        } else if (k < 0.6) {      // pull to the cheek
          const p = S((k - 0.4) / 0.2);
          L.rotation.x = -1.5;
          A.rotation.x = -1.1 + 0.15 * p;
          if (E) E.rotation.x = -0.5 - 1.0 * p;
        } else {                   // release — arrow flies, arms ease down
          if (!c.hitDone) { c.hitDone = true; c.onHit?.(); }
          const p = S((k - 0.6) / 0.4);
          L.rotation.x = -1.5 + (-0.45 + 1.5) * p;
          if (EL) EL.rotation.x = -0.15 - 0.35 * p;
          A.rotation.x = -1.25 * (1 - p);
          A.rotation.z = 0.2 * (1 - p);
          if (E) E.rotation.x = -0.4 * (1 - p);
        }
        if (k >= 1) c.state = 'none';
      }
    }
    T.rotation.y = twist;
    rig.parts.head.rotation.y += -twist * 0.6;
  };
}
