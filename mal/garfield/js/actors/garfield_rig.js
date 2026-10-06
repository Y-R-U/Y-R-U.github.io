// Garfield skeleton: rest positions in model space (metres, Y up, facing +Z, feet at y=0).
// Every bone's rest rotation is identity, so pose angles read as parent-aligned pitch(X)/yaw(Y)/roll(Z).
export const BONES = [
  ['root', null, [0, 0, 0]],
  ['hips', 'root', [0, 0.25, -0.12]],
  ['spine', 'hips', [0, 0.25, -0.01]],
  ['chest', 'spine', [0, 0.27, 0.10]],
  ['neck', 'chest', [0, 0.33, 0.17]],
  ['head', 'neck', [0, 0.39, 0.23]],
  ['jaw', 'head', [0, 0.345, 0.29]],
  ['earL', 'head', [0.095, 0.48, 0.215]],
  ['earR', 'head', [-0.095, 0.48, 0.215]],
  ['belly', 'spine', [0, 0.17, -0.03]],
  ['shoulderL', 'chest', [0.095, 0.24, 0.13]],
  ['elbowL', 'shoulderL', [0.095, 0.13, 0.155]],
  ['pawL', 'elbowL', [0.092, 0.045, 0.172]],
  ['shoulderR', 'chest', [-0.095, 0.24, 0.13]],
  ['elbowR', 'shoulderR', [-0.095, 0.13, 0.155]],
  ['pawR', 'elbowR', [-0.092, 0.045, 0.172]],
  ['thighL', 'hips', [0.115, 0.21, -0.17]],
  ['shinL', 'thighL', [0.11, 0.13, -0.175]],
  ['footL', 'shinL', [0.105, 0.045, -0.165]],
  ['thighR', 'hips', [-0.115, 0.21, -0.17]],
  ['shinR', 'thighR', [-0.11, 0.13, -0.175]],
  ['footR', 'shinR', [-0.105, 0.045, -0.165]],
  ['tail0', 'hips', [0, 0.235, -0.30]],
  ['tail1', 'tail0', [0, 0.245, -0.39]],
  ['tail2', 'tail1', [0, 0.27, -0.47]],
  ['tail3', 'tail2', [0, 0.31, -0.54]],
  ['tail4', 'tail3', [0, 0.37, -0.59]],
  ['tail5', 'tail4', [0, 0.43, -0.615]],
];
export const TAIL_TIP = [0, 0.49, -0.622];
export const BONE_INDEX = Object.fromEntries(BONES.map((b, i) => [b[0], i]));
