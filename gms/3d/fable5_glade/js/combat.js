// Sword + combat animation layer shared by both heroes. attachCombat() gives
// a rig a back scabbard, a hand sword, a swing trail, and draw / sheathe /
// attack overlays that run AFTER rig.animate() each frame (they override the
// right arm / torso, so locomotion keeps working underneath).

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

// opts: handAttach (Object3D the sword parents to), handOffset {x,y,z},
//       backPos {x,y,z}, backRot (z-lean), scale
export function attachCombat(rig, opts) {
  const scale = opts.scale ?? 1;

  const back = makeBackScabbard();
  back.group.position.set(opts.backPos.x, opts.backPos.y, opts.backPos.z);
  back.group.rotation.z = opts.backRot;
  back.group.scale.setScalar(scale);
  rig.group.add(back.group);
  rig.backHilt = back.hilt;

  const handSword = makeHeroSword();
  handSword.position.set(opts.handOffset.x, opts.handOffset.y, opts.handOffset.z);
  handSword.rotation.x = Math.PI / 2; // blade perpendicular to forearm
  handSword.scale.setScalar(scale);
  handSword.visible = false;
  opts.handAttach.add(handSword);
  rig.handSword = handSword;

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
  rig.group.add(trail);
  rig.trail = trail;

  const c = rig.combat = { armed: false, state: 'none', t: 0, dur: 0, onHit: null, hitDone: false, swapped: false };

  rig.draw = () => { if (c.state === 'none' && !c.armed) { c.state = 'draw'; c.t = 0; c.dur = 0.4; c.swapped = false; } };
  rig.sheathe = () => { if (c.state === 'none' && c.armed) { c.state = 'sheathe'; c.t = 0; c.dur = 0.4; c.swapped = false; } };
  rig.attack = (onHit) => {
    if (c.armed && c.state === 'none') { c.state = 'attack'; c.t = 0; c.dur = 0.55; c.hitDone = false; c.onHit = onHit; }
  };
  rig.isBusy = () => c.state !== 'none';
  rig.forceSheathe = () => {
    c.state = 'none'; c.armed = false;
    handSword.visible = false; back.hilt.visible = true;
    trail.material.opacity = 0;
    rig.parts.rArm.rotation.z = 0;
    rig.parts.torso.rotation.y = 0;
  };

  const S = (p) => THREE.MathUtils.smoothstep(p, 0, 1);
  const READY = -0.5, REACH = -3.1, UP = -3.3, END = -0.3;

  rig.tickCombat = (dt, t, walk) => {
    const A = rig.parts.rArm, E = rig.parts.elbowR, T = rig.parts.torso;
    let twist = 0;
    if (c.state === 'none') {
      if (c.armed) {
        A.rotation.x = READY + Math.sin(t * 8.4) * 0.12 * walk;
        A.rotation.z = -0.22;
        if (E) E.rotation.x = -0.7;
      }
    } else {
      c.t += dt;
      const k = Math.min(c.t / c.dur, 1);

      if (c.state === 'draw' || c.state === 'sheathe') {
        const drawing = c.state === 'draw';
        const from = drawing ? 0 : READY, to = drawing ? READY : 0;
        if (k < 0.5) {
          const p = S(k / 0.5);
          A.rotation.x = from + (REACH - from) * p;
          A.rotation.z = -0.12 * p;
        } else {
          if (!c.swapped) {
            c.swapped = true;
            handSword.visible = drawing;
            back.hilt.visible = !drawing;
          }
          const p = S((k - 0.5) / 0.5);
          A.rotation.x = REACH + (to - REACH) * p;
          A.rotation.z = drawing ? -0.22 * p : -0.12 * (1 - p);
        }
        if (E) E.rotation.x = -0.7 * (drawing ? k : 1 - k);
        if (k >= 1) {
          c.armed = drawing;
          c.state = 'none';
          if (!c.armed) A.rotation.z = 0;
        }
      } else if (c.state === 'attack') {
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
      }
    }
    T.rotation.y = twist;
    rig.parts.head.rotation.y += -twist * 0.6;
  };
}
