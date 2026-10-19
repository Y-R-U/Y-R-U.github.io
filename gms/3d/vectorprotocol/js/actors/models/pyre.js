// PYRE, rogue epic mage "Napalm Artist" (sculptor-12). Brief: docs/ROSTER.md `pyre`; look: refs/ref_battle_02.png.
// A stocky, sooty biped hauling two big orange fuel tanks on its back, a mortar-flamer for a right forearm (heat-shrouded
// barrel, flared nozzle with a live pilot flame, a stubby mortar tube on top that lobs the Pyre Orb) and an igniter glove
// on the left. Gas-mask welder helmet with round amber goggles, a glowing furnace grille in the belly, hazard stripes.
// VALUE: `accent` = charcoal armour (most of it, scorched), `paint` = burnt orange on the tanks, pauldrons, chest plate, shins,
// `metal` = gunmetal joints/pipes, `trim` = hazard yellow markers + brass valves, `glow` = flame orange, `eye` = white-hot
// yellow (goggles, pilot flame core, molten seams). 6 slots.
// Rank tiers (ROSTER R2 base · R3 extra tanks · R4 heat-haze aura · R5 molten seams), plus:
//   R0 battered: right tank swapped for a taped jerry can, left pauldron missing, no rack · R1 two tanks, no mortar rack ·
//   R2 mortar canister rack (3 tubes) between the tanks · R3 hip saddle tanks, rack of 5, glowing gauges ·
//   R4 exhaust chimneys + shoulder heat-sink fins (silhouette) + heat-haze shimmer column (extra mesh, +1 dc) ·
//   R5 molten seams across the armour + a spinning ring of fire floating over the tanks.
// Bones: aux0 = backpack (chest) · aux1 = pilot flame (re-parented to foreArmR, flickered by scale in tick) ·
//   aux2 = canister rack (on aux0, swings up for the overdrive) · aux3 = R5 fire crown (on aux0, spins).
import { THREE, P, PS, plate, fin, discX, legs, LIB, kf, PI, BI } from '../kit.js';

const TAU = PI * 2;
const DIMS = {
  thigh: 0.3, shin: 0.3, ankle: 0.09, hipX: 0.145, hipY: -0.04, spine: 0.12, chest: 0.22, neck: 0.16, headOff: 0.03,
  clavX: 0.09, clavY: 0.17, shoulder: 0.2, upArm: 0.26, foreArm: 0.26,
  aux0: [0, 0.04, -0.23], aux1: [0, -0.585 * 1.18, 0], aux2: [0, 0.27, -0.07], aux3: [0, 0.66, -0.1],
  parents: { aux1: 'foreArmR', aux2: 'aux0', aux3: 'aux0' },
};
const SIDES = ['L', 'R'];
const TK = [0.125, 0.12, -0.1];   // tank centre (aux0 space, +x side)
const GW = 1.18;           // flamer scale
const TR = 0.112, TL = 0.48;       // tank radius, straight length

// scorched paint: soot blooms, heat-tinted streaks rising, burnt chips
function SOOT(g, w, h, r) {
  g.fillStyle = 'rgba(128,128,128,1)'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 26; i++) {
    const x = r() * w, y = r() * h, R = 25 + r() * 90;
    const gr = g.createRadialGradient(x, y, 0, x, y, R);
    gr.addColorStop(0, `rgba(24,20,18,${0.45 + r() * 0.35})`); gr.addColorStop(0.6, `rgba(70,52,40,${0.2 + r() * 0.2})`); gr.addColorStop(1, 'rgba(128,128,128,0)');
    g.fillStyle = gr; g.fillRect(x - R, y - R, R * 2, R * 2);
  }
  for (let i = 0; i < 60; i++) {
    const x = r() * w, y = r() * h, L = 30 + r() * 140;
    const gr = g.createLinearGradient(x, y, x, y - L);
    gr.addColorStop(0, `rgba(30,26,24,${0.3 + r() * 0.3})`); gr.addColorStop(1, 'rgba(128,128,128,0)');
    g.fillStyle = gr; g.fillRect(x, y - L, 1 + r() * 5, L);
  }
  for (let i = 0; i < 70; i++) {
    const x = r() * w, y = r() * h, R = 1 + r() * 4;
    g.fillStyle = r() < 0.6 ? 'rgba(210,205,200,0.7)' : 'rgba(20,16,14,0.8)';
    g.beginPath(); for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; g.lineTo(x + Math.cos(a) * R * (0.5 + r()), y + Math.sin(a) * R * (0.5 + r())); } g.fill();
  }
}

// ---------- helpers ----------
const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
function rodG(b, a, c, r, seg = 8) {
  const A = v3(a), C = v3(c), L = A.distanceTo(C);
  const g = b.cyl(r, r, L, seg);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), C.clone().sub(A).normalize());
  g.applyQuaternion(q); g.translate((a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2);
  return g;
}
function lamp(b, bone, pos, rot, r = 0.02, slot = 'glow') {
  b.add(b.cyl(r * 1.45, r * 1.45, 0.016, 12), bone, 'metal', pos, rot);
  b.add(b.cyl(r, r, 0.024, 12), bone, slot, pos, rot);
}
function rivets(b, bone, pts, rot = [PI / 2, 0, 0], r = 0.011) { if (!b.far) for (const p of pts) b.add(b.cyl(r, r, 0.014, 6), bone, 'metal', p, rot); }
// hazard stripes: alternating yellow/black slanted bars across a w x h patch (local x-y plane, facing +z)
function stripes(b, bone, pos, rot, w, h, n = 5) {
  b.scope(pos, rot, 1, () => {
    b.add(b.box(w, h, 0.008), bone, 'accent', [0, 0, 0]);
    for (let i = 0; i < n; i++) b.add(b.box(w / (n * 2), h * 1.25, 0.012), bone, 'trim', [-w / 2 + (i + 0.5) * w / n, 0, 0.002], [0, 0, 0.6]);
  });
}
// molten crack: jagged chain of thin white-hot bars from a to c (bone space)
function crack(b, bone, a, c, n, amp, seed) {
  let s = seed;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647) - 0.5;
  const pts = [a];
  for (let i = 1; i < n; i++) { const u = i / n; pts.push([a[0] + (c[0] - a[0]) * u + r() * amp, a[1] + (c[1] - a[1]) * u + r() * amp, a[2] + (c[2] - a[2]) * u + r() * amp * 0.3]); }
  pts.push(c);
  for (let i = 0; i < pts.length - 1; i++) b.add(rodG(b, pts[i], pts[i + 1], 0.0065, 4), bone, 'eye');
}
// one fuel tank (aux0 space) at p, tilted by rz
function tank(b, o, p, rz, k = 1, side = 1) {
  const bn = 'aux0', far = b.far, r = TR * k, L = TL * k;
  b.scope(p, [0, 0, rz], 1, () => {
    b.add(b.cap(r, L, 24), bn, 'paint', [0, 0, 0]);
    // charcoal end caps (top reads dark from the battle camera, so the orange barrel reads as a cylinder)
    b.add(b.sph(16, 8, 0, TAU, 0, PI * 0.32), bn, 'accent', [0, L / 2 + 0.004, 0], [0, 0, 0], r * 1.04);
    b.add(b.tor(r * 0.92, 0.008, 20, 4), bn, 'trim', [0, L / 2 + r * 0.42, 0], [PI / 2, 0, 0]);
    // black strap band + yellow pinstripes, two thin straps
    b.add(b.cyl(r * 1.03, r * 1.03, 0.075 * k, 18), bn, 'accent', [0, -0.02 * k, 0]);
    for (const y of [-0.06, 0.02]) b.add(b.tor(r * 1.035, 0.004, 20, 3), bn, 'trim', [0, y * k, 0], [PI / 2, 0, 0]);
    for (const y of [-0.17, 0.15]) b.add(b.tor(r * 1.02, 0.009, 20, 4), bn, 'metal', [0, y * k, 0], [PI / 2, 0, 0]);
    // top valve: neck, brass handwheel with spokes, pressure relief stub
    const top = L / 2 + r;
    b.add(b.cyl(0.03 * k, 0.04 * k, 0.05, 10), bn, 'metal', [0, top - 0.005, 0]);
    b.add(b.cyl(0.012, 0.012, 0.06, 6), bn, 'metal', [0, top + 0.04, 0]);
    b.add(b.tor(0.045 * k, 0.008, 18, 4), bn, 'trim', [0, top + 0.06, 0], [PI / 2, 0, 0]);
    if (!far) for (let i = 0; i < 3; i++) b.add(b.box(0.085 * k, 0.008, 0.008), bn, 'trim', [0, top + 0.06, 0], [0, i * PI / 3, 0]);
    b.add(b.cyl(0.014, 0.018, 0.05, 8), bn, 'metal', [side * 0.045 * k, top - 0.02, -0.03], [0, 0, side * 0.6]);
    // pressure gauge on the outer flank (glow face, needle)
    b.scope([side * r * 0.98, 0.1 * k, -0.01], [0, 0, -side * PI / 2], 1, () => {
      b.add(b.cyl(0.038, 0.038, 0.02, 14), bn, 'metal', [0, 0, 0]);
      b.add(b.cyl(0.029, 0.029, 0.022, 14), bn, o.rank >= 3 ? 'glow' : 'trim', [0, 0.002, 0]);
      if (!far) b.add(b.box(0.004, 0.006, 0.026), bn, 'accent', [0.006, 0.014, 0.004], [0, 0.7, 0]);
    });
    // flame stencil on the back face
    if (!far) b.add(fin(b, [[0, 0.07], [0.022, 0.02], [0.034, -0.03], [0.012, -0.05], [0.01, -0.02], [-0.004, -0.05], [-0.03, -0.03], [-0.02, 0.01]], 0.006, 0.001), bn, 'trim', [0, 0.06 * k, -r * 1.0], [0, PI, 0]);
    // rivet rings beside the strap band, vertical ribs on the sides
    if (!far) for (const y of [-0.075, 0.035]) for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU; b.add(b.sph(5, 3), bn, 'metal', [Math.cos(a) * r * 1.03, y * k, Math.sin(a) * r * 1.03], [0, 0, 0], 0.007); }
    if (!far) for (const a of [0.5, -0.5, PI - 0.5, PI + 0.5]) b.add(b.box(0.012, L * 0.5, 0.012), bn, 'metal', [Math.sin(a) * r * 1.01, 0.12 * k, Math.cos(a) * r * 1.01]);
    // weld seams
    if (!far) b.add(b.box(0.006, L * 0.9, 0.006), bn, 'metal', [0, 0, -r * 1.0]);
  });
}

// ---------- parts ----------
function pack(b, o) {
  const far = b.far, rk = o.rank, bn = 'aux0';
  // frame: back plate, harness top, two side rails
  P(b, bn, 'accent', [0.44, 0.44, 0.09], [0, 0.04, 0.03], [0, 0, 0], { c: 0.025, tx: 0.9 });
  P(b, bn, 'metal', [0.36, 0.06, 0.16], [0, 0.27, -0.03], [0, 0, 0], { c: 0.015 });
  for (const sx of [1, -1]) b.add(b.cbox(0.035, 0.5, 0.05, 0.008), bn, 'metal', [sx * 0.21, 0.04, -0.03]);
  rivets(b, bn, [[0.19, 0.24, 0.08], [-0.19, 0.24, 0.08], [0.19, -0.16, 0.08], [-0.19, -0.16, 0.08]]);
  // tanks (R0: the right tank is a taped jerry can)
  tank(b, o, [TK[0], TK[1], TK[2]], -0.1, 1, 1);
  if (rk >= 1) tank(b, o, [-TK[0], TK[1], TK[2]], 0.1, 1, -1);
  else {
    b.add(b.cbox(0.17, 0.32, 0.13, 0.02), bn, 'paint', [-0.12, 0.0, -0.1], [0, 0, 0.12]);
    b.add(b.cbox(0.18, 0.04, 0.14, 0.008), bn, 'metal', [-0.12, -0.04, -0.1], [0, 0, 0.12]);
    b.add(b.tor(0.035, 0.009, 10, 4, PI), bn, 'metal', [-0.14, 0.18, -0.1], [0, 0, 0.12]);
    b.add(b.cyl(0.02, 0.02, 0.05, 8), bn, 'trim', [-0.08, 0.17, -0.1], [0, 0, -0.4]);
  }
  // manifold between the tank bottoms + main feed hose to the right shoulder
  b.add(b.tube([[0.12, -0.26, -0.1], [0.04, -0.31, -0.06], [-0.06, -0.31, -0.06], [-0.13, -0.26, -0.1]], 0.022, 12, 6), bn, 'metal');
  b.add(b.cyl(0.035, 0.035, 0.05, 10), bn, 'trim', [0, -0.31, -0.06], [0, 0, PI / 2]);
  b.add(b.tube([[-0.13, -0.28, -0.06], [-0.24, -0.22, 0.04], [-0.29, -0.02, 0.12], [-0.26, 0.14, 0.17]], 0.024, 14, 6), bn, 'accent');
  if (!far) for (let i = 0; i < 4; i++) b.add(b.tor(0.027, 0.006, 10, 3), bn, 'trim', [-0.24 - i * 0.012, -0.2 + i * 0.09, 0.05 + i * 0.03], [1.0, 0, 0.3]);
  // R3: hip saddle tanks
  if (rk >= 3) for (const sx of [1, -1]) {
    b.scope([sx * 0.27, -0.2, -0.04], [0.15, 0, sx * 0.5], 1, () => {
      b.add(b.cap(0.065, 0.2, 14), bn, 'paint', [0, 0, 0]);
      b.add(b.cyl(0.068, 0.068, 0.05, 14), bn, 'accent', [0, 0, 0]);
      b.add(b.tor(0.069, 0.004, 16, 3), bn, 'trim', [0, 0.03, 0], [PI / 2, 0, 0]);
      b.add(b.cyl(0.02, 0.025, 0.05, 8), bn, 'metal', [0, 0.17, 0]);
      b.add(b.tor(0.028, 0.006, 12, 3), bn, 'trim', [0, 0.19, 0], [PI / 2, 0, 0]);
    });
    b.add(b.cbox(0.08, 0.04, 0.06, 0.01), bn, 'metal', [sx * 0.22, -0.16, -0.02]);
  }
  // R4: twin exhaust chimneys with glowing lips and fins
  if (rk >= 4) for (const sx of [1, -1]) {
    const x = sx * 0.235, z = -0.02;
    b.add(b.cyl(0.032, 0.038, 0.62, 12), bn, 'metal', [x, 0.32, z], [0, 0, -sx * 0.08]);
    b.add(b.cyl(0.044, 0.036, 0.06, 12), bn, 'accent', [x - sx * 0.024, 0.64, z], [0, 0, -sx * 0.08]);
    b.add(b.tor(0.036, 0.008, 14, 4), bn, 'glow', [x - sx * 0.026, 0.672, z], [PI / 2, 0, -sx * 0.08]);
    if (!far) for (let i = 0; i < 4; i++) b.add(b.cyl(0.05, 0.05, 0.008, 12), bn, 'metal', [x - sx * (0.005 + i * 0.004), 0.36 + i * 0.05, z], [0, 0, -sx * 0.08]);
  }
  // R5: molten seams on the tanks
  if (rk >= 5 && !far) for (const sx of [1, -1]) {
    crack(b, bn, [sx * 0.2, 0.3, -0.13], [sx * 0.15, -0.05, -0.2], 6, 0.04, 17 + sx * 5);
    crack(b, bn, [sx * 0.07, 0.26, -0.18], [sx * 0.1, 0.0, -0.21], 4, 0.03, 91 + sx * 7);
  }
}

function rack(b, o) {
  const rk = o.rank, bn = 'aux2', far = b.far;
  if (rk < 2) return;
  const n = rk >= 3 ? 5 : 3;
  // hinged cradle between the tanks; tubes point up-back at rest (aux2 swings them up/forward for Inferno)
  b.add(b.cbox(0.17 + (n - 3) * 0.03, 0.05, 0.1, 0.012), bn, 'metal', [0, 0.0, 0]);
  b.add(discX(b, 0.022, 0.22, 10), bn, 'trim', [0, -0.01, 0.04]);
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * 0.052, y = 0.11 + (i % 2) * 0.02;
    b.scope([x, 0, -0.005], [-0.32, 0, -x * 1.2], 1, () => {
      b.add(b.cyl(0.026, 0.026, 0.2, 10, true), bn, 'accent', [0, y, 0]);
      b.add(b.tor(0.027, 0.006, 12, 3), bn, 'metal', [0, y + 0.1, 0], [PI / 2, 0, 0]);
      // canister nose poking out (napalm warhead): orange cone with a yellow band
      b.add(b.cyl(0.006, 0.022, 0.06, 10), bn, 'paint', [0, y + 0.13, 0]);
      b.add(b.cyl(0.023, 0.023, 0.014, 10), bn, 'trim', [0, y + 0.1, 0]);
      if (!far) b.add(b.sph(6, 4), bn, 'glow', [0, y + 0.165, 0], [0, 0, 0], 0.008);
    });
  }
}

function crown(b, o) {
  if (o.rank < 5) return;
  const bn = 'aux3', n = b.far ? 6 : 9;
  b.add(b.tor(0.19, 0.012, 32, 5), bn, 'glow', [0, 0, 0], [PI / 2, 0, 0]);
  b.add(b.tor(0.215, 0.005, 32, 3), bn, 'trim', [0, -0.01, 0], [PI / 2, 0, 0]);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU, h = i % 2 ? 0.09 : 0.14;
    const fl = fin(b, [[-0.03, 0], [0.03, 0], [0.012, h * 0.5], [0.02, h * 0.75], [0, h], [-0.008, h * 0.6], [-0.022, h * 0.45]], 0.012, 0.003);
    b.add(fl, bn, i % 2 ? 'glow' : 'eye', [Math.cos(a) * 0.19, 0.0, Math.sin(a) * 0.19], [0, -a + PI / 2, 0]);
  }
}

function head(b, o) {
  const y = 0.07, z = 0.03, far = b.far;
  // welder helmet: charcoal dome, orange crest plate, side ear cans
  b.add(b.rbox(0.21, 0.17, 0.21, 0.05), 'head', 'accent', [0, y, z]);
  P(b, 'head', 'paint', [0.08, 0.05, 0.22], [0, y + 0.085, z - 0.005], [0, 0, 0], { c: 0.015, tx: 0.7 });
  b.sym(discX(b, 0.05, 0.04, 14), 'head', 'metal', [0.105, y, z - 0.01]);
  b.sym(discX(b, 0.032, 0.045, 12), 'head', 'trim', [0.12, y, z - 0.01]);
  // round goggles: bezels + white-hot amber lenses, a strap round the back
  for (const x of [0.048, -0.048]) {
    b.add(b.cyl(0.038, 0.042, 0.04, 14), 'head', 'metal', [x, y + 0.03, z + 0.1], [PI / 2, 0, 0]);
    b.add(b.cyl(0.029, 0.029, 0.02, 14), 'head', 'eye', [x, y + 0.03, z + 0.12], [PI / 2, 0, 0]);
    if (!far) b.add(b.tor(0.034, 0.005, 14, 3), 'head', 'trim', [x, y + 0.03, z + 0.122]);
  }
  b.add(b.tor(0.104, 0.01, 18, 4), 'head', 'metal', [0, y + 0.03, z], [PI / 2, 0, 0]);
  // respirator snout + twin filter cans (hazard banded)
  b.add(b.cyl(0.05, 0.065, 0.08, 12), 'head', 'metal', [0, y - 0.045, z + 0.1], [PI / 2 + 0.35, 0, 0]);
  b.add(b.cyl(0.04, 0.04, 0.01, 12), 'head', 'accent', [0, y - 0.06, z + 0.14], [PI / 2 + 0.35, 0, 0]);
  if (!far) for (let i = 0; i < 3; i++) b.add(b.box(0.05, 0.006, 0.006), 'head', 'trim', [0, y - 0.048 - i * 0.012, z + 0.146 - i * 0.004]);
  for (const sx of [1, -1]) {
    b.add(b.cyl(0.032, 0.032, 0.07, 12), 'head', 'accent', [sx * 0.07, y - 0.07, z + 0.08], [PI / 2 + 0.3, 0, sx * 0.5]);
    b.add(b.cyl(0.033, 0.033, 0.016, 12), 'head', 'paint', [sx * 0.08, y - 0.075, z + 0.1], [PI / 2 + 0.3, 0, sx * 0.5]);
  }
  // collar + neck
  b.add(b.cyl(0.06, 0.07, 0.1, 10), 'neck', 'metal', [0, -0.03, 0]);
  if (o.r >= 2 && !far) b.add(b.cyl(0.006, 0.01, 0.18, 5), 'head', 'metal', [-0.08, y + 0.14, z - 0.06], [-0.3, 0, 0.25]);
}

function torso(b, o) {
  const far = b.far, rk = o.rank;
  // barrel chest: charcoal shell, orange chest plate with hazard stripe, collar
  P(b, 'chest', 'accent', [0.44, 0.31, 0.32], [0, 0.1, -0.01], [0, 0, 0], { c: 0.045, tx: 1.06, bx: 0.88, tz: 1.0, bz: 0.9 });
  P(b, 'chest', 'paint', [0.36, 0.17, 0.06], [0, 0.15, 0.155], [0.18, 0, 0], { c: 0.022, tx: 1.08, bx: 0.86 });
  stripes(b, 'chest', [0, 0.06, 0.17], [0.05, 0, 0], 0.26, 0.035, 6);
  P(b, 'chest', 'metal', [0.3, 0.05, 0.22], [0, 0.265, 0.0], [0, 0, 0], { c: 0.014 });
  rivets(b, 'chest', [[0.15, 0.21, 0.175], [-0.15, 0.21, 0.175], [0.16, 0.1, 0.19], [-0.16, 0.1, 0.19]], [PI / 2 + 0.18, 0, 0]);
  // flank vents
  for (const sx of [1, -1]) {
    b.add(b.cbox(0.03, 0.14, 0.16, 0.008), 'chest', 'metal', [sx * 0.215, 0.08, 0.0]);
    if (!far) for (let i = 0; i < 4; i++) b.add(b.box(0.035, 0.012, 0.13), 'chest', i % 2 ? 'accent' : 'glow', [sx * 0.222, 0.03 + i * 0.033, 0.0]);
  }
  // harness straps to the pack
  for (const sx of [1, -1]) b.add(b.cbox(0.045, 0.3, 0.025, 0.006), 'chest', 'metal', [sx * 0.11, 0.16, 0.18], [0.18, 0, 0]);
  // belly furnace: dark frame, glowing slats behind metal bars
  b.add(b.cbox(0.24, 0.13, 0.05, 0.015), 'spine', 'metal', [0, 0.02, 0.15]);
  b.add(b.box(0.2, 0.1, 0.01), 'spine', 'glow', [0, 0.02, 0.172]);
  for (let i = 0; i < 4; i++) b.add(b.cbox(0.22, 0.014, 0.022, 0.004), 'spine', 'accent', [0, -0.025 + i * 0.03, 0.18]);
  b.add(b.cyl(0.15, 0.16, 0.16, 14), 'spine', 'accent', [0, 0.03, -0.01]);
  if (!far) for (let i = 0; i < 3; i++) b.add(b.tor(0.158, 0.008, 18, 4), 'spine', 'metal', [0, -0.03 + i * 0.05, -0.01], [PI / 2, 0, 0]);
  // pelvis: charcoal block, orange loin plate, side skirts, fuel belt canisters
  P(b, 'pelvis', 'accent', [0.34, 0.13, 0.25], [0, -0.01, 0], [0, 0, 0], { c: 0.03 });
  P(b, 'pelvis', 'paint', [0.17, 0.15, 0.05], [0, -0.09, 0.13], [-0.12, 0, 0], { c: 0.016, bx: 0.7 });
  PS(b, 'pelvis', 'accent', [0.05, 0.15, 0.2], [0.19, -0.07, 0], [0, 0, 0.18], { c: 0.014 });
  b.add(b.cbox(0.36, 0.035, 0.27, 0.008), 'pelvis', 'metal', [0, 0.045, 0]);
  if (!far) for (const x of [0.1, -0.1]) {
    b.add(b.cyl(0.026, 0.026, 0.08, 10), 'pelvis', 'paint', [x, 0.02, 0.15], [0, 0, 0]);
    b.add(b.cyl(0.027, 0.027, 0.012, 10), 'pelvis', 'trim', [x, 0.05, 0.15]);
  }
  // R5: molten seams on the chest + belly
  if (rk >= 5 && !far) {
    crack(b, 'chest', [0.14, 0.22, 0.17], [0.05, 0.08, 0.2], 5, 0.03, 7);
    crack(b, 'chest', [-0.17, 0.18, 0.15], [-0.08, 0.03, 0.19], 5, 0.03, 23);
    crack(b, 'pelvis', [0.08, -0.04, 0.16], [0.02, -0.14, 0.15], 4, 0.02, 41);
  }
}

function pauldron(b, o, s) {
  const sx = s === 'L' ? 1 : -1, bn = 'upArm' + s, rk = o.rank;
  if (rk === 0 && s === 'L') { rivets(b, bn, [[0.06, 0.03, 0.05], [0.06, 0.03, -0.05]], [0, 0, PI / 2], 0.012); return; }
  // angular layered pauldron: charcoal top slab, orange edge band, gunmetal under-layers, hazard flash
  b.add(b.sph(12, 8, 0, TAU, 0, PI * 0.5), bn, 'metal', [sx * 0.02, 0.02, 0], [0, 0, 0], [0.1, 0.08, 0.1]);
  b.add(plate(b, 0.22, 0.06, 0.25, { c: 0.02, tx: 0.78, tz: 0.85 }), bn, 'accent', [sx * 0.05, 0.075, 0], [0, 0, -sx * 0.3]);
  b.add(plate(b, 0.2, 0.035, 0.23, { c: 0.012, tx: 0.7, tz: 0.8 }), bn, 'paint', [sx * 0.045, 0.115, 0], [0, 0, -sx * 0.3]);
  b.add(plate(b, 0.2, 0.05, 0.24, { c: 0.014, tx: 0.88 }), bn, 'accent', [sx * 0.085, 0.0, 0], [0, 0, -sx * 0.55]);
  b.add(plate(b, 0.17, 0.04, 0.21, { c: 0.012, tx: 0.88 }), bn, 'metal', [sx * 0.1, -0.06, 0], [0, 0, -sx * 0.7]);
  b.add(b.box(0.02, 0.05, 0.25), bn, 'paint', [sx * 0.175, 0.0, 0], [0, 0, -sx * 0.55]);
  stripes(b, bn, [sx * 0.08, 0.06, 0.12], [-0.3, 0, -sx * 0.3], 0.12, 0.03, 4);
  rivets(b, bn, [[sx * 0.0, 0.135, 0.08], [sx * 0.0, 0.135, -0.08]], [0, 0, 0], 0.01);
  lamp(b, bn, [sx * 0.15, 0.0, 0.07], [0, 0, sx * (PI / 2 - 0.3)], 0.014, 'glow');
  // R4: heat-sink fins on top
  if (rk >= 4) for (let i = 0; i < 4; i++) b.add(fin(b, [[-0.07, 0], [0.07, 0], [0.05, 0.07], [-0.04, 0.09]], 0.012, 0.003), bn, i % 2 ? 'metal' : 'accent', [sx * 0.03, 0.12, -0.06 + i * 0.04], [0, PI / 2, -sx * 0.3]);
  if (rk >= 5 && !b.far) crack(b, bn, [sx * 0.04, 0.15, 0.06], [sx * 0.14, 0.05, 0.03], 4, 0.02, s === 'L' ? 3 : 5);
}

function armL(b, o) {
  const D = b.rig.D, ua = D.upArm, fa = D.foreArm, far = b.far;
  b.add(b.cyl(0.05, 0.05, D.shoulder, 8), 'clavL', 'metal', [D.shoulder / 2, 0, 0], [0, 0, PI / 2]);
  b.add(b.sph(12, 8), 'upArmL', 'metal', [0, 0, 0], [0, 0, 0], 0.085);
  b.add(b.cyl(0.045, 0.04, ua, 8), 'upArmL', 'metal', [0, -ua / 2, 0]);
  b.add(plate(b, 0.11, ua * 0.5, 0.11, { c: 0.014 }), 'upArmL', 'accent', [0.01, -ua * 0.58, 0], [0, 0, 0]);
  pauldron(b, o, 'L');
  b.add(discX(b, 0.05, 0.11, 10), 'foreArmL', 'metal', [0, 0, 0]);
  b.add(plate(b, 0.14, fa * 0.78, 0.14, { c: 0.022, tx: 0.86, tz: 0.86 }), 'foreArmL', 'accent', [0, -fa * 0.5, 0]);
  b.add(plate(b, 0.08, fa * 0.5, 0.03, { c: 0.01 }), 'foreArmL', 'paint', [0.0, -fa * 0.5, 0.075]);
  b.add(b.cyl(0.026, 0.026, fa * 0.6, 8), 'foreArmL', 'metal', [0.07, -fa * 0.5, -0.03]);
  if (!far) b.add(b.tube([[0.07, -0.02, -0.06], [0.1, -0.1, -0.08], [0.08, -fa + 0.03, -0.05]], 0.009, 8, 4), 'foreArmL', 'metal');
  // igniter glove: heavy charcoal glove, brass igniter can on the back of the wrist with a tiny hot tip, clawed fingers
  b.add(b.cbox(0.1, 0.1, 0.11, 0.02), 'handL', 'metal', [0, -0.05, 0.005]);
  b.add(b.cbox(0.105, 0.05, 0.12, 0.014), 'handL', 'accent', [0, -0.1, 0.01]);
  if (!far) for (let i = 0; i < 3; i++) b.add(b.cbox(0.024, 0.07, 0.026, 0.006), 'handL', 'metal', [-0.005, -0.15, -0.03 + i * 0.032], [0, 0, -0.3]);
  b.add(b.cyl(0.022, 0.022, 0.08, 10), 'handL', 'trim', [0.055, -0.04, 0.03], [0, 0, 0]);
  b.add(b.cyl(0.01, 0.014, 0.03, 8), 'handL', 'metal', [0.055, -0.095, 0.03]);
  b.add(b.sph(8, 6), 'handL', 'eye', [0.055, -0.115, 0.03], [0, 0, 0], 0.011);
  // elbow piston
  if (!far) {
    b.add(rodG(b, [0.0, -0.05, -0.06], [0.0, -ua + 0.02, -0.06], 0.017), 'upArmL', 'metal');
    b.add(rodG(b, [0.0, 0.06, -0.06], [0.0, -0.1, -0.06], 0.009), 'foreArmL', 'metal');
  }
}

function armR(b, o) {
  const D = b.rig.D, ua = D.upArm, fa = D.foreArm, far = b.far, rk = o.rank, bn = 'foreArmR';
  b.add(b.cyl(0.055, 0.055, D.shoulder, 8), 'clavR', 'metal', [-D.shoulder / 2, 0, 0], [0, 0, PI / 2]);
  b.add(b.sph(12, 8), 'upArmR', 'metal', [0, 0, 0], [0, 0, 0], 0.095);
  b.add(b.cyl(0.05, 0.045, ua, 8), 'upArmR', 'metal', [0, -ua / 2, 0]);
  b.add(plate(b, 0.13, ua * 0.55, 0.13, { c: 0.016 }), 'upArmR', 'accent', [-0.01, -ua * 0.58, 0], [0, 0, 0]);
  pauldron(b, o, 'R');
  // feed hose down the back of the upper arm into the weapon housing
  b.add(b.tube([[-0.05, 0.06, -0.08], [-0.08, -0.08, -0.1], [-0.06, -ua + 0.02, -0.1]], 0.02, 10, 6), 'upArmR', 'accent');
  // ---- mortar-flamer (all on foreArmR, the barrel runs along -y), authored at 1.0 and scaled by GW
  b.scope([0, 0, 0], [0, 0, 0], GW, () => {
  b.add(discX(b, 0.06, 0.13, 12), bn, 'metal', [0, 0, 0]);
  // fuel housing: charcoal block, orange shroud, brass gauge
  b.add(plate(b, 0.17, 0.18, 0.17, { c: 0.025, tx: 0.9, tz: 0.9 }), bn, 'accent', [0, -0.1, 0]);
  b.add(b.cyl(0.092, 0.092, 0.08, 14), bn, 'paint', [0, -0.15, 0]);
  stripes(b, bn, [-0.0, -0.075, 0.087], [0, 0, 0], 0.12, 0.03, 4);
  b.scope([-0.088, -0.1, 0.02], [0, 0, PI / 2], 1, () => {
    b.add(b.cyl(0.032, 0.032, 0.02, 14), bn, 'metal', [0, 0, 0]);
    b.add(b.cyl(0.024, 0.024, 0.022, 14), bn, 'glow', [0, 0.002, 0]);
  });
  // barrel + vented heat shroud + flared nozzle
  b.add(b.cyl(0.048, 0.052, 0.36, 12), bn, 'metal', [0, -0.37, 0]);
  b.add(b.cyl(0.072, 0.072, 0.2, 14, true), bn, 'accent', [0, -0.33, 0]);
  if (!far) for (let i = 0; i < 5; i++) b.add(b.tor(0.073, 0.008, 16, 4), bn, i % 2 ? 'metal' : 'accent', [0, -0.24 - i * 0.045, 0], [PI / 2, 0, 0]);
  if (!far) for (let i = 0; i < 6; i++) { const a = i * PI / 3; b.add(b.box(0.012, 0.15, 0.006), bn, 'glow', [Math.cos(a) * 0.07, -0.33, Math.sin(a) * 0.07], [0, -a, 0]); }
  b.add(b.lathe([[0.04, 0.0], [0.05, -0.02], [0.075, -0.07], [0.068, -0.075], [0.035, -0.03], [0.03, 0.0]], 16), bn, 'metal', [0, -0.53, 0]);
  b.add(b.tor(0.072, 0.008, 18, 4), bn, 'trim', [0, -0.6, 0], [PI / 2, 0, 0]);
  b.add(b.cyl(0.032, 0.032, 0.01, 12), bn, 'glow', [0, -0.575, 0]);
  // igniter prongs under the nozzle
  for (const sx of [1, -1]) b.add(rodG(b, [sx * 0.04, -0.5, -0.05], [sx * 0.025, -0.6, -0.04], 0.007), bn, 'trim');
  // stubby mortar tube on top (local +z), brass muzzle ring, hot bore
  b.add(b.cyl(0.058, 0.064, 0.26, 14), bn, 'accent', [0, -0.25, 0.115]);
  b.add(b.cyl(0.068, 0.068, 0.06, 14), bn, 'paint', [0, -0.18, 0.115]);
  b.add(b.tor(0.06, 0.012, 16, 4), bn, 'trim', [0, -0.38, 0.115], [PI / 2, 0, 0]);
  b.add(b.cyl(0.043, 0.043, 0.01, 12), bn, 'glow', [0, -0.375, 0.115]);
  b.add(b.cbox(0.05, 0.12, 0.04, 0.01), bn, 'metal', [0, -0.24, 0.06]);
  // side fuel line from housing to the nozzle
  b.add(b.tube([[0.07, -0.16, -0.05], [0.07, -0.3, -0.085], [0.05, -0.47, -0.06]], 0.013, 10, 5), bn, 'metal');
  if (o.r >= 1) P(b, bn, 'paint', [0.04, 0.16, 0.12], [-0.085, -0.3, 0.03], [0, 0, 0], { c: 0.01 });
  if (rk >= 5 && !far) crack(b, bn, [0.06, -0.08, 0.08], [0.07, -0.2, 0.06], 4, 0.02, 61);
  });
  // a trigger grip stub where the hand would be
  b.add(b.cbox(0.06, 0.08, 0.07, 0.012), 'handR', 'metal', [0, -0.02, -0.04]);
  // pilot flame on aux1: outer orange tongue + white-hot core (scaled by tick)
  const flame = (h, w) => b.lathe([[0, 0], [w * 0.8, -h * 0.12], [w, -h * 0.3], [w * 0.75, -h * 0.6], [w * 0.3, -h * 0.88], [0, -h]], 10);
  b.add(flame(0.15, 0.036), 'aux1', 'glow', [0, 0, 0]);
  b.add(flame(0.095, 0.02), 'aux1', 'eye', [0, -0.005, 0]);
}

function legsAll(b, o) {
  const far = b.far, rk = o.rank, th = b.rig.D.thigh, sh = b.rig.D.shin;
  legs(b, o, { w: 1.02, foot: 'wide', thighSlot: 'accent', shellSlot: 'metal', shinPlateSlot: 'paint', kneeSlot: 'accent', footSlot: 'accent', outerSlot: 'metal', heelSlot: 'metal' });
  // knee pistons, shin hazard bands, ankle guards
  if (!far) {
    b.sym(rodG(b, [0.0, -0.06, 0.12], [0.0, -th + 0.04, 0.12], 0.018), 'thigh', 'metal');
    b.sym(b.cyl(0.024, 0.024, 0.03, 10), 'thigh', 'accent', [0, -th + 0.05, 0.12]);
    b.sym(rodG(b, [0.0, 0.06, 0.115], [0.0, -0.08, 0.13], 0.01), 'shin', 'metal');
  }
  b.sym(b.cbox(0.2, 0.03, 0.2, 0.008), 'shin', 'trim', [0, -sh * 0.12, 0.02]);
  b.sym(b.cbox(0.07, 0.13, 0.025, 0.006), 'thigh', 'metal', [0.12, -th * 0.45, 0.06], [0, 0.5, 0]);
  if (!far) for (let i = 0; i < 4; i++) b.sym(b.box(0.055, 0.008, 0.03), 'thigh', 'glow', [0.124, -th * 0.45 - 0.045 + i * 0.03, 0.065], [0, 0.5, 0]);
  b.sym(plate(b, 0.17, 0.12, 0.05, { c: 0.016, tx: 0.7 }), 'shin', 'paint', [0, 0.06, 0.135], [-0.35, 0, 0]);
  if (!far) { b.sym(rodG(b, [0.07, -sh * 0.55, -0.07], [0.06, -sh + 0.02, -0.08], 0.013), 'shin', 'metal'); b.sym(rodG(b, [0.06, 0.04, -0.08], [0.06, -0.05, -0.08], 0.007), 'foot', 'metal'); }
  PS(b, 'foot', 'paint', [0.18, 0.05, 0.08], [0, -0.03, 0.2], [0.35, 0, 0], { c: 0.014, tx: 0.8 });
  if (rk >= 5 && !far) b.sym(crackG(b), 'shin', 'eye', [0.04, -sh * 0.4, 0.17]);
}
// short vertical molten crack (shin plates)
function crackG(b) {
  const pts = [[0, 0.07, 0], [0.012, 0.03, 0.002], [-0.006, -0.01, 0.004], [0.01, -0.05, 0.004], [0.0, -0.08, 0.002]];
  const gs = [];
  for (let i = 0; i < pts.length - 1; i++) gs.push(rodG(b, pts[i], pts[i + 1], 0.006, 4));
  const g = new THREE.BufferGeometry(), pos = [], idx = [];
  let o = 0;
  for (const x of gs) { const p = x.attributes.position, ix = x.index.array; for (let i = 0; i < p.count; i++) pos.push(p.getX(i), p.getY(i), p.getZ(i)); for (const i of ix) idx.push(i + o); o += p.count; }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}

function build(b, o) {
  torso(b, o);
  head(b, o);
  pack(b, o);
  rack(b, o);
  crown(b, o);
  armL(b, o);
  armR(b, o);
  legsAll(b, o);
  if (!b.far && o.faction === 'rogue') b.sym(fin(b, [[-0.02, 0], [0.02, 0], [0, 0.08]], 0.022, 0.005), 'foreArm', 'metal', [0.0, -0.05, -0.09], [-1.2, 0, 0]);
}

// ---------------- anims ----------------
function hunch(Pp, k = 1) { LIB.A(Pp, 'spine', 0.12 * k, 0, 0); LIB.A(Pp, 'chest', 0.1 * k, 0, 0); LIB.A(Pp, 'neck', 0.12 * k, 0, 0); LIB.A(Pp, 'head', -0.2 * k, 0, 0); }
// the flamer held low and forward, the left fist loose at the hip
function ready(Pp, t = 0, k = 1) {
  const b = Math.sin(t * 1.6);
  LIB.RS(Pp, 'upArm', 'R', -0.35 * k + 0.03 * b, 0.1, 0.3);
  LIB.RS(Pp, 'foreArm', 'R', -0.95 * k, -0.15, 0);
  LIB.RS(Pp, 'hand', 'R', 0, 0, 0);
  LIB.RS(Pp, 'upArm', 'L', -0.15 + 0.03 * Math.sin(t * 1.6 + 1.5), 0.1, 0.32);
  LIB.RS(Pp, 'foreArm', 'L', -0.7, -0.2, 0);
  LIB.RS(Pp, 'hand', 'L', -0.2, 0, 0.1);
}
function stance(Pp, ctx, t) {
  LIB.idle(Pp, ctx, t);
  hunch(Pp);
  Pp[LIB.PX + 1] -= 0.035;
  ready(Pp, t);
}
// flamer aim: k 0 ready -> 1 pointing straight ahead; lift tilts it up (mortar lob)
function aimR(Pp, L, k, lift = 0, yaw = 0) {
  L.RS(Pp, 'upArm', 'R', L.lerp(-0.35, -1.0 - 0.5 * lift, k), L.lerp(0.1, 0.05, k) + yaw, L.lerp(0.3, 0.18, k));
  L.RS(Pp, 'foreArm', 'R', L.lerp(-0.95, -0.55 - 0.45 * lift, k), L.lerp(-0.15, 0, k), 0);
}

const OD_DUR = 2.4, OD_REL = 0.4 / OD_DUR;
const DURS = { attack: 1.0, attack_alt: 1.1, cast: 1.1, overdrive: OD_DUR, hit: 0.42, die: 2.0, deploy: 1.5 };
const anims = {
  idle(Pp, t, ctx, L) {
    stance(Pp, ctx, t);
    // heavy breathing; every ~6 s it raises the nozzle to its face and admires the pilot flame (head tilt)
    const c = t % 6.2, k = L.kf(c, [[0, 0], [3.6, 0], [4.3, 1], [5.3, 1], [6.0, 0]]);
    const tilt = Math.sin(t * 2.2) * 0.15 * k;
    L.RS(Pp, 'upArm', 'R', L.lerp(-0.35, -0.6, k), L.lerp(0.1, 0.45, k), L.lerp(0.3, 0.15, k));
    L.RS(Pp, 'foreArm', 'R', L.lerp(-0.95, -1.75, k), L.lerp(-0.15, 0.3, k), 0);
    L.A(Pp, 'head', 0.1 * k, -0.35 * k, 0.25 * k + tilt); L.A(Pp, 'chest', 0, -0.12 * k, 0);
    L.A(Pp, 'chest', -0.03 * Math.sin(t * 1.6), 0, 0);
    L.plant(Pp, ctx, 0.08, -0.08, 1.12);
  },
  advance(Pp, t, ctx, L) {
    L.gait(Pp, ctx);
    hunch(Pp, 1.1);
    const ph = ctx.move.phase * TAU, sw = Math.sin(ph);
    ready(Pp, t, 0.95);
    L.A(Pp, 'chest', 0, 0.12 * sw, 0.05 * sw); L.A(Pp, 'pelvis', 0, -0.06 * sw, 0);
    L.A(Pp, 'head', 0, -0.08 * sw, 0);
    L.AS(Pp, 'upArm', 'L', 0.25 * sw, 0, 0);
  },
  // FLAMER SWEEP: the nozzle comes up and hoses a short arc of fire (fire 0.32), recoil, back to ready
  attack(Pp, u, ctx, L) {
    stance(Pp, ctx, ctx.t);
    const k = L.kf(u, [[0, 0], [0.24, 1], [0.75, 1], [1, 0]]), sw = L.kf(u, [[0.25, -1], [0.7, 1]]) * k;
    aimR(Pp, L, k, 0.05, 0.25 * sw);
    L.A(Pp, 'chest', 0.06 * k, -0.3 * k - 0.2 * sw, 0); L.A(Pp, 'spine', 0, -0.15 * k - 0.1 * sw, 0);
    L.AS(Pp, 'upArm', 'L', -0.2 * k, 0, 0.2 * k);
    Pp[L.PX + 2] += 0.04 * k; Pp[L.PX + 1] -= 0.03 * k;
    L.plant(Pp, ctx, 0.16, -0.1, 1.25);
  },
  // DOUBLE LOB: two mortar thunks (fire 0.3, 0.55), each kicks the arm up
  attack_alt(Pp, u, ctx, L) {
    stance(Pp, ctx, ctx.t);
    const k = L.kf(u, [[0, 0], [0.2, 1], [0.8, 1], [1, 0]]);
    const kick = L.kf(u, [[0.28, 0], [0.31, 1], [0.45, 0.1], [0.53, 0], [0.56, 1], [0.75, 0]]);
    aimR(Pp, L, k, 0.9 + 0.35 * kick);
    L.A(Pp, 'chest', -0.08 * k - 0.08 * kick, -0.25 * k, 0); L.A(Pp, 'head', 0.08 * k, 0.15 * k, 0);
    Pp[L.PX + 2] -= 0.04 * kick;
    L.plant(Pp, ctx, 0.15, -0.14, 1.25);
  },
  // PYRE ORB (its basic in battle): brace, tilt the mortar up, thunk (fire 0.42), recoil
  cast(Pp, u, ctx, L) {
    stance(Pp, ctx, ctx.t);
    const k = L.kf(u, [[0, 0], [0.28, 1], [0.75, 1], [1, 0]]);
    const kick = L.kf(u, [[0.4, 0], [0.43, 1], [0.7, 0.2], [1, 0]]);
    const brace = L.kf(u, [[0, 0], [0.3, 1], [0.8, 1], [1, 0]]);
    aimR(Pp, L, k, 0.85 + 0.4 * kick);
    L.RS(Pp, 'upArm', 'L', L.lerp(-0.15, -0.9, brace), 0.3 * brace, L.lerp(0.32, 0.1, brace));
    L.RS(Pp, 'foreArm', 'L', L.lerp(-0.7, -1.3, brace), 0.6 * brace, 0);
    L.A(Pp, 'chest', -0.1 * k - 0.12 * kick, -0.28 * k, 0); L.A(Pp, 'spine', -0.04 * kick, -0.1 * k, 0);
    L.A(Pp, 'head', 0.1 * k, 0.2 * k, 0);
    Pp[L.PX + 1] -= 0.05 * brace; Pp[L.PX + 2] -= 0.05 * kick;
    L.plant(Pp, ctx, 0.17, -0.15, 1.3);
  },
  // INFERNO: plants wide and hunches, the rack swings up (tick), canisters launch at the release (0.167) with a jolt down,
  // then it hoses a wide arc of fire across the board and ends arms-spread, presenting its work
  overdrive(Pp, u, ctx, L) {
    stance(Pp, ctx, ctx.t);
    const crouch = L.kf(u, [[0, 0], [0.12, 1], [0.16, 1], [0.2, 1.4], [0.3, 0.6], [0.72, 0.5], [0.85, 0], [1, 0]]);
    const spray = L.kf(u, [[0.18, 0], [0.26, 1], [0.66, 1], [0.74, 0]]), sw = L.kf(u, [[0.26, -1], [0.66, 1]]);
    const pres = L.kf(u, [[0.68, 0], [0.8, 1], [0.92, 1], [1, 0]]);
    aimR(Pp, L, Math.max(spray, 0.3 * crouch * (1 - spray)), 0.1, 0.5 * sw * spray);
    L.A(Pp, 'spine', 0.25 * crouch - 0.2 * pres, -0.25 * sw * spray, 0); L.A(Pp, 'chest', 0.12 * crouch - 0.2 * pres, -0.3 * sw * spray, 0);
    L.A(Pp, 'head', -0.25 * crouch + 0.1 * pres, 0.2 * sw * spray, 0);
    // left arm: braced across at the launch, flung out wide while spraying, both arms up to present
    L.AS(Pp, 'upArm', 'L', -0.4 * crouch, 0, 0.6 * spray + 1.1 * pres);
    L.AS(Pp, 'foreArm', 'L', 0.3 * spray, 0, 0);
    L.AS(Pp, 'upArm', 'R', -0.9 * pres, 0, 0.9 * pres);
    L.AS(Pp, 'foreArm', 'R', 0.5 * pres, 0, 0);
    Pp[L.PX + 1] -= 0.16 * crouch; Pp[L.PX + 2] -= 0.06 * L.kf(u, [[0.15, 0], [0.19, 1], [0.35, 0]]);
    L.plant(Pp, ctx, 0.24, -0.22, 1.7);
  },
  hit(Pp, u, ctx, L) {
    stance(Pp, ctx, ctx.t);
    const k = L.kf(u, [[0, 0], [0.12, 1], [1, 0]]), d = ctx.st.hitDir;
    Pp[L.PX + 2] -= 0.06 * k;
    L.A(Pp, 'spine', -0.18 * k, 0.12 * k * d, 0); L.A(Pp, 'chest', -0.12 * k, 0.1 * k * d, 0.06 * k * d);
    L.A(Pp, 'head', -0.25 * k, -0.2 * k * d, 0.15 * k * d);
    L.AS(Pp, 'upArm', 'L', -0.3 * k, 0, 0.35 * k); L.AS(Pp, 'upArm', 'R', 0.2 * k, 0, 0.2 * k);
    L.plant(Pp, ctx, 0.06, -0.1, 1.12);
  },
  // tanks vent: staggers, drops to its knees, the flamer droops, topples forward onto its face (down 0.78)
  die(Pp, u, ctx, L) {
    stance(Pp, ctx, ctx.t);
    const sh = L.kf(u, [[0, 0], [0.06, 1], [0.3, 1], [0.36, 0]]), jit = Math.sin(u * 120) * sh;
    const kneel = L.kf(u, [[0, 0], [0.32, 0], [0.5, 1], [1, 1]]);
    const fall = L.kf(u, [[0, 0], [0.55, 0], [0.7, 0.4], [0.8, 1], [0.85, 0.94], [1, 0.96]]);
    L.A(Pp, 'chest', -0.25 * sh + 0.06 * jit, 0.12 * jit, 0); L.A(Pp, 'head', -0.4 * sh + 0.15 * jit + 0.4 * fall, 0.2 * jit, 0);
    L.AS(Pp, 'upArm', 'L', -0.4 * sh + 0.4 * fall, 0, 0.5 * sh); L.AS(Pp, 'upArm', 'R', 0.3 * kneel + 0.2 * fall, 0, 0.1);
    L.AS(Pp, 'foreArm', 'R', 0.6 * kneel, 0, 0); L.AS(Pp, 'foreArm', 'L', 0.4 * kneel, 0, 0);
    Pp[L.PX + 1] -= 0.33 * kneel + 0.2 * fall; Pp[L.PX + 2] += 0.1 * kneel + 0.24 * fall;
    L.A(Pp, 'pelvis', 1.05 * fall, 0, 0);
    L.A(Pp, 'spine', 0.2 * kneel, 0, 0);
    if (fall < 0.5) L.plant(Pp, ctx, 0.12 * kneel + 0.05, -0.2 * kneel - 0.05, 1.15, 0, 0.6 * kneel);
    else for (const s of SIDES) {
      const i = BI['thigh' + s] * 3, j = BI['shin' + s] * 3, f = BI['foot' + s] * 3;
      Pp[i] = -0.3 - 0.9 * fall; Pp[i + 2] = (s === 'L' ? 1 : -1) * 0.12; Pp[j] = 0.6 + 0.6 * fall; Pp[f] = 0.6;
    }
  },
  // the artist's flourish: twirls the flamer overhead (a plume of fire, tick), then a deep theatrical bow; loops
  victory(Pp, t, ctx, L) {
    stance(Pp, ctx, t);
    const k = L.smooth(Math.min(1, t / 0.5)), c = t % 3.2;
    const up = L.kf(c, [[0, 0], [0.4, 1], [1.4, 1], [1.8, 0], [3.2, 0]]) * k, bow = L.kf(c, [[1.7, 0], [2.1, 1], [2.7, 1], [3.1, 0]]) * k;
    const tw = Math.sin(c * 6) * up;
    L.RS(Pp, 'upArm', 'R', L.lerp(-0.35, -2.7, up) + 0.15 * tw, 0.1 + 0.2 * tw, L.lerp(0.3, 0.25, up));
    L.RS(Pp, 'foreArm', 'R', L.lerp(-0.95, -0.4, up), 0.1 * tw, 0);
    L.RS(Pp, 'upArm', 'L', L.lerp(-0.15, -0.6, bow) - 0.4 * up, 0.2 * bow, L.lerp(0.32, 0.1, bow) + 0.7 * up);
    L.RS(Pp, 'foreArm', 'L', L.lerp(-0.7, -1.6, bow), 0.8 * bow, 0);
    L.A(Pp, 'spine', 0.35 * bow - 0.15 * up, 0, 0); L.A(Pp, 'chest', 0.25 * bow - 0.1 * up, 0.1 * tw, 0); L.A(Pp, 'head', 0.2 * bow - 0.2 * up, 0, 0);
    Pp[L.PX + 2] -= 0.05 * bow;
    L.plant(Pp, ctx, 0.12 - 0.06 * bow, -0.1 - 0.08 * bow, 1.15);
  },
  // heavy landing in a crouch (land 0.4), tanks bounce, stands, flicks the pilot flame on (ready 0.85)
  deploy(Pp, u, ctx, L) {
    stance(Pp, ctx, ctx.t);
    const land = L.kf(u, [[0, 0], [0.36, 0], [0.43, 1], [0.66, 0.85], [0.84, 0], [1, 0]]);
    const flick = L.kf(u, [[0.7, 0], [0.82, 1], [0.92, 1], [1, 0]]);
    Pp[L.PX + 1] -= 0.3 * land;
    L.A(Pp, 'spine', 0.35 * land, 0, 0); L.A(Pp, 'head', -0.3 * land, 0, 0);
    L.AS(Pp, 'upArm', 'L', 0.3 * land, 0, 0.35 * land); L.AS(Pp, 'foreArm', 'L', 0.5 * land, 0, 0);
    aimR(Pp, L, flick * 0.6, 0.4);
    L.AS(Pp, 'upArm', 'R', 0.25 * land, 0, 0.25 * land);
    L.plant(Pp, ctx, 0.2 * land + 0.08, -0.22 * land - 0.06, 1 + 0.4 * land, 0, 0.5 * land);
  },
};

// pilot flame size per action (1 = idle flicker size)
function flameK(name, u, t) {
  switch (name) {
    case 'attack': return kf(u, [[0, 1], [0.28, 1.3], [0.32, 3.4], [0.7, 3.2], [0.8, 1.2], [1, 1]]);
    case 'attack_alt': return kf(u, [[0, 1], [0.3, 1.8], [0.4, 1], [0.55, 1.8], [0.7, 1]]);
    case 'cast': return kf(u, [[0, 1], [0.3, 1.4], [0.42, 2.2], [0.6, 1], [1, 1]]);
    case 'overdrive': return kf(u, [[0, 1.4], [0.15, 2], [0.26, 3.8], [0.66, 3.8], [0.76, 1.6], [1, 1.2]]);
    case 'die': return kf(u, [[0, 1], [0.3, 1.6], [0.4, 0.3], [0.5, 0]]);
    case 'deploy': return kf(u, [[0, 0], [0.8, 0], [0.84, 2.2], [0.95, 1]]);
    case 'hit': return 1.5;
    case 'victory': { const c = t % 3.2; return kf(c, [[0, 1], [0.4, 3.5], [1.4, 3.5], [1.8, 1], [3.2, 1]]); }
    default: return 1;
  }
}
// rack pitch (rad): 0 rest (tubes up-back), positive swings them up/forward for the barrage
function rackK(name, u) {
  if (name === 'overdrive') return kf(u, [[0, 0], [0.12, 0.95], [0.17, 1.05], [0.22, 0.8], [0.75, 0.8], [0.9, 0]]);
  if (name === 'deploy') return kf(u, [[0.36, 0], [0.44, -0.3], [0.6, 0.15], [0.75, 0]]);
  if (name === 'hit') return kf(u, [[0, 0], [0.15, -0.25], [0.5, 0.08], [1, 0]]);
  if (name === 'die') return kf(u, [[0, 0], [0.3, 0.3], [0.8, -0.4], [1, -0.4]]);
  return 0;
}

// R4+ heat haze: a faint wavering shimmer column over the tanks (extra mesh on aux0, +1 draw call)
let hazeMat = null;
function hazeMaterial() {
  if (hazeMat) return hazeMat;
  hazeMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uLife: { value: 1 }, uColor: { value: new THREE.Color(1.0, 0.42, 0.12) } },
    vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main() { vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float uTime; uniform float uLife; uniform vec3 uColor; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main() {
        float y = vUv.y, x = vUv.x * 6.2832;
        float w = sin(x * 3.0 + y * 9.0 - uTime * 4.0) * 0.5 + 0.5;
        float w2 = sin(x * 5.0 - y * 14.0 - uTime * 6.3 + sin(y * 7.0 + uTime) * 2.0) * 0.5 + 0.5;
        float band = smoothstep(0.35, 1.0, w * w2);
        float edge = pow(1.0 - abs(dot(vN, vV)), 1.5);
        float a = band * (0.35 + 0.65 * edge) * smoothstep(0.0, 0.25, y) * (1.0 - smoothstep(0.55, 1.0, y));
        gl_FragColor = vec4(uColor * a * 0.7 * uLife, 1.0);
      }`,
  });
  return hazeMat;
}
function ensureHaze(unit, bones) {
  if (unit._haze !== undefined) return unit._haze;
  unit._haze = null;
  if (unit.rank < 4) return null;
  const g = new THREE.CylinderGeometry(0.3, 0.2, 0.9, 20, 1, true);
  g.translate(0, 0.65, -0.08);
  const m = new THREE.Mesh(g, hazeMaterial());
  m.renderOrder = 6; m.castShadow = false; m.frustumCulled = false;
  bones[BI.aux0].add(m);
  unit._haze = m;
  unit.extraDrawCalls = 1;
  return m;
}

export default {
  id: 'pyre', name: 'PYRE', role: 'mage', faction: 'rogue', rarity: 'epic', realm: 'scifi',
  rig: 'biped', dims: DIMS, height: 1.6, radius: 0.52, walkSpeed: 0.95, cadence: 0.9, scheme: 'bold',
  style: { weapon: 'fists', heavy: 0.55, stance: 1.2 },
  // charcoal + burnt orange, hazard-yellow trim, flame-orange glow, white-hot yellow eye (rogue); other factions keep bold
  paint: { rogue: { paint: 0xc8501a, accent: 0x261d17, trim: 0xe8a326, glow: 0xff6a1a, eye: 0xffc65a } },
  mats: {
    all: {
      paint: { rough: 0.45, coat: 0.25, detail: { map: SOOT, scale: 2.2, albedo: 0.85, rough: 0.5, scratch: 0.35 } },
      accent: { rough: 0.5, metal: 0.45, coat: 0.15, detail: { map: SOOT, scale: 1.8, albedo: 0.6, rough: 0.5, scratch: 0.3 } },
      metal: { color: 0x5e636b, rough: 0.38 },
      trim: { metal: 0.75, rough: 0.32 },
    },
  },
  motes: { color: 0xff8a2a, speed: 0.6, size: 0.09 },
  sockets: {
    muzzle: ['foreArmR', [0, -0.39 * GW, 0.115 * GW]], hand: ['foreArmR', [0, -0.6 * GW, 0]], handL: ['handL', [0.055, -0.12, 0.03]],
    nozzle: ['foreArmR', [0, -0.6 * GW, 0]], rack: ['aux2', [0, 0.18, 0]], tankL: ['aux0', [0.13, 0.42, -0.1]], tankR: ['aux0', [-0.13, 0.42, -0.1]],
    core: [0, 0.14, 0.2], head: [0, 0.1, 0.12],
  },
  events: {
    attack: [['fire', 0.32]], attack_alt: [['fire', 0.3], ['fire', 0.55]], cast: [['fire', 0.42]],
    overdrive: [['cast', 0.04], ['fire', OD_REL]], die: [['down', 0.78]], deploy: [['land', 0.4], ['ready', 0.85]], hit: [],
  },
  durs: DURS,
  anims,
  post(Pp, ctx, act) {
    const name = act ? act.name : null, u = act ? Math.min(1, act.t / act.dur) : 0, t = ctx.t;
    ctx.pyU = u; ctx.pyA = name;
    // tanks breathe/slosh a little; the rack hinge; the R5 crown spins
    Pp[BI.aux0 * 3] = 0.03 * Math.sin(t * 1.6) + (name === 'hit' ? -0.12 * kf(u, [[0, 0], [0.15, 1], [1, 0]]) : 0);
    Pp[BI.aux2 * 3] = rackK(name, u);
    Pp[BI.aux3 * 3 + 1] = t * (name === 'overdrive' ? 5 : 1.4);
  },
  tick(unit, dt, ctx, bones) {
    const st = unit.state, a = st.action, t = ctx.t;
    let k = unit.dead ? 0 : flameK(a || (st.loop === 'victory' ? 'victory' : null), ctx.pyU || 0, t);
    const fl = 0.85 + 0.3 * Math.random();
    const f = bones[BI.aux1];
    f.scale.set(Math.max(0.001, (0.8 + 0.25 * k) * (0.9 + 0.2 * Math.random())), Math.max(0.001, k * fl), Math.max(0.001, (0.8 + 0.25 * k) * (0.9 + 0.2 * Math.random())));
    const c = bones[BI.aux3];
    c.position.y = ctx.D.aux3[1] + 0.03 * Math.sin(t * 2.3);
    c.scale.setScalar(unit.dead ? 0.001 : 1 + 0.06 * Math.sin(t * 13) + (a === 'overdrive' ? 0.3 : 0));
    const h = ensureHaze(unit, bones);
    if (h) {
      hazeMat.uniforms.uTime.value = t;
      h.visible = !unit.dead;
      h.scale.setScalar(a === 'overdrive' ? 1.35 : 1);
    }
  },
  fxHints: { projectile: 'fire_orb', impact: 'napalm', overdrive: 'inferno', color: 0xff6a1a },
  build,
};
