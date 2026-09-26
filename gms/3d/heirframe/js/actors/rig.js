import * as THREE from '../../../../lib/three/0.180.0/three.module.js';

export const BONES = [
  'pelvis', 'spine', 'chest', 'neck', 'head',
  'clavL', 'upArmL', 'foreArmL', 'handL',
  'clavR', 'upArmR', 'foreArmR', 'handR',
  'thighL', 'shinL', 'footL',
  'thighR', 'shinR', 'footR',
  'aux0', 'aux1',
];
export const BI = Object.fromEntries(BONES.map((n, i) => [n, i]));
export const NB = BONES.length;

const PARENT = {
  spine: 'pelvis', chest: 'spine', neck: 'chest', head: 'neck',
  clavL: 'chest', upArmL: 'clavL', foreArmL: 'upArmL', handL: 'foreArmL',
  clavR: 'chest', upArmR: 'clavR', foreArmR: 'upArmR', handR: 'foreArmR',
  thighL: 'pelvis', shinL: 'thighL', footL: 'shinL',
  thighR: 'pelvis', shinR: 'thighR', footR: 'shinR',
  aux0: 'chest', aux1: 'head',
};

// Limbs pitch first then splay; torso yaws first.
const ORDER = { thighL: 'ZXY', thighR: 'ZXY', upArmL: 'ZXY', upArmR: 'ZXY' };

export const DEFAULT_DIMS = {
  thigh: 0.43, shin: 0.43, ankle: 0.075, hipX: 0.092, hipY: -0.035,
  spine: 0.11, chest: 0.23, neck: 0.245, headOff: 0.095,
  clavX: 0.045, clavY: 0.2, shoulder: 0.145, upArm: 0.29, foreArm: 0.26, hand: 0.17,
  aux0: [0, 0.16, -0.13], aux1: [0, 0.2, 0], hover: 0,
};

export function makeRig(dims) {
  const D = { ...DEFAULT_DIMS, ...dims };
  D.pelvisY = D.hover || (D.thigh + D.shin + D.ankle - D.hipY);
  D.leg = D.thigh + D.shin;
  const off = {
    pelvis: [0, D.pelvisY, 0],
    spine: [0, D.spine, 0],
    chest: [0, D.chest, 0],
    neck: [0, D.neck, 0],
    head: [0, D.headOff, 0],
    thighL: [D.hipX, D.hipY, 0], shinL: [0, -D.thigh, 0], footL: [0, -D.shin, 0],
    clavL: [D.clavX, D.clavY, 0], upArmL: [D.shoulder, 0, 0], foreArmL: [0, -D.upArm, 0], handL: [0, -D.foreArm, 0],
    aux0: D.aux0, aux1: D.aux1,
    ...(D.offsets || {}),
  };
  for (const k of ['thigh', 'shin', 'foot', 'clav', 'upArm', 'foreArm', 'hand']) {
    const o = off[k + 'L'];
    off[k + 'R'] = [-o[0], o[1], o[2]];
  }
  const world = {};
  for (const n of BONES) {
    const p = PARENT[n], o = off[n];
    world[n] = p ? [world[p][0] + o[0], world[p][1] + o[1], world[p][2] + o[2]] : o.slice();
  }
  return { D, off, world };
}

export function makeBones(rig) {
  const bones = BONES.map((n) => {
    const b = new THREE.Bone();
    b.name = n;
    b.position.fromArray(rig.off[n]);
    if (ORDER[n]) b.rotation.order = ORDER[n];
    else if (n !== 'footL' && n !== 'footR') b.rotation.order = 'YXZ';
    return b;
  });
  BONES.forEach((n, i) => { if (PARENT[n]) bones[BI[PARENT[n]]].add(bones[i]); });
  return bones;
}
