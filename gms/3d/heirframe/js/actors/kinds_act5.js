import { mat, glow, scuffTex } from './materials.js';
import { ringH, capRod, pod, hand } from './shapes.js';
import { buildHeavy, heavyMats, ENFORCER_DIMS } from './kinds_frames.js';
import { BI } from './rig.js';

const PI = Math.PI;
const scaleDims = (D, k) => {
  const o = {};
  for (const [key, v] of Object.entries(D)) o[key] = typeof v === 'number' ? v * k : Array.isArray(v) ? v.map((q) => q * k) : key === 'offsets' ? Object.fromEntries(Object.entries(v).map(([n, p]) => [n, p.map((q) => q * k)])) : v;
  return o;
};

// ================= Hull Wight / Spine Keeper: six-legged maintenance crawlers (quad rig + a middle leg pair on aux0) =================
// pelvis = abdomen (rear), chest = thorax, head = sensor head, aux1 = welding arm, aux0 = the middle legs (swung in post()).
const LEG = { up: 0.42, low: 0.56, splay: 1.9, bend: -2.1 };
export const SPIDER_DIMS = {
  hover: 0.46, thigh: LEG.up, shin: LEG.low, upArm: LEG.up, foreArm: LEG.low,
  offsets: {
    spine: [0, 0.02, 0.2], chest: [0, 0.0, 0.18], neck: [0, 0.04, 0.18], head: [0, 0.0, 0.07],
    clavL: [0.13, -0.02, 0.06], upArmL: [0.03, 0, 0], foreArmL: [0, -LEG.up, 0], handL: [0, -LEG.low, 0],
    thighL: [0.14, -0.02, -0.04], shinL: [0, -LEG.up, 0], footL: [0, -LEG.low, 0],
    aux0: [0, -0.02, -0.1], aux1: [0, -0.05, 0.1],
  },
};
export const KEEPER_SCALE = 2.2;
export const KEEPER_DIMS = scaleDims(SPIDER_DIMS, KEEPER_SCALE);

function spiderLeg(b, u, l, slot, trim, far) {
  b.sym(capRod(b, [0, 0, 0], [0, -LEG.up, 0], 0.028, 8), u, slot);
  b.sym(b.rbox(0.06, LEG.up * 0.7, 0.05, 0.012), u, trim, [0.02, -LEG.up * 0.45, 0]);
  b.sym(b.sph(10, 8), l, 'mech', [0, 0, 0], [0, 0, 0], 0.04);
  b.sym(capRod(b, [0, 0, 0], [0, -LEG.low * 0.9, 0], 0.02, 8), l, 'mech');
  if (!far) b.sym(b.rbox(0.045, LEG.low * 0.5, 0.035, 0.01), l, slot, [0.012, -LEG.low * 0.35, 0]);
  const tip = b.cyl(0.02, 0.0, 0.1, 6); b.sym(tip, l, trim, [0, -LEG.low * 0.95, 0]);
}

export function buildSpider(b, o) {
  const keeper = !!o.keeper, far = b.far;
  const body = () => {
    // abdomen: segmented shell with coolant tanks
    b.add(b.sph(20, 14), 'pelvis', 'body', [0, 0.06, -0.2], [0, 0, 0], [0.22, 0.16, 0.3]);
    for (let i = 0; i < 3; i++) b.add(ringH(b, 0.2 - i * 0.03, 0.014, 20), 'pelvis', 'trim', [0, 0.07, -0.08 - i * 0.12], [PI / 2, 0, 0], [1, 1, 0.75]);
    b.sym(b.cyl(0.045, 0.045, 0.26, 10), 'pelvis', 'mech', [0.12, 0.17, -0.22], [PI / 2, 0, 0]);
    // thorax + spine
    b.add(b.cyl(0.07, 0.08, 0.22, 12), 'spine', 'mech', [0, 0, -0.1], [PI / 2, 0, 0]);
    b.add(b.rbox(0.3, 0.12, 0.26, 0.04), 'chest', 'body', [0, 0.02, 0.0]);
    b.add(b.rbox(0.24, 0.03, 0.2, 0.01), 'chest', 'trim', [0, 0.095, 0.0], [0.1, 0, 0]);
    // head: sensor cluster, four eyes, welding arm with a lit tip
    b.add(b.rbox(0.16, 0.09, 0.12, 0.03), 'head', 'body', [0, 0.0, 0.04]);
    for (const [x, y, r] of [[0.04, 0.025, 0.018], [-0.04, 0.025, 0.018], [0.065, -0.01, 0.012], [-0.065, -0.01, 0.012]]) b.add(b.sph(8, 6), 'head', 'eye', [x, y, 0.105], [0, 0, 0], r);
    b.add(capRod(b, [0, 0, 0], [0, -0.05, 0.16], 0.016, 6), 'aux1', 'mech');
    b.add(b.cyl(0.02, 0.008, 0.06, 6), 'aux1', 'trim', [0, -0.06, 0.2], [PI / 2 + 0.3, 0, 0]);
    b.add(b.sph(6, 5), 'aux1', 'glow', [0, -0.075, 0.235], [0, 0, 0], 0.014);
    spiderLeg(b, 'upArm', 'foreArm', 'body', 'trim', far);
    spiderLeg(b, 'thigh', 'shin', 'body', 'trim', far);
    // middle pair, rigid in the splayed pose on aux0 (the post() hook swings them)
    const kx = Math.sin(LEG.splay) * LEG.up, ky = -Math.cos(LEG.splay) * LEG.up, n = LEG.splay + LEG.bend;
    const fx = kx + Math.sin(n) * LEG.low, fy = ky - Math.cos(n) * LEG.low;
    b.sym(capRod(b, [0.15, 0, 0], [0.15 + kx, ky, 0], 0.028, 8), 'aux0', 'body');
    b.sym(b.sph(10, 8), 'aux0', 'mech', [0.15 + kx, ky, 0], [0, 0, 0], 0.04);
    b.sym(capRod(b, [0.15 + kx, ky, 0], [0.15 + fx, fy + 0.04, 0], 0.02, 8), 'aux0', 'mech');
    if (keeper) {
      // Spine Keeper: armour plates, a big laser eye, glowing spawn sacs on the abdomen
      b.add(b.sph(16, 10, 0, PI * 2, 0, PI / 2), 'pelvis', 'trim', [0, 0.1, -0.2], [0, 0, 0], [0.24, 0.14, 0.32]);
      b.add(b.cyl(0.045, 0.05, 0.05, 16), 'head', 'mech', [0, 0.05, 0.1], [PI / 2, 0, 0]);
      b.add(b.cyl(0.035, 0.035, 0.012, 16), 'head', 'eye', [0, 0.05, 0.128], [PI / 2, 0, 0]);
      for (const [x, z] of [[0.12, -0.3], [-0.12, -0.3], [0.0, -0.42], [0.1, -0.12], [-0.1, -0.12]]) b.add(b.sph(10, 8), 'pelvis', 'glow', [x, 0.16, z], [0, 0, 0], [0.05, 0.04, 0.05]);
      b.sym(b.rbox(0.03, 0.14, 0.2, 0.01), 'chest', 'trim', [0.15, 0.04, 0], [0, 0, -0.3]);
    }
  };
  if (keeper) b.scope([0, 0, 0], [0, 0, 0], KEEPER_SCALE, body); else body();
}

export function spiderMats(o, keeper) {
  const map = scuffTex();
  return keeper ? {
    body: mat('keeper_body', { color: 0x3a3e44, metal: 0.7, rough: 0.45, map }),
    trim: mat('keeper_trim', { color: 0xd8a11c, metal: 0.3, rough: 0.5, map }),
    mech: mat('spider_mech', { color: 0x1c1d20, metal: 0.9, rough: 0.35 }),
    glow: glow('keeper_sac', 0xff5a1a, 3.5),
    eye: glow('keeper_eye', 0xff2010, 6),
  } : {
    body: mat('wight_body' + o.tone, { color: [0xd9d6cc, 0xc4c8cc, 0xcfc4b0][o.tone], metal: 0.3, rough: 0.55, map }),
    trim: mat('wight_trim', { color: 0xe0a81a, metal: 0.2, rough: 0.5, map }),
    mech: mat('spider_mech', { color: 0x1c1d20, metal: 0.9, rough: 0.35 }),
    glow: glow('wight_torch', 0x7fe8ff, 5),
    eye: glow('wight_eye', 0xff3a1a, 4),
  };
}

// Middle legs follow a tripod gait: the left one moves with front-right / rear-left, the right one with the other set.
export function spiderPost(Out, ctx) {
  const m = ctx.move, i = BI.aux0 * 3;
  const w = Math.min(1, Math.max(0, (m.v - 0.05) / 0.4));
  const A = Math.min(0.7, Math.atan2(m.stride / 2, 0.45));
  const f = (p) => { if (p < 0.5) return [-A + 2 * A * (p / 0.5), 0]; const q = (p - 0.5) / 0.5, s = q * q * (3 - 2 * q); return [A - 2 * A * s, Math.sin(PI * q)]; };
  const [rl, ll] = f((m.phase + 0.5) % 1), [, lr] = f(m.phase);
  const idle = Math.sin(ctx.t * 1.3) * 0.04;
  Out[i] = 0; Out[i + 1] = rl * w + idle * (1 - w); Out[i + 2] = 0.35 * (ll - lr) * w;
}

// ================= Archon Dray, the Sovereign Frame (Act 6 boss) =================
// A gold enforcer colossus (×1.3), a great halo behind the head carrying seven voice pods (the halo drones dock there:
// sockets halo0..halo6), an ivory mantle, a sun on the chest. Phases (robot.setPhase): 1 all pods lit; 2 pods dark (the
// drones are out); 3 the halo gutters red and the eyes go from gold to white (Iris has cut his link).
export const SOVEREIGN_K = 1.3;
export const SOVEREIGN_DIMS = { ...scaleDims(ENFORCER_DIMS, SOVEREIGN_K), aux0: [0, 0.26, -0.32] };
const HALO_R = 0.42, HALO_Y = 0.34, HALO_Z = -0.2;
export const SOVEREIGN_SOCKETS = Object.fromEntries(Array.from({ length: 7 }, (_, i) => {
  const a = (i - 3) * 0.42;
  return ['halo' + i, ['head', [Math.sin(a) * HALO_R, HALO_Y + Math.cos(a) * HALO_R, HALO_Z]]];
}));

export function buildSovereign(b, o) {
  const far = b.far;
  buildHeavy(b, { ...o, tier: 3, enforcer: true });
  // the halo: a thick gold ring behind the head, spokes to the collar, seven voice pods on its upper arc
  b.add(b.tor(HALO_R, 0.022, 48, 8), 'head', 'trim', [0, HALO_Y, HALO_Z]);
  if (!far) b.add(b.tor(HALO_R + 0.05, 0.008, 48, 5), 'head', 'glow', [0, HALO_Y, HALO_Z]);
  for (const a of [-0.9, 0.9, PI]) b.add(capRod(b, [0, HALO_Y, HALO_Z], [Math.sin(a) * HALO_R, HALO_Y + Math.cos(a) * HALO_R, HALO_Z], 0.01, 6), 'head', 'trim');
  for (const [, [, p]] of Object.entries(SOVEREIGN_SOCKETS)) {
    b.add(b.sph(12, 10), 'head', 'pods', p, [0, 0, 0], 0.045);
    b.add(ringH(b, 0.05, 0.008, 14), 'head', 'trim', p, [PI / 2, 0, 0]);
  }
  // crown fins, mantle, chest sun, heavy gauntlets
  for (const x of [-0.06, 0, 0.06]) b.add(b.rbox(0.02, 0.12 + (x ? 0 : 0.06), 0.05, 0.008), 'head', 'trim', [x, 0.2, -0.02], [0.2, 0, x * 3]);
  const mantle = b.lathe([[0.2, 0.06], [0.25, -0.2], [0.3, -0.55], [0.34, -0.95]], 30, PI * 0.7, PI * 0.6);
  b.add(mantle, 'aux0', 'cape', [0, 0, 0.14], [0, PI, 0]);
  const inner = b.lathe([[0.195, 0.06], [0.245, -0.2], [0.295, -0.55], [0.335, -0.95]], 30, PI * 0.7, PI * 0.6); inner.scale(-1, 1, 1);
  b.add(inner, 'aux0', 'cape', [0, 0, 0.14]);
  b.add(b.cyl(0.06, 0.06, 0.015, 24), 'chest', 'glow', [0, 0.2, 0.16], [PI / 2 - 0.15, 0, 0]);
  if (!far) for (let i = 0; i < 12; i++) { const a = i / 12 * PI * 2; b.add(b.box(0.008, 0.05, 0.008), 'chest', 'trim', [Math.sin(a) * 0.1, 0.2 + Math.cos(a) * 0.1, 0.165], [0, 0, -a]); }
  b.sym(b.rbox(0.14, 0.2, 0.15, 0.03), 'foreArm', 'trim', [0, -0.26, 0]);
}

export function sovereignMats(o) {
  const M = heavyMats(3, true);
  return {
    ...M,
    body: mat('dray_gold', { color: 0xffd27a, metal: 1, rough: 0.14, coat: 0.6 }),
    cape: mat('dray_mantle', { color: 0xefe8da, metal: 0, rough: 0.7 }),
    pods: glow('dray_pods', 0xfff0c0, 5),
    glow: glow('dray_glow', 0xffe0a0, 4),
    eye: glow('dray_eye', 0xffd070, 5),
  };
}

export function sovereignPhase(api, n, own) {
  const pods = own.pods, glo = own.glow, eye = own.eye;
  if (pods) { pods.userData.baseEI = n >= 2 ? 0.15 : 5; pods.userData.baseC.set(n >= 3 ? 0x601008 : 0xfff0c0); }
  if (glo) { glo.userData.baseC.set(n >= 3 ? 0xff3a1a : 0xffe0a0); glo.userData.baseEI = n >= 3 ? 2.2 : 4; }
  if (eye) eye.userData.baseC.set(n >= 3 ? 0xf4f8ff : 0xffd070);
}

// ================= Halo drone: one of Dray's seven voices (hover rig) =================
export const HALO_DRONE_DIMS = {
  hover: 1.9,
  offsets: {
    spine: [0, 0, 0], chest: [0, 0, 0], neck: [0, 0, 0], head: [0, 0, 0.02],
    clavL: [0.1, 0, 0], upArmL: [0, 0, 0], foreArmL: [0, 0, 0], handL: [0, 0, 0],
    thighL: [0, 0, 0], shinL: [0, 0, 0], footL: [0, 0, 0],
    aux0: [0, 0, 0], aux1: [0, 0, 0.1],
  },
};

export function buildHaloDrone(b) {
  b.add(b.sph(20, 14), 'pelvis', 'body', [0, 0, 0], [0, 0, 0], 0.16);
  b.add(b.tor(0.28, 0.018, 36, 6), 'pelvis', 'trim', [0, 0, 0], [PI / 2, 0, 0]);
  b.add(b.tor(0.34, 0.008, 36, 5), 'pelvis', 'glow', [0, 0, 0], [PI / 2, 0, 0]);
  // halo spun by the hover rotor bones
  b.sym(b.tor(0.22, 0.01, 30, 5), 'thigh', 'glow', [0, 0, 0], [0.4, 0, 0]);
  b.add(b.cyl(0.07, 0.08, 0.04, 20), 'head', 'mech', [0, 0, 0.14], [PI / 2, 0, 0]);
  b.add(b.cyl(0.055, 0.055, 0.01, 20), 'head', 'eye', [0, 0, 0.162], [PI / 2, 0, 0]);
  for (let i = 0; i < 4; i++) { const a = i / 4 * PI * 2 + PI / 4; b.add(b.cyl(0.0, 0.03, 0.14, 4), 'pelvis', 'trim', [Math.sin(a) * 0.19, Math.cos(a) * 0.19, 0], [0, 0, -a]); }
}

export function haloDroneMats() {
  return {
    body: mat('hdrone_gold', { color: 0xffd889, metal: 1, rough: 0.12, coat: 0.6 }),
    trim: mat('hdrone_trim', { color: 0xf6f1e6, metal: 0.4, rough: 0.2 }),
    mech: mat('hdrone_mech', { color: 0x1a1a1d, metal: 1, rough: 0.2 }),
    glow: glow('hdrone_glow', 0xfff0c8, 4),
    eye: glow('hdrone_eye', 0xffe8a0, 5),
  };
}

// ================= Seraph phases (the Act 5 boss is `seraph` tier 3) =================
// 1 hunting (default), 2 wings flare, 3 damaged (glow gutters, chip shows red), 4 freed: the chip cracks and it is Lyra —
// warm human eyes, halo dimmed to a soft amber.
export function seraphPhase(api, n, own) {
  const g = own.glow, e = own.eye;
  if (g) { g.userData.baseC.set(n === 2 ? 0xfff6e0 : n === 3 ? 0xffb070 : n >= 4 ? 0xffb86a : 0xfff0c8); g.userData.baseEI = n === 2 ? 7 : n === 3 ? 2.5 : n >= 4 ? 1.2 : 4; }
  if (e) { e.userData.baseC.set(n === 3 ? 0xff4030 : n >= 4 ? 0xffd2a0 : 0xfff6e0); e.userData.baseEI = n >= 4 ? 2 : 4; }
}

// ================= Wren's own body (A6-M4 "Walk as Yourself"): a simple stylised human in a Ward pod-suit =================
export const HUMAN_DIMS = { thigh: 0.41, shin: 0.4, ankle: 0.07, hipX: 0.085, spine: 0.11, chest: 0.21, neck: 0.22, headOff: 0.07, clavX: 0.04, clavY: 0.18, shoulder: 0.13, upArm: 0.27, foreArm: 0.24 };

export function buildHuman(b, o) {
  const far = b.far, D = b.rig.D;
  // head: skin, hair cap with a short fringe, small dark eyes, nose, ears
  b.add(b.sph(22, 16), 'head', 'skin', [0, 0.1, 0.01], [0, 0, 0], [0.078, 0.1, 0.09]);
  b.add(b.sph(14, 10), 'head', 'skin', [0, 0.035, 0.035], [0, 0, 0], [0.05, 0.04, 0.05]);
  b.add(b.sph(20, 12, 0, PI * 2, 0, PI * 0.55), 'head', 'hair', [0, 0.115, -0.004], [-0.25, 0, 0], [0.086, 0.1, 0.1]);
  b.add(b.rbox(0.13, 0.03, 0.05, 0.012), 'head', 'hair', [0, 0.165, 0.07], [0.5, 0, 0]);
  b.sym(b.sph(8, 6), 'head', 'eye', [0.028, 0.11, 0.085], [0, 0, 0], [0.011, 0.008, 0.006]);
  b.add(b.cyl(0.0, 0.012, 0.03, 4), 'head', 'skin', [0, 0.085, 0.098], [-0.25, PI / 4, 0], [1, 1, 0.7]);
  b.sym(b.sph(8, 6), 'head', 'skin', [0.078, 0.1, 0.0], [0, 0, 0], [0.012, 0.022, 0.016]);
  b.add(b.cyl(0.03, 0.034, 0.12, 12), 'neck', 'skin', [0, 0.05, 0]);
  // pod-suit torso: soft rounded shapes, a collar, the Ward number patch
  b.add(b.sph(20, 14), 'chest', 'suit', [0, 0.12, 0], [0, 0, 0], [0.145, 0.13, 0.085]);
  b.add(b.sph(16, 10), 'chest', 'suit', [0, 0.19, -0.005], [0, 0, 0], [0.17, 0.05, 0.075]);
  b.add(ringH(b, 0.042, 0.01, 18), 'chest', 'trim', [0, 0.235, 0]);
  b.add(b.rbox(0.05, 0.03, 0.01, 0.004), 'chest', 'trim', [0.06, 0.16, 0.08], [-0.1, 0.3, 0]);
  if (!far) b.add(b.box(0.004, 0.2, 0.004), 'chest', 'trim', [0, 0.12, 0.087]);
  b.add(b.cyl(0.1, 0.11, 0.22, 16), 'spine', 'suit', [0, 0.1, 0], [0, 0, 0], [1, 1, 0.75]);
  b.add(b.sph(16, 12), 'pelvis', 'suit', [0, -0.01, 0], [0, 0, 0], [0.12, 0.08, 0.085]);
  b.add(ringH(b, 0.108, 0.01, 22), 'pelvis', 'trim', [0, 0.05, 0], [0, 0, 0], [1, 1, 0.78]);
  // arms: sleeves to the wrist, bare hands
  b.sym(b.sph(12, 10), 'upArm', 'suit', [0, 0, 0], [0, 0, 0], 0.046);
  b.sym(pod(b, -0.01, -D.upArm, [0.042, 0.045, 0.04, 0.034], 14), 'upArm', 'suit');
  b.sym(pod(b, 0.0, -D.foreArm + 0.01, [0.034, 0.036, 0.03, 0.026], 14), 'foreArm', 'suit');
  b.sym(ringH(b, 0.027, 0.006, 12), 'foreArm', 'trim', [0, -D.foreArm + 0.02, 0]);
  hand(b, 'skin', 'skin', 1.0, far);
  // legs: suit, soft slip-on shoes
  b.sym(pod(b, 0.02, -D.thigh, [0.06, 0.064, 0.056, 0.046], 16), 'thigh', 'suit');
  b.sym(pod(b, 0.0, -D.shin + 0.01, [0.045, 0.048, 0.04, 0.032], 16), 'shin', 'suit');
  b.sym(b.sph(14, 10), 'foot', 'trim', [0, -0.035, 0.04], [0, 0, 0], [0.04, 0.032, 0.1]);
}

const SKIN = [0xc98f6c, 0x8d5a3b, 0xe2b294];
export function humanMats(o) {
  return {
    skin: mat('human_skin' + o.tone, { color: SKIN[o.tone], metal: 0, rough: 0.62, env: 0.5 }),
    hair: mat('human_hair', { color: 0x2a1c14, metal: 0, rough: 0.7, env: 0.5 }),
    suit: mat('human_suit', { color: 0x5b6573, metal: 0, rough: 0.85, env: 0.5 }),
    trim: mat('human_trim', { color: 0x2b3038, metal: 0.1, rough: 0.6 }),
    eye: mat('human_eye', { color: 0x0e0c0b, metal: 0, rough: 0.2, emissive: 0x000000 }),
  };
}
