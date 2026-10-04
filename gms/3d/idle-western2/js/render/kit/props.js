// Reusable dressing built through a builder: townhouses, street furniture, greenery, paving.
// Every function takes (b, x, z, opts) in the builder's space; opts.ry rotates, opts.y lifts, opts.parent nests.
import * as THREE from 'three';
import * as S from './shape.js?v=20261004h';
import { resolveSlot, ROOF } from './build.js?v=20261004h';

const at = (x, y, z, ry = 0, parent = null) => {
  const m = S.matrix({ pos: [x, y, z], ry });
  return parent ? m.premultiply(parent) : m;
};
const pick = (b, arr) => arr[Math.floor(b.rnd() * arr.length)];

// Chunky chevron roof, ridge along local z. Cross-section extruded from -D to D.
export function roofGeo(w, d, h, { over = 0.32, overZ = 0.3, t = 0.2, col = '#d9786a', under = null } = {}) {
  const m = new S.Mesh();
  const W = w / 2 + over, D = d / 2 + overZ, drop = over * (h / (w / 2));
  const top = [[-W, -drop, 0], [0, h, 0], [W, -drop, 0]];
  const bot = [[-W, -drop - t, 0], [0, h - t * 1.25, 0], [W, -drop - t, 0]];
  const Z = (p, z) => [p[0], p[1], z];
  const cu = under || S.shade(col, -0.35);
  const ce = S.shade(col, 0.12);
  for (let i = 0; i < 2; i++) {
    m.quad(Z(top[i], D), Z(top[i + 1], D), Z(top[i + 1], -D), Z(top[i], -D), i ? S.shade(col, -0.04) : col);
    m.quad(Z(bot[i], -D), Z(bot[i + 1], -D), Z(bot[i + 1], D), Z(bot[i], D), cu);
    m.quad(Z(top[i], D), Z(bot[i], D), Z(bot[i + 1], D), Z(top[i + 1], D), ce);
    m.quad(Z(top[i + 1], -D), Z(bot[i + 1], -D), Z(bot[i], -D), Z(top[i], -D), ce);
  }
  for (const k of [0, 2]) {
    const s = k ? -1 : 1;
    if (s > 0) m.quad(Z(top[k], -D), Z(bot[k], -D), Z(bot[k], D), Z(top[k], D), ce);
    else m.quad(Z(top[k], D), Z(bot[k], D), Z(bot[k], -D), Z(top[k], -D), ce);
  }
  const g = m.geo();
  g.setAttribute('aSurf', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count).fill(ROOF), 1));
  return g;
}

function gableWall(w, h, col) {
  const m = new S.Mesh();
  m.tri([-w / 2, 0, 0], [w / 2, 0, 0], [0, h, 0], col);
  m.tri([w / 2, 0, -0.02], [-w / 2, 0, -0.02], [0, h, -0.02], col);
  return m.geo();
}

export function windowUnit(b, x, y, z, o = {}) {
  const P = o.parent, ry = o.ry || 0;
  const w = o.w ?? 0.72, h = o.h ?? 0.98;
  const M = at(x, y, z, ry, P);
  if (o.lite) {
    const fc = o.frame || 'trim', T0 = { parent: M, round: 0, taper: 0 };
    b.slab(fc, 0, -0.1, 0.03, w + 0.2, 0.11, 0.18, T0);
    const q = new S.Mesh(), gl = S.rgb(resolveSlot(b.palette, 'glass').c), cu = S.rgb(resolveSlot(b.palette, 'window').c);
    {
      const F = S.rgb(resolveSlot(b.palette, fc).c), Fs = S.shade(F, -0.18), f = 0.09, Z = 0.06, X = w / 2;
      const o4 = [[-X, 0], [X, 0], [X, h], [-X, h]], i4 = [[-X + f, f * 0.4], [X - f, f * 0.4], [X - f, h - f], [-X + f, h - f]];
      for (let k = 0; k < 4; k++) {
        const n = (k + 1) % 4, A = o4[k], B = o4[n], C = i4[n], D = i4[k];
        q.quad([A[0], A[1], Z], [B[0], B[1], Z], [C[0], C[1], Z], [D[0], D[1], Z], F);
        q.quad([D[0], D[1], Z], [C[0], C[1], Z], [C[0], C[1], -0.02], [D[0], D[1], -0.02], Fs);
      }
    }
    const x0 = -w / 2 + 0.08, x1 = w / 2 - 0.08, y0 = 0.0, y1 = h - 0.1, ym = h * 0.52;
    q.quad([x0, y0, -0.01], [x1, y0, -0.01], [x1, ym, -0.01], [x0, ym, -0.01], gl);
    q.quad([-0.025, y0, 0.0], [0.025, y0, 0.0], [0.025, y1, 0.0], [-0.025, y1, 0.0], S.rgb(resolveSlot(b.palette, fc).c));
    q.quad([x0, ym - 0.02, 0.0], [x1, ym - 0.02, 0.0], [x1, ym + 0.025, 0.0], [x0, ym + 0.025, 0.0], S.rgb(resolveSlot(b.palette, fc).c));
    b.add(q.geo(), null, { parent: M, r: 0.1, noAo: true });
    const c = new S.Mesh();
    c.quad([x0, ym, -0.01], [x1, ym, -0.01], [x1, y1, -0.01], [x0, y1, -0.01], cu);
    b.add(c.geo(), null, { parent: M, r: 0.4, g: -1, noAo: true });
    if (o.shutter) for (const s2 of [-1, 1]) b.slab(o.shutter, s2 * (w / 2 + 0.15), 0.02, -0.02, 0.2, h - 0.08, 0.05, T0);
    if (o.box) {
      b.slab(o.box, 0, -0.2, 0.14, w + 0.05, 0.16, 0.2, T0);
      b.slab(b.palette.flowers ? pick(b, b.palette.flowers) : 'pink', 0, -0.05, 0.14, w - 0.05, 0.1, 0.14, T0);
    }
    return;
  }
  b.slab(o.frame || 'trim', 0, 0, 0, w, h, 0.1, { parent: M, round: 0.035, taper: 0.02 });
  b.slab('glass', 0, 0.09, 0.04, w - 0.16, h - 0.2, 0.04, { parent: M, round: 0.01, noAo: true });
  b.slab('window', 0, h * 0.52, 0.065, w - 0.2, h * 0.36, 0.02, { parent: M, round: 0.01, noAo: true });
  b.slab(o.frame || 'trim', 0, h * 0.45, 0.07, w - 0.16, 0.05, 0.03, { parent: M, round: 0.01, noAo: true });
  b.slab(o.frame || 'trim', 0, -0.06, 0.06, w + 0.14, 0.08, 0.16, { parent: M, round: 0.03 });
  if (o.shutter) for (const s of [-1, 1]) b.slab(o.shutter, s * (w / 2 + 0.17), 0.02, 0.0, 0.24, h - 0.06, 0.06, { parent: M, round: 0.03 });
  if (o.box) {
    b.slab(o.box, 0, -0.2, 0.14, w + 0.05, 0.18, 0.2, { parent: M, round: 0.04 });
    for (let i = 0; i < 4; i++) b.ball(b.palette.flowers ? pick(b, b.palette.flowers) : 'pink', -w / 2 + 0.12 + i * (w - 0.24) / 3, -0.01, 0.2, 0.075, { parent: M, detail: 0 });
  }
}

export function door(b, x, y, z, o = {}) {
  const M = at(x, y, z, o.ry || 0, o.parent);
  if (o.lite) {
    b.slab(o.frame || 'trim', 0, 0, 0, 1.06, 1.9, 0.1, { parent: M, round: 0, taper: 0 });
    b.slab(o.color || 'door', 0, 0, 0.05, 0.82, 1.74, 0.06, { parent: M, round: 0, taper: 0 });
    return;
  }
  b.slab(o.frame || 'trim', 0, 0, 0, 1.06, 1.9, 0.1, { parent: M, round: 0.04 });
  b.slab(o.color || 'door', 0, 0, 0.05, 0.82, 1.74, 0.06, { parent: M, round: 0.03 });
  b.slab('window', 0, 1.25, 0.09, 0.5, 0.3, 0.02, { parent: M, round: 0.01 });
  b.ball('gold', 0.28, 0.85, 0.11, 0.035, { parent: M, detail: 0 });
  b.slab('stone', 0, -0.02, 0.32, 1.25, 0.14, 0.5, { parent: M });
}

// A pastel townhouse. Front = +z. opts: w d floors fh wall roof ridgeX chimneys dormer shop door shutters boxes
export function house(b, x, z, o = {}) {
  const pal = b.palette;
  const w = o.w ?? 4.2, d = o.d ?? 4.6, floors = o.floors ?? 2, fh = o.fh ?? 2.35;
  const wall = o.wall ?? pick(b, pal.walls || ['#f4e3cf']), roof = o.roof ?? pick(b, pal.roofs || ['#d9786a']);
  const ry = o.ry || 0, base = o.y || 0;
  const M = at(x, base, z, ry, o.parent);
  const H = floors * fh + 0.3;
  if (o.contact !== false) b.contact(0, 0, w + 0.2, d + 0.2, { parent: M, k: 0.8 });
  b.slab('stone', 0, 0, 0, w + 0.18, 0.34, d + 0.18, { parent: M, round: 0.06 });
  b.slab(wall, 0, 0.3, 0, w, H - 0.3, d, { parent: M, round: 0.1, taper: 0.012 });
  for (let f = 1; f < floors; f++) b.slab('trim', 0, 0.3 + f * fh - 0.06, 0, w + 0.1, 0.14, d + 0.1, { parent: M, round: 0.04, taper: 0 });
  if (o.band) b.slab(S.shade(S.rgb(resolveSlot(pal, wall).c), -0.1), 0, 0.3, 0, w + 0.012, fh - 0.12, d + 0.012, { parent: M, round: 0.08, taper: 0 });
  if (o.quoins) for (const s of [-1, 1]) for (let k = 0; k < floors * 3; k++) b.slab('trim', s * (w / 2 - 0.08) + (k % 2) * s * -0.08, 0.4 + k * (fh / 3), d / 2 - 0.08 + (k % 2) * -0.08, 0.3 + (k % 2) * 0.16, fh / 3 - 0.08, 0.3 + (k % 2) * 0.16, { parent: M, round: 0.03, taper: 0 });
  b.slab('trim', 0, H - 0.04, 0, w + 0.2, 0.2, d + 0.2, { parent: M, round: 0.06, taper: 0 });
  const pitch = o.pitch ?? (b.rnd() < 0.5 ? 0.66 : 0.9);
  const ridgeX = o.ridgeX ?? false;
  const rw = ridgeX ? d : w, rd = ridgeX ? w : d;
  const rh = (rw / 2) * Math.tan(pitch);
  const RM = at(0, H + 0.14, 0, ridgeX ? Math.PI / 2 : 0, M);
  b.add(roofGeo(rw, rd, rh, { col: S.rgb(resolveSlot(pal, roof).c) }), null, { parent: RM, r: 0.7, noAo: true });
  for (const s of [-1, 1]) b.add(gableWall(rw, rh, S.rgb(resolveSlot(pal, wall).c)), null, { parent: at(0, 0, s * rd / 2 - s * 0.01, s > 0 ? 0 : Math.PI, RM), noAo: true });
  if (!ridgeX && o.attic !== false && rh > 1.3) windowUnit(b, 0, H + 0.35, d / 2 + 0.02, { parent: M, w: 0.6, h: 0.7, frame: 'trim', lite: o.lite });
  const nCh = o.chimneys ?? (b.rnd() < 0.75 ? 1 : 2);
  for (let i = 0; i < nCh; i++) {
    const cx = (i ? -1 : 1) * rw * (0.18 + b.rnd() * 0.08), cz = (b.rnd() - 0.5) * rd * 0.5;
    const cy = rh * (1 - Math.abs(cx) / (rw / 2)) - 0.3;
    const CM = at(cx, cy, cz, 0, RM);
    const ch = o.chimneyColor || (b.rnd() < 0.5 ? 'brick' : wall);
    b.slab(ch, 0, 0, 0, 0.55, 1.25, 0.6, { parent: CM, round: 0.06, taper: 0.04 });
    b.slab('trim', 0, 1.2, 0, 0.7, 0.14, 0.75, { parent: CM, round: 0.04 });
    for (const p of [-0.12, 0.13]) b.cyl('pot', p, 1.33, 0, 0.08, 0.22, 0, { parent: CM, sides: 7, taper: 0.8 });
  }
  if (o.dormer ?? (rh > 1.5 && b.rnd() < 0.6)) {
    const side = b.rnd() < 0.5 ? -1 : 1, dz = (b.rnd() - 0.5) * rd * 0.3;
    const ox = side * rw * 0.24, oy = rh * (1 - Math.abs(ox) / (rw / 2)) - 0.55;
    const DM = at(ox, oy, dz, side > 0 ? Math.PI / 2 : -Math.PI / 2, RM);
    b.slab(wall, 0, 0, -0.1, 1.0, 0.95, 1.25, { parent: DM, round: 0.06 });
    b.add(roofGeo(1.0, 1.25, 0.42, { col: S.rgb(resolveSlot(pal, roof).c), over: 0.12, overZ: 0.12, t: 0.1 }), null, { parent: at(0, 0.97, -0.1, 0, DM), noAo: true });
    b.add(gableWall(1.0, 0.42, S.rgb(resolveSlot(pal, wall).c)), null, { parent: at(0, 0.97, 0.52, 0, DM), noAo: true });
    windowUnit(b, 0, 0.18, 0.52, { parent: DM, w: 0.55, h: 0.62, lite: o.lite });
  }
  const shutter = o.shutters ? (typeof o.shutters === 'string' ? o.shutters : pick(b, ['#7fb5a8', '#8a8fd0', '#e3a066', '#d9786a'])) : null;
  const nw = Math.max(1, Math.floor((w - 0.6) / 1.35));
  for (let f = 0; f < floors; f++) {
    for (let i = 0; i < nw; i++) {
      const wx = -w / 2 + (i + 0.5) * (w / nw);
      if (f === 0 && (o.shop || (o.door !== false && i === Math.min(nw - 1, Math.floor(nw / 2))))) continue;
      windowUnit(b, wx, 0.3 + f * fh + 0.62, d / 2 + 0.02, { parent: M, shutter, box: f > 0 && o.boxes ? 'pot' : null, lite: o.lite, w: o.ww, h: o.wh });
    }
    const ns = Math.max(1, Math.floor((d - 0.8) / 1.6));
    for (const s of [-1, 1]) {
      if (o.sides === false || (o.sides === 'right' && s < 0) || (o.sides === 'left' && s > 0)) continue;
      for (let i = 0; i < ns; i++) {
        const wz = -d / 2 + (i + 0.5) * (d / ns);
        windowUnit(b, s * (w / 2 + 0.02), 0.3 + f * fh + 0.62, wz, { parent: M, ry: s * Math.PI / 2, lite: o.lite });
      }
    }
  }
  if (o.shop) {
    const sw = Math.min(w - 0.6, 3.4);
    b.slab('trim', 0, 0.3, d / 2 + 0.02, sw + 0.2, 1.95, 0.12, { parent: M, round: 0.05 });
    b.slab('glass', -0.45, 0.42, d / 2 + 0.1, sw - 1.2, 1.5, 0.05, { parent: M, round: 0.02, noAo: true });
    b.slab('window', -0.45, 1.0, d / 2 + 0.13, sw - 1.3, 0.8, 0.02, { parent: M, round: 0.01, noAo: true, g: -0.8 });
    door(b, sw / 2 - 0.45, 0.3, d / 2 + 0.05, { parent: M, color: o.doorColor });
    b.slab(o.shop.sign || 'sign', 0, 2.35, d / 2 + 0.08, sw, 0.42, 0.12, { parent: M, round: 0.05 });
    if (o.shop.awning !== false) b.awning(o.shop.awning || 'accent', 0, 2.25, 0, sw + 0.3, 1.1, 0, { parent: at(0, 0, d / 2 + 0.6, 0, M), alt: 'white' });
  } else if (o.door !== false) {
    const dx = -w / 2 + (Math.min(nw - 1, Math.floor(nw / 2)) + 0.5) * (w / nw);
    door(b, dx, 0.3, d / 2 + 0.03, { parent: M, lite: o.lite, color: o.doorColor || pick(b, ['door', '#7fb5a8', '#d9786a', '#8a8fd0']) });
  }
  return { h: H + rh, w, d };
}

// A solid shop building with an open cutaway front: thick pilasters, a deep lintel with a sign band, plinth, cornice,
// optional upper floor with windows and a pitched roof. Front = +z. Returns the interior box for dressing.
// opts: w d fh floors wall trim roof inner floor open(w of the opening) sign ry parent chimneys awning
export function shop(b, x, z, o = {}) {
  const pal = b.palette;
  const w = o.w ?? 6, d = o.d ?? 4.5, fh = o.fh ?? 3.0, T = o.t ?? 0.36, floors = o.floors ?? 2, uh = o.uh ?? 2.3;
  const wall = o.wall ?? 'wall', trim = o.trim ?? 'trim', inner = o.inner ?? wall;
  const ow = Math.min(w - 2 * T - 0.5, o.open ?? w - 1.4), oh = o.oh ?? fh - 0.75;
  const M = at(x, o.y || 0, z, o.ry || 0, o.parent);
  const H = fh + (floors - 1) * uh;
  b.contact(0, 0, w + 0.3, d + 0.3, { parent: M, k: 0.85 });
  b.slab('stone', 0, 0, 0, w + 0.22, 0.3, d + 0.22, { parent: M, round: 0.07, taper: 0.02 });
  const ig = o.innerGlow ?? 0.12;
  b.slab(o.floor || 'pad', 0, 0.28, 0.1, w - 2 * T, 0.05, d - T - 0.1, { parent: M, round: 0.02, taper: 0, g: ig });
  b.slab(inner, 0, 0.28, -d / 2 + T / 2, w - 0.02, fh - 0.28, T, { parent: M, round: 0.06, taper: 0, g: ig });
  for (const s of [-1, 1]) {
    b.slab(wall, s * (w / 2 - T / 2), 0.28, 0, T, fh - 0.28, d, { parent: M, round: 0.07, taper: 0 });
    const pw = (w - ow) / 2;
    b.slab(wall, s * (w / 2 - pw / 2), 0.28, d / 2 - T / 2, pw, fh - 0.28, T, { parent: M, round: 0.08, taper: 0 });
    b.slab(trim, s * (ow / 2 + 0.1), 0.28, d / 2 - T / 2 + 0.01, 0.3, oh - 0.2, T + 0.08, { parent: M, round: 0.09, taper: 0 });
    b.slab(trim, s * (w / 2 - pw / 2), 0.26, d / 2 - T / 2 + 0.02, pw + 0.12, 0.3, T + 0.14, { parent: M, round: 0.06, taper: 0 });
    b.slab(inner, s * (w / 2 - T - 0.01), 0.28, 0, 0.04, fh - 0.3, d - 2 * T, { parent: M, round: 0, taper: 0, noAo: true, g: ig });
  }
  b.slab(wall, 0, oh, d / 2 - T / 2, ow + 0.1, fh - oh, T, { parent: M, round: 0.06, taper: 0 });
  b.slab(trim, 0, oh - 0.14, d / 2 - T / 2 + 0.01, ow + 0.5, 0.28, T + 0.1, { parent: M, round: 0.09, taper: 0 });
  b.slab(o.sign || 'sign', 0, oh + 0.14, d / 2 + 0.05, Math.min(ow, 3.6), fh - oh - 0.3, 0.14, { parent: M, round: 0.07, taper: 0 });
  b.slab(trim, 0, fh - 0.06, 0, w + 0.3, 0.2, d + 0.3, { parent: M, round: 0.07, taper: 0 });
  if (floors > 1) {
    b.slab(wall, 0, fh + 0.12, 0, w - 0.06, uh * (floors - 1) - 0.12, d - 0.06, { parent: M, round: 0.1, taper: 0.012 });
    b.slab(trim, 0, H - 0.04, 0, w + 0.24, 0.22, d + 0.24, { parent: M, round: 0.07, taper: 0 });
    const nw = Math.max(1, Math.floor((w - 0.8) / 1.5));
    for (let f = 1; f < floors; f++) for (let i = 0; i < nw; i++) {
      windowUnit(b, -w / 2 + (i + 0.5) * (w / nw), fh + (f - 1) * uh + 0.55, d / 2 - 0.02, { parent: M, w: 0.78, h: 1.1, shutter: o.shutters || null, box: o.boxes ? 'pot' : null });
    }
    for (const s of [-1, 1]) windowUnit(b, s * (w / 2 - 0.02), fh + 0.55, 0, { parent: M, ry: s * Math.PI / 2, w: 0.7, h: 1.0 });
  }
  if (o.roof !== false) {
    const roof = o.roof ?? 'roof';
    const rh = o.rh ?? w * 0.32;
    const RM = at(0, H + 0.14, 0, Math.PI / 2, M);
    b.add(roofGeo(d, w, rh, { col: S.rgb(resolveSlot(pal, roof).c), over: 0.38, overZ: 0.34, t: 0.24 }), null, { parent: RM, r: 0.55, noAo: true });
    for (const s of [-1, 1]) b.add(gableWall(d, rh, S.rgb(resolveSlot(pal, wall).c)), null, { parent: at(0, 0, s * w / 2 - s * 0.01, s > 0 ? 0 : Math.PI, RM), noAo: true });
    const nCh = o.chimneys ?? 1;
    for (let i = 0; i < nCh; i++) {
      const cx = (i ? -1 : 1) * w * 0.3, CM = at(cx, H + rh * 0.45, -d * 0.12, 0, M);
      b.slab(o.chimney || 'brick', 0, 0, 0, 0.6, 1.3, 0.62, { parent: CM, round: 0.07, taper: 0.04 });
      b.slab(trim, 0, 1.25, 0, 0.76, 0.15, 0.78, { parent: CM, round: 0.05 });
      for (const p of [-0.13, 0.14]) b.cyl('pot', p, 1.38, 0, 0.09, 0.24, 0, { parent: CM, sides: 7, taper: 0.8 });
    }
    if (o.dormer) {
      const DM = at(0, H + rh * 0.18, d / 2 - 0.15, 0, M);
      b.slab(wall, 0, 0, -0.5, 1.2, 1.05, 1.3, { parent: DM, round: 0.07 });
      b.add(roofGeo(1.2, 1.35, 0.5, { col: S.rgb(resolveSlot(pal, roof).c), over: 0.14, overZ: 0.12, t: 0.12 }), null, { parent: at(0, 1.05, -0.5, 0, DM), noAo: true });
      b.add(gableWall(1.2, 0.5, S.rgb(resolveSlot(pal, wall).c)), null, { parent: at(0, 1.05, 0.16, 0, DM), noAo: true });
      windowUnit(b, 0, 0.18, 0.16, { parent: DM, w: 0.62, h: 0.7 });
    }
  }
  if (o.awning) b.awning(o.awning, 0, oh - 0.12, 0, ow + 0.4, 1.2, 0, { parent: at(0, 0, d / 2 + 0.62, 0, M), alt: o.awningAlt || 'white', drop: 0.4 });
  return { M, x0: -w / 2 + T, x1: w / 2 - T, z0: -d / 2 + T, z1: d / 2 - T, y: 0.33, h: H, oh, ow };
}

export function lamp(b, x, z, o = {}) {
  const M = at(x, o.y || 0, z, o.ry || 0, o.parent);
  const h = o.h ?? 3.4;
  b.contact(0, 0, 0.3, 0.3, { parent: M, k: 0.7, m: 0.22 });
  b.cyl('iron', 0, 0, 0, 0.16, 0.35, 0, { parent: M, sides: 7, taper: 0.7 });
  b.cyl('iron', 0, 0.3, 0, 0.06, h - 0.3, 0, { parent: M, sides: 7, taper: 0.7 });
  b.cyl('iron', 0, h - 0.05, 0, 0.17, 0.08, 0, { parent: M, sides: 7, taper: 1.25 });
  b.cyl('lamp', 0, h, 0, 0.15, 0.36, 0, { parent: M, sides: 7, taper: 1.3, noAo: true });
  b.cone('iron', 0, h + 0.34, 0, 0.27, 0.3, 0, { parent: M, sides: 7, curve: 0.9 });
  b.ball('iron', 0, h + 0.68, 0, 0.05, { parent: M, detail: 0 });
  const bulb = [x, (o.y || 0) + h + 0.18, z];
  if (!o.parent) b.lamps?.push(bulb);
  return bulb;
}

export function bench(b, x, z, o = {}) {
  const M = at(x, o.y || 0, z, o.ry || 0, o.parent);
  b.contact(0, -0.05, 1.45, 0.5, { parent: M, k: 0.65 });
  for (const s of [-0.62, 0.62]) {
    b.slab('iron', s, 0, 0.05, 0.08, 0.44, 0.48, { parent: M, round: 0.02 });
    b.slab('iron', s, 0.42, -0.2, 0.07, 0.5, 0.07, { parent: M, round: 0.02, rx: -0.15 });
  }
  for (let i = 0; i < 3; i++) b.slab(o.wood || 'wood', 0, 0.42, -0.09 + i * 0.14, 1.55, 0.06, 0.12, { parent: M, round: 0.02 });
  for (let i = 0; i < 2; i++) b.slab(o.wood || 'wood', 0, 0.62 + i * 0.16, -0.24, 1.55, 0.11, 0.05, { parent: M, round: 0.02, rx: -0.15 });
}

export function planter(b, x, z, o = {}) {
  const M = at(x, o.y || 0, z, o.ry ?? b.rnd() * 6, o.parent);
  const s = o.s ?? 1;
  b.contact(0, 0, 0.5 * s, 0.5 * s, { parent: M, k: 0.8, m: 0.2 * s });
  b.cyl(o.pot || 'pot', 0, 0, 0, 0.26 * s, 0.38 * s, 0, { parent: M, sides: 9, taper: 1.3 });
  b.cyl('dirt', 0, 0.36 * s, 0, 0.3 * s, 0.04, 0, { parent: M, sides: 9 });
  const n = o.leaves ?? 7;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 6.28 + b.rnd() * 0.4;
    b.cone(i % 2 ? 'leaf' : 'leafDark', Math.cos(a) * 0.06 * s, 0.36 * s, Math.sin(a) * 0.06 * s, 0.07 * s, (0.5 + b.rnd() * 0.3) * s, a, { parent: M, sides: 5, rx: Math.cos(a) * 0.55, rz: -Math.sin(a) * 0.55, sway: 0.15 });
  }
  if (o.flowers) for (let i = 0; i < 3; i++) b.ball(pick(b, b.palette.flowers), (b.rnd() - 0.5) * 0.3 * s, (0.6 + b.rnd() * 0.2) * s, (b.rnd() - 0.5) * 0.3 * s, 0.07 * s, { parent: M, detail: 0 });
}

export function bush(b, x, z, o = {}) {
  const s = o.s ?? 1, M = at(x, o.y || 0, z, b.rnd() * 6, o.parent);
  b.contact(0, 0, 0.9 * s, 0.8 * s, { parent: M, k: 0.6 });
  b.ball(o.c || 'leafDark', 0, 0.38 * s, 0, 0.55 * s, { parent: M, sy: 0.75, sway: 0.05 });
  b.ball(o.c2 || 'leaf', 0.32 * s, 0.32 * s, 0.18 * s, 0.38 * s, { parent: M, sy: 0.8, sway: 0.05 });
  if (o.flowers) for (let i = 0; i < 4; i++) b.ball(pick(b, b.palette.flowers), (b.rnd() - 0.5) * 0.8 * s, (0.55 + b.rnd() * 0.15) * s, (b.rnd() - 0.3) * 0.6 * s, 0.07 * s, { parent: M, detail: 0 });
}

export function roundTree(b, x, z, o = {}) {
  const s = o.s ?? 1, ry = b.rnd() * 6.28, lean = (b.rnd() - 0.5) * 0.1;
  const M = at(x, o.y || 0, z, ry, o.parent);
  b.cyl('trunk', 0, 0, 0, 0.16 * s, 1.7 * s, 0, { parent: M, sides: 5, taper: 0.62, rz: lean });
  if (!o.lod) b.contact(0, 0, 0.9 * s, 0.9 * s, { parent: M, k: 0.45, m: 0.5 * s });
  b.ball(o.c || 'leaf', lean * 1.5 * s, 2.2 * s, 0, 1.0 * s, { parent: M, sy: 0.95, sway: 0.06, aoBase: 1.4 * s, detail: o.lod ? 0 : 1 });
  if (o.cluster !== false && !o.lod) {
    b.ball(o.c2 || 'leaf2', 0.5 * s, 1.85 * s, 0.35 * s, 0.6 * s, { parent: M, sway: 0.06, aoBase: 1.4 * s, detail: 1 });
    b.ball(o.c3 || 'leafDark', -0.45 * s, 1.95 * s, -0.3 * s, 0.55 * s, { parent: M, sway: 0.06, aoBase: 1.4 * s, detail: 1 });
  }
}

export function pineTree(b, x, z, o = {}) {
  const s = o.s ?? 1, M = at(x, o.y || 0, z, b.rnd() * 6.28, o.parent);
  b.cyl('trunk', 0, 0, 0, 0.14 * s, 0.9 * s, 0, { parent: M, sides: 5, taper: 0.6 });
  for (let i = 0; i < (o.lod ? 2 : 3); i++) b.cone(i === 1 ? 'pine' : 'leafDark', 0, (0.6 + i * 0.75) * s, 0, (1.05 - i * 0.25) * s, (1.35 - i * 0.15) * s, i * 1.3, { parent: M, sides: 7, sway: 0.04, curve: 1.05 });
}

export function cypress(b, x, z, o = {}) {
  const s = o.s ?? 1, M = at(x, o.y || 0, z, b.rnd() * 6.28, o.parent);
  b.cyl('trunk', 0, 0, 0, 0.1 * s, 0.5 * s, 0, { parent: M, sides: 5, taper: 0.6 });
  b.ball(o.c || 'pine', 0, 1.6 * s, 0, 0.55 * s, { parent: M, sy: 2.3, sway: 0.05, detail: 1 });
}

export function bin(b, x, z, o = {}) {
  const M = at(x, o.y || 0, z, o.ry || 0, o.parent);
  b.contact(0, 0, 0.55, 0.55, { parent: M, k: 0.75, m: 0.2 });
  b.cyl(o.c || 'green', 0, 0, 0, 0.28, 0.75, 0, { parent: M, sides: 9, taper: 1.12 });
  b.cyl(o.lid || 'iron', 0, 0.75, 0, 0.34, 0.08, 0, { parent: M, sides: 9, taper: 0.9 });
}

export function bollard(b, x, z, o = {}) {
  const M = at(x, o.y || 0, z, 0, o.parent);
  b.cyl(o.c || 'iron', 0, 0, 0, 0.11, 0.65, 0, { parent: M, sides: 7, taper: 0.8 });
  b.ball(o.c || 'iron', 0, 0.68, 0, 0.1, { parent: M, detail: 0 });
}

export function crate(b, x, z, o = {}) {
  const s = o.s ?? 1;
  const M = at(x, o.y || 0, z, o.ry ?? (b.rnd() - 0.5) * 0.5, o.parent);
  if (!o.y) b.contact(0, 0, 0.7 * s, 0.5 * s, { parent: M, k: 0.75, m: 0.18 });
  b.slab(o.c || 'wood', 0, 0, 0, 0.7 * s, 0.45 * s, 0.5 * s, { parent: M, round: 0.04 });
  b.slab(o.c2 || 'wood2', 0, 0.12 * s, 0.26 * s, 0.72 * s, 0.08 * s, 0.02, { parent: M, round: 0.01 });
  if (o.fill) for (let i = 0; i < 5; i++) b.ball(o.fill, (i - 2) * 0.12 * s, 0.47 * s, (b.rnd() - 0.5) * 0.25 * s, 0.09 * s, { parent: M, detail: 0 });
}

export function picket(b, x0, z0, x1, z1, o = {}) {
  const n = Math.max(2, Math.round(Math.hypot(x1 - x0, z1 - z0) / 0.32));
  const ry = Math.atan2(-(z1 - z0), x1 - x0);
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
    b.slab(o.c || 'white', x, 0, z, 0.1, 0.72 + (i % 2) * 0.04, 0.06, { ry, round: 0.02, rz: (b.rnd() - 0.5) * 0.05 });
  }
  for (const y of [0.22, 0.5]) {
    const L = Math.hypot(x1 - x0, z1 - z0);
    b.slab(o.c || 'white', (x0 + x1) / 2, y, (z0 + z1) / 2 - 0.05, L, 0.07, 0.04, { ry, round: 0.015 });
  }
}

export function hedge(b, x0, z0, x1, z1, o = {}) {
  const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(L / 0.9));
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    b.ball(i % 3 ? 'leafDark' : 'leaf', x0 + (x1 - x0) * t, 0.45 * (o.h ?? 1), z0 + (z1 - z0) * t, 0.6, { sy: 0.8 * (o.h ?? 1), sway: 0.02 });
  }
}

// Triangle flags strung on a sagging line between two posts (3D points).
export function bunting(b, a, c, o = {}) {
  const n = o.n ?? Math.max(5, Math.round(Math.hypot(c[0] - a[0], c[2] - a[2]) / 0.55));
  const cols = o.colors || ['#e8776a', '#f6d35c', '#7fb5a8', '#ffffff', '#8a8fd0', '#f2a6bd'];
  const sag = o.sag ?? 0.6;
  const m = new S.Mesh();
  const pt = (t) => [a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t - Math.sin(t * Math.PI) * sag, a[2] + (c[2] - a[2]) * t];
  for (let i = 0; i < n; i++) {
    const p0 = pt((i + 0.1) / n), p1 = pt((i + 0.9) / n), pm = pt((i + 0.5) / n);
    const tip = [pm[0], pm[1] - 0.38, pm[2]];
    const col = S.rgb(cols[i % cols.length]);
    m.tri(p0, tip, p1, col);
    m.tri(p1, tip, p0, S.shade(col, -0.15));
  }
  for (let i = 0; i < 12; i++) {
    const p0 = pt(i / 12), p1 = pt((i + 1) / 12);
    m.quad(p0, p1, [p1[0], p1[1] - 0.025, p1[2]], [p0[0], p0[1] - 0.025, p0[2]], S.rgb('#fbf6ee'));
    m.quad([p0[0], p0[1] - 0.025, p0[2]], [p1[0], p1[1] - 0.025, p1[2]], p1, p0, S.rgb('#fbf6ee'));
  }
  b.add(m.geo(), null, { r: 0.8, noAo: true, sway: 0.06 });
}

// Bevelled cobbles in a jittered running bond over a dark crevice base. Rotated rect, centre (cx, cz).
// Each stone gets its own pastel from `colors` (±tint), a chamfered top and shaded sides; the north side is
// skipped (cameras always look from the south). opts: colors tile gap ry y grout long h r edge
// Textured cobble ground (kit/surface.js): a flat grid whose vertices carry the district tint and a moss weight.
// opts: colors, y, ry, tone (brightness ×), moss (number for all edges | {n,s,e,w}), mossW (falloff m), edge, legacy (old bevel tiles).
export function paving(b, cx, cz, w, d, o = {}) {
  if (o.legacy) return pavingTiles(b, cx, cz, w, d, o);
  const cols = (o.colors || b.palette.cobbles).map((c) => S.rgb(resolveSlot(b.palette, c).c));
  let avg = [0, 0, 0];
  for (const k of cols) avg = [avg[0] + k[0] / cols.length, avg[1] + k[1] / cols.length, avg[2] + k[2] / cols.length];
  const tone = o.tone ?? 0.94;
  const ry = o.ry || 0, y = (o.y ?? 0) + 0.03, c = Math.cos(ry), s = Math.sin(ry);
  const P = (lx, lz) => [cx + lx * c + lz * s, y, cz - lx * s + lz * c];
  const mo = typeof o.moss === 'number' ? { n: o.moss, s: o.moss, e: o.moss, w: o.moss } : (o.moss || {});
  const mw = o.mossW ?? 0.9;
  const nx = Math.max(1, Math.round(w / 1.6)), nz = Math.max(1, Math.round(d / 1.6));
  const V = [];
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const lx = -w / 2 + (i / nx) * w, lz = -d / 2 + (j / nz) * d;
    const e = Math.max((mo.w || 0) * Math.max(0, 1 - (lx + w / 2) / mw), (mo.e || 0) * Math.max(0, 1 - (w / 2 - lx) / mw),
      (mo.n || 0) * Math.max(0, 1 - (lz + d / 2) / mw), (mo.s || 0) * Math.max(0, 1 - (d / 2 - lz) / mw));
    const inner = i > 0 && j > 0 && i < nx && j < nz;
    const k = tone * (1 + (b.rnd() - 0.5) * 0.06) * (1 - e * 0.12);
    const hue = (b.rnd() - 0.5) * 0.03;
    V.push({ p: P(lx, lz), c: [avg[0] * k * (1 + hue), avg[1] * k, avg[2] * k * (1 - hue)], m: Math.min(1, e + (inner && b.rnd() < 0.05 ? 0.5 : 0)) });
  }
  const pos = [], col = [], sf = [], nor = [];
  const push = (v) => { pos.push(...v.p); col.push(...v.c); sf.push(-1 - v.m); nor.push(0, 1, 0); };
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const A = V[j * (nx + 1) + i], B2 = V[j * (nx + 1) + i + 1], C = V[(j + 1) * (nx + 1) + i + 1], D = V[(j + 1) * (nx + 1) + i];
    push(A); push(D); push(C); push(A); push(C); push(B2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aSurf', new THREE.Float32BufferAttribute(sf, 1));
  b.add(g, null, { r: 0.75, noAo: true, speckle: 0 });
  if (o.edge) {
    const ec = o.edge === true ? 'kerb' : o.edge;
    edging(b, [...P(-w / 2, d / 2)].map((v, i) => (i === 1 ? 0 : v)), [...P(w / 2, d / 2)].map((v, i) => (i === 1 ? 0 : v)), { c: ec, y: o.y ?? 0 });
  }
}

function pavingTiles(b, cx, cz, w, d, o = {}) {
  const cols = (o.colors || b.palette.cobbles).map((c) => S.rgb(resolveSlot(b.palette, c).c));
  const tile = o.tile ?? 0.95, gap = o.gap ?? Math.max(0.035, tile * 0.055), ry = o.ry || 0, y = o.y ?? 0;
  const c = Math.cos(ry), s = Math.sin(ry);
  const P = (lx, ly, lz) => [cx + lx * c + lz * s, y + ly, cz - lx * s + lz * c];
  const m = new S.Mesh();
  let avg = [0, 0, 0];
  for (const k of cols) avg = [avg[0] + k[0] / cols.length, avg[1] + k[1] / cols.length, avg[2] + k[2] / cols.length];
  const grout = o.grout ? S.rgb(resolveSlot(b.palette, o.grout).c) : [avg[0] * 0.86, avg[1] * 0.8, avg[2] * 0.8];
  m.quad(P(-w / 2, 0.01, d / 2), P(w / 2, 0.01, d / 2), P(w / 2, 0.01, -d / 2), P(-w / 2, 0.01, -d / 2), grout);
  const tw = o.long ? tile * 1.45 : tile, rows = Math.max(1, Math.round(d / tile)), th = d / rows;
  const hgt = o.h ?? Math.min(0.06, tile * 0.07);
  const tintK = o.tint ?? 0.03;
  const breakP = o.breaks ?? 0.06;
  for (let r = 0; r < rows; r++) {
    const off = (r % 2) * tw * 0.5 + (b.rnd() - 0.5) * tw * 0.12;
    const z0 = -d / 2 + r * th;
    let x = -w / 2 - off;
    while (x < w / 2) {
      const len = tw * (0.8 + b.rnd() * 0.4);
      const xa = Math.max(-w / 2, x) + gap / 2, xb = Math.min(w / 2, x + len) - gap / 2;
      x += len;
      if (xb - xa < 0.1) continue;
      const za = z0 + gap / 2, zb = z0 + th - gap / 2;
      const base = b.rnd() < breakP ? cols[cols.length - 1 - Math.floor(b.rnd() * 2)] : cols[Math.floor(b.rnd() * cols.length)];
      const k = 1 + (b.rnd() - 0.5) * 2 * tintK, h2 = (b.rnd() - 0.5) * 0.03;
      const col = [base[0] * (k + h2), base[1] * k, base[2] * (k - h2)];
      const hh = hgt * (0.8 + b.rnd() * 0.4);
      const bv = Math.min(tile * 0.16, (xb - xa) * 0.25, (zb - za) * 0.25), b1 = bv * 0.3;
      const ring = (ins, yy) => [P(xa + ins, yy, zb - ins), P(xb - ins, yy, zb - ins), P(xb - ins, yy, za + ins), P(xa + ins, yy, za + ins)];
      const T = ring(bv, hh), M = ring(b1, hh * 0.78), B = ring(0, 0.012);
      m.quad(T[0], T[1], T[2], T[3], col);
      const side = (A, C, ka, kb) => {
        m.quad(A[0], A[1], C[1], C[0], S.shade(col, ka));
        m.quad(A[1], A[2], C[2], C[1], S.shade(col, kb));
        m.quad(A[3], A[0], C[0], C[3], S.shade(col, kb));
      };
      side(M, T, -0.01, -0.025);
      side(B, M, -0.04, -0.07);
    }
  }
  b.add(m.geo(), null, { r: o.r ?? 0.72, noAo: true, speckle: 0.012 });
  if (o.edge) {
    const ec = o.edge === true ? 'kerb' : o.edge;
    edging(b, P(-w / 2, 0, d / 2), P(w / 2, 0, d / 2), { c: ec, y });
  }
}

// A run of long bevelled kerb/edge stones between two ground points.
export function edging(b, a, c, o = {}) {
  const L = Math.hypot(c[0] - a[0], c[2] - a[2]), n = Math.max(1, Math.round(L / (o.len ?? 1.1)));
  const ry = Math.atan2(-(c[2] - a[2]), c[0] - a[0]);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n, x = a[0] + (c[0] - a[0]) * t, z = a[2] + (c[2] - a[2]) * t;
    const k = 1 + (b.rnd() - 0.5) * 0.06;
    const col = S.rgb(resolveSlot(b.palette, o.c || 'kerb').c).map((v) => v * k);
    b.slab(col, x, (o.y ?? 0) - 0.02, z, L / n - 0.05, o.h ?? 0.16, o.w ?? 0.34, { ry, round: 0.05, taper: 0.04 });
  }
}

// A raised lawn island with a kerb lip (the refs' little park patches). opts: ry, h, kerb, grass, y
export function lawn(b, x, z, w, d, o = {}) {
  const ry = o.ry || 0, h = o.h ?? 0.22, y = o.y || 0;
  b.contact(x, z, w + 0.4, d + 0.4, { ry, k: 0.55 });
  b.slab(o.kerb || 'kerb', x, y, z, w + 0.3, h, d + 0.3, { ry, round: 0.09, taper: 0.02 });
  b.slab(o.grass || 'grass', x, y + h - 0.06, z, w, 0.12, d, { ry, round: 0.06, taper: 0.03, r: 0.95 });
  const c = Math.cos(ry), sn = Math.sin(ry), nt = o.tufts ?? Math.round(w * d * 0.9);
  for (let i = 0; i < nt; i++) {
    const lx = (b.rnd() - 0.5) * (w - 0.3), lz = (b.rnd() - 0.5) * (d - 0.3);
    b.cone(b.rnd() < 0.5 ? 'leafDark' : 'leaf', x + lx * c + lz * sn, y + h + 0.02, z - lx * sn + lz * c, 0.07 + b.rnd() * 0.05, 0.16 + b.rnd() * 0.12, b.rnd() * 6, { sides: 5, sway: 0.4 });
  }
  return y + h + 0.05;
}

export function flowerBed(b, x, z, w, d, o = {}) {
  b.contact(x, z, w + 0.2, d + 0.2, { ry: o.ry || 0, k: 0.6, m: 0.25 });
  b.slab(o.edge || 'stone', x, 0, z, w + 0.2, 0.22, d + 0.2, { round: 0.06, ry: o.ry || 0 });
  b.slab('dirt', x, 0.08, z, w, 0.18, d, { round: 0.04, ry: o.ry || 0 });
  const n = Math.round(w * d * 3);
  const c = Math.cos(o.ry || 0), s = Math.sin(o.ry || 0);
  for (let i = 0; i < n; i++) {
    const lx = (b.rnd() - 0.5) * w * 0.9, lz = (b.rnd() - 0.5) * d * 0.85;
    const px = x + lx * c + lz * s, pz = z - lx * s + lz * c;
    if (b.rnd() < 0.55) b.ball(b.rnd() < 0.5 ? 'leaf' : 'leafDark', px, 0.3, pz, 0.16 + b.rnd() * 0.08, { sy: 0.8, detail: 0, sway: 0.1 });
    else b.ball(pick(b, b.palette.flowers), px, 0.38, pz, 0.08 + b.rnd() * 0.04, { detail: 0, sway: 0.1 });
  }
}

export function signPost(b, x, z, o = {}) {
  const M = at(x, 0, z, o.ry || 0, o.parent);
  b.contact(0, 0, 0.3, 0.3, { parent: M, k: 0.6, m: 0.15 });
  b.cyl('wood2', 0, 0, 0, 0.06, o.h ?? 1.6, 0, { parent: M, sides: 5 });
  b.slab(o.c || 'sign', 0, (o.h ?? 1.6) - 0.15, 0.05, o.w ?? 0.9, 0.5, 0.08, { parent: M, round: 0.05 });
}

export function umbrella(b, x, z, o = {}) {
  const M = at(x, 0, z, o.ry ?? b.rnd() * 6, o.parent);
  b.cyl('white', 0, 0, 0, 0.04, 2.2, 0, { parent: M, sides: 5 });
  const n = 9, r = o.r ?? 1.3;
  const m = new S.Mesh();
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * 6.283, a1 = ((i + 1) / n) * 6.283;
    const col = S.rgb(resolveSlot(b.palette, i % 2 ? 'white' : (o.c || 'accent')).c);
    const p0 = [Math.cos(a0) * r, 1.95, Math.sin(a0) * r], p1 = [Math.cos(a1) * r, 1.95, Math.sin(a1) * r];
    m.tri([0, 2.45, 0], p1, p0, col);
    m.tri([0, 2.43, 0], p0, p1, S.shade(col, -0.3));
  }
  b.add(m.geo(), null, { parent: M, r: 0.7, noAo: true });
}

export function table(b, x, z, o = {}) {
  const M = at(x, 0, z, o.ry || 0, o.parent);
  b.contact(0, 0, 0.8, 0.8, { parent: M, k: 0.5, m: 0.3 });
  b.cyl('iron', 0, 0, 0, 0.22, 0.05, 0, { parent: M, sides: 7 });
  b.cyl('iron', 0, 0, 0, 0.04, 0.72, 0, { parent: M, sides: 5 });
  b.cyl(o.c || 'white', 0, 0.72, 0, 0.42, 0.05, 0, { parent: M, sides: 11, taper: 1 });
  if (o.chairs !== false) for (const a of [0.3, 3.4]) {
    const cm = at(Math.cos(a) * 0.65, 0, Math.sin(a) * 0.65, -a + Math.PI / 2, M);
    b.slab(o.chair || 'wood', 0, 0.42, 0, 0.36, 0.05, 0.36, { parent: cm, round: 0.02 });
    b.slab(o.chair || 'wood', 0, 0.42, -0.17, 0.36, 0.4, 0.04, { parent: cm, round: 0.02 });
    for (const lx of [-0.15, 0.15]) for (const lz of [-0.15, 0.15]) b.slab('iron', lx, 0, lz, 0.035, 0.42, 0.035, { parent: cm, round: 0.01 });
  }
}

export function streetSign(b, x, z, o = {}) {
  const M = at(x, 0, z, o.ry || 0, o.parent);
  b.cyl('iron', 0, 0, 0, 0.05, 2.4, 0, { parent: M, sides: 5 });
  b.disc(o.c || 'blue', 0, 2.2, 0.06, 0.28, 0.04, { parent: M, rx: Math.PI / 2 });
}

// A friendly low-poly dog. fluff > 1 puffs the coat (pet salon dryer), front = +z.
export function dog(b, x, z, o = {}) {
  const M = at(x, o.y || 0, z, o.ry || 0, o.parent);
  if (!o.y) b.contact(0, 0, 0.45 * (o.s ?? 1), 0.85 * (o.s ?? 1), { parent: M, k: 0.6, m: 0.15 });
  const c = o.c || '#e9d3b4', c2 = o.c2 || '#c99f78', f = o.fluff ?? 1, s = o.s ?? 1;
  b.ball(c, 0, 0.42 * s, 0, 0.3 * s * f, { parent: M, sx: 0.9, sz: 1.45, detail: 1, smooth: true });
  for (const [lx, lz] of [[-0.14, 0.24], [0.14, 0.24], [-0.14, -0.26], [0.14, -0.26]]) b.cyl(c, lx * s, 0, lz * s, 0.07 * s, 0.34 * s, 0, { parent: M, sides: 7, taper: 0.8 });
  b.ball(c, 0, 0.72 * s, 0.4 * s, 0.22 * s * Math.sqrt(f), { parent: M, detail: 1, smooth: true });
  b.ball(c2, 0, 0.66 * s, 0.6 * s, 0.1 * s, { parent: M, sx: 1, sy: 0.8, sz: 1.2, detail: 1, smooth: true });
  b.ball('#3a2f35', 0, 0.7 * s, 0.7 * s, 0.045 * s, { parent: M, detail: 0 });
  for (const sx of [-1, 1]) {
    b.ball(c2, sx * 0.17 * s, 0.82 * s, 0.36 * s, 0.09 * s, { parent: M, sx: 0.6, sy: 1.6, sz: 1, rz: sx * 0.4, detail: 1 });
    b.ball('#2b2230', sx * 0.08 * s, 0.78 * s, 0.58 * s, 0.03 * s, { parent: M, detail: 0 });
  }
  b.cone(c, 0, 0.5 * s, -0.42 * s, 0.07 * s, 0.32 * s, 0, { parent: M, sides: 5, rx: -0.9 });
  if (o.bow) b.ball(o.bow, 0, 0.93 * s, 0.38 * s, 0.07 * s, { parent: M, sx: 1.8, sy: 0.7, detail: 0 });
}
