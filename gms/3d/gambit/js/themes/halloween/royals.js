// Halloween royals (round 3): the Vampire Countess (queen) and the Pumpkin King (king).
// Same rules as pieces.js: vertex colours from SIDES, two materials (body + glow), faces
// look toward -z, base at y = 0.
//
// Overhead read: queen = a ring of bat-wing coronet points with bright beads (the dotted
// circle) around a glowing gem finial, framed by the collar crescent; king = a big crowned
// pumpkin with a "+" of crossed bones on top. King is the tallest piece, queen second.
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { SIDES, H } from './pieces.js';

const { PI, sin, cos, abs, hypot, atan2, pow, max, min } = Math;
const { col, mix, mul, sat, smooth, hash, noise, colorize, deform, wrap, refine, shape, plinth } = H;

/** Angular distance between two angles. */
const adist = (a, b) => { let d = abs(a - b) % (PI * 2); return d > PI ? PI * 2 - d : d; };

/**
 * A thin shell of revolution (capes, collars) as a capped lathe wedge.
 * mid(t) -> [r, y] runs from the bottom edge (t = 0) to the top edge (t = 1).
 */
function shell(kit, THREE, mid, { th = 0.012, n = 12, phiStart, phiLength, segments }) {
  const outer = [], inner = [];
  for (let i = 0; i <= n; i++) { const [r, y] = mid(i / n); outer.push(new THREE.Vector2(r + th / 2, y)); inner.push(new THREE.Vector2(max(0.001, r - th / 2), y)); }
  // outer surface runs upward, inner back down, so the lathe's normals face out / in
  const g = kit.latheSegment([...outer, ...inner.reverse()], phiStart, phiLength, segments);
  g.deleteAttribute('normal');                       // weld (kit.merge un-indexes) so later
  const w = mergeVertices(g, 1e-5); g.dispose();     // deforms get smooth, not faceted, normals
  w.computeVertexNormals();
  return w;
}
/** Radius of a shell's mid-line at height y (for inner / outer colouring). */
function midAt(mid, y, n = 40) {
  let best = 0, bd = 1e9;
  for (let i = 0; i <= n; i++) { const [r, yy] = mid(i / n); const d = abs(yy - y); if (d < bd) { bd = d; best = r; } }
  return best;
}

/**
 * Stretch the body between y0 and y1 by k and shift everything above it up, so the royals
 * stand taller than the knight's flames without elongating their heads.
 */
function lift(parts, y0, y1, k) {
  const f = y => (y <= y0 ? y : y <= y1 ? y0 + (y - y0) * k : y + (y1 - y0) * (k - 1));
  for (const p of parts) {
    const g = p.geom, pos = g.attributes.position, nrm = g.attributes.normal;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (nrm && y > y0 && y < y1) {                  // normals of a y-stretch: (nx, ny / k, nz)
        const nx = nrm.getX(i), ny = nrm.getY(i) / k, nz = nrm.getZ(i), L = hypot(nx, ny, nz) || 1;
        nrm.setXYZ(i, nx / L, ny / L, nz / L);
      }
      pos.setY(i, f(y));
    }
    pos.needsUpdate = true;
  }
}

// ----------------------------------------------------------------------- QUEEN
/**
 * Vampire Countess: a pale little countess in a long gown, a bat-hemmed cape, a towering
 * scalloped collar, a widow's-peak updo and a coronet of eight bat-wing points around a
 * glowing gem finial.
 */
export function queen(THREE, kit, { color }) {
  H.setThree(THREE);
  const s = SIDES[color], M = H.mats(kit, color), parts = [];
  const cl = col(s.gown), cs = col(s.gownShade), tr = col(s.trim);
  const cp = col(s.cape), cps = col(s.capeShade), ln = col(s.lining);
  const cr = col(s.crown), crs = col(s.crownShade), crt = col(s.crownTip);
  const pale = col(s.pale), ck = col(s.cheek);

  parts.push({ geom: plinth(kit, s, 0.31), mat: M.body });

  // --- gown: flared skirt, nipped waist, little shoulders
  const gp = kit.profile().pt(0.232, 0.056).bez(0.248, 0.1, 0.205, 0.17, 3).bez(0.125, 0.31, 0.09, 0.43, 7)
    .bez(0.084, 0.52, 0.102, 0.585, 4).bez(0.122, 0.615, 0.06, 0.648, 3).pt(0.034, 0.66).pt(0, 0.662);
  const gown = kit.lathe(gp.points(), { segments: 24 });
  deform(gown, (x, y, z) => {
    const r = hypot(x, z); if (r < 1e-4) return [x, y, z];
    const a = atan2(x, z), hem = smooth(0.13, 0.065, y), fold = smooth(0.08, 0.16, y) * smooth(0.42, 0.26, y);
    const k = 1 + hem * 0.07 * abs(sin(a * 4.5)) + fold * 0.05 * sin(a * 9);
    return [x * k, y, z * k];
  });
  colorize(kit, gown, (x, y, z) => {
    const a = atan2(x, z), fold = 0.5 + 0.5 * sin(a * 9), front = smooth(0.9, 0.2, adist(a, PI));
    let c = mix(cl, cs, 0.12 + 0.5 * (1 - fold) * smooth(0.1, 0.3, y) + 0.3 * smooth(0.14, 0.07, y));
    if (y < 0.1) c = mix(c, tr, 0.85 * smooth(0.062, 0.075, y));                           // hem trim
    if (y > 0.43 && y < 0.6) c = mix(c, mul(cs, 0.9), smooth(0.35, 0.6, front + (0.6 - y) * 0.8) * 0.75);  // V bodice
    if (y > 0.418 && y < 0.445) c = mix(c, tr, 0.9);                                       // waist sash
    return c;
  });
  parts.push({ geom: gown, mat: M.body });

  // --- cape: hangs from the shoulders to the floor behind, open at the front, bat-wing hem.
  // (colour first, while inner/outer is still a clean radius test, then sculpt)
  const capeMid = t => [0.258 - 0.134 * t + 0.016 * sin(t * PI), 0.07 + 0.538 * t];
  const cgap = 2.0, c0 = PI + cgap / 2;
  const cape = shell(kit, THREE, capeMid, { th: 0.012, n: 8, phiStart: c0, phiLength: PI * 2 - cgap, segments: 20 });
  colorize(kit, cape, (x, y, z) => {
    const r = hypot(x, z), a = atan2(x, z);
    if (r < midAt(capeMid, y) - 0.001) return mix(mul(ln, 0.7), ln, smooth(0.1, 0.5, y));     // lining
    const c = mix(cp, cps, 0.2 + 0.35 * (0.5 + 0.5 * sin(a * 6 + 0.4)) * smooth(0.55, 0.2, y) + 0.3 * smooth(0.25, 0.08, y));
    return mix(c, tr, 0.85 * smooth(0.1, 0.08, y));                                            // hem edge
  });
  deform(cape, (x, y, z) => {
    const a = atan2(x, z), u = (((a - c0) % (PI * 2)) + PI * 2) % (PI * 2) / (PI * 2 - cgap);
    const hem = smooth(0.14, 0.075, y), fold = 1 + 0.05 * sin(a * 6 + 0.4) * smooth(0.58, 0.2, y);
    return [x * fold, y + hem * 0.055 * pow(abs(sin(u * PI * 5)), 0.6), z * fold];
  });
  parts.push({ geom: cape, mat: M.body });

  // --- the towering collar: a scalloped fan rising behind the head (lining faces the head)
  const colMid = t => [0.1 + 0.1 * pow(t, 1.3), 0.6 + 0.31 * t];
  const kgap = 2.9, k0 = PI + kgap / 2;
  const collar = shell(kit, THREE, colMid, { th: 0.009, n: 6, phiStart: k0, phiLength: PI * 2 - kgap, segments: 22 });
  colorize(kit, collar, (x, y, z) => {
    const r = hypot(x, z), t = (y - 0.6) / 0.31;
    const c = r > midAt(colMid, y) ? mix(cps, cp, smooth(0.2, 0.9, t)) : mix(mul(ln, 0.6), ln, smooth(0.1, 0.8, t));
    return mix(c, mix(tr, [1, 1, 1], 0.15), smooth(0.86, 0.99, t) * 0.85);                 // trim on the rim
  });
  deform(collar, (x, y, z) => {
    const a = atan2(x, z), u = (((a - k0) % (PI * 2)) + PI * 2) % (PI * 2) / (PI * 2 - kgap), t = sat((y - 0.6) / 0.31);
    // 5 bat-wing points along the rim; the whole fan leans back (+z) away from the face
    return [x, y - smooth(0.6, 1, t) * 0.075 * pow(abs(sin(u * PI * 4)), 0.55), z + t * t * 0.05];
  });
  parts.push({ geom: collar, mat: M.body });

  // --- arms: sleeves in the cape colour, pale hands clasped at the waist
  for (const sx of [-1, 1]) {
    const arm = new THREE.CapsuleGeometry(0.028, 0.12, 3, 8);
    colorize(kit, arm, (x, y) => mix(cp, cps, smooth(0.06, -0.08, y)));
    const hand = kit.place(kit.sphere(0.024, 8, 6), { y: -0.09 });
    colorize(kit, hand, () => pale);
    const g = kit.merge([arm, hand]); arm.dispose(); hand.dispose();
    parts.push({ geom: kit.place(g, { rz: sx * 0.42, rx: 0.62, x: sx * 0.096, y: 0.5, z: -0.045 }), mat: M.body });
  }

  // --- neck, head and face (looks toward -z)
  const hy = 0.79, hr = 0.098;
  parts.push({ geom: colorize(kit, kit.place(kit.cylinder(0.034, 0.042, 0.09, 10), { y: 0.69 }), () => mul(pale, 0.85)), mat: M.body });
  const head = kit.place(kit.sphere(hr, 16, 12), { y: hy, sy: 0.96 });
  colorize(kit, head, (x, y, z) => {
    const c = mix(pale, mul(pale, 0.78), smooth(hy - 0.02, hy - hr, y) * 0.5);
    const cheek = Math.exp(-((abs(x) - 0.05) ** 2 + (y - hy + 0.026) ** 2) / 0.0004) * smooth(0, -0.06, z);
    return mix(c, ck, cheek * 0.6);
  });
  parts.push({ geom: head, mat: M.body });
  const dark = col(s.outline);
  for (const sx of [-1, 1]) {
    // big sleepy-cute eyes with lashes flicked outward, and a glint
    parts.push({ geom: colorize(kit, kit.place(kit.sphere(0.019, 10, 8), { x: sx * 0.036, y: hy + 0.002, z: -hr + 0.013, sy: 1.15, sz: 0.65 }), () => dark), mat: M.body });
    parts.push({ geom: colorize(kit, kit.place(kit.sphere(0.0055, 6, 4), { x: sx * 0.036 + 0.006, y: hy + 0.01, z: -hr + 0.002 }), () => [1, 1, 1]), mat: M.body });
    const lash = kit.place(kit.cylinder(0.002, 0.0045, 0.022, 5), { rz: -sx * 1.05, x: sx * 0.058, y: hy + 0.014, z: -hr + 0.03 });
    parts.push({ geom: colorize(kit, lash, () => dark), mat: M.body });
  }
  // small smile with two little fangs
  const smile = kit.place(new THREE.TorusGeometry(0.018, 0.0042, 4, 10, PI * 0.8), { rz: PI + PI * 0.1, y: hy - 0.034, z: -hr + 0.012 });
  parts.push({ geom: colorize(kit, kit.ensureColor(smile), () => col(s.lips)), mat: M.body });
  for (const sx of [-1, 1]) {
    const fang = kit.place(kit.cylinder(0.0, 0.0052, 0.016, 5), { rx: PI, x: sx * 0.009, y: hy - 0.049, z: -hr + 0.017 });
    parts.push({ geom: colorize(kit, fang, () => [1, 1, 1]), mat: M.body });
  }

  // --- hair: a widow's-peak cap (front vertices below the hairline tuck inside the head) + bun
  const hh = col(s.vampHair);
  const hair = kit.place(kit.sphere(0.106, 18, 12), { y: hy + 0.008 });
  deform(hair, (x, y, z) => {
    const yl = hy + 0.052 - 0.05 * max(0, 1 - abs(x) / 0.055);          // V-shaped widow's peak
    const front = smooth(-0.02, -0.07, z);
    if ((front > 0.3 && y < yl) || y < hy - 0.035) { const k = 0.82; return [x * k, hy + (y - hy) * k, z * k]; }
    return [x, y, z];
  });
  colorize(kit, hair, (x, y) => mix(mul(hh, 0.8), mix(hh, [1, 1, 1], 0.12), smooth(hy, hy + 0.1, y)));
  parts.push({ geom: hair, mat: M.body });
  const bun = kit.place(kit.sphere(0.042, 12, 8), { y: hy + 0.105, sy: 0.85 });
  colorize(kit, bun, (x, y) => mix(hh, mix(hh, [1, 1, 1], 0.18), smooth(hy + 0.09, hy + 0.14, y)));
  parts.push({ geom: bun, mat: M.body });

  // --- coronet: a band with eight bat-wing points, each tipped with a bright bead
  const by = hy + 0.05, bR = 0.098;
  const band = kit.lathe(kit.profile().pt(bR - 0.006, by).pt(bR + 0.004, by + 0.002).pt(bR + 0.006, by + 0.024).pt(bR - 0.004, by + 0.026).pt(bR - 0.006, by).points(), { segments: 24 });
  colorize(kit, band, (x, y) => mix(crs, cr, smooth(by, by + 0.024, y)));
  parts.push({ geom: band, mat: M.body });
  const wing = [[-0.026, 0], [0.026, 0], [0.03, 0.03], [0.017, 0.028], [0.014, 0.05], [0.006, 0.046], [0, 0.088],
    [-0.006, 0.046], [-0.014, 0.05], [-0.017, 0.028], [-0.03, 0.03]].map(([u, v]) => [u * 1.15, v * 1.3]);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * PI * 2 + PI / 8;
    const w = kit.extrude(shape(wing), { depth: 0.01, bevel: 0, curveSegments: 1 });
    colorize(kit, w, (x, y) => mix(crs, mix(cr, crt, 0.4), smooth(0.0, 0.07, y)));
    const bead = kit.place(kit.sphere(0.018, 6, 4), { y: 0.12 });
    colorize(kit, bead, () => crt);
    const g = kit.merge([w, bead]); w.dispose(); bead.dispose();
    kit.place(g, { rx: 0.68 });                                           // lean outward: a wide ring from above
    kit.place(g, { ry: a, x: sin(a) * (bR + 0.002), z: cos(a) * (bR + 0.002), y: by + 0.008 });
    parts.push({ geom: g, mat: M.body });
  }

  // --- centre finial: a little post and a glowing gem (the bright centre dot from above)
  const post = kit.lathe(kit.profile().pt(0, hy + 0.13).pt(0.022, hy + 0.13).bez(0.01, hy + 0.15, 0.009, hy + 0.18, 2).pt(0.02, hy + 0.19).pt(0, hy + 0.196).points(), { segments: 10 });
  colorize(kit, post, (x, y) => mix(crs, cr, smooth(hy + 0.13, hy + 0.19, y)));
  parts.push({ geom: post, mat: M.body });
  const gem = kit.place(new THREE.OctahedronGeometry(0.04, 0), { y: hy + 0.236, sy: 1.4 });
  parts.push({ geom: kit.ensureColor(gem), mat: M.glow });
  parts.push({ geom: colorize(kit, kit.place(kit.sphere(0.009, 6, 4), { y: hy + 0.287 }), () => crt), mat: M.body });

  // brooch where the collar meets at the throat
  parts.push({ geom: colorize(kit, kit.place(kit.sphere(0.02, 10, 6), { y: 0.625, z: -0.088, sz: 0.6 }), () => cr), mat: M.body });

  lift(parts, 0.06, 0.62, 1.19);                                          // tall and elegant: ~1.19 overall
  return kit.piece(parts);
}

// ------------------------------------------------------------------------ KING
/** A cartoon bone along +y, centred: shaft plus a pair of knobbly condyles at each end. */
function bone(kit, len, r, c) {
  const shaft = kit.cylinder(r * 0.85, r * 0.85, len, 8);
  deform(shaft, (x, y, z) => { const k = 1 + 0.25 * pow(abs(y) / (len / 2), 3); return [x * k, y, z * k]; });
  const g = [shaft];
  for (const ey of [-1, 1]) for (const ex of [-1, 1]) g.push(kit.place(kit.sphere(r * 1.32, 6, 4), { x: ex * r * 0.95, y: ey * (len / 2 + r * 0.15) }));
  const m = kit.merge(g); g.forEach(q => q.dispose());
  return colorize(kit, m, (x, y, z) => mul(c, 0.86 + 0.14 * smooth(-r, r, z + y * 0.1)));
}

/**
 * Pumpkin King: a regal jack-o'-lantern on a robed body with an ermine collar and a royal
 * mantle, a crown with bead-tipped points, and a cross of bones on top (a "+" from above).
 */
export function king(THREE, kit, { color }) {
  H.setThree(THREE);
  const s = SIDES[color], M = H.mats(kit, color), parts = [];
  const cl = col(s.cloak), cs = col(s.cloakShade), tr = col(s.trim);
  const ry = col(s.royal), rys = col(s.royalShade), er = col(s.ermine), es = col(s.ermineSpot);
  const cr = col(s.crown), crs = col(s.crownShade), crt = col(s.crownTip);

  parts.push({ geom: plinth(kit, s, 0.33), mat: M.body });

  // --- robe: a stout bell with a row of buttons
  const rp = kit.profile().pt(0.248, 0.056).bez(0.268, 0.1, 0.245, 0.17, 3).bez(0.18, 0.36, 0.148, 0.47, 6).bez(0.13, 0.53, 0.07, 0.56, 3).pt(0, 0.565);
  const robe = kit.lathe(rp.points(), { segments: 28 });
  deform(robe, (x, y, z) => { const r = hypot(x, z); if (r < 1e-4) return [x, y, z]; const k = 1 + 0.035 * sin(atan2(x, z) * 8) * smooth(0.08, 0.2, y) * smooth(0.45, 0.25, y); return [x * k, y, z * k]; });
  colorize(kit, robe, (x, y, z) => {
    const a = atan2(x, z);
    let c = mix(cl, cs, 0.12 + 0.4 * (0.5 - 0.5 * sin(a * 8)) * smooth(0.08, 0.3, y) + 0.3 * smooth(0.15, 0.07, y));
    if (y < 0.1) c = mix(c, tr, 0.85 * smooth(0.062, 0.075, y));
    if (adist(a, PI) < 0.09 && y > 0.12) c = mix(c, er, 0.9);                     // ermine placket down the front
    return c;
  });
  parts.push({ geom: robe, mat: M.body });
  for (let i = 0; i < 3; i++) {
    const y = 0.2 + i * 0.1, r = 0.255 - (y - 0.17) * 0.36;
    parts.push({ geom: colorize(kit, kit.place(kit.sphere(0.016, 8, 6), { y, z: -min(0.25, r + 0.0), sz: 0.6 }), () => cr), mat: M.body });
  }

  // --- royal mantle: open at the front, ermine-lined edges and hem
  const manMid = t => [0.29 - 0.15 * t + 0.02 * sin(t * PI), 0.072 + 0.47 * t];
  const mgap = 1.25, m0 = PI + mgap / 2;
  const mantle = shell(kit, THREE, manMid, { th: 0.016, n: 8, phiStart: m0, phiLength: PI * 2 - mgap, segments: 20 });
  colorize(kit, mantle, (x, y, z) => {
    const r = hypot(x, z), a = atan2(x, z), out = r > midAt(manMid, y) - 0.001;
    if (adist(a, PI) < mgap / 2 + 0.16 || y < 0.105) return mix(er, mul(er, 0.82), noise(x * 30, y * 30, z * 30));   // ermine edging
    if (!out) return mix(mul(rys, 1.1), ry, 0.3);
    return mix(ry, rys, 0.2 + 0.4 * (0.5 - 0.5 * sin(a * 5 + 1)) * smooth(0.5, 0.15, y));
  });
  deform(mantle, (x, y, z) => { const a = atan2(x, z), k = 1 + 0.04 * sin(a * 5 + 1) * smooth(0.5, 0.15, y); return [x * k, y, z * k]; });
  parts.push({ geom: mantle, mat: M.body });

  // --- ermine collar: a fat ring on the shoulders (a light ring from above) with ermine tails
  const collar = kit.place(new THREE.TorusGeometry(0.135, 0.046, 8, 28), { rx: PI / 2, y: 0.548 });
  deform(collar, (x, y, z) => [x, 0.548 + (y - 0.548) * 0.72, z]);
  colorize(kit, collar, (x, y, z) => mul(er, 0.82 + 0.18 * smooth(0.52, 0.575, y)));
  parts.push({ geom: collar, mat: M.body });
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * PI * 2 + 0.2, rr = 0.165 + 0.012 * (i % 2), yy = 0.565 - 0.012 * (i % 2);
    const tail = kit.place(kit.sphere(0.011, 5, 3), { sy: 0.55, sz: 1.7 });
    kit.place(tail, { ry: a, x: sin(a) * rr, y: yy, z: cos(a) * rr });
    parts.push({ geom: colorize(kit, tail, () => es), mat: M.body });
  }
  // the same tails down the mantle's ermine front edges
  for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) {
    const y = 0.17 + i * 0.13, a = PI + sx * (mgap / 2 + 0.08), rr = manMid((y - 0.072) / 0.47)[0] + 0.012;
    const tail = kit.place(kit.sphere(0.01, 5, 3), { sy: 1.7, sz: 0.55 });
    kit.place(tail, { ry: a, x: sin(a) * rr, y, z: cos(a) * rr });
    parts.push({ geom: colorize(kit, tail, () => es), mat: M.body });
  }

  // --- arms: royal sleeves with ermine cuffs and dark mitts; one hand holds a short sceptre
  const handAt = {};
  for (const sx of [-1, 1]) {
    const arm = new THREE.CapsuleGeometry(0.036, 0.1, 3, 8);
    colorize(kit, arm, (x, y) => mix(ry, rys, smooth(0.05, -0.07, y)));
    const cuff = kit.place(new THREE.TorusGeometry(0.036, 0.014, 5, 10), { rx: PI / 2, y: -0.055 });
    colorize(kit, cuff, () => er);
    const mitt = kit.place(kit.sphere(0.032, 7, 5), { y: -0.085 });
    colorize(kit, mitt, () => col(s.outline));
    const g = kit.merge([arm, cuff, mitt]); [arm, cuff, mitt].forEach(q => q.dispose());
    const T = { rz: sx * 0.42, rx: 0.95, x: sx * 0.14, y: 0.44, z: -0.075 };
    handAt[sx] = new THREE.Vector3(0, -0.085, 0).applyEuler(new THREE.Euler(T.rx, 0, T.rz)).add(new THREE.Vector3(T.x, T.y, T.z));
    parts.push({ geom: kit.place(g, T), mat: M.body });
  }
  {
    const st = kit.cylinder(0.011, 0.011, 0.34, 7);
    colorize(kit, st, () => crs);
    const orb = kit.place(kit.sphere(0.03, 10, 8), { y: 0.19 });
    colorize(kit, orb, (x, y) => mix(cr, crt, smooth(0.18, 0.22, y)));
    const g = kit.merge([st, orb]); st.dispose(); orb.dispose();
    const h = handAt[1];
    parts.push({ geom: kit.place(g, { rz: -0.12, x: h.x + 0.004, y: h.y + 0.03, z: h.z }), mat: M.body });
  }

  // --- pumpkin head (bigger and squatter than the imp's), carved face toward -z
  const cy = 0.71, A = 0.2, B = 0.158;
  // ribs are softened across the face so the carved decals sit flush
  const faceK = a => 0.8 * smooth(0.8, 0.3, adist(a, PI));
  const lobe = a => { const l = 0.9 + 0.1 * pow(abs(cos(4 * a)), 0.55); return l + (0.975 - l) * faceK(a); };
  const ell = y => A * Math.sqrt(max(0, 1 - ((y - cy) / B) ** 2));
  const R = (a, y) => ell(y) * lobe(a);
  const hp = kit.profile().pt(0, cy - B + 0.03);
  for (let i = 0; i <= 14; i++) { const f = (-80 + (160 * i) / 14) * PI / 180; hp.pt(A * cos(f), cy + B * sin(f)); }
  hp.pt(0.014, cy + B - 0.024).pt(0, cy + B - 0.032);
  const head = kit.lathe(hp.points(), { segments: 40 });
  deform(head, (x, y, z) => { const k = lobe(atan2(x, z)); return [x * k, y, z * k]; });
  const pk = col(s.pumpkin), crz = col(s.crease), pt = col(s.pumpkinTop);
  colorize(kit, head, (x, y, z) => {
    const a = atan2(x, z), crease = pow(1 - abs(cos(4 * a)), 2.2) * (1 - faceK(a) * 0.7), t = (y - cy) / B;
    let c = mix(pk, pt, smooth(0.1, 0.8, t) * 0.55 * (1 - crease));
    c = mix(c, crz, min(0.85, crease * 0.9 + smooth(0.75, 1.0, t) * 0.35));
    return mul(c, 0.78 + 0.22 * smooth(-1, 0.1, t));
  });
  parts.push({ geom: head, mat: M.body });

  // carved face: proud slanted eyes, a nose and a wide grin with three teeth
  const face = [
    { pts: [[-0.112, 0.012], [-0.03, 0.02], [-0.05, 0.072]] },
    { pts: [[0.112, 0.012], [0.03, 0.02], [0.05, 0.072]] },
    { pts: [[-0.016, -0.016], [0.016, -0.016], [0, 0.01]] },
    { pts: [[-0.118, -0.03], [-0.07, -0.05], [-0.05, -0.036], [-0.036, -0.05], [0.036, -0.05], [0.05, -0.036], [0.07, -0.05], [0.118, -0.03],
            [0.09, -0.082], [0.03, -0.104], [0.02, -0.08], [-0.02, -0.08], [-0.03, -0.104], [-0.09, -0.082]] },
  ];
  for (const f of face) {
    for (const [scale, lift, mat, tc] of [[1.0, 0.0035, M.glow, null], [1.26, 0.0015, M.body, s.outline]]) {
      const fx = f.pts.reduce((m, q) => m + q[0], 0) / f.pts.length, fy = f.pts.reduce((m, q) => m + q[1], 0) / f.pts.length;
      const g = kit.extrude(shape(f.pts.map(([u, v]) => [fx + (u - fx) * scale, fy + (v - fy) * scale])), { depth: 0.02, bevel: 0, curveSegments: 1 });
      const w = wrap(kit, refine(g, 0.036), { theta: PI, y0: cy, R, lift, d: 0.02 });
      if (tc) colorize(kit, w, () => col(tc));
      parts.push({ geom: w, mat });
    }
  }

  // --- crown: a flared band whose top is cut into six points, a bead on each tip
  const cY = cy + 0.1, cH = 0.04, cP = 0.085, nP = 6;
  const rIn = R(0, cY) * 0.93, flare = 0.03;
  const cprof = kit.profile().pt(rIn - 0.004, cY - 0.004).pt(rIn + 0.012, cY - 0.006).pt(rIn + 0.016 + flare * 0.4, cY + cH * 0.5)
    .pt(rIn + 0.018 + flare, cY + cH + cP).pt(rIn + 0.006 + flare, cY + cH + cP + 0.004).pt(rIn - 0.002 + flare * 0.6, cY + cH * 0.5).pt(rIn - 0.004, cY - 0.004);
  const crown = kit.lathe(cprof.points(), { segments: nP * 8 });
  const tri = a => { const u = ((a / (PI * 2)) * nP % 1 + 1) % 1; return 1 - abs(u - 0.5) * 2; };   // 1 at point centres
  deform(crown, (x, y, z) => {
    if (y <= cY + cH) return [x, y, z];
    const t = (y - cY - cH) / (cP + 0.004), a = atan2(x, z);
    return [x, cY + cH + t * (cP + 0.004) * pow(tri(a), 1.6), z];
  });
  colorize(kit, crown, (x, y, z) => mix(crs, mix(cr, crt, 0.25), smooth(cY, cY + cH + cP * 0.6, y) * (0.7 + 0.3 * smooth(rIn, rIn + 0.02, hypot(x, z)))));
  parts.push({ geom: crown, mat: M.body });
  for (let i = 0; i < nP; i++) {
    const a = ((i + 0.5) / nP) * PI * 2, rr = rIn + 0.012 + flare;
    parts.push({ geom: colorize(kit, kit.place(kit.sphere(0.015, 8, 6), { x: sin(a) * rr, y: cY + cH + cP + 0.006, z: cos(a) * rr }), () => crt), mat: M.body });
  }
  // the crown's glowing gem, front and centre (between two points)
  const ga = PI, gr = rIn + 0.02 + flare * 0.25;
  parts.push({ geom: kit.ensureColor(kit.place(new THREE.OctahedronGeometry(0.02, 0), { sx: 0.8, sy: 1.25, sz: 0.5, x: sin(ga) * gr, y: cY + cH * 0.55, z: cos(ga) * gr })), mat: M.glow });

  // --- cross of bones: an upright plus two crossing bars (the "+" from above), a vine curl
  const bc = col(s.boneTop), bm = mix(col(s.bone), bc, 0.5);
  const yTop = cy + B - 0.01;
  parts.push({ geom: kit.place(bone(kit, 0.34, 0.018, bm), { y: yTop + 0.17 }), mat: M.body });
  const yBar = yTop + 0.235;
  parts.push({ geom: kit.place(bone(kit, 0.26, 0.016, bc), { rz: PI / 2, y: yBar }), mat: M.body });
  parts.push({ geom: kit.place(bone(kit, 0.26, 0.016, bc), { rx: PI / 2, y: yBar + 0.004 }), mat: M.body });
  const vine = kit.place(new THREE.TorusGeometry(0.028, 0.006, 5, 14, PI * 1.6), { rx: PI / 2 - 0.3, ry: 0.5, y: yTop + 0.035 });
  parts.push({ geom: colorize(kit, kit.ensureColor(vine), () => col(s.stem)), mat: M.body });
  const leaf = kit.extrude(shape([[0, 0], [0.025, 0.02], [0.028, 0.05], [0, 0.075], [-0.028, 0.05], [-0.025, 0.02]]), { depth: 0.008, bevel: 0.002, bevelSegments: 1, curveSegments: 1 });
  colorize(kit, leaf, (x, y) => mix(mul(col(s.leaf), 0.65), col(s.leaf), smooth(0, 0.06, y)));
  parts.push({ geom: kit.place(kit.place(leaf, { rx: 1.2 }), { ry: 2.2, x: 0.03, y: yTop + 0.03, z: 0.02 }), mat: M.body });

  lift(parts, 0.06, 0.55, 1.2);                                           // the tallest piece: ~1.32
  return kit.piece(parts);
}

export default { q: queen, k: king };
