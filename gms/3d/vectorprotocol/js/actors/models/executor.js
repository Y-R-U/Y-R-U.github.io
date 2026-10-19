// EXECUTOR, corporate legendary archer "Hostile Takeover Unit" (sculptor-15). Brief: docs/ROSTER.md `executor`.
// A tall, cold corporate assassin-executive: pearl-white tailored armour cut like a suit (lapels, high black collar, gold tie),
// long split coat-tail plates, a slicked-back helm with a gold monocle sensor, a long railcannon carried on a boom over the right
// shoulder (stowed upright like a cane, swings level to fire) and a compact wrist pistol on the left forearm.
// VALUE: `paint` = pearl white on the read-shapes, `accent` = black suit (collar, sleeves, coat lining, shirt front),
// `metal` = gunmetal joints / rails, `trim` = gold (tie, edges, cuffs, monocle rim), `glow` = gold lights (monocle lens, coat edges,
// cannon capacitors), `eye` = cold cyan (visor, cannon coils, pistol cell).
// Rank tiers (legendary default R3): R0 battered, short coat, bare cannon · R1 full coat, rail fins · R2 third shoulder layer,
//   collar fins, cannon shroud · R3 cannon coils + monocle lens + tie pin light up (base) · R4 coat plates gain gold emissive
//   edges, cannon side fins, rim strips · R5 three gold holo-contract panels orbit him (aux1), glowing lapel edges.
// Rig: biped. aux0 (chest) = the cannon boom pivot (pitch/yaw are pose channels so anims blend it); aux2 / aux3 (pelvis) = the
// left / right coat tails, swung in post(); aux1 (re-parented to pelvis) = the R5 contract ring, spun in post().
// Overdrive TERMINATION ORDER: the cannon unfolds (tick widens the rails + extends the barrel), three shots at 0.25/0.32/0.39
// of 2.4 s (the first = the sim's 0.6 s release), the cannon tracks a new target between them, then he straightens his tie.
import { THREE, P, PS, plate, fin, discX, deform, legs, LIB, PI, BI } from '../kit.js';

const L = LIB;
const DIMS = {
  thigh: 0.47, shin: 0.47, ankle: 0.1, hipX: 0.115, hipY: -0.05, spine: 0.13, chest: 0.22, neck: 0.33, headOff: 0.04,
  clavX: 0.07, clavY: 0.22, shoulder: 0.21, upArm: 0.31, foreArm: 0.3,
  parents: { aux1: 'pelvis' },
  aux0: [-0.27, 0.31, -0.15], aux1: [0, 0.62, 0], aux2: [0.12, 0.05, -0.135], aux3: [-0.12, 0.05, -0.135],
};
const STOW = -0.5;          // cannon pitch when stowed (barrel angled up)
const MZ = [0, 0.07, 1.03];  // muzzle in the aux0 frame
const _v = new THREE.Vector3();

// ---------- greebles ----------
function lamp(b, bone, pos, rot, r = 0.025, slot = 'eye', mirror = true) {
  const put = mirror ? b.sym.bind(b) : b.add.bind(b);
  put(b.cyl(r * 1.45, r * 1.45, 0.02, 14), bone, 'metal', pos, rot);
  put(b.cyl(r, r, 0.03, 14), bone, slot, pos, rot);
}
function vent(b, bone, pos, rot, w, h, n = 4, mirror = false) {
  const put = mirror ? b.sym.bind(b) : b.add.bind(b);
  put(b.cbox(w, h, 0.03, 0.008), bone, 'accent', pos, rot);
  if (b.far) return;
  b.scope(pos, rot, 1, () => { for (let i = 0; i < n; i++) put(b.cbox(w * 0.86, h / (n * 2.2), 0.036, 0.003), bone, 'metal', [0, -h / 2 + (i + 0.5) * h / n, 0.01]); });
}
function cylAB(b, p, q, r, seg = 10) {
  const dx = q[0] - p[0], dy = q[1] - p[1], dz = q[2] - p[2], Ln = Math.hypot(dx, dy, dz);
  const g = b.cyl(r, r, Ln, seg);
  g.rotateX(Math.atan2(Math.hypot(dx, dz), dy)); g.rotateY(Math.atan2(dx, dz));
  g.translate((p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2);
  return g;
}
function piston(b, boneA, a0, a1, boneB, b0, b1, r = 0.02) {
  b.sym(cylAB(b, a0, a1, r), boneA, 'metal');
  b.sym(cylAB(b, b0, b1, r * 0.55), boneB, 'trim');
  b.sym(b.cyl(r * 1.3, r * 1.3, 0.025, 10), boneA, 'accent', a1);
}
function rivets(b, bone, slot, pts, r = 0.01) {
  if (b.far) return;
  for (const p of pts) b.sym(b.cyl(r, r, 0.012, 6), bone, slot, p[0], p[1] || [PI / 2, 0, 0]);
}

// ---------- parts ----------
function head(b, o) {
  const rk = o.rank, far = b.far, H = 'head';
  // black skull, narrow white faceplate tapering to a sharp chin, slick swept-back white cranium
  b.add(b.rbox(0.16, 0.19, 0.2, 0.05), H, 'accent', [0, 0.08, 0.0]);
  b.add(plate(b, 0.16, 0.15, 0.07, { c: 0.02, bx: 0.5, bz: 0.8 }), H, 'paint', [0, 0.055, 0.085], [-0.06, 0, 0]);
  P(b, H, 'paint', [0.185, 0.09, 0.25], [0, 0.155, -0.015], [0.12, 0, 0], { c: 0.035, tx: 0.7, tz: 0.85 });
  // slicked-back crest: three swept blades running back over the crown (gold spine)
  b.add(fin(b, [[0.1, 0], [0.13, 0.03], [0.0, 0.07], [-0.2, 0.085], [-0.26, 0.05], [-0.06, 0.01]], 0.05, 0.01), H, 'paint', [0, 0.18, 0.0], [0, -PI / 2, 0]);
  b.add(fin(b, [[0.08, 0.015], [0.1, 0.03], [0.0, 0.065], [-0.2, 0.08], [-0.21, 0.07], [-0.04, 0.04]], 0.056, 0.004), H, 'trim', [0, 0.18, 0.0], [0, -PI / 2, 0]);
  b.sym(fin(b, [[0.06, 0], [0.09, 0.02], [-0.14, 0.06], [-0.2, 0.03]], 0.03, 0.008), H, 'paint', [0.06, 0.16, -0.02], [0.05, -PI / 2 + 0.12, -0.18]);
  if (rk >= 2) b.sym(fin(b, [[0, 0], [0.05, 0.0], [-0.16, 0.07], [-0.19, 0.05]], 0.016, 0.004), H, 'trim', [0.085, 0.13, -0.04], [0.1, -PI / 2 + 0.2, -0.25]);
  // cold cyan visor slit, chin piece, cheek vents
  b.add(b.cbox(0.13, 0.02, 0.03, 0.006), H, 'eye', [0.0, 0.092, 0.122], [0.05, 0, 0]);
  b.add(b.cbox(0.05, 0.03, 0.04, 0.01), H, 'trim', [0, 0.0, 0.11], [0.3, 0, 0]);
  if (!far) for (let i = 0; i < 3; i++) b.sym(b.cbox(0.026, 0.006, 0.02, 0.002), H, 'metal', [0.05, 0.04 - i * 0.012, 0.115]);
  // ear discs
  b.sym(discX(b, 0.04, 0.04, 14), H, 'metal', [0.085, 0.08, -0.01]);
  b.sym(discX(b, 0.026, 0.05, 12), H, 'trim', [0.09, 0.08, -0.01]);
  // GOLD MONOCLE over the right eye: thick gold rim, gold lens light, a hinge arm to the right ear disc, a fine chain
  const mx = -0.042, my = 0.092, mz = 0.14;
  b.add(b.tor(0.034, 0.009, 18, 6), H, 'trim', [mx, my, mz]);
  b.add(b.cyl(0.03, 0.03, 0.012, 16), H, rk >= 3 ? 'glow' : 'eye', [mx, my, mz - 0.004], [PI / 2, 0, 0]);
  b.add(cylAB(b, [mx - 0.03, my + 0.01, mz - 0.01], [-0.095, 0.085, 0.0], 0.006), H, 'trim');
  if (!far) b.add(b.tube([[mx - 0.01, my - 0.03, mz], [-0.07, 0.0, 0.1], [-0.095, -0.03, 0.05], [-0.1, -0.05, 0.0]], 0.004, 10, 4), H, 'trim');
  if (rk >= 4) b.add(b.tor(0.046, 0.004, 18, 4), H, 'glow', [mx, my, mz + 0.004]);
}

function torso(b, o) {
  const rk = o.rank, far = b.far, C = 'chest';
  // frame + black shirt front (V torso: broad shoulders, slim waist)
  P(b, C, 'metal', [0.4, 0.34, 0.26], [0, 0.1, -0.02], [0, 0, 0], { c: 0.04 });
  P(b, C, 'accent', [0.44, 0.36, 0.3], [0, 0.11, 0.0], [0.04, 0, 0], { c: 0.05, tx: 1.15, bx: 0.62, tz: 1.0, bz: 0.82 });
  // tailored jacket: two curved white halves (lathed round the chest, tapering hard to the waist) meeting in a deep V
  // (the V edge is cut by remapping each vertex's angle), lapels hugging the curve, gold piping, black shirt in the V
  const RY = [[-0.09, 0.168], [0.0, 0.19], [0.1, 0.226], [0.2, 0.245], [0.27, 0.238], [0.315, 0.212]];
  const Rof = (y) => { for (let i = 1; i < RY.length; i++) if (y <= RY[i][0] || i === RY.length - 1) { const [y0, r0] = RY[i - 1], [y1, r1] = RY[i]; return r0 + (r1 - r0) * Math.min(1, Math.max(0, (y - y0) / (y1 - y0))); } return 0.2; };
  const ZO = 0.025, ZS = 0.75;
  const zf = (x, y) => ZO + ZS * Math.sqrt(Math.max(0, Rof(y) ** 2 - x * x));
  const xV = (y) => (y < 0.04 ? 0.02 + (y + 0.09) / 0.13 * 0.02 : 0.04 + (y - 0.04) / 0.27 * 0.07);
  const T = 0.04, PL = 1.5;
  const prof = [...RY.map(([y, r]) => [r - T, y]), ...RY.slice().reverse().map(([y, r]) => [r, y])];
  prof.reverse(); prof.push(prof[0]);   // winding: inner edge runs down, outer edge up (faces point outward)
  const jacket = deform(b.lathe(prof, 14, 0, PL), (v) => {
    const r = Math.hypot(v.x, v.z), ph = Math.atan2(v.x, v.z), R = Rof(v.y);
    const p0 = Math.asin(Math.min(0.95, xV(v.y) / R)), np = p0 + (ph / PL) * (PL - p0);
    v.x = Math.sin(np) * r; v.z = Math.cos(np) * r;
  });
  b.sym(jacket, C, 'paint', [0, 0, ZO], [0.08, 0, 0], [1, 1, ZS]);
  const LP = [[0.11, 0.31], [0.17, 0.305], [0.15, 0.2], [0.07, 0.06], [0.04, 0.04]];
  const hug = (g) => deform(g, (v) => { v.z += zf(v.x, v.y) - zf(0, v.y); });
  b.sym(hug(b.ext(LP, 0.026, 0.006)), C, 'paint', [0.0, 0.0, zf(0, 0.2) - 0.012], [0.08, 0, 0]);
  const pipe = (x0, y0, x1, y1, dz, slot = 'trim', w = 0.012) => {
    const l = Math.hypot(x1 - x0, y1 - y0), mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    b.sym(b.cbox(w, l, 0.02, 0.003), C, slot, [mx, my, zf(mx, my) + dz], [0.08, 0, -Math.atan2(x1 - x0, y1 - y0)]);
  };
  pipe(0.02, -0.09, 0.04, 0.04, 0.0); pipe(0.04, 0.04, 0.11, 0.31, 0.012);
  pipe(0.17, 0.305, 0.07, 0.06, 0.008);
  if (rk >= 5) pipe(0.043, 0.05, 0.11, 0.3, 0.02, 'glow', 0.007);
  if (!far) for (const y of [-0.02, 0.04]) b.sym(b.cyl(0.012, 0.012, 0.012, 10), C, 'trim', [0.045, y, zf(0.045, y) + 0.004], [PI / 2 + 0.08, 0, 0]);
  // waist cinch: a black belt band under the jacket hem pulls the silhouette in
  b.add(b.tor(0.165, 0.014, 26, 4), C, 'accent', [0, -0.085, 0.01], [PI / 2 + 0.08, 0, 0], [1.05, 0.82, 1]);
  // breast pocket square (gold) + flank ribs
  if (!far) b.add(b.cbox(0.05, 0.022, 0.02, 0.004), C, 'trim', [0.15, 0.2, zf(0.15, 0.2) + 0.006], [0.08, 0.55, 0.1]);
  PS(b, C, 'paint', [0.05, 0.24, 0.24], [0.24, 0.07, -0.01], [0, 0, 0.12], { c: 0.02, bx: 0.8 });
  if (!far) for (let i = 0; i < 3; i++) PS(b, C, 'trim', [0.054, 0.01, 0.2], [0.247, 0.0 + i * 0.06, -0.01], [0, 0, 0.12]);
  // gold necktie with a knot and a cyan tie pin
  b.add(plate(b, 0.07, 0.24, 0.03, { c: 0.008, bx: 0.55, tx: 0.8 }), C, 'trim', [0, 0.1, 0.205], [0.1, 0, 0]);
  b.add(b.cbox(0.06, 0.045, 0.04, 0.012), C, 'trim', [0, 0.235, 0.2], [0.15, 0, 0]);
  b.add(b.cbox(0.05, 0.012, 0.03, 0.004), C, rk >= 3 ? 'eye' : 'metal', [0, 0.13, 0.225], [0.1, 0, 0]);
  // high black collar standing up behind the neck, gold-edged
  PS(b, C, 'accent', [0.12, 0.16, 0.04], [0.085, 0.31, -0.03], [-0.15, 0.55, 0.12], { c: 0.012, tx: 1.2 });
  PS(b, C, 'trim', [0.12, 0.014, 0.045], [0.085, 0.39, -0.035], [-0.15, 0.55, 0.12]);
  if (rk >= 2) PS(b, C, 'paint', [0.03, 0.12, 0.1], [0.13, 0.36, -0.07], [-0.3, 0.3, 0.3], { c: 0.01, tx: 0.5 });
  // back: black back plate + white spine pack carrying the boom mast
  P(b, C, 'accent', [0.4, 0.3, 0.1], [0, 0.12, -0.17], [0, 0, 0], { c: 0.03, bx: 0.8 });
  P(b, C, 'paint', [0.24, 0.28, 0.12], [-0.02, 0.15, -0.24], [-0.05, 0, 0], { c: 0.03, tx: 0.85 });
  vent(b, C, [-0.02, 0.1, -0.305], [0, PI, 0], 0.16, 0.12, 4);
  b.add(b.cbox(0.2, 0.02, 0.1, 0.005), C, 'trim', [-0.02, 0.29, -0.24]);
  // boom mast: from the pack up to the cannon hinge behind the right shoulder
  b.add(cylAB(b, [-0.08, 0.24, -0.25], [-0.27, 0.3, -0.15], 0.032), C, 'metal');
  b.add(cylAB(b, [-0.06, 0.2, -0.27], [-0.25, 0.27, -0.17], 0.016), C, 'trim');
  b.add(discX(b, 0.055, 0.05, 16), C, 'accent', [-0.24, 0.31, -0.15]);
  b.add(discX(b, 0.035, 0.06, 14), C, 'trim', [-0.24, 0.31, -0.15]);
  // waist: slim black, white belt, gold buckle
  b.add(b.cyl(0.12, 0.14, 0.2, 24), 'spine', 'metal', [0, 0.06, 0]);
  if (!far) for (let i = 0; i < 3; i++) b.add(b.tor(0.125 + i * 0.008, 0.009, 20, 4), 'spine', 'accent', [0, 0.01 + i * 0.05, 0], [PI / 2, 0, 0]);
  P(b, 'spine', 'accent', [0.22, 0.14, 0.1], [0, 0.07, 0.1], [0.05, 0, 0], { c: 0.02, tx: 1.2 });
  P(b, 'pelvis', 'paint', [0.34, 0.07, 0.27], [0, 0.05, 0], [0, 0, 0], { c: 0.02 });
  b.add(b.cbox(0.09, 0.055, 0.04, 0.012), 'pelvis', 'trim', [0, 0.05, 0.145]);
  b.add(b.cyl(0.016, 0.016, 0.02, 10), 'pelvis', 'eye', [0, 0.05, 0.166], [PI / 2, 0, 0]);
  // hips: black, short white side plates, a black front skirt panel
  P(b, 'pelvis', 'metal', [0.3, 0.16, 0.24], [0, -0.03, 0], [0, 0, 0], { c: 0.04 });
  P(b, 'pelvis', 'accent', [0.18, 0.18, 0.05], [0, -0.1, 0.13], [-0.1, 0, 0], { c: 0.02, bx: 0.5 });
  PS(b, 'pelvis', 'accent', [0.05, 0.2, 0.2], [0.18, -0.07, 0.0], [0, 0, 0.16], { c: 0.02, bx: 1.1 });
  PS(b, 'pelvis', 'trim', [0.056, 0.014, 0.21], [0.165, -0.165, 0.0], [0, 0, 0.16]);
  // centre coat vent (static) between the tails
  P(b, 'pelvis', 'accent', [0.12, 0.3, 0.03], [0, -0.15, -0.14], [0.1, 0, 0], { c: 0.01, bx: 0.5 });
}

function shoulders(b, o) {
  const rk = o.rank, far = b.far;
  // sleek tailored pauldrons: a smooth white shell with an upturned gold-piped edge, a black under-layer, a lower lame
  b.sym(b.sph(32, 14, 0, PI * 2, 0, PI * 0.5), 'upArm', 'paint', [0.03, 0.02, 0], [0, 0, -0.32], [0.15, 0.1, 0.17]);
  b.scope([0.03, 0.02, 0], [0, 0, -0.32], 1, () => b.sym(b.tor(0.15, 0.011, 36, 6), 'upArm', 'trim', [0, 0, 0], [PI / 2, 0, 0], [1, 1.13, 1]));
  PS(b, 'upArm', 'accent', [0.2, 0.04, 0.27], [0.08, -0.03, 0], [0, 0, -0.6], { c: 0.015, tx: 0.9 });
  PS(b, 'upArm', 'paint', [0.18, 0.04, 0.25], [0.1, -0.06, 0], [0, 0, -0.75], { c: 0.015, tx: 0.85 });
  PS(b, 'upArm', 'trim', [0.18, 0.012, 0.255], [0.103, -0.083, 0], [0, 0, -0.75]);
  if (rk >= 2) {
    PS(b, 'upArm', 'paint', [0.15, 0.035, 0.22], [0.12, -0.11, 0], [0, 0, -0.9], { c: 0.012, tx: 0.85 });
    PS(b, 'upArm', 'trim', [0.15, 0.01, 0.225], [0.123, -0.13, 0], [0, 0, -0.9]);
  }
  // upturned edge fin along the top (a sharp tailored line from the camera's view)
  b.sym(fin(b, [[-0.12, 0], [0.12, 0], [0.09, 0.035], [-0.1, 0.02]], 0.016, 0.004), 'upArm', 'trim', [0.13, 0.04, 0], [0, PI / 2, -0.9]);
  lamp(b, 'upArm', [0.1, 0.08, 0.13], [1.0, 0, -0.4], 0.014);
  if (rk >= 3 && !far) b.scope([0.03, 0.035, 0], [0, 0, -0.32], 1, () => b.sym(b.tor(0.13, 0.005, 24, 3), 'upArm', 'glow', [0, 0, 0], [PI / 2, 0, 0], [1, 1.13, 1]));
  if (rk >= 4) b.sym(fin(b, [[0, 0], [0.14, 0], [0.03, 0.13], [-0.05, 0.14]], 0.018, 0.005), 'upArm', 'paint', [0.09, 0.07, -0.08], [0, -PI / 2, -0.35]);
}

function armsAndHands(b, o) {
  const D = b.rig.D, ua = D.upArm, fa = D.foreArm, far = b.far, rk = o.rank;
  b.sym(b.cyl(0.045, 0.045, D.shoulder, 12), 'clav', 'metal', [D.shoulder / 2, 0, 0], [0, 0, PI / 2]);
  b.sym(b.sph(14, 10), 'upArm', 'metal', [0, 0, 0], [0, 0, 0], 0.08);
  b.sym(b.cyl(0.055, 0.05, ua, 18), 'upArm', 'accent', [0, -ua / 2, 0]);
  PS(b, 'upArm', 'paint', [0.12, ua * 0.42, 0.13], [0.015, -ua * 0.6, 0.01], [0, 0, 0], { c: 0.022, tx: 1.1, tz: 1.1 });
  PS(b, 'upArm', 'trim', [0.125, 0.016, 0.135], [0.015, -ua * 0.38, 0.01]);
  piston(b, 'upArm', [0, -0.1, -0.075], [0, -ua + 0.05, -0.08], 'foreArm', [0, 0.02, -0.08], [0, -0.1, -0.085], 0.016);
  b.sym(discX(b, 0.058, 0.13, 14), 'foreArm', 'metal', [0, 0, 0]);
  b.sym(b.cyl(0.05, 0.044, fa * 0.9, 18), 'foreArm', 'accent', [0, -fa * 0.5, 0]);
  PS(b, 'foreArm', 'paint', [0.12, fa * 0.6, 0.13], [0.01, -fa * 0.55, 0], [0, 0, 0], { c: 0.025, tx: 1.15, tz: 1.1, bx: 0.85, bz: 0.85 });
  // shirt cuff (black) + gold cufflink at the wrist
  b.sym(b.cyl(0.058, 0.058, 0.04, 14), 'foreArm', 'accent', [0, -fa * 0.9, 0]);
  b.sym(b.cyl(0.06, 0.06, 0.012, 14), 'foreArm', 'trim', [0, -fa * 0.88, 0]);
  if (!far) b.sym(b.cyl(0.013, 0.013, 0.014, 10), 'foreArm', 'trim', [0.06, -fa * 0.92, 0.0], [0, 0, PI / 2]);
  // black gloves, gold knuckle band
  for (const s of ['L', 'R']) {
    b.add(b.rbox(0.075, 0.1, 0.1, 0.02), 'hand' + s, 'accent', [0, -0.055, 0.0]);
    b.add(b.cbox(0.08, 0.018, 0.1, 0.005), 'hand' + s, 'trim', [0, -0.1, 0.0]);
    if (!far) for (let i = 0; i < 3; i++) b.add(b.cbox(0.02, 0.06, 0.022, 0.005), 'hand' + s, 'metal', [0, -0.13, -0.03 + i * 0.03], [0, 0, 0]);
  }
  // WRIST PISTOL on the left forearm: slim white housing, gunmetal barrel along the forearm, gold muzzle ring, cyan cell
  const F = 'foreArmL', x = 0.07;
  b.add(b.rbox(0.05, fa * 0.62, 0.075, 0.018), F, 'paint', [x, -fa * 0.55, 0.02]);
  b.add(b.cbox(0.02, fa * 0.5, 0.05, 0.006), F, 'trim', [x + 0.028, -fa * 0.55, 0.02]);
  b.add(b.cyl(0.018, 0.018, 0.2, 10), F, 'metal', [x, -fa * 0.82, 0.03]);
  b.add(b.cyl(0.024, 0.024, 0.025, 12), F, 'trim', [x, -fa - 0.02, 0.03]);
  b.add(b.cbox(0.014, 0.06, 0.03, 0.004), F, rk >= 3 ? 'eye' : 'metal', [x + 0.03, -fa * 0.4, 0.03]);
  b.add(cylAB(b, [x - 0.01, -fa * 0.25, -0.03], [x - 0.01, -fa * 0.7, -0.035], 0.01), F, 'metal');
}

function cannon(b, o) {
  const rk = o.rank, far = b.far, A = 'aux0';
  // hinge knuckle + cradle arm up to the barrel
  b.add(discX(b, 0.05, 0.1, 16), A, 'metal', [0, 0, 0]);
  b.add(b.cbox(0.06, 0.1, 0.16, 0.015), A, 'accent', [0, 0.035, 0.0]);
  // rear capacitor block (white), gold bands, gold capacitor lights at R3+
  b.add(b.cbox(0.11, 0.11, 0.22, 0.022), A, 'paint', [0, 0.07, -0.16]);
  for (const z of [-0.23, -0.1]) b.add(b.cbox(0.118, 0.118, 0.014, 0.005), A, 'trim', [0, 0.07, z]);
  b.symLocal(b.cbox(0.012, 0.04, 0.08, 0.004), A, rk >= 3 ? 'glow' : 'metal', [0.057, 0.07, -0.165]);
  b.add(b.cyl(0.042, 0.042, 0.02, 14), A, 'accent', [0, 0.07, -0.275], [PI / 2, 0, 0]);
  b.add(b.cyl(0.02, 0.02, 0.024, 14), A, 'eye', [0, 0.07, -0.28], [PI / 2, 0, 0]);
  // main housing (white, tapered), black underside, gold top rail
  b.add(plate(b, 0.15, 0.48, 0.13, { c: 0.025, tx: 0.78, tz: 0.85 }), A, 'paint', [0, 0.07, 0.17], [PI / 2, 0, 0]);
  b.add(b.cbox(0.11, 0.04, 0.44, 0.01), A, 'accent', [0, 0.0, 0.16]);
  b.add(b.cbox(0.03, 0.018, 0.46, 0.006), A, 'trim', [0, 0.14, 0.15]);
  if (!far) for (let i = 0; i < 4; i++) b.symLocal(b.cbox(0.012, 0.05, 0.04, 0.003), A, 'metal', [0.077, 0.07, 0.02 + i * 0.075]);
  // twin rail prongs with cyan coils between them, gold tips
  for (const s of [1, -1]) {
    b.add(b.cbox(0.03, 0.05, 0.6, 0.01), A, 'metal', [s * 0.042, 0.07, 0.66]);
    b.add(b.cbox(0.012, 0.03, 0.58, 0.004), A, 'trim', [s * 0.06, 0.07, 0.66]);
    b.add(plate(b, 0.034, 0.1, 0.054, { c: 0.008, tx: 0.4 }), A, 'trim', [s * 0.042, 0.07, 1.0], [PI / 2, 0, 0]);
  }
  const coils = far ? 3 : 5;
  for (let i = 0; i < coils; i++) b.add(b.tor(0.028, 0.007, 20, 8), A, rk >= 3 ? 'eye' : 'metal', [0, 0.07, 0.44 + i * (0.5 / (coils - 1))]);
  // scope with a gold objective
  b.add(b.cyl(0.024, 0.024, 0.2, 12), A, 'accent', [0.0, 0.18, 0.12], [PI / 2, 0, 0]);
  b.add(b.cyl(0.028, 0.028, 0.02, 12), A, 'trim', [0.0, 0.18, 0.23], [PI / 2, 0, 0]);
  b.add(b.cbox(0.02, 0.04, 0.03, 0.005), A, 'metal', [0, 0.155, 0.12]);
  if (rk >= 1) b.symLocal(fin(b, [[0, 0], [0.22, 0], [0.16, 0.05], [0.0, 0.04]], 0.012, 0.003), A, 'paint', [0.074, 0.03, 0.1], [0, -PI / 2, 0]);
  if (rk >= 2) b.add(b.cbox(0.13, 0.03, 0.3, 0.008), A, 'paint', [0, 0.128, 0.6]);
  if (rk >= 4) {
    b.symLocal(fin(b, [[0, 0], [0.34, 0], [0.26, 0.09], [0.0, 0.05]], 0.012, 0.003), A, 'trim', [0.09, 0.09, 0.18], [0, -PI / 2, -0.25]);
    b.symLocal(b.cbox(0.008, 0.008, 0.3, 0.002), A, 'glow', [0.098, 0.12, 0.33], [0, 0, -0.25]);
  }
}

function coatTail(b, o, bone, s) {
  const rk = o.rank, far = b.far, len = rk === 0 ? 0.42 : 0.64;
  b.add(b.cbox(0.17, 0.05, 0.05, 0.012), bone, 'accent', [s * 0.02, 0.0, 0.0]);
  // black liner, white outer plate, a shorter layered plate, gold outer piping
  b.add(plate(b, 0.19, len, 0.024, { c: 0.008, bx: 0.42 }), bone, 'accent', [s * 0.025, -len / 2, -0.01]);
  b.add(plate(b, 0.165, len * 0.9, 0.026, { c: 0.01, bx: 0.4 }), bone, 'paint', [s * 0.03, -len * 0.45 - 0.01, -0.028]);
  b.add(plate(b, 0.12, len * 0.5, 0.028, { c: 0.01, bx: 0.6 }), bone, 'paint', [s * 0.035, -len * 0.25, -0.05]);
  b.add(b.cbox(0.13, 0.012, 0.03, 0.004), bone, 'trim', [s * 0.035, -len * 0.5 + 0.0, -0.05]);
  const ex = (x0, y0, x1, y1, slot, z, w = 0.012) => {
    const l = Math.hypot(x1 - x0, y1 - y0);
    b.add(b.cbox(w, l, w * 1.6, 0.003), bone, slot, [(x0 + x1) / 2, (y0 + y1) / 2, z], [0, 0, -Math.atan2(x1 - x0, y1 - y0)]);
  };
  // outer edge (piping) from the top corner to the tail point
  ex(s * 0.11, -0.02, s * 0.03 + s * 0.035, -len * 0.9, 'trim', -0.03);
  if (rk >= 4) {
    ex(s * 0.118, -0.03, s * 0.07, -len * 0.92, 'glow', -0.042, 0.009);
    ex(s * -0.05, -0.03, s * 0.0, -len * 0.92, 'glow', -0.042, 0.009);
  }
  if (!far) for (const y of [-0.03, -0.12]) b.add(b.cyl(0.011, 0.011, 0.012, 8), bone, 'trim', [s * 0.07, y, -0.044], [PI / 2, 0, 0]);
}

// long tailored legs: white thigh + shin guards over a black under-suit, gold piping, knee pistons, black pointed shoes
function slimLegs(b, o) {
  const D = b.rig.D, th = D.thigh, sh = D.shin, far = b.far, rk = o.rank;
  b.sym(b.sph(14, 10), 'thigh', 'metal', [0, 0, 0], [0, 0, 0], 0.085);
  b.sym(b.cyl(0.065, 0.05, th, 18), 'thigh', 'accent', [0, -th / 2, 0]);
  PS(b, 'thigh', 'paint', [0.15, th * 0.74, 0.15], [0.01, -th * 0.44, 0.02], [0, 0, 0.03], { c: 0.03, tx: 1.1, tz: 1.1, bx: 0.78, bz: 0.8 });
  PS(b, 'thigh', 'trim', [0.012, th * 0.6, 0.02], [0.08, -th * 0.44, 0.07], [0, 0, 0.03]);
  PS(b, 'thigh', 'accent', [0.04, th * 0.5, 0.13], [0.085, -th * 0.42, -0.01], [0, 0, 0.05], { c: 0.01 });
  PS(b, 'thigh', 'trim', [0.13, 0.016, 0.16], [0.01, -th * 0.1, 0.02]);
  piston(b, 'thigh', [0, -0.12, -0.075], [0, -th + 0.06, -0.08], 'shin', [0, 0.0, -0.08], [0, -0.16, -0.08], 0.017);
  b.sym(discX(b, 0.058, 0.14, 14), 'shin', 'metal', [0, 0, 0]);
  PS(b, 'shin', 'paint', [0.11, 0.13, 0.06], [0, 0.02, 0.075], [-0.3, 0, 0], { c: 0.02, tx: 0.7 });
  b.sym(b.cyl(0.016, 0.016, 0.02, 10), 'shin', 'trim', [0, 0.03, 0.11], [PI / 2 - 0.3, 0, 0]);
  b.sym(b.cyl(0.058, 0.045, sh * 0.92, 18), 'shin', 'accent', [0, -sh * 0.5, -0.005]);
  PS(b, 'shin', 'paint', [0.11, sh * 0.66, 0.06], [0, -sh * 0.42, 0.05], [0.06, 0, 0], { c: 0.02, tx: 1.15, bx: 0.7 });
  PS(b, 'shin', 'trim', [0.014, sh * 0.6, 0.02], [0, -sh * 0.42, 0.083], [0.06, 0, 0]);
  PS(b, 'shin', 'paint', [0.035, sh * 0.5, 0.1], [0.06, -sh * 0.45, -0.01], [0, 0, 0.04], { c: 0.01 });
  if (rk >= 3) PS(b, 'shin', 'glow', [0.008, sh * 0.36, 0.008], [0.08, -sh * 0.45, 0.035], [0, 0, 0.04]);
  lamp(b, 'shin', [0.055, -0.1, 0.06], [PI / 2 - 0.1, 0, 0.5], 0.012);
  // ankle + pointed black dress shoe with a gold toe cap and heel
  b.sym(b.sph(10, 8), 'foot', 'metal', [0, 0, 0], [0, 0, 0], 0.05);
  const y = -D.ankle + 0.035;
  PS(b, 'foot', 'accent', [0.1, 0.07, 0.3], [0, y, 0.07], [0, 0, 0], { c: 0.02, tz: 0.7, tx: 0.8 });
  b.sym(fin(b, [[-0.045, 0], [0.045, 0], [0.0, 0.1]], 0.05, 0.012), 'foot', 'accent', [0, y - 0.01, 0.21], [PI / 2, 0, 0]);
  b.sym(fin(b, [[-0.03, 0], [0.03, 0], [0.0, 0.07]], 0.03, 0.006), 'foot', 'trim', [0, y + 0.015, 0.235], [PI / 2 - 0.12, 0, 0]);
  PS(b, 'foot', 'trim', [0.08, 0.05, 0.05], [0, y - 0.005, -0.075], [0, 0, 0], { c: 0.012 });
  PS(b, 'foot', 'paint', [0.1, 0.05, 0.12], [0, y + 0.05, 0.04], [0.15, 0, 0], { c: 0.015, tx: 0.8 });
  if (rk >= 4) b.sym(b.cbox(0.008, th * 0.5, 0.008, 0.002), 'thigh', 'glow', [0.083, -th * 0.44, 0.08]);
}

function contracts(b, o) {
  // R5: three gold holo-contract panels orbiting at chest height (aux1 spins); frame + seal + text lines
  const A = 'aux1', R = 0.66;
  for (let i = 0; i < 3; i++) {
    const a = i * 2 * PI / 3;
    b.scope([Math.sin(a) * R, Math.sin(i * 1.7) * 0.06, Math.cos(a) * R], [0, a, 0.08], 1, () => {
      const w = 0.24, h = 0.32;
      for (const [x, y, ww, hh] of [[0, h / 2, w, 0.012], [0, -h / 2, w, 0.012], [w / 2, 0, 0.012, h], [-w / 2, 0, 0.012, h]]) b.add(b.box(ww, hh, 0.008), A, 'glow', [x, y, 0]);
      for (let k = 0; k < 4; k++) b.add(b.box(w * (k === 3 ? 0.4 : 0.7), 0.008, 0.006), A, 'eye', [k === 3 ? -0.03 : -0.0, h * 0.3 - k * 0.055, 0]);
      b.add(b.cyl(0.032, 0.032, 0.008, 14), A, 'glow', [0.06, -h * 0.32, 0], [PI / 2, 0, 0]);
    });
  }
  b.add(b.tor(R, 0.006, 48, 4), A, 'trim', [0, -0.18, 0], [PI / 2, 0, 0]);
}

// detail pass (legendary density): heat-sink fins on the cannon, gauntlet plates, back armour, tassets, rivets
function detail(b, o) {
  const far = b.far, D = b.rig.D, A = 'aux0', fa = D.foreArm;
  if (!far) for (let i = 0; i < 7; i++) b.symLocal(b.cbox(0.05, 0.09, 0.014, 0.004), A, 'metal', [0.085, 0.07, -0.04 + i * 0.045]);
  b.add(b.cyl(0.04, 0.04, 0.08, 16), A, 'trim', [0, 0.07, 0.97], [PI / 2, 0, 0]);
  b.add(b.cyl(0.026, 0.026, 0.09, 16), A, 'accent', [0, 0.07, 0.99], [PI / 2, 0, 0]);
  if (!far) b.add(b.tube([[0, 0.02, -0.25], [0.0, -0.06, -0.1], [-0.05, -0.04, 0.05], [-0.04, 0.0, 0.18]], 0.012, 12, 6), A, 'metal');
  // gauntlet top plates + knuckle guards
  PS(b, 'foreArm', 'trim', [0.06, fa * 0.3, 0.02], [0.02, -fa * 0.6, 0.07], [0, 0, 0], { c: 0.006 });
  PS(b, 'hand', 'paint', [0.08, 0.05, 0.04], [0, -0.05, 0.05], [0.2, 0, 0], { c: 0.01 });
  // back armour: shoulder-blade plates + spine segments
  PS(b, 'chest', 'paint', [0.16, 0.16, 0.05], [0.13, 0.17, -0.2], [-0.15, -0.3, 0], { c: 0.02, tx: 0.8 });
  if (!far) for (let i = 0; i < 4; i++) P(b, 'chest', 'metal', [0.08, 0.025, 0.04], [0.02, 0.0 + i * 0.05, -0.31]);
  // front tassets over the hips
  PS(b, 'thigh', 'paint', [0.13, 0.12, 0.04], [0.02, -0.02, 0.12], [-0.15, 0, 0.06], { c: 0.015, bx: 1.1 });
  PS(b, 'thigh', 'trim', [0.13, 0.012, 0.045], [0.02, -0.08, 0.125], [-0.15, 0, 0.06]);
  rivets(b, 'chest', 'trim', [[[0.2, 0.26, 0.17]], [[0.21, 0.12, 0.18]], [[0.18, -0.04, 0.17]]]);
  rivets(b, 'upArm', 'trim', [[[0.12, 0.02, 0.12]], [[0.15, -0.04, 0.08]]]);
  b.sym(b.cyl(0.03, 0.03, 0.04, 14), 'shin', 'metal', [0, -D.shin + 0.02, -0.06], [PI / 2, 0, 0]);
}

function build(b, o) {
  detail(b, o);
  b.scope([0, 0.0, 0.01], [0, 0, 0], 1.22, () => head(b, o));
  torso(b, o);
  shoulders(b, o);
  armsAndHands(b, o);
  cannon(b, o);
  coatTail(b, o, 'aux2', 1);
  coatTail(b, o, 'aux3', -1);
  slimLegs(b, o);
  if (o.rank >= 5) contracts(b, o);
}

// ---------- pose helpers ----------
// executive stance: chin up, right hand folded behind the back, left arm (pistol) relaxed at the side, cannon stowed
const HB = [-0.06, 1.1, -0.2];
function stance(P, ctx, t, behind = 1) {
  L.idle(P, ctx, t);
  const br = Math.sin(t * 1.5);
  L.A(P, 'chest', -0.05, 0, 0); L.A(P, 'spine', -0.02, 0, 0);
  L.A(P, 'neck', -0.03, 0, 0); L.A(P, 'head', -0.08, 0, 0);
  L.RS(P, 'upArm', 'L', 0.0 + br * 0.015, 0.0, 0.12);
  L.RS(P, 'foreArm', 'L', -0.3, 0.1, 0);
  L.RS(P, 'hand', 'L', -0.1, 0, 0.05);
  if (behind > 0) {
    const s = new Float32Array(9), I = ['upArmR', 'foreArmR', 'handR'].map((n) => BI[n] * 3);
    I.forEach((i, j) => { s[j * 3] = P[i]; s[j * 3 + 1] = P[i + 1]; s[j * 3 + 2] = P[i + 2]; });
    L.armIK(P, ctx, 'R', _v.set(HB[0], HB[1] + br * 0.005, HB[2]), 0.9);
    L.R(P, 'handR', 0.3, 0.6, 0);
    if (behind < 1) I.forEach((i, j) => { for (let c = 0; c < 3; c++) P[i + c] = s[j * 3 + c] + (P[i + c] - s[j * 3 + c]) * behind; });
  } else {
    L.RS(P, 'upArm', 'R', 0.05, 0, 0.12); L.RS(P, 'foreArm', 'R', -0.3, 0, 0);
  }
  L.R(P, 'aux0', STOW + br * 0.01, 0, 0);
  L.plant(P, ctx, 0.08, -0.07, 0.95);
}
const yawSum = (P) => P[BI.pelvis * 3 + 1] + P[BI.spine * 3 + 1] + P[BI.chest * 3 + 1];
const pitchSum = (P) => P[BI.pelvis * 3] + P[BI.spine * 3] + P[BI.chest * 3];
// level the cannon toward root-space forward (k = 0 stowed .. 1 aimed), + extra yaw / pitch
function aimCannon(P, k, yaw = 0, pitch = 0) {
  L.R(P, 'aux0', L.lerp(STOW, -pitchSum(P) + 0.02 + pitch, k), L.lerp(0, -yawSum(P) + yaw, k), 0);
}
function armToward(P, ctx, side, tgt, w = 1, out = 0.3) {
  const I = ['upArm', 'foreArm', 'hand'].map((n) => BI[n + side] * 3), s = I.map((i) => [P[i], P[i + 1], P[i + 2]]);
  L.armIK(P, ctx, side, _v.set(tgt[0], tgt[1], tgt[2]), out);
  if (w < 1) I.forEach((i, j) => { for (let c = 0; c < 3; c++) P[i + c] = s[j][c] + (P[i + c] - s[j][c]) * w; });
}
const kv = (u, keys) => [0, 1, 2].map((c) => L.kf(u, keys.map((k) => [k[0], k[1][c]])));

const anims = {
  idle(P, t, ctx) {
    stance(P, ctx, t);
    // every ~9 s: straightens his tie with the left hand, a small chin lift
    const c = t % 9, w = L.kf(c, [[0, 0], [6.0, 0], [6.5, 1], [7.4, 1], [7.9, 0]]);
    if (w > 0.001) {
      armToward(P, ctx, 'L', [0.03, 1.58 + 0.02 * Math.sin(t * 9) * w, 0.27], w, 0.5);
      L.A(P, 'handL', -0.4 * w, 0, 0.5 * w);
      L.A(P, 'head', -0.08 * w, -0.1 * w, 0);
    }
  },
  advance(P, t, ctx) {
    L.gait(P, ctx);
    L.A(P, 'chest', -0.06, 0, 0); L.A(P, 'head', -0.06, 0, 0);
    L.RS(P, 'upArm', 'L', 0.05 + 0.25 * Math.sin(ctx.move.phase * PI * 2), 0, 0.12);
    L.RS(P, 'foreArm', 'L', -0.35, 0, 0);
    armToward(P, ctx, 'R', HB, 1, 0.9); L.R(P, 'handR', 0.3, 0.6, 0);
    L.R(P, 'aux0', STOW - 0.05, 0, 0);
  },
  // RAILCANNON: cannon swings level, left hand points the target out, one heavy shot (fire 0.32 = 0.3 s), recoil, re-stow
  attack(P, u, ctx) {
    stance(P, ctx, ctx.t);
    const aim = L.kf(u, [[0, 0], [0.24, 1], [0.7, 1], [0.95, 0]]);
    const kick = L.kf(u, [[0, 0], [0.31, 0], [0.35, 1], [0.6, 0.15], [1, 0]]);
    const pt = L.kf(u, [[0, 0], [0.2, 1], [0.6, 1], [0.85, 0]]);
    L.A(P, 'pelvis', 0, 0.12 * aim, 0); L.A(P, 'chest', -0.04 * aim - 0.07 * kick, 0.1 * aim, 0);
    L.A(P, 'head', 0.06 * aim, -0.2 * aim, 0);
    P[L.PX + 2] -= 0.07 * kick;
    armToward(P, ctx, 'L', [0.2, 1.5, 0.62], pt, 0.35);
    aimCannon(P, aim, 0, -0.25 * kick);
    L.plant(P, ctx, 0.12 + 0.06 * aim, -0.12 - 0.05 * aim, 1.15);
  },
  // WRIST PISTOL: side-on duelist stance, arm snaps out straight, a double tap (fire 0.3 / 0.42)
  attack_alt(P, u, ctx) {
    stance(P, ctx, ctx.t);
    const k = L.kf(u, [[0, 0], [0.22, 1], [0.72, 1], [1, 0]]);
    const tap = L.kf(u, [[0, 0], [0.29, 0], [0.32, 1], [0.38, 0], [0.41, 0], [0.44, 1], [0.52, 0], [1, 0]]);
    L.A(P, 'pelvis', 0, -0.45 * k, 0); L.A(P, 'spine', 0, -0.15 * k, 0); L.A(P, 'chest', 0.0, -0.1 * k, 0);
    L.A(P, 'neck', 0, 0.3 * k, 0); L.A(P, 'head', 0, 0.35 * k, 0);
    armToward(P, ctx, 'L', [0.06, 1.6 + 0.06 * tap, 0.72], k, 0.2);
    L.A(P, 'upArmL', -0.12 * tap, 0, 0);
    L.A(P, 'handL', 0.25 * k, 0, 0);
    L.R(P, 'aux0', STOW, -yawSum(P) * 0.3, 0);
    L.plant(P, ctx, 0.14 * k + 0.06, -0.08 - 0.08 * k, 1.2);
  },
  // MARKET SCAN: taps the monocle, head tilts, a scan sweep (cast 0.5)
  cast(P, u, ctx) {
    stance(P, ctx, ctx.t);
    const k = L.kf(u, [[0, 0], [0.3, 1], [0.8, 1], [1, 0]]), sw = L.kf(u, [[0, 0], [0.35, 0], [0.5, 1], [0.75, -1], [0.9, 0]]);
    armToward(P, ctx, 'L', [-0.02, 1.88, 0.22], k, 0.6);
    L.A(P, 'handL', -0.6 * k, 0, 0.8 * k);
    L.A(P, 'neck', -0.05 * k, 0.25 * sw, 0); L.A(P, 'head', -0.05 * k, 0.25 * sw, 0.12 * k);
    L.A(P, 'chest', -0.05 * k, 0.08 * sw, 0);
    aimCannon(P, 0.35 * k, 0.2 * sw, 0);
  },
  // TERMINATION ORDER: plant wide, the cannon unfolds level, left arm signs the order (points), three shots tracking three
  // targets (fire 0.25 / 0.32 / 0.39), then he straightens his tie as the cannon folds away
  overdrive(P, u, ctx) {
    stance(P, ctx, ctx.t, L.kf(u, [[0, 1], [0.12, 0], [0.62, 0], [0.7, 0]]));
    const k = L.kf(u, [[0, 0], [0.14, 1], [0.6, 1], [0.78, 0]]);
    const crouch = L.kf(u, [[0, 0], [0.12, 1], [0.6, 1], [0.8, 0]]);
    const kick = (c) => L.kf(u, [[0, 0], [c - 0.004, 0], [c + 0.012, 1], [c + 0.05, 0.1], [1, 0]]);
    const kk = kick(0.25) + kick(0.32) + kick(0.39);
    const yaw = L.kf(u, [[0, 0], [0.2, 0], [0.25, 0.22], [0.29, 0.22], [0.32, -0.05], [0.36, -0.05], [0.39, -0.24], [0.5, -0.24], [0.62, 0]]);
    L.pel(P, 0, P[L.PX + 1] - 0.14 * crouch, P[L.PX + 2] - 0.05 * kk);
    L.A(P, 'pelvis', -0.05 * crouch, 0.15 * k, 0); L.A(P, 'spine', 0.08 * crouch, 0.05 * k, 0);
    L.A(P, 'chest', -0.06 * k - 0.08 * kk, 0.1 * k + yaw * 0.3, 0);
    L.A(P, 'head', 0.06 * k, -0.25 * k + yaw * 0.5, 0);
    // left arm: points at each target in turn
    armToward(P, ctx, 'L', [0.22 + yaw * 0.9, 1.52, 0.6], k, 0.3);
    L.A(P, 'handL', 0.3 * k, 0, 0);
    // right arm: braces the boom over the shoulder while firing, then straightens the tie
    const tie = L.kf(u, [[0, 0], [0.7, 0], [0.78, 1], [0.92, 1], [1, 0]]);
    armToward(P, ctx, 'R', [-0.28, 1.84, 0.02], L.kf(u, [[0, 0], [0.12, 1], [0.6, 1], [0.7, 0]]), 0.9);
    if (tie > 0.001) { armToward(P, ctx, 'R', [-0.02, 1.6 + 0.02 * Math.sin(u * 60), 0.26], tie, 0.5); L.A(P, 'handR', -0.4 * tie, 0, -0.5 * tie); L.A(P, 'head', -0.12 * tie, 0, 0); }
    aimCannon(P, k, yaw, -0.22 * kk);
    L.plant(P, ctx, 0.24 * crouch + 0.08, -0.07 - 0.22 * crouch, 1 + 0.5 * crouch, 0, 0.15 * crouch);
  },
  hit(P, u, ctx) {
    stance(P, ctx, ctx.t);
    const k = L.kf(u, [[0, 0], [0.12, 1], [0.45, 0.4], [1, 0]]), d = ctx.st.hitDir;
    P[L.PX + 2] -= 0.07 * k; P[L.PX + 1] -= 0.03 * k;
    L.A(P, 'pelvis', -0.04 * k, 0.08 * k * d, 0);
    L.A(P, 'spine', -0.12 * k, 0.1 * k * d, 0.05 * k * d); L.A(P, 'chest', -0.16 * k, 0.12 * k * d, 0.04 * k * d);
    L.A(P, 'head', -0.3 * k, -0.15 * k * d, 0.15 * k * d);
    L.A(P, 'upArmL', -0.2 * k, 0, 0.25 * k);
    L.A(P, 'aux0', 0.25 * k, 0.1 * k * d, 0);
    ctx.coatAdd = 0.35 * k;
    L.plant(P, ctx, 0.1, -0.12, 1.1);
  },
  // knees buckle, the monocle head drops, he topples forward; the cannon droops on its boom
  die(P, u, ctx) {
    L.dieB(P, u, ctx);
    const k = L.kf(u, [[0, 0], [0.3, 1]]);
    L.R(P, 'aux0', L.lerp(STOW, 0.55, L.kf(u, [[0, 0], [0.5, 0.4], [0.85, 1]])), 0.2 * k, 0);
    ctx.coatAdd = 0.4 * L.kf(u, [[0.4, 0], [0.75, 1], [1, 0.3]]);
  },
  // lands in a crouch, coat flared, rises, the cannon snaps up into its stowed angle, a cuff adjust (land 0.4, ready 0.85)
  deploy(P, u, ctx) {
    stance(P, ctx, ctx.t, L.kf(u, [[0, 0], [0.75, 0], [0.95, 1]]));
    const land = L.kf(u, [[0, 0.3], [0.32, 0.4], [0.4, 1], [0.6, 0.8], [0.85, 0], [1, 0]]);
    P[L.PX + 1] -= 0.32 * land; P[L.PX + 2] += 0.04 * land;
    L.A(P, 'spine', 0.3 * land, 0, 0); L.A(P, 'chest', 0.12 * land, 0, 0);
    L.A(P, 'head', L.kf(u, [[0, 0.35], [0.6, 0.4], [0.74, -0.2], [0.9, -0.05], [1, 0]]), 0, 0);
    for (const s of ['L', 'R']) L.AS(P, 'upArm', s, -0.2 * land, 0, 0.5 * land);
    const cuff = L.kf(u, [[0, 0], [0.72, 0], [0.82, 1], [0.95, 1], [1, 0]]);
    if (cuff > 0.001) armToward(P, ctx, 'R', [0.12, 1.3, 0.26], cuff, 0.4);
    L.R(P, 'aux0', L.kf(u, [[0, 0.6], [0.6, 0.6], [0.78, STOW - 0.15], [0.88, STOW]]), 0, 0);
    ctx.coatAdd = 0.9 * L.kf(u, [[0, 1], [0.36, 1], [0.45, 0.2], [1, 0]]);
    L.plant(P, ctx, 0.2 * land + 0.06, -0.24 * land - 0.06, 1 + 0.4 * land, 0, 0.6 * land);
  },
  // a slow courtly bow, hand to the heart; the cannon rises to a salute
  victory(P, t, ctx) {
    stance(P, ctx, t, 0);
    const k = L.smooth(Math.min(1, t / 0.6)), c = t % 4, bow = L.kf(c, [[0, 0], [0.8, 0], [1.4, 1], [2.4, 1], [3.2, 0]]) * k;
    L.A(P, 'spine', 0.18 * bow, 0, 0); L.A(P, 'chest', 0.12 * bow, 0, 0); L.A(P, 'head', 0.2 * bow - 0.1 * k, 0, 0);
    armToward(P, ctx, 'R', [0.04, 1.5 - 0.06 * bow, 0.26 + 0.05 * bow], k, 0.4);
    L.A(P, 'handR', -0.2 * k, 0, -0.6 * k);
    L.RS(P, 'upArm', 'L', -0.2 * k - 0.4 * bow, 0, 0.55 * k + 0.2 * bow);
    L.RS(P, 'foreArm', 'L', -0.4 * k, 0, 0);
    L.R(P, 'aux0', STOW - 0.55 * k + 0.25 * bow, 0, 0);
    L.plant(P, ctx, 0.12, -0.12 - 0.1 * bow, 1);
  },
};
// one-shots record their name + normalised time for tick()
for (const n of ['attack', 'attack_alt', 'cast', 'overdrive', 'hit', 'die', 'deploy']) {
  const f = anims[n];
  anims[n] = (P, u, ctx, Lb) => { ctx.an = n; ctx.au = u; f(P, u, ctx, Lb); };
}

export default {
  id: 'executor', name: 'EXECUTOR', role: 'archer', faction: 'corporate', rarity: 'legendary', realm: 'scifi',
  rig: 'biped', dims: DIMS, height: 1.98, radius: 0.55, walkSpeed: 1.25, cadence: 0.85, scheme: 'light',
  style: { weapon: 'none', heavy: 0, stance: 1.0 },
  // pearl white / black / gold in every tint; the faction colour stays in the seams + eye lights
  mats: {
    all: {
      paint: { color: 0xe9ecf1, metal: 0.25, rough: 0.22, coat: 1, coatRough: 0.04, env: 1.0, panel: { scale: 4.2, groove: 0.4, vary: 0.05 } },
      accent: { color: 0x0c0c10, metal: 0.3, rough: 0.3, coat: 1, env: 0.55, panel: { rim: 0.3, rimColor: 0x2a1c06 } },
      metal: { color: 0x4a505a },
      trim: { color: 0xf2b640, metal: 0.85, rough: 0.2, coat: 0.8, emissive: 0x2a1600, ei: 1 },
      glow: { color: 0xffc04a, ei: 3.2 },
    },
    corporate: { eye: { color: 0x7ae8ff } },
  },
  sockets: { muzzle: ['aux0', MZ], pistol: ['foreArmL', [0.07, -0.34, 0.03]], monocle: ['head', [-0.046, 0.1, 0.16]], core: [0, 0.12, 0.22], head: [0, 0.1, 0.14], hand: ['handR', [0, -0.08, 0]] },
  events: {
    attack: [['fire', 0.32]], attack_alt: [['fire', 0.3], ['fire', 0.42]], cast: [['cast', 0.5]],
    overdrive: [['cast', 0.04], ['fire', 0.25], ['fire', 0.32], ['fire', 0.39]], die: [['down', 0.82]], deploy: [['land', 0.4], ['ready', 0.85]], hit: [],
  },
  durs: { attack: 0.95, attack_alt: 1.0, cast: 1.2, overdrive: 2.4, hit: 0.45, die: 2.0, deploy: 1.6 },
  fxHints: { projectile: 'rail', muzzleColor: 0x7ae8ff, color: 0xffc04a, overdrive: 'termination_order' },
  anims,
  post(P, ctx, act) {
    const t = ctx.t, mv = Math.min(1, ctx.move.v / 1.2), an = act && act.name;
    // coat tails hang from the pelvis: cancel its pitch, flare with speed, flutter, kick on actions
    let sway = 0.1 + 0.03 * Math.sin(t * 1.7) + 0.5 * mv + (ctx.coatAdd || 0);
    if (an === 'overdrive') sway += 0.25 * L.kf(ctx.au || 0, [[0, 0], [0.25, 1], [0.45, 0.6], [0.7, 0]]);
    if (an === 'attack') sway += 0.15 * L.kf(ctx.au || 0, [[0.3, 0], [0.36, 1], [0.7, 0]]);
    ctx.coatAdd = 0;
    const pp = P[BI.pelvis * 3];
    for (const [bone, s, ph] of [['aux2', 1, 0], ['aux3', -1, 1.1]]) {
      const i = BI[bone] * 3;
      P[i] = sway - pp * 0.9 + 0.04 * Math.sin(t * 2.3 + ph) * (0.3 + mv);
      P[i + 1] = 0.05 * Math.sin(t * 1.9 + ph) * mv;
      P[i + 2] = s * (0.06 + 0.12 * mv + 0.02 * Math.sin(t * 1.3 + ph));
    }
    // R5 contract ring orbits
    P[BI.aux1 * 3 + 1] = t * 0.5; P[BI.aux1 * 3] = -pp;
  },
  // Termination Order: the cannon unfolds (rails widen, barrel extends)
  tick(unit, dt, ctx, bones) {
    const od = unit.state.action === 'overdrive' && ctx.an === 'overdrive';
    const target = od ? L.kf(ctx.au || 0, [[0, 0], [0.04, 0], [0.16, 1], [0.6, 1], [0.74, 0]]) : 0;
    ctx.unf = (ctx.unf || 0) + (target - (ctx.unf || 0)) * (1 - Math.exp(-dt * 12));
    const k = ctx.unf;
    bones[BI.aux0].scale.set(1 + 0.45 * k, 1 + 0.2 * k, 1 + 0.32 * k);
    const o = ctx.rig.off.aux0;
    bones[BI.aux0].position.set(o[0] - 0.04 * k, o[1] + 0.12 * k, o[2] + 0.03 * k);
    if (!unit.state.action) ctx.an = null;
  },
  build,
};
