/**
 * The six-band altitude ladder. Names ratified by D19 and frozen; edges are
 * BUILD_PLAN §6 ruling R-02's canonical set, which replaces ARCHITECTURE §3.3's
 * provisional table (that one violated its own 700 wu minimum-thickness rule).
 *
 * Pure — no DOM, no wall-clock. `js/sim/**` and node import it directly.
 *
 * NOTE FOR P4/P9: this lives in core/ because `window.__state` needs band
 * occupancy at P2, before js/sim/ or js/data/ exist. If the world phase would
 * rather own it, move the table and re-export from here; nothing else changes.
 *
 * +Y is DOWN. Altitude is -y. y0 is the LOW-altitude edge (nearer 0), y1 the
 * high-altitude edge (more negative).
 */

import { M_PER_WU } from './math.js';

export const BANDS = Object.freeze([
  //                       metres        y range (wu)     thickness
  { id: 'mud',   name: 'Mud',   m0: 0,    m1: 105,  y0: 0,     y1: -700 },
  { id: 'belt',  name: 'Belt',  m0: 105,  m1: 255,  y0: -700,  y1: -1700 },
  { id: 'floor', name: 'Floor', m0: 255,  m1: 450,  y0: -1700, y1: -3000 },
  { id: 'deck',  name: 'Deck',  m0: 450,  m1: 750,  y0: -3000, y1: -5000 },
  { id: 'lane',  name: 'Lane',  m0: 750,  m1: 1125, y0: -5000, y1: -7500 },
  { id: 'blue',  name: 'Blue',  m0: 1125, m1: 1500, y0: -7500, y1: -10000 },
].map(Object.freeze));

/** D28: the playable ceiling. Nothing the player can reach exists above it. */
export const CEILING_WU = -10000;
export const GROUND_WU = 0;

/** D28: seen, never reached. 4,000 m. */
export const CONCORD_LINE_WU = -4000 / M_PER_WU;   // -26,666.7 wu

export const BAND_IDS = Object.freeze(BANDS.map(b => b.id));

/** Band containing world y. Clamps: below ground reads Mud, above ceiling reads Blue. */
export function bandAt(y) {
  for (let i = 0; i < BANDS.length; i++) if (y > BANDS[i].y1) return BANDS[i];
  return BANDS[BANDS.length - 1];
}

export const bandIdAt = (y) => bandAt(y).id;

/** 0..1 through the band, 0 at its low edge. Useful for a ramp/haze crossfade. */
export function bandT(y) {
  const b = bandAt(y);
  return (y - b.y0) / (b.y1 - b.y0);
}

/** Period flavour on a correct number: ft = -y * 0.15 * 3.28084 (§3.3). */
export const altitudeFeet = (y) => -y * M_PER_WU * 3.28084;
export const altitudeMetres = (y) => -y * M_PER_WU;
