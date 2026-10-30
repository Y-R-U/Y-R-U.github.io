// Sci-fi King: "Commander". An armoured command mech: an octagonal plinth with a light
// channel, eight armour tassets (panel gaps, a light strip down the front), a glowing belt,
// a broad faceted chest with a reactor and chevron light-lines, big pauldrons with light
// stripes, armoured arms, a backpack with two thruster nozzles, and a helmet with a dark
// glass visor and a glowing slit. On top: a "+" antenna array (mast + two crossing booms),
// each boom lit along its top with a bright bead at every tip.
// Overhead read: a big bright "+" with four glowing tips and a centre bead — the king's cross.
// Authored looking -z; index.js turns it toward its owner (pieces.facing.byType.k = 'player').
import { hsLathe, prep, assemble, loft, chamferRect, strut, PAL } from './common.js';

const TAU = Math.PI * 2;

export function king(THREE, kit, { color }) {
  const parts = [];
  const box = (w, h, d, key, t, bevel = 0.006) => parts.push(prep(THREE, kit.place(kit.bevelBox(w, h, d, bevel), t), color, key));

  // ---- octagonal plinth ----
  parts.push(hsLathe(THREE, color, [
    [0, 0, 'dark'], [0.322, 0, 'dark'], [0.345, 0.022, 'shade'], [0.345, 0.056, 'body'],
    [0.326, 0.075, 'trim'], [0.304, 0.075, 'body'],
    [0.304, 0.066, 'dark'], [0.3, 0.064, 'line'], [0.27, 0.064, 'line'], [0.266, 0.066, 'line'], [0.266, 0.078, 'dark'],
    [0.252, 0.084, 'deck'], [0, 0.084, 'deck'],
  ], { seg: 8, flat: true, phiStart: Math.PI / 8 }));

  // ---- armour tassets (lower body): 8 panels round a dark core, flaring at the hem ----
  parts.push(hsLathe(THREE, color, [[0.16, 0.084, 'dark'], [0.15, 0.47, 'dark']], { seg: 16 }));
  const NP = 8, span = TAU / NP, gap = 0.07;
  const tasset = [
    [0.16, 0.084, 'dark'], [0.236, 0.084, 'dark'], [0.25, 0.1, 'trim'],
    [0.24, 0.15, 'body'], [0.232, 0.156, 'dark'], [0.232, 0.166, 'dark'], [0.236, 0.172, 'dark'],    // panel groove
    [0.2, 0.36, 'body'], [0.19, 0.38, 'trim'], [0.16, 0.38, 'trim'],
  ];
  for (let i = 0; i < NP; i++) {
    parts.push(hsLathe(THREE, color, tasset, { seg: 4, phiStart: i * span + gap / 2 + span / 2, phiLength: span - gap, closed: true, caps: true }));
  }
  // light strips down the front / back gaps (phi = PI is -z = the front)
  for (const a of [Math.PI, 0]) {
    const s = prep(THREE, new THREE.BoxGeometry(0.016, 0.2, 0.016), color, 'line');
    kit.place(s, { x: Math.sin(a) * 0.205, y: 0.24, z: Math.cos(a) * 0.205, ry: a, rx: (a ? -1 : 1) * 0.17 });
    parts.push(s);
  }
  // hip ring + glowing belt
  parts.push(hsLathe(THREE, color, [
    [0.15, 0.372, 'dark'], [0.198, 0.372, 'shade'], [0.208, 0.384, 'trim'], [0.208, 0.396, 'dark'],
    [0.205, 0.398, 'line'], [0.205, 0.414, 'line'], [0.208, 0.416, 'dark'], [0.2, 0.43, 'trim'], [0.15, 0.43, 'shade'],
  ], { seg: 16, flat: true, closed: true }));

  // ---- torso: faceted block lofted bottom -> top (loft z = height, then stood up) ----
  {
    const sec = (w, d, c, keys) => chamferRect(w, d, c, keys);
    const secs = [
      { z: 0.43, pts: sec(0.25, 0.19, 0.05) },
      { z: 0.52, pts: sec(0.27, 0.2, 0.055), smooth: true },
      { z: 0.535, pts: sec(0.262, 0.194, 0.052), key: 'dark' },          // panel groove
      { z: 0.55, pts: sec(0.272, 0.2, 0.055), key: 'dark' },
      { z: 0.68, pts: sec(0.35, 0.24, 0.06) },
      { z: 0.76, pts: sec(0.37, 0.25, 0.06) },
      { z: 0.8, pts: sec(0.33, 0.23, 0.06, { top: 'trim', side: 'trim', bot: 'trim', ch: 'trim' }) },
      { z: 0.815, pts: sec(0.22, 0.16, 0.04, { top: 'shade', side: 'shade', bot: 'shade', ch: 'shade' }) },
    ];
    const g = loft(THREE, color, secs, { capStart: 'dark', capEnd: 'deck' });
    g.rotateX(-Math.PI / 2);            // loft z -> world y, section y -> world -z (front = -z)
    parts.push(g);
  }
  // chest reactor (front, -z) in a trim bezel, and chevron light-lines above it
  {
    const zf = -0.122;
    parts.push(prep(THREE, kit.place(new THREE.CylinderGeometry(0.05, 0.054, 0.02, 6), { y: 0.65, z: zf - 0.004, rx: Math.PI / 2, ry: 0 }), color, 'trim'));
    parts.push(prep(THREE, kit.place(new THREE.CylinderGeometry(0.034, 0.034, 0.02, 6), { y: 0.65, z: zf - 0.01, rx: Math.PI / 2 }), color, 'lineHi'));
    for (const s of [-1, 1]) {
      box(0.1, 0.016, 0.012, 'line', { x: s * 0.075, y: 0.725 + 0.0, z: -0.124 - 0.002, rz: s * 0.42 }, 0.003);
      box(0.012, 0.09, 0.012, 'line', { x: s * 0.152, y: 0.6, z: -0.106, rz: s * -0.36 }, 0.003);
    }
  }
  // backpack (+z) with two thruster nozzles
  box(0.22, 0.2, 0.08, 'shade', { y: 0.66, z: 0.14 }, 0.02);
  box(0.16, 0.012, 0.012, 'line', { y: 0.72, z: 0.184 }, 0.003);
  for (const s of [-1, 1]) {
    parts.push(hsLathe(THREE, color, [
      [0, 0.5, 'lineHi'], [0.03, 0.5, 'lineHi'], [0.036, 0.496, 'dark'], [0.04, 0.53, 'trim'], [0.034, 0.6, 'body'], [0.03, 0.61, 'trim'], [0, 0.61, 'trim'],
    ].map(([r, y, k]) => [r, y, k]), { seg: 10 }).translate(s * 0.065, 0, 0.165));
  }

  // ---- pauldrons: flattened domes with a trim rim and a light stripe ----
  const pauldron = hsLathe(THREE, color, [
    [0, -0.034, 'dark'], [0.088, -0.034, 'dark'], [0.104, -0.018, 'trim'], [0.104, -0.004, 'body'],
    [0.094, 0.026, 'body'], [0.08, 0.04, 'trim'],
    [0.074, 0.042, 'dark'], [0.068, 0.044, 'line'], [0.054, 0.05, 'line'], [0.05, 0.054, 'dark'],
    [0.034, 0.06, 'body'], [0, 0.062, 'shade'],
  ], { seg: 8, flat: true, phiStart: Math.PI / 8 });
  for (const s of [-1, 1]) {
    const p = pauldron.clone();
    p.scale(0.9, 0.9, 1.08);
    p.rotateZ(-s * 0.5);
    p.translate(s * 0.192, 0.785, 0.004);
    parts.push(p);
  }

  // ---- arms: upper arm + armoured forearm with a glowing gauntlet band ----
  const armSec = (w, d, c) => () => chamferRect(w, d, c, { bot: 'shade', side: 'body', top: 'body', ch: 'trim' });
  for (const s of [-1, 1]) {
    const sh = [s * 0.2, 0.74, 0.0], el = [s * 0.218, 0.6, -0.02], wr = [s * 0.208, 0.48, -0.05];
    parts.push(strut(THREE, color, sh, el, armSec(0.07, 0.07, 0.018)));
    parts.push(strut(THREE, color, el, wr, armSec(0.09, 0.09, 0.022), [0, { t: 0.62, key: 'body' }, { t: 0.72, key: 'line' }, { t: 1, key: 'body' }]));
    box(0.07, 0.06, 0.075, 'trim', { x: wr[0], y: wr[1] - 0.03, z: wr[2] }, 0.014);    // armoured fist
  }

  // ---- helmet: faceted dome on a gorget, glass visor band with a glowing slit ----
  parts.push(hsLathe(THREE, color, [
    [0, 0.815, 'dark'], [0.09, 0.815, 'dark'], [0.096, 0.83, 'trim'], [0.072, 0.852, 'trim'], [0.06, 0.852, 'dark'],
  ], { seg: 12, flat: true }));
  const HB = 0.852;
  parts.push(hsLathe(THREE, color, [
    [0.06, HB, 'dark'], [0.088, HB + 0.006, 'shade'], [0.1, HB + 0.04, 'body'], [0.104, HB + 0.1, 'body'],
    [0.1, HB + 0.112, 'dark'], [0.1, HB + 0.12, 'dark'], [0.096, HB + 0.124, 'body'],
    [0.08, HB + 0.16, 'body'], [0.05, HB + 0.18, 'trim'], [0, HB + 0.184, 'trim'],
  ], { seg: 12, flat: true }));
  // visor: dark glass band round the front half, slit of light across it
  parts.push(hsLathe(THREE, color, [
    [0.1, HB + 0.045, 'glass'], [0.108, HB + 0.05, 'glass'], [0.11, HB + 0.096, 'glass'], [0.104, HB + 0.1, 'glass'],
  ], { seg: 8, phiStart: Math.PI - 1.15, phiLength: 2.3, closed: true, caps: true }));
  parts.push(hsLathe(THREE, color, [
    [0.108, HB + 0.066, 'lineHi'], [0.113, HB + 0.067, 'lineHi'], [0.113, HB + 0.077, 'lineHi'], [0.108, HB + 0.078, 'lineHi'],
  ], { seg: 6, phiStart: Math.PI - 0.8, phiLength: 1.6, closed: true, caps: true }));
  // crest fin running front to back over the helmet
  {
    const fin = loft(THREE, color, [
      { z: -0.09, pts: [[-0.012, 0, 'trim'], [0.012, 0, 'trim'], [0.008, 0.02, 'trim'], [-0.008, 0.02, 'line']] },
      { z: 0.0, pts: [[-0.012, 0, 'trim'], [0.012, 0, 'trim'], [0.008, 0.045, 'trim'], [-0.008, 0.045, 'line']] },
      { z: 0.09, pts: [[-0.012, 0, 'trim'], [0.012, 0, 'trim'], [0.008, 0.03, 'trim'], [-0.008, 0.03, 'line']] },
    ], { capStart: 'trim', capEnd: 'trim' });
    // keep it low so the "+" stays clean from above
    fin.translate(0, HB + 0.15, 0);
    parts.push(fin);
  }

  // ---- "+" antenna array ----
  const AY = 1.235, ARM = 0.235, MT = HB + 0.18;
  // mast from the helmet crown up through the hub to a top tip
  parts.push(prep(THREE, kit.place(new THREE.CylinderGeometry(0.014, 0.022, 1.33 - MT, 8), { y: (1.33 + MT) / 2 }), color, 'trim'));
  parts.push(prep(THREE, kit.place(new THREE.CylinderGeometry(0.034, 0.042, 0.03, 8), { y: MT + 0.012 }), color, 'shade'));
  // hub
  parts.push(hsLathe(THREE, color, [
    [0, AY - 0.03, 'dark'], [0.04, AY - 0.03, 'shade'], [0.048, AY - 0.016, 'trim'], [0.048, AY + 0.016, 'body'], [0.04, AY + 0.03, 'trim'], [0, AY + 0.03, 'lineHi'],
  ], { seg: 8, flat: true, phiStart: Math.PI / 8 }));
  // booms: bevelled bars with a glowing top line, bright beads at the tips
  // section: dark underside, trim flanks, a dark chamfer framing a bright lit top (contrast on
  // both the pearl and the gunmetal side, so the "+" pops from overhead)
  const boomSec = () => [
    [0.02, -0.018, 'dark'], [0.026, -0.01, 'trim'], [0.026, 0.008, 'trim'], [0.02, 0.016, 'dark'],
    [0.017, 0.019, 'lineHi'], [-0.017, 0.019, 'lineHi'], [-0.02, 0.016, 'lineHi'], [-0.026, 0.008, 'dark'], [-0.026, -0.01, 'trim'], [-0.02, -0.018, 'trim'],
  ];
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const A = [dx * 0.04, AY, dz * 0.04], B = [dx * ARM, AY, dz * ARM];
    parts.push(strut(THREE, color, A, B, boomSec, [0, 1], { capStart: 'trim', capEnd: 'trim' }));
    parts.push(prep(THREE, kit.place(new THREE.IcosahedronGeometry(0.04, 1), { x: dx * (ARM + 0.014), y: AY, z: dz * (ARM + 0.014) }), color, 'lineHi'));
    // small fins under the boom ends
    box(0.012, 0.04, 0.03, 'trim', { x: dx * (ARM - 0.03), y: AY - 0.03, z: dz * (ARM - 0.03), ry: dx ? Math.PI / 2 : 0 }, 0.004);
  }
  parts.push(prep(THREE, kit.place(new THREE.IcosahedronGeometry(0.03, 1), { y: 1.345 }), color, 'lineHi'));

  return assemble(kit, color, parts);
}

/**
 * Commander move "command jet" (≤ 350 ms at 1×): a short crouch, the backpack thrusters fire
 * (downward side-coloured flare), a low powered hop with the torso pitched into the move, then a
 * heavy landing: stomp ring, dark shock ring, spark skid and a little camera shake.
 * crouch 45 -> hop 190–230 -> land squash 60 ≈ 295–335 ms (castling: 2 squares ≈ 315 ms).
 */
export async function commandJet(ctx) {
  const { kit, piece, from, to, fx, color, THREE } = ctx;
  const pal = PAL[color] || PAL.w, cols = pal.spark, p = piece.position;
  const dir = kit.flatDir(from, to), span = kit.flatDist(from, to), H = Math.min(0.32, 0.2 + span * 0.04);
  await ctx.tween(45, e => { piece.scale.set(1 + 0.05 * e, 1 - 0.09 * e, 1 + 0.05 * e); }, kit.ease.quadOut);
  const jet = (pos, n) => fx?.burst({ pos: pos.clone().setY(pos.y + 0.55), count: n, colors: cols, speed: [0.8, 1.8], dir: new THREE.Vector3(-dir.x * 0.4, -1, -dir.z * 0.4),
    spread: 0.35, life: [160, 300], size: [0.06, 0.12], sizeEnd: 0.24, drag: 2.4, shape: 0 });
  jet(from, 16);
  fx?.ring?.(from, { radius: 0.5, color: cols[2], ms: 200 });
  let trail = 0;
  const q = new THREE.Vector3();
  await ctx.tween(Math.min(230, 185 + span * 15), (e, k) => {
    kit.arc(p, from, to, H, e);
    const s = 1 + 0.05 * Math.sin(Math.min(1, k * 3) * Math.PI * 0.5) * (1 - k);
    piece.scale.set(1 / Math.sqrt(s), s, 1 / Math.sqrt(s));
    kit.setLean(piece, dir, 0.14 * Math.sin(k * Math.PI) - 0.04 * (1 - k));
    if (ctx.tl?.instant) trail = e;
    while (trail + 0.1 <= Math.min(e, 0.8)) {
      trail += 0.1;
      kit.arc(q, from, to, H, trail); q.y += 0.5;
      fx?.burst({ pos: q, count: 2, colors: pal.trail, speed: [0.3, 0.8], dir: new THREE.Vector3(0, -1, 0), spread: 0.3,
        life: [140, 240], size: [0.07, 0.1], sizeEnd: 0.22, drag: 3, shape: 0, alpha: 0.8 });
    }
  }, kit.ease.sineInOut);
  p.copy(to); kit.setLean(piece, dir, 0); piece.scale.set(1, 1, 1);
  fx?.ring?.(to, { radius: 0.7, color: cols[2], ms: 260, thick: true });
  fx?.ring?.(to, { radius: 0.55, dark: true, ms: 220, alpha: 0.35 });
  fx?.burst({ pos: to.clone().setY(0.05), count: 12, colors: cols, speed: [1.0, 2.2], flat: 0.9, up: 0.05, spread: 1, life: [140, 260], size: [0.03, 0.06], sizeEnd: 0.1, drag: 3, shape: 1 });
  ctx.camera?.shake?.(0.015, 80);
  await kit.squash(ctx, piece, 0.12, 60);
}
commandJet.only = ['k']; commandJet.weight = 5; commandJet.label = 'command jet';
