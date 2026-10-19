import * as THREE from 'three';
// D21 organic body kits (fantasy realm). Starting points for fantasy sculptors, same rigs/anims as the mechs:
// humanoid (biped: knight, elf ranger, elf sage), brute (heavy biped: treant, minotaur, shaman), beast (quadruped: wolf).
// Organic slot convention: paint = outer armour / fur / bark / hide, accent = cloth / leather / moss, metal = steel / bone /
// claws, trim = gold / bronze, skin = faces & hands (optional 7th slot: drop trim or glow to stay at 6 dc), glow = magic, eye = eyes.
import { pod, plate, fin, discX, deform } from './shapes.js';
import { poseFrame } from './mech.js';
const PI = Math.PI;

// ---------- humanoid ----------
export const HUMANOID_DIMS = {
  thigh: 0.44, shin: 0.43, ankle: 0.08, hipX: 0.1, hipY: -0.04, spine: 0.12, chest: 0.24, neck: 0.24, headOff: 0.06,
  clavX: 0.05, clavY: 0.2, shoulder: 0.16, upArm: 0.29, foreArm: 0.27, aux0: [0, 0.14, -0.13],
};
// blade-hold left-arm guard pose (anims.js hold('blade')) used to author shields with poseFrame
const GUARD = { pelvis: [0, 0, 0], spine: [0.04, 0, 0], chest: [0.02, 0, 0], upArmL: [-0.35, -0.1, 0.32], foreArmL: [-1.1, 0, 0] };

function limbPods(b, o, k = 1, slotA = 'accent', slotL = 'accent') {
  const D = b.rig.D;
  b.sym(pod(b, 0.02, -D.upArm, [0.06, 0.065, 0.055, 0.045].map((x) => x * k), 12), 'upArm', slotA);
  b.sym(pod(b, 0.0, -D.foreArm, [0.05, 0.052, 0.042, 0.036].map((x) => x * k), 12), 'foreArm', slotA);
  b.sym(pod(b, 0.03, -D.thigh, [0.085, 0.09, 0.075, 0.06].map((x) => x * k), 12), 'thigh', slotL);
  b.sym(pod(b, 0.0, -D.shin, [0.065, 0.07, 0.055, 0.045].map((x) => x * k), 12), 'shin', slotL);
}
function hands(b, slot = 'skin', k = 1) {
  b.sym(b.rbox(0.05 * k, 0.09 * k, 0.08 * k, 0.018 * k), 'hand', slot, [0, -0.05 * k, 0.005]);
  b.sym(b.rbox(0.045 * k, 0.05 * k, 0.07 * k, 0.015 * k), 'hand', slot, [-0.012, -0.11 * k, 0.012], [0, 0, -0.35]);
}
function boots(b, slot = 'paint') {
  const D = b.rig.D;
  b.sym(b.rbox(0.1, 0.08, 0.22, 0.03), 'foot', slot, [0, -D.ankle + 0.04, 0.05]);
  b.sym(pod(b, 0.02, -0.12, [0.07, 0.075, 0.07], 12), 'shin', slot, [0, -D.shin + 0.12, 0]);
}

// opts: { kind: 'knight' | 'elf' | 'sage', weapon: 'sword' | 'bow' | 'staff', shield: bool, hood: bool, cape: bool }
export function buildHumanoid(b, o, opts = {}) {
  const r = o.rank, far = b.far, kind = opts.kind || 'knight', knight = kind === 'knight';
  // torso + pelvis
  b.add(b.sph(16, 12), 'chest', knight ? 'paint' : 'accent', [0, 0.12, 0.01], [0, 0, 0], [0.2, 0.17, 0.14]);
  b.add(pod(b, 0.12, -0.04, [0.15, 0.14, 0.12], 14), 'spine', 'accent', [0, 0, 0], [0, 0, 0], [1, 1, 0.75]);
  b.add(pod(b, 0.06, -0.12, [0.13, 0.15, 0.14], 14), 'pelvis', 'accent', [0, 0, 0], [0, 0, 0], [1, 1, 0.8]);
  b.add(b.cyl(0.05, 0.06, 0.12, 10), 'neck', 'skin', [0, 0.03, 0]);
  limbPods(b, o, 1, 'accent', 'accent');
  hands(b, knight ? 'metal' : 'skin');
  boots(b, knight ? 'paint' : 'accent');
  if (knight) {
    // plate armour over the cloth: breastplate, pauldrons, vambraces, greaves, helm with visor slit, blue tabard
    P(b, 'chest', 'paint', [0.36, 0.3, 0.26], [0, 0.14, 0.03], [0.08, 0, 0], { c: 0.05, tx: 1.1, bx: 0.75 });
    b.sym(b.sph(14, 10, 0, PI * 2, 0, PI * 0.55), 'upArm', 'paint', [0.02, 0.02, 0], [0, 0, -0.3], [0.12, 0.1, 0.13]);
    b.sym(pod(b, -0.06, -0.24, [0.058, 0.06, 0.05], 12), 'foreArm', 'paint');
    b.sym(pod(b, -0.06, -0.3, [0.075, 0.08, 0.065], 12), 'shin', 'paint');
    b.add(b.cyl(0.1, 0.11, 0.22, 16), 'head', 'paint', [0, 0.09, 0.0]);
    b.add(b.sph(16, 10, 0, PI * 2, 0, PI * 0.5), 'head', 'paint', [0, 0.2, 0], [0, 0, 0], [0.1, 0.06, 0.11]);
    b.add(b.cbox(0.14, 0.018, 0.03, 0.006), 'head', 'eye', [0, 0.11, 0.102]);
    b.add(b.ext([[-0.11, 0], [0.11, 0], [0.09, -0.42], [0, -0.5], [-0.09, -0.42]], 0.02, 0.006), 'pelvis', 'accent', [0, -0.05, 0.13], [0.05, 0, 0]);
    if (r >= 1) b.add(b.ext([[-0.02, 0], [0.02, 0], [0.02, -0.32], [-0.02, -0.32]], 0.024, 0.004), 'pelvis', 'trim', [0, -0.08, 0.142], [0.05, 0, 0]);
    if (r >= 2 || opts.cape) b.add(b.ext([[-0.2, 0], [0.2, 0], [0.26, -0.95], [-0.26, -0.95]], 0.02, 0.006), 'chest', 'accent', [0, 0.26, -0.15], [-0.12, 0, 0]);
    if (r >= 3) b.add(fin(b, [[0, 0], [0.04, 0], [-0.06, 0.2], [-0.1, 0.18]], 0.02, 0.005), 'head', 'trim', [0, 0.24, 0.02], [0, PI / 2, 0]);
  } else {
    // elf / sage: cloak, hood, face, white hair
    b.add(b.sph(14, 12), 'head', 'skin', [0, 0.09, 0.01], [0, 0, 0], [0.085, 0.105, 0.095]);
    b.add(b.cbox(0.11, 0.014, 0.02, 0.005), 'head', 'eye', [0, 0.1, 0.085]);
    b.sym(fin(b, [[0, 0], [0.03, 0.0], [0.09, 0.06]], 0.01, 0.003), 'head', 'skin', [0.075, 0.1, 0.0], [0, -0.3, 0]);
    if (opts.hood !== false) b.add(b.sph(14, 10, 0, PI * 2, 0, PI * 0.62), 'head', 'paint', [0, 0.1, -0.01], [-0.35, 0, 0], [0.11, 0.13, 0.12]);
    b.add(b.ext([[-0.18, 0], [0.18, 0], [0.3, -1.05], [-0.3, -1.05]], 0.02, 0.006), 'chest', 'paint', [0, 0.25, -0.12], [-0.1, 0, 0]);
    if (kind === 'sage') b.add(pod(b, 0.0, -0.75, [0.16, 0.2, 0.26, 0.3], 16), 'pelvis', 'paint', [0, 0.04, 0], [0, 0, 0], [1, 1, 0.85]);
    b.add(b.tor(0.09, 0.012, 16, 4), 'chest', 'trim', [0, 0.26, 0.02], [PI / 2, 0, 0]);
  }
  // weapons
  const w = opts.weapon || (knight ? 'sword' : 'bow');
  if (w === 'sword') {
    b.scope([0, -0.07, 0], [0.8, 0, 0], 1, () => {
      b.add(b.cyl(0.02, 0.02, 0.18, 8), 'handR', 'accent', [0, 0, -0.02], [PI / 2, 0, 0]);
      b.add(b.cbox(0.2, 0.03, 0.04, 0.008), 'handR', 'trim', [0, 0, 0.08]);
      b.add(b.ext([[-0.035, 0], [0.035, 0], [0.03, 0.9], [0, 0.98], [-0.03, 0.9]], 0.014, 0.006), 'handR', 'metal', [0, 0, 0.1], [PI / 2, 0, 0]);
      if (r >= 3) b.add(b.cbox(0.008, 0.008, 0.8, 0.002), 'handR', 'glow', [0, 0.01, 0.52]);
    });
  } else if (w === 'staff') {
    b.add(b.cyl(0.018, 0.022, 1.7, 8), 'handR', 'accent', [0, -0.05, 0]);
    b.add(b.sph(10, 8), 'handR', 'glow', [0, 0.85, 0], [0, 0, 0], [0.05, 0.08, 0.05]);
    b.add(b.tor(0.07, 0.008, 14, 4), 'handR', 'trim', [0, 0.85, 0], [PI / 2, 0, 0]);
  } else if (w === 'bow') {
    b.add(b.tube([[0, 0.55, 0.05], [0, 0.25, 0.14], [0, 0, 0.1], [0, -0.25, 0.14], [0, -0.55, 0.05]], 0.014, 16, 5), 'handL', 'accent', [0, -0.08, 0]);
    b.add(b.cyl(0.002, 0.002, 1.08, 3), 'handL', 'metal', [0, -0.08, 0.05]);
  }
  if (opts.shield || (knight && w === 'sword')) {
    b.scope([0, 0, 0], poseFrame(b.rig, GUARD, 'foreArmL'), 1, () => b.scope([0.1, -0.12, 0.22], [0, 0.25, 0], 1, () => {
      const out = [[-0.2, 0.28], [0.2, 0.28], [0.2, 0.0], [0, -0.38], [-0.2, 0.0]];
      b.add(b.ext(out, 0.04, 0.01), 'foreArmL', 'accent', [0, 0, 0]);
      b.add(b.ext(out.map(([x, y]) => [x * 1.08, y * 1.06]), 0.02, 0.004), 'foreArmL', 'trim', [0, 0, -0.025]);
      b.add(b.ext([[-0.02, 0.2], [0.02, 0.2], [0.02, -0.25], [-0.02, -0.25]], 0.01, 0.002), 'foreArmL', 'trim', [0, 0, 0.026]);
    }));
  }
}
function P(b, bone, slot, size, pos, rot, opt) { b.add(plate(b, size[0], size[1], size[2], opt), bone, slot, pos, rot); }

// ---------- brute (treant / minotaur / shaman) ----------
export const BRUTE_DIMS = {
  thigh: 0.46, shin: 0.46, ankle: 0.12, hipX: 0.2, hipY: -0.06, spine: 0.16, chest: 0.34, neck: 0.3, headOff: 0.04,
  clavX: 0.1, clavY: 0.26, shoulder: 0.3, upArm: 0.42, foreArm: 0.42, aux0: [0, 0.3, -0.1],
};
// opts: { kind: 'treant' | 'minotaur' | 'shaman' }
export function buildBrute(b, o, opts = {}) {
  const r = o.rank, far = b.far, kind = opts.kind || 'treant', D = b.rig.D, tree = kind === 'treant';
  const gnarl = (g, a = 0.025) => deform(g, (v) => { const n = Math.sin(v.y * 23 + v.x * 11) * Math.cos(v.z * 17 + v.y * 7); v.x += n * a; v.z += Math.sin(v.y * 19) * a; });
  // trunk torso: wide chest, narrow waist
  b.add(gnarl(pod(b, 0.5, -0.05, [0.3, 0.36, 0.32, 0.24], 14)), 'chest', 'paint', [0, 0, 0], [0, 0, 0], [1, 1, 0.8]);
  b.add(gnarl(pod(b, 0.18, -0.05, [0.22, 0.2, 0.22], 12)), 'spine', 'paint');
  b.add(gnarl(pod(b, 0.08, -0.18, [0.24, 0.27, 0.22], 12)), 'pelvis', tree ? 'paint' : 'accent');
  // limbs: thick, gnarled
  b.sym(gnarl(pod(b, 0.05, -D.upArm, [0.14, 0.13, 0.11, 0.1], 12)), 'upArm', 'paint');
  b.sym(gnarl(pod(b, 0.02, -D.foreArm, [0.12, 0.13, 0.13, 0.11], 12)), 'foreArm', 'paint');
  b.sym(gnarl(pod(b, 0.05, -D.thigh, [0.15, 0.15, 0.13, 0.11], 12)), 'thigh', 'paint');
  b.sym(gnarl(pod(b, 0.02, -D.shin, [0.12, 0.13, 0.12, 0.13], 12)), 'shin', 'paint');
  // hands: knotted fists / hooves
  b.sym(gnarl(b.sph(10, 8)), 'hand', 'paint', [0, -0.08, 0.02], [0, 0, 0], [0.12, 0.12, 0.13]);
  if (!far) for (let i = 0; i < 3; i++) b.sym(gnarl(pod(b, 0, -0.14, [0.03, 0.025, 0.012], 6), 0.01), 'hand', 'paint', [-0.03, -0.12, -0.05 + i * 0.05], [0, 0, -0.3]);
  if (tree) {
    // root feet, moss shoulders, leaf crown, glowing heartwood
    for (let i = 0; i < (far ? 3 : 5); i++) { const a = (i / 5) * PI * 1.4 - PI * 0.2; b.sym(gnarl(pod(b, 0, -0.3, [0.05, 0.04, 0.015], 6), 0.01), 'foot', 'paint', [Math.sin(a) * 0.08, -D.ankle + 0.03, Math.cos(a) * 0.1], [PI / 2 - 0.2, a, 0]); }
    b.sym(gnarl(b.sph(12, 8), 0.03), 'upArm', 'accent', [0.03, 0.06, 0], [0, 0, 0], [0.2, 0.12, 0.2]);
    for (let i = 0; i < (far ? 4 : 9); i++) { const a = i / 9 * PI * 2; b.add(fin(b, [[0, 0], [0.06, 0.05], [0, 0.22], [-0.06, 0.05]], 0.02, 0.005), 'head', 'accent', [Math.cos(a) * 0.12, 0.18, Math.sin(a) * 0.1], [Math.sin(a) * 0.5, -a, Math.cos(a) * 0.4]); }
    b.add(gnarl(b.sph(12, 10)), 'head', 'paint', [0, 0.08, 0.04], [0, 0, 0], [0.15, 0.17, 0.14]);
    b.sym(b.sph(8, 6), 'head', 'eye', [0.05, 0.1, 0.16], [0, 0, 0], 0.022);
    b.add(b.sph(10, 8), 'chest', 'glow', [0, 0.25, 0.22], [0, 0, 0], [0.07, 0.1, 0.03]);
    if (r >= 2) for (let i = 0; i < 4; i++) b.sym(b.cbox(0.012, 0.18, 0.012, 0.004), 'chest', 'glow', [0.08 + i * 0.03, 0.2 - i * 0.04, 0.24 - i * 0.02], [0, 0, 0.3 + i * 0.2]);
  } else {
    // minotaur / shaman: bull head + horns, hide, loincloth
    b.add(b.sph(12, 10), 'head', 'paint', [0, 0.08, 0.06], [0, 0, 0], [0.14, 0.15, 0.17]);
    b.add(b.rbox(0.16, 0.12, 0.16, 0.05), 'head', 'paint', [0, 0.02, 0.2]);
    b.sym(b.tube([[0.1, 0.16, 0.04], [0.25, 0.22, 0.02], [0.32, 0.36, 0.06], [0.28, 0.46, 0.12]], 0.035, 12, 6), 'head', 'metal');
    b.sym(b.sph(8, 6), 'head', 'eye', [0.07, 0.1, 0.18], [0, 0, 0], 0.02);
    b.add(b.ext([[-0.2, 0], [0.2, 0], [0.16, -0.4], [-0.16, -0.4]], 0.02, 0.005), 'pelvis', 'accent', [0, -0.08, 0.2], [0.1, 0, 0]);
    b.add(b.tor(0.32, 0.03, 20, 5, PI), 'chest', 'metal', [0, 0.3, 0.02], [PI / 2 + 0.2, 0, PI]);
    if (kind === 'shaman') { b.add(b.cyl(0.18, 0.18, 0.2, 14), 'aux0', 'accent', [0.0, -0.1, 0.0], [0, 0, PI / 2]); b.add(b.sph(8, 6), 'handR', 'metal', [0, -0.2, 0.05], [0, 0, 0], 0.08); }
    if (r >= 2) b.sym(b.cbox(0.01, 0.2, 0.01, 0.003), 'chest', 'glow', [0.14, 0.2, 0.25], [0.2, 0, 0.3]);
  }
}

// ---------- beast (wolf) ----------
export const BEAST_DIMS = {
  hover: 0.68, thigh: 0.3, shin: 0.32, ankle: 0.07, hipX: 0.12, hipY: -0.02, upArm: 0.33, foreArm: 0.32, shoulder: 0.02,
  frontZ: 0.6, footX: 0.12,
  offsets: { spine: [0, 0.03, 0.24], chest: [0, 0.02, 0.32], neck: [0, 0.08, 0.14], head: [0, 0.07, 0.12], clavL: [0.1, -0.04, 0.02], upArmL: [0.02, 0, 0] },
  parents: { aux0: 'pelvis' }, aux0: [0, 0.06, -0.12], aux1: [0, -0.03, 0.12],
};
// opts: { variant: 'ember' | 'frost' }
export function buildBeast(b, o, opts = {}) {
  const r = o.rank, far = b.far, D = b.rig.D;
  const shag = (g, a = 0.02) => deform(g, (v) => { v.x += Math.sin(v.y * 40 + v.z * 13) * a; v.y += Math.cos(v.x * 37) * a * 0.6; });
  // body: rump, ribcage, shaggy mane
  b.add(shag(b.sph(14, 10)), 'pelvis', 'paint', [0, 0.02, -0.02], [0, 0, 0], [0.15, 0.15, 0.2]);
  b.add(shag(pod(b, 0.18, -0.18, [0.13, 0.15, 0.14], 12)), 'spine', 'paint', [0, 0, 0.0], [PI / 2, 0, 0]);
  b.add(shag(b.sph(14, 10), 0.03), 'chest', 'paint', [0, 0.02, 0.02], [0, 0, 0], [0.17, 0.19, 0.2]);
  b.add(shag(b.sph(12, 8), 0.035), 'neck', 'accent', [0, 0.02, 0.0], [0, 0, 0], [0.15, 0.16, 0.14]);
  // head: skull, snout, ears, jaw on aux1
  b.add(b.sph(12, 10), 'head', 'paint', [0, 0.02, 0.0], [0, 0, 0], [0.1, 0.09, 0.11]);
  b.add(plate(b, 0.08, 0.07, 0.16, { c: 0.02, tx: 0.7, tz: 0.8 }), 'head', 'paint', [0, 0.0, 0.14]);
  b.add(b.sph(8, 6), 'head', 'metal', [0, 0.02, 0.23], [0, 0, 0], [0.025, 0.02, 0.02]);
  b.sym(fin(b, [[0, 0], [0.05, 0], [0.02, 0.1]], 0.02, 0.005), 'head', 'paint', [0.05, 0.07, -0.02], [-0.2, 0, -0.25]);
  b.sym(b.sph(8, 6), 'head', 'eye', [0.04, 0.04, 0.1], [0, 0, 0], 0.016);
  b.add(plate(b, 0.07, 0.03, 0.14, { c: 0.01, tx: 0.8 }), 'aux1', 'accent', [0, 0, 0.04]);
  if (!far) for (const x of [0.025, -0.025]) b.add(fin(b, [[-0.006, 0], [0.006, 0], [0, -0.025]], 0.006, 0.002), 'aux1', 'metal', [x, 0.01, 0.09]);
  // legs: furred upper, slim lower, paws with claws
  b.sym(shag(pod(b, 0.04, -D.upArm, [0.06, 0.065, 0.045, 0.035], 10)), 'upArm', 'paint');
  b.sym(pod(b, 0.0, -D.foreArm, [0.035, 0.03, 0.028], 10), 'foreArm', 'paint');
  b.sym(shag(pod(b, 0.06, -D.thigh, [0.08, 0.085, 0.06, 0.045], 10)), 'thigh', 'paint');
  b.sym(pod(b, 0.0, -D.shin, [0.04, 0.034, 0.03], 10), 'shin', 'paint');
  for (const bone of ['hand', 'foot']) {
    b.sym(b.rbox(0.06, 0.04, 0.09, 0.015), bone, 'accent', [0, -0.02, 0.03]);
    if (!far) for (const x of [-0.02, 0, 0.02]) b.sym(fin(b, [[-0.006, 0], [0.006, 0], [0, 0.03]], 0.008, 0.002), bone, 'metal', [x, -0.03, 0.08], [PI / 2, 0, 0]);
  }
  // tail
  b.add(shag(pod(b, 0.0, -0.45, [0.04, 0.06, 0.05, 0.02], 10), 0.025), 'aux0', 'paint', [0, 0, 0], [-PI / 2 + 0.3, 0, 0]);
  // variant glow: ember fur cracks / frost crystals
  const v = opts.variant || (o.faction === 'order' ? 'frost' : 'ember');
  const n = far ? 3 : [4, 6, 8, 10, 12, 14][r];
  for (let i = 0; i < n; i++) {
    const a = i * 2.4, bone = ['spine', 'chest', 'pelvis', 'neck'][i % 4];
    if (v === 'ember') b.add(b.cbox(0.012, 0.08, 0.012, 0.003), bone, 'glow', [Math.cos(a) * 0.12, 0.06 + Math.sin(a * 1.3) * 0.05, Math.sin(a) * 0.1], [a, 0, 0.6]);
    else b.add(fin(b, [[-0.015, 0], [0.015, 0], [0, 0.08]], 0.012, 0.003), bone, 'glow', [Math.cos(a) * 0.1, 0.12, Math.sin(a) * 0.08], [-0.3, a, 0.2]);
  }
}

// ---------- fur kit (lifted from sculptor-17's wolf.js / minotaur.js) ----------
const _m4 = new THREE.Matrix4(), _eu = new THREE.Euler();
// Euler (XYZ) that points local +Y along `dir`, with local +Z toward `ref` (orthogonalised)
export function orient(dir, ref) {
  const y = dir.clone().normalize();
  let z = ref.clone().sub(y.clone().multiplyScalar(ref.dot(y)));
  if (z.lengthSq() < 1e-6) z = new THREE.Vector3(1, 0, 0).cross(y);
  z.normalize();
  const x = new THREE.Vector3().crossVectors(y, z);
  _m4.makeBasis(x, y, z);
  _eu.setFromRotationMatrix(_m4, 'XYZ');
  return [_eu.x, _eu.y, _eu.z];
}
// a fur tuft: diamond cross-section spike along +Y curving toward +Z (~12 tris, soft normals)
export function tuftGeo(len, w, bend = 0.3, t = 0.45) {
  const ring = (y, k, z) => [[w * k, y, z], [0, y, z + t * w * k], [-w * k, y, z], [0, y, z - t * w * k]];
  const p = [...ring(0, 1, 0), ...ring(len * 0.5, 0.7, bend * len * 0.28), [0, len, bend * len]].flat(), idx = [];
  for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; idx.push(i, 4 + i, j, j, 4 + i, 4 + j, 4 + i, 8, 4 + j); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
// smooth lumpy ellipsoid (indexed, soft normals) of radii r = [x, y, z]
export function blob(b, r, amp = 0.05, seed = 1, ws = 15, hs = 11) {
  const g = b.sph(ws, hs), P = g.attributes.position;
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    const n = Math.sin(x * 4.1 + seed) * Math.sin(y * 3.3 + seed * 1.7) + 0.5 * Math.sin(z * 5.7 + x * 2.3 + seed * 0.3);
    const k = 1 + amp * n;
    P.setXYZ(i, x * k * r[0], y * k * r[1], z * k * r[2]);
  }
  g.computeVertexNormals();
  return g;
}
// Shingled fur: n tufts scattered over an ellipsoid (centre c, radii r, bone-relative), lying along `flow` and lifted off the surface.
// f: { c, r, n, len:[a,b], w, flow: [x,y,z] | (d)=>Vector3, lift, bend, t, sink, keep(d), slot: name | (d)=>name, sym, seed, k (density) }
// Budget: ~12 tris per tuft. Use `k` (or o.far) to thin it for common/low.
export function scatterFur(b, bone, f) {
  let s = (f.seed ?? 7) >>> 0 || 1;
  const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  const V = (...a) => new THREE.Vector3(...a);
  const n = Math.max(1, Math.round(f.n * (f.k ?? 1) * (b.far ? 0.4 : 1)));
  const c = V(...f.c), R = V(...f.r), flow0 = Array.isArray(f.flow) ? V(...f.flow).normalize() : null;
  let placed = 0, tries = 0;
  while (placed < n && tries++ < n * 40) {
    const d = V(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1);
    const l2 = d.lengthSq();
    if (l2 > 1 || l2 < 0.01) continue;
    d.normalize();
    if (f.sym && d.x < 0) d.x = -d.x;
    if (f.keep && !f.keep(d)) continue;
    const p = V(c.x + d.x * R.x, c.y + d.y * R.y, c.z + d.z * R.z);
    const nrm = V(d.x / R.x, d.y / R.y, d.z / R.z).normalize();
    const lift = f.lift ?? 0.36, fl = typeof f.flow === 'function' ? f.flow(d) : flow0 || V(0, -1, 0);
    const dir = nrm.clone().multiplyScalar(lift).addScaledVector(fl, 1 - lift).normalize();
    const L = f.len[0] + (f.len[1] - f.len[0]) * rnd();
    const g = tuftGeo(L, (f.w ?? 0.46) * L, f.bend ?? 0.26, f.t ?? 0.34);
    const slot = typeof f.slot === 'function' ? f.slot(d) : f.slot || 'paint';
    p.addScaledVector(nrm, -(f.sink ?? 0.02));
    const rot = orient(dir, nrm.clone().negate());
    if (f.sym) b.sym(g, bone, slot, [p.x, p.y, p.z], rot); else b.add(g, bone, slot, [p.x, p.y, p.z], rot);
    placed++;
  }
  return placed;
}
