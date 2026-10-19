// LEVIATHAN, experimental legendary tank "Abyssal Hull" (sculptor-15). Brief: docs/ROSTER.md `leviathan`.
// A deep-sea salvage frame that came back up different: a huge hovering squid hull. A segmented gold isopod carapace over a
// deep-violet mantle that rises up and back into two great gold fins (the top-down read: a diamond arrowhead), brass portholes,
// a front face of cyan eyes under a gold brow with an angler lure arching over it, a draped anchor chain, and a crown of
// cable tentacles underneath: two front grapple cables with gold hooks (arms), two rear anchor cables with gold flukes (legs),
// and a skirt of thin cables at the back (aux0). Bioluminescent spots run down the mantle (violet glow + cyan eye).
// VALUE: `accent` = deep violet-black hull (most of it), `paint` = gold carapace bands, fins, brow, hooks, `metal` = dark
// gunmetal cable cores + collars, `trim` = pale nacre (carapace edges, ridge, cable clamps), `glow` = faction bioluminescence
// (violet for experimental), `eye` = cyan eyes + spots.
// Rank tiers (legendary default R3): R0 battered (one fin cracked short, fewer bands, bare cables) · R1 full carapace · R2 dorsal
//   ridge spines, porthole bezels, extra cable clamps · R3 bioluminescent spot rows + lure bulb + glowing cable tips (base)
//   · R4 more cables (6-cable skirt + two mid cables on the spine), fin edge lights · R5 glowing rings ripple down every cable
//   (post ripples them harder), a nacre halo crown over the mantle tip.
// Rig: hover. arms (clav/upArm/foreArm/hand) = front grapple cables, legs (thigh/shin/foot) = rear anchor cables, aux0 (pelvis)
// = rear cable skirt, aux1 (head) = lure, aux2 / aux3 (chest) = left / right fins (flap in post), neck/head = the face,
// offset forward-down from the chest with dims.offsets.
import { THREE, P, PS, plate, fin, discX, LIB, PI, BI, band, arcH } from '../kit.js';

const L = LIB;
const TILT = -0.38;                        // mantle axis tilt (top leans back)
const MP = [0, 0.1, -0.08];                // mantle scope origin on the chest
const ML = { y0: 0.86, y1: -0.46, rs: [0.05, 0.2, 0.33, 0.42, 0.48, 0.52, 0.535, 0.52, 0.47] };
const toChest = (p) => {                   // mantle-frame point -> chest-local
  const c = Math.cos(TILT), s = Math.sin(TILT);
  return [MP[0] + p[0], MP[1] + p[1] * c - p[2] * s, MP[2] + p[1] * s + p[2] * c];
};
const DIMS = {
  hover: 1.05, spine: 0.16, chest: 0.28, neck: 0.1, headOff: 0.02, hipX: 0.22, hipY: -0.06, thigh: 0.3, shin: 0.27, ankle: 0.02,
  clavX: 0.24, clavY: -0.47, shoulder: 0.05, upArm: 0.31, foreArm: 0.28,
  parents: { aux0: 'pelvis', aux2: 'chest', aux3: 'chest' },
  offsets: { neck: [0, -0.2, 0.42], clavL: [0.24, -0.47, 0.24], upArmL: [0.04, -0.06, 0.03], thighL: [0.21, -0.05, -0.2] },
  aux0: [0, -0.04, -0.24], aux1: [0, 0.13, -0.02], aux2: toChest([0.3, 0.52, -0.02]), aux3: toChest([-0.3, 0.52, -0.02]),
};
const ARM = (s) => ['upArm' + s, 'foreArm' + s, 'hand' + s];
const LEG = (s) => ['thigh' + s, 'shin' + s, 'foot' + s];
const TIP = 0.25, FTIP = 0.24;            // hand / foot tip segment lengths
const rAt = (y) => {                       // mantle radius at mantle-frame y
  const n = ML.rs.length, u = (ML.y0 - y) / (ML.y0 - ML.y1) * (n - 1), i = Math.max(0, Math.min(n - 2, Math.floor(u))), f = Math.min(1, Math.max(0, u - i));
  return ML.rs[i] + (ML.rs[i + 1] - ML.rs[i]) * f;
};

// ---------- greebles ----------
function lamp(b, bone, pos, rot, r = 0.03, slot = 'glow', mirror = true, bezel = 'paint') {
  const put = mirror ? b.sym.bind(b) : b.add.bind(b);
  put(b.cyl(r * 1.5, r * 1.5, 0.025, 14), bone, bezel, pos, rot);
  put(b.cyl(r, r, 0.034, 14), bone, slot, pos, rot);
}
function link(b, bone, slot, p, rot, s = 1) { b.add(b.tor(0.04 * s, 0.012 * s, 10, 5), bone, slot, p, rot, [1, 1.5, 1]); }

// ---------- parts ----------
function mantle(b, o) {
  const rk = o.rank, far = b.far, C = 'chest';
  b.scope(MP, [TILT, 0, 0], 1, () => {
    // the violet mantle body
    b.add(b.lathe(podPts(), 40), C, 'accent', [0, 0, 0]);
    // gold isopod carapace: overlapping bands over the back + sides (front left open), nacre edge under each
    const n = rk === 0 ? 4 : 6, arc = PI * 1.62;
    for (let i = 0; i < n; i++) {
      const y = -0.3 + i * 0.185, r = rAt(y + 0.05) + 0.012;
      const gold = i % 2 === 0 || i === n - 1;
      b.add(band(b, r - 0.03, r + (gold ? 0.05 : 0.03), gold ? 0.16 : 0.18, arc * (gold ? 1 : 0.94), 30), C, gold ? 'paint' : 'accent', [0, y, 0], [0, PI, 0]);
      b.add(arcH(b, r + 0.03, 0.014, arc * 0.98, 30, 5), C, 'trim', [0, y - 0.085, 0], [0, PI, 0]);
      // a row of spots under each band edge, on the open violet front + flanks
      if (rk >= 3 && !far && i % 2 === 0) for (const k of [-2, 0, 2]) {
        const a = k * 0.24, rr = rAt(y - 0.1) + 0.005;
        const sz = k === 0 ? 0.026 : 0.018;
        b.scope([0, 0, 0], [0, a, 0], 1, () => b.add(b.cyl(sz, sz, 0.024, 8), C, (i + k) % 2 ? 'glow' : 'eye', [0, y - 0.1, rr], [PI / 2, 0, 0]));
      }
    }
    // nacre dorsal ridge down the back, R2+ ridge spines
    const ridge = [];
    for (let i = 0; i <= 10; i++) { const y = ML.y0 - 0.06 - i * 0.12; ridge.push([0, y, -(rAt(y) + 0.07)]); }
    b.add(b.tube(ridge, 0.028, 22, 6), C, 'trim');
    if (rk >= 2 && !far) for (let i = 1; i < 8; i++) {
      const y = ML.y0 - 0.1 - i * 0.14;
      b.add(fin(b, [[-0.05, 0], [0.05, 0], [-0.02, 0.12]], 0.022, 0.005), C, 'paint', [0, y, -(rAt(y) + 0.09)], [0, PI / 2, PI / 2 + 0.3]);
    }
    // brass portholes on the flanks (salvage hull)
    for (const [y, a] of [[-0.08, 1.75], [0.18, 1.85], [0.42, 1.95]]) {
      const r = rAt(y) + 0.03;
      b.scope([0, 0, 0], [0, a, 0], 1, () => {
        lamp(b, C, [0, y, r], [PI / 2, 0, 0], 0.045, rk >= 3 ? 'glow' : 'eye', false, 'paint');
        if (rk >= 2 && !far) for (let k = 0; k < 6; k++) { const q = k * PI / 3; b.add(b.cyl(0.009, 0.009, 0.02, 6), C, 'trim', [Math.cos(q) * 0.085, y + Math.sin(q) * 0.085, r + 0.012], [PI / 2, 0, 0]); }
      });
      b.scope([0, 0, 0], [0, -a, 0], 1, () => lamp(b, C, [0, y, r], [PI / 2, 0, 0], 0.045, rk >= 3 ? 'glow' : 'eye', false, 'paint'));
    }
    // mantle tip cap + R5 nacre halo crown
    b.add(b.sph(16, 10), C, 'paint', [0, ML.y0 - 0.02, 0], [0, 0, 0], [0.07, 0.08, 0.07]);
    b.add(b.cyl(0.02, 0.02, 0.06, 10), C, 'glow', [0, ML.y0 + 0.06, 0]);
    if (rk >= 5) {
      b.add(b.tor(0.3, 0.014, 40, 5), C, 'trim', [0, ML.y0 + 0.2, 0.05], [PI / 2 + 0.35, 0, 0]);
      b.add(b.tor(0.24, 0.008, 40, 4), C, 'glow', [0, ML.y0 + 0.2, 0.05], [PI / 2 + 0.35, 0, 0]);
      for (let i = 0; i < 8; i++) { const a = i * PI / 4; b.add(fin(b, [[-0.02, 0], [0.02, 0], [0, 0.09]], 0.014, 0.004), C, 'trim', [Math.cos(a) * 0.3, ML.y0 + 0.2 + Math.sin(a) * 0.3 * Math.cos(0.35), 0.05 - Math.sin(a) * 0.3 * Math.sin(0.35)], [PI / 2 + 0.35, 0, a - PI / 2]); }
    }
  });
  // lower hull band (spine): violet skirt + gold rim, the anchor chain draped across the front
  b.add(b.cyl(0.47, 0.4, 0.2, 28), 'spine', 'accent', [0, 0.0, -0.04]);
  b.add(b.tor(0.47, 0.022, 32, 5), 'spine', 'paint', [0, 0.1, -0.04], [PI / 2, 0, 0]);
  b.add(b.tor(0.41, 0.016, 32, 5), 'spine', 'trim', [0, -0.1, -0.04], [PI / 2, 0, 0]);
  if (!far) for (let i = 0; i < 11; i++) {
    const a = -1.1 + i * 0.22, sag = 0.12 * (1 - Math.pow((i - 5) / 5, 2));
    link(b, 'spine', 'metal', [Math.sin(a) * 0.5, 0.02 - sag, Math.cos(a) * 0.5 - 0.04], [0, a, i % 2 ? PI / 2 : 0], 1);
  }
}
function podPts() {
  const { y0, y1, rs } = ML, n = rs.length, pts = [[0, y1]];
  for (let i = n - 1; i >= 0; i--) pts.push([rs[i], y0 + (y1 - y0) * (i / (n - 1))]);
  pts.push([0, y0]);
  return pts;
}

function fins(b, o) {
  const rk = o.rank, far = b.far;
  for (const [bone, s] of [['aux2', 1], ['aux3', -1]]) b.scope([0, 0, 0], [TILT, 0, 0], 1, () => {
    const k = rk === 0 && s < 0 ? 0.7 : 1;    // R0: the right fin is cracked short
    const pts = [[0, -0.4], [0.24 * k, -0.28], [0.6 * k, 0.08], [0.42 * k, 0.26], [0.12, 0.4], [0, 0.36]].map(([x, y]) => [x * s, y]);
    b.add(b.ext(pts, 0.045, 0.012), bone, 'paint', [0, 0, 0]);
    // nacre ribs radiating out of the root + an edge line
    for (let i = 0; i < 3; i++) {
      const a = 0.35 + i * 0.4, l = (0.4 - Math.abs(i - 1) * 0.08) * k;
      b.add(b.cbox(l, 0.018, 0.05, 0.005), bone, 'trim', [s * Math.cos(a - 0.4) * l * 0.5, Math.sin(a - 0.4) * l * 0.5, 0.0], [0, 0, s * (a - 0.4)]);
    }
    if (rk >= 3 && !far) for (let i = 0; i < 4; i++) b.add(b.cyl(0.016, 0.016, 0.06, 8), bone, i % 2 ? 'eye' : 'glow', [s * (0.1 + i * 0.08) * k, -0.06 + i * 0.05, 0], [PI / 2, 0, 0]);
    if (rk >= 4) {
      const e = [pts[1], pts[2], pts[3]];
      for (let i = 0; i < 2; i++) {
        const a = e[i], c = e[i + 1], l = Math.hypot(c[0] - a[0], c[1] - a[1]);
        b.add(b.cbox(0.012, l * 0.95, 0.055, 0.003), bone, 'glow', [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2, 0], [0, 0, -Math.atan2(c[0] - a[0], c[1] - a[1])]);
      }
    }
    b.add(discX(b, 0.05, 0.08, 14), bone, 'metal', [0, 0, 0]);
  });
}

function face(b, o) {
  const rk = o.rank, far = b.far, H = 'head';
  // armoured face block under a heavy gold brow; cyan eye cluster; gold mandible hooks
  b.add(b.rbox(0.44, 0.26, 0.24, 0.07), H, 'accent', [0, 0.0, 0.0]);
  P(b, H, 'paint', [0.5, 0.08, 0.26], [0, 0.13, 0.02], [0.25, 0, 0], { c: 0.03, tx: 0.8, bz: 1.1 });
  PS(b, H, 'paint', [0.16, 0.06, 0.18], [0.17, 0.11, 0.03], [0.2, 0.3, -0.25], { c: 0.02, tx: 0.7 });
  b.add(b.cbox(0.4, 0.02, 0.03, 0.006), H, 'trim', [0, 0.09, 0.14]);
  // two big eyes in gold bezels + three small eyes each side, a central violet lantern under the brow
  for (const [x, y, r] of [[0.13, 0.02, 0.05], [0.2, -0.04, 0.025], [0.07, -0.06, 0.022], [0.17, 0.07, 0.018]]) {
    b.sym(b.cyl(r * 1.45, r * 1.45, 0.03, 16), H, r > 0.04 ? 'paint' : 'metal', [x, y, 0.115], [PI / 2, 0, 0]);
    b.sym(b.sph(14, 10), H, 'eye', [x, y, 0.125], [0, 0, 0], [r, r, r * 0.7]);
  }
  b.add(b.sph(16, 10), H, 'glow', [0, -0.02, 0.12], [0, 0, 0], [0.04, 0.05, 0.035]);
  b.add(b.tor(0.055, 0.01, 16, 5), H, 'paint', [0, -0.02, 0.125]);
  b.sym(fin(b, [[0, 0], [0.05, 0.0], [0.07, -0.12], [0.02, -0.17], [0.01, -0.1]], 0.035, 0.008), H, 'paint', [0.06, -0.1, 0.1], [0.3, 0, 0]);
  if (!far) for (let i = 0; i < 4; i++) b.sym(b.cbox(0.05, 0.008, 0.02, 0.002), H, 'metal', [0.18, -0.07 - i * 0.02, 0.1], [0, 0.4, 0]);
}

function lure(b, o) {
  const rk = o.rank, A = 'aux1';
  b.add(b.tube([[0, 0, 0], [0, 0.22, 0.0], [0, 0.4, 0.18], [0, 0.4, 0.4], [0, 0.3, 0.52]], 0.02, 18, 6), A, 'metal');
  for (const t of [0.05, 0.3]) b.add(b.cyl(0.03, 0.03, 0.03, 10), A, 'paint', [0, 0.06 + t * 0.6, 0.0 + t * 0.2], [t * 1.5, 0, 0]);
  b.add(b.cyl(0.035, 0.03, 0.05, 12), A, 'paint', [0, 0.27, 0.52], [0.3, 0, 0]);
  b.add(b.sph(16, 12), A, rk >= 3 ? 'glow' : 'eye', [0, 0.2, 0.55], [0, 0, 0], 0.065);
  b.add(b.tor(0.075, 0.008, 18, 4), A, 'trim', [0, 0.2, 0.55], [0, 0, 0]);
  b.add(b.tor(0.075, 0.008, 18, 4), A, 'trim', [0, 0.2, 0.55], [0, PI / 2, 0]);
}

function underside(b, o) {
  const rk = o.rank, far = b.far, Pl = 'pelvis';
  // tentacle root collar + dark underside dome + a violet emitter ring the hull hovers on
  b.add(b.sph(24, 10, 0, PI * 2, PI * 0.5, PI * 0.5), Pl, 'accent', [0, 0.04, -0.02], [0, 0, 0], [0.42, 0.3, 0.42]);
  b.add(b.cyl(0.36, 0.3, 0.1, 24), Pl, 'metal', [0, 0.02, -0.02]);
  b.add(b.tor(0.34, 0.02, 28, 5), Pl, 'paint', [0, -0.02, -0.02], [PI / 2, 0, 0]);
  b.add(b.tor(0.16, 0.022, 20, 5), Pl, 'glow', [0, -0.24, -0.02], [PI / 2, 0, 0]);
  b.add(b.cyl(0.1, 0.12, 0.05, 16), Pl, 'metal', [0, -0.25, -0.02]);
  if (!far) for (let i = 0; i < 10; i++) { const a = i * PI / 5 + 0.3; b.add(b.cbox(0.06, 0.04, 0.03, 0.008), Pl, 'trim', [Math.sin(a) * 0.35, 0.06, Math.cos(a) * 0.35 - 0.02], [0, a, 0]); }
}

// one articulated cable: segments on three bones hanging along -Y; tip = 'hook' (grapple) | 'anchor' (fluke)
function cable(b, o, bones, lens, r0, tip) {
  const rk = o.rank, far = b.far;
  const rs = [r0, r0 * 0.82, r0 * 0.62, r0 * 0.3];
  bones.forEach((bn, i) => {
    const l = lens[i], ra = rs[i], rb = rs[i + 1];
    b.sym(b.cyl(rb, ra, l, 16), bn, 'metal', [0, -l / 2, 0]);
    b.sym(b.sph(12, 8), bn, 'accent', [0, 0, 0], [0, 0, 0], ra * 1.15);
    const nr = far ? 2 : 4;
    for (let k = 0; k < nr; k++) {
      const y = -l * (k + 0.6) / (nr + 0.4), rr = ra + (rb - ra) * (-y / l);
      b.sym(b.cyl(rr * 1.28, rr * 1.18, l / (nr * 1.9), 12), bn, k === 1 && rk >= 2 ? 'trim' : 'accent', [0, y, 0]);
      if (rk >= 5) b.sym(b.tor(rr * 1.3, 0.006, 12, 3), bn, 'glow', [0, y - l / (nr * 3.6), 0], [PI / 2, 0, 0]);
    }
    if (i < 2) b.sym(b.cyl(ra * 1.35, ra * 1.35, 0.035, 12), bn, 'paint', [0, -0.03, 0]);
    // suction-cup nubs (nacre) on the inner face
    if (!far && i > 0) for (let k = 0; k < 3; k++) b.sym(b.cyl(rs[i] * 0.45, rs[i] * 0.4, 0.02, 8), bn, 'trim', [0, -l * (k + 0.5) / 3, rs[i] * 0.95], [PI / 2, 0, 0]);
  });
  const T = bones[2], l = lens[2];
  if (rk >= 3) b.sym(b.sph(10, 8), T, 'glow', [0, -l, 0], [0, 0, 0], 0.03);
  if (tip === 'hook') {
    // three-pronged gold grapple
    for (let k = 0; k < 3; k++) {
      const a = k * 2 * PI / 3;
      b.scope([0, -l + 0.03, 0], [0, a, 0], 1, () => b.sym(fin(b, [[-0.015, 0], [0.02, 0], [0.07, -0.08], [0.05, -0.15], [0.02, -0.1], [0.03, -0.06]], 0.025, 0.006), T, 'paint', [0, 0, 0.02], [0, PI / 2, 0]));
    }
    b.sym(b.cyl(0.035, 0.03, 0.05, 12), T, 'paint', [0, -l + 0.03, 0]);
  } else {
    // heavy anchor: shank + crown + two curved gold flukes + a ring
    b.sym(b.cyl(0.03, 0.03, 0.16, 10), T, 'metal', [0, -l - 0.04, 0]);
    b.sym(b.tor(0.035, 0.01, 12, 4), T, 'paint', [0, -l + 0.06, 0]);
    b.sym(b.tor(0.13, 0.024, 16, 6, PI * 0.9), T, 'paint', [0, -l - 0.04, 0], [0, PI / 2, PI * 1.05 + PI]);
    for (const x of [1, -1]) b.sym(fin(b, [[-0.04, 0], [0.04, 0], [0, 0.1]], 0.035, 0.008), T, 'paint', [0, -l - 0.04 - 0.035, x * 0.12], [x > 0 ? 0.6 : -0.6 + PI, PI / 2, 0]);
  }
}

function skirt(b, o) {
  // thin rear cables hanging from aux0 (sways as a bundle); R4 = six cables + two on the hull sides
  const rk = o.rank, far = b.far, A = 'aux0';
  const n = rk >= 4 ? 6 : 4;
  for (let i = 0; i < n; i++) {
    const a = (i / (n - 1) - 0.5) * 2.2, x = Math.sin(a) * 0.2, z = -Math.cos(a) * 0.08, len = 0.72 - Math.abs(i / (n - 1) - 0.5) * 0.3;
    const pts = [[x, 0, z], [x * 1.3, -len * 0.35, z - 0.08], [x * 1.6, -len * 0.7, z - 0.06], [x * 1.7, -len, z + 0.02]];
    b.add(b.tube(pts, 0.022, 12, 6), A, 'metal');
    if (!far) for (const t of [0.3, 0.62]) { const p = pts[Math.round(t * 3)]; b.add(b.cyl(0.03, 0.03, 0.03, 8), A, 'trim', p); }
    if (rk >= 3) b.add(b.sph(8, 6), A, i % 2 ? 'eye' : 'glow', pts[3], [0, 0, 0], 0.024);
  }
  b.add(b.cyl(0.08, 0.1, 0.06, 14), A, 'paint', [0, 0.02, 0]);
  if (rk >= 4) for (const s of [1, -1]) {
    const pts = [[s * 0.42, 0.06, 0.05], [s * 0.5, -0.25, 0.06], [s * 0.5, -0.5, 0.0], [s * 0.45, -0.7, -0.05]];
    b.add(b.tube(pts, 0.02, 12, 6), 'spine', 'metal');
    b.add(b.sph(8, 6), 'spine', 'glow', pts[3], [0, 0, 0], 0.024);
  }
}

function build(b, o) {
  mantle(b, o);
  fins(b, o);
  face(b, o);
  lure(b, o);
  underside(b, o);
  b.sym(b.cyl(0.08, 0.09, 0.08, 14), 'clav', 'paint', [0, -0.01, 0]);
  b.sym(b.cyl(0.065, 0.065, 0.1, 12), 'clav', 'metal', [0.02, -0.05, 0.015], [0, 0, 0.3]);
  cable(b, o, ['upArm', 'foreArm', 'hand'], [DIMS.upArm, DIMS.foreArm, TIP], 0.068, 'hook');
  cable(b, o, ['thigh', 'shin', 'foot'], [DIMS.thigh, DIMS.shin, FTIP], 0.07, 'anchor');
  skirt(b, o);
}

// ---------- pose helpers ----------
const SEGW = [0.6, 1, 1.4];
// cables: rest hang + travelling ripple (amp), arms forward / legs back; out = sideways splay
function cables(P, t, amp = 1, { armX = -0.35, legX = 0.42, out = 0.44, speed = 1 } = {}) {
  for (const s of ['L', 'R']) {
    const sg = s === 'L' ? 1 : -1, ph = s === 'L' ? 0 : 1.7;
    ARM(s).forEach((n, i) => {
      const w = Math.sin(t * 1.6 * speed - i * 0.9 + ph) * 0.13 * amp * SEGW[i], v = Math.cos(t * 1.25 * speed - i * 0.8 + ph) * 0.08 * amp * SEGW[i];
      L.R(P, n, (i === 0 ? armX : 0.32 + 0.12 * i) + w, 0, sg * ((i === 0 ? out : -0.1) + v));
    });
    LEG(s).forEach((n, i) => {
      const w = Math.sin(t * 1.4 * speed - i * 0.9 + ph + 0.8) * 0.13 * amp * SEGW[i], v = Math.cos(t * 1.1 * speed - i * 0.8 + ph) * 0.08 * amp * SEGW[i];
      L.R(P, n, (i === 0 ? legX : -0.32 - 0.12 * i) + w, 0, sg * ((i === 0 ? out : -0.1) + v));
    });
  }
}
function hull(P, ctx, t) {
  const st = ctx.st, b = Math.sin(t * 1.1);
  L.pel(P, Math.sin(t * 0.5) * 0.03, b * 0.06, 0);
  L.R(P, 'pelvis', 0.03 * Math.sin(t * 0.8), 0, 0.03 * Math.sin(t * 0.6));
  L.R(P, 'spine', 0.02 * b, 0, 0);
  L.R(P, 'chest', -0.03 * b, 0, 0);
  L.R(P, 'neck', st.gp * 0.3, st.gy * 0.4, 0);
  L.R(P, 'head', st.gp * 0.4, st.gy * 0.3, 0);
  L.R(P, 'aux1', 0.12 * Math.sin(t * 1.3), 0.15 * Math.sin(t * 0.9), 0.05 * Math.sin(t * 1.7));
}
// pose one cable chain toward root-space-ish angles: x (pitch, - = forward), z (splay), curl along the chain
function chain(P, names, x, z, curl, side, w = 1) {
  const sg = side === 'L' ? 1 : -1;
  names.forEach((n, i) => {
    const i3 = BI[n] * 3, tx = i === 0 ? x : curl * (i === 1 ? 1 : 1.3), tz = i === 0 ? sg * z : 0;
    P[i3] += (tx - P[i3]) * w; P[i3 + 1] += (0 - P[i3 + 1]) * w; P[i3 + 2] += (tz - P[i3 + 2]) * w;
  });
}

const anims = {
  idle(P, t, ctx) { hull(P, ctx, t); cables(P, t, ctx.rk5 ? 1.6 : 1); },
  advance(P, t, ctx) {
    hull(P, ctx, t);
    // swims forward: hull pitched in, cables streaming back with a strong wave
    L.A(P, 'pelvis', 0.16, 0, 0); L.A(P, 'chest', -0.05, 0, 0);
    cables(P, t, 1.6, { armX: 0.35, legX: 0.55, out: 0.22, speed: 2 });
  },
  // CABLE LASH: the right grapple rears up over the hull and whips down onto the lane (impact 0.42)
  attack(P, u, ctx) {
    hull(P, ctx, ctx.t); cables(P, ctx.t, 1);
    const k = L.kf(u, [[0, 0], [0.12, 1], [0.8, 1], [1, 0]]);
    const x = L.kf(u, [[0, -0.12], [0.3, -2.5], [0.38, -1.9], [0.44, -0.9], [0.6, -0.85], [0.85, -0.3], [1, -0.12]]);
    const curl = L.kf(u, [[0, 0.1], [0.3, 0.7], [0.38, -0.3], [0.44, 0.15], [0.6, 0.25], [1, 0.1]]);
    chain(P, ARM('R'), x, 0.08, curl, 'R', k);
    const lean = L.kf(u, [[0, 0], [0.3, -0.5], [0.44, 1], [0.7, 0.6], [1, 0]]);
    L.A(P, 'pelvis', 0.18 * lean, -0.12 * lean, 0); L.A(P, 'chest', 0.05 * lean, 0, 0);
    P[L.PX + 2] += 0.22 * Math.max(0, lean); P[L.PX + 1] += 0.08 * Math.max(0, -lean) - 0.06 * Math.max(0, lean);
    chain(P, ARM('L'), -0.5 * k, 0.3, 0.3, 'L', 0.5 * k);
  },
  // DOUBLE LASH: both grapples cross-whip, left then right (impact 0.4, second strike 0.56)
  attack_alt(P, u, ctx) {
    hull(P, ctx, ctx.t); cables(P, ctx.t, 1);
    const kL = L.kf(u, [[0, 0], [0.12, 1], [0.6, 1], [0.85, 0]]), kR = L.kf(u, [[0, 0], [0.2, 1], [0.75, 1], [1, 0]]);
    chain(P, ARM('L'), L.kf(u, [[0, -0.12], [0.28, -2.4], [0.4, -0.9], [0.6, -0.6]]), L.kf(u, [[0, 0.16], [0.28, 0.4], [0.4, -0.25]]), L.kf(u, [[0, 0.1], [0.28, 0.7], [0.4, 0.1]]), 'L', kL);
    chain(P, ARM('R'), L.kf(u, [[0, -0.12], [0.44, -2.4], [0.56, -0.9], [0.8, -0.6]]), L.kf(u, [[0, 0.16], [0.44, 0.4], [0.56, -0.25]]), L.kf(u, [[0, 0.1], [0.44, 0.7], [0.56, 0.1]]), 'R', kR);
    const lean = L.kf(u, [[0, 0], [0.3, -0.3], [0.4, 0.7], [0.5, 0.2], [0.56, 0.8], [0.8, 0.3], [1, 0]]);
    L.A(P, 'pelvis', 0.16 * lean, 0.1 * Math.sin(u * PI * 2), 0);
    P[L.PX + 2] += 0.18 * Math.max(0, lean);
  },
  // ABYSSAL HULL (shield): rises, all cables flare into an umbrella, the lure blazes (cast 0.5)
  cast(P, u, ctx) {
    hull(P, ctx, ctx.t); cables(P, ctx.t, 0.6);
    const k = L.kf(u, [[0, 0], [0.4, 1], [0.75, 1], [1, 0]]);
    P[L.PX + 1] += 0.2 * k;
    for (const s of ['L', 'R']) { chain(P, ARM(s), -0.6, 0.9, -0.35, s, k); chain(P, LEG(s), 0.7, 0.9, -0.35, s, k); }
    L.A(P, 'aux1', -0.4 * k, 0, 0); L.A(P, 'head', -0.15 * k, 0, 0);
  },
  // ABYSSAL GRIP: rears up, umbrella flare, every cable shoots forward across the board (impact 0.25 = 0.6 s release),
  // squeezes (crush flash 0.5), lets go and settles
  overdrive(P, u, ctx) {
    hull(P, ctx, ctx.t); cables(P, ctx.t, 0.8);
    const rear = L.kf(u, [[0, 0], [0.18, 1], [0.25, 0.6], [0.55, 0.5], [0.75, 0], [1, 0]]);
    const flare = L.kf(u, [[0, 0], [0.12, 1], [0.2, 1], [0.24, 0]]);
    const shoot = L.kf(u, [[0, 0], [0.2, 0], [0.25, 1], [0.62, 1], [0.78, 0]]);
    const sq = L.kf(u, [[0.25, 0], [0.32, 1], [0.46, 0.6], [0.5, 1.2], [0.6, 1], [0.7, 0]]);
    P[L.PX + 1] += 0.35 * rear; P[L.PX + 2] -= 0.12 * rear - 0.25 * shoot;
    L.A(P, 'pelvis', -0.35 * rear + 0.3 * shoot, 0, 0); L.A(P, 'chest', -0.1 * rear, 0, 0);
    L.A(P, 'head', -0.2 * rear, 0, 0); L.A(P, 'aux1', -0.5 * rear, 0, 0);
    for (const s of ['L', 'R']) {
      chain(P, ARM(s), -0.6, 1.1, -0.4, s, flare);
      chain(P, LEG(s), 0.8, 1.1, -0.4, s, flare);
      chain(P, ARM(s), -1.45 - 0.1 * sq, 0.12, 0.15 + 0.35 * sq, s, shoot);
      chain(P, LEG(s), -1.1 - 0.1 * sq, 0.42, 0.3 + 0.3 * sq, s, shoot * 0.9);
    }
  },
  hit(P, u, ctx) {
    hull(P, ctx, ctx.t); cables(P, ctx.t, 1.4, { speed: 3 });
    const k = L.kf(u, [[0, 0], [0.12, 1], [0.5, 0.35], [1, 0]]), d = ctx.st.hitDir;
    L.A(P, 'pelvis', -0.22 * k, 0.1 * k * d, 0.1 * k * d); P[L.PX + 2] -= 0.12 * k;
    L.A(P, 'head', -0.25 * k, 0, 0.15 * k * d);
    for (const s of ['L', 'R']) { L.A(P, 'upArm' + s, 0.4 * k, 0, 0); L.A(P, 'thigh' + s, 0.3 * k, 0, 0); }
  },
  // lights gutter, the hull sinks onto the plate and rolls onto its side; cables go limp across the floor
  die(P, u, ctx) {
    hull(P, ctx, ctx.t * (1 - u)); cables(P, ctx.t, 1 - u);
    const g = 0.42 - ctx.D.hover;
    L.pel(P, 0, L.kf(u, [[0, 0], [0.12, 0.1], [0.55, g], [0.62, g + 0.06], [0.7, g], [1, g]]), L.kf(u, [[0, 0], [1, -0.1]]));
    L.R(P, 'pelvis', L.kf(u, [[0, 0], [0.55, 0.15], [1, 0.25]]), L.kf(u, [[0, 0], [1, 0.3]]), L.kf(u, [[0, 0], [0.55, 0.2], [0.8, 0.5], [1, 0.45]]));
    L.A(P, 'head', L.kf(u, [[0, 0], [0.6, 0.35], [1, 0.4]]), 0, 0);
    L.R(P, 'aux1', L.kf(u, [[0.2, 0], [0.8, 1.2]]), 0, 0);
    const lim = L.kf(u, [[0.3, 0], [0.7, 1]]);
    for (const s of ['L', 'R']) { chain(P, ARM(s), -1.0, 1.0, 0.25, s, lim); chain(P, LEG(s), 1.1, 1.0, 0.25, s, lim); }
  },
  // drops in with the cables streaming above it, splays them on landing (land 0.4), settles and the lights come up (ready 0.85)
  deploy(P, u, ctx) {
    hull(P, ctx, ctx.t); cables(P, ctx.t, 0.8);
    const up = L.kf(u, [[0, 1], [0.36, 1], [0.42, 0], [1, 0]]), sp = L.kf(u, [[0.38, 0], [0.44, 1], [0.7, 0.6], [0.95, 0]]);
    const sag = L.kf(u, [[0.36, 0], [0.44, 1], [0.65, 0.3], [0.9, 0]]);
    P[L.PX + 1] -= 0.25 * sag;
    for (const s of ['L', 'R']) {
      chain(P, ARM(s), -2.6, 0.5, 0.2, s, up); chain(P, LEG(s), 2.6, 0.5, 0.2, s, up);
      chain(P, ARM(s), -0.9, 1.0, 0.4, s, sp); chain(P, LEG(s), 0.9, 1.0, 0.4, s, sp);
    }
    L.A(P, 'head', 0.3 * L.kf(u, [[0, 1], [0.6, 1], [0.85, 0]]), 0, 0);
  },
  // rises and slowly turns, cables rippling high, the lure raised
  victory(P, t, ctx) {
    hull(P, ctx, t); cables(P, t, 1.8, { armX: -0.5, legX: 0.6, out: 0.5, speed: 1.5 });
    const k = L.smooth(Math.min(1, t / 0.8));
    P[L.PX + 1] += 0.2 * k + 0.05 * Math.sin(t * 2);
    L.A(P, 'pelvis', -0.1 * k, Math.sin(t * 0.6) * 0.5 * k, 0);
    L.A(P, 'head', -0.2 * k, 0, 0); L.A(P, 'aux1', -0.35 * k, 0, 0);
  },
};
for (const n of ['attack', 'attack_alt', 'cast', 'overdrive', 'hit', 'die', 'deploy']) {
  const f = anims[n];
  anims[n] = (P, u, ctx, Lb) => { ctx.an = n; ctx.au = u; f(P, u, ctx, Lb); };
}

export default {
  id: 'leviathan', name: 'LEVIATHAN', role: 'tank', faction: 'experimental', rarity: 'legendary', realm: 'scifi',
  rig: 'hover', dims: DIMS, height: 2.45, radius: 0.8, walkSpeed: 0.9, scheme: 'dark',
  style: { weapon: 'fists', heavy: 1 },
  // gold carapace + deep violet hull in every tint; faction colour lives in the bioluminescence (glow)
  mats: {
    all: {
      paint: { color: 0xf0b23e, metal: 0.78, rough: 0.24, coat: 0.7, coatRough: 0.05, env: 1.1, emissive: 0x3a2000, ei: 1, panel: { scale: 3.4, groove: 0.4, vary: 0.08 } },
      accent: { color: 0x2c1052, metal: 0.25, rough: 0.28, coat: 1, env: 0.5, panel: { scale: 4, groove: 0.3, vary: 0.1, rim: 0.32, rimColor: 0x24103a } },
      metal: { color: 0x3a3644, metal: 0.8, rough: 0.35 },
      trim: { color: 0xe6dcf2, metal: 0.35, rough: 0.18, coat: 1, env: 0.9, emissive: 0x120a1c, ei: 1 },
      eye: { color: 0x5cf0ff },
    },
  },
  sockets: { muzzle: ['handR', [0, -TIP, 0]], muzzleL: ['handL', [0, -TIP, 0]], hand: ['handR', [0, -TIP, 0]], core: [0, 0.1, 0.5], head: [0, 0.05, 0.14], lure: ['aux1', [0, 0.2, 0.55]], anchorL: ['footL', [0, -FTIP, 0]], anchorR: ['footR', [0, -FTIP, 0]] },
  events: {
    attack: [['impact', 0.42]], attack_alt: [['impact', 0.4], ['impact', 0.56]], cast: [['cast', 0.5]],
    overdrive: [['cast', 0.05], ['impact', 0.25], ['impact', 0.5]], die: [['down', 0.55]], deploy: [['land', 0.4], ['ready', 0.85]], hit: [],
  },
  durs: { attack: 1.0, attack_alt: 1.15, cast: 1.2, overdrive: 2.4, hit: 0.5, die: 2.0, deploy: 1.6 },
  motes: { color: 0xb46bff },
  fxHints: { impact: 'cable_lash', overdrive: 'abyssal_grip', color: 0xb05cff },
  anims,
  post(P, ctx, act) {
    const t = ctx.t, an = act && act.name, u = act ? Math.min(1, act.t / act.dur) : 0;
    // fins flap slowly (harder when swimming / rearing), the rear cable skirt trails
    let fl = 0.12 * Math.sin(t * 1.4), tr = 0.12 + 0.05 * Math.sin(t * 1.2);
    if (ctx.move.v > 0.1) { fl = 0.3 * Math.sin(t * 4); tr += 0.4; }
    if (an === 'overdrive') fl += 0.35 * L.kf(u, [[0, 0], [0.18, 1], [0.3, 0.3], [0.7, 0]]);
    if (an === 'die') { fl *= 1 - u; tr += 0.7 * L.kf(u, [[0.3, 0], [0.7, 1]]); }
    P[BI.aux2 * 3 + 1] = fl; P[BI.aux3 * 3 + 1] = -fl;
    P[BI.aux2 * 3 + 2] = 0.06 * Math.sin(t * 0.9); P[BI.aux3 * 3 + 2] = -0.06 * Math.sin(t * 0.9);
    const pp = P[BI.pelvis * 3];
    P[BI.aux0 * 3] = tr - pp * 0.7; P[BI.aux0 * 3 + 2] = 0.08 * Math.sin(t * 1.1);
  },
  tick(unit, dt, ctx) { ctx.rk5 = unit.rank >= 5; if (!unit.state.action) ctx.an = null; },
  build,
};
