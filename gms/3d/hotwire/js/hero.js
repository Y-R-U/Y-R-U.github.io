// Rigged humanoid driver (shared 80-bone PolyPerfect skeleton, body-space
// bone control — same proven core as deadtown). One buildRig() serves the
// player, cops, gang members, pedestrians and story NPCs. Poses: locomotion
// swing, arms-out AIM (no weapon models in this game — the pose + muzzle FX
// carry it), and a hit-flail for launched peds.

import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { loadRigGltf } from './assets.js';

const baseGltfs = new Map();
export async function initRig(name = 'hero') {
  if (!baseGltfs.has(name)) baseGltfs.set(name, await loadRigGltf(name));
  return baseGltfs.get(name);
}

const findBone = (root, name) => { let h = null; root.traverse(o => { if (!h && o.isBone && o.name === name) h = o; }); return h; };
export const qx = a => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), a);
export const qy = a => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a);
export const qz = a => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), a);

function makeCtrl(group, bone) {
  group.updateWorldMatrix(true, false);
  const gInv = group.getWorldQuaternion(new THREE.Quaternion()).invert();
  const restRel = gInv.clone().multiply(bone.getWorldQuaternion(new THREE.Quaternion()));
  const parentRelInv = gInv.clone().multiply(bone.parent.getWorldQuaternion(new THREE.Quaternion())).invert();
  return { bone, apply(W) { bone.quaternion.copy(parentRelInv).multiply(W).multiply(restRel); } };
}

export function buildRig(name, { tint = null, scale = 0.92 } = {}) {
  const src = baseGltfs.get(name);
  if (!src) throw new Error(`rig not initialised: ${name} (call initRig first)`);
  const model = SkeletonUtils.clone(src.scene);
  model.traverse(o => {
    if (o.isMesh || o.isSkinnedMesh) {
      o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      o.material = mats.map(m => {
        const mm = m.clone();
        if (mm.map) mm.map.colorSpace = THREE.SRGBColorSpace;
        if (tint) mm.color.multiply(new THREE.Color(tint));
        return mm;
      });
      if (o.material.length === 1) o.material = o.material[0];
    }
  });

  const group = new THREE.Group();
  model.scale.setScalar(scale);
  group.add(model);
  group.updateMatrixWorld(true);

  const B = n => findBone(model, n);
  const parts = {
    rLeg: makeCtrl(group, B('Hip_R')), lLeg: makeCtrl(group, B('Hip_L')),
    rKnee: makeCtrl(group, B('Knee_R')), lKnee: makeCtrl(group, B('Knee_L')),
    rArm: makeCtrl(group, B('Shoulder_R')), lArm: makeCtrl(group, B('Shoulder_L')),
    rElb: makeCtrl(group, B('Elbow_R')), lElb: makeCtrl(group, B('Elbow_L')),
    head: makeCtrl(group, B('Head_M')),
  };
  const DOWN_R = qz(Math.PI / 2), DOWN_L = qz(-Math.PI / 2);

  const rig = { group, model, parts, B };

  // aimAmt 0..1 blends walk-swing arms into the both-arms-forward pose.
  rig.animate = (t, walk, aimAmt = 0) => {
    const sw = Math.sin(t * 9.4) * 0.55 * walk;
    const idle = Math.sin(t * 1.7) * 0.05 * (1 - walk);
    parts.rLeg.apply(qx(sw)); parts.lLeg.apply(qx(-sw));
    parts.rKnee.apply(qx(Math.max(0, -sw) * 0.9)); parts.lKnee.apply(qx(Math.max(0, sw) * 0.9));
    if (aimAmt > 0.02) {
      // both arms straight forward (slight inward angle), elbows locked
      const fwdR = qx(-Math.PI / 2 + 0.06).multiply(qy(-0.1)).multiply(DOWN_R);
      const fwdL = qx(-Math.PI / 2 + 0.06).multiply(qy(0.1)).multiply(DOWN_L);
      const swingR = qx(-sw * 0.85 + idle).multiply(DOWN_R);
      const swingL = qx(sw * 0.85 - idle).multiply(DOWN_L);
      parts.rArm.apply(swingR.slerp(fwdR, aimAmt));
      parts.lArm.apply(swingL.slerp(fwdL, aimAmt));
    } else {
      parts.rArm.apply(qx(-sw * 0.85 + idle).multiply(DOWN_R));
      parts.lArm.apply(qx(sw * 0.85 - idle).multiply(DOWN_L));
    }
    parts.rElb.apply(qx(0)); parts.lElb.apply(qx(0));
    parts.head.apply(qy(Math.sin(t * 0.4) * 0.14 * (1 - walk)));
    return Math.abs(Math.sin(t * 9.4)) * 0.05 * walk;
  };

  // launched-by-a-car flail (arms & legs spread, applied while airborne)
  rig.flail = (t) => {
    const f = Math.sin(t * 20);
    parts.rArm.apply(qx(-2.4 + f * 0.4).multiply(DOWN_R));
    parts.lArm.apply(qx(-2.4 - f * 0.4).multiply(DOWN_L));
    parts.rLeg.apply(qx(0.8 + f * 0.3)); parts.lLeg.apply(qx(-0.8 - f * 0.3));
  };

  // muzzle point: between the hands in the aim pose (world space)
  const wristR = B('Wrist_R'), wristL = B('Wrist_L');
  const _a = new THREE.Vector3(), _b = new THREE.Vector3();
  rig.muzzleWorld = (out) => {
    wristR.getWorldPosition(_a); wristL.getWorldPosition(_b);
    out.copy(_a).add(_b).multiplyScalar(0.5);
    return out;
  };

  return rig;
}
