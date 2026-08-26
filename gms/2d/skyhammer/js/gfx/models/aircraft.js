// Every aircraft, parametric. Authored NOSE-RIGHT, length 1 along x centred on the origin, so the
// instance transform is a uniform scale by `len` (player) or `2*def.w` (enemies) and a z-rotation
// by ent.ang. Span runs along z, which is what makes the side-on view read as a real aeroplane
// rather than a decal.
//
// Readability law (ART.md §2) lives in the colours: dark core, warm trim, bright canopy. The rim
// light is a material term (materials.patchRim), not geometry.

import { builder } from './parts.js';
import { mix, shade } from '../palette.js';

// wings: 'bi' | 'mono' | 'low' | 'swept' | 'delta' | 'flying'
const FAM = {
  biplane:      { wings: 'bi',   prop: 0.50, span: 0.62, chord: 0.17, tail: 0.16, fat: 1.0,  fin: 0.16 },
  monoplane:    { wings: 'mono', prop: 0.50, span: 0.66, chord: 0.17, tail: 0.15, fat: 0.95, fin: 0.16 },
  fighter:      { wings: 'low',  prop: 0.50, span: 0.62, chord: 0.16, tail: 0.14, fat: 0.9,  fin: 0.17 },
  jet:          { wings: 'low',  prop: 0,    span: 0.58, chord: 0.15, tail: 0.13, fat: 0.92, fin: 0.20, pods: 2 },
  jet2:         { wings: 'swept', prop: 0,   span: 0.56, chord: 0.16, tail: 0.12, fat: 0.9,  fin: 0.22, twin: 1 },
  jet3:         { wings: 'swept', prop: 0,   span: 0.54, chord: 0.15, tail: 0.12, fat: 0.86, fin: 0.20 },
  stealth:      { wings: 'flying', prop: 0,  span: 0.60, chord: 0.30, tail: 0,    fat: 0.7,  fin: 0.06 },
  delta:        { wings: 'delta', prop: 0,   span: 0.52, chord: 0.34, tail: 0,    fat: 0.82, fin: 0.24 },

  e_biplane:    { wings: 'bi',   prop: 0.50, span: 0.60, chord: 0.17, tail: 0.16, fat: 1.0,  fin: 0.15 },
  e_stuka:      { wings: 'gull', prop: 0.50, span: 0.72, chord: 0.18, tail: 0.16, fat: 1.05, fin: 0.18, spats: 1 },
  e_fighter:    { wings: 'low',  prop: 0.50, span: 0.62, chord: 0.16, tail: 0.14, fat: 0.92, fin: 0.16 },
  e_fw190:      { wings: 'low',  prop: 0.50, span: 0.60, chord: 0.17, tail: 0.14, fat: 0.98, fin: 0.16 },
  e_bomber:     { wings: 'mono', prop: 0,    span: 0.74, chord: 0.16, tail: 0.18, fat: 1.15, fin: 0.20, nacelles: 2, glazed: 1 },
  e_he111:      { wings: 'mono', prop: 0,    span: 0.76, chord: 0.16, tail: 0.18, fat: 1.2,  fin: 0.18, nacelles: 2, glazed: 1 },
  e_protojet:   { wings: 'swept', prop: 0,   span: 0.55, chord: 0.15, tail: 0.13, fat: 0.9,  fin: 0.20, pods: 2 },
  e_mig:        { wings: 'swept', prop: 0,   span: 0.54, chord: 0.15, tail: 0.12, fat: 0.88, fin: 0.22 },
  e_jet:        { wings: 'delta', prop: 0,   span: 0.52, chord: 0.30, tail: 0,    fat: 0.86, fin: 0.22, twin: 1 },
  e_drone:      { wings: 'flying', prop: 0,  span: 0.58, chord: 0.26, tail: 0,    fat: 0.62, fin: 0.05 },
  e_cyberjet:   { wings: 'delta', prop: 0,   span: 0.54, chord: 0.32, tail: 0,    fat: 0.9,  fin: 0.26, twin: 1, glow: 1 },
  e_swarmdrone: { wings: 'flying', prop: 0,  span: 0.52, chord: 0.22, tail: 0,    fat: 0.55, fin: 0.04, glow: 1 },
};

export function familyFor(shape) { return FAM[shape] || null; }
export function hasAircraft(shape) { return !!FAM[shape]; }

const warned = new Set();

export function buildAircraft(shape, liv, accent) {
  const f = FAM[shape];
  if (!f && !warned.has(shape)) { warned.add(shape); console.warn('[gfx] no aircraft model for', shape, '- using fighter'); }
  const P = f || FAM.fighter;
  const b = builder();

  const body = liv.body, dark = liv.dark, trim = liv.trim, canopy = liv.canopy;
  const under = shade(dark, 0.06);
  const T = P.fat;

  // ---- fuselage: four tapering segments, nose at +0.5
  b.box(0.30, 0.115 * T, 0.115 * T, 0.13, 0, 0, body);
  b.box(0.26, 0.095 * T, 0.10 * T, -0.13, 0.004, 0, shade(body, -0.06));
  b.box(0.18, 0.06 * T, 0.06 * T, -0.34, 0.012, 0, shade(body, -0.12));
  b.box(0.30, 0.035 * T, 0.118 * T, 0.13, -0.052 * T, 0, under, { tint: 0 });

  // ---- nose
  if (P.prop) {
    b.cyl(0.052 * T, 0.058 * T, 0.06, 10, 0.31, 0.004, 0, shade(body, 0.08), { rz: Math.PI / 2 });
    b.cone(0.045 * T, 0.075, 9, 0.362, 0.004, 0, dark, { rz: -Math.PI / 2 });
  } else {
    b.cone(0.058 * T, 0.14, 9, 0.36, 0.004, 0, shade(body, 0.04), { rz: -Math.PI / 2 });
    b.cyl(0.030 * T, 0.030 * T, 0.02, 8, 0.425, 0.004, 0, '#0b0d10', { rz: Math.PI / 2 });
  }

  // ---- canopy
  const cx = P.wings === 'flying' ? 0.10 : 0.045;
  if (P.wings !== 'flying') {
    b.box(0.115, 0.048, 0.075, cx, 0.075 * T, 0, canopy, { tint: 0 });
    b.box(0.135, 0.020, 0.082, cx - 0.005, 0.052 * T, 0, shade(body, -0.2));
  } else {
    b.box(0.10, 0.030, 0.07, cx, 0.045, 0, canopy, { tint: 0 });
  }
  if (P.glazed) b.box(0.07, 0.055, 0.075, 0.27, 0.02, 0, canopy, { tint: 0 });

  // ---- wings (span along z)
  const S = P.span, C = P.chord;
  const wingCol = shade(body, -0.03), wingTip = trim;
  const wing = (xc, yc, chord, span, col, sweep = 0) => {
    b.pair((s) => {
      b.box(chord, 0.022, span * 0.5, xc - sweep * 0.5, yc, s * span * 0.28, col, { ry: s * sweep });
      b.box(chord * 0.5, 0.024, 0.02, xc - sweep * 0.9, yc, s * span * 0.53, wingTip, { tint: 0 });
    });
  };

  if (P.wings === 'bi') {
    wing(0.10, 0.095 * T, C, S, wingCol);
    wing(0.05, -0.055 * T, C * 0.92, S * 0.92, shade(wingCol, -0.10));
    b.pair((s) => {
      b.box(0.016, 0.16, 0.016, 0.10, 0.02, s * S * 0.22, dark);
      b.box(0.016, 0.16, 0.016, 0.02, 0.02, s * S * 0.22, dark);
    });
  } else if (P.wings === 'gull') {
    b.pair((s) => {
      b.box(C, 0.024, S * 0.20, 0.06, 0.052 * T, s * S * 0.11, wingCol, { rx: -s * 0.42 });
      b.box(C * 0.92, 0.024, S * 0.34, 0.05, 0.020 * T, s * S * 0.34, wingCol, { rx: s * 0.10 });
      b.box(C * 0.45, 0.026, 0.02, 0.02, 0.020 * T, s * S * 0.52, wingTip, { tint: 0 });
    });
  } else if (P.wings === 'delta') {
    b.pair((s) => {
      b.box(C, 0.026, S * 0.5, -0.05, -0.01 * T, s * S * 0.26, wingCol, { ry: s * 0.62 });
      b.box(C * 0.35, 0.028, 0.02, -0.16, -0.01 * T, s * S * 0.50, wingTip, { tint: 0 });
    });
  } else if (P.wings === 'flying') {
    b.pair((s) => {
      b.box(C, 0.028, S * 0.55, -0.02, 0.005, s * S * 0.30, wingCol, { ry: s * 0.72 });
      b.box(C * 0.3, 0.030, 0.02, -0.16, 0.005, s * S * 0.56, wingTip, { tint: 0 });
    });
  } else if (P.wings === 'swept') {
    wing(0.02, 0.0, C, S, wingCol, 0.42);
  } else if (P.wings === 'mono') {
    wing(0.06, 0.045 * T, C, S, wingCol, 0.06);
  } else {
    wing(0.05, -0.030 * T, C, S, wingCol, 0.10);
  }

  // ---- tail
  if (P.tail) {
    b.pair((s) => b.box(P.tail * 0.62, 0.020, P.tail * 1.35, -0.40, 0.03, s * P.tail * 0.72, wingCol));
  }
  if (P.fin > 0.02) {
    b.plate([[-0.47, 0.02], [-0.47, 0.02 + P.fin], [-0.40, 0.02 + P.fin * 0.55], [-0.36, 0.02]], 0.022, 0, shade(body, 0.03));
    b.box(0.045, P.fin * 0.5, 0.024, -0.455, 0.03 + P.fin * 0.6, 0, trim, { tint: 0 });
  }

  // ---- engines
  if (P.nacelles) {
    b.pair((s) => {
      b.cyl(0.038, 0.045, 0.20, 9, 0.09, 0.038 * T, s * S * 0.26, shade(body, -0.05), { rz: Math.PI / 2 });
      b.cone(0.034, 0.06, 8, 0.20, 0.038 * T, s * S * 0.26, dark, { rz: -Math.PI / 2 });
    });
  }
  if (P.pods) {
    b.pair((s) => {
      b.cyl(0.042, 0.046, 0.26, 9, -0.02, -0.045 * T, s * S * 0.22, shade(body, -0.08), { rz: Math.PI / 2 });
      b.cyl(0.036, 0.036, 0.02, 9, -0.155, -0.045 * T, s * S * 0.22, '#0b0d10', { rz: Math.PI / 2 });
    });
  }
  if (P.twin) {
    b.pair((s) => b.cyl(0.040, 0.044, 0.10, 9, -0.47, 0.005, s * 0.048, '#14161a', { rz: Math.PI / 2 }));
  } else if (!P.prop && !P.pods) {
    b.cyl(0.048, 0.052, 0.09, 10, -0.47, 0.005, 0, '#14161a', { rz: Math.PI / 2 });
  }
  if (P.spats) {
    b.pair((s) => b.box(0.09, 0.06, 0.035, 0.08, -0.10 * T, s * S * 0.30, shade(body, -0.15)));
  }
  if (P.glow) {
    b.box(0.02, 0.012, 0.10, -0.30, 0.02, 0, accent, { tint: 0 });
    b.pair((s) => b.box(0.10, 0.008, 0.012, -0.10, 0.03, s * S * 0.40, accent, { tint: 0 }));
  }

  const g = b.done();
  g.userData = { prop: P.prop, span: S, jet: !P.prop };
  return g;
}
