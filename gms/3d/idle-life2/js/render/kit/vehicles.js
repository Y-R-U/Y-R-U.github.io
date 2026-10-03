// Soft toy vehicles. Front = +x, origin on the ground at the centre.
import * as S from './shape.js?v=20261004b';

const at = (x, z, ry, y = 0, parent = null) => {
  const m = S.matrix({ pos: [x, y, z], ry });
  return parent ? m.premultiply(parent) : m;
};

function wheels(b, M, xs, zs, r = 0.3) {
  for (const x of xs) for (const z of zs) {
    b.add(S.drum(11, r, 0.2), '#3d3846', { parent: M, x, y: r, z, r: 0.6 });
    b.add(S.drum(9, r * 0.55, 0.22), 'chrome', { parent: M, x, y: r, z });
  }
}

export function van(b, x, z, ry = 0, slot = 'teal', o = {}) {
  const M = at(x, z, ry, o.y || 0, o.parent);
  if (o.contact !== false) b.contact(0, 0, 3.4, 1.5, { parent: M, k: 0.85, m: 0.35 });
  b.slab(slot, -0.25, 0.3, 0, 2.7, 1.35, 1.45, { parent: M, round: 0.22, taper: 0.03 });
  b.slab(slot, 1.25, 0.3, 0, 0.75, 0.8, 1.4, { parent: M, round: 0.2 });
  b.slab('glass', 1.02, 1.08, 0, 0.36, 0.5, 1.3, { parent: M, round: 0.06, rz: -0.35, noAo: true });
  b.slab('white', -0.25, 1.62, 0, 2.5, 0.12, 1.3, { parent: M, round: 0.05 });
  b.slab('chrome', 1.62, 0.32, 0, 0.12, 0.2, 1.42, { parent: M, round: 0.05 });
  b.slab('chrome', -1.65, 0.32, 0, 0.1, 0.2, 1.42, { parent: M, round: 0.05 });
  for (const s of [-1, 1]) {
    b.ball('bulb', 1.65, 0.62, s * 0.5, 0.09, { parent: M, detail: 0 });
    b.slab('glass', 0.62, 1.0, s * 0.73, 0.5, 0.42, 0.04, { parent: M, round: 0.04, noAo: true });
  }
  b.slab('white', -0.15, 0.85, 0.73, 1.6, 0.06, 0.04, { parent: M, round: 0.02 });
  wheels(b, M, [-1.0, 1.05], [-0.62, 0.62], 0.32);
  return b;
}

export function car(b, x, z, ry = 0, slot = 'orange', o = {}) {
  const M = at(x, z, ry, o.y || 0, o.parent);
  const L = o.len ?? 2.5;
  if (o.contact !== false) b.contact(0, 0, L, 1.3, { parent: M, k: 0.85, m: 0.3 });
  b.slab(slot, 0, 0.17, 0, L, 0.6, 1.32, { parent: M, round: 0.24, taper: 0.03 });
  b.slab(slot, -0.1, 0.7, 0, L * 0.6, 0.12, 1.2, { parent: M, round: 0.06, taper: 0.02 });
  b.slab('glass', -0.1, 0.8, 0, L * 0.56, 0.34, 1.14, { parent: M, round: 0.1, taper: 0.18, noAo: true });
  b.slab(slot, -0.14, 1.12, 0, L * 0.44, 0.14, 0.98, { parent: M, round: 0.07, taper: 0.06 });
  for (const s of [-1, 1]) {
    b.ball('bulb', L / 2 - 0.05, 0.56, s * 0.42, 0.09, { parent: M, detail: 0 });
    b.ball('red', -L / 2 + 0.05, 0.6, s * 0.45, 0.07, { parent: M, detail: 0 });
    b.slab(slot, -0.1, 0.81, s * 0.6, 0.05, 0.3, 0.05, { parent: M, round: 0.02 });
  }
  b.slab('chrome', L / 2 + 0.03, 0.25, 0, 0.14, 0.17, 1.28, { parent: M, round: 0.06 });
  b.slab('chrome', -L / 2 - 0.03, 0.25, 0, 0.14, 0.17, 1.28, { parent: M, round: 0.06 });
  wheels(b, M, [-L * 0.3, L * 0.3], [-0.56, 0.56], 0.23);
  if (o.dirty) for (let i = 0; i < 7; i++) b.ball('dirt', (b.rnd() - 0.5) * L * 0.8, 0.35 + b.rnd() * 0.4, (b.rnd() < 0.5 ? -1 : 1) * 0.66, 0.06 + b.rnd() * 0.07, { parent: M, sz: 0.3, detail: 0 });
  return b;
}

export function boat(b, x, z, ry = 0, slot = 'white', len = 4, o = {}) {
  const M = at(x, z, ry, o.y || 0, o.parent);
  const hull = S.loft([
    S.ringCircle(9, 0.35, 0, 0, 1).map((p) => [p[0] * len * 0.9, p[1], p[2] * 0.9]),
    S.ringCircle(9, 0.5, 0.45, 0, 1).map((p) => [p[0] * len * 0.95 + (p[0] > 0 ? p[0] * 0.6 : 0), p[1], p[2] * 1.5]),
    S.ringCircle(9, 0.52, 0.7, 0, 1).map((p) => [p[0] * len * 0.98 + (p[0] > 0 ? p[0] * 0.8 : 0), p[1], p[2] * 1.6]),
  ], { col: '#ffffff' });
  b.add(hull, slot, { parent: M, r: 0.4 });
  b.slab(o.stripe || 'blue', 0, 0.55, 0, len * 0.98, 0.1, 1.62, { parent: M, round: 0.05 });
  b.slab('wood', 0, 0.62, 0, len * 0.8, 0.06, 1.3, { parent: M, round: 0.03 });
  b.slab(o.cabin || 'white', -len * 0.12, 0.65, 0, len * 0.3, 0.7, 0.95, { parent: M, round: 0.1, taper: 0.1 });
  b.slab('glass', -len * 0.12 + len * 0.15, 0.95, 0, 0.06, 0.32, 0.8, { parent: M, round: 0.02 });
  return b;
}
