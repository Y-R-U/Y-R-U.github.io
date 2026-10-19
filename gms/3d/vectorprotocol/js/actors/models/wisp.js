// WISP, experimental common mage "Mote Core" (sculptor-14). Brief: docs/ROSTER.md `wisp`.
// A loose reactor core that decided it liked people: a white-hot orb with two dark oval eyes that slide over its surface when it
// looks around, held in a nested gimbal of gyroscope rings, an acorn-cap containment lid with a sprout antenna, two little
// fin "ears", and a beaded plasma tail. It squashes and stretches (chest bone scale) instead of gesturing.
// VALUE: `accent` = black-violet containment (cap, clamps, ring frames), `paint` = saturated violet plates, `metal` = dark
// polished eyes + joints, `trim` = lilac ring rims, `glow` = faction plasma (ring bands, tail, sprout), `glow2` = the white core.
// Rank tiers (common default R0): R0 battered: cracked cap (a plate missing), bent sprout, ring A dull · R1 base: two glowing
//   gyro rings · R2 third ring (kit motes start) · R3 ring beads light up, a mote cloud orbits on the rings, tail longer ·
//   R4 hardlight ear fins + crown ticks on the cap · R5 a little halo over the sprout and four satellite motes.
// Rig: hover. chest = orb centre (scaled for squash/stretch), neck = cap + sprout, head = the eyes (rotates on the orb's centre),
// clav/upArm = ears, thighL/shinL/footL = tail (the right leg chain is unused), aux1 (outer) -> aux2 -> aux3 (inner) = nested gimbal rings.
import { THREE, fin, LIB, PI, BI } from '../kit.js';

const L = LIB;
const OR = 0.13;   // orb radius
const DIMS = {
  hover: 0.5, spine: 0.06, chest: 0.06, neck: 0.0, headOff: 0.0, hipX: 0.0, hipY: -0.06, thigh: 0.1, shin: 0.09, ankle: 0.05,
  clavX: 0.02, clavY: 0.02, shoulder: 0.11, upArm: 0.06, foreArm: 0.05,
  parents: { aux1: 'chest', aux2: 'aux1', aux3: 'aux2' },
  aux2: [0, 0, 0], aux3: [0, 0, 0], aux1: [0, 0, 0], aux0: [0, 0.0, 0],
};

function lookAround(P, ctx, t) {
  const st = ctx.st;
  L.R(P, 'head', st.gp * 0.9, st.gy * 1.3, 0);
}
function base(P, ctx, t, k = 1) {
  const b = Math.sin(t * 2.4);
  L.pel(P, Math.sin(t * 0.9) * 0.03, 0.06 * b, 0);
  L.R(P, 'pelvis', 0.05 * Math.sin(t * 1.3), 0, 0.08 * Math.sin(t * 1.1));
  L.R(P, 'spine', 0, 0, 0); L.R(P, 'chest', -0.03 * b, 0, 0);
  lookAround(P, ctx, t);
  L.R(P, 'neck', 0.06 * Math.sin(t * 2.4 + 0.8), 0, 0.08 * Math.sin(t * 1.7));
  // ears flap
  const e = Math.sin(t * 3.1) * 0.15 * k;
  for (const s of ['L', 'R']) L.RS(P, 'upArm', s, 0, 0, 0.25 + e);
  // tail sways behind
  L.RS(P, 'thigh', 'L', 0.25 + 0.1 * Math.sin(t * 2.4 - 0.5), 0, 0.15 * Math.sin(t * 1.8));
  L.RS(P, 'shin', 'L', 0.2 + 0.12 * Math.sin(t * 2.4 - 1.1), 0, 0.2 * Math.sin(t * 1.8 - 0.6));
  L.RS(P, 'foot', 'L', 0.2 + 0.14 * Math.sin(t * 2.4 - 1.7), 0, 0.25 * Math.sin(t * 1.8 - 1.2));
}

function ringGeo(b, o, bone, R, tube, slot, n, beads, axisRot) {
  const rk = o.rank, far = b.far;
  b.scope([0, 0, 0], axisRot, 1, () => {
    b.add(b.tor(R, tube, 64, 6), bone, slot, [0, 0, 0]);
    if (!far) for (const s2 of [1, -1]) b.add(b.tor(R + s2 * tube * 0.9, tube * 0.35, 56, 3), bone, 'trim', [0, 0, 0]);
    b.add(b.tor(R, tube * 0.6, 56, 4), bone, rk === 0 && bone === 'aux3' ? 'metal' : 'glow', [0, 0, 0], [0, 0, 0], [1, 1, 2.6]);
    // gimbal pivots (on the ring's local x axis) + beads
    for (const s of [1, -1]) b.add(b.cyl(tube * 1.6, tube * 1.6, tube * 3.2, 10), bone, 'trim', [s * R, 0, 0], [0, 0, PI / 2]);
    if (!far) for (let i = 0; i < n; i++) {
      const a = (i + 0.5) / n * PI * 2;
      if (Math.abs(Math.cos(a)) > 0.95) continue;
      b.add(b.sph(12, 8), bone, beads && rk >= 3 ? 'glow' : 'trim', [Math.cos(a) * R, Math.sin(a) * R, 0], [0, 0, 0], tube * 1.5);
    }
  });
}

function build(b, o) {
  const rk = o.rank, far = b.far;
  // core: white-hot orb + violet plasma shell bands
  b.add(b.sph(36, 26), 'chest', 'glow2', [0, 0, 0], [0, 0, 0], OR);
  // plasma shell: three thin latitude bands tilted round the core
  if (!far) for (let i = 0; i < 3; i++) b.add(b.tor(OR * 1.01, 0.004, 40, 3), 'chest', 'glow', [0, 0, 0], [PI / 2 + (i - 1) * 0.5, i * 0.7, 0]);
  b.add(b.tor(OR * 1.02, 0.008, 36, 4), 'chest', 'glow', [0, 0, 0], [PI / 2, 0, 0]);
  // eyes (head bone sits at the orb centre): dark polished ovals proud of the surface + a tiny catch-light
  for (const s of [1, -1]) {
    const ax = s * 0.5, ay = 0.2;
    const p = [Math.sin(ax) * Math.cos(ay) * OR, Math.sin(ay) * OR, Math.cos(ax) * Math.cos(ay) * OR];
    b.add(b.sph(20, 14), 'head', 'metal', p.map((v) => v * 0.95), [-ay, ax, 0], [0.05, 0.072, 0.04]);
    b.add(b.tor(1, 0.14, 20, 4), 'head', 'accent', p.map((v) => v * 0.99), [-ay, ax, 0], [0.052, 0.075, 0.05]);
    b.add(b.sph(8, 6), 'head', 'glow2', [p[0] * 1.1 + 0.012 * s, p[1] + 0.028, p[2] * 1.08], [0, 0, 0], 0.013);
  }
  // acorn cap: dark containment lid with violet scales; R0 = cracked (a scale missing)
  b.add(b.sph(20, 8, 0, PI * 2, 0, PI * 0.2), 'neck', 'paint', [0, 0.0, 0], [0, 0, 0], [OR * 1.06, OR * 1.1, OR * 1.06]);
  const nS = far ? 6 : 12;
  for (let i = 0; i < nS; i++) {
    if (rk === 0 && i === 2) continue;
    const a = i / nS * PI * 2;
    b.scope([0, 0, 0], [0, a, 0], 1, () => b.add(fin(b, [[-0.03, 0], [0.03, 0], [0.017, 0.04], [0, 0.052], [-0.017, 0.04]], 0.014, 0.004), 'neck', i % 2 ? 'paint' : 'accent',
      [0, OR * 0.8, OR * 0.56], [0.55, 0, 0]));
  }
  b.add(b.tor(OR * 0.62, 0.012, 32, 5), 'neck', rk >= 1 ? 'glow' : 'trim', [0, OR * 0.8, 0], [PI / 2, 0, 0]);
  // sprout antenna with a glowing mote; R0 bent
  const bend = rk === 0 ? 0.6 : 0.15;
  b.add(b.tube([[0, OR * 0.95, 0], [0, OR * 1.4, 0.0], [Math.sin(bend) * 0.04, OR * 1.75, -0.02], [Math.sin(bend) * 0.09, OR * 1.95, -0.05]], 0.009, 10, 5), 'neck', 'metal');
  b.add(b.sph(10, 8), 'neck', 'glow', [Math.sin(bend) * 0.09, OR * 1.95 + 0.01, -0.05], [0, 0, 0], 0.034);
  if (!far) b.add(fin(b, [[0, 0], [0.04, 0.01], [0.05, 0.04], [0.01, 0.02]], 0.01, 0.003), 'neck', 'paint', [0.005, OR * 1.45, 0], [0, -0.3, 0.2]);
  if (rk >= 4) for (let i = 0; i < 6; i++) { const a = i / 6 * PI * 2; b.add(b.cbox(0.012, 0.035, 0.012, 0.003), 'neck', 'glow', [Math.sin(a) * OR * 0.85, OR * 0.78, Math.cos(a) * OR * 0.85], [0, a, 0]); }
  if (rk >= 5) {
    b.add(b.tor(0.075, 0.007, 32, 4), 'neck', 'glow', [Math.sin(bend) * 0.09, OR * 1.95 + 0.07, -0.05], [PI / 2 - 0.3, 0, 0]);
    b.add(b.tor(0.075, 0.004, 32, 3), 'neck', 'trim', [Math.sin(bend) * 0.09, OR * 1.95 + 0.07, -0.05], [PI / 2 - 0.3, 0, 0], [1.15, 1.15, 1.15]);
  }
  // under-clamp: violet emitter cone below the orb with a hover ring
  b.add(b.sph(16, 6, 0, PI * 2, PI * 0.8, PI * 0.2), 'chest', 'accent', [0, 0.0, 0], [0, 0, 0], [OR * 1.08, OR * 1.08, OR * 1.08]);
  b.add(b.cyl(0.045, 0.02, 0.06, 12), 'spine', 'paint', [0, -0.07, 0]);
  b.add(b.tor(0.05, 0.008, 20, 4), 'spine', 'glow', [0, -0.1, 0], [PI / 2, 0, 0]);
  // side clamps: two curved plates holding the orb at the equator (ear roots)
  for (const s of [1, -1]) {
    b.add(b.sph(12, 8, -PI * 0.1, PI * 0.2, PI * 0.32, PI * 0.36), 'chest', 'paint', [0, 0, 0], [0, s > 0 ? PI / 2 : -PI / 2, 0], OR * 1.08);
    b.add(b.cyl(0.022, 0.022, 0.03, 12), 'chest', 'trim', [s * OR * 1.12, 0, 0], [0, 0, PI / 2]);
  }
  // ears: little swept fins on the upper arms (rest hangs down: author them pointing out-and-up)
  b.sym(fin(b, [[0, -0.03], [0.13, 0.0], [0.21, 0.12], [0.07, 0.045]], 0.016, 0.004), 'upArm', 'accent', [-0.02, 0.0, 0], [0, -0.2, 0.25]);
  b.sym(fin(b, [[0.03, -0.015], [0.12, 0.006], [0.18, 0.095], [0.075, 0.03]], 0.022, 0.003), 'upArm', rk >= 4 ? 'glow' : 'paint', [-0.02, 0.0, 0.0], [0, -0.2, 0.25]);
  // tail: beads of plasma shrinking down the chain
  const tail = [['thighL', 0.042, 0.0], ['thighL', 0.034, -0.06], ['shinL', 0.03, 0.0], ['shinL', 0.024, -0.05], ['footL', 0.019, 0.0], ['footL', 0.012, -0.04]];
  const nT = rk >= 3 ? tail.length : 4;
  for (let i = 0; i < nT; i++) {
    const [bn, r, y] = tail[i];
    b.add(b.sph(16, 12), bn, i % 2 ? 'paint' : 'glow', [0, y, 0], [0, 0, 0], r);
    if (!far && i % 2 === 0) b.add(b.tor(r * 1.15, 0.004, 14, 3), bn, 'trim', [0, y, 0], [PI / 2, 0, 0]);
  }
  // gimbal: ring A (aux2) around x, ring B (aux3) around z, ring C (aux1, R2+) around y
  ringGeo(b, o, 'aux3', 0.215, 0.012, 'accent', 10, true, [0, PI / 2, 0]);
  ringGeo(b, o, 'aux2', 0.25, 0.011, 'paint', 12, true, [0, 0, 0]);
  if (rk >= 2) ringGeo(b, o, 'aux1', 0.285, 0.009, 'accent', 14, true, [PI / 2, 0, 0]);
  // R5: satellite motes on the outer ring
  if (rk >= 5) for (let i = 0; i < 4; i++) { const a = i / 4 * PI * 2 + 0.4; b.add(b.sph(10, 8), 'aux1', 'glow2', [Math.cos(a) * 0.285, 0, Math.sin(a) * 0.285], [0, 0, 0], 0.022); }
}

// ---------- anims ----------
const anims = {
  idle(P, t, ctx) {
    base(P, ctx, t);
    // a happy little spin every ~7 s
    const c = t % 7.3, sp = L.kf(c, [[0, 0], [5.6, 0], [6.4, 1], [7.3, 1]]);
    L.A(P, 'pelvis', 0, sp * PI * 2, 0);
    ctx.sq = 1 + 0.05 * Math.sin(t * 4.8);
  },
  advance(P, t, ctx) {
    base(P, ctx, t, 1.6);
    L.A(P, 'pelvis', 0.35, 0, 0); L.A(P, 'chest', -0.2, 0, 0);
    L.RS(P, 'thigh', 'L', 0.9, 0, 0);
    ctx.sq = 1;
  },
  // Wisp Spark (its basic attack in battle): squash back, stretch forward and spit a spark (fire 0.42)
  cast(P, u, ctx) {
    base(P, ctx, ctx.t);
    const back = L.kf(u, [[0, 0], [0.32, 1], [0.42, 0], [1, 0]]), push = L.kf(u, [[0, 0], [0.38, 0], [0.44, 1], [0.7, 0.2], [1, 0]]);
    L.A(P, 'pelvis', -0.3 * back + 0.35 * push, 0, 0);
    P[L.PX + 2] += -0.07 * back + 0.08 * push; P[L.PX + 1] += 0.04 * back;
    for (const s of ['L', 'R']) L.AS(P, 'upArm', s, 0, 0, 0.5 * back - 0.4 * push);
    ctx.sq = 1 - 0.18 * back + 0.2 * push;
  },
  // quick triple spark: hop-hop-hop (fire 0.3 / 0.45 / 0.6)
  attack(P, u, ctx) {
    base(P, ctx, ctx.t);
    let k = 0;
    for (const f of [0.3, 0.45, 0.6]) k = Math.max(k, L.kf(u, [[f - 0.08, 0], [f, 1], [f + 0.08, 0]]));
    L.A(P, 'pelvis', 0.3 * k, 0, 0); P[L.PX + 1] += 0.05 * k;
    ctx.sq = 1 + 0.15 * k;
  },
  // spin-zap: whirls once, the spark flies off the spin (fire 0.55)
  attack_alt(P, u, ctx) {
    base(P, ctx, ctx.t);
    const sp = L.kf(u, [[0, 0], [0.2, 0], [0.6, 1], [1, 1]]);
    L.A(P, 'pelvis', 0, sp * PI * 2, 0); P[L.PX + 1] += 0.12 * L.kf(u, [[0, 0], [0.5, 1], [1, 0]]);
    ctx.sq = 1 - 0.12 * L.kf(u, [[0, 0], [0.2, 1], [0.5, 0]]) + 0.15 * L.kf(u, [[0.5, 0], [0.56, 1], [0.8, 0]]);
  },
  // FLICKER: swells, rings fly wide and spin up, flares and bursts into motes (release 0.17 = 0.4 s), reforms
  overdrive(P, u, ctx) {
    base(P, ctx, ctx.t, 2);
    const rise = L.kf(u, [[0, 0], [0.15, 1], [0.7, 1], [1, 0]]);
    P[L.PX + 1] += 0.3 * rise;
    L.A(P, 'pelvis', -0.2 * rise, 0, 0);
    for (const s of ['L', 'R']) L.AS(P, 'upArm', s, 0, 0, 0.8 * rise);
    ctx.sq = L.kf(u, [[0, 1], [0.12, 1.45], [0.17, 0.55], [0.3, 0.6], [0.55, 0.75], [0.8, 1.1], [1, 1]]);
    ctx.odU = u;
  },
  hit(P, u, ctx) {
    base(P, ctx, ctx.t);
    const k = L.kf(u, [[0, 0], [0.1, 1], [1, 0]]), d = ctx.st.hitDir;
    L.A(P, 'pelvis', -0.5 * k, 0, 0.4 * k * d); P[L.PX + 2] -= 0.12 * k;
    ctx.sq = 1 - 0.25 * L.kf(u, [[0, 0], [0.1, 1], [0.4, -0.3], [1, 0]]);
  },
  // sputters, rings tumble, the core drops and rolls to a stop (down 0.55)
  die(P, u, ctx) {
    base(P, ctx, ctx.t * (1 - u), 1 - u);
    const fall = L.kf(u, [[0, 0], [0.15, -0.06], [0.5, 1], [0.58, 0.88], [0.66, 1], [1, 1]]);
    P[L.PX + 1] = 0.06 * Math.sin(ctx.t * 9) * (1 - u) - (DIMS.hover - OR - 0.02) * fall;
    P[L.PX + 2] += 0.2 * L.kf(u, [[0.5, 0], [1, 1]]);
    L.A(P, 'pelvis', 1.4 * L.kf(u, [[0.45, 0], [1, 1]]), 0, 0.5 * fall);
    ctx.sq = 1 - 0.2 * L.kf(u, [[0.45, 0], [0.5, 1], [0.6, 0]]);
  },
  // pops in: lands with a squash, bounces, rings spin up, eyes open (land 0.4, ready 0.8)
  deploy(P, u, ctx) {
    base(P, ctx, ctx.t);
    const sq = L.kf(u, [[0, 1], [0.4, 1.2], [0.44, 0.6], [0.55, 1.15], [0.68, 0.9], [0.8, 1]]);
    P[L.PX + 1] += 0.15 * L.kf(u, [[0.42, 0], [0.55, 1], [0.68, 0]]);
    ctx.sq = sq;
  },
  // bounces with joy, does loops
  victory(P, t, ctx) {
    base(P, ctx, t, 2);
    const h = Math.abs(Math.sin(t * 4));
    P[L.PX + 1] += 0.15 * h;
    L.A(P, 'pelvis', 0, t * 3, 0);
    ctx.sq = 1 + 0.15 * (h - 0.5);
  },
};

export default {
  id: 'wisp', name: 'WISP', role: 'mage', faction: 'experimental', rarity: 'common', realm: 'scifi',
  rig: 'hover', dims: DIMS, height: 1.15, radius: 0.44, bodyScale: [1.5, 1.5, 1.5], walkSpeed: 1.3, scheme: 'bold',
  style: { weapon: 'orbs' },
  glow2: 0xf6eaff,
  mats: { all: { glow2: { color: 0xe6c0ff, ei: 2.0 }, metal: { color: 0x0c0a12, metal: 0.4, rough: 0.08, env: 1.2, panel: { groove: 0 } }, paint: { rough: 0.25 } } },
  sockets: { muzzle: ['chest', [0, 0.0, OR + 0.03]], core: [0, 0.0, 0.0], head: [0, OR + 0.05, 0] },
  events: { cast: [['fire', 0.42]], attack: [['fire', 0.3], ['fire', 0.45], ['fire', 0.6]], attack_alt: [['fire', 0.55]], overdrive: [['cast', 0.05], ['fire', 0.17]], die: [['down', 0.55]], deploy: [['land', 0.4], ['ready', 0.8]] },
  durs: { cast: 1.0, attack: 1.0, attack_alt: 1.1, overdrive: 2.2, hit: 0.4, die: 1.6, deploy: 1.4 },
  anims,
  post(P, ctx, act) {
    const t = ctx.t, an = act && act.name;
    const fast = an === 'overdrive' ? 4 : an === 'cast' || an === 'attack' || an === 'attack_alt' ? 2 : an === 'advance' ? 1.6 : 1;
    const sp = t * fast;
    P[BI.aux3 * 3] = sp * 1.3; P[BI.aux2 * 3 + 2] = sp * 1.7; P[BI.aux1 * 3 + 1] = sp * 0.9;
    if (an === 'die') { const u = Math.min(1, act.t / act.dur); P[BI.aux3 * 3 + 2] = 1.2 * u; P[BI.aux2 * 3] = 0.9 * u; }
  },
  tick(unit, dt, ctx, bones) {
    // squash & stretch the orb (chest scales its children: eyes, cap, rings)
    const s = ctx.sq ?? 1;
    ctx.sqS = (ctx.sqS ?? 1) + (s - (ctx.sqS ?? 1)) * (1 - Math.exp(-dt * 18));
    const k = ctx.sqS;
    bones[BI.chest].scale.set(1 / Math.sqrt(Math.max(0.3, k)), k, 1 / Math.sqrt(Math.max(0.3, k)));
    // blink every few seconds (head = eyes)
    ctx.blink = (ctx.blink ?? 2) - dt;
    if (ctx.blink < -0.12) ctx.blink = 2 + Math.random() * 3;
    const dead = unit.state.dead || unit.state.action === 'die';
    bones[BI.head].scale.set(1, ctx.blink < 0 || dead ? 0.12 : 1, 1);
    // overdrive: the gimbal flies wide
    const od = unit.state.action === 'overdrive' ? L.kf(ctx.odU || 0, [[0, 1], [0.15, 1.7], [0.7, 1.6], [1, 1]]) : 1;
    ctx.ringK = (ctx.ringK ?? 1) + (od - (ctx.ringK ?? 1)) * (1 - Math.exp(-dt * 8));
    bones[BI.aux1].scale.setScalar(ctx.ringK);
  },
  fxHints: { projectile: 'spark', impact: 'mote', overdrive: 'flicker', color: 0xc77dff },
  build,
};
