import * as THREE from '../../../../lib/three/0.180.0/three.module.js';
import { mat, glow, scuffTex, orangeTex, decalTex, visorTex, DECAL } from './materials.js';
import { pod, band, arcH, ringH, discX, ringX, rod, capRod, gripper } from './shapes.js';
import { buildElegant } from './kinds_civ.js';

const PI = Math.PI;

// ================= HireFrame R-1 rental =================
export const RENTAL_DIMS = {
  thigh: 0.4, shin: 0.4, ankle: 0.09, hipX: 0.1, hipY: -0.05, spine: 0.12, chest: 0.22, neck: 0.2, headOff: 0.07,
  clavX: 0.05, clavY: 0.2, shoulder: 0.16, upArm: 0.28, foreArm: 0.26,
};

export function buildRental(b) {
  const far = b.far, D = b.rig.D;
  // head: dented box, cracked visor, antenna stub
  b.add(b.rbox(0.19, 0.17, 0.18, 0.03), 'head', 'body', [0, 0.1, 0]);
  b.add(b.rbox(0.176, 0.076, 0.03, 0.01), 'head', 'mech', [0, 0.112, 0.082]);
  b.add(b.decal(0.16, 0.058, [0, 0, 1, 1]), 'head', 'eye', [0, 0.112, 0.0975]);
  for (const y of [0.04, 0.052, 0.064]) b.add(b.box(0.09, 0.005, 0.01), 'head', 'mech', [0, y, 0.09]);
  b.add(b.rbox(0.04, 0.012, 0.17, 0.005), 'head', 'paint', [0.045, 0.188, 0]);
  b.sym(discX(b, 0.032, 0.022, 12), 'head', 'mech', [0.098, 0.1, 0]);
  if (!far) {
    b.add(b.cyl(0.005, 0.006, 0.13, 5), 'head', 'mech', [-0.06, 0.24, -0.04], [0.15, 0, 0.2]);
    b.add(b.sph(6, 5), 'head', 'paint', [-0.073, 0.305, -0.03], [0, 0, 0], 0.013);
  }
  // neck bellows
  b.add(b.cyl(0.03, 0.035, 0.1, 8), 'neck', 'mech', [0, 0.04, 0]);
  for (const y of [0.015, 0.042, 0.069]) b.add(ringH(b, 0.042, 0.012, 12), 'neck', 'mech', [0, y, 0]);
  // torso box + decals + battery backpack
  b.add(b.rbox(0.36, 0.25, 0.24, 0.035), 'chest', 'body', [0, 0.12, 0]);
  b.add(b.decal(0.2, 0.1, DECAL.chest), 'chest', 'decal', [0.02, 0.15, 0.1205]);
  b.add(b.decal(0.28, 0.035, DECAL.hazard), 'chest', 'decal', [0, 0.03, 0.1205]);
  b.add(b.decal(0.1, 0.1, DECAL.num), 'chest', 'decal', [-0.1805, 0.14, 0], [0, -PI / 2, 0]);
  b.sym(b.rbox(0.12, 0.05, 0.22, 0.015), 'chest', 'paint', [0.14, 0.235, 0]);
  b.add(b.rbox(0.26, 0.2, 0.1, 0.02), 'chest', 'paint', [0, 0.12, -0.165]);
  b.add(b.decal(0.22, 0.11, DECAL.back), 'chest', 'decal', [0, 0.13, -0.2155], [0, PI, 0]);
  b.add(b.sph(8, 6), 'chest', 'glow', [-0.12, 0.2, 0.12], [0, 0, 0], 0.012);
  // battery gauge on the backpack: three amber bars lit, the last one dead
  for (let i = 0; i < 4; i++) b.add(b.box(0.04, 0.022, 0.01), 'chest', i < 3 ? 'glow' : 'mech', [-0.075 + i * 0.05, 0.215, -0.218]);
  // clip-on rental beacon: reads as the player's warm dot from the overhead camera
  b.add(b.cyl(0.028, 0.034, 0.02, 10), 'head', 'mech', [0.03, 0.195, -0.04]);
  b.add(b.sph(10, 6, 0, PI * 2, 0, PI / 2), 'head', 'glow', [0.03, 0.203, -0.04], [0, 0, 0], [0.027, 0.03, 0.027]);
  b.sym(b.sph(10, 8), 'chest', 'mech', [0.18, 0.2, 0], [0, 0, 0], 0.045);
  // spine bellows
  b.add(b.cyl(0.04, 0.045, 0.14, 8), 'spine', 'mech', [0, 0.07, 0]);
  for (const y of [0.025, 0.06, 0.095]) b.add(ringH(b, 0.07, 0.018, 16), 'spine', 'mech', [0, y, 0], [0, 0, 0], [1.15, 1, 0.9]);
  // pelvis
  b.add(b.rbox(0.3, 0.13, 0.2, 0.03), 'pelvis', 'paint', [0, -0.01, 0]);
  b.add(b.decal(0.16, 0.035, DECAL.barcode), 'pelvis', 'decal', [0, -0.01, 0.1005]);
  b.sym(b.sph(10, 8), 'pelvis', 'mech', [0.1, -0.05, 0], [0, 0, 0], 0.05);
  b.sym(b.cyl(0.018, 0.018, 0.12, 6), 'clav', 'mech', [0.07, 0, 0], [0, 0, PI / 2]);
  // right arm: stock rental box arm
  b.add(b.rbox(0.11, 0.1, 0.11, 0.02), 'upArmR', 'body', [0, 0, 0]);
  b.add(b.cyl(0.03, 0.03, 0.26, 8), 'upArmR', 'mech', [0, -0.14, 0]);
  b.add(b.rbox(0.085, 0.15, 0.085, 0.015), 'upArmR', 'body', [0, -0.15, 0]);
  b.add(b.rbox(0.07, 0.05, 0.05, 0.012), 'upArmR', 'paint', [0, -0.27, -0.045]);
  b.add(b.sph(10, 8), 'foreArmR', 'mech', [0, 0, 0], [0, 0, 0], 0.04);
  b.add(b.rbox(0.085, 0.2, 0.09, 0.02), 'foreArmR', 'body', [0, -0.125, 0]);
  b.add(ringH(b, 0.04, 0.01, 12), 'foreArmR', 'mech', [0, -0.24, 0]);
  // left arm: mismatched salvage arm in blue primer, with duct tape
  b.add(b.sph(12, 10), 'upArmL', 'odd', [0.005, 0, 0], [0, 0, 0], 0.058);
  b.add(b.cyl(0.026, 0.026, 0.26, 8), 'upArmL', 'mech', [0, -0.14, 0]);
  b.add(pod(b, -0.05, -0.26, [0.042, 0.05, 0.045, 0.036], 14), 'upArmL', 'odd');
  b.add(b.decal(0.09, 0.05, DECAL.tape), 'upArmL', 'decal', [0.051, -0.07, 0], [0, PI / 2, 0.35]);
  b.add(b.sph(10, 8), 'foreArmL', 'mech', [0, 0, 0], [0, 0, 0], 0.034);
  b.add(pod(b, -0.02, -0.235, [0.036, 0.044, 0.04, 0.032], 14), 'foreArmL', 'odd');
  b.add(b.rbox(0.028, 0.08, 0.065, 0.01), 'handL', 'odd', [0, -0.045, 0]);
  for (let i = 0; i < 3; i++) b.add(b.cap(0.009, 0.05, 5), 'handL', 'mech', [-0.006, -0.11, -0.02 + i * 0.02], [0, 0, -0.25]);
  b.add(b.cap(0.01, 0.035, 5), 'handL', 'mech', [-0.02, -0.04, 0.035], [0.7, 0, -0.5]);
  gripperR(b);
  b.sym(b.sph(10, 8), 'hand', 'mech', [0, 0.005, 0], [0, 0, 0], 0.032);
  b.add(b.cyl(0.024, 0.024, 0.05, 8), 'foreArmL', 'mech', [0, -0.245, 0]);
  // legs
  b.sym(b.sph(10, 8), 'thigh', 'mech', [0, 0, 0], [0, 0, 0], 0.05);
  b.sym(b.cyl(0.03, 0.03, 0.38, 8), 'thigh', 'mech', [0, -0.2, 0]);
  b.sym(b.rbox(0.12, 0.27, 0.13, 0.025), 'thigh', 'body', [0, -0.19, 0.005]);
  b.sym(b.sph(10, 8), 'shin', 'mech', [0, 0, 0], [0, 0, 0], 0.045);
  b.sym(b.rbox(0.09, 0.08, 0.05, 0.015), 'shin', 'paint', [0, -0.01, 0.055]);
  b.sym(b.rbox(0.1, 0.27, 0.11, 0.02), 'shin', 'body', [0, -0.2, 0]);
  b.sym(b.sph(8, 6), 'shin', 'mech', [0, -D.shin, 0], [0, 0, 0], 0.035);
  b.sym(b.rbox(0.11, 0.075, 0.22, 0.02), 'foot', 'mech', [0, -0.052, 0.04]);
  b.sym(b.rbox(0.1, 0.05, 0.06, 0.015), 'foot', 'paint', [0, -0.058, 0.13]);
}
function gripperR(b) {
  b.add(b.rbox(0.05, 0.07, 0.075, 0.012), 'handR', 'body', [0, -0.04, 0]);
  b.add(b.rbox(0.018, 0.07, 0.05, 0.006), 'handR', 'mech', [0.018, -0.1, 0], [0, 0, 0.2]);
  b.add(b.rbox(0.018, 0.07, 0.05, 0.006), 'handR', 'mech', [-0.02, -0.1, 0], [0, 0, -0.12]);
}

export function rentalMats() {
  return {
    body: mat('rental_grey', { color: 0xa2a5a7, metal: 0.35, rough: 0.62, map: scuffTex() }),
    paint: mat('rental_orange', { color: 0xff6a13, metal: 0.05, rough: 0.55, map: orangeTex() }),
    odd: mat('rental_odd', { color: 0x5d7b8f, metal: 0.3, rough: 0.5, map: scuffTex() }),
    mech: mat('rental_mech', { color: 0x2a2b2e, metal: 0.6, rough: 0.5 }),
    decal: mat('rental_decal', { color: 0xffffff, metal: 0.1, rough: 0.6, map: decalTex() }),
    glow: glow('rental_led', 0xffa020, 2.5),
    eye: mat('rental_visor', { color: 0x0a0604, emissive: 0xffffff, ei: 1.5, emap: visorTex(), rough: 0.12, metal: 0.2 }),
  };
}

// ================= Heavy frames: brawler "Bulwark" / enforcer =================
export const BRAWLER_DIMS = {
  thigh: 0.42, shin: 0.41, ankle: 0.1, hipX: 0.13, hipY: -0.05, spine: 0.12, chest: 0.3, neck: 0.27, headOff: 0.04,
  clavX: 0.07, clavY: 0.24, shoulder: 0.25, upArm: 0.3, foreArm: 0.3, aux0: [0, 0.2, -0.2],
};
export const ENFORCER_DIMS = {
  thigh: 0.48, shin: 0.47, ankle: 0.11, hipX: 0.15, hipY: -0.06, spine: 0.14, chest: 0.34, neck: 0.31, headOff: 0.03,
  clavX: 0.08, clavY: 0.27, shoulder: 0.29, upArm: 0.34, foreArm: 0.34, aux0: [0, 0.2, -0.26],
};

export function buildHeavy(b, o) {
  const t = o.tier, E = !!o.enforcer, k = E ? 1.15 : 1, far = b.far, D = b.rig.D;
  const G = t >= 1 ? 'glow' : 'mech';
  // head
  b.scope([0, 0, 0], [0, 0, 0], k * (E ? 0.9 : 1), () => {
    b.add(b.sph(18, 14), 'head', 'body', [0, 0.085, 0.0], [0, 0, 0], [0.1, 0.11, 0.115]);
    b.add(b.rbox(0.15, 0.075, 0.07, 0.02), 'head', 'trim', [0, 0.05, 0.075]);
    b.add(b.rbox(0.13, 0.017, 0.02, 0.006), 'head', 'eye', [0, 0.1, 0.104]);
    b.add(b.rbox(0.18, 0.035, 0.1, 0.012), 'head', 'body', [0, 0.13, 0.055], [0.15, 0, 0]);
    b.sym(discX(b, 0.035, 0.03, 14), 'head', 'trim', [0.095, 0.08, 0]);
    if (t >= 4 && !E) b.add(b.sph(10, 10), 'head', 'trim', [0, 0.19, -0.01], [0.3, 0, 0], [0.016, 0.05, 0.12]);
    else if (t >= 1 && !E) b.add(b.rbox(0.035, 0.05, 0.19, 0.012), 'head', 'trim', [0, 0.185, 0.0]);
    if (E) for (const sx of [1, -1]) b.add(b.cyl(0.006, 0.012, 0.12, 5), 'head', 'trim', [0.07 * sx, 0.2, -0.05], [-0.3, 0, -0.35 * sx]);
  });
  b.add(b.cyl(0.05, 0.06, 0.12, 10), 'neck', 'mech', [0, 0.04, 0]);
  b.add(ringH(b, 0.09 * k, 0.02, 20), 'chest', 'trim', [0, D.neck - 0.005, 0]);
  // chest barrel + pecs + core
  b.scope([0, 0, 0], [0, 0, 0], k, () => {
    b.add(b.sph(18, 14), 'chest', 'mech', [0, 0.13, 0], [0, 0, 0], [0.2, 0.16, 0.14]);
    b.add(b.sph(22, 16), 'chest', 'body', [0, 0.16, 0.0], [0, 0, 0], [0.25, 0.18, 0.175]);
    b.sym(b.rbox(0.17, 0.13, 0.05, 0.022), 'chest', 'body', [0.095, 0.19, 0.145], [-0.25, 0.3, 0.05]);
    if (t >= 1 && !E) b.sym(b.rbox(0.175, 0.022, 0.054, 0.008), 'chest', 'trim', [0.095, 0.25, 0.16], [-0.25, 0.3, 0.05]);
    b.add(arcH(b, 0.2, 0.012, PI * 0.9, 20, 5), 'chest', 'trim', [0, 0.075, 0.02], [0, 0, 0], [1, 1, 0.9]);
    const ring = b.tor(0.05, 0.011, 20, 6); b.add(ring, 'chest', 'trim', [0, 0.14, 0.178]);
    b.add(b.cyl(0.042, 0.042, 0.02, 16), 'chest', G, [0, 0.14, 0.172], [PI / 2, 0, 0]);
    b.add(b.rbox(0.3, 0.25, 0.1, 0.03), 'chest', 'body', [0, 0.16, -0.14]);
    if (t >= 3 || E) b.add(b.rbox(0.36, 0.08, 0.3, 0.03), 'chest', 'body', [0, 0.27, -0.01]);
    if (E) {
      b.add(b.cyl(0.1, 0.1, 0.34, 16), 'chest', 'mech', [0, 0.18, -0.26]);
      for (const y of [0.08, 0.18, 0.28]) b.add(ringH(b, 0.103, 0.012, 20), 'chest', 'glow', [0, y, -0.26]);
      b.add(b.sph(14, 8, 0, PI * 2, 0, PI / 2), 'chest', 'body', [0, 0.35, -0.26], [0, 0, 0], [0.1, 0.05, 0.1]);
    }
  });
  // abdomen
  const sl = D.chest;
  b.add(b.cyl(0.05, 0.055, sl + 0.04, 10), 'spine', 'mech', [0, sl / 2, 0]);
  for (let i = 0; i < 3; i++) {
    const y = 0.03 + i * (sl - 0.04) / 2.6, r = (0.1 + i * 0.012) * k;
    b.add(b.cyl(r - 0.02, r - 0.02, 0.05, 14), 'spine', 'mech', [0, y, -0.01], [0, 0, 0], [1.15, 1, 0.9]);
    b.add(band(b, r - 0.01, r + 0.025, 0.06, PI * 1.25, 20), 'spine', 'body', [0, y, 0], [0, 0, 0], [1.1, 1, 0.9]);
  }
  if (!far) b.sym(rod(b, [0.11 * k, -0.01, -0.035], [0.13 * k, sl, -0.035], 0.012, 6), 'spine', 'trim');
  // pelvis
  b.scope([0, 0, 0], [0, 0, 0], k, () => {
    b.add(b.sph(18, 12), 'pelvis', 'body', [0, -0.02, 0], [0, 0, 0], [0.2, 0.12, 0.15]);
    b.add(ringH(b, 0.16, 0.02, 24), 'pelvis', 'trim', [0, 0.06, 0], [0, 0, 0], [1, 1, 0.8]);
    b.add(b.rbox(0.12, 0.12, 0.04, 0.015), 'pelvis', 'body', [0, -0.07, 0.13], [0.15, 0, 0]);
    b.sym(b.sph(10, 8), 'pelvis', 'mech', [0.13, -0.05, 0], [0, 0, 0], 0.07);
  });
  b.sym(b.cyl(0.035, 0.035, D.shoulder, 8), 'clav', 'mech', [D.shoulder / 2, 0, 0], [0, 0, PI / 2]);
  // shoulders
  b.scope([0, 0, 0], [0, 0, 0], k, () => {
    b.sym(b.sph(12, 10), 'upArm', 'mech', [0, 0, 0], [0, 0, 0], 0.07);
    if (!E) {
      b.sym(b.sph(20, 14, 0, PI * 2, 0, PI * 0.6), 'upArm', 'body', [0.03, -0.035, 0], [0, 0, -0.3], [0.16, 0.13, 0.16]);
      b.sym(band(b, 0.125, 0.15, 0.03, PI * 2, 24), 'upArm', 'trim', [0.03, -0.07, 0], [0, 0, -0.3]);
      if (t >= 3) b.sym(b.sph(18, 10, 0, PI * 2, 0, PI * 0.5), 'upArm', 'body', [0.06, 0.07, 0], [0, 0, -0.45], [0.13, 0.1, 0.14]);
      if (t >= 4) for (let i = 0; i < 3; i++) b.sym(b.cyl(0.0, 0.022, 0.09, 6), 'upArm', 'trim', [0.09, 0.1, -0.06 + i * 0.06], [0, 0, -0.9]);
    } else {
      b.sym(b.rbox(0.22, 0.14, 0.26, 0.04), 'upArm', 'body', [0.05, 0.03, 0], [0, 0, -0.3]);
      b.sym(b.rbox(0.2, 0.03, 0.27, 0.01), 'upArm', 'trim', [0.06, -0.035, 0], [0, 0, -0.3]);
      if (!far) for (let i = 0; i < 3; i++) b.sym(b.box(0.12, 0.012, 0.02), 'upArm', 'mech', [0.05, 0.1, -0.06 + i * 0.06], [0, 0, -0.3]);
    }
    b.sym(pod(b, -0.06, -0.28, [0.075, 0.085, 0.08, 0.068], 16), 'upArm', 'body');
  });
  b.sym(b.sph(10, 8), 'upArm', 'mech', [0, -D.upArm, 0], [0, 0, 0], 0.06 * k);
  // piston forearms + fists
  b.scope([0, 0, 0], [0, 0, 0], k, () => {
    b.sym(pod(b, -0.03, -0.27, [0.085, 0.105, 0.105, 0.088], 18), 'foreArm', 'body');
    if (!far) for (const x of [0.035, -0.035]) {
      b.sym(rod(b, [x, -0.03, -0.1], [x, -0.24, -0.09], 0.011, 6), 'foreArm', 'trim');
      b.sym(b.cyl(0.018, 0.018, 0.08, 8), 'foreArm', 'mech', [x, -0.07, -0.098]);
    }
    if (t >= 2) b.sym(b.box(0.012, 0.14, 0.05), 'foreArm', 'glow', [0.105, -0.15, 0.0]);
    b.sym(ringH(b, 0.09, 0.014, 18), 'foreArm', 'trim', [0, -0.26, 0]);
    if (t >= 1) b.sym(band(b, 0.098, 0.108, 0.03, PI * 2, 20), 'foreArm', 'trim', [0, -0.13, 0]);
    b.sym(b.rbox(0.14, 0.13, 0.14, 0.035), 'hand', 'body', [0, -0.075, 0]);
    b.sym(b.rbox(0.12, 0.035, 0.15, 0.012), 'hand', 'trim', [-0.01, -0.14, 0]);
    b.sym(b.rbox(0.05, 0.08, 0.05, 0.015), 'hand', 'body', [-0.06, -0.06, 0.06], [0.3, 0, 0]);
  });
  if (E) {
    b.add(b.rbox(0.05, 0.6, 0.44, 0.02), 'foreArmL', 'body', [0.14, -0.16, 0.02]);
    b.add(b.rbox(0.012, 0.5, 0.06, 0.004), 'foreArmL', 'trim', [0.166, -0.16, 0.02]);
  }
  if (E && !far) b.add(b.box(0.01, 0.4, 0.016), 'foreArmL', 'glow', [0.173, -0.16, 0.02]);
  // legs
  b.scope([0, 0, 0], [0, 0, 0], [k, 1, k], () => {
    b.sym(b.sph(12, 10), 'thigh', 'mech', [0, 0, 0], [0, 0, 0], 0.075);
    b.sym(pod(b, -0.04, -D.thigh + 0.02, [0.1, 0.12, 0.115, 0.1, 0.08], 18), 'thigh', 'body', [0.01, 0, 0.01]);
    b.sym(band(b, 0.08, 0.095, 0.025, PI * 2, 20), 'thigh', 'trim', [0.01, -D.thigh + 0.06, 0.01]);
    b.sym(b.sph(10, 8), 'shin', 'mech', [0, 0, 0], [0, 0, 0], 0.065);
    b.sym(b.rbox(0.1, 0.1, 0.06, 0.02), 'shin', 'trim', [0, 0, 0.075]);
    b.sym(pod(b, -0.05, -D.shin + 0.02, [0.075, 0.09, 0.085, 0.07, 0.06], 18), 'shin', 'body', [0, 0, -0.01]);
    b.sym(b.rbox(0.09, 0.25, 0.04, 0.015), 'shin', 'body', [0, -0.19, 0.07], [-0.05, 0, 0]);
    b.sym(b.sph(8, 6), 'shin', 'mech', [0, -D.shin, 0], [0, 0, 0], 0.045);
    b.sym(b.rbox(0.15, 0.09, 0.28, 0.03), 'foot', 'body', [0, -D.ankle + 0.045, 0.05]);
    b.sym(b.rbox(0.14, 0.06, 0.07, 0.02), 'foot', 'trim', [0, -D.ankle + 0.035, 0.18]);
  });
  // back exhaust stacks (brawler)
  if (!E) for (const sx of [1, -1]) {
    b.add(b.cyl(0.03, 0.036, 0.2, 10), 'aux0', 'mech', [0.08 * sx, 0.04, 0], [-0.3, 0, 0]);
    b.add(ringH(b, 0.03, 0.006, 12), 'aux0', G, [0.08 * sx, 0.135, 0.03]);
  }
}

const GOLD_T = [0xb89048, 0xd4a852, 0xe8bd62, 0xf5cb70, 0xffd67e];
export function heavyMats(tier, enforcer) {
  const t = tier;
  if (enforcer) {
    const gold = t >= 3;
    return {
      body: gold ? mat('enf_gold', { color: 0xf5cb70, metal: 1, rough: 0.2, coat: 0.5 }) : mat('enf_black' + t, { color: 0x1a1b1e, metal: 0.7, rough: 0.35 - t * 0.04, coat: 0.3 }),
      trim: gold ? mat('enf_goldtrim', { color: 0x1a1a1d, metal: 1, rough: 0.2 }) : mat('enf_red', { color: 0x9b111e, metal: 0.4, rough: 0.35, coat: 0.6 }),
      mech: mat('enf_mech', { color: 0x0e0f11, metal: 0.9, rough: 0.35 }),
      glow: glow('enf_glow' + (gold ? 'g' : ''), gold ? 0xffd070 : 0xff2a2a, 3),
      eye: glow('enf_eye', 0xff2020, 4),
    };
  }
  return {
    body: mat('brw_black' + t, { color: 0x0a0a0c, metal: 0.45, rough: [0.45, 0.35, 0.3, 0.25, 0.22][t], coat: [0.2, 0.5, 0.8, 1, 1][t], coatRough: 0.06 }),
    trim: mat('brw_gold' + t, { color: GOLD_T[t], metal: 1, rough: [0.45, 0.35, 0.28, 0.22, 0.15][t], coat: t >= 3 ? 0.5 : 0 }),
    mech: mat('brw_mech', { color: 0x1c1c20, metal: 0.9, rough: 0.35 }),
    glow: glow('brw_glow' + t, 0xffa040, 2 + t * 0.6),
    eye: glow('brw_eye' + t, 0xffb050, 2.5 + t * 0.4),
  };
}

// ================= Elegant-derived frames =================
export const GUNNER_DIMS = {
  thigh: 0.47, shin: 0.46, ankle: 0.08, hipX: 0.095, spine: 0.12, chest: 0.24, neck: 0.24, headOff: 0.09,
  shoulder: 0.15, upArm: 0.32, foreArm: 0.29, aux0: [0.17, 0.25, -0.05],
};
export const GHOST_DIMS = { thigh: 0.45, shin: 0.45, ankle: 0.075, hipX: 0.088, shoulder: 0.128, upArm: 0.3, foreArm: 0.27, aux0: [0, 0.14, -0.12] };
export const SECURITY_DIMS = { thigh: 0.44, shin: 0.43, ankle: 0.08, hipX: 0.1, shoulder: 0.15, upArm: 0.3, foreArm: 0.27 };

export function buildGunner(b, o) {
  const t = o.tier, far = b.far;
  buildElegant(b, { face: 'visor', chestPlate: true, layered: t >= 3, lines: t >= 2, crest: 0 });
  // carbine held in the right hand, barrel along the hand's -y
  b.add(b.rbox(0.05, 0.3, 0.085, 0.014), 'handR', 'mech', [-0.012, -0.15, 0.03]);
  b.add(b.cyl(0.016, 0.016, 0.3, 8), 'handR', 'mech', [-0.012, -0.44, 0.045]);
  b.add(b.cyl(0.024, 0.024, 0.05, 8), 'handR', 'trim', [-0.012, -0.58, 0.045]);
  b.add(b.rbox(0.036, 0.06, 0.1, 0.012), 'handR', 'trim', [-0.012, -0.11, 0.1], [0.35, 0, 0]);
  b.add(b.rbox(0.04, 0.12, 0.06, 0.012), 'handR', 'body', [-0.012, 0.02, -0.02]);
  b.add(b.rbox(0.03, 0.1, 0.03, 0.008), 'handR', 'body', [-0.012, -0.2, -0.02]);
  if (t >= 1) b.add(b.box(0.006, 0.18, 0.014), 'handR', 'glow', [0.015, -0.18, 0.04]);
  if (t >= 1) b.add(b.rbox(0.13, 0.05, 0.15, 0.02), 'upArmL', 'trim', [0.03, 0.04, 0], [0, 0, -0.35]);
  // shoulder sensor mast (aux0 over the left shoulder)
  const mh = 0.36 + t * 0.04;
  b.add(b.rbox(0.09, 0.06, 0.12, 0.015), 'aux0', 'body', [0, -0.02, 0]);
  b.add(b.cyl(0.018, 0.024, mh, 10), 'aux0', 'body', [0, mh / 2, 0]);
  b.add(ringH(b, 0.026, 0.006, 12), 'aux0', 'trim', [0, mh * 0.3, 0]);
  b.add(b.rbox(0.16, 0.06, 0.05, 0.015), 'aux0', 'body', [0, mh, 0.01]);
  b.add(b.rbox(0.13, 0.018, 0.012, 0.004), 'aux0', 'eye', [0, mh, 0.037]);
  for (const x of [0.07, -0.07]) b.add(b.cyl(0.016, 0.016, 0.02, 12), 'aux0', 'mech', [x, mh, 0.03], [PI / 2, 0, 0]);
  if (!far) b.add(b.cyl(0.003, 0.003, 0.2, 4), 'aux0', 'mech', [0.05, mh + 0.12, -0.01]);
  if (t >= 1) b.add(b.rbox(0.1, 0.012, 0.1, 0.004), 'aux0', 'trim', [0, mh * 0.55, 0], [0, 0.4, 0]);
  if (t >= 1) for (const bone of ['foreArm', 'shin']) b.sym(band(b, bone === 'shin' ? 0.05 : 0.041, bone === 'shin' ? 0.058 : 0.047, 0.022, PI * 2, 18), bone, 'trim', [0, -0.1, 0]);
  if (t >= 3) b.add(b.rbox(0.1, 0.13, 0.16, 0.02), 'chest', 'body', [-0.1, 0.2, -0.13]);
}

export function buildGhost(b, o) {
  const t = o.tier, far = b.far;
  buildElegant(b, { face: 'none', lines: true, layered: false, crest: 0 });
  // forearm mono-blade (right): folded along the outer forearm, tip past the hand
  const sh = new THREE.Shape();
  sh.moveTo(0, 0.03); sh.lineTo(0.05, 0); sh.lineTo(0.026, -0.56); sh.lineTo(0, -0.62); sh.lineTo(-0.008, -0.1); sh.lineTo(0, 0.03);
  const blade = new THREE.ExtrudeGeometry(sh, { depth: 0.008, bevelEnabled: false, curveSegments: 1 });
  blade.translate(0, 0, -0.003); blade.rotateY(PI / 2);
  b.add(blade, 'foreArmR', 'trim', [-0.042, -0.06, 0.01]);
  b.add(b.box(0.004, 0.52, 0.006), 'foreArmR', 'glow', [-0.042, -0.34, 0.034], [0.035, 0, 0]);
  if (t >= 1) for (const bone of ['upArm', 'thigh']) b.sym(b.cap(0.0055, 0.14, 4), bone, 'glow', [0, -0.16, bone === 'thigh' ? 0.075 : 0.05]);
  if (t >= 1) { b.sym(b.box(0.008, 0.2, 0.008), 'chest', 'glow', [0.045, 0.13, 0.125], [0, 0, 0.45]); b.add(b.rbox(0.014, 0.08, 0.17, 0.006), 'head', 'trim', [0, 0.2, -0.03]); }
  if (t >= 2) b.sym(b.rbox(0.012, 0.16, 0.08, 0.005), 'upArm', 'trim', [0.075, 0.03, -0.01], [0, 0, -0.45]);
  if (t >= 3) for (const sx of [1, -1]) b.add(b.rbox(0.012, 0.5, 0.07, 0.006), 'aux0', 'trim', [0.08 * sx, -0.18, -0.02], [0.18, 0, 0.12 * sx]);
  if (t >= 4) b.add(b.tor(0.11, 0.004, 32, 4), 'head', 'glow', [0, 0.26, -0.03], [PI / 2 - 0.3, 0, 0]);
}

export function buildSecurity(b, o) {
  const t = o.tier, far = b.far;
  buildElegant(b, { face: 'visor', chestPlate: true, layered: true, lines: true, crest: 0 });
  b.add(b.sph(12, 10), 'chest', 'glow', [0.07, 0.17, 0.12], [0, 0, 0], [0.018, 0.018, 0.008]);
  // riot shield on the left forearm
  const w = t >= 3 ? 0.46 : 0.38, h = t >= 3 ? 0.72 : 0.6;
  b.add(b.rbox(0.03, h, w, 0.012), 'foreArmL', 'trim', [0.07, -0.13, 0.02]);
  b.add(b.rbox(0.012, h * 0.85, 0.03, 0.004), 'foreArmL', 'glow', [0.087, -0.13, 0.02]);
  if (!far) b.add(b.rbox(0.012, 0.05, w * 0.8, 0.004), 'foreArmL', 'body', [0.087, -0.13 + h * 0.3, 0.02]);
  // baton (t<2) or lance (t>=2) in the right hand, along -y
  if (t < 2) {
    b.add(b.cyl(0.015, 0.015, 0.4, 8), 'handR', 'mech', [-0.005, -0.2, 0.0]);
    b.add(b.cyl(0.018, 0.018, 0.08, 8), 'handR', 'glow', [-0.005, -0.36, 0.0]);
  } else {
    b.add(b.cyl(0.012, 0.012, 1.3, 8), 'handR', 'mech', [-0.005, -0.3, 0.0]);
    const tip = b.cyl(0.0, 0.03, 0.18, 4); tip.rotateX(PI);
    b.add(tip, 'handR', 'trim', [-0.005, -1.03, 0], [0, 0, 0], [1, 1, 0.3]);
    b.add(b.cyl(0.02, 0.02, 0.05, 8), 'handR', 'glow', [-0.005, -0.92, 0]);
  }
  if (t >= 3) b.add(b.rbox(0.2, 0.05, 0.12, 0.015), 'head', 'trim', [0, 0.25, -0.02], [0.2, 0, 0]);
}

export function eleganceMats(kind, tier) {
  const t = tier;
  if (kind === 'gunner') return {
    body: mat('gun_chrome' + t, { color: 0xeef2f6, metal: 1, rough: [0.26, 0.2, 0.14, 0.09, 0.06][t] }),
    trim: mat('gun_trim' + t, { color: t >= 4 ? 0x2a5cff : t >= 1 ? 0x1e3f8c : 0x39414d, metal: 0.9, rough: 0.3, coat: t >= 1 ? 0.6 : 0 }),
    mech: mat('gun_mech', { color: 0x1d2026, metal: 1, rough: 0.25 }),
    glow: glow('gun_glow' + t, 0x58c8ff, 2 + t * 0.5),
    eye: glow('gun_eye', 0x9fe6ff, 3),
  };
  if (kind === 'ghost') return {
    body: mat('ghost_black' + t, { color: 0x0c0d10, metal: 0.3, rough: [0.62, 0.55, 0.5, 0.42, 0.35][t], coat: t >= 3 ? 0.4 : 0 }),
    trim: mat('ghost_blade', { color: 0xc8d4e0, metal: 1, rough: 0.12 }),
    mech: mat('ghost_mech', { color: 0x202228, metal: 0.9, rough: 0.35 }),
    glow: glow('ghost_glow' + t, 0x22e1ff, 2.6 + t * 0.5),
    eye: glow('ghost_eye', 0x5ff0ff, 3.5),
  };
  const gold = t >= 2;
  return {
    body: mat('sec_white', { color: 0xf0f2f5, metal: 0.1, rough: 0.25, coat: 1 }),
    trim: gold ? mat('sec_gold', { color: 0xecc36a, metal: 1, rough: 0.22 }) : mat('sec_navy', { color: 0x1b2a4a, metal: 0.5, rough: 0.35, coat: 0.6 }),
    mech: mat('sec_mech', { color: 0x14161b, metal: 1, rough: 0.15 }),
    glow: glow('sec_glow', 0x3aa0ff, 3),
    eye: glow('sec_eye', 0x7cc4ff, 3),
  };
}
