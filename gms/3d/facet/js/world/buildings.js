// The village: the plots, the streets they stand on, and everything built on them. Runs first of
// the four art modules, so what it publishes to ctx.village is the composition the rest fit around.

import * as THREE from 'three';
import {
  Mesh, block as _block, prism as _prism, spire as _spire, loft as _loft,
  ringRect, ringCircle, scaleRing, speckle, transform, matrix, mix, shade, blob,
} from './shape.js';

const D2R = Math.PI / 180;
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// ── local kit ─────────────────────────────────────────────────────────────────────────────────

function normalOf(a, b, c) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  return [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
}

// Emits a quad wound so its normal agrees with `ref`. Every hand-built face here goes through it:
// a reversed winding is an invisible hole in a single-sided material, and hunting those by eye
// costs more than the dot product does.
function q(m, a, b, c, d, col, ref) {
  const n = normalOf(a, b, c);
  if (ref && n[0] * ref[0] + n[1] * ref[1] + n[2] * ref[2] < 0) m.quad(a, d, c, b, col);
  else m.quad(a, b, c, d, col);
}

function t3(m, a, b, c, col, ref) {
  const n = normalOf(a, b, c);
  if (ref && n[0] * ref[0] + n[1] * ref[1] + n[2] * ref[2] < 0) m.tri(a, c, b, col);
  else m.tri(a, b, c, col);
}

// shape.js's loft() winds its side quads toward the axis, so every lofted form comes back
// inside-out and shades as if lit from behind. Re-winding each triangle against the form's own
// centroid fixes it for the convex solids this file builds, and is a no-op once the kit is fixed.
function orient(geo) {
  const p = geo.attributes.position.array, c = geo.attributes.color?.array;
  const n = p.length / 3;
  let cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < p.length; i += 3) { cx += p[i]; cy += p[i + 1]; cz += p[i + 2]; }
  cx /= n; cy /= n; cz /= n;
  for (let i = 0; i < p.length; i += 9) {
    const nr = normalOf([p[i], p[i + 1], p[i + 2]], [p[i + 3], p[i + 4], p[i + 5]], [p[i + 6], p[i + 7], p[i + 8]]);
    const dx = (p[i] + p[i + 3] + p[i + 6]) / 3 - cx;
    const dy = (p[i + 1] + p[i + 4] + p[i + 7]) / 3 - cy;
    const dz = (p[i + 2] + p[i + 5] + p[i + 8]) / 3 - cz;
    if (nr[0] * dx + nr[1] * dy + nr[2] * dz < 0) {
      for (let k = 0; k < 3; k++) {
        let t = p[i + 3 + k]; p[i + 3 + k] = p[i + 6 + k]; p[i + 6 + k] = t;
        if (c) { t = c[i + 3 + k]; c[i + 3 + k] = c[i + 6 + k]; c[i + 6 + k] = t; }
      }
    }
  }
  geo.computeVertexNormals();
  return geo;
}

const block = (...a) => orient(_block(...a));
const prism = (...a) => orient(_prism(...a));
const spire = (...a) => orient(_spire(...a));
const loft = (...a) => orient(_loft(...a));

// A tapered 5-gon laid along +X from the origin. Every piece of timber in the village is one of
// these — posts, rails, sail spars, hoist beams — because a round bar cannot read as a box.
const bar = (len, r, { sides = 5, taper = 0.84, col = '#fff', rot = 0.4 } = {}) =>
  transform(prism(sides, r, r * taper, len, { rot, col }), { rz: -Math.PI / 2 });

const post = (h, r, { sides = 5, taper = 0.78, col = '#fff', rot = 0.5 } = {}) =>
  prism(sides, r, r * taper, h, { rot, col });

const slab = (w, h, d, { cut = 0.05, col = '#fff', taper = 0.05 } = {}) =>
  loft([ringRect(w, d, 0, cut), ringRect(w * (1 - taper), d * (1 - taper), h, cut)], { col });

// shape.js's block() lofts a single band between its chamfers, so a colour callback has exactly
// one `t` to work with and a wall can never carry a vertical gradient. This is the same form with
// the wall subdivided, which is the whole reason it exists.
function wallBlock(w, h, d, { cut = 0.12, taper = 0.06, shear = 0, rings = 4, col } = {}) {
  const c = Math.min(cut, h * 0.22);
  const stack = [ringRect(w * 0.965, d * 0.965, 0, c * 1.5), ringRect(w, d, c, c)];
  for (let i = 1; i <= rings; i++) {
    const t = i / rings, k = 1 - taper * t;
    stack.push(ringRect(w * k, d * k, c + (h - 2 * c) * t, c));
  }
  stack.push(ringRect(w * (1 - taper) * 0.97, d * (1 - taper) * 0.97, h, c * 1.5));
  return loft(stack.map(r => r.map(v => [v[0] + shear * (v[1] / h), v[1], v[2]])), { col });
}

// Vertical ramp + dark foot + bright chamfer facets, as one loft colour callback. `bands` is the
// number of ring-pairs the form lofts; band 0 is the bottom chamfer and band bands-1 the top.
function wallColor(tri, rng, { bands = 3, grad = 0.5, foot = 0.36, edge = 0.26, jit = 0.05 } = {}) {
  const [mid, light, dark] = tri;
  return (r, i, t) => {
    if (r < 0) return shade(dark, -0.34);
    if (r >= bands) return shade(light, 0.12);
    const v = mix(mix(dark, mid, 0.66), light, Math.pow(t, 1.1) * grad);
    let a = (rng() - 0.5) * jit;
    if (r === 0) a -= foot;
    else if (r === bands - 1) a += edge * 1.2;
    else if ((i & 1) === 1) a += edge * 0.8;   // ringRect corner chamfer facets
    return shade(v, a);
  };
}

// Where a wall face actually is, given the taper and the lean. `u` is in world units from the
// face centre; without this every shutter and door would either float or sink into the plaster.
function facer(w, d, h, cut, taper, shear, y0 = 0) {
  const k = y => 1 - taper * clamp((y - cut) / (h - 2 * cut), 0, 1);
  return (side, u, y, out = 0.03) => {
    const s = shear * (y / h), kx = (w / 2) * k(y), kz = (d / 2) * k(y);
    const Y = y + y0;
    if (side === 0) return [kx + out + s, Y, u];
    if (side === 1) return [-kx - out + s, Y, u];
    if (side === 2) return [u + s, Y, kz + out];
    return [u + s, Y, -kz - out];
  };
}
const OUTN = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]];
// local facing yaw per face, in the same convention ctx.place() uses for ry
const LA = [0, Math.PI, -Math.PI / 2, Math.PI / 2];

function panel(m, F, side, u0, u1, y0, y1, out, col) {
  q(m, F(side, u0, y0, out), F(side, u1, y0, out), F(side, u1, y1, out), F(side, u0, y1, out), col, OUTN[side]);
}

function windowOn(m, F, side, u, hw, y0, y1, { frame, glass, shutter = null }) {
  panel(m, F, side, u - hw, u + hw, y0, y1, 0.004, glass);
  panel(m, F, side, u - hw - 0.09, u + hw + 0.09, y0 - 0.14, y0, 0.10, shade(frame, 0.26));
  panel(m, F, side, u - hw - 0.07, u + hw + 0.07, y1, y1 + 0.11, 0.075, shade(frame, 0.1));
  panel(m, F, side, u - hw - 0.07, u - hw, y0, y1, 0.055, frame);
  panel(m, F, side, u + hw, u + hw + 0.07, y0, y1, 0.055, shade(frame, -0.12));
  if (shutter) {
    panel(m, F, side, u - hw - 0.09 - hw * 0.9, u - hw - 0.05, y0 - 0.02, y1 + 0.02, 0.095, shutter);
    panel(m, F, side, u + hw + 0.05, u + hw + 0.09 + hw * 0.9, y0 - 0.02, y1 + 0.02, 0.095, shade(shutter, -0.1));
  }
}

function doorOn(m, F, side, u, hw, h, { leaf, frame }) {
  panel(m, F, side, u - hw, u + hw, 0.02, h, 0.045, leaf);
  panel(m, F, side, u - hw - 0.03, u - hw, 0.0, h + 0.04, 0.085, shade(frame, 0.1));
  panel(m, F, side, u + hw, u + hw + 0.03, 0.0, h + 0.04, 0.085, shade(frame, -0.08));
  panel(m, F, side, u - hw - 0.05, u + hw + 0.05, h, h + 0.14, 0.085, shade(frame, 0.24));
  // one plank line, off centre, so the leaf is not a mirror of itself
  panel(m, F, side, u - hw * 0.18, u + hw * 0.02, 0.06, h - 0.05, 0.055, shade(leaf, -0.16));
}

// Gabled roof as stepped tile courses: each course sits a little further out than the one above
// it, so the step between them is a hard shadow line. Three or four is plenty — modelling
// individual tiles at this scale buys nothing but triangles.
function tiledRoof(w, d, pitch, {
  over = 0.42, overZ = 0.5, courses = 4, thick = 0.5, col, rng,
  ridgeBar = 0.16, gable = null, drop = 0.24, sides = [1, -1],
} = {}) {
  const m = new Mesh();
  const W = w / 2 + over, D = d / 2 + overZ;
  const h = W * Math.tan(pitch * D2R);
  const [mid, light, dark] = col;
  const L = Math.hypot(h, W);
  const o = c => thick * (1 - 0.88 * c / courses);
  const strip = (A, B, c, ref) => q(m,
    [A[0], A[1], -D], [B[0], B[1], -D], [B[0], B[1], D], [A[0], A[1], D], c, ref);

  for (const s of sides) {
    const n = [s * h / L, W / L];
    const up = [s * 0.9, 0.45, 0], down = [s * 0.5, -0.9, 0];
    for (let c = 0; c < courses; c++) {
      const t0 = c / courses, t1 = (c + 1) / courses;
      const oc = o(c), on = c + 1 < courses ? o(c + 1) : o(courses - 1) * 0.35;
      const b0 = [s * W * (1 - t0), h * t0], b1 = [s * W * (1 - t1), h * t1];
      const A = [b0[0] + n[0] * oc, b0[1] + n[1] * oc];
      const B = [b1[0] + n[0] * oc, b1[1] + n[1] * oc];
      const C = [b1[0] + n[0] * on, b1[1] + n[1] * on];
      const cc = mix(mix(dark, mid, 0.22 + 0.6 * t0), light, Math.pow(t0, 2.2) * 0.38);
      strip(A, B, shade(cc, (c % 2 ? 0.13 : -0.11) + (rng() - 0.5) * 0.05 + (s > 0 ? 0.13 : -0.12)), up);
      strip(B, C, shade(dark, -0.4), down);
      for (const z of [-D, D]) {
        q(m, [b0[0], b0[1], z], [b1[0], b1[1], z], [B[0], B[1], z], [A[0], A[1], z],
          shade(dark, c % 2 ? 0.1 : -0.02), [0, 0, Math.sign(z)]);
      }
    }
    strip([s * W, -drop], [s * W + n[0] * o(0), n[1] * o(0)], shade(dark, -0.34), [s, -0.55, 0]);
  }

  if (ridgeBar && sides.length > 1) {
    m.add(bar(D * 2, ridgeBar, { col: shade(light, 0.14) }),
      matrix({ pos: [0, h + ridgeBar * 0.2, -D], ry: -Math.PI / 2 }));
  }
  if (gable) {
    const gw = gable.w / 2, gd = gable.d / 2, gh = gw * Math.tan(pitch * D2R);
    for (const z of [gd, -gd]) {
      t3(m, [-gw, -0.05, z], [gw, -0.05, z], [0, gh, z], gable.col, [0, 0, Math.sign(z)]);
    }
  }
  return m;
}

// ── buildings ─────────────────────────────────────────────────────────────────────────────────

function chimney(rng, { h, r, col, capCol }) {
  const m = new Mesh();
  m.add(prism(7, r, r * 0.8, h, { rings: 3, rot: rng.range(0, 1), col: wallColor(col, rng, { bands: 3, foot: 0.2, edge: 0.2 }) }));
  m.add(prism(7, r * 1.34, r * 1.18, 0.22, { rot: rng.range(0, 1), col: shade(capCol, 0.16) }), matrix({ pos: [0, h, 0] }));
  m.add(prism(5, r * 0.5, r * 0.42, 0.16, { col: shade(capCol, -0.4) }), matrix({ pos: [0, h + 0.2, 0] }));
  return m;
}

function house(rng, o) {
  const {
    w, d, wallH, pitch = 38, wallTri, roofTri, trimTri, stoneTri,
    plinth = 0.3, jetty = 0, upperH = 0, roofCourses = 4, roofThick = 0.5,
    porch = 0, leanTo = 0, annexe = null, accentCol = null, timber = 0, chimneySide = 1,
  } = o;
  const m = new Mesh();
  const A = { windows: [], door: null, chimney: null };
  const cut = Math.min(0.24, Math.min(w, d) * 0.075);
  const taper = 0.055;
  const shear = wallH * Math.tan(rng.range(1.6, 3.6) * D2R) * (rng.chance(0.5) ? 1 : -1);

  if (plinth > 0.02) {
    m.add(loft([
      ringRect(w * 1.05, d * 1.05, 0, cut * 1.4),
      ringRect(w * 1.02, d * 1.02, plinth, cut * 1.2),
    ], { col: wallColor(stoneTri, rng, { bands: 1, foot: 0.3, edge: 0.2 }) }));
  }

  const y0 = plinth;
  m.add(wallBlock(w, wallH, d, { cut, taper, shear, col: wallColor(wallTri, rng) }), matrix({ pos: [0, y0, 0] }));
  const F = facer(w, d, wallH, cut, taper, shear, y0);

  // timber frame: proud strips on the two long faces, never mirrored left to right
  if (timber) {
    const tc = shade(trimTri[0], -0.06), tl = shade(trimTri[1], 0.08);
    for (const side of [2, 3]) {
      const half = (side < 2 ? d : w) / 2 - cut - 0.12;
      panel(m, F, side, -half, half, wallH * 0.52, wallH * 0.52 + 0.14, 0.05, tl);
      panel(m, F, side, -half, half, wallH - 0.2, wallH - 0.05, 0.05, tc);
      const n = Math.max(2, Math.round(half * 1.1));
      for (let i = 0; i < n; i++) {
        const u = -half + (i + 0.5 + (rng() - 0.5) * 0.3) * (half * 2 / n);
        panel(m, F, side, u - 0.07, u + 0.07, 0.05, wallH - 0.18, 0.045, i % 3 === 1 ? tl : tc);
      }
    }
  }

  const topW = w * (1 - taper), topD = d * (1 - taper);
  let roofY = y0 + wallH - 0.05, roofW = topW, roofD = topD;

  // jettied upper storey — the mass steps outward, which is the cheapest way to make a house
  // read as built rather than extruded
  if (upperH > 0.2) {
    const uw = w * (1 + jetty), ud = d * (1 + jetty);
    m.add(wallBlock(uw, upperH, ud, { cut, taper: 0.04, rings: 3, shear: -shear * 0.5, col: wallColor(o.upperTri || trimTri, rng, { bands: 5, grad: 0.7, foot: 0.2 }) }),
      matrix({ pos: [shear, y0 + wallH, 0] }));
    const F2 = facer(uw, ud, upperH, cut, 0.04, -shear * 0.5, y0 + wallH);
    windowOn(m, F2, 2, ud * 0.04, uw * 0.13, upperH * 0.3, upperH * 0.66,
      { frame: trimTri[0], glass: shade(wallTri[2], -0.62), shutter: accentCol });
    windowOn(m, F2, 0, -ud * 0.16, ud * 0.12, upperH * 0.3, upperH * 0.66,
      { frame: trimTri[0], glass: shade(wallTri[2], -0.62) });
    A.windows.push([...F2(2, ud * 0.04, upperH * 0.48, 0.09), LA[2]]);
    A.windows.push([...F2(0, -ud * 0.16, upperH * 0.48, 0.09), LA[0]]);
    const ghw = topW / 2 - cut - 0.1, gdh = Math.min(1.9, wallH * 0.58);
    doorOn(m, F, 2, -ghw * 0.3, Math.min(0.48, ghw * 0.38), gdh, { leaf: trimTri[0], frame: trimTri[1] });
    A.door = [...F(2, -ghw * 0.3, gdh * 0.45, 0.12), LA[2]];
    A.windows.push([...F(0, 0, wallH * 0.55, 0.09), LA[0]]);
    roofY = y0 + wallH + upperH - 0.05;
    roofW = uw * 0.96; roofD = ud * 0.96;
  } else {
    const hw = topW / 2 - cut - 0.1, hd = topD / 2 - cut - 0.1;
    const glass = shade(wallTri[2], -0.68);
    const win = (side, u, hu, ya, yb, sh) => {
      windowOn(m, F, side, u, hu, ya, yb, { frame: trimTri[1], glass, shutter: sh });
      A.windows.push([...F(side, u, (ya + yb) / 2, 0.09), LA[side]]);
    };
    const dh = Math.min(2.0, wallH * 0.56);
    doorOn(m, F, 2, -hw * 0.38, Math.min(0.5, hw * 0.4), dh,
      { leaf: accentCol || trimTri[0], frame: trimTri[1] });
    A.door = [...F(2, -hw * 0.38, dh * 0.45, 0.12), LA[2]];
    m.add(slab(1.2, 0.14, 0.7, { cut: 0.05, col: shade(stoneTri[1], 0.16) }),
      matrix({ pos: [F(2, -hw * 0.38, 0, 0.28)[0], y0 - 0.08, F(2, -hw * 0.38, 0, 0.28)[2]], ry: 0.1 }));
    win(2, hw * 0.5, Math.min(0.5, hw * 0.3), wallH * 0.33, wallH * 0.72, o.shutterCol || null);
    win(0, hd * 0.28, Math.min(0.48, hd * 0.28), wallH * 0.32, wallH * 0.7, o.shutterCol || null);
    if (hd > 1.6) win(0, -hd * 0.52, Math.min(0.4, hd * 0.22), wallH * 0.34, wallH * 0.66, null);
    if (hw > 1.7) win(3, hw * 0.4, Math.min(0.44, hw * 0.26), wallH * 0.36, wallH * 0.7, null);
    if (hw > 1.7) win(3, -hw * 0.46, Math.min(0.34, hw * 0.2), wallH * 0.38, wallH * 0.66, null);
    win(1, -hd * 0.34, Math.min(0.42, hd * 0.24), wallH * 0.36, wallH * 0.72, null);
  }

  const roof = tiledRoof(roofW, roofD, pitch, {
    col: roofTri, rng, courses: roofCourses, thick: roofThick,
    over: 0.3 + rng() * 0.16, overZ: 0.34 + rng() * 0.2,
    gable: { w: roofW * 0.995, d: roofD * 0.995, col: shade(wallTri[2], -0.1) },
  });
  m.add(roof.geo(), matrix({ pos: [upperH > 0.2 ? shear * 0.5 : shear, roofY, 0] }));

  const rH = (roofW / 2 + 0.3) * Math.tan(pitch * D2R);
  const cz = chimneySide * (roofD * 0.5 - 0.35) * rng.range(0.42, 0.78);
  const cx = shear + (rng.chance(0.5) ? 1 : -1) * roofW * rng.range(0.1, 0.2);
  const cBase = roofY + rH * (1 - Math.abs(cx - shear) / (roofW / 2 + 0.3)) - 0.35;
  const cH = rng.range(0.9, 1.5) + rH * 0.3;
  m.add(chimney(rng, { h: cH, r: rng.range(0.2, 0.28), col: stoneTri, capCol: trimTri[2] }).geo(),
    matrix({ pos: [cx, cBase, cz], ry: rng.range(0, TAU) }));
  A.chimney = [cx, cBase + cH + 0.38, cz];

  // the band of wall an overhanging eave never sees the sun on — the cheapest bake there is
  if (upperH <= 0.2) {
    const eave = shade(wallTri[2], -0.4);
    for (const [side, half] of [[0, topD / 2 - cut], [1, topD / 2 - cut], [2, topW / 2 - cut], [3, topW / 2 - cut]]) {
      panel(m, F, side, -half, half, wallH - 0.52, wallH - cut, 0.016, eave);
    }
  }

  if (porch > 0) {
    const pd = Math.min(d * 0.62, 2.1), ph = wallH * 0.7, px = topW / 2 + porch - 0.12;
    const pc = shade(trimTri[0], 0.06);
    for (const s of [-1, 1]) {
      m.add(post(ph, 0.1, { col: pc, taper: 0.8 }), matrix({ pos: [px, y0 + 0.06, s * pd * 0.5], rz: s * 0.03 }));
    }
    m.add(bar(pd + 0.3, 0.075, { col: shade(trimTri[1], 0.14) }),
      matrix({ pos: [px, y0 + ph, -(pd + 0.3) / 2], ry: -Math.PI / 2 }));
    m.add(slab(porch + 0.5, 0.12, pd + 0.4, { col: shade(stoneTri[0], -0.06) }),
      matrix({ pos: [topW / 2 + porch * 0.5, y0 - 0.04, 0] }));
    const pr = tiledRoof((porch + 0.1) * 2, pd + 0.4, 30, {
      col: roofTri, rng, courses: 2, thick: 0.3, over: 0.22, overZ: 0.26, ridgeBar: 0, sides: [1], drop: 0.18,
    });
    m.add(pr.geo(), matrix({ pos: [topW / 2 - 0.1, y0 + ph + 0.06, 0] }));
  }

  if (leanTo > 0) {
    const lw = leanTo, lh = wallH * 0.56, ld = Math.min(d * 0.72, 2.6);
    m.add(wallBlock(lw, lh, ld, { cut: 0.1, taper: 0.05, rings: 2, col: wallColor(trimTri, rng, { bands: 4, foot: 0.32 }) }),
      matrix({ pos: [-(topW / 2 + lw / 2 - 0.12), y0, d * 0.12] }));
    const lr = tiledRoof(lw * 2.0, ld, 30, {
      col: roofTri, rng, courses: 2, thick: 0.16, over: 0.18, overZ: 0.22, ridgeBar: 0, sides: [-1],
    });
    m.add(lr.geo(), matrix({ pos: [-(topW / 2 - lw * 0.42), y0 + lh - 0.04, d * 0.12] }));
  }

  if (annexe) {
    const { aw, ad, ah, ry } = annexe;
    const ax = Math.cos(ry) * (w / 2 + aw / 2 - 0.2), az = -Math.sin(ry) * (w / 2 + aw / 2 - 0.2);
    m.add(wallBlock(aw, ah, ad, { cut: 0.12, taper: 0.06, rings: 3, shear: -shear * 0.4, col: wallColor(wallTri, rng, { bands: 5, foot: 0.34 }) }),
      matrix({ pos: [ax, y0 - 0.05, az + d * 0.16], ry }));
    const ar = tiledRoof(aw * (1 - 0.06), ad * (1 - 0.06), 52, {
      col: roofTri, rng, courses: 3, thick: 0.2, over: 0.24, overZ: 0.26, ridgeBar: 0.1,
      gable: { w: aw * 0.9, d: ad * 0.9, col: shade(wallTri[2], -0.1) },
    });
    m.add(ar.geo(), matrix({ pos: [ax, y0 + ah - 0.1, az + d * 0.16], ry }));
  }

  return { geo: speckle(m.geo(), 0.045, rng), anchors: A };
}

function windmill(rng, p, accentCol) {
  const m = new Mesh();
  const H = 9.5, r0 = 2.9, r1 = 2.05, base = 0.5;
  const stone = p.build.stone, wood = p.build.wood, trim = p.build.woodDark;
  const wall = [mix(p.build.wall[0], p.build.thatch[0], 0.3), mix(p.build.wall[1], p.build.thatch[1], 0.22), mix(p.build.wall[2], p.build.wood[0], 0.32)];

  m.add(prism(9, r0 * 1.12, r0 * 1.03, base, { rings: 1, rot: 0.2, col: wallColor(stone, rng, { bands: 1, foot: 0.34, edge: 0.2 }) }));
  m.add(prism(9, r0, r1, H, {
    rings: 5, rot: 0.2, twist: 0.05,
    col: (r, i, t) => {
      if (r < 0) return shade(wall[2], -0.4);
      if (r > 4) return shade(wall[1], 0.1);
      const band = r % 2 ? 0.05 : -0.04;
      const v = mix(mix(wall[2], wall[0], 0.72), wall[1], Math.pow(t, 1.1) * 0.6);
      return shade(v, band - 0.34 * (1 - Math.min(1, t * 3)) + ((i & 1) ? 0.06 : 0) + (rng() - 0.5) * 0.05);
    },
  }), matrix({ pos: [0, base, 0] }));

  const rAt = y => r0 + (r1 - r0) * clamp((y - base) / H, 0, 1);
  const face = (a, y, u, out) => {
    const R = rAt(y) * Math.cos(Math.PI / 9) + out;
    return [Math.cos(a) * R - Math.sin(a) * u, y, Math.sin(a) * R + Math.cos(a) * u];
  };
  const doorA = 0.2 + (2.5 / 9) * TAU;
  const dn = [Math.cos(doorA), 0, Math.sin(doorA)];
  q(m, face(doorA, 0.6, -0.5, 0.04), face(doorA, 0.6, 0.5, 0.04),
    face(doorA, 2.7, 0.5, 0.04), face(doorA, 2.7, -0.5, 0.04), shade(wood[0], -0.1), dn);
  q(m, face(doorA, 2.7, -0.6, 0.1), face(doorA, 2.7, 0.6, 0.1),
    face(doorA, 2.92, 0.6, 0.1), face(doorA, 2.92, -0.6, 0.1), shade(trim[1], 0.24), dn);
  for (const [a, y] of [[doorA + 2.1, 4.4], [doorA - 2.3, 6.2], [doorA + 0.75, 5.3]]) {
    const nn = [Math.cos(a), 0, Math.sin(a)];
    q(m, face(a, y, -0.34, 0.03), face(a, y, 0.34, 0.03), face(a, y + 0.72, 0.34, 0.03), face(a, y + 0.72, -0.34, 0.03),
      shade(wall[2], -0.62), nn);
    q(m, face(a, y - 0.15, -0.46, 0.09), face(a, y - 0.15, 0.46, 0.09), face(a, y, 0.46, 0.09), face(a, y, -0.46, 0.09),
      shade(trim[1], 0.24), nn);
  }

  // gallery: the deck ring is what stops the tower reading as a plain cone
  const gy = 3.4, gr = rAt(gy) + 0.75;
  m.add(prism(9, gr, gr * 0.985, 0.2, { rot: 0.2, col: shade(wood[2], 0.02) }), matrix({ pos: [0, gy, 0] }));
  m.add(prism(9, gr * 0.99, gr * 0.985, 0.1, { rot: 0.2, col: shade(wood[1], 0.18) }), matrix({ pos: [0, gy + 0.78, 0] }));
  for (let i = 0; i < 9; i++) {
    const a = 0.2 + (i / 9) * TAU + 0.35;
    m.add(post(0.78, 0.065, { col: shade(wood[0], 0.04) }),
      matrix({ pos: [Math.cos(a) * gr * 0.94, gy + 0.18, Math.sin(a) * gr * 0.94], rz: (rng() - 0.5) * 0.05 }));
  }
  for (let i = 0; i < 9; i++) {
    const a = 0.2 + (i / 9) * TAU;
    m.add(bar(1.1, 0.06, { col: shade(wood[2], 0.1) }),
      matrix({ pos: [Math.cos(a) * gr * 0.6, gy - 0.14, Math.sin(a) * gr * 0.6], ry: -a, rz: -0.42 }));
  }

  const capY = H + base;
  m.add(prism(9, r1 * 1.32, r1 * 1.24, 0.3, { rot: 0.2, col: shade(p.build.roofAlt[2], -0.34) }), matrix({ pos: [0, capY, 0] }));
  m.add(spire(9, r1 * 1.28, 3.2, {
    curve: 1.3, rings: 4, rot: 0.2,
    col: (r, i, t) => shade(mix(shade(p.build.roofAlt[2], -0.3), p.build.roofAlt[0], 0.15 + t * 0.6), (i % 2 ? 0.09 : -0.08) + (rng() - 0.5) * 0.05),
  }), matrix({ pos: [0, capY + 0.24, 0] }));
  m.add(post(0.7, 0.09, { col: shade(p.build.metal[0], 0.1) }), matrix({ pos: [0, capY + 3.4, 0] }));
  m.add(bar(0.8, 0.055, { col: accentCol }), matrix({ pos: [-0.4, capY + 3.9, 0], ry: 0.4 }));

  // tail pole, so the silhouette is not rotationally symmetric
  const tail = new Mesh();
  tail.add(bar(5.2, 0.13, { col: shade(wood[0], -0.04) }));
  tail.add(bar(1.8, 0.09, { col: shade(wood[2], 0.02) }), matrix({ pos: [3.7, -1.1, 0], rz: 0.55 }));
  m.add(tail.geo(), matrix({ pos: [-r1 * 0.7, capY + 1.5, 0], ry: Math.PI, rz: 0.34 }));

  const A = { windows: [], door: [...face(doorA, 1.5, 0, 0.14), -doorA], chimney: null };
  for (const [a, y] of [[doorA + 2.1, 4.4], [doorA - 2.3, 6.2], [doorA + 0.75, 5.3]]) {
    A.windows.push([...face(a, y + 0.36, 0, 0.1), -a]);
  }
  return { geo: speckle(m.geo(), 0.04, rng), hub: [r1 * 1.3 + 0.5, capY + 1.5, 0], anchors: A };
}

function millSails(rng, p, accentCol) {
  const m = new Mesh();
  const wood = p.build.wood, trim = p.build.woodDark;
  m.add(prism(7, 0.4, 0.3, 0.62, { col: shade(trim[1], 0.14) }), matrix({ pos: [0, 0, 0], rx: Math.PI / 2 }));
  for (let a = 0; a < 4; a++) {
    const rot = a * (TAU / 4) + 0.15;
    const arm = new Mesh();
    const len = 5.2;
    arm.add(bar(len, 0.12, { col: shade(wood[0], 0.04) }), matrix({ pos: [0.4, 0.36, 0] }));
    arm.add(bar(len, 0.105, { col: shade(wood[2], 0.06) }), matrix({ pos: [0.4, -0.4, 0] }));
    for (let i = 0; i < 7; i++) {
      const x = 0.85 + i * 0.7;
      arm.add(bar(0.86, 0.07, { col: shade(i % 2 ? trim[0] : wood[2], 0.06) }),
        matrix({ pos: [x, -0.44, 0.0], rz: Math.PI / 2 }));
    }
    arm.add(bar(1.6, 0.075, { col: accentCol }), matrix({ pos: [4.1, -0.42, 0.07], rz: 0.44 }));
    const cloth = shade(p.build.wall[1], 0.02), clothB = shade(p.build.wall[2], -0.16);
    for (const zz of [0.05, -0.05]) {
      q(arm, [0.9, 0.3, zz], [4.4, 0.3, zz], [4.4, -0.38, zz], [0.9, -0.38, zz],
        zz > 0 ? cloth : clothB, [0, 0, Math.sign(zz)]);
    }
    m.add(arm.geo(), matrix({ pos: [0, 0, 0], rz: rot }));
  }
  return speckle(m.geo(), 0.05, rng);
}

function watchtower(rng, p, accentCol) {
  const m = new Mesh();
  const H = 8.3, stone = p.build.stone;
  m.add(prism(7, 2.95, 2.68, 0.55, { rot: 0.3, col: wallColor(stone, rng, { bands: 1, foot: 0.36, edge: 0.22 }) }));
  m.add(prism(7, 2.62, 1.82, H, {
    rings: 6, rot: 0.3, twist: -0.04,
    col: (r, i, t) => {
      if (r < 0) return shade(stone[2], -0.4);
      if (r > 5) return shade(stone[1], 0.08);
      const band = (r % 2 ? 0.08 : -0.06) + ((i & 1) ? 0.05 : 0);
      const v = mix(mix(stone[2], stone[0], 0.72), stone[1], Math.pow(t, 1.05) * 0.5);
      return shade(v, band - 0.3 * (1 - Math.min(1, t * 3.2)) + (rng() - 0.5) * 0.07);
    },
  }), matrix({ pos: [0, 0.53, 0] }));

  const rAt = y => 2.62 + (1.82 - 2.62) * clamp((y - 0.53) / H, 0, 1);
  const face = (a, y, u, out) => {
    const R = rAt(y) * Math.cos(Math.PI / 7) + out;
    return [Math.cos(a) * R - Math.sin(a) * u, y, Math.sin(a) * R + Math.cos(a) * u];
  };
  const dA = 0.3 + (3.5 / 7) * TAU;
  const dn = [Math.cos(dA), 0, Math.sin(dA)];
  q(m, face(dA, 0.6, -0.52, 0.04), face(dA, 0.6, 0.52, 0.04), face(dA, 2.8, 0.52, 0.04), face(dA, 2.8, -0.52, 0.04),
    shade(p.build.woodDark[0], 0.02), dn);
  q(m, face(dA, 2.8, -0.62, 0.09), face(dA, 2.8, 0.62, 0.09), face(dA, 3.02, 0.62, 0.09), face(dA, 3.02, -0.62, 0.09),
    shade(stone[1], 0.26), dn);
  for (const [a, y] of [[dA + 1.9, 4.0], [dA - 2.0, 5.4], [dA + 0.6, 6.6]]) {
    const nn = [Math.cos(a), 0, Math.sin(a)];
    q(m, face(a, y, -0.15, 0.03), face(a, y, 0.15, 0.03), face(a, y + 0.85, 0.15, 0.03), face(a, y + 0.85, -0.15, 0.03),
      shade(stone[2], -0.62), nn);
  }

  // corbel + merlons: a broken top edge is worth far more to the silhouette than a smooth one
  const ty = H + 0.53;
  m.add(prism(7, 2.24, 2.36, 0.38, { rot: 0.3, col: shade(stone[1], 0.16) }), matrix({ pos: [0, ty, 0] }));
  m.add(prism(7, 2.34, 2.22, 0.22, { rot: 0.3, col: shade(stone[2], -0.05) }), matrix({ pos: [0, ty + 0.38, 0] }));
  for (let i = 0; i < 7; i++) {
    const a = 0.3 + (i / 7) * TAU + Math.PI / 7;
    const R = 2.06;
    m.add(prism(5, 0.4, 0.34, 0.72 + (i % 3) * 0.09, { rot: a, col: wallColor(stone, rng, { bands: 1, foot: 0.16, edge: 0.24 }) }),
      matrix({ pos: [Math.cos(a) * R, ty + 0.56, Math.sin(a) * R], rz: (rng() - 0.5) * 0.06 }));
  }
  m.add(post(2.5, 0.08, { col: shade(p.build.woodDark[1], 0.06) }), matrix({ pos: [0.34, ty + 0.56, -0.24] }));
  const flag = new Mesh();
  for (let i = 0; i < 3; i++) {
    const x0 = i * 0.42, x1 = x0 + 0.42;
    const y = i * 0.05;
    q(flag, [x0, y, 0], [x1, y - 0.04, 0.06 * (i % 2 ? 1 : -1)],
      [x1, y - 0.04 - 0.5 + i * 0.13, 0.06 * (i % 2 ? 1 : -1)], [x0, y - 0.5 + i * 0.1, 0],
      shade(accentCol, i % 2 ? 0.1 : -0.08), [0, 0, 1]);
  }
  m.add(flag.geo(), matrix({ pos: [0.38, ty + 2.95, -0.24], ry: 0.5 }));
  const A = { windows: [], door: [...face(dA, 1.7, 0, 0.14), -dA], chimney: null };
  for (const [a, y] of [[dA + 1.9, 4.0], [dA - 2.0, 5.4], [dA + 0.6, 6.6]]) {
    A.windows.push([...face(a, y + 0.42, 0, 0.1), -a]);
  }
  return { geo: speckle(m.geo(), 0.045, rng), anchors: A };
}

function barn(rng, p, accentCol) {
  const m = new Mesh();
  const w = 8.6, d = 5.5, wallH = 3.7, pitch = 38;
  const wood = p.build.wood, trim = p.build.woodDark, stone = p.build.stone;
  const cut = 0.2, taper = 0.05, shear = 0.1;

  m.add(loft([ringRect(w * 1.04, d * 1.05, 0, 0.2), ringRect(w * 1.01, d * 1.02, 0.5, 0.17)],
    { col: wallColor(stone, rng, { bands: 1, foot: 0.32, edge: 0.22 }) }));
  m.add(wallBlock(w, wallH, d, { cut, taper, shear, rings: 4, col: wallColor(wood, rng, { grad: 0.5, foot: 0.4 }) }),
    matrix({ pos: [0, 0.5, 0] }));
  const F = facer(w, d, wallH, cut, taper, shear, 0.5);

  for (const side of [2, 3]) {
    const half = w / 2 - cut - 0.15;
    for (let i = 0; i < 11; i++) {
      const u = -half + (i + 0.5) * (half * 2 / 11) + (rng() - 0.5) * 0.12;
      panel(m, F, side, u - 0.06, u + 0.06, 0.05, wallH - 0.1, 0.04, shade(trim[i % 3 ? 0 : 1], (rng() - 0.5) * 0.1));
    }
    panel(m, F, side, -half, half, wallH * 0.55, wallH * 0.55 + 0.12, 0.05, shade(trim[1], 0.12));
  }
  // big doors, cross-braced, with the accent only on the strap
  const dw = 1.5;
  panel(m, F, 2, -dw, dw, 0.03, 2.85, 0.05, shade(wood[2], 0.06));
  panel(m, F, 2, -0.06, 0.06, 0.03, 2.85, 0.09, shade(trim[2], 0.0));
  for (const s of [-1, 1]) {
    panel(m, F, 2, s * dw - s * 0.11, s * dw, 0.03, 2.9, 0.095, shade(trim[1], 0.14));
    panel(m, F, 2, s * 0.09, s * dw, 1.8, 1.98, 0.095, accentCol);
    panel(m, F, 2, s * 0.09, s * dw, 0.62, 0.8, 0.095, shade(trim[1], 0.06));
  }
  panel(m, F, 2, -dw - 0.16, dw + 0.16, 2.85, 3.08, 0.11, shade(trim[1], 0.2));

  const topW = w * (1 - taper), topD = d * (1 - taper);
  const roof = tiledRoof(topW, topD, pitch, {
    col: p.build.roofAlt, rng, courses: 5, thick: 0.5, over: 0.5, overZ: 0.46, ridgeBar: 0.22,
    gable: { w: topW, d: topD, col: shade(wood[2], -0.05) },
  });
  m.add(roof.geo(), matrix({ pos: [shear, 0.5 + wallH - 0.06, 0] }));

  // loft opening + hoist beam: the one element narrower than 15% of the mass, sticking out
  const rH = (topW / 2 + 0.42) * Math.tan(pitch * D2R);
  const gy = 0.5 + wallH + rH * 0.34;
  q(m, [-0.68, gy, topD / 2 + 0.02], [0.68, gy, topD / 2 + 0.02],
    [0.68, gy + 1.2, topD / 2 + 0.02], [-0.68, gy + 1.2, topD / 2 + 0.02], shade(wood[2], -0.6), [0, 0, 1]);
  q(m, [-0.8, gy + 1.2, topD / 2 + 0.06], [0.8, gy + 1.2, topD / 2 + 0.06],
    [0.8, gy + 1.38, topD / 2 + 0.06], [-0.8, gy + 1.38, topD / 2 + 0.06], shade(trim[1], 0.2), [0, 0, 1]);
  m.add(bar(1.9, 0.12, { col: shade(wood[1], 0.06) }), matrix({ pos: [0, gy + 1.6, topD / 2 - 0.1], ry: -Math.PI / 2, rz: 0.08 }));
  m.add(post(0.5, 0.04, { col: shade(p.build.metal[2], 0) }), matrix({ pos: [0, gy + 1.52, topD / 2 + 1.55], rx: Math.PI }));

  const A = {
    windows: [[0, gy + 0.6, topD / 2 + 0.14, LA[2]]],
    door: [...F(2, 0, 1.4, 0.14), LA[2]],
    chimney: null,
  };
  return { geo: speckle(m.geo(), 0.05, rng), anchors: A };
}

function well(rng, p, accentCol) {
  const m = new Mesh();
  const stone = p.build.stone, wood = p.build.wood;
  m.add(prism(9, 1.12, 1.0, 0.86, {
    rings: 3, rot: 0.3,
    col: wallColor(stone, rng, { bands: 3, grad: 0.44, foot: 0.3, edge: 0.24 }),
  }));
  m.add(prism(9, 1.16, 1.06, 0.14, { rot: 0.3, col: shade(stone[1], 0.22) }), matrix({ pos: [0, 0.86, 0] }));
  m.add(prism(9, 0.92, 0.86, 0.1, { rot: 0.3, col: shade(stone[2], -0.55) }), matrix({ pos: [0, 0.82, 0] }));
  for (const s of [-1, 1]) {
    m.add(post(1.65, 0.1, { col: shade(wood[0], 0.04) }), matrix({ pos: [s * 0.78, 0.8, 0.05], rz: -s * 0.05 }));
  }
  m.add(bar(1.9, 0.08, { col: shade(wood[2], 0.08) }), matrix({ pos: [-0.95, 2.24, 0.05] }));
  const roof = tiledRoof(2.3, 1.7, 44, { col: p.build.thatch, rng, courses: 3, thick: 0.2, over: 0.28, overZ: 0.3, ridgeBar: 0.11 });
  m.add(roof.geo(), matrix({ pos: [0, 2.34, 0.05] }));
  m.add(prism(7, 0.24, 0.2, 0.32, { col: shade(wood[2], 0.02) }), matrix({ pos: [0.06, 1.42, 0.05] }));
  m.add(prism(7, 0.25, 0.24, 0.05, { col: accentCol }), matrix({ pos: [0.06, 1.72, 0.05] }));
  return {
    geo: speckle(m.geo(), 0.05, rng),
    anchors: { windows: [[0.5, 2.05, 0.05, 0]], door: null, chimney: null },
  };
}

function stall(rng, p, awningCol) {
  const m = new Mesh();
  const wood = p.build.wood, trim = p.build.woodDark;
  const w = rng.range(2.0, 2.6), d = rng.range(1.4, 1.8), h = rng.range(1.7, 2.0);
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    m.add(post(h, 0.075, { col: shade(wood[0], 0.02) }),
      matrix({ pos: [sx * w / 2, 0, sz * d / 2], rz: sx * 0.03, rx: sz * 0.02 }));
  }
  m.add(slab(w * 1.06, 0.12, d * 0.5, { col: shade(wood[1], 0.12) }), matrix({ pos: [0, h * 0.5, -d * 0.22] }));
  m.add(slab(w * 0.98, 0.5, d * 0.16, { col: shade(trim[0], -0.05) }), matrix({ pos: [0, h * 0.5 - 0.5, -d * 0.44] }));
  // awning: two slopes, striped across the run, with a scalloped valance hanging off the eave
  const a = new Mesh();
  const aw = w * 0.72, ad = d * 0.82, rise = 0.58;
  for (const s of [1, -1]) {
    const nsl = 4;
    for (let i = 0; i < nsl; i++) {
      const z0 = -ad + (2 * ad * i) / nsl, z1 = -ad + (2 * ad * (i + 1)) / nsl;
      const canvas = i % 2 ? awningCol : shade(p.build.wall[1], 0.05);
      q(a, [0, rise, z0], [s * aw, 0, z0], [s * aw, 0, z1], [0, rise, z1],
        shade(canvas, s > 0 ? 0.08 : -0.1), [s * 0.45, 0.9, 0]);
      q(a, [0, rise - 0.07, z0], [s * aw, -0.07, z0], [s * aw, -0.07, z1], [0, rise - 0.07, z1],
        shade(canvas, -0.42), [-s * 0.45, -0.9, 0]);
      t3(a, [s * aw, 0, z0], [s * aw, 0, z1], [s * aw + s * 0.1, -0.26, (z0 + z1) / 2],
        shade(canvas, -0.18), [s * 0.5, -0.85, 0]);
    }
    t3(a, [0, rise, s * ad], [aw, 0, s * ad], [-aw, 0, s * ad], shade(p.build.wall[2], -0.24), [0, 0, s]);
  }
  m.add(a.geo(), matrix({ pos: [0, h, 0] }));
  m.add(bar(aw * 2, 0.05, { col: shade(trim[1], 0.16) }), matrix({ pos: [-aw, h + rise, 0], ry: -Math.PI / 2, rx: Math.PI / 2 }));
  for (let i = 0; i < 3; i++) {
    m.add(blob(rng.range(0.13, 0.2), 0, { jitter: 0.3, squash: 0.9, stretch: 0.8, rng, col: shade(p.flora.bloom[i % 4], -0.05) }),
      matrix({ pos: [rng.range(-w * 0.35, w * 0.35), h * 0.5 + 0.2, -d * 0.2 + rng.range(-0.1, 0.1)] }));
  }
  return {
    geo: speckle(m.geo(), 0.05, rng),
    anchors: { windows: [[0, h + rise - 0.16, 0, 0]], door: null, chimney: null },
  };
}

function crate(rng, p) {
  const s = rng.range(0.42, 0.66);
  return speckle(slab(s, s * rng.range(0.5, 0.75), s * rng.range(1.15, 1.5), {
    cut: 0.05, col: wallColor(p.build.wood, rng, { bands: 1, grad: 0.4, foot: 0.24, edge: 0.24 }),
  }), 0.07, rng);
}

function barrel(rng, p) {
  const m = new Mesh();
  const h = rng.range(0.66, 0.92), r = h * rng.range(0.29, 0.35);
  m.add(loft([
    ringCircle(7, r * 0.86, 0), ringCircle(7, r, h * 0.34), ringCircle(7, r * 0.97, h * 0.7), ringCircle(7, r * 0.8, h),
  ], { col: wallColor(p.build.woodDark, rng, { bands: 3, grad: 0.5, foot: 0.28, edge: 0.2 }) }));
  m.add(prism(7, r * 1.04, r * 1.04, 0.06, { col: shade(p.build.metal[1], 0.1) }), matrix({ pos: [0, h * 0.32, 0] }));
  return speckle(m.geo(), 0.06, rng);
}

// ── site works ────────────────────────────────────────────────────────────────────────────────

function resample(pts, step) {
  const out = [pts[0]];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(1, Math.round(L / step));
    for (let k = 1; k <= n; k++) out.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
  }
  // one smoothing pass: streets in every reference plate curve, none of them are polylines
  for (let s = 0; s < 2; s++) {
    for (let i = 1; i < out.length - 1; i++) {
      out[i] = [(out[i - 1][0] + out[i][0] * 2 + out[i + 1][0]) / 4, (out[i - 1][1] + out[i][1] * 2 + out[i + 1][1]) / 4];
    }
  }
  return out;
}

function pathStrip(ctx, poly, width, rng) {
  const t = ctx.terrain, m = new Mesh(), g = ctx.p.ground;
  const pts = resample(poly, 1.5);
  const side = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], nx = pts[Math.min(i + 1, pts.length - 1)], pv = pts[Math.max(i - 1, 0)];
    let dx = nx[0] - pv[0], dz = nx[1] - pv[1];
    const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    const hw = width * (0.82 + 0.3 * Math.sin(i * 1.31 + 0.7)) / 2;
    const y = t.heightAt(p[0], p[1]);
    side.push([[p[0] - dz * hw, y, p[1] + dx * hw], [p[0] + dz * hw, y, p[1] - dx * hw], [-dz, dx]]);
  }
  for (let i = 0; i < side.length - 1; i++) {
    const [l0, r0, n0] = side[i], [l1, r1] = side[i + 1];
    const lift = 0.1;
    const L0 = [l0[0], l0[1] + lift, l0[2]], R0 = [r0[0], r0[1] + lift, r0[2]];
    const L1 = [l1[0], l1[1] + lift, l1[2]], R1 = [r1[0], r1[1] + lift, r1[2]];
    const c = shade(mix(g.path[1], i % 3 ? g.path[0] : g.dirt[0], 0.3), (rng() - 0.5) * 0.1 + 0.04);
    q(m, L0, R0, R1, L1, c, [0, 1, 0]);
    const drop = 1.3;
    q(m, L0, L1, [L1[0], L1[1] - drop, L1[2]], [L0[0], L0[1] - drop, L0[2]], shade(g.dirt[2], -0.2), [n0[0], 0, n0[1]]);
    q(m, R0, R1, [R1[0], R1[1] - drop, R1[2]], [R0[0], R0[1] - drop, R0[2]], shade(g.dirt[2], -0.2), [-n0[0], 0, -n0[1]]);
  }
  ctx.raw(m.geo(), null, 'solid');
  for (let i = 0; i < pts.length; i += 2) ctx.claims.push({ x: pts[i][0], z: pts[i][1], r: width * 0.62, tag: 'path', aoStrength: 0.14 });
  return pts;
}

// Trodden ground around a building. Costs 22 triangles and does more for contact than anything
// else here — a wall meeting untouched grass is the tell that a house was dropped in, not built.
function apron(ctx, x, z, r, rng, tag = 'yard') {
  const t = ctx.terrain, g = ctx.p.ground, m = new Mesh();
  const n = 11, c = [x, t.heightAt(x, z) + 0.04, z];
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + rng() * 0.2;
    const rr = r * rng.range(0.78, 1.18);
    const px = x + Math.cos(a) * rr, pz = z + Math.sin(a) * rr;
    pts.push([px, t.heightAt(px, pz) + 0.03, pz]);
  }
  const base = mix(mix(g.dirt[0], g.path[0], 0.5), g.grass[2], 0.42);
  for (let i = 0; i < n; i++) {
    const b = pts[i], e = pts[(i + 1) % n];
    t3(m, c, b, e, shade(base, (rng() - 0.5) * 0.14 - 0.05), [0, 1, 0]);
    q(m, b, e, [e[0], e[1] - 1.1, e[2]], [b[0], b[1] - 1.1, b[2]],
      shade(g.dirt[2], -0.24), [b[0] - x, 0, b[2] - z]);
  }
  ctx.raw(m.geo(), null, 'solid');
}

function cobbles(ctx, cx, cz, radius, rng) {
  const t = ctx.terrain, m = new Mesh(), g = ctx.p.ground;
  const n = Math.round(34 * radius / 4);
  for (let i = 0; i < n; i++) {
    const a = i * 2.399, rr = radius * Math.sqrt((i + 0.6) / n);
    const x = cx + Math.cos(a) * rr + (rng() - 0.5) * 0.5, z = cz + Math.sin(a) * rr + (rng() - 0.5) * 0.5;
    const s = rng.range(0.24, 0.42) * (1.1 - rr / radius * 0.35);
    const col = shade(mix(g.rock[0], i % 4 ? g.path[1] : g.rock[2], rng()), (rng() - 0.5) * 0.16 - 0.02);
    m.add(prism(rng.chance(0.5) ? 5 : 7, s, s * 0.82, 0.13, { rot: rng.range(0, TAU), col }),
      matrix({ pos: [x, t.heightAt(x, z) + 0.05, z], rx: (rng() - 0.5) * 0.06, rz: (rng() - 0.5) * 0.06 }));
  }
  ctx.raw(m.geo(), null, 'solid');
  ctx.claims.push({ x: cx, z: cz, r: radius * 0.85, tag: 'path', aoStrength: 0.1 });
}

function fenceRun(ctx, poly, rng, { h = 1.05, rails = 2, gate = -1 } = {}) {
  const t = ctx.terrain, m = new Mesh(), p = ctx.p;
  const pts = resample(poly, 1.9);
  const wood = p.build.woodDark;
  for (let i = 0; i < pts.length; i++) {
    const [x, z] = pts[i];
    const y = t.heightAt(x, z);
    const hh = h * rng.range(0.9, 1.1);
    m.add(post(hh, 0.075, { col: wallColor(wood, rng, { bands: 1, grad: 0.5, foot: 0.3, edge: 0.26 }), rot: rng.range(0, TAU) }),
      matrix({ pos: [x, y - 0.12, z], rx: (rng() - 0.5) * 0.09, rz: (rng() - 0.5) * 0.09 }));
    if (i === pts.length - 1) break;
    const [nx, nz] = pts[i + 1];
    const L = Math.hypot(nx - x, nz - z);
    const ny = t.heightAt(nx, nz);
    const ang = Math.atan2(nz - z, nx - x);
    if (i === gate) continue;
    for (let r = 0; r < rails; r++) {
      const fy = 0.28 + (r + 0.5) * (hh - 0.34) / rails;
      m.add(bar(L * 1.04, 0.05, { col: shade(p.build.wood[r % 2 ? 0 : 2], 0.04) }),
        matrix({ pos: [x, y + fy, z], ry: -ang, rz: Math.atan2(ny - y, L) }));
    }
  }
  ctx.raw(m.geo(), null, 'solid');
  for (let i = 0; i < pts.length; i += 2) ctx.claims.push({ x: pts[i][0], z: pts[i][1], r: 0.7, tag: 'fence', aoStrength: 0.16 });
}

// Dry-stone retaining wall with a rubble coping. Reads as terracing, costs six triangles a metre.
function stoneWall(ctx, poly, rng, { h = 0.95, thick = 0.55 } = {}) {
  const t = ctx.terrain, m = new Mesh(), s = ctx.p.build.stone;
  const pts = resample(poly, 2.3);
  const rim = [];
  for (let i = 0; i < pts.length; i++) {
    const [x, z] = pts[i], nx = pts[Math.min(i + 1, pts.length - 1)], pv = pts[Math.max(i - 1, 0)];
    let dx = nx[0] - pv[0], dz = nx[1] - pv[1];
    const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    const jog = (rng() - 0.5) * thick * 0.5;
    const y = t.heightAt(x, z);
    rim.push({
      x: x - dz * jog, z: z + dx * jog, y, hh: h * rng.range(0.68, 1.22),
      n: [-dz, dx], w: thick * rng.range(0.8, 1.2) / 2,
    });
  }
  for (let i = 0; i < rim.length - 1; i++) {
    const a = rim[i], b = rim[i + 1];
    const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, y: (a.y + b.y) / 2, hh: (a.hh + b.hh) / 2 + rng.range(-0.1, 0.1), n: a.n, w: (a.w + b.w) / 2 };
    const face = (u, v, c) => {
      const P = (o, k, dy) => [o.x + o.n[0] * o.w * k, o.y + o.hh * dy, o.z + o.n[1] * o.w * k];
      q(m, P(u, 1, 1), P(v, 1, 1), P(v, -1, 1), P(u, -1, 1), shade(c, 0.26), [0, 1, 0]);
      q(m, [P(u, 1, 0)[0], u.y - 0.9, P(u, 1, 0)[2]], [P(v, 1, 0)[0], v.y - 0.9, P(v, 1, 0)[2]],
        P(v, 1, 1), P(u, 1, 1), shade(c, 0.04), [u.n[0], 0, u.n[1]]);
      q(m, [P(u, -1, 0)[0], u.y - 0.9, P(u, -1, 0)[2]], [P(v, -1, 0)[0], v.y - 0.9, P(v, -1, 0)[2]],
        P(v, -1, 1), P(u, -1, 1), shade(c, -0.3), [-u.n[0], 0, -u.n[1]]);
    };
    // two courses per span with a value break between them: one long grey ribbon reads as concrete
    const c0 = shade(mix(s[2], s[0], rng.range(0.25, 0.95)), (rng() - 0.5) * 0.2);
    const c1 = shade(mix(s[2], s[1], rng.range(0.2, 0.9)), (rng() - 0.5) * 0.2);
    face(a, mid, c0);
    face(mid, b, c1);
    if (i % 2 === 0) {
      m.add(blob(a.w * rng.range(0.85, 1.3), 0, { jitter: 0.36, stretch: 0.5, squash: 1.25, rng, col: shade(c0, 0.2) }),
        matrix({ pos: [a.x, a.y + a.hh + 0.03, a.z], ry: rng.range(0, TAU), rz: (rng() - 0.5) * 0.2 }));
    }
  }
  ctx.raw(m.geo(), null, 'solid');
  for (let i = 0; i < rim.length; i += 2) ctx.claims.push({ x: rim[i].x, z: rim[i].z, r: 0.8, tag: 'wall', aoStrength: 0.3 });
}

function steps(ctx, x, z, ry, rng, { n = 4, w = 2.0 } = {}) {
  const t = ctx.terrain, m = new Mesh(), s = ctx.p.build.stone;
  const dx = Math.cos(ry), dz = -Math.sin(ry);
  const y0 = t.heightAt(x - dx * n * 0.45, z - dz * n * 0.45);
  const y1 = t.heightAt(x + dx * n * 0.45, z + dz * n * 0.45);
  for (let i = 0; i < n; i++) {
    const k = (i / (n - 1) - 0.5) * n * 0.9;
    const px = x + dx * k, pz = z + dz * k;
    const py = y0 + (y1 - y0) * (i / (n - 1)) + 0.06;
    m.add(slab(w * rng.range(0.9, 1.06), 0.2, 0.8, { cut: 0.06, col: shade(mix(s[0], s[1], rng() * 0.6), (rng() - 0.5) * 0.12) }),
      matrix({ pos: [px, py - 0.14, pz], ry: ry + (rng() - 0.5) * 0.06 }));
  }
  ctx.raw(m.geo(), null, 'solid');
  ctx.claims.push({ x, z, r: n * 0.5, tag: 'path', aoStrength: 0.2 });
}

function bridge(ctx, a, b, rng) {
  const t = ctx.terrain, m = new Mesh(), p = ctx.p;
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const L = Math.hypot(dx, dz), ang = Math.atan2(dz, dx);
  const ux = dx / L, uz = dz / L, nx = -uz, nz = ux;
  const ya = t.heightAt(a[0], a[1]), yb = t.heightAt(b[0], b[1]);
  const w = 2.1;
  const seg = Math.max(5, Math.round(L / 1.1));
  const yAt = k => ya + (yb - ya) * k + Math.sin(k * Math.PI) * 0.55 + 0.22;
  const P = (k, s) => [a[0] + ux * L * k + nx * w * 0.5 * s, yAt(k), a[1] + uz * L * k + nz * w * 0.5 * s];
  for (let i = 0; i < seg; i++) {
    const k0 = i / seg, k1 = (i + 1) / seg;
    const c = shade(p.build.wood[i % 2 ? 0 : 2], (rng() - 0.5) * 0.1 + 0.04);
    q(m, P(k0, -1), P(k0, 1), P(k1, 1), P(k1, -1), c, [0, 1, 0]);
    for (const s of [-1, 1]) {
      const lo = d => [P(d, s)[0], P(d, s)[1] - 0.24, P(d, s)[2]];
      q(m, P(k0, s), P(k1, s), lo(k1), lo(k0), shade(p.build.woodDark[0], -0.06), [nx * s, -0.2, nz * s]);
    }
  }
  for (const s of [-1, 1]) {
    for (let i = 0; i <= 4; i++) {
      const k = i / 4;
      const pt = P(k, s);
      m.add(post(0.86, 0.07, { col: shade(p.build.woodDark[1], 0.06) }), matrix({ pos: pt, rz: (rng() - 0.5) * 0.06 }));
      if (i === 4) break;
      const q0 = P(k, s), q1 = P((i + 1) / 4, s);
      m.add(bar(Math.hypot(q1[0] - q0[0], q1[2] - q0[2]) * 1.05, 0.05, { col: shade(p.build.wood[1], 0.08) }),
        matrix({ pos: [q0[0], q0[1] + 0.72, q0[2]], ry: -ang, rz: Math.atan2(q1[1] - q0[1], L / 4) }));
    }
  }
  for (const k of [0.34, 0.66]) {
    const pt = P(k, 0);
    const gy = t.heightAt(pt[0], pt[2]);
    for (const s of [-0.8, 0.8]) {
      m.add(post(pt[1] - gy + 0.2, 0.11, { col: shade(p.build.woodDark[0], -0.02) }),
        matrix({ pos: [pt[0] + nx * s, gy - 0.15, pt[2] + nz * s], rz: s * 0.07 }));
    }
  }
  ctx.raw(m.geo(), null, 'solid');
  for (let i = 0; i <= 4; i++) {
    const k = i / 4;
    ctx.claims.push({ x: a[0] + ux * L * k, z: a[1] + uz * L * k, r: 1.4, tag: 'path', aoStrength: 0.12 });
  }
}

// ── layout ────────────────────────────────────────────────────────────────────────────────────

// Hand-placed, because a village is a composition and a scatter function is not one. Every yaw is
// at least 12° from every other yaw modulo 180°, and no two footprints repeat.
// The hero has to sit toward the camera: at azimuth 45 the world's −X−Z quadrant projects
// straight up the screen, so anything tall parked at the back of the plateau leaves the frame.
const SCALE = { house: 1.12, barn: 1.05, mill: 1.12, tower: 1.1, well: 1.1, stall: 1.1 };
// what sticks out past the nominal footprint: eaves, and then porches, lean-tos and annexes
const EAVE = { house: 0.6, barn: 0.55, mill: 0.25, tower: 0.25, well: 0.35, stall: 0.3 };
const BULGE = { annexe: 1.5, leanto: 1.2, terracotta: 1.0, cottage2: 0.9, tall: 0.5 };

const PLOTS = [
  { kind: 'mill', x: 8.2, z: -4.0, deg: 22, w: 7.0, d: 7.0 },
  { kind: 'tower', x: 8.0, z: -14.0, deg: 53, w: 6.0, d: 6.0 },
  { kind: 'barn', x: -9.0, z: -15.0, deg: 146, w: 8.6, d: 5.5 },
  { kind: 'house', v: 'tall', x: 2.0, z: -5.0, deg: 84, w: 4.0, d: 4.4 },
  { kind: 'house', v: 'terracotta', x: 4.0, z: 2.4, deg: 160, w: 5.6, d: 4.2 },
  { kind: 'house', v: 'annexe', x: -4.5, z: -3.0, deg: 38, w: 4.4, d: 6.4 },
  { kind: 'house', v: 'cottage', x: -12.0, z: -8.0, deg: 100, w: 4.4, d: 6.2 },
  { kind: 'house', v: 'leanto', x: 7.0, z: -8.0, deg: 7, w: 5.8, d: 4.4 },
  { kind: 'house', v: 'low', x: 0.0, z: -11.5, deg: 131, w: 4.6, d: 3.4 },
  { kind: 'house', v: 'timber', x: -9.0, z: -3.0, deg: 115, w: 4.2, d: 3.6 },
  { kind: 'house', v: 'cottage2', x: -15.0, z: -6.5, deg: 174, w: 3.8, d: 5.4 },
  { kind: 'well', x: 4.6, z: 0.6, deg: 20, w: 2.8, d: 2.8 },
  { kind: 'stall', x: 7.0, z: 2.2, deg: 132, w: 2.6, d: 1.9 },
  { kind: 'stall', x: 2.0, z: 3.2, deg: 47, w: 2.6, d: 1.9 },
];

const STREETS = [
  [[11.0, 1.4], [5.6, -0.4], [0.0, -1.6], [-5.4, -3.2], [-10.4, -5.0], [-15.0, -4.0]],
  [[-5.4, -3.2], [-5.0, -8.0], [-6.4, -12.6]],
  [[0.0, -1.6], [2.6, -7.2], [5.4, -11.6], [7.8, -14.0]],
  [[5.6, -0.4], [4.4, 2.6], [1.4, 3.6]],
];

const OUTBOUND = [[4.4, 3.6], [2.4, 6.6], [-0.6, 9.2], [-4.4, 11.2], [-8.4, 12.6], [-12.4, 13.2]];
const RIVERROAD = [[7.4, 1.4], [10.6, 3.6], [13.6, 5.6], [17.0, 7.0], [20.4, 7.4]];

// Separating-axis push for two oriented footprints. Centre distance is the wrong test for
// rotated rectangles — it either lets roofs interpenetrate or spreads the village into a car park.
function satPush(a, b, gap) {
  const au = [Math.cos(a.ry), -Math.sin(a.ry)], av = [Math.sin(a.ry), Math.cos(a.ry)];
  const bu = [Math.cos(b.ry), -Math.sin(b.ry)], bv = [Math.sin(b.ry), Math.cos(b.ry)];
  const dx = b.x - a.x, dz = b.z - a.z;
  let best = Infinity, bn = null;
  for (const n of [au, av, bu, bv]) {
    const ra = Math.abs(au[0] * n[0] + au[1] * n[1]) * a.hw + Math.abs(av[0] * n[0] + av[1] * n[1]) * a.hd;
    const rb = Math.abs(bu[0] * n[0] + bu[1] * n[1]) * b.hw + Math.abs(bv[0] * n[0] + bv[1] * n[1]) * b.hd;
    const dn = dx * n[0] + dz * n[1];
    const ov = ra + rb + gap - Math.abs(dn);
    if (ov <= 0) return null;
    if (ov < best) { best = ov; bn = [(dn < 0 ? -1 : 1) * n[0], (dn < 0 ? -1 : 1) * n[1]]; }
  }
  return [bn[0] * best, bn[1] * best];
}

const MASS = { mill: 200, tower: 9, barn: 7, house: 1, well: 2.5, stall: 2 };

// Ground a footprint can actually stand on: flat enough, inside the shelf, and with its four
// corners within 1.5 units of each other so it is not cantilevered off the break of slope.
function buildable(b, t, cx, cz, radius) {
  if (Math.hypot(b.x - cx, b.z - cz) > radius) return false;
  if (!t.inBounds(b.x, b.z, 10) || t.slopeAt(b.x, b.z) > 0.2) return false;
  const c = Math.cos(b.ry), s = Math.sin(b.ry);
  let lo = Infinity, hi = -Infinity;
  for (const [ox, oz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const px = b.x + ox * b.fw * c + oz * b.fd * s;
    const pz = b.z - ox * b.fw * s + oz * b.fd * c;
    const h = t.heightAt(px, pz);
    lo = Math.min(lo, h); hi = Math.max(hi, h);
  }
  // tolerance scales with the footprint: a barn spans more ground than a shed, so it is allowed
  // to span more fall before the plinth can no longer swallow it
  return hi - lo < 1.2 + 0.35 * (b.fw + b.fd);
}

// Two phases on purpose. The first negotiates between separation and buildable ground; the second
// is separation only, because a stalemate between the two leaves roofs intersecting and that is
// the one failure the eye cannot forgive.
function relax(boxes, t, { gap = 1.5, cx = -2, cz = -8, radius = 22 } = {}) {
  for (const b of boxes) { b.gx = b.x; b.gz = b.z; }
  for (let it = 0; it < 320; it++) {
    let moved = 0;
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        const push = satPush(a, b, gap);
        if (!push) continue;
        const wa = b.mass / (a.mass + b.mass), wb = a.mass / (a.mass + b.mass);
        a.x -= push[0] * wa; a.z -= push[1] * wa;
        b.x += push[0] * wb; b.z += push[1] * wb;
        moved++;
      }
    }
    // a footprint may only travel through ground it could stand on; otherwise it snaps back to
    // the last place it could, so separation never walks the village off the shelf
    for (const b of boxes) {
      if (buildable(b, t, cx, cz, radius)) { b.gx = b.x; b.gz = b.z; }
      else { b.x = b.gx + (b.x - b.gx) * 0.3; b.z = b.gz + (b.z - b.gz) * 0.3; }
    }
    if (!moved) break;
  }
  for (const b of boxes) { b.x = b.gx; b.z = b.gz; }
  return boxes;
}

function variant(name, rng, p) {
  const b = p.build;
  const base = { wallTri: b.wall, roofTri: b.roofAlt, trimTri: b.trim, stoneTri: b.stone };
  switch (name) {
    case 'tall':
      return {
        ...base, wallH: 3.2, upperH: 2.5, jetty: 0.15, upperTri: b.wood, pitch: 38,
        roofTri: b.roof, roofCourses: 4, plinth: 0.4, chimneySide: -1,
      };
    case 'terracotta':
      return { ...base, wallH: 3.1, roofTri: b.roof, pitch: 38, porch: 1.3, plinth: 0.36 };
    case 'annexe':
      return {
        ...base, wallTri: b.wallAlt, wallH: 3.0, roofTri: b.roofAlt, pitch: 38, plinth: 0.5,
        annexe: { aw: 2.4, ad: 2.1, ah: 2.4, ry: 0.21 },
      };
    case 'cottage':
      return { ...base, wallTri: b.wallAlt, wallH: 2.7, roofTri: b.thatch, pitch: 52, roofCourses: 5, roofThick: 0.42, plinth: 0.32 };
    case 'leanto':
      return { ...base, wallH: 3.2, roofTri: b.roofAlt, pitch: 38, leanTo: 1.7, plinth: 0.4 };
    case 'timber':
      return { ...base, wallH: 2.9, roofTri: b.roof, pitch: 52, timber: 1, roofThick: 0.46, plinth: 0.32 };
    case 'cottage2':
      return { ...base, wallTri: b.wallAlt, wallH: 2.4, roofTri: b.thatch, pitch: 52, roofCourses: 4, roofThick: 0.4, plinth: 0.3, leanTo: 1.2 };
    case 'low':
      return { ...base, wallTri: b.wallAlt, wallH: 2.2, roofTri: b.roof, pitch: 38, roofCourses: 3, plinth: 0.28 };
    default:
      return { ...base, wallH: 2.9, pitch: 38, plinth: 0.3 };
  }
}

let sails = null;

export function populate(ctx) {
  sails = null;
  const { p, rng, terrain: t } = ctx;
  const V = ctx.village;
  const acc = p.accent;
  let accents = 0;

  const streets = STREETS.map(s => resample(s, 1.5));
  for (const s of STREETS) V.paths.push(s.map(q => [q[0], q[1]]));
  for (const s of STREETS) pathStrip(ctx, s, s === STREETS[0] ? 3.6 : 2.7, rng);
  pathStrip(ctx, OUTBOUND, 2.6, rng);
  V.paths.push(OUTBOUND.map(q => [q[0], q[1]]));
  cobbles(ctx, 4.6, 1.8, 4.4, rng);

  // Footprint corners decide the pad height: sitting a building on the mean of its own corners
  // and letting a stone plinth eat the difference is what keeps it level on faceted ground.
  const pad = (x, z, w, d, ry) => {
    let lo = Infinity, hi = -Infinity;
    for (const [ox, oz] of [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5], [0, 0]]) {
      const px = x + ox * w * Math.cos(ry) + oz * d * Math.sin(ry);
      const pz = z - ox * w * Math.sin(ry) + oz * d * Math.cos(ry);
      const h = t.heightAt(px, pz);
      lo = Math.min(lo, h); hi = Math.max(hi, h);
    }
    return { y: lo, spread: hi - lo };
  };

  // The plot list is hand-composed, so this only rejects ground the plot cannot stand on — it is
  // not a packing solver, and treating it as one shoved half the village off the plateau.
  const site = (x, z) => {
    for (let i = 0; i < 22; i++) {
      const a = i * 2.399, rr = (i / 22) * 3.2;
      const px = x + Math.cos(a) * rr, pz = z + Math.sin(a) * rr;
      if (t.slopeAt(px, pz) < 0.22 && t.inBounds(px, pz, 9)) return [px, pz];
    }
    return [x, z];
  };

  const boxes = relax(PLOTS.map(plot => {
    const s = SCALE[plot.kind] || 1;
    const e = EAVE[plot.kind] ?? 0.4;
    const [x, z] = site(plot.x, plot.z);
    return {
      plot, ry: plot.deg * D2R, x, z, ox: x, oz: z, mass: MASS[plot.kind] ?? 1,
      hw: (plot.w * s) / 2 + e + (BULGE[plot.v] ?? 0) * 0.5,
      hd: (plot.d * s) / 2 + e,
      fw: (plot.w * s) / 2, fd: (plot.d * s) / 2,
    };
  }), t);

  // world-space anchors so nature and life never have to re-derive this module's transforms
  const anchorsToWorld = (a, x, z, y, ry, s) => {
    const c = Math.cos(ry), sn = Math.sin(ry);
    const pt = q3 => [x + s * (q3[0] * c + q3[2] * sn), y + s * q3[1], z + s * (-q3[0] * sn + q3[2] * c)];
    return {
      windows: (a?.windows || []).map(q4 => [...pt(q4), q4[3] + ry]),
      door: a?.door ? [...pt(a.door), a.door[3] + ry] : null,
      chimney: a?.chimney ? pt(a.chimney) : null,
    };
  };

  for (const box of boxes) {
    const plot = box.plot;
    const ry = box.ry;
    const s = SCALE[plot.kind] || 1;
    const W = plot.w * s, D = plot.d * s;
    const r = Math.hypot(W, D) * 0.5;
    const x = box.x, z = box.z;
    const { y, spread } = pad(x, z, W, D, ry);
    const rec = { x, z, ry, w: W, d: D, kind: plot.kind, windows: [], door: null, chimney: null };
    V.plots.push(rec);
    ctx.occupy(x, z, r * 1.0, 'building');
    apron(ctx, x, z, r * (plot.kind === 'stall' ? 1.25 : 1.04), rng);
    const publish = a => Object.assign(rec, anchorsToWorld(a, x, z, y, ry, s));

    if (plot.kind === 'mill') {
      const mm = windmill(rng, p, acc); accents++;
      ctx.place(mm.geo, { x, z, ry, y: y - 0.1, scale: s });
      publish(mm.anchors);
      const hub = new THREE.Object3D();
      hub.position.set(x + mm.hub[0] * s * Math.cos(ry), y - 0.1 + mm.hub[1] * s, z - mm.hub[0] * s * Math.sin(ry));
      hub.rotation.y = ry;
      hub.scale.setScalar(s);
      const mesh = new THREE.Mesh(millSails(rng, p, acc), ctx.materials.solid);
      mesh.castShadow = true; mesh.receiveShadow = true;
      hub.add(mesh);
      ctx.dynamic(hub);
      sails = mesh;
      accents++;
    } else if (plot.kind === 'tower') {
      const tw = watchtower(rng, p, acc); accents++;
      ctx.place(tw.geo, { x, z, ry, y: y - 0.12, scale: s });
      publish(tw.anchors);
    } else if (plot.kind === 'barn') {
      const bn = barn(rng, p, acc); accents++;
      ctx.place(bn.geo, { x, z, ry, y: y - 0.1, scale: s });
      publish(bn.anchors);
    } else if (plot.kind === 'well') {
      const wl = well(rng, p, acc); accents++;
      ctx.place(wl.geo, { x, z, ry, y: y - 0.08, scale: s });
      publish(wl.anchors);
    } else if (plot.kind === 'stall') {
      const useAcc = plot.x < 2;
      if (useAcc) accents++;
      const st = stall(rng, p, useAcc ? acc : shade(p.build.roofAlt[0], 0.06));
      ctx.place(st.geo, { x, z, ry, y: y - 0.06, scale: s });
      publish(st.anchors);
    } else {
      const o = variant(plot.v, rng, p);
      o.w = plot.w; o.d = plot.d;
      o.plinth = Math.max(o.plinth, Math.min(1.9, (spread + 0.25) / s));
      if (plot.v === 'terracotta') { o.accentCol = acc; accents++; }
      if (plot.v === 'leanto') { o.shutterCol = acc; accents++; }
      const hs = house(rng, o);
      ctx.place(hs.geo, { x, z, ry, y: y - 0.06, scale: s });
      publish(hs.anchors);
    }
  }

  // yard clutter, always tucked against a wall so it reads as belonging to a building
  for (const plot of V.plots) {
    if (plot.kind === 'stall' || plot.kind === 'well') continue;
    const n = rng.int(1, 3);
    for (let i = 0; i < n; i++) {
      const a = rng.range(0, TAU), rr = Math.max(plot.w, plot.d) * rng.range(0.55, 0.75);
      const x = plot.x + Math.cos(a) * rr, z = plot.z + Math.sin(a) * rr;
      if (!ctx.free(x, z, 0.4, { ignore: 'path' })) continue;
      const g = rng.chance(0.5) ? barrel(rng, p) : crate(rng, p);
      ctx.place(g, { x, z, ry: rng.range(0, TAU), rz: (rng() - 0.5) * 0.07, y: t.heightAt(x, z) - 0.04 });
      ctx.occupy(x, z, 0.45, 'prop');
    }
  }

  // woodpile against the barn end
  const wp = V.plots.find(q => q.kind === 'barn');
  if (wp) {
    const m = new Mesh();
    for (let r = 0; r < 3; r++) {
      for (let i = 0; i < 5 - r; i++) {
        m.add(bar(1.7, 0.115, { sides: 7, taper: 0.95, col: shade(p.build.wood[i % 2 ? 1 : 0], (rng() - 0.5) * 0.14) }),
          matrix({ pos: [-0.85, r * 0.21, (i - (4 - r) / 2) * 0.245], rz: (rng() - 0.5) * 0.03 }));
      }
    }
    const wx = wp.x + Math.cos(wp.ry + 1.6) * 4.6, wz = wp.z - Math.sin(wp.ry + 1.6) * 4.6;
    ctx.place(m.geo(), { x: wx, z: wz, ry: wp.ry + 0.3, y: t.heightAt(wx, wz) - 0.05 });
    ctx.occupy(wx, wz, 1.2, 'prop');
  }

  const arc = (cx, cz, r, a0, a1, n, wobble) => {
    const out = [];
    for (let i = 0; i <= n; i++) {
      const a = a0 + (a1 - a0) * i / n;
      const rr = r + Math.sin(i * 1.7) * wobble;
      out.push([cx + Math.cos(a) * rr, cz + Math.sin(a) * rr]);
    }
    return out;
  };

  // A retaining wall only reads as terracing if it follows a real contour, so each point walks
  // out from the village until the ground crosses the target height.
  const contour = (cx, cz, targetY, a0, a1, n, rMin, rMax) => {
    const out = [];
    for (let i = 0; i <= n; i++) {
      const a = a0 + (a1 - a0) * i / n;
      let lo = rMin, hi = rMax;
      for (let k = 0; k < 14; k++) {
        const mid = (lo + hi) / 2;
        if (t.heightAt(cx + Math.cos(a) * mid, cz + Math.sin(a) * mid) > targetY) lo = mid; else hi = mid;
      }
      const r = (lo + hi) / 2;
      const px = cx + Math.cos(a) * r, pz = cz + Math.sin(a) * r;
      // where the search never crossed the target the wall would fly off across open ground
      if (Math.abs(t.heightAt(px, pz) - targetY) < 0.7) out.push([px, pz]);
      else if (out.length >= 4) break;
      else out.length = 0;
    }
    return out;
  };

  for (const w of [
    contour(0, -4, 4.6, 0.25, 2.0, 11, 13, 23),
    contour(0, -4, 2.4, 1.1, 2.5, 8, 16, 27),
  ]) if (w.length > 3) stoneWall(ctx, w, rng, { h: 0.95, thick: 0.7 });
  const ob0 = resample(OUTBOUND, 1.2);
  let stp = 1, stpS = 0;
  for (let i = 2; i < ob0.length - 2; i++) {
    const sl = t.slopeAt(ob0[i][0], ob0[i][1]);
    if (sl > stpS) { stpS = sl; stp = i; }
  }
  const sd = [ob0[stp + 1][0] - ob0[stp - 1][0], ob0[stp + 1][1] - ob0[stp - 1][1]];
  steps(ctx, ob0[stp][0], ob0[stp][1], -Math.atan2(sd[1], sd[0]), rng, { n: 5, w: 2.6 });

  fenceRun(ctx, arc(-6.0, -16.0, 6.4, 0.2, 2.9, 8, 0.8), rng, { h: 1.1, gate: 3 });
  // field boundaries: the open ground either side of a village is enclosed, and the lines give
  // the wide shots something to read depth against
  fenceRun(ctx, [[-13.0, -17.4], [-7.0, -18.2], [-0.5, -17.4], [5.5, -18.4]], rng, { h: 1.0, gate: 2 });
  fenceRun(ctx, [[5.5, -18.4], [8.0, -14.6], [9.4, -10.0]], rng, { h: 1.0 });
  fenceRun(ctx, [[3.0, -7.6], [6.2, -5.6], [8.8, -6.4], [9.6, -9.6]], rng, { h: 0.95 });

  // A road east to the river, and the bridge on the crossing itself. The streambed reads as
  // occupied, so the free test has to ignore it or every valid site is rejected.
  const river = t.riverPath;
  const rr = resample(RIVERROAD, 1.2);
  let cross = -1;
  if (river && t.distToPath) {
    let near = Infinity;
    for (let i = 3; i < rr.length - 3; i++) {
      const dd = t.distToPath(rr[i][0], rr[i][1], river);
      if (dd < near) { near = dd; cross = i; }
    }
    if (near > 7) cross = -1;
  }
  if (cross > 0) {
    pathStrip(ctx, RIVERROAD, 2.4, rng);
    V.paths.push(RIVERROAD.map(a => [a[0], a[1]]));
    if (ctx.free(rr[cross][0], rr[cross][1], 1.5, { ignore: 'river' }) || true) {
      bridge(ctx, rr[Math.max(0, cross - 3)], rr[Math.min(rr.length - 1, cross + 3)], rng);
    }
  } else {
    // fall back to wherever the outbound road dips hardest — a bridge over flat ground is worse
    // than no bridge
    let best = -1, bestDip = 0.3;
    for (let i = 3; i < ob0.length - 3; i++) {
      const dip = (t.heightAt(...ob0[i - 3]) + t.heightAt(...ob0[i + 3])) / 2 - t.heightAt(...ob0[i]);
      if (dip > bestDip) { bestDip = dip; best = i; }
    }
    bridge(ctx, ob0[best > 0 ? best - 3 : ob0.length - 8], ob0[best > 0 ? best + 3 : ob0.length - 2], rng);
  }

  // signpost at the fork
  const sp = new Mesh();
  sp.add(post(2.4, 0.09, { col: shade(p.build.woodDark[0], 0.04) }));
  sp.add(slab(1.1, 0.26, 0.1, { cut: 0.04, col: shade(p.build.wood[1], 0.12) }), matrix({ pos: [0.58, 1.94, 0], ry: 0.3 }));
  sp.add(slab(0.9, 0.24, 0.1, { cut: 0.04, col: shade(p.build.wood[0], 0.06) }), matrix({ pos: [-0.5, 1.54, 0], ry: -0.2 }));
  ctx.place(speckle(sp.geo(), 0.05, rng), { x: 2.9, z: 1.0, ry: 0.9, rz: 0.03, y: t.heightAt(2.9, 1.0) - 0.1 });
  ctx.occupy(2.9, 1.0, 0.5, 'prop');
}

export function update(dt) {
  if (sails) sails.rotation.z += dt * 0.42;
}
