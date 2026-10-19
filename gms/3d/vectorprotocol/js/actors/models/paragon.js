// PARAGON, corporate legendary mage "Orbital Oracle" (sculptor-20). Brief: docs/ROSTER.md `paragon`. Also map 7's boss AURELIAN
// (boss_aurelian, "Novaline's answer to everything": battle passes rank 5, x1.35, red ring).
// A floating robed oracle: serene porcelain mask with closed eyes, a tall mitre crest crowned by the celestial uplink antenna, a standing fan collar, a bell robe of white lamellar plates over a navy core (no legs), long bell sleeves, and the signature:
// six hexagonal mirror satellites orbiting in a tilted ring. Basic: a palm beam bounces off the nearest mirror onto the target.
// Overdrive: the ring launches straight up out of frame, then the lance comes down from orbit.
// VALUE: `paint` = white ceramic (robe plates, mask, cuirass, collar), `accent` = deep navy (robe core, sleeves, satellite housings),
// `metal` = black mirror chrome (satellite mirrors, undersuit, hood), `trim` = gold (hems, frames, circlet, rays; kit gold at
// legendary), `glow` = faction cyan (lenses, seams, chest lens), `eye` = warm white light (eyes, antenna tip, trails, smile).
// Rank tiers (legendary default R3): R0 battered: cracked mask, one satellite missing + one shattered mirror, gaps in the robe,
//   bent dull antenna · R1 six plain satellites, plain robe · R2 satellite solar wings, fuller collar fan, pauldron layers, gold
//   orbit track, plate studs · R3 (base) glowing satellite lenses, robe seams, uplink rings + hem light · R4 robe plates multiply
//   (outer tasset layer), hardlight orbit ring, crest blades (silhouette) · R5 = AURELIAN: a gold sunburst aureole behind the head,
//   comet trails on bigger satellites, the mask smiles, a sun on the chest.
// Rig: hover, no legs. aux2 (pelvis) = the tilted orbit gimbal, aux3 (aux2) = the spinning satellite ring, aux0 (chest) = the
// R5 aureole (spins about its own tilted axis), aux1 (head) = uplink antenna rings. All driven in tick().
import { THREE, P, PS, plate, fin, LIB, PI, BI } from '../kit.js';

const L = LIB;
const SIDES = ['L', 'R'];
const DIMS = {
  hover: 0.92, thigh: 0, shin: 0, ankle: 0, hipX: 0.08, hipY: 0, spine: 0.12, chest: 0.22, neck: 0.2, headOff: 0.05,
  clavX: 0.05, clavY: 0.17, shoulder: 0.16, upArm: 0.26, foreArm: 0.25,
  parents: { aux3: 'aux2' },
  aux0: [0, 0.37, -0.17], aux1: [0, 0.39, -0.11], aux2: [0, 0.36, 0], aux3: [0, 0, 0],
};
const RR = 0.62;           // satellite orbit radius
const OD_REL = 0.17;
const RING_TILT = [0.32, 0, 0.22];
const AUR_TILT = -0.62;

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
const satDir = (i) => { const a = (i / 6) * PI * 2 + PI / 6; return [Math.cos(a), 0, Math.sin(a)]; };

// ---------- greebles ----------
function lamp(b, bone, pos, rot, r = 0.018, slot = 'glow', mirror = true) {
  const put = mirror ? b.sym.bind(b) : b.add.bind(b);
  put(b.cyl(r * 1.5, r * 1.5, 0.014, 12), bone, 'paint', pos, rot);
  put(b.cyl(r, r, 0.022, 12), bone, slot, pos, rot);
}

// ---------- head: porcelain mask, mitre crest, uplink ----------
function head(b, o) {
  const rk = o.rank, far = b.far, H = 'head';
  // dark mirror hood shell behind the mask
  b.add(b.sph(20, 14), H, 'metal', [0, 0.1, -0.03], [0, 0, 0], [0.1, 0.122, 0.104]);
  // the mask: smooth porcelain ovoid, a little long
  b.add(b.sph(26, 20), H, 'accent', [0, 0.094, 0.036], [0, 0, 0], [0.082, 0.11, 0.076]);
  // gold brow line + cheek seams
  b.add(b.tor(0.072, 0.0055, 24, 4, PI * 0.7), H, 'paint', [0, 0.1, 0.05], [0.12, 0, PI * 0.15]);
  if (!far) b.sym(b.cbox(0.006, 0.05, 0.012, 0.002), H, 'paint', [0.056, 0.05, 0.088], [0.1, 0.5, 0.25]);
  // closed eyes: serene lids (U) on R0-R4; AURELIAN's are smiling crescents (n) over a thin smile
  const smile = rk >= 5;
  b.sym(b.tor(0.021, 0.0055, 12, 4, PI), H, 'eye', [0.033, smile ? 0.104 : 0.11, 0.104], [-0.12, 0.32, smile ? 0 : PI]);
  if (smile) b.add(b.tor(0.034, 0.005, 16, 4, PI), H, 'eye', [0, 0.06, 0.104], [0.2, 0, PI]);
  // forehead gem
  b.add(b.cyl(0.014, 0.014, 0.014, 6), H, rk >= 1 ? 'glow' : 'metal', [0, 0.158, 0.094], [PI / 2 - 0.35, 0, 0]);
  if (rk === 0) {
    // cracked mask: a dark fracture across the right cheek, a chipped edge
    b.add(b.cbox(0.006, 0.07, 0.012, 0.002), H, 'metal', [-0.03, 0.07, 0.1], [0.15, -0.3, 0.6]);
    b.add(b.cbox(0.005, 0.035, 0.012, 0.002), H, 'metal', [-0.05, 0.045, 0.092], [0.15, -0.4, -0.4]);
  }
  // circlet (gold band round the head)
  b.add(b.tor(0.094, 0.011, 30, 5), H, 'paint', [0, 0.15, -0.005], [PI / 2 + 0.2, 0, 0]);
  if (!far) for (let i = 0; i < 5; i++) {
    const a = -0.9 + i * 0.45;
    b.add(b.cbox(0.016, 0.026, 0.016, 0.004), H, i === 2 ? 'glow' : 'paint', [Math.sin(a) * 0.098, 0.16 + 0.018 * Math.cos(a), Math.cos(a) * 0.098 - 0.01], [0.2, a, 0]);
  }
  // mitre crest rising back from the brow
  b.scope([0, 0.135, -0.035], [-0.28, 0, 0], 1, () => {
    const crest = [[-0.072, 0], [0.072, 0], [0.062, 0.16], [0, 0.27], [-0.062, 0.16]];
    b.add(b.ext(crest, 0.09, 0.012), H, 'accent', [0, 0, 0]);
    b.add(b.ext(crest.map(([x, y]) => [x * 1.16, y * 1.07 - 0.008]), 0.05, 0.006), H, 'paint', [0, 0, -0.012]);
    b.add(b.cbox(0.012, 0.2, 0.094, 0.003), H, rk >= 3 ? 'glow' : 'metal', [0, 0.13, 0]);
    if (!far) for (const s of [1, -1]) b.add(b.cbox(0.008, 0.12, 0.094, 0.002), H, 'paint', [s * 0.032, 0.1, 0], [0, 0, s * 0.12]);
    // R4: swept hardlight blades off the crest's flanks (silhouette change)
    if (rk >= 4) {
      b.sym(fin(b, [[0, 0], [0.04, 0], [0.17, 0.2], [0.13, 0.22]], 0.026, 0.005), H, 'accent', [0.05, 0.08, 0], [0, 0, -0.1]);
      b.sym(fin(b, [[0.03, 0.02], [0.05, 0.02], [0.16, 0.19], [0.145, 0.2]], 0.03, 0.003), H, 'glow', [0.05, 0.08, 0], [0, 0, -0.1]);
    }
  });
  // neck: black chrome column, gold rings
  b.add(b.cyl(0.04, 0.05, 0.2, 12), 'neck', 'metal', [0, -0.07, 0]);
  if (!far) for (let i = 0; i < 2; i++) b.add(b.tor(0.048, 0.006, 16, 4), 'neck', 'paint', [0, -0.11 + i * 0.06, 0], [PI / 2, 0, 0]);
}

// uplink antenna on aux1 (sits at the crest tip): mast, rings, light at the top. R0: bent, dark.
function uplink(b, o) {
  const rk = o.rank, far = b.far, H = 'aux1';
  const bend = rk === 0 ? [0, 0, 0.5] : [0, 0, 0];
  b.add(b.cyl(0.026, 0.03, 0.03, 10), H, 'paint', [0, 0.0, 0]);
  b.scope([0, 0.01, 0], bend, 1, () => {
    b.add(b.cyl(0.005, 0.009, 0.24, 8), H, 'paint', [0, 0.12, 0]);
    const n = rk >= 2 ? 3 : 2;
    for (let i = 0; i < n; i++) b.add(b.tor(0.032 - i * 0.008, 0.004, 16, 3), H, rk >= 3 ? 'glow' : 'paint', [0, 0.06 + i * 0.055, 0], [PI / 2, 0, 0]);
    b.add(b.sph(10, 8), H, rk === 0 ? 'metal' : 'eye', [0, 0.25, 0], [0, 0, 0], 0.017);
    if (!far && rk >= 1) for (let i = 0; i < 4; i++) b.add(fin(b, [[-0.006, 0], [0.006, 0], [0, 0.05]], 0.004, 0.001), H, 'paint', [0, 0.25, 0], [0, i * PI / 2, PI / 2]);
  });
}

// ---------- torso, collar ----------
function torso(b, o) {
  const rk = o.rank, far = b.far;
  // chest: black core, white cuirass, navy flanks, gold V, the chest lens
  P(b, 'chest', 'metal', [0.25, 0.26, 0.18], [0, 0.1, -0.01], [0, 0, 0], { c: 0.03 });
  P(b, 'chest', 'accent', [0.36, 0.26, 0.22], [0, 0.11, 0.012], [0.06, 0, 0], { c: 0.05, tx: 1.15, bx: 0.62, bz: 0.82 });
  PS(b, 'chest', 'metal', [0.07, 0.17, 0.17], [0.155, 0.08, -0.005], [0, 0, 0.22], { c: 0.02, bx: 0.7 });
  b.add(b.ext([[-0.11, 0.06], [-0.09, 0.06], [0, -0.06], [0.09, 0.06], [0.11, 0.06], [0, -0.09]], 0.02, 0.004), 'chest', 'paint', [0, 0.1, 0.122], [0.06, 0, 0]);
  const sun = rk >= 5;
  b.add(b.tor(0.046, 0.009, 24, 4), 'chest', 'paint', [0, 0.14, 0.124], [0.06, 0, 0]);
  b.add(b.cyl(0.04, 0.04, 0.02, 24), 'chest', sun ? 'eye' : 'glow', [0, 0.14, 0.12], [PI / 2 + 0.06, 0, 0]);
  b.add(b.cyl(0.016, 0.016, 0.024, 12), 'chest', sun ? 'paint' : 'eye', [0, 0.14, 0.124], [PI / 2 + 0.06, 0, 0]);
  if (sun) for (let i = 0; i < 12; i++) {
    const a = (i / 12) * PI * 2, len = i % 2 ? 0.035 : 0.06;
    b.add(fin(b, [[-0.008, 0], [0.008, 0], [0, len]], 0.012, 0.002), 'chest', 'paint', [Math.cos(a) * 0.058, 0.14 + Math.sin(a) * 0.058, 0.126], [0.06, 0, a - PI / 2]);
  }
  // gold gorget band
  b.add(b.tor(0.1, 0.014, 24, 5, PI * 1.15), 'chest', 'paint', [0, 0.235, 0.02], [PI / 2 + 0.2, 0, PI * 0.5 - PI * 0.575]);
  if (!far) for (let i = 0; i < 3; i++) b.sym(b.cbox(0.045 - i * 0.008, 0.01, 0.02, 0.003), 'chest', 'metal', [0.075, 0.03 + i * 0.03, 0.118], [0.05, 0.3, -0.3]);
  if (rk >= 2 && !far) b.sym(b.cyl(0.008, 0.008, 0.01, 8), 'chest', 'paint', [0.12, 0.17, 0.11], [PI / 2, 0, 0]);
  // waist: black chrome column with gold rings
  b.add(b.cyl(0.085, 0.105, 0.16, 14), 'spine', 'metal', [0, 0.05, 0]);
  if (!far) for (let i = 0; i < 2; i++) b.add(b.tor(0.098 - i * 0.008, 0.008, 18, 4), 'spine', 'paint', [0, 0.0 + i * 0.07, 0], [PI / 2, 0, 0]);
  P(b, 'spine', 'accent', [0.13, 0.1, 0.05], [0, 0.06, 0.085], [0.08, 0, 0], { c: 0.015, bx: 0.7 });
  // back: a small uplink pack between the shoulders
  P(b, 'chest', 'metal', [0.2, 0.18, 0.08], [0, 0.12, -0.12], [0, 0, 0], { c: 0.025, tx: 0.8 });
  if (!far) for (let i = 0; i < 3; i++) b.add(b.cbox(0.13, 0.012, 0.02, 0.004), 'chest', 'metal', [0, 0.07 + i * 0.035, -0.165]);
  lamp(b, 'chest', [0.07, 0.19, -0.16], [PI / 2, 0, 0], 0.012, 'glow');
}

// mantle: layered gold-edged blades rising off the shoulders (fixed to the chest so they stay put when the arms lift)
function mantle(b, o) {
  const rk = o.rank, far = b.far;
  const n = rk >= 2 ? 3 : 2;
  for (let i = 0; i < n; i++) {
    const k = 1 - i * 0.18, sh = [[0, 0], [0.09 * k, -0.01], [0.21 * k, 0.15 * k], [0.19 * k, 0.22 * k], [0.04, 0.08 * k]];
    const pos = [0.17 + i * 0.035, 0.19 - i * 0.04, -0.05 - i * 0.03], rot = [-0.4 - i * 0.1, 0.3, -0.3 - i * 0.28];
    b.sym(fin(b, sh, 0.028, 0.006), 'chest', i === 1 ? 'paint' : 'accent', pos, rot);
    b.sym(fin(b, sh.map(([x, y]) => [x * 1.08 - 0.004, y * 1.08 - 0.004]), 0.014, 0.003), 'chest', 'paint', [pos[0], pos[1], pos[2] - 0.016], rot);
    if (rk >= 3 && i === 0 && !far) b.sym(b.cbox(0.008, 0.12, 0.03, 0.002), 'chest', 'glow', [pos[0] + 0.09, pos[1] + 0.06, pos[2] + 0.004], [rot[0], rot[1], rot[2] - 0.65]);
  }
}

// standing fan collar framing the mask (big read from the high battle camera)
function collar(b, o) {
  const rk = o.rank, far = b.far;
  const n = far ? 5 : rk >= 2 ? 7 : 5, span = rk >= 2 ? 1.75 : 1.5;
  for (let i = 0; i < n; i++) {
    const phi = -span + (i / (n - 1)) * span * 2, mid = 1 - Math.abs(phi) / span;
    const h = 0.17 + 0.07 * mid;
    b.scope([Math.sin(phi) * 0.135, 0.255, -Math.cos(phi) * 0.135 + 0.01], [0, PI - phi, 0], 1, () => {
      b.scope([0, 0, 0], [0.42, 0, 0], 1, () => {
        b.add(plate(b, 0.085, h, 0.018, { c: 0.008, tx: 0.55 }), 'chest', 'accent', [0, h / 2, 0]);
        b.add(plate(b, 0.095, h + 0.02, 0.01, { c: 0.004, tx: 0.5 }), 'chest', 'paint', [0, h / 2, -0.011]);
        if (rk >= 3 && i % 2 === 0) b.add(b.cbox(0.01, h * 0.55, 0.02, 0.003), 'chest', 'glow', [0, h * 0.45, 0.006]);
      });
    });
  }
}

// ---------- robe: navy bell core under white lamellar plates ----------
function robe(b, o) {
  const rk = o.rank, far = b.far;
  const B = 'pelvis';
  b.add(b.lathe([[0.0, 0.03], [0.17, 0.03], [0.2, -0.16], [0.25, -0.45], [0.3, -0.72], [0.27, -0.78], [0.0, -0.78]], 28), B, 'metal', [0, 0, 0]);
  // girdle
  b.add(b.cyl(0.18, 0.195, 0.09, 24), B, 'metal', [0, 0.0, 0]);
  b.add(b.tor(0.19, 0.016, 32, 5), B, 'paint', [0, 0.04, 0], [PI / 2, 0, 0]);
  b.add(b.tor(0.197, 0.012, 32, 5), B, 'paint', [0, -0.04, 0], [PI / 2, 0, 0]);
  b.add(b.cyl(0.04, 0.04, 0.02, 6), B, 'paint', [0, 0.0, 0.2], [PI / 2, 0, 0]);
  b.add(b.cyl(0.022, 0.022, 0.024, 6), B, 'glow', [0, 0.0, 0.205], [PI / 2, 0, 0]);
  const N = far ? 8 : 12;
  for (let i = 0; i < N; i++) {
    if (rk === 0 && i % 4 === 2) continue;
    const a = (i / N) * PI * 2, back = Math.max(0, -Math.cos(a));
    const len = (rk === 0 ? 0.6 : 0.72) + 0.1 * back, wb = (2 * PI * 0.31) / N * 0.98, wt = (2 * PI * 0.19) / N;
    const rc = 0.262 + 0.01 * back, yc = -0.05 - len / 2;
    b.scope([Math.sin(a) * rc, yc, Math.cos(a) * rc], [0, a, 0], 1, () => {
      b.scope([0, 0, 0], [-0.17 - 0.03 * back, 0, 0], 1, () => {
        b.add(plate(b, wb, len, 0.03, { c: 0.012, tx: wt / wb, tz: 0.8 }), B, 'paint', [0, 0, 0]);
        // two-tone vestment: navy lower panel under a gold band, gold hem
        const lo = len * 0.3, wl = wb * 0.97;
        b.add(plate(b, wl, lo, 0.03, { c: 0.01, tx: 1 - (1 - wt / wb) * 0.3 }), B, 'metal', [0, -len / 2 + lo / 2 + 0.03, 0.01]);
        b.add(b.cbox(wb * 0.96 - (wb - wt) * 0.3, 0.022, 0.04, 0.006), B, 'accent', [0, -len / 2 + lo + 0.035, 0.012]);
        b.add(b.cbox(wb * 0.94, 0.04, 0.042, 0.008), B, 'paint', [0, -len / 2 + 0.014, 0.008]);
        if (rk >= 2 && !far) b.add(b.cyl(0.01, 0.01, 0.014, 8), B, 'paint', [0, len / 2 - 0.05, 0.016], [PI / 2, 0, 0]);
        if (rk >= 1) b.add(b.cyl(0.012, 0.012, 0.012, 8), B, rk >= 3 ? 'glow' : 'paint', [0, -len / 2 + 0.08, 0.03], [PI / 2, 0, 0]);
      });
    });
    // glowing seams between the plates (R3+)
    if (rk >= 3) {
      const a2 = a + PI / N;
      b.scope([Math.sin(a2) * 0.25, -0.05 - len * 0.42, Math.cos(a2) * 0.25], [0, a2, 0], 1, () => {
        b.add(b.cbox(0.008, len * 0.7, 0.012, 0.003), B, 'glow', [0, 0, 0], [-0.17, 0, 0]);
      });
    }
  }
  // R4: robe plates multiply (outer tassets over the hips, gold edged)
  if (rk >= 4) {
    const M = far ? 4 : 8;
    for (let i = 0; i < M; i++) {
      const a = (i / M) * PI * 2 + PI / M, len = 0.36;
      b.scope([Math.sin(a) * 0.255, -0.06 - len / 2, Math.cos(a) * 0.255], [0, a, 0], 1, () => {
        b.scope([0, 0, 0], [-0.32, 0, 0], 1, () => {
          b.add(plate(b, 0.15, len, 0.024, { c: 0.01, tx: 0.62 }), B, 'paint', [0, 0, 0.02]);
          b.add(plate(b, 0.165, len + 0.02, 0.012, { c: 0.004, tx: 0.6 }), B, 'accent', [0, -0.008, 0.002]);
          b.add(b.cyl(0.016, 0.016, 0.012, 6), B, 'glow', [0, -len * 0.3, 0.034], [PI / 2, 0, 0]);
        });
      });
    }
  }
  // front stole: navy, gold-edged, cyan glyphs (R5: a gold sun at its foot)
  b.scope([0, -0.38, 0.262], [-0.17, 0, 0], 1, () => {
    b.add(plate(b, 0.13, 0.7, 0.03, { c: 0.01, tx: 0.75 }), B, 'metal', [0, 0, 0.022]);
    for (const sx of [1, -1]) b.add(b.cbox(0.014, 0.7, 0.036, 0.004), B, 'paint', [sx * 0.058, 0, 0.024], [0, 0, sx * 0.025]);
    for (let i = 0; i < 3; i++) b.add(b.cbox(0.032, 0.032, 0.02, 0.004), B, rk >= 1 ? 'glow' : 'paint', [0, 0.2 - i * 0.14, 0.04], [0, 0, PI / 4]);
    if (rk >= 5) {
      b.add(b.cyl(0.045, 0.045, 0.02, 20), B, 'paint', [0, -0.25, 0.042], [PI / 2, 0, 0]);
      b.add(b.cyl(0.026, 0.026, 0.024, 16), B, 'eye', [0, -0.25, 0.046], [PI / 2, 0, 0]);
    }
  });
  // hem light ring (just under the plates)
  if (rk >= 3) b.add(b.tor(0.285, 0.009, 40, 4), B, 'glow', [0, -0.78, 0], [PI / 2, 0, 0]);
  b.add(b.cyl(0.12, 0.12, 0.012, 20), B, rk >= 1 ? 'glow' : 'metal', [0, -0.785, 0]);
}

// ---------- arms: pauldrons, bell sleeves, slender hands ----------
function arms(b, o) {
  const D = b.rig.D, ua = D.upArm, fa = D.foreArm, rk = o.rank, far = b.far;
  b.sym(b.cyl(0.03, 0.03, D.shoulder, 8), 'clav', 'metal', [D.shoulder / 2, 0, 0], [0, 0, PI / 2]);
  b.sym(b.sph(12, 8), 'upArm', 'metal', [0, 0, 0], [0, 0, 0], 0.055);
  b.sym(b.sph(18, 10, 0, PI * 2, 0, PI * 0.55), 'upArm', 'accent', [0.02, 0.02, 0], [0, 0, -0.32], [0.125, 0.095, 0.125]);
  b.sym(b.tor(0.12, 0.012, 24, 4), 'upArm', 'paint', [0.035, -0.008, 0], [PI / 2, 0, -0.32], [1, 1.04, 1]);
  lamp(b, 'upArm', [0.07, 0.07, 0.04], [0, 0, -0.75], 0.013, 'glow');
  PS(b, 'upArm', 'accent', [0.1, 0.045, 0.15], [0.065, -0.06, 0], [0, 0, -0.45], { c: 0.014 });
  if (rk >= 2) {
    PS(b, 'upArm', 'metal', [0.09, 0.04, 0.14], [0.08, -0.1, 0], [0, 0, -0.55], { c: 0.012 });
    PS(b, 'upArm', 'paint', [0.095, 0.012, 0.145], [0.08, -0.123, 0], [0, 0, -0.55], { c: 0.004 });
  }
  // upper sleeve (navy) and the bell sleeve (white, gold cuff, dark opening)
  b.sym(b.cyl(0.044, 0.052, ua * 0.9, 12), 'upArm', 'metal', [0, -ua * 0.5, 0]);
  b.sym(b.sph(10, 8), 'foreArm', 'metal', [0, 0, 0], [0, 0, 0], 0.045);
  b.sym(b.cyl(0.05, 0.08, fa * 0.78, 18), 'foreArm', 'accent', [0, -fa * 0.44, 0]);
  b.sym(b.tor(0.085, 0.011, 24, 4), 'foreArm', 'paint', [0, -fa * 0.87, 0], [PI / 2, 0, 0]);
  b.sym(b.cyl(0.077, 0.077, 0.01, 18), 'foreArm', 'metal', [0, -fa * 0.875, 0]);
  b.sym(b.tor(0.054, 0.008, 18, 4), 'foreArm', 'paint', [0, -fa * 0.06, 0], [PI / 2, 0, 0]);
  if (rk >= 3) b.sym(b.cbox(0.01, fa * 0.5, 0.012, 0.003), 'foreArm', 'glow', [0, -fa * 0.48, 0.078], [0.22, 0, 0]);
  else if (!far) b.sym(b.cbox(0.01, fa * 0.5, 0.012, 0.003), 'foreArm', 'paint', [0, -fa * 0.48, 0.078], [0.22, 0, 0]);
  // hands: black chrome, gold backs, long fingers
  b.sym(b.cbox(0.045, 0.065, 0.055, 0.012), 'hand', 'metal', [0, -0.035, 0]);
  b.sym(b.cbox(0.048, 0.03, 0.03, 0.006), 'hand', 'paint', [0, -0.03, -0.018]);
  if (!far) for (let i = 0; i < 3; i++) b.sym(b.cbox(0.011, 0.07, 0.012, 0.003), 'hand', 'metal', [-0.014 + i * 0.014, -0.095, 0.006], [0.18, 0, 0]);
  b.sym(b.cyl(0.012, 0.012, 0.012, 10), 'hand', 'glow', [0, -0.04, 0.028], [PI / 2, 0, 0]);
}

// ---------- satellites (aux3 ring) + orbit track (aux2 gimbal) ----------
function satellite(b, o, i) {
  const rk = o.rank, far = b.far, H = 'aux3';
  if (rk === 0 && i === 5) return;
  const d = satDir(i), up = 0.85, s = rk >= 5 ? 1.38 : 1.25;
  const n = [d[0] * Math.cos(up), Math.sin(up), d[2] * Math.cos(up)];
  const y = [-d[0] * Math.sin(up), Math.cos(up), -d[2] * Math.sin(up)];
  const shattered = rk === 0 && i === 4;
  b.scope([d[0] * RR, 0, d[2] * RR], frame(y, n), s, () => {
    // housing, mirror (black chrome hexagon), gold hex frame, lens
    b.add(b.cbox(0.13, 0.13, 0.06, 0.02), H, 'metal', [0, 0, -0.035]);
    if (!shattered) b.add(b.cyl(0.1, 0.1, 0.016, 6), H, 'metal', [0, 0, 0.006], [PI / 2, 0, 0]);
    else b.add(b.cyl(0.1, 0.1, 0.016, 6, false, 0, PI * 0.8), H, 'metal', [0, 0, 0.006], [PI / 2, 0, 0]);
    b.add(b.tor(0.103, 0.013, 6, 4), H, 'paint', [0, 0, 0.012], [0, 0, PI / 6]);
    b.add(b.cyl(0.026, 0.026, 0.03, 14), H, rk >= 3 ? 'glow' : 'paint', [0, 0, 0.02], [PI / 2, 0, 0]);
    b.add(b.tor(0.036, 0.006, 14, 3), H, 'paint', [0, 0, 0.032]);
    if (!far) for (let k = 0; k < 3; k++) {
      const a = k * PI / 3 + PI / 6;
      b.add(b.cbox(0.006, 0.16, 0.006, 0.002), H, 'paint', [0, 0, 0.016], [0, 0, a]);
    }
    // R2+: solar wings on a gold spar
    if (rk >= 2) for (const sx of [1, -1]) {
      b.add(b.cyl(0.006, 0.006, 0.1, 6), H, 'paint', [sx * 0.15, 0, -0.035], [0, 0, PI / 2]);
      b.add(b.cbox(0.14, 0.075, 0.01, 0.003), H, 'metal', [sx * 0.27, 0, -0.035]);
      if (!far) for (let k = 0; k < 3; k++) b.add(b.cbox(0.004, 0.077, 0.013, 0.001), H, 'paint', [sx * (0.22 + k * 0.045), 0, -0.035]);
      if (rk >= 4) b.add(b.cbox(0.142, 0.008, 0.014, 0.002), H, 'paint', [sx * 0.27, 0.04, -0.035]);
    }
    // antenna + rear thruster
    b.add(b.cyl(0.004, 0.004, 0.08, 6), H, 'metal', [0, 0.13, -0.035]);
    b.add(b.sph(8, 6), H, rk >= 1 ? 'eye' : 'metal', [0, 0.175, -0.035], [0, 0, 0], 0.011);
    b.add(b.cyl(0.03, 0.04, 0.03, 10), H, 'metal', [0, 0, -0.08], [PI / 2, 0, 0]);
  });
  // R5: comet trails (light arcs behind each satellite along the orbit; the ring spins toward decreasing angle)
  if (rk >= 5) {
    const a0 = (i / 6) * PI * 2 + PI / 6;
    const segs = far ? 2 : 3;
    for (let k = 0; k < segs; k++) {
      const st = a0 + 0.16 + k * 0.13;
      b.scope([0, 0, 0], [0, -st, 0], 1, () => b.add(b.tor(RR, 0.017 - k * 0.0035, 6, 4, 0.14), H, k ? 'paint' : 'eye', [0, 0, 0], [PI / 2, 0, 0]));
    }
  }
}
function ring(b, o) {
  const rk = o.rank;
  for (let i = 0; i < 6; i++) satellite(b, o, i);
  if (rk >= 2) b.add(b.tor(RR, 0.006, 72, 3), 'aux2', 'paint', [0, 0, 0], [PI / 2, 0, 0]);
  if (rk >= 4) {
    // second gold track with bead markers (a cyan hardlight ring here bloomed into a crackling halo at battle size)
    b.add(b.tor(RR + 0.05, 0.007, 72, 3), 'aux2', 'paint', [0, 0, 0], [PI / 2, 0, 0]);
    if (!b.far) for (let i = 0; i < 18; i++) { const a = i / 18 * PI * 2; b.add(b.sph(6, 4), 'aux2', 'paint', [Math.cos(a) * (RR + 0.05), 0, Math.sin(a) * (RR + 0.05)], [0, 0, 0], 0.014); }
  }
}

// ---------- R5 AURELIAN aureole (aux0, authored facing +z; tilt + spin in tick) ----------
function aureole(b, o) {
  if (o.rank < 5) return;
  const far = b.far, H = 'aux0';
  b.scope([0, 0, 0], [0, 0, 0], 1.3, () => aureoleParts(b, far, H));
}
function aureoleParts(b, far, H) {
  b.add(b.cyl(0.2, 0.2, 0.014, 40), H, 'metal', [0, 0, -0.01], [PI / 2, 0, 0]);
  b.add(b.tor(0.205, 0.016, 48, 5), H, 'paint', [0, 0, 0]);
  b.add(b.tor(0.155, 0.007, 40, 4), H, 'eye', [0, 0, 0.006]);
  const N = far ? 12 : 20;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * PI * 2, long = i % 2 === 0, len = long ? 0.3 : 0.15, w = long ? 0.03 : 0.022;
    b.add(fin(b, [[-w, 0], [w, 0], [w * 0.25, len * 0.85], [0, len], [-w * 0.25, len * 0.85]], 0.018, 0.004), H, 'paint',
      [Math.cos(a) * 0.215, Math.sin(a) * 0.215, 0], [0, 0, a - PI / 2]);
    if (long && !far) b.add(b.sph(6, 5), H, 'eye', [Math.cos(a) * (0.215 + len + 0.02), Math.sin(a) * (0.215 + len + 0.02), 0], [0, 0, 0], 0.012);
  }
}

function build(b, o) {
  head(b, o); uplink(b, o); torso(b, o); mantle(b, o); collar(b, o); robe(b, o); arms(b, o); ring(b, o); aureole(b, o);
}

// ---------- anims ----------
const _t = new THREE.Vector3();
function hand(P, ctx, s, x, y, z, w = 1, out = 0.3) {
  if (w <= 0.001) return;
  const P0 = w < 1 ? P.slice() : null;
  L.armIK(P, ctx, s, _t.set(x, y, z), out);
  if (P0) for (const n of ['clav', 'upArm', 'foreArm', 'hand']) { const i = BI[n + s] * 3; for (let c = 0; c < 3; c++) P[i + c] = L.lerp(P0[i + c], P[i + c], w); }
}
function base(P, ctx, t, calm = 1) {
  const st = ctx.st, b = Math.sin(t * 1.25);
  L.pel(P, Math.sin(t * 0.55) * 0.015, b * 0.045 * calm, 0);
  L.R(P, 'pelvis', 0.03 + Math.sin(t * 0.8) * 0.02, 0, Math.sin(t * 0.65) * 0.02);
  L.R(P, 'spine', 0.0, 0, 0); L.R(P, 'chest', -0.04 + b * 0.012, 0, 0);
  L.R(P, 'neck', st.gp * 0.3, st.gy * 0.35, 0); L.R(P, 'head', st.gp * 0.4 + 0.05, st.gy * 0.4, 0.05 * Math.sin(t * 0.4));
  // the oracle's gesture: left palm open low, right palm raised a little, both before the robe
  hand(P, ctx, 'L', 0.33, 0.98 + Math.sin(t * 1.1) * 0.02, 0.12, 1, 0.6);
  hand(P, ctx, 'R', -0.31, 1.03 + Math.sin(t * 1.1 + 1.4) * 0.02, 0.15, 1, 0.6);
  L.RS(P, 'hand', 'L', -0.3, 0, -0.6); L.RS(P, 'hand', 'R', -0.3, 0, -0.6);
}

const anims = {
  idle(P, t, ctx) {
    base(P, ctx, t);
    // every ~9 s it lifts the right palm to its satellites and listens (ring speeds up in tick)
    const c = t % 9.2, k = L.kf(c, [[0, 0], [5.6, 0], [6.1, 1], [7.4, 1], [8.0, 0]]);
    ctx.consult = k;
    if (k > 0) {
      hand(P, ctx, 'R', -0.2, 1.5, 0.22, k, 0.4);
      L.AS(P, 'hand', 'R', -0.6 * k, 0, 0);
      L.A(P, 'neck', -0.1 * k, -0.15 * k, 0); L.A(P, 'head', -0.2 * k, -0.15 * k, 0.1 * k);
    }
  },
  advance(P, t, ctx) {
    base(P, ctx, t, 1.4);
    L.A(P, 'pelvis', 0.16, 0, 0); L.A(P, 'chest', -0.06, 0, 0); L.A(P, 'head', -0.08, 0, 0);
    hand(P, ctx, 'L', 0.24, 1.04, 0.02, 0.6, 0.4); hand(P, ctx, 'R', -0.24, 1.04, 0.02, 0.6, 0.4);
  },
  // SATELLITE PING (battle basic): raises the right palm toward the ring and flicks it at the target (fire 0.4);
  // the beam bounces off the nearest mirror (FX)
  cast(P, u, ctx) {
    base(P, ctx, ctx.t);
    const k = L.kf(u, [[0, 0], [0.28, 1], [0.66, 1], [0.95, 0]]), fl = L.kf(u, [[0, 0], [0.34, 0], [0.4, 1], [0.6, 0.8], [0.9, 0]]);
    L.A(P, 'chest', -0.08 * k + 0.06 * fl, -0.12 * k, 0); L.A(P, 'head', -0.12 * k, -0.1 * k, 0);
    hand(P, ctx, 'R', L.lerp(-0.22, -0.14, fl), L.lerp(1.5, 1.38, fl), L.lerp(0.2, 0.5, fl), k, 0.4);
    L.AS(P, 'hand', 'R', (-0.7 + 0.9 * fl) * k, 0, 0);
    hand(P, ctx, 'L', 0.22, 1.18, 0.1, 0.6 * k, 0.4);
    P[L.PX + 1] += 0.04 * k;
  },
  // twin palms: both hands gather at the lens and push forward (fire 0.38, 0.44)
  attack(P, u, ctx) {
    base(P, ctx, ctx.t);
    const w = L.kf(u, [[0, 0], [0.18, 1], [0.75, 1], [1, 0]]), g = L.kf(u, [[0, 0], [0.26, 1], [0.36, 0]]), th = L.kf(u, [[0, 0], [0.33, 0], [0.4, 1], [0.7, 1], [1, 0]]);
    P[L.PX + 2] += -0.04 * g + 0.06 * th;
    L.A(P, 'chest', -0.08 * g + 0.08 * th, 0, 0); L.A(P, 'head', 0.06 * g - 0.08 * th, 0, 0);
    for (const s of SIDES) {
      const sg = s === 'L' ? 1 : -1;
      hand(P, ctx, s, sg * L.lerp(0.07, 0.11, th), L.lerp(1.3, 1.34, th), L.lerp(0.18, 0.48, th), w, 0.35);
      L.AS(P, 'hand', s, -0.9 * th * w, 0, 0);
    }
  },
  // the sweep: right arm draws an arc across the ring, two pings ride it (fire 0.32, 0.56)
  attack_alt(P, u, ctx) {
    base(P, ctx, ctx.t);
    const w = L.kf(u, [[0, 0], [0.15, 1], [0.78, 1], [1, 0]]), sw = L.kf(u, [[0, 0], [0.2, 0], [0.62, 1], [1, 1]]);
    L.A(P, 'chest', -0.06 * w, L.lerp(0.25, -0.3, sw) * w, 0); L.A(P, 'pelvis', 0, L.lerp(0.12, -0.15, sw) * w, 0);
    L.A(P, 'head', -0.1 * w, L.lerp(0.2, -0.2, sw) * w, 0);
    hand(P, ctx, 'R', L.lerp(0.1, -0.42, sw), L.lerp(1.62, 1.3, sw), L.lerp(0.32, 0.3, sw), w, 0.4);
    L.AS(P, 'hand', 'R', -0.5 * w, 0, 0);
    hand(P, ctx, 'L', 0.24, 1.15, 0.05, 0.5 * w, 0.4);
  },
  // SATELLITE LANCE: gathers low (hands crossed over the robe), flings both arms straight up (release 0.17) as the ring launches
  // out of frame, holds the uplink trembling, then brings the right arm down to aim the lance; the ring falls back into orbit
  overdrive(P, u, ctx) {
    base(P, ctx, ctx.t, 0.3);
    const g = L.kf(u, [[0, 0], [0.09, 1], [0.15, 0.3], [OD_REL, 0]]);
    const up = L.kf(u, [[0, 0], [0.1, 0], [OD_REL, 1], [0.84, 1], [0.97, 0]]);
    const aim = L.kf(u, [[0.42, 0], [0.55, 1], [0.78, 1], [0.92, 0]]);
    const tr = Math.sin(u * 90) * 0.012 * L.kf(u, [[0.18, 0], [0.24, 1], [0.44, 1], [0.5, 0]]);
    P[L.PX + 1] += -0.08 * g + 0.26 * up;
    L.A(P, 'pelvis', 0.1 * g - 0.12 * up, 0, 0);
    L.A(P, 'chest', 0.15 * g - 0.18 * up + 0.12 * aim, -0.15 * aim, 0);
    L.A(P, 'neck', 0.1 * g - 0.15 * up, 0, 0); L.A(P, 'head', 0.25 * g - 0.35 * up + 0.3 * aim, -0.1 * aim, 0);
    for (const s of SIDES) {
      const sg = s === 'L' ? 1 : -1;
      hand(P, ctx, s, -sg * 0.06, 1.0, 0.24, g, 0.25);
      const a = s === 'R' ? aim : 0;
      hand(P, ctx, s, sg * (0.16 + tr) + (s === 'R' ? -0.06 * a : 0), L.lerp(2.12 + tr, 1.32, a), L.lerp(0.06, 0.58, a), up * (1 - g), 0.3);
      L.AS(P, 'hand', s, L.lerp(0.4, -1.0, a) * up, 0, 0);
    }
  },
  hit(P, u, ctx) {
    base(P, ctx, ctx.t);
    const k = L.kf(u, [[0, 0], [0.12, 1], [1, 0]]), d = ctx.st.hitDir;
    L.A(P, 'pelvis', -0.2 * k, 0.1 * k * d, 0.12 * k * d); P[L.PX + 2] -= 0.1 * k; P[L.PX + 1] += 0.04 * k;
    L.A(P, 'chest', -0.12 * k, 0, 0); L.A(P, 'head', -0.3 * k, 0.15 * k * d, 0.2 * k * d);
    for (const s of SIDES) L.AS(P, 'upArm', s, -0.3 * k, 0, 0.35 * k);
  },
  // the signal drops: the ring tumbles to the floor (tick), the oracle sags, then the bell topples forward onto its face (down 0.6)
  die(P, u, ctx) {
    base(P, ctx, ctx.t * (1 - u), 1 - u);
    const s = L.kf(u, [[0, 0], [0.12, 0.15], [0.4, 0.3], [0.6, 1], [1, 1]]), tip = L.kf(u, [[0, 0], [0.3, 0.08], [0.6, 1], [0.66, 0.93], [0.72, 1], [1, 1]]);
    L.pel(P, 0, L.kf(u, [[0, 0], [0.12, 0.05], [0.35, -0.12], [0.6, -0.56], [0.66, -0.52], [0.72, -0.56], [1, -0.56]]), 0.2 * tip);
    L.A(P, 'pelvis', 1.3 * tip, 0, 0.1 * tip);
    L.A(P, 'spine', 0.15 * s, 0, 0); L.A(P, 'chest', 0.1 * s, 0, 0.08 * s); L.A(P, 'head', 0.3 * s, 0.3 * s, 0.2 * s);
    for (const sd of SIDES) {
      const sg = sd === 'L' ? 1 : -1;
      hand(P, ctx, sd, sg * 0.36, 1.0, 0.2, 1, 0.6);
      // prostrate: arms stretched forward along the floor as it lands face down
      for (const [n, v] of [['upArm', [-2.75, 0, 0.32]], ['foreArm', [-0.15, 0, 0]], ['hand', [0.2, 0, 0]]]) {
        const i = BI[n + sd] * 3;
        P[i] = L.lerp(P[i], v[0], tip); P[i + 1] = L.lerp(P[i + 1], sg * v[1], tip); P[i + 2] = L.lerp(P[i + 2], sg * v[2], tip);
      }
    }
  },
  // rises, arms opened wide, palms up; the ring becomes an orrery (tick)
  victory(P, t, ctx) {
    base(P, ctx, t);
    const k = L.smooth(Math.min(1, t / 0.8));
    P[L.PX + 1] += (0.16 + Math.sin(t * 1.3) * 0.03) * k;
    L.A(P, 'chest', -0.1 * k, 0, 0); L.A(P, 'head', -0.22 * k, 0, 0);
    for (const s of SIDES) {
      const sg = s === 'L' ? 1 : -1;
      hand(P, ctx, s, sg * 0.46, 1.5 + Math.sin(t * 1.3 + (sg > 0 ? 0 : 1)) * 0.03, 0.12, k, 0.25);
      L.AS(P, 'hand', s, 0.4 * k, 0, -0.6 * k);
    }
  },
  // descends from orbit with arms folded over the lens (noDrop), opens up; the satellites unfold out of it (land 0.45, ready 0.85)
  deploy(P, u, ctx) {
    base(P, ctx, ctx.t);
    const d = L.kf(u, [[0, 1], [0.45, 0], [1, 0]]), fold = L.kf(u, [[0, 1], [0.45, 1], [0.66, 0]]), open = L.kf(u, [[0.45, 0], [0.62, 1], [0.85, 1], [1, 0]]);
    P[L.PX + 1] += 1.8 * d * d;
    L.A(P, 'head', 0.35 * fold - 0.2 * open, 0, 0); L.A(P, 'chest', 0.12 * fold - 0.08 * open, 0, 0);
    for (const s of SIDES) {
      const sg = s === 'L' ? 1 : -1;
      hand(P, ctx, s, -sg * 0.06, 1.3, 0.16, fold, 0.25);
      hand(P, ctx, s, sg * 0.4, 1.38, 0.14, open, 0.25);
    }
  },
};

// ---------- ring / aureole driver ----------
const _e = new THREE.Euler(), _mi = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
function spinRate(a, u, ctx) {
  switch (a) {
    case 'overdrive': return 0.7 + 9 * L.kf(u, [[0.0, 0], [0.12, 1], [0.3, 1], [0.4, 0.2], [0.85, 0.2], [1, 0]]);
    case 'cast': return 0.7 + 5 * L.kf(u, [[0.1, 0], [0.38, 1], [0.7, 0]]);
    case 'attack': case 'attack_alt': return 0.7 + 4 * L.kf(u, [[0.1, 0], [0.4, 1], [0.8, 0]]);
    case 'deploy': return 0.7 + 12 * L.kf(u, [[0.4, 0], [0.55, 1], [0.8, 1], [1, 0]]);
    case 'victory': return 1.6;
    case 'die': return 2.5 * (1 - L.clamp(u / 0.5, 0, 1));
    default: return 0.7 + 2.2 * (ctx.consult || 0);
  }
}

export default {
  id: 'paragon', name: 'PARAGON', role: 'mage', faction: 'corporate', rarity: 'legendary', realm: 'scifi',
  rig: 'hover', dims: DIMS, height: 1.9, radius: 0.6, walkSpeed: 1.15, scheme: 'light', noDrop: true,
  style: { weapon: 'none' },

  motes: { color: 0xffd98a, size: 0.12 },
  mats: {
    all: {
      paint: { color: 0xe9b44c, metal: 0.8, rough: 0.24, coat: 0.8, coatRough: 0.05, env: 1.1, emissive: 0x2a1800, ei: 1, panel: { scale: 3.4, groove: 0.4, vary: 0.07, seam: 0.55, seamThr: 0.86 } },
      accent: { color: 0xd9dfe8, metal: 0.1, rough: 0.28, coat: 1, env: 0.9, panel: { scale: 3, groove: 0.15, vary: 0.05, rim: 0.3, seam: 0.4, seamThr: 0.88 } },
      metal: { color: 0x121a2e, metal: 0.9, rough: 0.16, env: 1.3, panel: { scale: 6, groove: 0.12, rim: 0.25 } },
      eye: { color: 0xffe2a8, ei: 3.4 },
    },
  },
  sockets: {
    muzzle: ['handR', [0, -0.1, 0.03]], muzzleL: ['handL', [0, -0.1, 0.03]], hand: ['handR', [0, -0.1, 0.03]],
    core: [0, 0.14, 0.13], head: [0, 0.1, 0.11], uplink: ['aux1', [0, 0.26, 0]], aureole: ['aux0', [0, 0, 0]],
    ...Object.fromEntries([0, 1, 2, 3, 4, 5].map((i) => { const d = satDir(i); return ['sat' + i, ['aux3', [d[0] * RR, 0, d[2] * RR]]]; })),
  },
  events: {
    cast: [['fire', 0.4]], attack: [['fire', 0.38], ['fire', 0.44]], attack_alt: [['fire', 0.32], ['fire', 0.56]],
    overdrive: [['cast', 0.04], ['fire', OD_REL]], die: [['down', 0.6]], deploy: [['land', 0.45], ['ready', 0.85]], hit: [],
  },
  durs: { cast: 1.0, attack: 1.05, attack_alt: 1.25, overdrive: 2.6, hit: 0.42, die: 2.0, deploy: 1.6 },
  anims,
  post(P, ctx, act) {
    ctx.act = act ? act.name : null;
    ctx.au = act ? Math.min(1, act.t / act.dur) : 0;
  },
  tick(unit, dt, ctx, bones) {
    const a = ctx.act || (unit.state.dead ? 'die' : unit.state.loop === 'victory' ? 'victory' : null);
    const u = ctx.act ? ctx.au : unit.state.dead ? 1 : 0;
    const t = ctx.t;
    ctx.spin = (ctx.spin || 0) + dt * spinRate(a, u, ctx);
    const gim = bones[BI.aux2], ringB = bones[BI.aux3];
    // gimbal: tilted, slowly precessing; flattens for launch / falls on death / tips into an orrery on victory
    let dieK = 0, tx = RING_TILT[0] + 0.05 * Math.sin(t * 0.5), tz = RING_TILT[2] + 0.05 * Math.cos(t * 0.43), lift = 0, sc = 1;
    if (a === 'overdrive') {
      const f = L.kf(u, [[0.02, 0], [0.12, 1], [0.88, 1], [0.98, 0]]);
      tx *= 1 - f; tz *= 1 - f;
      lift = L.kf(u, [[0.06, 0], [0.15, 0.35], [0.3, 11], [0.74, 11], [0.86, 0]]);
      sc = 1 + 0.35 * L.kf(u, [[0.04, 0], [0.14, 1], [0.3, 1], [0.32, 0]]);
    } else if (a === 'die') {
      dieK = L.kf(u, [[0.06, 0], [0.4, 1]]);
      sc = 1 + 0.12 * dieK;
    } else if (a === 'victory') {
      const k = L.smooth(Math.min(1, (ctx.vt = (ctx.vt || 0) + dt) / 0.8));
      tx = L.lerp(tx, 0.7, k); tz = L.lerp(tz, -0.35, k); lift = 0.18 * k;
    } else if (a === 'deploy') {
      sc = L.kf(u, [[0, 0.05], [0.45, 0.05], [0.6, 1.1], [0.75, 1]]);
    } else if (a === 'hit') {
      const k = L.kf(u, [[0, 0], [0.12, 1], [1, 0]]);
      tx += 0.25 * k * Math.sin(t * 30); tz += 0.2 * k;
    }
    if (a !== 'victory') ctx.vt = 0;
    gim.position.set(DIMS.aux2[0], DIMS.aux2[1] + lift, DIMS.aux2[2]);
    gim.rotation.set(tx, 0, tz);
    if (dieK > 0) {
      // death: the ring falls flat onto the floor around the body (body-space target mapped into the pelvis frame), a last wobble
      const pel = bones[BI.pelvis];
      pel.updateMatrix(); _mi.copy(pel.matrix).invert();
      const bounce = Math.abs(Math.sin(u * 22)) * 0.06 * Math.max(0, 1 - (u - 0.35) * 4) * (u > 0.35 ? 1 : 0);
      _p.set(0, L.lerp(DIMS.hover + DIMS.aux2[1], 0.09 + bounce, dieK * dieK), 0.05).applyMatrix4(_mi);
      gim.position.lerp(_p, dieK);
      _q.copy(pel.quaternion).invert().multiply(_q2.setFromEuler(_e.set(0.05 * bounce, 0, 0.04)));
      gim.quaternion.slerp(_q, dieK);
    }
    ringB.rotation.set(0, ctx.spin, 0);
    ringB.scale.setScalar(Math.max(1e-3, sc));
    // aureole: tilted back toward the camera, slow turn; swells in the overdrive
    const au = bones[BI.aux0];
    au.rotation.set(AUR_TILT, 0, t * 0.12 + (a === 'overdrive' ? ctx.spin * 0.08 : 0));
    au.scale.setScalar(a === 'overdrive' ? 1 + 0.25 * L.kf(u, [[0.05, 0], [0.17, 1], [0.8, 1], [0.95, 0]]) : 1);
    // uplink rings spin
    bones[BI.aux1].rotation.set(0, t * 1.5, 0);
  },
  fxHints: { projectile: 'satellite_ping', impact: 'mirror_glint', overdrive: 'satellite_lance', color: 0xffd98a },
  build,
};
