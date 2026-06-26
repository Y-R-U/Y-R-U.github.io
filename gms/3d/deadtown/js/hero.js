// One rigged humanoid driver, shared by the player AND every zombie / NPC.
// The models are imported PolyPerfect SkinnedMeshes that ALL share one 80-bone
// skeleton (man_casual, man-zombie, woman-zombie, man-coat …). Each controlled
// bone is driven in clean BODY space (x=right, y=up, z=forward), capturing its
// rest orientation relative to the character group so the same body-space
// rotation works at any yaw:
//
//   bone.local = parentRestRelGroup⁻¹ · W · boneRestRelGroup
//
// buildRig() is the reusable core (clone + bone controllers + walk loop).
// makeHumanoid() is the player: buildRig + the gun/melee arsenal (weapons.js).
// Zombies call buildRig() directly and add their own shamble (zombies.js).

import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { loadHeroGltf } from './assets.js';
import { attachArsenal } from './weapons.js';

let baseGltf = null;
export async function initHero() { if (!baseGltf) baseGltf = await loadHeroGltf(); return baseGltf; }

const findBone = (root, name) => { let h = null; root.traverse(o => { if (!h && o.isBone && o.name === name) h = o; }); return h; };
export const qx = a => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), a);
export const qy = a => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a);
export const qz = a => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), a);
export const S = p => THREE.MathUtils.smoothstep(p, 0, 1);

function makeCtrl(group, bone) {
  group.updateWorldMatrix(true, false);
  const gInv = group.getWorldQuaternion(new THREE.Quaternion()).invert();
  const restRel = gInv.clone().multiply(bone.getWorldQuaternion(new THREE.Quaternion()));
  const parentRelInv = gInv.clone().multiply(bone.parent.getWorldQuaternion(new THREE.Quaternion())).invert();
  return { bone, apply(W) { bone.quaternion.copy(parentRelInv).multiply(W).multiply(restRel); } };
}

// buildRig(srcScene, opts) -> { group, parts, animate(t,walk)->bob, B, handAttach, DOWN_R/L }
export function buildRig(srcScene, { tint = null, scale = 0.96, emissive = null } = {}) {
  const model = SkeletonUtils.clone(srcScene);
  model.traverse(o => {
    if (o.isMesh || o.isSkinnedMesh) {
      o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      o.material = mats.map(m => {
        const mm = m.clone();
        if (mm.map) mm.map.colorSpace = THREE.SRGBColorSpace;
        if (tint) mm.color.multiply(new THREE.Color(tint));
        if (emissive) { mm.emissive = new THREE.Color(emissive); mm.emissiveIntensity = 0.0; }
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

  // a node on the right wrist that hand weapons parent to
  const handAttach = new THREE.Object3D();
  B('Wrist_R').add(handAttach);

  const rig = { group, model, parts, B, handAttach, DOWN_R, DOWN_L };

  // ── base locomotion (arms swing down at sides) ──
  rig.animate = (t, walk) => {
    const sw = Math.sin(t * 8.6) * 0.5 * walk;
    const idle = Math.sin(t * 1.7) * 0.05 * (1 - walk);
    parts.rLeg.apply(qx(sw)); parts.lLeg.apply(qx(-sw));
    parts.rKnee.apply(qx(Math.max(0, -sw) * 0.9)); parts.lKnee.apply(qx(Math.max(0, sw) * 0.9));
    parts.rArm.apply(qx(-sw * 0.85 + idle).multiply(DOWN_R));
    parts.lArm.apply(qx(sw * 0.85 - idle).multiply(DOWN_L));
    parts.rElb.apply(qx(0)); parts.lElb.apply(qx(0));
    parts.head.apply(qy(Math.sin(t * 0.4) * 0.16 * (1 - walk)));
    return Math.abs(Math.sin(t * 8.6)) * 0.045 * walk;
  };

  return rig;
}

// The player: rig + the weapon arsenal (guns + melee), bolted on by weapons.js.
export function makeHumanoid({ tint = null, scale = 0.96 } = {}) {
  const rig = buildRig(baseGltf.scene, { tint, scale });
  rig.isPlayer = true;
  attachArsenal(rig);
  return rig;
}
