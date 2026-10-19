// KINGPIN, rogue legendary mage "Swarm Boss" (sculptor-16). Brief: docs/ROSTER.md `kingpin`. "Never fights. Has people for that."
// A fat crime-boss robot lounging on a gaudy hovering throne-pod, a fedora with a gold band, monocle and cigar, gold epaulettes and a
// fat gold chain; two drone HIVE RACKS stand on gold arms either side of the throne (honeycomb cells, each with a parked scrap
// drone's orange eye), exhaust stacks behind the backrest. The racks swing open in the overdrive and the drones pour out.
// VALUE: `paint` = polished gold (throne frame, pod, racks' frames, epaulettes, chain), `accent` = black lacquer (suit armour,
// throne body, rack bodies, hat), `metal` = gunmetal (joints, thrusters, cell rims, pipes), `trim` = red velvet (cushions, tie,
// hat band stripe, hazard bands; navy / purple velvet in the other tints), `glow` = rogue orange (cells, thrusters, cigar, gems),
// `eye` = orange-red (eyes, monocle, drone eyes).
// Rank tiers (legendary default R3): R0 battered: racks half empty with a missing door, chipped pod, no crest · R1 base throne,
//   2x4 cells · R2 tufted velvet, epaulettes, side cells on the racks · R3 (base) crown crest + gem, three bodyguard drones hover
//   over the throne, glowing cell eyes · R4 bigger hive racks (taller, extra column, roof antenna), gold spikes on the pod rim ·
//   R5 six drones constantly orbit (aux1 spins), gold crown on the fedora, a third exhaust stack.
// Rig: hover; the pelvis IS the throne pod (seated body: thighs forward, shins down). aux2 / aux3 (pelvis) = left / right hive
// racks, swung open in post(); aux1 (re-parented to pelvis) = the drone orbit ring; aux0 (chest) = the cigar smoke / chain medal.
import { THREE, P, PS, plate, fin, discX, shell, LIB, PI, BI } from '../kit.js';

const L = LIB;
const SIDES = ['L', 'R'];
const RACK_X = 0.5;
const VELVET = { metal: 0.05, rough: 0.62, coat: 0, emissive: 0x000000, ei: 0, panel: { groove: 0 } };
const DIMS = {
  hover: 0.72, thigh: 0.36, shin: 0.36, ankle: 0.04, hipX: 0.15, hipY: -0.02, spine: 0.13, chest: 0.29, neck: 0.22, headOff: 0.06,
  clavX: 0.11, clavY: 0.19, shoulder: 0.25, upArm: 0.3, foreArm: 0.29,
  parents: { aux1: 'pelvis' },
  aux0: [0, 0.1, 0.16], aux1: [0, 0.62, -0.05], aux2: [RACK_X, 0.32, -0.5], aux3: [-RACK_X, 0.32, -0.5],
};

function lamp(b, bone, pos, rot, r = 0.022, slot = 'glow') {
  b.add(b.cyl(r * 1.5, r * 1.5, 0.016, 12), bone, 'metal', pos, rot);
  b.add(b.cyl(r, r, 0.024, 12), bone, slot, pos, rot);
}
// a parked scrap drone (nose out along +z of its frame): black dome, gold ring, orange eye
function drone(b, bone, pos, rot, s = 1, eye = true) {
  b.scope(pos, rot, s, () => {
    b.add(b.sph(10, 7, 0, PI * 2, 0, PI / 2), bone, 'accent', [0, 0, 0], [PI / 2, 0, 0], [0.05, 0.05, 0.04]);
    b.add(b.tor(0.05, 0.008, 12, 3), bone, 'paint', [0, 0, 0]);
    if (eye) b.add(b.cyl(0.015, 0.015, 0.012, 8), bone, 'eye', [0, 0, 0.042], [PI / 2, 0, 0]);
  });
}
// a flying mini-drone (top view readable): disc body, rotor arms, eye
function miniDrone(b, bone, pos, yaw, far) {
  b.scope(pos, [0, yaw, 0], 1, () => {
    b.add(b.cyl(0.07, 0.06, 0.04, 12), bone, 'accent');
    b.add(b.tor(0.072, 0.009, 14, 3), bone, 'paint', [0, 0.01, 0], [PI / 2, 0, 0]);
    b.add(b.cyl(0.03, 0.03, 0.025, 10), bone, 'glow', [0, 0.03, 0]);
    b.add(b.cbox(0.03, 0.02, 0.02, 0.005), bone, 'eye', [0, -0.005, 0.07]);
    b.add(fin(b, [[-0.012, 0], [0.012, 0], [0, -0.06]], 0.012, 0.003), bone, 'metal', [0, -0.02, 0]);
    if (!far) for (const s of [1, -1]) {
      b.add(b.cbox(0.11, 0.012, 0.016, 0.004), bone, 'metal', [s * 0.1, 0.01, 0]);
      b.add(b.cyl(0.045, 0.045, 0.006, 10), bone, 'metal', [s * 0.16, 0.025, 0]);
    }
  });
}

// ---------- throne ----------
function throne(b, o) {
  const rk = o.rank, far = o.far, B = 'pelvis';
  // hover pod: gold bowl under the seat, black band, three thruster bells
  b.add(b.lathe([[0, -0.4], [0.2, -0.38], [0.36, -0.3], [0.46, -0.16], [0.5, -0.06], [0.48, 0.0], [0, 0.0]], 28), B, 'paint', [0, -0.06, 0.02], [0, 0, 0], [1, 1, 0.85]);
  b.add(b.tor(0.49, 0.03, 40, 5), B, 'accent', [0, -0.1, 0.02], [PI / 2, 0, 0], [1, 0.85, 1]);
  if (rk >= 1 && !far) for (let i = 0; i < 16; i++) { const a = i / 16 * PI * 2; b.add(b.sph(6, 4), B, 'paint', [Math.cos(a) * 0.5, -0.1, 0.02 + Math.sin(a) * 0.425], [0, 0, 0], 0.016); }
  for (let i = 0; i < 3; i++) {
    const a = i / 3 * PI * 2 + PI / 2, x = Math.cos(a) * 0.2, z = 0.02 + Math.sin(a) * 0.17;
    b.add(b.cyl(0.07, 0.1, 0.12, 14, true), B, 'metal', [x, -0.47, z]);
    b.add(b.cyl(0.075, 0.075, 0.01, 14), B, 'glow', [x, -0.52, z]);
  }
  // R4: gold spikes round the pod rim (rogue flair)
  if (rk >= 4) for (let i = 0; i < 10; i++) {
    const a = i / 10 * PI * 2;
    b.add(fin(b, [[-0.025, 0], [0.025, 0], [0, 0.12]], 0.025, 0.006), B, 'paint', [Math.cos(a) * 0.5, -0.14, 0.02 + Math.sin(a) * 0.43], [PI / 2 + 0.6, 0, -a + PI / 2], [1, 1, 1]);
  }
  // seat: black body, red velvet cushion
  b.add(b.cbox(0.66, 0.16, 0.58, 0.04), B, 'accent', [0, -0.04, 0.02]);
  b.add(b.rbox(0.56, 0.08, 0.48, 0.035), B, 'trim', [0, 0.06, 0.05]);
  // backrest: black lacquer, gold frame, velvet inset with gold tufting buttons
  const by = 0.56, bz = -0.3;
  b.add(b.cbox(0.72, 1.02, 0.12, 0.03), B, 'accent', [0, by, bz - 0.02], [-0.08, 0, 0]);
  b.add(b.rbox(0.52, 0.78, 0.07, 0.03), B, 'trim', [0, by - 0.02, bz + 0.04], [-0.08, 0, 0]);
  for (const s of [1, -1]) b.add(b.cbox(0.05, 1.06, 0.14, 0.012), B, 'paint', [s * 0.36, by, bz - 0.02], [-0.08, 0, 0]);
  b.add(b.cbox(0.78, 0.06, 0.15, 0.015), B, 'paint', [0, by + 0.52, bz - 0.06], [-0.08, 0, 0]);
  if (rk >= 2 && !far) for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) {
    b.add(b.sph(6, 4), B, 'paint', [(c - 1) * 0.15, by + 0.3 - r * 0.2, bz + 0.08 + (by + 0.3 - r * 0.2 - by) * 0.08], [0, 0, 0], 0.018);
  }
  // crest: gold crown with an orange gem + finials (R3+); R0-R2 a plain gold cap
  if (rk >= 3) {
    b.add(fin(b, [[-0.36, 0], [0.36, 0], [0.36, 0.14], [0.22, 0.06], [0.12, 0.2], [0, 0.08], [-0.12, 0.2], [-0.22, 0.06], [-0.36, 0.14]], 0.06, 0.012), B, 'paint', [0, by + 0.54, bz - 0.1], [-0.08, 0, 0]);
    b.add(b.sph(12, 8), B, 'glow', [0, by + 0.63, bz - 0.04], [0, 0, 0], [0.05, 0.06, 0.03]);
    for (const x of [-0.12, 0.12, -0.36, 0.36]) b.add(b.sph(8, 6), B, Math.abs(x) > 0.2 ? 'paint' : 'glow', [x, by + 0.74 + (Math.abs(x) > 0.2 ? -0.06 : 0), bz - 0.1], [0, 0, 0], 0.03);
  } else if (rk >= 1) b.add(b.cbox(0.4, 0.08, 0.1, 0.02), B, 'paint', [0, by + 0.64, bz - 0.08]);
  // armrests: gold scrolls with velvet pads, black side panels
  for (const s of [1, -1]) {
    b.add(b.cbox(0.1, 0.28, 0.5, 0.02), B, 'accent', [s * 0.37, 0.1, 0.03]);
    b.add(b.rbox(0.12, 0.05, 0.5, 0.02), B, 'trim', [s * 0.37, 0.26, 0.03]);
    b.add(b.cyl(0.06, 0.06, 0.14, 14), B, 'paint', [s * 0.37, 0.24, 0.3], [0, 0, PI / 2]);
    b.add(b.cyl(0.035, 0.035, 0.15, 12), B, 'glow', [s * 0.37, 0.24, 0.3], [0, 0, PI / 2]);
    b.add(b.cbox(0.12, 0.03, 0.46, 0.01), B, 'metal', [s * 0.37, 0.205, 0.03]);
    // rack mount arm (gold strut from the backrest edge to the rack hinge)
    b.add(b.cbox(0.16, 0.06, 0.08, 0.015), B, 'paint', [s * 0.43, 0.3, -0.42]);
    b.add(b.cyl(0.035, 0.035, 0.12, 10), B, 'metal', [s * 0.42, 0.42, -0.44]);
  }
  // exhaust stacks behind the backrest (rogue), glowing tips; third stack at R5
  const nst = rk >= 5 ? 3 : 2;
  for (let i = 0; i < nst; i++) {
    const x = nst === 3 ? (i - 1) * 0.2 : (i ? -0.18 : 0.18), h = 0.75 + (i === 1 && nst === 3 ? 0.15 : 0);
    b.add(b.cyl(0.045, 0.055, h, 12), B, 'metal', [x, 0.5 + h / 2 - 0.3, bz - 0.15]);
    b.add(b.cyl(0.06, 0.05, 0.06, 12), B, 'paint', [x, 0.5 + h - 0.3, bz - 0.15]);
    b.add(b.cyl(0.035, 0.035, 0.012, 10), B, 'glow', [x, 0.5 + h - 0.27, bz - 0.15]);
  }
  // footrest bar
  b.add(b.cyl(0.03, 0.03, 0.5, 10), B, 'paint', [0, -0.56, 0.44], [0, 0, PI / 2]);
  for (const s of [1, -1]) b.add(b.cyl(0.02, 0.02, 0.32, 8), B, 'metal', [s * 0.2, -0.38, 0.36], [0.7, 0, 0]);
  // R0: chipped pod (black patch plate bolted on)
  if (rk === 0) b.add(b.cbox(0.2, 0.12, 0.05, 0.01), B, 'metal', [0.3, -0.2, 0.36], [0.3, 0.6, 0.2]);
}

function rack(b, o, bone, s) {
  const rk = o.rank, far = o.far;
  const big = rk >= 4, H = big ? 0.98 : 0.78, W = 0.26, D = 0.36, rows = big ? 5 : 4, cols = big ? 3 : 2;
  const x0 = s * 0.06, y0 = 0.4 * H / 0.78;
  // body + gold frame posts and caps
  b.add(b.cbox(W, H, D, 0.025), bone, 'accent', [x0, y0, 0]);
  for (const [px, pz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) b.add(b.cbox(0.04, H + 0.04, 0.04, 0.01), bone, 'metal', [x0 + px * W / 2, y0, pz * D / 2]);
  b.add(b.cbox(W + 0.08, 0.06, D + 0.08, 0.015), bone, 'paint', [x0, y0 + H / 2 + 0.02, 0]);
  b.add(b.cbox(W + 0.06, 0.05, D + 0.06, 0.015), bone, 'metal', [x0, y0 - H / 2 - 0.01, 0]);
  // hazard band (velvet-red / gold) round the base
  if (rk >= 1 && !far) for (let i = 0; i < 6; i++) b.add(b.cbox(0.05, 0.05, D + 0.01, 0.006), bone, i % 2 ? 'trim' : 'paint', [x0 - W / 2 + 0.025 + i * (W - 0.05) / 5, y0 - H / 2 + 0.07, 0], [0, 0, 0.5]);
  // honeycomb cells on the front face (+z): rim, glowing well, parked drone's eye
  const cell = (pos, rot, i) => {
    if (rk === 0 && i % 3 === 1) { b.add(b.cyl(0.05, 0.05, 0.03, 6), bone, 'metal', pos, rot); return; }
    b.add(b.cyl(0.058, 0.058, 0.03, 6), bone, 'metal', pos, rot);
    b.add(b.cyl(0.044, 0.044, 0.034, 6), bone, rk >= 3 ? 'glow' : 'accent', pos, rot);
    if (!far) {
      const n = new THREE.Vector3(0, 1, 0).applyEuler(new THREE.Euler(...rot));
      drone(b, bone, [pos[0] + n.x * 0.012, pos[1] + n.y * 0.012, pos[2] + n.z * 0.012], [rot[0] - PI / 2, rot[1], rot[2]], 0.8, true);
    }
  };
  let k = 0;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const cx = x0 + (c - (cols - 1) / 2) * 0.11 + (r % 2 ? 0.03 : -0.03) * (cols > 2 ? 0.6 : 1), cy = y0 + H / 2 - 0.12 - r * (H - 0.2) / (rows - 1);
    cell([cx, cy, D / 2 + 0.005], [PI / 2, 0, 0], k++);
  }
  // outer side cells (R2+)
  if (rk >= 2) for (let r = 0; r < rows - 1; r++) for (let c = 0; c < 2; c++) {
    const cz = (c - 0.5) * 0.15 + (r % 2 ? 0.035 : -0.035), cy = y0 + H / 2 - 0.18 - r * (H - 0.26) / (rows - 2);
    cell([x0 + s * (W / 2 + 0.005), cy, cz], [0, 0, -s * PI / 2], k++);
  }
  // R0: a missing door panel hanging off the back
  if (rk === 0) b.add(b.cbox(0.02, H * 0.5, D * 0.8, 0.005), bone, 'metal', [x0 - s * W / 2, y0 - H * 0.1, -0.05], [0.2, 0, s * 0.3]);
  // roof: exhaust pipe + (R4) antenna with a red tip
  b.add(b.cyl(0.03, 0.035, 0.18, 10), bone, 'metal', [x0 + s * 0.05, y0 + H / 2 + 0.12, -0.1]);
  b.add(b.cyl(0.02, 0.02, 0.01, 8), bone, 'glow', [x0 + s * 0.05, y0 + H / 2 + 0.21, -0.1]);
  if (big) { b.add(b.cyl(0.006, 0.006, 0.3, 5), bone, 'metal', [x0 - s * 0.08, y0 + H / 2 + 0.17, 0.1]); b.add(b.sph(6, 4), bone, 'eye', [x0 - s * 0.08, y0 + H / 2 + 0.32, 0.1], [0, 0, 0], 0.018); }
  // hinge drum toward the throne
  b.add(b.cyl(0.05, 0.05, 0.12, 12), bone, 'paint', [x0 - s * (W / 2 + 0.02), y0 - H * 0.3, -0.08]);
}

// ---------- the boss ----------
function body(b, o) {
  const rk = o.rank, far = o.far;
  // belly + chest: black suit armour, gold vest plate, red cravat, fat gold chain
  b.add(b.sph(20, 14), 'spine', 'accent', [0, 0.06, 0.03], [0, 0, 0], [0.27, 0.22, 0.25]);
  b.add(b.sph(20, 14), 'chest', 'accent', [0, 0.06, 0.0], [0, 0, 0], [0.3, 0.24, 0.24]);
  P(b, 'chest', 'paint', [0.26, 0.24, 0.06], [0, 0.0, 0.2], [0.15, 0, 0], { c: 0.02, tx: 1.15, bx: 0.8 });
  for (let i = 0; i < 3; i++) b.add(b.sph(6, 4), 'chest', 'accent', [0, 0.07 - i * 0.07, 0.235 - i * 0.008], [0, 0, 0], 0.016);
  b.add(fin(b, [[-0.05, 0], [0.05, 0], [0.02, -0.12], [0, -0.14], [-0.02, -0.12]], 0.04, 0.008), 'chest', 'trim', [0, 0.17, 0.2], [0.2, 0, 0]);
  b.add(b.cbox(0.08, 0.04, 0.04, 0.01), 'chest', 'trim', [0, 0.18, 0.21]);
  b.add(b.tor(0.2, 0.014, 32, 5), 'chest', 'paint', [0, 0.12, 0.06], [1.2, 0, 0]);
  b.add(b.tor(0.16, 0.012, 32, 5), 'chest', 'paint', [0, 0.08, 0.1], [1.3, 0, 0]);
  b.add(b.cyl(0.05, 0.05, 0.02, 16), 'chest', 'paint', [0, -0.08, 0.24], [PI / 2 - 0.3, 0, 0]);
  b.add(b.cyl(0.025, 0.025, 0.025, 12), 'chest', 'glow', [0, -0.08, 0.25], [PI / 2 - 0.3, 0, 0]);
  // lapels / collar: black with spiked rogue collar
  PS(b, 'chest', 'accent', [0.1, 0.2, 0.05], [0.13, 0.08, 0.17], [0.2, 0.4, 0.2], { c: 0.015 });
  if (!far) for (let i = 0; i < 7; i++) { const a = PI * 0.15 + i * PI * 0.7 / 6; b.add(fin(b, [[-0.02, 0], [0.02, 0], [0, 0.08]], 0.02, 0.005), 'chest', 'accent', [Math.cos(a) * 0.18, 0.2, -Math.sin(a) * 0.1 + 0.02], [-0.5, 0, a - PI / 2]); }
  // shoulders: gold epaulettes with fringe (R2+), black pauldrons
  for (const s of [1, -1]) {
    b.add(b.sph(14, 10), 'chest', 'accent', [s * 0.27, 0.15, 0], [0, 0, 0], [0.13, 0.11, 0.13]);
  }
  if (rk >= 2) for (const s of [1, -1]) {
    b.add(b.cyl(0.12, 0.13, 0.04, 20), 'clav' + (s > 0 ? 'L' : 'R'), 'paint', [s * 0.2, 0.06, 0], [0, 0, -s * 0.25]);
    if (!far) for (let i = 0; i < 9; i++) { const a = i / 9 * PI * 2; b.add(b.cyl(0.008, 0.008, 0.07, 4), 'clav' + (s > 0 ? 'L' : 'R'), 'paint', [s * 0.2 + Math.cos(a) * 0.12, 0.0, Math.sin(a) * 0.12]); }
  }
  // pelvis / hips: black seat-shell
  b.add(b.sph(16, 12), 'pelvis', 'accent', [0, 0.12, 0.02], [0, 0, 0], [0.26, 0.12, 0.22]);
  b.add(b.cbox(0.4, 0.05, 0.2, 0.015), 'pelvis', 'paint', [0, 0.17, 0.12]);
}

function head(b, o) {
  const rk = o.rank, far = o.far, H = 'head';
  b.add(b.cyl(0.07, 0.08, 0.12, 12), 'neck', 'metal', [0, 0.08, 0]);
  // boxy head, heavy gold jaw with grille teeth
  b.add(b.cbox(0.22, 0.18, 0.21, 0.04), H, 'accent', [0, 0.1, 0.01]);
  b.add(b.cbox(0.24, 0.09, 0.2, 0.03), H, 'paint', [0, 0.0, 0.04]);
  if (!far) for (let i = 0; i < 6; i++) b.add(b.cbox(0.022, 0.03, 0.02, 0.004), H, 'paint', [-0.0625 + i * 0.025, 0.04, 0.14]);
  b.add(b.cbox(0.17, 0.008, 0.02, 0.003), H, 'metal', [0, 0.025, 0.142]);
  // eyes: a narrow slit (R) and a gold-rimmed monocle (L) with a chain
  b.add(b.cbox(0.07, 0.022, 0.02, 0.006), H, 'eye', [-0.05, 0.12, 0.115]);
  b.add(b.tor(0.035, 0.008, 16, 4), H, 'paint', [0.05, 0.12, 0.12]);
  b.add(b.cyl(0.03, 0.03, 0.012, 14), H, 'eye', [0.05, 0.12, 0.118], [PI / 2, 0, 0]);
  if (!far) b.add(b.tube([[0.08, 0.1, 0.12], [0.11, 0.02, 0.11], [0.1, -0.03, 0.08]], 0.004, 8, 3), H, 'paint');
  // cigar with a glowing tip
  b.add(b.cyl(0.013, 0.013, 0.13, 8), H, 'trim', [-0.06, 0.035, 0.19], [PI / 2 - 0.2, 0.3, 0]);
  b.add(b.cyl(0.0135, 0.0135, 0.02, 8), H, 'glow', [-0.08, 0.05, 0.25], [PI / 2 - 0.2, 0.3, 0]);
  // fedora: wide brim, black crown, red band + gold band; R5 a small gold crown on top
  b.add(b.cyl(0.21, 0.22, 0.018, 28), H, 'accent', [0, 0.2, 0.0], [-0.08, 0, 0]);
  b.add(b.cyl(0.12, 0.135, 0.15, 20), H, 'accent', [0, 0.28, -0.005], [-0.08, 0, 0]);
  b.add(b.cyl(0.137, 0.137, 0.03, 20), H, 'trim', [0, 0.225, -0.002], [-0.08, 0, 0]);
  b.add(b.cyl(0.139, 0.139, 0.008, 20), H, 'paint', [0, 0.243, -0.004], [-0.08, 0, 0]);
  b.add(b.cbox(0.16, 0.025, 0.2, 0.01), H, 'accent', [0, 0.36, -0.01], [-0.08, 0, 0]);
  if (rk >= 5) {
    for (let i = 0; i < 5; i++) { const a = i / 5 * PI * 2; b.add(fin(b, [[-0.025, 0], [0.025, 0], [0, 0.08]], 0.015, 0.004), H, 'paint', [Math.cos(a) * 0.08, 0.38, Math.sin(a) * 0.08 - 0.01], [0, -a + PI / 2, 0]); }
    b.add(b.tor(0.085, 0.012, 20, 4), H, 'paint', [0, 0.385, -0.01], [PI / 2, 0, 0]);
  }
}

function limbs(b, o) {
  const D = b.rig.D, ua = D.upArm, fa = D.foreArm, far = o.far;
  // arms: black sleeves, gold cuffs, big gold-ringed hands
  b.sym(b.sph(12, 8), 'upArm', 'metal', [0, 0, 0], [0, 0, 0], 0.08);
  b.sym(shell(b, -0.02, -ua, [0.09, 0.095, 0.08], 10), 'upArm', 'accent');
  b.sym(b.sph(10, 8), 'foreArm', 'metal', [0, 0, 0], [0, 0, 0], 0.065);
  b.sym(shell(b, -0.02, -fa + 0.04, [0.075, 0.085, 0.08], 10), 'foreArm', 'accent');
  b.sym(b.cyl(0.09, 0.09, 0.05, 16), 'foreArm', 'paint', [0, -fa + 0.04, 0]);
  b.sym(b.cbox(0.1, 0.1, 0.11, 0.03), 'hand', 'metal', [0, -0.05, 0.01]);
  if (!far) for (let i = 0; i < 4; i++) b.sym(b.cbox(0.022, 0.07, 0.025, 0.008), 'hand', 'metal', [-0.035 + i * 0.023, -0.12, 0.03], [0.4, 0, 0]);
  b.sym(b.tor(0.016, 0.006, 10, 3), 'hand', 'paint', [-0.012, -0.12, 0.035], [PI / 2, 0, 0]);
  b.sym(b.tor(0.016, 0.006, 10, 3), 'hand', 'paint', [0.035, -0.12, 0.035], [PI / 2, 0, 0]);
  b.sym(b.cyl(0.012, 0.012, 0.01, 8), 'hand', 'glow', [0.035, -0.12, 0.054], [PI / 2, 0, 0]);
  // legs (seated): black trousers, gold knee caps, gold-toed shoes
  b.sym(b.sph(12, 8), 'thigh', 'metal', [0, 0, 0], [0, 0, 0], 0.08);
  b.sym(shell(b, -0.03, -D.thigh, [0.1, 0.11, 0.09], 10), 'thigh', 'accent');
  b.sym(b.sph(10, 8), 'shin', 'paint', [0, 0, 0.02], [0, 0, 0], [0.075, 0.075, 0.07]);
  b.sym(shell(b, -0.03, -D.shin + 0.04, [0.075, 0.08, 0.07], 10), 'shin', 'accent');
  b.sym(b.cbox(0.11, 0.07, 0.24, 0.025), 'foot', 'accent', [0, -0.04, 0.06]);
  b.sym(b.cbox(0.112, 0.03, 0.08, 0.01), 'foot', 'paint', [0, -0.03, 0.16]);
}

function drones(b, o) {
  // bodyguard drones round the throne on the aux1 ring: 3 hover at R3-R4, 6 orbit at R5
  const rk = o.rank;
  if (rk < 3) return;
  const n = rk >= 5 ? 6 : 3, R = 0.95;
  for (let i = 0; i < n; i++) {
    const a = (n === 3 ? [0.6, PI / 2, PI - 0.6][i] : i / n * PI * 2);
    miniDrone(b, 'aux1', [Math.cos(a) * R, (i % 2) * 0.12 + 0.1, Math.sin(a) * R], -a + PI / 2, o.far);
  }
}

function build(b, o) {
  throne(b, o);
  rack(b, o, 'aux2', 1);
  rack(b, o, 'aux3', -1);
  b.scope([0, 0, 0], [0, 0, 0], 1.18, () => { body(b, o); head(b, o); });
  b.scope([0, 0, 0], [0, 0, 0], 1.12, () => limbs(b, o));
  drones(b, o);
}

// ---------- anims ----------
// seated base: recline, arms on the armrests, legs forward + down
function seat(P, ctx, t, k = 1) {
  const st = ctx.st, b = Math.sin(t * 1.5);
  L.pel(P, 0, b * 0.035 * k, 0);
  L.R(P, 'pelvis', 0.02 * Math.sin(t * 0.8) * k, 0, 0.015 * Math.sin(t * 0.6) * k);
  L.R(P, 'spine', -0.16 + 0.015 * Math.sin(t * 1.1), 0, 0);
  L.R(P, 'chest', -0.06 + 0.02 * Math.sin(t * 1.1 + 0.4), 0, 0);
  L.R(P, 'neck', 0.12 + st.gp * 0.3, st.gy * 0.4, 0);
  L.R(P, 'head', 0.04 + st.gp * 0.4, st.gy * 0.5, st.tilt);
  for (const s of SIDES) {
    L.RS(P, 'clav', s, 0, 0, 0);
    L.RS(P, 'upArm', s, 0.05, 0.1, 0.32);
    L.RS(P, 'foreArm', s, -1.45, 0, 0);
    L.RS(P, 'hand', s, 0.1, 0, -0.1);
    L.RS(P, 'thigh', s, -1.5, 0, 0.12);
    L.RS(P, 'shin', s, 1.42, 0, -0.1);
    L.RS(P, 'foot', s, 0.1, 0, 0);
  }
}
const anims = {
  idle(P, t, ctx) {
    seat(P, ctx, t);
    // finger drumming on the right armrest; every ~8 s a puff on the cigar (head tilts back)
    L.A(P, 'handR', 0.25 * Math.max(0, Math.sin(t * 9)) * (Math.sin(t * 0.7) > 0.3 ? 1 : 0), 0, 0);
    const c = t % 8.1, puff = L.kf(c, [[0, 0], [5.4, 0], [5.8, 1], [6.8, 1], [7.3, 0]]);
    L.A(P, 'neck', -0.15 * puff, 0, 0); L.A(P, 'head', -0.2 * puff, 0, 0.1 * puff); L.A(P, 'chest', -0.06 * puff, 0, 0);
  },
  advance(P, t, ctx) {
    seat(P, ctx, t);
    L.A(P, 'pelvis', 0.16, 0, 0); L.A(P, 'spine', 0.06, 0, 0);
  },
  // DRONE STING (the mage basic in battle): points two fingers at the target, a drone leaves the right rack (fire 0.42)
  cast(P, u, ctx) {
    seat(P, ctx, ctx.t);
    const k = L.kf(u, [[0, 0], [0.3, 1], [0.7, 1], [1, 0]]), jab = L.kf(u, [[0, 0], [0.36, 0], [0.42, 1], [0.6, 0.3], [1, 0]]);
    L.RS(P, 'upArm', 'R', L.lerp(0.05, -1.25, k) - 0.15 * jab, L.lerp(0.1, -0.1, k), L.lerp(0.32, 0.2, k));
    L.RS(P, 'foreArm', 'R', L.lerp(-1.45, -0.25, k), 0, 0);
    L.RS(P, 'hand', 'R', L.lerp(0.1, -0.3, k) - 0.3 * jab, 0, 0);
    L.A(P, 'chest', 0.08 * k, -0.15 * k, 0); L.A(P, 'head', -0.05 * k, 0.15 * k, 0.1 * k);
  },
  // both hands wave the drones on: right rack 0.35, left rack 0.5
  attack(P, u, ctx) {
    seat(P, ctx, ctx.t);
    const k = L.kf(u, [[0, 0], [0.25, 1], [0.7, 1], [1, 0]]), w = Math.sin(u * PI * 3) * k;
    for (const s of SIDES) {
      L.RS(P, 'upArm', s, L.lerp(0.05, -0.9, k), 0, L.lerp(0.32, 0.6, k) + 0.15 * w);
      L.RS(P, 'foreArm', s, L.lerp(-1.45, -0.6, k) + 0.25 * w, 0, 0);
    }
    L.A(P, 'chest', 0.05 * k, 0, 0);
  },
  // snaps his fingers three times; one drone per snap (0.3, 0.5, 0.7)
  attack_alt(P, u, ctx) {
    seat(P, ctx, ctx.t);
    const k = L.kf(u, [[0, 0], [0.2, 1], [0.85, 1], [1, 0]]), snap = Math.max(0, Math.sin((u - 0.2) * PI * 5)) * (u > 0.2 && u < 0.8 ? 1 : 0);
    L.RS(P, 'upArm', 'R', L.lerp(0.05, -0.5, k), 0, L.lerp(0.32, 0.9, k));
    L.RS(P, 'foreArm', 'R', L.lerp(-1.45, -1.9, k), 0, 0);
    L.RS(P, 'hand', 'R', -0.4 * snap, 0, 0);
    L.A(P, 'head', -0.08 * k, -0.2 * k, 0);
  },
  // SWARM CONTRACT: leans out of the throne, arms flung wide, racks swing open (post), drones pour out (fires 0.2..0.62)
  overdrive(P, u, ctx) {
    ctx.odU = u;
    seat(P, ctx, ctx.t, 0.5);
    const k = L.kf(u, [[0, 0], [0.14, 1], [0.8, 1], [1, 0]]), lift = L.kf(u, [[0, 0], [0.14, 1], [0.75, 1], [0.95, 0]]);
    P[L.PX + 1] += 0.25 * lift;
    L.A(P, 'pelvis', -0.08 * k, 0, 0);
    L.A(P, 'spine', 0.3 * k, 0, 0); L.A(P, 'chest', 0.05 * k, 0, 0); L.A(P, 'neck', -0.2 * k, 0, 0); L.A(P, 'head', -0.25 * k, 0, 0);
    for (const s of SIDES) {
      L.RS(P, 'upArm', s, L.lerp(0.05, -0.7, k), L.lerp(0.1, 0.2, k), L.lerp(0.32, 1.35, k));
      L.RS(P, 'foreArm', s, L.lerp(-1.45, -0.25, k), 0, 0);
      L.RS(P, 'hand', s, 0, 0, 0.4 * k);
    }
  },
  hit(P, u, ctx) {
    seat(P, ctx, ctx.t);
    const k = L.kf(u, [[0, 0], [0.12, 1], [1, 0]]), d = ctx.st.hitDir;
    L.A(P, 'pelvis', -0.2 * k, 0.08 * k * d, 0.12 * k * d); P[L.PX + 2] -= 0.1 * k;
    L.A(P, 'chest', -0.15 * k, 0, 0); L.A(P, 'head', -0.3 * k, 0, 0.25 * k * d);
    for (const s of SIDES) L.AS(P, 'upArm', s, -0.3 * k, 0, 0.2 * k);
  },
  // the pod loses lift, lurches, drops to the floor and lists; he slumps over the armrest (down 0.6)
  die(P, u, ctx) {
    ctx.dieU = u;
    seat(P, ctx, ctx.t * (1 - u), 1 - u);
    const fall = L.kf(u, [[0, 0], [0.15, 0.1], [0.55, 1], [0.62, 0.9], [0.7, 1], [1, 1]]), k = L.smooth(u);
    P[L.PX + 1] += 0.08 * L.kf(u, [[0, 0], [0.15, 1], [0.3, 0]]) + (0.5 - ctx.D.pelvisY) * fall;
    L.A(P, 'pelvis', 0.15 * fall, 0.2 * k, 0.32 * L.kf(u, [[0, 0], [0.5, 0], [0.7, 1], [1, 1]]));
    L.A(P, 'spine', 0.25 * k, 0, -0.3 * k); L.A(P, 'chest', 0.15 * k, 0, 0);
    L.A(P, 'neck', 0.4 * k, 0, 0); L.A(P, 'head', 0.3 * k, 0, -0.4 * k);
    for (const s of SIDES) { L.AS(P, 'upArm', s, 0.3 * k, 0, 0.3 * k); L.AS(P, 'foreArm', s, 1.1 * k, 0, 0); }
  },
  // victory: leans back laughing (shoulders shake), arms spread on the backrest, drones whirl (post)
  victory(P, t, ctx) {
    seat(P, ctx, t);
    const k = L.smooth(Math.min(1, t / 0.6)), laugh = Math.sin(t * 16) * 0.5 + 0.5;
    L.A(P, 'spine', -0.1 * k, 0, 0); L.A(P, 'chest', -0.08 * k + 0.03 * laugh * k, 0, 0);
    L.A(P, 'neck', -0.25 * k, 0, 0); L.A(P, 'head', -0.2 * k - 0.05 * laugh * k, 0, 0);
    for (const s of SIDES) { L.RS(P, 'upArm', s, L.lerp(0.05, 0.25, k), L.lerp(0.1, 0.4, k), L.lerp(0.32, 1.25, k) + 0.04 * laugh * k); L.RS(P, 'foreArm', s, L.lerp(-1.45, -0.9, k), 0, 0); }
  },
  // drops in with the racks folded, thrusters catch it (land 0.42), racks unfold, adjusts his hat (ready 0.85)
  deploy(P, u, ctx) {
    ctx.depU = u;
    seat(P, ctx, ctx.t);
    const sq = L.kf(u, [[0, 0], [0.4, 0], [0.45, 1], [0.6, 0], [1, 0]]), hat = L.kf(u, [[0, 0], [0.62, 0], [0.75, 1], [0.88, 1], [1, 0]]);
    P[L.PX + 1] -= 0.12 * sq;
    L.RS(P, 'upArm', 'R', L.lerp(0.05, -2.3, hat), 0, L.lerp(0.32, 0.4, hat));
    L.RS(P, 'foreArm', 'R', L.lerp(-1.45, -1.7, hat), 0, 0);
    L.A(P, 'head', 0.1 * hat, 0, 0);
  },
};

export default {
  id: 'kingpin', name: 'KINGPIN', role: 'mage', faction: 'rogue', rarity: 'legendary', realm: 'scifi',
  rig: 'hover', dims: DIMS, height: 2.0, radius: 0.85, walkSpeed: 0.9, scheme: 'dark',
  style: { weapon: 'orbs' },
  motes: { color: 0xffb04a, size: 0.12 },
  paint: {
    rogue: { paint: 0xc8902a, accent: 0x131015, trim: 0x8c1219 },
    corporate: { paint: 0xd9a032, accent: 0x10151f, trim: 0x1d3f8a },
    experimental: { paint: 0xd9a032, accent: 0x130f1a, trim: 0x5a1f9a },
    legendary: { paint: 0xc8902a, accent: 0x17151a, trim: 0x8c1219 },
  },
  mats: {
    all: {
      paint: { metal: 0.85, rough: 0.3, coat: 0.6, env: 0.9, emissive: 0x100800, ei: 1 },
      glow: { ei: 3.2 },
      accent: { metal: 0.45, rough: 0.2, coat: 1, env: 0.7, panel: { seam: 0.25 } },
    },
    rogue: { trim: { ...VELVET, color: 0x8c1219 } }, legendary: { trim: { ...VELVET, color: 0x8c1219 } },
    corporate: { trim: { ...VELVET, color: 0x1d3f8a } }, experimental: { trim: { ...VELVET, color: 0x5a1f9a } },
  },
  sockets: { muzzle: ['aux3', [-0.12, 0.62, 0.24]], muzzleL: ['aux2', [0.12, 0.62, 0.24]], core: [0, 0.05, 0.2], head: [0, 0.15, 0.08],
    rackL: ['aux2', [0.12, 0.45, 0.2]], rackR: ['aux3', [-0.12, 0.45, 0.2]], hand: ['handR', [0, -0.12, 0.03]] },
  events: {
    cast: [['fire', 0.42]], attack: [['fire', 0.35], ['fire', 0.5]], attack_alt: [['fire', 0.3], ['fire', 0.5], ['fire', 0.7]],
    overdrive: [['cast', 0.05], ...Array.from({ length: 10 }, (_, i) => ['fire', 0.2 + i * 0.045])], die: [['down', 0.58]], deploy: [['land', 0.42], ['ready', 0.85]],
  },
  durs: { cast: 1.0, attack: 1.1, attack_alt: 1.3, overdrive: 2.6, hit: 0.5, die: 1.9, deploy: 1.7 },
  anims,
  post(P, ctx, act) {
    const t = ctx.t, n = act?.name;
    // racks: swing open in the overdrive (and fall open on death), shudder in attack_alt, fold on deploy
    let open = 0;
    if (n === 'overdrive') open = L.kf(ctx.odU || 0, [[0, 0], [0.12, 1], [0.8, 1], [0.95, 0]]);
    else if (n === 'die') open = 0.6 * L.kf(ctx.dieU || 0, [[0, 0], [0.55, 0], [0.7, 1], [1, 1]]);
    else if (n === 'deploy') open = -0.6 * L.kf(ctx.depU || 0, [[0, 1], [0.45, 1], [0.7, 0], [1, 0]]);
    const sh = n === 'attack_alt' || n === 'hit' ? 0.03 * Math.sin(t * 50) : 0;
    const i2 = BI.aux2 * 3, i3 = BI.aux3 * 3;
    P[i2] = -0.2 * open + sh; P[i2 + 1] = 0.9 * open; P[i2 + 2] = -0.45 * open;
    P[i3] = -0.2 * open - sh; P[i3 + 1] = -0.9 * open; P[i3 + 2] = 0.45 * open;
    // drone ring: hovers (R3-4 bob), orbits (R5); whirls in the overdrive / victory
    const i1 = BI.aux1 * 3;
    const fast = n === 'overdrive' ? 5 : n === 'victory' || ctx.vic ? 2.5 : 1;
    ctx.ringA = (ctx.ringA || 0) + Math.max(0, t - (ctx._lt ?? t)) * (ctx.orbit ? 0.9 : 0.12) * fast;
    ctx._lt = t;
    P[i1] = 0.04 * Math.sin(t * 1.3); P[i1 + 1] = ctx.orbit ? ctx.ringA : 0.25 * Math.sin(ctx.ringA * 4); P[i1 + 2] = 0.03 * Math.cos(t * 1.1);
  },
  tick(unit, dt, ctx, bones) {
    ctx.orbit = unit.rank >= 5;
    const a = unit.state.action;
    if (a !== 'overdrive') ctx.odU = 0;
    if (a !== 'die') ctx.dieU = unit.state.dead ? 1 : 0;
    if (a !== 'deploy') ctx.depU = 1;
    // drone ring bobs up and down; drops to the floor on death
    const ring = bones[BI.aux1];
    if (!ctx.ringY) ctx.ringY = ring.position.y;
    const dead = a === 'die' || unit.state.dead;
    ctx.ringDrop = (ctx.ringDrop || 0) + ((dead ? 1 : 0) - (ctx.ringDrop || 0)) * (1 - Math.exp(-dt * 3));
    ring.position.y = ctx.ringY + 0.05 * Math.sin(ctx.t * 2.2) - 1.0 * ctx.ringDrop;
  },
  fxHints: { projectile: 'drone', impact: 'sting', overdrive: 'swarm', color: 0xff7a1a },
  build,
};
