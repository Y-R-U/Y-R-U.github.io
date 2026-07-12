// One rigged humanoid, shared by the player AND every human NPC (the "same
// animations for all characters" goal). The model is the imported PolyPerfect
// man_casual — a real glTF SkinnedMesh whose 80 bones come in arbitrary T-pose
// frames. We drive each controlled bone in clean BODY space (x=right, y=up,
// z=forward), capturing its rest orientation relative to the hero group so the
// same body-space rotation works at any yaw:
//
//   bone.local = parentRestRelGroup⁻¹ · W · boneRestRelGroup
//
// Each call clones the loaded gltf with SkeletonUtils (so instances have their
// own skeletons), optionally tints the skin, and — for the player — bolts on
// the shared weapon builders + a melee/archery/magic attack overlay.

import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { makeHeroSword, makeCrossbow, makeStaff } from './combat.js';
import { loadHeroGltf } from './assets.js';

let baseGltf = null;
export async function initHero() { if (!baseGltf) baseGltf = await loadHeroGltf(); return baseGltf; }

const findBone = (root, name) => { let h = null; root.traverse(o => { if (!h && o.isBone && o.name === name) h = o; }); return h; };
const qx = a => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), a);
const qy = a => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a);
const qz = a => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), a);
const S = p => THREE.MathUtils.smoothstep(p, 0, 1);

function makeCtrl(group, bone) {
  group.updateWorldMatrix(true, false);
  const gInv = group.getWorldQuaternion(new THREE.Quaternion()).invert();
  const restRel = gInv.clone().multiply(bone.getWorldQuaternion(new THREE.Quaternion()));
  const parentRelInv = gInv.clone().multiply(bone.parent.getWorldQuaternion(new THREE.Quaternion())).invert();
  return { bone, apply(W) { bone.quaternion.copy(parentRelInv).multiply(W).multiply(restRel); } };
}

// makeHumanoid(opts) -> rig { group, animate(t,walk), tickCombat?, draw/attack/... }
export function makeHumanoid({ tint = null, withCombat = false, scale = 0.96 } = {}) {
  const model = SkeletonUtils.clone(baseGltf.scene);
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
  const ctl = {
    rLeg: makeCtrl(group, B('Hip_R')), lLeg: makeCtrl(group, B('Hip_L')),
    rKnee: makeCtrl(group, B('Knee_R')), lKnee: makeCtrl(group, B('Knee_L')),
    rArm: makeCtrl(group, B('Shoulder_R')), lArm: makeCtrl(group, B('Shoulder_L')),
    rElb: makeCtrl(group, B('Elbow_R')), lElb: makeCtrl(group, B('Elbow_L')),
    head: makeCtrl(group, B('Head_M')),
  };
  const DOWN_R = qz(Math.PI / 2), DOWN_L = qz(-Math.PI / 2);

  const rig = { group, parts: ctl, isPlayer: withCombat };

  // ── base locomotion (used by everyone) ──
  rig.animate = (t, walk) => {
    const sw = Math.sin(t * 8.6) * 0.5 * walk;
    const idle = Math.sin(t * 1.7) * 0.05 * (1 - walk);
    ctl.rLeg.apply(qx(sw)); ctl.lLeg.apply(qx(-sw));
    ctl.rKnee.apply(qx(Math.max(0, -sw) * 0.9)); ctl.lKnee.apply(qx(Math.max(0, sw) * 0.9));
    ctl.rArm.apply(qx(-sw * 0.85 + idle).multiply(DOWN_R));
    ctl.lArm.apply(qx(sw * 0.85 - idle).multiply(DOWN_L));
    ctl.rElb.apply(qx(0)); ctl.lElb.apply(qx(0));
    ctl.head.apply(qy(Math.sin(t * 0.4) * 0.16 * (1 - walk)));
    return Math.abs(Math.sin(t * 8.6)) * 0.045 * walk;
  };

  if (!withCombat) return rig;

  // ── player weapons + combat overlay ──
  const wrist = B('Wrist_R');
  const handAttach = new THREE.Object3D();
  wrist.add(handAttach);
  const mkHand = (build) => { const g = build(); g.visible = false; g.traverse(o => o.userData.gear = true); handAttach.add(g); return g; };
  const handItems = { sword: mkHand(makeHeroSword), crossbow: mkHand(makeCrossbow), staff: mkHand(makeStaff) };
  const mkBack = (build, pos, rot) => { const g = build(); g.position.copy(pos); g.rotation.copy(rot); g.traverse(o => o.userData.gear = true); group.add(g); return g; };
  const backItems = {
    sword: mkBack(makeHeroSword, new THREE.Vector3(-0.12, 1.16, -0.16), new THREE.Euler(0, 0, 0.5)),
    crossbow: mkBack(makeCrossbow, new THREE.Vector3(0.12, 1.18, -0.16), new THREE.Euler(0, 0, -0.5)),
    staff: mkBack(makeStaff, new THREE.Vector3(-0.14, 1.0, -0.17), new THREE.Euler(0, 0, 0.4)),
  };
  const trailMat = new THREE.MeshBasicMaterial({ color: 0xffe6a0, transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
  trailMat.userData.noWire = true;
  const trail = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.7, 14, 1, -0.35, 2.4).rotateY(-Math.PI / 2), trailMat);
  trail.position.set(0.25, 1.15, 0.25); trail.userData.gear = true; group.add(trail);

  const c = { armed: false, state: 'none', style: 'sword', t: 0, dur: 0, onHit: null, hitDone: false, swapped: false };
  const applyVis = (armed) => { for (const s of ['sword', 'crossbow', 'staff']) { backItems[s].visible = c.style === s && !armed; handItems[s].visible = c.style === s && armed; } };
  applyVis(false);
  const ATTACK_DUR = { sword: 0.5, crossbow: 0.55, staff: 0.62 };

  Object.assign(rig, {
    combat: c,
    isBusy: () => c.state !== 'none',
    draw() { if (c.state === 'none' && !c.armed) { c.state = 'draw'; c.t = 0; c.dur = 0.35; c.swapped = false; } },
    sheathe() { if (c.state === 'none' && c.armed) { c.state = 'sheathe'; c.t = 0; c.dur = 0.35; c.swapped = false; } },
    attack(onHit) { if (c.armed && c.state === 'none') { c.state = 'attack'; c.t = 0; c.dur = ATTACK_DUR[c.style]; c.hitDone = false; c.onHit = onHit; return true; } return false; },
    setStyle(s) { if (!handItems[s] || s === c.style) return; rig.forceSheathe(); c.style = s; applyVis(false); },
    muzzle() { const it = handItems[c.style]; return (it.userData.tip || it).getWorldPosition(new THREE.Vector3()); },
    forceSheathe() { c.state = 'none'; c.armed = false; applyVis(false); trail.material.opacity = 0; },

    tickCombat(dt, t, walk) {
      if (c.state === 'none') {
        if (c.armed) {
          const bob = Math.sin(t * 8.4) * 0.08 * walk;
          if (c.style === 'sword') ctl.rArm.apply(qx(-0.5 + bob).multiply(DOWN_R));
          else if (c.style === 'staff') ctl.rArm.apply(qx(-0.7 + bob * 0.5).multiply(DOWN_R));
          else ctl.rArm.apply(qx(-1.0 + bob * 0.5).multiply(DOWN_R));
        }
        return;
      }
      c.t += dt; const k = Math.min(c.t / c.dur, 1);
      if (c.state === 'draw' || c.state === 'sheathe') {
        const drawing = c.state === 'draw';
        const reach = -2.6, from = drawing ? 0 : -0.5, to = drawing ? -0.5 : 0;
        if (k < 0.5) ctl.rArm.apply(qx(from + (reach - from) * S(k / 0.5)).multiply(DOWN_R));
        else { if (!c.swapped) { c.swapped = true; applyVis(drawing); } ctl.rArm.apply(qx(reach + (to - reach) * S((k - 0.5) / 0.5)).multiply(DOWN_R)); }
        if (k >= 1) { c.armed = drawing; c.state = 'none'; }
      } else if (c.state === 'attack' && c.style === 'sword') {
        if (k < 0.34) ctl.rArm.apply(qx(-0.5 + (-2.9 + 0.5) * S(k / 0.34)).multiply(DOWN_R));
        else if (k < 0.64) { const p = S((k - 0.34) / 0.30); ctl.rArm.apply(qx(-2.9 + 2.7 * p).multiply(DOWN_R)); trail.material.opacity = Math.sin(p * Math.PI) * 0.55; if (p > 0.5 && !c.hitDone) { c.hitDone = true; c.onHit?.(); } }
        else { ctl.rArm.apply(qx(-0.2 + (-0.3) * S((k - 0.64) / 0.36)).multiply(DOWN_R)); trail.material.opacity = 0; }
        if (k >= 1) { c.state = 'none'; trail.material.opacity = 0; }
      } else {
        const AIM = c.style === 'crossbow' ? -1.55 : -1.9;
        if (k < 0.4) ctl.rArm.apply(qx(-1.0 + (AIM + 1.0) * S(k / 0.4)).multiply(DOWN_R));
        else if (k < 0.62) { const p = (k - 0.4) / 0.22; if (!c.hitDone && p > 0.25) { c.hitDone = true; c.onHit?.(); } ctl.rArm.apply(qx(AIM + Math.sin(Math.min(Math.max(p - 0.25, 0) / 0.75, 1) * Math.PI) * 0.2).multiply(DOWN_R)); }
        else ctl.rArm.apply(qx(AIM + (-1.0 - AIM) * S((k - 0.62) / 0.38)).multiply(DOWN_R));
        if (k >= 1) c.state = 'none';
      }
    },
  });
  return rig;
}
