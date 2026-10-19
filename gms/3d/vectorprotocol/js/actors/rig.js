import * as THREE from 'three';

// Adapted from HEIRFRAME's rig: 23 bones; aux0 = back (fins/packs), aux1 = head crest,
// aux2/aux3 = free floaters on the pelvis (orbs, drones, shield emitters).
export const BONES = [
  'pelvis', 'spine', 'chest', 'neck', 'head',
  'clavL', 'upArmL', 'foreArmL', 'handL',
  'clavR', 'upArmR', 'foreArmR', 'handR',
  'thighL', 'shinL', 'footL',
  'thighR', 'shinR', 'footR',
  'aux0', 'aux1', 'aux2', 'aux3',
];
export const BI = Object.fromEntries(BONES.map((n, i) => [n, i]));
export const NB = BONES.length;

const PARENT = {
  spine: 'pelvis', chest: 'spine', neck: 'chest', head: 'neck',
  clavL: 'chest', upArmL: 'clavL', foreArmL: 'upArmL', handL: 'foreArmL',
  clavR: 'chest', upArmR: 'clavR', foreArmR: 'upArmR', handR: 'foreArmR',
  thighL: 'pelvis', shinL: 'thighL', footL: 'shinL',
  thighR: 'pelvis', shinR: 'thighR', footR: 'shinR',
  aux0: 'chest', aux1: 'head', aux2: 'pelvis', aux3: 'pelvis',
};
export const ORDER = { thighL: 'ZXY', thighR: 'ZXY', upArmL: 'ZXY', upArmR: 'ZXY' };
export const orderOf = (n) => ORDER[n] || (n === 'footL' || n === 'footR' ? 'XYZ' : 'YXZ');

export const DEFAULT_DIMS = {
  thigh: 0.43, shin: 0.43, ankle: 0.1, hipX: 0.12, hipY: -0.04,
  spine: 0.12, chest: 0.24, neck: 0.3, headOff: 0.05,
  clavX: 0.06, clavY: 0.22, shoulder: 0.2, upArm: 0.3, foreArm: 0.28, hand: 0.15,
  aux0: [0, 0.18, -0.18], aux1: [0, 0.2, 0], aux2: [0.5, 0.4, 0], aux3: [-0.5, 0.4, 0], hover: 0,
};

export function makeRig(dims) {
  const D = { ...DEFAULT_DIMS, ...dims };
  D.pelvisY = D.hover || (D.thigh + D.shin + D.ankle - D.hipY);
  D.leg = D.thigh + D.shin;
  const off = {
    pelvis: [0, D.pelvisY, 0], spine: [0, D.spine, 0], chest: [0, D.chest, 0], neck: [0, D.neck, 0], head: [0, D.headOff, 0],
    thighL: [D.hipX, D.hipY, 0], shinL: [0, -D.thigh, 0], footL: [0, -D.shin, 0],
    clavL: [D.clavX, D.clavY, 0], upArmL: [D.shoulder, 0, 0], foreArmL: [0, -D.upArm, 0], handL: [0, -D.foreArm, 0],
    aux0: D.aux0, aux1: D.aux1, aux2: D.aux2, aux3: D.aux3,
    ...(D.offsets || {}),
  };
  for (const k of ['thigh', 'shin', 'foot', 'clav', 'upArm', 'foreArm', 'hand']) {
    if (D.offsets && D.offsets[k + 'R']) continue;
    const o = off[k + 'L'];
    off[k + 'R'] = [-o[0], o[1], o[2]];
  }
  // dims.parents re-parents aux bones (e.g. { aux1: 'handR' } for a spinning barrel, { aux2: 'chest' } for a drone)
  const parent = { ...PARENT, ...(D.parents || {}) };
  // world rest positions, resolved recursively so dims.parents may point at any bone regardless of BONES order
  const world = {}, busy = new Set();
  const resolve = (n) => {
    if (world[n]) return world[n];
    if (!(n in BI)) throw new Error(`rig: unknown bone "${n}" (dims.parents?)`);
    if (busy.has(n)) throw new Error(`rig: dims.parents makes a cycle at "${n}"`);
    busy.add(n);
    const p = parent[n], o = off[n];
    if (!o) throw new Error(`rig: no offset for bone "${n}"`);
    const pw = p ? resolve(p) : null;
    world[n] = pw ? [pw[0] + o[0], pw[1] + o[1], pw[2] + o[2]] : o.slice();
    busy.delete(n);
    return world[n];
  };
  for (const n of BONES) resolve(n);
  return { D, off, world, parent };
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
  const parent = rig.parent || PARENT;
  BONES.forEach((n, i) => { if (parent[n]) bones[BI[parent[n]]].add(bones[i]); });
  return bones;
}
