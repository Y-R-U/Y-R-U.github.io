// Bosses and their parts (CONTRACTS §15.1). Authored CENTRED in x[-1,1], y[-1,1] and scaled by
// the ent's half-extents, because parts are positioned by dx/dy from the body's centre.
//
// A boss is 400+ world units against a 900-unit viewport — the largest thing in the game — so it
// is built to read as a SILHOUETTE first: one big unbroken mass, detail only where it breaks the
// outline.

import { builder } from './parts.js';
import { mix, shade } from '../palette.js';

const B = {};
const def = (n, f) => { B[n] = f; };

def('boss_zeppelin', (b, P, E, fx) => {
  const skin = mix(P.metal, P.body, 0.45);
  b.sphere(1.0, 0, 0.05, 0, skin, { sx: 1.0, sy: 0.42, sz: 0.42, seg: 18, rings: 9 });
  // ribbing breaks the mass without breaking the silhouette
  for (let i = -3; i <= 3; i++) {
    const t = i / 3.4, r = Math.sqrt(Math.max(0, 1 - t * t));
    b.cyl(r * 0.425, r * 0.425, 0.02, 16, t * 0.98, 0.05, 0, shade(skin, -0.18), { rz: Math.PI / 2, open: true });
  }
  b.cone(0.30, 0.34, 10, 1.05, 0.05, 0, shade(skin, -0.1), { rz: -Math.PI / 2 });
  // tail fins
  b.plate([[-0.78, 0.05], [-1.18, 0.05], [-1.02, 0.62], [-0.80, 0.42]], 0.05, 0, shade(P.body, -0.05));
  b.plate([[-0.78, 0.05], [-1.18, 0.05], [-1.02, -0.52], [-0.80, -0.34]], 0.05, 0, shade(P.body, -0.05));
  b.box(0.36, 0.05, 0.9, -0.98, 0.05, 0, shade(P.body, -0.1));
  // gondola
  b.box(0.62, 0.20, 0.30, 0.05, -0.50, 0, P.body);
  b.box(0.30, 0.10, 0.24, 0.20, -0.42, 0, P.glass, { tint: 0 });
  b.pair((s) => b.box(0.03, 0.16, 0.03, s * 0.24, -0.36, 0, '#20242a'));
  b.box(0.22, 0.10, 0.20, -0.70, -0.30, 0, fx, { tint: 0 });
});

def('boss_battleship', (b, P, E, fx) => {
  const hull = shade(P.dark, 0.16);
  b.box(2.0, 0.55, 0.85, 0, -0.45, 0, hull);
  b.plate([[-1.0, -0.18], [1.0, -0.18], [1.24, -0.42], [1.0, -0.74], [-1.0, -0.74]], 0.8, 0, shade(hull, 0.05));
  b.box(1.9, 0.10, 0.9, 0, -0.14, 0, shade(P.metal, -0.3));
  b.box(0.70, 0.30, 0.55, -0.05, 0.06, 0, P.body);
  b.box(0.40, 0.26, 0.40, -0.05, 0.34, 0, shade(P.body, 0.08));
  b.box(0.34, 0.10, 0.30, 0.06, 0.36, 0, P.glass, { tint: 0 });
  b.box(0.06, 0.55, 0.06, -0.16, 0.72, 0, P.metal);
  b.cyl(0.10, 0.14, 0.34, 8, -0.52, 0.30, 0, shade(P.metal, -0.1));
});

def('boss_protobomber', (b, P, E, fx) => {
  const skin = shade(P.body, 0.02);
  b.pair((s) => {
    b.box(0.9, 0.16, 0.62, -0.10, 0, s * 0.52, skin, { ry: s * 0.62 });
    b.box(0.30, 0.17, 0.06, -0.62, 0, s * 0.95, P.metal, { tint: 0 });
  });
  b.box(1.1, 0.28, 0.55, 0.10, 0, 0, shade(skin, 0.06));
  b.cone(0.24, 0.42, 10, 0.78, 0, 0, shade(skin, 0.1), { rz: -Math.PI / 2 });
  b.box(0.34, 0.14, 0.30, 0.30, 0.16, 0, P.glass, { tint: 0 });
  b.plate([[-0.55, 0.10], [-0.80, 0.10], [-0.70, 0.62], [-0.52, 0.44]], 0.05, 0, shade(skin, -0.08));
  b.pair((s) => b.cyl(0.13, 0.13, 0.30, 9, -0.62, -0.06, s * 0.30, '#15171b', { rz: Math.PI / 2 }));
});

def('boss_fortress', (b, P, E, fx) => {
  const w = shade(P.body, -0.04);
  b.box(2.0, 1.1, 0.9, 0, -0.10, 0, w);
  b.box(1.6, 0.30, 0.95, 0, 0.60, 0, shade(w, 0.10));
  for (let i = -3; i <= 3; i++) b.box(0.16, 0.22, 0.98, i * 0.24, 0.86, 0, shade(w, -0.2));
  b.box(2.05, 0.16, 1.0, 0, -0.68, 0, shade(P.dark, 0.1));
  for (let i = -2; i <= 2; i++) b.box(0.22, 0.16, 0.10, i * 0.36, -0.20, 0.50, P.glass, { tint: 0 });
  b.pair((s) => b.cyl(0.16, 0.22, 0.55, 8, s * 0.78, 0.75, 0, shade(P.metal, -0.08)));
});

def('boss_engine', (b, P, E, fx) => {
  b.cyl(0.55, 0.62, 1.5, 12, 0, 0, 0, shade(P.metal, -0.05), { rz: Math.PI / 2 });
  b.cyl(0.66, 0.66, 0.18, 12, 0.30, 0, 0, shade(P.metal, 0.12), { rz: Math.PI / 2 });
  b.cyl(0.44, 0.44, 0.10, 12, -0.80, 0, 0, '#101216', { rz: Math.PI / 2 });
  b.pair((s) => b.box(0.30, 0.10, 0.55, 0.1, s * 0.62, 0, shade(P.body, -0.1)));
});

def('boss_turret', (b, P, E, fx) => {
  b.cyl(0.72, 0.85, 0.55, 10, 0, -0.42, 0, shade(P.metal, -0.15));
  b.box(0.95, 0.62, 0.85, 0, 0.08, 0, P.metal);
  b.box(1.0, 0.20, 0.10, 0, 0.20, 0, shade(P.metal, 0.14));
  b.pair((s) => b.cyl(0.13, 0.15, 1.3, 8, 0.62, 0.10, s * 0.22, '#1a1c20', { rz: Math.PI / 2 }));
});

def('boss_core', (b, P, E, fx) => {
  b.box(1.7, 1.4, 0.9, 0, 0, 0, shade(P.body, -0.06));
  b.box(1.5, 0.28, 0.95, 0, 0.55, 0, shade(P.body, 0.10));
  b.sphere(0.52, 0, -0.05, 0.36, fx, { sy: 0.9, seg: 10, rings: 8, tint: 0 });
  b.cyl(0.60, 0.60, 0.18, 12, 0, -0.05, 0.36, shade(P.metal, 0.1), { rz: Math.PI / 2, open: true });
  b.pair((s) => b.box(0.16, 1.5, 0.95, s * 0.88, 0, 0, shade(P.metal, -0.15)));
});

def('boss_bridge', (b, P, E, fx) => {
  b.box(1.5, 1.0, 0.85, 0, -0.2, 0, P.body);
  b.box(1.1, 0.4, 0.9, 0, 0.5, 0, shade(P.body, 0.1));
  b.box(1.0, 0.22, 0.10, 0, 0.5, 0.46, P.glass, { tint: 0 });
  b.box(0.10, 0.7, 0.10, 0, 1.05, 0, P.metal);
  b.box(0.9, 0.06, 0.5, 0, 0.9, 0, shade(P.metal, 0.15), { rz: 0.2 });
});

def('boss_cockpit', (b, P, E, fx) => {
  b.box(1.6, 1.0, 0.9, 0, -0.1, 0, shade(P.body, 0.02));
  b.cone(0.5, 0.8, 10, 1.05, -0.1, 0, shade(P.body, 0.1), { rz: -Math.PI / 2 });
  b.box(0.8, 0.34, 0.55, 0.2, 0.42, 0, P.glass, { tint: 0 });
  b.pair((s) => b.box(0.4, 0.14, 0.2, -0.6, s * 0.5, 0, shade(P.metal, -0.1)));
});

def('boss_pod', (b, P, E, fx) => {
  b.cyl(0.5, 0.58, 1.6, 12, 0, 0, 0, shade(P.body, -0.04), { rz: Math.PI / 2 });
  b.cone(0.5, 0.4, 12, 0.95, 0, 0, shade(P.body, 0.08), { rz: -Math.PI / 2 });
  b.cyl(0.38, 0.38, 0.10, 12, -0.85, 0, 0, fx, { rz: Math.PI / 2, tint: 0 });
});

def('boss_shield', (b, P, E, fx) => {
  b.box(0.35, 1.9, 1.0, 0, 0, 0, shade(P.metal, -0.1));
  for (let i = -2; i <= 2; i++) b.box(0.42, 0.16, 1.02, 0, i * 0.38, 0, shade(P.metal, 0.12));
  b.box(0.20, 0.30, 0.20, 0, 0, 0.55, fx, { tint: 0 });
});

def('boss_node', (b, P, E, fx) => {
  b.sphere(0.75, 0, 0, 0, shade(P.body, 0.0), { seg: 10, rings: 8 });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    b.box(0.6, 0.16, 0.16, Math.cos(a) * 0.85, Math.sin(a) * 0.85, 0, shade(P.metal, -0.08), { rz: a });
  }
  b.sphere(0.3, 0, 0, 0.5, fx, { seg: 8, rings: 6, tint: 0 });
});

def('boss_platform', (b, P, E, fx) => {
  b.box(2.0, 0.5, 1.0, 0, -0.5, 0, shade(P.dark, 0.16));
  b.box(1.7, 0.22, 1.05, 0, -0.12, 0, shade(P.metal, -0.2));
  for (let i = -3; i <= 3; i++) b.box(0.10, 0.5, 0.10, i * 0.26, 0.25, 0, P.metal);
  b.box(1.4, 0.14, 0.9, 0, 0.55, 0, shade(P.body, 0.05));
});

def('boss_core2', (b, P, E, fx) => {
  b.sphere(0.9, 0, 0, 0, shade(P.body, -0.05), { sy: 1.05, seg: 12, rings: 9 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    b.box(0.22, 1.9, 0.22, Math.cos(a) * 0.62, 0, Math.sin(a) * 0.4, shade(P.metal, -0.1), { rz: a * 0.2 });
  }
  b.sphere(0.42, 0, 0, 0.55, fx, { seg: 10, rings: 8, tint: 0 });
});

def('boss_hull', (b, P, E, fx) => {
  b.box(2.0, 0.9, 0.9, 0, 0, 0, shade(P.body, -0.03));
  b.box(1.6, 0.24, 0.95, 0, 0.5, 0, shade(P.body, 0.1));
  b.pair((s) => b.box(2.02, 0.16, 0.16, 0, s * 0.42, 0.46, shade(P.metal, -0.1)));
});

const warned = new Set();
export function hasBoss(s) { return !!B[s]; }

export function buildBoss(shape, pal) {
  const b = builder();
  const fn = B[shape];
  if (!fn) {
    if (!warned.has(shape)) { warned.add(shape); console.warn('[gfx] no boss model for', shape, '- using hull'); }
    B.boss_hull(b, pal.prop, pal.earth, pal.fx.accent);
  } else {
    try { fn(b, pal.prop, pal.earth, pal.fx.accent); }
    catch (e) { console.warn('[gfx] boss model', shape, 'threw', e.message); B.boss_hull(b, pal.prop, pal.earth, pal.fx.accent); }
  }
  const g = b.done();
  g.computeBoundingBox();
  const bb = g.boundingBox;
  const sx = 2 / Math.max(0.001, bb.max.x - bb.min.x);
  const sy = 2 / Math.max(0.001, bb.max.y - bb.min.y);
  g.translate(-(bb.min.x + bb.max.x) / 2, -(bb.min.y + bb.max.y) / 2, 0);
  g.scale(sx, sy, 1);
  g.computeBoundingSphere();
  return g;
}
