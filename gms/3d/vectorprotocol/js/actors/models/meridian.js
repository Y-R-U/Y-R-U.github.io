// MERIDIAN, corporate epic archer "Orbital Spotter" (sculptor-11). Brief: docs/ROSTER.md `meridian`. Also map 4's boss STORMCROW
// (`boss_stormcrow`, legendary x1.35): the legendary build turns it into Kestrel's dark orbital gunship.
// M hover sniper platform: a white armoured hull with an ultra-long twin-rail barrel slung underneath, passing through two vertical
// stabiliser rings that spin round the barrel axis (the signature), a targeting-optics head (big red scope lens + laser emitter),
// an orbital-uplink dish on a mast on the back, swept canard fins and two hover pods with cyan plumes.
// VALUE: `paint` = gloss white armour plates, `accent` = deep navy under-hull + panel inserts, `metal` = silver frame / rails / ring
// bands, `trim` = small amber markers, `glow` = cyan ring strips + rail + plumes, `eye` = red optics + laser.
// Rank tiers (ROSTER, epic R2 base): R0 battered (left canard snapped, dish dented, dull rings) · R1 bare hull, plain rings
//   · R2 base: side armour, scope tube, ring clamps · R3 rings gain light segments · R4 holo scope readouts beside the head +
//   hardlight canard blades (silhouette) · R5 third gyro ring round the hull + hover particle trail under the pods.
// Legendary = STORMCROW: dark hull (navy as the main armour, white as inserts) with gold trim, broad gunship wings carrying ducted
//   lift fans, under-wing missile pods, a chin autocannon turret, twin tail fins and an armoured canopy over the optics.
// Bones (hover rig): pelvis keel, spine column, chest hull, neck/head = optics turret, aux0 = uplink dish (chest), aux2/aux3 = front /
// rear stabiliser rings (chest; spin + slide in tick), aux1 = R5 gyro ring (chest), footR = barrel slide (chest; recoil in tick),
// footL = R4 holo readouts (head), clavL/R = canards / boss wings, upArmL/R = boss lift fans (spin), thighL/R = hover pods,
// shinL/R = plumes (scaled in tick), foreArmL/R + handL/R = R5 trail rings under the pods (scroll in tick).
import { P, PS, plate, fin, discX, LIB, kf, PI, BI } from '../kit.js';

const TAU = PI * 2;
const G = 1.15;                  // authored in design units, scaled up (dims, parts, sockets, pose offsets, tick offsets)
const HOV = 0.78;
const RING_F = 0.12, RING_B = -0.21, RF = 0.3, RB = 0.35;   // ring z (chest local) + radii
const BAR_Y = -0.11, BAR_Z0 = 0.3, BAR_Z1 = 1.42;             // barrel slide (footR) height + extent
const D0 = {
  hover: HOV, thigh: 0.14, shin: 0.14, ankle: 0.02, hipX: 0.15, hipY: -0.05,
  spine: 0.08, chest: 0.12, neck: 0.12, headOff: 0.04, clavX: 0.17, clavY: 0.03, shoulder: 0.5, upArm: 0.2, foreArm: 0.2,
  offsets: {
    pelvis: [0, HOV, 0], spine: [0, 0.08, 0], chest: [0, 0.12, 0], neck: [0, 0.11, 0.17], head: [0, 0.04, 0],
    clavL: [0.17, 0.0, -0.06], clavR: [-0.17, 0.0, -0.06], upArmL: [0.5, 0.0, -0.1], upArmR: [-0.5, 0.0, -0.1],
    foreArmL: [0.15, -0.3, 0], foreArmR: [-0.15, -0.3, 0], handL: [0.15, -0.3, 0], handR: [-0.15, -0.3, 0],
    thighL: [0.15, -0.05, 0.02], thighR: [-0.15, -0.05, 0.02], shinL: [0, -0.15, 0], shinR: [0, -0.15, 0],
    footL: [0, 0.05, 0], footR: [0, BAR_Y, 0],
    aux0: [0, 0.13, -0.24], aux1: [0, 0.0, -0.04], aux2: [0, 0.0, RING_F], aux3: [0, 0.0, RING_B],
  },
  parents: { aux0: 'chest', aux1: 'chest', aux2: 'chest', aux3: 'chest', footR: 'chest', footL: 'head',
    foreArmL: 'pelvis', foreArmR: 'pelvis', handL: 'pelvis', handR: 'pelvis' },
};
const sc3 = (p) => p.map((x) => x * G);
const DIMS = Object.fromEntries(Object.entries(D0).map(([k, v]) => [k, typeof v === 'number' ? v * G : k === 'offsets' ? Object.fromEntries(Object.entries(v).map(([n, q]) => [n, sc3(q)])) : v]));
const OFF = DIMS.offsets;

// ---------------- greebles ----------------
function lamp(b, bone, pos, rot, r = 0.02, slot = 'glow', mirror = false) {
  const put = mirror ? b.sym.bind(b) : b.add.bind(b);
  put(b.cyl(r * 1.5, r * 1.5, 0.014, 12), bone, 'metal', pos, rot);
  put(b.cyl(r, r, 0.022, 12), bone, slot, pos, rot);
}
function vent(b, bone, pos, rot, w, h, n = 4, mirror = false, base = 'accent') {
  const put = mirror ? b.sym.bind(b) : b.add.bind(b);
  put(b.cbox(w, h, 0.02, 0.005), bone, base, pos, rot);
  if (b.far) return;
  b.scope(pos, rot, 1, () => { for (let i = 0; i < n; i++) put(b.cbox(w * 0.84, h / (n * 2.4), 0.03, 0.003), bone, 'metal', [0, -h / 2 + (i + 0.5) * h / n, 0.008]); });
}
function rivets(b, bone, pts, rot = [PI / 2, 0, 0], r = 0.008) { if (!b.far) for (const p of pts) b.add(b.cyl(r, r, 0.012, 6), bone, 'metal', p, rot); }
// lathe along +z (profile [r, z] from tail to nose), optional elliptical squash
function podZ(b, prof, seg, sx = 1, sy = 1) {
  const g = b.lathe(prof.map(([r, z]) => [r, z]), seg);
  g.rotateX(PI / 2);
  g.scale(sx, sy, 1);
  return g;
}

// ---------------- hull (chest) ----------------
function hull(b, o) {
  const far = b.far, rk = o.rank, boss = o.r >= 3, W = boss ? 'accent' : 'paint', N = boss ? 'paint' : 'accent';
  // core: navy faceted pod, tail to nose
  b.add(podZ(b, [[0.0, -0.46], [0.08, -0.45], [0.15, -0.38], [0.185, -0.2], [0.19, 0.05], [0.16, 0.22], [0.09, 0.34], [0.0, 0.39]], 10, 1.15, 0.82), 'chest', N, [0, 0.0, 0]);
  // dorsal armour: white spine plate in two layers, sloped nose cap
  P(b, 'chest', W, [0.32, 0.07, 0.56], [0, 0.12, -0.06], [0.03, 0, 0], { c: 0.022, tx: 0.72, tz: 0.92 });
  P(b, 'chest', W, [0.26, 0.06, 0.24], [0, 0.1, 0.25], [0.3, 0, 0], { c: 0.02, tx: 0.7, tz: 0.8 });
  if (rk >= 1) P(b, 'chest', N, [0.13, 0.03, 0.36], [0, 0.16, -0.1], [0.03, 0, 0], { c: 0.01, tx: 0.8 });
  if (!far) b.add(b.cbox(0.02, 0.012, 0.3, 0.004), 'chest', 'glow', [0, 0.178, -0.1], [0.03, 0, 0]);
  // flank armour (lean in at the top), cheek intakes, trim chevrons
  PS(b, 'chest', W, [0.06, 0.2, 0.56], [0.19, 0.01, -0.03], [0, 0, -0.3], { c: 0.02, tz: 0.86, bz: 0.9 });
  PS(b, 'chest', W, [0.05, 0.1, 0.2], [0.17, -0.02, 0.3], [0, 0.35, -0.3], { c: 0.015, tz: 0.7 });
  if (rk >= 2) PS(b, 'chest', N, [0.03, 0.08, 0.3], [0.228, -0.03, -0.12], [0, 0, -0.25], { c: 0.01 });
  vent(b, 'chest', [0.226, 0.02, -0.12], [0, PI / 2, -0.3], 0.12, 0.06, 3, true, N);
  if (!far) PS(b, 'chest', 'trim', [0.012, 0.02, 0.08], [0.215, 0.08, 0.16], [0, 0, -0.3]);
  // belly: keel block the barrel housing hangs from
  P(b, 'chest', N, [0.24, 0.08, 0.64], [0, -0.11, -0.02], [0, 0, 0], { c: 0.02, bx: 0.8 });
  // tail: thruster block + twin nozzles (glow throats), dorsal sensor bump
  P(b, 'chest', N, [0.24, 0.13, 0.12], [0, 0.0, -0.44], [0, 0, 0], { c: 0.025, tx: 0.85 });
  for (const sx of [1, -1]) {
    b.add(b.cyl(0.045, 0.055, 0.08, 12), 'chest', 'metal', [sx * 0.065, 0.0, -0.5], [PI / 2, 0, 0]);
    b.add(b.cyl(0.035, 0.035, 0.012, 12), 'chest', 'glow', [sx * 0.065, 0.0, -0.542], [PI / 2, 0, 0]);
  }
  rivets(b, 'chest', [[0.09, 0.07, -0.505], [-0.09, 0.07, -0.505], [0.09, -0.06, -0.505], [-0.09, -0.06, -0.505]], [PI / 2, 0, 0]);
  // flank marker lamps + corporate amber stripe
  lamp(b, 'chest', [0.235, -0.05, 0.12], [0, 0, PI / 2 - 0.3], 0.016, 'glow', true);
  
  // boss: armoured canopy cowl over the turret ring, twin canted tail fins, heavier nose ram
  if (boss) {
    b.sym(fin(b, [[0, 0], [0.16, 0], [0.12, 0.26], [0.06, 0.28]], 0.022, 0.006), 'chest', W, [0.07, 0.12, -0.42], [0, PI / 2, -0.35]);
    b.sym(b.cbox(0.012, 0.18, 0.012, 0.003), 'chest', 'glow', [0.11, 0.24, -0.45], [0, 0, -0.35]);
    P(b, 'chest', W, [0.18, 0.08, 0.16], [0, -0.02, 0.36], [0.2, 0, 0], { c: 0.02, tx: 0.6, tz: 0.5 });
    b.add(b.cbox(0.2, 0.014, 0.05, 0.004), 'chest', 'trim', [0, 0.14, 0.12], [0.2, 0, 0]);
  }
  // R2+: second flank layer, ventral stabiliser fins, dorsal sensor spine; detail greebles
  if (rk >= 2) {
    PS(b, 'chest', N, [0.035, 0.1, 0.36], [0.215, 0.07, -0.08], [0, 0, -0.42], { c: 0.01, tz: 0.85 });
    b.sym(fin(b, [[0, 0], [0.16, 0], [0.12, -0.12], [0.03, -0.13]], 0.016, 0.004), 'chest', W, [0.08, -0.12, -0.36], [0, PI / 2, 0.35]);
    for (let i = 0; i < 4; i++) b.add(b.cbox(0.05, 0.03 + i * 0.006, 0.04, 0.006), 'chest', i % 2 ? 'metal' : N, [0, 0.175 + i * 0.003, -0.32 + i * 0.07]);
  }
  if (!far) {
    for (const z of [-0.36, -0.22, 0.02]) rivets(b, 'chest', [[0.13, 0.14, z], [-0.13, 0.14, z]], [0, 0, 0]);
    vent(b, 'chest', [0, 0.155, 0.1], [-PI / 2 + 0.3, 0, 0], 0.12, 0.08, 4, false, N);
    for (const sx of [1, -1]) {
      b.add(b.cyl(0.012, 0.012, 0.2, 6), 'chest', 'metal', [sx * 0.1, -0.075, -0.2], [PI / 2, 0, 0]);
      b.add(b.cbox(0.04, 0.03, 0.05, 0.006), 'chest', 'accent', [sx * 0.13, -0.12, 0.2]);
      lamp(b, 'chest', [sx * 0.11, 0.0, -0.545], [PI / 2, 0, 0], 0.01, 'eye');
    }
  }
  // spine column to the keel (pelvis)
  b.add(b.cyl(0.07, 0.09, 0.12, 10), 'spine', 'metal', [0, 0.04, 0]);
  b.add(b.cyl(0.095, 0.095, 0.025, 12), 'spine', 'accent', [0, 0.0, 0]);
}

// ---------------- barrel: fixed housing (chest) + long twin-rail slide (footR) ----------------
function barrel(b, o) {
  const far = b.far, rk = o.rank, boss = o.r >= 3, W = boss ? 'accent' : 'paint', y = BAR_Y;
  // housing under the keel: breech block, coil sleeves the slide runs through
  P(b, 'chest', 'metal', [0.12, 0.09, 0.5], [0, y, -0.02], [0, 0, 0], { c: 0.02 });
  P(b, 'chest', W, [0.15, 0.06, 0.26], [0, y - 0.035, 0.1], [0, 0, 0], { c: 0.015, bx: 0.8 });
  P(b, 'chest', 'accent', [0.13, 0.1, 0.12], [0, y - 0.01, -0.32], [0, 0, 0], { c: 0.02 });
  for (const z of [0.0, 0.14, 0.28]) {
    b.add(b.cyl(0.07, 0.07, 0.035, 12), 'chest', 'metal', [0, y, z], [PI / 2, 0, 0]);
    if (!far) b.add(b.cyl(0.072, 0.072, 0.01, 12), 'chest', 'glow', [0, y, z + 0.022], [PI / 2, 0, 0]);
  }
  // capacitor bank down the left of the breech (cables to the hull)
  if (!far) {
    for (let i = 0; i < 3; i++) b.add(b.cyl(0.022, 0.022, 0.07, 8), 'chest', 'accent', [0.075, y + 0.01, -0.2 + i * 0.08], [PI / 2, 0, 0]);
    b.add(b.tube([[0.07, y + 0.03, -0.24], [0.11, y + 0.07, -0.18], [0.14, y + 0.08, -0.05]], 0.009, 8, 4), 'chest', 'metal');
  }
  // the slide: two long rails with a cyan gap, spacer clamps, cooling fins, muzzle brake; recoils on footR
  const L = BAR_Z1 - BAR_Z0, zc = (BAR_Z0 + BAR_Z1) / 2;
  for (const sx of [1, -1]) {
    b.add(b.cbox(0.034, 0.064, L, 0.01), 'footR', 'metal', [sx * 0.036, 0, zc]);
    b.add(b.cbox(0.012, 0.04, L * 0.92, 0.003), 'footR', 'accent', [sx * 0.055, 0, zc]);
  }
  b.add(b.cbox(0.014, 0.022, L * 0.94, 0.004), 'footR', 'glow', [0, 0, zc]);
  const nc = far ? 4 : 7;
  for (let i = 0; i < nc; i++) {
    const z = BAR_Z0 + 0.12 + i * (L - 0.25) / (nc - 1);
    b.add(b.cbox(0.13, 0.095, i % 2 ? 0.03 : 0.06, 0.01), 'footR', i % 2 ? 'accent' : W, [0, 0, z]);
    if (rk >= 3 && i % 2 === 0) b.add(b.cbox(0.134, 0.014, 0.014, 0.003), 'footR', 'glow', [0, 0.044, z]);
  }
  // top heat sink fins on the first third
  if (!far) for (let i = 0; i < 6; i++) b.add(b.cbox(0.06, 0.03, 0.012, 0.003), 'footR', 'metal', [0, 0.035, BAR_Z0 + 0.06 + i * 0.035]);
  // muzzle brake: boxy head with side ports + glowing bore
  const zm = BAR_Z1;
  P(b, 'footR', W, [0.15, 0.11, 0.18], [0, 0, zm - 0.02], [0, 0, 0], { c: 0.022, tz: 0.85 });
  for (const sx of [1, -1]) for (const dz of [-0.06, 0.0]) b.add(b.cbox(0.012, 0.07, 0.03, 0.003), 'footR', 'metal', [sx * 0.078, 0, zm + dz]);
  b.add(b.cbox(0.07, 0.04, 0.02, 0.004), 'footR', 'glow', [0, 0, zm + 0.07]);
  b.add(b.cbox(0.05, 0.012, 0.1, 0.003), 'footR', 'trim', [0, 0.057, zm - 0.03]);
  // laser designator tube under the muzzle (red emitter)
  b.add(b.cyl(0.012, 0.012, 0.22, 8), 'footR', 'metal', [0, -0.05, zm - 0.12], [PI / 2, 0, 0]);
  b.add(b.cyl(0.009, 0.009, 0.012, 8), 'footR', 'eye', [0, -0.05, zm - 0.004], [PI / 2, 0, 0]);
}

// ---------------- stabiliser rings (aux2 front, aux3 rear, aux1 R5 gyro) ----------------
function ring(b, o, bone, R, seg = 8) {
  const far = b.far, rk = o.rank, lit = rk >= 1;
  b.add(b.tor(R, 0.028, 48, 6), bone, 'accent', [0, 0, 0], [0, 0, 0], [1, 1, 1.25]);
  b.add(b.tor(R + 0.024, 0.008, 48, 4), bone, 'metal');
  b.add(b.tor(R - 0.03, 0.012, 48, 4), bone, 'metal');
  if (lit) b.add(b.tor(R - 0.03, 0.007, 48, 3), bone, 'glow', [0, 0, 0.016]);
  if (lit) b.add(b.tor(R - 0.03, 0.007, 48, 3), bone, 'glow', [0, 0, -0.016]);
  // clamp blocks round the band; R3: light segments between them
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * TAU;
    b.add(b.cbox(0.064, 0.05, 0.08, 0.01), bone, i % 2 ? 'metal' : 'paint', [Math.cos(a) * R, Math.sin(a) * R, 0], [0, 0, a]);
    if (!far && rk >= 2) b.add(b.cbox(0.04, 0.014, 0.084, 0.004), bone, i % 4 ? 'metal' : 'trim', [Math.cos(a) * (R + 0.026), Math.sin(a) * (R + 0.026), 0], [0, 0, a]);
    if (rk >= 3) { const a2 = a + PI / seg; b.add(b.cbox(0.014, 0.07, 0.045, 0.004), bone, 'glow', [Math.cos(a2) * (R + 0.012), Math.sin(a2) * (R + 0.012), 0], [0, 0, a2]); }
  }
}
function rings(b, o) {
  ring(b, o, 'aux2', RF, o.rank >= 2 ? 12 : 8);
  ring(b, o, 'aux3', RB, o.rank >= 2 ? 12 : 8);
  if (o.rank >= 5) {
    const R = 0.44;
    b.add(b.tor(R, 0.014, 56, 5), 'aux1', 'trim');
    b.add(b.tor(R - 0.02, 0.006, 56, 3), 'aux1', 'glow');
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; b.add(b.sph(8, 6), 'aux1', 'glow', [Math.cos(a) * R, Math.sin(a) * R, 0], [0, 0, 0], 0.024); }
  }
}

// ---------------- optics head (neck + head) ----------------
function head(b, o) {
  const far = b.far, rk = o.rank, boss = o.r >= 3, W = boss ? 'accent' : 'paint', N = boss ? 'paint' : 'accent';
  // turret ring on the hull + neck yoke
  b.add(b.cyl(0.075, 0.085, 0.05, 12), 'neck', 'metal', [0, -0.01, 0]);
  b.add(b.cyl(0.088, 0.088, 0.014, 12), 'neck', 'trim', [0, -0.03, 0]);
  // sensor block: white wedge, navy brow, dark lens deck
  P(b, 'head', W, [0.17, 0.1, 0.19], [0, 0.04, 0.0], [0, 0, 0], { c: 0.025, tx: 0.82, tz: 0.85 });
  P(b, 'head', N, [0.15, 0.03, 0.15], [0, 0.098, -0.01], [0, 0, 0], { c: 0.01, tx: 0.8 });
  P(b, 'head', 'metal', [0.15, 0.085, 0.03], [0, 0.035, 0.1], [0, 0, 0], { c: 0.01 });
  // main scope lens (big red), two secondary lenses, laser emitter: the face of the unit
  lamp(b, 'head', [0.025, 0.038, 0.118], [PI / 2, 0, 0], 0.036, 'eye');
  b.add(b.tor(0.05, 0.007, 16, 4), 'head', 'trim', [0.025, 0.038, 0.122]);
  lamp(b, 'head', [-0.05, 0.06, 0.115], [PI / 2, 0, 0], 0.014, 'eye');
  lamp(b, 'head', [-0.05, 0.017, 0.115], [PI / 2, 0, 0], 0.011, 'glow');
  // side "ear" range-finders + antenna
  for (const sx of [1, -1]) {
    b.add(discX(b, 0.03, 0.04, 12), 'head', 'metal', [sx * 0.095, 0.04, 0.0]);
    b.add(discX(b, 0.018, 0.05, 10), 'head', sx > 0 ? 'glow' : N, [sx * 0.095, 0.04, 0.0]);
  }
  // long telescopic scope tube along the top (R2+), lens hood
  if (rk >= 2 || boss) {
    b.add(b.cyl(0.022, 0.022, 0.24, 10), 'head', 'metal', [0.045, 0.125, 0.04], [PI / 2, 0, 0]);
    b.add(b.cyl(0.028, 0.024, 0.05, 10), 'head', W, [0.045, 0.125, 0.15], [PI / 2, 0, 0]);
    b.add(b.cyl(0.017, 0.017, 0.01, 10), 'head', 'eye', [0.045, 0.125, 0.176], [PI / 2, 0, 0]);
    for (const z of [-0.04, 0.06]) b.add(b.cbox(0.02, 0.03, 0.02, 0.004), 'head', 'accent', [0.045, 0.105, z]);
  }
  if (!far) {
    b.add(b.cyl(0.003, 0.005, 0.22, 4), 'head', 'metal', [-0.06, 0.18, -0.06], [-0.25, 0, 0.15]);
    b.add(b.sph(6, 4), 'head', 'eye', [-0.076, 0.285, -0.087], [0, 0, 0], 0.01);
  }
  // boss: armoured canopy hood + chin autocannon turret (twin barrels)
  if (boss) {
    P(b, 'head', 'accent', [0.21, 0.04, 0.16], [0, 0.11, 0.03], [0.12, 0, 0], { c: 0.012, tx: 0.7, tz: 0.6 });
    b.sym(fin(b, [[0, 0], [0.09, 0], [0.03, 0.1]], 0.016, 0.004), 'head', 'trim', [0.06, 0.12, -0.06], [0, PI / 2, -0.4]);
    b.add(b.sph(12, 8), 'head', 'metal', [0, -0.04, 0.07], [0, 0, 0], 0.045);
    for (const sx of [1, -1]) {
      b.add(b.cyl(0.011, 0.011, 0.2, 8), 'head', 'metal', [sx * 0.018, -0.05, 0.17], [PI / 2, 0, 0]);
      b.add(b.cyl(0.015, 0.015, 0.03, 8), 'head', 'trim', [sx * 0.018, -0.05, 0.26], [PI / 2, 0, 0]);
    }
  }
  // R4: holo scope readouts (footL on the head): two thin glowing panels + a reticle ring in front of the lens
  if (rk >= 4) {
    b.add(b.cbox(0.11, 0.07, 0.004, 0.002), 'footL', 'glow', [0.14, 0.02, 0.06], [0, -0.5, 0]);
    b.add(b.cbox(0.08, 0.05, 0.004, 0.002), 'footL', 'glow', [-0.13, 0.04, 0.05], [0, 0.55, 0]);
    if (!far) for (let i = 0; i < 3; i++) b.add(b.cbox(0.07 - i * 0.015, 0.006, 0.006, 0.002), 'footL', 'eye', [0.14, 0.04 - i * 0.018, 0.064], [0, -0.5, 0]);
    b.add(b.tor(0.06, 0.004, 24, 3), 'footL', 'glow', [0.025, -0.012, 0.2]);
    b.add(b.tor(0.03, 0.003, 16, 3), 'footL', 'eye', [0.025, -0.012, 0.2]);
  }
}

// ---------------- uplink dish (aux0) ----------------
function dish(b, o) {
  const far = b.far, rk = o.rank, boss = o.r >= 3, R = boss ? 0.25 : 0.22, W = boss ? 'accent' : 'paint';
  // mast + gimbal yoke
  b.add(b.cyl(0.04, 0.05, 0.06, 10), 'aux0', 'accent', [0, -0.01, 0]);
  b.add(b.cyl(0.018, 0.022, 0.16, 8), 'aux0', 'metal', [0, 0.08, 0]);
  b.add(b.cbox(0.1, 0.03, 0.04, 0.008), 'aux0', 'metal', [0, 0.15, 0]);
  for (const sx of [1, -1]) b.add(b.cbox(0.014, 0.05, 0.03, 0.004), 'aux0', 'metal', [sx * 0.045, 0.175, 0]);
  // parabolic dish opening up (R0: dented + a wedge missing)
  const n = 7, k = 0.9, th = 0.012, top = [], bot = [];
  for (let i = 0; i <= n; i++) { const r = R * i / n; top.push([r, k * r * r]); bot.push([r, k * r * r - th]); }
  const prof = [[0, -th], ...bot.slice(1), [R + 0.006, k * R * R + 0.004], ...top.slice(1).reverse(), [0, 0]];
  const dsh = rk === 0 ? b.lathe(prof, 22, 0.6, TAU - 0.9) : b.lathe(prof, 22);
  b.add(dsh, 'aux0', W, [0, 0.2, 0]);
  b.add(b.tor(R, 0.01, 28, 4), 'aux0', 'metal', [0, 0.2 + k * R * R, 0], [PI / 2, 0, 0]);
  b.add(b.cyl(0.04, 0.035, 0.014, 12), 'aux0', 'accent', [0, 0.206, 0]);
  if (!far) for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU, r = R * 0.55; b.add(b.cbox(0.012, 0.012, R * 0.8, 0.003), 'aux0', 'metal', [Math.sin(a) * r, 0.2 + k * r * r + 0.006, Math.cos(a) * r], [-Math.atan(2 * k * r), a, 0]); }
  // feed horn on three struts, glowing tip; R3+ second ring on the face
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + 0.5, x = Math.cos(a) * R * 0.85, z = Math.sin(a) * R * 0.85, y0 = 0.2 + k * (R * 0.85) ** 2;
    const dx = -x, dy = 0.34 - y0, dz = -z, L = Math.hypot(dx, dy, dz);
    const g = b.cyl(0.005, 0.005, L, 5); g.rotateX(Math.atan2(Math.hypot(dx, dz), dy)); g.rotateY(Math.atan2(dx, dz));
    b.add(g, 'aux0', 'metal', [x + dx / 2, y0 + dy / 2, z + dz / 2]);
  }
  b.add(b.cyl(0.02, 0.014, 0.05, 8), 'aux0', 'metal', [0, 0.345, 0]);
  b.add(b.sph(8, 6), 'aux0', rk >= 1 ? 'glow' : 'eye', [0, 0.32, 0], [0, 0, 0], 0.016);
  if (rk >= 3 && !far) b.add(b.tor(R * 0.6, 0.004, 24, 3), 'aux0', 'glow', [0, 0.2 + k * (R * 0.6) ** 2 + 0.003, 0], [PI / 2, 0, 0]);
}

// ---------------- canards / boss gunship wings (clav), lift fans (upArm) ----------------
function wings(b, o) {
  const far = b.far, rk = o.rank, boss = o.r >= 3, W = boss ? 'accent' : 'paint', N = boss ? 'paint' : 'accent';
  const flat = (pts, t, c) => { const g = fin(b, pts, t, c); g.rotateX(PI / 2); return g; };   // 2d (x out, y fwd) -> wing in xz
  // hinge knuckle
  b.sym(discX(b, 0.04, 0.06, 12), 'clav', 'metal', [0.01, 0, 0]);
  if (!boss) {
    // swept canard: white blade over a navy root, amber edge strip, tip lamp; R0 = left canard snapped short
    for (const side of ['L', 'R']) {
      const snapped = rk === 0 && side === 'L', s = snapped ? 0.55 : 1;
      const put = (g, slot, p, r) => b.add(g, 'clav' + side, slot, side === 'L' ? p : [-p[0], p[1], p[2]], r);
      const mir = (g) => { if (side === 'R') { g.scale(-1, 1, 1); const a = g.index.array; for (let i = 0; i < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; } } return g; };
      const ix = (g) => { if (!g.index) { const n = g.attributes.position.count, idx = []; for (let i = 0; i < n; i++) idx.push(i); g.setIndex(idx); } return g; };
      const wing = [[0, 0.07], [0.1, 0.05], [0.34 * s, -0.1 * s], [0.36 * s, -0.17 * s], [0.08, -0.13], [0, -0.09]];
      put(mir(ix(flat(wing, 0.024, 0.006))), W, [0.02, 0.0, 0], [0, 0, 0.08]);
      put(mir(ix(flat([[0, 0.06], [0.12, 0.04], [0.16, -0.1], [0, -0.1]], 0.04, 0.008))), N, [0.01, -0.012, 0], [0, 0, 0.08]);
      if (!far) put(mir(ix(flat([[0.1, 0.055], [0.12, 0.05], [0.36 * s, -0.115 * s], [0.34 * s, -0.11 * s]], 0.03, 0.004))), 'metal', [0.02, 0.0, 0], [0, 0, 0.08]);
      if (!snapped) {
        put(b.cyl(0.02, 0.02, 0.1, 8), 'metal', [0.38, 0.03, -0.14], [PI / 2, 0, 0]);
        put(b.cyl(0.014, 0.014, 0.012, 8), 'glow', [0.38, 0.03, -0.085], [PI / 2, 0, 0]);
      }
      // R4: hardlight blade extending the canard (silhouette step)
      if (rk >= 4 && !snapped) put(mir(ix(flat([[0.3, -0.09], [0.36, -0.12], [0.56, -0.3], [0.5, -0.27]], 0.012, 0.003))), 'glow', [0.02, 0.0, 0], [0, 0, 0.08]);
    }
    return;
  }
  // STORMCROW: broad gunship wings with a lift-fan nacelle at each tip (fan on upArm spins), missile pod underneath, gold edge
  const span = 0.5;
  for (const side of ['L', 'R']) {
    const k = side === 'L' ? 1 : -1;
    const mir = (g) => { if (k < 0) { g.scale(-1, 1, 1); const a = g.index.array; for (let i = 0; i < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; } } return g; };
    const ix = (g) => { if (!g.index) { const n = g.attributes.position.count, idx = []; for (let i = 0; i < n; i++) idx.push(i); g.setIndex(idx); } return g; };
    const put = (g, slot, p, r) => b.add(g, 'clav' + side, slot, [p[0] * k, p[1], p[2]], r ? [r[0], r[1] * k, r[2] * k] : undefined);
    put(mir(ix(flat([[0, 0.14], [0.14, 0.12], [span, -0.02], [span, -0.2], [0.18, -0.22], [0, -0.16]], 0.04, 0.01))), W, [0.02, 0, 0], [0, 0, 0.06]);
    put(mir(ix(flat([[0.04, 0.1], [0.16, 0.08], [span - 0.04, -0.04], [span - 0.04, -0.1], [0.04, -0.06]], 0.05, 0.006))), N, [0.02, 0.008, 0], [0, 0, 0.06]);
    put(mir(ix(flat([[0.14, 0.125], [0.16, 0.13], [span + 0.01, -0.01], [span, -0.025]], 0.046, 0.005))), 'trim', [0.02, 0, 0], [0, 0, 0.06]);
    if (!far) for (let i = 0; i < 3; i++) put(b.cbox(0.05, 0.008, 0.012, 0.003), 'glow', [0.2 + i * 0.09, 0.028, -0.1 - i * 0.012], [0, 0, 0.06]);
    // missile pod under the wing: block + 2x3 tube faces (eye = red tips)
    put(b.cbox(0.12, 0.08, 0.2, 0.015), 'accent', [0.28, -0.07, 0.0]);
    put(b.cbox(0.1, 0.012, 0.18, 0.004), 'trim', [0.28, -0.025, 0.0]);
    for (let i = 0; i < 6; i++) put(b.cyl(0.013, 0.013, 0.012, 8), 'eye', [0.25 + (i % 3) * 0.03, -0.085 + Math.floor(i / 3) * 0.03, 0.102], [PI / 2, 0, 0]);
    // nacelle duct at the tip (static, on clav) + fan (upArm spins)
    put(b.tor(0.11, 0.022, 24, 6), W, [0.5, 0.0, -0.1], [PI / 2, 0, 0]);
    put(b.cyl(0.13, 0.13, 0.04, 20, true), 'metal', [0.5, 0.0, -0.1]);
    put(b.cyl(0.115, 0.115, 0.008, 20, true), 'glow', [0.5, -0.025, -0.1]);
    if (!far) put(b.cbox(0.014, 0.05, 0.03, 0.004), 'trim', [0.5 + 0.13, 0.0, -0.1]);
    const fan = 'upArm' + side, nb = far ? 4 : 7;
    for (let i = 0; i < nb; i++) { const a = (i / nb) * TAU; b.add(b.cbox(0.1, 0.006, 0.03, 0.002), fan, 'metal', [Math.cos(a) * 0.055, 0, Math.sin(a) * 0.055], [0.35, -a, 0]); }
    b.add(b.cyl(0.03, 0.03, 0.03, 12), fan, 'accent', [0, 0, 0]);
    b.add(b.cyl(0.016, 0.016, 0.034, 10), fan, 'glow', [0, 0, 0]);
  }
}

// ---------------- hover pods (thigh) + plumes (shin) + R5 trail rings (foreArm/hand) ----------------
function pods(b, o) {
  const far = b.far, rk = o.rank, boss = o.r >= 3, W = boss ? 'accent' : 'paint', N = boss ? 'paint' : 'accent';
  // keel between the pods (pelvis): navy block, white belly plate, ventral sensor ball
  P(b, 'pelvis', N, [0.3, 0.07, 0.24], [0, -0.01, 0.02], [0, 0, 0], { c: 0.02, bx: 0.8 });
  P(b, 'pelvis', W, [0.18, 0.03, 0.16], [0, -0.05, 0.04], [0, 0, 0], { c: 0.01 });
  b.add(b.sph(12, 8), 'pelvis', 'metal', [0, -0.07, 0.12], [0, 0, 0], 0.035);
  b.add(b.sph(10, 8), 'pelvis', 'eye', [0, -0.08, 0.14], [0, 0, 0], 0.02);
  for (const sx of [1, -1]) b.add(b.cbox(0.06, 0.04, 0.12, 0.01), 'pelvis', 'metal', [sx * 0.12, -0.02, 0.02]);
  // pods: navy nacelle, white cowl, silver intake, nozzle bell with a cyan throat
  b.sym(b.cyl(0.07, 0.06, 0.12, 12), 'thigh', N, [0, -0.04, 0]);
  b.sym(plate(b, 0.08, 0.1, 0.14, { c: 0.015, tx: 0.8 }), 'thigh', W, [0.035, -0.02, 0.0], [0, 0, -0.2]);
  b.sym(b.cyl(0.074, 0.074, 0.016, 12), 'thigh', 'metal', [0, 0.02, 0]);
  b.sym(b.cyl(0.05, 0.068, 0.05, 12, true), 'thigh', 'metal', [0, -0.12, 0]);
  b.sym(b.cyl(0.045, 0.045, 0.01, 12), 'thigh', 'glow', [0, -0.13, 0]);
  if (!far) b.sym(b.cbox(0.012, 0.05, 0.012, 0.003), 'thigh', 'trim', [0.075, -0.04, 0.03]);
  // plumes: hot core + soft outer cone (scaled in tick)
  b.sym(b.cyl(0.04, 0.0, 0.2, 10, true), 'shin', 'glow', [0, -0.1, 0]);
  b.sym(b.cyl(0.02, 0.0, 0.3, 8, true), 'shin', 'eye', [0, -0.14, 0], [0, 0, 0], [1, 1, 1]);
  if (rk >= 5) for (const s of ['L', 'R']) for (const bn of ['foreArm', 'hand']) b.add(b.tor(0.05, 0.006, 16, 3), bn + s, 'glow', [0, 0, 0], [PI / 2, 0, 0]);
}

function build(b, o) {
  b.scope([0, 0, 0], [0, 0, 0], G, () => {
    hull(b, o);
    barrel(b, o);
    rings(b, o);
    head(b, o);
    dish(b, o);
    wings(b, o);
    pods(b, o);
  });
}

// ---------------- anims ----------------
const SIDES = ['L', 'R'];
const dampOsc = (s, f = 30, d = 6) => (s <= 0 ? 0 : Math.exp(-s * d) * Math.sin(s * f));
function base(Pp, t, ctx, L, k = 1) {
  const bob = Math.sin(t * 1.7);
  L.pel(Pp, 0.02 * Math.sin(t * 0.6) * k, 0.045 * bob * k, 0);
  L.R(Pp, 'pelvis', 0.015 * Math.sin(t * 1.1), 0, 0.025 * Math.sin(t * 0.9) * k);
  L.R(Pp, 'spine', 0, 0, 0);
  L.R(Pp, 'chest', -0.01 + 0.012 * Math.sin(t * 1.7 + 0.6), 0, 0);
  L.R(Pp, 'neck', 0, ctx.st.gy * 0.35, 0);
  L.R(Pp, 'head', ctx.st.gp * 0.4, ctx.st.gy * 0.35, ctx.st.tilt * 0.5);
  // dish slowly scans the sky
  L.R(Pp, 'aux0', -0.32 + 0.08 * Math.sin(t * 0.37), 0.7 * Math.sin(t * 0.23), 0);
  for (const s of SIDES) {
    const ph = s === 'L' ? 0 : 1.4;
    L.RS(Pp, 'clav', s, 0, 0, 0.05 * Math.sin(t * 1.3 + ph));
    L.RS(Pp, 'upArm', s, 0, 0, 0);
    L.RS(Pp, 'thigh', s, 0.04 * Math.sin(t * 1.2 + ph), 0, 0.06);
    L.RS(Pp, 'shin', s, 0, 0, 0);
  }
}
const OD_DUR = 2.6, OD_REL = 0.6 / OD_DUR;
const DURS = { attack: 0.95, attack_alt: 1.25, cast: 1.2, overdrive: OD_DUR, hit: 0.45, die: 2.0, deploy: 1.5 };
const anims = {
  idle(Pp, t, ctx, L) {
    base(Pp, t, ctx, L);
    // every ~7 s: the head sweeps the field, the dish snaps to a new bearing
    const c = t % 7.2, k = L.kf(c, [[0, 0], [4.6, 0], [5.0, 1], [6.3, 1], [6.8, 0]]);
    L.A(Pp, 'head', 0.06 * k, 0.5 * Math.sin((c - 4.6) * 2.1) * k, 0);
    L.A(Pp, 'aux0', 0.15 * k, -0.4 * k, 0);
  },
  advance(Pp, t, ctx, L) {
    base(Pp, t, ctx, L, 1.3);
    L.A(Pp, 'pelvis', 0.14, 0, 0.02 * Math.sin(t * 2.2));
    L.A(Pp, 'chest', 0.03, 0, 0);
    Pp[L.PX + 1] += 0.02 * Math.sin(t * 3.4);
    for (const s of SIDES) { L.AS(Pp, 'clav', s, 0, 0, -0.15); L.AS(Pp, 'thigh', s, 0.45, 0, 0); }
    L.A(Pp, 'aux0', -0.15, 0, 0);
  },
  attack(Pp, u, ctx, L) {
    // LONG SHOT: settles + levels the barrel, rings spin up (tick), one heavy rail shot (fire 0.32 = sim windup), recoil kick
    base(Pp, ctx.t, ctx, L, 0.4);
    const k = L.kf(u, [[0, 0], [0.22, 1], [0.8, 1], [1, 0]]);
    const s = (u - 0.32) * DURS.attack, r = s > 0 ? Math.exp(-s * 7) : 0;
    Pp[L.PX + 1] -= 0.04 * k; Pp[L.PX + 2] -= 0.13 * r;
    L.A(Pp, 'pelvis', 0.05 * k - 0.1 * r, 0, 0);
    L.A(Pp, 'chest', -0.05 * r + 0.03 * dampOsc(s, 34, 7), 0, 0);
    L.R(Pp, 'head', 0.04 * k - 0.1 * r, 0, 0); L.R(Pp, 'neck', 0, 0, 0);
    L.A(Pp, 'aux0', 0.25 * k, -0.6 * Math.sin(ctx.t * 0.23) * k, 0);
    for (const s2 of SIDES) { L.AS(Pp, 'clav', s2, 0, 0, -0.12 * k + 0.35 * r); L.AS(Pp, 'thigh', s2, -0.5 * r, 0, 0.1 * k); }
  },
  attack_alt(Pp, u, ctx, L) {
    // DOUBLE TAP: two quick shots (0.3, 0.55), the second kicks harder and yaws the hull
    base(Pp, ctx.t, ctx, L, 0.4);
    const k = L.kf(u, [[0, 0], [0.2, 1], [0.8, 1], [1, 0]]);
    const s1 = (u - 0.3) * DURS.attack_alt, s2 = (u - 0.55) * DURS.attack_alt;
    const r = (s1 > 0 ? Math.exp(-s1 * 9) * 0.7 : 0) + (s2 > 0 ? Math.exp(-s2 * 6) : 0);
    Pp[L.PX + 2] -= 0.1 * r; Pp[L.PX + 1] -= 0.03 * k;
    L.A(Pp, 'pelvis', 0.05 * k - 0.09 * r, 0.06 * (s2 > 0 ? Math.exp(-s2 * 4) : 0), 0.04 * dampOsc(s2, 20, 5));
    L.R(Pp, 'head', 0.03 * k - 0.08 * r, 0, 0);
    for (const s of SIDES) { L.AS(Pp, 'clav', s, 0, 0, -0.1 * k + 0.3 * r); L.AS(Pp, 'thigh', s, -0.4 * r, 0, 0.1 * k); }
  },
  cast(Pp, u, ctx, L) {
    // DESIGNATE: rises a little, the optics sweep and lock (cast 0.5 = the mark), dish swings onto the target bearing
    base(Pp, ctx.t, ctx, L, 0.6);
    const k = L.kf(u, [[0, 0], [0.25, 1], [0.8, 1], [1, 0]]), lock = L.kf(u, [[0, 0], [0.45, 0], [0.5, 1], [0.85, 1], [1, 0]]);
    Pp[L.PX + 1] += 0.08 * k;
    L.R(Pp, 'head', 0.1 * k, L.lerp(0.6 * Math.sin(u * 14) * (1 - lock), 0, lock) * k, 0);
    L.R(Pp, 'neck', 0, 0, 0);
    L.R(Pp, 'aux0', L.lerp(-0.3, 0.55, lock), L.lerp(0.6, 0, k), 0);
    L.A(Pp, 'pelvis', -0.04 * k + 0.05 * lock, 0, 0);
    for (const s of SIDES) L.AS(Pp, 'clav', s, 0, 0, 0.2 * k);
  },
  overdrive(Pp, u, ctx, L) {
    // ORBITAL DESIGNATOR: climbs ~1 m (board), fins spread, dish turns to the sky, rings race forward along the barrel (tick),
    // laser paints the target, the shot and the orbital beam land together at the release (0.6 s), big recoil, hold, settle
    base(Pp, ctx.t, ctx, L, 0.5);
    const rise = L.kf(u, [[0, 0], [0.17, 1], [0.78, 1], [1, 0]]);
    const s = (u - OD_REL) * OD_DUR, r = s > 0 ? Math.exp(-s * 3.2) : 0;
    const aim = L.kf(u, [[0, 0], [0.12, 1], [0.7, 1], [0.9, 0]]);
    Pp[L.PX + 1] += 0.55 * rise; Pp[L.PX + 2] -= 0.2 * r;
    L.A(Pp, 'pelvis', 0.14 * aim - 0.22 * r + 0.04 * dampOsc(s, 16, 3), 0, 0.03 * Math.sin(u * 40) * (1 - rise * 0.5));
    L.A(Pp, 'chest', 0.06 * aim, 0, 0);
    L.R(Pp, 'head', 0.12 * aim - 0.1 * r, 0, 0);
    L.R(Pp, 'aux0', L.lerp(-0.3, -0.12, aim), 0, 0);
    for (const sd of SIDES) {
      L.AS(Pp, 'clav', sd, 0, 0, 0.45 * aim + 0.2 * r);
      L.AS(Pp, 'thigh', sd, -0.2 * aim - 0.6 * r, 0, 0.35 * rise);
    }
  },
  hit(Pp, u, ctx, L) {
    base(Pp, ctx.t, ctx, L);
    const k = L.kf(u, [[0, 0], [0.1, 1], [1, 0]]), d = ctx.st.hitDir, s = u * DURS.hit;
    Pp[L.PX + 2] -= 0.1 * k; Pp[L.PX + 1] -= 0.04 * k;
    L.A(Pp, 'pelvis', -0.16 * k, 0.1 * k * d, 0.22 * k * d + 0.06 * dampOsc(s, 26, 6));
    L.A(Pp, 'head', -0.2 * k, 0, 0.15 * k * d);
    for (const sd of SIDES) L.AS(Pp, 'clav', sd, 0, 0, 0.25 * dampOsc(s, 30, 6));
  },
  die(Pp, u, ctx, L) {
    // power fails: sputters, rings slow and drop (tick), noses over, slams into the plate, slides, settles canted on the barrel
    base(Pp, ctx.t * (1 - u), ctx, L, 1 - u);
    const g = 0.22 - HOV;
    const fall = L.kf(u, [[0, 0], [0.12, 0.08], [0.2, -0.05], [0.3, 0.05], [0.56, 1], [0.62, 0.9], [0.68, 1], [1, 1]]);
    Pp[L.PX + 1] = L.lerp(Pp[L.PX + 1], g, Math.max(0, fall));
    Pp[L.PX + 2] += 0.12 * L.kf(u, [[0, 0], [0.56, 0], [0.8, 1], [1, 1]]);
    L.A(Pp, 'pelvis', 0.3 * L.kf(u, [[0, 0], [0.5, 1], [0.6, 0.4], [1, 0.25]]) + 0.06 * Math.sin(u * 60) * L.kf(u, [[0, 1], [0.3, 0]]), 0.2 * u, 0.32 * L.kf(u, [[0, 0], [0.56, 0.4], [1, 0.45]]));
    L.R(Pp, 'head', 0.4 * L.kf(u, [[0, 0], [0.6, 1]]), 0.3 * u, 0);
    L.R(Pp, 'aux0', L.lerp(-0.3, 0.9, L.kf(u, [[0, 0], [0.62, 1]])), 0, 0.4 * L.kf(u, [[0, 0], [0.62, 1]]));
    for (const sd of SIDES) { L.AS(Pp, 'clav', sd, 0, 0, -0.3 * L.kf(u, [[0, 0], [0.6, 1]])); L.AS(Pp, 'thigh', sd, 0, 0, 0.5 * L.kf(u, [[0, 0], [0.6, 1]])); }
  },
  victory(Pp, t, ctx, L) {
    // a celebratory barrel roll every 4 s, dish spinning, bobbing high
    base(Pp, t, ctx, L, 1.2);
    const k = L.smooth(Math.min(1, t / 0.6)), c = t % 4, roll = L.kf(c, [[0, 0], [2.2, 0], [3.2, 1], [4, 1]]);
    Pp[L.PX + 1] += (0.2 + 0.05 * Math.sin(t * 2.4)) * k;
    L.A(Pp, 'pelvis', -0.08 * k, 0, TAU * roll * k);
    L.R(Pp, 'aux0', -0.1, t * 2.2, 0);
    for (const s of SIDES) L.AS(Pp, 'clav', s, 0, 0, 0.3 * k * Math.sin(t * 3 + (s === 'L' ? 0 : PI)));
  },
  deploy(Pp, u, ctx, L) {
    // drops in nose-up with fins folded and rings collapsed (tick); retro burst at the plate (land 0.4), unfolds, rings bloom
    base(Pp, ctx.t, ctx, L);
    const fold = L.kf(u, [[0, 1], [0.42, 1], [0.7, 0], [1, 0]]), brake = L.kf(u, [[0, 0], [0.36, 0], [0.42, 1], [0.6, 0.2], [1, 0]]);
    Pp[L.PX + 1] -= 0.12 * brake;
    L.A(Pp, 'pelvis', -0.35 * fold + 0.1 * brake, 0, 0);
    L.A(Pp, 'head', 0.3 * fold, 0, 0);
    L.R(Pp, 'aux0', L.lerp(-0.3, 1.2, fold), 0, 0);
    for (const s of SIDES) { L.AS(Pp, 'clav', s, 0, 0, -0.9 * fold); L.AS(Pp, 'thigh', s, -0.5 * brake, 0, 0.2 * brake); }
  },
};

// ring spin rate (rad/s), ring slide along the barrel (m), ring scale, plume size, barrel recoil per action phase
function ringRate(name, u) {
  switch (name) {
    case 'attack': return kf(u, [[0, 1.2], [0.25, 14], [0.4, 9], [1, 1.2]]);
    case 'attack_alt': return kf(u, [[0, 1.2], [0.2, 12], [0.7, 12], [1, 1.2]]);
    case 'cast': return kf(u, [[0, 1.2], [0.5, 5], [1, 1.2]]);
    case 'overdrive': return kf(u, [[0, 1.2], [0.2, 30], [0.5, 22], [0.85, 4], [1, 1.2]]);
    case 'die': return kf(u, [[0, 3], [0.5, 0.3], [0.6, 0]]);
    case 'deploy': return kf(u, [[0, 0], [0.55, 0], [0.75, 10], [1, 1.2]]);
    default: return 1.2;
  }
}
function recoil(name, u, dur) {
  const shot = (u0, k = 1) => { const s = (u - u0) * dur; return s < 0 ? 0 : Math.exp(-s * 8) * k * Math.min(1, s * 60); };
  switch (name) {
    case 'attack': return shot(0.32);
    case 'attack_alt': return Math.max(shot(0.3, 0.7), shot(0.55));
    case 'overdrive': return shot(OD_REL, 1.4);
    default: return 0;
  }
}

export default {
  id: 'meridian', name: 'MERIDIAN', role: 'archer', faction: 'corporate', rarity: 'epic', realm: 'scifi',
  rig: 'hover', dims: DIMS, height: 1.5 * G, radius: 0.5 * G, walkSpeed: 1.3, scheme: 'light',
  hoverBeam: { radius: 0.42 },   // robots touch-up: kit hover beam + contact blob so its plate doesn't read empty
  style: { weapon: 'rifle' },
  paint: { corporate: { paint: 0xe8edf3, accent: 0x1a2640, trim: 0xf0a020, eye: 0xff3a36 } },
  mats: {
    all: {
      paint: { rough: 0.2, coat: 1, panel: { groove: 0.35 } },
      accent: { rough: 0.34, metal: 0.45, coat: 0.6 },
      metal: { color: 0x9aa3ae, rough: 0.3, metal: 0.85 },
      trim: { rough: 0.3 },
    },
    corporate: { trim: { emissive: 0xff8a10, ei: 0.35 } },
  },
  sockets: { muzzle: ['footR', sc3([0, 0, BAR_Z1 + 0.07])], core: sc3([0, 0.0, 0.12]), head: sc3([0, 0.06, 0.1]), hand: ['footR', sc3([0, -0.05, BAR_Z1])], dish: ['aux0', sc3([0, 0.34, 0])] },
  events: {
    attack: [['fire', 0.32]], attack_alt: [['fire', 0.3], ['fire', 0.55]], cast: [['cast', 0.5]],
    overdrive: [['cast', 0.03], ['fire', OD_REL]], die: [['down', 0.56]], deploy: [['land', 0.42], ['ready', 0.85]],
  },
  durs: DURS,
  anims,
  post(Pp, ctx, act) {
    ctx.su = act ? Math.min(1, act.t / act.dur) : 0;
    for (let i = 0; i < 3; i++) Pp[LIB.PX + i] *= G;   // anims are written in design units
  },
  tick(unit, dt, ctx, bones) {
    const st = unit.state, a = st.action, dead = unit.dead, uu = a ? ctx.su : 0, t = ctx.t;
    // rings: spin (front and rear counter-rotate), slide forward along the barrel in the overdrive, collapse in deploy / death
    const w = dead ? 0 : a ? ringRate(a, uu) : st.loop === 'advance' ? 3 : st.loop === 'victory' ? 6 : 1.2;
    ctx.rw = (ctx.rw ?? 1.2) + (w - (ctx.rw ?? 1.2)) * (1 - Math.exp(-dt * 6));
    ctx.ra = ((ctx.ra || 0) + ctx.rw * dt) % TAU;
    bones[BI.aux2].rotation.set(0, 0, ctx.ra);
    bones[BI.aux3].rotation.set(0, 0, -ctx.ra * 0.8);
    bones[BI.aux1].rotation.set(PI / 2 - 0.35 + 0.1 * Math.sin(t * 0.7), ctx.ra * 0.5, 0);
    const slide = a === 'overdrive' ? kf(uu, [[0, 0], [0.12, 0], [0.2, 1], [0.7, 1], [0.9, 0]]) : 0;
    bones[BI.aux2].position.z = OFF.aux2[2] + 0.55 * G * slide;
    bones[BI.aux3].position.z = OFF.aux3[2] + 0.42 * G * slide;
    let rs = 1;
    if (a === 'deploy') rs = kf(uu, [[0, 0.2], [0.55, 0.2], [0.75, 1.08], [0.9, 1]]);
    bones[BI.aux2].scale.setScalar(Math.max(0.05, rs)); bones[BI.aux3].scale.setScalar(Math.max(0.05, rs));
    // ring drop on death: they sink round the hull
    if (a === 'die' || dead) {
      const d = kf(a === 'die' ? uu : 1, [[0, 0], [0.4, 0], [0.6, 1]]);
      bones[BI.aux2].rotation.x = 0.9 * d; bones[BI.aux3].rotation.x = -0.7 * d;
      bones[BI.aux2].position.y = OFF.aux2[1] - 0.12 * G * d; bones[BI.aux3].position.y = OFF.aux3[1] - 0.14 * G * d;
    } else { bones[BI.aux2].position.y = OFF.aux2[1]; bones[BI.aux3].position.y = OFF.aux3[1]; }
    // barrel recoil (slide back) + fan spin + plumes + trail rings
    bones[BI.footR].position.z = OFF.footR[2] - (a ? 0.16 * G * recoil(a, uu, DURS[a] || 1) : 0);
    ctx.fan = ((ctx.fan || 0) + dt * (dead ? 0 : a === 'overdrive' ? 40 : 22)) % TAU;
    bones[BI.upArmL].rotation.set(0, ctx.fan, 0); bones[BI.upArmR].rotation.set(0, -ctx.fan, 0);
    let pl = dead ? 0 : a === 'overdrive' ? kf(uu, [[0, 1], [0.05, 2.2], [0.25, 1.8], [0.8, 1.6], [1, 1]]) : a === 'deploy' ? kf(uu, [[0, 0.4], [0.38, 0.4], [0.42, 2.4], [0.7, 1]]) : a === 'die' ? kf(uu, [[0, 1], [0.1, 0.2], [0.18, 1.2], [0.3, 0.1], [0.5, 0]]) : st.loop === 'advance' ? 1.4 : 1;
    if (a === 'attack' || a === 'attack_alt') pl = 1 + 1.2 * recoil(a, uu, DURS[a]);
    ctx.pl = (ctx.pl ?? 1) + (pl - (ctx.pl ?? 1)) * (1 - Math.exp(-dt * 12));
    [BI.shinL, BI.shinR].forEach((bi, i) => {
      const k = Math.max(0.001, ctx.pl * (0.9 + 0.1 * Math.sin(t * 41 + i * 2.1)));
      bones[bi].scale.set(Math.max(0.001, 0.8 + 0.2 * Math.min(1.5, k)), k, Math.max(0.001, 0.8 + 0.2 * Math.min(1.5, k)));
    });
    // R5 trail: rings fall away under each pod and fade (shrink)
    const tr = [BI.foreArmL, BI.handL, BI.foreArmR, BI.handR];
    tr.forEach((bi, i) => {
      const ph = ((t * 1.6 + (i % 2) * 0.5) % 1), side = i < 2 ? 1 : -1;
      bones[bi].position.set(side * 0.15 * G, (-0.22 - ph * 0.42) * G, (0.02 - ph * 0.08) * G);
      bones[bi].scale.setScalar(dead ? 0.001 : Math.max(0.001, (1 - ph) * (0.7 + 0.5 * ph) * Math.min(1.5, ctx.pl)));
    });
    // R4 holo readouts flicker
    const hf = dead ? 0.001 : 1 + 0.06 * Math.sin(t * 23) * (Math.sin(t * 3.1) > 0.9 ? 4 : 1);
    bones[BI.footL].scale.set(hf, Math.max(0.001, hf * (a === 'overdrive' ? 1.25 : 1)), 1);
  },
  fxHints: { projectile: 'rail', muzzleColor: 0x8af0ff, impact: 'rail', overdrive: 'orbital_designator', laser: 0xff3a36 },
  build,
};
