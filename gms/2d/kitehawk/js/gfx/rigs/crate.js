/**
 * The supply crate — ART.md §5: "six shaded quads with a stencilled marking
 * decal, and it tumbles when the canopy dies".
 *
 * Drawn rather than painted because it gets shot, tumbles, and has to take the
 * same moving light as the aeroplane above it (D5). 26 x 22 wu, ARCHITECTURE
 * §3.4's 3.9 x 3.3 m.
 *
 * The decal is a code shape and never lettering — D22: this model produces
 * text, signatures and paper mounts however politely you ask it not to, so
 * roundels and stencils are decals in code. A crate's stencil is a bar and two
 * chevrons, which reads at 26 wu and cannot be misread as a word.
 */

import { createRig } from '../parts.js';

const W = 26, H = 22;                 // wu — ARCHITECTURE §3.4
const SLAT = 3.4;

const BOARD = [0.60, 0.47, 0.31];     // crated pine
const BOARD_D = [0.48, 0.36, 0.23];
const IRON = [0.38, 0.39, 0.40];
const STENCIL = [0.83, 0.78, 0.62];

/** `kind` tints the stencil so §4.4's seven contents read apart at 26 wu. */
const KIND_TINT = {
  supply: [0.83, 0.78, 0.62],
  ammo: [0.86, 0.62, 0.30],
  fuel: [0.55, 0.70, 0.82],
  parts: [0.72, 0.80, 0.62],
  ordnance: [0.88, 0.44, 0.34],
  intel: [0.78, 0.72, 0.86],
  contraband: [0.90, 0.82, 0.36],
};

export function makeCrateRig(kind = 'supply') {
  const stencil = KIND_TINT[kind] || STENCIL;
  const hw = W * 0.5, hh = H * 0.5;
  return createRig({
    jitterRel: 0.03,
    edge: 1.3,
    edgeDark: 0.46,
    maxEdges: 2,
    tones: { lit: 1.22, mid: 0.96, shadow: 0.44 },
    terminator: { hi: 0.28, lo: -0.14 },
    parts: [
      // the far face, seen past the near one — 0.62 value, ART.md §5's rule
      { id: 'face_far', side: 'far', z: 1, x: 2.2, y: -2.2, color: BOARD_D, normal: [0.35, -0.94],
        poly: [-hw, -hh, hw, -hh, hw, hh, -hw, hh] },
      { id: 'face', z: 4, x: 0, y: 0, color: BOARD, normal: [0.10, -0.99],
        poly: [-hw, -hh, hw, -hh, hw, hh, -hw, hh] },
      // the two visible slats: one plank edge is what makes a box read as timber
      { id: 'slat_top', parent: 'face', z: 5, x: 0, y: -hh + SLAT * 0.5, color: BOARD_D,
        normal: [0, -1], edge: 0.7,
        poly: [-hw, -SLAT * 0.5, hw, -SLAT * 0.5, hw, SLAT * 0.5, -hw, SLAT * 0.5] },
      { id: 'slat_bot', parent: 'face', z: 5, x: 0, y: hh - SLAT * 0.5, color: BOARD_D,
        normal: [0, 1], edge: 0.7,
        poly: [-hw, -SLAT * 0.5, hw, -SLAT * 0.5, hw, SLAT * 0.5, -hw, SLAT * 0.5] },
      // banding iron, two straps
      { id: 'band_l', parent: 'face', z: 6, x: -hw * 0.45, y: 0, color: IRON, normal: [-0.2, -0.98],
        edge: 0.5, jitterRel: 0.015,
        poly: [-1.4, -hh, 1.4, -hh, 1.4, hh, -1.4, hh] },
      { id: 'band_r', parent: 'face', z: 6, x: hw * 0.45, y: 0, color: IRON, normal: [0.2, -0.98],
        edge: 0.5, jitterRel: 0.015,
        poly: [-1.4, -hh, 1.4, -hh, 1.4, hh, -1.4, hh] },
      // the stencil: a bar and two chevrons. Never a letter (D22).
      { id: 'mark_bar', parent: 'face', z: 8, x: 0, y: -2.5, color: stencil, normal: [0, -1],
        edge: 0, alpha: 0.9, jitterRel: 0.06,
        poly: [-6.5, -1.2, 6.5, -1.2, 6.5, 1.2, -6.5, 1.2] },
      { id: 'mark_chev1', parent: 'face', z: 8, x: -3.2, y: 3.0, color: stencil, normal: [0, -1],
        edge: 0, alpha: 0.9, jitterRel: 0.06,
        poly: [-2.6, 2.0, 0, -2.0, 2.6, 2.0, 1.3, 2.0, 0, -0.4, -1.3, 2.0] },
      { id: 'mark_chev2', parent: 'face', z: 8, x: 3.2, y: 3.0, color: stencil, normal: [0, -1],
        edge: 0, alpha: 0.9, jitterRel: 0.06,
        poly: [-2.6, 2.0, 0, -2.0, 2.6, 2.0, 1.3, 2.0, 0, -0.4, -1.3, 2.0] },
      // the harness the shrouds bear on
      { id: 'yoke', z: 9, x: 0, y: -hh - 1.2, color: IRON, normal: [0, -1], edge: 0.6,
        poly: [-4.0, -1.6, 4.0, -1.6, 3.0, 1.4, -3.0, 1.4] },
    ],
    poses: {
      // a shed crate tumbles; the rig is rotated as a whole by the caller, and
      // this is the small internal shear that stops it reading as a rigid decal
      tumble: { slat_top: 0.05, slat_bot: -0.05, band_l: 0.03, band_r: -0.03 },
    },
  });
}

export const CRATE_RIG = Object.freeze({ W, H });
