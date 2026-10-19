// SERAPH, experimental legendary archer "Choir Engine" (sculptor-14). Brief: docs/ROSTER.md `seraph`. Also map 5's boss THE CHOIR
// (boss_the_choir: battle passes rank 5, x1.35, red ring).
// Floating angel: faceless pearl mask under a tilted gold halo, slim gold cuirass with a violet resonance core, a robe of gold organ
// pipes instead of legs (their mouths sing violet), and four fans of hardlight blade-feathers swept back so the side-on battle
// camera sees their faces. Weapon: a gold lyre-bow (left hand); the right hand draws a lance of light out of it.
// VALUE: `paint` = polished gold (halo, spars, cuirass, pipes), `accent` = pearl ceramic (feathers, mask, gauntlets),
// `metal` = black-violet glass undersuit (waist, arms, pipe mouths, feather cores below R3), `trim` = platinum markers,
// `glow` = faction light (core, pipe mouths, halo inner ring), `glow2` = white-violet hardlight (feather cores R3+, lance, strings).
// Rank tiers (legendary default R3): R0 battered: lower wings snapped to stubs, broken halo arc, dull pipes · R1 four wings, short
//   fans, plain halo · R2 full fans, second pipe ring, pauldron crest fins · R3 hardlight feather cores, singing pipe mouths, halo
//   light ring (base) · R4 wings gain hardlight edge blades (longer silhouette), second halo ring, back organ glows · R5 = THE CHOIR:
//   six wings (crown pair arching over the halo), a sunburst crown of pipes on the halo, violet glass shards orbiting it, and
//   Novaline's broken shackles hanging from the wrists (the boss is still chained; a player's R5 has broken free).
// Rig: hover. The legs are the wings: thigh = upper wing, shin = lower wing, foot = crown wing (R5). All three joints sit at the
// same point on the upper back (thigh/shin lengths 0, thighs moved up with dims.offsets), so each child bone is just the next
// wing's angle relative to the previous one; `wings()` writes them. aux1 (head) = halo, aux2 (handR) = the light lance, aimed
// at runtime by `aimLance()` in post() and grown/hidden in tick(); aux3 (aux0) = the R5 shard orbit.
import { THREE, P, PS, plate, fin, discX, poseFrame, makeRig, LIB, PI, BI } from '../kit.js';

const L = LIB;
const SIDES = ['L', 'R'];
const WING_ROOT = [0.1, 0.5, -0.2];
const DIMS = {
  hover: 1.0, thigh: 0, shin: 0, ankle: 0, hipX: 0.1, hipY: 0, spine: 0.13, chest: 0.24, neck: 0.24, headOff: 0.04,
  clavX: 0.06, clavY: 0.2, shoulder: 0.15, upArm: 0.29, foreArm: 0.28,
  offsets: { thighL: WING_ROOT, shinL: [0, 0, 0], footL: [0, 0, 0] },
  aux0: [0, 0.14, -0.15],
  parents: { aux1: 'head', aux2: 'handR', aux3: 'aux0' },
  aux1: [0, 0.3, -0.07], aux2: [0, -0.08, 0.02], aux3: [0, 0.62, -0.1],
};
const LANCE = 1.05;

// ---------- frames ----------
const _m4 = new THREE.Matrix4(), _eu = new THREE.Euler();
const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
// Euler XYZ mapping local +Y -> dir and local +Z -> nrm (orthogonalised)
function frame(dir, nrm) {
  const y = V(dir).normalize(), z = V(nrm);
  z.addScaledVector(y, -z.dot(y)).normalize();
  const x = new THREE.Vector3().crossVectors(y, z);
  _m4.makeBasis(x, y, z); _eu.setFromRotationMatrix(_m4, 'XYZ');
  return [_eu.x, _eu.y, _eu.z];
}

// ---------- poses ----------
const HARP_T = [0.13, 1.47, 0.58];      // left hand (harp grip) when drawing
const ANCHOR_T = [-0.1, 1.53, 0.06];    // right hand at full draw
function drawPose(P, ctx, k, pull, rel = 0) {
  L.A(P, 'pelvis', 0, -0.32 * k, 0); L.A(P, 'chest', -0.04 * k, -0.06 * k, 0);
  L.R(P, 'neck', 0, 0.18 * k, 0); L.R(P, 'head', 0.04 * k, 0.2 * k, 0.06 * k);
  L.armIK(P, ctx, 'L', _t.set(L.lerp(0.26, HARP_T[0], k), L.lerp(1.12, HARP_T[1], k), L.lerp(0.22, HARP_T[2], k)), 0.3);
  L.R(P, 'handL', 0, 0, 0);
  // right hand: from the harp grip back to the anchor; on release it flicks back and opens
  const g = [HARP_T[0] - 0.08, HARP_T[1] + 0.02, HARP_T[2] - 0.06];
  const x = L.lerp(g[0], ANCHOR_T[0], pull) - 0.12 * rel, y = L.lerp(g[1], ANCHOR_T[1], pull) + 0.08 * rel, z = L.lerp(g[2], ANCHOR_T[2], pull) - 0.14 * rel;
  L.armIK(P, ctx, 'R', _t.set(L.lerp(-0.24, x, k), L.lerp(1.1, y, k), L.lerp(0.1, z, k)), 0.45);
  L.R(P, 'handR', 0, 0, -0.3 * rel);
}
const _t = new THREE.Vector3();
const RIG = makeRig(DIMS);
const RCTX = { D: RIG.D, rig: RIG };
const DRAW_P = new Float32Array(L.NCH);
drawPose(DRAW_P, RCTX, 1, 1);
const poseOf = (Pp) => Object.fromEntries(Object.entries(BI).map(([n, i]) => [n, [Pp[i * 3], Pp[i * 3 + 1], Pp[i * 3 + 2]]]));
const DRAW = poseOf(DRAW_P);
const HARP_FRAME = poseFrame(RIG, DRAW, 'handL');
const LANCE_FRAME = poseFrame(RIG, DRAW, 'aux2');
const QH_DRAW = L.fkBone(DRAW_P, RCTX, 'handR').q.clone();
function rot(e, p) { const v = V(p).applyEuler(new THREE.Euler(e[0], e[1], e[2], 'XYZ')); return [v.x, v.y, v.z]; }
const MUZZLE = rot(HARP_FRAME, [0, 0.02, 0.16]);

// wings: absolute (sweepY, raiseZ) per pair; child bones store the difference
function wings(P, up, lo, cr = lo) {
  for (const s of SIDES) {
    L.RS(P, 'thigh', s, 0, up[0], up[1]);
    L.RS(P, 'shin', s, 0, lo[0] - up[0], lo[1] - up[1]);
    L.RS(P, 'foot', s, 0, cr[0] - lo[0], cr[1] - lo[1]);
  }
}
function base(P, ctx, t, calm = 1) {
  const st = ctx.st, b = Math.sin(t * 1.4);
  L.pel(P, Math.sin(t * 0.6) * 0.02, b * 0.05, 0);
  L.R(P, 'pelvis', 0.04 + Math.sin(t * 0.9) * 0.02, 0, Math.sin(t * 0.7) * 0.02);
  L.R(P, 'spine', 0.02, 0, 0); L.R(P, 'chest', -0.03 + b * 0.015, 0, 0);
  L.R(P, 'neck', st.gp * 0.3, st.gy * 0.4, 0); L.R(P, 'head', st.gp * 0.4 - 0.04, st.gy * 0.4, 0);
  // left hand carries the lyre-bow low at the side, right hand open
  L.RS(P, 'clav', 'L', 0, 0, b * 0.02); L.RS(P, 'clav', 'R', 0, 0, b * 0.02);
  L.RS(P, 'upArm', 'L', -0.38 + Math.sin(t * 1.1) * 0.03, -0.15, 0.3);
  L.RS(P, 'foreArm', 'L', -0.95, 0.2, 0);
  L.RS(P, 'hand', 'L', 0.25, 0, 0.1);
  L.RS(P, 'upArm', 'R', -0.12 + Math.sin(t * 1.2 + 1) * 0.04, 0.1, 0.32);
  L.RS(P, 'foreArm', 'R', -0.5 + Math.sin(t * 1.3 + 1) * 0.06, 0, 0);
  L.RS(P, 'hand', 'R', 0.15, 0, -0.25);
  const f = Math.sin(t * 1.5) * calm, g = Math.sin(t * 1.5 - 0.8) * calm;
  wings(P, [0.02 * f, 0.05 * f], [0.03 * g, -0.05 * g], [-0.02 * f, 0.04 * f]);
}

// lance aim: rotate aux2 so the lance (authored along +z in the draw pose) points along `dir` (root space)
const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _qd = new THREE.Quaternion(), _ql = new THREE.Quaternion(), _e = new THREE.Euler();
const ZF = new THREE.Vector3(0, 0, 1), _d = new THREE.Vector3(), _hl = new THREE.Vector3(), _hr = new THREE.Vector3();
function aimLance(P, ctx, dir) {
  const { q } = L.fkBone(P, ctx, 'handR', _p, _q);
  _qd.setFromUnitVectors(ZF, dir).multiply(QH_DRAW);
  _ql.copy(q).invert().multiply(_qd);
  _e.setFromQuaternion(_ql, 'YXZ');
  const i = BI.aux2 * 3; P[i] = _e.x; P[i + 1] = _e.y; P[i + 2] = _e.z;
}

// ---------- greebles ----------
function lamp(b, bone, pos, rot, r = 0.022, slot = 'glow', sym = true) {
  const put = sym ? b.sym.bind(b) : b.add.bind(b);
  put(b.cyl(r * 1.5, r * 1.5, 0.016, 12), bone, 'trim', pos, rot);
  put(b.cyl(r, r, 0.024, 12), bone, slot, pos, rot);
}
// organ pipe hanging down from `top` (pelvis space), length len, radius r, splayed by tilt
function pipe(b, o, bone, top, len, r, tilt, yaw, sing) {
  const far = b.far, rk = o.rank;
  b.scope(top, [-tilt * Math.cos(yaw), 0, tilt * Math.sin(yaw)], 1, () => {
    b.add(b.cyl(r, r, len, 16), bone, 'paint', [0, -len / 2, 0]);
    b.add(b.cyl(r * 1.25, r * 1.25, 0.022, 12), bone, 'trim', [0, -0.012, 0]);
    if (!far) b.add(b.cyl(r * 1.18, r * 1.18, 0.014, 12), bone, 'trim', [0, -len * 0.62, 0]);
    // conical foot (points down, the robe hem)
    b.add(b.cyl(r * 0.95, 0.004, len * 0.28, 16), bone, 'paint', [0, -len - len * 0.14, 0]);
    // mouth: dark slot + singing light (faces outward)
    const mz = r * 0.82, my = -len * 0.3;
    b.add(b.cbox(r * 1.0, len * 0.14, 0.02, 0.004), bone, 'metal', [Math.sin(yaw) * mz, my, Math.cos(yaw) * mz], [0, yaw, 0]);
    if (sing) b.add(b.cbox(r * 0.7, len * 0.05, 0.022, 0.003), bone, rk >= 3 ? 'glow' : 'metal', [Math.sin(yaw) * (mz + 0.004), my + len * 0.03, Math.cos(yaw) * (mz + 0.004)], [0, yaw, 0]);
  });
}

// ---------- body ----------
function head(b, o) {
  const rk = o.rank, far = b.far, y = 0.1, z = 0.02;
  // smooth faceless pearl mask, dark glass face with a hardlight slit, gold circlet + swept crest
  b.add(b.sph(20, 16), 'head', 'accent', [0, y, z - 0.01], [0, 0, 0], [0.085, 0.115, 0.1]);
  b.add(b.sph(18, 12, 0, PI * 2, 0, PI * 0.62), 'head', 'metal', [0, y - 0.005, z + 0.018], [PI * 0.5 - 0.2, 0, 0], [0.075, 0.09, 0.1]);
  b.add(b.cbox(0.1, 0.012, 0.02, 0.004), 'head', 'glow2', [0, y + 0.02, z + 0.09], [-0.05, 0, 0]);
  b.add(b.cbox(0.012, 0.05, 0.02, 0.004), 'head', 'glow2', [0, y - 0.025, z + 0.088], [0.25, 0, 0]);
  b.add(b.tor(0.09, 0.011, 28, 5), 'head', 'paint', [0, y + 0.045, z], [PI / 2 + 0.25, 0, 0], [1, 1.12, 1]);
  b.add(fin(b, [[-0.02, 0], [0.02, 0], [0.008, 0.1], [0, 0.13], [-0.008, 0.1]], 0.016, 0.004), 'head', 'paint', [0, y + 0.11, z + 0.05], [-0.25, 0, 0]);
  b.sym(fin(b, [[0, 0], [0.05, 0], [-0.1, 0.07], [-0.16, 0.06]], 0.018, 0.005), 'head', 'paint', [0.07, y + 0.06, z], [0.1, PI / 2 + 0.05, 0.1]);
  b.sym(fin(b, [[0, 0], [0.035, 0], [-0.08, 0.045], [-0.12, 0.04]], 0.026, 0.004), 'head', 'trim', [0.075, y + 0.03, z - 0.01], [0.25, PI / 2 + 0.1, 0.05]);
  if (!far) b.sym(b.sph(8, 6), 'head', 'glow', [0.084, y + 0.045, z + 0.035], [0, 0, 0], 0.012);
  // neck: dark glass column with gold rings
  b.add(b.cyl(0.04, 0.05, 0.2, 12), 'neck', 'metal', [0, -0.08, 0]);
  if (!far) for (let i = 0; i < 3; i++) b.add(b.tor(0.048, 0.007, 16, 4), 'neck', 'paint', [0, -0.13 + i * 0.05, 0], [PI / 2, 0, 0]);
  void rk;
}

function halo(b, o) {
  const rk = o.rank, far = b.far, H = 'aux1', R = 0.25;
  const tilt = [-0.95, 0, 0];   // tipped back: reads as an ellipse from the front AND from the side-on battle camera
  b.scope([0, 0, 0], tilt, 1, () => {
    const arc = rk === 0 ? PI * 1.45 : PI * 2;
    b.add(b.tor(R, 0.018, 96, 8, arc), H, 'paint', [0, 0, 0], [PI / 2, 0, rk === 0 ? 0.6 : 0]);
    if (rk >= 1) b.add(b.tor(R - 0.032, 0.006, 64, 4, arc), H, rk >= 3 ? 'glow' : 'trim', [0, 0, 0], [PI / 2, 0, 0]);
    if (rk >= 4) b.add(b.tor(R + 0.06, 0.008, 64, 4), H, 'glow2', [0, 0, 0], [PI / 2, 0, 0]);
    // studs: little tuning forks around the ring
    const n = far ? 6 : 12;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * PI * 2;
      if (rk === 0 && a > PI * 1.45 - 0.6 && a < PI * 2 - 0.6) continue;
      b.add(b.cbox(0.026, 0.026, 0.026, 0.006), H, i % 3 ? 'trim' : 'glow', [Math.cos(a) * R, 0, Math.sin(a) * R], [0, -a, PI / 4]);
    }
    // R5 / THE CHOIR: sunburst crown of short pipes radiating out of the ring
    if (rk >= 5) for (let i = 0; i < 14; i++) {
      const a = (i / 14) * PI * 2, len = i % 2 ? 0.16 : 0.3, d = [Math.cos(a), 0, Math.sin(a)];
      b.add(b.cyl(0.019, 0.019, len, 8), H, 'paint', [d[0] * (R + 0.03 + len / 2), 0, d[2] * (R + 0.03 + len / 2)], frame(d, [0, 1, 0]));
      b.add(b.cyl(0.024, 0.024, 0.016, 8), H, 'glow', [d[0] * (R + 0.03 + len), 0, d[2] * (R + 0.03 + len)], frame(d, [0, 1, 0]));
    }
  });
}

function torso(b, o) {
  const rk = o.rank, far = b.far;
  // chest: black glass core, pearl under-plates, gold V cuirass, violet resonance core
  P(b, 'chest', 'metal', [0.22, 0.28, 0.17], [0, 0.08, -0.01], [0, 0, 0], { c: 0.03 });
  P(b, 'chest', 'accent', [0.34, 0.26, 0.22], [0, 0.1, 0.0], [0.05, 0, 0], { c: 0.05, tx: 1.18, bx: 0.55, bz: 0.8 });
  PS(b, 'chest', 'paint', [0.15, 0.2, 0.06], [0.085, 0.13, 0.1], [0.12, 0.28, 0.12], { c: 0.02, tx: 1.1, bx: 0.55 });
  P(b, 'chest', 'paint', [0.3, 0.06, 0.18], [0, 0.235, 0.0], [0, 0, 0], { c: 0.02, tx: 1.05 });
  b.add(b.ext([[-0.025, 0], [0.025, 0], [0.04, 0.1], [0, 0.17], [-0.04, 0.1]], 0.03, 0.006), 'chest', 'glow', [0, 0.02, 0.122], [0.08, 0, 0]);
  b.add(b.ext([[-0.05, -0.01], [0.05, -0.01], [0.065, 0.11], [0, 0.2], [-0.065, 0.11]], 0.024, 0.006), 'chest', 'trim', [0, 0.015, 0.112], [0.08, 0, 0]);
  if (!far) for (let i = 0; i < 3; i++) b.sym(b.cbox(0.05 - i * 0.008, 0.012, 0.03, 0.004), 'chest', 'paint', [0.06, 0.05 + i * 0.035, 0.115], [0.05, 0.25, -0.35]);
  // collar: gold gorget + pearl wings
  b.add(b.tor(0.075, 0.016, 20, 5, PI * 1.3), 'chest', 'paint', [0, 0.25, 0.02], [PI / 2 + 0.2, 0, PI * 0.5 - PI * 0.65]);
  // back plate: wing mounts and a small organ of five pipes rising behind the head
  P(b, 'aux0', 'paint', [0.26, 0.24, 0.07], [0, -0.02, 0.02], [0, 0, 0], { c: 0.025, tx: 0.8 });
  P(b, 'aux0', 'accent', [0.18, 0.18, 0.05], [0, -0.02, -0.025], [0, 0, 0], { c: 0.02, tx: 0.8 });
  const pip = rk >= 1 ? [[0, 0.44], [0.05, 0.36], [-0.05, 0.36], [0.1, 0.28], [-0.1, 0.28]] : [[0, 0.3], [0.05, 0.24], [-0.05, 0.24]];
  for (const [x, h] of pip) {
    b.add(b.cyl(0.02, 0.02, h, 10), 'aux0', 'paint', [x, 0.05 + h / 2, -0.06], [-0.12, 0, 0]);
    b.add(b.cyl(0.024, 0.024, 0.014, 10), 'aux0', 'trim', [x, 0.06 + h, -0.06 - h * 0.12], [-0.12, 0, 0]);
    b.add(b.cbox(0.022, 0.03, 0.01, 0.003), 'aux0', rk >= 4 ? 'glow' : 'metal', [x, 0.05 + h * 0.3, -0.04], [-0.12, 0, 0]);
  }
  if (!far) for (const s of [1, -1]) b.add(b.cyl(0.05, 0.05, 0.03, 14), 'aux0', 'paint', [s * 0.1, 0.0, -0.035], [PI / 2, 0, 0]);
  // waist: dark glass wasp waist, gold ribs
  b.add(b.cyl(0.07, 0.09, 0.18, 12), 'spine', 'metal', [0, 0.05, 0]);
  if (!far) for (let i = 0; i < 3; i++) b.add(b.tor(0.085 - i * 0.006, 0.009, 16, 4), 'spine', 'paint', [0, -0.01 + i * 0.05, 0], [PI / 2, 0, 0]);
  P(b, 'spine', 'accent', [0.12, 0.12, 0.05], [0, 0.06, 0.075], [0.1, 0, 0], { c: 0.015, bx: 0.6 });
}

function skirt(b, o) {
  const rk = o.rank, far = b.far;
  // gold girdle + dark inner robe cone
  P(b, 'pelvis', 'paint', [0.28, 0.1, 0.22], [0, 0.0, 0], [0, 0, 0], { c: 0.03, bx: 0.85 });
  b.add(b.cbox(0.06, 0.07, 0.03, 0.01), 'pelvis', 'trim', [0, 0, 0.115]);
  b.add(b.cyl(0.02, 0.02, 0.012, 12), 'pelvis', 'glow', [0, 0, 0.13], [PI / 2, 0, 0]);
  b.add(b.cyl(0.13, 0.04, 0.45, 14), 'pelvis', 'metal', [0, -0.25, 0]);
  // inner ring of pipes (long, front longest), outer ring splayed (R2+)
  const ring = (n, R, top, lens, tilt, r, sing) => {
    for (let i = 0; i < n; i++) {
      const a = -PI * 0.92 + (i / (n - 1)) * PI * 1.84;
      const k = 1 - Math.abs(a) / PI;
      pipe(b, o, 'pelvis', [Math.sin(a) * R, top, Math.cos(a) * R * 0.85], lens[0] + (lens[1] - lens[0]) * k, r, tilt, a, sing && i % 2 === 0);
    }
  };
  const short = rk === 0 ? 0.75 : 1;
  ring(far ? 5 : 7, 0.1, -0.03, [0.42 * short, 0.66 * short], 0.12, 0.036, true);
  if (rk >= 2) ring(far ? 6 : 9, 0.165, -0.04, [0.34, 0.52], 0.3, 0.03, true);
  // tassets of pearl over the hips
  PS(b, 'pelvis', 'accent', [0.07, 0.16, 0.16], [0.14, -0.06, 0.0], [0, 0, 0.3], { c: 0.02, bx: 0.7 });
  PS(b, 'pelvis', 'paint', [0.015, 0.14, 0.12], [0.168, -0.06, 0.0], [0, 0, 0.3]);
}

function arms(b, o) {
  const D = b.rig.D, ua = D.upArm, fa = D.foreArm, rk = o.rank, far = b.far;
  b.sym(b.cyl(0.03, 0.03, D.shoulder, 8), 'clav', 'metal', [D.shoulder / 2, 0, 0], [0, 0, PI / 2]);
  b.sym(b.sph(12, 8), 'upArm', 'metal', [0, 0, 0], [0, 0, 0], 0.055);
  // pauldrons: layered gold shells swept up into blade fins
  b.sym(b.sph(16, 10, 0, PI * 2, 0, PI * 0.55), 'upArm', 'paint', [0.01, 0.015, 0], [0, 0, -0.3], [0.1, 0.085, 0.1]);
  b.sym(b.sph(14, 8, 0, PI * 2, 0, PI * 0.5), 'upArm', 'accent', [0.025, -0.04, 0], [0, 0, -0.45], [0.095, 0.07, 0.09]);
  b.sym(fin(b, [[0, 0], [0.05, 0], [0.11, 0.2], [0.07, 0.19]], 0.03, 0.006), 'upArm', 'paint', [0.04, 0.05, -0.02], [0.2, -0.3, -0.35]);
  if (rk >= 2) b.sym(fin(b, [[0, 0], [0.035, 0], [0.09, 0.15], [0.06, 0.15]], 0.036, 0.004), 'upArm', 'trim', [0.06, 0.03, -0.05], [0.35, -0.45, -0.55]);
  lamp(b, 'upArm', [0.085, 0.0, 0.06], [PI / 2, -0.4, 0], 0.014);
  b.sym(b.cyl(0.028, 0.024, ua, 8), 'upArm', 'metal', [0, -ua / 2, 0]);
  PS(b, 'upArm', 'accent', [0.07, ua * 0.5, 0.07], [0.005, -ua * 0.55, 0], [0, 0, 0], { c: 0.016, tx: 1.15, tz: 1.15 });
  b.sym(discX(b, 0.034, 0.07, 10), 'foreArm', 'metal', [0, 0, 0]);
  b.sym(b.cyl(0.026, 0.02, fa, 8), 'foreArm', 'metal', [0, -fa / 2, 0]);
  // pearl gauntlet with a gold cuff and a feather blade on the outer edge
  PS(b, 'foreArm', 'accent', [0.075, fa * 0.62, 0.08], [0.004, -fa * 0.55, 0], [0, 0, 0], { c: 0.018, tx: 0.85, tz: 0.85 });
  PS(b, 'foreArm', 'paint', [0.085, 0.03, 0.09], [0.004, -fa * 0.9, 0], [0, 0, 0], { c: 0.01 });
  b.sym(fin(b, [[0, 0], [0.025, 0], [0.012, -fa * 0.7], [0, -fa * 0.85]], 0.012, 0.003), 'foreArm', rk >= 3 ? 'glow2' : 'trim', [0.04, -0.03, 0], [0, PI / 2, 0]);
  // hands: dark palm, gold knuckles, long fingers
  b.sym(b.cbox(0.05, 0.07, 0.06, 0.012), 'hand', 'metal', [0, -0.04, 0]);
  b.sym(b.cbox(0.055, 0.02, 0.065, 0.006), 'hand', 'paint', [0, -0.012, 0]);
  if (!far) for (let i = 0; i < 3; i++) b.sym(b.cbox(0.012, 0.075, 0.014, 0.003), 'hand', 'metal', [-0.015 + i * 0.015, -0.1, 0.012], [0.25, 0, 0]);
  // R5: Novaline's shackles (gold-black cuffs, broken chain hanging)
  if (rk >= 5) {
    b.sym(b.cyl(0.05, 0.05, 0.05, 14), 'foreArm', 'metal', [0, -fa * 0.72, 0]);
    b.sym(b.tor(0.05, 0.008, 16, 4), 'foreArm', 'glow', [0, -fa * 0.72, 0], [PI / 2, 0, 0]);
    for (let i = 0; i < 4; i++) b.sym(b.tor(0.022, 0.007, 10, 4), 'foreArm', i === 3 ? 'paint' : 'metal', [0.05, -fa * 0.72 - 0.04 - i * 0.04, 0.0], [0, i % 2 ? PI / 2 : 0, 0], [1, 1.5, 1]);
  }
}

// one wing: a fan of blade feathers in the plane (out, up) swept back by `sweep`; dirs measured from `out` toward `up`
function wing(b, o, bone, { out, upv, a0, a1, lens, r0 = 0.1, w = 0.07, spar = true }) {
  const rk = o.rank, far = b.far;
  const U = V(out).normalize(), Vv = V(upv).normalize(), N = new THREE.Vector3().crossVectors(U, Vv).normalize();
  const n = lens.length;
  for (let i = 0; i < n; i++) {
    const a = n === 1 ? a0 : a0 + (a1 - a0) * (i / (n - 1));
    const d = U.clone().multiplyScalar(Math.cos(a)).addScaledVector(Vv, Math.sin(a));
    const len = lens[i], lay = (i % 2 ? 1 : -1) * 0.012;
    const pos = d.clone().multiplyScalar(r0).addScaledVector(N, lay), rt = frame(d.toArray(), N.toArray());
    const ww = w * (0.85 + 0.3 * (len / 1));
    const shape = (k) => [[-ww * 0.6 * k, 0], [ww * 0.6 * k, 0], [ww * k, len * 0.55], [ww * 0.55 * k, len * 0.86], [0, len * (0.94 + 0.06 * k)], [-ww * 0.35 * k, len * 0.8]];
    // R5 = THE CHOIR: black-violet glass blades outlined in gold, violet light inside
    const choir = rk >= 5;
    b.add(fin(b, shape(1), 0.018, 0.005), bone, choir ? 'metal' : 'accent', pos.toArray(), rt);
    // under-blade outlines every feather so the fan reads as layered blades, not a blob (dark glass, or gold on the Choir)
    b.add(fin(b, shape(1.3), 0.01, 0.002), bone, choir ? 'paint' : 'metal', pos.toArray(), rt);
    // hardlight core (R3+) / dark glass groove below
    const cw = choir ? 0.5 : 1;
    b.add(fin(b, [[-ww * 0.18 * cw, len * 0.08], [ww * 0.18 * cw, len * 0.08], [ww * 0.3 * cw, len * 0.6], [0, len * 0.9], [-ww * 0.12 * cw, len * 0.6]], 0.026, 0.004), bone, rk >= 5 ? 'glow' : rk >= 3 ? 'glow2' : 'metal', pos.toArray(), rt);
    // gold socket at the root
    b.add(b.cbox(ww * 1.3, 0.05, 0.034, 0.008), bone, 'paint', d.clone().multiplyScalar(r0 + 0.01).addScaledVector(N, lay).toArray(), rt);
    // R4: hardlight edge blade extending past the tip
    if (rk >= 4) b.add(fin(b, [[0, 0], [0.012, 0], [0.006, len * 0.45], [0, len * 0.55]], 0.012, 0.002), bone, 'glow2',
      d.clone().multiplyScalar(r0 + len * 0.62).addScaledVector(N, lay).add(new THREE.Vector3().crossVectors(N, d).multiplyScalar(-ww * 0.7)).toArray(), rt);
  }
  // hub + spar along the leading edge
  b.add(b.cyl(0.06, 0.06, 0.04, 16), bone, 'paint', [0, 0, 0], frame(N.toArray(), d0(U, Vv)));
  b.add(b.cyl(0.03, 0.03, 0.046, 12), bone, 'glow', [0, 0, 0], frame(N.toArray(), d0(U, Vv)));
  if (spar) {
    const top = a1 > a0 ? a1 : a0, ds = U.clone().multiplyScalar(Math.cos(top + 0.1)).addScaledVector(Vv, Math.sin(top + 0.1));
    const ls = lens[a1 > a0 ? n - 1 : 0] * 0.55;
    b.add(plate(b, 0.05, ls, 0.04, { c: 0.012, tx: 0.5 }), bone, 'paint', ds.clone().multiplyScalar(ls / 2 + 0.04).addScaledVector(N, 0.02).toArray(), frame(ds.toArray(), N.toArray()));
    b.add(fin(b, [[-0.02, 0], [0.02, 0], [0, 0.12]], 0.03, 0.006), bone, 'paint', ds.clone().multiplyScalar(ls + 0.04).addScaledVector(N, 0.02).toArray(), frame(ds.toArray(), N.toArray()));
    if (!far) b.add(b.sph(8, 6), bone, 'glow', ds.clone().multiplyScalar(ls * 0.5 + 0.04).addScaledVector(N, 0.045).toArray(), [0, 0, 0], 0.014);
  }
}
function d0(U, Vv) { return U.clone().add(Vv).normalize().toArray(); }

function allWings(b, o) {
  const rk = o.rank;
  const S = (fn) => { b.scope([0, 0, 0], [0, 0, 0], 1, fn); };
  // upper pair (thigh): fan out-and-up, swept back
  const upLens = rk === 0 ? [0.5, 0.62, 0.7, 0.72, 0.62] : rk === 1 ? [0.55, 0.68, 0.78, 0.8, 0.7] : [0.6, 0.76, 0.9, 1.0, 1.06, 0.98, 0.8];
  S(() => {
    symWing(b, o, 'thigh', { out: [1, 0, -0.42], upv: [0, 1, -0.22], a0: 1.3, a1: 0.12, lens: upLens });
    // lower pair (shin): fan out-and-down; R0 = snapped stubs
    const loLens = rk === 0 ? [0.22, 0.2, 0.16] : rk === 1 ? [0.62, 0.55, 0.46, 0.36] : [0.84, 0.78, 0.68, 0.56, 0.42];
    symWing(b, o, 'shin', { out: [1, 0, -0.5], upv: [0, -1, -0.3], a0: 0.15, a1: 1.15, lens: loLens, r0: 0.12, w: 0.06, spar: rk > 0 });
    // R5 crown pair (foot): tall blades arching up behind the halo
    if (rk >= 5) symWing(b, o, 'foot', { out: [0.55, 0, -0.9], upv: [0, 1, -0.1], a0: 1.42, a1: 1.1, lens: [1.1, 1.25, 1.0], r0: 0.16, w: 0.07 });
  });
}
function symWing(b, o, bone, opt) {
  // author on the left bone, mirror onto the right via sym's matrix trick: build into a temp collector
  const add = b.add, self = b;
  b.add = (g, bn, slot, p, r, s) => { self.sym(g, bone, slot, p, r, s); return self; };
  try { wing(b, o, bone + 'L', opt); } finally { b.add = add; }
}

function harp(b, o) {
  const rk = o.rank, far = b.far, H = 'handL';
  b.scope([0, -0.07, 0], HARP_FRAME, 1, () => {
    // lyre-bow in the root y-z plane (faces the side-on camera): two recurved gold limbs, pearl facings, hardlight string
    const limb = (s) => [[0, 0.02 * s, 0.0], [0, 0.17 * s, 0.07], [0, 0.32 * s, 0.06], [0, 0.44 * s, -0.02], [0, 0.48 * s, -0.09]];
    for (const s of [1, -1]) {
      b.add(b.tube(limb(s), 0.02, 16, 6), H, 'paint');
      b.add(b.tube(limb(s).map(([x, y, z]) => [x, y * 0.97, z + 0.022]), 0.011, 14, 5), H, 'accent');
      b.add(b.sph(10, 8), H, 'glow', [0, 0.48 * s, -0.09], [0, 0, 0], 0.024);
      b.add(fin(b, [[-0.015, 0], [0.015, 0], [0, 0.1]], 0.02, 0.005), H, 'paint', [0, 0.49 * s, -0.1], [s > 0 ? -0.9 : PI + 0.9, 0, 0]);
    }
    b.add(b.cyl(0.003, 0.003, 0.96, 4), H, 'glow2', [0, 0, -0.09]);
    // lyre top: yoke + three short strings (the choir's harp)
    b.add(b.cbox(0.02, 0.02, 0.1, 0.005), H, 'paint', [0, 0.3, 0.03]);
    if (!far) for (let i = 0; i < 3; i++) b.add(b.cyl(0.0025, 0.0025, 0.2, 4), H, 'glow2', [0, 0.19, 0.0 + i * 0.03]);
    // grip: dark wrap, gold sound-box with the violet eye
    b.add(b.cyl(0.024, 0.024, 0.14, 10), H, 'metal', [0, 0, 0.0]);
    b.add(b.sph(14, 10), H, 'paint', [0, 0, 0.05], [0, 0, 0], [0.03, 0.06, 0.045]);
    b.add(b.cyl(0.018, 0.018, 0.012, 12), H, 'glow', [0, 0, 0.094], [PI / 2, 0, 0]);
    if (rk >= 4) for (const s of [1, -1]) b.add(b.tube(limb(s).map(([x, y, z]) => [x, y * 1.02, z + 0.045]), 0.005, 14, 4), H, 'glow2');
  });
}

function lance(b, o) {
  const H = 'aux2', far = b.far;
  b.scope([0, 0, 0], LANCE_FRAME, 1, () => {
    b.add(b.cyl(0.012, 0.012, LANCE * 0.8, 6), H, 'glow2', [0, 0, LANCE * 0.38], [PI / 2, 0, 0]);
    b.add(b.cyl(0.0, 0.034, 0.24, 4), H, 'glow2', [0, 0, LANCE * 0.78 + 0.12], [PI / 2, 0, 0]);
    b.add(b.cyl(0.034, 0.0, 0.06, 4), H, 'glow2', [0, 0, LANCE * 0.78 - 0.03], [PI / 2, 0, 0]);
    if (!far) for (let i = 0; i < 4; i++) b.add(fin(b, [[0, 0], [0.04, 0.02], [0.0, 0.12]], 0.006, 0.002), H, 'glow', [0, 0, -0.02], [PI / 2, 0, i * PI / 2]);
    b.add(b.tor(0.03, 0.005, 12, 3), H, 'glow', [0, 0, LANCE * 0.5]);
  });
}

function shards(b, o) {
  if (o.rank < 5) return;
  const H = 'aux3';
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * PI * 2, R = 0.42;
    b.add(b.cyl(0, 0.035, 0.14, 5), H, 'glow', [Math.cos(a) * R, 0.07 + (i % 2) * 0.06, Math.sin(a) * R], [0.3 * (i % 2 ? 1 : -1), a, 0.2]);
    b.add(b.cyl(0.035, 0, 0.06, 5), H, 'glow', [Math.cos(a) * R, 0.0 + (i % 2) * 0.06 - 0.03, Math.sin(a) * R], [0.3 * (i % 2 ? 1 : -1), a, 0.2]);
  }
}

function build(b, o) {
  head(b, o); halo(b, o); torso(b, o); skirt(b, o); arms(b, o); allWings(b, o); harp(b, o); lance(b, o); shards(b, o);
}

// ---------- anims ----------
const anims = {
  idle(P, t, ctx) { base(P, ctx, t); },
  advance(P, t, ctx) {
    base(P, ctx, t, 1.6);
    L.A(P, 'pelvis', 0.18, 0, 0); L.A(P, 'chest', -0.05, 0, 0);
    const f = Math.sin(t * 3.2);
    wings(P, [0.35, 0.1 + 0.06 * f], [0.35, -0.08 - 0.05 * f], [0.3, 0.05]);
  },
  // Light Lance: raise the lyre-bow, draw a lance of light out of it, loose at 0.34
  attack(P, u, ctx) {
    base(P, ctx, ctx.t);
    const k = L.kf(u, [[0, 0], [0.16, 1], [0.62, 1], [0.9, 0]]), pull = L.kf(u, [[0, 0], [0.1, 0], [0.3, 1], [0.34, 1], [0.37, 0.85], [1, 0.85]]);
    const rel = L.kf(u, [[0, 0], [0.34, 0], [0.4, 1], [0.62, 0.6], [0.9, 0]]);
    drawPose(P, ctx, k, pull, rel);
    P[L.PX + 2] -= 0.05 * rel;
    wings(P, [-0.08 * rel, 0.06 + 0.16 * rel], [-0.06 * rel, -0.05 - 0.12 * rel], [0, 0.1 * rel]);
    ctx.lance = u > 0.08 && u < 0.345 ? L.kf(u, [[0.08, 0], [0.26, 1]]) : 0;
    ctx.lanceMode = 'draw';
  },
  // javelin: reach up into the halo, pull a lance out, hurl it (fire 0.44)
  attack_alt(P, u, ctx) {
    base(P, ctx, ctx.t);
    const up = L.kf(u, [[0, 0], [0.22, 1], [0.36, 1.05], [0.44, 0], [1, 0]]), thr = L.kf(u, [[0, 0], [0.36, 0], [0.44, 1], [0.62, 1], [0.9, 0]]);
    const back = L.kf(u, [[0, 0], [0.3, 1], [0.38, 1.1], [0.44, 0], [1, 0]]);
    L.A(P, 'pelvis', -0.08 * back + 0.14 * thr, 0.22 * back - 0.18 * thr, 0);
    L.A(P, 'chest', -0.1 * back + 0.1 * thr, 0.1 * back, 0);
    const hx = -0.16 - 0.04 * back, hy = L.lerp(L.lerp(1.15, 1.98, up), 1.32, thr), hz = L.lerp(L.lerp(0.12, -0.12, up), 0.5, thr);
    L.armIK(P, ctx, 'R', _t.set(hx, hy, hz), 0.5);
    L.RS(P, 'upArm', 'L', L.lerp(-0.38, -0.9, back), -0.15, L.lerp(0.3, 0.65, back));
    wings(P, [0.25 * back - 0.2 * thr, 0.05 + 0.1 * back], [0.2 * back - 0.15 * thr, -0.1 * back], [0, 0.1 * back]);
    P[L.PX + 2] += 0.08 * thr - 0.04 * back;
    ctx.lance = u > 0.05 && u < 0.445 ? L.kf(u, [[0.05, 0], [0.24, 1]]) : 0;
    ctx.lanceMode = up > 0.5 || back > 0.5 ? 'raise' : 'throw';
  },
  // hymn: face up, palms open, wings lift, the pipes sing (cast 0.5)
  cast(P, u, ctx) {
    base(P, ctx, ctx.t);
    const k = L.kf(u, [[0, 0], [0.4, 1], [0.7, 1], [1, 0]]);
    P[L.PX + 1] += 0.12 * k;
    L.A(P, 'chest', -0.15 * k, 0, 0); L.A(P, 'head', -0.35 * k, 0, 0);
    for (const s of SIDES) { L.RS(P, 'upArm', s, L.lerp(-0.3, -0.7, k), -0.3 * k, L.lerp(0.3, 0.75, k)); L.RS(P, 'foreArm', s, L.lerp(-0.7, -0.45, k), 0, 0); L.RS(P, 'hand', s, -0.4 * k, 0, 0.3 * k); }
    wings(P, [-0.1 * k, 0.22 * k], [-0.05 * k, -0.15 * k], [0, 0.15 * k]);
  },
  // CHOIR OF LANCES: rises, wings flung wide, arms raised to the halo (release 0.17 = 0.4 s), hangs singing, settles
  overdrive(P, u, ctx) {
    base(P, ctx, ctx.t, 0.3);
    const rise = L.kf(u, [[0, 0], [0.17, 1], [0.8, 1], [1, 0]]);
    const spread = L.kf(u, [[0, 0], [0.08, -0.3], [0.17, 1], [0.24, 1.08], [0.78, 1], [0.95, 0]]);
    const arms = L.kf(u, [[0, 0], [0.12, 1], [0.2, 1.1], [0.75, 1], [0.92, 0]]);
    const quiver = Math.sin(ctx.t * 22) * 0.025 * L.kf(u, [[0.17, 0], [0.25, 1], [0.75, 1], [0.85, 0]]);
    P[L.PX + 1] += 0.28 * rise;
    L.A(P, 'pelvis', -0.12 * rise, 0, 0); L.A(P, 'chest', -0.18 * arms, 0, 0); L.A(P, 'head', -0.3 * arms, 0, 0);
    for (const s of SIDES) {
      L.RS(P, 'clav', s, 0, 0, 0.1 * arms);
      L.RS(P, 'upArm', s, L.lerp(-0.3, -0.35, arms), -0.15 * arms, L.lerp(0.3, 2.35, arms));
      L.RS(P, 'foreArm', s, L.lerp(-0.7, -0.25, arms), 0, 0);
      L.RS(P, 'hand', s, 0, 0, 0.2 * arms);
    }
    wings(P, [-0.45 * spread, 0.18 * spread + quiver], [-0.4 * spread, -0.3 * spread - quiver], [-0.2 * spread, 0.12 * spread]);
  },
  hit(P, u, ctx) {
    base(P, ctx, ctx.t);
    const k = L.kf(u, [[0, 0], [0.12, 1], [1, 0]]), d = ctx.st.hitDir;
    L.A(P, 'pelvis', -0.25 * k, 0.1 * k * d, 0.15 * k * d); P[L.PX + 2] -= 0.12 * k;
    L.A(P, 'head', -0.25 * k, 0, 0.2 * k * d);
    wings(P, [0.35 * k, -0.12 * k], [0.3 * k, 0.12 * k], [0.3 * k, -0.1 * k]);
  },
  // the choir falls silent: wings sag and fold, it sinks to the floor and topples forward (down 0.62)
  die(P, u, ctx) {
    base(P, ctx, ctx.t * (1 - u), 1 - u);
    const s = L.kf(u, [[0, 0], [0.12, 0.08], [0.55, 1], [1, 1]]), tip = L.kf(u, [[0, 0], [0.45, 0], [0.62, 1], [0.7, 0.92], [0.78, 1], [1, 1]]);
    L.pel(P, 0, L.kf(u, [[0, 0], [0.12, 0.08], [0.55, -0.5], [0.62, -0.62], [1, -0.62]]), 0.1 * tip);
    L.A(P, 'pelvis', 1.15 * tip, 0, 0.12 * tip);
    L.A(P, 'chest', 0.2 * s, 0, 0); L.A(P, 'head', 0.4 * s, 0, 0.2 * s);
    for (const sd of SIDES) { L.RS(P, 'upArm', sd, L.lerp(-0.3, 0.4, s), 0, L.lerp(0.3, 0.5, s)); L.RS(P, 'foreArm', sd, -0.2, 0, 0); }
    wings(P, [0.6 * s, -0.35 * s], [0.5 * s, 0.25 * s], [0.6 * s, -0.4 * s]);
  },
  // descends on a pillar of light with wings folded, unfolds them (land 0.45, ready 0.85); noDrop: the descent is the anim
  deploy(P, u, ctx) {
    base(P, ctx, ctx.t);
    const d = L.kf(u, [[0, 1], [0.45, 0], [1, 0]]), open = L.kf(u, [[0, 0], [0.45, 0], [0.62, 1.15], [0.85, 1], [1, 0]]), fold = L.kf(u, [[0, 1], [0.45, 1], [0.6, 0]]);
    P[L.PX + 1] += 1.6 * d * d;
    L.A(P, 'head', 0.3 * fold - 0.2 * open, 0, 0); L.A(P, 'chest', 0.12 * fold, 0, 0);
    for (const s of SIDES) L.AS(P, 'upArm', s, 0, 0, 0.6 * open);
    wings(P, [0.7 * fold - 0.3 * open, -0.2 * fold + 0.2 * open], [0.6 * fold - 0.25 * open, 0.25 * fold - 0.2 * open], [0.7 * fold, -0.2 * fold]);
  },
  // rises and spreads, slow wing beats, lyre raised
  victory(P, t, ctx) {
    base(P, ctx, t);
    const k = L.smooth(Math.min(1, t / 0.8)), f = Math.sin(t * 2.4);
    P[L.PX + 1] += (0.2 + Math.sin(t * 1.2) * 0.05) * k;
    L.A(P, 'chest', -0.12 * k, 0, 0); L.A(P, 'head', -0.25 * k, 0, 0);
    L.RS(P, 'upArm', 'L', L.lerp(-0.38, -0.3, k), 0, L.lerp(0.3, 2.5, k)); L.RS(P, 'foreArm', 'L', L.lerp(-0.95, -0.3, k), 0, 0);
    L.RS(P, 'upArm', 'R', -0.2, 0, L.lerp(0.32, 1.3, k));
    wings(P, [-0.3 * k, (0.15 + 0.12 * f) * k], [-0.25 * k, (-0.2 - 0.1 * f) * k], [-0.1 * k, 0.12 * k]);
  },
};

const _dir = new THREE.Vector3();
export default {
  id: 'seraph', name: 'SERAPH', role: 'archer', faction: 'experimental', rarity: 'legendary', realm: 'scifi',
  rig: 'hover', dims: DIMS, height: 2.05, radius: 0.62, walkSpeed: 1.2, scheme: 'bold', noDrop: true,
  bodyScale: [1.12, 1.04, 1.08],
  style: { weapon: 'rifle' },
  glow2: 0xe2c8ff,
  motes: { color: 0xe6ccff, size: 0.13 },
  mats: {
    all: {
      paint: { color: 0xf2b648, metal: 0.8, rough: 0.24, coat: 0.8, coatRough: 0.05, env: 1.1, emissive: 0x2a1800, ei: 1, panel: { scale: 3.4, groove: 0.4, vary: 0.07 } },
      accent: { color: 0xb4acc4, metal: 0.15, rough: 0.42, coat: 0.4, env: 0.7,   /* robots touch-up: darker pearl, was the brightest thing on the board */ panel: { scale: 4.2, groove: 0.3, vary: 0.06 } },
      metal: { color: 0x1d1530, metal: 0.65, rough: 0.2, env: 1.0 },
      trim: { color: 0xe4e6ee, metal: 0.9, rough: 0.18, coat: 0.5, env: 1.1 },
      glow2: { color: 0xd2acff, ei: 2.1 },
    },
  },
  sockets: { muzzle: ['handL', MUZZLE], core: [0, 0.12, 0.14], head: [0, 0.1, 0.09], hand: ['handR', [0, -0.08, 0.02]], lance: ['aux2', [0, 0, 0]], halo: ['aux1', [0, 0, 0]] },
  events: { attack: [['fire', 0.34]], attack_alt: [['fire', 0.44]], cast: [['cast', 0.5]], overdrive: [['cast', 0.04], ['fire', 0.17]], die: [['down', 0.62]], deploy: [['land', 0.45], ['ready', 0.85]] },
  durs: { attack: 1.0, attack_alt: 1.15, cast: 1.2, overdrive: 2.4, hit: 0.42, die: 2.0, deploy: 1.6 },
  anims,
  post(P, ctx, act) {
    const t = ctx.t, an = act && act.name;
    const i = BI.aux1 * 3;
    P[i + 1] = t * (an === 'overdrive' ? 2.4 : 0.5);
    const j = BI.aux3 * 3; P[j + 1] = -t * 0.7; P[j] = Math.sin(t * 0.8) * 0.12;
    if (!(an === 'attack' || an === 'attack_alt')) { ctx.lance = 0; return; }
    if (an === 'attack') {
      L.fkPoint(P, ctx, 'handL', [0, -0.07, 0], _hl); L.fkPoint(P, ctx, 'handR', [0, -0.08, 0.02], _hr);
      _dir.subVectors(_hl, _hr); if (_dir.lengthSq() < 1e-4) _dir.set(0, 0, 1); _dir.normalize();
    } else if (ctx.lanceMode === 'raise') _dir.set(0, 0.35, 1).normalize();
    else _dir.set(0, -0.15, 1).normalize();
    aimLance(P, ctx, _dir);
  },
  tick(unit, dt, ctx, bones) {
    const k = ctx.lance || 0, ab = bones[BI.aux2];
    ab.scale.setScalar(Math.max(1e-4, k));
    // javelin grip sits a third of the way down the shaft
    const st = unit.state.action === 'attack_alt' ? -0.35 * k : 0;
    ab.position.set(0, -0.08, 0.02);
    if (st) { _dir.set(0, 0, st).applyQuaternion(ab.quaternion); ab.position.add(_dir); }
    // halo swells during the overdrive, sags on death
    const a = unit.state.action;
    let target = 1;
    if (a === 'overdrive') target = 1.35; else if (unit.state.dead || a === 'die') target = 0.7;
    ctx.haloK = (ctx.haloK ?? 1) + (target - (ctx.haloK ?? 1)) * (1 - Math.exp(-dt * 6));
    bones[BI.aux1].scale.setScalar(ctx.haloK);
  },
  fxHints: { projectile: 'light_lance', impact: 'choir', overdrive: 'choir_of_lances', color: 0xd9b8ff },
  build,
};
