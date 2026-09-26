import { mat, glow, scuffTex } from './materials.js';
import { pod, band, arcH, ringH, discX, ringX, rod, capRod, hand } from './shapes.js';

const PI = Math.PI;

// ---- Scrap Rat: small junk-built quadruped (pelvis = rear can, chest = front box, aux0 = tail, aux1 = jaw) ----
export const RAT_DIMS = {
  hover: 0.16, thigh: 0.08, shin: 0.09, upArm: 0.08, foreArm: 0.09,
  offsets: {
    spine: [0, 0.01, 0.1], chest: [0, 0.005, 0.1], neck: [0, 0.02, 0.07], head: [0, 0.005, 0.045],
    clavL: [0.055, -0.03, 0.02], upArmL: [0.02, 0, 0], foreArmL: [0, -0.08, 0], handL: [0, -0.09, 0],
    thighL: [0.06, -0.02, -0.03], shinL: [0, -0.08, 0], footL: [0, -0.09, 0],
    aux0: [0, 0.03, -0.29], aux1: [0, -0.012, 0.035],
  },
};

export function buildRat(b, o) {
  const far = b.far;
  // rear battery can
  const can = b.cyl(0.068, 0.068, 0.17, 14); can.rotateX(PI / 2);
  b.add(can, 'pelvis', 'body', [0, 0.012, -0.01]);
  const rim = b.tor(0.069, 0.008, 16, 5); b.add(rim, 'pelvis', 'mech', [0, 0.012, -0.095]);
  b.add(b.cyl(0.02, 0.02, 0.02, 8), 'pelvis', 'trim', [0, 0.012, -0.105], [PI / 2, 0, 0]);
  b.add(b.rbox(0.1, 0.018, 0.12, 0.006), 'pelvis', 'trim', [0.01, 0.08, 0.0], [0.05, 0.1, 0.12]);
  b.sym(b.sph(8, 6), 'pelvis', 'mech', [0.06, -0.02, -0.03], [0, 0, 0], 0.02);
  // bellows spine
  for (let i = 0; i < 3; i++) { const r = b.tor(0.042, 0.012, 14, 5); b.add(r, 'spine', 'mech', [0, 0.005, -0.03 + i * 0.035]); }
  // front body: dented box + plates + exhaust stub
  b.add(b.rbox(0.13, 0.095, 0.12, 0.018), 'chest', 'body', [0, 0.01, 0.015], [0.08, 0, 0.03]);
  b.add(b.rbox(0.07, 0.012, 0.09, 0.004), 'chest', 'trim', [-0.03, 0.062, 0.02], [0.1, 0.2, -0.15]);
  b.add(b.rbox(0.012, 0.06, 0.07, 0.004), 'chest', 'trim', [0.068, 0.0, 0.02], [0, 0, 0.1]);
  if (!far) {
    b.add(b.cyl(0.012, 0.014, 0.07, 8), 'chest', 'mech', [0.035, 0.08, -0.03], [-0.5, 0, 0.2]);
    b.add(b.cyl(0.004, 0.004, 0.12, 5), 'chest', 'mech', [-0.04, 0.1, -0.02], [-0.3, 0, -0.1]);
    b.add(b.sph(6, 5), 'chest', 'glow', [-0.046, 0.16, -0.04], [0, 0, 0], 0.008);
  }
  b.sym(b.sph(8, 6), 'chest', 'mech', [0.06, -0.03, 0.02], [0, 0, 0], 0.02);
  // head: sensor block, lens, LED eyes
  b.add(b.cyl(0.02, 0.024, 0.05, 8), 'neck', 'mech', [0, 0.005, 0.02], [PI / 2, 0, 0]);
  b.add(b.rbox(0.085, 0.06, 0.075, 0.012), 'head', 'body', [0, 0.012, 0.02], [0, 0, -0.06]);
  b.add(b.cyl(0.022, 0.026, 0.03, 12), 'head', 'mech', [0.012, 0.022, 0.06], [PI / 2, 0, 0]);
  b.add(b.cyl(0.015, 0.015, 0.012, 12), 'head', 'eye', [0.012, 0.022, 0.076], [PI / 2, 0, 0]);
  b.add(b.sph(6, 5), 'head', 'eye', [-0.028, 0.032, 0.058], [0, 0, 0], 0.007);
  b.add(b.sph(6, 5), 'head', 'eye', [-0.03, 0.012, 0.058], [0, 0, 0], 0.006);
  if (!far) b.add(b.cyl(0.003, 0.003, 0.07, 4), 'head', 'mech', [0.03, 0.07, 0.0], [-0.4, 0, -0.3]);
  // mandible pincers on the jaw bone
  for (const sx of [1, -1]) {
    b.add(b.tube([[0.025 * sx, 0, 0], [0.04 * sx, -0.012, 0.035], [0.01 * sx, -0.02, 0.065]], 0.006, 6, 4), 'aux1', 'trim');
  }
  // legs: spindly rods, knuckle joints, spike feet
  for (const [u, l] of [['upArm', 'foreArm'], ['thigh', 'shin']]) {
    b.sym(capRod(b, [0, 0, 0], [0, -0.08, 0], 0.011, 6), u, 'mech');
    b.sym(b.rbox(0.018, 0.05, 0.024, 0.004), u, 'trim', [0.008, -0.035, 0]);
    b.sym(b.sph(8, 6), l, 'trim', [0, 0, 0], [0, 0, 0], 0.016);
    b.sym(capRod(b, [0, 0, 0], [0, -0.075, 0], 0.008, 6), l, 'mech');
    const tip = b.cyl(0.008, 0.0, 0.025, 5); b.sym(tip, l, 'body', [0, -0.085, 0]);
  }
  // cable tail with a spark-plug tip
  if (!far) b.add(b.tube([[0, 0, 0.02], [0, 0.03, -0.06], [0, 0.07, -0.12], [0, 0.06, -0.17]], 0.007, 10, 4), 'aux0', 'mech');
  b.add(b.cyl(0.01, 0.006, 0.03, 6), 'aux0', 'trim', [0, 0.058, -0.18], [PI / 2 + 0.3, 0, 0]);
  b.add(b.sph(6, 5), 'aux0', 'glow', [0, 0.054, -0.197], [0, 0, 0], 0.008);
}

export function ratMats(tone) {
  const map = scuffTex();
  return {
    body: mat('rust' + tone, { color: [0x8a5a36, 0x6f6a5c, 0x7a4a2a][tone], metal: 0.55, rough: 0.72, map }),
    trim: mat('primer' + tone, { color: [0xc9a43a, 0x8a9a6a, 0xb35a2a][tone], metal: 0.2, rough: 0.6, map }),
    mech: mat('oilsteel', { color: 0x2d2c2a, metal: 0.85, rough: 0.45 }),
    glow: glow('ratglow', 0xff7a1a, 3),
    eye: glow('rateye', 0xff2a14, 4),
  };
}

// ---- Warden Eye drone: hover rig. pelvis = hull, head = eye turret, upArm/foreArm = gun pods, thighL/R = spinning rotors ----
export const DRONE_DIMS = {
  hover: 1.55,
  offsets: {
    spine: [0, 0, 0], chest: [0, 0, 0], neck: [0, 0, 0], head: [0, 0, 0.07],
    clavL: [0.09, -0.1, 0.04], upArmL: [0, 0, 0], foreArmL: [0, -0.05, 0], handL: [0, -0.02, 0],
    thighL: [0.27, 0.04, -0.03], shinL: [0, 0, 0], footL: [0, 0, 0],
    aux0: [0, 0.14, -0.08], aux1: [0, 0, 0.1],
  },
};

export function buildDrone(b, o) {
  const far = b.far;
  b.add(b.sph(22, 16), 'pelvis', 'body', [0, 0, 0], [0, 0, 0], [0.17, 0.13, 0.2]);
  b.add(b.sph(16, 10), 'pelvis', 'mech', [0, -0.07, -0.01], [0, 0, 0], [0.12, 0.07, 0.15]);
  b.add(ringH(b, 0.172, 0.012, 28), 'pelvis', 'trim', [0, 0, 0], [0, 0, 0], [1, 1, 1.16]);
  b.add(b.rbox(0.02, 0.07, 0.16, 0.008), 'pelvis', 'trim', [0, 0.13, -0.05], [0.2, 0, 0]);
  b.add(b.cyl(0.04, 0.04, 0.012, 16), 'pelvis', 'glow', [0, -0.135, 0.02]);
  b.sym(rod(b, [0.12, 0.03, -0.03], [0.2, 0.04, -0.03], 0.018, 8), 'pelvis', 'mech');
  b.sym(ringH(b, 0.1, 0.02, 24), 'pelvis', 'body', [0.27, 0.04, -0.03]);
  b.sym(ringH(b, 0.085, 0.008, 20), 'pelvis', 'trim', [0.27, 0.025, -0.03]);
  if (!far) b.sym(b.cyl(0.004, 0.004, 0.17, 4), 'pelvis', 'mech', [0.27, 0.035, -0.03], [0, 0, PI / 2]);
  // rotors (spun in code)
  for (let i = 0; i < 3; i++) b.sym(b.box(0.085, 0.004, 0.022), 'thigh', 'mech', [Math.cos(i * 2.094) * 0.043, 0.02, Math.sin(i * 2.094) * 0.043], [0.25, -i * 2.094, 0]);
  b.sym(b.cyl(0.015, 0.015, 0.02, 8), 'thigh', 'trim', [0, 0.02, 0]);
  // eye turret
  b.add(b.sph(16, 12), 'head', 'mech', [0, 0, 0], [0, 0, 0], 0.085);
  b.add(b.cyl(0.05, 0.055, 0.03, 20), 'head', 'trim', [0, 0, 0.07], [PI / 2, 0, 0]);
  b.add(b.cyl(0.042, 0.042, 0.012, 20), 'head', 'eye', [0, 0, 0.086], [PI / 2, 0, 0]);
  // gun pods
  b.sym(b.cyl(0.012, 0.012, 0.06, 6), 'upArm', 'mech', [0, -0.02, 0]);
  b.sym(b.rbox(0.04, 0.04, 0.13, 0.012), 'foreArm', 'trim', [0, 0, 0.02]);
  b.sym(b.cyl(0.01, 0.01, 0.1, 6), 'foreArm', 'mech', [0, 0, 0.11], [PI / 2, 0, 0]);
  // antenna + beacon
  if (!far) b.add(b.cyl(0.004, 0.005, 0.14, 4), 'aux0', 'mech', [0, 0.05, 0], [-0.3, 0, 0]);
  b.add(b.sph(8, 6), 'aux0', 'glow', [0, 0.12, -0.03], [0, 0, 0], 0.014);
}

export function droneMats() {
  return {
    body: mat('drone_white', { color: 0xeef1f5, metal: 0.15, rough: 0.25, coat: 1 }),
    trim: mat('drone_navy', { color: 0x1b2a4a, metal: 0.5, rough: 0.35, coat: 0.6 }),
    mech: mat('drone_mech', { color: 0x16181d, metal: 0.9, rough: 0.3 }),
    glow: glow('drone_glow', 0x3aa0ff, 3),
    eye: glow('drone_eye', 0xff3a2a, 4),
  };
}
