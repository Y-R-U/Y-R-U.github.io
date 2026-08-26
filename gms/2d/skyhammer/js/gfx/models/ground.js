// Ground structures, vehicles and guns. Authored in x[-1,1], y[0,2], z[-1,1] and normalised, so
// the instance transform is just (def.w, def.h*1.2, depth) — ART_NOTES §2: draw the art ~20%
// taller than the hitbox and a farmhouse lands on the reference's ~85 world units.

import * as THREE from 'three';
import { builder, normaliseStructure } from './parts.js';
import { mix, shade } from '../palette.js';
// The accept window is DERIVED here, never restated. See makeApproachBox at the bottom of the file.
import { approachBox } from '../../sim/landing.js';

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

// ---------------------------------------------------------------- readability kit
// A ground structure is ~85 world units against a 900-unit viewport: about 35 CSS px on a phone,
// and against a bright sky it is very nearly a pure silhouette. Two devices do the separating,
// and both are geometry rather than lighting, so they survive every palette and every sun angle:
//
//   RIM   a thin hot strip along the prop's own top edge — ART.md §2's dark-core + hot-rim law
//         applied to structures. It is what tells a hut from a bunker from a depot at 35 px.
//   BASE  a darker plinth at the foot, so the prop separates from the terrain crest instead of
//         melting into it. Props used to read as lumps growing out of the ground.
//
// Both are drawn with `tint: 0` so the builder's vertical shading cannot wash them out.
const rim = (b, w, d, x, y, z, P, k = 1) =>
  b.box(w, 0.06, d, x, y, z, mix(P.lit, '#ffffff', 0.18 * k), { tint: 0 });
const base = (b, w, d, P, x = 0) =>
  b.box(w, 0.09, d, x, 0.045, 0, shade(P.dark, -0.30), { tint: 0 });

// VALUE KEYS. Every prop used to be built from the same `P.body`, so at gameplay distance they
// were all the same grey lump. Each family now owns a distinct value: dwellings light, defences
// dark, industry mid with bright metal.
const V = {
  light: (P) => shade(P.body, 0.20),
  mid: (P) => P.body,
  dark: (P) => shade(P.body, -0.34),
  metal: (P) => shade(P.metal, 0.18),
};

// ------------------------------------------------------------------ act 1 structures
// DWELLING: light walls, dark steep gable, a chimney. The lightest value in the ground set.
def('hut', (b, P, E) => {
  const wall = V.light(P), roof = shade(P.roof, -0.28);
  base(b, 1.7, 1.1, P);
  b.box(1.55, 0.85, 1.0, 0, 0.50, 0, wall);
  b.box(0.30, 0.50, 0.24, -0.42, 0.28, 0.52, shade(wall, -0.45));   // door
  b.box(0.26, 0.24, 0.10, 0.34, 0.66, 0.52, P.glass);               // window
  rim(b, 1.60, 1.04, 0, 0.94, 0, P, 0.7);                           // eaves line
  // gable roof — taller and steeper than the walls, so the SILHOUETTE says "house"
  b.box(1.05, 0.11, 1.14, -0.44, 1.36, 0, roof, { rz: 0.70 });
  b.box(1.05, 0.11, 1.14, 0.44, 1.36, 0, roof, { rz: -0.70 });
  rim(b, 0.20, 1.16, 0, 1.72, 0, P);                                // ridge line, the hot edge
  b.box(0.22, 0.62, 0.22, 0.52, 1.55, -0.1, shade(roof, -0.15));    // chimney
});

// DEFENCE: the darkest thing on the ground, low, wide, with one bright concrete lip. Nothing
// about its silhouette should be mistakable for the hut's.
def('bunker', (b, P, E) => {
  const body = V.dark(P);
  base(b, 2.0, 1.25, P);
  b.box(1.9, 0.78, 1.15, 0, 0.40, 0, body);
  b.box(1.62, 0.46, 0.95, 0, 0.98, 0, shade(body, 0.10));
  b.box(1.34, 0.16, 0.30, 0, 1.00, 0.52, '#0b0d0e');               // embrasure
  b.box(1.80, 0.20, 1.05, 0, 1.32, 0, shade(body, -0.15));         // roof slab
  rim(b, 1.86, 1.10, 0, 1.44, 0, P);                               // the slab's hot top lip
  for (let i = -2; i <= 2; i++) b.box(0.36, 0.22, 0.30, i * 0.42, 0.11, 0.62, mix(body, E.grass, 0.45));
});

// INDUSTRY: two BRIGHT drums on a dark apron. Round-topped, tall, pale — nothing else on the
// ground is round, and nothing else is this light.
def('depot', (b, P, E, fx) => {
  const drum = V.metal(P);
  b.box(1.95, 0.14, 1.25, 0, 0.07, 0, shade(P.dark, -0.15));
  b.pair((s) => b.cyl(0.44, 0.44, 1.35, 10, s * 0.52, 0.76, 0, drum));
  b.pair((s) => b.cyl(0.47, 0.47, 0.11, 10, s * 0.52, 1.49, 0, shade(drum, 0.22)));
  b.pair((s) => rim(b, 0.90, 0.90, s * 0.52, 1.56, 0, P));          // hot cap on each drum
  b.box(1.05, 0.09, 0.10, 0, 1.10, 0.46, shade(drum, -0.35));       // catwalk
  b.box(0.13, 0.55, 0.13, 0, 1.75, 0, shade(drum, -0.30));          // vent stack
  b.box(0.5, 0.12, 0.5, 0, 0.20, 0.66, mix(P.body, fx, 0.25));
});

// LANDMARK: dark mass, bright sawtooth glazing, a chimney taller than anything else around.
def('factory', (b, P, E) => {
  base(b, 2.0, 1.35, P);
  b.box(1.9, 1.05, 1.25, 0, 0.52, 0, shade(P.body, -0.16));
  // sawtooth roof
  for (let i = -2; i <= 2; i++) {
    b.box(0.38, 0.34, 1.25, i * 0.38, 1.20, 0, shade(P.body, 0.08), { rz: -0.5 });
    b.box(0.30, 0.26, 1.20, i * 0.38 + 0.10, 1.24, 0.02, P.glass);
  }
  b.box(1.95, 0.10, 1.3, 0, 1.06, 0, shade(P.roof, -0.1));
  rim(b, 1.98, 1.34, 0, 1.13, 0, P, 0.7);
  b.cyl(0.17, 0.21, 1.7, 8, -0.72, 1.95, -0.2, P.roof);
  b.cyl(0.19, 0.19, 0.12, 8, -0.72, 2.80, -0.2, shade(P.roof, -0.3));
  rim(b, 0.42, 0.42, -0.72, 2.87, -0.2, P);
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
  b.box(0.42, 0.22, 0.42, 0, 1.95, 0, V.light(P));
  rim(b, 0.46, 0.46, 0, 2.08, 0, P);
  b.box(0.06, 0.42, 0.06, 0, 2.2, 0, P.metal);
  b.box(0.14, 0.14, 0.14, 0, 2.44, 0, mix(P.lit, '#ffffff', 0.35), { tint: 0 });
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
  b.box(1.95, 0.10, 1.2, 0, 0.05, 0, shade(P.dark, -0.15));
  b.pair((s) => b.box(1.95, 0.05, 0.07, 0, 0.11, s * 0.30, shade(P.metal, -0.2)));
  b.box(1.1, 0.75, 1.0, -0.55, 0.50, 0, P.body);
  b.box(1.2, 0.14, 1.1, -0.55, 0.92, 0, shade(P.roof, -0.05));
  rim(b, 1.24, 1.14, -0.55, 1.00, 0, P, 0.8);
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

// ------------------------------------------------------------------------- carrier / pad
//
// THIS ONE IS NOT NORMALISED, and that is the whole point.
//
// `normaliseStructure` anchors a model's LOWEST point at y=0, and `actors.js` then places y=0 at
// `ent.y - ent.h` = `deckY`. For a carrier that put the bottom of the HULL on the deck line, so
// the ship floated `deckY` units (120, on both carrier levels) clear of the water. No data change
// can fix that: `spawn.js` derives `deckY` from the spawn's y and the sim's landing script puts
// the aeroplane at `deckY + 12`.
//
// So the carrier is authored in FINAL instance units instead:
//   y = 0      is the DECK, exactly where the sim parks a landed aeroplane
//   y < 0      is hull, running down to -1.25 (= -120 world units = the water line)
//   x = +/-1   is the ship's length (scaled by ent.w = 170 -> 340 units long)
//   z         is pushed entirely BEHIND the gameplay plane, see below.
//
// Z PUSH-BACK. All gameplay lives at z = 0 and the aeroplane's wings straddle it, so a carrier
// centred on z = 0 swallowed the aircraft the instant it landed. The hull now occupies
// z = -1.5..-0.5 (world -135..-45 at DEPTH.carrier = 90), which leaves the whole aeroplane in
// front of the deck. At a 20-degree FOV 2551 units back, 45 units of depth is under 2% of screen
// size — the ship does not visibly shrink, it just stops eating the player.
const CARRIER_KEEL = -1.25;

def('carrier', (b, P, E, fx) => {
  const hull = mix(P.body, P.dark, 0.40), deck = shade(P.metal, -0.30);
  // hull: flared at the top, tapering to the keel
  b.box(2.0, 1.10, 1.30, 0, -0.62, -1.15, hull);
  b.box(1.72, 0.34, 1.16, 0, -1.16, -1.15, shade(hull, -0.26));      // keel block
  b.pair((s) => b.box(0.30, 0.80, 1.20, s * 1.00, -0.66, -1.15, shade(hull, -0.12), { rz: s * 0.22 }));  // bow/stern rake
  // waterline stripe: the single mark that says "this thing is floating"
  b.box(2.06, 0.10, 1.34, 0, CARRIER_KEEL + 0.02, -1.15, mix(P.lit, '#ffffff', 0.10), { tint: 0 });
  // deck
  b.box(2.0, 0.14, 1.26, 0, -0.07, -1.15, deck);
  for (let i = -4; i <= 4; i++) b.box(0.12, 0.02, 0.34, i * 0.20, 0.005, -1.15, shade(deck, 0.30), { tint: 0 });
  b.box(2.02, 0.05, 0.06, 0, 0.01, -0.60, mix(P.lit, '#ffffff', 0.20), { tint: 0 });   // hot deck edge
  // island
  b.box(0.30, 0.50, 0.34, 0.80, 0.27, -1.50, P.body);
  b.box(0.09, 0.40, 0.09, 0.80, 0.70, -1.50, P.metal);
  b.box(0.13, 0.13, 0.13, 0.80, 0.94, -1.50, mix(P.lit, '#ffffff', 0.3), { tint: 0 });
});
SHAPES.pad = SHAPES.carrier;

/** Shapes authored directly in instance units — do NOT run them through `normaliseStructure`. */
const RAW = new Set(['carrier', 'pad']);

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
  const geo = b.done();
  return RAW.has(shape) ? geo : normaliseStructure(geo);
}

export function depthFor(shape) { return DEPTH[shape] ?? DEPTH._default; }


// ------------------------------------------------------------- the landing approach box
//
// Aaron, verbatim: "land on boat/aircraft carrier via small transparent green box" — then, on
// seeing the honest drawing of the derived window: "it should be a small square at the start of
// the boat a little above and a little to the left of the boat... if the box is pretty small like
// 40px x 40px then only hitting the box when moving the correct direction is the challenge."
//
// THE ONE RULE: the drawn volume must be the volume the sim actually accepts, or the cue is worse
// than no cue. This file used to RESTATE `landing.js check()`'s predicate from the same four ent
// fields, which was correct but was a drift hazard the moment the rule changed — and the rule has
// now changed twice. It no longer restates anything: `sim/landing.js` exports
// `approachBox(pad, plane)` and `place()` reads `x/y/hw/hh` straight off it. That square is
// simultaneously what is drawn and what `check()` tests the aeroplane's centre against; there is
// no second, invisible, more-forgiving box behind it.
//
// It is a SQUARE, GATE.size = 90 world units on a side, sitting off the ship's left end. Ninety
// units is not a taste dial: camera.js renders exactly VH = 900 world units of height, so the box
// is always one tenth of the viewport tall — about 40 CSS px on a phone in landscape, which is
// the size that was asked for, expressed in the only unit the sim can actually reason in.
//
// AMBER now means one thing and one thing only: you are flying AWAY from the ship. It used to
// mean "one of speed, attitude or direction is wrong" without saying which, so an amber box was
// an unreadable complaint. See the gate's own comment for why the other two conditions went.
//
// WIRING (one call site, in whichever file owns the ent -> mesh walk, i.e. `js/gfx/actors.js`) —
// UNCHANGED by either rewrite, `place()` still takes exactly (pad, player, t):
//     const approach = makeApproachBox();        // once, next to the other meshes
//     root.add(approach.root);
//     ... per frame, for the nearest live `kind === 'pad'` ent:
//     approach.place(padEnt, world.player, t);   // or approach.hide() when there is none
export function makeApproachBox() {
  const root = new THREE.Group();
  root.renderOrder = 6;
  root.visible = false;

  const geo = new THREE.BoxGeometry(2, 2, 2);
  const fill = new THREE.MeshBasicMaterial({
    color: 0x5ee06a, transparent: true, opacity: 0.13, depthWrite: false,
    side: THREE.DoubleSide, fog: false,
  });
  const box = new THREE.Mesh(geo, fill);
  root.add(box);

  // A wireframe edge as well as the fill: at 43 CSS px tall a translucent fill alone is a faint
  // wash over a bright sky, and the EDGE is what the eye actually flies to.
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geo),
    new THREE.LineBasicMaterial({ color: 0x8dff9a, transparent: true, opacity: 0.85, depthWrite: false, fog: false }),
  );
  root.add(edges);

  return {
    root,
    hide() { root.visible = false; },
    /**
     * @param pad     the `kind === 'pad'` ent
     * @param player  the player ent
     * @param t       seconds, for the pulse
     */
    place(pad, player, t = 0) {
      if (!pad || !player) { root.visible = false; return; }
      const g = approachBox(pad, player);   // the accept test itself, not a picture of it
      if (!g) { root.visible = false; return; }
      root.visible = true;
      root.position.set(g.x, g.y, -6);
      box.scale.set(g.hw, g.hh, 26);
      edges.scale.set(g.hw, g.hh, 26);
      // Green while you are closing on the ship, amber while you are running away from it. The
      // box is a promise, and the only way to make it stop promising is to turn round.
      const ok = g.ready;
      const pulse = 0.5 + 0.5 * Math.sin(t * 3.4);
      fill.color.setHex(ok ? 0x5ee06a : 0xe0a83a);
      edges.material.color.setHex(ok ? 0x8dff9a : 0xffc46b);
      fill.opacity = (ok ? 0.13 : 0.08) + pulse * 0.05;
      edges.material.opacity = (ok ? 0.72 : 0.45) + pulse * 0.18;
    },
    dispose() { geo.dispose(); fill.dispose(); edges.geometry.dispose(); edges.material.dispose(); },
  };
}
