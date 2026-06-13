// Hero 5 "Cass" — the imported, rigged PolyPerfect man (man_casual), exported
// from Unity with his skeleton (glTFast) and driven procedurally here. Unlike
// the hand-built heroes (separable primitive groups), this is a single
// SkinnedMesh: we animate by rotating its actual bones.
//
// The bones come in arbitrary local frames (T-pose, FBX axes), so instead of
// poking bone.rotation directly we drive each controlled bone with a rotation
// expressed in clean BODY space (x=right, y=up, z=forward). We capture each
// bone's rest orientation relative to the hero GROUP; because the group's world
// rotation appears on both the bone and its parent it cancels out, so the same
// body-space rotation works at any yaw:
//
//   bone.local = parentRestRelGroup⁻¹ · W · boneRestRelGroup     (W in body space)
//
// This module returns the same rig contract the player controller expects
// ({ group, parts, animate, combat, draw/sheathe/attack/setStyle/muzzle/... }),
// reusing the shared weapon builders + projectiles so it drops into the roster.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { makeHeroSword, makeCrossbow, makeStaff } from './combat.js';
import * as fx from './fx.js';

const loader = new GLTFLoader();
const _q = new THREE.Quaternion();

const findBone = (root, name) => {
  let hit = null;
  root.traverse(o => { if (!hit && o.isBone && o.name === name) hit = o; });
  return hit;
};

// body-space axis quaternions
const qx = (a) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), a);
const qy = (a) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a);
const qz = (a) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), a);

// One controlled bone. apply(W) sets the bone so its orientation, measured in
// the body frame, becomes W · rest. Captures are taken once at the rest pose.
function makeCtrl(group, bone) {
  group.updateWorldMatrix(true, false);
  const gInv = group.getWorldQuaternion(new THREE.Quaternion()).invert();
  const restRel = gInv.clone().multiply(bone.getWorldQuaternion(new THREE.Quaternion()));
  const parentRelInv = gInv.clone().multiply(bone.parent.getWorldQuaternion(new THREE.Quaternion())).invert();
  return {
    bone,
    apply(W) { bone.quaternion.copy(parentRelInv).multiply(W).multiply(restRel); },
  };
}

export async function loadImportedHero(scene) {
  const gltf = await loader.loadAsync('./models/man-casual-rigged.glb');
  const model = gltf.scene;
  model.traverse(o => {
    if (o.isMesh || o.isSkinnedMesh) {
      o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) if (m && m.map) m.map.colorSpace = THREE.SRGBColorSpace;
    }
  });

  const group = new THREE.Group();
  model.scale.setScalar(0.96);            // ~1.8m → match the other heroes
  group.add(model);
  group.updateMatrixWorld(true);

  // controlled bones (parents we leave un-animated, so their frames are stable)
  const B = (n) => findBone(model, n);
  const ctl = {
    rLeg: makeCtrl(group, B('Hip_R')), lLeg: makeCtrl(group, B('Hip_L')),
    rKnee: makeCtrl(group, B('Knee_R')), lKnee: makeCtrl(group, B('Knee_L')),
    rArm: makeCtrl(group, B('Shoulder_R')), lArm: makeCtrl(group, B('Shoulder_L')),
    rElb: makeCtrl(group, B('Elbow_R')), lElb: makeCtrl(group, B('Elbow_L')),
    head: makeCtrl(group, B('Head_M')),
  };

  // weapon attach point: a node parented to the right hand so weapons ride it
  const wrist = B('Wrist_R');
  const handAttach = new THREE.Object3D();
  handAttach.position.set(0.0, 0.0, 0.0);
  wrist.add(handAttach);

  // arms-down rest: right T-pose arm (-x) → down (-y) is +90° about body z; left mirrored
  const DOWN_R = qz(Math.PI / 2), DOWN_L = qz(-Math.PI / 2);

  // ---- weapons (reuse the shared builders) ----
  const HAND_SCALE = 1.0;
  const mkHand = (build, rot) => {
    const g = build();
    g.scale.setScalar(HAND_SCALE);
    g.rotation.copy(rot);
    g.visible = false;
    g.traverse(o => { o.userData.gear = true; });
    handAttach.add(g);
    return g;
  };
  // tuned so the grip sits in the palm, blade/muzzle up the forearm
  const handItems = {
    sword: mkHand(makeHeroSword, new THREE.Euler(0, 0, 0)),
    crossbow: mkHand(makeCrossbow, new THREE.Euler(0, 0, 0)),
    staff: mkHand(makeStaff, new THREE.Euler(0, 0, 0)),
  };

  // back-carried versions, parented to the group (torso isn't animated)
  const mkBack = (build, pos, rot) => {
    const g = build();
    g.position.copy(pos); g.rotation.copy(rot);
    g.traverse(o => { o.userData.gear = true; });
    group.add(g);
    return g;
  };
  const backItems = {
    sword: mkBack(makeHeroSword, new THREE.Vector3(-0.12, 1.16, -0.16), new THREE.Euler(0, 0, 0.5)),
    crossbow: mkBack(makeCrossbow, new THREE.Vector3(0.12, 1.18, -0.16), new THREE.Euler(0, 0, -0.5)),
    staff: mkBack(makeStaff, new THREE.Vector3(-0.14, 1.0, -0.17), new THREE.Euler(0, 0, 0.4)),
  };

  // swing trail (reused look from combat.js)
  const trailMat = new THREE.MeshBasicMaterial({
    color: 0xffe6a0, transparent: true, opacity: 0, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  trailMat.userData.noWire = true;
  const trail = new THREE.Mesh(
    new THREE.RingGeometry(0.22, 0.7, 14, 1, -0.35, 2.4).rotateY(-Math.PI / 2), trailMat);
  trail.position.set(0.25, 1.15, 0.25);
  trail.userData.gear = true;
  group.add(trail);

  const c = { armed: false, state: 'none', style: 'sword', t: 0, dur: 0, onHit: null, hitDone: false, swapped: false };

  function applyVis(armed) {
    for (const s of ['sword', 'crossbow', 'staff']) {
      backItems[s].visible = c.style === s && !armed;
      handItems[s].visible = c.style === s && armed;
    }
  }
  applyVis(false);

  const ATTACK_DUR = { sword: 0.55, crossbow: 0.6, staff: 0.7 };
  const S = (p) => THREE.MathUtils.smoothstep(p, 0, 1);

  const rig = {
    group,
    parts: ctl,          // not the Glade primitive parts, but harmless to expose
    combat: c,
    isBusy: () => c.state !== 'none',
    draw() { if (c.state === 'none' && !c.armed) { c.state = 'draw'; c.t = 0; c.dur = 0.4; c.swapped = false; } },
    sheathe() { if (c.state === 'none' && c.armed) { c.state = 'sheathe'; c.t = 0; c.dur = 0.4; c.swapped = false; } },
    attack(onHit) { if (c.armed && c.state === 'none') { c.state = 'attack'; c.t = 0; c.dur = ATTACK_DUR[c.style]; c.hitDone = false; c.onHit = onHit; } },
    setStyle(s) { if (!handItems[s] || s === c.style) return; rig.forceSheathe(); c.style = s; applyVis(false); },
    muzzle() { const it = handItems[c.style]; return (it.userData.tip || it).getWorldPosition(new THREE.Vector3()); },
    forceSheathe() { c.state = 'none'; c.armed = false; applyVis(false); trail.material.opacity = 0; },

    // base locomotion: legs + arms swing, head sway. Combat overrides the
    // right arm afterward when armed.
    animate(t, walk) {
      const sw = Math.sin(t * 8.6) * 0.5 * walk;
      const idle = Math.sin(t * 1.7) * 0.05 * (1 - walk);
      ctl.rLeg.apply(qx(sw));
      ctl.lLeg.apply(qx(-sw));
      // a touch of knee bend on the forward-swinging leg
      ctl.rKnee.apply(qx(Math.max(0, -sw) * 0.9));
      ctl.lKnee.apply(qx(Math.max(0, sw) * 0.9));
      // arms hang down, counter-swing to the legs
      ctl.rArm.apply(qx(-sw * 0.85 + idle).multiply(DOWN_R));
      ctl.lArm.apply(qx(sw * 0.85 - idle).multiply(DOWN_L));
      ctl.rElb.apply(qx(0)); ctl.lElb.apply(qx(0));
      ctl.head.apply(qy(Math.sin(t * 0.4) * 0.16 * (1 - walk)));
      return Math.abs(Math.sin(t * 8.6)) * 0.045 * walk;
    },

    // combat overlay — poses the RIGHT arm only, in body space
    tickCombat(dt, t, walk) {
      if (c.state === 'none') {
        if (c.armed) {
          const bob = Math.sin(t * 8.4) * 0.08 * walk;
          // carry pose per style (arm forward/up off the body)
          if (c.style === 'sword') ctl.rArm.apply(qx(-0.5 + bob).multiply(DOWN_R));
          else if (c.style === 'staff') ctl.rArm.apply(qx(-0.7 + bob * 0.5).multiply(DOWN_R));
          else ctl.rArm.apply(qx(-1.0 + bob * 0.5).multiply(DOWN_R)); // crossbow carried up
        }
        return;
      }
      c.t += dt;
      const k = Math.min(c.t / c.dur, 1);

      if (c.state === 'draw' || c.state === 'sheathe') {
        const drawing = c.state === 'draw';
        // reach up/back over the shoulder, swap the weapon at the midpoint
        const reach = -2.6, from = drawing ? 0 : -0.5, to = drawing ? -0.5 : 0;
        if (k < 0.5) ctl.rArm.apply(qx(from + (reach - from) * S(k / 0.5)).multiply(DOWN_R));
        else {
          if (!c.swapped) { c.swapped = true; applyVis(drawing); }
          ctl.rArm.apply(qx(reach + (to - reach) * S((k - 0.5) / 0.5)).multiply(DOWN_R));
        }
        if (k >= 1) { c.armed = drawing; c.state = 'none'; }
      } else if (c.state === 'attack' && c.style === 'sword') {
        if (k < 0.34) {                       // wind up overhead
          ctl.rArm.apply(qx(-0.5 + (-2.9 + 0.5) * S(k / 0.34)).multiply(DOWN_R));
        } else if (k < 0.64) {                // slash down
          const p = S((k - 0.34) / 0.30);
          ctl.rArm.apply(qx(-2.9 + (-0.2 + 2.9) * p).multiply(DOWN_R));
          trail.material.opacity = Math.sin(p * Math.PI) * 0.55;
          if (p > 0.5 && !c.hitDone) { c.hitDone = true; c.onHit?.(); }
        } else {                              // recover
          ctl.rArm.apply(qx(-0.2 + (-0.5 + 0.2) * S((k - 0.64) / 0.36)).multiply(DOWN_R));
          trail.material.opacity = 0;
        }
        if (k >= 1) { c.state = 'none'; trail.material.opacity = 0; }
      } else { // crossbow + staff: raise to aim, fire from the muzzle, lower
        const AIM = c.style === 'crossbow' ? -1.55 : -1.9;
        if (k < 0.4) {
          ctl.rArm.apply(qx(-1.0 + (AIM + 1.0) * S(k / 0.4)).multiply(DOWN_R));
        } else if (k < 0.62) {
          const p = (k - 0.4) / 0.22;
          if (!c.hitDone && p > 0.25) { c.hitDone = true; c.onHit?.(); }
          ctl.rArm.apply(qx(AIM + Math.sin(Math.min(Math.max(p - 0.25, 0) / 0.75, 1) * Math.PI) * 0.2).multiply(DOWN_R));
        } else {
          ctl.rArm.apply(qx(AIM + (-1.0 - AIM) * S((k - 0.62) / 0.38)).multiply(DOWN_R));
        }
        if (k >= 1) c.state = 'none';
      }
    },
  };

  return rig;
}
