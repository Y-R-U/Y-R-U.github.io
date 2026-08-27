import { BLK, pieceBounds, collides, rotated } from '../sim/pieces.js';
import { EMPTY, TINTABLE } from '../sim/materials.js';

/**
 * Heuristic placement bot. Drives the attract screen and the headless gates.
 *
 * It does not need to be strong, it needs to be *legible* — a bot that visibly
 * builds toward a wall reads as competent on the title screen, which is the
 * whole job.
 */

/** Topmost occupied row per column; rows for an empty column. */
function columnTops(g, out) {
  const cols = g.cols, rows = g.rows, mat = g.mat;
  out.fill(rows);
  for (let x = 0; x < cols; x++) {
    for (let y = 0; y < rows; y++) {
      if (mat[y * cols + x] !== EMPTY) { out[x] = y; break; }
    }
  }
  return out;
}

export class Bot {
  constructor(world) {
    this.w = world;
    this.tops = new Int32Array(world.g.cols);
    this.plan = null;
    this.think = 0;
  }

  /** Estimated landing y for a piece at column ox, using column tops. */
  _landing(p, ox) {
    const b = pieceBounds(p);
    let best = this.w.g.rows;
    for (const c of p.cells) {
      const x0 = ox + c.bx * BLK;
      const bottom = (c.by + 1) * BLK;
      let colTop = this.w.g.rows;
      for (let gx = 0; gx < BLK; gx++) {
        const t = this.tops[x0 + gx];
        if (t < colTop) colTop = t;
      }
      const y = colTop - bottom;
      if (y < best) best = y;
    }
    return best;
  }

  _score(p, ox, oy) {
    const g = this.w.g, cols = g.cols, rows = g.rows, mat = g.mat, tint = g.tint;
    let adj = 0, wallBonus = 0, maxTop = rows;
    for (const c of p.cells) {
      const x0 = ox + c.bx * BLK, y0 = oy + c.by * BLK;
      if (y0 < maxTop) maxTop = y0;
      if (x0 <= 1) wallBonus += 26;
      if (x0 + BLK >= cols - 1) wallBonus += 26;
      // reward touching same-tint material — that is how a chain gets built
      for (let gy = 0; gy < BLK; gy++) {
        const y = y0 + gy;
        if (y < 0 || y >= rows) continue;
        for (const dx of [-1, BLK]) {
          const x = x0 + dx;
          if (x < 0 || x >= cols) continue;
          const i = y * cols + x;
          if (mat[i] !== EMPTY && TINTABLE[mat[i]] && tint[i] === c.tint) adj++;
        }
      }
    }
    // Low stack dominates; chain-building and wall contact break ties.
    return (rows - maxTop) * -3.2 + adj * 2.6 + wallBonus;
  }

  /** Choose {x, rot} for the current piece. */
  decide() {
    const w = this.w, g = w.g;
    if (!w.piece) return null;
    columnTops(g, this.tops);
    let best = null;
    let p = { ...w.piece, cells: w.piece.cells.map((c) => ({ ...c })) };
    for (let r = 0; r < 4; r++) {
      const b = pieceBounds(p);
      const maxX = g.cols - b.w * BLK;
      for (let ox = 0; ox <= maxX; ox += 2) {
        const oy = this._landing(p, ox);
        if (oy < 0) continue;
        if (collides(g, p, ox, oy)) continue;
        const s = this._score(p, ox, oy);
        if (!best || s > best.score) best = { x: ox, rot: r, score: s };
      }
      p = rotated(p);
    }
    return best;
  }

  /** Nudge the world one step toward the plan. Call once per frame. */
  update() {
    const w = this.w;
    if (w.over || !w.piece) { this.plan = null; return; }
    if (!this.plan || this.plan.forPiece !== w.piece) {
      const d = this.decide();
      if (!d) return;
      this.plan = { ...d, forPiece: w.piece, settled: false };
    }
    const p = w.piece;
    if (p.rot !== this.plan.rot) {
      if (!w.rotate()) this.plan.rot = p.rot;
      this.plan.forPiece = w.piece;
      return;
    }
    if (p.x < this.plan.x) w.moveBy(Math.min(3, this.plan.x - p.x));
    else if (p.x > this.plan.x) w.moveBy(-Math.min(3, p.x - this.plan.x));
    else w.softDrop = true;
    if (p.x !== this.plan.x) w.softDrop = false;
  }
}
