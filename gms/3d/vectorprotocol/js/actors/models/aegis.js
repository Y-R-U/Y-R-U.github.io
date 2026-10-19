// AEGIS, corporate rare mage "Hardlight Projector" (sculptor-10). Brief: docs/ROSTER.md `aegis`.
// A slender, upright bodyguard biped wearing a big hardlight projector disc on its back like a halo. Shares PATCH's corporate
// support language: glossy white rounded shells, banded + bolted rings, ONE big friendly lens for a face, bezelled lamps.
// Weapon: palm emitters (a lens at the end of each gauntlet, cradled by three prongs). Signature: the back disc detaches and
// spins (attack_alt throws it, the overdrive lifts it overhead, it falls off and settles like a coin when AEGIS dies).
// VALUE: white `paint` shells, mid-blue `accent` bands/panels, dark `metal` undersuit at every joint + the disc's dark face,
// small amber `trim` markers, cyan `glow` (disc rim, palms, seams), cyan `eye` lens.
// Rank tiers: R0 battered (cracked rim arc, missing spoke) · R1 base (spoked disc clamped to the back)
//   · R2 disc gains hex segments + extra pauldron plates · R3 disc floats free behind it (emitter tether, glow rings)
//   · R4 twin discs (aux1, counter-rotating) · R5 hardlight hex crown over the head + double disc rims.
// Rarity: rare+ forearm glow strips · epic+ shoulder lamps + antenna; legendary = kit gold.
// Rig: biped. aux0 (chest) = main disc, aux1 (re-parented to chest) = R4 twin disc. Both are driven in tick(): an
// "attached" local transform blended with a free target authored in body space (overhead, thrown, fallen).
import { THREE, P, PS, plate, fin, discX, shell, LIB, kf, PI, BI } from '../kit.js';

const L = LIB;
const SIDES = ['L', 'R'];
const DIMS = {
  thigh: 0.37, shin: 0.39, ankle: 0.09, hipX: 0.1, hipY: -0.04, spine: 0.12, chest: 0.22, neck: 0.2, headOff: 0.04,
  clavX: 0.05, clavY: 0.18, shoulder: 0.15, upArm: 0.26, foreArm: 0.25,
  parents: { aux1: 'chest' }, aux0: [0, 0.36, -0.43], aux1: [0.22, 0.5, -0.55],
};
const DR = 0.4;            // main disc radius
const TR = 0.29;            // twin disc radius
const TILT = -0.55;         // disc leans back so its face turns up to the elevated battle camera
const OD_REL = 0.167;

// ---------- greebles ----------
function lamp(b, bone, pos, rot, r = 0.02, slot = 'glow', mirror = true, bez = 'metal') {
  const put = mirror ? b.sym.bind(b) : b.add.bind(b);
  put(b.cyl(r * 1.5, r * 1.5, 0.016, 14), bone, bez, pos, rot);
  put(b.cyl(r, r, 0.024, 14), bone, slot, pos, rot);
}
function piston(b, bone, a, c, r = 0.014) {
  const dx = c[0] - a[0], dy = c[1] - a[1], dz = c[2] - a[2], len = Math.hypot(dx, dy, dz);
  const rx = Math.atan2(dz, -dy), m = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2];
  b.sym(b.cyl(r * 1.4, r * 1.4, len * 0.55, 8), bone, 'metal', [a[0] + dx * 0.27, a[1] + dy * 0.27, a[2] + dz * 0.27], [rx + PI, 0, 0]);
  b.sym(b.cyl(r * 0.65, r * 0.65, len, 6), bone, 'trim', m, [rx + PI, 0, 0]);
}
function vent(b, bone, pos, rot, w = 0.1, n = 4) {
  b.add(b.cbox(w + 0.03, n * 0.02 + 0.02, 0.018, 0.006), bone, 'metal', pos, rot);
  if (b.far) return;
  b.scope(pos, rot, 1, () => { for (let i = 0; i < n; i++) b.add(b.box(w, 0.007, 0.014), bone, 'accent', [0, (i - (n - 1) / 2) * 0.02, 0.007]); });
}
// flat annulus facing z (lathe around y, turned onto z)
function ringZ(b, r0, r1, t, seg = 40) {
  const g = b.lathe([[r0, -t / 2], [r1, -t / 2], [r1, t / 2], [r0, t / 2], [r0, -t / 2]], seg);
  g.rotateX(PI / 2);
  return g;
}
function hexZ(b, r, t) { const g = new THREE.CylinderGeometry(r, r, t, 6, 1); g.rotateX(PI / 2); g.rotateZ(PI / 6); return g; }

// ---------- the projector disc (authored in the bone frame: disc in XY, faces +/-z) ----------
function disc(b, o, bone, R, twin = false) {
  const rk = o.rank, far = b.far;
  // dark face + white flange + rim band (R0: the rim is cracked open)
  b.add(b.cyl(R * 0.86, R * 0.86, 0.02, 40), bone, 'accent', [0, 0, 0], [PI / 2, 0, 0]);
  b.add(ringZ(b, R * 0.8, R * 0.97, 0.03, 48), bone, 'paint', [0, 0, 0]);
  if (rk === 0) {
    b.add(b.tor(R, 0.032, 40, 6, PI * 1.72), bone, 'paint', [0, 0, 0], [0, 0, 0.9]);
    b.add(b.cbox(0.05, 0.1, 0.03, 0.01), bone, 'metal', [Math.cos(0.75) * R, Math.sin(0.75) * R, 0], [0, 0, 0.75]);
  } else b.add(b.tor(R, 0.032, 48, 6), bone, 'paint', [0, 0, 0]);
  // cyan hardlight rim (the brief's signature line) + inner blue ring
  b.add(b.tor(R + 0.028, 0.008, 48, 4), bone, 'glow', [0, 0, 0]);
  if (rk >= 5) b.add(b.tor(R + 0.06, 0.006, 48, 3), bone, 'glow', [0, 0, 0]);
  if (rk >= 1) b.add(b.tor(R * 0.78, 0.011, 40, 4), bone, 'paint', [0, 0, 0]);
  // rim teeth: alternating white / amber markers, like a lens bezel
  const nT = far ? 8 : 16;
  for (let i = 0; i < nT; i++) {
    const a = (i / nT) * PI * 2 + 0.1;
    if (rk === 0 && a > 0.3 && a < 1.25) continue;
    b.add(b.cbox(0.03, 0.045, 0.05, 0.008), bone, i % 4 ? 'paint' : 'trim', [Math.cos(a) * (R + 0.012), Math.sin(a) * (R + 0.012), 0], [0, 0, a - PI / 2]);
  }
  if (rk >= 2) {
    // hex segments: centre hex + a ring of six, raised through both faces, glow seams between them
    const hr = R * 0.24, ring = R * 0.47;
    b.add(hexZ(b, hr * 0.92, 0.04), bone, 'paint', [0, 0, 0]);
    for (let i = 0; i < 6; i++) {
      const a = i * PI / 3 + PI / 6;
      b.add(hexZ(b, hr * 0.9, 0.034), bone, i % 2 ? 'metal' : 'paint', [Math.cos(a) * ring, Math.sin(a) * ring, 0]);
      if (!far) b.add(hexZ(b, hr * 0.98, 0.026), bone, 'glow', [Math.cos(a) * ring, Math.sin(a) * ring, 0]);
    }
    if (!far) b.add(hexZ(b, hr, 0.03), bone, 'glow', [0, 0, 0]);
  } else {
    // R0-1: six white spokes + three blue sector panels on the dark face
    for (let i = 0; i < 6; i++) {
      if (rk === 0 && i === 1) continue;
      const a = i * PI / 3;
      b.add(b.cbox(R * 0.66, 0.035, 0.034, 0.01), bone, 'paint', [Math.cos(a) * R * 0.45, Math.sin(a) * R * 0.45, 0], [0, 0, a]);
    }
    if (!far) for (let i = 0; i < 3; i++) {
      const a = i * 2 * PI / 3 + PI / 6;
      b.add(b.cbox(R * 0.3, R * 0.22, 0.028, 0.012), bone, 'metal', [Math.cos(a) * R * 0.55, Math.sin(a) * R * 0.55, 0], [0, 0, a + PI / 2]);
    }
  }
  // hub: white bezel, projector lens through both faces, amber ring
  b.add(b.cyl(R * 0.17, R * 0.19, 0.06, 24), bone, 'paint', [0, 0, 0], [PI / 2, 0, 0]);
  b.add(b.cyl(R * 0.11, R * 0.11, 0.075, 20), bone, 'eye', [0, 0, 0], [PI / 2, 0, 0]);
  b.add(b.tor(R * 0.14, 0.006, 24, 3), bone, 'trim', [0, 0, 0.037]);
  b.add(b.tor(R * 0.14, 0.006, 24, 3), bone, 'trim', [0, 0, -0.037]);
  // glow dots on the face (between segments)
  if (!far) for (let i = 0; i < 6; i++) {
    const a = i * PI / 3;
    for (const z of [0.012, -0.012]) b.add(b.cyl(0.012, 0.012, 0.01, 8), bone, 'glow', [Math.cos(a) * R * 0.72, Math.sin(a) * R * 0.72, z], [PI / 2, 0, 0]);
  }
  // R3+: inner hardlight ring floating in front of the face
  if (rk >= 3 && !twin) b.add(b.tor(R * 0.62, 0.006, 40, 3), bone, 'glow', [0, 0, -0.03]);
  // the mount socket on the disc's inner face
  b.add(b.cyl(0.04, 0.05, 0.05, 12), bone, 'metal', [0, 0, 0.045], [PI / 2, 0, 0]);
}

// ---------- body ----------
function head(b, o) {
  const H = 'head', y = 0.1, far = b.far;
  // white dome skull
  b.add(b.sph(22, 15), H, 'paint', [0, y, -0.005], [0, 0, 0], [0.1, 0.108, 0.112]);
  // big friendly lens (PATCH's eye, AEGIS-sized): white bezel, dark recess, cyan iris, pupil, catchlight
  const z = 0.093;
  b.add(b.cyl(0.066, 0.07, 0.03, 26), H, 'metal', [0, y - 0.005, z - 0.004], [PI / 2, 0, 0]);
  b.add(b.tor(0.066, 0.016, 28, 8), H, 'paint', [0, y - 0.005, z + 0.008]);
  b.add(b.tor(0.05, 0.005, 24, 4), H, 'accent', [0, y - 0.005, z + 0.022]);
  b.add(b.sph(18, 8, 0, PI * 2, 0, PI * 0.5), H, 'eye', [0, y - 0.005, z + 0.005], [PI / 2, 0, 0], [0.05, 0.022, 0.05]);
  b.add(b.cyl(0.018, 0.018, 0.008, 16), H, 'metal', [0, y - 0.005, z + 0.027], [PI / 2, 0, 0]);
  if (!far) b.add(b.sph(8, 6), H, 'paint', [0.02, y + 0.017, z + 0.03], [0, 0, 0], 0.008);
  // blue crest stripe over the dome (back to front-top) + amber marker
  b.add(b.tor(0.113, 0.013, 24, 4, PI * 0.72), H, 'accent', [0, y, -0.005], [0, PI / 2, 0]);
  b.add(b.cbox(0.03, 0.012, 0.03, 0.004), H, 'trim', [0, y + 0.112, -0.03]);
  // jaw / chin block + cheek grilles
  b.add(b.cbox(0.11, 0.035, 0.06, 0.012), H, 'metal', [0, y - 0.088, 0.035]);
  if (!far) for (let i = 0; i < 3; i++) b.add(b.box(0.08, 0.005, 0.012), H, 'accent', [0, y - 0.096 + i * 0.012, 0.067]);
  // ear discs + PATCH-style stabiliser fins
  b.sym(discX(b, 0.034, 0.026, 16), H, 'metal', [0.1, y - 0.01, -0.01]);
  b.sym(discX(b, 0.02, 0.03, 14), H, 'eye', [0.106, y - 0.01, -0.01]);
  b.sym(fin(b, [[0, 0], [0.07, 0.0], [0.12, 0.06], [0.1, 0.085], [0.015, 0.05]], 0.016, 0.004), H, 'paint', [0.085, y + 0.04, -0.05], [0, -0.75, 0.55]);
  b.sym(fin(b, [[0.025, 0.012], [0.07, 0.012], [0.105, 0.058], [0.09, 0.07]], 0.02, 0.003), H, 'accent', [0.085, y + 0.04, -0.05], [0, -0.75, 0.55]);
  // epic+: antenna on the left side
  if (o.r >= 2) {
    b.add(b.cyl(0.004, 0.007, 0.16, 5), H, 'metal', [0.07, y + 0.12, -0.06], [-0.35, 0, -0.3]);
    b.add(b.sph(8, 6), H, 'glow', [0.095, y + 0.195, -0.09], [0, 0, 0], 0.013);
  }
  // R5: hardlight hex crown floating over the head
  if (o.rank >= 5) {
    b.add(b.tor(0.16, 0.009, 36, 3), H, 'glow', [0, y + 0.2, -0.03], [PI / 2 + 0.25, 0, 0]);
    for (let i = 0; i < 6; i++) {
      const a = i * PI / 3;
      b.scope([Math.cos(a) * 0.16, y + 0.2 + Math.sin(a) * 0.16 * Math.sin(0.25) * -1, -0.03 + Math.sin(a) * 0.16 * Math.cos(0.25)], [0, -a, 0], 1, () => {
        b.add(hexZ(b, 0.03, 0.012), H, 'trim', [0, 0.02, 0], [0, PI / 2, 0]);
        b.add(b.cbox(0.006, 0.05, 0.006, 0.002), H, 'glow', [0, 0.06, 0]);
      });
    }
  }
  // neck: dark core with blue rings
  b.add(b.cyl(0.042, 0.052, 0.13, 12), 'neck', 'metal', [0, -0.02, 0]);
  if (!far) for (let i = 0; i < 2; i++) b.add(b.tor(0.05 - i * 0.004, 0.007, 16, 4), 'neck', 'accent', [0, -0.05 + i * 0.04, 0], [PI / 2, 0, 0]);
}

function torso(b, o) {
  const far = b.far, rk = o.rank;
  // dark undersuit core
  P(b, 'chest', 'metal', [0.26, 0.3, 0.18], [0, 0.04, -0.01], [0, 0, 0], { c: 0.03 });
  // white V chest shell, soft corners (corporate support: rounded, PATCH-like)
  P(b, 'chest', 'paint', [0.38, 0.26, 0.23], [0, 0.08, 0.02], [0.06, 0, 0], { c: 0.06, tx: 1.12, bx: 0.62, tz: 1.0, bz: 0.82 });
  // blue pec panels + amber markers
  PS(b, 'chest', 'accent', [0.12, 0.13, 0.04], [0.085, 0.11, 0.135], [0.25, 0.3, 0.12], { c: 0.02, bx: 0.65 });
  if (!far) PS(b, 'chest', 'trim', [0.035, 0.012, 0.01], [0.12, 0.165, 0.155], [0.25, 0.3, 0.12]);
  // sternum projector: the core lens (bezel + amber ring)
  b.add(b.cyl(0.05, 0.05, 0.03, 20), 'chest', 'paint', [0, 0.04, 0.135], [PI / 2 + 0.12, 0, 0]);
  b.add(b.cyl(0.034, 0.034, 0.04, 18), 'chest', 'glow', [0, 0.04, 0.14], [PI / 2 + 0.12, 0, 0]);
  b.add(b.tor(0.044, 0.006, 20, 3), 'chest', 'trim', [0, 0.04, 0.153], [0.12, 0, 0]);
  // PATCH equator echo: a blue band round the lower ribcage with bolts
  b.add(b.tor(0.15, 0.016, 32, 5), 'chest', 'accent', [0, -0.05, 0.01], [PI / 2 + 0.05, 0, 0], [1.08, 0.84, 1]);
  if (!far) for (let i = 0; i < 10; i++) {
    const a = (i / 10) * PI * 2;
    b.add(b.cyl(0.008, 0.008, 0.012, 6), 'chest', 'metal', [Math.cos(a) * 0.168, -0.05, 0.01 + Math.sin(a) * 0.132], [0, -a, PI / 2]);
  }
  // collar plates sloping to the shoulders + neck ring
  PS(b, 'chest', 'paint', [0.12, 0.04, 0.16], [0.1, 0.205, -0.0], [0, 0, -0.32], { c: 0.015, tx: 0.8 });
  b.add(b.tor(0.065, 0.013, 18, 4), 'chest', 'metal', [0, 0.21, 0], [PI / 2, 0, 0]);
  // side lamps
  lamp(b, 'chest', [0.17, 0.02, 0.07], [0, 0, PI / 2], 0.016, 'glow', true, 'paint');
  // back: white projector pack with vents + the disc mount
  b.add(b.rbox(0.26, 0.24, 0.1, 0.035), 'chest', 'paint', [0, 0.07, -0.135]);
  b.add(b.cbox(0.2, 0.18, 0.03, 0.01), 'chest', 'accent', [0, 0.07, -0.185]);
  vent(b, 'chest', [0, 0.04, -0.2], [0, PI, 0], 0.12, 4);
  for (const s of [1, -1]) {
    b.add(b.cyl(0.026, 0.032, 0.08, 10), 'chest', 'metal', [s * 0.1, -0.06, -0.17], [PI / 2 + 0.6, 0, 0]);
    b.add(b.cyl(0.02, 0.02, 0.012, 10), 'chest', 'glow', [s * 0.1, -0.085, -0.2], [PI / 2 + 0.6, 0, 0]);
  }
  if (rk < 3) {
    // physical clamp: two arms from the pack to the disc socket
    // physical mount: a boom from the pack up to the disc socket, braced by two struts
    b.add(b.tube([[0, 0.15, -0.17], [0, 0.27, -0.27], [0, 0.35, -0.39]], 0.022, 8, 6), 'chest', 'metal');
    for (const s of [1, -1]) b.add(b.tube([[s * 0.09, 0.17, -0.16], [s * 0.06, 0.25, -0.26], [s * 0.02, 0.33, -0.37]], 0.011, 6, 5), 'chest', 'accent');
    b.add(b.cyl(0.032, 0.032, 0.05, 12), 'chest', 'paint', [0, 0.26, -0.26], [PI / 2 - 0.75, 0, 0]);
  } else {
    // R3+: the disc floats free; a hardlight emitter on the pack holds it
    b.add(b.cyl(0.04, 0.05, 0.04, 14), 'chest', 'accent', [0, 0.18, -0.19], [PI / 2 - 0.3, 0, 0]);
    b.add(b.cyl(0.028, 0.028, 0.03, 14), 'chest', 'glow', [0, 0.185, -0.21], [PI / 2 - 0.3, 0, 0]);
    for (const s of [1, -1]) b.add(fin(b, [[0, 0], [0.05, 0.0], [0.08, 0.1], [0.06, 0.11]], 0.014, 0.004), 'chest', 'paint', [s * 0.05, 0.16, -0.19], [0, s > 0 ? 0 : PI, s * 0.2]);
  }
  // waist: slim segmented abdomen
  b.add(b.cyl(0.085, 0.1, 0.17, 12), 'spine', 'metal', [0, 0.06, 0]);
  if (!far) for (let i = 0; i < 3; i++) b.add(b.tor(0.094 + i * 0.004, 0.009, 16, 4), 'spine', 'accent', [0, 0.01 + i * 0.045, 0], [PI / 2, 0, 0]);
  P(b, 'spine', 'paint', [0.15, 0.09, 0.07], [0, 0.06, 0.08], [0.1, 0, 0], { c: 0.025, bx: 0.75 });
  // hips: white rounded block, blue codpiece, side plates, glow dots
  P(b, 'pelvis', 'metal', [0.22, 0.12, 0.16], [0, -0.01, 0], [0, 0, 0], { c: 0.025 });
  P(b, 'pelvis', 'paint', [0.28, 0.1, 0.19], [0, 0.03, 0], [0, 0, 0], { c: 0.04, bx: 0.85, bz: 0.9 });
  P(b, 'pelvis', 'accent', [0.1, 0.12, 0.04], [0, -0.06, 0.095], [-0.12, 0, 0], { c: 0.015, bx: 0.55 });
  PS(b, 'pelvis', 'paint', [0.035, 0.12, 0.13], [0.135, -0.04, 0], [0, 0, 0.16], { c: 0.014, bz: 0.8 });
  PS(b, 'pelvis', 'accent', [0.012, 0.08, 0.08], [0.155, -0.04, 0], [0, 0, 0.16], { c: 0.004 });
  if (!far) b.sym(b.cyl(0.012, 0.012, 0.01, 8), 'pelvis', 'glow', [0.165, -0.04, 0.05], [0, 0, PI / 2 - 0.18]);
}

function armsAndPalms(b, o) {
  const D = b.rig.D, ua = D.upArm, fa = D.foreArm, rk = o.rank, r = o.r, far = b.far;
  b.sym(b.cyl(0.036, 0.036, D.shoulder, 8), 'clav', 'metal', [D.shoulder / 2, 0, 0], [0, 0, PI / 2]);
  b.sym(b.sph(12, 8), 'upArm', 'metal', [0, 0, 0], [0, 0, 0], 0.066);
  // rounded white pauldron (dome), blue rim band, cyan lamp; R2 layered plates below it
  b.sym(b.sph(20, 10, 0, PI * 2, 0, PI * 0.5), 'upArm', 'paint', [0.025, 0.02, 0], [0, 0, -0.3], [0.12, 0.09, 0.125]);
  b.sym(b.tor(0.115, 0.012, 24, 4), 'upArm', 'accent', [0.025, 0.02, 0], [PI / 2, 0, -0.3], [1, 1.06, 1]);
  lamp(b, 'upArm', [0.08, 0.075, 0.03], [0, 0, -0.75], 0.016, r >= 2 ? 'eye' : 'glow');
  PS(b, 'upArm', 'paint', [0.1, 0.05, 0.15], [0.07, -0.05, 0], [0, 0, -0.42], { c: 0.015 });
  if (rk >= 2) {
    PS(b, 'upArm', 'accent', [0.09, 0.045, 0.14], [0.085, -0.09, 0], [0, 0, -0.5], { c: 0.012 });
    PS(b, 'upArm', 'paint', [0.06, 0.12, 0.05], [0.095, 0.03, 0.1], [0.2, 0, -0.35], { c: 0.012 });
  }
  // upper arm: dark core + white sleeve
  b.sym(b.cyl(0.036, 0.032, ua, 8), 'upArm', 'metal', [0, -ua / 2, 0]);
  PS(b, 'upArm', 'paint', [0.085, ua * 0.5, 0.09], [0.008, -ua * 0.6, 0], [0, 0, 0], { c: 0.022, tx: 1.1, tz: 1.1 });
  // elbow + piston
  b.sym(discX(b, 0.045, 0.09, 12), 'foreArm', 'metal', [0, 0, 0]);
  piston(b, 'upArm', [0, -0.06, -0.045], [0, -ua + 0.02, -0.045], 0.011);
  // emitter bracer: widening toward the wrist, blue outer panel, coil rings near the wrist
  PS(b, 'foreArm', 'paint', [0.105, fa * 0.78, 0.115], [0.004, -fa * 0.56, 0], [0, 0, 0], { c: 0.03, tx: 0.82, tz: 0.82, bx: 1.1, bz: 1.1 });
  PS(b, 'foreArm', 'accent', [0.03, fa * 0.5, 0.08], [0.055, -fa * 0.55, 0], [0, 0, -0.04], { c: 0.01 });
  for (let i = 0; i < 2; i++) b.sym(b.tor(0.062, 0.009, 18, 4), 'foreArm', i ? 'trim' : 'accent', [0.004, -fa * (0.86 + i * 0.07), 0], [PI / 2, 0, 0]);
  if (r >= 1) b.sym(b.cbox(0.012, fa * 0.38, 0.012, 0.003), 'foreArm', 'glow', [0.006, -fa * 0.5, 0.062]);
  // gauntlet + palm emitter at the tip (aims along the forearm), three prongs cradling it
  b.sym(b.cbox(0.07, 0.07, 0.08, 0.016), 'hand', 'metal', [0, -0.035, 0]);
  b.sym(b.cyl(0.042, 0.036, 0.04, 16), 'hand', 'paint', [0, -0.085, 0]);
  b.sym(b.cyl(0.03, 0.03, 0.025, 16), 'hand', 'glow', [0, -0.108, 0]);
  b.sym(b.tor(0.034, 0.006, 16, 3), 'hand', 'accent', [0, -0.104, 0], [PI / 2, 0, 0]);
  if (!far) for (let i = 0; i < 3; i++) {
    const a = i * 2 * PI / 3 + PI / 2;
    b.sym(b.cbox(0.016, 0.075, 0.018, 0.005), 'hand', i ? 'paint' : 'metal', [Math.cos(a) * 0.045, -0.115, Math.sin(a) * 0.045], [Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35]);
  }
}

// legs: PATCH-language rounded shells (white), blue bands + front panels, dark joints, round knee caps with lamps,
// layered greaves over a calf bulge, ankle pistons, rounded toe caps
function lower(b, o) {
  const D = b.rig.D, th = D.thigh, sh = D.shin, far = b.far, r = o.r;
  // hip + thigh
  b.sym(b.sph(10, 8), 'thigh', 'metal', [0, 0, 0], [0, 0, 0], 0.078);
  b.sym(b.cyl(0.045, 0.04, th, 10), 'thigh', 'metal', [0, -th / 2, 0]);
  b.sym(shell(b, -0.035, -th + 0.05, [0.08, 0.096, 0.092, 0.074], 10), 'thigh', 'paint', [0.004, 0, 0.008], [0, 0, 0], [1, 1, 1.08]);
  PS(b, 'thigh', 'accent', [0.085, th * 0.46, 0.03], [0.006, -th * 0.46, 0.102], [-0.04, 0, 0], { c: 0.012, tx: 0.8, bx: 1.05 });
  if (!far) PS(b, 'thigh', 'trim', [0.045, 0.014, 0.012], [0.006, -th * 0.2, 0.12], [0, 0, 0]);
  PS(b, 'thigh', 'paint', [0.035, th * 0.48, 0.13], [0.1, -th * 0.4, 0.0], [0, 0, 0.06], { c: 0.012, tz: 0.85, bz: 0.9 });
  PS(b, 'thigh', 'accent', [0.012, th * 0.36, 0.08], [0.118, -th * 0.4, 0.0], [0, 0, 0.06], { c: 0.004 });
  b.sym(b.tor(0.094, 0.011, 20, 4), 'thigh', 'accent', [0.004, -th + 0.07, 0.008], [PI / 2, 0, 0], [1, 1.1, 1]);
  piston(b, 'thigh', [0, -0.07, -0.08], [0, -th + 0.04, -0.07], 0.012);
  // knee: dark joint, round white cap + blue ring + lamp
  b.sym(discX(b, 0.058, 0.13, 14), 'shin', 'metal', [0, 0, 0]);
  b.sym(b.sph(14, 7, 0, PI * 2, 0, PI * 0.5), 'shin', 'paint', [0, 0.01, 0.055], [PI / 2 - 0.2, 0, 0], [0.072, 0.05, 0.075]);
  b.sym(b.tor(0.07, 0.009, 20, 4), 'shin', 'accent', [0, 0.01, 0.06], [-0.2, 0, 0], [1, 1.05, 1]);
  lamp(b, 'shin', [0, 0.01, 0.105], [PI / 2 - 0.2, 0, 0], 0.016, 'glow', true, 'trim');
  // shin: rounded shell + calf bulge + layered greave
  b.sym(shell(b, -0.04, -sh + 0.03, [0.07, 0.084, 0.072, 0.056], 8), 'shin', 'metal', [0, 0, -0.005]);
  b.sym(b.sph(12, 9), 'shin', 'paint', [0, -sh * 0.33, -0.035], [0.08, 0, 0], [0.072, 0.15, 0.07]);
  b.sym(b.sph(10, 7), 'shin', 'accent', [0, -sh * 0.36, -0.06], [0.08, 0, 0], [0.05, 0.11, 0.05]);
  PS(b, 'shin', 'paint', [0.13, sh * 0.6, 0.06], [0, -sh * 0.42, 0.06], [0.06, 0, 0], { c: 0.025, tx: 1.1, bx: 0.72, tz: 1, sz: 0 });
  PS(b, 'shin', 'accent', [0.1, sh * 0.26, 0.04], [0, -sh * 0.62, 0.088], [0.06, 0, 0], { c: 0.014, tx: 1.05, bx: 0.7 });
  if (r >= 1) PS(b, 'shin', 'glow', [0.012, sh * 0.22, 0.012], [0, -sh * 0.32, 0.096], [0.06, 0, 0]);
  if (!far) for (const y of [0.18, 0.3]) b.sym(b.cyl(0.008, 0.008, 0.012, 8), 'shin', 'trim', [0.05, -sh * y - 0.08, 0.075], [PI / 2 - 0.1, 0, 0]);
  b.sym(b.tor(0.066, 0.01, 18, 4), 'shin', 'accent', [0, -sh + 0.06, 0], [PI / 2, 0, 0]);
  piston(b, 'shin', [0.04, -0.07, -0.06], [0.03, -sh + 0.05, -0.045], 0.01);
  if (!far) b.sym(b.cyl(0.012, 0.012, 0.01, 8), 'shin', 'glow', [0.075, -sh * 0.75, 0.035], [0, 0, PI / 2]);
  // ankle + foot: dark sole, rounded white toe cap, blue toe stripe, heel spur
  b.sym(b.sph(12, 8), 'foot', 'metal', [0, 0, 0], [0, 0, 0], 0.055);
  b.sym(b.rbox(0.12, 0.05, 0.27, 0.02), 'foot', 'metal', [0, -D.ankle + 0.03, 0.06]);
  b.sym(b.rbox(0.11, 0.07, 0.15, 0.035), 'foot', 'paint', [0, -D.ankle + 0.07, 0.12], [0.18, 0, 0]);
  b.sym(b.cbox(0.03, 0.012, 0.12, 0.004), 'foot', 'accent', [0, -D.ankle + 0.105, 0.12], [0.18, 0, 0]);
  b.sym(b.rbox(0.1, 0.07, 0.09, 0.03), 'foot', 'paint', [0, -D.ankle + 0.07, -0.06], [-0.25, 0, 0]);
  b.sym(fin(b, [[-0.02, 0], [0.02, 0], [0, -0.07]], 0.03, 0.006), 'foot', 'metal', [0, -D.ankle + 0.05, -0.1], [-1.2, 0, 0]);
}

function build(b, o) {
  head(b, o);
  torso(b, o);
  armsAndPalms(b, o);
  lower(b, o);
  disc(b, o, 'aux0', DR);
  if (o.rank >= 4) disc(b, o, 'aux1', TR, true);
}

// ---------- anims ----------
const _ik = new THREE.Vector3();
function arm(P, ctx, s, x, y, z, w = 1, out = 0.3) {
  if (w <= 0.001) return;
  const P0 = w < 1 ? P.slice() : null;
  L.armIK(P, ctx, s, _ik.set(x, y, z), out);
  L.RS(P, 'hand', s, 0, 0, 0);
  if (P0) for (const n of ['clav', 'upArm', 'foreArm', 'hand']) { const i = BI[n + s] * 3; for (let c = 0; c < 3; c++) P[i + c] = L.lerp(P0[i + c], P[i + c], w); }
}
function relaxArms(P, t, k = 1) {
  for (const s of SIDES) {
    const ph = s === 'L' ? 0 : 1.7, br = Math.sin(t * 1.3 + ph) * 0.03;
    L.RS(P, 'upArm', s, 0.02 + br, 0.12, 0.2 + br * 0.5);
    L.RS(P, 'foreArm', s, -0.55 - br, 0, 0);
    L.RS(P, 'hand', s, -0.3, 0, 0.05);
  }
}
function base(P, ctx, t) {
  L.idle(P, ctx, t);
  L.A(P, 'spine', -0.03, 0, 0); L.A(P, 'chest', -0.04, 0, 0); L.A(P, 'neck', 0.02, 0, 0);
  relaxArms(P, t);
  L.plant(P, ctx, 0.07, -0.07, 1.1);
}

const anims = {
  idle(P, t, ctx) {
    base(P, ctx, t);
    // every ~7 s: raises its left palm and projects a test hex, glancing at it
    const c = t % 7.4, k = L.kf(c, [[0, 0], [4.6, 0], [5.0, 1], [6.3, 1], [6.8, 0]]);
    if (k > 0) {
      arm(P, ctx, 'L', 0.2, 1.22, 0.32, k);
      L.RS(P, 'hand', 'L', -1.0 * k, 0, 0);
      L.A(P, 'neck', 0.12 * k, 0.25 * k, 0); L.A(P, 'head', 0.15 * k, 0.2 * k, -0.1 * k);
    }
  },
  advance(P, t, ctx) {
    L.gait(P, ctx);
    const ph = ctx.move.phase * PI * 2;
    for (const s of SIDES) {
      const sw = Math.sin(ph + (s === 'L' ? PI : 0)) * 0.25;
      L.RS(P, 'upArm', s, sw, 0.1, 0.22); L.RS(P, 'foreArm', s, -0.6 + sw * 0.3, 0, 0); L.RS(P, 'hand', s, -0.3, 0, 0);
    }
    L.A(P, 'chest', -0.04, 0, 0);
  },
  // HARDLIGHT BOLT (battle basic): alternating palm. Draw the palm to the shoulder, thrust it out (fire 0.34), hold, recover
  cast(P, u, ctx) {
    if (u < (ctx.cu ?? 1)) ctx.side = ctx.side === 'R' ? 'L' : 'R';
    ctx.cu = u;
    const s = ctx.side || 'R', sg = s === 'L' ? 1 : -1, o = s === 'L' ? 'R' : 'L';
    base(P, ctx, ctx.t);
    const w = L.kf(u, [[0, 0], [0.12, 1], [0.72, 1], [1, 0]]);
    const th = L.kf(u, [[0, 0], [0.27, 0], [0.34, 1], [0.7, 1], [1, 0]]), dr = L.kf(u, [[0, 0], [0.24, 1], [0.32, 0], [1, 0]]);
    const kick = L.kf(u, [[0, 0], [0.33, 0], [0.36, 1], [0.55, 0]]);
    L.A(P, 'pelvis', 0, sg * (0.18 * dr - 0.22 * th), 0);
    L.A(P, 'chest', 0.06 * th - 0.06 * kick, sg * (0.22 * dr - 0.25 * th), 0);
    L.A(P, 'head', 0, -sg * (0.1 * dr - 0.3 * th), 0);
    arm(P, ctx, s, sg * L.lerp(L.lerp(0.26, 0.2, dr), 0.1, th), L.lerp(L.lerp(1.06, 1.44, dr), 1.37, th), L.lerp(L.lerp(0.12, -0.02, dr), 0.5 - 0.05 * kick, th), w, 0.35);
    // off hand comes up as a guard
    arm(P, ctx, o, -sg * 0.18, 1.2, 0.22, 0.6 * w, 0.3);
    L.plant(P, ctx, s === 'L' ? 0.2 * w : 0.02, s === 'L' ? -0.04 : -0.2 * w, 1.25);
  },
  // twin palm push: gather at the sternum, both palms out together (fire 0.38 / 0.42)
  attack(P, u, ctx) {
    base(P, ctx, ctx.t);
    const w = L.kf(u, [[0, 0], [0.15, 1], [0.78, 1], [1, 0]]), th = L.kf(u, [[0, 0], [0.32, 0], [0.4, 1], [0.75, 1], [1, 0]]);
    const g = L.kf(u, [[0, 0], [0.28, 1], [0.38, 0]]);
    P[L.PX + 1] -= 0.05 * g; P[L.PX + 2] += 0.08 * th;
    L.A(P, 'chest', -0.08 * g + 0.1 * th, 0, 0); L.A(P, 'head', 0.06 * g - 0.12 * th, 0, 0);
    for (const s of SIDES) { const sg = s === 'L' ? 1 : -1; arm(P, ctx, s, sg * L.lerp(0.09, 0.12, th), L.lerp(1.24, 1.32, th), L.lerp(0.18, 0.5, th), w, 0.4); }
    L.plant(P, ctx, 0.22 * w, -0.12 * w, 1.3);
  },
  // disc throw: reaches back over the shoulder, hurls the disc like a frisbee (fire 0.42), catches it on the return
  attack_alt(P, u, ctx) {
    base(P, ctx, ctx.t);
    const reach = L.kf(u, [[0, 0], [0.18, 1], [0.3, 0.6], [0.36, 0]]), thr = L.kf(u, [[0, 0], [0.28, 0], [0.38, 1], [0.62, 0.8], [0.8, 0]]);
    const catchK = L.kf(u, [[0.66, 0], [0.8, 1], [0.86, 1], [1, 0]]);
    L.A(P, 'pelvis', 0, -0.3 * reach + 0.35 * thr, 0);
    L.A(P, 'chest', -0.1 * reach + 0.12 * thr, -0.35 * reach + 0.45 * thr, 0);
    L.A(P, 'head', 0, 0.3 * reach - 0.3 * thr, 0);
    arm(P, ctx, 'R', -0.12, 1.62, -0.12, reach, 0.3);
    arm(P, ctx, 'R', 0.15, 1.3, 0.55, thr, 0.3);
    arm(P, ctx, 'R', -0.1, 1.55, -0.1, catchK, 0.3);
    arm(P, ctx, 'L', 0.22, 1.18, 0.25, Math.max(reach, thr) * 0.7, 0.3);
    L.plant(P, ctx, 0.22, -0.2, 1.4);
  },
  // BARRIER MATRIX: gathers (crossed arms, crouch), springs up flinging both arms skyward (release 0.167) as the disc lifts
  // overhead and spins (tick); holds the matrix up with trembling palms, then lowers
  overdrive(P, u, ctx) {
    base(P, ctx, ctx.t);
    const g = L.kf(u, [[0, 0], [0.09, 1], [0.14, 0.2], [0.17, 0]]);
    const up = L.kf(u, [[0, 0], [0.1, 0], [OD_REL, 1], [0.8, 1], [0.95, 0]]);
    const tr = Math.sin(u * 80) * 0.03 * L.kf(u, [[0.2, 0], [0.25, 1], [0.75, 1], [0.8, 0]]);
    P[L.PX + 1] += -0.14 * g + 0.035 * up;
    L.A(P, 'spine', 0.18 * g - 0.12 * up, 0, 0); L.A(P, 'chest', 0.12 * g - 0.16 * up, 0, 0);
    L.A(P, 'neck', 0.1 * g - 0.2 * up, 0, 0); L.A(P, 'head', 0.15 * g - 0.3 * up, 0, 0);
    for (const s of SIDES) {
      const sg = s === 'L' ? 1 : -1;
      arm(P, ctx, s, -sg * 0.12, 1.33, 0.14, g, 0.15);
      if (up > 0) {
        const i = BI['upArm' + s] * 3, f = BI['foreArm' + s] * 3, h = BI['hand' + s] * 3;
        const U = [-2.75 + tr, 0, -0.45 + tr], F = [-0.35, 0, 0], H = [0.9, 0, 0];
        P[i] = L.lerp(P[i], U[0], up); P[i + 1] = L.lerp(P[i + 1], sg * U[1], up); P[i + 2] = L.lerp(P[i + 2], sg * U[2], up);
        P[f] = L.lerp(P[f], F[0], up); P[f + 1] = L.lerp(P[f + 1], 0, up); P[f + 2] = L.lerp(P[f + 2], 0, up);
        P[h] = L.lerp(P[h], H[0], up);
      }
    }
    L.plant(P, ctx, 0.1 + 0.12 * up, -0.1 - 0.12 * up, 1.1 + 0.5 * up, 0, 0);
  },
  hit(P, u, ctx) {
    L.hitB(P, u, ctx);
    const k = L.kf(u, [[0, 0], [0.12, 1], [0.45, 0.4], [1, 0]]);
    relaxArms(P, ctx.t);
    for (const s of SIDES) L.AS(P, 'upArm', s, -0.35 * k, 0, 0.3 * k), L.AS(P, 'foreArm', s, -0.5 * k, 0, 0);
  },
  // lights stutter, staggers, the disc drops off the back (tick) and rings like a coin; AEGIS sinks to its knees, topples forward
  die(P, u, ctx) {
    L.dieB(P, u, ctx);
    const k = L.kf(u, [[0, 0], [0.15, 1], [0.45, 1], [0.6, 0]]);
    for (const s of SIDES) L.AS(P, 'upArm', s, -0.5 * k, 0, 0.1 * k), L.AS(P, 'foreArm', s, -0.6 * k, 0, 0);
  },
  // palm raised, the disc rises into a halo overhead (tick), slow turn of the head to the crowd
  victory(P, t, ctx) {
    base(P, ctx, t);
    const k = L.smooth(Math.min(1, t / 0.6)), b = Math.sin(t * 2.2);
    L.RS(P, 'upArm', 'R', L.lerp(0.02, -2.75, k) + b * 0.05, 0, L.lerp(0.2, 0.25, k));
    L.RS(P, 'foreArm', 'R', L.lerp(-0.55, -0.25, k), 0, 0); L.RS(P, 'hand', 'R', 0.8 * k, 0, 0);
    arm(P, ctx, 'L', 0.2, 1.0, -0.02, k * 0.8, 0.5);
    L.A(P, 'chest', -0.1 * k, 0.15 * k, 0); L.A(P, 'head', -0.2 * k, 0.3 * k + 0.15 * Math.sin(t * 0.8) * k, 0);
  },
  // drops in kneeling with the disc folded small, rises; the disc unfolds with a fast spin (tick) and the palms flare (ready)
  deploy(P, u, ctx) {
    L.deployB(P, u, ctx);
    const land = L.kf(u, [[0, 0], [0.32, 0], [0.4, 1], [0.6, 0.8], [0.85, 0], [1, 0]]), fl = L.kf(u, [[0.72, 0], [0.85, 1], [1, 0]]);
    relaxArms(P, ctx.t);
    for (const s of SIDES) L.AS(P, 'upArm', s, -0.3 * land - 0.6 * fl, 0, 0.4 * land + 0.35 * fl), L.AS(P, 'hand', s, 0.6 * fl, 0, 0);
  },
};

// ---------- disc driver (tick) ----------
const _m = new THREE.Matrix4(), _mi = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
const _qa = new THREE.Quaternion(), _qf = new THREE.Quaternion(), _pa = new THREE.Vector3(), _pf = new THREE.Vector3(), _e = new THREE.Euler();
const CHAIN = ['pelvis', 'spine', 'chest'].map((n) => BI[n]);
function chestMat(bones) {
  _m.identity();
  for (const i of CHAIN) { bones[i].updateMatrix(); _m.multiply(bones[i].matrix); }
  return _m;
}
// free target (body space) for each driven action; returns blend k (0 = attached)
function freeTarget(ctx, a, u, t, twin, out, outQ) {
  const sp = twin ? -ctx.spin * 1.3 : ctx.spin;
  const lift = twin ? 0.36 : 0;
  switch (a) {
    case 'overdrive': {
      out.set(0, 2.22 + lift + 0.04 * Math.sin(t * 3), 0.04);
      outQ.setFromEuler(_e.set(-PI / 2 + 0.12 * Math.sin(t * 2.3), 0, sp, 'XYZ'));
      return L.kf(u, [[0, 0], [0.07, 0], [0.15, 1], [0.82, 1], [0.96, 0]]);
    }
    case 'victory': {
      out.set(0, 2.16 + lift * 0.8 + 0.04 * Math.sin(t * 2), -0.08);
      outQ.setFromEuler(_e.set(-PI / 2 + 0.22, 0, sp, 'XYZ'));
      return L.smooth(Math.min(1, t / 0.9));
    }
    case 'attack_alt': {
      const fly = L.kf(u, [[0.3, 0], [0.42, 1], [0.58, 1], [0.8, 0]]);
      out.set(twin ? 0.25 : -0.05, 1.32 + lift * 0.3 + 0.08 * Math.sin(u * PI), 0.3 + 1.5 * fly);
      outQ.setFromEuler(_e.set(-PI / 2 + 0.15, 0, sp, 'XYZ'));
      return L.kf(u, [[0.22, 0], [0.32, 1], [0.76, 1], [0.86, 0]]);
    }
    case 'die': {
      // drop off the back, hit the floor, wobble like a coin, settle flat
      const f = L.clamp((u - 0.2) / 0.2, 0, 1), R = twin ? TR : DR;
      const amp = 0.55 * Math.exp(-Math.max(0, u - 0.4) * 9) * (u > 0.4 ? 1 : 0);
      const wob = u * 34;
      const yFloor = 0.02 + R * Math.sin(amp) + 0.015;
      out.set((twin ? 0.42 : 0.12), L.lerp(1.4 + lift * 0.5, yFloor, f * f), L.lerp(-0.32, -0.62 - (twin ? 0.15 : 0), f));
      const tumble = (1 - f) * TILT + f * (-PI / 2);
      outQ.setFromEuler(_e.set(tumble + amp * Math.cos(wob), amp * Math.sin(wob) * 0.6, sp * (1 - L.clamp((u - 0.42) / 0.3, 0, 1)), 'XYZ'));
      return L.kf(u, [[0.18, 0], [0.24, 1]]);
    }
    default: return 0;
  }
}
function driveDisc(unit, ctx, bones, twin, a, u, t) {
  const bn = bones[BI[twin ? 'aux1' : 'aux0']];
  const rest = twin ? DIMS.aux1 : DIMS.aux0, rk = unit.rank;
  // attached: rest offset (R3+ floats free: further back + bob), lean back, spin; hit wobble
  const flt = rk >= 3 ? 1 : 0, ph = twin ? 1.7 : 0;
  _pa.set(rest[0], rest[1] + flt * (0.03 + 0.025 * Math.sin(t * 1.6 + ph)), rest[2] - flt * 0.08);
  const wob = (ctx.hitK || 0) * 0.25 * Math.sin(t * 40);
  const sp = twin ? -ctx.spin * 1.3 : ctx.spin;
  _qa.setFromEuler(_e.set(TILT + wob + (twin ? -0.12 : 0), twin ? 0.35 : 0, sp, 'XYZ'));
  const k = freeTarget(ctx, a, u, t, twin, _pf, _qf);
  if (k > 0.001) {
    chestMat(bones);
    _mi.copy(_m).invert();
    _pf.applyMatrix4(_mi);
    _m.decompose(_p, _q, _s);
    _qf.premultiply(_q.invert());
    _pa.lerp(_pf, k);
    _qa.slerp(_qf, k);
  }
  bn.position.copy(_pa);
  bn.quaternion.copy(_qa);
  // deploy: folded small until the unfold (with a fast spin from ctx.spinBoost); overdrive: the disc swells
  let sc = 1;
  if (a === 'deploy') sc = L.kf(u, [[0, 0.25], [0.55, 0.25], [0.68, 1.12], [0.8, 1]]);
  else if (a === 'overdrive') sc = 1 + (twin ? 0.2 : 0.35) * L.kf(u, [[0.1, 0], [0.17, 1], [0.8, 1], [0.95, 0]]);
  else if (a === 'cast' || a === 'attack') sc = 1 + 0.06 * L.kf(u, [[0.25, 0], [0.36, 1], [0.6, 0]]);
  bn.scale.setScalar(sc);
}
function spinRate(a, u) {
  switch (a) {
    case 'overdrive': return 1.2 + 10 * L.kf(u, [[0.05, 0], [0.17, 1], [0.8, 1], [1, 0]]);
    case 'attack_alt': return 1 + 16 * L.kf(u, [[0.25, 0], [0.35, 1], [0.8, 1], [0.9, 0]]);
    case 'cast': case 'attack': return 1 + 5 * L.kf(u, [[0.1, 0], [0.32, 1], [0.7, 0]]);
    case 'deploy': return 1 + 18 * L.kf(u, [[0.5, 0], [0.6, 1], [0.8, 1], [1, 0]]);
    case 'victory': return 2.2;
    case 'die': return 3 * (1 - L.clamp(u / 0.6, 0, 1));
    default: return 0.6;
  }
}

export default {
  id: 'aegis', name: 'AEGIS', role: 'mage', faction: 'corporate', rarity: 'rare', realm: 'scifi',
  rig: 'biped', dims: DIMS, height: 1.74, radius: 0.48, walkSpeed: 1.2, cadence: 0.9, scheme: 'light',
  style: { weapon: 'none', heavy: 0, stance: 1.2 },
  paint: {
    corporate: { paint: 0xeef3f8, accent: 0x3f86e8, trim: 0xf2a93b },
    rogue: { paint: 0xe9e3db, accent: 0xc9381e, trim: 0xffb14a },
    experimental: { paint: 0xe8e3f5, accent: 0x7a44e6, trim: 0xffb14a },
  },
  mats: {
    all: {
      paint: { rough: 0.24, coat: 1, panel: { groove: 0.12, scale: 2.6 } },
      accent: { rough: 0.3, panel: { groove: 0.15 } },
      metal: { color: 0x30353f, rough: 0.4, metal: 0.85, panel: { groove: 0.1, scale: 8 } },
      trim: { rough: 0.32 },
    },
    legendary: { glow: { color: 0xffd98a } },   // the default gold glow blooms orange-red on the small head/ear lamps
  },
  sockets: { muzzle: ['handR', [0, -0.12, 0]], muzzleL: ['handL', [0, -0.12, 0]], hand: ['handR', [0, -0.1, 0]], core: [0, 0.04, 0.16], head: [0, 0.1, 0.1] },
  events: {
    cast: [['fire', 0.34]], attack: [['fire', 0.38], ['fire', 0.42]], attack_alt: [['cast', 0.2], ['fire', 0.42]],
    overdrive: [['cast', 0.04], ['fire', OD_REL]], die: [['down', 0.8]], deploy: [['land', 0.4], ['ready', 0.85]], hit: [],
  },
  durs: { cast: 1.0, attack: 1.1, attack_alt: 1.5, overdrive: 2.4, hit: 0.45, die: 2.0, deploy: 1.5 },
  anims,
  post(P, ctx, act) {
    ctx.act = act ? act.name : null;
    ctx.au = act ? Math.min(1, act.t / act.dur) : 0;
  },
  tick(unit, dt, ctx, bones) {
    const a = ctx.act || (unit.state.dead ? 'die' : unit.state.loop === 'victory' ? 'victory' : null);
    const u = ctx.act ? ctx.au : unit.state.dead ? 1 : 0;
    const t = ctx.t;
    ctx.vt = a === 'victory' && !ctx.act ? (ctx.vt || 0) + dt : 0;
    ctx.spin = (ctx.spin || 0) + dt * spinRate(a, u);
    ctx.hitK = a === 'hit' ? L.kf(u, [[0, 0], [0.1, 1], [1, 0]]) : 0;
    const tv = a === 'victory' ? ctx.vt : t;
    driveDisc(unit, ctx, bones, false, a, u, tv);
    if (unit.rank >= 4) driveDisc(unit, ctx, bones, true, a, u, tv);
    unit.aegisDisc = bones[BI.aux0];
    unit._aegisSide = ctx.side || 'R';
  },
  fxHints: { projectile: 'hardlight_bolt', impact: 'hex_shatter', overdrive: 'barrier_matrix', color: 0x1fd2ff },
  build,
};
