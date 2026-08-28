import { EMPTY, KIND, GAS } from './materials.js';
import { F_BLOB } from './grid.js';

// A piece is tetromino-shaped at BLOCK scale; each block is BLK x BLK grains
// that shatter loose on landing. 112 columns / (8 * 2) = seven O-pieces across.
export const BLK = 8;

export const SHAPES = {
  I: [[0, 0], [1, 0], [2, 0], [3, 0]],
  O: [[0, 0], [1, 0], [0, 1], [1, 1]],
  T: [[0, 0], [1, 0], [2, 0], [1, 1]],
  L: [[0, 0], [0, 1], [1, 1], [2, 1]],
  J: [[2, 0], [0, 1], [1, 1], [2, 1]],
  S: [[1, 0], [2, 0], [0, 1], [1, 1]],
  Z: [[0, 0], [1, 0], [1, 1], [2, 1]],
};
export const SHAPE_KEYS = Object.keys(SHAPES);

export function makePiece(rng, cfg) {
  const keys = cfg.shapes || SHAPE_KEYS;
  const key = keys[rng.int(keys.length)];
  const tints = cfg.tints || 4;
  // tintMode decides how coloured a single piece is, and it is the single
  // biggest lever on whether chains are reachable at all: a mono piece drops
  // ~256 contiguous same-tint grains, so the board grows large monochrome
  // regions instead of a mosaic that can never percolate.
  const mode = cfg.tintMode || 'mono';
  const base = 1 + rng.int(tints);
  let cells;
  if (mode === 'mono') {
    cells = SHAPES[key].map(([bx, by]) => ({ bx, by, tint: base }));
  } else if (mode === 'duo') {
    const other = 1 + ((base - 1 + 1 + rng.int(Math.max(1, tints - 1))) % tints);
    cells = SHAPES[key].map(([bx, by], k) => ({ bx, by, tint: k < 2 ? base : other }));
  } else {
    cells = SHAPES[key].map(([bx, by]) => ({ bx, by, tint: 1 + rng.int(tints) }));
  }
  return {
    key,
    cells,
    mat: cfg.mat,
    x: 0, y: 0,
    rot: 0,
  };
}

export function pieceBounds(p) {
  let minX = 99, maxX = -99, minY = 99, maxY = -99;
  for (const c of p.cells) {
    if (c.bx < minX) minX = c.bx;
    if (c.bx > maxX) maxX = c.bx;
    if (c.by < minY) minY = c.by;
    if (c.by > maxY) maxY = c.by;
  }
  return { minX, maxX, minY, maxY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/** Spawn centred above the board, just clear of the ceiling. */
export function spawnPiece(g, p) {
  const b = pieceBounds(p);
  p.x = Math.round((g.cols - b.w * BLK) / 2 / BLK) * BLK - b.minX * BLK;
  p.y = -b.h * BLK;
  return p;
}

export function collides(g, p, ox, oy) {
  const cols = g.cols, rows = g.rows, mat = g.mat, flags = g.flags;
  for (const c of p.cells) {
    const x0 = ox + c.bx * BLK, y0 = oy + c.by * BLK;
    if (x0 < 0 || x0 + BLK > cols) return true;
    if (y0 + BLK > rows) return true;
    for (let gy = 0; gy < BLK; gy++) {
      const y = y0 + gy;
      if (y < 0) continue;               // still above the ceiling: no collision
      const row = y * cols;
      for (let gx = 0; gx < BLK; gx++) {
        const i = row + x0 + gx;
        // Gas is not an obstacle. The CA already lets liquids sink through it,
        // but the piece is not in the grid, so without this a steam cap from
        // quenching lava tops the board out within seconds.
        if ((mat[i] !== EMPTY && KIND[mat[i]] !== GAS) || (flags[i] & F_BLOB)) return true;
      }
    }
  }
  return false;
}

/** 90 deg clockwise about the shape's bounding box, then re-normalised. */
export function rotated(p) {
  const b = pieceBounds(p);
  const cells = p.cells.map((c) => ({ bx: b.maxY - c.by, by: c.bx, tint: c.tint }));
  let minX = 99, minY = 99;
  for (const c of cells) { if (c.bx < minX) minX = c.bx; if (c.by < minY) minY = c.by; }
  for (const c of cells) { c.bx -= minX; c.by -= minY; }
  return { ...p, cells, rot: (p.rot + 1) & 3 };
}

const KICKS = [0, BLK, -BLK, BLK * 2, -BLK * 2, BLK >> 1, -(BLK >> 1)];

/** @returns the rotated piece, or null when no kick offset fits. */
export function tryRotate(g, p) {
  const r = rotated(p);
  for (const k of KICKS) {
    if (!collides(g, r, p.x + k, p.y)) { r.x = p.x + k; r.y = p.y; return r; }
  }
  return null;
}

export function tryMove(g, p, dx, dy) {
  if (collides(g, p, p.x + dx, p.y + dy)) return false;
  p.x += dx; p.y += dy;
  return true;
}

/** Distance in grains this piece can fall before it lands. */
export function dropDistance(g, p) {
  let d = 0;
  while (!collides(g, p, p.x, p.y + d + 1)) {
    d++;
    if (d > g.rows) break;
  }
  return d;
}

/** Land the piece: its blocks become loose grains in the grid. */
export function shatter(g, p, stats) {
  let placed = 0;
  for (const c of p.cells) {
    const x0 = p.x + c.bx * BLK, y0 = p.y + c.by * BLK;
    for (let gy = 0; gy < BLK; gy++) {
      const y = y0 + gy;
      if (y < 0 || y >= g.rows) continue;
      for (let gx = 0; gx < BLK; gx++) {
        const x = x0 + gx;
        if (x < 0 || x >= g.cols) continue;
        const i = y * g.cols + x;
        // A cell overwritten from non-EMPTY is DESTROYED, and it was never
        // counted. g.count stayed right — set() guards that — but the identity
        // count === initial + created - destroyed did not, and it is the one
        // the whole project leans on. It fires whenever a piece lands into gas,
        // which is most of ALCHEMY: collides() deliberately ignores GAS so a
        // water piece drops straight through the steam a quench threw up.
        if (g.mat[i] !== EMPTY && stats) stats.destroyed++;
        g.set(i, p.mat, c.tint);
        placed++;
      }
    }
  }
  if (stats) stats.created += placed;
  return placed;
}

/** True when any part of the piece is still above the ceiling. */
export function overflowed(g, p) {
  const b = pieceBounds(p);
  return p.y + b.minY * BLK < 0;
}

export function forEachCell(p, fn) {
  for (const c of p.cells) {
    const x0 = p.x + c.bx * BLK, y0 = p.y + c.by * BLK;
    for (let gy = 0; gy < BLK; gy++)
      for (let gx = 0; gx < BLK; gx++)
        fn(x0 + gx, y0 + gy, c.tint);
  }
}
