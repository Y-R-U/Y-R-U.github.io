// One rigged-humanoid bone driver, shared by every villager/raider. The models
// are PolyPerfect SkinnedMeshes that all share one 80-bone family. Each
// controlled bone is driven in clean BODY space (x=right, y=up, z=forward),
// capturing its rest orientation relative to the character group so the same
// body-space rotation works at any yaw:
//
//   bone.local = parentRestRelGroup⁻¹ · W · boneRestRelGroup
//
// (Ported from towered/deadtown — the proven driver.)

import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const findBone = (root, name) => { let h = null; root.traverse(o => { if (!h && o.isBone && o.name === name) h = o; }); return h; };

// every rig's cloned materials, so world.js can dim env lighting at night
export const rigMats = [];
export const qx = a => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), a);
export const qy = a => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a);
export const qz = a => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), a);

function makeCtrl(group, bone) {
  if (!bone) return null;
  group.updateWorldMatrix(true, false);
  const gInv = group.getWorldQuaternion(new THREE.Quaternion()).invert();
  const restRel = gInv.clone().multiply(bone.getWorldQuaternion(new THREE.Quaternion()));
  const parentRelInv = gInv.clone().multiply(bone.parent.getWorldQuaternion(new THREE.Quaternion())).invert();
  return { bone, apply(W) { bone.quaternion.copy(parentRelInv).multiply(W).multiply(restRel); } };
}

export function buildRig(srcScene, { tint = null, scale = 0.96, emissive = 0x550000 } = {}) {
  const model = SkeletonUtils.clone(srcScene);
  model.traverse(o => {
    if (o.isMesh || o.isSkinnedMesh) {
      o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      o.material = mats.map(m => {
        const mm = m.clone();
        if (mm.map) mm.map.colorSpace = THREE.SRGBColorSpace;
        if (tint) mm.color.multiply(new THREE.Color(tint));
        if (emissive != null) { mm.emissive = new THREE.Color(emissive); mm.emissiveIntensity = 0.0; }
        rigMats.push(mm);
        if (rigMats.length > 900) rigMats.splice(0, 300);
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

  // attach points: head (hats), right hand-end (tools), chest (carried goods)
  const headAttach = new THREE.Object3D();
  B('Head_M')?.add(headAttach);
  const handAttach = new THREE.Object3D();
  const rElbBone = B('Elbow_R');
  if (rElbBone) { handAttach.position.set(0, 0.28, 0); rElbBone.add(handAttach); }

  return { group, model, parts, B, headAttach, handAttach, DOWN_R, DOWN_L };
}
