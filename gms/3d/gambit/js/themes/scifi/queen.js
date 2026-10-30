// Sci-fi Queen: "AI Core". A starship AI: a faceted plinth with a light channel, a slim
// panelled pedestal ending in an emitter dish, and — floating above it on a hover beam — a
// crown collar from which eight swept, twisted vanes rise (they look caught mid-spin). Each
// vane carries a glowing rib and ends in a bright bead; inside the ring of vanes the glowing
// heart hangs in two crossed gimbal rings.
// Overhead read: a dotted circle of eight bright vane tips around a bright centre (the queen's
// coronet + finial), eight light-line spokes between them.
import { hsLathe, prep, assemble, PAL } from './common.js';

const TAU = Math.PI * 2;
const NV = 8;                    // vanes
const Y0 = 0.565, Y1 = 1.07;     // vane root / tip height
const TWIST = 0.55;              // radians of swirl from root to tip

export function queen(THREE, kit, { color }) {
  const parts = [];

  // ---- 16-sided plinth with a recessed light channel ----
  parts.push(hsLathe(THREE, color, [
    [0, 0, 'dark'], [0.31, 0, 'dark'], [0.33, 0.02, 'shade'], [0.33, 0.052, 'body'],
    [0.312, 0.07, 'trim'], [0.292, 0.07, 'body'],
    [0.292, 0.06, 'dark'], [0.288, 0.058, 'line'], [0.258, 0.058, 'line'], [0.254, 0.06, 'line'], [0.254, 0.074, 'dark'],
    [0.236, 0.08, 'deck'], [0.215, 0.082, 'deck'], [0.2, 0.094, 'trim'], [0.17, 0.098, 'trim'], [0, 0.098, 'deck'],
  ], { seg: 16, flat: true, phiStart: TAU / 32 }));

  // ---- pedestal: tapered 12-gon column with a groove and a light ring, flaring into a dish ----
  parts.push(hsLathe(THREE, color, [
    [0.165, 0.098, 'shade'], [0.15, 0.13, 'body'], [0.122, 0.22, 'body'],
    [0.116, 0.226, 'dark'], [0.112, 0.232, 'line'], [0.112, 0.25, 'line'], [0.116, 0.256, 'dark'],
    [0.104, 0.33, 'body'], [0.094, 0.345, 'trim'], [0.09, 0.37, 'dark'],
    [0.1, 0.39, 'shade'], [0.15, 0.43, 'body'], [0.17, 0.448, 'trim'], [0.165, 0.46, 'trim'],
    [0.13, 0.462, 'deck'], [0.112, 0.458, 'dark'], [0.104, 0.458, 'lineHi'], [0.07, 0.458, 'lineHi'], [0.062, 0.462, 'dark'], [0, 0.462, 'dark'],
  ], { seg: 12, flat: true }));
  // four slim light strips on the column faces
  for (let i = 0; i < 4; i++) {
    const a = i * TAU / 4 + TAU / 24;
    const s = prep(THREE, new THREE.BoxGeometry(0.014, 0.06, 0.01), color, 'line');
    kit.place(s, { x: Math.sin(a) * 0.108, y: 0.293, z: Math.cos(a) * 0.108, ry: a, rx: -0.12 });
    parts.push(s);
  }
  // hover beam from the dish into the floating collar
  parts.push(prep(THREE, kit.place(new THREE.CylinderGeometry(0.05, 0.07, 0.11, 12, 1, true), { y: 0.515 }), color, 'lineLo'));

  // ---- floating crown collar ----
  parts.push(hsLathe(THREE, color, [
    [0.09, 0.505, 'dark'], [0.15, 0.505, 'dark'], [0.17, 0.52, 'shade'],
    [0.182, 0.532, 'trim'], [0.182, 0.54, 'dark'], [0.18, 0.542, 'line'], [0.18, 0.554, 'line'], [0.182, 0.556, 'dark'],
    [0.176, 0.572, 'trim'], [0.15, 0.578, 'deck'], [0.1, 0.578, 'deck'], [0.09, 0.57, 'dark'],
  ], { seg: 16, flat: true, closed: true }));

  // ---- vanes ----
  // blade section in (r, y), counter-clockwise: root -> outer edge up -> tip -> inner edge down
  const outer = [[0.172, Y0], [0.212, 0.66], [0.255, 0.77], [0.274, 0.86], [0.27, 0.94], [0.252, 1.01], [0.23, Y1]];
  const inner = [[0.208, Y1 - 0.004], [0.222, 1.0], [0.228, 0.93], [0.222, 0.85], [0.198, 0.76], [0.158, 0.66], [0.128, Y0]];
  const blade = [
    [inner[inner.length - 1][0], Y0, 'body'],   // first key = the side caps' finish
    ...outer.map(([r, y], i) => [r, y, i === 0 ? 'dark' : i < 2 ? 'trim' : 'body', i > 1 && i < outer.length - 1]),
    ...inner.map(([r, y], i) => [r, y, i === 0 ? 'trim' : 'shade', i > 0 && i < inner.length - 1]),
  ];
  // glowing rib proud of the outer edge (upper part of the blade)
  const ribPath = outer.slice(2);
  const nrm = (i) => {
    const a = ribPath[Math.max(0, i - 1)], b = ribPath[Math.min(ribPath.length - 1, i + 1)];
    const dr = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dr, dy);
    return [dy / L, -dr / L];
  };
  const rib = [
    ...ribPath.map(([r, y], i) => { const n = nrm(i); return [r + n[0] * 0.007, y + n[1] * 0.007, 'line']; }),
    ...ribPath.slice().reverse().map(([r, y], j) => { const n = nrm(ribPath.length - 1 - j); return [r - n[0] * 0.002, y - n[1] * 0.002, 'line']; }),
  ];
  // swirl + taper: angular half-width shrinks toward the tip, the whole blade twists around y
  const swirl = (g, centre, widthScale = 1) => {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const r = Math.hypot(x, z); let phi = Math.atan2(x, z) - centre;
      phi = Math.atan2(Math.sin(phi), Math.cos(phi));
      const k = Math.min(1, Math.max(0, (y - Y0) / (Y1 - Y0)));
      phi = phi * (1 - 0.5 * k) * widthScale + centre + TWIST * k * k * 0.9 + TWIST * k * 0.1;
      p.setXYZ(i, r * Math.sin(phi), y, r * Math.cos(phi));
    }
    g.computeVertexNormals();          // non-indexed -> flat facets (crisp blade planes)
    return g;
  };
  const tipAt = (centre) => {
    const phi = centre + TWIST;
    return [Math.sin(phi) * 0.222, Y1 + 0.008, Math.cos(phi) * 0.222];
  };
  const W = 0.34;                    // angular width of a blade at the root (radians)
  for (let i = 0; i < NV; i++) {
    const c = (i + 0.5) * TAU / NV;
    parts.push(swirl(hsLathe(THREE, color, blade, { seg: 4, phiStart: c - W / 2, phiLength: W, closed: true, caps: true }), c));
    parts.push(swirl(hsLathe(THREE, color, rib, { seg: 1, phiStart: c - 0.035, phiLength: 0.07, closed: true, caps: true }), c, 1.4));
    // bright bead on the tip: the dotted circle from above
    const [x, y, z] = tipAt(c);
    parts.push(prep(THREE, kit.place(new THREE.SphereGeometry(0.03, 10, 6), { x, y, z }), color, 'lineHi'));
  }

  // ---- the glowing heart in two crossed gimbal rings ----
  const HY = 0.8;
  parts.push(prep(THREE, kit.place(new THREE.IcosahedronGeometry(0.082, 2), { y: HY }), color, 'lineHi'));
  parts.push(prep(THREE, kit.place(new THREE.TorusGeometry(0.118, 0.01, 5, 28), { y: HY, rx: Math.PI / 2 + 0.55, ry: 0.4 }), color, 'trim'));
  parts.push(prep(THREE, kit.place(new THREE.TorusGeometry(0.104, 0.009, 5, 26), { y: HY, rx: Math.PI / 2 - 0.5, ry: -0.9 }), color, 'trim'));
  // spindle tying the heart to the collar (keeps it from looking detached in silhouette)
  parts.push(prep(THREE, kit.place(new THREE.CylinderGeometry(0.012, 0.03, 0.15, 8), { y: 0.65 }), color, 'trim'));
  // a thin crown hoop tying the vane tips together (reads as the coronet circle from above)
  parts.push(prep(THREE, kit.place(new THREE.TorusGeometry(0.218, 0.008, 4, 40), { y: Y1 - 0.012, rx: Math.PI / 2 }), color, 'trim'));

  return assemble(kit, color, parts);
}

/**
 * AI Core move "core spin" (≤ 350 ms at 1×): the core spins up on its pedestal (a quarter turn,
 * flash ring), lifts on its hover field and glides while spinning another turn and a half — a ring of
 * side-coloured motes streams off the vane tips — then settles with a spin-down and a ring pulse.
 * lift 60 -> glide 170–210 -> settle 55 ≈ 285–325 ms. Ends at ctx.to, rotation identity, scale 1.
 */
export async function coreSpin(ctx) {
  const { kit, piece, from, to, fx, color, THREE } = ctx;
  const pal = PAL[color] || PAL.w, cols = pal.spark, p = piece.position, H = 0.14;
  const dir = kit.flatDir(from, to), span = kit.flatDist(from, to);
  const UP = new THREE.Vector3(0, 1, 0);
  let spin = 0;
  const setSpin = a => { spin = a; piece.quaternion.setFromAxisAngle(UP, a); };
  fx?.ring?.(from, { radius: 0.48, color: cols[2], ms: 220 });
  fx?.flash?.(from.clone().setY(from.y + 0.8), { color: cols[1], radius: 0.35, ms: 120 });
  await ctx.tween(60, e => { p.y = from.y + H * e; setSpin(e * Math.PI * 0.5); }, kit.ease.quadOut);
  const ms = Math.min(210, 160 + ctx.dist * 14);
  let done = 0;
  const q = new THREE.Vector3();
  await ctx.tween(ms, (e, k) => {
    p.lerpVectors(from, to, e);
    p.y = from.y + H + 0.02 * Math.sin(k * Math.PI);
    setSpin(Math.PI * 0.5 + e * Math.PI * 3);
    kit.setLean(piece, dir, 0.1 * Math.sin(k * Math.PI), spin);
    // motes thrown off the vane tips, spawned evenly along the path (no burst on skip)
    if (ctx.tl?.instant) done = e * span;
    while (done + 0.09 <= e * span) {
      done += 0.09;
      const a = spin + done * 7;
      q.set(from.x + dir.x * done + Math.sin(a) * 0.24, from.y + H + 1.06, from.z + dir.z * done + Math.cos(a) * 0.24);
      fx?.burst({ pos: q, count: 1, colors: pal.trail, speed: [0.1, 0.4], spread: 1, life: [180, 300], size: [0.06, 0.09], sizeEnd: 0.02, drag: 2, gravity: 0.4, shape: 2, alpha: 0.9 });
    }
  }, kit.ease.sineInOut);
  const s0 = spin;
  await ctx.tween(55, e => {
    p.set(to.x, to.y + H * (1 - e), to.z);
    setSpin(s0 + (Math.PI * 4 - s0) * e);         // finish on whole turns: no snap at the end
  }, kit.ease.quadIn);
  piece.quaternion.identity(); p.copy(to);
  fx?.ring?.(to, { radius: 0.58, color: cols[2], ms: 240 });
  fx?.burst({ pos: to.clone().setY(to.y + 1.0), count: 10, colors: cols, speed: [0.5, 1.2], spread: 1, life: [160, 280], size: [0.03, 0.06], sizeEnd: 0.08, drag: 2.5, shape: 2 });
}
coreSpin.only = ['q']; coreSpin.weight = 5; coreSpin.label = 'core spin';
