// SCRAPPER, rogue pit brawler (STARTER). Brief: docs/ROSTER.md `scrapper`; look: refs/ref_battle_02.png enemy front (red brawler).
// Ape-like: huge forearms + piston fists hanging to the knees, small bucket head sunk low between the shoulders,
// barrel chest and hump, two smoking exhaust stacks on the back. Red + rust, black joints, orange eyes, chipped white numbers.
// Rank tiers: R0-1 mismatched plates (rust left pec, rust shoulder), LEFT ARM BARE (exposed frame + cables)
//   · R2 matched red plating + knuckle spikes · R3 glowing orange piston cores, idle flames from the stacks
//   (beyond the brief: R4 chain sash + knuckle-duster plates · R5 third stack + spiked helm ridge).
// Rarity (o.r): rare+ extra hump plates · epic+ forearm vents + thigh plates · legendary gold roll-cage over the head.
// Technique: fist pistons extend by moving the hand bones in tick(); stack flames sit on aux2/aux3 (re-parented to aux0)
// and are scaled per frame (idle flicker at R3, a big belch on overdrive at every rank).
import { THREE, P, PS, plate, fin, discX, deform, legs, LIB, kf, PI, BI } from '../kit.js';

const DIMS = {
  thigh: 0.36, shin: 0.36, ankle: 0.12, hipX: 0.2, hipY: -0.06, spine: 0.16, chest: 0.3, neck: 0.3, headOff: 0.02,
  clavX: 0.12, clavY: 0.26, shoulder: 0.33, upArm: 0.42, foreArm: 0.42,
  aux0: [0, 0.24, -0.34],
  parents: { aux2: 'aux0', aux3: 'aux0' },
};
// stack tops (relative to aux0), flames anchor there
const STACK = [[0.15, 0.42, -0.1], [-0.15, 0.42, -0.1]];
const STACK3 = [0, 0.48, -0.16];
DIMS.aux2 = STACK[0];
DIMS.aux3 = STACK[1];
const HUNCH = { spine: 0.2, chest: 0.16, neck: 0.55, head: -0.8 };
const SIDES = ['L', 'R'];

// one-sided parts (the bare arm): `put` mirrors positions/rotations onto the right side
function side(b, s, fn) {
  const put = (g, bone, slot, p = [0, 0, 0], r = [0, 0, 0], sc) => s === 'L'
    ? b.add(g, bone + 'L', slot, p, r, sc) : b.add(g, bone + 'R', slot, [-p[0], p[1], p[2]], [r[0], -r[1], -r[2]], sc);
  fn(put);
}
const SEG = { 0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg', 5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg' };
function stencil(b, bone, slot, text, pos, rot3, h = 0.07, chip = 0) {
  const w = h * 0.55, t = h * 0.16, gap = w * 1.45;
  b.scope(pos, rot3, 1, () => {
    [...text].forEach((ch, i) => {
      const cx = (i - (text.length - 1) / 2) * gap;
      for (const s of SEG[ch] || '') {
        if (chip && ((ch.charCodeAt(0) * 7 + s.charCodeAt(0) * 3 + i) % chip) === 0) continue;
        const hz = s === 'a' || s === 'd' || s === 'g';
        const x = cx + (s === 'b' || s === 'c' ? w / 2 : s === 'e' || s === 'f' ? -w / 2 : 0);
        const y = s === 'a' ? h / 2 : s === 'd' ? -h / 2 : s === 'g' ? 0 : s === 'b' || s === 'f' ? h / 4 : -h / 4;
        b.add(hz ? b.box(w * 0.8, t, 0.006) : b.box(t, h * 0.42, 0.006), bone, slot, [x, y, 0]);
      }
    });
  });
}
function rivets(b, bone, pts, rx = PI / 2) { if (!b.far) for (const p of pts) b.add(b.cyl(0.012, 0.012, 0.02, 6), bone, 'metal', p, [rx, 0, 0]); }
function chips(b, bone, list) { if (b.far) return; for (const [p, r, s] of list) b.add(b.box(s[0], s[1], s[2]), bone, 'metal', p, r); }

function head(b, o) {
  const y = 0.04, z = 0.13;
  // small dented bucket head
  b.add(plate(b, 0.22, 0.17, 0.22, { c: 0.035, tx: 0.86, tz: 0.85 }), 'head', 'paint', [0, y + 0.03, z - 0.02]);
  P(b, 'head', 'accent', [0.25, 0.05, 0.18], [0, y + 0.1, z + 0.02], [0.12, 0, 0], { c: 0.015, tx: 0.8 });
  // recessed face: black plate, orange eyes in sockets, jaw grille
  b.add(b.cbox(0.18, 0.13, 0.05, 0.015), 'head', 'metal', [0, y + 0.01, z + 0.09]);
  for (const x of [0.045, -0.045]) {
    b.add(b.cyl(0.032, 0.032, 0.02, 12), 'head', 'accent', [x, y + 0.04, z + 0.112], [PI / 2, 0, 0]);
    b.add(b.cyl(0.022, 0.022, 0.03, 12), 'head', 'eye', [x, y + 0.04, z + 0.117], [PI / 2, 0, 0]);
  }
  for (let i = 0; i < 4; i++) b.add(b.box(0.016, 0.06, 0.02), 'head', 'trim', [-0.045 + i * 0.03, y - 0.03, z + 0.118]);
  P(b, 'head', 'paint', [0.2, 0.05, 0.1], [0, y - 0.07, z + 0.07], [-0.3, 0, 0], { c: 0.015, bx: 0.8 });
  b.sym(discX(b, 0.04, 0.04, 10), 'head', 'metal', [0.12, y + 0.02, z - 0.02]);
  chips(b, 'head', [[[0.07, y + 0.11, z + 0.1], [0.2, 0, 0.4], [0.035, 0.012, 0.02]], [[-0.1, y + 0.09, z + 0.03], [0, 0, 0.6], [0.012, 0.04, 0.05]]]);
  if (o.rank >= 5) b.add(fin(b, [[-0.09, 0], [0.09, 0], [0.04, 0.05], [0, 0.11], [-0.04, 0.05]], 0.03, 0.006), 'head', 'accent', [0, y + 0.13, z - 0.02], [PI / 2 + 0.3, 0, 0]);
  if (o.r >= 3) {
    // legendary roll cage over the head (gold trim)
    for (const s of [1, -1]) b.add(b.tor(0.17, 0.014, 16, 5, PI), 'chest', 'trim', [0, 0.44, 0.06 * s - 0.02], [0, 0, 0]);
    b.add(b.cyl(0.014, 0.014, 0.14, 6), 'chest', 'trim', [0, 0.61, 0.0], [PI / 2, 0, 0]);
  }
}

function torso(b, o) {
  const far = b.far, matched = o.rank >= 2;
  // frame + barrel chest
  P(b, 'chest', 'metal', [0.6, 0.5, 0.46], [0, 0.15, -0.04], [0, 0, 0], { c: 0.05 });
  P(b, 'chest', 'paint', [0.82, 0.48, 0.54], [0, 0.2, 0.03], [0.12, 0, 0], { c: 0.08, tx: 1.15, bx: 0.7, tz: 1.0, bz: 0.8 });
  // pecs: left a rusty replacement at R0-1
  b.add(plate(b, 0.3, 0.24, 0.08, { c: 0.035, tx: 1.1, bx: 0.8 }), 'chest', matched ? 'paint' : 'accent', [0.17, 0.25, 0.3], [0.3, 0.25, 0.06]);
  b.add(plate(b, 0.3, 0.24, 0.08, { c: 0.035, tx: 1.1, bx: 0.8 }), 'chest', 'paint', [-0.17, 0.25, 0.3], [0.3, -0.25, -0.06]);
  if (!matched) rivets(b, 'chest', [[0.06, 0.33, 0.33], [0.28, 0.33, 0.29], [0.07, 0.16, 0.36], [0.27, 0.16, 0.32]], PI / 2 + 0.3);
  stencil(b, 'chest', 'trim', '13', [-0.17, 0.25, 0.345], [0.3, -0.25, -0.06], 0.11, 4);
  // belly: black ribbed core with an orange heat slot
  b.add(b.cyl(0.24, 0.28, 0.22, 10), 'spine', 'metal', [0, 0.07, 0]);
  for (let i = 0; i < 3; i++) b.add(b.cbox(0.32 - i * 0.03, 0.035, 0.08, 0.01), 'spine', 'accent', [0, 0.14 - i * 0.055, 0.22 - i * 0.01], [0.1, 0, 0]);
  b.add(b.cbox(0.16, 0.025, 0.02, 0.006), 'chest', 'glow', [0, 0.02, 0.29], [0.25, 0, 0]);
  // hump: stacked plates rising behind the head = ape silhouette
  P(b, 'chest', 'paint', [0.7, 0.26, 0.4], [0, 0.48, -0.12], [-0.4, 0, 0], { c: 0.06, tx: 0.8, tz: 0.85 });
  P(b, 'chest', 'paint', [0.52, 0.1, 0.3], [0, 0.6, -0.2], [-0.4, 0, 0], { c: 0.03, tx: 0.8 });
  b.add(b.box(0.5, 0.02, 0.03), 'chest', 'trim', [0, 0.645, -0.08], [-0.4, 0, 0]);
  if (o.r >= 1) PS(b, 'chest', 'paint', [0.2, 0.14, 0.3], [0.26, 0.5, -0.06], [-0.3, 0, -0.35], { c: 0.03, tx: 0.75 });
  if (!far) {
    for (let i = 0; i < 7; i++) b.add(b.cyl(0.014, 0.014, 0.02, 6), 'chest', 'metal', [-0.27 + i * 0.09, 0.59, -0.03 - Math.abs(i - 3) * 0.004], [-0.4, 0, 0]);
    for (let i = 0; i < 6; i++) b.sym(b.cyl(0.013, 0.013, 0.02, 6), 'chest', 'metal', [0.41, 0.36 - i * 0.065, 0.06], [0, 0, PI / 2]);
    // hydraulic hoses from the hump down to the shoulders
    b.sym(b.tube([[0.12, 0.55, -0.22], [0.3, 0.52, -0.2], [0.42, 0.34, -0.1]], 0.02, 10, 5), 'chest', 'metal');
  }
  chips(b, 'chest', [[[0.3, 0.38, 0.18], [0, 0, 0.6], [0.05, 0.014, 0.03]], [[-0.36, 0.22, 0.14], [0, 0.4, 0], [0.014, 0.06, 0.03]], [[0.0, 0.55, -0.02], [0.4, 0, 0], [0.06, 0.014, 0.02]]]);
  // pelvis + loin plates
  P(b, 'pelvis', 'metal', [0.46, 0.2, 0.36], [0, -0.01, 0], [0, 0, 0], { c: 0.04 });
  P(b, 'pelvis', 'paint', [0.28, 0.22, 0.08], [0, -0.1, 0.2], [-0.12, 0, 0], { c: 0.03, bx: 0.65 });
  PS(b, 'pelvis', 'accent', [0.1, 0.28, 0.32], [0.3, -0.1, 0], [0, 0, 0.2], { c: 0.03, bx: 1.12 });
  if (o.rank >= 4) {
    // chain sash across the chest
    const n = far ? 6 : 11;
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1), x = 0.36 - u * 0.72, yy = 0.42 - u * 0.36 - Math.sin(u * PI) * 0.04;
      b.add(b.tor(0.03, 0.009, 10, 4), 'chest', 'trim', [x, yy, 0.32 - Math.abs(x) * 0.25], [0, i % 2 ? PI / 2 : 0, 0.7]);
    }
  }
}

function stacks(b, o) {
  const far = b.far, n = o.rank >= 5 ? 3 : 2;
  P(b, 'aux0', 'metal', [0.5, 0.3, 0.14], [0, 0.04, 0.04], [0, 0, 0], { c: 0.03 });
  P(b, 'aux0', 'accent', [0.4, 0.22, 0.1], [0, 0.06, -0.04], [0, 0, 0], { c: 0.025 });
  const tops = n === 3 ? [...STACK, STACK3] : STACK;
  tops.forEach(([x, y, z], i) => {
    const h = y - 0.02, cz = z * 0.5;
    b.add(b.cyl(0.055, 0.065, h, 12), 'aux0', 'metal', [x, h / 2, cz], [-0.22, 0, 0]);
    b.add(b.cyl(0.072, 0.07, 0.06, 12), 'aux0', 'accent', [x, y - 0.02, z + 0.01], [-0.22, 0, 0]);
    if (!far) for (const t of [0.35, 0.6]) b.add(b.cyl(0.07, 0.07, 0.025, 12), 'aux0', 'trim', [x, h * t, cz * t * 2], [-0.22, 0, 0]);
    b.add(b.cyl(0.042, 0.042, 0.02, 10), 'aux0', 'glow', [x, y + 0.012, z + 0.005], [-0.22, 0, 0]);
    // heat shield on the outer side
    if (i < 2 && !far) b.add(b.cbox(0.02, h * 0.5, 0.1, 0.006), 'aux0', 'accent', [x * 1.55, h * 0.45, cz], [-0.22, 0, 0]);
  });
  // flames (always built; tick() scales them: R3 idle flicker, overdrive belch)
  for (const bone of ['aux2', 'aux3']) {
    b.add(b.cyl(0.0, 0.05, 0.3, 8), bone, 'glow', [0, 0.16, -0.035], [-0.22, 0, 0]);
    b.add(b.cyl(0.0, 0.032, 0.42, 6), bone, 'eye', [0, 0.22, -0.05], [-0.22, 0, 0]);
  }
}

function armSide(b, o, s) {
  const D = b.rig.D, ua = D.upArm, fa = D.foreArm, far = b.far;
  const bare = s === 'L' && o.rank < 2;
  side(b, s, (put) => {
    put(b.cyl(0.07, 0.07, D.shoulder, 8), 'clav', 'metal', [D.shoulder / 2, 0, 0], [0, 0, PI / 2]);
    put(b.sph(14, 10), 'upArm', 'metal', [0, 0, 0], [0, 0, 0], 0.13);
    put(discX(b, 0.1, 0.22, 12), 'foreArm', 'metal', [0, 0, 0]);
    if (bare) {
      // exposed frame: twin struts, pistons, loose cables
      for (const z of [0.05, -0.05]) put(b.cyl(0.025, 0.025, ua * 0.9, 6), 'upArm', 'metal', [0, -ua / 2, z]);
      put(b.cyl(0.04, 0.04, ua * 0.5, 8), 'upArm', 'accent', [0.03, -ua * 0.55, 0]);
      for (const z of [0.07, -0.07]) put(b.cyl(0.028, 0.028, fa * 0.85, 6), 'foreArm', 'metal', [0, -fa / 2, z]);
      put(b.cyl(0.05, 0.05, fa * 0.45, 10), 'foreArm', 'accent', [0, -fa * 0.35, 0]);
      put(b.cyl(0.03, 0.03, fa * 0.4, 8), 'foreArm', 'trim', [0, -fa * 0.72, 0]);
      if (!far) {
        put(b.tube([[0.04, -0.05, 0.08], [0.09, -fa * 0.4, 0.1], [0.03, -fa * 0.85, 0.06]], 0.012, 8, 4), 'foreArm', 'accent');
        put(b.tube([[-0.04, -0.05, -0.08], [-0.08, -fa * 0.5, -0.1], [-0.02, -fa * 0.9, -0.06]], 0.01, 8, 4), 'foreArm', 'metal');
      }
      put(b.cbox(0.2, 0.06, 0.2, 0.02), 'foreArm', 'metal', [0, -fa * 0.92, 0]);
    } else {
      put(b.cyl(0.085, 0.075, ua, 10), 'upArm', 'metal', [0, -ua / 2, 0]);
      put(plate(b, 0.22, ua * 0.55, 0.22, { c: 0.03, tx: 1.1, tz: 1.1 }), 'upArm', 'paint', [0.02, -ua * 0.6, 0]);
      put(b.cyl(0.03, 0.03, ua * 0.5, 8), 'upArm', 'metal', [0, -ua * 0.35, -0.14]);
      put(b.cyl(0.018, 0.018, ua * 0.45, 8), 'upArm', 'trim', [0, -ua * 0.72, -0.14]);
      if (s === 'R' && o.rank < 2) {
        // dented, mismatched gunmetal patch bolted over the forearm
        const dent = deform(plate(b, 0.26, fa * 0.42, 0.06, { c: 0.012 }), (v) => { const d = Math.exp(-((v.x - 0.03) ** 2 + (v.y + 0.02) ** 2) / 0.004); v.z -= 0.035 * d; });
        put(dent, 'foreArm', 'accent', [0.0, -fa * 0.45, 0.205], [0.05, 0, 0.12]);
        if (!far) for (const [x, y] of [[-0.1, -0.1], [0.1, -0.1], [-0.1, -0.26], [0.1, -0.26]]) put(b.cyl(0.013, 0.013, 0.02, 6), 'foreArm', 'trim', [x, y - fa * 0.12, 0.24], [PI / 2, 0, 0]);
      }
      // giant forearms: tapered red block widening to the fist, layered plates, piston housings
      put(plate(b, 0.34, fa * 0.86, 0.36, { c: 0.05, tx: 0.78, tz: 0.8 }), 'foreArm', 'paint', [0.01, -fa * 0.56, 0]);
      put(plate(b, 0.2, fa * 0.5, 0.05, { c: 0.015 }), 'foreArm', 'accent', [0.01, -fa * 0.58, 0.185]);
      put(plate(b, 0.05, fa * 0.6, 0.24, { c: 0.015 }), 'foreArm', 'accent', [0.18, -fa * 0.55, 0]);
      put(b.cbox(0.38, 0.05, 0.4, 0.015), 'foreArm', 'metal', [0.01, -fa * 0.95, 0]);
      for (const z of [0.1, -0.1]) {
        put(b.cyl(0.035, 0.035, fa * 0.5, 8), 'foreArm', 'metal', [-0.17, -fa * 0.55, z]);
        put(b.cyl(0.022, 0.022, fa * 0.3, 8), 'foreArm', o.rank >= 3 ? 'glow' : 'trim', [-0.19, -fa * 0.62, z]);
      }
      if (o.r >= 2 && !far) for (let i = 0; i < 3; i++) put(b.box(0.12, 0.012, 0.02), 'foreArm', 'metal', [0.01, -fa * (0.4 + i * 0.08), 0.215]);
      stencil(b, 'foreArm' + s, 'trim', s === 'L' ? '1' : '3', [s === 'L' ? 0.205 : -0.205, -fa * 0.5, 0], [0, s === 'L' ? PI / 2 : -PI / 2, 0], 0.09, 0);
    }
    // shoulder: red dome or (R0-1, right side) a mismatched rusty slab
    if (s === 'R' && o.rank < 2) {
      put(plate(b, 0.36, 0.14, 0.36, { c: 0.03, tx: 0.8, tz: 0.85 }), 'upArm', 'accent', [0.04, 0.08, 0], [0, 0, -0.35]);
      rivets(b, 'upArmR', [[-0.12, 0.16, 0.12], [-0.12, 0.16, -0.12], [-0.2, 0.12, 0.0]], 0);
    } else {
      put(b.sph(16, 10, 0, PI * 2, 0, PI * 0.5), 'upArm', 'paint', [0.04, 0.04, 0], [0, 0, -0.32], [0.25, 0.21, 0.26]);
      put(plate(b, 0.34, 0.07, 0.4, { c: 0.025, tx: 0.95 }), 'upArm', 'accent', [0.09, -0.09, 0], [0, 0, -0.42]);
    }
    if (o.rank >= 2 || s === 'L') put(b.box(0.26, 0.02, 0.32), 'upArm', 'trim', [0.1, -0.03, 0], [0, 0, -0.42]);
    // piston fist: hand bone slides out of the forearm in tick(); the rod hides inside the forearm when retracted
    const k = 1.85;
    put(b.cyl(0.04, 0.04, 0.3, 8), 'hand', o.rank >= 3 ? 'glow' : 'metal', [0, 0.14, 0]);
    put(b.cbox(0.14 * k, 0.12 * k, 0.15 * k, 0.03 * k), 'hand', 'metal', [0, -0.07 * k, 0.01]);
    put(b.cbox(0.15 * k, 0.075 * k, 0.165 * k, 0.025 * k), 'hand', bare ? 'accent' : 'paint', [0, -0.135 * k, 0.015]);
    for (let i = 0; i < 4; i++) put(b.cbox(0.034 * k, 0.03 * k, 0.15 * k, 0.008 * k), 'hand', 'trim', [(-0.054 + i * 0.036) * k, -0.18 * k, 0.015]);
    put(b.cbox(0.05 * k, 0.08 * k, 0.06 * k, 0.015 * k), 'hand', 'metal', [-0.06 * k, -0.06 * k, 0.08 * k]);
    if (o.rank >= 2) for (let i = 0; i < 3; i++) put(fin(b, [[-0.025, 0], [0.025, 0], [0, 0.09]], 0.035, 0.008), 'hand', 'trim', [(-0.04 + i * 0.04) * k, -0.2 * k, 0.07 * k], [PI, 0, 0]);
    if (o.rank >= 4) put(b.cbox(0.16 * k, 0.03 * k, 0.17 * k, 0.008 * k), 'hand', 'trim', [0, -0.205 * k, 0.015]);
  });
}

function build(b, o) {
  head(b, o);
  torso(b, o);
  stacks(b, o);
  for (const s of SIDES) armSide(b, o, s);
  legs(b, o, { w: 1.5, foot: 'wide', thighSlot: 'paint', shellSlot: 'metal', shinPlateSlot: 'paint', kneeSlot: 'accent', footSlot: 'accent' });
  if (o.r >= 2) PS(b, 'thigh', 'accent', [0.06, 0.24, 0.24], [0.2, -0.17, 0], [0, 0, 0.08], { c: 0.02 });
  b.sym(b.cyl(0.024, 0.024, 0.02, 10), 'shin', 'glow', [0.0, -0.1, 0.21], [PI / 2 - 0.12, 0, 0]);
  rivets(b, 'shinL', [[0.08, 0.03, 0.17], [-0.08, 0.03, 0.17]]); rivets(b, 'shinR', [[0.08, 0.03, 0.17], [-0.08, 0.03, 0.17]]);
  chips(b, 'shinR', [[[-0.05, -0.15, 0.2], [0.1, 0, 0.5], [0.05, 0.014, 0.01]]]);
}

// ---------------- anims ----------------
function hunch(P, k = 1) {
  LIB.A(P, 'spine', HUNCH.spine * k, 0, 0); LIB.A(P, 'chest', HUNCH.chest * k, 0, 0);
  LIB.A(P, 'neck', HUNCH.neck * k, 0, 0); LIB.A(P, 'head', HUNCH.head * k, 0, 0);
}
// ape arms: fists hang forward near the knees
function apeArms(P, t = 0, k = 1) {
  for (const s of SIDES) {
    const ph = s === 'L' ? 0 : 1.7, sw = Math.sin(t * 1.4 + ph);
    LIB.RS(P, 'clav', s, 0, 0, 0.04 * sw);
    LIB.RS(P, 'upArm', s, -0.3 * k + 0.04 * sw, 0.15, 0.3);
    LIB.RS(P, 'foreArm', s, -0.55 * k, -0.2, 0);
    LIB.RS(P, 'hand', s, 0.1, 0, 0);
  }
}
function stance(P, ctx, t) {
  LIB.idle(P, ctx, t);
  hunch(P);
  P[LIB.PX + 1] -= 0.05;
  apeArms(P, t);
}

const anims = {
  idle(P, t, ctx, L) {
    stance(P, ctx, t);
    // shoulder roll + every ~5 s a knuckle bump
    const roll = Math.sin(t * 1.4);
    L.A(P, 'chest', 0, 0.06 * roll, 0.03 * roll); L.A(P, 'head', 0, -0.08 * roll, 0);
    const c = t % 5.2, k = L.kf(c, [[0, 0], [3.6, 0], [3.85, 1], [4.0, 0.85], [4.15, 1], [4.6, 0]]);
    for (const s of SIDES) { L.AS(P, 'upArm', s, -0.5 * k, 0, -0.32 * k); L.AS(P, 'foreArm', s, -0.75 * k, 0.2 * k, 0); }
    L.A(P, 'head', 0.12 * k, 0, 0);
    L.plant(P, ctx, 0.12, -0.12, 1.15);
  },
  advance(P, t, ctx, L) {
    L.gait(P, ctx);
    hunch(P, 1.1);
    const ph = ctx.move.phase * PI * 2, sw = Math.sin(ph);
    L.A(P, 'chest', 0, 0.12 * sw, 0.05 * sw); L.A(P, 'pelvis', 0, -0.06 * sw, 0);
    apeArms(P, 0);
    for (const s of SIDES) { const k = s === 'L' ? sw : -sw; L.AS(P, 'upArm', s, -0.4 * k, 0, 0); L.AS(P, 'foreArm', s, -0.25 * Math.max(0, k), 0, 0); }
  },
  attack(P, u, ctx, L) {
    // piston hook: load right, twist, punch through (impact 0.39), piston kicks out
    stance(P, ctx, ctx.t);
    const tw = L.kf(u, [[0, 0], [0.28, -0.5], [0.39, 0.55], [0.6, 0.4], [1, 0]]);
    P[L.PX + 1] -= 0.06 * L.kf(u, [[0, 0], [0.3, 1], [0.6, 1], [1, 0]]);
    L.A(P, 'pelvis', 0, tw * 0.35, 0); L.A(P, 'spine', 0.06, tw * 0.3, 0); L.A(P, 'chest', 0.05, tw * 0.4, 0);
    L.A(P, 'head', 0, -tw * 0.4, 0);
    L.RS(P, 'upArm', 'R', L.kf(u, [[0, -0.3], [0.28, 0.35], [0.39, -1.5], [0.62, -1.4], [1, -0.3]]), L.kf(u, [[0, 0.15], [0.28, 0.4], [0.39, 0], [1, 0.15]]), L.kf(u, [[0, 0.3], [0.28, 0.55], [0.39, 0.15], [1, 0.3]]));
    L.RS(P, 'foreArm', 'R', L.kf(u, [[0, -0.55], [0.28, -1.9], [0.39, -0.1], [0.62, -0.2], [1, -0.55]]), -0.1, 0);
    L.RS(P, 'upArm', 'L', L.kf(u, [[0, -0.3], [0.3, -0.9], [0.5, -0.5], [1, -0.3]]), 0.15, 0.35);
    L.RS(P, 'foreArm', 'L', L.kf(u, [[0, -0.55], [0.3, -1.6], [1, -0.55]]), -0.2, 0);
    L.plant(P, ctx, 0.28, -0.22, 1.3, 0, 0.25);
  },
  attack_alt(P, u, ctx, L) {
    // double-fist hammer: both up overhead, slam down (impact 0.38)
    stance(P, ctx, ctx.t);
    const up = L.kf(u, [[0, 0], [0.26, 1], [0.34, 1], [0.38, 0], [1, 0]]);
    const slam = L.kf(u, [[0, 0], [0.33, 0], [0.38, 1], [0.7, 0.9], [1, 0]]);
    P[L.PX + 1] += 0.06 * up - 0.18 * slam; P[L.PX + 2] += 0.1 * slam;
    L.A(P, 'spine', -0.25 * up + 0.35 * slam, 0, 0); L.A(P, 'chest', -0.2 * up + 0.2 * slam, 0, 0);
    L.A(P, 'head', 0.1 * up - 0.1 * slam, 0, 0);
    for (const s of SIDES) {
      L.RS(P, 'upArm', s, L.lerp(L.lerp(-0.3, -2.9, up), -1.3, slam), 0.1, L.lerp(0.3, 0.12, Math.max(up, slam)));
      L.RS(P, 'foreArm', s, L.lerp(L.lerp(-0.55, -0.9, up), -0.15, slam), -0.3 * Math.max(up, slam), 0);
    }
    L.plant(P, ctx, 0.24, -0.2, 1.4);
  },
  cast(P, u, ctx, L) {
    // chest pound + roar
    stance(P, ctx, ctx.t);
    const k = L.kf(u, [[0, 0], [0.15, 1], [0.85, 1], [1, 0]]);
    const pr = Math.max(0, Math.sin(u * PI * 8)) * k, pl = Math.max(0, Math.sin(u * PI * 8 + PI)) * k;
    L.A(P, 'chest', -0.25 * k, 0, 0); L.A(P, 'spine', -0.1 * k, 0, 0);
    L.A(P, 'neck', -0.2 * k, 0, 0); L.A(P, 'head', -0.35 * k, 0, 0);
    L.RS(P, 'upArm', 'R', -0.9 * k - 0.4 * pr, 0, 0.35 - 0.1 * pr); L.RS(P, 'foreArm', 'R', -1.9 * k, 0.4 * k, 0);
    L.RS(P, 'upArm', 'L', -0.9 * k - 0.4 * pl, 0, 0.35 - 0.1 * pl); L.RS(P, 'foreArm', 'L', -1.9 * k, 0.4 * k, 0);
    L.plant(P, ctx, 0.14, -0.14, 1.2);
  },
  overdrive(P, u, ctx, L) {
    // HAYMAKER: crouch + wind way back (stacks belch), rocket lunge (impact 0.3), hold the follow-through, stomp back
    stance(P, ctx, ctx.t);
    const load = L.kf(u, [[0, 0], [0.22, 1], [0.27, 1], [0.3, 0], [1, 0]]);
    const out = L.kf(u, [[0, 0], [0.26, 0], [0.3, 1], [0.62, 1], [0.85, 0], [1, 0]]);
    const lunge = L.kf(u, [[0, 0], [0.26, -0.1], [0.31, 0.75], [0.6, 0.7], [0.88, 0], [1, 0]]);
    const tw = -0.75 * load + 0.6 * out;
    P[L.PX + 1] -= 0.2 * load + 0.1 * out; P[L.PX + 2] += lunge;
    L.A(P, 'pelvis', 0.1 * out, tw * 0.4, 0); L.A(P, 'spine', 0.15 * out - 0.05 * load, tw * 0.35, 0); L.A(P, 'chest', 0.1 * out, tw * 0.4, 0);
    L.A(P, 'head', -0.1 * load, -tw * 0.5, 0);
    L.RS(P, 'upArm', 'R', -0.3 + 0.9 * load - 1.3 * out, 0.15 + 0.4 * load - 0.15 * out, 0.3 + 0.35 * load - 0.15 * out);
    L.RS(P, 'foreArm', 'R', -0.55 - 1.4 * load + 0.5 * out, -0.2 + 0.1 * out, 0);
    L.RS(P, 'upArm', 'L', -0.3 - 0.9 * load + 0.4 * out, 0.15, 0.3 + 0.4 * out); L.RS(P, 'foreArm', 'L', -0.55 - 1.0 * load + 0.3 * out, -0.2, 0);
    // front foot steps into the lunge, rear leg drives
    L.plant(P, ctx, 0.25 + lunge * 0.95, -0.3 + lunge * 0.25, 1.4, 0, 0.35 * out);
  },
  hit(P, u, ctx, L) {
    stance(P, ctx, ctx.t);
    const k = L.kf(u, [[0, 0], [0.12, 1], [0.45, 0.4], [1, 0]]), d = ctx.st.hitDir;
    P[L.PX + 2] -= 0.09 * k; P[L.PX + 1] -= 0.04 * k;
    L.A(P, 'spine', -0.18 * k, 0.12 * k * d, 0.06 * k * d); L.A(P, 'chest', -0.2 * k, 0.12 * k * d, 0.05 * k * d);
    L.A(P, 'head', -0.35 * k, -0.25 * k * d, 0.25 * k * d);
    for (const s of SIDES) L.AS(P, 'upArm', s, -0.3 * k, 0, 0.35 * k);
    L.plant(P, ctx, 0.08, -0.12, 1.15);
  },
  die(P, u, ctx, L) {
    // sways, drops to its knees, slumps forward onto its fists, then keels face-down
    stance(P, ctx, ctx.t);
    const kneel = L.kf(u, [[0, 0], [0.12, 0.15], [0.36, 1], [1, 1]]);
    const fall = L.kf(u, [[0, 0], [0.45, 0.25], [0.55, 0.35], [0.8, 1.35], [0.86, 1.25], [0.92, 1.32], [1, 1.3]]);
    const sway = Math.sin(u * 14) * L.kf(u, [[0, 0], [0.1, 1], [0.35, 0]]);
    P[L.PX + 1] += L.kf(u, [[0, 0], [0.36, -0.36], [0.8, -0.66], [0.86, -0.62], [1, -0.66]]);
    P[L.PX + 2] += 0.4 * L.kf(u, [[0.45, 0], [0.82, 1]]);
    L.A(P, 'pelvis', fall, 0, 0.08 * sway);
    L.A(P, 'spine', 0.1 * kneel, 0, 0.06 * sway); L.A(P, 'head', 0.35 * kneel - 0.5 * L.kf(u, [[0.78, 0], [0.86, 1], [1, 0.8]]), 0.3 * kneel, 0);
    for (const s of SIDES) { L.AS(P, 'upArm', s, -0.6 * L.kf(u, [[0.3, 0], [0.55, 1], [0.8, 0.2]]), 0, 0.5 * L.kf(u, [[0.6, 0], [0.9, 1]])); L.AS(P, 'foreArm', s, 0.4 * kneel, 0, 0); }
    const lie = L.kf(u, [[0.45, 0], [0.84, 1]]);
    if (lie < 1) L.plant(P, ctx, 0.15 * kneel + 0.05, -0.28 * kneel - 0.05, 1.2, 0, 0.6 * kneel);
    if (lie > 0) for (const s of SIDES) {
      const i = BI['thigh' + s] * 3, j = BI['shin' + s] * 3, f = BI['foot' + s] * 3;
      P[i] = L.lerp(P[i], -0.2 - fall * 0.2, lie); P[i + 2] = L.lerp(P[i + 2], (s === 'L' ? 1 : -1) * 0.15, lie);
      P[j] = L.lerp(P[j], s === 'L' ? 0.4 : 0.8, lie); P[f] = L.lerp(P[f], 0.8, lie);
    }
  },
  victory(P, t, ctx, L) {
    // double bicep flex alternating with chest beats, head thrown back
    stance(P, ctx, t);
    const k = L.smooth(Math.min(1, t / 0.5)), cyc = t % 2.4, flex = L.kf(cyc, [[0, 1], [1.2, 1], [1.35, 0], [2.25, 0], [2.4, 1]]) * k;
    const beat = (1 - flex / Math.max(k, 1e-3)) * k, br = Math.max(0, Math.sin(t * 16)), bl = Math.max(0, Math.sin(t * 16 + PI));
    L.A(P, 'chest', -0.22 * k, 0, 0); L.A(P, 'head', -0.35 * k, 0.1 * Math.sin(t * 2), 0);
    for (const s of SIDES) {
      const p = s === 'R' ? br : bl;
      L.RS(P, 'upArm', s, L.lerp(-0.9 - 0.3 * p, -0.15, flex), 0, L.lerp(0.35, 1.45, flex));
      L.RS(P, 'foreArm', s, L.lerp(-1.9, -2.0 - 0.15 * Math.sin(t * 6), flex) * k + -0.55 * (1 - k), L.lerp(0.4, 0, flex), 0);
    }
    P[L.PX + 1] += 0.025 * Math.max(0, Math.sin(t * 5.2)) * beat;
    L.plant(P, ctx, 0.12, -0.12, 1.25);
  },
  deploy(P, u, ctx, L) {
    // superhero landing: right fist punches the floor, then rises and knocks its fists together
    stance(P, ctx, ctx.t);
    const land = L.kf(u, [[0, 0], [0.32, 0], [0.4, 1], [0.66, 0.9], [0.86, 0], [1, 0]]);
    const bump = L.kf(u, [[0, 0], [0.82, 0], [0.9, 1], [1, 0]]);
    P[L.PX + 1] -= 0.36 * land; P[L.PX + 2] += 0.05 * land;
    L.A(P, 'spine', 0.45 * land, 0, 0); L.A(P, 'chest', 0.2 * land, 0, 0); L.A(P, 'head', -0.3 * land, 0, 0);
    L.RS(P, 'upArm', 'R', L.lerp(-0.3, -0.75, land), 0.1, L.lerp(0.3, 0.15, land)); L.RS(P, 'foreArm', 'R', L.lerp(-0.55, -0.05, land), -0.2, 0);
    L.RS(P, 'upArm', 'L', L.lerp(-0.3, 0.2, land), 0.15, L.lerp(0.3, 0.75, land));
    for (const s of SIDES) { L.AS(P, 'upArm', s, -0.5 * bump, 0, -0.32 * bump); L.AS(P, 'foreArm', s, -0.75 * bump, 0.2 * bump, 0); }
    L.plant(P, ctx, 0.3 * land + 0.08, -0.32 * land - 0.06, 1 + 0.3 * land, 0, 0.7 * land);
  },
};

// piston extension (m) per hand, and stack-flame size, wanted per action phase
function pistons(name, u) {
  switch (name) {
    case 'attack': return [0, kf(u, [[0, 0], [0.37, 0], [0.41, 0.2], [0.58, 0.16], [0.75, 0]])];
    case 'attack_alt': { const k = kf(u, [[0, 0], [0.36, 0], [0.4, 0.14], [0.6, 0.1], [0.8, 0]]); return [k, k]; }
    case 'overdrive': return [0, kf(u, [[0, 0], [0.28, 0], [0.31, 0.26], [0.6, 0.22], [0.8, 0]])];
    case 'cast': { const k = Math.max(0, Math.sin(u * PI * 8)) * 0.06; return [k, k]; }
    default: return [0, 0];
  }
}
function flameTarget(name, u, rank) {
  const idle = rank >= 3 ? 0.55 : 0;
  switch (name) {
    case 'overdrive': return kf(u, [[0, idle], [0.06, 1.3], [0.24, 1.6], [0.32, 2.4], [0.6, 1.2], [0.9, idle]]);
    case 'cast': return kf(u, [[0, idle], [0.3, 1.1], [0.9, 1.0], [1, idle]]);
    case 'attack': return kf(u, [[0, idle], [0.38, idle], [0.42, idle + 0.5], [0.7, idle]]);
    case 'victory': return Math.max(idle, 0.7);
    case 'die': return kf(u, [[0, idle], [0.1, 0.9], [0.2, 0.2], [0.3, 0.7], [0.45, 0]]);
    default: return idle;
  }
}

export default {
  id: 'scrapper', name: 'SCRAPPER', role: 'tank', faction: 'rogue', rarity: 'common', realm: 'scifi',
  rig: 'biped', dims: DIMS, height: 1.95, radius: 0.72, walkSpeed: 1.1, cadence: 0.78, scheme: 'bold',
  style: { weapon: 'fists', heavy: 1, stance: 1.3 },
  // pit-red + rust, chipped white numbers; other factions keep their bold palette
  paint: { rogue: { paint: 0xb51f1b, accent: 0x3a3e46, trim: 0xe6e0d4 } },
  mats: { all: { paint: { rough: 0.42, coat: 0.35 }, accent: { rough: 0.55, metal: 0.6, coat: 0.1, panel: { groove: 0.25 } }, metal: { color: 0x3d424a, rough: 0.42, panel: { groove: 0.12, scale: 9 } } } },
  sockets: { muzzle: ['handR', [0, -0.34, 0.05]], core: [0, 0.18, 0.36], head: [0, 0.08, 0.18], hand: ['handR', [0, -0.3, 0.05]], handL: ['handL', [0, -0.3, 0.05]] },
  events: { attack: [['impact', 0.39]], attack_alt: [['impact', 0.38]], cast: [['cast', 0.3]], overdrive: [['cast', 0.05], ['impact', 0.3]] },
  durs: { attack: 0.9, attack_alt: 1.0, cast: 1.2, overdrive: 2.0, die: 2.0 },
  anims,
  post(P, ctx, act) { ctx.su = act ? Math.min(1, act.t / act.dur) : 0; },
  tick(unit, dt, ctx, bones) {
    const st = unit.state, D = ctx.D;
    const [pl, pr] = st.action ? pistons(st.action, ctx.su) : [0, 0];
    bones[BI.handL].position.y = -D.foreArm - pl;
    bones[BI.handR].position.y = -D.foreArm - pr;
    let f = st.action ? flameTarget(st.action, ctx.su, unit.rank) : st.loop === 'victory' ? flameTarget('victory', 0, unit.rank) : flameTarget('', 0, unit.rank);
    if (unit.dead) f = 0;
    ctx.fl = (ctx.fl || 0) + (f - (ctx.fl || 0)) * (1 - Math.exp(-dt * 10));
    const t = ctx.t;
    [BI.aux2, BI.aux3].forEach((bi, i) => {
      const k = ctx.fl * (0.85 + 0.25 * Math.sin(t * 31 + i * 2.1) + 0.1 * Math.sin(t * 53 + i));
      const s = Math.max(0.001, k);
      bones[bi].scale.set(Math.max(0.001, 0.6 + 0.4 * Math.min(1, k)), s, Math.max(0.001, 0.6 + 0.4 * Math.min(1, k)));
    });
  },
  fxHints: { impact: 'piston_slam', overdrive: 'haymaker', color: 0xff5418 },
  build,
};
