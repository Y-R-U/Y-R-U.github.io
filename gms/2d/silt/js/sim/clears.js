import { TINTABLE, EMPTY } from './materials.js';
import { F_CLEARING } from './grid.js';

export const DISSOLVE_TICKS = 26;   // how long a chain flashes before it goes

/**
 * A chain clears when one tint reaches from the left wall to the right wall.
 *
 * Connectivity is by TINT, not by material — so in TIDE a run of blue water can
 * finish a chain of blue sand. That is a deliberate rule, not an accident: it is
 * what makes the rising water a resource as well as a threat.
 */
export class Clears {
  constructor(g, opts = {}) {
    this.g = g;
    // 8-connected by default. The 4-connected variant sits above the site
    // percolation threshold for any sensible number of colours, which makes a
    // spanning chain mathematically almost impossible — measured, not guessed.
    this.diagonal = opts.diagonal !== false;
    this.visited = new Uint8Array(g.n);
    this.stamp = 0;
    this.queue = new Int32Array(g.n);
    this._tail = 0;
    this.component = [];
    this.dissolving = [];       // indices currently counting down
    this.lastChain = [];        // cells cleared by the most recent detection
  }

  /** @returns number of cells newly set dissolving. */
  detect() {
    const g = this.g, cols = g.cols, rows = g.rows;
    const mat = g.mat, tint = g.tint, flags = g.flags;
    const visited = this.visited, queue = this.queue;
    this.stamp++;
    if (this.stamp > 250) { visited.fill(0); this.stamp = 1; }
    const S = this.stamp;
    let total = 0;
    this.lastChain.length = 0;

    for (let y = 0; y < rows; y++) {
      const start = y * cols;
      const m0 = mat[start];
      if (m0 === EMPTY || !TINTABLE[m0]) continue;
      if (visited[start] === S || (flags[start] & F_CLEARING)) continue;

      const t = tint[start];
      let head = 0;
      this._tail = 0;
      queue[this._tail++] = start;
      visited[start] = S;
      const comp = this.component;
      comp.length = 0;
      let reachedRight = false;

      while (head < this._tail) {
        const i = queue[head++];
        comp.push(i);
        const x = i % cols;
        if (x === cols - 1) reachedRight = true;
        const up = i >= cols, dn = i + cols < g.n;
        const l = x > 0, r = x < cols - 1;
        if (l) this._visit(i - 1, t, S);
        if (r) this._visit(i + 1, t, S);
        if (up) this._visit(i - cols, t, S);
        if (dn) this._visit(i + cols, t, S);
        if (this.diagonal) {
          if (l && up) this._visit(i - cols - 1, t, S);
          if (r && up) this._visit(i - cols + 1, t, S);
          if (l && dn) this._visit(i + cols - 1, t, S);
          if (r && dn) this._visit(i + cols + 1, t, S);
        }
      }

      if (reachedRight) {
        for (let k = 0; k < comp.length; k++) {
          const i = comp[k];
          flags[i] |= F_CLEARING;
          g.clearT[i] = DISSOLVE_TICKS;
          g.touchIdx(i);
          this.dissolving.push(i);
          this.lastChain.push(i);
        }
        total += comp.length;
      }
    }
    return total;
  }

  _visit(i, t, S) {
    const g = this.g;
    if (this.visited[i] === S) return;
    const m = g.mat[i];
    if (m === EMPTY || !TINTABLE[m]) return;
    if (g.tint[i] !== t) return;
    if (g.flags[i] & F_CLEARING) return;
    this.visited[i] = S;
    this.queue[this._tail++] = i;
  }

  /** Count down every dissolving cell; remove the ones that finish. */
  advance(stats) {
    const g = this.g, list = this.dissolving;
    if (list.length === 0) return 0;
    let removed = 0, w = 0;
    for (let k = 0; k < list.length; k++) {
      const i = list[k];
      if (!(g.flags[i] & F_CLEARING)) continue;
      if (--g.clearT[i] === 0) {
        g.clear(i);
        removed++;
        if (stats) stats.destroyed++;
      } else {
        g.touchIdx(i);
        list[w++] = i;
      }
    }
    list.length = w;
    return removed;
  }

  get busy() { return this.dissolving.length > 0; }
}
