import * as THREE from '../../../../lib/three/0.180.0/three.module.js';
import { mat, glow } from './materials.js';
import { ringH, rod, arcH } from './shapes.js';
import { buildSecurity, SECURITY_DIMS } from './kinds_frames.js';
import { buildElegant } from './kinds_civ.js';

const PI = Math.PI;

// ================= Warden-Captain Ines Halloran (Act 2 boss): a security frame, captain's cut =================
// Tall crest, gold epaulettes, a navy half-cape on the back, a tower shield with the Concord sun, a shock lance with arc coils.
export const HALLORAN_DIMS = { ...Object.fromEntries(Object.entries(SECURITY_DIMS).map(([k, v]) => [k, v * 1.1])), aux0: [0, 0.2, -0.12] };

export function buildHalloran(b, o) {
  const far = b.far;
  buildSecurity(b, { ...o, tier: 3 });
  // crest: swept gold fin + glow line
  b.add(b.rbox(0.018, 0.12, 0.26, 0.008), 'head', 'trim', [0, 0.27, -0.05], [0.35, 0, 0]);
  if (!far) b.add(b.rbox(0.008, 0.05, 0.22, 0.003), 'head', 'glow', [0, 0.24, -0.05], [0.35, 0, 0]);
  // epaulettes with hanging bars
  b.sym(b.sph(16, 8, 0, PI * 2, 0, PI / 2), 'clav', 'trim', [0.15, 0.03, 0], [0, 0, -0.35], [0.1, 0.06, 0.1]);
  if (!far) for (let i = 0; i < 4; i++) b.sym(b.cyl(0.006, 0.006, 0.07, 5), 'clav', 'trim', [0.2 + i * 0.012, -0.03, -0.045 + i * 0.03], [0, 0, 0.3]);
  // half-cape: a curved navy panel from the shoulders down the back
  const cape = b.lathe([[0.17, 0.05], [0.2, -0.2], [0.24, -0.5], [0.27, -0.78]], 28, PI * 0.72, PI * 0.56);
  b.add(cape, 'aux0', 'cape', [0, 0, 0.1]);
  const inner = b.lathe([[0.165, 0.05], [0.195, -0.2], [0.235, -0.5], [0.265, -0.78]], 28, PI * 0.72, PI * 0.56);
  inner.scale(-1, 1, 1);
  b.add(inner, 'aux0', 'cape', [0, 0, 0.1], [0, PI, 0]);
  b.add(arcH(b, 0.2, 0.012, PI * 0.56, 16, 5), 'aux0', 'trim', [0, 0.05, 0.1], [0, PI, 0]);
  // tower shield face: Concord sun disc + ring on the outer face
  b.add(b.cyl(0.12, 0.12, 0.012, 24), 'foreArmL', 'trim', [0.095, -0.1, 0.02], [0, 0, PI / 2]);
  b.add(ringH(b, 0.17, 0.01, 28), 'foreArmL', 'glow', [0.096, -0.1, 0.02], [0, 0, PI / 2]);
  if (!far) for (let i = 0; i < 8; i++) { const a = i / 8 * PI * 2; b.add(b.box(0.006, 0.05, 0.012), 'foreArmL', 'trim', [0.098, -0.1 + Math.cos(a) * 0.15, 0.02 + Math.sin(a) * 0.15], [a, 0, 0]); }
  // shock lance: arc coils along the shaft and a forked, glowing head
  for (let i = 0; i < 4; i++) b.add(ringH(b, 0.022, 0.005, 12), 'handR', 'glow', [-0.005, -0.55 - i * 0.09, 0]);
  b.sym(b.box(0.012, 0.16, 0.03), 'handR', 'trim', [0.03, -1.0, 0], [0, 0, 0.18]);
  b.add(b.sph(10, 8), 'handR', 'glow', [-0.005, -1.12, 0], [0, 0, 0], [0.03, 0.05, 0.03]);
  // captain's chest badge
  b.add(b.cyl(0.03, 0.03, 0.01, 16), 'chest', 'trim', [-0.07, 0.17, 0.115], [PI / 2 - 0.2, 0, 0]);
}

export function halloranMats() {
  return {
    body: mat('hal_white', { color: 0xf4f5f7, metal: 0.15, rough: 0.2, coat: 1 }),
    trim: mat('hal_gold', { color: 0xf1c865, metal: 1, rough: 0.16 }),
    mech: mat('hal_mech', { color: 0x12141a, metal: 1, rough: 0.14 }),
    cape: mat('hal_cape', { color: 0x1a2a5c, metal: 0, rough: 0.72 }),
    glow: glow('hal_arc', 0x6fd0ff, 4.5),
    eye: glow('hal_eye', 0xbfe6ff, 4),
  };
}

// ================= Sentry Turret (hover rig held still: pelvis = ring mount, head = gun head, thighL = radar) =================
export const TURRET_DIMS = {
  hover: 0.95,
  offsets: {
    spine: [0, 0, 0], chest: [0, 0, 0], neck: [0, 0.08, 0], head: [0, 0.14, 0],
    clavL: [0.14, 0.12, 0], upArmL: [0.02, 0, 0], foreArmL: [0, 0, 0], handL: [0, 0, 0],
    thighL: [0, 0.34, -0.12], shinL: [0, 0, 0], footL: [0, 0, 0],
    aux0: [0, 0, 0], aux1: [0, 0.02, 0.2],
  },
};

export function buildTurret(b) {
  const far = b.far;
  // pedestal down to the floor, a floor plate with warning stripes
  b.add(b.cyl(0.34, 0.42, 0.14, 24), 'pelvis', 'mech', [0, -0.88, 0]);
  b.add(ringH(b, 0.4, 0.015, 28), 'pelvis', 'glow', [0, -0.8, 0]);
  b.add(b.cyl(0.13, 0.17, 0.8, 16), 'pelvis', 'body', [0, -0.42, 0]);
  if (!far) for (let i = 0; i < 3; i++) b.add(ringH(b, 0.16 - i * 0.012, 0.012, 20), 'pelvis', 'trim', [0, -0.66 + i * 0.22, 0]);
  b.add(b.cyl(0.26, 0.22, 0.12, 24), 'pelvis', 'trim', [0, 0.0, 0]);
  // gun head: rounded armoured housing, twin barrels, sensor eye, cooling fins
  b.add(b.sph(20, 14), 'head', 'body', [0, 0, 0], [0, 0, 0], [0.24, 0.17, 0.26]);
  b.add(b.rbox(0.36, 0.05, 0.3, 0.02), 'head', 'trim', [0, 0.02, 0]);
  b.add(b.cyl(0.07, 0.07, 0.06, 18), 'head', 'mech', [0, 0.02, 0.24], [PI / 2, 0, 0]);
  b.add(b.cyl(0.05, 0.05, 0.02, 18), 'head', 'eye', [0, 0.02, 0.27], [PI / 2, 0, 0]);
  for (const sx of [-1, 1]) {
    b.add(b.cyl(0.028, 0.034, 0.46, 10), 'head', 'mech', [0.15 * sx, -0.05, 0.3], [PI / 2, 0, 0]);
    b.add(ringH(b, 0.036, 0.008, 12), 'head', 'trim', [0.15 * sx, -0.05, 0.5], [PI / 2, 0, 0]);
    b.add(b.cyl(0.018, 0.018, 0.012, 10), 'head', 'glow', [0.15 * sx, -0.05, 0.535], [PI / 2, 0, 0]);
    b.add(b.rbox(0.08, 0.12, 0.2, 0.02), 'head', 'trim', [0.2 * sx, -0.03, 0.04]);
  }
  if (!far) for (let i = 0; i < 4; i++) b.add(b.box(0.26, 0.01, 0.05), 'head', 'mech', [0, 0.13 + i * 0.018, -0.15 + i * 0.01]);
  // radar dish on a mast (spun by the hover rig's rotor on thighL)
  b.add(b.cyl(0.012, 0.012, 0.3, 6), 'pelvis', 'mech', [0, 0.18, -0.12]);
  b.add(b.sph(12, 6, 0, PI * 2, 0, PI / 3), 'thighL', 'trim', [0, 0.02, 0], [PI / 2 + 0.3, 0, 0], [0.1, 0.05, 0.1]);
  b.add(b.sph(6, 4), 'thighL', 'glow', [0, 0.05, 0.05], [0, 0, 0], 0.012);
}

export function turretMats() {
  return {
    body: mat('tur_white', { color: 0xeef1f5, metal: 0.2, rough: 0.22, coat: 1 }),
    trim: mat('tur_gold', { color: 0xe9bf62, metal: 1, rough: 0.22 }),
    mech: mat('tur_mech', { color: 0x16181d, metal: 0.95, rough: 0.28 }),
    glow: glow('tur_glow', 0x3aa0ff, 3),
    eye: glow('tur_eye', 0xff3a2a, 4.5),
  };
}

// ================= Seraph / Choir Angel: flawless gold frame, halo ring, blade wings =================
// tier 0 Choir Angel (gold + ivory, small wings) · 1 Choir Warden · 3 Seraph (all gold, big wings, a hidden star under the paint)
export const SERAPH_DIMS = { shoulder: 0.13, hipX: 0.088, thigh: 0.46, shin: 0.46, upArm: 0.3, foreArm: 0.27, aux0: [0, 0.16, -0.12] };

export function buildSeraph(b, o) {
  const t = o.tier, far = b.far, big = t >= 3 ? 1.35 : t >= 1 ? 1.15 : 1;
  buildElegant(b, { face: 'none', bust: true, layered: true, crest: 2, lines: true });
  // halo: floating ring behind the head
  b.add(b.tor(0.13, 0.008, 36, 6), 'head', 'glow', [0, 0.2, -0.06], [0.25, 0, 0]);
  if (t >= 1) b.add(b.tor(0.16, 0.005, 36, 5), 'head', 'trim', [0, 0.2, -0.07], [0.25, 0, 0]);
  // blade wings: a swept arm bar with a fan of long, flat gold feathers hanging off it, each lit along one edge
  const n = t >= 3 ? 8 : 6;
  const arm = b.rbox(0.035, 0.42 * big, 0.03, 0.012); arm.translate(0, 0.21 * big, 0);
  b.sym(arm, 'aux0', 'trim', [0.07, 0.04, -0.03], [-0.35, -0.5, -1.05]);
  for (let i = 0; i < n; i++) {
    const f = i / (n - 1), len = (0.78 - 0.4 * f) * big;
    const blade = b.cyl(0.0, 0.05, len, 4); blade.translate(0, len / 2, 0); blade.scale(1, 1, 0.22);
    const along = 0.08 + f * 0.36 * big;   // root slides out along the arm
    const root = [0.07 + Math.sin(1.05) * along, 0.04 + Math.cos(1.05) * along * 0.9, -0.03 - along * 0.35];
    const ang = 0.35 + f * 1.25;
    b.sym(blade, 'aux0', 'trim', root, [-0.35, -0.5, -ang]);
    if (!far && i % 2 === 0) { const edge = b.cyl(0.0, 0.008, len * 0.92, 3); edge.translate(0.02, len * 0.46, 0); b.sym(edge, 'aux0', 'glow', root, [-0.35, -0.5, -ang]); }
  }
  b.add(b.rbox(0.12, 0.14, 0.05, 0.02), 'aux0', 'mech', [0, 0.02, 0.02]);
  // gauntlet blades on both forearms
  b.sym(b.rbox(0.012, 0.32, 0.05, 0.006), 'foreArm', 'trim', [0.05, -0.2, 0], [0, 0, 0.05]);
  if (t >= 3 && !far) b.add(b.cyl(0.02, 0.02, 0.004, 8), 'chest', 'mech', [0.0, 0.2, 0.1], [PI / 2 - 0.3, 0, 0]);
}

export function seraphMats(o) {
  const t = o.tier;
  return {
    body: mat('ser_gold' + (t >= 3 ? 3 : 0), { color: t >= 3 ? 0xffd889 : 0xf6f1e6, metal: t >= 3 ? 1 : 0.35, rough: 0.1, coat: 0.8 }),
    trim: mat('ser_trim', { color: 0xffcf6e, metal: 1, rough: 0.12 }),
    mech: mat('ser_mech', { color: 0x2a2217, metal: 1, rough: 0.2 }),
    glow: glow('ser_glow' + t, t >= 3 ? 0xfff0c8 : 0xffe2a0, 4),
    eye: glow('ser_eye', 0xfff6e0, 4),
  };
}
