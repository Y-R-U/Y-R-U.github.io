// Ground structures, vehicles and guns. Authored in x[-1,1], y[0,2], z[-1,1] and normalised, so
// the instance transform is just (def.w, def.h*1.2, depth) — ART_NOTES §2: draw the art ~20%
// taller than the hitbox and a farmhouse lands on the reference's ~85 world units.

import { builder, normaliseStructure } from './parts.js';
import { mix, shade } from '../palette.js';

// depth (z half-extent, world units) per shape family — small; this is a side-scroller.
export const DEPTH = {
  hut: 34, bunker: 40, depot: 42, factory: 60, tank: 30, radar: 26, aa: 28, aa88: 32,
  tower: 22, truck: 26, halftrack: 28, railyard: 44, uboat: 34, sam: 30, reactor: 62,
  laser: 30, aacarrier: 38, hive: 50, mech: 34, plasma_aa: 30, carrier: 90, pad: 90,
  balloon: 30, balloon_gold: 30, _default: 32,
};

const SHAPES = {};
export function shapeNames() { return Object.keys(SHAPES); }
export function hasShape(s) { return !!SHAPES[s]; }

const def = (name, fn) => { SHAPES[name] = fn; };

// ------------------------------------------------------------------ act 1 structures
def('hut', (b, P, E) => {
  const wall = P.body, roof = P.roof;
  b.box(1.55, 0.95, 1.0, 0, 0.48, 0, wall);
  b.box(0.30, 0.55, 0.24, -0.42, 0.28, 0.52, shade(wall, -0.35));   // door
  b.box(0.26, 0.24, 0.10, 0.34, 0.66, 0.52, P.glass);               // window
  // gable roof
  b.box(0.98, 0.10, 1.14, -0.42, 1.22, 0, roof, { rz: 0.62 });
  b.box(0.98, 0.10, 1.14, 0.42, 1.22, 0, roof, { rz: -0.62 });
  b.box(0.22, 0.55, 0.22, 0.52, 1.45, -0.1, shade(roof, -0.25));    // chimney
});

def('bunker', (b, P, E) => {
  b.box(1.9, 0.72, 1.15, 0, 0.36, 0, P.body);
  b.box(1.55, 0.42, 0.95, 0, 0.90, 0, shade(P.body, 0.06));
  b.box(1.30, 0.14, 0.30, 0, 0.92, 0.52, '#0d0f10');               // slit
  b.box(1.75, 0.16, 1.05, 0, 1.16, 0, shade(P.body, -0.2));
  for (let i = -2; i <= 2; i++) b.box(0.36, 0.20, 0.30, i * 0.42, 0.10, 0.62, mix(P.body, E.grass, 0.5));
});

def('depot', (b, P, E, fx) => {
  b.box(1.9, 0.16, 1.2, 0, 0.08, 0, shade(P.dark, 0.05));
  b.pair((s) => b.cyl(0.42, 0.42, 1.25, 10, s * 0.52, 0.72, 0, P.metal, { rx: 0 }));
  b.pair((s) => b.cyl(0.45, 0.45, 0.10, 10, s * 0.52, 1.38, 0, shade(P.metal, 0.18)));
  b.box(1.05, 0.10, 0.10, 0, 1.05, 0.44, shade(P.metal, -0.25));
  b.box(0.14, 0.55, 0.14, 0, 1.62, 0, shade(P.metal, -0.3));
  b.box(0.5, 0.12, 0.5, 0, 0.20, 0.66, mix(P.body, fx, 0.25));
});

def('factory', (b, P, E) => {
  b.box(1.9, 1.05, 1.25, 0, 0.52, 0, P.body);
  // sawtooth roof
  for (let i = -2; i <= 2; i++) {
    b.box(0.38, 0.34, 1.25, i * 0.38, 1.20, 0, shade(P.body, 0.08), { rz: -0.5 });
    b.box(0.30, 0.26, 1.20, i * 0.38 + 0.10, 1.24, 0.02, P.glass);
  }
  b.box(1.95, 0.10, 1.3, 0, 1.06, 0, shade(P.roof, -0.1));
  b.cyl(0.17, 0.21, 1.5, 8, -0.72, 1.85, -0.2, P.roof);
  b.cyl(0.19, 0.19, 0.12, 8, -0.72, 2.6, -0.2, shade(P.roof, -0.3));
  for (let i = -2; i <= 2; i++) b.box(0.16, 0.30, 0.06, i * 0.34, 0.55, 0.64, P.glass);
});

def('tank', (b, P, E) => {
  const hull = mix(P.body, E.grass, 0.35);
  b.box(1.85, 0.42, 0.92, 0, 0.46, 0, hull);
  b.pair((s) => b.box(1.95, 0.34, 0.20, 0, 0.24, s * 0.50, shade(P.dark, 0.06)));
  for (let i = -3; i <= 3; i++) b.pair((s) => b.cyl(0.14, 0.14, 0.18, 8, i * 0.28, 0.22, s * 0.50, shade(hull, -0.3), { rx: Math.PI / 2 }));
  b.box(0.95, 0.36, 0.72, -0.05, 0.84, 0, shade(hull, 0.1));
  b.box(1.15, 0.10, 0.10, 0.75, 0.88, 0, shade(P.metal, -0.1));
  b.box(0.16, 0.12, 0.12, 1.32, 0.88, 0, P.dark);
});

def('radar', (b, P, E) => {
  b.box(0.70, 0.14, 0.70, 0, 0.07, 0, shade(P.dark, 0.1));
  b.pair((s) => b.box(0.10, 1.35, 0.10, s * 0.26, 0.72, 0, P.metal, { rz: s * 0.10 }));
  for (let i = 0; i < 4; i++) b.box(0.62, 0.06, 0.08, 0, 0.28 + i * 0.32, 0, shade(P.metal, -0.15));
  b.box(0.34, 0.20, 0.34, 0, 1.48, 0, P.body);
  // dish
  b.box(1.15, 0.10, 0.85, 0.12, 1.78, 0, shade(P.metal, 0.2), { rz: 0.42 });
  b.box(0.10, 0.10, 0.10, 0.42, 1.62, 0, P.lit);
});

def('aa', (b, P, E) => {
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    b.box(0.38, 0.22, 0.30, Math.cos(a) * 0.76, 0.11, Math.sin(a) * 0.5, mix(P.body, E.grass, 0.55), { ry: a });
  }
  b.cyl(0.30, 0.36, 0.30, 8, 0, 0.36, 0, P.metal);
  b.box(0.40, 0.28, 0.40, 0, 0.62, 0, shade(P.metal, -0.1));
  b.pair((s) => b.box(1.05, 0.09, 0.09, 0.42, 0.86, s * 0.11, P.dark, { rz: -0.75 }));
});

def('aa88', (b, P, E) => {
  b.box(1.5, 0.14, 0.9, 0, 0.07, 0, shade(P.dark, 0.08));
  b.pair((s) => b.box(1.6, 0.10, 0.16, 0, 0.12, 0, shade(P.dark, 0.12), { ry: s * 0.9 }));
  b.cyl(0.26, 0.34, 0.34, 8, 0, 0.34, 0, P.metal);
  b.box(0.62, 0.42, 0.55, -0.06, 0.68, 0, shade(P.metal, -0.05));
  b.box(0.70, 0.46, 0.06, -0.10, 0.74, 0.30, shade(P.metal, 0.12));   // shield
  b.box(1.75, 0.11, 0.11, 0.66, 1.02, 0, P.dark, { rz: -0.52 });
  b.box(0.16, 0.15, 0.15, 1.42, 1.42, 0, shade(P.dark, 0.2));
});

def('tower', (b, P, E) => {
  for (let i = 0; i < 6; i++) {
    const t = i / 6, w = 0.55 - t * 0.34;
    b.pair((s) => b.box(0.09, 0.36, 0.09, s * w, 0.18 + i * 0.30, 0, P.metal, { rz: s * 0.09 }));
    b.box(w * 2, 0.06, 0.08, 0, 0.36 + i * 0.30, 0, shade(P.metal, -0.2));
  }
  b.box(0.42, 0.22, 0.42, 0, 1.95, 0, P.body);
  b.box(0.06, 0.42, 0.06, 0, 2.2, 0, P.metal);
  b.box(0.12, 0.12, 0.12, 0, 2.42, 0, P.lit);
});

def('truck', (b, P, E) => {
  b.box(0.85, 0.45, 0.80, -0.55, 0.55, 0, P.body);
  b.box(0.30, 0.26, 0.72, -0.20, 0.72, 0, P.glass);
  b.box(1.15, 0.55, 0.85, 0.45, 0.60, 0, mix(P.body, E.grass, 0.3));
  b.box(1.15, 0.10, 0.90, 0.45, 0.90, 0, shade(P.roof, -0.1));
  b.box(1.95, 0.14, 0.7, 0, 0.30, 0, shade(P.dark, 0.05));
  for (const x of [-0.62, 0.25, 0.72]) b.pair((s) => b.cyl(0.24, 0.24, 0.16, 9, x, 0.24, s * 0.42, '#181818', { rx: Math.PI / 2 }));
});

def('halftrack', (b, P, E) => {
  b.box(1.8, 0.44, 0.85, 0, 0.52, 0, mix(P.body, E.grass, 0.35));
  b.box(0.60, 0.30, 0.80, 0.55, 0.86, 0, shade(P.body, 0.05));
  b.pair((s) => b.box(1.0, 0.30, 0.18, 0.30, 0.28, s * 0.46, shade(P.dark, 0.06)));
  b.pair((s) => b.cyl(0.22, 0.22, 0.14, 9, -0.72, 0.26, s * 0.44, '#181818', { rx: Math.PI / 2 }));
  b.box(0.55, 0.08, 0.08, -0.42, 0.95, 0, P.dark, { rz: -0.5 });
});

def('railyard', (b, P, E) => {
  b.box(1.95, 0.10, 1.2, 0, 0.05, 0, shade(P.dark, 0.1));
  b.pair((s) => b.box(1.95, 0.05, 0.07, 0, 0.11, s * 0.30, shade(P.metal, -0.2)));
  b.box(1.1, 0.75, 1.0, -0.55, 0.50, 0, P.body);
  b.box(1.2, 0.14, 1.1, -0.55, 0.92, 0, shade(P.roof, -0.05));
  b.box(0.85, 0.50, 0.72, 0.62, 0.42, 0, mix(P.metal, P.body, 0.4));   // wagon
  b.box(0.88, 0.10, 0.76, 0.62, 0.70, 0, shade(P.roof, -0.15));
  b.pair((s) => b.cyl(0.13, 0.13, 0.10, 8, 0.62 + s * 0.28, 0.17, 0.3, '#1a1a1a', { rx: Math.PI / 2 }));
});

def('uboat', (b, P, E) => {
  b.cyl(0.42, 0.42, 1.9, 10, 0, 0.42, 0, shade(P.dark, 0.15), { rz: Math.PI / 2 });
  b.cone(0.42, 0.5, 10, 1.10, 0.42, 0, shade(P.dark, 0.12), { rz: -Math.PI / 2 });
  b.box(0.55, 0.55, 0.42, -0.12, 0.92, 0, P.body);
  b.box(0.12, 0.42, 0.12, -0.12, 1.35, 0, P.metal);
  b.box(0.75, 0.08, 0.08, 0.55, 0.80, 0, P.dark);
});

// ------------------------------------------------------------------- act 3-5 hardware
def('sam', (b, P, E) => {
  b.box(1.5, 0.34, 0.9, 0, 0.30, 0, mix(P.body, E.grass, 0.3));
  b.pair((s) => b.cyl(0.20, 0.20, 0.12, 9, -0.5, 0.20, s * 0.44, '#181818', { rx: Math.PI / 2 }));
  b.box(1.0, 0.40, 0.75, 0.15, 0.78, 0, shade(P.metal, -0.1), { rz: 0.30 });
  for (let i = -1; i <= 1; i++) b.cyl(0.10, 0.10, 1.1, 8, 0.15, 0.95, i * 0.24, shade(P.metal, 0.12), { rz: Math.PI / 2 - 0.30 });
  b.box(0.28, 0.20, 0.6, -0.62, 0.92, 0, P.glass);
});

def('reactor', (b, P, E) => {
  b.cyl(0.55, 0.95, 1.15, 12, -0.35, 0.58, 0, P.body);
  b.cyl(0.62, 0.55, 0.55, 12, -0.35, 1.40, 0, shade(P.body, 0.12));
  b.sphere(0.62, -0.35, 1.62, 0, shade(P.metal, 0.05), { sy: 0.72 });
  b.cyl(0.34, 0.52, 1.5, 10, 0.72, 0.75, 0, shade(P.body, -0.05));
  b.cyl(0.38, 0.34, 0.14, 10, 0.72, 1.55, 0, shade(P.metal, 0.1));
  b.box(1.9, 0.12, 1.0, 0, 0.06, 0, shade(P.dark, 0.06));
  b.box(0.24, 0.24, 0.10, -0.35, 0.70, 0.62, P.lit);
});

def('laser', (b, P, E) => {
  b.cyl(0.55, 0.72, 0.36, 10, 0, 0.18, 0, shade(P.dark, 0.12));
  b.cyl(0.34, 0.42, 0.42, 10, 0, 0.55, 0, P.metal);
  b.box(0.62, 0.46, 0.62, 0, 0.95, 0, shade(P.metal, -0.06));
  b.cyl(0.13, 0.16, 1.05, 9, 0.44, 1.20, 0, shade(P.metal, 0.14), { rz: -0.6 });
  b.sphere(0.15, 0.85, 1.48, 0, P.lit);
  b.pair((s) => b.box(0.10, 0.50, 0.10, s * 0.42, 1.28, 0, P.metal, { rz: s * 0.3 }));
});

def('aacarrier', (b, P, E) => {
  b.box(1.9, 0.42, 1.0, 0, 0.44, 0, mix(P.body, E.grass, 0.25));
  b.pair((s) => b.box(1.95, 0.32, 0.20, 0, 0.22, s * 0.54, shade(P.dark, 0.06)));
  b.box(0.90, 0.36, 0.80, -0.45, 0.82, 0, shade(P.body, 0.08));
  b.box(0.55, 0.36, 0.55, 0.55, 0.82, 0, P.metal);
  b.pair((s) => b.box(1.0, 0.09, 0.09, 0.75, 1.10, s * 0.12, P.dark, { rz: -0.72 }));
  b.box(0.5, 0.06, 0.36, -0.45, 1.08, 0, shade(P.metal, 0.2), { rz: 0.3 });
});

def('hive', (b, P, E) => {
  b.cyl(0.45, 1.0, 1.15, 6, 0, 0.58, 0, P.body);
  b.cyl(0.20, 0.45, 0.55, 6, 0, 1.40, 0, shade(P.body, 0.1));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    b.cyl(0.14, 0.14, 0.16, 6, Math.cos(a) * 0.62, 0.75, Math.sin(a) * 0.36, '#0c0c10', { rx: Math.PI / 2, ry: a });
  }
  b.sphere(0.18, 0, 1.75, 0, P.lit);
  b.box(1.9, 0.10, 1.1, 0, 0.05, 0, shade(P.dark, 0.06));
});

def('mech', (b, P, E) => {
  b.pair((s) => {
    b.box(0.24, 0.62, 0.26, s * 0.44, 0.34, 0, shade(P.metal, -0.15), { rz: s * 0.16 });
    b.box(0.22, 0.66, 0.24, s * 0.58, 0.95, 0, P.metal, { rz: -s * 0.2 });
    b.box(0.40, 0.16, 0.42, s * 0.42, 0.08, 0.04, shade(P.dark, 0.1));
  });
  b.box(1.0, 0.52, 0.72, 0, 1.42, 0, P.body);
  b.box(0.52, 0.28, 0.52, 0, 1.80, 0, shade(P.body, 0.12));
  b.box(0.30, 0.12, 0.36, 0.24, 1.82, 0, P.glass);
  b.pair((s) => b.cyl(0.10, 0.10, 0.85, 7, s * 0.60, 1.50, 0.1, P.dark, { rz: Math.PI / 2 }));
});

def('plasma_aa', (b, P, E) => {
  b.cyl(0.62, 0.85, 0.30, 8, 0, 0.15, 0, shade(P.dark, 0.14));
  b.cyl(0.30, 0.44, 0.50, 8, 0, 0.52, 0, P.metal);
  b.sphere(0.44, 0, 1.02, 0, shade(P.metal, -0.05), { sy: 0.85 });
  for (let i = 0; i < 3; i++) b.cyl(0.07, 0.07, 0.95, 6, 0, 1.30 + i * 0.02, 0, shade(P.metal, 0.2), { rz: -0.55 + i * 0.55 });
  b.sphere(0.20, 0, 1.42, 0, P.lit);
});

// ---------------------------------------------------------------------- balloons + pads
def('balloon', (b, P, E, fx, PK) => {
  const skin = PK.balloon, stripe = PK.balloonStripe;
  b.sphere(0.62, 0, 1.25, 0, skin, { sy: 1.25, seg: 10, rings: 8 });
  for (let i = -1; i <= 1; i++) b.box(0.10, 1.42, 0.62, i * 0.34, 1.25, 0.28, stripe, { tint: 0 });
  b.cyl(0.20, 0.30, 0.14, 8, 0, 0.44, 0, shade(skin, -0.35));
  b.box(0.30, 0.28, 0.30, 0, 0.20, 0, PK.basket);
  b.pair((s) => b.box(0.03, 0.30, 0.03, s * 0.14, 0.38, 0, '#2a2018'));
});

def('balloon_gold', (b, P, E, fx, PK) => {
  const skin = PK.money;
  b.sphere(0.64, 0, 1.26, 0, skin, { sy: 1.28, seg: 10, rings: 8 });
  for (let i = -1; i <= 1; i++) b.box(0.10, 1.46, 0.64, i * 0.35, 1.26, 0.29, shade(skin, -0.3), { tint: 0 });
  b.cyl(0.20, 0.30, 0.14, 8, 0, 0.44, 0, shade(skin, -0.4));
  b.box(0.32, 0.30, 0.32, 0, 0.20, 0, PK.basket);
});

def('carrier', (b, P, E, fx) => {
  b.box(2.0, 0.52, 1.4, 0, 0.30, 0, shade(P.dark, 0.18));
  b.box(1.98, 0.14, 1.32, 0, 0.62, 0, shade(P.metal, -0.28));           // deck
  for (let i = -4; i <= 4; i++) b.box(0.12, 0.02, 0.30, i * 0.20, 0.70, 0, shade(P.metal, 0.25), { tint: 0 });
  b.box(0.34, 0.55, 0.36, 0.66, 0.95, -0.44, P.body);                    // island
  b.box(0.10, 0.42, 0.10, 0.66, 1.42, -0.44, P.metal);
  b.box(0.14, 0.14, 0.14, 0.66, 1.68, -0.44, P.lit);
  b.box(1.9, 0.18, 0.10, 0, 0.72, 0.66, shade(P.metal, -0.1));
});
SHAPES.pad = SHAPES.carrier;

/** Any shape we do not know about: an obvious crate with a bright hazard stripe. Never throws. */
function placeholder(b, P, E, fx) {
  b.box(1.6, 1.6, 1.0, 0, 0.85, 0, shade(P.body, -0.1));
  b.box(1.7, 0.24, 1.05, 0, 0.85, 0, fx, { tint: 0 });
  b.box(0.24, 1.7, 1.05, 0, 0.85, 0, fx, { tint: 0 });
}

const warned = new Set();

/** shape -> merged, normalised BufferGeometry. Unknown shapes degrade, they never throw. */
export function buildGround(shape, pal, PICKUP) {
  const b = builder();
  const fn = SHAPES[shape];
  if (!fn) {
    if (!warned.has(shape)) { warned.add(shape); console.warn('[gfx] no model for shape', shape, '- placeholder'); }
    placeholder(b, pal.prop, pal.earth, pal.fx.accent);
  } else {
    try { fn(b, pal.prop, pal.earth, pal.fx.accent, PICKUP); }
    catch (e) { console.warn('[gfx] model', shape, 'threw', e.message); placeholder(b, pal.prop, pal.earth, pal.fx.accent); }
  }
  return normaliseStructure(b.done());
}

export function depthFor(shape) { return DEPTH[shape] ?? DEPTH._default; }
