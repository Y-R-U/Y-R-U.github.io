// Grid -> one RGBA8 texture. 112x224x4 = 100 KB a frame, which is nothing; the
// whole point is that the GPU never sees a cell, only a field it can smooth.
//
//   R = material id        G = tint index
//   B = fill (255) OR, when the clearing flag is set, the clearT countdown
//   A = flags  (1 clearing, 2 burning, 4 blob, 16 falling piece — renderer-private)

import { forEachCell } from '../sim/pieces.js';

export const F_PIECE = 16;

export class StateBuffer {
  constructor(cols, rows) {
    this.cols = cols; this.rows = rows;
    this.bytes = new Uint8Array(cols * rows * 4);
    this.clearCells = new Int32Array(cols * rows);   // indices currently dissolving
    this.clearN = 0;
    this.clearMinT = 255; this.clearMaxT = 0;
  }

  /** @param world a sim World. Never mutated — the piece is stamped into OUR copy. */
  pack(world) {
    const g = world.g, b = this.bytes;
    const mat = g.mat, tint = g.tint, flags = g.flags, clearT = g.clearT;
    const n = g.n;
    let cn = 0, tmin = 255, tmax = 0;
    const cc = this.clearCells;

    for (let i = 0; i < n; i++) {
      const o = i << 2;
      const m = mat[i];
      if (m === 0) { b[o] = 0; b[o + 1] = 0; b[o + 2] = 0; b[o + 3] = 0; continue; }
      const f = flags[i];
      b[o] = m;
      b[o + 1] = tint[i];
      if (f & 1) {
        const t = clearT[i];
        b[o + 2] = t;
        cc[cn++] = i;
        if (t < tmin) tmin = t;
        if (t > tmax) tmax = t;
      } else {
        b[o + 2] = 255;
      }
      b[o + 3] = f;
    }

    // The falling piece is not in the grid (contract A). Stamping it into the
    // same field is what makes it merge with the pile as it lands instead of
    // floating over it as a separate sprite.
    const p = world.piece;
    if (p) {
      const cols = this.cols, rows = this.rows, pm = p.mat;
      forEachCell(p, (x, y, ti) => {
        if (x < 0 || y < 0 || x >= cols || y >= rows) return;
        const o = ((y * cols + x) << 2);
        if (b[o] !== 0) return;
        b[o] = pm; b[o + 1] = ti; b[o + 2] = 255; b[o + 3] = F_PIECE;
      });
    }

    this.clearN = cn;
    this.clearMinT = cn ? tmin : 255;
    this.clearMaxT = cn ? tmax : 0;
    return b;
  }
}
