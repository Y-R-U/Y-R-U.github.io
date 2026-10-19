// ORACLE, experimental rare mage "Null Orb Weaver" (sculptor-6). Brief: docs/ROSTER.md `oracle`; look: refs/ref_battle_02.png player back-mid.
// Slender feminine biped caster: small masked head under two big swept horn fins, wasp waist, long flared coat-skirt split at the
// front, long legs on pointed heels, arms raised to the sides weaving two big null orbs (void-cored violet spheres in a dark cage).
// Coherent with HALO / PHASE / PRISM: black-violet `accent` under-body, saturated violet `paint` on horns, chest, coat hems and
// bracers, pale lilac hardlight `trim`, violet `glow` seams, pink-white `eye` visor.
// Rank tiers: R0 battered (chipped left horn, no glow seams) · R1 base · R2 crest grows (taller horns + a second horn pair), orbs get
//   hardlight rings · R3 orbs orbit the body when idle, horn edges + coat hems glow · R4 third orb circling the head + glowing runes
//   on the floor plate · R5 hardlight halo behind the head with crown spikes (the most emissive state).
// Rarity (o.r): epic+ second coat layer + longer back blades; legendary = kit gold.
// Technique: orbs ride aux2/aux3 (the kit steers them to the palms); tick() layers orbit / throw / swell / drop on top. aux1 is
// re-parented to the pelvis and pinned to the floor every frame (R4 runes + the third orb that circles with it).
import { THREE, P, PS, plate, fin, discX, shell, LIB, kf, PI, BI } from '../kit.js';

const DIMS = {
  thigh: 0.4, shin: 0.44, ankle: 0.09, hipX: 0.095, hipY: -0.04, spine: 0.12, chest: 0.2, neck: 0.22, headOff: 0.04,
  clavX: 0.045, clavY: 0.17, shoulder: 0.14, upArm: 0.27, foreArm: 0.25, aux0: [0, 0.15, -0.12],
  parents: { aux1: 'pelvis' }, aux1: [0, -0.97, 0], aux2: [0.45, 0.5, 0.1], aux3: [-0.45, 0.5, 0.1],
};
const L = LIB;
const SIDES = ['L', 'R'];
const OD_REL = 0.167;   // overdrive release (0.4 s of 2.4 s = the sim's AREA windup)

// ---------- greebles ----------
function lamp(b, bone, pos, rot, r = 0.02, slot = 'glow', mirror = true) {
  const put = mirror ? b.sym.bind(b) : b.add.bind(b);
  put(b.cyl(r * 1.45, r * 1.45, 0.016, 12), bone, 'metal', pos, rot);
  put(b.cyl(r, r, 0.024, 12), bone, slot, pos, rot);
}

// ---------- parts ----------
// swept horn fin, authored in its own plane (x = back, y = up), turned sagittal
const HORN = [[0, 0], [0.07, 0], [0.12, 0.1], [0.17, 0.22], [0.205, 0.35], [0.12, 0.24], [0.05, 0.12], [0, 0.05]];
function horn(b, k, pos, splay, slot, edge, chip) {
  const pts = HORN.map(([x, y], i) => [x * k, y * k * (chip && i === 4 ? 0.72 : 1)]);
  b.scope(pos, [-0.42, 0, splay], 1, () => {
    b.sym(fin(b, pts, 0.032, 0.009), 'head', slot, [0, 0, 0], [0, PI / 2, 0]);
    // lilac hardlight inner blade, offset a touch outward
    const inner = [[0.03, 0.03], [0.07, 0.03], [0.13, 0.15], [0.17, 0.28], [0.1, 0.18]].map(([x, y]) => [x * k, y * k]);
    b.sym(fin(b, inner, 0.04, 0.004), 'head', 'trim', [0, 0, 0], [0, PI / 2, 0]);
    if (edge) b.sym(b.tube([[0, 0.05 * k, 0], [-0.06 * k, 0.13 * k, 0], [-0.13 * k, 0.26 * k, 0], [-0.19 * k, 0.33 * k, 0]], 0.007, 10, 4), 'head', 'glow', [0, 0, 0.0], [0, 0, 0]);
  });
}

function head(b, o) {
  const rk = o.rank, far = b.far, y = 0.07;
  // cranium + violet helm cap + pale lilac faceplate with a pointed chin (touch-up 2: was black and read as a dark box)
  b.add(b.sph(16, 12), 'head', 'metal', [0, y, -0.005], [0, 0, 0], [0.078, 0.095, 0.095]);
  b.add(plate(b, 0.15, 0.1, 0.17, { c: 0.035, tx: 0.62, tz: 0.75 }), 'head', 'paint', [0, y + 0.045, -0.012]);
  b.add(b.ext([[-0.072, 0.05], [0.072, 0.05], [0.064, -0.035], [0.014, -0.11], [-0.014, -0.11], [-0.064, -0.035]], 0.05, 0.012), 'head', 'trim', [0, y - 0.004, 0.078], [-0.2, 0, 0]);
  // slanted twin-slit visor (a V) set in a dark recess + brow ridge + a dark mouth line
  b.sym(b.cbox(0.074, 0.034, 0.02, 0.006), 'head', 'accent', [0.03, y + 0.016, 0.112], [-0.2, 0.3, -0.28]);
  if (!far) b.add(b.cbox(0.03, 0.006, 0.01, 0.002), 'head', 'accent', [0, y - 0.058, 0.114], [-0.2, 0, 0]);
  b.sym(b.cbox(0.06, 0.02, 0.024, 0.005), 'head', 'glow', [0.03, y + 0.016, 0.119], [-0.2, 0.3, -0.28]);
  b.add(b.cbox(0.13, 0.016, 0.03, 0.005), 'head', 'paint', [0, y + 0.036, 0.087], [-0.15, 0, 0]);
  // cheek guards + ear discs (the horns root here)
  PS(b, 'head', 'paint', [0.025, 0.08, 0.07], [0.075, y - 0.02, 0.035], [0, 0.25, 0.12], { c: 0.008, bz: 0.55 });
  b.sym(discX(b, 0.032, 0.03, 12), 'head', 'metal', [0.082, y + 0.03, -0.01]);
  if (!far) b.sym(discX(b, 0.018, 0.034, 10), 'head', 'glow', [0.086, y + 0.03, -0.01]);
  // the crest: two big swept horn fins (signature), R2 grows them and adds a lower pair
  const k = rk >= 2 ? 1.72 : 1.42;
  horn(b, k, [0.055, y + 0.07, -0.01], -0.38, 'paint', rk >= 3, rk === 0);
  if (rk >= 2) horn(b, 0.62, [0.075, y + 0.01, -0.03], -0.95, 'paint', rk >= 3, false);
  // sagittal back crest ridge
  b.add(fin(b, [[0, 0], [0.05, 0], [0.13, 0.05], [0.16, 0.09], [0.06, 0.06]], 0.018, 0.005), 'head', 'accent', [0, y + 0.06, 0.0], [0, PI / 2, 0]);
  // R5 crown: hardlight halo behind the head + crown spikes
  if (rk >= 5) {
    const hp = [0, y + 0.08, -0.15], tilt = -0.28;
    b.add(b.tor(0.2, 0.01, 40, 5), 'head', 'glow', hp, [tilt, 0, 0]);
    b.add(b.tor(0.235, 0.006, 40, 4), 'head', 'trim', hp, [tilt, 0, 0]);
    for (let i = 0; i < 9; i++) {
      const a = PI * 0.1 + i * PI * 0.8 / 8, h = i === 4 ? 0.12 : i % 2 ? 0.05 : 0.08;
      b.add(fin(b, [[-0.013, 0], [0.013, 0], [0, h]], 0.01, 0.003), 'head', i % 2 ? 'trim' : 'glow',
        [Math.cos(a) * 0.235, hp[1] + Math.sin(a) * 0.235 * Math.cos(tilt), hp[2] - Math.sin(a) * 0.235 * Math.sin(tilt)], [tilt, 0, a - PI / 2]);
    }
  }
}

function torso(b, o) {
  const rk = o.rank, r = o.r, far = b.far;
  // neck: thin metal column + rings
  b.add(b.cyl(0.028, 0.034, 0.2, 10), 'neck', 'metal', [0, 0.06, 0]);
  if (!far) for (let i = 0; i < 3; i++) b.add(b.tor(0.035, 0.007, 12, 4), 'neck', 'accent', [0, 0.0 + i * 0.05, 0], [PI / 2, 0, 0]);
  // chest: metal core, black bodice (broad top, wasp-narrow bottom), violet V breastplate, glowing sternum gem
  P(b, 'chest', 'metal', [0.19, 0.24, 0.14], [0, 0.08, -0.01], [0, 0, 0], { c: 0.03 });
  P(b, 'chest', 'accent', [0.37, 0.34, 0.22], [0, 0.07, 0.0], [0.04, 0, 0], { c: 0.05, tx: 1.22, bx: 0.55, bz: 0.8 });
  P(b, 'chest', 'paint', [0.34, 0.15, 0.08], [0, 0.165, 0.095], [0.28, 0, 0], { c: 0.03, tx: 1.12, bx: 0.48 });
  P(b, 'chest', 'trim', [0.3, 0.02, 0.03], [0, 0.235, 0.1], [0.28, 0, 0], { c: 0.008, bx: 0.9 });
  PS(b, 'chest', 'paint', [0.12, 0.1, 0.055], [0.07, 0.11, 0.115], [0.42, 0.32, 0.05], { c: 0.02, tx: 0.8 });
  PS(b, 'chest', 'accent', [0.07, 0.05, 0.03], [0.085, 0.045, 0.125], [0.3, 0.3, 0.05], { c: 0.01 });
  if (!far) for (let i = 0; i < 3; i++) b.sym(b.cbox(0.05, 0.008, 0.02, 0.002), 'chest', 'trim', [0.085, 0.03 + i * 0.03, 0.115], [0.1, 0.3, 0]);
  P(b, 'chest', 'metal', [0.06, 0.1, 0.03], [0, 0.07, 0.1], [0.15, 0, 0], { c: 0.01, bx: 0.5 });
  b.add(b.ext([[0, -0.05], [0.026, 0], [0, 0.062], [-0.026, 0]], 0.028, 0.006), 'chest', 'glow', [0, 0.07, 0.115], [0.15, 0, 0]);
  // high lilac collar + violet collar fins framing the neck
  b.add(b.cbox(0.17, 0.022, 0.07, 0.007), 'chest', 'trim', [0, 0.228, 0.03], [0.32, 0, 0]);
  b.sym(fin(b, [[0, 0], [0.05, 0], [0.04, 0.09], [0.0, 0.12]], 0.018, 0.005), 'chest', 'paint', [0.06, 0.2, -0.02], [-0.25, -0.35, -0.2]);
  // back plate with a glowing spine line
  P(b, 'chest', 'accent', [0.22, 0.22, 0.05], [0, 0.11, -0.085], [-0.12, 0, 0], { c: 0.02, tx: 1.1, bx: 0.7 });
  if (rk >= 1) b.add(b.cbox(0.014, 0.16, 0.012, 0.004), 'chest', 'glow', [0, 0.11, -0.112], [-0.12, 0, 0]);
  lamp(b, 'chest', [0.125, 0.17, 0.09], [PI / 2 + 0.3, 0.45, 0], 0.014, 'glow');
  if (!far) for (const [x, y] of [[0.09, 0.03], [0.1, 0.09], [0.06, -0.03]]) b.sym(b.cyl(0.008, 0.008, 0.012, 8), 'chest', 'metal', [x, y, 0.1], [PI / 2 + 0.1, 0.3, 0]);
  // knee guards: small layered plates + glow pip
  PS(b, 'shin', 'accent', [0.07, 0.05, 0.03], [0, -0.04, 0.06], [-0.1, 0, 0], { c: 0.01 });
  b.sym(b.cyl(0.01, 0.01, 0.01, 8), 'shin', 'glow', [0, 0.0, 0.075], [PI / 2 - 0.3, 0, 0]);
  // wasp waist
  b.add(b.cyl(0.07, 0.085, 0.16, 12), 'spine', 'metal', [0, 0.06, 0]);
  P(b, 'spine', 'accent', [0.17, 0.15, 0.15], [0, 0.04, 0.005], [0, 0, 0], { c: 0.03, bx: 0.95, tx: 0.78, bz: 0.95, tz: 0.8 });
  if (!far) for (let i = 0; i < 3; i++) b.add(b.cbox(0.11 - i * 0.012, 0.012, 0.012, 0.003), 'spine', 'trim', [0, -0.01 + i * 0.045, 0.078 - i * 0.004], [0, 0, 0]);
  P(b, 'spine', 'paint', [0.1, 0.13, 0.03], [0, 0.05, 0.08], [0.04, 0, 0], { c: 0.012, bx: 0.45, tx: 1.1 });
  // hips: black block, lilac belt, belt gem
  P(b, 'pelvis', 'accent', [0.22, 0.12, 0.16], [0, 0, 0], [0, 0, 0], { c: 0.03, tx: 0.85 });
  b.add(b.tor(0.115, 0.012, 24, 4), 'pelvis', 'trim', [0, 0.045, 0], [PI / 2, 0, 0], [1, 0.78, 1]);
  b.add(b.cbox(0.05, 0.045, 0.02, 0.008), 'pelvis', 'metal', [0, 0.04, 0.09]);
  b.add(b.cyl(0.014, 0.014, 0.024, 10), 'pelvis', 'glow', [0, 0.04, 0.1], [PI / 2, 0, 0]);
  PS(b, 'pelvis', 'paint', [0.04, 0.12, 0.13], [0.11, -0.03, 0], [0, 0, 0.18], { c: 0.012, bx: 0.8 });
  coat(b, o);
}

// long flared coat-skirt: back + sides, split open at the front (legs read); hem glow at R3
function coat(b, o) {
  const far = b.far, rk = o.rank, layers = o.r >= 2 ? 2 : 1;
  const n = far ? 6 : 9;
  for (let ly = 0; ly < layers; ly++) {
    for (let i = 0; i < n; i++) {
      const a = PI * 0.36 + (i / (n - 1)) * PI * 1.28;   // angle from +z (front): skip the front +/-0.42 pi
      const back = Math.abs(Math.cos(a));
      const len = (0.44 + 0.18 * Math.max(0, -Math.cos(a))) * (ly ? 0.78 : 1), w = 0.068 * (ly ? 0.85 : 1);
      const blade = [[-w, 0], [w, 0], [w * 1.45, -len * 0.8], [w * 0.6, -len], [0, -len - 0.06], [-w * 0.6, -len], [-w * 1.45, -len * 0.8]];
      const pos = [Math.sin(a) * (0.15 + ly * 0.014), 0.0 - ly * 0.02, Math.cos(a) * (0.12 + ly * 0.014)];
      const fl = 0.36 + 0.06 * Math.max(0, -Math.cos(a));
      b.scope(pos, [0, a, 0], 1, () => {
        b.add(b.ext(blade, 0.02, 0.005), 'pelvis', ly || i % 2 ? 'paint' : 'accent', [0, 0, 0], [-fl, 0, 0]);
        // dark lining on the inner face
        if (!far && !ly) b.scope([0, 0, -0.014], [-fl, 0, 0], 0.92, () => b.add(b.ext(blade, 0.012, 0.003), 'pelvis', 'metal', [0, 0, 0]));
        if (ly) return;
        // violet hem band + seam on the outer face of each blade
        b.scope([0, 0, 0], [-fl, 0, 0], 1, () => {
          b.add(b.ext([[-w * 1.3, -len * 0.7], [w * 1.3, -len * 0.7], [w * 0.6, -len], [0, -len - 0.06], [-w * 0.6, -len]], 0.024, 0.004), 'pelvis', i % 2 ? 'trim' : 'paint', [0, 0, 0.004]);
          if (rk >= 3 && !far) b.add(b.cbox(w * 1.6, 0.012, 0.03, 0.003), 'pelvis', 'glow', [0, -len * 0.76, 0.004]);
          if (rk >= 1 && i % 2 === 0 && !far) b.add(b.cbox(0.01, len * 0.5, 0.026, 0.003), 'pelvis', rk >= 2 ? 'glow' : 'trim', [0, -len * 0.42, 0.003]);
        });
      });
      void back;
    }
  }
}

function limbs(b, o) {
  const D = b.rig.D, ua = D.upArm, fa = D.foreArm, rk = o.rank, far = b.far;
  // --- arms
  b.sym(b.cyl(0.03, 0.03, D.shoulder, 8), 'clav', 'metal', [D.shoulder / 2, 0, 0], [0, 0, PI / 2]);
  b.sym(b.sph(12, 10), 'upArm', 'metal', [0, 0, 0], [0, 0, 0], 0.048);
  b.sym(b.cyl(0.03, 0.026, ua, 8), 'upArm', 'metal', [0, -ua / 2, 0]);
  PS(b, 'upArm', 'accent', [0.072, ua * 0.55, 0.072], [0.004, -ua * 0.52, 0], [0, 0, 0], { c: 0.016, tx: 1.15, tz: 1.15 });
  // pauldron: black dome + violet upswept vanes (two layers) + lilac edge; scaled up so the upper body holds its own against the coat
  b.scope([0.012, 0.01, 0], [0, 0, 0], 1.38, () => {
    b.sym(b.sph(16, 9, 0, PI * 2, 0, PI * 0.5), 'upArm', 'accent', [0.02, 0.015, 0], [0, 0, -0.35], [0.09, 0.07, 0.095]);
    b.sym(b.tor(0.085, 0.008, 18, 4), 'upArm', 'trim', [0.02, 0.012, 0], [PI / 2, 0, -0.35], [1.05, 1.1, 1]);
    b.sym(b.ext([[0, -0.03], [0.09, -0.04], [0.15, 0.08], [0.1, 0.24], [0.04, 0.09]], 0.026, 0.007), 'upArm', 'paint', [0.0, 0.0, 0.0], [0, -0.22, -0.32]);
    b.sym(b.ext([[0.085, -0.035], [0.105, -0.035], [0.155, 0.08], [0.11, 0.22], [0.13, 0.08]], 0.032, 0.003), 'upArm', 'trim', [0.0, 0.0, 0.0], [0, -0.22, -0.32]);
    b.sym(b.ext([[0, -0.02], [0.07, -0.03], [0.12, 0.05], [0.08, 0.17], [0.03, 0.06]], 0.022, 0.006), 'upArm', 'accent', [0.0, -0.005, -0.035], [0.1, -0.5, -0.5]);
    if (o.rank >= 1) b.sym(b.cbox(0.01, 0.12, 0.012, 0.003), 'upArm', 'glow', [0.09, 0.08, 0.016], [0, -0.22, -0.32 - 0.3]);
    lamp(b, 'upArm', [0.06, 0.045, 0.06], [PI / 2, -0.25, 0], 0.013);
    PS(b, 'upArm', 'accent', [0.12, 0.035, 0.12], [0.05, -0.04, 0], [0, 0, -0.45], { c: 0.01, tx: 0.9 });
    PS(b, 'upArm', 'paint', [0.11, 0.03, 0.11], [0.065, -0.07, 0], [0, 0, -0.55], { c: 0.008, tx: 0.9 });
    PS(b, 'upArm', 'trim', [0.11, 0.012, 0.11], [0.055, -0.02, 0], [0, 0, -0.45]);
  });
  // elbow + flared violet bracer (bell sleeve), lilac cuff ring, glow seam
  b.sym(discX(b, 0.032, 0.062, 10), 'foreArm', 'metal', [0, 0, 0]);
  b.sym(shell(b, -0.03, -fa + 0.015, [0.036, 0.042, 0.056, 0.072], 9), 'foreArm', 'paint');
  b.sym(b.tor(0.072, 0.008, 18, 4), 'foreArm', 'trim', [0, -fa + 0.02, 0], [PI / 2, 0, 0]);
  b.sym(fin(b, [[0, 0.02], [0.03, 0], [0.012, -0.16], [0, -0.17]], 0.016, 0.004), 'foreArm', 'accent', [0.052, -0.06, 0], [0, PI / 2, 0.08]);
  if (rk >= 1) b.sym(b.cbox(0.012, fa * 0.5, 0.012, 0.003), 'foreArm', 'glow', [0.0, -fa * 0.55, 0.06], [-0.08, 0, 0]);
  // slender open hands: palm, emitter disc, four fanned fingers + thumb
  b.sym(b.cbox(0.045, 0.07, 0.07, 0.012), 'hand', 'accent', [0, -0.035, 0]);
  b.sym(b.cyl(0.024, 0.024, 0.01, 14), 'hand', 'glow', [0.024, -0.04, 0], [0, 0, PI / 2]);
  if (!far) {
    for (let i = 0; i < 4; i++) b.sym(b.cbox(0.012, 0.075, 0.013, 0.003), 'hand', 'metal', [0, -0.1, -0.03 + i * 0.02], [-0.12 + i * 0.08, 0, 0]);
    b.sym(b.cbox(0.012, 0.05, 0.013, 0.003), 'hand', 'metal', [-0.018, -0.05, 0.045], [0.7, 0, -0.3]);
  }
  // --- legs: slim, long, pointed heels
  b.sym(b.sph(10, 8), 'thigh', 'metal', [0, 0, 0], [0, 0, 0], 0.052);
  b.sym(shell(b, -0.02, -D.thigh + 0.02, [0.06, 0.072, 0.06, 0.044], 8), 'thigh', 'accent');
  PS(b, 'thigh', 'paint', [0.085, D.thigh * 0.55, 0.05], [0.006, -D.thigh * 0.45, 0.048], [0, 0, 0], { c: 0.016, tx: 1.15, bx: 0.7 });
  PS(b, 'thigh', 'trim', [0.016, D.thigh * 0.4, 0.03], [0.058, -D.thigh * 0.45, 0.025], [0, 0, 0.04]);
  // front tassets ride the thighs (so walking never clips them)
  PS(b, 'thigh', 'paint', [0.085, 0.15, 0.024], [0.012, -0.05, 0.08], [-0.2, 0, 0.06], { c: 0.01, bx: 0.7, tx: 1.0 });
  b.sym(discX(b, 0.036, 0.07, 10), 'shin', 'metal', [0, 0, 0]);
  PS(b, 'shin', 'paint', [0.06, 0.09, 0.04], [0, 0.0, 0.05], [-0.3, 0, 0], { c: 0.012, tx: 0.55 });
  b.sym(shell(b, -0.02, -D.shin + 0.02, [0.048, 0.054, 0.04, 0.028], 8), 'shin', 'accent');
  PS(b, 'shin', 'paint', [0.06, D.shin * 0.62, 0.035], [0, -D.shin * 0.4, 0.045], [0.04, 0, 0], { c: 0.012, tx: 1.25, bx: 0.55 });
  if (rk >= 1) PS(b, 'shin', 'glow', [0.012, D.shin * 0.34, 0.012], [0, -D.shin * 0.4, 0.066], [0.04, 0, 0]);
  b.sym(b.sph(8, 6), 'foot', 'metal', [0, 0, 0], [0, 0, 0], 0.035);
  P(b, 'footL', 'paint', [0.06, 0.05, 0.17], [0, -0.055, 0.06], [0, 0, 0], { c: 0.015, tx: 0.7, tz: 0.5 });
  P(b, 'footR', 'paint', [0.06, 0.05, 0.17], [0, -0.055, 0.06], [0, 0, 0], { c: 0.015, tx: 0.7, tz: 0.5 });
  b.sym(b.cbox(0.05, 0.016, 0.16, 0.005), 'foot', 'metal', [0, -0.08, 0.065]);
  b.sym(fin(b, [[-0.012, 0], [0.012, 0], [0.004, -0.075], [-0.004, -0.075]], 0.026, 0.004), 'foot', 'metal', [0, -0.012, -0.04], [0, PI / 2, 0]);
}

// standing fan collar behind the head (the 49 deg camera sees it as a violet crown over the shoulders)
function collar(b, o) {
  const far = b.far, n = far ? 5 : 7;
  for (let i = 0; i < n; i++) {
    const f = (i / (n - 1)) * 2 - 1, a = f * 1.25, h = 0.17 - Math.abs(f) * 0.05;
    b.scope([Math.sin(a) * 0.1, 0.215, -0.03 - Math.cos(a) * 0.06], [-0.42, a * 0.55, -f * 0.75], 1, () => {
      b.add(fin(b, [[-0.032, 0], [0.032, 0], [0.02, h * 0.8], [0, h], [-0.02, h * 0.8]], 0.016, 0.005), 'chest', i % 2 ? 'accent' : 'paint');
      if (!far) b.add(b.cbox(0.008, h * 0.6, 0.01, 0.002), 'chest', o.rank >= 3 ? 'glow' : 'trim', [0, h * 0.42, -0.01]);
    });
  }
  b.add(b.tor(0.1, 0.012, 20, 4, PI), 'chest', 'trim', [0, 0.215, -0.02], [PI / 2 - 0.4, 0, PI], [1, 0.7, 1]);
}

function back(b, o) {
  const k = o.r >= 2 ? 1.5 : 1.25;
  b.add(plate(b, 0.1, 0.1, 0.05, { c: 0.015 }), 'aux0', 'accent', [0, 0, 0.0]);
  lamp(b, 'aux0', [0, 0.0, -0.03], [PI / 2, 0, 0], 0.018, 'glow', false);
  // swept back blades (read from the 49 deg camera as a spiky collar behind the head)
  b.sym(fin(b, [[0, 0], [0.04, 0], [0.12 * k, 0.24 * k], [0.09 * k, 0.26 * k]], 0.018, 0.005), 'aux0', 'paint', [0.03, 0.02, -0.02], [-0.55, 0.25, -0.35]);
  b.sym(fin(b, [[0, 0], [0.03, 0], [0.16 * k, 0.12 * k], [0.14 * k, 0.15 * k]], 0.016, 0.004), 'aux0', 'accent', [0.04, -0.02, -0.02], [-0.3, 0.3, -0.2]);
}

// null orb: violet core in a dark containment cage, radiating shards; R2 adds hardlight rings
function orb(b, o, bone) {
  const rk = o.rank, far = b.far, R = 0.13;
  b.add(b.sph(18, 14), bone, 'glow2', [0, 0, 0], [0, 0, 0], R);   // orb core on glow2: deep violet in every faction tint
  b.add(b.tor(R * 1.02, 0.008, 24, 4), bone, 'paint', [0, 0, 0], [PI / 2, 0, 0]);
  b.add(b.tor(R * 1.02, 0.007, 24, 4), bone, 'accent', [0, 0, 0], [0, 0, 0]);
  b.add(b.tor(R * 1.02, 0.006, 24, 4), bone, 'metal', [0, 0, 0], [0, PI / 2, 0]);
  if (!far) for (let i = 0; i < 6; i++) {
    const a = i * PI / 3;
    b.add(fin(b, [[-0.01, 0], [0.01, 0], [0, 0.055]], 0.008, 0.002), bone, i % 2 ? 'trim' : 'accent', [Math.cos(a) * R * 1.12, Math.sin(a) * R * 1.12, 0], [0, 0, a - PI / 2]);
  }
  if (rk >= 2) {
    b.add(b.tor(R * 1.75, 0.008, 32, 4), bone, 'trim', [0, 0, 0], [PI / 2 + 0.35, 0, 0.2]);
    b.add(b.tor(R * 1.6, 0.005, 32, 3), bone, 'glow', [0, 0, 0], [0.4, 0.9, 0]);
  }
  if (rk >= 4) b.add(b.tor(R * 2.0, 0.004, 32, 3), bone, 'glow', [0, 0, 0], [1.3, 0, 0.5]);
}

// R4: floor runes + a third orb circling the head, both on aux1 (pinned to the floor in tick)
function runes(b, o) {
  if (o.rank < 4) return;
  const far = b.far, A = 'aux1', y = 0.012;
  b.add(b.tor(0.58, 0.012, 56, 3), A, 'glow', [0, y, 0], [PI / 2, 0, 0]);
  b.add(b.tor(0.66, 0.006, 56, 3), A, 'trim', [0, y, 0], [PI / 2, 0, 0]);
  if (!far) for (let i = 0; i < 10; i++) {
    const a = i * PI / 5, rr = 0.62;
    b.add(b.ext([[-0.03, -0.015], [0.03, -0.015], [0.0, 0.035]], 0.006, 0.0), A, i % 2 ? 'glow' : 'trim', [Math.cos(a) * rr, y, Math.sin(a) * rr], [-PI / 2, 0, -a - PI / 2]);
    b.add(b.cbox(0.05, 0.006, 0.012, 0.002), A, 'glow', [Math.cos(a + 0.31) * 0.5, y, Math.sin(a + 0.31) * 0.5], [0, -a - 0.31, 0]);
  }
  b.scope([0, 1.62, -0.44], [0, 0, 0], 0.62, () => orb(b, { rank: 2 }, A));
}

function build(b, o) {
  b.scope([0, 0, 0], [0, 0, 0], 1.16, () => head(b, o));
  torso(b, o);
  collar(b, o);
  limbs(b, o);
  back(b, o);
  orb(b, o, 'aux2'); orb(b, o, 'aux3');
  runes(b, o);
}

// ---------- anims ----------
const _v = new THREE.Vector3();
// hand IK to a point in CHEST space (so the arms ride every torso sway), then palm/finger orientation
function armTo(P, ctx, side, p, roll = 0, pitch = 0, out = 0.3) {
  L.fkPoint(P, ctx, 'chest', p, _v);
  L.armIK(P, ctx, side, _v, out);
  L.RS(P, 'hand', side, pitch, 0, roll);
}
const W = { L: [0.47, 0.2, 0.12], R: [-0.47, 0.2, 0.12] };   // weaving pose: hands out to the sides, head height
// the base stance: contrapposto on pointed toes, arms raised weaving the orbs
function base(P, ctx, t, k = 1) {
  L.idle(P, ctx, t);
  const sw = Math.sin(t * 0.55), br = Math.sin(t * 1.5);
  L.A(P, 'pelvis', 0, 0.06, 0.05 + sw * 0.02); L.A(P, 'spine', -0.02, -0.04, -0.06 - sw * 0.015); L.A(P, 'chest', -0.04, -0.03, -0.02);
  L.A(P, 'head', -0.04, 0, 0.06);
  for (const s of SIDES) {
    const ph = s === 'L' ? 0 : 1.7, w = W[s];
    const fx = Math.sin(t * 1.3 + ph) * 0.025, fy = Math.sin(t * 1.7 + ph) * 0.03 + br * 0.01;
    armTo(P, ctx, s, [L.lerp(s === 'L' ? 0.2 : -0.2, w[0], k) + fx, L.lerp(-0.18, w[1], k) + fy, L.lerp(0.04, w[2], k)], 0.5 * k, -0.15 * k, 0.4);
  }
  L.plant(P, ctx, 0.07, -0.05, 0.78, 0.0, 0.25);
}
// one arm: from the weaving pose toward point p (chest space) by k
function reach(P, ctx, s, p, k, roll = 0.5, pitch = -0.15) {
  const w = W[s];
  armTo(P, ctx, s, [L.lerp(w[0], p[0], k), L.lerp(w[1], p[1], k), L.lerp(w[2], p[2], k)], L.lerp(0.5, roll, k), L.lerp(-0.15, pitch, k), 0.4);
}
const mir = (p, s) => (s === 'L' ? p : [-p[0], p[1], p[2]]);

const anims = {
  idle(P, t, ctx) {
    base(P, ctx, t);
    // every ~7 s: a slow conducting flourish of the right hand (it is re-running the fight in its head)
    const c = t % 7.2, f = L.kf(c, [[0, 0], [4.8, 0], [5.4, 1], [6.4, 1], [7.0, 0]]);
    if (f > 0) {
      const a = (c - 4.8) * 3.2;
      reach(P, ctx, 'R', [-0.3 + Math.cos(a) * 0.08, 0.36 + Math.sin(a) * 0.08, 0.25], f, -0.4, -0.6);
      L.A(P, 'head', 0.08 * f, -0.25 * f, -0.1 * f);
    }
  },
  advance(P, t, ctx) {
    L.gait(P, ctx);
    L.A(P, 'spine', -0.04, 0, 0); L.A(P, 'chest', -0.04, 0, 0);
    const ph = ctx.move.phase * PI * 2;
    for (const s of SIDES) {
      const k = s === 'L' ? 1 : -1;
      armTo(P, ctx, s, [k * 0.38, 0.12 + Math.sin(ph + (k > 0 ? 0 : PI)) * 0.02, -0.02], 0.4, -0.1, 0.4);
    }
  },
  // NULL ORB (battle basic attack): alternating arm draws back, thrusts the orb at the lane (fire 0.32), recovers
  cast(P, u, ctx) {
    if (u < (ctx.lastCastU ?? 1)) ctx.castSide = ctx.castSide === 'R' ? 'L' : 'R';
    ctx.lastCastU = u;
    const s = ctx.castSide || 'R', o = s === 'L' ? 'R' : 'L', k = s === 'L' ? 1 : -1;
    base(P, ctx, ctx.t);
    const draw = L.kf(u, [[0, 0], [0.2, 1], [0.3, 0], [1, 0]]), thr = L.kf(u, [[0, 0], [0.2, 0], [0.32, 1], [0.55, 0.85], [1, 0]]);
    const tw = L.kf(u, [[0, 0], [0.2, 1], [0.32, -1], [0.6, -0.6], [1, 0]]);
    L.A(P, 'pelvis', 0, 0.12 * tw * k, 0); L.A(P, 'spine', 0.05 * thr, 0.15 * tw * k, 0); L.A(P, 'chest', 0.08 * thr - 0.06 * draw, 0.2 * tw * k, 0);
    L.A(P, 'head', -0.05 * draw, -0.2 * tw * k, 0);
    reach(P, ctx, s, mir([0.3, 0.3, -0.18], s), draw, 0.9, 0.3);
    if (thr > 0) reach(P, ctx, s, mir([0.1, 0.22, 0.52], s), thr, -0.2, -1.2);
    reach(P, ctx, o, mir([0.48, 0.12, -0.12], o), 0.6 * (thr + draw), 0.7, 0);
    P[L.PX + 2] += 0.05 * thr;
    L.plant(P, ctx, 0.07 + 0.08 * thr * k, -0.05 - 0.08 * thr * k, 0.85, 0, 0.25);
  },
  // twin push: both orbs thrown together (fire 0.38 + 0.43)
  attack(P, u, ctx) {
    base(P, ctx, ctx.t);
    const draw = L.kf(u, [[0, 0], [0.25, 1], [0.36, 0], [1, 0]]), thr = L.kf(u, [[0, 0], [0.25, 0], [0.38, 1], [0.6, 0.8], [1, 0]]);
    for (const s of SIDES) {
      reach(P, ctx, s, mir([0.32, 0.36, -0.12], s), draw, 0.9, 0.2);
      if (thr > 0) reach(P, ctx, s, mir([0.14, 0.24, 0.5], s), thr, -0.1, -1.2);
    }
    L.A(P, 'chest', 0.1 * thr - 0.12 * draw, 0, 0); L.A(P, 'spine', 0.06 * thr - 0.06 * draw, 0, 0); L.A(P, 'head', -0.1 * draw, 0, 0);
    P[L.PX + 2] += 0.06 * thr - 0.03 * draw;
    L.plant(P, ctx, 0.14, -0.1, 0.95, 0, 0.25);
  },
  // pirouette: a full spin on the toes with the orbs whirling wide, then both flung at the lane (fire 0.6 + 0.64)
  attack_alt(P, u, ctx) {
    base(P, ctx, ctx.t);
    const spin = L.kf(u, [[0, 0], [0.12, 0], [0.55, PI * 2], [1, PI * 2]]) % (PI * 2);
    const wide = L.kf(u, [[0, 0], [0.12, 1], [0.5, 1], [0.58, 0], [1, 0]]), thr = L.kf(u, [[0, 0], [0.52, 0], [0.6, 1], [0.8, 0.7], [1, 0]]);
    L.A(P, 'pelvis', 0, spin, 0);
    P[L.PX + 1] += 0.04 * wide;
    for (const s of SIDES) {
      reach(P, ctx, s, mir([0.55, 0.1, 0.0], s), wide, 0.2, 0.0);
      if (thr > 0) reach(P, ctx, s, mir([0.12, 0.3, 0.5], s), thr, -0.1, -1.2);
    }
    L.A(P, 'head', 0, -spin * 0.15, 0);
    L.A(P, 'chest', 0.1 * thr, 0, 0);
    if (wide > 0.05) {
      // rise onto one toe while spinning (the other leg tucks)
      L.legIK(P, ctx, 'L', 0.0, ctx.D.ankle + 0.03 * wide, 0.0, 0.6 * wide);
      L.legIK(P, ctx, 'R', -0.06, ctx.D.ankle + 0.24 * wide, -0.06, 0.9 * wide);
    }
  },
  // ORB CASCADE: arms sweep overhead as the orbs swell and merge, hurls them at the enemy (release 0.167),
  // then levitates with toes pointed, arms spread, conducting the cascade; descends as new orbs form
  overdrive(P, u, ctx) {
    base(P, ctx, ctx.t);
    const up = L.kf(u, [[0, 0], [0.12, 1], [0.15, 0.3], [0.2, 0], [1, 0]]);
    const hurl = L.kf(u, [[0, 0], [0.12, 0], [OD_REL, 1], [0.28, 0.2], [0.4, 0], [1, 0]]);
    const spread = L.kf(u, [[0, 0], [0.2, 0], [0.32, 1], [0.78, 1], [0.95, 0]]);
    const lev = L.kf(u, [[0, 0], [0.06, 0.08], [0.2, 0.3], [0.75, 0.34], [0.92, 0], [1, 0]]);
    const cond = Math.sin(u * 26) * spread;
    P[L.PX + 1] += lev * 0.95; P[L.PX + 2] += 0.1 * hurl;
    L.A(P, 'pelvis', 0.08 * hurl - 0.06 * up, 0, 0);
    L.A(P, 'spine', -0.18 * up + 0.15 * hurl - 0.1 * spread, 0, 0); L.A(P, 'chest', -0.2 * up + 0.2 * hurl - 0.12 * spread, 0, 0);
    L.A(P, 'head', -0.35 * up + 0.1 * hurl - 0.2 * spread, 0, 0);
    for (const s of SIDES) {
      reach(P, ctx, s, mir([0.1, 0.62, 0.06], s), up, -0.3, -2.6);
      if (hurl > 0) reach(P, ctx, s, mir([0.18, 0.3, 0.55], s), hurl, -0.1, -1.3);
      if (spread > 0) reach(P, ctx, s, mir([0.62, 0.3 + 0.04 * cond * (s === 'L' ? 1 : -1), 0.08], s), spread, 0.1, -0.4);
    }
    // feet: planted while gathering, then hang with pointed toes under the levitating body
    if (lev > 0.02) {
      const fy = ctx.D.ankle + lev * 0.95;
      L.legIK(P, ctx, 'L', 0.07, fy - 0.04, 0.04, 1.1 * lev / 0.34);
      L.legIK(P, ctx, 'R', -0.05, fy - 0.1, -0.08, 1.2 * lev / 0.34);
    }
  },
  hit(P, u, ctx) {
    base(P, ctx, ctx.t);
    const k = L.kf(u, [[0, 0], [0.12, 1], [0.45, 0.4], [1, 0]]), d = ctx.st.hitDir;
    P[L.PX + 2] -= 0.07 * k; P[L.PX + 1] -= 0.03 * k;
    L.A(P, 'spine', -0.14 * k, 0.1 * k * d, 0.06 * k * d); L.A(P, 'chest', -0.18 * k, 0.12 * k * d, 0.05 * k * d);
    L.A(P, 'head', -0.3 * k, -0.25 * k * d, 0.2 * k * d);
    for (const s of SIDES) reach(P, ctx, s, mir([0.22, 0.12, 0.2], s), 0.6 * k, 0.3, 0.3);
    L.plant(P, ctx, 0.06, -0.1, 0.85, 0, 0.2);
  },
  // the orbs drop and roll away dark; she sinks to her knees and folds sideways onto the floor
  die(P, u, ctx) {
    L.dieB(P, u, ctx);
    const k = L.kf(u, [[0, 0], [0.25, 1], [1, 1]]);
    for (const s of SIDES) { L.AS(P, 'upArm', s, 0.1 * k, 0, 0.15 * k); L.RS(P, 'hand', s, 0.4 * k, 0, 0.2 * k); }
    L.A(P, 'pelvis', 0, 0, 0.25 * L.kf(u, [[0.5, 0], [0.9, 1]]));
  },
  // twirls slowly with the arms raised in a V while the orbs circle overhead (tick)
  victory(P, t, ctx) {
    base(P, ctx, t);
    const k = L.smooth(Math.min(1, t / 0.7));
    L.A(P, 'pelvis', 0, Math.sin(t * 0.9) * 0.6 * k, 0);
    L.A(P, 'chest', -0.12 * k, 0, 0); L.A(P, 'head', -0.25 * k, 0, 0.1 * Math.sin(t * 1.3) * k);
    for (const s of SIDES) reach(P, ctx, s, mir([0.3, 0.6 + Math.sin(t * 2 + (s === 'L' ? 0 : 1.5)) * 0.04, 0.05], s), k, 0.0, -2.4);
    P[L.PX + 1] += 0.03 * k;
    L.plant(P, ctx, 0.06, -0.04, 0.7, 0.1, 0.4);
  },
  // lands in a low crouch with the arms crossed over the chest, rises and opens them as the orbs ignite
  deploy(P, u, ctx) {
    base(P, ctx, ctx.t, L.kf(u, [[0, 0], [0.55, 0], [0.85, 1]]));
    const land = L.kf(u, [[0, 0], [0.32, 0], [0.4, 1], [0.62, 0.85], [0.85, 0], [1, 0]]);
    P[L.PX + 1] -= 0.3 * land;
    L.A(P, 'spine', 0.3 * land, 0, 0); L.A(P, 'chest', 0.2 * land, 0, 0);
    L.A(P, 'head', 0.4 * L.kf(u, [[0, 0.4], [0.6, 0.6], [0.78, -0.25], [0.92, 0], [1, 0]]), 0, 0);
    L.plant(P, ctx, 0.2 * land + 0.07, -0.18 * land - 0.05, 0.8 + 0.4 * land, 0, 0.25);
  },
};

// ---------- orb controller (after the kit's palm steering) ----------
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _y = new THREE.Vector3(0, 1, 0);
function toPelvis(unit, bones, x, y, z, out) {
  out.set(x, y, z);
  unit.mesh.localToWorld(out);
  return bones[BI.pelvis].worldToLocal(out);
}
function orbs(unit, dt, ctx, bones) {
  const st = unit.state, a = st.action, u = ctx.gu ?? 0, t = ctx.t, rk = unit.rank;
  const O = ctx.orb || (ctx.orb = { w: [0, 0], s: [1, 1], p: [new THREE.Vector3(), new THREE.Vector3()] });
  const side = ctx.castSide || 'R';
  for (let i = 0; i < 2; i++) {
    const bone = bones[BI[i ? 'aux3' : 'aux2']], sg = i ? -1 : 1, mine = (i ? 'R' : 'L') === side;
    let w = 0, s = 1, sp = 14;
    if (!a && st.loop === 'idle' && rk >= 3) {
      // R3+: the orbs orbit the body when idle
      const ang = t * 1.1 + i * PI;
      toPelvis(unit, bones, Math.cos(ang) * 0.58, 1.3 + Math.sin(ang * 2) * 0.06, Math.sin(ang) * 0.58, _a); w = 1; sp = 5;
    } else if (!a && st.loop === 'victory') {
      const ang = t * 2.2 + i * PI;
      toPelvis(unit, bones, Math.cos(ang) * 0.32, 2.15, Math.sin(ang) * 0.32, _a); w = 1; sp = 6;
    } else if (a === 'overdrive') {
      // swell overhead and merge, vanish at the release (the FX carries them), re-form at the hands
      const g = kf(u, [[0, 0], [0.12, 1], [OD_REL, 1], [OD_REL + 0.01, 0]]);
      toPelvis(unit, bones, sg * 0.07, 1.25 + 0.12, 0.12, _a); w = g; sp = 18;
      s = u < OD_REL ? 1 + 1.3 * kf(u, [[0, 0], [0.13, 1]]) : kf(u, [[OD_REL, 0], [0.74, 0], [0.92, 1]]);
    } else if (a === 'cast') s = mine ? kf(u, [[0.3, 1], [0.33, 0], [0.55, 0], [0.85, 1]]) : 1;
    else if (a === 'attack') s = kf(u, [[0.36 + i * 0.05, 1], [0.39 + i * 0.05, 0], [0.6, 0], [0.9, 1]]);
    else if (a === 'attack_alt') s = kf(u, [[0.58 + i * 0.04, 1], [0.61 + i * 0.04, 0], [0.75, 0], [0.95, 1]]);
    else if (a === 'die' || st.dead) {
      // the orbs fall beside the feet and roll a little
      const g = kf(u, [[0, 0], [0.3, 1]]);
      toPelvis(unit, bones, sg * (0.42 + 0.12 * g), 0.07, 0.15 + 0.1 * g, _a); w = st.dead ? 1 : g; s = 0.8; sp = st.dead ? 30 : 10;
    } else if (a === 'deploy') s = kf(u, [[0, 0], [0.55, 0], [0.62, 1.5], [0.72, 1]]);
    O.w[i] += (w - O.w[i]) * (1 - Math.exp(-dt * sp));
    O.s[i] += (s - O.s[i]) * (1 - Math.exp(-dt * 22));
    if (O.w[i] > 0.001) {
      if (w > 0) O.p[i].copy(_a);
      bone.position.lerp(O.p[i], O.w[i]);
    }
    bone.scale.setScalar(Math.max(0.001, O.s[i]));
  }
  unit._oracleSide = side;
}
// aux1 (R4 runes + third orb) pinned to the floor under the unit, turning slowly
function pinFloor(unit, dt, ctx, bones) {
  const ax = bones[BI.aux1], pel = bones[BI.pelvis];
  unit.mesh.updateMatrixWorld(true);
  toPelvis(unit, bones, 0, 0, 0, _b);
  ax.position.copy(_b);
  unit.mesh.getWorldQuaternion(_q);
  pel.getWorldQuaternion(_q2);
  _q2.invert().multiply(_q).multiply(new THREE.Quaternion().setFromAxisAngle(_y, ctx.t * 0.6));
  ax.quaternion.copy(_q2);
  ax.scale.setScalar(unit.state.dead ? 0.001 : 1);
}

export default {
  id: 'oracle', name: 'ORACLE', role: 'mage', faction: 'experimental', rarity: 'rare', realm: 'scifi',
  rig: 'biped', dims: DIMS, height: 1.78, radius: 0.5, walkSpeed: 1.15, cadence: 0.9, scheme: 'bold', orbs: true,
  glow2: 0x5530ff,
  style: { weapon: 'orbs', heavy: 0, stance: 0.9 },
  paint: { experimental: { paint: 0x7a3df0, accent: 0x15101f, trim: 0xd9c8ff } },
  mats: { all: { paint: { rough: 0.24, coat: 1 }, accent: { rough: 0.32, metal: 0.5, panel: { groove: 0.22 } }, metal: { color: 0x6a6f7c, panel: { groove: 0.12 } }, glow2: { ei: 1.9 } }, experimental: { glow: { color: 0x9a3cff, ei: 2.6 } } },
  sockets: { muzzle: ['aux3', [0, 0, 0]], core: [0, 0.1, 0.12], head: [0, 0.08, 0.08], hand: ['handR', [0, -0.08, 0]] },
  events: {
    cast: [['fire', 0.32]], attack: [['fire', 0.38], ['fire', 0.43]], attack_alt: [['cast', 0.15], ['fire', 0.6], ['fire', 0.64]],
    overdrive: [['cast', 0.04], ['fire', OD_REL]], die: [['down', 0.8]],
  },
  durs: { cast: 1.0, attack: 1.0, attack_alt: 1.4, overdrive: 2.4, die: 1.9 },
  anims,
  post(P, ctx, act) { ctx.gu = act ? Math.min(1, act.t / act.dur) : 0; },
  tick(unit, dt, ctx, bones) {
    orbs(unit, dt, ctx, bones);
    if (unit.rank >= 4) pinFloor(unit, dt, ctx, bones);
  },
  fxHints: { projectile: 'null_orb', impact: 'implosion', overdrive: 'orb_cascade', color: 0xb24dff },
  build,
};
