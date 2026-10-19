// SINGULARITY, experimental legendary mage "Collapse Engine" (sculptor-16). Brief: docs/ROSTER.md `singularity`. Also the model of
// the FINAL BOSS VECTOR PRIME (boss_vector_prime: battle passes rank 5, x1.6 capped, red ring): rank 5 = the Prime form.
// Read: a floating EYE. A black-hole core (true black via a lensing billboard) inside a gold iris ring that faces the side-on battle
// camera, two crescent "eyelid" arms around it that part to fire (cast/attack) and spread like wings in the overdrive, a hot
// horizontal accretion disc, a floating sensor crown above and a tail of floating segments below. The back is the collapse engine.
// VALUE: `paint` = polished gold (iris ring, crescents, disc plates), `accent` = black glass/gunmetal (most of the mass: crescent
// backs, engine, cowls, tail), `trim` = pale lilac platinum markers, `glow` = faction violet (seams, lid edges, gaps),
// `eye` = gold-white hot band (accretion disc, visor) at R0-R4; R5 swaps it for `glow2` = Protocol cyan.
// No `metal` slot on purpose: 5 kit slots + the lens billboard = 6 (+motes, +aura) keeps it at <= 8 draw calls.
// Rank tiers (legendary default R3): R0 battered: chipped lids, broken disc, no crown · R1 lids + plain ring + disc · R2 engine fins,
//   ring armour blocks, second disc band, lid spines · R3 (base) lensing core, crown crest, glowing lid edges, gimbal ring nubs ·
//   R4 accretion debris chunks orbiting in the disc, second gimbal ring, crown spikes, longer engine vanes · R5 = VECTOR PRIME:
//   a great V of light rising behind the eye (the arena logo), a Protocol V-crown over a pearl mask with a cyan V visor, a dashed
//   cyan HUD ring, cyan light at the edges of everything turning violet toward the core, data cables trailing from the tail.
// Rig: hover. chest joint = core centre. Crescents: upper lid on upArm, lower lid on foreArm, both re-parented to clav so they
// pivot on the same point beside the core (lids open = rotate about X, spread = rotate about Z). aux2 (chest) = accretion disc
// (spins in post), aux3 (chest) = core sphere + gimbal (spins; scaled in tick for swell/collapse), aux0 (chest) = back engine
// + R5 V, aux1 (head) = crown. Tail = thighL/shinL/footL (hipX 0); the R leg chain carries no geometry.
import { THREE, plate, fin, LIB, PI, BI } from '../kit.js';
import { markNoBloom } from '../../fx/vfx.js';

const L = LIB;
const SIDES = ['L', 'R'];
const PIV = 0.15;            // lid pivot x (clavX + shoulder)
const DIMS = {
  hover: 0.55, thigh: 0.2, shin: 0.18, ankle: 0.02, hipX: 0.0, hipY: -0.06, spine: 0.15, chest: 0.35, neck: 0.5, headOff: 0.04,
  clavX: 0.11, clavY: 0, shoulder: 0.04, upArm: 0.001, foreArm: 0.3,
  parents: { foreArmL: 'clavL', foreArmR: 'clavR', aux2: 'chest', aux3: 'chest' },
  offsets: { foreArmL: [0.04, 0, 0] },
  aux0: [0, 0, -0.42], aux1: [0, 0.12, 0], aux2: [0, 0, 0], aux3: [0, 0, 0],
};
const RING = 0.4;            // iris ring radius (YZ plane)
const LID = 0.6;             // crescent mid radius
const DISC = [0.44, 0.68];     // accretion disc radii
const PLAT = { metal: 0.7, rough: 0.2, emissive: 0x000000, ei: 0 };

// ---------- shape helpers ----------
// crescent outline in (u = forward, v = up) around the origin: mid radius rm, max width w, from angle a0 to a1 (rad from +u toward +v)
function crescent(rm, w, a0, a1, n = 18, taper = 0.6) {
  const out = [], inn = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, a = a0 + (a1 - a0) * t, ww = w * Math.pow(Math.sin(PI * (0.04 + 0.92 * t)), taper) * 0.5;
    out.push([Math.cos(a) * (rm + ww), Math.sin(a) * (rm + ww)]);
    inn.push([Math.cos(a) * (rm - ww), Math.sin(a) * (rm - ww)]);
  }
  return out.concat(inn.reverse());
}
// annulus sector (flat band) in the same (u, v) plane
function sector(r0, r1, a0, a1, n = 6) {
  const out = [], inn = [];
  for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; out.push([Math.cos(a) * r1, Math.sin(a) * r1]); inn.push([Math.cos(a) * r0, Math.sin(a) * r0]); }
  return out.concat(inn.reverse());
}
// side-plane (YZ) placement: shape x -> forward z, shape y -> up, extrusion -> x
const SIDE = [0, -PI / 2, 0];
function lamp(b, bone, pos, rot, r = 0.022, slot = 'glow', mirror = false) {
  const put = mirror ? b.sym.bind(b) : b.add.bind(b);
  put(b.cyl(r * 1.5, r * 1.5, 0.016, 12), bone, 'accent', pos, rot);
  put(b.cyl(r, r, 0.024, 12), bone, slot, pos, rot);
}

// ---------- parts ----------
function iris(b, o) {
  const rk = o.rank, far = o.far, hot = rk >= 5 ? 'glow2' : 'eye';
  // the gold iris ring the side camera looks straight at, yawed a little so cards see it too
  b.scope([0, 0, 0], [0, PI / 2 - 0.32, 0], 1, () => {
    b.add(b.tor(RING, 0.05, 64, 10), 'chest', 'paint');
    b.add(b.tor(RING - 0.052, 0.012, 64, 4), 'chest', 'glow');
    b.add(b.tor(RING + 0.054, 0.01, 64, 4), 'chest', 'trim');
    // armour blocks riding the ring (R2+), seam lamps between them; R0 has three missing and one cracked
    const nb = rk >= 2 ? 16 : 8;
    for (let i = 0; i < nb; i++) {
      if (rk === 0 && (i === 2 || i === 3 || i === 6)) continue;
      const a = (i + 0.5) / nb * PI * 2, c = Math.cos(a), s = Math.sin(a);
      b.add(b.cbox(0.13, 0.075, 0.12, 0.018), 'chest', i % 2 ? 'accent' : 'paint', [c * RING, s * RING, 0], [0, 0, a + PI / 2]);
      if (!far) b.add(b.cbox(0.06, 0.02, 0.135, 0.006), 'chest', 'trim', [c * (RING + 0.04), s * (RING + 0.04), 0], [0, 0, a + PI / 2]);
      if (rk >= 1) { const a2 = (i + 1) / nb * PI * 2; b.add(b.sph(8, 6), 'chest', 'glow', [Math.cos(a2) * RING, Math.sin(a2) * RING, 0.055], [0, 0, 0], 0.016); }
    }
    // emitter spokes pointing at the core (R3+): four short gold teeth
    if (rk >= 3) for (let i = 0; i < 4; i++) {
      const a = i * PI / 2 + PI / 4;
      b.add(fin(b, [[-0.025, 0], [0.025, 0], [0.006, 0.09], [-0.006, 0.09]], 0.03, 0.006), 'chest', 'paint', [Math.cos(a) * (RING - 0.05), Math.sin(a) * (RING - 0.05), 0], [0, 0, a + PI / 2]);
    }
  });
  // lower cowl + vertebrae linking ring to the tail (floating, glowing gaps)
  b.add(b.lathe([[0, -0.02], [0.1, -0.02], [0.13, 0.03], [0.1, 0.08], [0, 0.09]], 18), 'spine', 'accent', [0, -0.02, 0]);
  b.add(b.tor(0.11, 0.012, 20, 4), 'spine', 'paint', [0, 0.03, 0], [PI / 2, 0, 0]);
  b.add(b.cyl(0.08, 0.06, 0.03, 16), 'spine', 'glow', [0, 0.13, 0]);
  b.add(b.lathe([[0, 0], [0.09, 0], [0.12, 0.05], [0.07, 0.1], [0, 0.11]], 16), 'spine', 'paint', [0, 0.15, 0]);
  // a crest spar from the ring top up toward the crown
  b.add(b.lathe([[0, 0], [0.05, 0], [0.04, 0.06], [0.015, 0.12], [0, 0.13]], 12), 'chest', 'paint', [0, RING + 0.03, 0]);
  if (rk >= 1) b.add(b.cyl(0.03, 0.03, 0.012, 12), 'chest', hot, [0, RING + 0.165, 0]);
}

function lids(b, o) {
  const rk = o.rank, far = o.far, hot = rk >= 5 ? 'glow2' : 'glow';
  const span = rk === 0 ? 1.55 : rk >= 4 ? 2.05 : 1.9;
  const w = rk >= 5 ? 0.15 : 0.13;
  for (const [bone, sg] of [['upArm', 1], ['foreArm', -1]]) {
    const a0 = sg * 0.2, a1 = sg * span, X = 0.035;
    const mk = (pts, d) => fin(b, sg > 0 ? pts : pts.slice().reverse(), d, 0.008);
    // black backing blade, gold face blade (thinner), glowing inner edge, lilac outer edge strip
    b.sym(mk(crescent(LID, w * 1.18, a0, a1, 22, 0.55), 0.05), bone, 'accent', [-0.005, 0, 0], SIDE);
    b.sym(mk(crescent(LID + w * 0.12, w * 0.5, a0 + sg * 0.05, a1 - sg * 0.12, 22, 0.6), 0.03), bone, 'paint', [X, 0, 0], SIDE);
    if (rk >= 1) {
      const n = rk >= 3 ? 8 : 4;
      for (let i = 0; i < n; i++) {
        const t0 = 0.08 + i / n * 0.8, t1 = t0 + 0.8 / n - 0.02, aa = a0 + (a1 - a0) * t0, ab = a0 + (a1 - a0) * t1;
        // R5: cyan at the tips, violet near the pivot (light turning to void)
        const slot = rk >= 5 ? (i >= n / 2 ? 'glow2' : 'glow') : rk >= 3 ? 'glow' : 'trim';
        b.sym(fin(b, sg > 0 ? sector(LID - w * 0.47, LID - w * 0.36, aa, ab, 3) : sector(LID - w * 0.47, LID - w * 0.36, ab, aa, 3), 0.04, 0.004), bone, slot, [0.01, 0, 0], SIDE);
      }
      b.sym(fin(b, sg > 0 ? sector(LID + w * 0.42, LID + w * 0.5, a0 + sg * 0.3, a1 - sg * 0.35, 12) : sector(LID + w * 0.42, LID + w * 0.5, a1 - sg * 0.35, a0 + sg * 0.3, 12), 0.04, 0.004), bone, 'trim', [0.012, 0, 0], SIDE);
    }
    // R0: a chunk bitten out of the upper lid
    // spines along the outer edge (R2+), longer at R4
    if (rk >= 2 && !far) {
      const ns = rk >= 4 ? 5 : 3, h = rk >= 4 ? 0.12 : 0.08;
      for (let i = 0; i < ns; i++) {
        const a = a0 + (a1 - a0) * (0.25 + i * 0.55 / (ns - 1)), r = LID + w * 0.42;
        b.sym(fin(b, [[-0.02, 0], [0.02, 0], [0.004, h * (i === 1 ? 1.25 : 1)], [-0.004, h * 0.9]], 0.022, 0.005), bone, rk >= 3 && i === 1 ? 'paint' : 'accent',
          [0.01, Math.sin(a) * r, Math.cos(a) * r], [-(a - PI / 2), 0, 0]);
      }
    }
    // pivot hub: lilac cap with a lamp
    b.sym(b.cyl(0.06, 0.07, 0.04, 18), bone, sg > 0 ? 'accent' : 'trim', [0.0, 0, 0], [0, 0, PI / 2]);
    if (sg > 0) lamp(b, bone, [0.03, 0, 0], [0, 0, PI / 2], 0.026, 'glow', true);
    // claw tip
    const ta = a1 + sg * 0.02;
    b.sym(fin(b, [[-0.03, 0], [0.03, 0], [0.0, 0.13]], 0.03, 0.006), bone, 'paint', [0.0, Math.sin(ta) * LID, Math.cos(ta) * LID], [-(ta + sg * PI / 2) + (sg > 0 ? 0 : PI), 0, 0]);
  }
  // arm strut from the iris to each pivot
  b.sym(b.cyl(0.035, 0.045, 0.12, 12), 'clav', 'accent', [0.06, 0, 0], [0, 0, PI / 2]);
}

function disc(b, o) {
  const rk = o.rank, far = o.far, hot = rk >= 5 ? 'glow2' : 'eye', S = 'aux2';
  const [r0, r1] = DISC;
  // hot inner band + a thin second band
  b.add(b.tor(r0, 0.016, 72, 4), S, hot, [0, 0, 0], [PI / 2, 0, 0]);
  if (rk >= 2) b.add(b.tor(r0 + 0.1, 0.007, 72, 3), S, hot, [0, 0, 0], [PI / 2, 0, 0]);
  // gold plates (gaps between them read as spin); R0 = broken (only a few)
  const n = 20;
  for (let i = 0; i < n; i++) {
    if (rk === 0 && i % 3) continue;
    if (rk === 1 && i % 2) continue;
    const a = i / n * PI * 2;
    const g = fin(b, sector(r0 + 0.03, r1 - (i % 2 ? 0.08 : 0), 0, PI * 2 / n * 0.72, 3), 0.022, 0.005);
    b.add(g, S, i % 3 === 0 ? 'paint' : 'accent', [0, 0, 0], [PI / 2, 0, a]);
  }
  b.add(b.tor(r1 + 0.02, 0.008, 72, 3), S, 'trim', [0, 0, 0], [PI / 2, 0, 0]);
  // R4: accretion debris riding the disc (chunks above and below, a few hot)
  if (rk >= 4) for (let i = 0; i < (far ? 8 : 18); i++) {
    const a = i * 2.39996, r = r0 + 0.06 + ((i * 37) % 23) / 23 * (r1 - r0), y = ((i * 53) % 7 - 3) * 0.018, s = 0.022 + (i % 4) * 0.008;
    b.add(b.cbox(s, s * 0.8, s * 1.4, s * 0.25), S, i % 5 === 0 ? hot : i % 2 ? 'accent' : 'paint', [Math.cos(a) * r, y, Math.sin(a) * r], [i, i * 0.7, 0]);
  }
  // R5: an outer ring of black void shards eating the light
  if (rk >= 5) for (let i = 0; i < 14; i++) {
    const a = i / 14 * PI * 2 + 0.1, r = r1 + 0.07;
    b.add(fin(b, [[-0.03, 0], [0.03, 0], [0, 0.12]], 0.02, 0.004), S, 'accent', [Math.cos(a) * r, 0, Math.sin(a) * r], [PI / 2, 0, a - PI / 2]);
  }
}

function core(b, o) {
  const rk = o.rank, S = 'aux3', hot = rk >= 5 ? 'glow2' : 'eye';
  // the sphere (true black comes from the lens billboard at R3+; this is the shadow / mirror / low-rank body)
  b.add(b.sph(24, 18), S, 'accent', [0, 0, 0], [0, 0, 0], 0.2);
  if (rk < 0) b.add(b.tor(0.215, 0.012, 48, 4), S, 'glow', [0, 0, 0], [0, 0, 0]);
  // gimbal ring facing front (spins about Y -> a globe of gold around the hole)
  b.add(b.tor(0.28, 0.014, 56, 5), S, 'paint', [0, 0, 0], [0, 0, 0]);
  if (rk >= 3) for (let i = 0; i < 4; i++) { const a = i * PI / 2; b.add(b.cbox(0.04, 0.04, 0.05, 0.01), S, 'trim', [Math.cos(a) * 0.28, Math.sin(a) * 0.28, 0], [0, 0, a]); }
  if (rk >= 4) b.add(b.tor(0.3, 0.008, 56, 4), S, hot, [0, 0, 0], [PI / 2, 0.6, 0]);
}

function engine(b, o) {
  const rk = o.rank, far = o.far, S = 'aux0';
  // the collapse engine behind the iris: black housing, gold collar, violet coils, radiator vanes fanning back
  b.add(b.cbox(0.16, 0.36, 0.14, 0.03), S, 'accent', [0, 0, 0.02]);
  b.add(b.cbox(0.18, 0.06, 0.16, 0.015), S, 'paint', [0, 0.15, 0.02]);
  b.add(b.cbox(0.18, 0.06, 0.16, 0.015), S, 'paint', [0, -0.15, 0.02]);
  for (let i = 0; i < 3; i++) b.add(b.cyl(0.05, 0.05, 0.04, 14), S, 'glow', [0, -0.07 + i * 0.07, -0.06], [PI / 2, 0, 0]);
  if (!far) for (let i = 0; i < 3; i++) b.add(b.tor(0.055, 0.008, 16, 4), S, 'trim', [0, -0.07 + i * 0.07, -0.085]);
  const nv = rk >= 4 ? 5 : rk >= 2 ? 3 : 1, len = rk >= 4 ? 0.42 : 0.32;
  for (let i = 0; i < nv; i++) {
    const a = (i - (nv - 1) / 2) * 0.42;
    // vanes in the side plane, fanning back from the housing
    b.add(fin(b, [[0, -0.05], [len * 0.25, -0.07], [len, -0.02], [len * 1.05, 0.02], [len * 0.2, 0.05], [0, 0.04]], 0.026, 0.006), S, i % 2 ? 'paint' : 'accent',
      [0, 0, -0.04], [-a, PI / 2, 0]);
    if (rk >= 3 && !far) b.add(fin(b, [[len * 0.3, -0.006], [len * 0.95, 0.0], [len * 0.3, 0.006]], 0.03, 0.002), S, 'glow', [0, 0, -0.04], [-a, PI / 2, 0]);
  }
  // struts from the housing to the ring
  b.sym(b.cyl(0.018, 0.018, 0.2, 8), S, 'trim', [0.06, 0.1, 0.12], [PI / 2 + 0.3, 0, 0]);
  b.sym(b.cyl(0.018, 0.018, 0.2, 8), S, 'trim', [0.06, -0.1, 0.12], [PI / 2 - 0.3, 0, 0]);
}

function crown(b, o) {
  const rk = o.rank, far = o.far, H = 'head', hot = rk >= 5 ? 'glow2' : 'eye';
  if (rk >= 5) {
    // VECTOR PRIME: a pearl mask (Cassius Vane) with a cyan V visor, a gold cowl behind it
    b.add(b.sph(20, 16), H, 'trim', [0, 0.06, 0.02], [0, 0, 0], [0.1, 0.13, 0.1]);
    b.add(b.sph(20, 16), H, 'paint', [0, 0.08, -0.04], [0, 0, 0], [0.12, 0.15, 0.11]);
    for (const s of [1, -1]) b.add(b.cbox(0.012, 0.075, 0.02, 0.004), H, 'glow2', [s * 0.03, 0.07, 0.115], [-0.15, 0, s * 0.45]);
    b.add(fin(b, [[-0.07, 0], [0.07, 0], [0.11, 0.06], [0, 0.02], [-0.11, 0.06]], 0.02, 0.004), H, 'paint', [0, 0.17, 0.06], [-0.3, 0, 0]);
  } else {
    // a floating sensor spire: gold teardrop with a hot slit, lilac collar
    b.add(b.lathe([[0, -0.06], [0.06, -0.02], [0.075, 0.05], [0.05, 0.13], [0.0, 0.17]], 16), H, 'paint', [0, 0, 0]);
    b.add(b.cbox(0.12, 0.018, 0.03, 0.006), H, hot, [0, 0.05, 0.065], [-0.2, 0, 0]);
    b.add(b.tor(0.07, 0.01, 20, 4), H, 'trim', [0, -0.01, 0], [PI / 2, 0, 0]);
  }
  if (rk >= 3) {
    // crescent crest over the head (side plane), the unit's name in silhouette
    b.add(fin(b, crescent(0.17, 0.05, 0.35, PI - 0.35, 16, 0.7), 0.025, 0.005), H, 'paint', [0, 0.1, -0.02], SIDE);
    if (!far) lamp(b, H, [0, 0.27, -0.02], [PI / 2, 0, 0], 0.016, hot);
  }
  if (rk >= 4) for (let i = 0; i < 5; i++) {
    const a = 0.5 + i * (PI - 1.0) / 4, h = i === 2 ? 0.12 : 0.08;
    b.add(fin(b, [[-0.016, 0], [0.016, 0], [0, h]], 0.016, 0.004), H, rk >= 5 ? 'glow2' : 'paint', [0, 0.1 + Math.sin(a) * 0.19, -0.02 + Math.cos(a) * 0.19], [-(a - PI / 2), 0, 0]);
  }
  if (rk >= 5) {
    // the Protocol V-crown: two crossed V sigils floating above the mask
    for (const yaw of [0, PI / 2]) b.scope([0, 0.33, 0], [0, yaw, 0], 1, () => {
      b.add(fin(b, [[-0.17, 0.12], [-0.11, 0.12], [0, -0.04], [0.11, 0.12], [0.17, 0.12], [0, -0.12]], 0.03, 0.006), H, 'paint');
      b.add(fin(b, [[-0.08, 0.1], [-0.05, 0.1], [0, 0.02], [0.05, 0.1], [0.08, 0.1], [0, -0.03]], 0.04, 0.004), H, 'glow2', [0, 0, 0]);
    });
  }
}

function tail(b, o) {
  const rk = o.rank, far = o.far;
  // pelvis keel cone + three floating segments down the tail, glowing gaps
  b.add(b.lathe([[0, -0.1], [0.06, -0.08], [0.1, -0.02], [0.11, 0.03], [0, 0.05]], 16), 'pelvis', 'paint', [0, 0, 0]);
  b.add(b.tor(0.105, 0.01, 18, 4), 'pelvis', 'trim', [0, 0.02, 0], [PI / 2, 0, 0]);
  b.add(b.lathe([[0, -0.2], [0.03, -0.17], [0.07, -0.06], [0.08, 0.0], [0, 0.01]], 14), 'thighL', 'accent', [0, -0.01, 0]);
  b.add(b.cyl(0.05, 0.05, 0.015, 14), 'thighL', 'glow', [0, 0.01, 0]);
  b.add(b.lathe([[0, -0.18], [0.025, -0.15], [0.05, -0.05], [0.055, 0.0], [0, 0.01]], 12), 'shinL', 'paint', [0, -0.01, 0]);
  b.add(b.cyl(0.035, 0.035, 0.012, 12), 'shinL', 'glow', [0, 0.01, 0]);
  b.add(fin(b, [[-0.035, 0], [0.035, 0], [0, -0.16]], 0.035, 0.008), 'footL', 'accent', [0, -0.01, 0], [0, PI / 4, 0]);
  b.add(fin(b, [[-0.035, 0], [0.035, 0], [0, -0.16]], 0.035, 0.008), 'footL', 'accent', [0, -0.01, 0], [0, -PI / 4, 0]);
  // side fins on the keel (R1+)
  if (rk >= 1) b.sym(fin(b, [[0, 0.02], [0.13, -0.06], [0.05, -0.08], [0, -0.05]], 0.02, 0.005), 'pelvis', 'accent', [0.08, -0.02, 0], [0, 0, 0]);
  // R5: Protocol data cables trailing from the keel, cyan tips
  if (rk >= 5 && !far) for (let i = 0; i < 4; i++) {
    const a = i * PI / 2 + PI / 4, c = Math.cos(a), s = Math.sin(a);
    b.add(b.tube([[c * 0.08, -0.04, s * 0.08], [c * 0.16, -0.18, s * 0.16], [c * 0.13, -0.34, s * 0.13], [c * 0.18, -0.46, s * 0.18]], 0.012, 12, 5), 'pelvis', 'accent');
    b.add(b.sph(8, 6), 'pelvis', 'glow2', [c * 0.18, -0.47, s * 0.18], [0, 0, 0], 0.022);
  }
}

// VECTOR PRIME's great V: blades rising from below the core in the side plane, framing the eye (the arena logo), plus a dashed HUD ring
function primeV(b, o) {
  const far = o.far, S = 'aux0';
  for (const yaw of [0.3]) b.scope([0, 0, 0.42], [0, yaw, 0], 1, () => {
    for (const sg of [1, -1]) {
      // blade root under the eye, tip high and out (side plane: u = forward)
      const root = [sg * 0.08, -0.66], tip = [sg * 0.72, 1.62], wR = 0.08, wT = 0.2;
      const dx = tip[0] - root[0], dy = tip[1] - root[1], ln = Math.hypot(dx, dy), nx = -dy / ln * sg, ny = dx / ln * sg;
      const q = (t, w) => [root[0] + dx * t + nx * w, root[1] + dy * t + ny * w];
      const outline = [q(0, -wR), q(0.95, -wT), q(1.05, 0), q(0.98, wT * 0.6), q(0.1, wR)];
      const pts = sg > 0 ? outline : outline.slice().reverse();
      b.add(fin(b, pts, 0.05, 0.01), S, 'accent', [0, 0, 0], SIDE);
      const face = [q(0.06, -wR * 1.0), q(0.95, -wT * 1.0), q(1.0, -wT * 0.8), q(0.06, -wR * 0.75)];
      b.add(fin(b, sg > 0 ? face : face.slice().reverse(), 0.07, 0.006), S, 'paint', [0, 0, 0], SIDE);
      // light strip up the inner edge: violet near the core, cyan toward the tip
      for (let i = 0; i < 7; i++) {
        const t0 = 0.12 + i * 0.125, t1 = t0 + 0.105;
        const st = [q(t0, -0.15 * (wR + (wT - wR) * t0)), q(t1, -0.15 * (wR + (wT - wR) * t1)), q(t1, 0.75 * (wR + (wT - wR) * t1)), q(t0, 0.75 * (wR + (wT - wR) * t0))];
        b.add(fin(b, sg > 0 ? st : st.slice().reverse(), 0.085, 0.004), S, i >= 2 ? 'glow2' : 'glow', [0, 0, 0], SIDE);
      }
      // hex nodes along the outer edge
      if (!far) for (let i = 0; i < 4; i++) {
        const p = q(0.3 + i * 0.18, -wR - 0.02);
        b.add(b.cyl(0.035, 0.035, 0.09, 6), S, i % 2 ? 'trim' : 'paint', [0, p[1], p[0]], [0, 0, PI / 2]);
      }
    }
    // the V's vertex: a gold keystone under the eye with a cyan lamp
    b.add(fin(b, [[-0.12, 0], [0.12, 0], [0, -0.16]], 0.1, 0.01), S, 'paint', [0, -0.56, 0], SIDE);
    lamp(b, S, [0.055, -0.6, 0], [0, 0, PI / 2], 0.025, 'glow2');
    // dashed Protocol HUD ring around the eye
    for (let i = 0; i < 24; i++) {
      if (i % 6 === 5) continue;
      const a = i / 24 * PI * 2;
      b.add(fin(b, sector(0.74, 0.765, a, a + PI * 2 / 24 * 0.6, 2), 0.02, 0.003), S, 'glow2', [0.03, 0, 0], SIDE);
    }
  });
}

function build(b, o) {
  iris(b, o);
  lids(b, o);
  disc(b, o);
  core(b, o);
  engine(b, o);
  crown(b, o);
  tail(b, o);
  if (o.rank >= 5) primeV(b, o);
}

// ---------- anims ----------
// lids: open 0..1 (eyelids part, about X), spread 0..1 (lids swing out like wings, about Z)
function lidsPose(P, open, spread, t, flick = 0) {
  for (const s of SIDES) {
    const ph = s === 'L' ? 0 : 1.7, br = Math.sin(t * 1.3 + ph) * 0.04;
    L.RS(P, 'clav', s, 0, 0, 0);
    L.RS(P, 'upArm', s, -open * 0.95 - br - flick, 0, -spread * 1.15);
    L.RS(P, 'foreArm', s, open * 0.95 + br + flick, 0, spread * 1.15);
  }
}
function base(P, ctx, t, k = 1) {
  const st = ctx.st;
  L.pel(P, Math.sin(t * 0.6) * 0.02 * k, Math.sin(t * 1.4) * 0.045 * k, 0);
  L.R(P, 'pelvis', 0.03 * Math.sin(t * 0.9) * k, 0, 0.025 * Math.sin(t * 0.7) * k);
  L.R(P, 'spine', -0.02, 0, 0);
  L.R(P, 'chest', 0.02 * Math.sin(t * 1.1) * k, st.gy * 0.12, 0);
  L.R(P, 'neck', 0, 0, 0);
  L.R(P, 'head', st.gp * 0.35, st.gy * 0.5, st.tilt * 0.5);
  L.R(P, 'thighL', 0.1 * Math.sin(t * 1.2) * k, 0, 0.06 * Math.sin(t * 0.8) * k);
  L.R(P, 'shinL', 0.16 * Math.sin(t * 1.2 - 0.8) * k, 0, 0.08 * Math.sin(t * 0.8 - 0.6) * k);
  L.R(P, 'footL', 0.2 * Math.sin(t * 1.2 - 1.6) * k, 0, 0);
  lidsPose(P, 0, 0, t);
}

const anims = {
  idle(P, t, ctx) {
    base(P, ctx, t);
    // every ~7 s the eye "blinks" open and looks around
    const c = t % 7.3, look = L.kf(c, [[0, 0], [4.6, 0], [5.0, 1], [6.2, 1], [6.6, 0]]);
    lidsPose(P, 0.25 * look, 0, t);
    L.A(P, 'chest', 0, 0.25 * Math.sin(c * 1.5) * look, 0);
  },
  advance(P, t, ctx) {
    base(P, ctx, t);
    L.A(P, 'pelvis', 0.2, 0, 0); L.A(P, 'chest', 0.08, 0, 0);
    L.A(P, 'thighL', 0.35, 0, 0); L.A(P, 'shinL', 0.3, 0, 0); L.A(P, 'footL', 0.3, 0, 0);
    lidsPose(P, 0, 0.08, t);
  },
  // VOID BOLT (the mage basic in battle): lids part, the hole pulses, a bolt leaves the mouth at 0.45, lids snap shut
  cast(P, u, ctx) {
    ctx.castU = u;
    base(P, ctx, ctx.t);
    const open = L.kf(u, [[0, 0], [0.32, 1], [0.48, 1.15], [0.7, 0.6], [0.85, 0], [1, 0]]), kick = L.kf(u, [[0, 0], [0.43, 0], [0.48, 1], [0.75, 0], [1, 0]]);
    const draw = L.kf(u, [[0, 0], [0.4, 1], [0.48, 0], [1, 0]]);
    lidsPose(P, open, 0.1 * open, ctx.t);
    L.A(P, 'pelvis', -0.12 * kick + 0.06 * draw, 0, 0); L.A(P, 'chest', -0.1 * kick + 0.08 * draw, 0, 0);
    P[L.PX + 2] += -0.1 * kick + 0.04 * draw; P[L.PX + 1] += 0.05 * draw;
    L.A(P, 'thighL', 0.3 * kick, 0, 0); L.A(P, 'shinL', 0.3 * kick, 0, 0);
  },
  // lids swing forward like a pincer and spit one bolt (fire 0.4)
  attack(P, u, ctx) {
    base(P, ctx, ctx.t);
    const k = L.kf(u, [[0, 0], [0.3, 1], [0.7, 1], [1, 0]]), snap = L.kf(u, [[0, 0], [0.34, 0], [0.4, 1], [0.6, 0.5], [1, 0]]);
    lidsPose(P, 0.9 * k - 0.6 * snap, 0.25 * k, ctx.t);
    L.A(P, 'chest', 0.12 * snap - 0.08 * k, 0, 0);
    P[L.PX + 2] += 0.08 * snap - 0.05 * k;
  },
  // upper lid flicks a bolt (0.32), then the lower lid (0.58)
  attack_alt(P, u, ctx) {
    base(P, ctx, ctx.t);
    const up = L.kf(u, [[0, 0], [0.22, 1], [0.32, -0.2], [0.45, 0], [1, 0]]), lo = L.kf(u, [[0, 0], [0.4, 0], [0.5, 1], [0.58, -0.2], [0.72, 0], [1, 0]]);
    for (const s of SIDES) { L.AS(P, 'upArm', s, -0.9 * up, 0, -0.15 * up); L.AS(P, 'foreArm', s, 0.9 * lo, 0, 0.15 * lo); }
    L.A(P, 'chest', 0.1 * Math.max(0, -up) - 0.08 * up, 0, 0);
    L.A(P, 'pelvis', 0.08 * lo, 0, 0);
  },
  // COLLAPSE: rises, lids fly apart into wings (cast 0.05), the core swells (tick) and is hurled at 0.17, hangs spread, settles
  overdrive(P, u, ctx) {
    ctx.odU = u;
    base(P, ctx, ctx.t, 0.4);
    const rise = L.kf(u, [[0, 0], [0.15, 1], [0.82, 1], [1, 0]]);
    const open = L.kf(u, [[0, 0], [0.08, 1.2], [0.85, 1.1], [1, 0]]), spread = L.kf(u, [[0, 0], [0.12, 0.6], [0.17, 1], [0.8, 0.95], [0.96, 0]]);
    const recoil = L.kf(u, [[0, 0], [0.15, 0], [0.19, 1], [0.4, 0.2], [1, 0]]);
    P[L.PX + 1] += 0.3 * rise; P[L.PX + 2] += -0.14 * recoil;
    L.A(P, 'pelvis', -0.15 * recoil, 0, 0); L.A(P, 'chest', -0.12 * rise - 0.15 * recoil, 0, 0);
    L.A(P, 'head', -0.3 * rise, 0, 0);
    lidsPose(P, open, spread, ctx.t, 0.06 * Math.sin(ctx.t * 30) * rise);
    L.A(P, 'thighL', -0.3 * rise, 0, 0); L.A(P, 'shinL', -0.3 * rise, 0, 0); L.A(P, 'footL', -0.2 * rise, 0, 0);
  },
  hit(P, u, ctx) {
    base(P, ctx, ctx.t);
    const k = L.kf(u, [[0, 0], [0.12, 1], [1, 0]]), d = ctx.st.hitDir;
    L.A(P, 'pelvis', -0.3 * k, 0.1 * k * d, 0.15 * k * d); P[L.PX + 2] -= 0.12 * k;
    L.A(P, 'head', -0.25 * k, 0, 0.2 * k * d);
    lidsPose(P, 0.35 * k, 0.1 * k, ctx.t, 0.15 * Math.sin(u * 40) * k);
    L.A(P, 'thighL', 0.4 * k, 0, 0.2 * k * d);
  },
  // the hole collapses (tick shrinks the core), lids fall open and limp, it drops and tips onto its side (down 0.6)
  die(P, u, ctx) {
    ctx.dieU = u;
    base(P, ctx, ctx.t * (1 - u), 1 - u);
    const fall = L.kf(u, [[0, 0], [0.2, 0.12], [0.6, 1], [0.7, 0.93], [0.8, 1], [1, 1]]), k = L.smooth(u);
    const g = 0.42 - ctx.D.pelvisY;
    P[L.PX + 1] += 0.1 * L.kf(u, [[0, 0], [0.2, 1], [0.35, 0]]) + g * fall;
    L.A(P, 'pelvis', 0, 0.3 * k, 1.15 * L.kf(u, [[0, 0], [0.45, 0.2], [0.65, 1], [1, 1.05]]));
    L.A(P, 'chest', 0.2 * k, 0, 0);
    L.A(P, 'head', 0.6 * k, 0, 0.3 * k);
    lidsPose(P, 0.6 * k, 0.5 * k, 0, 0);
    for (const s of SIDES) L.AS(P, 'foreArm', s, 0.4 * k, 0, 0.3 * k);
    L.A(P, 'thighL', -0.8 * k, 0, 0); L.A(P, 'shinL', 0.6 * k, 0, 0);
  },
  // victory: rises, lids open wide and hold, a slow full turn of the disc (post) + head bob
  victory(P, t, ctx) {
    base(P, ctx, t);
    const k = L.smooth(Math.min(1, t / 0.8));
    P[L.PX + 1] += (0.2 + Math.sin(t * 2) * 0.04) * k;
    L.A(P, 'chest', -0.12 * k, Math.sin(t * 0.9) * 0.3 * k, 0);
    L.A(P, 'head', -0.2 * k, 0, 0);
    lidsPose(P, 0.8 * k, 0.55 * k + 0.1 * Math.sin(t * 2.2) * k, t);
  },
  // blink-in: lids sealed, the core grows from a point (tick), tail unfurls, lids open (ready 0.8)
  deploy(P, u, ctx) {
    ctx.depU = u;
    base(P, ctx, ctx.t);
    const curl = L.kf(u, [[0, 1], [0.45, 1], [0.8, 0], [1, 0]]), open = L.kf(u, [[0, 0], [0.6, 0], [0.75, 1], [1, 0]]);
    lidsPose(P, open * 0.8, 0.3 * curl, ctx.t);
    P[L.PX + 1] += 0.25 * curl;
    L.A(P, 'thighL', -0.9 * curl, 0, 0); L.A(P, 'shinL', -1.0 * curl, 0, 0); L.A(P, 'footL', -0.8 * curl, 0, 0);
  },
};

// ---------- lens billboard (true black core + photon ring, R3+) ----------
const LENS_VS = /* glsl */`
uniform float uSize; varying vec2 vUv;
void main() {
  vUv = position.xy;
  vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  float sc = length(modelMatrix[0].xyz);
  mv.xy += position.xy * uSize * sc;
  mv.z += 0.42 * sc;
  gl_Position = projectionMatrix * mv;
}`;
const LENS_FS = /* glsl */`
uniform float uTime, uLife, uHz; uniform vec3 uRing, uOuter; varying vec2 vUv;
void main() {
  float r = length(vUv);
  if (r > 1.0) discard;
  float a = atan(vUv.y, vUv.x);
  float inside = 1.0 - smoothstep(uHz - 0.015, uHz + 0.01, r);
  float rr = (r - uHz - 0.035) / 0.022; float ring = exp(-rr * rr);
  float halo = exp(-max(r - uHz, 0.0) * 6.0) * step(uHz, r);
  float sw = 0.5 + 0.5 * sin(a * 3.0 + 6.0 / max(r, 0.2) - uTime * 3.5);
  float edge = 1.0 - smoothstep(0.75, 1.0, r);
  vec3 col = mix(uOuter, uRing, smoothstep(0.75, uHz + 0.04, r)) * (ring * 1.2 + halo * (0.2 + 0.8 * sw) * 0.7);
  float al = clamp(ring * 1.1 + halo * (0.2 + 0.45 * sw), 0.0, 1.0) * edge;
  gl_FragColor = vec4(col * uLife * (1.0 - inside), max(inside * min(1.0, uLife * 3.0), al * uLife));
}`;
let LENS_GEO = null;
function lensFor(unit) {
  const R5 = unit.rank >= 5 && unit.boss;   // Prime colours: boss only (kit round 4)
  if (!LENS_GEO) LENS_GEO = new THREE.PlaneGeometry(2, 2);
  const m = new THREE.Mesh(LENS_GEO, new THREE.ShaderMaterial({
    uniforms: { uSize: { value: 0.62 }, uTime: { value: 0 }, uLife: { value: 1 }, uHz: { value: 0.4 },
      uRing: { value: new THREE.Color(...(R5 ? [0.35, 1.5, 1.9] : [1.9, 1.25, 0.45])) }, uOuter: { value: new THREE.Color(...(R5 ? [0.8, 0.22, 1.6] : [1.0, 0.35, 1.5])) } },
    vertexShader: LENS_VS, fragmentShader: LENS_FS, transparent: true, depthWrite: false,
  }));
  markNoBloom(m.material);
  m.frustumCulled = false; m.renderOrder = 7; m.castShadow = false; m.name = 'singularity-lens';
  unit.bones[BI.aux3].add(m);
  const dis = unit.dispose.bind(unit);
  unit.dispose = () => { m.material.dispose(); m.removeFromParent(); dis(); };
  unit.extraDrawCalls = () => (m.visible ? 1 : 0);
  return m;
}

export default {
  id: 'singularity', name: 'SINGULARITY', role: 'mage', faction: 'experimental', rarity: 'legendary', realm: 'scifi',
  rig: 'hover', dims: DIMS, height: 1.75, radius: 0.7, walkSpeed: 1.0, scheme: 'dark', noDrop: true,
  style: { weapon: 'orbs' },
  glow2: 0x2ee6ff,
  motes: { color: 0xffc46a, size: 0.12 },
  paint: {
    experimental: { paint: 0xd9a032, accent: 0x14111c, trim: 0xd9c8ff },
    corporate: { paint: 0xd9a032, accent: 0x111722, trim: 0xd8f4ff },
    rogue: { paint: 0xd9a032, accent: 0x18100e, trim: 0xff8a5a },
    legendary: { paint: 0xd9a032, accent: 0x17151a, trim: 0xf6e3b0 },
  },
  mats: {
    all: {
      paint: { metal: 0.82, rough: 0.24, coat: 0.8, env: 1.0, emissive: 0x1a0d00, ei: 1 },
      accent: { metal: 0.6, rough: 0.26, coat: 1, env: 0.6 },
      trim: PLAT,
      eye: { color: 0xffc860, ei: 3.2 },
      glow: { ei: 3.0 },
      glow2: { ei: 2.2 },
    },
    experimental: { trim: { ...PLAT, color: 0xd9c8ff } }, corporate: { trim: { ...PLAT, color: 0xd8f4ff } }, rogue: { trim: { ...PLAT, color: 0xff8a5a } },
  },
  sockets: { muzzle: ['chest', [0, 0, 0.62]], core: [0, 0, 0], head: [0, 0.12, 0.05], hole: ['aux3', [0, 0, 0]], crown: ['head', [0, 0.3, 0]] },
  events: { cast: [['fire', 0.45]], attack: [['fire', 0.4]], attack_alt: [['fire', 0.32], ['fire', 0.58]], overdrive: [['cast', 0.05], ['fire', 0.17]], die: [['down', 0.62]], deploy: [['ready', 0.8]] },
  durs: { cast: 1.0, attack: 1.0, attack_alt: 1.2, overdrive: 2.6, hit: 0.5, die: 2.0, deploy: 1.5 },
  anims,
  post(P, ctx, act) {
    const t = ctx.t, n = act?.name;
    const fast = n === 'overdrive' ? 4 : n === 'victory' || ctx.loopV ? 1.6 : n === 'die' ? 0.4 * (1 - (ctx.dieU || 0)) : 1;
    const i2 = BI.aux2 * 3, i3 = BI.aux3 * 3;
    ctx.discA = (ctx.discA || 0) + (ctx._lt === undefined ? 0 : Math.max(0, t - ctx._lt)) * 1.1 * fast;
    ctx._lt = t;
    P[i2] = n === 'die' ? 0.5 * L.smooth(ctx.dieU || 0) : 0.06 * Math.sin(t * 0.7); P[i2 + 1] = ctx.discA; P[i2 + 2] = 0.05 * Math.cos(t * 0.5);
    P[i3] = 0; P[i3 + 1] = -ctx.discA * 0.6; P[i3 + 2] = 0;
  },
  tick(unit, dt, ctx, bones) {
    const a = unit.state.action, t = ctx.t;
    // R5: keep the great V square to the side-on battle camera while the unit turns toward its targets (clamped +-0.8 rad)
    if (unit.rank >= 5 && unit.boss) {
      const y = unit.root.rotation.y, w = Math.atan2(Math.sin(PI / 2 - y), Math.cos(PI / 2 - y));
      const f = w > PI / 2 ? w - PI : w < -PI / 2 ? w + PI : w;
      bones[BI.aux0].rotation.y = Math.max(-0.8, Math.min(0.8, f));
    }
    // crown floats with its own bob (separated segment)
    const hb = bones[BI.head];
    if (!ctx.headY) ctx.headY = hb.position.y;
    hb.position.y = ctx.headY + 0.025 * Math.sin(t * 2.1);
    // core scale: swells in the overdrive windup, shrinks after the throw, collapses on death, grows from a point on deploy
    let tgt = 1;
    if (a === 'overdrive') tgt = L.kf(ctx.odU || 0, [[0, 1], [0.12, 1.7], [0.17, 1.8], [0.22, 0.35], [0.75, 0.5], [0.95, 1]]);
    else if (a === 'die' || unit.state.dead) tgt = L.kf(ctx.dieU ?? 1, [[0, 1], [0.15, 1.4], [0.3, 0.05], [1, 0.02]]);
    else if (a === 'deploy') tgt = L.kf(ctx.depU || 0, [[0, 0.02], [0.35, 0.02], [0.6, 1.3], [0.8, 1]]);
    else if (a === 'cast') tgt = 1 + 0.25 * Math.sin(Math.PI * Math.min(1, (ctx.castU ?? 0)));
    ctx.coreK = ctx.coreK === undefined ? tgt : ctx.coreK + (tgt - ctx.coreK) * (1 - Math.exp(-dt * 14));
    bones[BI.aux3].scale.setScalar(Math.max(0.01, ctx.coreK));
    if (a !== 'overdrive') ctx.odU = 0;
    if (a !== 'cast') ctx.castU = 0;
    if (a !== 'die' && !unit.state.dead) ctx.dieU = undefined;
    if (a !== 'deploy') ctx.depU = 1;
    // lensing billboard: true black hole + photon ring (every rank; brighter photon ring from R3)
    {
      if (!ctx.lens) ctx.lens = lensFor(unit);
      const u = ctx.lens.material.uniforms;
      u.uTime.value = t;
      u.uLife.value = unit.state.dead ? 0 : (a === 'overdrive' ? 1.6 : 1) * (unit.rank >= 3 ? 1 : 0.6 + unit.rank * 0.15);
      ctx.lens.visible = ctx.coreK > 0.04;
    }
  },
  fxHints: { projectile: 'void_bolt', impact: 'implode', overdrive: 'collapse', color: 0xb24dff },
  // robots kit round 4: the Prime form (rank-5 geometry) is reserved for the boss (o.boss); a player's R5 SINGULARITY builds the R4
  // geometry and keeps the R5 kit cues (materials, motes, aura ring use the real rank).
  build: (b, o) => build(b, o.boss ? o : { ...o, rank: Math.min(o.rank, 4) }),
};
